import google.generativeai as genai
from typing import List, Dict, Optional
import json
import re
from app.config import settings

class GeminiService:
    def __init__(self):
        try:
            genai.configure(api_key=settings.google_api_key)
            self.model = genai.GenerativeModel("gemini-3.5-flash")
            self.available = True
        except Exception as e:
            print(f"Gemini initialization failed: {e}")
            self.available = False
    
    def generate_questions(
        self,
        content: str,
        num_questions: int = 1,
        advanced: bool = False
    ) -> List[Dict[str, str]]:
        """Generate atomic questions from note content."""
        if not self.available:
            return [{"question": "Gemini not available", "answer": content[:200]}]
        
        if advanced:
            prompt = f"""Based on the concepts in this text, generate 1 deep, 
            thought-provoking question that extends the content and explores 
            related ideas beyond what is explicitly stated.
            
            Text:
            {content[:3000]}
            
            Provide your response in this exact format:
            Q: [question]
            A: [detailed answer]
            """
        else:
            prompt = f"""Generate {num_questions} atomic, specific questions
            that can be answered in 1-2 sentences based on this text.
            
            Rules:
            - Questions must be factual and specific
            - No abstract or vague questions
            - Each question should test a single fact
            - Provide the answer from the text
            
            Text:
            {content[:3000]}
            
            Provide your response in this exact format:
            Q1: [question]
            A1: [answer]
            """
        
        try:
            response = self.model.generate_content(prompt)
            return self._parse_questions(response.text)
        except Exception as e:
            print(f"Gemini API error: {e}")
            return [{"question": "Error generating question", "answer": str(e)}]
    
    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding for semantic search."""
        if not self.available:
            return None
        
        try:
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=text[:8000],
                task_type="SEMANTIC_SIMILARITY"
            )
            return result["embedding"]
        except Exception as e:
            print(f"Embedding error: {e}")
            return None
    
    def _parse_questions(self, text: str) -> List[Dict[str, str]]:
        """Parse Q/A format responses."""
        questions = []
        lines = text.strip().split('\n')
        
        current_q = None
        current_a = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            if re.match(r'^Q\d*[:.]', line, re.IGNORECASE):
                if current_q and current_a:
                    questions.append({"question": current_q, "answer": current_a})
                current_q = re.sub(r'^Q\d*[:.]', '', line).strip()
                current_a = None
            elif re.match(r'^A\d*[:.]', line, re.IGNORECASE):
                current_a = re.sub(r'^A\d*[:.]', '', line).strip()
            elif current_q and not current_a:
                current_a = line
        
        if current_q and current_a:
            questions.append({"question": current_q, "answer": current_a})
        
        return questions if questions else [{"question": "Could not parse questions", "answer": text[:500]}]


# Singleton instance
gemini_service = GeminiService()
