from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# ============ CARDS SCHEMAS ============

class CardCreate(BaseModel):
    front: str = Field(..., max_length=500, min_length=1)
    back: str = Field(..., max_length=500, min_length=1)
    hint: Optional[str] = Field(None, max_length=2000)
    tags: List[str] = Field(default_factory=list)
    language: str = Field(default="en", pattern="^(en|sk)$")

class CardUpdate(BaseModel):
    back: Optional[str] = Field(None, max_length=500)
    hint: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None

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
