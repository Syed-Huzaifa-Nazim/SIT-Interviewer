"""The stable interview-type registry (app/utils/interview_types.py) — the September 2026
spec's central requirement: the 6 pre-existing interview types continue completely
unmodified, and the 5 new SMIT curriculum types are added alongside them, never confused
with a same-named pre-existing type.
"""

from app.utils.interview_types import (
    EXISTING_TYPES, SMIT_TYPES, ALL_TYPES, BY_CATEGORY, SMIT_SUFFIX,
    get_type, is_known_category, is_smit_category,
)
from app.utils.candidate import SIGNUP_CATEGORIES, CATEGORY_JOB_ROLES, STATUSLESS_CATEGORIES


class TestRegistryShape:
    def test_six_existing_and_five_smit_types(self):
        assert len(EXISTING_TYPES) == 6
        assert len(SMIT_TYPES) == 5
        assert len(ALL_TYPES) == 11

    def test_every_category_string_is_unique(self):
        categories = [t.category for t in ALL_TYPES]
        assert len(categories) == len(set(categories))

    def test_signup_categories_matches_the_registry_exactly(self):
        assert set(SIGNUP_CATEGORIES) == set(BY_CATEGORY.keys())
        assert len(SIGNUP_CATEGORIES) == 11


class TestExistingTypesAreUnchanged:
    """These 6 values, and only these 6, are what every pre-existing candidate row, email,
    report and admin view was already built around — they must never be renamed, removed,
    or altered as a side effect of adding the SMIT tracks."""

    EXPECTED = {
        'AI': 'AI Engineer',
        'Cloud & Data Engineering': 'Cloud & Data Engineer',
        'Web and Mobile App Development': 'Web & Mobile App Developer',
        'Graphics and UI/UX Design': 'UI/UX Designer',
        'Instructor': 'Instructor',
        'Resume-Based Interview': 'Software Engineer',
    }

    def test_exact_category_strings_and_job_roles(self):
        for category, job_role in self.EXPECTED.items():
            t = get_type(category)
            assert t is not None, f"'{category}' missing from the registry"
            assert t.group == 'existing'
            assert t.job_role == job_role
            assert CATEGORY_JOB_ROLES[category] == job_role

    def test_none_of_them_carry_the_smit_suffix(self):
        for category in self.EXPECTED:
            assert not category.endswith(SMIT_SUFFIX)
            assert not is_smit_category(category)

    def test_only_instructor_and_resume_based_are_statusless(self):
        assert STATUSLESS_CATEGORIES == {'Instructor', 'Resume-Based Interview'}


class TestSmitTypesAreAdditive:
    EXPECTED_BASE_LABELS = {
        'AI & Data Science', 'Cloud & Data Engineering', 'Web and Mobile App Development',
        'Graphic Designing With AI', 'UI/UX Design With AI',
    }

    def test_every_smit_category_carries_the_suffix(self):
        for t in SMIT_TYPES:
            assert t.category.endswith(SMIT_SUFFIX)
            assert is_smit_category(t.category)
            assert t.category[: -len(SMIT_SUFFIX)] in self.EXPECTED_BASE_LABELS

    def test_every_smit_type_has_a_curriculum_slug(self):
        for t in SMIT_TYPES:
            assert t.curriculum_slug

    def test_design_smit_types_are_not_sandbox_eligible(self):
        design = {t for t in SMIT_TYPES if 'Design' in t.category}
        assert len(design) == 2
        assert all(not t.sandbox_eligible for t in design)

    def test_no_smit_type_is_statusless(self):
        assert all(not t.statusless for t in SMIT_TYPES)


class TestOldAndSmitNamesakesStayDistinct:
    """Two SMIT category strings would be identical to two pre-existing ones without the
    suffix — the exact collision the whole registry design exists to prevent."""

    NAMESAKE_BASES = ['Cloud & Data Engineering', 'Web and Mobile App Development']

    def test_the_namesake_pairs_are_two_distinct_registry_entries(self):
        for base in self.NAMESAKE_BASES:
            old_type = get_type(base)
            smit_type = get_type(base + SMIT_SUFFIX)
            assert old_type is not None and smit_type is not None
            assert old_type is not smit_type
            assert old_type.group == 'existing'
            assert smit_type.group == 'smit'
            assert old_type.category != smit_type.category

    def test_an_unsuffixed_lookup_never_returns_a_smit_type(self):
        for base in self.NAMESAKE_BASES:
            assert get_type(base).group == 'existing'

    def test_is_known_category_and_unknown_strings(self):
        assert is_known_category('AI')
        assert is_known_category('AI & Data Science — SMIT')
        assert not is_known_category('AI & Data Science')  # missing the marker — not a real category
        assert not is_known_category('totally made up')
        assert not is_known_category(None)
