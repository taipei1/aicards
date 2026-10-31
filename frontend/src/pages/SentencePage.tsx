import { useState, useEffect, useCallback, useRef } from 'react';
import { generateSentence } from '../services/api';
import { speak, speakSlow } from '../utils/tts';
import { ModelLabel } from '../components/ModelLabel';
import { useLanguage } from '../context/LanguageContext';
import { hasModifier, isTypingTarget } from '../utils/keyboard';
import { cardBox, btn, btnPrimary, select } from '../styles/theme';

const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  sk: 'sk',
};

// Keep two future sentences ready. Each queue slot is a promise that started
// as soon as the previous sentence was shown, so Next usually resolves before
// the click animation finishes.
const PREFETCH_AHEAD = 2;

interface SentenceData {
  sentence_in_target: string;
  translation_in_russian: string;
  model?: string;
}

interface PrefetchOutcome {
  ok: boolean;
  data?: SentenceData;
  error?: any;
}

interface SentencePageProps {
  onNavigate?: (page: string) => void;
  /** False while another tab is visible — pages stay mounted. */
  isVisible?: boolean;
}

export function SentencePage({ onNavigate, isVisible = true }: SentencePageProps) {
  const { language, setLanguage } = useLanguage();
  const [sentence, setSentence] = useState<SentenceData | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCards, setNoCards] = useState(false);
  const [showFront, setShowFront] = useState(true);

  // Promises, not finished objects: a slot counts as ready even while the
  // request is still running. Next awaits the oldest slot instead of starting
  // a duplicate request, and the queue is topped up immediately.
  const queueRef = useRef<Promise<PrefetchOutcome>[]>([]);
  // Bumped on language changes so responses for the old language are ignored.
  const epochRef = useRef(0);
  const languageRef = useRef(language);
  const loadingRef = useRef(false);

  const makePrefetch = useCallback((lang: string): Promise<PrefetchOutcome> => {
    return generateSentence(lang).then(
      (data): PrefetchOutcome => ({ ok: true, data }),
      (err): PrefetchOutcome => ({ ok: false, error: err }),
    );
  }, []);

  const fillQueue = useCallback((lang: string, target = PREFETCH_AHEAD) => {
    while (queueRef.current.length < target) {
      queueRef.current.push(makePrefetch(lang));
    }
  }, [makePrefetch]);

  const showSentence = useCallback((data: SentenceData, lang: string) => {
    setSentence(data);
    const front = Math.random() < 0.5;
    setShowFront(front);
    // Only speak if target language is shown first
    if (front) {
      speak(data.sentence_in_target, LANG_MAP[lang]);
    }
  }, []);

  const applyError = useCallback((err: any) => {
    if (err?.response?.status === 404) {
      setNoCards(true);
      setSentence(null);
      queueRef.current = [];
    } else {
      setError(err?.response?.data?.detail || 'Failed to generate sentence');
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setNoCards(false);
    setFlipped(false);

    const lang = languageRef.current;
    const epoch = epochRef.current;

    try {
      // Usually there is a prefetched sentence ready. On the very first call
      // there is none, so start the visible sentence AND its two followers
      // together: the first one is awaited, the other two fill the queue.
      let nextPromise = queueRef.current.shift();
      if (!nextPromise) {
        nextPromise = makePrefetch(lang);
      }
      fillQueue(lang, PREFETCH_AHEAD);

      const outcome = await nextPromise;
      if (epochRef.current !== epoch) return;
      if (outcome.ok && outcome.data) {
        showSentence(outcome.data, lang);
        fillQueue(lang, PREFETCH_AHEAD);
      } else {
        applyError(outcome.error);
      }
    } finally {
      if (epochRef.current === epoch) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [applyError, fillQueue, makePrefetch, showSentence]);

  // A language switch invalidates every queued/in-flight sentence. Clearing
  // the queue also makes the first click generate a fresh trio.
  useEffect(() => {
    if (languageRef.current === language) return;
    languageRef.current = language;
    epochRef.current += 1;
    queueRef.current = [];
    loadingRef.current = false;
    setLoading(false);
    setSentence(null);
    setFlipped(false);
    setError(null);
    setNoCards(false);
  }, [language]);

  // If the page becomes visible again with a card on screen, top the queue up
  // (it might have been consumed while another tab was open).
  useEffect(() => {
    if (!isVisible || !sentence) return;
    fillQueue(languageRef.current, PREFETCH_AHEAD);
  }, [isVisible, sentence, fillQueue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || hasModifier(e) || isTypingTarget(e.target)) return;
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        if (sentence) {
          const newFlipped = !flipped;
          setFlipped(newFlipped);
          // Speak if newly revealed side is the target language
          if ((newFlipped && !showFront) || (!newFlipped && showFront)) {
            speak(sentence.sentence_in_target, LANG_MAP[language]);
          }
        }
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
  }, [sentence, language, loading, handleGenerate, isVisible]);

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
              marginBottom: '4px',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            {directionLabel}
          </div>

          <ModelLabel
            model={sentence.model}
            style={{ textAlign: 'center', marginBottom: '8px' }}
          />

          <div style={cardBox} onClick={() => {
              const newFlipped = !flipped;
              setFlipped(newFlipped);
              if ((newFlipped && !showFront) || (!newFlipped && showFront)) {
                speak(sentence.sentence_in_target, LANG_MAP[language]);
              }
            }}>
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
