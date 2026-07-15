"""Shared helpers for the CNIC/category-based candidate system (§2)."""
import re
import secrets
import string

# Course categories tied to the Ongoing/Completed course-status logic (§2.1).
COURSE_CATEGORIES = [
    'AI',
    'Cloud & Data Engineering',
    'Web and Mobile App Development',
    'Graphics and UI/UX Design',
]

# The Instructor category (Update §2) is NOT a course — it has no course-status and
# always follows the one-time-OTP official-interview flow, mirroring Completed-course
# candidates but with an instructor-specific competency question set (Update §3).
INSTRUCTOR_CATEGORY = 'Instructor'

# Everything selectable at signup / editable by an admin.
SIGNUP_CATEGORIES = COURSE_CATEGORIES + [INSTRUCTOR_CATEGORY]

# Canonical interview job role per category, used when auto-creating the official
# interview for completed-course candidates (§3.3). Every value must be accepted
# by the domain classifier's preset whitelist so the session can never be rejected.
CATEGORY_JOB_ROLES = {
    'AI': 'AI Engineer',
    'Cloud & Data Engineering': 'Cloud & Data Engineer',
    'Web and Mobile App Development': 'Web & Mobile App Developer',
    'Graphics and UI/UX Design': 'UI/UX Designer',
    INSTRUCTOR_CATEGORY: 'Instructor',
}

COURSE_STATUSES = ['ongoing', 'completed']


def is_instructor_category(category):
    return (category or '').strip().lower() == INSTRUCTOR_CATEGORY.lower()


# Per-question answer time budget in seconds, keyed by question type (Timer feature §2).
# Confirmed defaults: conceptual / HR / behavioral 120s, scenario 180s, coding 300s.
QUESTION_TIME_LIMITS = {
    'conceptual': 120,
    'hr': 120,
    'behavioral': 120,
    'scenario': 180,
    'coding': 300,
}
DEFAULT_QUESTION_TIME_LIMIT = 120


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
