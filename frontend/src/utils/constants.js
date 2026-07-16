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

// Human-readable labels for a candidate's interview lifecycle state
export const INTERVIEW_STATUS_LABELS = {
  not_interviewed: 'Not Interviewed',
  invited: 'Invite Sent',
  interview_completed: 'Interview Completed',
  reinterview_pending: 'Re-Interview Pending Approval',
  reinterview_approved: 'Re-Interview Approved',
  reinterview_rejected: 'Re-Interview Rejected',
};
