import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { QueueItem } from '../types';
import { speak, speakSlow, stopSpeaking } from '../utils/tts';
import { generateExamples, generateNotes } from '../services/api';
import type { ExampleItem, ExampleSynonym } from '../services/api';
import { btnGrade, cardBox, tagStyle } from '../styles/theme';

const LANG_MAP: Record<string, string> = {
  en: 'en',
  sk: 'sk',
};

function lang(locale: string): string {
  return LANG_MAP[locale] || 'en-US';
}

interface CardDisplayProps {
  item: QueueItem;
  onGrade: (rating: 1 | 2 | 3 | 4, timeSpent: number) => void;
  onDelete: () => void;
  onEdit?: (item: QueueItem) => void;
}

function normalizeWord(s: string): string {
  return s.replace(/[^a-zA-Zа-яёА-ЯЁ]/g, '').toLowerCase();
}

// Strip diacritics (áčďéíľĺňóôŕšťúýžä → acdeillnoorstuyza) so that a word
// typed on a layout without Slovak keys still matches, flagged as "almost".
// Strip diacritics (áčďéíľĺňóôŕšťúýžä → acdeillnoorstuyza) so that a word
// typed on a layout without Slovak keys still matches, flagged as "almost".
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Lightweight Markdown rendering for the raw notes answer:
// keeps the model's own structure (headings, lists, bold).
function mdInline(s: string, keyPrefix: string): ReactNode[] {
  const parts = s.split(/(\*\*.+?\*\*)/g);
  return parts.map((p, i) => {
    const m = /^\*\*(.+)\*\*$/.exec(p);
    return m ? <strong key={`${keyPrefix}-${i}`}>{m[1]}</strong> : <span key={`${keyPrefix}-${i}`}>{p}</span>;
  });
}

function MarkdownText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const head = /^#{1,6}\s*(.+)$/.exec(line);
    if (head) {
      blocks.push(
        <div key={i} style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginTop: i > 0 ? '8px' : 0 }}>
          {mdInline(head[1], `h${i}`)}
        </div>
      );
      return;
    }
    const item = /^(?:\d+[.)]|[-*•])\s+(.+)$/.exec(line);
    if (item) {
      blocks.push(
        <div key={i} style={{ display: 'flex', gap: '6px' }}>
          <span style={{ flexShrink: 0 }}>•</span>
          <div>{mdInline(item[1], `b${i}`)}</div>
        </div>
      );
      return;
    }
    blocks.push(<div key={i} style={{ marginTop: '4px' }}>{mdInline(line, `p${i}`)}</div>);
  });
  return <>{blocks}</>;
}

