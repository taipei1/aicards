from groq import Groq
import json
import re
from app.config import settings


class GroqService:
    def __init__(self):
        try:
            self.client = Groq(api_key=settings.groq_api_key)
            self.model = settings.groq_model
            self.available = True
        except Exception as e:
            print(f"Groq initialization failed: {e}")
            self.available = False

    def generate_questions(
        self, content: str, num_questions: int = 1, advanced: bool = False
    ) -> list:
        if not self.available:
            return [{"question": "Groq not available", "answer": content[:200]}]

        if advanced:
            prompt = f"""Based on the concepts in this text, generate 1 deep,
thought-provoking question that extends the content and explores
related ideas beyond what is explicitly stated.

Text:
{content[:4000]}

Return ONLY valid JSON array: [{{"question": "...", "answer": "..."}}]
Each object must have "question" and "answer" fields."""
        else:
            prompt = f"""Generate {num_questions} atomic, specific questions
that can be answered in 1-2 sentences based on this text.

Rules:
- Questions must be factual and specific
- No abstract or vague questions
- Each question should test a single fact
- Provide the answer from the text

Text:
{content[:4000]}

Return ONLY valid JSON array: [{{"question": "...", "answer": "..."}}]
Each object must have "question" and "answer" fields."""

        try:
            response = self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                temperature=0.5,
                max_tokens=500,
            )
            text = (response.choices[0].message.content or "").strip()
            # Try to parse JSON directly
            try:
                result = json.loads(text)
                if isinstance(result, list):
                    return result
                elif isinstance(result, dict) and "questions" in result:
                    return result["questions"]
            except json.JSONDecodeError:
                pass
            # Fallback: try to extract JSON array from text
            match = re.search(r'\[.*?\]', text, re.DOTALL)
            if match:
                try:
                    result = json.loads(match.group())
                    if isinstance(result, list):
                        return result
                except json.JSONDecodeError:
                    pass
            # Last resort: parse Q/A format
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
            return questions if questions else [{"question": "Could not parse", "answer": text[:300]}]
        except Exception as e:
            print(f"Groq API error: {e}")
            return [{"question": "Error generating question", "answer": str(e)}]

    def generate_sentence(
        self, word: str, language: str, front_meaning: str, back_meaning: str
    ) -> dict:
        if not self.available:
            return {
                "error": "Groq not available",
                "sentence_in_target": "",
                "translation_in_russian": "",
            }

        level = "A2" if language == "en" else "native"
        system_prompt = (
            f"Ты — помощник для изучения языков. "
            f"Сгенерируй короткое, простое предложение на {language}, "
            f'используя слово "{word}" в значении: '
            f'"{front_meaning} — {back_meaning}". '
            f"Предложение должно быть полезным для повседневной жизни. "
            f"Уровень: {level} для {language}. "
            f'Верни только JSON: {{"sentence_in_target": "...", "translation_in_russian": "..."}}'
        )

        try:
            response = self.client.chat.completions.create(
                messages=[{"role": "user", "content": system_prompt}],
                model=self.model,
                temperature=0.7,
                max_tokens=150,
            )
            text = response.choices[0].message.content.strip()
            result = json.loads(text)
            return {
                "sentence_in_target": result.get("sentence_in_target", ""),
                "translation_in_russian": result.get("translation_in_russian", ""),
            }
        except json.JSONDecodeError:
            print(f"Groq JSON parse error: {text}")
            return {
                "error": "Failed to parse Groq response",
                "sentence_in_target": text,
                "translation_in_russian": "",
            }
        except Exception as e:
            print(f"Groq API error: {e}")
            return {
                "error": str(e),
                "sentence_in_target": "",
                "translation_in_russian": "",
            }


groq_service = GroqService()
