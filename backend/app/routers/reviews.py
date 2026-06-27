from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database import get_db
from app.models import Card, CardReverse, Review, User, SessionStats
from app.schemas import ReviewCreate, ReviewResponse
from app.services.fsrs_service import fsrs_service

router = APIRouter()

# Helper: Get or create default user (single-user mode)
def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == "default").first()
    if not user:
        user = User(username="default")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _update_session_stats(db: Session, user: User, language: str, time_spent_seconds: int):
    """Track session time in stats."""
    today = datetime.now(timezone.utc).date().isoformat()
    stats = db.query(SessionStats).filter(
        SessionStats.user_id == user.id,
        SessionStats.session_date == today,
        SessionStats.module_type == "language",
        SessionStats.category == language
    ).first()
    
    if stats:
        stats.minutes_spent += max(1, time_spent_seconds // 60)
        stats.card_count += 1
    else:
        stats = SessionStats(
            user_id=user.id,
            session_date=today,
            module_type="language",
            category=language,
            minutes_spent=max(1, time_spent_seconds // 60),
            card_count=1
        )
        db.add(stats)


@router.post("/", response_model=ReviewResponse)
def log_review(
    review_data: ReviewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Log a card review and update FSRS state."""
    # Get the card
    card = db.query(Card).filter(
        Card.id == review_data.card_id,
        Card.user_id == user.id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    # Calculate elapsed days since last review
    elapsed_days = review_data.elapsed_days
    if card.last_reviewed:
        now = datetime.now(timezone.utc)
        last = card.last_reviewed
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed_days = max(0, (now - last).days)
    
    # Calculate new FSRS state
    fsrs_result = fsrs_service.calculate_review(
        rating=review_data.rating,
        stability=card.stability,
        difficulty=card.difficulty,
        elapsed_days=elapsed_days
    )
    
    # Update card
    card.stability = fsrs_result["stability"]
    card.difficulty = fsrs_result["difficulty"]
    card.last_reviewed = datetime.now(timezone.utc)
    
    # Log review
    review = Review(
        card_id=card.id,
        user_id=user.id,
        rating=review_data.rating,
        stability_after=fsrs_result["stability"],
        difficulty_after=fsrs_result["difficulty"],
        interval_days=fsrs_result["interval_days"],
        elapsed_days=elapsed_days,
        time_spent_seconds=review_data.time_spent_seconds
    )
    
    _update_session_stats(db, user, card.language, review_data.time_spent_seconds)
    
    db.add(review)
    db.commit()
    
    return ReviewResponse(
        success=True,
        next_review_in_days=fsrs_result["interval_days"],
        stability=fsrs_result["stability"],
        difficulty=fsrs_result["difficulty"]
    )


@router.post("/reverse", response_model=ReviewResponse)
def log_reverse_review(
    review_data: ReviewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Log a reverse card review and update its FSRS state.
    `card_id` here is the original card.id (we look up CardReverse by card_id)."""
    
    # Get the reverse entry by card_id
    rev = db.query(CardReverse).filter(
        CardReverse.card_id == review_data.card_id,
    ).first()
    
    if not rev:
        raise HTTPException(status_code=404, detail="Reverse card not found")
    
    # Get the parent card (for language)
    card = db.query(Card).filter(
        Card.id == review_data.card_id,
        Card.user_id == user.id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    # Calculate elapsed days since last reverse review
    elapsed_days = review_data.elapsed_days
    if rev.last_reviewed:
        now = datetime.now(timezone.utc)
        last = rev.last_reviewed
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed_days = max(0, (now - last).days)
    
    # Calculate new FSRS state
    fsrs_result = fsrs_service.calculate_review(
        rating=review_data.rating,
        stability=rev.stability,
        difficulty=rev.difficulty,
        elapsed_days=elapsed_days
    )
    
    # Update reverse
    rev.stability = fsrs_result["stability"]
    rev.difficulty = fsrs_result["difficulty"]
    rev.last_reviewed = datetime.now(timezone.utc)
    
    # Log review (same reviews table, link to the original card)
    review = Review(
        card_id=card.id,
        user_id=user.id,
        rating=review_data.rating,
        stability_after=fsrs_result["stability"],
        difficulty_after=fsrs_result["difficulty"],
        interval_days=fsrs_result["interval_days"],
        elapsed_days=elapsed_days,
        time_spent_seconds=review_data.time_spent_seconds
    )
    
    _update_session_stats(db, user, card.language, review_data.time_spent_seconds)
    
    db.add(review)
    db.commit()
    
    return ReviewResponse(
        success=True,
        next_review_in_days=fsrs_result["interval_days"],
        stability=fsrs_result["stability"],
        difficulty=fsrs_result["difficulty"]
    )


@router.get("/{card_id}/history")
def get_card_review_history(
    card_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get review history for a specific card."""
    card = db.query(Card).filter(
        Card.id == card_id,
        Card.user_id == user.id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    reviews = db.query(Review).filter(
        Review.card_id == card_id,
        Review.user_id == user.id
    ).order_by(Review.review_time.desc()).limit(limit).all()
    
    return [
        {
            "id": r.id,
            "rating": r.rating,
            "review_time": r.review_time.isoformat() if r.review_time else None,
            "stability_after": r.stability_after,
            "interval_days": r.interval_days,
            "time_spent_seconds": r.time_spent_seconds
        }
        for r in reviews
    ]
