from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.models import User, SessionStats

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


@router.get("/daily")
def get_daily_stats(
    date: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get time spent on given date."""
    if not date:
        date = datetime.now(timezone.utc).date().isoformat()
    
    stats = db.query(SessionStats).filter(
        SessionStats.user_id == user.id,
        SessionStats.session_date == date
    ).all()
    
    total_minutes = sum(s.minutes_spent for s in stats)
    by_category = {}
    
    for stat in stats:
        key = stat.category or "general"
        by_category[key] = by_category.get(key, 0) + stat.minutes_spent
    
    return {
        "date": date,
        "total_minutes": total_minutes,
        "by_category": by_category
    }


@router.get("/summary")
def get_summary(
    days: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get summary for last N days."""
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    
    stats = db.query(SessionStats).filter(
        SessionStats.user_id == user.id,
        SessionStats.session_date >= start_date
    ).all()
    
    total_minutes = sum(s.minutes_spent for s in stats)
    by_module = {}
    by_category = {}
    
    for stat in stats:
        by_module[stat.module_type] = by_module.get(stat.module_type, 0) + stat.minutes_spent
        key = stat.category or "general"
        by_category[key] = by_category.get(key, 0) + stat.minutes_spent
    
    return {
        "period_days": days,
        "total_minutes": total_minutes,
        "avg_per_day": total_minutes / days if days > 0 else 0,
        "by_module": by_module,
        "by_category": by_category
    }


@router.get("/progress")
def get_progress(
    module: str = "language",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get learning progress."""
    from app.models import Card, CardReverse, ObsidianNote
    
    if module == "language":
        total_cards = db.query(Card).filter(Card.user_id == user.id).count()
        total_reverses = db.query(CardReverse).join(Card, CardReverse.card_id == Card.id).filter(
            Card.user_id == user.id
        ).count()
        by_lang = {}
        for lang in ["en", "sk"]:
            count = db.query(Card).filter(
                Card.user_id == user.id,
                Card.language == lang
            ).count()
            by_lang[lang] = count
        
        return {
            "module": module,
            "total_cards": total_cards,
            "total_reverses": total_reverses,
            "total_items": total_cards + total_reverses,
            "by_language": by_lang
        }
    else:
        total = db.query(ObsidianNote).filter(
            ObsidianNote.user_id == user.id
        ).count()
        
        return {
            "module": module,
            "total_notes": total
        }
