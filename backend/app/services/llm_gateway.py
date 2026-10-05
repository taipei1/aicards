"""OmniRoute LLM gateway client (OpenAI-compatible API).

All LLM chat completions and embeddings go through the user's OmniRoute
proxy. Connection params resolve as: DB settings (set via Settings UI)
override environment variables.
"""
import time
from typing import List, Optional

import httpx
from sqlalchemy.orm import Session

from app.config import settings as env_settings


class LLMGatewayError(Exception):
    pass


def get_setting(db: Optional[Session], key: str) -> Optional[str]:
    if db is None:
        return None
    try:
        from app.models import AppSetting
        row = db.query(AppSetting).filter(AppSetting.key == key).first()
        return row.value if row else None
    except Exception:
        return None


def set_setting(db: Session, key: str, value: str) -> None:
    from app.models import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        row = AppSetting(key=key, value=value)
        db.add(row)
    db.commit()


def resolve_config(db: Optional[Session] = None) -> dict:
    """Effective gateway config: DB (UI) overrides env."""
    def pick(db_key: str, env_val: str) -> str:
        v = get_setting(db, db_key)
        if v is not None and v != "":
            return v
        return env_val or ""

    return {
        "base_url": (pick("omnirouter.base_url", env_settings.omnirouter_base_url) or "").rstrip("/"),
        "api_key": pick("omnirouter.api_key", env_settings.omnirouter_api_key),
        "chat_model": pick("omnirouter.chat_model", env_settings.omnirouter_chat_model),
        "embedding_model": pick("omnirouter.embedding_model", env_settings.omnirouter_embedding_model),
    }


def is_configured(db: Optional[Session] = None) -> bool:
    cfg = resolve_config(db)
    return bool(cfg["base_url"] and cfg["api_key"])


def chat_completion(
    db: Optional[Session],
    messages: List[dict],
    temperature: float = 0.5,
    max_tokens: int = 500,
    timeout: int = 120,
) -> str:
    """Single non-streaming chat completion. Returns assistant text."""
    cfg = resolve_config(db)
    if not cfg["api_key"]:
        raise LLMGatewayError("OmniRoute API key is not set (Settings → LLM)")
    if not cfg["base_url"]:
        raise LLMGatewayError("OmniRoute base URL is not set (Settings → LLM)")

    url = f"{cfg['base_url']}/chat/completions"
    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {cfg['api_key']}"},
            json={
                "model": cfg["chat_model"],
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
                # No reasoning/thinking: it burns thousands of tokens and
                # turns a 1-second answer into a minute-long one.
                "enable_thinking": False,
            },
            timeout=timeout,
        )
    except Exception as e:
        raise LLMGatewayError(f"Gateway unreachable at {cfg['base_url']}: {e}")

    if resp.status_code != 200:
        raise LLMGatewayError(f"Gateway HTTP {resp.status_code}: {resp.text[:300]}")

    try:
        data = resp.json()
        return (data["choices"][0]["message"]["content"] or "").strip()
    except Exception as e:
        raise LLMGatewayError(f"Bad gateway response: {e} | {resp.text[:300]}")


def create_embedding(
    db: Optional[Session],
    text: str,
    timeout: int = 120,
) -> List[float]:
    """Embedding vector via gateway. Returns list of floats."""
    cfg = resolve_config(db)
    if not cfg["api_key"]:
        raise LLMGatewayError("OmniRoute API key is not set (Settings → LLM)")
    if not cfg["base_url"]:
        raise LLMGatewayError("OmniRoute base URL is not set (Settings → LLM)")

    url = f"{cfg['base_url']}/embeddings"
    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {cfg['api_key']}"},
            json={"model": cfg["embedding_model"], "input": text[:8000]},
            timeout=timeout,
        )
    except Exception as e:
        raise LLMGatewayError(f"Gateway unreachable at {cfg['base_url']}: {e}")

    if resp.status_code != 200:
        raise LLMGatewayError(f"Gateway HTTP {resp.status_code}: {resp.text[:300]}")

    try:
        data = resp.json()
        return data["data"][0]["embedding"]
    except Exception as e:
        raise LLMGatewayError(f"Bad gateway response: {e} | {resp.text[:300]}")


def test_connection(db: Optional[Session] = None) -> dict:
    """Tiny probe used by the Settings → Test button."""
    started = time.time()
    text = chat_completion(
        db,
        messages=[{"role": "user", "content": "Reply with exactly: ok"}],
        temperature=0.0,
        max_tokens=10,
        timeout=90,
    )
    cfg = resolve_config(db)
    return {
        "ok": True,
        "model": cfg["chat_model"],
        "latency_ms": int((time.time() - started) * 1000),
        "reply": text[:100],
    }
