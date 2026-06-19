import { useState, useEffect, useCallback } from 'react';
import { syncObsidian, getDueNotes, getObsidianNote, generateQuestions, logObsidianReview } from '../services/api';
import { speak, speakSlow } from '../utils/tts';

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
  const [currentQuestion, setCurrentQuestion] = useState<0 | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Load due notes
  const loadNotes = async () => {
    setLoading(true);
    try {
      const dueNotes = await getDueNotes(5);
      setNotes(dueNotes);
      if (dueNotes.length > 0) {
        setCurrentNote(dueNotes[0]);
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNotes();
  }, []);

  // Sync obsidian folder
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

  // Generate questions
  const handleGenerateQuestions = async (noteId: number, advanced: boolean = false) => {
    setError('');
    try {
      const result = await generateQuestions(noteId, 1, advanced);
      setQuestions(result.questions);
      setCurrentQuestion(0);
      setIsRevealed(false);
      // Speak question
      if (result.questions && result.questions.length > 0) {
        setTimeout(() => speak(result.questions[0].question), 300);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to generate questions';
      setError(msg);
      console.error('Failed to generate questions:', err);
    }
  };

  // Handle grade
  const handleGrade = async (rating: 1 | 2 | 3 | 4) => {
    if (!currentNote) return;

    try {
      await logObsidianReview(currentNote.id, rating, 30);
      
      // Move to next note or reload
      if (notes.length > 1) {
        const nextIndex = notes.findIndex(n => n.id === currentNote.id) + 1;
        if (nextIndex < notes.length) {
          setCurrentNote(notes[nextIndex]);
        } else {
          await loadNotes();
        }
      } else {
        await loadNotes();
      }
      
      setQuestions([]);
      setCurrentQuestion(null);
    } catch (err) {
      console.error('Failed to log review:', err);
    }
  };

  // Handle reject question
  const handleRejectQuestion = () => {
    if (currentQuestion !== null && questions.length > 1) {
      const remaining = questions.filter((_, i) => i !== currentQuestion);
      setQuestions(remaining);
      setCurrentQuestion(0);
      setIsRevealed(false);
    }
  };

  // Handle ask another
  const handleAskAnother = async () => {
    if (!currentNote) return;
    await handleGenerateQuestions(currentNote.id, false);
  };

  // Handle star question
  const handleStarQuestion = async () => {
    if (!currentNote) return;
    await handleGenerateQuestions(currentNote.id, true);
  };

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        const newRevealed = !isRevealed;
        setIsRevealed(newRevealed);
        // Speak answer when revealing
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
      if (e.code === 'KeyR') {
        // Replay question
        if (currentQuestion !== null && questions[currentQuestion]) {
          speak(questions[currentQuestion].question);
        }
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
      <h2 style={{ marginBottom: '20px' }}>Obsidian Knowledge Base</h2>

      {/* Controls */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button onClick={handleSync} disabled={syncing} style={buttonStyle}>
          {syncing ? 'Syncing...' : 'Sync Obsidian'}
        </button>
        <button onClick={loadNotes} style={buttonStyle}>
          Refresh
        </button>
        {message && <span style={{ color: 'var(--text-secondary)' }}>{message}</span>}
      </div>

      {/* Session info */}
      <div style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
        Notes due: {notes.length}
      </div>

      {/* Note display */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
      ) : currentNote ? (
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          {/* Note info */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '8px' }}>
              {currentNote.file_path.split(/[/\\]/).pop()}
            </div>
            {currentNote.tags && currentNote.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {currentNote.tags.map((tag, i) => (
                  <span key={i} style={{ border: '1px solid var(--border-primary)', padding: '2px 8px', fontSize: '0.8rem' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div style={{ border: '2px solid var(--border-primary)', padding: '16px', marginBottom: '20px', background: 'var(--bg-primary)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Error:</div>
              <div>{error}</div>
              <button onClick={() => handleGenerateQuestions(currentNote.id)} style={{ ...buttonStyle, marginTop: '12px' }}>
                Retry
              </button>
            </div>
          )}

          {/* Question or note preview */}
          {currentQuestion !== null && questions[currentQuestion] ? (
            <div style={{ border: '2px solid var(--border-primary)', padding: '24px', marginBottom: '20px' }}>
              <div style={{ fontSize: '1.3rem', marginBottom: '16px' }}>
                {questions[currentQuestion].question}
              </div>
              {isRevealed && (
                <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '16px', color: 'var(--text-primary)' }}>
                  {questions[currentQuestion].answer}
                </div>
              )}
              {!isRevealed && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Press Space to reveal</div>
              )}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border-light)', padding: '16px', marginBottom: '20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Note preview:</div>
              {currentNote.content_preview}
              <div style={{ marginTop: '16px' }}>
                <button onClick={() => handleGenerateQuestions(currentNote.id)} style={buttonStyle}>
                  Generate Question
                </button>
              </div>
            </div>
          )}

          {/* Grade buttons */}
          {currentQuestion !== null && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => handleGrade(1)} style={buttonStyle}>1: Again</button>
                <button onClick={() => handleGrade(2)} style={buttonStyle}>2: Hard</button>
                <button onClick={() => handleGrade(3)} style={buttonStyle}>3: Good</button>
                <button onClick={() => handleGrade(4)} style={buttonStyle}>4: Easy</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <button onClick={handleRejectQuestion} style={buttonStyle}>D: Reject</button>
                <button onClick={handleAskAnother} style={buttonStyle}>E: Ask Another</button>
                <button onClick={handleStarQuestion} style={buttonStyle}>S: Star Question</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>No notes due for review</p>
          <button onClick={handleSync} style={{ ...buttonStyle, marginTop: '16px' }}>
            Sync Obsidian Folder
          </button>
        </div>
      )}

      {/* Keyboard shortcuts */}
      <div style={{ marginTop: '24px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        <p><strong>Shortcuts:</strong> Space (reveal) | 1-4 (grade) | D (reject) | E (ask another) | S (star) | R (replay)</p>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  border: '2px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  padding: '8px 16px',
  fontSize: '0.9rem',
  cursor: 'pointer',
};
