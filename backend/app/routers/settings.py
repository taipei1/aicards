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
