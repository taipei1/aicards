# groq-sentences-obsidian - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST -->

## Scope
### Must have
1. **Sentences mode** — новая страница "Sentences" в навигации. Выбираете язык (English/Slovak), нажимаете кнопку — Groq генерирует предложение со случайным словом из вашей due-лексики. Предложение показывается в случайном направлении: то русское→переводите на язык, то на языке→переводите на русский. Переворот, TTS, "Next". Ничего не сохраняется.
2. **Obsidian: ручной выбор** — страница Obsidian теперь с двумя вкладками: "Due" (авто-очередь как сейчас) и "All Notes" (список названий заметок). Нажали на название → полное содержание + TTS вслух → кнопки оценки (1-4) → засчитывается в FSRS → назад к списку.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- ❌ Не трогать LanguagePage.tsx и CardDisplay.tsx
- ❌ Не сохранять предложения в БД
- ❌ Не создавать новые модели Card/CardReverse/Review для предложений
- ❌ Не добавлять FSRS для предложений
- ❌ Не показывать превью контента в списке Obsidian (только filename)
- ❌ Не менять GeminiService или существующие obsidian-эндпоинты
- ❌ Не использовать DEEPSEEK_API_KEY

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after (integration tests for backend, visual check for frontend)
- Evidence: `.omo/evidence/task-<N>-groq-sentences-obsidian.<ext>`

## Execution strategy
### Parallel execution waves
- **Wave 1** (Backend): Tasks 1-4 — .env → config → groq_service → groq router → main.py wiring
- **Wave 2** (Frontend): Tasks 5-7 — api.ts → SentencePage → App.tsx nav
- **Wave 3** (Obsidian): Tasks 8-10 — ObsidianPage refactor with two-mode + manual selection + review

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. env+config | — | 2,3 | — |
| 2. groq_service | 1 | 3 | — |
| 3. groq router | 2 | 4 | — |
| 4. main.py wiring | 3 | — | 5 |
| 5. api.ts function | — | 6 | 1,2,3,4 |
| 6. SentencePage | 5, 1 | 7 | — |
| 7. App.tsx nav | 6 | — | 8,9 |
| 8. Obsidian two-mode | — | 9,10 | 5,6,7 |
| 9. Manual note list | 8 | — | — |
| 10. Manual review | 8 | — | — |

## Todos

- [ ] 1. **backend/.env + config.py: Add GROQ_API_KEY env var**
  What to do / Must NOT do:
  - Add `GROQ_API_KEY=` to `.env` (value will be filled by user)
  - Add `groq_api_key: str` to `Settings` class in `backend/app/config.py`
  - Add `groq_model: str = "llama-3.3-70b-versatile"` to `Settings` in `config.py`
  - Add `groq` to `backend/requirements.txt`: `groq>=1.0.0`
  - Run `pip install groq` after adding
  - Must NOT commit the real API key to git

  Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3
  References (executor has NO interview context - be exhaustive):
  - `backend/app/config.py:4-27` — existing Settings class pattern
  - `.env:1-5` — existing env vars pattern
  - `backend/requirements.txt:17` — existing LLM dep pattern (google-generativeai)
  Acceptance criteria (agent-executable):
  - `grep -q "groq_api_key" backend/app/config.py && grep -q "groq_model" backend/app/config.py`
  - `pip show groq > /dev/null 2>&1` (package installed)
  QA scenarios: happy: config loads with GROQ_API_KEY set | failure: app starts without GROQ_API_KEY -> clear error
  Evidence: .omo/evidence/task-1-groq-sentences-obsidian.log
  Commit: N (API key not set yet; env changes committed after key is added)

