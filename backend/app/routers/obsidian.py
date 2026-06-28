import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional

from app.database import get_db
from app.models import ObsidianNote, NoteEmbedding, ObsidianReview, User, SessionStats
from app.schemas import ReviewResponse
from app.services.obsidian_sync import ObsidianSyncService
from app.services.gemini_service import gemini_service
from app.services.groq_service import groq_service
from app.services.couchdb_sync import CouchDBSyncService
from app.services.fsrs_service import fsrs_service
from app.config import settings

router = APIRouter()

def extract_note_title(content: str, file_path: str) -> str:
    """Extract note title: first # heading, or from filename, or fallback."""
    # Try first markdown heading (# or ##)
    for line in content.strip().split('\n'):
        line = line.strip()
        if line.startswith('# ') or line.startswith('## '):
            # Remove leading # s and strip
            title = re.sub(r'^#+\s*', '', line)
            if title:
                return title
    # Fallback: extract from filename h_xxxx_title.md
    filename = file_path.split('/')[-1].replace('.md', '')
    match = re.match(r'^h_[a-z0-9]+_(.+)$', filename)
    if match:
        return match[1]
    return filename


# Helper: Get or create default user (single-user mode)
def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == "default").first()
    if not user:
        user = User(username="default")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.post("/sync")
