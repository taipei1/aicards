from fastapi import APIRouter, Depends, HTTPException
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


class LLMProfileResponse(BaseModel):
    base_url: str
    chat_model: str
    embedding_model: str
    api_key_configured: bool
    api_key_hint: str = ""


class LLMSettingsResponse(BaseModel):
    active_provider: str
    server: LLMProfileResponse
    local: LLMProfileResponse
    # Compatibility: flat fields describe the active profile.
    base_url: str
    chat_model: str
    embedding_model: str
    api_key_configured: bool
    api_key_hint: str = ""


class LLMProfileUpdate(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None  # empty/missing = keep current
    chat_model: Optional[str] = None
    embedding_model: Optional[str] = None


class LLMSettingsUpdate(BaseModel):
    active_provider: Optional[str] = None
    server: Optional[LLMProfileUpdate] = None
    local: Optional[LLMProfileUpdate] = None
    # Compatibility with the old single-profile form.
    base_url: Optional[str] = None
    api_key: Optional[str] = None
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


def _mask_key(key: str) -> tuple[bool, str]:
    if not key:
        return False, ""
    return True, f"••••{key[-4:]}" if len(key) > 4 else "set"


def _profile_response(db: Session, provider: str) -> LLMProfileResponse:
    cfg = llm_gateway.resolve_config(db, provider=provider)
    configured, hint = _mask_key(cfg["api_key"])
    return LLMProfileResponse(
        base_url=cfg["base_url"],
        chat_model=cfg["chat_model"],
        embedding_model=cfg["embedding_model"],
        api_key_configured=configured,
        api_key_hint=hint,
    )


def _public_settings(db: Session) -> LLMSettingsResponse:
    provider = llm_gateway.get_provider(db)
    server = _profile_response(db, "server")
    local = _profile_response(db, "local")
    active = local if provider == "local" else server
    return LLMSettingsResponse(
        active_provider=provider,
        server=server,
        local=local,
        base_url=active.base_url,
        chat_model=active.chat_model,
        embedding_model=active.embedding_model,
        api_key_configured=active.api_key_configured,
        api_key_hint=active.api_key_hint,
    )


def _profile_prefix(provider: str) -> str:
    return "omnirouter.local." if provider == "local" else "omnirouter."


def _apply_profile(db: Session, provider: str, payload: LLMProfileUpdate) -> None:
    prefix = _profile_prefix(provider)
    if payload.base_url is not None:
        llm_gateway.set_setting(db, f"{prefix}base_url", payload.base_url.strip().rstrip("/"))
    if payload.api_key:  # non-empty only — never wipe a key with ""
        llm_gateway.set_setting(db, f"{prefix}api_key", payload.api_key.strip())
    if payload.chat_model is not None:
        llm_gateway.set_setting(db, f"{prefix}chat_model", payload.chat_model.strip())
    if payload.embedding_model is not None:
        llm_gateway.set_setting(db, f"{prefix}embedding_model", payload.embedding_model.strip())


@router.get("/llm", response_model=LLMSettingsResponse)
def get_llm_settings(db: Session = Depends(get_db)):
    return _public_settings(db)


@router.put("/llm", response_model=LLMSettingsResponse)
def update_llm_settings(
    payload: LLMSettingsUpdate,
    db: Session = Depends(get_db),
):
    if payload.active_provider is not None:
        provider = payload.active_provider.strip().lower()
        if provider not in llm_gateway.PROVIDERS:
            raise HTTPException(status_code=400, detail="active_provider must be 'server' or 'local'")
        llm_gateway.set_setting(db, "omnirouter.provider", provider)

    active = llm_gateway.get_provider(db)
    if payload.server is not None:
        _apply_profile(db, "server", payload.server)
    if payload.local is not None:
        _apply_profile(db, "local", payload.local)

    # Old clients sent one flat profile. Apply it to the currently active one.
    if any(v is not None for v in (
        payload.base_url, payload.api_key, payload.chat_model, payload.embedding_model
    )):
        _apply_profile(db, active, LLMProfileUpdate(
            base_url=payload.base_url,
            api_key=payload.api_key,
            chat_model=payload.chat_model,
            embedding_model=payload.embedding_model,
        ))

    return _public_settings(db)


@router.post("/llm/test")
def test_llm_settings(provider: Optional[str] = None, db: Session = Depends(get_db)):
    if provider is not None:
        provider = provider.strip().lower()
        if provider not in llm_gateway.PROVIDERS:
            raise HTTPException(status_code=400, detail="provider must be 'server' or 'local'")
    try:
        return llm_gateway.test_connection(db, provider=provider)
    except LLMGatewayError as e:
        return {
            "ok": False,
            "provider": provider or llm_gateway.get_provider(db),
            "error": str(e),
        }
