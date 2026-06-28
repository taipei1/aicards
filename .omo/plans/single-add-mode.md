# single-add-mode - Work Plan

## TL;DR (For humans)

**What you'll get:** A dedicated "Add Word" page where you can quickly type a word, get an auto-translation via Google Translate, add an example sentence and tags, and save — then immediately type the next word. The form stays open. Navigation and in-page controls are rearranged to be more logical.

**Why this approach:** Separate page keeps the add flow focused (not hidden behind a toggle). Google Translate via `deep-translator` is free and needs no API key. Reusing `hint` field avoids a DB migration.

**What it will NOT do:** No batch add, no auto-language detection, no voice/TTS, no card editing, no removal of the existing inline add on the Learning page, no DB migration.

**Effort:** Short
**Risk:** Low — all changes are additive (new page, new endpoint), existing flows untouched.

**Decisions to sanity-check:** Translation direction (en/sk→ru), nav order (Learning → Emergency → Add Word → All Words → Obsidian → Stats).

Your next move: approve or run a high-accuracy Momus review first.

---

> TL;DR (machine): Short | Low risk | New AddWordPage + auto-translate endpoint + nav/control reorder

## Scope
### Must have
- Backend: new `POST /api/translate` endpoint using `deep-translator` (Google Translate source)
- Frontend: new `AddWordPage` with 4 fields (Word → `front`, Translation → `back` auto-filled, Example → `hint`, Tags → `tags`)
- Language selector on AddWordPage (en/sk) — default matches current language
- Debounced auto-translate on Word field (500ms after last keystroke)
- Manual "Translate" button as fallback
- Sequential add: clear all fields after save, green "Card added!" indicator, form stays open
- Duplicate check (409) — show error inline
- Add "Add Word" nav tab in App.tsx
- Reorder nav: Learning → Emergency → Add Word → All Words → Obsidian → Stats
- Reorder LanguagePage controls: Language select → Tag select → Refresh → Import toggle → N items
- `deep-translator` added to `backend/requirements.txt`

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No batch add (only sequential single add, one at a time)
- No auto-language detection (source/target must be explicit)
- No voice/TTS on AddWordPage
- No card editing on AddWordPage (new cards only)
- No DB migration (hint reused as example)
- No removal of existing inline single-add form on LanguagePage
- No login/auth changes
- No changes to existing review/quiz flow

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after (manual QA via Playwright + curl)
- Evidence: `.omo/evidence/task-N-single-add-mode.{txt,json}`

## Execution strategy
### Parallel execution waves
- **Wave 1** (2 todos, parallel): backend endpoint + frontend api layer
- **Wave 2** (2 todos, sequential): AddWordPage + form, auto-translate integration
- **Wave 3** (2 todos, sequential): nav/control reorder, final verification

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. backend: deep-translator + endpoint | — | 2, 3 | — |
| 2. frontend: api.ts translateWord() | 1 | 3 | — |
| 3. frontend: AddWordPage | 2 | 4 | — |
| 4. frontend: auto-translate integration | 3 | — | — |
| 5. frontend: nav reorder App.tsx | 3 | — | 6 |
| 6. frontend: control reorder LanguagePage | — | — | 5 |
| 7. final verification wave | 1-6 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Backend: add deep-translator + POST /api/translate endpoint
  What to do / Must NOT do:
    - Add `deep-translator` to `backend/requirements.txt` (version: latest stable)
    - Create new file `backend/app/routers/translate.py` with router prefix `/api/translate`
    - Endpoint: `POST /` — accepts `{word: str, source_lang: str, target_lang: str}` → returns `{translated: str, source_lang: str, target_lang: str}`
    - Use `deep_translator.GoogleTranslator(source='...', target='...').translate(word)`
    - Wrap in try/except — on failure return `{translated: null, error: "Translation unavailable"}`
    - Register router in `backend/app/main.py` (app.include_router(translate.router, prefix="/api/translate", tags=["translate"]))
    - Must NOT add any auth/API keys
    - Must NOT modify existing Card model or schemas
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3
  References:
    - Existing router pattern: `backend/app/routers/tts.py` (simple endpoint, no DB, no auth)
    - Router registration: `backend/app/main.py:36-40`
    - deep-translator docs: `https://deep-translator.readthedocs.io/`
  Acceptance criteria (agent-executable):
    - `curl -X POST http://localhost:8000/api/translate -H 'Content-Type: application/json' -d '{"word":"hello","source_lang":"en","target_lang":"ru"}'` returns `{"translated":"привет","source_lang":"en","target_lang":"ru"}`
    - `curl -X POST http://localhost:8000/api/translate -H 'Content-Type: application/json' -d '{"word":"","source_lang":"en","target_lang":"ru"}'` returns 422
    - `curl -X POST http://localhost:8000/api/translate -H 'Content-Type: application/json' -d '{"word":"hello","source_lang":"xx","target_lang":"ru"}'` returns error with status 400 or 422
  QA scenarios:
    - Happy: curl POST with valid params → verify response has `translated` non-null, save to `.omo/evidence/task-1-single-add-mode.json`
    - Failure: curl POST with empty word → verify 422, save to `.omo/evidence/task-1-single-add-mode-error.json`
  Commit: Y | feat(backend): add POST /api/translate endpoint via deep-translator

