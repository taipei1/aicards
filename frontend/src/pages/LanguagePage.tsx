import { useState, useEffect, useCallback } from 'react';
import {
  getCardsDue, getCardsByTag, getAllTags, getDueCounts,
  deleteCard, logReview, logReverseReview, updateCard,
} from '../services/api';
import { CardDisplay } from '../components/CardDisplay';
import { stopSpeaking } from '../utils/tts';
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
  const [items, setItems] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [language, setLanguage] = useState('en');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [loading, setLoading] = useState(false);

  // Edit modal
  const [editingItem, setEditingItem] = useState<QueueItem | null>(null);
  const [editBack, setEditBack] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editTags, setEditTags] = useState('');

  // Stats
  const [sessionStats, setSessionStats] = useState({ total: 0, again: 0, hard: 0, good: 0, easy: 0, reverse: 0 });

  // Due-for-repetition counter for the current deck (motivation badge)
  const [dueCount, setDueCount] = useState<{ normal: number; reverse: number; total: number } | null>(null);

  // Delete failures used to be console-only: the card stayed on screen and the
  // user read it as "the card is stuck". Show it instead.
  const [deleteError, setDeleteError] = useState('');

  const refreshDue = useCallback(async () => {
    try {
      const r = await getDueCounts(language, selectedTag || undefined);
      setDueCount(r[language] || null);
    } catch {
      setDueCount(null);
    }
  }, [language, selectedTag]);

  // Load tags
  useEffect(() => {
    getAllTags(language).then(setTags).catch(() => {});
  }, [language]);

  const loadItems = async () => {
    if (mode === 'emergency' && !selectedTag) {
      setItems([]);
      setCurrentIndex(0);
      return;
    }
    setLoading(true);
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
      setItems(result);
      setCurrentIndex(0);
      setDeleteError('');
      setSessionStats({ total: 0, again: 0, hard: 0, good: 0, easy: 0, reverse: 0 });
    } catch (err) {
      console.error('Failed to load cards:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
    refreshDue();
  }, [language, selectedTag, mode]);

  const handleGrade = useCallback(async (rating: 1 | 2 | 3 | 4, timeSpent: number) => {
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

    try {
      // For reverse cards, use /reviews/reverse endpoint
      if (item.is_reverse) {
        if (mode !== 'emergency') {
          await logReverseReview({ card_id: item.card_id, rating, time_spent_seconds: timeSpent });
        }
      } else {
        if (mode !== 'emergency') {
          await logReview({ card_id: item.id, rating, time_spent_seconds: timeSpent });
        }
      }
    } catch (err: any) {
      // The card is gone (deleted here, in the other deck, or from All Words).
      // Previously the honest 404 was swallowed: the grade did nothing, the card
      // stayed on screen and looked hung until a manual refresh. Drop it and
      // move on, exactly like a successful delete.
      if (err?.response?.status === 404) {
        stopSpeaking();
        const nextItems = [...items];
        nextItems.splice(currentIndex, 1);
        setItems(nextItems);
        setCurrentIndex(Math.min(currentIndex, Math.max(0, nextItems.length - 1)));
        setDeleteError('Эта карточка уже удалена — убрал её из очереди');
        if (nextItems.length === 0) void loadItems();
        return;
      }
      console.error('Failed to log review:', err);
      return;
    }

    if (mode === 'emergency') {
      if (rating === 1) {
        const newItems = [...items];
        const removed = newItems.splice(currentIndex, 1)[0];
        newItems.push(removed);
        setItems(newItems);
      } else {
        if (currentIndex < items.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          setItems(prev => prev.filter((_, i) => i !== currentIndex));
          if (currentIndex >= items.length - 1) setCurrentIndex(Math.max(0, items.length - 2));
        }
      }
    } else {
      if (currentIndex < items.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        await loadItems();
      }
      // Card reviewed → one less due word in this deck
      refreshDue();
    }
  }, [items, currentIndex, mode, language, selectedTag, refreshDue]);

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
        setDeleteError('Не удалось удалить карточку — она осталась в колоде');
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
    setEditBack(item.card_back);
    setEditHint(item.hint || '');
    setEditTags(item.tags.map(t => `#${t}`).join(' '));
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const parsedTags = [...new Set(
        (editTags.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase())
      )];
      await updateCard(editingItem.card_id, { back: editBack, hint: editHint, tags: parsedTags });
      setItems(prev =>
        prev.map(c =>
          c.id === editingItem.id ? { ...c, hint: editHint, tags: parsedTags, card_back: editBack, back: c.is_reverse ? c.card_front : editBack } : c
        )
      );
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

      {/* Delete failure (was console-only, looked like a frozen card) */}
      {deleteError && (
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
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError('')} style={{ ...btn, minHeight: '32px', padding: '2px 8px', fontSize: '0.8rem' }}>
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
      ) : items.length > 0 ? (
        <CardDisplay
          key={items[currentIndex]?.id + '-' + (items[currentIndex]?.is_reverse ? 'rev' : 'norm')}
          item={items[currentIndex]}
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
              <input type="text" value={editBack} onChange={(e) => setEditBack(e.target.value)} style={input} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={label}>Hint:</label>
              <input type="text" value={editHint} onChange={(e) => setEditHint(e.target.value)} style={input} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={label}>Tags:</label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
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
