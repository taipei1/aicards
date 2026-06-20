import { useState, useEffect } from 'react';
import { searchCards, updateCard, deleteCard } from '../services/api';
import type { Card } from '../types';
import { speak } from '../utils/tts';
import { select, input, label, overlay, modal, btnPrimary, btnSmall, tagStyle, truncate } from '../styles/theme';

type SortBy = 'default' | 'alpha' | 'date' | 'stability' | 'difficulty';

export function WordListPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('en');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [loading, setLoading] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editBack, setEditBack] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editTags, setEditTags] = useState('');

  const loadCards = async () => {
    setLoading(true);
    try {
      const results = await searchCards(language, undefined, search || undefined, 500);
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
    if (sortBy === 'stability') return b.stability - a.stability;
    if (sortBy === 'difficulty') return b.difficulty - a.difficulty;
    return 0;
  });

  function nextReviewText(card: Card): string {
    if (!card.last_reviewed) return 'New';
    const due = new Date(card.last_reviewed);
    due.setDate(due.getDate() + Math.round(card.stability));
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const days = Math.round(diff / 86400000);
    if (days <= 0) return 'Due';
    if (days === 1) return 'tomorrow';
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${(days / 365).toFixed(1)}y`;
  }

  function nextReviewColor(card: Card): string {
    if (!card.last_reviewed) return 'var(--text-secondary)';
    const due = new Date(card.last_reviewed);
    due.setDate(due.getDate() + Math.round(card.stability));
    const diff = due.getTime() - Date.now();
    const days = diff / 86400000;
    if (days <= 0) return 'var(--text-danger)';
    if (days < 7) return '#e68a00';
    return 'var(--text-secondary)';
  }

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
      setCards(prev => prev.map(c =>
        c.id === editingCard.id ? { ...c, back: editBack, hint: editHint, tags: parsedTags } : c
      ));
      setEditingCard(null);
    } catch (err) {
      console.error('Failed to update card:', err);
    }
  };

  const handleDeleteCard = async (card: Card) => {
    if (confirm(`Delete "${card.front}"?`)) {
      try {
        await deleteCard(card.id);
        setCards(prev => prev.filter(c => c.id !== card.id));
      } catch (err) {
        console.error('Failed to delete card:', err);
      }
    }
  };

  return (
    <div>
      <h2 style={{
        marginBottom: '16px',
        color: 'var(--text-primary)',
        fontSize: '1.2rem',
      }}>
        All Words ({cards.length})
      </h2>

      {/* Controls */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} style={select}>
          <option value="en">English</option>
          <option value="sk">Slovak</option>
        </select>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} style={select}>
          <option value="default">Default</option>
          <option value="alpha">A-Z</option>
          <option value="date">Date</option>
          <option value="stability">Stability</option>
          <option value="difficulty">Difficulty</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{ ...input, flex: 1, minWidth: '120px', width: 'auto' }}
        />
      </div>

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

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          {search ? 'No words found' : 'No words yet'}
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          border: '1px solid var(--border-light)',
          borderRadius: '4px',
        }}>
          <div style={{
            minWidth: '900px',
            width: '100%',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              borderBottom: '2px solid var(--border-primary)',
              background: 'var(--bg-muted)',
              minHeight: '40px',
            }}>
              {[
                { label: '#', flex: '0 0 32px' },
                { label: 'Word', flex: '1 1 120px' },
                { label: 'Translation', flex: '1 1 120px' },
                { label: 'Tags', flex: '0 1 100px' },
                { label: 'Rev', flex: '0 0 40px' },
                { label: 'Stab', flex: '0 0 55px' },
                { label: 'Diff', flex: '0 0 50px' },
                { label: 'Next', flex: '0 0 70px' },
                { label: 'Hint', flex: '0 0 80px' },
                { label: 'Actions', flex: '0 0 75px' },
              ].map(col => (
                <div key={col.label} style={{
                  padding: '8px 6px',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  flex: col.flex,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {col.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            {sorted.map((card, i) => (
              <div key={card.id} style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-light)',
                background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--table-stripe)',
                minHeight: '38px',
                alignItems: 'center',
              }}>
                <div style={{
                  padding: '6px',
                  flex: '0 0 32px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textAlign: 'center',
                }}>
                  {i + 1}
                </div>
                <div
                  style={{
                    padding: '6px',
                    flex: '1 1 120px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => speak(card.front)}
                  title="Click to hear"
                >
                  {card.front}
                </div>
                <div style={{
                  padding: '6px',
                  flex: '1 1 120px',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {card.back}
                </div>
                <div style={{
                  padding: '6px',
                  flex: '0 1 100px',
                  display: 'flex',
                  gap: '2px',
                  flexWrap: 'wrap',
                  overflow: 'hidden',
                }}>
                  {(card.tags || []).slice(0, 3).map((t, ti) => (
                    <span key={ti} style={{
                      ...tagStyle,
                      fontSize: '0.65rem',
                      padding: '1px 4px',
                    }}>
                      #{t}
                    </span>
                  ))}
                  {(card.tags || []).length > 3 && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      +{card.tags.length - 3}
                    </span>
                  )}
                </div>
                <div style={{
                  padding: '6px',
                  flex: '0 0 40px',
                  fontSize: '0.8rem',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                }}>
                  {card.review_count || 0}
                </div>
                <div style={{
                  padding: '6px',
                  flex: '0 0 55px',
                  fontSize: '0.75rem',
                  color: card.stability >= 21 ? 'var(--text-success)' : 'var(--text-primary)',
                }}>
                  {card.stability.toFixed(0)}d
                </div>
                <div style={{
                  padding: '6px',
                  flex: '0 0 50px',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                }}>
                  {card.difficulty.toFixed(1)}
                </div>
                <div style={{
                  padding: '6px',
                  flex: '0 0 70px',
                  fontSize: '0.7rem',
                  color: nextReviewColor(card),
                  fontWeight: nextReviewText(card) === 'Due' ? 'bold' : 'normal',
                }}>
                  {nextReviewText(card)}
                </div>
                <div style={{
                  padding: '6px',
                  flex: '0 0 80px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {card.hint || '—'}
                </div>
                <div style={{
                  padding: '6px',
                  flex: '0 0 75px',
                }}>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <button onClick={() => handleEdit(card)} style={btnSmall}>Edit</button>
                    <button onClick={() => handleDeleteCard(card)} style={{ ...btnSmall, color: 'var(--text-danger)' }}>Del</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
