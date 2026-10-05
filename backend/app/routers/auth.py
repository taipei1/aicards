from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import secrets
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, SessionLocal
from app.models import AuthToken, User
from app.utils.password import verify_password

router = APIRouter()

TOKEN_TTL_DAYS = 90


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str
    expires_at: datetime
    auth_enabled: bool


def _auth_enabled() -> bool:
    return bool(settings.app_password_hash)


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Exchange the shared password for a long-lived bearer token."""
    if not _auth_enabled():
        raise HTTPException(status_code=503, detail="Password gate is not configured")

    if not verify_password(req.password, settings.app_password_hash):
        raise HTTPException(status_code=401, detail="Wrong password")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    db.add(AuthToken(token=token, expires_at=expires_at))
    db.commit()
    return LoginResponse(token=token, expires_at=expires_at, auth_enabled=True)


@router.get("/me")
def me(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Check whether auth is required and whether the current token is valid."""
    if not _auth_enabled():
        return {"auth_enabled": False, "valid": True}

    token = _extract_token(authorization)
    if not token:
        return {"auth_enabled": True, "valid": False}

    row = db.query(AuthToken).filter(AuthToken.token == token).first()
    if not row:
        return {"auth_enabled": True, "valid": False}

    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_at:
        db.delete(row)
        db.commit()
        return {"auth_enabled": True, "valid": False}

    return {"auth_enabled": True, "valid": True, "expires_at": expires_at}


@router.post("/logout")
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Revoke the current token (client forgets its copy too)."""
    token = _extract_token(authorization)
    if token:
        db.query(AuthToken).filter(AuthToken.token == token).delete()
        db.commit()
    return {"success": True}


def _extract_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return authorization.strip() or None


def token_is_valid(request) -> bool:
    """Check the Authorization header of a request against live tokens."""
    header = request.headers.get("Authorization")
    token = _extract_token(header)
    if not token:
        return False

    db = SessionLocal()
    try:
        row = db.query(AuthToken).filter(AuthToken.token == token).first()
        if not row:
            return False
        expires_at = row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expires_at:
            db.delete(row)
            db.commit()
            return False
        return True
    except Exception:
        return False
    finally:
        db.close()
