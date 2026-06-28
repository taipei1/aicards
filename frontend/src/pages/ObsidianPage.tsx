import { useState, useEffect, useCallback } from 'react';
import { syncObsidian, getDueNotes, getObsidianNotes, getObsidianNote, generateQuestions, logObsidianReview } from '../services/api';
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

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<'due' | 'all-notes'>('due');

  // --- All Notes state ---
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allNotesLoading, setAllNotesLoading] = useState(false);
  const [allNotesTag, setAllNotesTag] = useState('');

  // --- Manual selection state ---
  const [selectedNoteContent, setSelectedNoteContent] = useState<any>(null);
  const [selectedNoteLoading, setSelectedNoteLoading] = useState(false);
  const [gradeMessage, setGradeMessage] = useState('');

  const loadNotes = async () => {
    setLoading(true);
    try {
      const dueNotes = await getDueNotes(5, 'srs');
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

  // --- All Notes functions ---

  const loadAllNotes = async (tag?: string) => {
    setAllNotesLoading(true);
    try {
      const result = await getObsidianNotes(tag || undefined, 100);
      setAllNotes(result || []);
    } catch (err) {
      console.error('Failed to load all notes:', err);
    }
    setAllNotesLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'all-notes') {
      loadAllNotes(allNotesTag || undefined);
    }
  }, [activeTab]);

  const handleNoteClick = async (note: Note) => {
    setSelectedNoteLoading(true);
    setGradeMessage('');
    try {
      const content = await getObsidianNote(note.id);
      setSelectedNoteContent(content);
    } catch (err) {
      console.error('Failed to load note content:', err);
    }
    setSelectedNoteLoading(false);
  };

  const handleBackToList = () => {
    setSelectedNoteContent(null);
    setGradeMessage('');
  };

  const handleManualGrade = async (rating: 1 | 2 | 3 | 4) => {
    if (!selectedNoteContent) return;
    try {
      await logObsidianReview(selectedNoteContent.id, rating, 30);
      setGradeMessage('Review logged');
      setTimeout(() => {
        setSelectedNoteContent(null);
        setGradeMessage('');
      }, 1500);
    } catch (err) {
      console.error('Failed to log manual review:', err);
    }
  };

  const handleAllNotesTagFilter = (tag: string) => {
    setAllNotesTag(tag);
    loadAllNotes(tag || undefined);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsRevealed((r) => !r);
      }
      if (e.code === 'Digit1') handleGrade(1);
      if (e.code === 'Digit2') handleGrade(2);
      if (e.code === 'Digit3') handleGrade(3);
      if (e.code === 'Digit4') handleGrade(4);
      if (e.code === 'KeyD') handleRejectQuestion();
      if (e.code === 'KeyE') handleAskAnother();
      if (e.code === 'KeyS') handleStarQuestion();
      if (e.code === 'KeyR' && currentQuestion !== null && questions[currentQuestion]) {
        // Replay not available (TTS removed for Obsidian)
      }
      if (e.code === 'Escape' && activeTab === 'all-notes' && selectedNoteContent) {
        handleBackToList();
      }
    },
    [isRevealed, currentNote, currentQuestion, questions, activeTab, selectedNoteContent]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div>
      <h2 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>Obsidian Knowledge Base</h2>

      {/* Tab switcher */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '0', borderBottom: '2px solid var(--border-primary)' }}>
        <button
          onClick={() => setActiveTab('due')}
          style={{
            padding: '10px 24px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'due' ? '3px solid var(--accent)' : '3px solid transparent',
            background: 'transparent',
            color: activeTab === 'due' ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >Due</button>
        <button
          onClick={() => setActiveTab('all-notes')}
          style={{
            padding: '10px 24px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'all-notes' ? '3px solid var(--accent)' : '3px solid transparent',
            background: 'transparent',
            color: activeTab === 'all-notes' ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >All Notes</button>
      </div>

      {/* ========== DUE TAB ========== */}
      {activeTab === 'due' && (
        <>
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
              {currentNote.title || currentNote.file_path?.split(/[/\\]/).pop()}
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
        </>
      )}

      {/* ========== ALL NOTES TAB ========== */}
      {activeTab === 'all-notes' && (
        <>
          {selectedNoteContent ? (
            /* ----- Note content view ----- */
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <div style={{ marginBottom: '16px' }}>
                <button onClick={handleBackToList} style={btn}>← Back to list</button>
              </div>

              {gradeMessage && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '16px', padding: '8px 12px',
                  background: 'var(--bg-success)', color: 'var(--text-success)',
                  border: '1px solid var(--bg-success)', borderRadius: '4px',
                  fontSize: '0.9rem',
                }}>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-success)' }}>SRS ON</span>
                  <span>{gradeMessage}</span>
                </div>
              )}

              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)' }}>
                {selectedNoteContent.title || selectedNoteContent.file_path?.split(/[/\\]/).pop() || 'Note'}
              </div>
              {selectedNoteContent.tags && selectedNoteContent.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {selectedNoteContent.tags.map((tag: string, i: number) => (
                    <span key={i} style={tagStyle}>{tag}</span>
                  ))}
                </div>
              )}

              <div style={{
                border: '2px solid var(--border-primary)',
                padding: '24px',
                marginBottom: '20px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.6',
                fontSize: '1rem',
              }}>
                {selectedNoteContent.content}
              </div>

              {/* Grade buttons for manual review */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Rate your recall:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {([1, 2, 3, 4] as const).map(r => (
                    <button key={r} onClick={() => handleManualGrade(r)} style={btnGrade}>
                      {r}: {['','Again','Hard','Good','Easy'][r]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                <p>1-4: grade | Esc: back to list</p>
              </div>
            </div>
          ) : (
            /* ----- Note list view ----- */
            <div>
              {/* Tag filter */}
              <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Filter by tag..."
                  value={allNotesTag}
                  onChange={(e) => handleAllNotesTagFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.9rem',
                    border: '2px solid var(--border-primary)',
                    borderRadius: '4px',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    flex: 1,
                    maxWidth: '300px',
                  }}
                />
                {allNotesTag && (
                  <button onClick={() => handleAllNotesTagFilter('')} style={btn}>Clear</button>
                )}
                <button onClick={() => loadAllNotes(allNotesTag || undefined)} style={btn}>Refresh</button>
              </div>

              {allNotesLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
              ) : allNotes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {allNotes.map(note => (
                    <button
                      key={note.id}
                      onClick={() => handleNoteClick(note)}
                      style={{
                        ...btn,
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        maxWidth: '600px',
                      }}
                    >
                      <span>{note.title || note.file_path?.split(/[/\\]/).pop() || 'Untitled'}</span>
                      {note.tags && note.tags.length > 0 && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 'auto' }}>
                          {note.tags.join(', ')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  <p>No notes found</p>
                  <button onClick={handleSync} style={{ ...btn, marginTop: '16px' }}>
                    Sync Obsidian Folder
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
