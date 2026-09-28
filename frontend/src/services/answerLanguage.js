// Candidate's answer-language choice, made on the pre-interview device-check screen.
//
// Stored in localStorage so the choice survives the SPA hand-off from
// OfficialInterviewStart → InterviewSession (both read it independently) and so a
// returning candidate's last preference is pre-selected. 'auto' means the candidate
// was never asked (old links / direct entry) — the backend then auto-detects per
// answer exactly as it did before this preference existed.

const KEY = 'interviewAnswerLanguage';

export const LANGUAGE_OPTIONS = [
  {
    value: 'ur',
    label: 'اردو — Urdu',
    desc: 'Answers are transcribed in proper Urdu script.',
    short: 'اردو',
  },
  {
    value: 'en',
    label: 'English',
    desc: 'Answers are transcribed in English.',
    short: 'EN',
  },
];

export function getAnswerLanguage() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'ur' || v === 'en' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setAnswerLanguage(value) {
  if (value !== 'ur' && value !== 'en') return;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private browsing — the in-memory choice still flows through the session.
  }
}

// Web Speech API live-caption locale matching the choice ('auto' falls back to Urdu,
// the dominant spoken language of this user base — the mic button's UR/EN control
// still switches it live mid-answer).
export function captionLocaleFor(language) {
  if (language === 'en') return 'en-US';
  return 'ur-PK';
}