- [ ] 2. **backend/app/services/groq_service.py: Create GroqService**
  What to do / Must NOT do:
  - Create `backend/app/services/groq_service.py`
  - Singleton class `GroqService` (same pattern as `GeminiService`)
  - Method: `generate_sentence(word: str, language: str, front_meaning: str, back_meaning: str) -> dict`
    - Returns `{"sentence_in_target": "...", "translation_in_russian": "..."}`
    - `sentence_in_target`: предложение на изучаемом языке (en/sk), содержащее `word`, с чётким контекстом
    - `translation_in_russian`: перевод этого предложения на русский
    - Если `language == "en"`: предложение на английском (A2 level — простые слова, короткие предложения)
    - Если `language == "sk"`: предложение на словацком (native level)
    - `front_meaning` и `back_meaning` передаются как контекст, чтобы Groq понимал значение слова
  - System prompt: "Ты — помощник для изучения языков. Сгенерируй короткое, простое предложение на {language}, используя слово "{word}" в значении: "{front_meaning} — {back_meaning}". Предложение должно быть полезным для повседневной жизни. Уровень: {A2 для en, native для sk}. Верни только JSON: {"sentence_in_target": "...", "translation_in_russian": "..."}"
  - Использовать `from groq import Groq`, `client = Groq(api_key=settings.groq_api_key)`
  - Модель: `settings.groq_model` ("llama-3.3-70b-versatile")
  - `temperature=0.7`, `max_tokens=150`
  - Обернуть в try/except, вернуть ошибку если API недоступен

  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3
  References:
  - `backend/app/services/gemini_service.py:7-111` — singleton pattern, API key, error handling
  - `backend/app/config.py:10` — `settings.groq_api_key`, `settings.groq_model`
  - Groq Python SDK: `client.chat.completions.create(messages=[...], model="llama-3.3-70b-versatile", temperature=0.7, max_tokens=150)`
  Acceptance criteria (agent-executable):
  - File exists: `test -f backend/app/services/groq_service.py`
  - Python imports without error: `python -c "from app.services.groq_service import groq_service"`
  QA scenarios: happy: GroqService instantiated, generate_sentence returns dict with both keys | failure: no API key -> returns error dict gracefully
  Evidence: .omo/evidence/task-2-groq-sentences-obsidian.log
  Commit: N (depends on API key; will commit with later tasks)

- [ ] 3. **backend/app/routers/groq.py: Create Groq sentence generation endpoint**
  What to do / Must NOT do:
  - Create `backend/app/routers/groq.py`
  - `POST /api/groq/sentence` endpoint
  - Request body: `{"language": str}` — Pydantic schema with `pattern="^(en|sk)$"` validation
    - `language` — "en" или "sk"
  - Response: `{"sentence_in_target": str, "translation_in_russian": str}`
  - **Логика выбора слова:**
    1. Вызвать `GET /api/cards/due` с `language` и `limit=20` (через `db.query` напрямую, не HTTP-запрос)
    2. Отфильтровать reverse-карточки: только `Card` (не `CardReverse`) — проверить через join с CardReverse (есть reverse entry — это reverse-карта)
    3. Из отфильтрованных выбрать ОДНО случайное слово
    4. Использовать `Card.front` как `word`, `Card.back` как `translation` для контекста
  - Если due-карточек нет — вернуть HTTP 404 с `{"detail": "No due cards found for {language}. Add some vocabulary first."}`
  - Использует `groq_service.generate_sentence(word, language, word, translation)` — передаёт слово + перевод как контекст
  - Если Groq API недоступен — возвращает HTTP 503 с деталями
  - Must NOT: не создавать новые модели/схемы для предложений; не возвращать `QueueItem` данные

  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 4
  References:
  - `backend/app/routers/obsidian.py:161-184` — POST /questions endpoint pattern (request params, service call, return)
  - `backend/app/routers/cards.py:180-232` — GET /cards/due endpoint pattern (how to get due cards + language filter)
  - Pydantic schema pattern: `backend/app/schemas.py:7-12`
  Acceptance criteria (agent-executable):
  - File exists: `test -f backend/app/routers/groq.py`
  - `python -c "from app.routers.groq import router"` imports cleanly
  QA scenarios: happy: POST with valid params returns 200 + sentence pair | failure: no word nor due cards -> 4xx or fallback
  Evidence: .omo/evidence/task-3-groq-sentences-obsidian.log
  Commit: Y | feat(backend): add groq sentence generation endpoint

- [ ] 4. **backend/app/main.py: Wire Groq router**
  What to do / Must NOT do:
  - Add `from app.routers import ... groq` to imports
  - Add `app.include_router(groq.router, prefix="/api/groq", tags=["groq"])`
  - Must NOT break existing routers

  Parallelization: Wave 1 | Blocked by: 3 | Blocks: — | Can parallelize with: 5
  References:
  - `backend/app/main.py:7` — existing imports pattern: `from app.routers import cards, reviews, obsidian, stats, tts, translate`
  - `backend/app/main.py:36-41` — existing router wiring pattern
  Acceptance criteria (agent-executable):
  - App starts: `cd backend && python -c "from app.main import app; print('OK')"` returns OK
  QA scenarios: happy: app starts, /api/groq/sentence responds | failure: missing import -> app fails to start
  Evidence: .omo/evidence/task-4-groq-sentences-obsidian.log
  Commit: Y | feat(backend): wire groq router into main app

