"""Problem-bank integrity tests (TEST_CASES.md §6).

A wrong `expected` value in the bank is worse than a missing problem: the candidate writes
a correct solution and the sandbox tells them they failed. So every problem here carries a
known-good reference solution which is executed through the REAL runner against the
problem's own sample + hidden tests. If any expected value is wrong, that problem fails.

Reference solutions live only in this test file — never in the shipped bank, which must
contain signature-only starters (§1.2).
"""

import pytest

from app.coding.problem_bank import PROBLEMS, get_problem, list_problems, public_problem
from app.coding.runner import execute_submission


# --------------------------------------------------------------- reference solutions

REFERENCE_SOLUTIONS = {
    "two-sum": """
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []
""",
    "valid-palindrome": """
def is_palindrome(s):
    cleaned = [c.lower() for c in s if c.isalnum()]
    return cleaned == cleaned[::-1]
""",
    "fizz-buzz": """
def fizz_buzz(n):
    out = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            out.append("FizzBuzz")
        elif i % 3 == 0:
            out.append("Fizz")
        elif i % 5 == 0:
            out.append("Buzz")
        else:
            out.append(str(i))
    return out
""",
    "max-subarray": """
def max_subarray(nums):
    best = current = nums[0]
    for n in nums[1:]:
        current = max(n, current + n)
        best = max(best, current)
    return best
""",
    "valid-parentheses": """
def is_valid_parentheses(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
""",
    "contains-duplicate": """
def contains_duplicate(nums):
    return len(set(nums)) != len(nums)
""",
    "binary-search": """
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
""",
    "climbing-stairs": """
def climb_stairs(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b
""",
    "move-zeroes": """
def move_zeroes(nums):
    non_zero = [n for n in nums if n != 0]
    return non_zero + [0] * (len(nums) - len(non_zero))
""",
    "best-time-to-buy-sell-stock": """
def max_profit(prices):
    best = 0
    cheapest = prices[0]
    for p in prices[1:]:
        best = max(best, p - cheapest)
        cheapest = min(cheapest, p)
    return best
""",
    "longest-common-prefix": """
def longest_common_prefix(strs):
    if not strs:
        return ""
    prefix = strs[0]
    for word in strs[1:]:
        while not word.startswith(prefix):
            prefix = prefix[:-1]
            if not prefix:
                return ""
    return prefix
""",
    "product-except-self": """
def product_except_self(nums):
    n = len(nums)
    out = [1] * n
    running = 1
    for i in range(n):
        out[i] = running
        running *= nums[i]
    running = 1
    for i in range(n - 1, -1, -1):
        out[i] *= running
        running *= nums[i]
    return out
""",
    "longest-substring-no-repeat": """
def length_of_longest_substring(s):
    last = {}
    best = start = 0
    for i, ch in enumerate(s):
        if ch in last and last[ch] >= start:
            start = last[ch] + 1
        last[ch] = i
        best = max(best, i - start + 1)
    return best
""",
    "rotate-array": """
def rotate_array(nums, k):
    n = len(nums)
    k %= n
    return nums[-k:] + nums[:-k] if k else list(nums)
""",
    "merge-intervals": """
def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged
""",
    "spiral-matrix": """
def spiral_order(matrix):
    out = []
    if not matrix:
        return out
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1):
            out.append(matrix[top][c])
        top += 1
        for r in range(top, bottom + 1):
            out.append(matrix[r][right])
        right -= 1
        if top <= bottom:
            for c in range(right, left - 1, -1):
                out.append(matrix[bottom][c])
            bottom -= 1
        if left <= right:
            for r in range(bottom, top - 1, -1):
                out.append(matrix[r][left])
            left += 1
    return out
""",
    "trapping-rain-water": """
def trap(height):
    if not height:
        return 0
    left, right = 0, len(height) - 1
    left_max, right_max = height[left], height[right]
    total = 0
    while left < right:
        if left_max <= right_max:
            left += 1
            left_max = max(left_max, height[left])
            total += left_max - height[left]
        else:
            right -= 1
            right_max = max(right_max, height[right])
            total += right_max - height[right]
    return total
""",
    "edit-distance": """
def min_distance(word1, word2):
    m, n = len(word1), len(word2)
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        curr = [i] + [0] * n
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                curr[j] = prev[j - 1]
            else:
                curr[j] = 1 + min(prev[j], curr[j - 1], prev[j - 1])
        prev = curr
    return prev[n]
""",
}


def all_tests(problem):
    return (
        [dict(t, hidden=False) for t in problem.get("sample_tests", [])]
        + [dict(t, hidden=True) for t in problem.get("hidden_tests", [])]
    )


PROBLEM_IDS = [p["id"] for p in PROBLEMS]


