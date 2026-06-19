/**
 * Text-to-Speech: backend Edge TTS (primary), Web Speech API (fallback)
 */

const TTS_API = '/api/tts/speak';

let audioCache = new Map<string, HTMLAudioElement>();

function getAudioElement(src: string): HTMLAudioElement {
  const cached = audioCache.get(src);
  if (cached) {
    cached.currentTime = 0;
    return cached;
  }
  const audio = new Audio(src);
  audioCache.set(src, audio);
  // Keep cache from growing infinitely
  if (audioCache.size > 50) {
    const first = audioCache.keys().next().value;
    if (first) audioCache.delete(first);
  }
  return audio;
}

export async function speak(text: string, lang: string = 'en-US'): Promise<void> {
  const url = `${TTS_API}?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}&slow=false`;
  try {
    const audio = getAudioElement(url);
    await audio.play();
  } catch (e) {
    console.warn('Edge TTS failed, trying Web Speech API:', e);
    fallbackSpeak(text, lang);
  }
}

export async function speakSlow(text: string, lang: string = 'en-US'): Promise<void> {
  const url = `${TTS_API}?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}&slow=true`;
  try {
    const audio = getAudioElement(url);
    await audio.play();
  } catch (e) {
    console.warn('Edge TTS slow failed, trying Web Speech API:', e);
    fallbackSpeakSlow(text, lang);
  }
}

// ============ Web Speech API fallback ============

function fallbackSpeak(text: string, lang: string = 'en-US'): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function fallbackSpeakSlow(text: string, lang: string = 'en-US'): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.5;
  window.speechSynthesis.speak(utterance);
}