- [ ] 5. **frontend/src/services/api.ts: Add generateSentence function**
  What to do / Must NOT do:
  - Add new function `generateSentence(language: string): Promise<{sentence_in_target: string, translation_in_russian: string}>`
  - Calls `POST /api/groq/sentence` with body `{language}`
  - The backend picks a random due word internally — frontend just passes language
  - Must NOT modify any existing functions

  Parallelization: Wave 2 | Blocked by: — | Blocks: 6
  References:
  - `frontend/src/services/api.ts:52-61` — createCard POST pattern shows how to call backend
  - `frontend/src/services/api.ts:80-91` — translateWord POST pattern (error handling, return type)
  Acceptance criteria (agent-executable):
  - `grep -q "generateSentence" frontend/src/services/api.ts`
  QA scenarios: happy: function exists, calls correct endpoint | failure: type mismatch -> compile error
  Evidence: .omo/evidence/task-5-groq-sentences-obsidian.log
  Commit: Y | feat(api): add generateSentence function

- [ ] 6. **frontend/src/pages/SentencePage.tsx: Create new Sentences page**
  What to do / Must NOT do:
  - Create `frontend/src/pages/SentencePage.tsx`
  - **Layout:**
    - Заголовок: "Sentences"
    - Language selector (English / Slovak) — как в `LanguagePage.tsx`
    - Кнопка "Generate Sentence" (или "Next")
    - Поле для отображения сгенерированного предложения
  - **Sentence card:**
    - Использовать `cardBox` стиль из `theme.ts`
    - Front side: предложение (либо sentence_in_target, либо translation_in_russian — 50/50 random)
    - Back side (flip): перевод
    - Переворот по клику / Space
    - TTS воспроизведение предложения на изучаемом языке
    - Рядом кнопки: "Replay" (R), "Slow" (S), "Next" (N)
  - **Flow:**
    - При нажатии "Generate Sentence": вызывает `generateSentence(language)`
    - Бэкенд сам выбирает случайное due-слово (только normal-карточки, не reverse)
    - Показывается предложение, случайное направление (50% RU→target, 50% target→RU)
    - Направление показывается меткой сверху ("Translate to English" / "Translate to Russian" / "Переведите на русский" / "Переведите на словацкий")
    - TTS всегда воспроизводит `sentence_in_target` (на изучаемом языке), независимо от того, какая сторона показана
    - "Next" → генерирует новое предложение (предыдущее уходит, ничего не сохраняется)
  - **TTS language mapping:**
    - `en` → `'en-US'`
    - `sk` → `'sk'`
  - **Keyboard shortcuts:**
    - Space: flip
    - N: Next sentence
    - R: replay TTS (всегда sentence_in_target)
    - S: slow TTS (всегда sentence_in_target)
  - **Если due-карточек нет** (API вернул 404): показать сообщение "No vocabulary due for review. Add some words first!" и кнопку "Go to Add Word"
  - Must NOT import or use CardDisplay, QueueItem, or anything from the card review system
  - Must NOT include grade buttons or FSRS
  - Must NOT touch LanguagePage.tsx or CardDisplay.tsx
  - Must NOT save anything to any database

  Parallelization: Wave 2 | Blocked by: 5 | Blocks: 7
  References:
  - `frontend/src/pages/LanguagePage.tsx:226-230` — language selector pattern
  - `frontend/src/pages/ObsidianPage.tsx:183-221` — question card display pattern (flip, speak, border style)
  - `frontend/src/styles/theme.ts:125-137` — cardBox style
  - `frontend/src/utils/tts.ts` — `speak()` and `speakSlow()` functions
  Acceptance criteria (agent-executable):
  - File exists: `test -f frontend/src/pages/SentencePage.tsx`
  - TypeScript compiles: `cd frontend && npx tsc --noEmit 2>&1 | grep -q "SentencePage" || echo "no errors"`
  QA scenarios: happy: Generate Sentence button -> loading state -> sentence appears -> flip works -> Next loads new | failure: API error -> error message shown, retry button
  Evidence: .omo/evidence/task-6-groq-sentences-obsidian.log
  Commit: Y | feat(frontend): add SentencePage with Groq-generated sentences

