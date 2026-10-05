"""Embedding + question service backed by the OmniRoute gateway.

Kept the GeminiService name/signatures so callers stay untouched —
embeddings go through llm_gateway (1536-dim model by default,
matching the Vector(1536) column).
"""
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from app.services import llm_gateway
from app.services.llm_gateway import LLMGatewayError
from app.services.groq_service import groq_service


class GeminiService:
    @property
    def available(self) -> bool:
        return llm_gateway.is_configured(None)

    def generate_questions(
        self,
        content: str,
        num_questions: int = 1,
        advanced: bool = False,
        db: Optional[Session] = None,
    ) -> List[Dict[str, str]]:
        """Generate atomic questions from note content (via gateway)."""
        return groq_service.generate_questions(
            content, num_questions=num_questions, advanced=advanced, db=db
        )

    def generate_embedding(
        self, text: str, db: Optional[Session] = None
    ) -> Optional[List[float]]:
        """Generate embedding for semantic search (via gateway)."""
        try:
            return llm_gateway.create_embedding(db, text)
        except LLMGatewayError as e:
            print(f"Embedding error: {e}")
            return None
        except Exception as e:
            print(f"Embedding error: {e}")
            return None


# Singleton instance
gemini_service = GeminiService()
