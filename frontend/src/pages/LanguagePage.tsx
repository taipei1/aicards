import { useState, useEffect } from 'react';
import { getCardsDue, importCards, deleteCard, logReview, updateCard } from '../services/api';
import { CardDisplay } from '../components/CardDisplay';
import type { Card } from '../types';

export function LanguagePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editBack, setEditBack] = useState('');
  const [editHint, setEditHint] = useState('');

  const loadCards = async () => {
    setLoading(true);
    try {
      const dueCards = await getCardsDue(language, 20);
      setCards(dueCards);
      setCurrentIndex(0);
    } catch (err) {
      console.error('Failed to load cards:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCards();
  }, [language]);

  const handleGrade = async (rating: 1 | 2 | 3 | 4) => {
    const card = cards[currentIndex];
    if (!card) return;

    try {
      await logReview({ card_id: card.id, rating, time_spent_seconds: 0 });

      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        await loadCards();
      }
    } catch (err) {
      console.error('Failed to log review:', err);
    }
  };

  const handleDelete = async () => {
    const card = cards[currentIndex];
    if (!card) return;

    if (confirm(`Delete "${card.front}"?`)) {
      try {
        await deleteCard(card.id);
        if (currentIndex < cards.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          await loadCards();
        }
      } catch (err) {
        console.error('Failed to delete card:', err);
      }
    }
  };

  const handleEdit = (card: Card) => {
    setEditingCard(card);
    setEditBack(card.back);
    setEditHint(card.hint || '');
  };

  const handleSaveEdit = async () => {
    if (!editingCard) return;
    try {
      await updateCard(editingCard.id, { back: editBack, hint: editHint });
      // Update local state
      setCards((prev) =>
        prev.map((c) =>
          c.id === editingCard.id ? { ...c, back: editBack, hint: editHint } : c
        )
      );
      setEditingCard(null);
    } catch (err) {
      console.error('Failed to update card:', err);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    try {
      const result = await importCards({ csv_content: importText, language });
      setImportResult(`Imported: ${result.imported} | Duplicates: ${result.duplicates}`);
      setImportText('');
      await loadCards();
    } catch (err) {
      setImportResult('Import failed');
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>Language Learning</h2>

      {/* Controls */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={selectStyle}
        >
          <option value="en">English</option>
          <option value="sk">Slovak</option>
        </select>

        <button onClick={() => setShowImport(!showImport)} style={btnControl}>
          {showImport ? 'Hide' : 'Import'}
        </button>

        <button onClick={loadCards} style={btnControl}>
          Refresh
        </button>

        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {cards.length} cards
        </span>
      </div>

      {/* Import section */}
      {showImport && (
        <div style={{ marginBottom: '16px', border: '2px solid var(--border-primary)', padding: '12px', borderRadius: '4px' }}>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="front,back,hint&#10;baffle,наводнить,This puzzle will baffle you"
            style={textareaStyle}
          />
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleImport} style={btnControl}>Import</button>
            {importResult && <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{importResult}</span>}
          </div>
        </div>
      )}

      {/* Session info */}
      <div style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Card {currentIndex + 1} of {cards.length}
      </div>

      {/* Card display */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
      ) : cards.length > 0 ? (
        <CardDisplay
          card={cards[currentIndex]}
          onGrade={handleGrade}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>No cards due for review</p>
          <button onClick={() => setShowImport(true)} style={{ ...btnControl, marginTop: '12px' }}>
            Import Cards
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editingCard && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ marginBottom: '12px' }}>Edit Card</h3>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Front (EN):</label>
              <div style={{ padding: '8px', background: 'var(--bg-muted)', borderRadius: '4px', fontSize: '1.05rem' }}>
                {editingCard.front}
              </div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Back (RU):</label>
              <input
                type="text"
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Hint:</label>
              <input
                type="text"
                value={editHint}
                onChange={(e) => setEditHint(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSaveEdit} style={btnPrimary}>Save</button>
              <button onClick={() => setEditingCard(null)} style={btnControl}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts */}
      <div style={{ marginTop: '20px', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
        Space: flip | 1-4: grade | R: replay | D: delete
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '1rem',
  border: '2px solid var(--border-primary)',
  borderRadius: '4px',
  minHeight: '44px',
};

const btnControl: React.CSSProperties = {
  border: '2px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  padding: '10px 16px',
  fontSize: '0.9rem',
  cursor: 'pointer',
  borderRadius: '4px',
  fontWeight: 'bold',
  minHeight: '44px',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  height: '120px',
  padding: '10px',
  fontSize: '0.9rem',
  fontFamily: 'monospace',
  border: '2px solid var(--border-primary)',
  borderRadius: '4px',
  boxSizing: 'border-box',
  resize: 'vertical',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '1rem',
  border: '2px solid var(--border-primary)',
  borderRadius: '4px',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: 'bold',
  fontSize: '0.9rem',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'var(--overlay)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '2px solid var(--border-primary)',
  padding: '20px',
  maxWidth: '400px',
  width: '100%',
  borderRadius: '4px',
};

const btnPrimary: React.CSSProperties = {
  flex: 1,
  border: '2px solid var(--border-primary)',
  background: 'var(--bg-inverse)',
  color: 'var(--text-inverse)',
  padding: '12px',
  fontSize: '0.95rem',
  cursor: 'pointer',
  borderRadius: '4px',
  fontWeight: 'bold',
  minHeight: '44px',
};
