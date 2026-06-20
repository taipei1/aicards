from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone
from typing import List, Optional

from app.database import get_db
from app.models import Card, Review, User
from app.schemas import CardCreate, CardUpdate, CardResponse, CSVImportRequest, CSVImportResponse, CSVConflict
from app.services.fsrs_service import fsrs_service
from app.utils.csv_parser import CSVParser

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


@router.post("/import", response_model=CSVImportResponse)
def import_cards(
    request: CSVImportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Import cards from CSV content."""
    try:
        parsed_cards = CSVParser.parse_csv(request.csv_content)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"CSV parse error: {str(e)}")
    
    imported = 0
    duplicates = 0
    conflicts = []
    
    for i, card_data in enumerate(parsed_cards):
        try:
            # Skip empty cards
            if not card_data["front"] or not card_data["back"]:
                continue
            
            # Check for duplicates (BEFORE adding to session)
            existing = db.query(Card).filter(
                Card.user_id == user.id,
                Card.front == card_data["front"],
                Card.language == request.language
            ).first()
            
            if existing:
                duplicates += 1
                conflicts.append(CSVConflict(
                    front=card_data["front"],
                    existing_back=existing.back,
                    existing_tags=existing.tags or []
                ))
                continue
            
            # Parse published_at date for FSRS seeding
            published_at = None
            if card_data.get("published_at"):
                try:
                    published_at = datetime.fromisoformat(
                        card_data["published_at"].replace("Z", "+00:00")
                    )
                except (ValueError, AttributeError):
                    published_at = None
            
            # FSRS seeding based on age
            if published_at:
                stability, difficulty = fsrs_service.seed_initial_weights(published_at)
            else:
                stability, difficulty = 1.0, 5.0
            
            # Tags from parsed data or fallback
            tags = card_data.get("tags", [])
            if not tags:
                tags = ["general"]
            
            # Create card
            card = Card(
                user_id=user.id,
                front=card_data["front"],
                back=card_data["back"],
                hint=card_data.get("hint") or None,
                tags=tags,
                language=request.language,
                stability=stability,
                difficulty=difficulty,
                created_at=published_at or datetime.now(timezone.utc)
            )
            db.add(card)
            imported += 1
            
            # Commit every 100 cards to avoid massive transaction
            if imported % 100 == 0:
                db.commit()
        except Exception as e:
            db.rollback()
            import traceback
            traceback.print_exc()
            print(f"Error importing card {i}: {str(e)}")
            print(f"Card data: {card_data}")
            continue
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"DB commit error: {str(e)}")
    
    return CSVImportResponse(
        imported=imported,
        duplicates=duplicates,
        conflicts=conflicts
    )


@router.get("/due", response_model=List[CardResponse])
def get_due_cards(
    language: str = "en",
    tag: Optional[str] = Query(None, description="Filter by tag"),
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get cards due for review (FSRS scheduling). Optionally filter by tag."""
    query = db.query(Card).filter(
        Card.user_id == user.id,
        Card.language == language
    )
    
    if tag:
        query = query.filter(Card.tags.any(tag))
    
    cards = query.order_by(Card.stability.asc()).limit(limit).all()
    
    # Attach review counts
    result = []
    for card in cards:
        review_count = db.query(func.count(Review.id)).filter(
            Review.card_id == card.id
        ).scalar() or 0
        card_dict = {
            "id": card.id,
            "front": card.front,
            "back": card.back,
            "hint": card.hint,
            "tags": card.tags or [],
            "language": card.language,
            "stability": card.stability,
            "difficulty": card.difficulty,
            "last_reviewed": card.last_reviewed,
            "created_at": card.created_at,
            "review_count": review_count
        }
        result.append(card_dict)
    
    return result


@router.get("/tags", response_model=List[str])
def get_tags(
    language: Optional[str] = Query(None, description="Filter by language"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get all unique tags across cards."""
    query = db.query(Card).filter(Card.user_id == user.id)
    if language:
        query = query.filter(Card.language == language)
    cards = query.all()
    tags = set()
    for card in cards:
        for tag in (card.tags or []):
            tags.add(tag)
    return sorted(tags)


@router.get("/search", response_model=List[CardResponse])
def search_cards(
    language: str = "en",
    tag: str = None,
    search: str = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Search cards by language, tag, or text."""
    query = db.query(Card).filter(
        Card.user_id == user.id,
        Card.language == language
    )
    
    if tag:
        query = query.filter(Card.tags.any(tag))
    
    if search:
        query = query.filter(
            Card.front.ilike(f"%{search}%") | 
            Card.back.ilike(f"%{search}%")
        )
    
    cards = query.limit(limit).all()
    
    # Attach review counts
    result = []
    for card in cards:
        review_count = db.query(func.count(Review.id)).filter(
            Review.card_id == card.id
        ).scalar() or 0
        card_dict = {
            "id": card.id,
            "front": card.front,
            "back": card.back,
            "hint": card.hint,
            "tags": card.tags or [],
            "language": card.language,
            "stability": card.stability,
            "difficulty": card.difficulty,
            "last_reviewed": card.last_reviewed,
            "created_at": card.created_at,
            "review_count": review_count
        }
        result.append(card_dict)
    
    return result


@router.get("/by-tag", response_model=List[CardResponse])
def get_cards_by_tag(
    language: str = "en",
    tag: str = Query(..., description="Tag to filter by"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get ALL cards matching a tag (no SRS limit, for emergency mode)."""
    cards = db.query(Card).filter(
        Card.user_id == user.id,
        Card.language == language,
        Card.tags.any(tag)
    ).order_by(Card.stability.asc()).all()
    
    result = []
    for card in cards:
        review_count = db.query(func.count(Review.id)).filter(
            Review.card_id == card.id
        ).scalar() or 0
        card_dict = {
            "id": card.id,
            "front": card.front,
            "back": card.back,
            "hint": card.hint,
            "tags": card.tags or [],
            "language": card.language,
            "stability": card.stability,
            "difficulty": card.difficulty,
            "last_reviewed": card.last_reviewed,
            "created_at": card.created_at,
            "review_count": review_count
        }
        result.append(card_dict)
    
    return result


@router.get("/{card_id}", response_model=CardResponse)
def get_card(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get single card."""
    card = db.query(Card).filter(
        Card.id == card_id,
        Card.user_id == user.id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    return card


@router.post("/", response_model=CardResponse)
def create_card(
    card_data: CardCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Add single card."""
    # Check for duplicates
    existing = db.query(Card).filter(
        Card.user_id == user.id,
        Card.front == card_data.front,
        Card.language == card_data.language
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=409, 
            detail=f"Card '{card_data.front}' already exists in {card_data.language}"
        )
    
    card = Card(
        user_id=user.id,
        front=card_data.front,
        back=card_data.back,
        hint=card_data.hint,
        tags=card_data.tags if card_data.tags else ["general"],
        language=card_data.language,
        stability=1.0,
        difficulty=5.0
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    
    return card


@router.patch("/{card_id}", response_model=CardResponse)
def update_card(
    card_id: int,
    update_data: CardUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Update card."""
    card = db.query(Card).filter(
        Card.id == card_id,
        Card.user_id == user.id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    for key, value in update_data.model_dump(exclude_unset=True).items():
        setattr(card, key, value)
    
    card.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(card)
    
    return card


@router.delete("/{card_id}")
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Delete card permanently."""
    card = db.query(Card).filter(
        Card.id == card_id,
        Card.user_id == user.id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    db.delete(card)
    db.commit()
    
    return {"success": True, "message": f"Card '{card.front}' deleted"}
