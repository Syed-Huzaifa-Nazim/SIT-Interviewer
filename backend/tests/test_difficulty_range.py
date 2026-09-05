"""Question Difficulty Range: the centralized resolution utility, and its two consumers
that don't need a live database — the coding-sandbox opener and the Bulk Email Module's row
validation/normalization. `/interviews/start`'s own override behavior is exercised by reading
`User.question_difficulty_range` there, which this module's `resolve_*` helpers back.
"""

import pytest

from app.utils.difficulty import (
    DIFFICULTY_RANGES,
    is_valid_range,
    range_choices,
    progressive_sequence,
    resolve_prompt_difficulty,
    resolve_storage_label,
    resolve_sandbox_difficulties,
)


class TestIsValidRange:
    def test_every_declared_range_is_valid(self):
        for key in DIFFICULTY_RANGES:
            assert is_valid_range(key)

    def test_none_and_empty_are_not_valid(self):
        assert not is_valid_range(None)
        assert not is_valid_range('')

    def test_an_unknown_value_is_not_valid(self):
        assert not is_valid_range('IMPOSSIBLE_TO_IMPOSSIBLE')

    def test_is_case_sensitive_to_the_stored_enum_form(self):
        # Callers normalize to uppercase before this ever sees the value (admin_routes,
        # bulk_email_routes, v1_routes all .strip().upper() first) — this only guards that
        # the check itself doesn't silently accept a lowercase variant no caller intended.
        assert not is_valid_range('easy_to_medium')


class TestRangeChoices:
    def test_returns_one_entry_per_range_with_a_label(self):
        choices = range_choices()
        assert {c['value'] for c in choices} == set(DIFFICULTY_RANGES)
        assert all(c['label'] for c in choices)


class TestProgressiveSequence:
    def test_never_decreases_in_severity(self):
        order = {'Easy': 0, 'Medium': 1, 'Hard': 2}
        for key in DIFFICULTY_RANGES:
            seq = progressive_sequence(key, 5)
            levels = [order[d] for d in seq]
            assert levels == sorted(levels)

    def test_covers_the_full_range_when_there_are_enough_questions(self):
        seq = progressive_sequence('EASY_TO_HARD', 5)
        assert seq[0] == 'Easy'
        assert seq[-1] == 'Hard'
        assert 'Medium' in seq

    def test_a_single_question_gets_the_easiest_level(self):
        assert progressive_sequence('EASY_TO_MEDIUM', 1) == ['Easy']

    def test_an_invalid_range_returns_empty(self):
        assert progressive_sequence(None, 5) == []
        assert progressive_sequence('NOT_A_RANGE', 5) == []

    def test_zero_questions_returns_empty(self):
        assert progressive_sequence('EASY_TO_HARD', 0) == []


class TestResolvePromptDifficulty:
    def test_no_range_returns_none_so_callers_fall_back_to_legacy_behavior(self):
        assert resolve_prompt_difficulty(None, 5) is None
        assert resolve_prompt_difficulty('', 5) is None

    def test_a_range_produces_a_per_question_instruction(self):
        text = resolve_prompt_difficulty('EASY_TO_HARD', 5)
        assert 'Q1: Easy' in text
        assert 'Q5: Hard' in text
        assert 'Easy to Hard' in text


class TestResolveStorageLabel:
    def test_no_range_returns_none(self):
        assert resolve_storage_label(None) is None

    def test_a_range_returns_its_human_label(self):
        assert resolve_storage_label('MEDIUM_TO_HARD') == 'Medium to Hard'

    def test_label_fits_the_interviews_difficulty_column(self):
        # Interview.difficulty is db.String(50) — every label must fit comfortably.
        for key in DIFFICULTY_RANGES:
            assert len(resolve_storage_label(key)) <= 50


class TestResolveSandboxDifficulties:
    def test_no_range_means_no_restriction(self):
        assert resolve_sandbox_difficulties(None) is None

    def test_a_range_returns_its_levels_low_to_high(self):
        assert resolve_sandbox_difficulties('MEDIUM_TO_HARD') == ['Medium', 'Hard']


# ---------------------------------------------------------------------------------------
# Coding-sandbox opener: must not open a MEDIUM_TO_HARD candidate on an Easy problem
# ---------------------------------------------------------------------------------------

