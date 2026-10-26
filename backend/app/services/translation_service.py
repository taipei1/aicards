"""Word/phrase translation for the Add Word form.

The LLM gateway is tried first: GoogleTranslator often rate-limits shared IPs
(HTTP 429 too many requests), which made auto-translate look broken. The
gateway already falls back to Groq, so translation keeps working when the
OmniRoute host is offline. Google remains as a last-resort fallback.
"""
import re
from typing import Optional

from sqlalchemy.orm import Session

from app.services import llm_gateway
from app.services.llm_gateway import LLMGatewayError

LANGUAGE_NAMES = {
    "en": "English",
    "sk": "Slovak",
    "ru": "Russian",
}


def _clean_translation(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
    text = re.sub(r"\s*```$", "", text).strip()
    text = re.sub(
        r"(?i)^(translation|перевод|russian|русский|slovak|словацкий|english|английский)"
        r"\s*[:：-]\s*",
        "",
        text,
    ).strip()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    return lines[0].strip().strip('"').strip("'").strip()


def _llm_translate(
    text: str,
    source_lang: str,
    target_lang: str,
    db: Optional[Session],
) -> tuple[str, str]:
    source = LANGUAGE_NAMES.get(source_lang, source_lang)
    target = LANGUAGE_NAMES.get(target_lang, target_lang)
    prompt = f"""Translate the {source} word or phrase below into {target}.
Return ONLY the translation, without quotes, numbering, explanations or alternatives.
If the input is a phrase, translate it as a whole and naturally.
If the input is already in {target}, return it unchanged.

TEXT: {text}
"""
    answer, model = llm_gateway.chat_completion_ex(
        db,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=120,
        timeout=25,
    )
    cleaned = _clean_translation(answer)
    if not cleaned:
        raise LLMGatewayError("Translation answer was empty")
    if len(cleaned) > 200:
        raise LLMGatewayError("Translation answer was too long")
    return cleaned, model


def _google_translate(text: str, source_lang: str, target_lang: str) -> str:
    # Imported lazily: this path is only a fallback now.
    from deep_translator import GoogleTranslator

    result = (GoogleTranslator(source=source_lang, target=target_lang).translate(text) or "").strip()
    if not result:
        raise ValueError("empty Google translation")
    return result


def translate_text(
    text: str,
    source_lang: str,
    target_lang: str,
    db: Optional[Session] = None,
) -> dict:
    # Collapse whitespace/newlines: the value is a single word or phrase, and
    # this also keeps the prompt on one TEXT: line.
    text = " ".join((text or "").split())
    if not text:
        return {"translated": None, "model": "", "error": "Empty input"}
    if source_lang == target_lang:
        return {"translated": text, "model": "", "error": None}

    try:
        translated, model = _llm_translate(text, source_lang, target_lang, db)
        return {"translated": translated, "model": model, "error": None}
    except Exception as e:
        print(f"LLM translation failed: {e}")

    try:
        translated = _google_translate(text, source_lang, target_lang)
        return {"translated": translated, "model": "google", "error": None}
    except Exception as e:
        print(f"Google translation failed: {e}")

    return {"translated": None, "model": "", "error": "Translation unavailable"}