- [x] 2. Frontend: add translateWord() to api.ts
  What to do / Must NOT do:
    - Add `translateWord(word: string, sourceLang: string, targetLang: string)` async function to `frontend/src/services/api.ts`
    - POST to `/api/translate` with `{word, source_lang, target_lang}` → returns `{translated, source_lang, target_lang}`
    - Handle errors gracefully (return `{translated: null}` on failure)
    - Must NOT modify existing API functions
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3
  References:
    - Existing API functions: `frontend/src/services/api.ts:52-61` (createCard pattern)
    - Function signature pattern: `frontend/src/services/api.ts:14-20`
  Acceptance criteria (agent-executable):
    - Import `translateWord` in a test or console check — function exists and calls `/api/translate`
  QA scenarios:
    - Happy: mock axios post, call translateWord("hello","en","ru") → verify returned shape matches expected
    - Failure: mock axios reject, call translateWord → verify returns `{translated: null}` without throwing
  Commit: Y | feat(frontend): add translateWord() API function

- [x] 3. Frontend: create AddWordPage with 4-field form + sequential add
  What to do / Must NOT do:
    - Create `frontend/src/pages/AddWordPage.tsx`
    - Import and use all existing theme styles from `frontend/src/styles/theme.ts` (input, select, btnPrimary, label, btn)
    - Form fields:
      1. **Word** (front) — text input, required
      2. **Translation** (back) — text input, required, pre-filled by auto-translate
      3. **Example** (hint) — text input, optional, label: "Example sentence"
      4. **Tags** — text input, optional, placeholder "#tag1 #tag2"
    - Language selector (select) — "English" / "Slovak" matching existing
    - On "Add Card" button click:
      - Call `createCard({ front, back, hint, tags, language })` from api.ts
      - Parse tags with `#(\w+)` regex (matching `LanguagePage.tsx:186-188`)
      - On success: clear ALL fields, show green "✓ Card added!" text (matching `importResult` pattern in LanguagePage)
      - On 409 (duplicate): show red error text "Card already exists"
      - On other error: show red error text with error detail
    - Must NOT add card-editing functionality (new cards only)
    - Must NOT add batch add
    - Must NOT add voice/TTS buttons
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 4, 5
  References:
    - Existing form pattern: `LanguagePage.tsx:183-205` (handleSingleImport logic)
    - Theme styles: `frontend/src/styles/theme.ts` (input, select, btnPrimary, btn, label)
    - Tag parsing: `LanguagePage.tsx:186-188`
    - Token parsing regex: `(editTags.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase())`
    - Success indicator pattern: `LanguagePage.tsx:200` (setImportResult('Card added!'))
  Acceptance criteria (agent-executable):
    - Open app → navigate to "Add Word" tab → see 4 fields + language selector + Add Card button
    - Fill word, translation, example, tags → click Add Card → see "✓ Card added!" + empty form
    - Try to add same word again → see red "Card already exists" error
  QA scenarios:
    - Happy: Playwright — navigate to AddWordPage, fill all fields, submit → verify success text + cleared form, evidence to `.omo/evidence/task-3-single-add-mode-happy.png`
    - Failure (duplicate): Playwright — submit same word twice → verify red 409 error, evidence `.omo/evidence/task-3-single-add-mode-duplicate.png`
  Commit: Y | feat(frontend): create AddWordPage with 4-field form and sequential add

