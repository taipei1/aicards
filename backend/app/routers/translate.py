from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.translation_service import translate_text

router = APIRouter()


class TranslateRequest(BaseModel):
    word: str
    source_lang: str
    target_lang: str


class TranslateResponse(BaseModel):
    translated: str | None
    source_lang: str
    target_lang: str
    model: str = ""
    error: str | None = None


@router.post("", response_model=TranslateResponse)
@router.post("/", response_model=TranslateResponse, include_in_schema=False)
def translate(req: TranslateRequest, db: Session = Depends(get_db)):
    result = translate_text(req.word, req.source_lang, req.target_lang, db)
    return TranslateResponse(
        translated=result["translated"],
        source_lang=req.source_lang,
        target_lang=req.target_lang,
        model=result.get("model", ""),
        error=result.get("error"),
    )
