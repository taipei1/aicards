# Decisions

## 2026-11-13 — Phrase mode as a Learning-only display layer

**Context.** The user wants to review cards as short AI-generated phrases
instead of bare words, with the card word highlighted in both the target
phrase and the Russian translation, and without ever waiting for generation.
Emergency must stay unchanged.

**Decision.**

- Store one generated phrase per card in `card_phrases`, keyed by `card_id`.
  A `source_hash` over `front/back/hint/language` invalidates the cache when
  the card is edited. The normal and reverse queue items share the phrase.
- Generate asynchronously in a single daemon worker inside the API process.
  `POST /api/phrases/ensure` only reads the cache and enqueues; it never calls
  the model synchronously. The visible queue gets the first 5 priority slots,
  then chunks of 10; the next 50 cards are enqueued immediately at lower
  priority.
- The client shows the original word until the phrase is ready, then silently
  swaps it in. No modal, no placeholder that blocks flipping or grading.
- The model returns exact surface spans (`target_spans`,
  `translation_spans`), validated against the actual strings. The frontend
  renders them as a subtle `<mark>`; the model never returns HTML.
- The mode is available only in Learning. Progress, queue order, timer and
  FSRS calls are untouched.

**Consequences.**

- OmniRoute is the primary model path through the existing
  `chat_completion_ex` gateway; the existing Groq fallback still applies when
  OmniRoute is unreachable.
- A single-word card stays in the 2-4 word window. A card that is already a
  3+ word expression is kept whole and may gain up to two context words.
- Failed or repeatedly invalid cards get a five-minute cooldown and fall back
  to the word; a later ensure/status can retry them.

**Rejected alternatives.**

- Synchronous generation on card open: violates the no-wait requirement.
- Storing the phrase on `cards`: pollutes the source card and complicates
  normal/reverse reuse and invalidation.
- Client-side HTML from the model: unsafe and hard to keep aligned with the
  actual text.

## 2026-11-13 — Slovak deck freeze: bounded auth/DB and race-safe loading

**Context.** Switching to the Slovak deck left the UI on "Loading..." and the
whole backend stopped answering (nginx 504 after 420 s). A `py-spy` dump showed
the only active thread inside `auth_gate -> token_is_valid -> Query.first`, i.e.
an async middleware was running a blocking DB query on the event loop and that
query never returned. The Slovak deck is 4399 cards vs 811 for English, which
made the per-card review-count N+1 worse but was not the freeze itself.

**Decision.**

- `auth_gate` calls `token_is_valid` through `run_in_threadpool`; a slow DB
  check can no longer block unrelated requests.
- Valid tokens are cached in-process for 30 s (never past token expiry); logout
  evicts immediately. This removes one remote DB round-trip from almost every
  API request.
- The SQLAlchemy engine uses `pool_pre_ping`, `pool_recycle=300`,
  `pool_timeout=10`, `connect_timeout=10` and server-side
  `statement_timeout=20s` / `idle_in_transaction_session_timeout=60s`, so a
  stale Azure connection fails fast instead of hanging forever.
- Queue/search/by-tag review counts use one grouped query; `/tags` selects only
  the `tags` column instead of hydrating every card.
- The frontend guards queue/count responses with a request sequence, always
  clears loading in `finally`, and shows an error with `Retry`; queue calls have
  explicit 30–60 s timeouts.

**Consequences.** A dead connection now produces a bounded error (and a retry
path) instead of freezing the whole app. Local timings after the change:
Slovak `/due` 0.22 s direct / ~0.33 s through nginx; 24 concurrent en/sk queue
requests all 200 with max 0.97 s.

**Rejected.** Raising the nginx timeout (only hides the freeze); relying on a
container restart (temporary); caching tokens forever (breaks logout/expiry);
moving the whole API to sync endpoints (too broad for this fix).

## 2026-11-13 — Concretize multiword phrase cards instead of repeating them

**Context.** For cards that were already a full phrase/sentence, phrase mode
kept the card verbatim (`Nefunguje mi to.` → `Nefunguje mi to`), so it added no
new context and looked broken. The useful transformation is to turn the
generic placeholder into a concrete example (`Nefunguje mi počítač.`).

**Decision.**

- For 3+ word cards the prompt asks the model to replace one generic
  placeholder pronoun (`to`, `toto`, `niečo`, `it`, `this`, `something`, ...)
  with a concrete noun or short noun phrase, keeping the rest of the sentence
  unchanged.
- Validation accepts spans that cover only the stable core (card words minus
  replaceable placeholders), but requires the phrase to keep at least the
  original word count.
- A swap is allowed only when no other word has to change. A deterministic
  guard keeps grammar-sensitive patterns whole: predicate `To je ... ono.`
  and neuter past-tense constructions (`Podarilo sa mi to.`, `Stalo sa to.`).
- On a validation failure the retry runs in "keep whole" mode; the original
  expression (optionally plus two context words) is a valid cached answer.
- `max_words` is passed explicitly per card, and `source_hash` includes
  `PHRASE_PROMPT_VERSION`, so prompt changes invalidate stale cache entries.

**Consequences.** `Nefunguje mi to.` becomes `Nefunguje mi počítač.` with
spans `["Nefunguje mi"]` / `["не работает"]`. Grammar-sensitive cards stay
whole but still get context instead of disappearing. A failed rephrase no
longer leaves the card without a phrase.

