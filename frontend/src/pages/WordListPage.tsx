import { useState, useEffect } from 'react';
import { searchCards, updateCard, deleteCard } from '../services/api';
import type { Card } from '../types';
import { speak } from '../utils/tts';

type SortBy = 'default' | 'alpha' | 'date';

export function WordListPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('en');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editBack, setEditBack] = useState('');
  const [editHint, setEditHint] = useState('');

  const loadCards = async () => {
    setLoading(true);
    try {
      const results = await searchCards(language, undefined, search || undefined, 200);
      setCards(results);
    } catch (err) {
      console.error('Failed to load cards:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadCards(); }, [language]);

  useEffect(() => {
    const t = setTimeout(loadCards, 300);
    return () => clearTimeout(t);
  }, [search]);

  const sorted = [...cards].sort((a, b) => {
    if (sortBy === 'alpha') return a.front.localeCompare(b.front);
    if (sortBy === 'date') return (b.created_at || '').localeCompare(a.created_at || '');
    return 0;
  });

  function nextReviewText(card: Card): string {
    if (!card.last_reviewed) return '—';
    const due = new Date(card.last_reviewed);
    due.setDate(due.getDate() + Math.round(card.stability));
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const days = Math.round(diff / 86400000);
    if (days <= 0) return '🔴 Due';
    if (days === 1) return 'tomorrow';
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${(days / 365).toFixed(1)}y`;
  }

  function nextReviewColor(card: Card): string {
    if (!card.last_reviewed) return '#999';
    const due = new Date(card.last_reviewed);
    due.setDate(due.getDate() + Math.round(card.stability));
    const diff = due.getTime() - Date.now();
    const days = diff / 86400000;
    if (days <= 0) return '#c00';
    if (days < 7) return '#e68a00';
    return '#999';
  }

  const handleEdit = (card: Card) => {
    setEditingCard(card);
    setEditBack(card.back);
    setEditHint(card.hint || '');
  };

  const handleSaveEdit = async () => {
    if (!editingCard) return;
    try {
      await updateCard(editingCard.id, { back: editBack, hint: editHint });
      setCards((prev) => prev.map((c) => c.id === editingCard.id ? { ...c, back: editBack, hint: editHint } : c));
      setEditingCard(null);
    } catch (err) {
      console.error('Failed to update card:', err);
    }
  };

  const handleDeleteCard = async (card: Card) => {
    if (confirm(`Delete "${card.front}"?`)) {
      try {
        await deleteCard(card.id);
        setCards((prev) => prev.filter((c) => c.id !== card.id));
      } catch (err) {
        console.error('Failed to delete card:', err);
      }
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>All Words ({cards.length})</h2>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} style={selectStyle}>
          <option value="en">English</option>
          <option value="sk">Slovak</option>
        </select>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} style={selectStyle}>
          <option value="default">Sort: Default</option>
          <option value="alpha">Sort: A-Z</option>
          <option value="date">Sort: Date</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{ ...inputStyle, flex: 1, minWidth: '120px' }}
        />
      </div>

      {/* Edit modal */}
      {editingCard && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ marginBottom: '12px' }}>Edit Card</h3>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Front:</label>
              <div style={{ padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>{editingCard.front}</div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Back (RU):</label>
              <input type="text" value={editBack} onChange={(e) => setEditBack(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Hint:</label>
              <input type="text" value={editHint} onChange={(e) => setEditHint(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSaveEdit} style={btnPrimary}>Save</button>
              <button onClick={() => setEditingCard(null)} style={btnControl}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          {search ? 'No words found' : 'No words yet'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden', minWidth: '650px' }}>
          {/* Header */}
          <div style={rowStyle}>
            <div style={{ ...cellStyle, ...headerCell, flex: '0 0 36px' }}>#</div>
            <div style={{ ...cellStyle, ...headerCell, flex: '1 1 140px' }}>EN</div>
            <div style={{ ...cellStyle, ...headerCell, flex: '1 1 140px' }}>RU</div>
            <div style={{ ...cellStyle, ...headerCell, flex: '0 0 80px' }}>Stab</div>
            <div style={{ ...cellStyle, ...headerCell, flex: '0 0 70px' }}>Diff</div>
            <div style={{ ...cellStyle, ...headerCell, flex: '0 0 100px' }}>Next</div>
            <div style={{ ...cellStyle, ...headerCell, flex: '0 0 60px' }}>Hint</div>
            <div style={{ ...cellStyle, ...headerCell, flex: '0 0 80px' }}>Actions</div>
          </div>

          {/* Rows */}
          {sorted.map((card, i) => (
            <div key={card.id} style={{ ...rowStyle, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <div style={{ ...cellStyle, flex: '0 0 36px', color: '#999', fontSize: '0.8rem' }}>{i + 1}</div>
              <div
                style={{ ...cellStyle, flex: '1 1 140px', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => speak(card.front)}
                title="Click to hear"
              >
                <div style={truncateStyle}>{card.front}</div>
              </div>
              <div style={{ ...cellStyle, flex: '1 1 140px', color: '#333' }}>
                <div style={truncateStyle}>{card.back}</div>
              </div>
              <div style={{ ...cellStyle, flex: '0 0 80px', fontSize: '0.8rem', color: card.stability >= 120 ? '#999' : '#333' }}>
                {card.stability.toFixed(0)}d
              </div>
              <div style={{ ...cellStyle, flex: '0 0 70px', fontSize: '0.8rem' }}>
                {card.difficulty.toFixed(1)}
              </div>
              <div style={{ ...cellStyle, flex: '0 0 100px', fontSize: '0.75rem', color: nextReviewColor(card) }}>
                {nextReviewText(card)}
              </div>
              <div style={{ ...cellStyle, flex: '0 0 60px', color: '#999', fontSize: '0.8rem' }}>
                {card.hint ? <div style={truncateStyle}>{card.hint}</div> : '—'}
              </div>
              <div style={{ ...cellStyle, flex: '0 0 80px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => handleEdit(card)} style={btnSmall}>Edit</button>
                  <button onClick={() => handleDeleteCard(card)} style={{ ...btnSmall, color: '#c00' }}>Del</button>
                </div>
              </div>
            </div>
          ))}
        </div></div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  borderBottom: '1px solid #eee',
  minHeight: '40px',
};

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  overflow: 'hidden',
};

const headerCell: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '0.8rem',
  color: '#666',
  textTransform: 'uppercase',
  background: '#f5f5f5',
};

const truncateStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '200px',
};

const selectStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '0.95rem',
  border: '2px solid #000',
  borderRadius: '4px',
  minHeight: '44px',
  background: '#fff',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '0.95rem',
  border: '2px solid #000',
  borderRadius: '4px',
  boxSizing: 'border-box',
  minHeight: '44px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: 'bold',
  fontSize: '0.85rem',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  border: '2px solid #000',
  padding: '20px',
  maxWidth: '380px',
  width: '100%',
  borderRadius: '4px',
};

const btnControl: React.CSSProperties = {
  flex: 1,
  border: '2px solid #000',
  background: '#fff',
  color: '#000',
  padding: '12px',
  fontSize: '0.95rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  borderRadius: '4px',
  minHeight: '44px',
};

const btnPrimary: React.CSSProperties = {
  ...btnControl,
  background: '#000',
  color: '#fff',
};

const btnSmall: React.CSSProperties = {
  border: '1px solid #000',
  background: '#fff',
  color: '#000',
  padding: '3px 8px',
  fontSize: '0.75rem',
  cursor: 'pointer',
  borderRadius: '3px',
  minHeight: '28px',
};
