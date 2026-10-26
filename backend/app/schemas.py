from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime

from app.utils.text import normalize_spaces

# ============ CARDS SCHEMAS ============

class CardCreate(BaseModel):
    front: str = Field(..., max_length=500, min_length=1)
    back: str = Field(..., max_length=500, min_length=1)
    hint: Optional[str] = Field(None, max_length=2000)
    tags: List[str] = Field(default_factory=list)
    language: str = Field(default="en", pattern="^(en|sk)$")

    @field_validator("front", "back", "hint", mode="before")
    @classmethod
    def _normalize_text(cls, value):
        return normalize_spaces(value) if isinstance(value, str) else value

    @field_validator("tags", mode="before")
    @classmethod
    def _normalize_tags(cls, value):
        if not isinstance(value, list):
            return value
        return [t for t in (normalize_spaces(str(v)) for v in value) if t]

class CardUpdate(BaseModel):
    back: Optional[str] = Field(None, max_length=500)
    hint: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None

    @field_validator("back", "hint", mode="before")
    @classmethod
    def _normalize_text(cls, value):
        return normalize_spaces(value) if isinstance(value, str) else value

    @field_validator("tags", mode="before")
    @classmethod
    def _normalize_tags(cls, value):
        if value is None or not isinstance(value, list):
            return value
        return [t for t in (normalize_spaces(str(v)) for v in value) if t]

class CardResponse(BaseModel):
    id: int
    front: str
    back: str
    hint: Optional[str] = None
    tags: List[str] = []
    language: str
    stability: float
    difficulty: float
    last_reviewed: Optional[datetime] = None
    created_at: Optional[datetime] = None
    review_count: int = 0
    
    class Config:
        from_attributes = True

# ============ REVIEW SCHEMAS ============

class ReviewCreate(BaseModel):
    card_id: int
    rating: int = Field(..., ge=1, le=4)
    elapsed_days: int = Field(default=0, ge=0)
    time_spent_seconds: int = Field(default=0, ge=0)

class ReviewResponse(BaseModel):
    success: bool
    next_review_in_days: int
    stability: float
    difficulty: float

# ============ CSV IMPORT SCHEMAS ============

class CSVImportRequest(BaseModel):
    csv_content: str = Field(..., min_length=1)
    language: str = Field(default="en", pattern="^(en|sk)$")

class CSVConflict(BaseModel):
    front: str
    existing_back: str
    existing_tags: List[str] = []

class CSVImportResponse(BaseModel):
    imported: int
    duplicates: int
    conflicts: List[CSVConflict]

# ============ STATS SCHEMAS ============

class DailyStatsResponse(BaseModel):
    date: str
    total_minutes: int
    by_category: dict

class SummaryStatsResponse(BaseModel):
    period_days: int
    total_minutes: int
    avg_per_day: float
    by_module: dict
    by_category: dict


# ============ REVERSE CARD SCHEMAS ============

class ReverseCardResponse(BaseModel):
    """A reverse card — shows back as question, front as answer."""
    id: int
    card_id: int
    front: str  # Same as card.front (answer in target language)
    back: str   # Same as card.back (question in native language)
    hint: Optional[str] = None
    tags: List[str] = []
    language: str
    stability: float
    difficulty: float
    last_reviewed: Optional[datetime] = None
    created_at: Optional[datetime] = None
    review_count: int = 0
    is_reverse: bool = True
    card_front: str  # Original card.front
    card_back: str   # Original card.back

    class Config:
        from_attributes = True


class QueueItem(BaseModel):
    """Unified card in the review queue — either normal or reverse."""
    id: int
    front: str
    back: str
    hint: Optional[str] = None
    tags: List[str] = []
    language: str
    stability: float
    difficulty: float
    last_reviewed: Optional[datetime] = None
    review_count: int = 0
    is_reverse: bool = False
    # For reverse cards, card_id is the original card.id
    card_id: int
    # For normal cards, these match front/back
    card_front: str
    card_back: str
