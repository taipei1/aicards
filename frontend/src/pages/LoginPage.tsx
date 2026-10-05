import { useState } from 'react';
import { login } from '../services/api';
import { input, label, btnPrimary } from '../styles/theme';

interface Props {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await login(password);
      onSuccess();
    } catch (err: any) {
      if (err?.response?.status === 503) {
        setError('Password gate is not configured on the server');
      } else if (err?.response?.status === 401) {
        setError('Wrong password');
      } else {
        setError(err?.response?.data?.detail || 'Login failed');
      }
    }
    setBusy(false);
  };

  return (
    <div style={{
      minHeight: '70vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: '360px',
          border: '2px solid var(--border-primary)',
          borderRadius: '6px',
          padding: '20px',
          background: 'var(--bg-primary)',
        }}
      >
        <h2 style={{
          margin: '0 0 4px',
          fontSize: '1.15rem',
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}>
          🔒 SRS
        </h2>
        <p style={{
          margin: '0 0 16px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
        }}>
          Введите пароль. Он запомнится на этом устройстве на 90 дней.
        </p>

        <label style={label}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={input}
          autoComplete="current-password"
          autoFocus
        />

        {error && (
          <div style={{
            marginTop: '10px',
            color: 'var(--text-danger)',
            fontSize: '0.85rem',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          style={{ ...btnPrimary, width: '100%', marginTop: '14px' }}
        >
          {busy ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </div>
  );
}