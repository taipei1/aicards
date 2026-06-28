---
slug: groq-sentences-obsidian
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/groq-sentences-obsidian.md
approach: "Two independent features: (A) separate Sentences mode with Groq-generated example sentences from due vocabulary, no persistence, no SRS; (B) ObsidianPage refactor with manual note list (filenames only) + review logging."
---

# Draft: groq-sentences-obsidian

## Components (topology ledger)
| id | outcome | status | evidence path |
|----|---------|--------|---------------|
| A1 | GroqService (backend): generates sentences from Groq API using due vocabulary words | active | `backend/app/services/gemini_service.py` pattern |
| A2 | Groq router + main.py wiring | active | `backend/app/routers/obsidian.py:161-184` pattern |
| A3 | SentencePage (frontend): new page for reviewing Groq-generated sentences | active | `frontend/src/pages/AddWordPage.tsx` pattern |
| A4 | ObsidianPage refactor: two-mode (Due + All Notes), manual note selection | active | `frontend/src/pages/ObsidianPage.tsx` |

## Findings (cited - path:lines)
- `.env` has `GOOGLE_API_KEY`, `GEMINI_MODEL`, `DEEPSEEK_MODEL` but no Groq key — `backend/app/config.py:26`
- Backend runs FastAPI on localhost:8000, frontend Vite on localhost:3000 — `backend/app/main.py:49-52`
- Existing Gemini service pattern: `backend/app/services/gemini_service.py:7-111` — singleton class with `generate_questions`
- Existing router pattern: `backend/app/routers/obsidian.py:161-184` — `POST /questions` endpoint
- ObsidianPage currently loads 5 due notes, shows first, generates questions via Gemini — `frontend/src/pages/ObsidianPage.tsx:30-42`
- Groq API uses `groq` Python package, `client.chat.completions.create()`, model `mixtral-8x7b-32768`
- Card model has `front`, `back`, `language` fields — `backend/app/models.py:20-47`
- Review/logging API exists for both cards and Obsidian notes — `backend/app/routers/reviews.py`, `obsidian.py:187-263`
- Theme patterns: `btn`, `btnPrimary`, `btnGrade`, `cardBox` — `frontend/src/styles/theme.ts`

## Decisions (with rationale)
1. **Groq model = `mixtral-8x7b-32768`**: fast inference, good multilingual support (English + Slovak + Russian), free tier available
2. **Separate Sentences page (not integrated into card review)**: user explicitly said не трогать существующее повторение слов
3. **No caching in DB**: user explicitly said не сохранять в БД
4. **Random sentence direction (50/50)**: user said оба направления используй
5. **Obsidian manual list = only filenames**: user said "название заметки и все точка"
6. **Manual review counts toward FSRS**: user said "когда я сам повторил заметку она должна засчитаться"
7. **Two-mode Obsidian page (tabs: Due / All Notes)**: clean separation between auto-repeat and manual browsing

## Scope IN
- New `GROQ_API_KEY` env var + config
- `groq_service.py`: singleton service, `generate_sentence(vocab_word, language, front_meaning, back_meaning)` → `{sentence_in_target, translation_in_russian}`
- `groq.py` router: `POST /api/groq/sentence` — takes `word`, `language`, `front_meaning`, `back_meaning` — returns generated sentence pair
- `SentencePage.tsx`: language selector, sentence card (front/back flip), "Next" button, keyboard shortcuts
- Nav item "Sentences" added to App.tsx
- ObsidianPage: tabs for "Due" (current behavior) and "All Notes" (file list)
- "All Notes" tab: list of note filenames, click → show full content + TTS → grade buttons (FSRS) → back to list
- `pip install groq`

## Scope OUT (Must NOT have)
- ❌ No changes to LanguagePage.tsx or CardDisplay.tsx
- ❌ No sentence persistence in database
- ❌ No new Card/CardReverse/Review models for sentences
- ❌ No FSRS scheduling for sentences (ephemeral)
- ❌ No Obsidian note previews in the list (filenames only)
- ❌ No Gemini integration changes
- ❌ No `DEEPSEEK_API_KEY` usage (config can stay, unused)

## Approval gate
status: awaiting-approval
