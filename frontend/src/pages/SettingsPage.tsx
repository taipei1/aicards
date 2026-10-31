import { useState, useEffect } from 'react';
import { getLLMSettings, updateLLMSettings, testLLMSettings, getPrefs, updatePrefs } from '../services/api';
import type { LLMSettings, LLMProvider, LLMProfileUpdate } from '../services/api';
import { applyAudioPrefs } from '../utils/tts';
import { input, label, btnPrimary, btn } from '../styles/theme';

const CHAT_PRESETS = ['tokenharbor/deepseek-v4.1-flash:free', 'vyceai/deepseek-v4.1', 'fast_trans', 'auto/cheap', 'auto/chat', 'auto/fast'];
const EMB_PRESETS = ['openrouter/openai/text-embedding-3-small', 'openrouter/openai/text-embedding-3-large'];

type Provider = LLMProvider;

interface ProfileForm {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embModel: string;
}

const emptyProfile = (): ProfileForm => ({
  baseUrl: '',
  apiKey: '',
  chatModel: '',
  embModel: '',
});

function profilePayload(form: ProfileForm): LLMProfileUpdate {
  return {
    base_url: form.baseUrl.trim(),
    ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}),
    chat_model: form.chatModel.trim(),
    embedding_model: form.embModel.trim(),
  };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [activeProvider, setActiveProvider] = useState<Provider>('server');
  const [profiles, setProfiles] = useState<Record<Provider, ProfileForm>>({
    server: emptyProfile(),
    local: emptyProfile(),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<Provider, boolean>>({ server: false, local: false });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [testResults, setTestResults] = useState<Record<Provider, string | null>>({
    server: null,
    local: null,
  });

  // Sound: on/off + volume. Stored in the backend so the choice follows the
  // user across devices, and applied to the live player immediately on save.
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState(1);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [audioTesting, setAudioTesting] = useState(false);

  const applyLoadedSettings = (s: LLMSettings) => {
    setSettings(s);
    setActiveProvider(s.active_provider);
    setProfiles({
      server: {
        baseUrl: s.server.base_url,
        apiKey: '',
        chatModel: s.server.chat_model,
        embModel: s.server.embedding_model,
      },
      local: {
        baseUrl: s.local.base_url,
        apiKey: '',
        chatModel: s.local.chat_model,
        embModel: s.local.embedding_model,
      },
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const s = await getLLMSettings();
      applyLoadedSettings(s);
    } catch {
      setMessage({ text: 'Failed to load settings', type: 'error' });
    }
    try {
      const p = await getPrefs();
      setAudioEnabled(p.audio_enabled);
      setAudioVolume(p.audio_volume);
    } catch {
      // Audio prefs are optional — keep the defaults if the call fails
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateProfileField = (provider: Provider, field: keyof ProfileForm, value: string) => {
    setProfiles((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }));
    // A test result belongs to the values that were saved, not to new edits.
    setTestResults((prev) => ({ ...prev, [provider]: null }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const s = await updateLLMSettings({
        active_provider: activeProvider,
        server: profilePayload(profiles.server),
        local: profilePayload(profiles.local),
      });
      applyLoadedSettings(s);
      setMessage({ text: '✓ Saved', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || 'Save failed', type: 'error' });
    }
    setSaving(false);
  };

  const handleTest = async (provider: Provider) => {
    setTesting((prev) => ({ ...prev, [provider]: true }));
    setTestResults((prev) => ({ ...prev, [provider]: null }));
    try {
      const r = await testLLMSettings(provider);
      if (r.ok) {
        setTestResults((prev) => ({
          ...prev,
          [provider]: `✓ OK · ${r.provider ?? provider} · ${r.model ?? '?'} · ${r.latency_ms ?? 0}ms · reply: ${r.reply ?? ''}`,
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [provider]: `✗ ${r.error || 'Test failed'}`,
        }));
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: `✗ ${err.response?.data?.detail || 'Test failed'}`,
      }));
    }
    setTesting((prev) => ({ ...prev, [provider]: false }));
  };

  const handleSavePrefs = async () => {
    setPrefsSaving(true);
    setPrefsMessage(null);
    try {
      const p = await updatePrefs({ audio_enabled: audioEnabled, audio_volume: audioVolume });
      setAudioEnabled(p.audio_enabled);
      setAudioVolume(p.audio_volume);
      // Applies to the player right away — no page reload needed
      applyAudioPrefs(p);
      setPrefsMessage({ text: '✓ Saved', type: 'success' });
    } catch (err: any) {
      setPrefsMessage({ text: err.response?.data?.detail || 'Save failed', type: 'error' });
    }
    setPrefsSaving(false);
  };

  // "Test sound" plays with the values currently picked in the form, so the
  // user can hear the level before saving it.
  const handleTestSound = () => {
    setAudioTesting(true);
    applyAudioPrefs({ audio_enabled: audioEnabled, audio_volume: audioVolume });
    void playTest();
  };

  const playTest = async () => {
    const text = 'This is the sound level';
    try {
      const token = localStorage.getItem('aicards_token');
      const res = await fetch(
        `/api/tts/speak?text=${encodeURIComponent(text)}&lang=en&slow=false`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok || !(res.headers.get('content-type') || '').includes('audio')) throw new Error('no audio');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.volume = Math.min(1, Math.max(0, audioVolume));
      await el.play();
      el.onended = () => URL.revokeObjectURL(url);
    } catch {
      if ('speechSynthesis' in window && audioEnabled) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.volume = Math.min(1, Math.max(0, audioVolume));
        u.pitch = 0.6;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    }
    setAudioTesting(false);
  };

  const renderProfile = (provider: Provider) => {
    const form = profiles[provider];
    const meta = settings?.[provider];
    const isActive = activeProvider === provider;
    const isServer = provider === 'server';
    const testResult = testResults[provider];

    return (
      <div
        key={provider}
        style={{
          border: isActive ? '2px solid var(--text-primary)' : '2px solid var(--border-primary)',
          padding: '12px',
          borderRadius: '4px',
          background: 'var(--bg-primary)',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
            {isServer ? 'Серверный OmniRoute' : 'Локальный OmniRoute'}
          </h4>
          {isActive ? (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 'bold',
              padding: '2px 6px',
              borderRadius: '3px',
              background: 'var(--text-primary)',
              color: 'var(--bg-primary)',
            }}>
              Активен
            </span>
          ) : (
            <button
              onClick={() => setActiveProvider(provider)}
              style={{ ...btn, padding: '4px 8px', fontSize: '0.75rem' }}
            >
              Использовать
            </button>
          )}
        </div>

        <div style={{ marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
          {isServer
            ? 'Серверный профиль OmniRoute. Хранится отдельно от локального.'
            : 'Локальный профиль OmniRoute. В Docker укажи адрес, доступный контейнеру, например http://host.docker.internal:20128/v1.'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <label style={label}>Base URL</label>
            <input
              value={form.baseUrl}
              onChange={(e) => updateProfileField(provider, 'baseUrl', e.target.value)}
              placeholder={isServer ? 'http://91.184.253.167:20128/v1' : 'http://host.docker.internal:20128/v1'}
              style={input}
            />
          </div>

          <div>
            <label style={label}>API key</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => updateProfileField(provider, 'apiKey', e.target.value)}
              placeholder={meta?.api_key_configured
                ? `Saved ${meta.api_key_hint} — type new key to replace`
                : 'Paste OmniRoute API key'}
              style={input}
              autoComplete="off"
            />
            <div style={{ marginTop: '2px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {meta?.api_key_configured ? `Ключ сохранён: ${meta.api_key_hint}` : 'Ключ не задан'}
            </div>
          </div>

          <div>
            <label style={label}>Chat model</label>
            <input
              value={form.chatModel}
              onChange={(e) => updateProfileField(provider, 'chatModel', e.target.value)}
              placeholder={isServer ? 'tokenharbor/deepseek-v4.1-flash:free' : 'fast_trans'}
              style={{ ...input, fontFamily: 'monospace', fontSize: '0.85rem' }}
              list={`chat-presets-${provider}`}
            />
            <datalist id={`chat-presets-${provider}`}>
              {CHAT_PRESETS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>

          <div>
            <label style={label}>Embedding model</label>
            <input
              value={form.embModel}
              onChange={(e) => updateProfileField(provider, 'embModel', e.target.value)}
              placeholder="openrouter/openai/text-embedding-3-small"
              style={{ ...input, fontFamily: 'monospace', fontSize: '0.85rem' }}
              list={`emb-presets-${provider}`}
            />
            <datalist id={`emb-presets-${provider}`}>
              {EMB_PRESETS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
              onClick={() => handleTest(provider)}
              disabled={testing[provider]}
              style={btn}
            >
              {testing[provider] ? 'Testing...' : 'Test'}
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Проверяет сохранённые настройки
            </span>
          </div>

          {testResult && (
            <div style={{
              padding: '8px',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              wordBreak: 'break-word',
              background: testResult.startsWith('✓') ? 'var(--bg-success)' : 'var(--bg-danger)',
              color: testResult.startsWith('✓') ? 'var(--text-success)' : 'var(--text-danger)',
            }}>
              {testResult}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Settings</h2>

      <div style={{
        border: '2px solid var(--border-primary)',
        padding: '12px',
        borderRadius: '4px',
        background: 'var(--bg-primary)',
        maxWidth: '640px',
      }}>
        <h3 style={{ marginBottom: '4px', color: 'var(--text-primary)', fontSize: '1rem' }}>
          LLM — OmniRoute gateway
        </h3>
        <div style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Два профиля: серверный и локальный. Выбери активный, заполни URL, ключ и модели, затем сохрани.
          Настройка общая для всех устройств.
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
        }}>
          {(['server', 'local'] as Provider[]).map((p) => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="llm-provider"
                checked={activeProvider === p}
                onChange={() => setActiveProvider(p)}
              />
              {p === 'server' ? 'Серверный' : 'Локальный'}
            </label>
          ))}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Активный: {activeProvider === 'server' ? 'серверный' : 'локальный'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {renderProfile('server')}
          {renderProfile('local')}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {message && (
            <span style={{
              color: message.type === 'success' ? 'var(--text-success)' : 'var(--text-danger)',
              fontSize: '0.9rem',
            }}>
              {message.text}
            </span>
          )}
        </div>

        <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
          Активный профиль применяется сразу после сохранения. Для локального профиля backend должен
          иметь сетевой доступ к указанному URL.
        </div>
      </div>

      {/* Sound */}
      <div style={{
        border: '2px solid var(--sound-accent)',
        padding: '12px',
        borderRadius: '4px',
        background: 'var(--bg-primary)',
        maxWidth: '640px',
        marginTop: '16px',
      }}>
        <h3 style={{ marginBottom: '4px', color: 'var(--sound-accent)', fontSize: '1rem' }}>
          Звук
        </h3>
        <div style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Озвучка слов и предложений. Настройка общая для всех устройств.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              className="sound-check"
              checked={audioEnabled}
              onChange={(e) => setAudioEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Звук включён</span>
          </label>

          <div>
            <label style={{ ...label, color: 'var(--sound-accent)' }}>
              Громкость: {Math.round(audioVolume * 100)}%
            </label>
            <input
              type="range"
              className="sound-range"
              min="0"
              max="100"
              step="5"
              value={Math.round(audioVolume * 100)}
              onChange={(e) => setAudioVolume(Number(e.target.value) / 100)}
              disabled={!audioEnabled}
              style={{
                width: '100%',
                minHeight: '36px',
                cursor: audioEnabled ? 'pointer' : 'not-allowed',
                opacity: audioEnabled ? 1 : 0.5,
              }}
            />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
            }}>
              <span>тихо</span>
              <span>громко</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
              onClick={handleSavePrefs}
              disabled={prefsSaving}
              style={{
                border: '2px solid var(--sound-accent)',
                background: 'var(--sound-accent)',
                color: 'var(--text-on-accent)',
                padding: '10px 16px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                cursor: prefsSaving ? 'wait' : 'pointer',
                borderRadius: '4px',
                minHeight: '44px',
              }}
            >
              {prefsSaving ? 'Saving...' : 'Save sound'}
            </button>
            <button
              onClick={handleTestSound}
              disabled={audioTesting}
              style={{
                border: '2px solid var(--sound-accent)',
                background: 'var(--bg-primary)',
                color: 'var(--sound-accent)',
                padding: '10px 16px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                cursor: audioTesting ? 'wait' : 'pointer',
                borderRadius: '4px',
                minHeight: '44px',
              }}
            >
              {audioTesting ? 'Playing...' : '▶ Test sound'}
            </button>
            {prefsMessage && (
              <span style={{
                color: prefsMessage.type === 'success' ? 'var(--text-success)' : 'var(--text-danger)',
                fontSize: '0.9rem',
              }}>
                {prefsMessage.text}
              </span>
            )}
          </div>

          {!audioEnabled && (
            <div style={{ color: 'var(--sound-accent)', fontSize: '0.8rem' }}>
              Звук выключен — слова не озвучиваются вообще (ни кнопкой, ни автоматически).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