- [ ] 7. **frontend/src/App.tsx: Add "Sentences" nav item + routing**
  What to do / Must NOT do:
  - Import `SentencePage` from `./pages/SentencePage`
  - Add `'sentences'` to the `Page` type union
  - Add nav item `{ key: 'sentences', label: 'Sentences' }` to `navItems` array (after "Add Word", before "All Words")
  - Add `{currentPage === 'sentences' && <SentencePage />}` to page content section
  - Must NOT reorder existing nav items
  - Must NOT break existing page routing
  - Must NOT modify LanguagePage.tsx or CardDisplay.tsx imports
  - Must NOT reorder or rename existing nav items

  Parallelization: Wave 2 | Blocked by: 6 | Blocks: —
  References:
  - `frontend/src/App.tsx:8` — Page type: `type Page = 'language' | 'obsidian' | 'stats' | 'words' | 'emergency' | 'add-word'`
  - `frontend/src/App.tsx:29-36` — navItems array
  - `frontend/src/App.tsx:103-108` — page rendering pattern
  Acceptance criteria (agent-executable):
  - `grep -q "sentences" frontend/src/App.tsx` — appears in Page type, navItems, and rendering
  - `cd frontend && npx tsc --noEmit 2>&1` — no type errors
  QA scenarios: happy: nav shows "Sentences", click opens SentencePage | failure: missing import -> compile error
  Evidence: .omo/evidence/task-7-groq-sentences-obsidian.log
  Commit: Y | feat(frontend): add Sentences nav item

- [ ] 8. **frontend/src/pages/ObsidianPage.tsx: Refactor with two-mode tabs (Due + All Notes)**
  What to do / Must NOT do:
  - Add a tab switcher at the top: `Due` | `All Notes`
  - **Due tab** (default): сохранить всё текущее поведение без изменений — auto-load 5 due notes, generate questions, grade, etc.
  - **All Notes tab**: новый режим
    - Загружает ВСЕ заметки через `getObsidianNotes()` (уже есть в api.ts)
    - Показывает список названий файлов (только filename, без превью, без контента) — чистый минимализм
    - Каждое название — кликабельная кнопка/ссылка
    - Фильтр по тегам (использовать существующий tag filter)
  - Сохранить все существующие функции: `handleSync`, `loadNotes`, `handleGenerateQuestions`, `handleGrade`, `handleRejectQuestion`, `handleAskAnother`, `handleStarQuestion`, keyboard shortcuts
  - Must NOT remove or modify any existing Due-mode behavior
  - Must NOT show content previews in the note list
  - Must NOT modify LanguagePage.tsx or CardDisplay.tsx
  - Must NOT modify GeminiService or any backend code
  - Must NOT add new backend endpoints

  Parallelization: Wave 3 | Blocked by: — | Blocks: 9, 10 | Can parallelize with: 5, 6, 7
  References:
  - `frontend/src/pages/ObsidianPage.tsx:1-255` — full current implementation (preserve all of it)
  - `frontend/src/services/api.ts:117-122` — `getObsidianNotes(tag?, limit?)` existing function
  - `frontend/src/styles/theme.ts:24-34` — `btn` style for note list items
  - `frontend/src/App.tsx:74-100` — nav button active/inactive tab pattern (for tab styling)
  Acceptance criteria (agent-executable):
  - `grep -q "All Notes" frontend/src/pages/ObsidianPage.tsx` — tab exists
  - `grep -q "getObsidianNotes" frontend/src/pages/ObsidianPage.tsx` — uses the API
  - `cd frontend && npx tsc --noEmit 2>&1` — no errors
  QA scenarios: happy: tabs switch visible, Due tab works as before, All Notes shows filenames | failure: empty notes -> show "No notes" with Sync button
  Evidence: .omo/evidence/task-8-groq-sentences-obsidian.log
  Commit: Y | feat(obsidian): add two-mode tabs (Due + All Notes)

