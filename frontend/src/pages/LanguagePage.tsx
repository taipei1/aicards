import { useState, useEffect, useCallback } from 'react';
import {
  getCardsDue, getCardsByTag, getAllTags,
  importCards, deleteCard, logReview, updateCard, createCard,
} from '../services/api';
import { CardDisplay } from '../components/CardDisplay';
import type { Card } from '../types';
import { select, input, label, overlay, modal, btnPrimary, btn, textarea, btnSmall } from '../styles/theme';

interface Props {
  mode: 'normal' | 'emergency';
}

export function LanguagePage({ mode }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [language, setLanguage] = useState('en');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [loading, setLoading] = useState(false);

  // Import form
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [importFront, setImportFront] = useState('');
  const [importBack, setImportBack] = useState('');
  const [importHint, setImportHint] = useState('');
  const [importTags, setImportTags] = useState('');

  // Edit modal
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editBack, setEditBack] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editTags, setEditTags] = useState('');

  // CSV import
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState('');

  // Stats
  const [sessionStats, setSessionStats] = useState({ total: 0, again: 0, hard: 0, good: 0, easy: 0 });

  // Load tags
  useEffect(() => {
    getAllTags(language).then(setTags).catch(() => {});
  }, [language]);

  const loadCards = async () => {
    if (mode === 'emergency' && !selectedTag) {
      setCards([]);
      setCurrentIndex(0);
      return;
    }
    setLoading(true);
    try {
      let result: Card[];
      if (mode === 'emergency' && selectedTag) {
        result = await getCardsByTag(language, selectedTag);
      } else {
        result = await getCardsDue(language, selectedTag || undefined, 50);
      }
      setCards(result);
      setCurrentIndex(0);
      setSessionStats({ total: 0, again: 0, hard: 0, good: 0, easy: 0 });
    } catch (err) {
      console.error('Failed to load cards:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCards();
  }, [language, selectedTag, mode]);

  const handleGrade = useCallback(async (rating: 1 | 2 | 3 | 4, timeSpent: number) => {
    const card = cards[currentIndex];
    if (!card) return;

    setSessionStats(prev => ({
      ...prev,
      total: prev.total + 1,
      again: prev.again + (rating === 1 ? 1 : 0),
      hard: prev.hard + (rating === 2 ? 1 : 0),
      good: prev.good + (rating === 3 ? 1 : 0),
      easy: prev.easy + (rating === 4 ? 1 : 0),
    }));

    try {
      if (mode !== 'emergency') {
        await logReview({ card_id: card.id, rating, time_spent_seconds: timeSpent });
      }

      if (mode === 'emergency') {
        // In emergency mode, "Again" (1) sends card back to queue
        if (rating === 1) {
          const newCards = [...cards];
          const removed = newCards.splice(currentIndex, 1)[0];
          newCards.push(removed);
          setCards(newCards);
        } else {
          // Remove card from queue
          if (currentIndex < cards.length - 1) {
            setCurrentIndex(currentIndex + 1);
          } else {
            setCards(prev => prev.filter((_, i) => i !== currentIndex));
            if (currentIndex >= cards.length - 1) setCurrentIndex(Math.max(0, cards.length - 2));
          }
        }
      } else {
        if (currentIndex < cards.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          await loadCards();
        }
      }
    } catch (err) {
      console.error('Failed to log review:', err);
    }
  }, [cards, currentIndex, mode, language, selectedTag]);

  const handleDelete = async () => {
    const card = cards[currentIndex];
    if (!card) return;

    if (confirm(`Delete "${card.front}"?`)) {
      try {
        await deleteCard(card.id);
        setCards(prev => prev.filter((_, i) => i !== currentIndex));
      } catch (err) {
        console.error('Failed to delete card:', err);
      }
    }
  };

  const handleEdit = (card: Card) => {
    setEditingCard(card);
    setEditBack(card.back);
    setEditHint(card.hint || '');
    setEditTags(card.tags.map(t => `#${t}`).join(' '));
  };

  const handleSaveEdit = async () => {
    if (!editingCard) return;
    try {
      const parsedTags = [...new Set(
        (editTags.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase())
      )];
      await updateCard(editingCard.id, { back: editBack, hint: editHint, tags: parsedTags });
      setCards(prev =>
        prev.map(c =>
          c.id === editingCard.id ? { ...c, back: editBack, hint: editHint, tags: parsedTags } : c
        )
      );
      setEditingCard(null);
    } catch (err) {
      console.error('Failed to update card:', err);
    }
  };

  const handleSingleImport = async () => {
    if (!importFront.trim() || !importBack.trim()) return;
    try {
      const parsedTags = [...new Set(
        (importTags.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase())
      )];
      await createCard({
        front: importFront.trim(),
        back: importBack.trim(),
        hint: importHint.trim() || undefined,
        tags: parsedTags,
        language,
      });
      setImportFront('');
      setImportBack('');
      setImportHint('');
      setImportTags('');
      setImportResult('Card added!');
      await loadCards();
    } catch (err: any) {
      setImportResult(err.response?.data?.detail || 'Failed to add card');
    }
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    try {
      const result = await importCards({ csv_content: csvText, language });
      setCsvResult(`Imported: ${result.imported} | Duplicates: ${result.duplicates}`);
      setCsvText('');
      await loadCards();
    } catch (err) {
      setCsvResult('Import failed');
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

        <button onClick={() => setShowImport(!showImport)} style={btn}>
          {showImport ? 'Hide Import' : mode === 'emergency' ? '+ Add Word' : 'Import'}
        </button>

        <button onClick={loadCards} style={btn}>
          Refresh
        </button>

        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {cards.length} cards
        </span>

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

      {/* Import / Add form */}
      {showImport && (
        <div style={{
          marginBottom: '16px',
          border: '2px solid var(--border-primary)',
          padding: '12px',
          borderRadius: '4px',
          background: 'var(--bg-primary)',
        }}>
          <h3 style={{ marginBottom: '8px', color: 'var(--text-primary)', fontSize: '1rem' }}>Add Single Card</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              value={importFront}
              onChange={e => setImportFront(e.target.value)}
              placeholder="Word (target language)"
              style={input}
            />
            <input
              value={importBack}
              onChange={e => setImportBack(e.target.value)}
              placeholder="Translation (Russian)"
              style={input}
            />
            <input
              value={importHint}
              onChange={e => setImportHint(e.target.value)}
              placeholder="Hint (optional)"
              style={input}
            />
            <input
              value={importTags}
              onChange={e => setImportTags(e.target.value)}
              placeholder="Tags: #tag1 #tag2 (optional)"
              style={input}
            />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={handleSingleImport} style={btnPrimary}>Add Card</button>
              {importResult && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{importResult}</span>}
            </div>
          </div>

          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border-light)' }} />

          <h3 style={{ marginBottom: '8px', color: 'var(--text-primary)', fontSize: '1rem' }}>Bulk CSV Import</h3>
          <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Format: front,back,hint,#tag1 #tag2
          </div>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={"word,translation,hint,#tag1 #tag2\nexample,пример,this is an example,#vocabulary #english"}
            style={textarea}
          />
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleCsvImport} style={btnPrimary}>Import CSV</button>
            {csvResult && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{csvResult}</span>}
          </div>
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
        <span>Card {currentIndex + 1} of {cards.length}</span>
        {sessionStats.total > 0 && (
          <span>
            Session: {sessionStats.total} reviewed
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
      ) : cards.length > 0 ? (
        <CardDisplay
          key={cards[currentIndex]?.id}
          card={cards[currentIndex]}
          onGrade={handleGrade}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          <p>{mode === 'emergency' ? 'Select a tag to start' : 'No cards due for review'}</p>
          {mode === 'normal' && (
            <button onClick={() => setShowImport(true)} style={{ ...btnPrimary, marginTop: '12px' }}>
              Import Cards
            </button>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editingCard && (
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
                {editingCard.front}
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
              <button onClick={() => setEditingCard(null)} style={{ ...btnPrimary, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts */}
      <div style={{ marginTop: '20px', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
        Space: flip | 1-4: grade | R: replay | D: delete | T: type
        {mode === 'emergency' && ' | Again=1 stays in queue'}
      </div>
    </div>
  );
}
