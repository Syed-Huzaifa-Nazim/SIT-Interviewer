"""The one place that lists every value ``User.course_category`` can hold — split into two
permanently-coexisting groups that must never be confused with each other:

- EXISTING_TYPES: the 6 interview types that existed before the SMIT curriculum feature.
  Their category strings, job roles and sandbox-eligibility are copied byte-for-byte from
  what this codebase used before that feature — nothing about them changes, ever, as a side
  effect of anything curriculum-related.
- SMIT_TYPES: 5 new, additional interview types, each grounded in one imported SMIT
  curriculum course (app/utils/curriculum.py). They run ALONGSIDE the existing 6, never in
  place of them.

WHY THE OLD AND NEW STRINGS ARE NEVER THE SAME
------------------------------------------------
Two SMIT display names ("Cloud & Data Engineering", "Web and Mobile App Development") would
otherwise be textually identical to two existing category names. Rather than storing an
opaque ID in a second column or a separate translation table — one more place for the two to
drift apart — every SMIT category's stored/display value carries a permanent " — SMIT"
suffix, e.g. "Cloud & Data Engineering — SMIT". That full string IS this type's stable
identifier: it is exactly what User.course_category holds, exactly what every dropdown and
admin table shows, and exactly what every equality check in this codebase compares against.
Because the two groups' strings are never equal even when their subject matter is, comparing
raw text (as this whole codebase already does everywhere via SIGNUP_CATEGORIES /
CATEGORY_JOB_ROLES / is_curriculum_category) can never confuse one for the other. No parallel
ID column, no lookup layer, no risk of the two silently drifting apart.

Do not strip the " — SMIT" suffix to "normalize" a category back to its old-style name
anywhere — that would recreate the exact collision this design exists to avoid. If code needs
to know whether a category is a SMIT track, call is_smit_category(category); never infer it
from partial/fuzzy text matching.
"""

from collections import namedtuple

InterviewType = namedtuple('InterviewType', [
    'category',          # exact string stored in User.course_category / shown in the UI
    'group',             # 'existing' | 'smit'
    'job_role',          # CATEGORY_JOB_ROLES value — must be in the domain classifier's preset whitelist
    'curriculum_slug',   # CurriculumCourse.slug this type is grounded in, or None
    'sandbox_eligible',  # may a Completed-course interview under this category open with a coding sandbox?
    'statusless',        # True: no ongoing/completed course status (Instructor, Resume-Based)
])

SMIT_SUFFIX = ' — SMIT'

# The 6 pre-existing interview types. MUST CONTINUE EXACTLY AS BEFORE — do not rename, split,
# or otherwise alter any field below without an explicit, separate decision to do so; this
# table existing at all must never be read as license to "clean up" these values.
EXISTING_TYPES = [
    InterviewType('AI', 'existing', 'AI Engineer', None, True, False),
    InterviewType('Cloud & Data Engineering', 'existing', 'Cloud & Data Engineer', None, True, False),
    InterviewType('Web and Mobile App Development', 'existing', 'Web & Mobile App Developer', None, True, False),
    InterviewType('Graphics and UI/UX Design', 'existing', 'UI/UX Designer', None, True, False),
    InterviewType('Instructor', 'existing', 'Instructor', None, True, True),
    InterviewType('Resume-Based Interview', 'existing', 'Software Engineer', None, True, True),
]

# The 5 new SMIT curriculum tracks — additional, parallel interview types. Each maps to one
# CurriculumCourse row imported (once, offline) by scripts/import_curriculum.py; see
# app/utils/curriculum.py for how curriculum_slug turns into actual module/topic content.
# Graphic Designing / UI/UX Design With AI are not sandbox-eligible (curriculum spec) — a
# design candidate has no reason to see a "Two Sum"-style coding exercise.
SMIT_TYPES = [
    InterviewType('AI & Data Science' + SMIT_SUFFIX, 'smit', 'AI Engineer', 'ai-data-science', True, False),
    InterviewType('Cloud & Data Engineering' + SMIT_SUFFIX, 'smit', 'Cloud & Data Engineer', 'cloud-data-engineering', True, False),
    InterviewType('Web and Mobile App Development' + SMIT_SUFFIX, 'smit', 'Web & Mobile App Developer', 'web-mobile-development', True, False),
    InterviewType('Graphic Designing With AI' + SMIT_SUFFIX, 'smit', 'Graphic Designer', 'graphic-designing-ai', False, False),
    InterviewType('UI/UX Design With AI' + SMIT_SUFFIX, 'smit', 'UI/UX Designer', 'ui-ux-design-ai', False, False),
]

ALL_TYPES = EXISTING_TYPES + SMIT_TYPES

BY_CATEGORY = {t.category: t for t in ALL_TYPES}
assert len(BY_CATEGORY) == len(ALL_TYPES), "duplicate interview-type category string in the registry"


def get_type(category):
    """The InterviewType row for this exact category string, or None."""
    return BY_CATEGORY.get(category or '')


def is_known_category(category):
    return (category or '') in BY_CATEGORY


def is_smit_category(category):
    t = BY_CATEGORY.get(category or '')
    return bool(t and t.group == 'smit')


def display_label(category):
    """The category string itself already IS the display label (see module docstring) — this
    exists only so call sites that want to be explicit about rendering don't have to know
    that fact. Falls back to the raw value for a category not in the registry (e.g. a
    genuinely retired legacy string still sitting on an old row), same as every other
    lookup here treats an unknown category: shown as-is, never hidden or replaced."""
    return category or ''
