import { useState, useEffect, useCallback } from 'react';
import { LanguagePage } from './pages/LanguagePage';
import { ObsidianPage } from './pages/ObsidianPage';
import { StatsPage } from './pages/StatsPage';
import { WordListPage } from './pages/WordListPage';
import { AddWordPage } from './pages/AddWordPage';
import { SentencePage } from './pages/SentencePage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { getAuthStatus, logout, UNAUTHORIZED_EVENT } from './services/api';

type Page = 'language' | 'obsidian' | 'stats' | 'words' | 'emergency' | 'add-word' | 'sentences' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('language');
  // Pages, once opened, stay mounted (hidden with display:none) so switching
  // tabs never resets their state — e.g. an in-flight More request or the card
  // timer in Learning keeps going while you look at Stats.
  const [visited, setVisited] = useState<Set<Page>>(() => new Set<Page>(['language']));
  const [darkMode, setDarkMode] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark-mode', isDark);
  }, []);

  // Check existing token on load — password is only asked when there is none
  useEffect(() => {
    let cancelled = false;
    getAuthStatus()
      .then((s) => {
        if (cancelled) return;
        setAuthed(s.valid);
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Server unreachable or gate disabled → let the page try to load
        setAuthed(true);
        setAuthChecked(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Any 401 from axios → back to the login screen
  useEffect(() => {
    const onUnauthorized = () => {
      setAuthed(false);
      setAuthChecked(true);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthed(false);
  }, []);

  useEffect(() => {
    setVisited((v) => (v.has(currentPage) ? v : new Set(v).add(currentPage)));
  }, [currentPage]);

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
    { key: 'settings', label: '⚙️ Settings' },
  ];

  if (!authChecked) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '960px', margin: '0 auto', padding: '12px' }}>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '960px', margin: '0 auto', padding: '12px' }}>
        <LoginPage onSuccess={() => setAuthed(true)} />
      </div>
    );
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleLogout}
            title="Log out"
            style={{
              background: 'none',
              border: '2px solid var(--border-primary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              minHeight: '36px',
              padding: '4px 10px',
              borderRadius: '4px',
            }}
          >
            Logout
          </button>
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

      {/* Page content — every visited page stays mounted; only visibility changes */}
      {[...visited].map((p) => (
        <div key={p} style={{ display: currentPage === p ? 'block' : 'none' }}>
          {p === 'language' && <LanguagePage mode="normal" />}
          {p === 'emergency' && <LanguagePage mode="emergency" />}
          {p === 'add-word' && <AddWordPage />}
          {p === 'sentences' && <SentencePage onNavigate={(np) => setCurrentPage(np as Page)} />}
          {p === 'words' && <WordListPage />}
          {p === 'obsidian' && <ObsidianPage />}
          {p === 'stats' && <StatsPage />}
          {p === 'settings' && <SettingsPage />}
        </div>
      ))}
    </div>
  );
}
