from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response
from gtts import gTTS
import io

router = APIRouter(prefix="/api/tts", tags=["tts"])

# Language code map for gTTS
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
        tts = gTTS(text=text, lang=lang_code, slow=slow)
        audio_data = io.BytesIO()
        tts.write_to_fp(audio_data)
        audio_bytes = audio_data.getvalue()

        return Response(
            content=audio_bytes,
            media_type="audio/mp3",
            headers={
                "Content-Disposition": f'inline; filename="tts.mp3"',
                "Cache-Control": "public, max-age=3600",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
