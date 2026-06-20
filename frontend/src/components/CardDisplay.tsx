import { useState, useEffect, useCallback, useRef } from 'react';
import type { Card } from '../types';
import { speak, speakSlow } from '../utils/tts';
import { btnGrade, cardBox, tagStyle } from '../styles/theme';

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

const REVERSE_THRESHOLD = 21;

export function CardDisplay({ card, onGrade, onDelete, onEdit }: CardDisplayProps) {
  const [showBack, setShowBack] = useState(false);
  const [timer, setTimer] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  const isReverse = card.stability >= REVERSE_THRESHOLD;

  // Typing mode
  const [typingMode, setTypingMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [typingResult, setTypingResult] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimer(30);
    setShowBack(false);
    startTimeRef.current = Date.now();
    setTimeout(() => speak(isReverse ? card.back : card.front, lang(card.language)), 300);

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
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [card.id]);

  useEffect(() => {
    setTypingMode(false);
    setInputValue('');
    setTypingResult(null);
    setShowBack(false);
  }, [card.id]);

  useEffect(() => {
    if (typingMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [typingMode]);

  const playNormal = useCallback((text: string) => {
    speak(text, lang(card.language));
  }, [card.language]);

  const playSlow = useCallback((text: string) => {
    speakSlow(text, lang(card.language));
  }, [card.language]);

  const handleFlip = useCallback(() => {
    setShowBack((prev) => !prev);
  }, []);

  const getTimeSpent = () => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    return Math.min(30, elapsed);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleFlip(); }
      if (e.code === 'Digit1') { onGrade(1, getTimeSpent()); }
      if (e.code === 'Digit2') { onGrade(2, getTimeSpent()); }
      if (e.code === 'Digit3') { onGrade(3, getTimeSpent()); }
      if (e.code === 'Digit4') { onGrade(4, getTimeSpent()); }
      if (e.code === 'KeyD') { onDelete(); }
      if (e.code === 'KeyR') { speak(isReverse ? card.back : card.front, lang(card.language)); }
      if (e.code === 'KeyT') {
        e.preventDefault();
        if (!typingMode) setTypingMode(true);
      }
    },
    [onGrade, onDelete, handleFlip, typingMode, isReverse, card.back, card.front, card.language]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const fmt = (s: number) => `${s}s`;

  const handleCheckAnswer = () => {
    const a = normalizeWord(inputValue);
    const target = card.front;
    const b = normalizeWord(target);
    if (a === b) {
      setTypingResult('correct');
    } else {
      setTypingResult('incorrect');
    }
  };

  const displayFront = isReverse ? card.back : card.front;
  const displayBack = isReverse ? card.front : card.back;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
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

      {/* Mode indicator */}
      {isReverse && (
        <div style={{
          textAlign: 'center',
          marginBottom: '8px',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          background: 'var(--bg-tag)',
          padding: '2px 8px',
          borderRadius: '4px',
          display: 'inline-block',
          width: '100%',
        }}>
          Reverse mode: translate from Russian
        </div>
      )}

      {/* Card */}
      <div
        style={cardBox}
        onClick={handleFlip}
      >
        <div style={{ textAlign: 'center', marginBottom: showBack ? '16px' : '0' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {showBack ? displayBack : displayFront}
          </div>
          {!isReverse && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <span
                onClick={(e) => { e.stopPropagation(); playNormal(card.front); }}
                style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                &#9654; replay
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); playSlow(card.front); }}
                style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                &#9654;&#9654; slow
              </span>
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
            {isReverse ? (
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {card.front}
              </div>
            ) : (
              <>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {card.back}
                </div>
                {card.hint && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>
                    {card.hint}
                  </div>
                )}
              </>
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
                if (e.key === 'Enter') handleCheckAnswer();
              }}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '1.2rem',
                border: typingResult === 'correct' ? '2px solid var(--text-success)'
                  : typingResult === 'incorrect' ? '2px solid var(--text-danger)'
                  : '2px solid var(--border-primary)',
                background: typingResult === 'correct' ? 'var(--bg-success)'
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
                ✗ Correct: {displayFront}
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

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div style={{ marginBottom: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {card.tags.map((tag, i) => <span key={i} style={tagStyle}>#{tag}</span>)}
        </div>
      )}

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
        {onEdit && <button onClick={() => onEdit(card)} style={btnGrade}>Edit</button>}
      </div>
    </div>
  );
}