**Rejected.** Accepting every model rephrase (produced broken agreement such as
`Podarilo sa mi skúška`); forcing concretization for every sentence (breaks
fixed expressions); leaving failed cards uncached until the next cooldown.

## 2026-11-13 — Grade optimistically and attribute generated phrases

**Context.** Pressing a grade button awaited `POST /api/reviews` before moving
to the next card. Locally the request took ~0.5 s, so the screen looked frozen
right after the press. Separately, generated phrases had no indication of which
model produced them, while the examples/analysis blocks already had one.

**Decision.**

- `handleGrade` advances the queue synchronously; the review request runs in
  the background. A 404 or a failed save is reported through the existing action
  banner instead of leaving the old card on screen.
- Queue refill at the end also happens in the background, so the last grade
  never blocks on a fetch.
- The phrase card shows `model (phrase): <model>` using the `model` field
  already returned by `/api/phrases/status`. It is hidden when the phrase is
  not ready, because the fallback word was not generated.
- Key auto-repeat is ignored for grading and the More shortcut, so holding a
  key cannot grade several cards in one press.

**Consequences.** Measured with Playwright: the next card appears in ~12 ms
while the review request finishes in ~491 ms in the background; the review is
still persisted (`POST /api/reviews/reverse` → 200). The model label makes the
actual (including fallback) model visible under the phrase.

**Rejected.** Keeping the await and adding a spinner (still blocks the next
card); dropping failed reviews silently (loses FSRS progress without feedback).

## 2026-11-14 — Route phrases through a dedicated OmniRoute combo

**Context.** The server profile stored in the DB pointed at the VPS OmniRoute
(`91.184.253.167:20128`), which no longer answers. Every chat request timed out
and silently used the Groq fallback (`openai/gpt-oss-120b`), so phrase quality
was stuck at the weakest available model. Separately, the phrase prompt itself
suggested `To je presne ono, čo som hľadal.` (7 words) for a 4-word card while
validation capped the phrase at `card + 2` = 6 words, forcing a retry on
exactly the example the model was told to produce.

**Decision.**

- The DB server profile now points at the local OmniRoute
  (`http://host.docker.internal:20128/v1`) and uses the combo
  `aicards-phrase` (strategy `priority`):
  `gemini/gemini-3.6-flash` → `nvidia/nvidia/nemotron-3-ultra-550b-a55b` →
  `bluesminds/nvidia/nemotron-3-ultra-550b-a55b`.
- The combo was created through `/api/combos`; a throwaway combo with a dead
  first model confirmed that `priority` really falls through to the next
  entry instead of failing the request.
- `max_phrase_words(front)` is shared by the prompt payload and the validator:
  `4` for 1–2 word cards, otherwise `front_units + 3`. `PHRASE_PROMPT_VERSION`
  is bumped to `8`, so every previously cached phrase is treated as stale and
  regenerated by the background worker.

**Consequences.** The phrase label now shows `gemini-3.6-flash` (the model
that actually answered). On the 10-card probe (7 Slovak + 3 English) the combo
answered in 21.5 s / 10.5 s and passed 9/10 on the first pass; the single
failure was a 7-word answer that the v8 limit now accepts.

**Rejected.** Keeping the VPS as primary (unreachable, so all generation ran on
Groq); adding untested "strong" models to the combo (`gpt-5.5` and `qwen3.8-max`
timed out, Claude endpoints returned Cloudflare 403, several NVIDIA models 404).

## 2026-11-15 — Design system as the control plane, not longer prompts

**Context.** Every AI-assisted UI change adds buttons whose colors do not match
the rest of the app. The frontend has 311 inline style objects and 15 hex
literals in TSX; three different ambers encode the same "almost correct" state.
`btnPrimary` is used for both Save and Cancel. Inline styles cannot express
`:hover`, `:focus-visible` or `:disabled`, so a global `button:hover { opacity:
.8 }` dims primary actions too.

**Decision.**

- Treat `docs/design-consistency.md` as the reference: context (`DESIGN.md`),
  semantic tokens, a closed component API, automated lint plus visual snapshots,
  and one owner for the "no new color" rule.
- Raw hex is legal only in `tokens.css`. Everything else uses `var(--token)`.
- Interactive elements use `components/ui/*` (`Button` variants `primary`,
  `secondary`, `ghost`, `danger`, `danger-ghost`); pages do not style buttons.
- `npm run lint:design` (ESLint hex-in-inline-style + Stylelint `color-no-hex`)
  is the enforcement point; warnings first, then errors.
- Scope stays pre-PMF: ~5–8 primitives, one `/styleguide`, two screenshots. No
  Storybook, Chromatic or a component registry yet.

**Consequences.** Migration is incremental: tokens first, then Button and the
pages that drift most (`WordListPage`, `CardDisplay`, `StatsPage`,
`LanguagePage`, `SettingsPage`), then the lint gate. Until the pages are
migrated, the lint rule stays at `warn` so the agent still has a legal path.

**Rejected.** Longer prompts ("keep the design consistent") without a
machine-checked constraint; adopting Tailwind or a full component library just
for tokens; installing Impeccable in CI before reviewing its install hook and
telemetry.
