/**
 * Text-to-Speech: backend edge-tts (primary), Web Speech API (fallback)
 *
 * Volume / on-off live in the backend app_settings (`/api/settings/prefs`), so the
 * same preference applies on every device and inside the Docker image (a local
 * `npm run build` in dist/ is NOT what the container serves — changing only the
 * frontend means the setting exists but does nothing on prod).
 */

const TTS_API = '/api/tts/speak';
const PREFS_API = '/api/settings/prefs';
const PREFS_CACHE_KEY = 'aicards_audio_prefs';

type AudioPrefs = { enabled: boolean; volume: number };
/** Default: full volume. The old code played every word at element volume 1.0. */
const DEFAULT_PREFS: AudioPrefs = { enabled: true, volume: 1 };

let prefs: AudioPrefs = { ...DEFAULT_PREFS };
let prefsLoaded: Promise<void> | null = null;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_PREFS.volume;
  return Math.min(1, Math.max(0, v));
}

/** Latest known prefs, applied without waiting for the network (deep links, click-to-play). */
function readCachedPrefs(): void {
  try {
    const raw = localStorage.getItem(PREFS_CACHE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    prefs = {
      enabled: p?.enabled !== false,
      volume: clamp01(Number(p?.volume)),
    };
  } catch {
    /* ignore a corrupt cache entry */
  }
}
readCachedPrefs();

async function loadPrefs(force: boolean): Promise<void> {
  if (prefsLoaded && !force) return prefsLoaded;
  prefsLoaded = (async () => {
    try {
      const res = await fetch(PREFS_API, { headers: tokenHeader(), cache: 'no-store' });
      if (!res.ok) return;
      const p = await res.json();
      prefs = {
        enabled: p?.audio_enabled !== false,
        volume: clamp01(Number(p?.audio_volume)),
      };
      try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
    } catch {
      /* offline → keep cached prefs */
    }
  })();
  return prefsLoaded;
}

/** Snapshot used by every playback path (speak/speakSlow/stop/play). */
function audioPrefs(): AudioPrefs {
  void loadPrefs(false);
  return prefs;
}

/** Called by Settings right after saving, so the change applies without a reload. */
export function applyAudioPrefs(next: { audio_enabled: boolean; audio_volume: number }): void {
  prefs = { enabled: next.audio_enabled !== false, volume: clamp01(Number(next.audio_volume)) };
  prefsLoaded = Promise.resolve();
  try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  if (!prefs.enabled || prefs.volume <= 0) stopSpeaking();
}

/** Prefetch so the first card of a session does not play stale settings. */
export function initTtsPrefs(): void {
  void loadPrefs(true);
}

type Clip = { el: HTMLAudioElement; url: string };

const cache = new Map<string, Clip>();
/** In-flight loads, keyed the same way — two callers must share ONE clip,
 *  otherwise a double render (React StrictMode) fetches twice and creates two
 *  Audio elements that play on top of each other. */
const inflight = new Map<string, Promise<Clip>>();
/** Key of the clip currently allowed to play, so words never overlap. */
let currentKey: string | null = null;
/** When the current clip was claimed — set synchronously, before any await, so
 *  that N simultaneous callers cannot all decide they are the first one. */
let currentClaimAt = 0;
/** An identical request inside this window is treated as the same utterance. */
const REPEAT_GUARD_MS = 700;

function tokenHeader(): Record<string, string> {
  const token = localStorage.getItem('aicards_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function evict(key: string): void {
  const clip = cache.get(key);
  if (!clip) return;
  clip.el.pause();
  if (clip.url.startsWith('blob:')) URL.revokeObjectURL(clip.url);
  cache.delete(key);
}

function stopCurrent(): void {
  if (currentKey === null) return;
  const clip = cache.get(currentKey);
  if (clip) {
    clip.el.pause();
    clip.el.currentTime = 0;
  }
  currentKey = null;
  currentClaimAt = 0;
}

async function loadClip(key: string, text: string, lang: string, slow: boolean): Promise<Clip> {
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const load = (async () => {
    const url = `${TTS_API}?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}&slow=${slow}`;
    const res = await fetch(url, { headers: tokenHeader() });

    // A reverse proxy or SPA fallback happily answers 200 with HTML — accepting
    // that would hand the Audio element a non-audio blob, fail silently and drop
    // us into the browser voice, which is a completely different one.
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('audio')) {
      throw new Error(`TTS expected audio, got "${contentType || 'unknown'}"`);
    }

    const blob = await res.blob();
    if (!blob.size) throw new Error('TTS returned an empty body');

    const objectUrl = URL.createObjectURL(blob);
    const clip: Clip = { el: new Audio(objectUrl), url: objectUrl };
    clip.el.preload = 'auto';
    cache.set(key, clip);

    while (cache.size > 40) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      evict(oldest);
    }
    return clip;
  })();

  inflight.set(key, load);
  try {
    return await load;
  } finally {
    inflight.delete(key);
  }
}