# ------------------------------------------------------------- the important one

@pytest.mark.parametrize("problem_id", PROBLEM_IDS)
def test_reference_solution_passes_every_test_case(problem_id):
    """covers TC-CODE-008 — proves each problem's expected values are actually correct.

    A failure here means the BANK is wrong, not the candidate.
    """
    problem = get_problem(problem_id)
    solution = REFERENCE_SOLUTIONS.get(problem_id)
    assert solution, f"No reference solution registered for '{problem_id}'"

    tests = all_tests(problem)
    result = execute_submission(
        solution,
        "python",
        problem["function_name"],
        tests,
        time_limit=problem.get("time_limit_secs", 5),
    )

    failures = [r for r in result["results"] if r.get("status") != "passed"]
    assert result["passed"] == result["total"], (
        f"'{problem_id}': {len(failures)} of {result['total']} cases failed "
        f"against a known-good solution — the expected values are wrong. First: {failures[:1]}"
    )
    assert result["score"] == 100


# ------------------------------------------------------------------ bank integrity

@pytest.mark.parametrize("problem_id", PROBLEM_IDS)
def test_problem_has_all_required_fields(problem_id):
    """covers TC-CODE-003 — a malformed entry would break the problem list for everyone."""
    problem = get_problem(problem_id)

    for field in ("id", "title", "difficulty", "function_name", "prompt", "starters"):
        assert problem.get(field), f"'{problem_id}' is missing '{field}'"

    assert problem["difficulty"] in ("Easy", "Medium", "Hard")
    assert problem.get("sample_tests"), f"'{problem_id}' has no sample tests"
    assert problem.get("hidden_tests"), f"'{problem_id}' has no hidden tests"


@pytest.mark.parametrize("problem_id", PROBLEM_IDS)
def test_starters_exist_for_every_executable_language(problem_id):
    """A missing starter leaves the editor blank and the candidate stuck."""
    problem = get_problem(problem_id)

    for language in ("python", "javascript"):
        starter = problem["starters"].get(language)
        assert starter, f"'{problem_id}' has no {language} starter"
        assert problem["function_name"] in starter, (
            f"'{problem_id}' {language} starter does not declare {problem['function_name']}"
        )


@pytest.mark.parametrize("problem_id", PROBLEM_IDS)
def test_starter_is_not_a_working_solution(problem_id):
    """covers §1.2 — starters must be signature-only, never a partial answer.

    A starter that already passes would hand the candidate the marks.
    """
    problem = get_problem(problem_id)
    starter = problem["starters"]["python"]

    result = execute_submission(
        starter,
        "python",
        problem["function_name"],
        all_tests(problem),
        time_limit=problem.get("time_limit_secs", 5),
    )

    assert result["passed"] < result["total"], (
        f"'{problem_id}': the starter passes its own tests — it is giving the solution away."
    )


@pytest.mark.parametrize("problem_id", PROBLEM_IDS)
def test_test_cases_are_well_formed(problem_id):
    """Every case needs positional args and an expected value the runner can compare."""
    problem = get_problem(problem_id)

    for case in all_tests(problem):
        assert "args" in case, f"'{problem_id}' has a case with no 'args'"
        assert isinstance(case["args"], list), f"'{problem_id}' args must be a list"
        assert "expected" in case, f"'{problem_id}' has a case with no 'expected'"


def test_problem_ids_are_unique():
    """A duplicate id would silently shadow a problem in the lookup index."""
    assert len(PROBLEM_IDS) == len(set(PROBLEM_IDS))


def test_bank_covers_every_difficulty():
    """The list should give candidates somewhere to start and somewhere to stretch."""
    difficulties = {p["difficulty"] for p in PROBLEMS}

    assert {"Easy", "Medium", "Hard"} <= difficulties


# --------------------------------------------------------------- public API safety

@pytest.mark.parametrize("problem_id", PROBLEM_IDS)
def test_public_problem_never_leaks_hidden_tests(problem_id):
    """covers TC-CODE-004 — hidden tests must not reach the candidate."""
    payload = public_problem(get_problem(problem_id))

    assert "hidden_tests" not in payload
    assert "sample_tests" not in payload
    assert payload["sample_test_count"] >= 1
    assert payload["total_test_count"] > payload["sample_test_count"]


def test_problem_list_is_fully_sanitised():
    """covers TC-CODE-003/004 — the list endpoint returns public payloads only."""
    for payload in list_problems():
        assert "hidden_tests" not in payload
        assert "sample_tests" not in payload


def test_get_problem_returns_none_for_unknown_id():
    """covers TC-CODE-005 — the route relies on this to raise its 404."""
    assert get_problem("does-not-exist") is None
