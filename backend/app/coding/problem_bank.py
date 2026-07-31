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
    {
        "id": "valid-parentheses",
        "title": "Valid Parentheses",
        "difficulty": "Easy",
        "function_name": "is_valid_parentheses",
        "time_limit_secs": 5,
        "prompt": (
            "Given a string `s` containing only the characters `(`, `)`, `{`, `}`, `[` and `]`, "
            "return `true` if the string is valid.\n\n"
            "A string is valid when every open bracket is closed by the same type of bracket, "
            "and brackets are closed in the correct order."
        ),
        "constraints": [
            "0 <= s.length <= 10^4",
            "s consists only of bracket characters.",
        ],
        "examples": [
            {"input": 's = "()[]{}"', "output": "true"},
            {"input": 's = "([)]"', "output": "false",
             "explanation": "The brackets are closed in the wrong order."},
        ],
        "starters": {
            "python": "def is_valid_parentheses(s):\n    # Return True if every bracket is closed correctly and in order.\n    pass\n",
            "javascript": "function is_valid_parentheses(s) {\n    // Return true if every bracket is closed correctly and in order.\n}\n",
        },
        "sample_tests": [
            {"args": ["()[]{}"], "expected": True},
            {"args": ["([)]"], "expected": False},
        ],
        "hidden_tests": [
            {"args": [""], "expected": True},
            {"args": ["("], "expected": False},
            {"args": ["{[]}"], "expected": True},
            {"args": ["]"], "expected": False},
        ],
    },
    {
        "id": "contains-duplicate",
        "title": "Contains Duplicate",
        "difficulty": "Easy",
        "function_name": "contains_duplicate",
        "time_limit_secs": 5,
        "prompt": (
            "Given an integer array `nums`, return `true` if any value appears at least twice, "
            "and `false` if every element is distinct."
        ),
        "constraints": [
            "0 <= nums.length <= 10^5",
            "-10^9 <= nums[i] <= 10^9",
        ],
        "examples": [
            {"input": "nums = [1, 2, 3, 1]", "output": "true",
             "explanation": "The value 1 appears twice."},
            {"input": "nums = [1, 2, 3, 4]", "output": "false"},
        ],
        "starters": {
            "python": "def contains_duplicate(nums):\n    # Return True if any value appears more than once.\n    pass\n",
            "javascript": "function contains_duplicate(nums) {\n    // Return true if any value appears more than once.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 3, 1]], "expected": True},
            {"args": [[1, 2, 3, 4]], "expected": False},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": False},
            {"args": [[1]], "expected": False},
            {"args": [[1, 1, 1, 3, 3, 4, 3, 2, 4, 2]], "expected": True},
            {"args": [[-1, -2, -1]], "expected": True},
        ],
    },
    {
        "id": "binary-search",
        "title": "Binary Search",
        "difficulty": "Easy",
        "function_name": "binary_search",
        "time_limit_secs": 5,
        "prompt": (
            "Given a sorted array of distinct integers `nums` and an integer `target`, return "
            "the index of `target` if it is present, otherwise return `-1`.\n\n"
            "Your solution should run in O(log n) time."
        ),
        "constraints": [
            "1 <= nums.length <= 10^4",
            "nums is sorted in ascending order and all values are distinct.",
        ],
        "examples": [
            {"input": "nums = [-1, 0, 3, 5, 9, 12], target = 9", "output": "4",
             "explanation": "9 sits at index 4."},
            {"input": "nums = [-1, 0, 3, 5, 9, 12], target = 2", "output": "-1"},
        ],
        "starters": {
            "python": "def binary_search(nums, target):\n    # Return the index of target, or -1 when it is absent.\n    pass\n",
            "javascript": "function binary_search(nums, target) {\n    // Return the index of target, or -1 when it is absent.\n}\n",
        },
        "sample_tests": [
            {"args": [[-1, 0, 3, 5, 9, 12], 9], "expected": 4},
            {"args": [[-1, 0, 3, 5, 9, 12], 2], "expected": -1},
        ],
        "hidden_tests": [
            {"args": [[5], 5], "expected": 0},
            {"args": [[5], -5], "expected": -1},
            {"args": [[1, 2, 3, 4, 5], 1], "expected": 0},
            {"args": [[1, 2, 3, 4, 5], 5], "expected": 4},
        ],
    },
    {
        "id": "climbing-stairs",
        "title": "Climbing Stairs",
        "difficulty": "Easy",
        "function_name": "climb_stairs",
        "time_limit_secs": 5,
        "prompt": (
            "You are climbing a staircase that takes `n` steps to reach the top. Each time you "
            "may climb either 1 or 2 steps.\n\n"
            "Return the number of distinct ways you can reach the top."
        ),
        "constraints": ["1 <= n <= 45"],
        "examples": [
            {"input": "n = 2", "output": "2",
             "explanation": "Either 1+1 or a single 2-step."},
            {"input": "n = 3", "output": "3",
             "explanation": "1+1+1, 1+2, or 2+1."},
        ],
        "starters": {
            "python": "def climb_stairs(n):\n    # Return how many distinct ways there are to climb n steps.\n    pass\n",
            "javascript": "function climb_stairs(n) {\n    // Return how many distinct ways there are to climb n steps.\n}\n",
        },
        "sample_tests": [
            {"args": [2], "expected": 2},
            {"args": [3], "expected": 3},
        ],
        "hidden_tests": [
            {"args": [1], "expected": 1},
            {"args": [5], "expected": 8},
            {"args": [10], "expected": 89},
            {"args": [20], "expected": 10946},
        ],
    },
    {
        "id": "move-zeroes",
        "title": "Move Zeroes",
        "difficulty": "Easy",
        "function_name": "move_zeroes",
        "time_limit_secs": 5,
        "prompt": (
            "Given an integer array `nums`, move every `0` to the end while keeping the relative "
            "order of the non-zero elements unchanged.\n\n"
            "Return the resulting array."
        ),
        "constraints": [
            "1 <= nums.length <= 10^4",
            "-2^31 <= nums[i] <= 2^31 - 1",
        ],
        "examples": [
            {"input": "nums = [0, 1, 0, 3, 12]", "output": "[1, 3, 12, 0, 0]",
             "explanation": "Non-zero values keep their original order."},
            {"input": "nums = [0]", "output": "[0]"},
        ],
        "starters": {
            "python": "def move_zeroes(nums):\n    # Move all zeroes to the end, preserving the order of the rest. Return the array.\n    pass\n",
            "javascript": "function move_zeroes(nums) {\n    // Move all zeroes to the end, preserving the order of the rest. Return the array.\n}\n",
        },
        "sample_tests": [
            {"args": [[0, 1, 0, 3, 12]], "expected": [1, 3, 12, 0, 0]},
            {"args": [[0]], "expected": [0]},
        ],
        "hidden_tests": [
            {"args": [[1, 0]], "expected": [1, 0]},
            {"args": [[0, 0, 1]], "expected": [1, 0, 0]},
            {"args": [[1, 2, 3]], "expected": [1, 2, 3]},
            {"args": [[0, 0, 0]], "expected": [0, 0, 0]},
        ],
    },
    {
        "id": "best-time-to-buy-sell-stock",
        "title": "Best Time to Buy and Sell Stock",
        "difficulty": "Easy",
        "function_name": "max_profit",
        "time_limit_secs": 5,
        "prompt": (
            "You are given an array `prices` where `prices[i]` is the price of a stock on day `i`. "
            "You may buy on one day and sell on a LATER day.\n\n"
            "Return the maximum profit you can make. If no profit is possible, return `0`."
        ),
        "constraints": [
            "1 <= prices.length <= 10^5",
            "0 <= prices[i] <= 10^4",
        ],
        "examples": [
            {"input": "prices = [7, 1, 5, 3, 6, 4]", "output": "5",
             "explanation": "Buy at 1 on day 2 and sell at 6 on day 5."},
            {"input": "prices = [7, 6, 4, 3, 1]", "output": "0",
             "explanation": "Prices only fall, so no profitable trade exists."},
        ],
        "starters": {
            "python": "def max_profit(prices):\n    # Return the best profit from one buy and one later sell, or 0.\n    pass\n",
            "javascript": "function max_profit(prices) {\n    // Return the best profit from one buy and one later sell, or 0.\n}\n",
        },
        "sample_tests": [
            {"args": [[7, 1, 5, 3, 6, 4]], "expected": 5},
            {"args": [[7, 6, 4, 3, 1]], "expected": 0},
        ],
        "hidden_tests": [
            {"args": [[3]], "expected": 0},
            {"args": [[1, 2]], "expected": 1},
            {"args": [[2, 4, 1]], "expected": 2},
            {"args": [[2, 1, 2, 1, 0, 1, 2]], "expected": 2},
        ],
    },
    {
        "id": "longest-common-prefix",
        "title": "Longest Common Prefix",
        "difficulty": "Easy",
        "function_name": "longest_common_prefix",
        "time_limit_secs": 5,
        "prompt": (
            "Write a function that finds the longest common prefix string shared by an array of "
            "strings `strs`.\n\n"
            "If there is no common prefix, return an empty string."
        ),
        "constraints": [
            "1 <= strs.length <= 200",
            "strs[i] consists of lowercase English letters.",
        ],
        "examples": [
            {"input": 'strs = ["flower", "flow", "flight"]', "output": '"fl"'},
            {"input": 'strs = ["dog", "racecar", "car"]', "output": '""',
             "explanation": "There is no common prefix."},
        ],
        "starters": {
            "python": "def longest_common_prefix(strs):\n    # Return the longest prefix shared by every string, or an empty string.\n    pass\n",
            "javascript": "function longest_common_prefix(strs) {\n    // Return the longest prefix shared by every string, or an empty string.\n}\n",
        },
        "sample_tests": [
            {"args": [["flower", "flow", "flight"]], "expected": "fl"},
            {"args": [["dog", "racecar", "car"]], "expected": ""},
        ],
        "hidden_tests": [
            {"args": [["a"]], "expected": "a"},
            {"args": [["ab", "ab"]], "expected": "ab"},
            {"args": [["", "b"]], "expected": ""},
            {"args": [["interview", "internal", "internet"]], "expected": "inter"},
        ],
    },
    {
        "id": "product-except-self",
        "title": "Product of Array Except Self",
        "difficulty": "Medium",
        "function_name": "product_except_self",
        "time_limit_secs": 5,
        "prompt": (
            "Given an integer array `nums`, return an array `answer` where `answer[i]` is the "
            "product of every element of `nums` EXCEPT `nums[i]`.\n\n"
            "Solve it without using the division operator."
        ),
        "constraints": [
            "2 <= nums.length <= 10^5",
            "The product of any prefix or suffix fits in a 32-bit integer.",
        ],
        "examples": [
            {"input": "nums = [1, 2, 3, 4]", "output": "[24, 12, 8, 6]",
             "explanation": "answer[0] = 2*3*4 = 24, and so on."},
            {"input": "nums = [-1, 1, 0, -3, 3]", "output": "[0, 0, 9, 0, 0]"},
        ],
        "starters": {
            "python": "def product_except_self(nums):\n    # Return an array where each slot holds the product of all OTHER elements.\n    pass\n",
            "javascript": "function product_except_self(nums) {\n    // Return an array where each slot holds the product of all OTHER elements.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 3, 4]], "expected": [24, 12, 8, 6]},
            {"args": [[-1, 1, 0, -3, 3]], "expected": [0, 0, 9, 0, 0]},
        ],
        "hidden_tests": [
            {"args": [[2, 3]], "expected": [3, 2]},
            {"args": [[1, 0]], "expected": [0, 1]},
            {"args": [[0, 0]], "expected": [0, 0]},
            {"args": [[5, 1, 1, 1]], "expected": [1, 5, 5, 5]},
        ],
    },
    {
        "id": "longest-substring-no-repeat",
        "title": "Longest Substring Without Repeating Characters",
        "difficulty": "Medium",
        "function_name": "length_of_longest_substring",
        "time_limit_secs": 5,
        "prompt": (
            "Given a string `s`, return the length of the longest substring that contains no "
            "repeating characters."
        ),
        "constraints": [
            "0 <= s.length <= 5 * 10^4",
            "s consists of English letters, digits, symbols and spaces.",
        ],
        "examples": [
            {"input": 's = "abcabcbb"', "output": "3",
             "explanation": 'The answer is "abc", with length 3.'},
            {"input": 's = "bbbbb"', "output": "1",
             "explanation": 'The answer is "b".'},
        ],
        "starters": {
            "python": "def length_of_longest_substring(s):\n    # Return the length of the longest substring with all-unique characters.\n    pass\n",
            "javascript": "function length_of_longest_substring(s) {\n    // Return the length of the longest substring with all-unique characters.\n}\n",
        },
        "sample_tests": [
            {"args": ["abcabcbb"], "expected": 3},
            {"args": ["bbbbb"], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [""], "expected": 0},
            {"args": ["pwwkew"], "expected": 3},
            {"args": ["dvdf"], "expected": 3},
            {"args": [" "], "expected": 1},
        ],
    },
    {
        "id": "rotate-array",
        "title": "Rotate Array",
        "difficulty": "Medium",
        "function_name": "rotate_array",
        "time_limit_secs": 5,
        "prompt": (
            "Given an integer array `nums`, rotate it to the RIGHT by `k` steps, where `k` is "
            "non-negative.\n\n"
            "Return the rotated array. Note that `k` may be larger than the array length."
        ),
        "constraints": [
            "1 <= nums.length <= 10^5",
            "0 <= k <= 10^5",
        ],
        "examples": [
            {"input": "nums = [1, 2, 3, 4, 5, 6, 7], k = 3", "output": "[5, 6, 7, 1, 2, 3, 4]",
             "explanation": "Rotating right three times moves the last three values to the front."},
            {"input": "nums = [-1, -100, 3, 99], k = 2", "output": "[3, 99, -1, -100]"},
        ],
        "starters": {
            "python": "def rotate_array(nums, k):\n    # Rotate nums right by k steps and return the result.\n    pass\n",
            "javascript": "function rotate_array(nums, k) {\n    // Rotate nums right by k steps and return the result.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 3, 4, 5, 6, 7], 3], "expected": [5, 6, 7, 1, 2, 3, 4]},
            {"args": [[-1, -100, 3, 99], 2], "expected": [3, 99, -1, -100]},
        ],
        "hidden_tests": [
            {"args": [[1], 0], "expected": [1]},
            {"args": [[1, 2], 3], "expected": [2, 1]},
            {"args": [[1, 2, 3], 3], "expected": [1, 2, 3]},
            {"args": [[1, 2, 3, 4], 6], "expected": [3, 4, 1, 2]},
        ],
    },
    {
        "id": "merge-intervals",
        "title": "Merge Intervals",
        "difficulty": "Medium",
        "function_name": "merge_intervals",
        "time_limit_secs": 5,
        "prompt": (
            "Given an array of intervals where `intervals[i] = [start_i, end_i]`, merge every "
            "pair of overlapping intervals.\n\n"
            "Return the merged intervals sorted by start value. Intervals that merely touch "
            "(for example `[1,4]` and `[4,5]`) count as overlapping."
        ),
        "constraints": [
            "1 <= intervals.length <= 10^4",
            "intervals[i].length == 2 and start_i <= end_i",
        ],
        "examples": [
            {"input": "intervals = [[1,3], [2,6], [8,10], [15,18]]",
             "output": "[[1,6], [8,10], [15,18]]",
             "explanation": "[1,3] and [2,6] overlap, so they merge into [1,6]."},
            {"input": "intervals = [[1,4], [4,5]]", "output": "[[1,5]]"},
        ],
        "starters": {
            "python": "def merge_intervals(intervals):\n    # Merge every overlapping interval and return them sorted by start.\n    pass\n",
            "javascript": "function merge_intervals(intervals) {\n    // Merge every overlapping interval and return them sorted by start.\n}\n",
        },
        "sample_tests": [
            {"args": [[[1, 3], [2, 6], [8, 10], [15, 18]]], "expected": [[1, 6], [8, 10], [15, 18]]},
            {"args": [[[1, 4], [4, 5]]], "expected": [[1, 5]]},
        ],
        "hidden_tests": [
            {"args": [[[1, 4], [2, 3]]], "expected": [[1, 4]]},
            {"args": [[[1, 4], [0, 4]]], "expected": [[0, 4]]},
            {"args": [[[1, 4], [5, 6]]], "expected": [[1, 4], [5, 6]]},
            {"args": [[[5, 6]]], "expected": [[5, 6]]},
        ],
    },
    {
        "id": "spiral-matrix",
        "title": "Spiral Matrix",
        "difficulty": "Medium",
        "function_name": "spiral_order",
        "time_limit_secs": 5,
        "prompt": (
            "Given an `m x n` matrix, return all of its elements in spiral order — starting at "
            "the top-left, moving right, then down, then left, then up, spiralling inward."
        ),
        "constraints": [
            "1 <= m, n <= 10",
            "-100 <= matrix[i][j] <= 100",
        ],
        "examples": [
            {"input": "matrix = [[1,2,3], [4,5,6], [7,8,9]]",
             "output": "[1, 2, 3, 6, 9, 8, 7, 4, 5]"},
            {"input": "matrix = [[1,2], [3,4]]", "output": "[1, 2, 4, 3]"},
        ],
        "starters": {
            "python": "def spiral_order(matrix):\n    # Return every element of the matrix in spiral order.\n    pass\n",
            "javascript": "function spiral_order(matrix) {\n    // Return every element of the matrix in spiral order.\n}\n",
        },
        "sample_tests": [
            {"args": [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], "expected": [1, 2, 3, 6, 9, 8, 7, 4, 5]},
            {"args": [[[1, 2], [3, 4]]], "expected": [1, 2, 4, 3]},
        ],
        "hidden_tests": [
            {"args": [[[1]]], "expected": [1]},
            {"args": [[[1, 2, 3, 4]]], "expected": [1, 2, 3, 4]},
            {"args": [[[1], [2], [3]]], "expected": [1, 2, 3]},
            {"args": [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]],
             "expected": [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]},
        ],
    },
    {
        "id": "trapping-rain-water",
        "title": "Trapping Rain Water",
        "difficulty": "Hard",
        "function_name": "trap",
        "time_limit_secs": 5,
        "prompt": (
            "Given `n` non-negative integers representing an elevation map where the width of "
            "each bar is 1, compute how much rain water can be trapped after it rains."
        ),
        "constraints": [
            "0 <= height.length <= 2 * 10^4",
            "0 <= height[i] <= 10^5",
        ],
        "examples": [
            {"input": "height = [0,1,0,2,1,0,1,3,2,1,2,1]", "output": "6",
             "explanation": "Six units of water are trapped between the bars."},
            {"input": "height = [4,2,0,3,2,5]", "output": "9"},
        ],
        "starters": {
            "python": "def trap(height):\n    # Return the total units of rain water trapped by the elevation map.\n    pass\n",
            "javascript": "function trap(height) {\n    // Return the total units of rain water trapped by the elevation map.\n}\n",
        },
        "sample_tests": [
            {"args": [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], "expected": 6},
            {"args": [[4, 2, 0, 3, 2, 5]], "expected": 9},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": 0},
            {"args": [[1, 2, 3]], "expected": 0},
            {"args": [[3, 2, 1]], "expected": 0},
            {"args": [[2, 0, 2]], "expected": 2},
            {"args": [[5, 0, 5, 0, 5]], "expected": 10},
        ],
    },
    {
        "id": "edit-distance",
        "title": "Edit Distance",
        "difficulty": "Hard",
        "function_name": "min_distance",
        "time_limit_secs": 5,
        "prompt": (
            "Given two strings `word1` and `word2`, return the minimum number of operations "
            "needed to turn `word1` into `word2`.\n\n"
            "The permitted operations are: insert a character, delete a character, or replace "
            "a character."
        ),
        "constraints": [
            "0 <= word1.length, word2.length <= 500",
            "Both words consist of lowercase English letters.",
        ],
        "examples": [
            {"input": 'word1 = "horse", word2 = "ros"', "output": "3",
             "explanation": "horse -> rorse -> rose -> ros."},
            {"input": 'word1 = "intention", word2 = "execution"', "output": "5"},
        ],
        "starters": {
            "python": "def min_distance(word1, word2):\n    # Return the minimum insert/delete/replace operations to convert word1 into word2.\n    pass\n",
            "javascript": "function min_distance(word1, word2) {\n    // Return the minimum insert/delete/replace operations to convert word1 into word2.\n}\n",
        },
        "sample_tests": [
            {"args": ["horse", "ros"], "expected": 3},
            {"args": ["intention", "execution"], "expected": 5},
        ],
        "hidden_tests": [
            {"args": ["", "abc"], "expected": 3},
            {"args": ["abc", ""], "expected": 3},
            {"args": ["abc", "abc"], "expected": 0},
            {"args": ["a", ""], "expected": 1},
            {"args": ["sunday", "saturday"], "expected": 3},
        ],
    },
]

