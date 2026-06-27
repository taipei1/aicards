import { useState, useEffect, useCallback, useRef } from 'react';
import type { QueueItem } from '../types';
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
  item: QueueItem;
  onGrade: (rating: 1 | 2 | 3 | 4, timeSpent: number) => void;
  onDelete: () => void;
  onEdit?: (item: QueueItem) => void;
}

function normalizeWord(s: string): string {
  return s.replace(/[^a-zA-Zа-яёА-ЯЁ]/g, '').toLowerCase();
}

export function CardDisplay({ item, onGrade, onDelete, onEdit }: CardDisplayProps) {
  const [showBack, setShowBack] = useState(false);
  const [timer, setTimer] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  // Typing mode
  const [typingMode, setTypingMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [typingResult, setTypingResult] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-speak when card loads: for reverse speak the target language word, not Russian
  useEffect(() => {
    setTimer(30);
    setShowBack(false);
    startTimeRef.current = Date.now();
    setTimeout(() => {
      if (!item.is_reverse) {
        speak(item.front, lang(item.language));
      }
    }, 300);

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
  }, [item.id]);

  useEffect(() => {
    setTypingMode(false);
    setInputValue('');
    setTypingResult(null);
    setShowBack(false);
  }, [item.id]);

  useEffect(() => {
    if (typingMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [typingMode]);

  const playNormal = useCallback((text: string) => {
    speak(text, lang(item.language));
  }, [item.language]);

  const playSlow = useCallback((text: string) => {
    speakSlow(text, lang(item.language));
  }, [item.language]);

  // On flip: for reverse cards, speak the target language word (item.back)
  const handleFlip = useCallback(() => {
    setShowBack((prev) => {
      if (!prev && item.is_reverse) {
        setTimeout(() => speak(item.back, lang(item.language)), 100);
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
    const a = normalizeWord(inputValue);
    const expected = normalizeWord(item.is_reverse ? item.back : item.front);
    if (a === expected) {
      setTypingResult('correct');
    } else {
      setTypingResult('incorrect');
    }
  };

  // TTS — for reverse cards say the target language word (item.back)
  const sayWord = () => speak(item.is_reverse ? item.back : item.front, lang(item.language));
  const sayWordSlow = () => speakSlow(item.is_reverse ? item.back : item.front, lang(item.language));

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

      {/* Mode indicator for reverse cards */}
      {item.is_reverse && (
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
          Reverse: translate {item.card_back} → {item.card_front}
        </div>
      )}

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
                ✗ Correct: {item.back}
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
      {item.tags && item.tags.length > 0 && (
        <div style={{ marginBottom: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {item.tags.map((tag, i) => <span key={i} style={tagStyle}>#{tag}</span>)}
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
        {onEdit && <button onClick={() => onEdit(item)} style={btnGrade}>Edit</button>}
      </div>
    </div>
  );
}