def sync_obsidian(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Synchronize Obsidian notes from CouchDB (Self-hosted LiveSync) with database."""
    # Step 1: Pull notes from CouchDB into local folder
    try:
        couchdb = CouchDBSyncService(
            couchdb_url="http://couchdb:5984",
            username=settings.couchdb_username,
            password=settings.couchdb_password,
            db_name="obsidian-sync"
        )
        from pathlib import Path
        written = couchdb.fetch_vault_as_files(Path(settings.obsidian_folder_path))
        print(f"[CouchDBSync] Fetched {written} files to {settings.obsidian_folder_path}")
    except Exception as e:
        print(f"[CouchDBSync] Error: {e}")
        return {"synced": 0, "updated": 0, "total": 0, "error": str(e)}

    # Step 2: Scan local folder and sync to DB
    sync_service = ObsidianSyncService(settings.obsidian_folder_path)
    notes = sync_service.scan_folder()

    synced = 0
    updated = 0
    
    for note_data in notes:
        existing = db.query(ObsidianNote).filter(
            ObsidianNote.user_id == user.id,
            ObsidianNote.file_path == note_data["file_path"]
        ).first()
        
        if existing:
            existing.content = note_data["content"]
            existing.tags = note_data["tags"]
            existing.updated_at = note_data["updated_at"]
            updated += 1
        else:
            note = ObsidianNote(
                user_id=user.id,
                file_path=note_data["file_path"],
                content=note_data["content"],
                tags=note_data["tags"],
                created_at=note_data["created_at"],
                updated_at=note_data["updated_at"]
            )
            db.add(note)
            db.flush()
            
            # Generate and store embedding
            try:
                embedding = gemini_service.generate_embedding(note_data["content"])
                if embedding:
                    embedding_obj = NoteEmbedding(
                        note_id=note.id,
                        embedding=embedding
                    )
                    db.add(embedding_obj)
            except Exception as e:
                print(f"Embedding generation failed: {e}")
            
            synced += 1
    
    db.commit()
    
    return {"synced": synced, "updated": updated, "total": len(notes)}


@router.get("/notes")
def get_notes(
    tag: str = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get Obsidian notes with optional filtering."""
    query = db.query(ObsidianNote).filter(ObsidianNote.user_id == user.id)
    
    if tag:
        query = query.filter(ObsidianNote.tags.any(tag))
    
    notes = query.order_by(ObsidianNote.stability.asc()).limit(limit).all()
    
    return [
        {
            "id": note.id,
            "file_path": note.file_path,
            "title": extract_note_title(note.content, note.file_path),
            "tags": note.tags,
            "stability": note.stability,
            "difficulty": note.difficulty,
            "last_reviewed": note.last_reviewed.isoformat() if note.last_reviewed else None,
            "content_preview": note.content[:200] + "..." if len(note.content) > 200 else note.content
        }
        for note in notes
    ]


@router.get("/notes/{note_id}")
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get single note with full content."""
    note = db.query(ObsidianNote).filter(
        ObsidianNote.id == note_id,
        ObsidianNote.user_id == user.id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return {
        "id": note.id,
        "file_path": note.file_path,
        "title": extract_note_title(note.content, note.file_path),
        "content": note.content,
        "tags": note.tags,
        "stability": note.stability,
        "difficulty": note.difficulty,
        "last_reviewed": note.last_reviewed.isoformat() if note.last_reviewed else None,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None
    }


@router.get("/due")
def get_due_notes(
    limit: int = 5,
    tag: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get notes due for review. Optionally filter by tag."""
    query = db.query(ObsidianNote).filter(
        ObsidianNote.user_id == user.id
    )
    if tag:
        query = query.filter(ObsidianNote.tags.any(tag))
    
    notes = query.order_by(ObsidianNote.stability.asc()).limit(limit).all()
    
    return [
        {
            "id": note.id,
            "file_path": note.file_path,
            "title": extract_note_title(note.content, note.file_path),
            "tags": note.tags,
            "stability": note.stability,
            "content_preview": note.content[:300] + "..." if len(note.content) > 300 else note.content
        }
        for note in notes
    ]


@router.post("/questions")
def generate_questions(
    note_id: int,
    num_questions: int = 1,
    advanced: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Generate questions dynamically from note."""
    note = db.query(ObsidianNote).filter(
        ObsidianNote.id == note_id,
        ObsidianNote.user_id == user.id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Try Groq first, fallback to Gemini
    questions = groq_service.generate_questions(
        note.content,
        num_questions=num_questions,
        advanced=advanced
    )
    
    # If Groq fails, try Gemini
    if not questions or questions[0].get("question", "").startswith("Groq not available"):
        questions = gemini_service.generate_questions(
            note.content,
            num_questions=num_questions,
            advanced=advanced
        )
    
    return {"questions": questions, "note_id": note_id}


@router.post("/reviews", response_model=ReviewResponse)
def log_obsidian_review(
    note_id: int,
    rating: int,
    time_seconds: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Log review of Obsidian note."""
    note = db.query(ObsidianNote).filter(
        ObsidianNote.id == note_id,
        ObsidianNote.user_id == user.id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Calculate elapsed days
    elapsed_days = 0
    if note.last_reviewed:
        now = datetime.now(timezone.utc)
        last = note.last_reviewed
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed_days = max(0, (now - last).days)
    
    # Calculate new FSRS state
    fsrs_result = fsrs_service.calculate_review(
        rating=rating,
        stability=note.stability,
        difficulty=note.difficulty,
        elapsed_days=elapsed_days
    )
    
    note.stability = fsrs_result["stability"]
    note.difficulty = fsrs_result["difficulty"]
    note.last_reviewed = datetime.now(timezone.utc)
    
    review = ObsidianReview(
        note_id=note.id,
        user_id=user.id,
        rating=rating,
        stability_after=fsrs_result["stability"],
        difficulty_after=fsrs_result["difficulty"],
        interval_days=fsrs_result["interval_days"],
        elapsed_days=elapsed_days,
        time_spent_seconds=time_seconds
    )
    
    # Track session time
    today = datetime.now(timezone.utc).date().isoformat()
    stats = db.query(SessionStats).filter(
        SessionStats.user_id == user.id,
        SessionStats.session_date == today,
        SessionStats.module_type == "obsidian"
    ).first()
    
    if stats:
        stats.minutes_spent += max(1, time_seconds // 60)
    else:
        stats = SessionStats(
            user_id=user.id,
            session_date=today,
            module_type="obsidian",
            minutes_spent=max(1, time_seconds // 60)
        )
        db.add(stats)
    
    db.add(review)
    db.commit()
    
    return ReviewResponse(
        success=True,
        next_review_in_days=fsrs_result["interval_days"],
        stability=fsrs_result["stability"],
        difficulty=fsrs_result["difficulty"]
    )


@router.delete("/notes/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Delete a note from database."""
    note = db.query(ObsidianNote).filter(
        ObsidianNote.id == note_id,
        ObsidianNote.user_id == user.id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    db.delete(note)
    db.commit()
    
    return {"success": True, "message": f"Note deleted"}
