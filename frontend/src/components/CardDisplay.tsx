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
  const [showBack, setShowBack] = useState(false);
  const [timer, setTimer] = useState(0);
  const [active, setActive] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    },
    [onGrade, onDelete, card.front, handleFlip, markActive]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => { setShowBack(false); }, [card.id]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '10px', color: '#666', fontSize: '0.85rem' }}>
        {fmt(timer)} {!active && '(paused)'}
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
          userSelect: 'none',
        }}
        onClick={handleFlip}
        onTouchStart={markActive}
      >
        <div style={{ textAlign: 'center', marginBottom: showBack ? '16px' : '0' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{card.front}</div>
          <div
            onClick={(e) => { e.stopPropagation(); speak(card.front); markActive(); }}
            style={{ color: '#666', fontSize: '0.85rem', cursor: 'pointer', marginTop: '6px' }}
          >
            &#9654; replay
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
