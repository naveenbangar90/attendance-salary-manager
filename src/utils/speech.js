// Spoken check-in messages ("Welcome, Naveen") through the browser's built-in voices.
// The on/off choice is kept per device; it is not app data, so it is not synced.

const PREF_KEY = 'checkinVoice';

export function voiceEnabled() {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}

export function setVoiceEnabled(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  if (!on) window.speechSynthesis?.cancel();
}

// Prefer an Indian English voice, then any English one, then the browser's default.
function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-IN')
    || voices.find((v) => v.lang?.startsWith('en') && v.default)
    || voices.find((v) => v.lang?.startsWith('en'))
    || null;
}

export function speak(text) {
  if (!text || !voiceEnabled() || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.cancel(); // the latest press wins; don't queue up old messages
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.rate = 0.95;
  synth.speak(u);
}