class TestPickOpeningProblemRespectsRange:
    def test_with_no_range_it_still_opens_easy_as_before(self):
        from app.coding.problem_bank import pick_opening_problem

        problem = pick_opening_problem(job_role='Python Developer')
        assert problem is not None
        assert problem['difficulty'] in ('Easy', 'Medium')

    def test_medium_to_hard_never_opens_on_easy(self):
        from app.coding.problem_bank import pick_opening_problem

        problem = pick_opening_problem(
            job_role='Python Developer',
            allowed_difficulties=['Medium', 'Hard'],
        )
        assert problem is not None
        assert problem['difficulty'] in ('Medium', 'Hard')

    def test_easy_to_medium_never_opens_on_hard(self):
        from app.coding.problem_bank import pick_opening_problem

        problem = pick_opening_problem(
            job_role='Python Developer',
            allowed_difficulties=['Easy', 'Medium'],
        )
        assert problem is not None
        assert problem['difficulty'] in ('Easy', 'Medium')

    def test_an_empty_pool_at_the_requested_levels_falls_back_rather_than_returning_none(self):
        from app.coding.problem_bank import pick_opening_problem

        # SQL problems are Medium/Hard only in this bank — asking for an Easy SQL opener
        # must not return None (which would silently drop the sandbox opener altogether).
        problem = pick_opening_problem(
            job_role='Data Analyst',
            preferred_language='sql',
            allowed_difficulties=['Easy'],
        )
        assert problem is not None


# ---------------------------------------------------------------------------------------
# Bulk Email Module row validation/normalization
# ---------------------------------------------------------------------------------------

class _NoExistingAccounts:
    """Stand-in for User.query: every CNIC/email lookup comes back empty, matching a fresh
    database — _validate_row's own duplicate-detection logic isn't what this test covers."""

    def filter_by(self, **kwargs):
        return self

    def first(self):
        return None


class TestBulkRowDifficultyRange:
    def test_a_row_with_no_difficulty_range_validates_as_before(self, monkeypatch):
        from app.models import User
        from app.routes.bulk_email_routes import _validate_row

        monkeypatch.setattr(User, 'query', _NoExistingAccounts())
        raw = {
            'name': 'Ali Khan', 'email': 'ali.difficulty.test@example.com',
            'cnic': '42101-1234567-1', 'category': 'AI & Data Science', 'course_status': 'completed',
        }
        normalized, errors = _validate_row(raw, set(), set())
        assert errors == []
        assert normalized['difficulty_range'] is None

    def test_a_valid_difficulty_range_is_normalized_uppercase(self, monkeypatch):
        from app.models import User
        from app.routes.bulk_email_routes import _validate_row

        monkeypatch.setattr(User, 'query', _NoExistingAccounts())
        raw = {
            'name': 'Sara Ahmed', 'email': 'sara.difficulty.test@example.com',
            'cnic': '35202-9876543-2', 'category': 'AI & Data Science', 'course_status': 'completed',
            'difficulty_range': 'easy_to_medium',
        }
        normalized, errors = _validate_row(raw, set(), set())
        assert errors == []
        assert normalized['difficulty_range'] == 'EASY_TO_MEDIUM'

    def test_an_invalid_difficulty_range_is_rejected(self, monkeypatch):
        from app.models import User
        from app.routes.bulk_email_routes import _validate_row

        monkeypatch.setattr(User, 'query', _NoExistingAccounts())
        raw = {
            'name': 'Bad Row', 'email': 'bad.difficulty.test@example.com',
            'cnic': '35202-1112223-3', 'category': 'AI & Data Science', 'course_status': 'completed',
            'difficulty_range': 'NOT_A_RANGE',
        }
        normalized, errors = _validate_row(raw, set(), set())
        assert normalized is None
        assert any('difficulty range' in e.lower() for e in errors)


class TestApplyBatchDifficultyDefault:
    def test_no_batch_default_leaves_rows_untouched(self):
        from app.routes.bulk_email_routes import _apply_batch_difficulty_default

        rows = [{'name': 'A'}, {'name': 'B', 'difficulty_range': 'EASY_TO_HARD'}]
        assert _apply_batch_difficulty_default(rows, None) == rows

    def test_batch_default_fills_only_rows_without_their_own(self):
        from app.routes.bulk_email_routes import _apply_batch_difficulty_default

        rows = [{'name': 'A'}, {'name': 'B', 'difficulty_range': 'EASY_TO_HARD'}]
        filled = _apply_batch_difficulty_default(rows, 'MEDIUM_TO_HARD')
        assert filled[0]['difficulty_range'] == 'MEDIUM_TO_HARD'
        # The row's own explicit choice is a per-row override and wins over the batch default.
        assert filled[1]['difficulty_range'] == 'EASY_TO_HARD'
