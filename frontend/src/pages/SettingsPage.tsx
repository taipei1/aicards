import { useState, useEffect } from 'react';
import { getLLMSettings, updateLLMSettings, testLLMSettings, getPrefs, updatePrefs } from '../services/api';
import type { LLMSettings } from '../services/api';
import { applyAudioPrefs } from '../utils/tts';
import { input, label, btnPrimary, btn } from '../styles/theme';

const CHAT_PRESETS = ['tokenharbor/deepseek-v4.1-flash:free', 'vyceai/deepseek-v4.1', 'auto/cheap', 'auto/chat', 'auto/fast'];
const EMB_PRESETS = ['openrouter/openai/text-embedding-3-small', 'openrouter/openai/text-embedding-3-large'];

export function SettingsPage() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [embModel, setEmbModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Sound: on/off + volume. Stored in the backend so the choice follows the
  // user across devices, and applied to the live player immediately on save.
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState(1);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [audioTesting, setAudioTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s = await getLLMSettings();
      setSettings(s);
      setBaseUrl(s.base_url);
      setChatModel(s.chat_model);
      setEmbModel(s.embedding_model);
      setApiKey('');
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

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const s = await updateLLMSettings({
        base_url: baseUrl.trim(),
        // Send key only if typed — empty keeps the stored one
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        chat_model: chatModel.trim(),
        embedding_model: embModel.trim(),
      });
      setSettings(s);
      setApiKey('');
      setMessage({ text: '✓ Saved', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || 'Save failed', type: 'error' });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testLLMSettings();
      if (r.ok) {
        setTestResult(`✓ OK · ${r.model} · ${r.latency_ms}ms · reply: ${r.reply}`);
      } else {
        setTestResult(`✗ ${r.error}`);
      }
    } catch (err: any) {
      setTestResult(`✗ ${err.response?.data?.detail || 'Test failed'}`);
    }
    setTesting(false);
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
          Все запросы к языковым моделям (предложения, вопросы) идут через твой OmniRoute-прокси.
          {settings?.api_key_configured
            ? <> Ключ сохранён ({settings.api_key_hint}). Чтобы заменить — вставь новый.</>
            : <> Ключ не задан — вставь его ниже.</>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={label}>API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.api_key_configured ? `Saved ${settings.api_key_hint} — type new key to replace` : 'Paste OmniRoute API key'}
              style={input}
              autoComplete="off"
            />
          </div>

          <div>
            <label style={label}>Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://host.docker.internal:20128/v1"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Chat model</label>
            <input
              value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              placeholder="auto/cheap"
              style={{ ...input, fontFamily: 'monospace', fontSize: '0.85rem' }}
              list="chat-presets"
            />
            <datalist id="chat-presets">
              {CHAT_PRESETS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>

          <div>
            <label style={label}>Embedding model</label>
            <input
              value={embModel}
              onChange={(e) => setEmbModel(e.target.value)}
              placeholder="openrouter/openai/text-embedding-3-small"
              style={{ ...input, fontFamily: 'monospace', fontSize: '0.85rem' }}
              list="emb-presets"
            />
            <datalist id="emb-presets">
              {EMB_PRESETS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleTest} disabled={testing} style={btn}>
              {testing ? 'Testing...' : 'Test connection'}
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

          {testResult && (
            <div style={{
              padding: '8px',
              borderRadius: '4px',
              fontSize: '0.85rem',
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
