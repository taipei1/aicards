import { useState, useEffect, useRef } from 'react';
import { createCard, importCards, translateWord } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { normalizeSpaces, trimSpaces } from '../utils/text';
import { select, input, label, btnPrimary, btn } from '../styles/theme';

export function AddWordPage() {
  const { language, setLanguage } = useLanguage();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [hint, setHint] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');

  // Bulk table mode
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState([{ front: '', back: '', hint: '', tags: '' }]);
  const [bulkMessage, setBulkMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // CSV paste mode
  const [csvText, setCsvText] = useState('');
  const [csvMessage, setCsvMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const userEditedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Ignore translations that arrive after the word/language changed again.
  const translateSeqRef = useRef(0);
  // Skip duplicate auto-translate runs for the same word/language (e.g. when
  // blur only trims spaces, or React StrictMode runs the effect twice).
  const lastAutoKeyRef = useRef('');

  // Auto-translate with debounce
  useEffect(() => {
    if (!front.trim()) {
      lastAutoKeyRef.current = '';
      setBack('');
      setTranslating(false);
      setTranslateError('');
      return;
    }
    if (userEditedRef.current) return;
    const key = `${front.trim()}|${language}`;
    if (lastAutoKeyRef.current === key) return;

    clearTimeout(debounceRef.current);
    const seq = ++translateSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      if (userEditedRef.current || seq !== translateSeqRef.current) return;
      lastAutoKeyRef.current = key;
      // Do not leave the previous word's translation in the field while the
      // new one is being fetched: saving too early would store the wrong text.
      setBack('');
      setTranslating(true);
      setTranslateError('');
      try {
        const result = await translateWord(front.trim(), language, 'ru');
        if (seq !== translateSeqRef.current || userEditedRef.current) return;
        if (result.translated) {
          setBack(trimSpaces(result.translated));
        } else {
          setTranslateError('Translation unavailable — type it manually.');
        }
      } catch {
        if (seq === translateSeqRef.current && !userEditedRef.current) {
          setTranslateError('Translation unavailable — type it manually.');
        }
      } finally {
        if (seq === translateSeqRef.current) setTranslating(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [front, language]);

  const handleBackChange = (value: string) => {
    setBack(value);
    userEditedRef.current = true;
    setTranslating(false);
    setTranslateError('');
  };

  const handleManualTranslate = async () => {
    if (!front.trim()) return;
    userEditedRef.current = false;
    lastAutoKeyRef.current = `${front.trim()}|${language}`;
    const seq = ++translateSeqRef.current;
    setTranslating(true);
    setTranslateError('');
    try {
      const result = await translateWord(front.trim(), language, 'ru');
      if (seq !== translateSeqRef.current) return;
      if (result.translated) {
        setBack(trimSpaces(result.translated));
      } else {
        setTranslateError('Translation unavailable — type it manually.');
      }
    } catch {
      if (seq === translateSeqRef.current) {
        setTranslateError('Translation unavailable — type it manually.');
      }
    } finally {
      if (seq === translateSeqRef.current) setTranslating(false);
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
        front: trimSpaces(front),
        back: trimSpaces(back),
        hint: trimSpaces(hint) || undefined,
        tags: parsedTags,
        language,
      });

      setFront('');
      setBack('');
      setHint('');
      setTags('');
      userEditedRef.current = false;
      lastAutoKeyRef.current = '';
      setTranslating(false);
      setTranslateError('');
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

  const normalizeBulkRow = (index: number, field: 'front' | 'back' | 'hint' | 'tags') => {
    const rows = [...bulkRows];
    rows[index][field] = trimSpaces(rows[index][field]);
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
      return `${trimSpaces(r.front)},${trimSpaces(r.back)},${trimSpaces(r.hint)},${tags}`;
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

  const handleCsvPasteImport = async () => {
    if (!csvText.trim()) {
      setCsvMessage({ text: 'Paste some CSV content first', type: 'error' });
      return;
    }
    try {
      const result = await importCards({ csv_content: csvText.trim(), language });
      setCsvMessage({
        text: `Imported: ${result.imported} | Duplicates: ${result.duplicates}${result.conflicts.length ? ` | Conflicts: ${result.conflicts.length}` : ''}`,
        type: result.imported > 0 ? 'success' : 'error',
      });
      if (result.imported > 0) {
        setCsvText('');
      }
    } catch (err: any) {
      setCsvMessage({ text: err.response?.data?.detail || 'Import failed', type: 'error' });
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
              onBlur={() => setFront((v) => normalizeSpaces(v))}
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
                onBlur={() => setBack((v) => trimSpaces(v))}
                placeholder="Translation"
                style={{ ...input, flex: 1 }}
              />
              <button
                onClick={handleManualTranslate}
                disabled={!front.trim() || translating}
                style={{ ...btn, whiteSpace: 'nowrap', minHeight: '44px' }}
              >
                {translating ? 'Translating...' : 'Translate'}
              </button>
            </div>
            {translateError && (
              <div style={{ color: 'var(--text-danger)', fontSize: '0.8rem', marginTop: '4px' }}>
                {translateError}
              </div>
            )}
          </div>

          <div>
            <label style={label}>Example sentence</label>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              onBlur={() => setHint((v) => normalizeSpaces(v))}
              placeholder="Example sentence (optional)"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              onBlur={() => setTags((v) => normalizeSpaces(v))}
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

      {/* ───── CSV Paste mode ───── */}
      <div style={{ marginTop: '16px' }}>
        <div style={{
          border: '2px solid var(--border-primary)',
          padding: '12px',
          borderRadius: '4px',
          background: 'var(--bg-primary)',
        }}>
          <h3 style={{ marginBottom: '6px', color: 'var(--text-primary)', fontSize: '1rem' }}>Import from CSV</h3>
          <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Format: <code>word,translation,hint,#tag1 #tag2</code> — one per line
          </div>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={"word,translation,hint,#tag1 #tag2\nexample,пример,this is an example,#vocabulary #english"}
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '8px',
              fontSize: '0.85rem',
              border: '2px solid var(--border-primary)',
              borderRadius: '4px',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleCsvPasteImport} style={btnPrimary}>Import CSV</button>
            {csvMessage && (
              <span style={{
                color: csvMessage.type === 'success' ? 'var(--text-success)' : 'var(--text-danger)',
                fontSize: '0.9rem',
              }}>
                {csvMessage.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Toggle for bulk table mode */}
      <div style={{ marginTop: '12px' }}>
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
                    onBlur={() => normalizeBulkRow(i, 'front')}
                    placeholder="Word"
                    style={{ ...input, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ flex: '1 1 120px', padding: '4px' }}>
                  <input
                    value={row.back}
                    onChange={(e) => handleBulkRowChange(i, 'back', e.target.value)}
                    onBlur={() => normalizeBulkRow(i, 'back')}
                    placeholder="Translation"
                    style={{ ...input, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ flex: '1 1 100px', padding: '4px' }}>
                  <input
                    value={row.hint}
                    onChange={(e) => handleBulkRowChange(i, 'hint', e.target.value)}
                    onBlur={() => normalizeBulkRow(i, 'hint')}
                    placeholder="Hint"
                    style={{ ...input, padding: '6px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ flex: '1 1 100px', padding: '4px' }}>
                  <input
                    value={row.tags}
                    onChange={(e) => handleBulkRowChange(i, 'tags', e.target.value)}
                    onBlur={() => normalizeBulkRow(i, 'tags')}
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
