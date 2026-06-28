import { useState, useEffect, useCallback } from 'react';
import { generateSentence } from '../services/api';
import { speak, speakSlow } from '../utils/tts';
import { cardBox, btn, btnPrimary, select } from '../styles/theme';

const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  sk: 'sk',
};

interface SentencePageProps {
  onNavigate?: (page: string) => void;
}

export function SentencePage({ onNavigate }: SentencePageProps) {
  const [language, setLanguage] = useState<string>('en');
  const [sentence, setSentence] = useState<{
    sentence_in_target: string;
    translation_in_russian: string;
  } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCards, setNoCards] = useState(false);
  const [showFront, setShowFront] = useState(true);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoCards(false);
    setFlipped(false);
    try {
      const result = await generateSentence(language);
      setSentence(result);
      const front = Math.random() < 0.5;
      setShowFront(front);
      speak(result.sentence_in_target, LANG_MAP[language]);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNoCards(true);
      } else {
        setError(err?.response?.data?.detail || 'Failed to generate sentence');
      }
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        if (sentence) setFlipped((f) => !f);
      } else if (e.key === 'n' || e.key === 'N') {
        if (!loading) handleGenerate();
      } else if (e.key === 'r' || e.key === 'R') {
        if (sentence) speak(sentence.sentence_in_target, LANG_MAP[language]);
      } else if (e.key === 's' || e.key === 'S') {
        if (sentence) speakSlow(sentence.sentence_in_target, LANG_MAP[language]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sentence, language, loading, handleGenerate]);

  const directionLabel = (() => {
    if (!sentence) return '';
    if (showFront) {
      return 'Translate to Russian';
    }
    return language === 'en' ? 'Translate to English' : 'Translate to Slovak';
  })();

  const cardFront = sentence
    ? showFront
      ? sentence.sentence_in_target
      : sentence.translation_in_russian
    : '';
  const cardBack = sentence
    ? showFront
      ? sentence.translation_in_russian
      : sentence.sentence_in_target
    : '';

  return (
    <div>
      <h2 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
        Sentences
      </h2>

      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={select}
        >
          <option value="en">English</option>
          <option value="sk">Slovak</option>
        </select>

        <button onClick={handleGenerate} disabled={loading} style={btnPrimary}>
          {loading ? 'Generating...' : 'Generate Sentence'}
        </button>
      </div>

      {loading && (
        <p style={{ color: 'var(--text-secondary)' }}>Generating sentence...</p>
      )}

      {error && (
        <div
          style={{
            padding: '12px',
            background: 'var(--bg-danger)',
            color: 'var(--text-danger)',
            borderRadius: '4px',
            marginBottom: '12px',
          }}
        >
          {error}
          <button onClick={() => setError(null)} style={{ ...btn, marginLeft: '12px' }}>
            Dismiss
          </button>
        </div>
      )}

      {noCards && (
        <div
          style={{
            padding: '20px',
            border: '2px solid var(--border-primary)',
            borderRadius: '4px',
            textAlign: 'center',
            color: 'var(--text-primary)',
          }}
        >
          <p style={{ marginBottom: '12px' }}>
            No vocabulary due for review. Add some words first!
          </p>
          <button onClick={() => onNavigate?.('add-word')} style={btnPrimary}>
            Go to Add Word
          </button>
        </div>
      )}

      {sentence && !noCards && (
        <>
          <div
            style={{
              textAlign: 'center',
              marginBottom: '8px',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            {directionLabel}
          </div>

          <div style={cardBox} onClick={() => setFlipped((f) => !f)}>
            <span
              style={{
                fontSize: '1.3rem',
                textAlign: 'center',
                lineHeight: '1.6',
                wordBreak: 'break-word',
              }}
            >
              {flipped ? cardBack : cardFront}
            </span>
            <span
              style={{
                marginTop: '12px',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              {flipped ? 'Click or press Space to flip back' : 'Click or press Space to flip'}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => speak(sentence.sentence_in_target, LANG_MAP[language])}
              style={btn}
            >
              Replay (R)
            </button>
            <button
              onClick={() => speakSlow(sentence.sentence_in_target, LANG_MAP[language])}
              style={btn}
            >
              Slow (S)
            </button>
            <button onClick={handleGenerate} disabled={loading} style={btnPrimary}>
              {loading ? '...' : 'Next (N)'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
