/**
 * Text-to-Speech using browser's Web Speech API
 */
export function speak(text: string, lang: string = 'en-US'): void {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

export function speakSlow(text: string, lang: string = 'en-US'): void {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.6;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}
