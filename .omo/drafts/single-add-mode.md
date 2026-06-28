# single-add-mode - Draft

Status: awaiting-approval → approved
Approval timestamp: granted by user

## Decisions (recorded with defaults where user didn't specify)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Translation direction | source=card language (en/sk) → target=ru | Matches existing pattern (front=target word, back=Russian) |
| Translation trigger | Debounced 500ms after last keystroke + manual button | No extra UI complexity |
| Translation lib | `deep-translator` GoogleTranslate source | Free, no API key, lightweight |
| Endpoint contract | `POST /api/translate {word, source_lang, target_lang} → {translated, source_lang, target_lang}` | Clean, explicit |
| Example field | Reuse `hint` (no migration) | Accepted by user |
| Placement | New dedicated page in nav | Accepted by user |
| Nav order | Learning → Emergency → Add Word → All Words → Obsidian → Stats | Learning activities grouped first, then content, then tools |
| LanguagePage controls | Reorder: Language select → Tag select → Refresh (moved) → Import toggle → N items | Refresh after filters, Import after refresh, count last |
| Sequential add UX | Clear ALL fields, green "Card added!" text (like existing importResult), stay on page | Matches existing UX pattern |
| Duplicate handling | Show 409 error inline from backend (existing behavior) | Works as-is |
| Translate on failure | Show "Translation unavailable" in field, user types manually | Graceful degradation |
| Success indicator | Inline green text "✓ Card added!" matching existing pattern | Consistency |
| LanguagePage single-add | Stays as-is (inline form + CSV) | Accepted by user |

## Components ledger

| # | Component | Outcome | Status |
|---|-----------|---------|--------|
| 1 | Backend: POST /api/translate | Add route in new translate.py | planned |
| 2 | Backend: dependency | + deep-translator to requirements.txt | planned |
| 3 | Frontend: AddWordPage | New page with 4 fields + autoranslate + sequential add | planned |
| 4 | Frontend: api.ts | + translateWord() | planned |
| 5 | Frontend: App.tsx nav | + Add Word tab, reorder | planned |
| 6 | Frontend: LanguagePage controls | Reorder controls | planned |

## Scope

### Must have
- New `POST /api/translate` endpoint using deep-translator GoogleTranslate
- New AddWordPage with 4 fields: Word, Translation (auto-filled), Example, Tags
- Language selector on AddWordPage (same en/sk as existing)
- Debounced auto-translate on Word field (500ms)
- Manual translate button as fallback
- Sequential add: clear form after successful save, green "Card added!" indicator
- Duplicate check (409) — show error inline
- Add "Add Word" nav tab, reorder nav
- Reorder LanguagePage controls

### Must NOT have
- No batch add (only sequential single add)
- No auto-language detection
- No voice/TTS on AddWordPage
- No card editing on AddWordPage (new cards only)
- No DB migration
- No login/auth changes
- No removal of existing inline add form on LanguagePage

## Key dependencies
- Task 1 (backend: endpoint) ← install deep-translator first
- Task 2 (frontend: page + form) ← needs api.translateWord() from task 1
- Task 3 (frontend: nav + reorder) ← needs AddWordPage from task 2
