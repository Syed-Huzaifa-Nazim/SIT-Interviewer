"""Curriculum-based interview questions: the category<->course mapping (app/utils/
curriculum.py) and the one-time import script's own validation logic.

WHAT ISN'T TESTED HERE
------------------------
The import script's actual DB writes (upsert/idempotency) are NOT exercised in this suite —
this project's tests are hard-blocked from touching the real database (see conftest.py),
and the curriculum tables are no exception. That behavior was verified by hand: running
`python scripts/import_curriculum.py` twice against the real DB and confirming identical
row counts both times (5 courses / 33 modules / 50 topic rows), with no duplicates.
"""

import json
import os

import pytest

from app.utils.candidate import (
    COURSE_CATEGORIES, EXISTING_COURSE_CATEGORIES, SMIT_COURSE_CATEGORIES,
    INSTRUCTOR_CATEGORY, RESUME_CATEGORY,
)
from app.utils.interview_types import SMIT_SUFFIX
from app.utils.curriculum import (
    CATEGORY_TO_CURRICULUM_SLUG,
    is_curriculum_category,
    curriculum_slug_for_category,
    curriculum_context_to_prompt_text,
    sandbox_eligible_category,
    NO_CODING_SANDBOX_CATEGORIES,
)

DATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'data', 'smit_curriculum_official_scrape.json',
)

GRAPHIC_DESIGN_SMIT = 'Graphic Designing With AI' + SMIT_SUFFIX
UIUX_SMIT = 'UI/UX Design With AI' + SMIT_SUFFIX


# --------------------------------------------------------------------------- category mapping

class TestCategoryMapping:
    def test_every_smit_category_has_a_curriculum_slug(self):
        """The 5 SMIT curriculum tracks (not Instructor/Resume-Based, not any of the 6
        pre-existing categories) must all be mappable — a category with no mapping silently
        gets no curriculum grounding at interview time, which is exactly the kind of gap
        that passes review and is only noticed when a candidate gets generic questions."""
        for category in SMIT_COURSE_CATEGORIES:
            assert category in CATEGORY_TO_CURRICULUM_SLUG, (
                f"'{category}' is a SMIT course category but has no curriculum slug mapping"
            )

    def test_no_extra_slugs_beyond_the_five_smit_tracks(self):
        assert set(CATEGORY_TO_CURRICULUM_SLUG.keys()) == set(SMIT_COURSE_CATEGORIES)

    def test_slugs_are_unique(self):
        slugs = list(CATEGORY_TO_CURRICULUM_SLUG.values())
        assert len(slugs) == len(set(slugs))

    def test_graphic_design_and_ui_ux_map_to_different_courses(self):
        """The one rule the spec is strictest about: these must never collapse into one."""
        assert (
            CATEGORY_TO_CURRICULUM_SLUG[GRAPHIC_DESIGN_SMIT]
            != CATEGORY_TO_CURRICULUM_SLUG[UIUX_SMIT]
        )

    def test_is_curriculum_category_true_for_the_five_smit_tracks(self):
        for category in SMIT_COURSE_CATEGORIES:
            assert is_curriculum_category(category)

    @pytest.mark.parametrize('category', [INSTRUCTOR_CATEGORY, RESUME_CATEGORY, '', None, 'Not A Real Category'])
    def test_is_curriculum_category_false_for_non_course_categories(self, category):
        """Instructor and Resume-Based interviews are NOT curriculum-driven by design."""
        assert not is_curriculum_category(category)

    def test_is_curriculum_category_false_for_every_pre_existing_category(self):
        """The old system continues exactly as before: none of the 6 pre-existing categories
        (including the two that share a SMIT track's display name minus the suffix) are
        curriculum-driven — a candidate on one of these falls through to the same
        non-curriculum question generation that existed before this feature was built."""
        for category in EXISTING_COURSE_CATEGORIES:
            assert not is_curriculum_category(category)

    def test_curriculum_slug_for_category_returns_none_for_non_curriculum(self):
        assert curriculum_slug_for_category(INSTRUCTOR_CATEGORY) is None
        assert curriculum_slug_for_category(RESUME_CATEGORY) is None
        for category in EXISTING_COURSE_CATEGORIES:
            assert curriculum_slug_for_category(category) is None


