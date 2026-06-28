import { useState, useEffect, useRef } from 'react';
import { createCard, importCards, translateWord } from '../services/api';
import { select, input, label, btnPrimary, btn } from '../styles/theme';

export function AddWordPage() {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [hint, setHint] = useState('');
  const [tags, setTags] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Bulk table mode
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState([{ front: '', back: '', hint: '', tags: '' }]);
  const [bulkMessage, setBulkMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const autoFilledRef = useRef(false);
  const userEditedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-translate with debounce
  useEffect(() => {
    if (!front.trim()) {
      setBack('');
      autoFilledRef.current = false;
      return;
    }
    if (userEditedRef.current) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!front.trim()) return;
      try {
        const result = await translateWord(front.trim(), language, 'ru');
        if (result.translated && !userEditedRef.current) {
          setBack(result.translated);
          autoFilledRef.current = true;
        }
      } catch {
        // leave Translation field empty on failure
      }
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [front, language]);

  const handleBackChange = (value: string) => {
    setBack(value);
    userEditedRef.current = true;
    autoFilledRef.current = false;
  };

  const handleManualTranslate = async () => {
    if (!front.trim()) return;
    try {
      const result = await translateWord(front.trim(), language, 'ru');
      if (result.translated) {
        setBack(result.translated);
        autoFilledRef.current = true;
        userEditedRef.current = false;
      }
    } catch {
      // leave empty on failure
    }
  };

  const handleAddCard = async () => {
    if (!front.trim() || !back.trim()) {
      setMessage({ text: 'Word and Translation are required', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const parsedTags = [...new Set(
        (tags.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase())
      )];

      await createCard({
        front: front.trim(),
        back: back.trim(),
        hint: hint.trim() || undefined,
        tags: parsedTags,
        language,
      });

      setFront('');
      setBack('');
      setHint('');
      setTags('');
      autoFilledRef.current = false;
      userEditedRef.current = false;
      setMessage({ text: '✓ Card added!', type: 'success' });
    } catch (err: any) {
      if (err.response?.status === 409) {
        setMessage({ text: 'Card already exists', type: 'error' });
      } else {
        setMessage({ text: err.response?.data?.detail || 'Failed to add card', type: 'error' });
      }
    }
    setLoading(false);
  };

  const handleBulkRowChange = (index: number, field: 'front' | 'back' | 'hint' | 'tags', value: string) => {
    const rows = [...bulkRows];
    rows[index][field] = value;
    setBulkRows(rows);
  };

  const addBulkRow = () => {
    setBulkRows([...bulkRows, { front: '', back: '', hint: '', tags: '' }]);
  };

  const removeBulkRow = (index: number) => {
    if (bulkRows.length <= 1) return;
    setBulkRows(bulkRows.filter((_, i) => i !== index));
  };

  const handleBulkImport = async () => {
    const validRows = bulkRows.filter(r => r.front.trim() && r.back.trim());
    if (validRows.length === 0) {
      setBulkMessage({ text: 'Fill in at least one row with Word and Translation', type: 'error' });
      return;
    }

    // Build CSV content from rows
    const csvLines = validRows.map(r => {
      const tags = (r.tags.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase()).join(' ');
      return `${r.front.trim()},${r.back.trim()},${r.hint.trim() || ''},${tags}`;
    });
    const csvContent = csvLines.join('\n');

    try {
      const result = await importCards({ csv_content: csvContent, language });
      setBulkMessage({
        text: `Imported: ${result.imported} | Duplicates: ${result.duplicates}${result.conflicts.length ? ` | Conflicts: ${result.conflicts.length}` : ''}`,
        type: result.imported > 0 ? 'success' : 'error',
      });
      if (result.imported > 0) {
        setBulkRows([{ front: '', back: '', hint: '', tags: '' }]);
      }
    } catch (err: any) {
      setBulkMessage({ text: err.response?.data?.detail || 'Import failed', type: 'error' });
    }
  };

  // Fade success message after 3s
  useEffect(() => {
    if (!message || message.type !== 'success') return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div>
      <h2 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Add Word</h2>

      <div style={{
        border: '2px solid var(--border-primary)',
        padding: '12px',
        borderRadius: '4px',
        background: 'var(--bg-primary)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <label style={label}>Word</label>
            <input
              value={front}
              onChange={(e) => { setFront(e.target.value); userEditedRef.current = false; }}
              placeholder="Word"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Translation</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={back}
                onChange={(e) => handleBackChange(e.target.value)}
                placeholder="Translation"
                style={{ ...input, flex: 1 }}
              />
              <button
                onClick={handleManualTranslate}
                disabled={!front.trim()}
                style={{ ...btn, whiteSpace: 'nowrap', minHeight: '44px' }}
              >
                Translate
              </button>
            </div>
          </div>

          <div>
            <label style={label}>Example sentence</label>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Example sentence (optional)"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#tag1 #tag2"
              style={input}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} style={select}>
              <option value="en">English</option>
              <option value="sk">Slovak</option>
            </select>

            <button onClick={handleAddCard} disabled={loading} style={btnPrimary}>
              {loading ? 'Adding...' : 'Add Card'}
            </button>

            {message && (
              <span style={{
                color: message.type === 'success' ? 'var(--text-success)' : 'var(--text-danger)',
                fontSize: '0.9rem',
                transition: 'opacity 0.5s',
              }}>
                {message.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Toggle for bulk table mode */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={() => setShowBulk(!showBulk)}
          style={{ ...btn, width: '100%' }}
        >
          {showBulk ? '− Hide Bulk Import' : '+ Bulk Import (table)'}
        </button>
      </div>

      {showBulk && (
        <div style={{
          marginTop: '12px',
          border: '2px solid var(--border-primary)',
          borderRadius: '4px',
          background: 'var(--bg-primary)',
          overflowX: 'auto',
        }}>
          <div style={{ minWidth: '600px' }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              borderBottom: '2px solid var(--border-primary)',
              background: 'var(--bg-muted)',
              fontWeight: 'bold',
              fontSize: '0.8rem',
            }}>
              <div style={{ flex: '1 1 120px', padding: '8px 6px' }}>Word</div>
              <div style={{ flex: '1 1 120px', padding: '8px 6px' }}>Translation</div>
              <div style={{ flex: '1 1 100px', padding: '8px 6px' }}>Hint</div>
              <div style={{ flex: '1 1 100px', padding: '8px 6px' }}>Tags</div>
              <div style={{ flex: '0 0 40px', padding: '8px 6px', textAlign: 'center' }}></div>
            </div>

            {/* Rows */}
            {bulkRows.map((row, i) => (
              <div key={i} style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-light)',
              }}>
                <div style={{ flex: '1 1 120px', padding: '4px' }}>
                  <input
                    value={row.front}
                    onChange={(e) => handleBulkRowChange(i, 'front', e.target.value)}
                    placeholder="Word"
                    style={{ ...input, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ flex: '1 1 120px', padding: '4px' }}>
                  <input
                    value={row.back}
                    onChange={(e) => handleBulkRowChange(i, 'back', e.target.value)}
                    placeholder="Translation"
                    style={{ ...input, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ flex: '1 1 100px', padding: '4px' }}>
                  <input
                    value={row.hint}
                    onChange={(e) => handleBulkRowChange(i, 'hint', e.target.value)}
                    placeholder="Hint"
                    style={{ ...input, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ flex: '1 1 100px', padding: '4px' }}>
                  <input
                    value={row.tags}
                    onChange={(e) => handleBulkRowChange(i, 'tags', e.target.value)}
                    placeholder="#tag"
                    style={{ ...input, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ flex: '0 0 40px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {bulkRows.length > 1 && (
                    <button
                      onClick={() => removeBulkRow(i)}
                      style={{
                        ...btn,
                        padding: '2px 8px',
                        minHeight: '28px',
                        fontSize: '0.8rem',
                        lineHeight: '1',
                      }}
                      title="Remove row"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Actions */}
            <div style={{
              display: 'flex',
              gap: '8px',
              padding: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              <button onClick={addBulkRow} style={btn}>
                + Add Row
              </button>
              <button onClick={handleBulkImport} style={btnPrimary}>
                Import All
              </button>
              {bulkMessage && (
                <span style={{
                  color: bulkMessage.type === 'success' ? 'var(--text-success)' : 'var(--text-danger)',
                  fontSize: '0.9rem',
                }}>
                  {bulkMessage.text}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
