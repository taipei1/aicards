import { useState, useEffect } from 'react';
import { getLLMSettings, updateLLMSettings, testLLMSettings } from '../services/api';
import type { LLMSettings } from '../services/api';
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
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
    </div>
  );
}
