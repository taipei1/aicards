from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response
import asyncio
import io

from gtts import gTTS

router = APIRouter(prefix="/api/tts", tags=["tts"])

# Deep male voices with per-voice prosody. English / Slovak / Russian.
# Note: ru-RU-DmitryNeural rejects any rate/pitch tweak (edge-tts answers
# "No audio was received"), so it is called plain.
EDGE_VOICES = {
    "en": ("en-US-GuyNeural", "-8%", "-12Hz"),
    "sk": ("sk-SK-LukasNeural", "-8%", "-12Hz"),
    "ru": ("ru-RU-DmitryNeural", None, None),
}

# gTTS fallback — no voice selection, used only if edge-tts is unreachable.
GTTS_LANG_MAP = {
    "en": "en",
    "en-gb": "en",
    "en-us": "en",
    "sk": "sk",
    "ru": "ru",
    "de": "de",
    "fr": "fr",
    "es": "es",
    "it": "it",
}

# Lower the tone a little and slow the delivery down — reads as a calm,
# low male voice rather than a neutral synthetic one.
SLOW_RATE = "-35%"


def _resolve_voice(lang: str) -> tuple[str, str]:
    """Return (edge_voice, gtts_lang) for a language code."""
    code = (lang or "en").lower()
    if code.startswith("sk"):
        return EDGE_VOICES["sk"][0], "sk"
    if code.startswith("ru"):
        return EDGE_VOICES["ru"][0], "ru"
    return EDGE_VOICES["en"][0], "en"


def _prosody(lang: str, slow: bool) -> tuple[str | None, str | None]:
    """Return (rate, pitch) for a language, or (None, None) for plain."""
    code = (lang or "en").lower()
    if code.startswith("sk"):
        _, rate, pitch = EDGE_VOICES["sk"]
    elif code.startswith("ru"):
        return None, None
    else:
        _, rate, pitch = EDGE_VOICES["en"]
    if slow:
        rate = SLOW_RATE
    return rate, pitch


async def _edge_synth(text: str, voice: str, rate: str | None, pitch: str | None) -> bytes:
    import edge_tts

    kwargs: dict = {}
    if rate is not None:
        kwargs["rate"] = rate
    if pitch is not None:
        kwargs["pitch"] = pitch
    communicate = edge_tts.Communicate(text, voice, **kwargs)
    audio = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    if not audio:
        raise RuntimeError("edge-tts returned no audio")
    return audio


def _gtts_synth(text: str, lang: str, slow: bool) -> bytes:
    buf = io.BytesIO()
    tts = gTTS(text=text, lang=lang, slow=slow)
    tts.write_to_fp(buf)
    return buf.getvalue()


@router.get("/speak")
async def speak(
    text: str = Query(..., description="Text to speak"),
    lang: str = Query("en", description="Language code"),
    slow: bool = Query(False, description="Slow playback"),
    voice: str = Query("", description="Optional explicit edge-tts voice override"),
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text is empty")

    text = text[:600]
    edge_voice, gtts_lang = _resolve_voice(lang)
    if voice.strip():
        edge_voice = voice.strip()

    rate, pitch = _prosody(lang, slow)

    try:
        audio = await _edge_synth(text, edge_voice, rate, pitch)
        return Response(
            content=audio,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": 'inline; filename="tts.mp3"',
                "Cache-Control": "public, max-age=3600",
                "X-TTS-Voice": edge_voice,
            },
        )
    except Exception as e:
        print(f"[TTS] edge-tts failed ({e}), falling back to gTTS")

    try:
        audio = await asyncio.to_thread(_gtts_synth, text, gtts_lang, slow)
        return Response(
            content=audio,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": 'inline; filename="tts.mp3"',
                "Cache-Control": "public, max-age=3600",
                "X-TTS-Voice": f"gtts:{gtts_lang}",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
