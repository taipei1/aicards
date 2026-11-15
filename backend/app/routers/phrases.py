from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Card, User
from app.services.phrase_service import phrase_service

router = APIRouter()

PREFETCH_NEXT = 50
MAX_ENSURE_IDS = 200


def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == "default").first()
    if not user:
        user = User(username="default")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


class PhraseEnsureRequest(BaseModel):
    card_ids: List[int] = Field(default_factory=list)
    language: str = Field(default="en", pattern="^(en|sk)$")
    tag: Optional[str] = None
    prefetch_next: bool = True


class PhraseStatusRequest(BaseModel):
    card_ids: List[int] = Field(default_factory=list)


class PhraseItem(BaseModel):
    card_id: int
    phrase: str
    translation: str
    target_spans: List[str] = Field(default_factory=list)
    translation_spans: List[str] = Field(default_factory=list)
    model: str = ""


class PhrasesResponse(BaseModel):
    phrases: List[PhraseItem]
    pending: List[int]


def _valid_card_ids(
    db: Session,
    user: User,
    card_ids: List[int],
    language: Optional[str] = None,
) -> List[int]:
    ids = list(dict.fromkeys(int(cid) for cid in card_ids))
    if not ids:
        return []
    query = db.query(Card.id).filter(
        Card.user_id == user.id,
        Card.id.in_(ids),
    )
    if language:
        query = query.filter(Card.language == language)
    valid = {row[0] for row in query.all()}
    return [cid for cid in ids if cid in valid]


def _next_card_ids(
    db: Session,
    user: User,
    language: str,
    tag: Optional[str],
    exclude: List[int],
    limit: int = PREFETCH_NEXT,
) -> List[int]:
    """The next cards the due queue would show after the current batch.

    The review queue is ordered by stability ascending; phrase generation is
    per card, and normal/reverse items share one card id, so unique card ids
    are exactly what we need for the reserve batch.
    """
    query = db.query(Card.id).filter(
        Card.user_id == user.id,
        Card.language == language,
    )
    if tag:
        query = query.filter(Card.tags.any(tag))
    if exclude:
        query = query.filter(~Card.id.in_(exclude))
    rows = (
        query.order_by(Card.stability.asc(), Card.id.asc())
        .limit(limit)
        .all()
    )
    return [row[0] for row in rows]


def _response(ready: dict[int, dict], pending: List[int]) -> PhrasesResponse:
    return PhrasesResponse(
        phrases=[PhraseItem(**data) for data in ready.values()],
        pending=pending,
    )


@router.post("/ensure", response_model=PhrasesResponse)
def ensure_phrases(
    request: PhraseEnsureRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return cached phrases and queue missing ones.

    Generation is always asynchronous: this endpoint only touches the cache
    and the in-memory worker queue, so the review card never waits.
    """
    if len(request.card_ids) > MAX_ENSURE_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many card ids (max {MAX_ENSURE_IDS})",
        )

    current = _valid_card_ids(db, user, request.card_ids, request.language)
    ready, pending = phrase_service.ensure(current, db, priority=0)

    if request.prefetch_next:
        next_ids = _next_card_ids(
            db,
            user,
            request.language,
            request.tag,
            exclude=current,
            limit=PREFETCH_NEXT,
        )
        if next_ids:
            phrase_service.ensure(next_ids, db, priority=2)

    return _response(ready, pending)


@router.post("/status", response_model=PhrasesResponse)
def phrase_status(
    request: PhraseStatusRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cached phrases + pending ids for the visible queue (polling).

    This also re-ensures missing cards. The worker queue is in memory, so a
    backend restart would otherwise leave the current page on word fallbacks
    forever (the client has no reason to call `ensure` again). Re-enqueueing is
    idempotent and does not generate anything synchronously.
    """
    if len(request.card_ids) > MAX_ENSURE_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many card ids (max {MAX_ENSURE_IDS})",
        )
    current = _valid_card_ids(db, user, request.card_ids)
    ready, pending = phrase_service.ensure(current, db, priority=0)
    return _response(ready, pending)
