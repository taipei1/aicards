import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session


from app.database import get_db
from app.models import Card, User
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


class ExamplesRequest(BaseModel):
    card_id: int


class ExampleItem(BaseModel):
    sentence_in_target: str
    translation_in_russian: str
    form: str = ""


class SynonymItem(BaseModel):
    word: str
    note: str = ""


class ExamplesResponse(BaseModel):
    word: str
    language: str
    examples: list[ExampleItem]
    usage_notes: str = ""
    synonyms: list[SynonymItem] = []


@router.post("/sentence", response_model=SentenceResponse)
def generate_sentence(
    request: SentenceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    language = request.language

    # Get the least stable cards for sentence generation
    cards = (
        db.query(Card)
        .filter(Card.user_id == user.id, Card.language == language)
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
        db=db,
    )

    if result.get("error"):
        raise HTTPException(
            status_code=503,
            detail=f"LLM gateway error: {result['error']}",
        )

    return SentenceResponse(
        sentence_in_target=result["sentence_in_target"],
        translation_in_russian=result["translation_in_russian"],
    )


class NotesRequest(BaseModel):
    card_id: int


class NotesResponse(BaseModel):
    word: str
    language: str
    usage_notes: str = ""
    synonyms: list[SynonymItem] = []


@router.post("/examples", response_model=ExamplesResponse)
def generate_examples(
    request: ExamplesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    card = (
        db.query(Card)
        .filter(Card.id == request.card_id, Card.user_id == user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Sibling vocabulary of the same deck — the model should reuse it.
    sibling_rows = (
        db.query(Card.front)
        .filter(
            Card.user_id == user.id,
            Card.language == card.language,
            Card.id != card.id,
        )
        .order_by(func.random())
        .limit(12)
        .all()
    )
    siblings = [r[0] for r in sibling_rows if r[0]]

    is_phrase = len(card.front.strip().split()) > 1

    result = groq_service.generate_examples(
        word=card.front,
        language=card.language,
        back_meaning=card.back,
        is_phrase=is_phrase,
        siblings=siblings,
        db=db,
    )

    if result.get("error") or not result.get("examples"):
        raise HTTPException(
            status_code=503,
            detail=f"LLM gateway error: {result.get('error') or 'empty response'}",
        )

    return ExamplesResponse(
        word=card.front,
        language=card.language,
        examples=result["examples"],
        usage_notes=result.get("usage_notes", ""),
        synonyms=result.get("synonyms", []),
    )


@router.post("/notes", response_model=NotesResponse)
def generate_notes(
    request: NotesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Usage nuances + synonyms. Independent call — the client fires it
    in parallel with /examples and renders whichever block lands first."""
    card = (
        db.query(Card)
        .filter(Card.id == request.card_id, Card.user_id == user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    result = groq_service.generate_notes(
        word=card.front,
        language=card.language,
        back_meaning=card.back,
        db=db,
    )

    if result.get("error") and not result.get("usage_notes") and not result.get("synonyms"):
        raise HTTPException(
            status_code=503,
            detail=f"LLM gateway error: {result.get('error') or 'empty response'}",
        )

    return NotesResponse(
        word=card.front,
        language=card.language,
        usage_notes=result.get("usage_notes", ""),
        synonyms=result.get("synonyms", []),
    )
