"""Coding sandbox problem bank.

Every problem defines a single function the candidate must implement. Each problem
ships with visible sample tests (used by "Run") and hidden tests (added on "Submit").
Starters are boilerplate-only signatures — NEVER a working or partial solution
(§1.2). The runner invokes the function named ``function_name`` for each test case.

Test-case format: {"args": [<positional args>], "expected": <return value>}.
"""

# The canonical function name is shared across languages (snake_case is valid in both
# Python and JS), so the execution driver can call it the same way everywhere.

PROBLEMS = [
    {
        "id": "two-sum",
        "title": "Two Sum",
        "difficulty": "Easy",
        "function_name": "two_sum",
        "time_limit_secs": 5,
        "prompt": (
            "Given an array of integers `nums` and an integer `target`, return the indices "
            "of the two numbers that add up to `target`.\n\n"
            "You may assume that each input has exactly one solution, and you may not use the "
            "same element twice. Return the indices as a list `[i, j]` with `i < j`."
        ),
        "constraints": [
            "2 <= nums.length <= 10^4",
            "Only one valid answer exists.",
        ],
        "examples": [
            {"input": "nums = [2, 7, 11, 15], target = 9", "output": "[0, 1]",
             "explanation": "nums[0] + nums[1] == 9."},
            {"input": "nums = [3, 2, 4], target = 6", "output": "[1, 2]"},
        ],
        "starters": {
            "python": "def two_sum(nums, target):\n    # Return the indices of the two numbers adding up to target.\n    pass\n",
            "javascript": "function two_sum(nums, target) {\n    // Return the indices of the two numbers adding up to target.\n}\n",
        },
        "sample_tests": [
            {"args": [[2, 7, 11, 15], 9], "expected": [0, 1]},
            {"args": [[3, 2, 4], 6], "expected": [1, 2]},
        ],
        "hidden_tests": [
            {"args": [[3, 3], 6], "expected": [0, 1]},
            {"args": [[1, 5, 8, 3], 11], "expected": [2, 3]},
            {"args": [[-1, -2, -3, -4, -5], -8], "expected": [2, 4]},
        ],
    },
    {
        "id": "valid-palindrome",
        "title": "Valid Palindrome",
        "difficulty": "Easy",
        "function_name": "is_palindrome",
        "time_limit_secs": 5,
        "prompt": (
            "Given a string `s`, return `true` if it reads the same forward and backward after "
            "converting all uppercase letters to lowercase and removing all non-alphanumeric "
            "characters; otherwise return `false`."
        ),
        "constraints": [
            "1 <= s.length <= 2 * 10^5",
            "s consists of printable ASCII characters.",
        ],
        "examples": [
            {"input": 's = "A man, a plan, a canal: Panama"', "output": "true",
             "explanation": '"amanaplanacanalpanama" is a palindrome.'},
            {"input": 's = "race a car"', "output": "false"},
        ],
        "starters": {
            "python": "def is_palindrome(s):\n    # Return True if s is a palindrome ignoring case and non-alphanumerics.\n    pass\n",
            "javascript": "function is_palindrome(s) {\n    // Return true if s is a palindrome ignoring case and non-alphanumerics.\n}\n",
        },
        "sample_tests": [
            {"args": ["A man, a plan, a canal: Panama"], "expected": True},
            {"args": ["race a car"], "expected": False},
        ],
        "hidden_tests": [
            {"args": [" "], "expected": True},
            {"args": ["0P"], "expected": False},
            {"args": ["Was it a car or a cat I saw?"], "expected": True},
        ],
    },
    {
        "id": "fizz-buzz",
        "title": "Fizz Buzz",
        "difficulty": "Easy",
        "function_name": "fizz_buzz",
        "time_limit_secs": 5,
        "prompt": (
            "Given an integer `n`, return a list of strings of length `n` (1-indexed) where:\n"
            '- the value is "FizzBuzz" if the index is divisible by 3 and 5,\n'
            '- "Fizz" if divisible by 3,\n'
            '- "Buzz" if divisible by 5,\n'
            "- otherwise the index as a string."
        ),
        "constraints": ["1 <= n <= 10^4"],
        "examples": [
            {"input": "n = 5", "output": '["1", "2", "Fizz", "4", "Buzz"]'},
            {"input": "n = 3", "output": '["1", "2", "Fizz"]'},
        ],
        "starters": {
            "python": "def fizz_buzz(n):\n    # Return the FizzBuzz sequence from 1 to n as a list of strings.\n    pass\n",
            "javascript": "function fizz_buzz(n) {\n    // Return the FizzBuzz sequence from 1 to n as an array of strings.\n}\n",
        },
        "sample_tests": [
            {"args": [3], "expected": ["1", "2", "Fizz"]},
            {"args": [5], "expected": ["1", "2", "Fizz", "4", "Buzz"]},
        ],
        "hidden_tests": [
            {"args": [1], "expected": ["1"]},
            {"args": [15], "expected": ["1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8",
                                         "Fizz", "Buzz", "11", "Fizz", "13", "14", "FizzBuzz"]},
            {"args": [2], "expected": ["1", "2"]},
        ],
    },
    {
        "id": "max-subarray",
        "title": "Maximum Subarray Sum",
        "difficulty": "Medium",
        "function_name": "max_subarray",
        "time_limit_secs": 5,
        "prompt": (
            "Given an integer array `nums`, find the contiguous subarray (containing at least "
            "one number) which has the largest sum and return that sum."
        ),
        "constraints": [
            "1 <= nums.length <= 10^5",
            "-10^4 <= nums[i] <= 10^4",
        ],
        "examples": [
            {"input": "nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]", "output": "6",
             "explanation": "The subarray [4, -1, 2, 1] has the largest sum 6."},
            {"input": "nums = [1]", "output": "1"},
        ],
        "starters": {
            "python": "def max_subarray(nums):\n    # Return the largest sum of any contiguous subarray.\n    pass\n",
            "javascript": "function max_subarray(nums) {\n    // Return the largest sum of any contiguous subarray.\n}\n",
        },
        "sample_tests": [
            {"args": [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], "expected": 6},
            {"args": [[1]], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [[5, 4, -1, 7, 8]], "expected": 23},
            {"args": [[-1, -2, -3, -4]], "expected": -1},
            {"args": [[-2, -1]], "expected": -1},
        ],
    },
]

_PROBLEM_INDEX = {p["id"]: p for p in PROBLEMS}

# Languages the local runner can actually execute against test cases today.
EXECUTABLE_LANGUAGES = ["python", "javascript"]


def list_problems():
    """Public problem list — safe metadata only (no hidden tests)."""
    return [public_problem(p) for p in PROBLEMS]


def get_problem(problem_id):
    return _PROBLEM_INDEX.get(problem_id)


def public_problem(problem):
    """Strip anything the candidate must not see (hidden tests)."""
    return {
        "id": problem["id"],
        "title": problem["title"],
        "difficulty": problem["difficulty"],
        "prompt": problem["prompt"],
        "constraints": problem.get("constraints", []),
        "examples": problem.get("examples", []),
        "function_name": problem["function_name"],
        "starters": problem["starters"],
        "time_limit_secs": problem.get("time_limit_secs", 5),
        "sample_test_count": len(problem.get("sample_tests", [])),
        "total_test_count": len(problem.get("sample_tests", [])) + len(problem.get("hidden_tests", [])),
    }
