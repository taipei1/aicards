import { useState, useEffect } from 'react';
import { LanguagePage } from './pages/LanguagePage';
import { ObsidianPage } from './pages/ObsidianPage';
import { StatsPage } from './pages/StatsPage';
import { WordListPage } from './pages/WordListPage';
import { AddWordPage } from './pages/AddWordPage';
import { SentencePage } from './pages/SentencePage';

type Page = 'language' | 'obsidian' | 'stats' | 'words' | 'emergency' | 'add-word' | 'sentences';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('language');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark-mode', isDark);
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark-mode', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const navItems: { key: Page; label: string }[] = [
    { key: 'language', label: 'Learning' },
    { key: 'emergency', label: 'Emergency' },
    { key: 'add-word', label: 'Add Word' },
    { key: 'sentences', label: 'Sentences' },
    { key: 'words', label: 'All Words' },
    { key: 'obsidian', label: 'Obsidian' },
    { key: 'stats', label: 'Stats' },
  ];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '960px', margin: '0 auto', padding: '12px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <h1 style={{
          fontSize: '1.3rem',
          fontWeight: 'bold',
          margin: 0,
          color: 'var(--text-primary)',
        }}>
          SRS
        </h1>
        <button
          onClick={toggleTheme}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.3rem',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: '1',
          }}
          aria-label="Toggle theme"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        {navItems.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCurrentPage(key)}
            style={{
              padding: '8px 12px',
              border: '2px solid var(--border-primary)',
              background: currentPage === key ? 'var(--text-primary)' : 'var(--bg-primary)',
              color: currentPage === key ? 'var(--bg-primary)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              minHeight: '40px',
              borderRadius: '4px',
              flex: '0 1 auto',
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Page content */}
      {currentPage === 'language' && <LanguagePage mode="normal" />}
      {currentPage === 'emergency' && <LanguagePage mode="emergency" />}
      {currentPage === 'add-word' && <AddWordPage />}
      {currentPage === 'sentences' && <SentencePage onNavigate={(p) => setCurrentPage(p as Page)} />}
      {currentPage === 'words' && <WordListPage />}
      {currentPage === 'obsidian' && <ObsidianPage />}
      {currentPage === 'stats' && <StatsPage />}
    </div>
  );
}
