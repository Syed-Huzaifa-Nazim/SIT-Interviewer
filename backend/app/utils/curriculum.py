"""The single place that maps an interview CATEGORY (what an admin picks, what a candidate's
User.course_category holds) to a CURRICULUM COURSE row (app/models/models.py's
CurriculumCourse/Module/Topic, imported once by scripts/import_curriculum.py).

WHY ONE MAPPING INSTEAD OF MATCHING NAMES EVERYWHERE
-----------------------------------------------------
A category's display name and a curriculum course's slug are two different strings that
happen to describe the same thing. Comparing them by name in five different files is exactly
how one of those five silently stops matching the day either string changes — this module is
the only place that association is written down, so a rename is a one-line fix instead of a
hunt.

WHICH CATEGORIES HAVE CURRICULUM AT ALL
-----------------------------------------
Only the 5 SMIT curriculum tracks (app/utils/interview_types.py's SMIT_TYPES — their category
strings all carry the " — SMIT" suffix). Instructor and Resume-Based interviews are NOT
curriculum-driven — Instructor uses its own competency question set, Resume-Based is driven
entirely by the candidate's own CV — and NONE of the 6 pre-existing categories map to
anything here, on purpose: a candidate on "AI", "Cloud & Data Engineering", or any other
pre-existing category falls through to exactly the same non-curriculum question generation
that existed before the SMIT curriculum feature was ever built. This is what makes "the old
system continues exactly as before" true by construction rather than by a separate branch
that has to be kept in sync — is_curriculum_category() below is false for every pre-existing
category, permanently.
"""

from app.utils.interview_types import SMIT_TYPES

# category display name (a SMIT_TYPES category, e.g. "AI & Data Science — SMIT") -> curriculum_courses.slug
CATEGORY_TO_CURRICULUM_SLUG = {t.category: t.curriculum_slug for t in SMIT_TYPES}


def is_curriculum_category(category):
    return (category or '') in CATEGORY_TO_CURRICULUM_SLUG


def curriculum_slug_for_category(category):
    """The matching curriculum course's slug, or None (Instructor, Resume-Based, a legacy
    category, or anything not in the map — all of which mean "no curriculum for this")."""
    return CATEGORY_TO_CURRICULUM_SLUG.get(category or '')


def get_curriculum_course(category):
    """The CurriculumCourse row for this category, or None. A None here is not an error —
    the caller (question generation) must fall back to its existing non-curriculum behavior,
    same as if the course simply hadn't been imported yet."""
    slug = curriculum_slug_for_category(category)
    if not slug:
        return None
    from app.models import CurriculumCourse
    return CurriculumCourse.query.filter_by(slug=slug, is_active=True).first()


def build_curriculum_context(category, max_modules=None):
    """A compact, prompt-ready summary of one category's curriculum: which modules exist,
    and their exact topic names where the source page ever exposed them. Read once per
    interview (at /interviews/start, not per-question) and handed to MixtralService as extra
    grounding — see MixtralService.generate_questions' curriculum_context parameter.

    Returns None when there is nothing to ground on (no matching course imported yet, or the
    course has no active modules) — the caller must treat that exactly like a category with
    no curriculum at all, never as an error that blocks the interview.

    Shape:
        {
            "course_label": "AI & Data Science",
            "modules": [
                {"name": "Python Foundations", "topics": ["...", "..."]},   # exact topics
                {"name": "Machine Learning", "topics": []},                 # name-only module
            ],
        }
    A module with an empty "topics" list still belongs in the context — its NAME is the only
    scope information the source ever published for it, and the prompt is instructed to work
    from that name rather than treat the module as unusable.
    """
    course = get_curriculum_course(category)
    if not course:
        return None

    modules = [m for m in course.modules if m.is_active]
    if max_modules:
        modules = modules[:max_modules]
    if not modules:
        return None

    return {
        'course_label': course.ui_label,
        'modules': [
            {
                'name': m.module_name,
                'topics': [t.topic_name for t in m.topics],
            }
            for m in modules
        ],
    }


# Curriculum-eligible for verbal questions but NOT for the coding-sandbox opener — a
# graphic-design or UI/UX candidate has no reason to see a "Two Sum"-style coding exercise
# (curriculum spec §26). Instructor/Resume-Based are handled separately at the call site
# (they were never gated by category here in the first place) and are untouched by this set.
# Deliberately only the two SMIT design tracks — the pre-existing "Graphics and UI/UX Design"
# category was never gated out of the sandbox before this feature existed and must not start
# being gated now, per "the old system continues exactly as before".
NO_CODING_SANDBOX_CATEGORIES = {t.category for t in SMIT_TYPES if not t.sandbox_eligible}


def sandbox_eligible_category(category):
    return (category or '') not in NO_CODING_SANDBOX_CATEGORIES


def company_allows_category(company_id, category):
    """Whether a company (by id) may invite a candidate under `category` at all — the Super
    Admin's per-company "Interview Access" control (Company.allowed_interview_types).

    Covers every SIGNUP_CATEGORIES value, not just the 5 curriculum tracks — a company can
    also be restricted from Instructor or Resume-Based invites, which is why this lives as
    its own function rather than folded into the curriculum-only helpers above.

    True when company_id is missing/unknown — matching every other "no company yet" case in
    this codebase (AdminScope, the default-company signup flow) that treats an absent
    company as unrestricted rather than as a hard block nobody can get past.
    """
    if not company_id:
        return True
    from app.models import Company
    company = Company.query.get(company_id)
    if not company:
        return True
    return company.allows_interview_type(category)


def curriculum_context_to_prompt_text(context):
    """Render build_curriculum_context's dict as the plain-text block the LLM prompt embeds.
    Kept separate from the dict shape above so a future non-text consumer (e.g. a debug
    endpoint) can use the structured form without re-parsing prose."""
    if not context:
        return ''
    lines = [f"Approved curriculum for {context['course_label']}:"]
    for module in context['modules']:
        if module['topics']:
            topic_list = '; '.join(module['topics'])
            lines.append(f"- {module['name']}: {topic_list}")
        else:
            lines.append(f"- {module['name']} (topic scope implied by this module name only)")
    return '\n'.join(lines)
