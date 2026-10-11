from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services import llm_gateway
from app.services.llm_gateway import LLMGatewayError

router = APIRouter()


def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == "default").first()
    if not user:
        user = User(username="default")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


class LLMSettingsResponse(BaseModel):
    base_url: str
    chat_model: str
    embedding_model: str
    api_key_configured: bool
    api_key_hint: str = ""


class LLMSettingsUpdate(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None  # empty/missing = keep current
    chat_model: Optional[str] = None
    embedding_model: Optional[str] = None


class AudioPrefs(BaseModel):
    """UI preferences shared by every device (single-user app)."""
    audio_enabled: bool = True
    audio_volume: float = 0.7


_AUDIO_ENABLED_KEY = "audio.enabled"
_AUDIO_VOLUME_KEY = "audio.volume"
# 1.0 = the volume the app used before this setting existed, so nobody's sound
# gets quietly halved by upgrading to a build that has the slider.
_DEFAULT_VOLUME = 1.0


def _read_audio_prefs(db: Session) -> AudioPrefs:
    enabled_raw = llm_gateway.get_setting(db, _AUDIO_ENABLED_KEY)
    volume_raw = llm_gateway.get_setting(db, _AUDIO_VOLUME_KEY)
    enabled = True if enabled_raw in (None, "") else enabled_raw.lower() in ("1", "true", "yes", "on")
    try:
        volume = float(volume_raw) if volume_raw not in (None, "") else _DEFAULT_VOLUME
    except ValueError:
        volume = _DEFAULT_VOLUME
    return AudioPrefs(audio_enabled=enabled, audio_volume=min(1.0, max(0.0, volume)))


@router.get("/prefs", response_model=AudioPrefs)
def get_prefs(db: Session = Depends(get_db)):
    return _read_audio_prefs(db)


@router.put("/prefs", response_model=AudioPrefs)
def update_prefs(payload: AudioPrefs, db: Session = Depends(get_db)):
    llm_gateway.set_setting(db, _AUDIO_ENABLED_KEY, "true" if payload.audio_enabled else "false")
    volume = min(1.0, max(0.0, payload.audio_volume))
    llm_gateway.set_setting(db, _AUDIO_VOLUME_KEY, f"{volume:.2f}")
    return _read_audio_prefs(db)


def _public_settings(db: Session) -> LLMSettingsResponse:
    cfg = llm_gateway.resolve_config(db)
    key = cfg["api_key"]
    return LLMSettingsResponse(
        base_url=cfg["base_url"],
        chat_model=cfg["chat_model"],
        embedding_model=cfg["embedding_model"],
        api_key_configured=bool(key),
        api_key_hint=f"••••{key[-4:]}" if key and len(key) > 4 else ("set" if key else ""),
    )


@router.get("/llm", response_model=LLMSettingsResponse)
def get_llm_settings(db: Session = Depends(get_db)):
    return _public_settings(db)


@router.put("/llm", response_model=LLMSettingsResponse)
def update_llm_settings(
    payload: LLMSettingsUpdate,
    db: Session = Depends(get_db),
):
    if payload.base_url is not None:
        llm_gateway.set_setting(db, "omnirouter.base_url", payload.base_url.strip().rstrip("/"))
    if payload.api_key:  # non-empty only — never wipe key with ""
        llm_gateway.set_setting(db, "omnirouter.api_key", payload.api_key.strip())
    if payload.chat_model is not None:
        llm_gateway.set_setting(db, "omnirouter.chat_model", payload.chat_model.strip())
    if payload.embedding_model is not None:
        llm_gateway.set_setting(db, "omnirouter.embedding_model", payload.embedding_model.strip())
    return _public_settings(db)


@router.post("/llm/test")
def test_llm_settings(db: Session = Depends(get_db)):
    try:
        return llm_gateway.test_connection(db)
    except LLMGatewayError as e:
        return {"ok": False, "error": str(e)}
