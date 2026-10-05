"""LLM service backed by the OmniRoute gateway (OpenAI-compatible).

Kept the GroqService name/signatures so routers stay untouched —
all chat completions go through llm_gateway now.
"""
import json
import re
from typing import Optional
from sqlalchemy.orm import Session

from app.services import llm_gateway
from app.services.llm_gateway import LLMGatewayError


class GroqService:
    @property
    def available(self) -> bool:
        return llm_gateway.is_configured(None)

    def _chat(self, db: Optional[Session], prompt: str, temperature: float, max_tokens: int) -> str:
        return llm_gateway.chat_completion(
            db,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def _chat_with_retry(
        self, db: Optional[Session], prompt: str, temperature: float,
        max_tokens: int, attempts: int = 3,
    ) -> str:
        """Retry on empty responses with backoff instead of failing at once."""
        import time as _time

        backoff = (0, 5, 15)
        last_error: Exception | None = None
        for i in range(max(1, attempts)):
            if i > 0:
                _time.sleep(backoff[min(i, len(backoff) - 1)])
            try:
                text = self._chat(db, prompt, temperature, max_tokens)
                if text.strip():
                    return text
                last_error = ValueError("empty response")
            except LLMGatewayError as e:
                last_error = e
                # Auth/config problems will not fix themselves — fail fast.
                if "not set" in str(e):
                    raise
            except Exception as e:
                last_error = e
        raise last_error if last_error else RuntimeError("LLM request failed")

    def generate_questions(
        self, content: str, num_questions: int = 1, advanced: bool = False,
        db: Optional[Session] = None,
    ) -> list:
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
            text = self._chat(db, prompt, temperature=0.5, max_tokens=4000)
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
        except LLMGatewayError as e:
            return [{"question": "LLM gateway error", "answer": str(e)}]
        except Exception as e:
            print(f"LLM error: {e}")
            return [{"question": "Error generating question", "answer": str(e)}]

    def generate_sentence(
        self, word: str, language: str, front_meaning: str, back_meaning: str,
        db: Optional[Session] = None,
    ) -> dict:
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
            text = self._chat_with_retry(db, system_prompt, temperature=0.7, max_tokens=2000)
            result = json.loads(text)
            return {
                "sentence_in_target": result.get("sentence_in_target", ""),
                "translation_in_russian": result.get("translation_in_russian", ""),
            }
        except json.JSONDecodeError:
            print(f"LLM JSON parse error: {text}")
            return {
                "error": "Failed to parse LLM response",
                "sentence_in_target": text,
                "translation_in_russian": "",
            }
        except LLMGatewayError as e:
            print(f"LLM gateway error: {e}")
            return {
                "error": str(e),
                "sentence_in_target": "",
                "translation_in_russian": "",
            }
        except Exception as e:
            print(f"LLM error: {e}")
            return {
                "error": str(e),
                "sentence_in_target": "",
                "translation_in_russian": "",
            }


    @staticmethod
    def _normalize_example(e: dict) -> dict | None:
        """Accept the key names this model family actually emits."""
        if not isinstance(e, dict):
            return None
        sentence = (
            e.get("sentence_in_target") or e.get("sentence")
            or e.get("example") or e.get("text") or e.get("s") or ""
        )
        translation = (
            e.get("translation_in_russian") or e.get("translation")
            or e.get("russian") or e.get("t") or ""
        )
        form = e.get("form") or e.get("case") or e.get("note") or e.get("f") or ""
        if not str(sentence).strip():
            return None
        return {
            "sentence_in_target": str(sentence).strip(),
            "translation_in_russian": str(translation).strip(),
            "form": str(form).strip(),
        }

    @classmethod
    def _parse_examples(cls, text: str) -> list:
        """Tolerant parse: whole JSON first, then object-by-object recovery so
        one broken item does not kill the other five."""
        candidates: list = []
        try:
            result = json.loads(text)
            if isinstance(result, dict) and isinstance(result.get("examples"), list):
                candidates = result["examples"]
            elif isinstance(result, list):
                candidates = result
        except json.JSONDecodeError:
            pass

        if not candidates and text:
            # Try every '{' as a potential object start; raw_decode parses one
            # complete object and ignores whatever broken tail follows it.
            decoder = json.JSONDecoder()
            pos = 0
            while True:
                start = text.find("{", pos)
                if start < 0:
                    break
                try:
                    obj, end = decoder.raw_decode(text, start)
                except json.JSONDecodeError:
                    pos = start + 1
                    continue
                if isinstance(obj, dict):
                    if isinstance(obj.get("examples"), list):
                        candidates.extend(obj["examples"])
                    else:
                        candidates.append(obj)
                pos = end

        out = []
        for e in candidates:
            norm = cls._normalize_example(e)
            if norm:
                out.append(norm)
        return out

    @staticmethod
    def _strip(s: str) -> str:
        import unicodedata
        return "".join(
            c for c in unicodedata.normalize("NFD", s.lower())
            if unicodedata.category(c) != "Mn"
        )

    @classmethod
    def _contains_word(cls, sentence: str, word: str) -> bool:
        """Stem check: does the sentence contain the word (or its stem)?
        Guards against examples that silently drop the target word."""
        s = cls._strip(sentence)
        parts = [p for p in cls._strip(word).split() if p]
        if not parts:
            return True
        if len(parts) == 1:
            w = parts[0]
            stem = w[:4] if len(w) >= 4 else w
            return stem in s
        # Phrase: any content word (4+ chars) by its stem must occur.
        for p in parts:
            if len(p) >= 4 and p[:4] in s:
                return True
        return len([p for p in parts if len(p) >= 4]) == 0

    @classmethod
    def _parse_rich(cls, text: str) -> tuple:
        """Split a rich answer into (examples, usage_notes, synonyms).

        Accepts extra top-level keys next to "examples"; anything missing
        just stays empty — no validation pressure on the model.
        """
        examples: list = []
        notes = ""
        synonyms: list = []
        try:
            result = json.loads(text)
            if isinstance(result, dict):
                if isinstance(result.get("examples"), list):
                    examples = result["examples"]
                for key in ("usage_notes", "notes", "nuances", "usage"):
                    val = result.get(key)
                    if isinstance(val, str) and val.strip():
                        notes = val.strip()
                        break
                syn = result.get("synonyms")
                if isinstance(syn, list):
                    synonyms = syn
            elif isinstance(result, list):
                examples = result
        except json.JSONDecodeError:
            pass

        if not examples:
            examples = cls._parse_examples(text)

        out = []
        for e in examples:
            norm = cls._normalize_example(e)
            if norm:
                out.append(norm)

        syn_out = []
        for s in synonyms:
            if isinstance(s, dict) and str(s.get("word") or "").strip():
                syn_out.append({
                    "word": str(s["word"]).strip(),
                    "note": str(s.get("note") or s.get("difference") or "").strip(),
                })
            elif isinstance(s, str) and s.strip():
                syn_out.append({"word": s.strip(), "note": ""})

        return out, notes, syn_out[:4]

    @staticmethod
    def _has_cyrillic(s: str) -> bool:
        return bool(re.search(r'[А-Яа-яЁё]', s))

    @classmethod
    def _parse_markdown(cls, text: str) -> tuple:
        """Fallback for Markdown answers: numbered example list plus
        'Usage nuances:' and 'Synonyms:' sections."""
        examples: list = []
        notes: list = []
        synonyms: list = []
        mode = "examples"
        for raw in text.split("\n"):
            line = raw.strip()
            if not line:
                continue
            head = re.sub(r'[*#_>`]', "", line).strip().rstrip(":").lower()
            if head in ("usage nuances", "usage notes", "nuances", "notes"):
                mode = "notes"
                continue
            if head in ("synonyms", "similar words", "synonims"):
                mode = "synonyms"
                continue
            if mode == "notes":
                notes.append(re.sub(r"\*\*(.+?)\*\*", r"\1", line))
                continue
            m = re.match(r"^(?:\d+[.)]\s*|[-*•]\s*)(.+)$", line)
            if not m:
                continue
            content = re.sub(r"\*\*(.+?)\*\*", r"\1", m.group(1)).strip()
            if mode == "examples":
                sentence, translation = content, ""
                for sep in (" — ", " – "):
                    if sep in content:
                        head_part, tail = content.rsplit(sep, 1)
                        if tail and cls._has_cyrillic(tail) and not cls._has_cyrillic(head_part):
                            sentence, translation = head_part.strip(), tail.strip()
                            break
                if sentence:
                    examples.append({
                        "sentence_in_target": sentence,
                        "translation_in_russian": translation,
                        "form": "",
                    })
            else:
                parts = re.split(r"\s+[–—-]\s*|\s*:\s*", content, maxsplit=1)
                word, note = (parts + [""])[:2]
                word = word.strip(' *"')
                m2 = re.match(r"^(.+?)\s*\((.+)\)$", word)
                if not note and m2:
                    word, note = m2.group(1).strip(), m2.group(2).strip()
                if word:
                    synonyms.append({"word": word, "note": note.strip()})
        return examples[:6], " ".join(notes).strip(), synonyms[:4]

    def generate_notes(
        self,
        word: str,
        language: str,
        back_meaning: str,
        db: Optional[Session] = None,
    ) -> dict:
        """Usage nuances + synonyms as an independent call.

        Runs in parallel with generate_examples; the client renders
        whichever block arrives first. The raw answer is shown as-is,
        no structure parsing.
        """
        if language == "sk":
            prompt = (
                f'Slovenské slovo "{word}" (význam: "{back_meaning}"). '
                f"Napíš pár viet o dôležitých nuansách jeho používania "
                f"a pridaj 2–3 synonimá s krátkym vysvetlením, v čom je rozdiel."
            )
        else:
            prompt = (
                f'The word "{word}" (meaning: "{back_meaning}"). '
                f"Write a few sentences about important usage nuances of this word "
                f"and add 2–3 synonyms with a brief explanation of the difference."
            )

        try:
            text = self._chat_with_retry(db, prompt, temperature=0.5, max_tokens=2000, attempts=2)
        except Exception as e:
            print(f"LLM notes failed: {e}")
            return {"error": str(e), "usage_notes": "", "synonyms": []}
        text = (text or "").strip()
        if not text:
            print(f"LLM notes empty for word={word!r}")
            return {"error": "empty response", "usage_notes": "", "synonyms": []}
        return {"usage_notes": text, "synonyms": []}

    def generate_examples(
        self,
        word: str,
        language: str,
        back_meaning: str,
        is_phrase: bool,
        siblings: list,
        db: Optional[Session] = None,
    ) -> dict:
        """Generate usage examples with a single relaxed prompt.

        No strict rules — just ask for 6 examples with translations and
        show whatever the model returns.
        """
        sibling_hint = ""
        if siblings:
            listed = ", ".join(f'"{s}"' for s in siblings[:12])
            sibling_hint = (
                f" Popri tom sa učí aj tieto slová — môžeš niektoré použiť "
                f"v príkladoch: {listed}."
                if language == "sk" else
                f" The student is also learning these words — feel free to use "
                f"any of them in the examples: {listed}."
            )

        if language == "sk":
            prompt = (
                f'Slovenské slovo "{word}" (význam: "{back_meaning}"). '
                f"Napíš 6 krátkych príkladov viet s týmto slovom, "
                f"každý v inom gramatickom tvare. "
                f"Ak je to sloveso, použi rôzne osoby (ja, ty, on/ona, my, vy, oni) "
                f"a pridaj aj minulý čas."
                f"{sibling_hint} "
                f"Ku každému príkladu pridaj preklad do ruštiny "
                f"a krátky názov gramatického tvaru. "
                f'Odpovedz vo formáte JSON: {{"examples": ['
                f'{{"sentence_in_target": "...", "translation_in_russian": "...", '
                f'"form": "..."}}]}}. '
                f'Ak JSON nejde, stačí číslovaný zoznam príkladov.'
            )
        else:
            prompt = (
                f'The word "{word}" (meaning: "{back_meaning}"). '
                f"Write 6 short example sentences with this word, "
                f"each in a different grammatical form or tense. "
                f"If it is a verb, use different persons (I, you, he/she, we, they) "
                f"and include the past tense."
                f"{sibling_hint} "
                f"Add a Russian translation and a short form name to each one. "
                f'Reply in JSON format: {{"examples": ['
                f'{{"sentence_in_target": "...", "translation_in_russian": "...", '
                f'"form": "..."}}]}}. '
                f'If JSON is awkward, a numbered list is fine too.'
            )

        try:
            text = self._chat_with_retry(db, prompt, temperature=0.5, max_tokens=8000, attempts=2)
            collected, _, _ = self._parse_rich(text)
            if not collected:
                collected, _, _ = self._parse_markdown(text or "")
        except Exception as e:
            print(f"LLM examples failed: {e}")
            return {"error": str(e), "examples": []}

        if not collected:
            # Show the raw answer instead of an error when parsing fails.
            text = (text or "").strip()
            if text:
                return {"examples": [{
                    "sentence_in_target": text[:1500],
                    "translation_in_russian": "",
                    "form": "",
                }]}
            return {"error": "empty response", "examples": []}

        # Drop examples that lost the target word — but only when enough
        # survive: suppletive verbs (byť → som/si/je) never contain their own
        # stem, and for them the check must not eat everything.
        with_word = [e for e in collected if self._contains_word(
            e["sentence_in_target"], word
        )]
        if len(with_word) >= 2:
            collected = with_word

        return {"examples": collected[:6]}


groq_service = GroqService()
