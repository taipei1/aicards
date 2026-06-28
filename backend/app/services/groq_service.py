from groq import Groq
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
            import json

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
