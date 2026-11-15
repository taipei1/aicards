from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import secrets
import threading
import time
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
        _cache_drop(token)
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


# Every API request goes through the gate. Hitting the remote DB for the same
# token over and over was both slow and the place where a stale pooled
# connection froze the whole backend. A short positive-only cache keeps the
# steady state in memory; logout evicts the token immediately, and the cache
# entry can never outlive the token itself.
_TOKEN_CACHE_TTL = 30.0
_TOKEN_CACHE_MAX = 256
_token_cache: dict[str, tuple[float, datetime]] = {}
_token_cache_lock = threading.Lock()


def _cache_get(token: str) -> bool:
    entry = _token_cache.get(token)
    if entry is None:
        return False
    cached_at, expires_at = entry
    if (
        time.monotonic() - cached_at > _TOKEN_CACHE_TTL
        or datetime.now(timezone.utc) >= expires_at
    ):
        _cache_drop(token)
        return False
    return True


def _cache_put(token: str, expires_at: datetime) -> None:
    with _token_cache_lock:
        if len(_token_cache) >= _TOKEN_CACHE_MAX:
            _token_cache.clear()
        _token_cache[token] = (time.monotonic(), expires_at)


def _cache_drop(token: str) -> None:
    with _token_cache_lock:
        _token_cache.pop(token, None)


def _valid_until(row: AuthToken) -> datetime:
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at


def token_is_valid(request) -> bool:
    """Check the Authorization header of a request against live tokens."""
    header = request.headers.get("Authorization")
    token = _extract_token(header)
    if not token:
        return False

    if _cache_get(token):
        return True

    db = SessionLocal()
    try:
        row = db.query(AuthToken).filter(AuthToken.token == token).first()
        if not row:
            return False
        expires_at = _valid_until(row)
        if datetime.now(timezone.utc) >= expires_at:
            db.delete(row)
            db.commit()
            return False
        _cache_put(token, expires_at)
        return True
    except Exception:
        return False
    finally:
        db.close()
