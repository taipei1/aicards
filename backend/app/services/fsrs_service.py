from datetime import datetime, timedelta, timezone
from typing import Dict, Tuple, Optional
from fsrs import Scheduler, Card as FSRSCard, Rating, State

class FSRSService:
    def __init__(self):
        self.scheduler = Scheduler()
    
    def calculate_review(
        self,
        rating: int,
        stability: Optional[float],
        difficulty: Optional[float],
        elapsed_days: int
    ) -> Dict[str, float]:
        """
        Calculate new FSRS parameters after a review.
        
        Args:
            rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
            stability: Current memory stability (None for new card)
            difficulty: Perceived difficulty (None for new card)
            elapsed_days: Days since last review
        
        Returns:
            {
                "stability": float,
                "difficulty": float,
                "interval_days": int,
                "state": str
            }
        """
        # Map rating
        rating_map = {1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy}
        fsrs_rating = rating_map.get(rating, Rating.Good)
        
        # Create card with current state
        card = FSRSCard(
            stability=stability,
            difficulty=difficulty,
            due=datetime.now(timezone.utc) - timedelta(days=elapsed_days) if elapsed_days > 0 else datetime.now(timezone.utc),
            last_review=datetime.now(timezone.utc) - timedelta(days=elapsed_days) if elapsed_days > 0 else None
        )
        
        # Review card
        new_card, review_log = self.scheduler.review_card(card, fsrs_rating, datetime.now(timezone.utc))
        
        # Calculate interval in days
        if new_card.last_review and new_card.due:
            interval = (new_card.due - new_card.last_review).days
        else:
            interval = 0
        
        return {
            "stability": new_card.stability,
            "difficulty": new_card.difficulty,
            "interval_days": max(1, interval),
            "state": str(new_card.state.name),
            "due_date": new_card.due.isoformat() if new_card.due else None
        }
    
    def seed_initial_weights(
        self,
        created_date: datetime,
        current_date: Optional[datetime] = None
    ) -> Tuple[float, float]:
        """
        Calculate initial FSRS weights for imported cards based on age.
        Prevents old cards from appearing infinitely.
        
        Args:
            created_date: When the card was created
            current_date: Today's date (default: now)
        
        Returns:
            (stability, difficulty)
        """
        if current_date is None:
            current_date = datetime.now(timezone.utc)
        
        # Make sure both are timezone aware
        if created_date.tzinfo is None:
            created_date = created_date.replace(tzinfo=timezone.utc)
        if current_date.tzinfo is None:
            current_date = current_date.replace(tzinfo=timezone.utc)
        
        age_days = (current_date - created_date).days
        
        # Scale stability based on age (older = more stable)
        if age_days <= 0:
            stability = 1.0  # New card
        elif age_days <= 7:
            stability = 5.0
        elif age_days <= 30:
            stability = 15.0
        elif age_days <= 90:
            stability = 35.0
        elif age_days <= 180:
            stability = 70.0
        elif age_days <= 365:
            stability = 120.0
        else:
            stability = 200.0  # Very old card
        
        difficulty = 5.0  # Neutral difficulty
        
        return stability, difficulty
    
    def is_due(
        self,
        last_reviewed: Optional[datetime],
        stability: float,
        interval_days: int
    ) -> bool:
        """Check if card is due for review."""
        if last_reviewed is None:
            return True
        
        if last_reviewed.tzinfo is None:
            last_reviewed = last_reviewed.replace(tzinfo=timezone.utc)
        
        due_date = last_reviewed + timedelta(days=interval_days)
        return datetime.now(timezone.utc) >= due_date


# Singleton instance
fsrs_service = FSRSService()
