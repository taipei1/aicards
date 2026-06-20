import { useState, useEffect, useCallback } from 'react';
import { syncObsidian, getDueNotes, getObsidianNote, generateQuestions, logObsidianReview } from '../services/api';
import { speak } from '../utils/tts';
import { btn, btnGrade, tagStyle } from '../styles/theme';

interface Note {
  id: number;
  file_path: string;
  tags: string[];
  stability: number;
  content_preview: string;
}

interface Question {
  question: string;
  answer: string;
}

export function ObsidianPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadNotes = async () => {
    setLoading(true);
    try {
      const dueNotes = await getDueNotes(5);
      setNotes(dueNotes);
      if (dueNotes.length > 0) setCurrentNote(dueNotes[0]);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadNotes(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncObsidian();
      setMessage(`Synced: ${result.synced} new, ${result.updated} updated`);
      await loadNotes();
    } catch (err) {
      setMessage('Sync failed');
    }
    setSyncing(false);
  };

  const handleGenerateQuestions = async (noteId: number, advanced: boolean = false) => {
    setError('');
    try {
      const result = await generateQuestions(noteId, 1, advanced);
      setQuestions(result.questions);
      setCurrentQuestion(0);
      setIsRevealed(false);
      if (result.questions && result.questions.length > 0) {
        setTimeout(() => speak(result.questions[0].question), 300);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate questions');
    }
  };

  const handleGrade = async (rating: 1 | 2 | 3 | 4) => {
    if (!currentNote) return;
    try {
      await logObsidianReview(currentNote.id, rating, 30);
      if (notes.length > 1) {
        const nextIndex = notes.findIndex(n => n.id === currentNote.id) + 1;
        if (nextIndex < notes.length) setCurrentNote(notes[nextIndex]);
        else await loadNotes();
      } else await loadNotes();
      setQuestions([]);
      setCurrentQuestion(null);
    } catch (err) {
      console.error('Failed to log review:', err);
    }
  };

  const handleRejectQuestion = () => {
    if (currentQuestion !== null && questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== currentQuestion));
      setCurrentQuestion(0);
      setIsRevealed(false);
    }
  };

  const handleAskAnother = async () => {
    if (!currentNote) return;
    await handleGenerateQuestions(currentNote.id, false);
  };

  const handleStarQuestion = async () => {
    if (!currentNote) return;
    await handleGenerateQuestions(currentNote.id, true);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        const newRevealed = !isRevealed;
        setIsRevealed(newRevealed);
        if (newRevealed && currentQuestion !== null && questions[currentQuestion]) {
          setTimeout(() => speak(questions[currentQuestion].answer), 300);
        }
      }
      if (e.code === 'Digit1') handleGrade(1);
      if (e.code === 'Digit2') handleGrade(2);
      if (e.code === 'Digit3') handleGrade(3);
      if (e.code === 'Digit4') handleGrade(4);
      if (e.code === 'KeyD') handleRejectQuestion();
      if (e.code === 'KeyE') handleAskAnother();
      if (e.code === 'KeyS') handleStarQuestion();
      if (e.code === 'KeyR' && currentQuestion !== null && questions[currentQuestion]) {
        speak(questions[currentQuestion].question);
      }
    },
    [isRevealed, currentNote, currentQuestion, questions]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div>
      <h2 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>Obsidian Knowledge Base</h2>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={handleSync} disabled={syncing} style={btn}>
          {syncing ? 'Syncing...' : 'Sync Obsidian'}
        </button>
        <button onClick={loadNotes} style={btn}>Refresh</button>
        {message && <span style={{ color: 'var(--text-secondary)' }}>{message}</span>}
      </div>

      <div style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
        Notes due: {notes.length}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : currentNote ? (
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)' }}>
              {currentNote.file_path.split(/[/\\]/).pop()}
            </div>
            {currentNote.tags && currentNote.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {currentNote.tags.map((tag, i) => (
                  <span key={i} style={tagStyle}>{tag}</span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div style={{
              border: '2px solid var(--border-primary)',
              padding: '16px',
              marginBottom: '20px',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Error:</div>
              <div>{error}</div>
              <button onClick={() => handleGenerateQuestions(currentNote.id)} style={{ ...btn, marginTop: '12px' }}>
                Retry
              </button>
            </div>
          )}

          {currentQuestion !== null && questions[currentQuestion] ? (
            <div style={{
              border: '2px solid var(--border-primary)',
              padding: '24px',
              marginBottom: '20px',
              background: 'var(--bg-primary)',
            }}>
              <div style={{ fontSize: '1.3rem', marginBottom: '16px', color: 'var(--text-primary)' }}>
                {questions[currentQuestion].question}
              </div>
              {isRevealed ? (
                <div style={{
                  borderTop: '1px solid var(--border-primary)',
                  paddingTop: '16px',
                  color: 'var(--text-primary)',
                  fontSize: '1.1rem',
                }}>
                  {questions[currentQuestion].answer}
                </div>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Press Space to reveal</div>
              )}
            </div>
          ) : (
            <div style={{
              border: '1px solid var(--border-light)',
              padding: '16px',
              marginBottom: '20px',
              color: 'var(--text-secondary)',
              background: 'var(--bg-primary)',
            }}>
              <div style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Note preview:</div>
              {currentNote.content_preview}
              <div style={{ marginTop: '16px' }}>
                <button onClick={() => handleGenerateQuestions(currentNote.id)} style={btn}>
                  Generate Question
                </button>
              </div>
            </div>
          )}

          {currentQuestion !== null && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                {([1, 2, 3, 4] as const).map(r => (
                  <button key={r} onClick={() => handleGrade(r)} style={btnGrade}>
                    {r}: {['','Again','Hard','Good','Easy'][r]}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                <button onClick={handleRejectQuestion} style={btn}>D: Reject</button>
                <button onClick={handleAskAnother} style={btn}>E: Ask Another</button>
                <button onClick={handleStarQuestion} style={btn}>S: Adv</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          <p>No notes due for review</p>
          <button onClick={handleSync} style={{ ...btn, marginTop: '16px' }}>
            Sync Obsidian Folder
          </button>
        </div>
      )}

      <div style={{ marginTop: '24px', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
        <p>Space: reveal | 1-4: grade | D: reject | E: ask another | S: advanced | R: replay</p>
      </div>
    </div>
  );
}