# --------------------------------------------------------------------------- prompt rendering

class TestCurriculumContextToPromptText:
    def test_empty_context_renders_to_empty_string(self):
        assert curriculum_context_to_prompt_text(None) == ''
        assert curriculum_context_to_prompt_text({}) == ''

    def test_a_module_with_exact_topics_lists_them(self):
        context = {
            'course_label': 'AI & Data Science',
            'modules': [{'name': 'Python Foundations', 'topics': ['Loops', 'Functions']}],
        }
        text = curriculum_context_to_prompt_text(context)
        assert 'AI & Data Science' in text
        assert 'Python Foundations' in text
        assert 'Loops' in text and 'Functions' in text

    def test_a_module_with_no_exact_topics_still_appears_by_name(self):
        """A module the source page never listed topics for must still narrow the question
        to its own scope — dropping it silently would widen generation beyond the curriculum,
        which is the one thing this feature exists to prevent."""
        context = {
            'course_label': 'Cloud & Data Engineering',
            'modules': [{'name': 'Machine Learning', 'topics': []}],
        }
        text = curriculum_context_to_prompt_text(context)
        assert 'Machine Learning' in text


# --------------------------------------------------------------------------- coding sandbox

class TestSandboxEligibleCategory:
    def test_smit_design_categories_are_excluded(self):
        assert not sandbox_eligible_category(GRAPHIC_DESIGN_SMIT)
        assert not sandbox_eligible_category(UIUX_SMIT)

    def test_smit_technical_categories_remain_eligible(self):
        assert sandbox_eligible_category('AI & Data Science' + SMIT_SUFFIX)
        assert sandbox_eligible_category('Cloud & Data Engineering' + SMIT_SUFFIX)
        assert sandbox_eligible_category('Web and Mobile App Development' + SMIT_SUFFIX)

    def test_the_pre_existing_design_category_is_untouched(self):
        """'Graphics and UI/UX Design' (the old, combined category) was never gated out of
        the sandbox before this feature existed and must not start being gated now — only
        its two NEW split-out SMIT counterparts are sandbox-ineligible."""
        assert sandbox_eligible_category('Graphics and UI/UX Design')

    def test_no_category_or_unknown_category_is_eligible(self):
        """Instructor/Resume-Based were never gated by category to begin with — this set
        must never accidentally start excluding something it wasn't meant to."""
        assert sandbox_eligible_category(None)
        assert sandbox_eligible_category('')
        assert sandbox_eligible_category('Instructor')
        assert sandbox_eligible_category('Resume-Based Interview')

    def test_the_exclusion_set_is_exactly_the_two_smit_design_tracks(self):
        assert NO_CODING_SANDBOX_CATEGORIES == {GRAPHIC_DESIGN_SMIT, UIUX_SMIT}


# --------------------------------------------------------------------- AI prompt integration

