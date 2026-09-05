"""Shared helpers for the CNIC/category-based candidate system (§2)."""
import re
import secrets
import string

# Course categories tied to the Ongoing/Completed course-status logic (§2.1).
#
# Curriculum feature: "AI" was renamed to "AI & Data Science", and "Graphics and UI/UX
# Design" was split into two separate selectable tracks (never combined — a candidate is
# either a graphic designer or a UI/UX designer, not both). These 5 names are exactly the
# 5 curriculum courses imported by scripts/import_curriculum.py; see app/utils/curriculum.py
# for the category -> curriculum-course mapping.
#
# LEGACY_COURSE_CATEGORIES below are deliberately NOT in this list — new signups/invites can
# no longer choose them — but existing candidates already stored under one of those values
# are left completely alone (see LEGACY_COURSE_CATEGORIES' own comment for why this matters).
COURSE_CATEGORIES = [
    'AI & Data Science',
    'Cloud & Data Engineering',
    'Web and Mobile App Development',
    'Graphic Designing With AI',
    'UI/UX Design With AI',
]

# Category values that used to be selectable and may still be sitting on real candidate
# rows (course_category has no DB-level enum constraint, so nothing forces them to move).
# Never offered again at signup/invite time, and — critically — never auto-migrated: "AI"
# unambiguously became "AI & Data Science", but "Graphics and UI/UX Design" could mean
# either of the two new tracks, and guessing which one a real person's account belongs to
# would be writing fiction into someone's history. An admin may reassign one by hand via
# the ordinary profile-edit category field; nothing does it automatically.
LEGACY_COURSE_CATEGORIES = [
    'AI',
    'Graphics and UI/UX Design',
]

# The Instructor category (Update §2) is NOT a course — it has no course-status and
# always follows the one-time-OTP official-interview flow, mirroring Completed-course
# candidates but with an instructor-specific competency question set (Update §3).
INSTRUCTOR_CATEGORY = 'Instructor'

# The Resume-Based category (Resume §1) is also NOT a course: the candidate never picks a
# domain, so there is no course-status to collect. Their interview is driven entirely by an
# uploaded resume — questions target the skills and projects extracted from it. Like
# Instructor, it always follows the one-time-OTP official-interview flow.
RESUME_CATEGORY = 'Resume-Based Interview'

# Categories that carry no course-status. Every course-status check in the codebase must
# consult this set rather than testing for one specific category, so adding another
# statusless category later doesn't mean hunting down the same `!= 'completed'` guard in
# auth_routes, bulk_email_routes and admin_routes independently (which is exactly what
# happened when Instructor was added).
STATUSLESS_CATEGORIES = {INSTRUCTOR_CATEGORY, RESUME_CATEGORY}

# Everything selectable at signup / editable by an admin.
SIGNUP_CATEGORIES = COURSE_CATEGORIES + [INSTRUCTOR_CATEGORY, RESUME_CATEGORY]

# Canonical interview job role per category, used when auto-creating the official
# interview for completed-course candidates (§3.3). Every value must be accepted
# by the domain classifier's preset whitelist so the session can never be rejected.
CATEGORY_JOB_ROLES = {
    'AI & Data Science': 'AI Engineer',
    'Cloud & Data Engineering': 'Cloud & Data Engineer',
    'Web and Mobile App Development': 'Web & Mobile App Developer',
    'Graphic Designing With AI': 'Graphic Designer',
    'UI/UX Design With AI': 'UI/UX Designer',
    # Legacy values (LEGACY_COURSE_CATEGORIES) — kept here, not removed, purely so a candidate
    # still on one of these old category strings still gets a sensible job_role if something
    # ever re-derives it. Every .get() call site already falls back to 'Software Engineer'
    # regardless, so removing these would not break anything; keeping them is simply more
    # accurate for accounts that still carry the old value.
    'AI': 'AI Engineer',
    'Graphics and UI/UX Design': 'UI/UX Designer',
    INSTRUCTOR_CATEGORY: 'Instructor',
    # A resume-based candidate has no declared domain. This is only the label the session is
    # created under — the questions themselves come from the resume, not from this role — so
    # it stays deliberately generic rather than guessing a specialism from the CV.
    RESUME_CATEGORY: 'Software Engineer',
}

COURSE_STATUSES = ['ongoing', 'completed']


def is_instructor_category(category):
    return (category or '').strip().lower() == INSTRUCTOR_CATEGORY.lower()


def is_resume_category(category):
    return (category or '').strip().lower() == RESUME_CATEGORY.lower()


def requires_course_status(category):
    """False for categories that legitimately have no course status (Instructor,
    Resume-Based). Those accounts keep ``course_status`` NULL, which the column has always
    allowed — the value is simply not applicable to them."""
    normalized = (category or '').strip().lower()
    return normalized not in {c.lower() for c in STATUSLESS_CATEGORIES}


# The four coding question FORMATS presented in a live interview (Coding Formats §2.2).
# All four are currently answered verbally and scored by the standard transcript -> LLM
# pipeline; 'coding_scenario' is the format that will later hand off to the Coding Sandbox
# for test-case execution once that integration is built.
CODING_SCENARIO = 'coding_scenario'   # Format 1: real-world problem, describe the solution
CODING_LOGIC = 'coding_logic'         # Format 2: explain the logic/approach, no code
CODING_CONCEPT = 'coding_concept'     # Format 3: direct conceptual coding question
CODING_DEBUG = 'coding_debug'         # Format 4: find the bug in a snippet + explain the fix

CODING_FORMATS = [CODING_SCENARIO, CODING_LOGIC, CODING_CONCEPT, CODING_DEBUG]

# Only this format carries a code snippet to display alongside the question.
CODING_FORMATS_WITH_SNIPPET = {CODING_DEBUG}


def is_coding_format(question_type):
    return (question_type or '').strip().lower() in CODING_FORMATS


# Per-question answer time budget in seconds, keyed by question type (Timer feature §2).
# Every main-question type gets a flat 4 minutes (240s) — previously varied by type
# (120s/180s/240s/300s/600s), unified per a direct product decision to keep the whole
# interview's per-question pacing predictable regardless of question type.
QUESTION_TIME_LIMITS = {
    'conceptual': 240,
    'hr': 240,
    'behavioral': 240,
    'scenario': 240,
    'coding': 240,  # legacy type, kept so pre-existing questions keep their budget
    CODING_CONCEPT: 240,
    CODING_LOGIC: 240,
    CODING_DEBUG: 240,
    CODING_SCENARIO: 240,
    'coding_sandbox': 240,
    # MCQ round (§ MCQ): 10 questions, 1 minute each, appended after the main questions.
    'mcq': 60,
}
DEFAULT_QUESTION_TIME_LIMIT = 240


def question_time_limit(question_type):
    return QUESTION_TIME_LIMITS.get((question_type or '').strip().lower(), DEFAULT_QUESTION_TIME_LIMIT)

_CNIC_RE = re.compile(r'^\d{13}$')


def normalize_cnic(raw):
    """Validate a Pakistani CNIC (13 digits, optionally dashed 5-7-1) and return
    it in canonical dashed form ``12345-1234567-1``, or None if invalid."""
    digits = re.sub(r'[\s-]', '', str(raw or ''))
    if not _CNIC_RE.match(digits):
        return None
    return f'{digits[:5]}-{digits[5:12]}-{digits[12]}'


def generate_otp(length=10):
    """Cryptographically random one-time password (unambiguous characters only)."""
    alphabet = ''.join(c for c in (string.ascii_uppercase + string.digits) if c not in 'O0I1L')
    return ''.join(secrets.choice(alphabet) for _ in range(length))
