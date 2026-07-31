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
# Confirmed defaults: conceptual / HR / behavioral 120s, scenario 180s, coding 300s.
# The coding formats are verbal, so they get talk-time budgets rather than the 300s
# write-code budget: concept is a quick recall answer, logic/debug need reasoning aloud,
# and a full scenario walkthrough gets the most room.
QUESTION_TIME_LIMITS = {
    'conceptual': 120,
    'hr': 120,
    'behavioral': 120,
    'scenario': 180,
    'coding': 300,  # legacy type, kept so pre-existing questions keep their budget
    CODING_CONCEPT: 120,
    CODING_LOGIC: 180,
    CODING_DEBUG: 180,
    CODING_SCENARIO: 240,
    # Hands-on sandbox exercise: the candidate actually writes and runs code here rather
    # than talking through it, so it needs a materially larger budget than a verbal question.
    'coding_sandbox': 600,
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
