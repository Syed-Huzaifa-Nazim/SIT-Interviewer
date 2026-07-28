"""Coding sandbox execution tests (TEST_CASES.md §6 and §9).

The sandbox runs candidate code directly on the host with only a per-test timeout guard,
so the timeout is the single safety mechanism standing between a runaway submission and a
hung server. These tests exercise it directly.

No database and no HTTP layer is involved — `execute_submission` is called as a function.
"""

import time

import pytest

from app.coding.runner import execute_submission


def _case(args, expected, hidden=False):
    return {'args': args, 'expected': expected, 'hidden': hidden}


SUM_TESTS = [
    _case([1, 2], 3),
    _case([10, 5], 15),
    _case([-1, 1], 0),
]

CORRECT_SUM = "def add(a, b):\n    return a + b\n"


# --------------------------------------------------------------------------- happy path

def test_correct_solution_passes_every_test():
    """covers TC-CODE-008 — a correct solution scores full marks."""
    result = execute_submission(CORRECT_SUM, 'python', 'add', SUM_TESTS, time_limit=5)

    assert result['passed'] == result['total'] == len(SUM_TESTS)
    assert result['score'] == 100


def test_wrong_solution_reports_partial_passes():
    """covers TC-CODE-010 — a wrong answer is scored down, not crashed."""
    wrong = "def add(a, b):\n    return a - b\n"

    result = execute_submission(wrong, 'python', 'add', SUM_TESTS, time_limit=5)

    assert result['passed'] < result['total']
    assert result['score'] < 100


def test_only_the_supplied_tests_are_executed():
    """covers TC-CODE-006 — /run passes sample tests only, so `total` must track the
    list it was handed rather than some larger internal suite."""
    subset = SUM_TESTS[:1]

    result = execute_submission(CORRECT_SUM, 'python', 'add', subset, time_limit=5)

    assert result['total'] == 1


def test_program_stdout_does_not_corrupt_the_return_value():
    """covers TC-CODE-013 — the sentinel marker must separate print() output from the
    actual return value, otherwise a candidate who debugs with print() fails wrongly."""
    noisy = (
        "def add(a, b):\n"
        "    print('debugging output')\n"
        "    print('more noise')\n"
        "    return a + b\n"
    )

    result = execute_submission(noisy, 'python', 'add', SUM_TESTS, time_limit=5)

    assert result['passed'] == result['total']


# ------------------------------------------------------------------- failure containment

def test_infinite_loop_is_killed_by_the_timeout():
    """covers TC-CODE-011 / TC-DEBT-005 — THE critical guard.

    An infinite loop must be terminated by the per-test timeout and reported, rather than
    hanging the worker that is serving the request.
    """
    infinite = "def add(a, b):\n    while True:\n        pass\n"

    started = time.monotonic()
    result = execute_submission(infinite, 'python', 'add', [_case([1, 2], 3)], time_limit=2)
    elapsed = time.monotonic() - started

    assert result['passed'] == 0
    # Bounded by the limit (plus interpreter startup), not unbounded.
    assert elapsed < 15, f"timeout did not contain the run (took {elapsed:.1f}s)"

    statuses = [r.get('status') for r in result['results']]
    assert 'timeout' in statuses


def test_timeout_message_explains_the_cause():
    """covers TC-CODE-011 — the candidate is told why, not just that it failed."""
    infinite = "def add(a, b):\n    while True:\n        pass\n"

    result = execute_submission(infinite, 'python', 'add', [_case([1, 2], 3)], time_limit=2)

    blob = str(result['results']).lower()
    assert 'time limit exceeded' in blob


def test_a_finite_slow_solution_is_not_falsely_timed_out():
    """covers TC-DEBT-006 — a legitimately slow but finite program must still pass."""
    slow_but_finite = (
        "def add(a, b):\n"
        "    total = 0\n"
        "    for _ in range(200000):\n"
        "        total += 1\n"
        "    return a + b\n"
    )

    result = execute_submission(slow_but_finite, 'python', 'add', [_case([1, 2], 3)], time_limit=10)

    assert result['passed'] == 1


def test_syntax_error_is_reported_not_raised():
    """covers TC-CODE-012 — broken code must come back as a failed test, not a 500."""
    broken = "def add(a, b:\n    return a + b\n"

    result = execute_submission(broken, 'python', 'add', SUM_TESTS, time_limit=5)

    assert result['passed'] == 0
    assert result['score'] == 0
    statuses = [r.get('status') for r in result['results']]
    assert all(s != 'passed' for s in statuses)


def test_runtime_exception_is_contained():
    """covers TC-CODE-012 — an exception inside the candidate's function is a test
    failure, never an unhandled server error."""
    raises = "def add(a, b):\n    raise ValueError('boom')\n"

    result = execute_submission(raises, 'python', 'add', SUM_TESTS, time_limit=5)

    assert result['passed'] == 0


def test_missing_function_is_reported():
    """covers TC-CODE-012 — submitting code that never defines the required function."""
    wrong_name = "def subtract(a, b):\n    return a - b\n"

    result = execute_submission(wrong_name, 'python', 'add', SUM_TESTS, time_limit=5)

    assert result['passed'] == 0


def test_empty_code_scores_zero():
    """covers TC-CODE-012 — an empty submission must not be treated as a pass."""
    result = execute_submission('', 'python', 'add', SUM_TESTS, time_limit=5)

    assert result['passed'] == 0
    assert result['score'] == 0


# ------------------------------------------------------------------------ result shape

def test_result_shape_is_stable():
    """covers TC-CODE-008/009 — the persisted CodeSubmission relies on these keys."""
    result = execute_submission(CORRECT_SUM, 'python', 'add', SUM_TESTS, time_limit=5)

    for key in ('passed', 'total', 'score', 'results'):
        assert key in result

    assert isinstance(result['results'], list)
    assert len(result['results']) == len(SUM_TESTS)


def test_hidden_test_details_are_marked_hidden():
    """covers TC-CODE-004 — hidden cases must be distinguishable so the API can withhold
    their inputs from the candidate."""
    tests = [_case([1, 2], 3, hidden=False), _case([7, 8], 15, hidden=True)]

    result = execute_submission(CORRECT_SUM, 'python', 'add', tests, time_limit=5)

    assert any(r.get('hidden') for r in result['results'])
