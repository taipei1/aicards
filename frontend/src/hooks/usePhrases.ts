import { useCallback, useEffect, useRef, useState } from 'react';
import { ensurePhrases, getPhrases } from '../services/api';
import type { Phrase, PhrasesResponse } from '../services/api';

const POLL_MS = 1500;

interface Args {
  enabled: boolean;
  language: string;
  tag?: string;
  cardIds: number[];
}

interface Result {
  phrases: Record<number, Phrase>;
  pending: number[];
  /** Drop a stale phrase after the card's back/hint was edited. */
  invalidate: (cardId: number) => void;
}

/**
 * Keeps phrases for the visible queue without ever blocking the card.
 *
 * `ensure` starts the server-side buffer (current queue + next 50) and returns
 * whatever is already cached. While something is pending we poll only the
 * visible card ids; the card itself never waits for the poll.
 */
export function usePhrases({ enabled, language, tag, cardIds }: Args): Result {
  const [phrases, setPhrases] = useState<Record<number, Phrase>>({});
  const [pending, setPending] = useState<number[]>([]);

  // The array identity changes on every render; the stable key is what should
  // restart the effects. The ref gives the effects the current ids.
  const idsKey = cardIds.join(',');
  const idsRef = useRef<number[]>(cardIds);
  idsRef.current = cardIds;
  const requestIdRef = useRef(0);

  const apply = useCallback((res: PhrasesResponse, requestedIds: number[]) => {
    const requested = new Set(requestedIds);
    const returned = new Set(res.phrases.map((phrase) => phrase.card_id));
    setPhrases((prev) => {
      let changed = false;
      const next = { ...prev };
      // A requested card that is no longer ready (edited card, stale cache,
      // or a backend that lost the row) must fall back to the word instead of
      // showing a phrase that no longer matches the card.
      for (const id of requested) {
        if (!returned.has(id) && id in next) {
          delete next[id];
          changed = true;
        }
      }
      for (const phrase of res.phrases) {
        const existing = next[phrase.card_id];
        const same =
          existing &&
          existing.phrase === phrase.phrase &&
          existing.translation === phrase.translation &&
          existing.target_spans.join('\u0000') === phrase.target_spans.join('\u0000') &&
          existing.translation_spans.join('\u0000') === phrase.translation_spans.join('\u0000');
        if (!same) {
          next[phrase.card_id] = phrase;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setPending(res.pending);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPending([]);
      return;
    }
    const ids = idsRef.current;
    if (ids.length === 0) {
      setPending([]);
      return;
    }

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    ensurePhrases(ids, { language, tag, prefetchNext: true })
      .then((res) => {
        if (!cancelled && requestId === requestIdRef.current) apply(res, ids);
      })
      .catch(() => {
        if (!cancelled && requestId === requestIdRef.current) setPending([]);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, language, tag, idsKey, apply]);

  useEffect(() => {
    if (!enabled || pending.length === 0) return;
    const ids = idsRef.current;
    if (ids.length === 0) return;

    let cancelled = false;
    const tick = () => {
      const requestId = requestIdRef.current;
      getPhrases(ids)
        .then((res) => {
          if (!cancelled && requestId === requestIdRef.current) apply(res, ids);
        })
        .catch(() => {
          // A failed poll is harmless: the card keeps its word fallback.
        });
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, pending.length, idsKey, apply]);

  const invalidate = useCallback(
    (cardId: number) => {
      setPhrases((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      if (!enabled) return;
      const ids = idsRef.current;
      if (ids.length === 0) return;
      // Re-ensure the whole visible queue, not just the edited card: the
      // response also refreshes the pending list, so an earlier ensure that
      // was invalidated cannot leave other cards unpolled.
      const requestId = ++requestIdRef.current;
      ensurePhrases(ids, { language, tag, prefetchNext: false })
        .then((res) => {
          if (requestId === requestIdRef.current) apply(res, ids);
        })
        .catch(() => {});
    },
    [enabled, language, tag, apply]
  );

  return { phrases, pending, invalidate };
}
