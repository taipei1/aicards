from fastapi import APIRouter
from pydantic import BaseModel
from deep_translator import GoogleTranslator

router = APIRouter()


class TranslateRequest(BaseModel):
    word: str
    source_lang: str
    target_lang: str


class TranslateResponse(BaseModel):
    translated: str | None
    source_lang: str
    target_lang: str
    error: str | None = None


@router.post("/", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    try:
        result = GoogleTranslator(source=req.source_lang, target=req.target_lang).translate(req.word)
        return TranslateResponse(
            translated=result,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
        )
    except Exception:
        return TranslateResponse(
            translated=None,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            error="Translation unavailable",
        )
