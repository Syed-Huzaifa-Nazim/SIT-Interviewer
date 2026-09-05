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

from app.utils.candidate import COURSE_CATEGORIES, LEGACY_COURSE_CATEGORIES, INSTRUCTOR_CATEGORY, RESUME_CATEGORY
from app.utils.curriculum import (
    CATEGORY_TO_CURRICULUM_SLUG,
    is_curriculum_category,
    curriculum_slug_for_category,
    curriculum_context_to_prompt_text,
)

DATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'data', 'smit_curriculum_official_scrape.json',
)


# --------------------------------------------------------------------------- category mapping

class TestCategoryMapping:
    def test_every_course_category_has_a_curriculum_slug(self):
        """The 5 curriculum-based categories (not Instructor/Resume-Based, not a legacy
        value) must all be mappable — a category with no mapping silently gets no
        curriculum grounding at interview time, which is exactly the kind of gap that
        passes review and is only noticed when a candidate gets generic questions."""
        for category in COURSE_CATEGORIES:
            assert category in CATEGORY_TO_CURRICULUM_SLUG, (
                f"'{category}' is in COURSE_CATEGORIES but has no curriculum slug mapping"
            )

    def test_no_extra_slugs_for_categories_that_no_longer_exist(self):
        assert set(CATEGORY_TO_CURRICULUM_SLUG.keys()) == set(COURSE_CATEGORIES)

    def test_slugs_are_unique(self):
        slugs = list(CATEGORY_TO_CURRICULUM_SLUG.values())
        assert len(slugs) == len(set(slugs))

    def test_graphic_design_and_ui_ux_map_to_different_courses(self):
        """The one rule the spec is strictest about: these must never collapse into one."""
        assert (
            CATEGORY_TO_CURRICULUM_SLUG['Graphic Designing With AI']
            != CATEGORY_TO_CURRICULUM_SLUG['UI/UX Design With AI']
        )

    def test_is_curriculum_category_true_for_the_five_tracks(self):
        for category in COURSE_CATEGORIES:
            assert is_curriculum_category(category)

    @pytest.mark.parametrize('category', [INSTRUCTOR_CATEGORY, RESUME_CATEGORY, *LEGACY_COURSE_CATEGORIES, '', None, 'Not A Real Category'])
    def test_is_curriculum_category_false_for_everything_else(self, category):
        """Instructor and Resume-Based interviews are NOT curriculum-driven by design, and a
        legacy category must NOT be silently guessed into one of the new tracks."""
        assert not is_curriculum_category(category)

    def test_curriculum_slug_for_category_returns_none_for_non_curriculum(self):
        assert curriculum_slug_for_category(INSTRUCTOR_CATEGORY) is None
        assert curriculum_slug_for_category(RESUME_CATEGORY) is None
        for legacy in LEGACY_COURSE_CATEGORIES:
            assert curriculum_slug_for_category(legacy) is None


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
        for course in data['courses']:
            assert course['ui_label'] in CATEGORY_TO_CURRICULUM_SLUG

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
