import { useState, useEffect, useCallback, useRef } from 'react';
import type { Card } from '../types';
import { speak } from '../utils/tts';

interface CardDisplayProps {
  card: Card;
  onGrade: (rating: 1 | 2 | 3 | 4) => void;
  onDelete: () => void;
  onEdit?: (card: Card) => void;
}

export function CardDisplay({ card, onGrade, onDelete, onEdit }: CardDisplayProps) {
  const [showBack, setShowBack] = useState(true);
  const [timer, setTimer] = useState(0);
  const [active, setActive] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [typingMode, setTypingMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [typingResult, setTypingResult] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimer(0);
    setActive(true);
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        if (prev) setTimer((t) => t + 1);
        return prev;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
  }, [card.id]);

  const markActive = useCallback(() => {
    setActive(true);
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => setActive(false), 15000);
  }, []);

  useEffect(() => {
    if (card.front) speak(card.front);
  }, [card.id, card.front]);

  const handleFlip = useCallback(() => {
    setShowBack((prev) => {
      if (!prev && card.back) setTimeout(() => speak(card.back), 300);
      return !prev;
    });
    markActive();
  }, [card.back, markActive]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleFlip(); }
      if (e.code === 'Digit1') { onGrade(1); markActive(); }
      if (e.code === 'Digit2') { onGrade(2); markActive(); }
      if (e.code === 'Digit3') { onGrade(3); markActive(); }
      if (e.code === 'Digit4') { onGrade(4); markActive(); }
      if (e.code === 'KeyD') { onDelete(); markActive(); }
      if (e.code === 'KeyR') { speak(card.front); markActive(); }
      if (e.code === 'KeyT') {
        e.preventDefault();
        if (!typingMode) setTypingMode(true);
        markActive();
      }
    },
    [onGrade, onDelete, card.front, handleFlip, markActive, typingMode]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setShowBack(true);
    setTypingMode(false);
    setInputValue('');
    setTypingResult(null);
  }, [card.id]);

  useEffect(() => {
    if (typingMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [typingMode]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        {fmt(timer)} {!active && '(paused)'}
      </div>

      {/* Card */}
      <div
        style={{
          border: '2px solid var(--border-primary)',
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
          <div
            onClick={(e) => { e.stopPropagation(); speak(card.front); markActive(); }}
            style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', marginTop: '6px' }}
          >
            &#9654; replay
          </div>
        </div>
        {showBack && (
          <div style={{ textAlign: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '14px', width: '100%' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{card.back}</div>
            {card.hint && <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>{card.hint}</div>}
          </div>
        )}
      </div>

      {!showBack && <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '10px' }}>Tap to reveal</div>}

      {/* Type word mode */}
      <div style={{ marginBottom: '10px' }}>
        {!typingMode ? (
          <button onClick={() => { setTypingMode(true); markActive(); }} style={btnAction}>
            ⌨️ Type word
          </button>
        ) : (
          <div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const normalize = (s: string) => s.replace(/[^a-zA-Zа-яёА-ЯЁ]/g, '').toLowerCase();
                  const a = normalize(inputValue);
                  const b = normalize(card.front);
                  if (a === b) {
                    setTypingResult('correct');
                  } else {
                    setTypingResult('incorrect');
                  }
                }
              }}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1.2rem',
                border: typingResult === 'correct' ? '2px solid #4c4' : typingResult === 'incorrect' ? '2px solid #c00' : '2px solid var(--border-primary)',
                background: typingResult === 'correct' ? '#f0fff0' : typingResult === 'incorrect' ? '#fff0f0' : 'var(--bg-primary)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {typingResult === 'incorrect' && (
              <div style={{ marginTop: '6px', color: '#c00', fontWeight: 'bold' }}>
                Correct: {card.front}
              </div>
            )}
            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
              <button onClick={() => { setTypingMode(false); setInputValue(''); setTypingResult(null); }} style={{ ...btnAction, flex: 1 }}>
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

      {/* Grade: 1-4 in one row with labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
        {([1, 2, 3, 4] as const).map((r) => (
          <button key={r} onClick={() => { onGrade(r); markActive(); }} style={btnGrade}>
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
  border: '2px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  padding: '12px 4px',
  fontSize: '0.85rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  borderRadius: '4px',
  minHeight: '48px',
  textAlign: 'center',
};

const btnAction: React.CSSProperties = {
  border: '2px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  padding: '12px',
  fontSize: '0.95rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  borderRadius: '4px',
  minHeight: '48px',
};

const tagStyle: React.CSSProperties = {
  border: '1px solid var(--border-light)',
  padding: '2px 6px',
  fontSize: '0.75rem',
  borderRadius: '3px',
};