- [x] 4. Frontend: integrate auto-translate on AddWordPage
  What to do / Must NOT do:
    - Import `translateWord` from `../services/api.ts`
    - Add `useEffect` with debounce on the Word field value (500ms after last change)
    - On debounce fire: `translateWord(word, cardLanguage, 'ru')` — source=card language (en/sk), target='ru'
    - On response: set Translation field value (only if Translation field is empty or was previously auto-filled — i.e., user hasn't manually edited it)
    - Add a "Translate" button next to the Translation field for manual re-translate
    - If auto-translate fails (null result), leave Translation field empty — user types manually
    - Must NOT auto-fill if user has already typed in the Translation field (respect manual edits)
    - Must NOT add auto-language detection (language is taken from the selector)
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: —
  References:
    - translateWord() API: task 2
    - Translation direction: source=card language (en/sk), target=ru (Russian)
    - Existing debounce pattern: `WordListPage.tsx:33-36` (setTimeout 300ms)
  Acceptance criteria (agent-executable):
    - Open AddWordPage → select English → type "hello" → wait 600ms → Translation field pre-fills with "привет"
    - Manually edit Translation to "здравствуйте" → clear Word → type "cat" → Translation stays "здравствуйте" (user edit respected)
    - Click "Translate" button → Translation re-fills
  QA scenarios:
    - Happy: Playwright — type "hello" in Word, wait → verify Translation is not empty, evidence `.omo/evidence/task-4-single-add-mode-autotranslate.png`
    - Manual edit respected: Playwright — type "hello" → manually edit Translation → type "dog" → verify Translation still has manual edit, evidence `.omo/evidence/task-4-single-add-mode-manual.png`
  Commit: Y | feat(frontend): integrate debounced auto-translate on AddWordPage

- [x] 5. Frontend: add "Add Word" nav tab + reorder navigation
  What to do / Must NOT do:
    - In `frontend/src/App.tsx`:
      - Add `'add-word'` to `type Page` union
      - Add `{ key: 'add-word', label: 'Add Word' }` to navItems array at position 3 (after Emergency, before All Words)
      - Add conditional render: `{currentPage === 'add-word' && <AddWordPage />}`
      - Import `AddWordPage` from `./pages/AddWordPage`
    - Reorder existing navItems from:
      `Learning, All Words, Emergency, Obsidian, Stats`
      → to:
      `Learning, Emergency, Add Word, All Words, Obsidian, Stats`
    - Must NOT break existing navigation (test all existing nav buttons work)
  Parallelization: Wave 3 | Blocked by: 3 | Blocks: — | Can parallelize with: 6
  References:
    - Page type union: `App.tsx:7`
    - Nav items array: `App.tsx:28-34`
    - Conditional renders: `App.tsx:101-105`
  Acceptance criteria (agent-executable):
    - Open app → see nav buttons in order: Learning, Emergency, Add Word, All Words, Obsidian, Stats
    - Click each nav button → correct page renders
  QA scenarios:
    - Happy: Playwright — verify nav button order, screenshot `.omo/evidence/task-5-single-add-mode-nav.png`
    - Regression: Playwright — click each nav button → verify correct heading text, evidence `.omo/evidence/task-5-single-add-mode-regression.png`
  Commit: Y | feat(frontend): add "Add Word" nav tab and reorder navigation

- [x] 6. Frontend: reorder LanguagePage controls
  What to do / Must NOT do:
    - In `frontend/src/pages/LanguagePage.tsx`:
      - Reorder controls div (lines 226-264) from:
        Language select → Tag select → Import/Add button → Refresh → Item count
        → to:
        Language select → Tag select → Refresh → Import/Add button → Item count
      - Move Refresh button (and the wrapping button+styles) before the Import button
      - Must NOT change any functionality, labels, or behavior
      - Must NOT remove the inline add form (stays as-is)
  Parallelization: Wave 3 | Blocked by: — | Blocks: — | Can parallelize with: 5
  References:
    - Controls JSX: `LanguagePage.tsx:226-264`
    - DOM order: `<select language>` → `<select tag>` → `<button Import>` → `<button Refresh>` → `<span items>`
  Acceptance criteria (agent-executable):
    - Open Learning page → see controls in order: Language select, Tag select, Refresh button, Import button, item count
    - All controls still work (change language, filter by tag, refresh, toggle import)
  QA scenarios:
    - Happy: Playwright — verify control order visually, screenshot `.omo/evidence/task-6-single-add-mode-controls.png`
    - Regression: Playwright — change language → verify cards reload; click Import → verify form toggles; click Refresh → verify no error; evidence `.omo/evidence/task-6-single-add-mode-regression.png`
  Commit: Y | chore(frontend): reorder LanguagePage controls

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit — all Scope items implemented, no Must-NOT items present
- [x] F2. Code quality review — TypeScript compiles clean, Python syntax valid
- [x] F3. Real manual QA — curl tests passed, code review passed
- [x] F4. Scope fidelity — LanguagePage inline form preserved, nav order correct

## Commit strategy
3 commits:
1. `feat(backend): add POST /api/translate endpoint via deep-translator`
2. `feat(frontend): create AddWordPage with auto-translate and sequential add`
3. `feat(frontend): add "Add Word" nav tab and reorder navigation/controls`

## Success criteria
- AddWordPage renders with 4 fields, language selector, and Add Card button
- Typing a word auto-fills the translation after 500ms debounce
- User can edit the translation manually without losing it on re-type
- Saving a card clears the form and shows "✓ Card added!"
- Saving a duplicate shows 409 error inline
- Nav shows: Learning, Emergency, Add Word, All Words, Obsidian, Stats
- LanguagePage controls show: Language, Tag, Refresh, Import, item count
- All existing functionality on LanguagePage still works
