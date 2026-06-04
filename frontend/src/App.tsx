import { useState } from 'react';
import { LanguagePage } from './pages/LanguagePage';
import { ObsidianPage } from './pages/ObsidianPage';
import { StatsPage } from './pages/StatsPage';
import { WordListPage } from './pages/WordListPage';

type Page = 'language' | 'obsidian' | 'stats' | 'words';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('language');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto', padding: '16px' }}>
      {/* Header */}
      <h1 style={{ fontSize: '1.5rem', marginBottom: '20px', fontWeight: 'bold' }}>
        SRS - Spaced Repetition System
      </h1>

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
