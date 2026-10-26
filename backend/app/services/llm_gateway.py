"""OmniRoute LLM gateway client (OpenAI-compatible API).

All LLM chat completions and embeddings go through the user's OmniRoute
proxy. Connection params resolve as: DB settings (set via Settings UI)
override environment variables.

If the primary gateway is unreachable or returns an error, chat requests fall
back to Groq (also OpenAI-compatible) when GROQ_API_KEY is configured. The
fallback is what keeps Sentence/More usable when the OmniRoute box at home is
offline: the URL in settings may point at a machine that is not always up.
"""
import threading
import time
from typing import List, Optional

import httpx
from sqlalchemy.orm import Session

from app.config import settings as env_settings

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
# The user's gateway can be down for hours; without a breaker every click
# would wait for the connect timeout before using the fallback.
PRIMARY_DOWN_SECONDS = 120

_primary_down_until = 0.0
_primary_lock = threading.Lock()


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


def _primary_is_down() -> bool:
    with _primary_lock:
        return time.time() < _primary_down_until


def _mark_primary_down() -> None:
    global _primary_down_until
    with _primary_lock:
        _primary_down_until = time.time() + PRIMARY_DOWN_SECONDS


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
        "fallback_model": env_settings.groq_fallback_model,
    }


def is_configured(db: Optional[Session] = None) -> bool:
    cfg = resolve_config(db)
    return bool(
        (cfg["base_url"] and cfg["api_key"])
        or env_settings.groq_api_key
    )


def _content_from_message(message: dict) -> str:
    """Some OpenAI-compatible providers return content as a list of parts."""
    content = message.get("content")
    if isinstance(content, list):
        return "".join(
            p.get("text", "") for p in content if isinstance(p, dict)
        ).strip()
    return (content or "").strip()


def _read_completion(resp: httpx.Response, label: str) -> tuple[str, str]:
    if resp.status_code != 200:
        raise LLMGatewayError(f"{label} HTTP {resp.status_code}: {resp.text[:300]}")
    try:
        data = resp.json()
        message = data["choices"][0]["message"]
        text = _content_from_message(message)
        model = data.get("model") or ""
        if not text:
            raise LLMGatewayError(f"{label} returned an empty answer")
        return text, model
    except LLMGatewayError:
        raise
    except Exception as e:
        raise LLMGatewayError(f"Bad {label} response: {e} | {resp.text[:300]}")


def _groq_chat(
    messages: List[dict],
    temperature: float,
    max_tokens: int,
    timeout: int,
) -> tuple[str, str]:
    key = env_settings.groq_api_key
    if not key:
        raise LLMGatewayError("Groq fallback key is not set")
    model = env_settings.groq_fallback_model or "openai/gpt-oss-120b"
    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    # gpt-oss models otherwise spend most of a small token budget on hidden
    # reasoning and can return an empty `content`.
    if "gpt-oss" in model.lower():
        body["reasoning_effort"] = "low"
    try:
        resp = httpx.post(
            f"{GROQ_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=body,
            timeout=httpx.Timeout(connect=5.0, read=timeout, write=30.0, pool=5.0),
        )
        text, actual = _read_completion(resp, "Groq")
        return text, f"groq/{actual or model}"
    except LLMGatewayError:
        raise
    except Exception as e:
        raise LLMGatewayError(f"Groq unreachable: {e}")


def chat_completion_ex(
    db: Optional[Session],
    messages: List[dict],
    temperature: float = 0.5,
    max_tokens: int = 500,
    timeout: int = 120,
) -> tuple[str, str]:
    """One chat completion. Returns (text, actual_model).

    Tries OmniRoute first, then Groq. The model string is what the UI shows
    under Sentence and under the More blocks, so it is the model that really
    answered, not just the configured name.
    """
    cfg = resolve_config(db)
    primary_configured = bool(cfg["api_key"] and cfg["base_url"])
    if not primary_configured and not env_settings.groq_api_key:
        raise LLMGatewayError("LLM is not configured (Settings → LLM)")
    primary_error: Exception | None = None

    if primary_configured and not _primary_is_down():
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
                    # Reasoning MUST be off. This gateway mixes reasoning models
                    # (deepseek-v4.*) with plain ones: a reasoner happily burns the
                    # entire max_tokens budget in `reasoning_content` and returns
                    # finish_reason=length with an EMPTY `content` — the app then
                    # sees nothing and reports "LLM gateway error".
                    # `enable_thinking` is ignored by this gateway; the flags below
                    # are the ones that actually suppress it (verified against the
                    # live gateway). Plain models ignore them harmlessly.
                    "enable_thinking": False,
                    "reasoning_effort": "none",
                    "thinking": {"type": "disabled"},
                },
                # A dead host must not eat the whole request timeout: connect
                # quickly, then give the model the full read window.
                timeout=httpx.Timeout(connect=4.0, read=timeout, write=30.0, pool=4.0),
            )
            text, model = _read_completion(resp, "Gateway")
            return text, model or cfg["chat_model"]
        except Exception as e:
            primary_error = e
            _mark_primary_down()
            print(f"OmniRoute unavailable, using Groq fallback: {e}")

    try:
        return _groq_chat(messages, temperature, max_tokens, timeout)
    except Exception as fallback_error:
        if primary_error is not None:
            raise LLMGatewayError(
                f"OmniRoute: {primary_error}; Groq fallback: {fallback_error}"
            )
        raise LLMGatewayError(
            f"OmniRoute is temporarily unavailable; Groq fallback: {fallback_error}"
        )


def chat_completion(
    db: Optional[Session],
    messages: List[dict],
    temperature: float = 0.5,
    max_tokens: int = 500,
    timeout: int = 120,
) -> str:
    """Single non-streaming chat completion. Returns assistant text."""
    text, _ = chat_completion_ex(
        db,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    return text


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
    text, model = chat_completion_ex(
        db,
        messages=[{"role": "user", "content": "Reply with exactly: ok"}],
        temperature=0.0,
        max_tokens=100,
        timeout=60,
    )
    return {
        "ok": True,
        "model": model,
        "latency_ms": int((time.time() - started) * 1000),
        "reply": text[:100],
    }
