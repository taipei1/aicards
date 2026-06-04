from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Index, UniqueConstraint, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from datetime import datetime, timezone
from app.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    cards = relationship("Card", back_populates="user", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="user", cascade="all, delete-orphan")
    obsidian_notes = relationship("ObsidianNote", back_populates="user", cascade="all, delete-orphan")
    session_stats = relationship("SessionStats", back_populates="user", cascade="all, delete-orphan")

class Card(Base):
    __tablename__ = "cards"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    front = Column(String(500), nullable=False)
    back = Column(String(500), nullable=False)
    hint = Column(Text, nullable=True)
    tags = Column(ARRAY(String), default=list)
    language = Column(String(10), nullable=False)  # 'en', 'sk'
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # FSRS state
    stability = Column(Float, default=1.0)
    difficulty = Column(Float, default=5.0)
    last_reviewed = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="cards")
    reviews = relationship("Review", back_populates="card", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'front', 'language', name='uq_card_user_front_lang'),
        Index('idx_card_language', 'user_id', 'language'),
        Index('idx_card_tags', 'user_id', 'tags'),
        Index('idx_card_due', 'user_id', 'last_reviewed', 'stability'),
    )

class Review(Base):
    __tablename__ = "reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1, 2, 3, 4
    review_time = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # FSRS state after review
    stability_after = Column(Float, nullable=True)
    difficulty_after = Column(Float, nullable=True)
    interval_days = Column(Integer, nullable=True)
    elapsed_days = Column(Integer, default=0)
    time_spent_seconds = Column(Integer, default=0)
    
    card = relationship("Card", back_populates="reviews")
    user = relationship("User", back_populates="reviews")
    
    __table_args__ = (
        Index('idx_review_card', 'card_id'),
        Index('idx_review_user_date', 'user_id', 'review_time'),
    )

class ObsidianNote(Base):
    __tablename__ = "obsidian_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    file_path = Column(String(1000), nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(ARRAY(String), default=list)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    last_reviewed = Column(DateTime, nullable=True)
    
    # FSRS state
    stability = Column(Float, default=1.0)
    difficulty = Column(Float, default=5.0)
    
    user = relationship("User", back_populates="obsidian_notes")
    embeddings = relationship("NoteEmbedding", back_populates="note", cascade="all, delete-orphan")
    reviews = relationship("ObsidianReview", back_populates="note", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'file_path', name='uq_note_user_path'),
        Index('idx_note_user', 'user_id'),
        Index('idx_note_tags', 'user_id', 'tags'),
        Index('idx_note_due', 'user_id', 'last_reviewed', 'stability'),
    )

class NoteEmbedding(Base):
    __tablename__ = "note_embeddings"
    
    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("obsidian_notes.id"), nullable=False)
    embedding = Column(Vector(1536), nullable=False)  # Gemini embedding size
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    note = relationship("ObsidianNote", back_populates="embeddings")
    
    __table_args__ = (
        Index('idx_embedding_note', 'note_id'),
    )

class ObsidianReview(Base):
    __tablename__ = "obsidian_reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("obsidian_notes.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1, 2, 3, 4
    review_time = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    stability_after = Column(Float, nullable=True)
    difficulty_after = Column(Float, nullable=True)
    interval_days = Column(Integer, nullable=True)
    elapsed_days = Column(Integer, default=0)
    time_spent_seconds = Column(Integer, default=0)
    
    note = relationship("ObsidianNote", back_populates="reviews")
    
    __table_args__ = (
        Index('idx_obsidian_review_note', 'note_id'),
        Index('idx_obsidian_review_user_date', 'user_id', 'review_time'),
    )

class SessionStats(Base):
    __tablename__ = "session_stats"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_date = Column(String(10), nullable=False)  # YYYY-MM-DD
    module_type = Column(String(20), nullable=False)  # 'language' or 'obsidian'
    category = Column(String(255), nullable=True)  # tag or language code
    minutes_spent = Column(Integer, default=0)
    card_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    user = relationship("User", back_populates="session_stats")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'session_date', 'module_type', 'category', name='uq_stats_unique'),
        Index('idx_stats_user_date', 'user_id', 'session_date'),
    )
