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
Only the 5 course-based categories (app/utils/candidate.py's COURSE_CATEGORIES). Instructor
and Resume-Based interviews are NOT curriculum-driven — Instructor uses its own competency
question set, Resume-Based is driven entirely by the candidate's own CV — and neither
LEGACY_COURSE_CATEGORIES value maps to anything here on purpose: a candidate still on the old
"AI" or "Graphics and UI/UX Design" string falls through to today's non-curriculum question
generation exactly as they did before this feature existed, rather than being silently
reassigned to a guessed course.
"""

# category display name (COURSE_CATEGORIES) -> curriculum_courses.slug
CATEGORY_TO_CURRICULUM_SLUG = {
    'AI & Data Science': 'ai-data-science',
    'Cloud & Data Engineering': 'cloud-data-engineering',
    'Web and Mobile App Development': 'web-mobile-development',
    'Graphic Designing With AI': 'graphic-designing-ai',
    'UI/UX Design With AI': 'ui-ux-design-ai',
}


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
