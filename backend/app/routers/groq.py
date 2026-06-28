import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session


from app.database import get_db
from app.models import Card, CardReverse, User
from app.services.groq_service import groq_service

router = APIRouter()


def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == "default").first()
    if not user:
        user = User(username="default")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


class SentenceRequest(BaseModel):
    language: str = Field(default="en", pattern="^(en|sk)$")


class SentenceResponse(BaseModel):
    sentence_in_target: str
    translation_in_russian: str


@router.post("/sentence", response_model=SentenceResponse)
def generate_sentence(
    request: SentenceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    language = request.language

    cards = (
        db.query(Card)
        .outerjoin(CardReverse, CardReverse.card_id == Card.id)
        .filter(Card.user_id == user.id, Card.language == language, CardReverse.id.is_(None))
        .order_by(Card.stability.asc())
        .limit(20)
        .all()
    )

    if not cards:
        raise HTTPException(
            status_code=404,
            detail=f"No due cards found for {language}. Add some vocabulary first.",
        )

    card = random.choice(cards)
    result = groq_service.generate_sentence(
        word=card.front,
        language=language,
        front_meaning=card.front,
        back_meaning=card.back,
    )

    if result.get("error"):
        raise HTTPException(
            status_code=503,
            detail=f"Groq API error: {result['error']}",
        )

    return SentenceResponse(
        sentence_in_target=result["sentence_in_target"],
        translation_in_russian=result["translation_in_russian"],
    )