# SQL problems live in their own module because their test cases are shaped differently
# (seeded schema + expected result set, rather than function args + return value). They are
# appended to the same PROBLEMS list so every existing consumer — list/get/public_problem,
# the routes, and the frontend — treats them like any other problem.
from app.coding.sql_problems import SQL_PROBLEMS  # noqa: E402

PROBLEMS = PROBLEMS + SQL_PROBLEMS

_PROBLEM_INDEX = {p["id"]: p for p in PROBLEMS}

# Languages the local runner can actually execute against test cases today.
# 'sql' runs through coding/sql_runner.py (in-memory SQLite), not the subprocess runner.
EXECUTABLE_LANGUAGES = ["python", "javascript", "sql"]


def is_sql_problem(problem):
    """True when this problem is answered with a SQL query rather than a function."""
    return (problem or {}).get("language") == "sql"


def list_problems():
    """Public problem list — safe metadata only (no hidden tests)."""
    return [public_problem(p) for p in PROBLEMS]


def get_problem(problem_id):
    return _PROBLEM_INDEX.get(problem_id)


def public_problem(problem):
    """Strip anything the candidate must not see (hidden tests, seed/expected rows)."""
    data = {
        "id": problem["id"],
        "title": problem["title"],
        "difficulty": problem["difficulty"],
        "prompt": problem["prompt"],
        "constraints": problem.get("constraints", []),
        "examples": problem.get("examples", []),
        "function_name": problem.get("function_name"),
        "starters": problem["starters"],
        "time_limit_secs": problem.get("time_limit_secs", 5),
        "sample_test_count": len(problem.get("sample_tests", [])),
        "total_test_count": len(problem.get("sample_tests", [])) + len(problem.get("hidden_tests", [])),
        "language": problem.get("language"),
        "domains": problem.get("domains", []),
    }
    if is_sql_problem(problem):
        # A SQL question is unanswerable without seeing what you are querying, so the table
        # structure and the visible sample dataset are part of the question itself.
        data["schema_display"] = problem.get("schema_display", [])
        data["sample_datasets"] = [
            {"name": t.get("name", ""), "seed": t.get("seed", "")}
            for t in problem.get("sample_tests", [])
        ]
    return data


