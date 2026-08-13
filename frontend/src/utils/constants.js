// Course categories offered at signup (§2.1) — must match the backend list
// in backend/app/utils/candidate.py
export const COURSE_CATEGORIES = [
  'AI',
  'Cloud & Data Engineering',
  'Web and Mobile App Development',
  'Graphics and UI/UX Design',
];

// Instructor (Update §2) — a distinct signup type with no course status; always the
// one-time-OTP official-interview flow.
export const INSTRUCTOR_CATEGORY = 'Instructor';

// Everything selectable in the category dropdown (signup + admin edit).
export const SIGNUP_CATEGORIES = [...COURSE_CATEGORIES, INSTRUCTOR_CATEGORY];

export const isInstructorCategory = (cat) =>
  (cat || '').trim().toLowerCase() === INSTRUCTOR_CATEGORY.toLowerCase();

export const COURSE_STATUS_OPTIONS = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed (with certification)' },
];

// Format raw input into the Pakistani CNIC pattern XXXXX-XXXXXXX-X.
// Strips everything except digits, caps at 13 digits, and re-inserts the two
// dashes automatically as the user types (so only integers are ever accepted).
export const formatCnic = (value) => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 13);
  const parts = [digits.slice(0, 5)];
  if (digits.length > 5) parts.push(digits.slice(5, 12));
  if (digits.length > 12) parts.push(digits.slice(12, 13));
  return parts.join('-');
};

// Human-readable labels for a candidate's interview lifecycle state
export const INTERVIEW_STATUS_LABELS = {
  not_interviewed: 'Not Interviewed',
  invited: 'Invite Sent',
  interview_completed: 'Interview Completed',
  reinterview_pending: 'Re-Interview Pending Approval',
  reinterview_approved: 'Re-Interview Approved',
  reinterview_rejected: 'Re-Interview Rejected',
};

// The aspects a candidate rates individually on the post-interview feedback form, on top of
// one overall score. Keys are what get stored in Feedback.category_ratings.
//
// These keys MUST stay in step with CATEGORY_KEYS in backend/app/routes/feedback_routes.py,
// which drops anything it does not recognise — a key renamed here and not there is silently
// discarded on submit. Labels are frontend-only and safe to reword.
export const FEEDBACK_CATEGORIES = [
  { key: 'questions', label: 'Question Quality', hint: 'Were the questions relevant to the role?' },
  { key: 'ai_interviewer', label: 'AI Interviewer', hint: 'Pacing, clarity and understanding' },
  { key: 'audio_video', label: 'Audio & Video', hint: 'Microphone, camera and transcription' },
  { key: 'proctoring', label: 'Proctoring', hint: 'Was the monitoring fair and accurate?' },
  { key: 'platform', label: 'Platform & Interface', hint: 'Speed and ease of use of the portal' },
  { key: 'coding_sandbox', label: 'Coding Sandbox', hint: 'Skip if you had no coding exercise' },
];
