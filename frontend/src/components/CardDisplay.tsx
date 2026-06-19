import { useState, useEffect, useCallback, useRef } from 'react';
import type { Card } from '../types';
import { speak, speakSlow } from '../utils/tts';

const LANG_MAP: Record<string, string> = {
  en: 'en',
  sk: 'sk',
};

function lang(locale: string): string {
  return LANG_MAP[locale] || 'en-US';
}

interface CardDisplayProps {
  card: Card;
  onGrade: (rating: 1 | 2 | 3 | 4, timeSpent: number) => void;
  onDelete: () => void;
  onEdit?: (card: Card) => void;
}

function normalizeWord(s: string): string {
  return s.replace(/[^a-zA-Zа-яёА-ЯЁ]/g, '').toLowerCase();
}

export function CardDisplay({ card, onGrade, onDelete, onEdit }: CardDisplayProps) {
  const [showBack, setShowBack] = useState(false);
  const [timer, setTimer] = useState(30);
  const [active, setActive] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typing mode state
  const [typingMode, setTypingMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [typingResult, setTypingResult] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimer(30);
    setActive(true);
    setTimeout(() => speak(card.front, lang(card.language)), 300);
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        if (prev) {
          setTimer((t) => {
            if (t <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              timerRef.current = null;
              return 0;
            }
            return t - 1;
          });
        }
        return prev;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
  }, [card.id, card.front, card.language]);

  // Reset typing mode on card change
  useEffect(() => {
    setTypingMode(false);
    setInputValue('');
    setTypingResult(null);
    setShowBack(false);
  }, [card.id]);

  // Focus input when typing mode activates
  useEffect(() => {
    if (typingMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [typingMode]);

  const markActive = useCallback(() => {
    setActive(true);
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => setActive(false), 15000);
  }, []);

  const playNormal = useCallback((text: string) => {
    speak(text, lang(card.language));
    markActive();
  }, [markActive, card.language]);

  const playSlow = useCallback((text: string) => {
    speakSlow(text, lang(card.language));
    markActive();
  }, [markActive, card.language]);

  const handleFlip = useCallback(() => {
    setShowBack((prev) => !prev);
    markActive();
  }, [markActive]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleFlip(); }
      if (e.code === 'Digit1') { onGrade(1, 30 - timer); markActive(); }
      if (e.code === 'Digit2') { onGrade(2, 30 - timer); markActive(); }
      if (e.code === 'Digit3') { onGrade(3, 30 - timer); markActive(); }
      if (e.code === 'Digit4') { onGrade(4, 30 - timer); markActive(); }
      if (e.code === 'KeyD') { onDelete(); markActive(); }
      if (e.code === 'KeyR') { speak(card.front, lang(card.language)); markActive(); }
      if (e.code === 'KeyT') {
        e.preventDefault();
        if (!typingMode) {
          setTypingMode(true);
        }
        markActive();
      }
    },
    [onGrade, onDelete, card.front, handleFlip, markActive, timer, typingMode]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const fmt = (s: number) => `${s}s`;

  const handleCheckAnswer = () => {
    const a = normalizeWord(inputValue);
    const b = normalizeWord(card.front);
    if (a === b) {
      setTypingResult('correct');
    } else {
      setTypingResult('incorrect');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '10px', color: timer <= 5 && active ? '#c00' : '#666', fontSize: '0.85rem' }}>
        ⏱ {active ? fmt(timer) : `⏸ ${fmt(timer)}`} {!active && '(paused)'}
      </div>

      {/* Card */}
      <div
        style={{
          border: '2px solid #000',
          minHeight: '220px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
          cursor: 'pointer',
          marginBottom: '14px',
          userSelect: 'text',
        }}
        onClick={handleFlip}
        onTouchStart={markActive}
      >
        <div style={{ textAlign: 'center', marginBottom: showBack ? '16px' : '0' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{card.front}</div>
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <span
              onClick={(e) => { e.stopPropagation(); playNormal(card.front); }}
              style={{ color: '#666', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              &#9654; replay
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); playSlow(card.front); }}
              style={{ color: '#999', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              &#9654;&#9654; slow
            </span>
          </div>
        </div>
        {showBack && (
          <div style={{ textAlign: 'center', borderTop: '1px solid #ccc', paddingTop: '14px', width: '100%' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#333' }}>{card.back}</div>
            {card.hint && <div style={{ color: '#666', fontSize: '0.9rem', marginTop: '8px' }}>{card.hint}</div>}
          </div>
        )}
      </div>

      {!showBack && <div style={{ textAlign: 'center', color: '#999', fontSize: '0.85rem', marginBottom: '10px' }}>Tap to reveal</div>}

      {/* Typing mode */}
      <div style={{ marginBottom: '10px' }}>
        {!typingMode ? (
          <button
            onClick={() => { setTypingMode(true); markActive(); }}
            style={btnAction}
          >
            ⌨️ Type word
          </button>
        ) : (
          <div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (typingResult) setTypingResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCheckAnswer();
                }
              }}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1.2rem',
                border: typingResult === 'correct' ? '2px solid #4c4'
                  : typingResult === 'incorrect' ? '2px solid #c00'
                  : '2px solid #000',
                background: typingResult === 'correct' ? '#f0fff0'
                  : typingResult === 'incorrect' ? '#fff0f0'
                  : '#fff',
                color: '#000',
                borderRadius: '4px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {typingResult === 'incorrect' && (
              <div style={{ marginTop: '6px', color: '#c00', fontWeight: 'bold', fontSize: '1.1rem' }}>
                ✗ Correct: {card.front}
              </div>
            )}
            {typingResult === 'correct' && (
              <div style={{ marginTop: '6px', color: '#4c4', fontWeight: 'bold', fontSize: '1.1rem' }}>
                ✓ Correct!
              </div>
            )}
            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
              <button
                onClick={() => { setTypingMode(false); setInputValue(''); setTypingResult(null); }}
                style={{ ...btnAction, flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {card.tags && card.tags.length > 0 && (
        <div style={{ marginBottom: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {card.tags.map((tag, i) => <span key={i} style={tagStyle}>{tag}</span>)}
        </div>
      )}

      {/* Grade: 1-4 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
        {([1, 2, 3, 4] as const).map((r) => (
          <button key={r} onClick={() => { onGrade(r, 30 - timer); markActive(); }} style={btnGrade}>
            {r}: {[,'Again','Hard','Good','Easy'][r]}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <button onClick={() => { onDelete(); markActive(); }} style={btnAction}>Delete</button>
        {onEdit && <button onClick={() => { onEdit(card); markActive(); }} style={btnAction}>Edit</button>}
      </div>
    </div>
  );
}

const btnGrade: React.CSSProperties = {
  border: '2px solid #000',
  background: '#fff',
  color: '#000',
  padding: '12px 4px',
  fontSize: '0.85rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  borderRadius: '4px',
  minHeight: '48px',
  textAlign: 'center',
};

const btnAction: React.CSSProperties = {
  border: '2px solid #000',
  background: '#fff',
  color: '#000',
  padding: '12px',
  fontSize: '0.95rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  borderRadius: '4px',
  minHeight: '48px',
};

const tagStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '2px 6px',
  fontSize: '0.75rem',
  borderRadius: '3px',
};
