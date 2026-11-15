# Phrase mode for Learning

**Status:** implementation
**Scope:** Learning page only. Emergency is explicitly out of scope.

## Goal

In Learning, replace the plain word on a review card with a short, natural
phrase in the studied language. The phrase is generated from the card's
existing `front`, `back` and `hint` through the configured OmniRoute chat
model. Both sides of the card become phrases: the target-language phrase and
its Russian translation. The card word (or its inflected form) is highlighted
on whichever side it appears.

The mode is a display layer. It must not change the queue, the card order,
`Item N of M`, the timer, grading, or FSRS state.

## UX

- A `Phrases` toggle appears next to the language/tag controls in Learning.
  The choice is stored in `localStorage`.
- Normal card: front = target phrase, back = Russian translation.
- Reverse card: front = Russian translation, back = target phrase.
- The card word can be inflected. The model returns the exact surface form(s)
  it used, so the highlight follows the actual text, not the dictionary form.
- Multi-word cards and separable phrasal verbs may produce several spans.
- Highlighting is semantic and non-invasive: `<mark>` with a soft accent
  background/underline. The model never returns HTML.
- If a phrase is not ready yet, the card falls back to the existing word and
  is replaced silently when the phrase arrives. Flipping, grading and the
  timer stay available the whole time.
- TTS speaks the target-language phrase when it is available (otherwise the
  word), so audio does not read Russian on a normal card.
- Under the card, a small caption shows the actual model that generated the
  phrase (`model (phrase): ...`), including the fallback model. It is hidden
  when the card still shows its bare word.

## Data

New table `card_phrases`:

| column | meaning |
| --- | --- |
| `card_id` | unique FK to `cards.id`, cascade delete |
| `phrase` | target-language phrase |
| `translation` | Russian translation |
| `target_spans` | exact substrings of `phrase` to highlight |
| `translation_spans` | exact substrings of `translation` to highlight |
| `source_hash` | hash of `front/back/hint/language` plus the prompt version |
| `model` | actual model that answered |
| `created_at`, `updated_at` | timestamps |

One phrase per card. Editing the card changes `source_hash`, so the next
ensure call treats the phrase as stale and regenerates it. Bumping
`PHRASE_PROMPT_VERSION` in `phrase_service.py` invalidates every cached phrase
after a prompt/validation change.

## API

All endpoints are under `/api/phrases` and use the existing auth gate.

- `POST /api/phrases/ensure`
  - body: `{card_ids, language, tag?, prefetch_next?}`
  - returns cached phrases and the ids that are queued/in-flight;
  - enqueues missing ids in the background;
  - when `prefetch_next` is true, also enqueues the next 50 cards from the
    same deck/tag (ordered by stability, excluding the current ids).
  - Never generates synchronously.
- `POST /api/phrases/status`
  - body: `{card_ids}`
  - returns cached phrases plus pending ids; used for polling.

## No-wait pipeline

- Persistent DB cache. A reviewed card is instant on later visits.
- Opening a queue enqueues the current unique card ids and immediately the
  next 50 cards for the same language/tag.
- The background worker is a single daemon thread inside the backend, no new
  infrastructure. It receives prioritized chunks:
  - priority 0: first 5 cards of the visible queue (current card first);
  - priority 1: the rest of the visible queue, chunks of 10;
  - priority 2: the next 50, chunks of 10.
- The client polls only the visible queue's ids every 1.5 s while something is
  pending. Progress and queue length are untouched.
- A model failure leaves the card on its word fallback. The failed card gets a
  short cooldown; a later ensure can retry it. No modal, no blocking.
- The same card is shared by its normal and reverse queue items, so one
  generated phrase serves both orientations.

## Prompt contract

Input per card: `id`, `word`, `translation`, `hint`. For a chunk the model
gets the studied language and a JSON array. Output is a JSON array:

```json
[{
  "id": 123,
  "phrase": "take off your shoes",
  "translation": "сними обувь",
  "target_spans": ["take", "off"],
  "translation_spans": ["сними"],
  "target_lemma": "take off"
}]
```

Rules enforced by the prompt and validated in code:

- phrase is a natural 2-4 word collocation for a single word, not a long
  sentence;
- the card word/expression must appear, inflected forms are allowed;
- do not replace it with a synonym;
- if the card is already a phrase/sentence of 3+ words, do not repeat it
  verbatim: keep the construction and replace a generic placeholder pronoun
  (`to`, `toto`, `niečo`, `it`, `this`, `something`, ...) with one concrete
  noun or short noun phrase. Example: `Nefunguje mi to.` →
  `Nefunguje mi počítač.`, highlighted spans `["Nefunguje mi"]`;
- a swap is allowed only when every other word can stay unchanged. If it
  would change gender/number/case/verb agreement, or the placeholder is the
  predicate after `je/sú` (`To je presne ono.`), keep the card whole and add
  a short context clause instead;
- phrase length for a 3+ word card is between the card length and
  `max_words` (card + 3), and `max_words` is passed explicitly per card. The
  extra word over the old `card + 2` rule exists because the prompt's own
  fallback example (`To je presne ono, čo som hľadal.`) needs three context
  words; validation must not reject the example it suggests;
- if the first answer fails validation, the retry runs in "keep whole" mode:
  the original expression itself (optionally plus context) is a valid answer,
  so the card never stays without a cached phrase;
- spans must literally occur in `phrase` / `translation`;
- `target_lemma`, when present, must match the card `front` (case-insensitive,
  whitespace-normalized).

Parsing is tolerant: fenced JSON, whole arrays, arrays under a wrapper key,
and object-by-object recovery are accepted. Invalid/missing items are retried
once; if they still fail, the card keeps its word fallback.

## Acceptance checks

- Toggle off: exact current behavior.
- Toggle on: both sides show phrases; the card word/equivalent is highlighted
  in the target phrase and in the Russian translation, including inflected
  forms.
- Reverse cards mirror correctly.
- A multiword card is concretized (`Nefunguje mi to.` → `Nefunguje mi
  počítač.`) when the swap is grammatically safe; otherwise it stays whole
  and gains context, never a broken agreement.
- If both attempts fail, the retry still caches the original expression, so
  the card keeps a phrase instead of falling back to bare text.
- `Item N of M`, due counter, order, timer and FSRS values are unchanged.
- A missing phrase never blocks a flip or a grade; it appears without a
  remount or timer reset.
- A displayed phrase carries a visible `model (phrase): ...` caption.
- Pressing `1–4` advances immediately; the review request completes in the
  background and a failure is reported without freezing the card.
- Queue open enqueues current + next 50; a second visit is instant from cache.
- Emergency page has no Phrases toggle and never uses phrases.
- Backend unit tests and `npm run build` pass.