class TestGenerateQuestionsCurriculumPrompt:
    """Proves the curriculum text actually reaches the LLM prompt, not just that
    generate_questions accepts the parameter without crashing."""

    def test_curriculum_context_is_embedded_in_the_user_prompt(self, monkeypatch):
        from app.ai.mixtral.mixtral_service import MixtralService

        captured = {}

        def fake_call_llm(system_prompt, user_prompt, temperature=0.3, model=None, max_retries=None):
            captured['system'] = system_prompt
            captured['user'] = user_prompt
            return {'questions': [
                {'question_text': f'Q{i}', 'question_type': 'conceptual', 'code_snippet': ''}
                for i in range(5)
            ]}

        monkeypatch.setattr(MixtralService, '_call_llm', staticmethod(fake_call_llm))

        marker = 'Approved curriculum for AI & Data Science:\n- Python Foundations: Loops; Functions'
        MixtralService.generate_questions(
            interview_type='technical', job_role='AI Engineer', experience_level='Entry',
            difficulty='Medium', num_questions=5, curriculum_context=marker,
        )

        assert marker in captured['user']
        assert 'CURRICULUM LOCK' in captured['system']

    def test_no_curriculum_context_leaves_the_prompt_unchanged(self, monkeypatch):
        """A category with nothing imported yet (or Instructor/Resume-Based/a legacy value)
        must generate exactly as it did before this feature existed."""
        from app.ai.mixtral.mixtral_service import MixtralService

        captured = {}

        def fake_call_llm(system_prompt, user_prompt, temperature=0.3, model=None, max_retries=None):
            captured['system'] = system_prompt
            captured['user'] = user_prompt
            return {'questions': [
                {'question_text': f'Q{i}', 'question_type': 'conceptual', 'code_snippet': ''}
                for i in range(5)
            ]}

        monkeypatch.setattr(MixtralService, '_call_llm', staticmethod(fake_call_llm))

        MixtralService.generate_questions(
            interview_type='technical', job_role='React Developer', experience_level='Entry',
            difficulty='Medium', num_questions=5, curriculum_context=None,
        )

        assert 'CURRICULUM LOCK' not in captured['system']
        assert 'Approved curriculum' not in captured['user']


# --------------------------------------------------------------------------- source data file

@pytest.fixture(scope='module')
def data():
    with open(DATA_FILE, encoding='utf-8') as f:
        return json.load(f)


class TestCurriculumSourceFile:
    """Pins the exact numbers the spec's own validation summary names — a hand edit to the
    JSON (a typo'd topic count, an accidentally duplicated module) is caught here before it
    ever reaches the database."""

    def test_five_courses(self, data):
        assert len(data['courses']) == 5

    def test_every_course_maps_to_a_curriculum_slug(self, data):
        """The JSON's own 'ui_label' is the SMIT course's base name (no " — SMIT" marker —
        that suffix is an interview-category-level disambiguator, not part of the course
        data itself). It must match exactly one SMIT interview type's category once that
        marker is stripped back off."""
        base_labels = {cat[: -len(SMIT_SUFFIX)]: slug for cat, slug in CATEGORY_TO_CURRICULUM_SLUG.items()}
        for course in data['courses']:
            assert course['ui_label'] in base_labels

    def test_thirty_three_modules_total(self, data):
        total = sum(len(c['modules']) for c in data['courses'])
        assert total == 33

    def test_official_topic_count_sums_to_289(self, data):
        total = sum(
            m.get('official_topic_count') or 0
            for c in data['courses'] for m in c['modules']
        )
        assert total == 289

    def test_fifty_exact_topic_names_exposed(self, data):
        total = sum(
            len(m.get('topics_exposed_on_public_page') or [])
            for c in data['courses'] for m in c['modules']
        )
        assert total == 50

    def test_no_module_claims_more_exact_topics_than_its_official_count(self, data):
        """A module publishing 8 exact topic names while claiming an official count of 5
        would mean the two numbers in the source itself disagree — worth failing loudly on
        rather than importing silently."""
        for course in data['courses']:
            for module in course['modules']:
                exact = len(module.get('topics_exposed_on_public_page') or [])
                official = module.get('official_topic_count') or 0
                assert exact <= official, (
                    f"{course['ui_label']} / {module['module_name']}: "
                    f"{exact} exact topics but official_topic_count is {official}"
                )

    def test_graphic_design_and_ui_ux_are_separate_entries(self, data):
        labels = [c['ui_label'] for c in data['courses']]
        assert 'Graphic Designing With AI' in labels
        assert 'UI/UX Design With AI' in labels
        assert labels.count('Graphic Designing With AI') == 1
        assert labels.count('UI/UX Design With AI') == 1
