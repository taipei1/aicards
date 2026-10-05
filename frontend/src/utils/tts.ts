/**
 * Text-to-Speech: backend gTTS (primary), Web Speech API (fallback)
 */

const TTS_API = '/api/tts/speak';

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
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
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