/**
 * TTS sits behind the password gate and <audio src> cannot send an
 * Authorization header, so the mp3 is fetched as a blob (token attached
 * manually) and played from an object URL.
 *
 * Returns false when playback could not start, so the caller can fall back —
 * critically, a failed play() must NOT trigger the fallback while another
 * stream is already playing, or two voices talk over each other.
 */
async function playWithAuth(key: string, text: string, lang: string, slow: boolean): Promise<boolean> {
  const prefs = audioPrefs();

  // Sound switched off (or volume at zero) in Settings: claim the slot so two
  // callers do not both fall through to the browser voice, then play nothing.
  if (!prefs.enabled || prefs.volume <= 0) {
    stopCurrent();
    return true;
  }

  const now = Date.now();

  // Claim the slot synchronously. Two callers arriving in the same tick (auto-
  // speak + a click) must not both start playback: the first one wins, the
  // second is already speaking the very same word.
  if (currentKey === key && now - currentClaimAt < REPEAT_GUARD_MS) {
    return true;
  }
  if (currentKey !== null && currentKey !== key) stopCurrent();
  currentKey = key;
  currentClaimAt = now;

  try {
    const clip = await loadClip(key, text, lang, slow);

    // No pause() here: interrupting our own pending play() would reject it with
    // AbortError and make us fall back to a second, overlapping voice.
    clip.el.currentTime = 0;
    // Volume comes from Settings — re-read on every play so a change applies
    // to the very next word, not only after a reload.
    clip.el.volume = audioPrefs().volume;
    await clip.el.play();

    clip.el.onended = () => {
      if (currentKey === key) {
        currentKey = null;
        currentClaimAt = 0;
      }
    };
    return true;
  } catch (e) {
    console.warn('TTS failed:', e);
    if (currentKey === key) {
      currentKey = null;
      currentClaimAt = 0;
    }
    return false;
  }
}

export async function speak(text: string, lang: string = 'en-US'): Promise<void> {
  const started = await playWithAuth(`f:${text}:${lang}`, text, lang, false);
  if (!started) {
    // Nothing is playing from the backend, so the fallback is safe.
    stopCurrent();
    fallbackSpeak(text, lang);
  }
}

export async function speakSlow(text: string, lang: string = 'en-US'): Promise<void> {
  const started = await playWithAuth(`s:${text}:${lang}`, text, lang, true);
  if (!started) {
    stopCurrent();
    fallbackSpeakSlow(text, lang);
  }
}

/** Stop everything (used when leaving a card). */
export function stopSpeaking(): void {
  stopCurrent();
}

// ============ Web Speech fallback (only when the backend gave us nothing) ============

/** Male-sounding system voice names, in order of preference. */
const MALE_VOICE_HINTS = [
  'guy', 'david', 'mark', 'ryan', 'daniel', 'alex', 'fred', 'thomas', 'george',
  'james', 'brian', 'roger', 'christopher', 'andrew', 'eric', 'lukas', 'dmitry',
  'pavel', 'yuri', 'hans', 'jonas', 'klaus', 'olivier', 'nicolas',
];

function pickMaleVoice(lang: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const wantLang = (lang || 'en').toLowerCase().slice(0, 2);
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(wantLang));
  const pool = sameLang.length ? sameLang : voices;

  for (const hint of MALE_VOICE_HINTS) {
    const found = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (found) return found;
  }
  return pool.find((v) => v.lang.toLowerCase().startsWith(wantLang)) || null;
}

function speakViaBrowser(text: string, lang: string, rate: number): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const prefs = audioPrefs();
  if (!prefs.enabled || prefs.volume <= 0) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.volume = prefs.volume; // honour the Settings volume here too
  utterance.pitch = 0.6; // keep the fallback in a low register too
  const voice = pickMaleVoice(lang);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function fallbackSpeak(text: string, lang: string = 'en-US'): void {
  speakViaBrowser(text, lang, 0.85);
}

function fallbackSpeakSlow(text: string, lang: string = 'en-US'): void {
  speakViaBrowser(text, lang, 0.55);
}