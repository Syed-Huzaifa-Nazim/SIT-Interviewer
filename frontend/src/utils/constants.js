// Interview-type categories — must match the backend registry in
// backend/app/utils/interview_types.py exactly (both the values and why they're split this
// way). Two groups, permanently coexisting, never one replacing the other:
//  - EXISTING: the categories this app has always had. Untouched.
//  - SMIT: 5 additional, curriculum-grounded tracks added alongside them. Two of these
//    would otherwise share an old category's exact display name ("Cloud & Data
//    Engineering", "Web and Mobile App Development"), so every SMIT category carries a
//    permanent " — SMIT" suffix that makes its string unique — never strip it to "match" an
//    existing category, that recreates the exact collision this naming avoids.
export const EXISTING_CATEGORIES = [
  'AI',
  'Cloud & Data Engineering',
  'Web and Mobile App Development',
  'Graphics and UI/UX Design',
];

export const SMIT_SUFFIX = ' — SMIT';

export const SMIT_CATEGORIES = [
  'AI & Data Science' + SMIT_SUFFIX,
  'Cloud & Data Engineering' + SMIT_SUFFIX,
  'Web and Mobile App Development' + SMIT_SUFFIX,
  'Graphic Designing With AI' + SMIT_SUFFIX,
  'UI/UX Design With AI' + SMIT_SUFFIX,
];

export const isSmitCategory = (cat) => (cat || '').endsWith(SMIT_SUFFIX);

// Course categories offered at signup (§2.1) — the 4 existing + 5 SMIT tracks, side by side.
export const COURSE_CATEGORIES = [...EXISTING_CATEGORIES, ...SMIT_CATEGORIES];

// Instructor (Update §2) — a distinct signup type with no course status; always the
// one-time-OTP official-interview flow.
export const INSTRUCTOR_CATEGORY = 'Instructor';

// Resume-Based Interview (Resume §1) — also has no course status. Instead of picking a
// domain the candidate uploads a CV at enrolment, and the interview is generated from it.
export const RESUME_CATEGORY = 'Resume-Based Interview';

// Everything selectable in the category dropdown (signup + admin edit).
export const SIGNUP_CATEGORIES = [...COURSE_CATEGORIES, INSTRUCTOR_CATEGORY, RESUME_CATEGORY];

// Same 11 categories, grouped for any UI that wants to show "Existing Interviews" and "SMIT
// Curriculum Interviews" as two clearly separated sections (Bulk Email dropdown, Super Admin
// Interview Access checklist, the signup form) instead of one flat, hard-to-scan list.
export const GROUPED_SIGNUP_CATEGORIES = [
  { key: 'existing', label: 'Existing Interviews', categories: [...EXISTING_CATEGORIES, INSTRUCTOR_CATEGORY, RESUME_CATEGORY] },
  { key: 'smit', label: 'SMIT Curriculum Interviews', categories: SMIT_CATEGORIES },
];

// A short, plain label for the badge shown next to a SMIT category everywhere it's listed.
export const SMIT_BADGE_LABEL = 'SMIT';

// The label to actually display for a category — strips the " — SMIT" marker so a SMIT
// badge (rendered separately, next to this text) doesn't duplicate it as plain text too.
export const categoryDisplayLabel = (cat) =>
  isSmitCategory(cat) ? cat.slice(0, -SMIT_SUFFIX.length) : (cat || '');

export const isInstructorCategory = (cat) =>
  (cat || '').trim().toLowerCase() === INSTRUCTOR_CATEGORY.toLowerCase();

export const isResumeCategory = (cat) =>
  (cat || '').trim().toLowerCase() === RESUME_CATEGORY.toLowerCase();

// Categories that carry no course status at all, so the enrolment form skips the field and
// the admin views show a category chip instead of a status badge.
export const hasCourseStatus = (cat) =>
  !isInstructorCategory(cat) && !isResumeCategory(cat);

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

// Roles that may use the Admin Hub — must match ADMIN_ROLES in
// backend/app/utils/security.py.
//
// `super_admin` is a strict superset of `admin`: it can do everything an admin can, plus
// manage companies and other admins. Checking `role === 'admin'` anywhere in the UI would
// therefore lock the super admin out of the very portal they administer, and the check that
// does it is easy to write by reflex — hence one helper instead of a literal per file.
export const ADMIN_ROLES = ['admin', 'super_admin'];

export const isAdminRole = (role) => ADMIN_ROLES.includes(role);

export const isSuperAdminRole = (role) => role === 'super_admin';

// Granular admin permissions (backend/app/utils/permissions.py's SCOPES — candidates:read,
// invites:send, etc.). `user.permissions` is null for a super admin and for every admin
// nobody has ever restricted — both mean "no restriction", matching the backend's own
// User.has_permission exactly. This is the ONLY thing this check is for: deciding what to
// show. The real gate is server-side (every /api/admin route requires the same scope), so
// hiding a nav item here is a convenience, never the actual security boundary.
export const hasPermission = (user, scope) => {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return user.permissions === null || user.permissions === undefined || user.permissions.includes(scope);
};
