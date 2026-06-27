from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response
from gtts import gTTS
import io

router = APIRouter(prefix="/api/tts", tags=["tts"])

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


@router.get("/speak")
async def speak(
    text: str = Query(..., description="Text to speak"),
    lang: str = Query("en", description="Language code"),
    slow: bool = Query(False, description="Slow playback"),
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text is empty")

    lang_code = GTTS_LANG_MAP.get(lang.lower(), "en")

    try:
        buf = io.BytesIO()
        tts = gTTS(text=text, lang=lang_code, slow=slow)
        tts.write_to_fp(buf)
        buf.seek(0)

        return Response(
            content=buf.getvalue(),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": 'inline; filename="tts.mp3"',
                "Cache-Control": "public, max-age=3600",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