- [ ] 9. **ObsidianPage: Manual note selection + content display**
  What to do / Must NOT do:
  - При клике на название заметки в "All Notes" табе:
    - Загрузить полное содержание через `getObsidianNote(noteId)` (уже есть в api.ts)
    - Показать полный контент заметки в styled card
    - Заголовок: filename заметки (жирный, крупный)
    - Теги показать мелкими под заголовком
    - Контент заметки: white-space pre-wrap, нормальные отступы
    - Автоматически запустить TTS через `speak(note.content, 'ru')` через 300ms
    - Кнопка "Back to list" для возврата к списку
  - Клавиатура: Escape → back to list
  - Must NOT show grade buttons here (they come in task 10)

  Parallelization: Wave 3 | Blocked by: 8 | Blocks: 10
  References:
  - `frontend/src/pages/ObsidianPage.tsx:56-69` — existing `handleGenerateQuestions` calls `getObsidianNote`
  - `frontend/src/services/api.ts:124-127` — `getObsidianNote(noteId)` API
  - `frontend/src/services/api.ts:2` — `speak` from TTS utility
  Acceptance criteria (agent-executable):
  - Click on filename -> content area shows full note text, title, tags
  - TTS plays within 1 second of content appearing
  - "Back to list" returns to the note list
  QA scenarios: happy: click -> load -> show -> TTS | failure: note load error -> error message + back button
  Evidence: .omo/evidence/task-9-groq-sentences-obsidian.log
  Commit: Y | feat(obsidian): add manual note selection with TTS

- [ ] 10. **ObsidianPage: Review grading for manual selection**
  What to do / Must NOT do:
  - Когда контент заметки показан (после ручного выбора), отобразить кнопки оценки (1-4): Again, Hard, Good, Easy (как в Due-режиме)
  - При оценке: вызвать `logObsidianReview(noteId, rating, timeSeconds)` — уже есть в api.ts
  - После оценки: вернуться к списку заметок (не переходить к следующей автоматически)
  - Показать метку "SRS ON" и сообщение "Review logged"
  - Must NOT use questions/generation in manual mode — только чтение + TTS + оценка
  - Must NOT auto-advance after grading

  Parallelization: Wave 3 | Blocked by: 9 | Blocks: —
  References:
  - `frontend/src/services/api.ts:145-154` — `logObsidianReview(noteId, rating, timeSeconds)`
  - `frontend/src/pages/ObsidianPage.tsx:71-85` — existing handleGrade pattern
  - `frontend/src/styles/theme.ts:54-65` — `btnGrade` style
  - `frontend/src/pages/LanguagePage.tsx:253-264` — "SRS OFF" badge pattern (use "SRS ON" green badge)
  Acceptance criteria (agent-executable):
  - Grade buttons visible when note content is shown
  - Clicking a grade button calls logObsidianReview API
  - After grading -> returns to note list
  QA scenarios: happy: grade -> "Review logged" -> back to list | failure: API error -> error message shown
  Evidence: .omo/evidence/task-10-groq-sentences-obsidian.log
  Commit: Y | feat(obsidian): add FSRS review grading for manual note selection

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] **F1. Plan compliance audit** — verify every Must-Have is delivered, no Must-Not-Have is violated
- [ ] **F2. Code quality review** — TypeScript compiles, Python imports, no lint errors
- [ ] **F3. Automated QA** — run Playwright script that: opens Sentences page → selects language → clicks Generate Sentence → verifies sentence appears → presses Space → verifies translation appears → clicks Next → verifies new sentence. Then opens Obsidian → clicks All Notes → clicks first filename → verifies content shown → clicks grade button → verifies back to list.
- [ ] **F4. Scope fidelity** — LanguagePage/CardDisplay unchanged, no new DB models, no Gemini changes

## Commit strategy
- Task 3: `feat(backend): add groq sentence generation endpoint`
- Task 4: `feat(backend): wire groq router into main app`
- Task 5: `feat(api): add generateSentence function`
- Task 6: `feat(frontend): add SentencePage with Groq-generated sentences`
- Task 7: `feat(frontend): add Sentences nav item`
- Task 8: `feat(obsidian): add two-mode tabs (Due + All Notes)`
- Task 9: `feat(obsidian): add manual note selection with TTS`
- Task 10: `feat(obsidian): add FSRS review grading for manual note selection`

(env changes committed after API key is set)

## Success criteria
1. На странице "Sentences" можно выбрать язык, нажать Generate Sentence — получаете предложение от Groq со случайным словом из due-лексики. Flip показывает перевод. Направление рандомное. Next — новое предложение. Ничего не сохраняется в БД.
2. На странице Obsidian две вкладки. "Due" работает как раньше. "All Notes" показывает только названия заметок. Клик → полный контент + TTS + кнопки оценки. После оценки — FSRS обновлён, возврат к списку.
3. LanguagePage и CardDisplay не изменены.
