import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getCardsDue, getCardsByTag, getAllTags, getDueCounts,
  deleteCard, logReview, logReverseReview, updateCard,
} from '../services/api';
import { CardDisplay } from '../components/CardDisplay';
import { stopSpeaking, prefetchSpeech, cardSpeechLang } from '../utils/tts';
import { useLanguage } from '../context/LanguageContext';
import { usePhrases } from '../hooks/usePhrases';
import { normalizeSpaces, trimSpaces } from '../utils/text';
import type { Card, QueueItem } from '../types';
import { select, input, label, overlay, modal, btnPrimary, btn } from '../styles/theme';

interface Props {
  mode: 'normal' | 'emergency';
  onNavigate?: (page: string) => void;
  /** False while this page is hidden by App.tsx — it stays mounted but must not
   *  react to global keyboard shortcuts (otherwise one Delete hit removes a card
   *  in this deck AND in the visible one). */
  isVisible?: boolean;
}

export function LanguagePage({ mode, onNavigate, isVisible = true }: Props) {
  const { language, setLanguage } = useLanguage();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Language switches fire overlapping requests. Only the newest one is
  // allowed to touch the queue/count state, otherwise an old (slow) English
  // response could land after the Slovak one and show the wrong deck.
  const loadSeq = useRef(0);
  const dueSeq = useRef(0);

  // Phrase mode is a Learning-only display layer. Emergency keeps the plain
  // word even if the preference was left on.
  const [phraseMode, setPhraseMode] = useState<boolean>(() => {
    if (mode !== 'normal') return false;
    return localStorage.getItem('aicards_phrase_mode') === '1';
  });

  useEffect(() => {
    if (mode !== 'normal') return;
    localStorage.setItem('aicards_phrase_mode', phraseMode ? '1' : '0');
  }, [phraseMode, mode]);

  // Edit modal
  const [editingItem, setEditingItem] = useState<QueueItem | null>(null);
  const [editBack, setEditBack] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editTags, setEditTags] = useState('');

  // Stats
  const [sessionStats, setSessionStats] = useState({ total: 0, again: 0, hard: 0, good: 0, easy: 0, reverse: 0 });

  // Due-for-repetition counter for the current deck (motivation badge)
  const [dueCount, setDueCount] = useState<{ normal: number; reverse: number; total: number } | null>(null);

  // Phrase mode: one generated phrase per card, shared by its normal and
  // reverse queue items. The hook owns the cache/polling; the queue itself is
  // untouched.
  const phraseCardIds = useMemo(() => {
    const seen = new Set<number>();
    for (const item of items) seen.add(item.card_id);
    return Array.from(seen);
  }, [items]);

  const {
    phrases,
    invalidate: invalidatePhrase,
  } = usePhrases({
    // Stop polling while another tab is open; the backend worker keeps the
    // already-enqueued reserve, and the hook re-ensures when we return.
    enabled: mode === 'normal' && phraseMode && isVisible,
    language,
    tag: selectedTag || undefined,
    cardIds: phraseCardIds,
  });

  const currentItem = items[currentIndex];
  const currentPhrase =
    mode === 'normal' && phraseMode && currentItem
      ? phrases[currentItem.card_id]
      : undefined;

  // Action failures (delete/grade) used to be console-only: the card stayed
  // on screen and the user read it as "the card is stuck". Show them instead.
  const [actionError, setActionError] = useState('');

  const refreshDue = useCallback(async () => {
    const seq = ++dueSeq.current;
    try {
      const r = await getDueCounts(language, selectedTag || undefined);
      if (seq === dueSeq.current) setDueCount(r[language] || null);
    } catch {
      if (seq === dueSeq.current) setDueCount(null);
    }
  }, [language, selectedTag]);

  // Load tags (ignore the response if the language changed meanwhile)
  useEffect(() => {
    let cancelled = false;
    getAllTags(language)
      .then((list) => {
        if (!cancelled) setTags(list);
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const loadItems = useCallback(async () => {
    if (mode === 'emergency' && !selectedTag) {
      loadSeq.current += 1; // cancel any request still in flight
      setItems([]);
      setCurrentIndex(0);
      setLoading(false);
      setLoadError('');
      return;
    }

    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError('');
    try {
      let result: QueueItem[];
      if (mode === 'emergency' && selectedTag) {
        // For emergency mode — get cards by tag, wrap as QueueItem
        const cards = await getCardsByTag(language, selectedTag);
        result = cards.map(c => ({
          id: c.id,
          front: c.front,
          back: c.back,
          hint: c.hint,
          tags: c.tags,
          language: c.language,
          stability: c.stability,
          difficulty: c.difficulty,
          last_reviewed: c.last_reviewed,
          review_count: c.review_count || 0,
          is_reverse: false,
          card_id: c.id,
          card_front: c.front,
          card_back: c.back,
        }));
      } else {
        result = await getCardsDue(language, selectedTag || undefined, 50);
      }
      // A newer load (e.g. language switch) has taken over — drop this answer.
      if (seq !== loadSeq.current) return;
      setItems(result);
      setCurrentIndex(0);
      setActionError('');
      setSessionStats({ total: 0, again: 0, hard: 0, good: 0, easy: 0, reverse: 0 });
    } catch (err: any) {
      if (seq !== loadSeq.current) return;
      console.error('Failed to load cards:', err);
      // Never leave the previous deck on screen under the new language, and
      // never hang on "Loading..." forever.
      setItems([]);
      setCurrentIndex(0);
      setLoadError(
        err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT'
          ? 'Сервер не ответил вовремя — попробуйте ещё раз'
          : 'Не удалось загрузить карточки — проверьте соединение и попробуйте снова',
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [language, selectedTag, mode]);

  useEffect(() => {
    loadItems();
    refreshDue();
  }, [loadItems, refreshDue]);

  // Warm the audio for the next few *unique* words while the current card is
  // still on screen. The queue contains normal + reverse pairs of the same
  // word, so slicing by position alone wastes prefetch slots on duplicates.
  useEffect(() => {
    if (!isVisible || items.length === 0) return;
    const seen = new Set<string>();
    for (const it of items.slice(currentIndex, currentIndex + 8)) {
      // In phrase mode the card reads a whole phrase; pre-warm that instead of
      // the bare word so the first replay is instant.
      const phraseText = phraseMode ? phrases[it.card_id]?.phrase : undefined;
      const text = phraseText || (it.is_reverse ? it.back : it.front);
      const lang = cardSpeechLang(it.language);
      const key = `${lang}\u0000${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      prefetchSpeech(text, lang);
      if (seen.size >= 5) break;
    }
  }, [items, currentIndex, isVisible, phraseMode, phrases]);

  const handleGrade = useCallback((rating: 1 | 2 | 3 | 4, timeSpent: number) => {
    const item = items[currentIndex];
    if (!item) return;

    setSessionStats(prev => ({
      ...prev,
      total: prev.total + 1,
      again: prev.again + (rating === 1 ? 1 : 0),
      hard: prev.hard + (rating === 2 ? 1 : 0),
      good: prev.good + (rating === 3 ? 1 : 0),
      easy: prev.easy + (rating === 4 ? 1 : 0),
      reverse: prev.reverse + (item.is_reverse ? 1 : 0),
    }));

    // Advance BEFORE the network call. Awaiting /reviews here made every press
    // feel like a micro-freeze: the old card stayed on screen until the
    // round-trip finished, so the button looked stuck.
    if (mode === 'emergency') {
      if (rating === 1) {
        const newItems = [...items];
        const removed = newItems.splice(currentIndex, 1)[0];
        newItems.push(removed);
        setItems(newItems);
      } else if (currentIndex < items.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setItems(prev => prev.filter((_, i) => i !== currentIndex));
        setCurrentIndex(Math.max(0, items.length - 2));
      }
      return;
    }

    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Queue exhausted on screen: refill in the background. `loadItems`
      // shows its own loading state instead of freezing the old card.
      void loadItems();
    }

    // Persist the review in the background. The UI is already on the next card.
    const review = {
      card_id: item.is_reverse ? item.card_id : item.id,
      rating,
      time_spent_seconds: timeSpent,
    };
    const request = item.is_reverse
      ? logReverseReview(review)
      : logReview(review);
    request
      .catch((err: any) => {
        if (err?.response?.status === 404) {
          // Already deleted here, in the other deck, or from All Words. The
          // card is off-screen now, so just report it instead of putting it
          // back.
          setActionError('Эта карточка уже удалена — оценка не сохранена');
          return;
        }
        console.error('Failed to log review:', err);
        setActionError('Не удалось сохранить оценку — проверьте соединение');
      })
      // Refresh after the review is persisted, so the due badge does not race
      // the write and show the pre-review count.
      .finally(() => {
        void refreshDue();
      });
  }, [items, currentIndex, mode, loadItems, refreshDue]);

  // Deleting the current card must both drop it from the queue AND restart the
  // card's timer: filtering the array alone keeps currentIndex pointing at the
  // next card, which then renders with the previous card's dead 0s timer —
  // that is the "card hangs / changes only on refresh" bug. Splice + bump the
  // current index remounts CardDisplay (its key includes index-driven item id),
  // which resets the countdown and starts a fresh auto-speak.
  const handleDelete = async () => {
    const item = items[currentIndex];
    if (!item) return;

    if (!confirm(`Delete "${item.front}"?`)) return;

    try {
      await deleteCard(item.card_id);
    } catch (err: any) {
      // 404 = already gone (e.g. a duplicate key press); treat as deleted
      if (err?.response?.status !== 404) {
        console.error('Failed to delete card:', err);
        setActionError('Не удалось удалить карточку — она осталась в колоде');
        return;
      }
    }

    stopSpeaking();
    const nextItems = [...items];
    nextItems.splice(currentIndex, 1);
    // Index stays put: the following card slides into the same slot, and the
    // last card wraps back to the previous one instead of pointing past the end.
    const nextIndex = Math.min(currentIndex, Math.max(0, nextItems.length - 1));
    setItems(nextItems);
    setCurrentIndex(nextIndex);
    refreshDue();

    // Queue exhausted on screen: refill instead of leaving the user on an
    // "items: 0" screen (the virtualized <Select a tag to start / No cards due>
    // branch). Normal mode refetches the due queue; emergency re-reads the tag.
    if (nextItems.length === 0) {
      void loadItems();
    }
  };

  const handleEdit = (item: QueueItem) => {
    setEditingItem(item);
    setEditBack(normalizeSpaces(item.card_back));
    setEditHint(normalizeSpaces(item.hint || ''));
    setEditTags(item.tags.map(t => `#${t}`).join(' '));
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const parsedTags = [...new Set(
        (editTags.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase())
      )];
      const cleanBack = trimSpaces(editBack);
      const cleanHint = trimSpaces(editHint);
      await updateCard(editingItem.card_id, { back: cleanBack, hint: cleanHint, tags: parsedTags });
      setItems(prev =>
        prev.map(c =>
          c.id === editingItem.id ? { ...c, hint: cleanHint, tags: parsedTags, card_back: cleanBack, back: c.is_reverse ? c.card_front : cleanBack } : c
        )
      );
      // The generated phrase was based on the old back/hint. Drop it and let
      // the hook re-enqueue this card while the user continues reviewing.
      invalidatePhrase(editingItem.card_id);
      setEditingItem(null);
    } catch (err) {
      console.error('Failed to update card:', err);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
        {mode === 'emergency' ? 'Emergency Repetition' : 'Language Learning'}
      </h2>

      {/* Controls */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} style={select}>
          <option value="en">English</option>
          <option value="sk">Slovak</option>
        </select>

        {mode === 'normal' && (
          <button
            onClick={() => setPhraseMode((value) => !value)}
            title="Show generated phrases instead of bare words"
            style={{
              ...btn,
              background: phraseMode ? 'var(--accent)' : 'var(--bg-primary)',
              borderColor: phraseMode ? 'var(--accent)' : 'var(--border-primary)',
              color: phraseMode ? 'var(--text-on-accent)' : 'var(--text-primary)',
            }}
          >
            Phrases {phraseMode ? 'ON' : 'OFF'}
          </button>
        )}

        <select
          value={selectedTag}
          onChange={(e) => setSelectedTag(e.target.value)}
          style={{ ...select, width: 'auto' }}
        >
          <option value="">All tags</option>
          {tags.map(t => <option key={t} value={t}>#{t}</option>)}
        </select>

        <button onClick={loadItems} style={btn}>
          Refresh
        </button>

        {dueCount !== null && (
          <span
            title={`Due: ${dueCount.normal} normal · ${dueCount.reverse} reverse`}
            style={{
              ...btn,
              cursor: 'default',
              color: dueCount.total > 0 ? 'var(--text-danger)' : 'var(--text-secondary)',
              borderColor: dueCount.total > 0 ? 'var(--text-danger)' : 'var(--border-primary)',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
            }}
          >
            Due: {dueCount.total}
          </span>
        )}

        {mode === 'emergency' && (
          <span style={{
            color: 'var(--text-danger)',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            padding: '2px 8px',
            border: '1px solid var(--text-danger)',
            borderRadius: '4px',
          }}>
            SRS OFF
          </span>
        )}
      </div>

      {/* Action failure (was console-only, looked like a frozen card) */}
      {actionError && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          border: '1px solid var(--text-danger)',
          borderRadius: '4px',
          color: 'var(--text-danger)',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} style={{ ...btn, minHeight: '32px', padding: '2px 8px', fontSize: '0.8rem' }}>
            OK
          </button>
        </div>
      )}

      {/* Session info */}
      <div style={{
        marginBottom: '12px',
        color: 'var(--text-secondary)',
        fontSize: '0.9rem',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
      }}>
        <span>Item {currentIndex + 1} of {items.length}</span>
        {sessionStats.total > 0 && (
          <span>
            Session: {sessionStats.total} reviewed
            {sessionStats.reverse > 0 && ` | Reverse: ${sessionStats.reverse}`}
            {sessionStats.again > 0 && ` | Again: ${sessionStats.again}`}
            {sessionStats.hard > 0 && ` Hard: ${sessionStats.hard}`}
            {sessionStats.good > 0 && ` Good: ${sessionStats.good}`}
            {sessionStats.easy > 0 && ` Easy: ${sessionStats.easy}`}
          </span>
        )}
      </div>

      {/* Card display */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text-danger)', marginBottom: '12px' }}>{loadError}</p>
          <button onClick={() => { loadItems(); refreshDue(); }} style={btnPrimary}>Retry</button>
        </div>
      ) : items.length > 0 ? (
        <CardDisplay
          key={currentItem?.id + '-' + (currentItem?.is_reverse ? 'rev' : 'norm')}
          item={currentItem}
          phrase={currentPhrase}
          onGrade={handleGrade}
          onDelete={handleDelete}
          onEdit={handleEdit}
          isVisible={isVisible}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          <p>{mode === 'emergency' ? 'Select a tag to start' : 'No cards due for review'}</p>
          {mode === 'normal' && (
            <button onClick={() => onNavigate?.('add-word')} style={{ ...btnPrimary, marginTop: '12px' }}>
              Go to Add Word
            </button>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editingItem && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ marginBottom: '12px', color: 'var(--text-primary)' }}>Edit Card</h3>
            <div style={{ marginBottom: '10px' }}>
              <label style={label}>Front:</label>
              <div style={{
                padding: '8px',
                background: 'var(--bg-muted)',
                borderRadius: '4px',
                fontSize: '1.05rem',
                color: 'var(--text-primary)',
              }}>
                {editingItem.card_front}
                {editingItem.is_reverse && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '8px' }}>(reverse)</span>}
              </div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={label}>Back (RU):</label>
              <input type="text" value={editBack} onChange={(e) => setEditBack(e.target.value)} onBlur={() => setEditBack((v) => trimSpaces(v))} style={input} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={label}>Hint:</label>
              <input type="text" value={editHint} onChange={(e) => setEditHint(e.target.value)} onBlur={() => setEditHint((v) => trimSpaces(v))} style={input} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={label}>Tags:</label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                onBlur={() => setEditTags((v) => trimSpaces(v))}
                placeholder="#tag1 #tag2"
                style={input}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSaveEdit} style={btnPrimary}>Save</button>
              <button onClick={() => setEditingItem(null)} style={{ ...btnPrimary, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts */}
      <div style={{ marginTop: '20px', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
        Space: flip | 1-4: grade | R: replay | D: delete | T: type | M: more
        {mode === 'emergency' && ' | Again=1 stays in queue'}
      </div>
    </div>
  );
}