export function CardDisplay({ item, onGrade, onDelete, onEdit }: CardDisplayProps) {
  const [showBack, setShowBack] = useState(false);
  const [timer, setTimer] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typing mode
  const [typingMode, setTypingMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [typingResult, setTypingResult] = useState<'correct' | 'almost' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // AI examples (word forms / cases / situational variants)
  const [showExamples, setShowExamples] = useState(false);
  const [examples, setExamples] = useState<ExampleItem[] | null>(null);
  const [examplesNotes, setExamplesNotes] = useState('');
  const [examplesSynonyms, setExamplesSynonyms] = useState<ExampleSynonym[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [examplesError, setExamplesError] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState('');

  // Auto-speak when card loads: for reverse speak the target language word, not Russian
  useEffect(() => {
    setTimer(30);
    setShowBack(false);
    startTimeRef.current = Date.now();

    // Must be cleared on cleanup and on manual interaction: otherwise the
    // delayed auto-speak lands on top of a word the user just clicked.
    const speakTimer = setTimeout(() => {
      if (!item.is_reverse) {
        speak(item.front, lang(item.language));
      }
    }, 300);
    speakTimerRef.current = speakTimer;

    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(speakTimer);
      speakTimerRef.current = null;
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
      stopSpeaking();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [item.id]);

  useEffect(() => {
    setTypingMode(false);
    setInputValue('');
    setTypingResult(null);
    setShowBack(false);
    setShowExamples(false);
    setExamples(null);
    setExamplesNotes('');
    setExamplesSynonyms([]);
    setExamplesError('');
    setNotesError('');
  }, [item.id]);

  useEffect(() => {
    if (typingMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [typingMode]);

  // Any manual playback cancels the pending auto-speak for this card
  const manualSpeak = useCallback((text: string, slow: boolean) => {
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
    if (slow) speakSlow(text, lang(item.language));
    else speak(text, lang(item.language));
  }, [item.language]);

  const playNormal = useCallback((text: string) => {
    manualSpeak(text, false);
  }, [manualSpeak]);

  const playSlow = useCallback((text: string) => {
    manualSpeak(text, true);
  }, [manualSpeak]);

  // On flip: for reverse cards, speak the target language word (item.back)
  const handleFlip = useCallback(() => {
    setShowBack((prev) => {
      if (!prev && item.is_reverse) {
        const t = setTimeout(() => speak(item.back, lang(item.language)), 100);
        flipTimerRef.current = t;
      }
      return !prev;
    });
  }, [item.is_reverse, item.back, item.language]);

  const getTimeSpent = () => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    return Math.min(30, elapsed);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); handleFlip(); }
      if (e.code === 'Digit1') { onGrade(1, getTimeSpent()); }
      if (e.code === 'Digit2') { onGrade(2, getTimeSpent()); }
      if (e.code === 'Digit3') { onGrade(3, getTimeSpent()); }
      if (e.code === 'Digit4') { onGrade(4, getTimeSpent()); }
      if (e.code === 'KeyD') { onDelete(); }
      if (e.code === 'KeyR') { speak(item.is_reverse ? item.back : item.front, lang(item.language)); }
      if (e.code === 'KeyT') {
        e.preventDefault();
        if (!typingMode) setTypingMode(true);
      }
    },
    [onGrade, onDelete, handleFlip, typingMode, item]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const fmt = (s: number) => `${s}s`;

  const handleCheckAnswer = () => {
    const rawExpected = item.is_reverse ? item.back : item.front;
    const a = normalizeWord(inputValue);
    const expected = normalizeWord(rawExpected);
    if (a === expected) {
      setTypingResult('correct');
    } else if (
      normalizeWord(stripDiacritics(inputValue)) === normalizeWord(stripDiacritics(rawExpected))
    ) {
      // Only diacritics differ (e.g. typed on a layout without Slovak keys)
      setTypingResult('almost');
    } else {
      setTypingResult('incorrect');
    }
  };

  // Expected word in the studied language (for hints/messages)
  const expectedWord = item.is_reverse ? item.back : item.front;

  // AI usage examples for the studied word (cached per card)
  const loadExamples = useCallback(async (force: boolean) => {
    if (examplesLoading) return;
    if (examples && !force) return;
    setExamplesLoading(true);
    setExamplesError('');
    try {
      const res = await generateExamples(item.card_id);
      setExamples(res.examples || []);
      if (!res.examples || res.examples.length === 0) {
        setExamplesError('Empty — try again');
      }
    } catch (err: any) {
      setExamplesError(err?.response?.data?.detail || 'Could not generate examples');
    }
    setExamplesLoading(false);
  }, [examples, examplesLoading, item.card_id]);

  // Usage nuances + synonyms — independent call, rendered on arrival
  const loadNotes = useCallback(async (force: boolean) => {
    if (notesLoading) return;
    if ((examplesNotes || examplesSynonyms.length > 0) && !force) return;
    setNotesLoading(true);
    setNotesError('');
    try {
      const res = await generateNotes(item.card_id);
      setExamplesNotes(res.usage_notes || '');
      setExamplesSynonyms(res.synonyms || []);
      if (!res.usage_notes && (!res.synonyms || res.synonyms.length === 0)) {
        setNotesError('Empty — try again');
      }
    } catch (err: any) {
      setNotesError(err?.response?.data?.detail || 'Could not load notes');
    }
    setNotesLoading(false);
  }, [notesLoading, examplesNotes, examplesSynonyms, item.card_id]);

  // Fire both in parallel — each block renders as soon as it lands
  const loadMore = useCallback((force: boolean) => {
    setShowExamples(true);
    void loadExamples(force);
    void loadNotes(force);
  }, [loadExamples, loadNotes]);

  const toggleMore = useCallback(() => {
    if (showExamples) setShowExamples(false);
    else loadMore(false);
  }, [showExamples, loadMore]);

  // KeyM toggles the More panel (Space flip, 1-4 grade, D delete, R replay, T type)
  useEffect(() => {
    const onMoreKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMore();
      }
    };
    window.addEventListener('keydown', onMoreKey);
    return () => window.removeEventListener('keydown', onMoreKey);
  }, [toggleMore]);

  // TTS — for reverse cards say the target language word (item.back)
  const sayWord = () => manualSpeak(item.is_reverse ? item.back : item.front, false);
  const sayWordSlow = () => manualSpeak(item.is_reverse ? item.back : item.front, true);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Timer */}
      <div style={{
        textAlign: 'center',
        marginBottom: '8px',
        color: timer <= 5 ? 'var(--text-danger)' : 'var(--text-secondary)',
        fontSize: '0.85rem',
        fontWeight: timer <= 5 ? 'bold' : 'normal',
      }}>
        ⏱ {fmt(timer)}
      </div>

      {/* Card */}
      <div
        style={cardBox}
        onClick={handleFlip}
      >
        <div style={{ textAlign: 'center', marginBottom: showBack ? '16px' : '0' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {item.front}
          </div>
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <span
              onClick={(e) => { e.stopPropagation(); sayWord(); }}
              style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              &#9654; replay
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); sayWordSlow(); }}
              style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              &#9654;&#9654; slow
            </span>
          </div>
          {item.tags && item.tags.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {item.tags.map((tag, i) => <span key={i} style={tagStyle}>#{tag}</span>)}
            </div>
          )}
        </div>
        {showBack && (
          <div style={{
            textAlign: 'center',
            borderTop: '1px solid var(--border-light)',
            paddingTop: '14px',
            width: '100%',
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {item.back}
            </div>
            {item.hint && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>
                💡 {item.hint}
              </div>
            )}
          </div>
        )}
      </div>

      {!showBack && (
        <div style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          marginBottom: '10px',
        }}>
          Tap to reveal
        </div>
      )}

      {/* Typing mode */}
      <div style={{ marginBottom: '10px' }}>
        {!typingMode ? (
          <button
            onClick={() => { setTypingMode(true); }}
            style={{ ...btnGrade, width: '100%' }}
          >
            Type word
          </button>
        ) : (
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', textAlign: 'center' }}>
              {'Type in ' + (item.language === 'en' ? 'English' : item.language) + ':'}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (typingResult) setTypingResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) {
                  handleCheckAnswer();
                  // Exit typing mode after 1.2s so keyboard shortcuts work again
                  setTimeout(() => {
                    setTypingMode(false);
                    setInputValue('');
                    setTypingResult(null);
                  }, 1200);
                } else if (e.key === 'Enter' && !inputValue.trim()) {
                  setTypingMode(false);
                } else if (e.key === 'Backspace' && inputValue === '') {
                  setTypingMode(false);
                }
              }}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1.2rem',
                border: typingResult === 'correct' ? '2px solid var(--text-success)'
                  : typingResult === 'almost' ? '2px solid #d9a400'
                  : typingResult === 'incorrect' ? '2px solid var(--text-danger)'
                  : '2px solid var(--border-primary)',
                background: typingResult === 'correct' ? 'var(--bg-success)'
                  : typingResult === 'almost' ? 'rgba(217, 164, 0, 0.15)'
                  : typingResult === 'incorrect' ? 'var(--bg-danger)'
                  : 'var(--input-bg)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {typingResult === 'incorrect' && (
              <div style={{ marginTop: '6px', color: 'var(--text-danger)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                ✗ Correct: {expectedWord}
              </div>
            )}
            {typingResult === 'almost' && (
              <div style={{ marginTop: '6px', color: '#a67c00', fontWeight: 'bold', fontSize: '1.1rem' }}>
                ⚠ Почти верно — проверь диакритику: {expectedWord}
              </div>
            )}
            {typingResult === 'correct' && (
              <div style={{ marginTop: '6px', color: 'var(--text-success)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                ✓ Correct!
              </div>
            )}
            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
              <button
                onClick={() => { setTypingMode(false); setInputValue(''); setTypingResult(null); }}
                style={{ ...btnGrade, flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI examples (More panel) */}
      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={toggleMore}
          title="Toggle with M"
          style={{ ...btnGrade, width: '100%' }}
        >
          {showExamples ? 'Less' : 'More'}
        </button>
        {showExamples && (
          <div style={{
            marginTop: '8px',
            border: '1px solid var(--border-light)',
            borderRadius: '4px',
            padding: '10px',
            background: 'var(--bg-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            {examplesLoading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
                Generating examples…
              </div>
            )}
            {examplesError && !examplesLoading && (
              <div style={{ color: 'var(--text-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
                {examplesError}
              </div>
            )}
            {examples && examples.map((ex, i) => (
              <div key={i} style={{
                borderBottom: i < examples.length - 1 ? '1px solid var(--border-light)' : 'none',
                paddingBottom: i < examples.length - 1 ? '8px' : 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span
                    onClick={() => manualSpeak(ex.sentence_in_target, false)}
                    title="Озвучить"
                    style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem', flexShrink: 0 }}
                  >
                    🔊
                  </span>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: '1.45' }}>
                    {ex.sentence_in_target}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px', paddingLeft: '24px' }}>
                  {ex.translation_in_russian}
                  {ex.form && (
                    <span style={{ ...tagStyle, marginLeft: '6px', fontSize: '0.65rem' }}>{ex.form}</span>
                  )}
                </div>
              </div>
            ))}
            {notesLoading && !examplesNotes && examplesSynonyms.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
                Loading notes…
              </div>
            )}
            {notesError && !notesLoading && (
              <div style={{ color: 'var(--text-danger)', fontSize: '0.85rem', textAlign: 'center' }}>
                {notesError}
              </div>
            )}
            {!notesLoading && examplesNotes && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  Usage notes
                </div>
                <MarkdownText text={examplesNotes} />
              </div>
            )}
            {!notesLoading && examplesSynonyms.length > 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  Similar words
                </div>
                {examplesSynonyms.map((s, i) => (
                  <div key={i}>
                    <span style={{ color: 'var(--text-primary)' }}>{s.word}</span>
                    {s.note ? ` — ${s.note}` : ''}
                  </div>
                ))}
              </div>
            )}
            {!examplesLoading && !notesLoading && ((examples || examplesError) || (examplesNotes || examplesSynonyms.length > 0 || notesError)) && (
              <button onClick={() => loadMore(true)} style={{ ...btnGrade, fontSize: '0.8rem', minHeight: '36px' }}>
                ↻ Regenerate
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grade buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
        {([1, 2, 3, 4] as const).map((r) => (
          <button key={r} onClick={() => { onGrade(r, getTimeSpent()); }} style={btnGrade}>
            {r}: {['','Again','Hard','Good','Easy'][r]}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <button onClick={onDelete} style={btnGrade}>Delete</button>
        {onEdit && <button onClick={() => onEdit(item)} style={btnGrade}>Edit</button>}
      </div>
    </div>
  );
}
