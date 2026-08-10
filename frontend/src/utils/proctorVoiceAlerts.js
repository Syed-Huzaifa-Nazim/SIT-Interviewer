// Spoken proctoring alerts, kept separate from InterviewSession.jsx so this small,
// self-contained piece of proctoring behavior (soft look-away nudges + the accumulator that
// escalates them into a real violation, plus the multiple-faces voice alert) can be read,
// tested, and changed without touching the rest of that already-large file.

// Named so the wording lives in one place instead of being duplicated at call sites.
export const LOOK_AWAY_VOICE_MESSAGE = 'Please look directly at the camera.';
// GAZE_AWAY is now a hard/immediate violation (see logProctorViolation's own voice hook) —
// this message is unrelated to LOOK_AWAY's wording, just spoken from a different call site.
export const GAZE_AWAY_VOICE_MESSAGE = 'Please keep your eyes on the screen.';
export const HAND_DETECTED_VOICE_MESSAGE = 'Please keep your hand away from your face and the camera.';
export const NO_FACE_VOICE_MESSAGE = 'Please make sure your face is visible to the camera.';
export const MULTIPLE_FACES_VOICE_MESSAGE = 'Multiple faces detected. Please ensure you are alone.';
export const TERMINATION_VOICE_MESSAGE = 'Interview terminated due to repeated violations.';
// Distinct wording from TERMINATION_VOICE_MESSAGE (repeated violations) — an identity failure
// is a single, immediate hard block, not an accumulation of strikes, so it says why in those
// terms rather than reusing the "repeated violations" phrasing that wouldn't be true here.
export const IDENTITY_TERMINATION_VOICE_MESSAGE = 'Identity verification failed. This interview is being terminated.';

// Same voice-selection heuristic as InterviewSession.jsx's speakQuestion (Google/Natural >
// Microsoft > any English voice), so a spoken proctoring alert uses the identical AI voice
// candidates already hear reading questions. Deliberately does NOT call
// speechSynthesis.cancel() first by default — unlike speakQuestion, a mid-interview nudge
// must not cut off a question that's already being read aloud; it simply queues after it.
// Pass { interrupt: true } for a final/closing message (e.g. termination) that should clear
// anything queued and speak immediately instead of waiting its turn.
export const speakPhrase = (text, { interrupt = false } = {}) => {
  if (!('speechSynthesis' in window)) return;
  try {
    if (interrupt) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    const voices = window.speechSynthesis.getVoices();
    const engVoice = voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))) ||
                     voices.find((v) => v.lang.startsWith('en') && v.name.includes('Microsoft')) ||
                     voices.find((v) => v.lang.startsWith('en'));
    if (engVoice) utterance.voice = engVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Voice alert failed:', err);
  }
};

// Shared soft-warning pool: counts nudges across ANY mix of soft violation types (LOOK_AWAY,
// HAND_DETECTED, NO_FACE all register against the same instance) and reports back once
// `threshold` of them have accumulated in total, so the caller can escalate that occurrence
// into one real, counted violation instead of a strike being taken for every momentary
// glance-away/hand/no-face blip. Counting is shared; each type still gets its own distinct
// beep/popup/voice on every occurrence — this only decides when to escalate.
export const createSoftWarningAccumulator = (threshold = 4) => {
  let count = 0;
  return {
    threshold,
    register() {
      count += 1;
      if (count >= threshold) {
        count = 0;
        return true;
      }
      return false;
    },
  };
};
