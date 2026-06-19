import { useState, useEffect } from 'react';
import { LanguagePage } from './pages/LanguagePage';
import { ObsidianPage } from './pages/ObsidianPage';
import { StatsPage } from './pages/StatsPage';
import { WordListPage } from './pages/WordListPage';

type Page = 'language' | 'obsidian' | 'stats' | 'words';

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

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
          SRS - Spaced Repetition System
        </h1>
        <button
          onClick={toggleTheme}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
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
      <nav style={{ display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {([
          { key: 'language', label: 'Languages' },
          { key: 'words', label: 'All Words' },
          { key: 'obsidian', label: 'Obsidian' },
          { key: 'stats', label: 'Stats' },
        ] as { key: Page; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCurrentPage(key)}
            style={{
              padding: '10px 16px',
              border: '2px solid #000',
              background: currentPage === key ? '#000' : '#fff',
              color: currentPage === key ? '#fff' : '#000',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9rem',
              minHeight: '44px',
              borderRadius: '4px',
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Page content */}
      {currentPage === 'language' && <LanguagePage />}
      {currentPage === 'words' && <WordListPage />}
      {currentPage === 'obsidian' && <ObsidianPage />}
      {currentPage === 'stats' && <StatsPage />}
    </div>
  );
}
