import subprocess
import tempfile
import os
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response

router = APIRouter(prefix="/api/tts", tags=["tts"])

ESPEAK_LANG_MAP = {
    "en": "en-us",
    "en-gb": "en-gb",
    "en-us": "en-us",
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

    lang_code = ESPEAK_LANG_MAP.get(lang.lower(), "en-us")
    speed = 80 if slow else 150

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    mp3_path = wav_path.replace(".wav", ".mp3")

    try:
        result = subprocess.run(
            ["espeak-ng", "-v", lang_code, "-s", str(speed), "-w", wav_path, text],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=500, detail=f"TTS failed: {result.stderr}"
            )

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                wav_path,
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "64k",
                mp3_path,
            ],
            capture_output=True,
            timeout=30,
        )

        with open(mp3_path, "rb") as f:
            audio_bytes = f.read()

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": 'inline; filename="tts.mp3"',
                "Cache-Control": "public, max-age=3600",
            },
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="TTS timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"TTS failed: {str(e)}"
        )
    finally:
        for p in [wav_path, mp3_path]:
            if os.path.exists(p):
                os.unlink(p)