# --- Opening-question selection (Completed-course interviews) ----------------------
# Domain hints that mean a data-oriented candidate, for whom a SQL opener is the most
# relevant coding exercise. Matched loosely against the candidate's course category and
# job role so wording differences ("Cloud & Data Engineering", "Data Analyst") still hit.
_DATA_HINTS = ("data", "sql", "database", "analytic", "warehouse", "etl", "bi ")


def pick_opening_problem(job_role="", course_category="", preferred_language=None):
    """Choose the coding-sandbox problem to open a Completed-course interview with.

    SQL is preferred when the candidate's domain is data-oriented (that is where a query
    exercise is genuinely relevant); everyone else gets a standard function-implementation
    problem. Returns None when nothing suitable exists, in which case the caller simply
    leaves the generated verbal question in place.
    """
    haystack = f"{job_role or ''} {course_category or ''}".lower()
    wants_sql = any(hint in haystack for hint in _DATA_HINTS)

    sql_problems = [p for p in PROBLEMS if is_sql_problem(p)]
    code_problems = [p for p in PROBLEMS if not is_sql_problem(p)]

    if preferred_language == "sql":
        pool = sql_problems
    elif wants_sql and sql_problems:
        pool = sql_problems
    else:
        pool = code_problems

    if not pool:
        pool = code_problems or sql_problems
    if not pool:
        return None

    # Open on an approachable problem: the first question sets the tone, and a Hard opener
    # would rattle a candidate before the interview has really begun.
    easy = [p for p in pool if p.get("difficulty") == "Easy"]
    medium = [p for p in pool if p.get("difficulty") == "Medium"]
    return (easy or medium or pool)[0]
