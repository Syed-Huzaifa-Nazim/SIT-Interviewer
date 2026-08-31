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

    # --- Batch 2: practical/real-world framed problems (Difficulty Range feature —
    # growing the sandbox bank so many simultaneous candidates don't all see the same
    # opener). HackerRank-style: a short real scenario, not an abstract puzzle. ---
    {
        "id": "order-total-with-discount",
        "title": "Order Total With Discount",
        "difficulty": "Easy",
        "function_name": "calculate_order_total",
        "time_limit_secs": 5,
        "prompt": (
            "You're building checkout logic for an online store. Given a list of item "
            "`prices` and a `discount_percent` (0-100) applied to the whole order, return "
            "the final total after the discount, rounded to 2 decimal places."
        ),
        "constraints": ["0 <= len(prices) <= 1000", "0 <= discount_percent <= 100"],
        "examples": [
            {"input": "prices = [100, 50, 25], discount_percent = 10", "output": "157.5"},
            {"input": "prices = [20], discount_percent = 0", "output": "20.0"},
        ],
        "starters": {
            "python": "def calculate_order_total(prices, discount_percent):\n    # Return the total after applying discount_percent, rounded to 2 decimals.\n    pass\n",
            "javascript": "function calculate_order_total(prices, discount_percent) {\n    // Return the total after applying discount_percent, rounded to 2 decimals.\n}\n",
        },
        "sample_tests": [
            {"args": [[100, 50, 25], 10], "expected": 157.5},
            {"args": [[20], 0], "expected": 20.0},
        ],
        "hidden_tests": [
            {"args": [[], 10], "expected": 0.0},
            {"args": [[80, 40], 25], "expected": 90.0},
            {"args": [[100], 100], "expected": 0.0},
            {"args": [[10, 10, 10], 50], "expected": 15.0},
        ],
    },
    {
        "id": "password-strength-checker",
        "title": "Password Strength Checker",
        "difficulty": "Easy",
        "function_name": "is_strong_password",
        "time_limit_secs": 5,
        "prompt": (
            "A signup form needs server-side password validation. A password is STRONG if "
            "it is at least 8 characters long AND contains at least one uppercase letter, "
            "one lowercase letter, and one digit. Return True if `password` is strong."
        ),
        "constraints": ["0 <= len(password) <= 200"],
        "examples": [
            {"input": 'password = "Passw0rd"', "output": "true"},
            {"input": 'password = "weak"', "output": "false"},
        ],
        "starters": {
            "python": "def is_strong_password(password):\n    # Return True if password is at least 8 chars with upper, lower, and a digit.\n    pass\n",
            "javascript": "function is_strong_password(password) {\n    // Return true if password is at least 8 chars with upper, lower, and a digit.\n}\n",
        },
        "sample_tests": [
            {"args": ["Passw0rd"], "expected": True},
            {"args": ["weak"], "expected": False},
        ],
        "hidden_tests": [
            {"args": [""], "expected": False},
            {"args": ["ALLUPPER1"], "expected": False},
            {"args": ["alllower1"], "expected": False},
            {"args": ["NoDigitsHere"], "expected": False},
            {"args": ["Sh0rt"], "expected": False},
            {"args": ["LongEnough123"], "expected": True},
        ],
    },
    {
        "id": "word-occurrence-counter",
        "title": "Word Occurrence Counter",
        "difficulty": "Easy",
        "function_name": "count_word_occurrences",
        "time_limit_secs": 5,
        "prompt": (
            "Given a block of `text` and a `word`, count how many times `word` appears, "
            "ignoring case and surrounding punctuation. Words are separated by whitespace."
        ),
        "constraints": ["0 <= len(text) <= 10^4"],
        "examples": [
            {"input": 'text = "The cat sat on the mat. The cat was happy.", word = "cat"', "output": "2"},
            {"input": 'text = "Hello hello HELLO!", word = "hello"', "output": "3"},
        ],
        "starters": {
            "python": "def count_word_occurrences(text, word):\n    # Count case-insensitive occurrences of word in text, ignoring punctuation.\n    pass\n",
            "javascript": "function count_word_occurrences(text, word) {\n    // Count case-insensitive occurrences of word in text, ignoring punctuation.\n}\n",
        },
        "sample_tests": [
            {"args": ["The cat sat on the mat. The cat was happy.", "cat"], "expected": 2},
            {"args": ["Hello hello HELLO!", "hello"], "expected": 3},
        ],
        "hidden_tests": [
            {"args": ["", "test"], "expected": 0},
            {"args": ["one two three", "four"], "expected": 0},
            {"args": ["Cat cat CAT cats", "cat"], "expected": 3},
            {"args": ["dog, dog. dog!", "dog"], "expected": 3},
        ],
    },
    {
        "id": "email-format-validator",
        "title": "Email Format Validator",
        "difficulty": "Easy",
        "function_name": "is_valid_email",
        "time_limit_secs": 5,
        "prompt": (
            "Write a basic email format validator for a signup form. Return True if "
            "`email` matches local-part@domain.tld (letters, digits, `.` `_` `%` `+` `-` "
            "in the local part; a domain with at least one dot; a 2+ letter TLD)."
        ),
        "constraints": ["0 <= len(email) <= 200"],
        "examples": [
            {"input": 'email = "user@example.com"', "output": "true"},
            {"input": 'email = "invalid-email"', "output": "false"},
        ],
        "starters": {
            "python": "def is_valid_email(email):\n    # Return True if email looks like local@domain.tld.\n    pass\n",
            "javascript": "function is_valid_email(email) {\n    // Return true if email looks like local@domain.tld.\n}\n",
        },
        "sample_tests": [
            {"args": ["user@example.com"], "expected": True},
            {"args": ["invalid-email"], "expected": False},
        ],
        "hidden_tests": [
            {"args": [""], "expected": False},
            {"args": ["a@b.co"], "expected": True},
            {"args": ["a@b"], "expected": False},
            {"args": ["@example.com"], "expected": False},
            {"args": ["user.name+tag@sub.example.com"], "expected": True},
        ],
    },
    {
        "id": "inventory-reorder-check",
        "title": "Inventory Reorder Check",
        "difficulty": "Easy",
        "function_name": "needs_reorder",
        "time_limit_secs": 5,
        "prompt": (
            "A warehouse system flags an item for reorder once its stock is at or below "
            "its reorder threshold. Return True if `current_stock <= reorder_threshold`."
        ),
        "constraints": ["0 <= current_stock, reorder_threshold <= 10^6"],
        "examples": [
            {"input": "current_stock = 5, reorder_threshold = 10", "output": "true"},
            {"input": "current_stock = 20, reorder_threshold = 10", "output": "false"},
        ],
        "starters": {
            "python": "def needs_reorder(current_stock, reorder_threshold):\n    # Return True if the stock is at or below the reorder threshold.\n    pass\n",
            "javascript": "function needs_reorder(current_stock, reorder_threshold) {\n    // Return true if the stock is at or below the reorder threshold.\n}\n",
        },
        "sample_tests": [
            {"args": [5, 10], "expected": True},
            {"args": [20, 10], "expected": False},
        ],
        "hidden_tests": [
            {"args": [10, 10], "expected": True},
            {"args": [0, 0], "expected": True},
            {"args": [1, 0], "expected": False},
        ],
    },
    {
        "id": "compound-interest-calculator",
        "title": "Compound Interest Calculator",
        "difficulty": "Easy",
        "function_name": "compound_interest",
        "time_limit_secs": 5,
        "prompt": (
            "A savings app needs to project balances. Given a `principal`, an annual "
            "`rate` as a percentage (e.g. 10 for 10%), and a whole number of `years`, "
            "return the compounded balance rounded to 2 decimal places: "
            "principal * (1 + rate/100) ** years."
        ),
        "constraints": ["0 <= principal <= 10^7", "0 <= rate <= 100", "0 <= years <= 50"],
        "examples": [
            {"input": "principal = 1000, rate = 10, years = 2", "output": "1210.0"},
            {"input": "principal = 500, rate = 0, years = 5", "output": "500.0"},
        ],
        "starters": {
            "python": "def compound_interest(principal, rate, years):\n    # Return the compounded balance, rounded to 2 decimals.\n    pass\n",
            "javascript": "function compound_interest(principal, rate, years) {\n    // Return the compounded balance, rounded to 2 decimals.\n}\n",
        },
        "sample_tests": [
            {"args": [1000, 10, 2], "expected": 1210.0},
            {"args": [500, 0, 5], "expected": 500.0},
        ],
        "hidden_tests": [
            {"args": [1000, 5, 0], "expected": 1000.0},
            {"args": [2000, 10, 1], "expected": 2200.0},
            {"args": [100, 100, 1], "expected": 200.0},
        ],
    },
    {
        "id": "username-anagram-check",
        "title": "Username Anagram Check",
        "difficulty": "Easy",
        "function_name": "is_anagram",
        "time_limit_secs": 5,
        "prompt": (
            "A username-suggestion tool flags two candidate names as too similar when "
            "they are anagrams of each other. Return True if `a` and `b` are anagrams, "
            "ignoring case."
        ),
        "constraints": ["0 <= len(a), len(b) <= 200"],
        "examples": [
            {"input": 'a = "listen", b = "silent"', "output": "true"},
            {"input": 'a = "hello", b = "world"', "output": "false"},
        ],
        "starters": {
            "python": "def is_anagram(a, b):\n    # Return True if a and b are anagrams of each other, ignoring case.\n    pass\n",
            "javascript": "function is_anagram(a, b) {\n    // Return true if a and b are anagrams of each other, ignoring case.\n}\n",
        },
        "sample_tests": [
            {"args": ["listen", "silent"], "expected": True},
            {"args": ["hello", "world"], "expected": False},
        ],
        "hidden_tests": [
            {"args": ["", ""], "expected": True},
            {"args": ["A", "a"], "expected": True},
            {"args": ["abc", "abcd"], "expected": False},
            {"args": ["Dormitory", "DirtyRoom"], "expected": True},
        ],
    },
    {
        "id": "shift-time-difference",
        "title": "Shift Time Difference",
        "difficulty": "Medium",
        "function_name": "minutes_between",
        "time_limit_secs": 5,
        "prompt": (
            "A staff scheduling tool needs shift lengths. Given `start_time` and "
            "`end_time` as 24-hour \"HH:MM\" strings on the same day (end at or after "
            "start), return the number of minutes between them."
        ),
        "constraints": ["Both are valid \"HH:MM\" times, 00:00-23:59.", "end_time >= start_time"],
        "examples": [
            {"input": 'start_time = "09:00", end_time = "17:30"', "output": "510"},
            {"input": 'start_time = "08:15", end_time = "08:45"', "output": "30"},
        ],
        "starters": {
            "python": "def minutes_between(start_time, end_time):\n    # Return the number of minutes from start_time to end_time.\n    pass\n",
            "javascript": "function minutes_between(start_time, end_time) {\n    // Return the number of minutes from start_time to end_time.\n}\n",
        },
        "sample_tests": [
            {"args": ["09:00", "17:30"], "expected": 510},
            {"args": ["08:15", "08:45"], "expected": 30},
        ],
        "hidden_tests": [
            {"args": ["00:00", "00:00"], "expected": 0},
            {"args": ["23:00", "23:59"], "expected": 59},
            {"args": ["06:05", "09:00"], "expected": 175},
        ],
    },
    {
        "id": "flatten-shopping-cart",
        "title": "Flatten Shopping Cart",
        "difficulty": "Medium",
        "function_name": "flatten_cart",
        "time_limit_secs": 5,
        "prompt": (
            "A shopping-cart export can nest items inside bundles inside bundles. Given "
            "an arbitrarily nested list `cart` of item name strings, return a single flat "
            "list of item names in their original left-to-right order."
        ),
        "constraints": ["Nesting depth is reasonable (won't overflow recursion)."],
        "examples": [
            {"input": 'cart = ["a", ["b", "c"], "d"]', "output": '["a", "b", "c", "d"]'},
            {"input": 'cart = ["shirt", ["socks", ["belt"]], "hat"]', "output": '["shirt", "socks", "belt", "hat"]'},
        ],
        "starters": {
            "python": "def flatten_cart(cart):\n    # Return a flat list of every item name in cart, in order.\n    pass\n",
            "javascript": "function flatten_cart(cart) {\n    // Return a flat array of every item name in cart, in order.\n}\n",
        },
        "sample_tests": [
            {"args": [["a", ["b", "c"], "d"]], "expected": ["a", "b", "c", "d"]},
            {"args": [["shirt", ["socks", ["belt"]], "hat"]], "expected": ["shirt", "socks", "belt", "hat"]},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": []},
            {"args": [["single"]], "expected": ["single"]},
            {"args": [[[[["deep"]]]]], "expected": ["deep"]},
            {"args": [["x", [], "y"]], "expected": ["x", "y"]},
        ],
    },
    {
        "id": "missing-invoice-number",
        "title": "Missing Invoice Number",
        "difficulty": "Easy",
        "function_name": "find_missing_invoice",
        "time_limit_secs": 5,
        "prompt": (
            "A batch of invoice numbers should be consecutive integers, but exactly one "
            "is missing from the unsorted list `invoices`. Return the missing number."
        ),
        "constraints": ["2 <= len(invoices) <= 10^5"],
        "examples": [
            {"input": "invoices = [1001, 1002, 1004, 1005]", "output": "1003"},
            {"input": "invoices = [5, 6, 8]", "output": "7"},
        ],
        "starters": {
            "python": "def find_missing_invoice(invoices):\n    # Return the one integer missing from this otherwise-consecutive range.\n    pass\n",
            "javascript": "function find_missing_invoice(invoices) {\n    // Return the one integer missing from this otherwise-consecutive range.\n}\n",
        },
        "sample_tests": [
            {"args": [[1001, 1002, 1004, 1005]], "expected": 1003},
            {"args": [[5, 6, 8]], "expected": 7},
        ],
        "hidden_tests": [
            {"args": [[1, 3]], "expected": 2},
            {"args": [[100, 101, 103]], "expected": 102},
            {"args": [[10, 12, 13, 14]], "expected": 11},
        ],
    },
    {
        "id": "group-logs-by-level",
        "title": "Group Logs By Level",
        "difficulty": "Medium",
        "function_name": "group_log_entries",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list of log lines formatted as \"LEVEL: message\" (e.g. \"ERROR: disk "
            "full\"), group the messages by level. Return a dict mapping each level to a "
            "list of its messages, in their original order."
        ),
        "constraints": ["0 <= len(logs) <= 10^4"],
        "examples": [
            {"input": 'logs = ["INFO: started", "ERROR: failed", "INFO: retrying"]',
             "output": '{"INFO": ["started", "retrying"], "ERROR": ["failed"]}'},
        ],
        "starters": {
            "python": "def group_log_entries(logs):\n    # Return {level: [messages...]} grouped from 'LEVEL: message' lines.\n    pass\n",
            "javascript": "function group_log_entries(logs) {\n    // Return {level: [messages...]} grouped from 'LEVEL: message' lines.\n}\n",
        },
        "sample_tests": [
            {"args": [["INFO: started", "ERROR: failed", "INFO: retrying"]],
             "expected": {"INFO": ["started", "retrying"], "ERROR": ["failed"]}},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": {}},
            {"args": [["WARN: low battery"]], "expected": {"WARN": ["low battery"]}},
            {"args": [["INFO: a", "INFO: b", "INFO: c"]], "expected": {"INFO": ["a", "b", "c"]}},
        ],
    },
    {
        "id": "longest-active-streak",
        "title": "Longest Active Streak",
        "difficulty": "Medium",
        "function_name": "longest_active_streak",
        "time_limit_secs": 5,
        "prompt": (
            "A learning platform tracks daily activity. Given a list of booleans `days` "
            "(True = active that day), return the length of the longest consecutive run "
            "of active days."
        ),
        "constraints": ["0 <= len(days) <= 10^5"],
        "examples": [
            {"input": "days = [true, true, false, true, true, true]", "output": "3"},
            {"input": "days = [false, false]", "output": "0"},
        ],
        "starters": {
            "python": "def longest_active_streak(days):\n    # Return the length of the longest run of consecutive True values.\n    pass\n",
            "javascript": "function longest_active_streak(days) {\n    // Return the length of the longest run of consecutive true values.\n}\n",
        },
        "sample_tests": [
            {"args": [[True, True, False, True, True, True]], "expected": 3},
            {"args": [[False, False]], "expected": 0},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": 0},
            {"args": [[True]], "expected": 1},
            {"args": [[True, True, True]], "expected": 3},
            {"args": [[True, False, True, False, True]], "expected": 1},
        ],
    },
    {
        "id": "duplicate-transaction-detector",
        "title": "Duplicate Transaction Detector",
        "difficulty": "Easy",
        "function_name": "has_duplicate_transaction",
        "time_limit_secs": 5,
        "prompt": (
            "A payments system wants to flag a possible double-charge. Return True if "
            "any id in `transaction_ids` appears more than once."
        ),
        "constraints": ["0 <= len(transaction_ids) <= 10^5"],
        "examples": [
            {"input": 'transaction_ids = ["tx1", "tx2", "tx1"]', "output": "true"},
            {"input": 'transaction_ids = ["tx1", "tx2", "tx3"]', "output": "false"},
        ],
        "starters": {
            "python": "def has_duplicate_transaction(transaction_ids):\n    # Return True if any id appears more than once.\n    pass\n",
            "javascript": "function has_duplicate_transaction(transaction_ids) {\n    // Return true if any id appears more than once.\n}\n",
        },
        "sample_tests": [
            {"args": [["tx1", "tx2", "tx1"]], "expected": True},
            {"args": [["tx1", "tx2", "tx3"]], "expected": False},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": False},
            {"args": [["a"]], "expected": False},
            {"args": [["a", "a", "a"]], "expected": True},
        ],
    },
    {
        "id": "median-response-time",
        "title": "Median Response Time",
        "difficulty": "Medium",
        "function_name": "median_response_time",
        "time_limit_secs": 5,
        "prompt": (
            "A monitoring dashboard needs the median API response time. Given a list of "
            "numbers `times`, return their median as a float — for an even count, average "
            "the two middle values."
        ),
        "constraints": ["1 <= len(times) <= 10^5"],
        "examples": [
            {"input": "times = [3, 1, 2]", "output": "2.0"},
            {"input": "times = [10, 20, 30, 40]", "output": "25.0"},
        ],
        "starters": {
            "python": "def median_response_time(times):\n    # Return the median of times as a float.\n    pass\n",
            "javascript": "function median_response_time(times) {\n    // Return the median of times as a number.\n}\n",
        },
        "sample_tests": [
            {"args": [[3, 1, 2]], "expected": 2.0},
            {"args": [[10, 20, 30, 40]], "expected": 25.0},
        ],
        "hidden_tests": [
            {"args": [[5]], "expected": 5.0},
            {"args": [[1, 2]], "expected": 1.5},
            {"args": [[7, 7, 7, 7, 7]], "expected": 7.0},
        ],
    },
    {
        "id": "parse-csv-row",
        "title": "Parse CSV Row",
        "difficulty": "Easy",
        "function_name": "parse_csv_row",
        "time_limit_secs": 5,
        "prompt": (
            "Given a `header` list of column names and one comma-separated `row` string "
            "with the same number of values, return a dict mapping each header to its "
            "value (values stripped of surrounding whitespace)."
        ),
        "constraints": ["len(row.split(',')) == len(header)"],
        "examples": [
            {"input": 'header = ["name", "age"], row = "Ali, 25"', "output": '{"name": "Ali", "age": "25"}'},
        ],
        "starters": {
            "python": "def parse_csv_row(header, row):\n    # Return {header[i]: value_i} from the comma-separated row.\n    pass\n",
            "javascript": "function parse_csv_row(header, row) {\n    // Return {header[i]: value_i} from the comma-separated row.\n}\n",
        },
        "sample_tests": [
            {"args": [["name", "age"], "Ali, 25"], "expected": {"name": "Ali", "age": "25"}},
        ],
        "hidden_tests": [
            {"args": [["a", "b", "c"], "1,2,3"], "expected": {"a": "1", "b": "2", "c": "3"}},
            {"args": [["x"], " hello "], "expected": {"x": "hello"}},
            {"args": [[], ""], "expected": {}},
        ],
    },
    {
        "id": "top-k-error-codes",
        "title": "Top K Error Codes",
        "difficulty": "Medium",
        "function_name": "top_k_frequent",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list of error `codes` (strings) and an integer `k`, return the `k` "
            "most frequent codes as a list ordered by frequency descending. Break ties by "
            "the order the code first appeared in `codes`."
        ),
        "constraints": ["0 <= k <= len(codes)"],
        "examples": [
            {"input": 'codes = ["404", "500", "404", "404", "500"], k = 2', "output": '["404", "500"]'},
        ],
        "starters": {
            "python": "def top_k_frequent(codes, k):\n    # Return the k most frequent codes, ties broken by first-seen order.\n    pass\n",
            "javascript": "function top_k_frequent(codes, k) {\n    // Return the k most frequent codes, ties broken by first-seen order.\n}\n",
        },
        "sample_tests": [
            {"args": [["404", "500", "404", "404", "500"], 2], "expected": ["404", "500"]},
            {"args": [["A", "B", "C"], 2], "expected": ["A", "B"]},
        ],
        "hidden_tests": [
            {"args": [[], 3], "expected": []},
            {"args": [["X"], 5], "expected": ["X"]},
            {"args": [["a", "b", "a", "c", "b", "a"], 1], "expected": ["a"]},
            {"args": [["e1", "e2", "e1", "e2", "e3"], 3], "expected": ["e1", "e2", "e3"]},
        ],
    },
    {
        "id": "sliding-window-rate-limiter",
        "title": "Sliding Window Rate Limiter",
        "difficulty": "Hard",
        "function_name": "is_request_allowed",
        "time_limit_secs": 5,
        "prompt": (
            "Implement a sliding-window rate limiter. Given `existing_timestamps` (a "
            "sorted list of ints, seconds, of previously accepted requests), a "
            "`new_timestamp` (int), a `limit`, and `window_seconds`, return True if the "
            "new request should be ALLOWED: the count of existing timestamps in the "
            "half-open window (new_timestamp - window_seconds, new_timestamp] must be "
            "strictly less than `limit`."
        ),
        "constraints": ["0 <= len(existing_timestamps) <= 10^4", "1 <= limit", "1 <= window_seconds"],
        "examples": [
            {"input": "existing_timestamps = [10, 20], new_timestamp = 35, limit = 3, window_seconds = 30",
             "output": "true"},
            {"input": "existing_timestamps = [10, 20, 30], new_timestamp = 35, limit = 3, window_seconds = 30",
             "output": "false"},
        ],
        "starters": {
            "python": "def is_request_allowed(existing_timestamps, new_timestamp, limit, window_seconds):\n    # Return True if fewer than limit requests fall in the trailing window.\n    pass\n",
            "javascript": "function is_request_allowed(existing_timestamps, new_timestamp, limit, window_seconds) {\n    // Return true if fewer than limit requests fall in the trailing window.\n}\n",
        },
        "sample_tests": [
            {"args": [[10, 20], 35, 3, 30], "expected": True},
            {"args": [[10, 20, 30], 35, 3, 30], "expected": False},
        ],
        "hidden_tests": [
            {"args": [[], 5, 1, 10], "expected": True},
            {"args": [[100], 150, 2, 50], "expected": True},
            {"args": [[100, 120, 140], 150, 2, 50], "expected": False},
            {"args": [[1, 2, 3, 4, 5], 10, 10, 100], "expected": True},
        ],
    },
    {
        "id": "format-phone-number",
        "title": "Format Phone Number",
        "difficulty": "Easy",
        "function_name": "format_phone_number",
        "time_limit_secs": 5,
        "prompt": (
            "Given a string `digits` that contains exactly 10 digit characters mixed in "
            "with other formatting characters (spaces, dashes, parentheses, dots), return "
            "just the digits formatted as \"XXX-XXX-XXXX\"."
        ),
        "constraints": ["digits contains exactly 10 digit characters."],
        "examples": [
            {"input": 'digits = "1234567890"', "output": '"123-456-7890"'},
            {"input": 'digits = "(123) 456-7890"', "output": '"123-456-7890"'},
        ],
        "starters": {
            "python": "def format_phone_number(digits):\n    # Return the 10 digits in digits formatted as XXX-XXX-XXXX.\n    pass\n",
            "javascript": "function format_phone_number(digits) {\n    // Return the 10 digits in digits formatted as XXX-XXX-XXXX.\n}\n",
        },
        "sample_tests": [
            {"args": ["1234567890"], "expected": "123-456-7890"},
            {"args": ["(123) 456-7890"], "expected": "123-456-7890"},
        ],
        "hidden_tests": [
            {"args": ["123.456.7890"], "expected": "123-456-7890"},
            {"args": [" 987 654 3210 "], "expected": "987-654-3210"},
        ],
    },
    {
        "id": "average-rating-calculator",
        "title": "Average Rating Calculator",
        "difficulty": "Easy",
        "function_name": "average_rating",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list of numeric `ratings`, return their average rounded to 1 decimal "
            "place. Return 0.0 for an empty list."
        ),
        "constraints": ["0 <= len(ratings) <= 10^5"],
        "examples": [
            {"input": "ratings = [5, 5, 4, 4]", "output": "4.5"},
            {"input": "ratings = [3, 3, 3]", "output": "3.0"},
        ],
        "starters": {
            "python": "def average_rating(ratings):\n    # Return the average of ratings, rounded to 1 decimal, or 0.0 if empty.\n    pass\n",
            "javascript": "function average_rating(ratings) {\n    // Return the average of ratings, rounded to 1 decimal, or 0.0 if empty.\n}\n",
        },
        "sample_tests": [
            {"args": [[5, 5, 4, 4]], "expected": 4.5},
            {"args": [[3, 3, 3]], "expected": 3.0},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": 0.0},
            {"args": [[5]], "expected": 5.0},
            {"args": [[1, 2, 3, 4, 5]], "expected": 3.0},
            {"args": [[4, 4, 5]], "expected": 4.3},
        ],
    },
    {
        "id": "merge-sorted-employee-ids",
        "title": "Merge Sorted Employee ID Lists",
        "difficulty": "Easy",
        "function_name": "merge_sorted_lists",
        "time_limit_secs": 5,
        "prompt": (
            "Two branch offices each export their employee IDs already sorted ascending. "
            "Given `list1` and `list2`, return one merged, sorted list containing every id "
            "from both (duplicates kept)."
        ),
        "constraints": ["0 <= len(list1), len(list2) <= 10^5"],
        "examples": [
            {"input": "list1 = [1, 3, 5], list2 = [2, 4, 6]", "output": "[1, 2, 3, 4, 5, 6]"},
            {"input": "list1 = [], list2 = [1, 2]", "output": "[1, 2]"},
        ],
        "starters": {
            "python": "def merge_sorted_lists(list1, list2):\n    # Return list1 and list2 merged into one sorted list.\n    pass\n",
            "javascript": "function merge_sorted_lists(list1, list2) {\n    // Return list1 and list2 merged into one sorted array.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 3, 5], [2, 4, 6]], "expected": [1, 2, 3, 4, 5, 6]},
            {"args": [[], [1, 2]], "expected": [1, 2]},
        ],
        "hidden_tests": [
            {"args": [[1, 2, 3], []], "expected": [1, 2, 3]},
            {"args": [[5], [1, 2, 3]], "expected": [1, 2, 3, 5]},
            {"args": [[1, 1, 2], [1, 3]], "expected": [1, 1, 1, 2, 3]},
        ],
    },

    # --- Batch 3: more practical/real-world framed problems (bank expansion continues). ---
    {
        "id": "validate-username",
        "title": "Validate Username",
        "difficulty": "Easy",
        "function_name": "is_valid_username",
        "time_limit_secs": 5,
        "prompt": (
            "A signup form needs a username validator. A username is VALID if it is 3-16 "
            "characters long, starts with a letter, and contains only letters, digits, "
            "and underscores."
        ),
        "constraints": ["0 <= len(username) <= 50"],
        "examples": [
            {"input": 'username = "john_doe123"', "output": "true"},
            {"input": 'username = "1abc"', "output": "false"},
        ],
        "starters": {
            "python": "def is_valid_username(username):\n    # Return True if username is 3-16 chars, starts with a letter, and is alnum/underscore.\n    pass\n",
            "javascript": "function is_valid_username(username) {\n    // Return true if username is 3-16 chars, starts with a letter, and is alnum/underscore.\n}\n",
        },
        "sample_tests": [
            {"args": ["john_doe123"], "expected": True},
            {"args": ["1abc"], "expected": False},
        ],
        "hidden_tests": [
            {"args": [""], "expected": False},
            {"args": ["ab"], "expected": False},
            {"args": ["a" * 17], "expected": False},
            {"args": ["valid_Name"], "expected": True},
            {"args": ["bad-name"], "expected": False},
        ],
    },
    {
        "id": "employee-of-the-month",
        "title": "Employee Of The Month",
        "difficulty": "Easy",
        "function_name": "find_top_performer",
        "time_limit_secs": 5,
        "prompt": (
            "Given a dict `scores` mapping employee name to their monthly score, return "
            "the name of the top performer. Break a tie by returning the alphabetically "
            "first name."
        ),
        "constraints": ["1 <= len(scores) <= 1000"],
        "examples": [
            {"input": 'scores = {"Ali": 90, "Sara": 95, "Bob": 95}', "output": '"Bob"'},
        ],
        "starters": {
            "python": "def find_top_performer(scores):\n    # Return the name with the highest score, alphabetically first on a tie.\n    pass\n",
            "javascript": "function find_top_performer(scores) {\n    // Return the name with the highest score, alphabetically first on a tie.\n}\n",
        },
        "sample_tests": [
            {"args": [{"Ali": 90, "Sara": 95, "Bob": 95}], "expected": "Bob"},
            {"args": [{"X": 50}], "expected": "X"},
        ],
        "hidden_tests": [
            {"args": [{"A": 10, "B": 20, "C": 15}], "expected": "B"},
            {"args": [{"Zed": 5, "Amy": 5}], "expected": "Amy"},
            {"args": [{"John": 100, "Jane": 100, "Jack": 100}], "expected": "Jack"},
        ],
    },
    {
        "id": "session-timeout-checker",
        "title": "Session Timeout Checker",
        "difficulty": "Easy",
        "function_name": "is_session_expired",
        "time_limit_secs": 5,
        "prompt": (
            "Given how many seconds ago the user was last active "
            "(`last_activity_seconds_ago`) and the session `timeout_seconds`, return True "
            "if the session should be considered expired."
        ),
        "constraints": ["0 <= last_activity_seconds_ago, timeout_seconds <= 10^7"],
        "examples": [
            {"input": "last_activity_seconds_ago = 400, timeout_seconds = 300", "output": "true"},
            {"input": "last_activity_seconds_ago = 100, timeout_seconds = 300", "output": "false"},
        ],
        "starters": {
            "python": "def is_session_expired(last_activity_seconds_ago, timeout_seconds):\n    # Return True if the session has been idle at or beyond the timeout.\n    pass\n",
            "javascript": "function is_session_expired(last_activity_seconds_ago, timeout_seconds) {\n    // Return true if the session has been idle at or beyond the timeout.\n}\n",
        },
        "sample_tests": [
            {"args": [400, 300], "expected": True},
            {"args": [100, 300], "expected": False},
        ],
        "hidden_tests": [
            {"args": [300, 300], "expected": True},
            {"args": [0, 60], "expected": False},
            {"args": [59, 60], "expected": False},
        ],
    },
    {
        "id": "calculate-shipping-cost",
        "title": "Calculate Shipping Cost",
        "difficulty": "Easy",
        "function_name": "shipping_cost",
        "time_limit_secs": 5,
        "prompt": (
            "A store charges shipping by weight tier: $5 for up to and including 1kg, $10 "
            "for up to and including 5kg, and $20 for anything heavier. Return the cost "
            "for `weight_kg`."
        ),
        "constraints": ["0 < weight_kg <= 1000"],
        "examples": [
            {"input": "weight_kg = 0.5", "output": "5"},
            {"input": "weight_kg = 3", "output": "10"},
        ],
        "starters": {
            "python": "def shipping_cost(weight_kg):\n    # Return 5, 10, or 20 based on the weight tier.\n    pass\n",
            "javascript": "function shipping_cost(weight_kg) {\n    // Return 5, 10, or 20 based on the weight tier.\n}\n",
        },
        "sample_tests": [
            {"args": [0.5], "expected": 5},
            {"args": [3], "expected": 10},
        ],
        "hidden_tests": [
            {"args": [1], "expected": 5},
            {"args": [5], "expected": 10},
            {"args": [5.1], "expected": 20},
            {"args": [100], "expected": 20},
        ],
    },
    {
        "id": "count-vowels-consonants",
        "title": "Count Vowels And Consonants",
        "difficulty": "Easy",
        "function_name": "count_letters",
        "time_limit_secs": 5,
        "prompt": (
            "Given a string `s`, return a dict {\"vowels\": n, \"consonants\": n} counting "
            "only alphabetic characters, case-insensitively (a, e, i, o, u are vowels)."
        ),
        "constraints": ["0 <= len(s) <= 10^4"],
        "examples": [
            {"input": 's = "Hello World"', "output": '{"vowels": 3, "consonants": 7}'},
        ],
        "starters": {
            "python": "def count_letters(s):\n    # Return {'vowels': n, 'consonants': n} for the letters in s.\n    pass\n",
            "javascript": "function count_letters(s) {\n    // Return {vowels: n, consonants: n} for the letters in s.\n}\n",
        },
        "sample_tests": [
            {"args": ["Hello World"], "expected": {"vowels": 3, "consonants": 7}},
            {"args": [""], "expected": {"vowels": 0, "consonants": 0}},
        ],
        "hidden_tests": [
            {"args": ["123"], "expected": {"vowels": 0, "consonants": 0}},
            {"args": ["AEIOU"], "expected": {"vowels": 5, "consonants": 0}},
            {"args": ["xyz"], "expected": {"vowels": 0, "consonants": 3}},
        ],
    },
    {
        "id": "reverse-words-in-sentence",
        "title": "Reverse Words In A Sentence",
        "difficulty": "Easy",
        "function_name": "reverse_words",
        "time_limit_secs": 5,
        "prompt": (
            "Given a `sentence`, return it with the word order reversed. Collapse any "
            "extra whitespace, and the result must have no leading or trailing spaces."
        ),
        "constraints": ["0 <= len(sentence) <= 10^4"],
        "examples": [
            {"input": 'sentence = "Hello World Foo"', "output": '"Foo World Hello"'},
        ],
        "starters": {
            "python": "def reverse_words(sentence):\n    # Return sentence with its words in reverse order.\n    pass\n",
            "javascript": "function reverse_words(sentence) {\n    // Return sentence with its words in reverse order.\n}\n",
        },
        "sample_tests": [
            {"args": ["Hello World Foo"], "expected": "Foo World Hello"},
            {"args": ["single"], "expected": "single"},
        ],
        "hidden_tests": [
            {"args": [""], "expected": ""},
            {"args": ["  extra   spaces  "], "expected": "spaces extra"},
            {"args": ["a b c d"], "expected": "d c b a"},
        ],
    },
    {
        "id": "find-longest-word",
        "title": "Find The Longest Word",
        "difficulty": "Easy",
        "function_name": "longest_word",
        "time_limit_secs": 5,
        "prompt": (
            "Given a `sentence` of whitespace-separated words, return the longest word. "
            "Break a tie by returning whichever comes first in the sentence."
        ),
        "constraints": ["0 <= len(sentence) <= 10^4"],
        "examples": [
            {"input": 'sentence = "the quick brown fox"', "output": '"quick"'},
        ],
        "starters": {
            "python": "def longest_word(sentence):\n    # Return the longest word, first occurrence wins ties.\n    pass\n",
            "javascript": "function longest_word(sentence) {\n    // Return the longest word, first occurrence wins ties.\n}\n",
        },
        "sample_tests": [
            {"args": ["the quick brown fox"], "expected": "quick"},
            {"args": [""], "expected": ""},
        ],
        "hidden_tests": [
            {"args": ["a bb ccc"], "expected": "ccc"},
            {"args": ["same size ab cd"], "expected": "same"},
            {"args": ["one"], "expected": "one"},
        ],
    },
    {
        "id": "celsius-to-fahrenheit",
        "title": "Celsius To Fahrenheit",
        "difficulty": "Easy",
        "function_name": "celsius_to_fahrenheit",
        "time_limit_secs": 5,
        "prompt": (
            "A weather app stores temperatures internally in Celsius but needs to display "
            "Fahrenheit. Given `celsius`, return the Fahrenheit value rounded to 1 decimal "
            "place: celsius * 9/5 + 32."
        ),
        "constraints": ["-273 <= celsius <= 1000"],
        "examples": [
            {"input": "celsius = 0", "output": "32.0"},
            {"input": "celsius = 100", "output": "212.0"},
        ],
        "starters": {
            "python": "def celsius_to_fahrenheit(celsius):\n    # Return celsius converted to Fahrenheit, rounded to 1 decimal.\n    pass\n",
            "javascript": "function celsius_to_fahrenheit(celsius) {\n    // Return celsius converted to Fahrenheit, rounded to 1 decimal.\n}\n",
        },
        "sample_tests": [
            {"args": [0], "expected": 32.0},
            {"args": [100], "expected": 212.0},
        ],
        "hidden_tests": [
            {"args": [-40], "expected": -40.0},
            {"args": [37], "expected": 98.6},
            {"args": [20], "expected": 68.0},
        ],
    },
    {
        "id": "leap-year-checker",
        "title": "Leap Year Checker",
        "difficulty": "Easy",
        "function_name": "is_leap_year",
        "time_limit_secs": 5,
        "prompt": (
            "Return True if `year` is a leap year: divisible by 4, except centuries "
            "(divisible by 100) which must also be divisible by 400."
        ),
        "constraints": ["1 <= year <= 9999"],
        "examples": [
            {"input": "year = 2000", "output": "true"},
            {"input": "year = 1900", "output": "false"},
        ],
        "starters": {
            "python": "def is_leap_year(year):\n    # Return True if year is a leap year.\n    pass\n",
            "javascript": "function is_leap_year(year) {\n    // Return true if year is a leap year.\n}\n",
        },
        "sample_tests": [
            {"args": [2000], "expected": True},
            {"args": [1900], "expected": False},
        ],
        "hidden_tests": [
            {"args": [2024], "expected": True},
            {"args": [2023], "expected": False},
            {"args": [2100], "expected": False},
            {"args": [2400], "expected": True},
        ],
    },
    {
        "id": "chunk-array",
        "title": "Chunk Array",
        "difficulty": "Easy",
        "function_name": "chunk_list",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list `arr` and a chunk `size`, split arr into consecutive sublists of "
            "length size (the last chunk may be shorter)."
        ),
        "constraints": ["0 <= len(arr) <= 10^4", "1 <= size"],
        "examples": [
            {"input": "arr = [1, 2, 3, 4, 5], size = 2", "output": "[[1, 2], [3, 4], [5]]"},
        ],
        "starters": {
            "python": "def chunk_list(arr, size):\n    # Return arr split into consecutive chunks of length size.\n    pass\n",
            "javascript": "function chunk_list(arr, size) {\n    // Return arr split into consecutive chunks of length size.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 3, 4, 5], 2], "expected": [[1, 2], [3, 4], [5]]},
            {"args": [[1, 2, 3], 3], "expected": [[1, 2, 3]]},
        ],
        "hidden_tests": [
            {"args": [[], 2], "expected": []},
            {"args": [[1], 1], "expected": [[1]]},
            {"args": [[1, 2, 3, 4], 5], "expected": [[1, 2, 3, 4]]},
        ],
    },
    {
        "id": "url-slug-generator",
        "title": "URL Slug Generator",
        "difficulty": "Easy",
        "function_name": "slugify",
        "time_limit_secs": 5,
        "prompt": (
            "Convert a page `title` into a URL slug: lowercase, spaces become hyphens, and "
            "any character that isn't a letter, digit, or hyphen is removed. Collapse "
            "consecutive hyphens into one, and strip leading/trailing hyphens."
        ),
        "constraints": ["0 <= len(title) <= 200"],
        "examples": [
            {"input": 'title = "Hello World!"', "output": '"hello-world"'},
        ],
        "starters": {
            "python": "def slugify(title):\n    # Return title converted into a lowercase, hyphenated URL slug.\n    pass\n",
            "javascript": "function slugify(title) {\n    // Return title converted into a lowercase, hyphenated URL slug.\n}\n",
        },
        "sample_tests": [
            {"args": ["Hello World!"], "expected": "hello-world"},
            {"args": ["  My   Cool Title  "], "expected": "my-cool-title"},
        ],
        "hidden_tests": [
            {"args": ["Already-Slugged"], "expected": "already-slugged"},
            {"args": ["Café Menu"], "expected": "caf-menu"},
            {"args": ["100% Off!!"], "expected": "100-off"},
        ],
    },
    {
        "id": "bmi-category-checker",
        "title": "BMI Category Checker",
        "difficulty": "Easy",
        "function_name": "bmi_category",
        "time_limit_secs": 5,
        "prompt": (
            "Given `weight_kg` and `height_m`, compute BMI = weight_kg / height_m^2 and "
            "return its category: \"Underweight\" (< 18.5), \"Normal\" (< 25), "
            "\"Overweight\" (< 30), or \"Obese\" otherwise."
        ),
        "constraints": ["0 < weight_kg <= 500", "0 < height_m <= 3"],
        "examples": [
            {"input": "weight_kg = 70, height_m = 1.75", "output": '"Normal"'},
        ],
        "starters": {
            "python": "def bmi_category(weight_kg, height_m):\n    # Return the BMI category for weight_kg and height_m.\n    pass\n",
            "javascript": "function bmi_category(weight_kg, height_m) {\n    // Return the BMI category for weight_kg and height_m.\n}\n",
        },
        "sample_tests": [
            {"args": [70, 1.75], "expected": "Normal"},
            {"args": [50, 1.7], "expected": "Underweight"},
        ],
        "hidden_tests": [
            {"args": [90, 1.7], "expected": "Obese"},
            {"args": [80, 1.8], "expected": "Normal"},
            {"args": [95, 1.75], "expected": "Obese"},
        ],
    },
    {
        "id": "matrix-transpose",
        "title": "Matrix Transpose",
        "difficulty": "Easy",
        "function_name": "transpose_matrix",
        "time_limit_secs": 5,
        "prompt": "Given a 2D list `matrix`, return its transpose (rows and columns swapped).",
        "constraints": ["0 <= rows, cols <= 100"],
        "examples": [
            {"input": "matrix = [[1, 2, 3], [4, 5, 6]]", "output": "[[1, 4], [2, 5], [3, 6]]"},
        ],
        "starters": {
            "python": "def transpose_matrix(matrix):\n    # Return the transpose of matrix.\n    pass\n",
            "javascript": "function transpose_matrix(matrix) {\n    // Return the transpose of matrix.\n}\n",
        },
        "sample_tests": [
            {"args": [[[1, 2, 3], [4, 5, 6]]], "expected": [[1, 4], [2, 5], [3, 6]]},
        ],
        "hidden_tests": [
            {"args": [[[1]]], "expected": [[1]]},
            {"args": [[]], "expected": []},
            {"args": [[[1, 2], [3, 4], [5, 6]]], "expected": [[1, 3, 5], [2, 4, 6]]},
        ],
    },
    {
        "id": "common-tags-finder",
        "title": "Common Tags Finder",
        "difficulty": "Easy",
        "function_name": "common_tags",
        "time_limit_secs": 5,
        "prompt": (
            "Given two lists of content tags `list1` and `list2`, return a sorted list of "
            "the unique tags present in both."
        ),
        "constraints": ["0 <= len(list1), len(list2) <= 10^4"],
        "examples": [
            {"input": 'list1 = ["python", "react", "sql"], list2 = ["sql", "node", "python"]',
             "output": '["python", "sql"]'},
        ],
        "starters": {
            "python": "def common_tags(list1, list2):\n    # Return a sorted list of tags present in both lists.\n    pass\n",
            "javascript": "function common_tags(list1, list2) {\n    // Return a sorted array of tags present in both lists.\n}\n",
        },
        "sample_tests": [
            {"args": [["python", "react", "sql"], ["sql", "node", "python"]], "expected": ["python", "sql"]},
        ],
        "hidden_tests": [
            {"args": [[], ["a"]], "expected": []},
            {"args": [["a", "a", "b"], ["a", "c"]], "expected": ["a"]},
            {"args": [["x", "y"], ["z"]], "expected": []},
        ],
    },
    {
        "id": "merge-user-preferences",
        "title": "Merge User Preferences",
        "difficulty": "Medium",
        "function_name": "merge_preferences",
        "time_limit_secs": 5,
        "prompt": (
            "Given a `defaults` dict and an `overrides` dict of user settings, return a "
            "merged dict containing every key from both, where a key present in both takes "
            "its value from `overrides`."
        ),
        "constraints": ["0 <= len(defaults), len(overrides) <= 1000"],
        "examples": [
            {"input": 'defaults = {"theme": "light", "fontSize": 12}, overrides = {"theme": "dark"}',
             "output": '{"theme": "dark", "fontSize": 12}'},
        ],
        "starters": {
            "python": "def merge_preferences(defaults, overrides):\n    # Return defaults merged with overrides, overrides winning on shared keys.\n    pass\n",
            "javascript": "function merge_preferences(defaults, overrides) {\n    // Return defaults merged with overrides, overrides winning on shared keys.\n}\n",
        },
        "sample_tests": [
            {"args": [{"theme": "light", "fontSize": 12}, {"theme": "dark"}],
             "expected": {"theme": "dark", "fontSize": 12}},
        ],
        "hidden_tests": [
            {"args": [{}, {"a": 1}], "expected": {"a": 1}},
            {"args": [{"a": 1}, {}], "expected": {"a": 1}},
            {"args": [{"x": 1, "y": 2}, {"y": 3, "z": 4}], "expected": {"x": 1, "y": 3, "z": 4}},
        ],
    },
    {
        "id": "peak-sales-day",
        "title": "Peak Sales Day",
        "difficulty": "Medium",
        "function_name": "peak_day",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list of daily `sales` figures, return the 0-based index of the day "
            "with the highest sales. Break a tie by returning the earliest such day."
        ),
        "constraints": ["1 <= len(sales) <= 10^5"],
        "examples": [
            {"input": "sales = [10, 50, 30, 50, 20]", "output": "1"},
        ],
        "starters": {
            "python": "def peak_day(sales):\n    # Return the index of the highest value in sales (first occurrence on a tie).\n    pass\n",
            "javascript": "function peak_day(sales) {\n    // Return the index of the highest value in sales (first occurrence on a tie).\n}\n",
        },
        "sample_tests": [
            {"args": [[10, 50, 30, 50, 20]], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [[5]], "expected": 0},
            {"args": [[1, 2, 3]], "expected": 2},
            {"args": [[3, 3, 3]], "expected": 0},
        ],
    },
    {
        "id": "job-priority-scheduler",
        "title": "Job Priority Scheduler",
        "difficulty": "Medium",
        "function_name": "next_job",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list of `jobs`, each as [name, priority] where a LOWER priority "
            "number is more urgent, return the name of the job that should run next. "
            "Break a tie by whichever job appears first in the list."
        ),
        "constraints": ["1 <= len(jobs) <= 10^4"],
        "examples": [
            {"input": 'jobs = [["deploy", 2], ["build", 1], ["test", 1]]', "output": '"build"'},
        ],
        "starters": {
            "python": "def next_job(jobs):\n    # Return the name of the lowest-priority-number job (first occurrence on a tie).\n    pass\n",
            "javascript": "function next_job(jobs) {\n    // Return the name of the lowest-priority-number job (first occurrence on a tie).\n}\n",
        },
        "sample_tests": [
            {"args": [[["deploy", 2], ["build", 1], ["test", 1]]], "expected": "build"},
            {"args": [[["a", 5]]], "expected": "a"},
        ],
        "hidden_tests": [
            {"args": [[["x", 3], ["y", 3], ["z", 1]]], "expected": "z"},
            {"args": [[["p", 1], ["q", 1], ["r", 1]]], "expected": "p"},
            {"args": [[["only", 10]]], "expected": "only"},
        ],
    },
    {
        "id": "discount-tier-calculator",
        "title": "Discount Tier Calculator",
        "difficulty": "Medium",
        "function_name": "discount_tier",
        "time_limit_secs": 5,
        "prompt": (
            "A loyalty program grants a discount based on total lifetime spend: 0% below "
            "$500, 5% from $500 up to (not including) $2000, 10% from $2000 up to (not "
            "including) $5000, and 15% at $5000 or above. Return the discount percentage."
        ),
        "constraints": ["0 <= total_spent <= 10^7"],
        "examples": [
            {"input": "total_spent = 100", "output": "0"},
            {"input": "total_spent = 1000", "output": "5"},
        ],
        "starters": {
            "python": "def discount_tier(total_spent):\n    # Return 0, 5, 10, or 15 based on the spend tier.\n    pass\n",
            "javascript": "function discount_tier(total_spent) {\n    // Return 0, 5, 10, or 15 based on the spend tier.\n}\n",
        },
        "sample_tests": [
            {"args": [100], "expected": 0},
            {"args": [1000], "expected": 5},
        ],
        "hidden_tests": [
            {"args": [499], "expected": 0},
            {"args": [500], "expected": 5},
            {"args": [2000], "expected": 10},
            {"args": [4999], "expected": 10},
            {"args": [5000], "expected": 15},
        ],
    },
    {
        "id": "temperature-anomaly-detector",
        "title": "Temperature Anomaly Detector",
        "difficulty": "Medium",
        "function_name": "find_anomalies",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list of `readings` and a `threshold`, return the 0-based indices "
            "(ascending) of every reading whose absolute deviation from the mean of ALL "
            "readings exceeds threshold."
        ),
        "constraints": ["0 <= len(readings) <= 10^5"],
        "examples": [
            {"input": "readings = [10, 11, 9, 10, 11, 9, 10, 11, 9, 60], threshold = 8", "output": "[9]"},
        ],
        "starters": {
            "python": "def find_anomalies(readings, threshold):\n    # Return indices whose deviation from the mean exceeds threshold.\n    pass\n",
            "javascript": "function find_anomalies(readings, threshold) {\n    // Return indices whose deviation from the mean exceeds threshold.\n}\n",
        },
        "sample_tests": [
            {"args": [[10, 11, 9, 10, 11, 9, 10, 11, 9, 60], 8], "expected": [9]},
            {"args": [[10, 12, 11, 13, 10], 5], "expected": []},
        ],
        "hidden_tests": [
            {"args": [[100, 100, 100], 1], "expected": []},
            {"args": [[1, 1, 1, 1, 100], 50], "expected": [4]},
            {"args": [[], 5], "expected": []},
        ],
    },
    {
        "id": "count-business-days",
        "title": "Count Business Days",
        "difficulty": "Medium",
        "function_name": "count_business_days",
        "time_limit_secs": 5,
        "prompt": (
            "Given a `start_day_index` (0=Monday ... 6=Sunday) and `num_days` consecutive "
            "calendar days starting from and including that day, return how many of those "
            "days are weekdays (Monday-Friday)."
        ),
        "constraints": ["0 <= start_day_index <= 6", "0 <= num_days <= 10^5"],
        "examples": [
            {"input": "start_day_index = 0, num_days = 7", "output": "5"},
        ],
        "starters": {
            "python": "def count_business_days(start_day_index, num_days):\n    # Return how many of the num_days starting at start_day_index are weekdays.\n    pass\n",
            "javascript": "function count_business_days(start_day_index, num_days) {\n    // Return how many of the num_days starting at start_day_index are weekdays.\n}\n",
        },
        "sample_tests": [
            {"args": [0, 7], "expected": 5},
            {"args": [5, 3], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [0, 5], "expected": 5},
            {"args": [0, 1], "expected": 1},
            {"args": [4, 3], "expected": 1},
            {"args": [0, 14], "expected": 10},
        ],
    },

    # --- Batch 4: more practical/real-world framed problems (bank expansion continues). ---
    {
        "id": "calculate-age-in-years",
        "title": "Calculate Age In Years",
        "difficulty": "Easy",
        "function_name": "age_in_years",
        "time_limit_secs": 5,
        "prompt": "Given a `birth_year` and a `current_year`, return the person's age in whole years.",
        "constraints": ["1 <= birth_year <= current_year <= 9999"],
        "examples": [{"input": "birth_year = 1990, current_year = 2024", "output": "34"}],
        "starters": {
            "python": "def age_in_years(birth_year, current_year):\n    # Return current_year - birth_year.\n    pass\n",
            "javascript": "function age_in_years(birth_year, current_year) {\n    // Return current_year - birth_year.\n}\n",
        },
        "sample_tests": [
            {"args": [1990, 2024], "expected": 34},
            {"args": [2000, 2000], "expected": 0},
        ],
        "hidden_tests": [
            {"args": [1999, 2023], "expected": 24},
            {"args": [1800, 2024], "expected": 224},
        ],
    },
    {
        "id": "is-prime-number",
        "title": "Is Prime Number",
        "difficulty": "Easy",
        "function_name": "is_prime",
        "time_limit_secs": 5,
        "prompt": "Return True if `n` is a prime number.",
        "constraints": ["0 <= n <= 10^9"],
        "examples": [
            {"input": "n = 7", "output": "true"},
            {"input": "n = 10", "output": "false"},
        ],
        "starters": {
            "python": "def is_prime(n):\n    # Return True if n is prime.\n    pass\n",
            "javascript": "function is_prime(n) {\n    // Return true if n is prime.\n}\n",
        },
        "sample_tests": [
            {"args": [7], "expected": True},
            {"args": [10], "expected": False},
        ],
        "hidden_tests": [
            {"args": [1], "expected": False},
            {"args": [2], "expected": True},
            {"args": [97], "expected": True},
            {"args": [100], "expected": False},
            {"args": [0], "expected": False},
        ],
    },
    {
        "id": "gcd-of-two-numbers",
        "title": "GCD Of Two Numbers",
        "difficulty": "Easy",
        "function_name": "gcd",
        "time_limit_secs": 5,
        "prompt": "Return the greatest common divisor of `a` and `b`.",
        "constraints": ["0 <= a, b <= 10^9"],
        "examples": [{"input": "a = 12, b = 18", "output": "6"}],
        "starters": {
            "python": "def gcd(a, b):\n    # Return the greatest common divisor of a and b.\n    pass\n",
            "javascript": "function gcd(a, b) {\n    // Return the greatest common divisor of a and b.\n}\n",
        },
        "sample_tests": [
            {"args": [12, 18], "expected": 6},
            {"args": [7, 13], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [0, 5], "expected": 5},
            {"args": [5, 0], "expected": 5},
            {"args": [100, 75], "expected": 25},
            {"args": [17, 17], "expected": 17},
        ],
    },
    {
        "id": "reverse-integer",
        "title": "Reverse Integer",
        "difficulty": "Easy",
        "function_name": "reverse_integer",
        "time_limit_secs": 5,
        "prompt": "Given an integer `n`, return its digits reversed, preserving the sign.",
        "constraints": ["-10^9 <= n <= 10^9"],
        "examples": [
            {"input": "n = 123", "output": "321"},
            {"input": "n = -456", "output": "-654"},
        ],
        "starters": {
            "python": "def reverse_integer(n):\n    # Return n with its digits reversed, keeping the sign.\n    pass\n",
            "javascript": "function reverse_integer(n) {\n    // Return n with its digits reversed, keeping the sign.\n}\n",
        },
        "sample_tests": [
            {"args": [123], "expected": 321},
            {"args": [-456], "expected": -654},
        ],
        "hidden_tests": [
            {"args": [0], "expected": 0},
            {"args": [100], "expected": 1},
            {"args": [120], "expected": 21},
            {"args": [7], "expected": 7},
        ],
    },
    {
        "id": "count-character-frequency",
        "title": "Count Character Frequency",
        "difficulty": "Easy",
        "function_name": "char_frequency",
        "time_limit_secs": 5,
        "prompt": "Given a string `s`, return a dict mapping each character to how many times it appears.",
        "constraints": ["0 <= len(s) <= 10^4"],
        "examples": [{"input": 's = "aab"', "output": '{"a": 2, "b": 1}'}],
        "starters": {
            "python": "def char_frequency(s):\n    # Return {char: count} for every character in s.\n    pass\n",
            "javascript": "function char_frequency(s) {\n    // Return {char: count} for every character in s.\n}\n",
        },
        "sample_tests": [
            {"args": ["aab"], "expected": {"a": 2, "b": 1}},
        ],
        "hidden_tests": [
            {"args": [""], "expected": {}},
            {"args": ["aaa"], "expected": {"a": 3}},
            {"args": ["ab ab"], "expected": {"a": 2, "b": 2, " ": 1}},
        ],
    },
    {
        "id": "validate-parentheses-depth",
        "title": "Validate Parentheses Depth",
        "difficulty": "Medium",
        "function_name": "max_nesting_depth",
        "time_limit_secs": 5,
        "prompt": (
            "Given a balanced string `s` of only '(' and ')' characters, return the "
            "maximum nesting depth reached."
        ),
        "constraints": ["0 <= len(s) <= 10^4", "s is balanced."],
        "examples": [
            {"input": 's = "((()))"', "output": "3"},
            {"input": 's = "()()"', "output": "1"},
        ],
        "starters": {
            "python": "def max_nesting_depth(s):\n    # Return the deepest level of nested parentheses in s.\n    pass\n",
            "javascript": "function max_nesting_depth(s) {\n    // Return the deepest level of nested parentheses in s.\n}\n",
        },
        "sample_tests": [
            {"args": ["((()))"], "expected": 3},
            {"args": ["()()"], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [""], "expected": 0},
            {"args": ["()"], "expected": 1},
            {"args": ["(((())))"], "expected": 4},
        ],
    },
    {
        "id": "calculate-cart-item-count",
        "title": "Calculate Cart Item Count",
        "difficulty": "Easy",
        "function_name": "total_items",
        "time_limit_secs": 5,
        "prompt": "Given a `cart` dict mapping item name to quantity, return the total number of items.",
        "constraints": ["0 <= len(cart) <= 1000"],
        "examples": [{"input": 'cart = {"apple": 2, "banana": 3}', "output": "5"}],
        "starters": {
            "python": "def total_items(cart):\n    # Return the sum of all quantities in cart.\n    pass\n",
            "javascript": "function total_items(cart) {\n    // Return the sum of all quantities in cart.\n}\n",
        },
        "sample_tests": [
            {"args": [{"apple": 2, "banana": 3}], "expected": 5},
        ],
        "hidden_tests": [
            {"args": [{}], "expected": 0},
            {"args": [{"x": 1}], "expected": 1},
            {"args": [{"a": 10, "b": 0, "c": 5}], "expected": 15},
        ],
    },
    {
        "id": "find-second-largest",
        "title": "Find Second Largest",
        "difficulty": "Easy",
        "function_name": "second_largest",
        "time_limit_secs": 5,
        "prompt": "Given a list `nums` with at least 2 distinct values, return the second largest distinct value.",
        "constraints": ["2 <= len(nums) <= 10^5"],
        "examples": [{"input": "nums = [10, 20, 4, 45, 99]", "output": "45"}],
        "starters": {
            "python": "def second_largest(nums):\n    # Return the second largest DISTINCT value in nums.\n    pass\n",
            "javascript": "function second_largest(nums) {\n    // Return the second largest DISTINCT value in nums.\n}\n",
        },
        "sample_tests": [
            {"args": [[10, 20, 4, 45, 99]], "expected": 45},
            {"args": [[5, 5, 5, 3]], "expected": 3},
        ],
        "hidden_tests": [
            {"args": [[1, 2]], "expected": 1},
            {"args": [[100, 90, 90, 80]], "expected": 90},
            {"args": [[-1, -5, -3]], "expected": -3},
        ],
    },
    {
        "id": "is-armstrong-number",
        "title": "Is Armstrong Number",
        "difficulty": "Easy",
        "function_name": "is_armstrong",
        "time_limit_secs": 5,
        "prompt": (
            "An Armstrong number equals the sum of its own digits each raised to the "
            "power of the digit count (e.g. 153 = 1^3 + 5^3 + 3^3). Return True if `n` is one."
        ),
        "constraints": ["0 <= n <= 10^8"],
        "examples": [
            {"input": "n = 153", "output": "true"},
            {"input": "n = 123", "output": "false"},
        ],
        "starters": {
            "python": "def is_armstrong(n):\n    # Return True if n is an Armstrong number.\n    pass\n",
            "javascript": "function is_armstrong(n) {\n    // Return true if n is an Armstrong number.\n}\n",
        },
        "sample_tests": [
            {"args": [153], "expected": True},
            {"args": [123], "expected": False},
        ],
        "hidden_tests": [
            {"args": [0], "expected": True},
            {"args": [9], "expected": True},
            {"args": [9474], "expected": True},
            {"args": [10], "expected": False},
        ],
    },
    {
        "id": "calculate-late-fee",
        "title": "Calculate Late Fee",
        "difficulty": "Easy",
        "function_name": "late_fee",
        "time_limit_secs": 5,
        "prompt": (
            "A library charges a late fee of `daily_rate` per day overdue. Given "
            "`days_late` (may be negative or zero if not overdue) and `daily_rate`, "
            "return the fee owed (never negative)."
        ),
        "constraints": ["-1000 <= days_late <= 1000", "0 <= daily_rate <= 1000"],
        "examples": [
            {"input": "days_late = 3, daily_rate = 2", "output": "6"},
            {"input": "days_late = 0, daily_rate = 2", "output": "0"},
        ],
        "starters": {
            "python": "def late_fee(days_late, daily_rate):\n    # Return max(0, days_late) * daily_rate.\n    pass\n",
            "javascript": "function late_fee(days_late, daily_rate) {\n    // Return max(0, days_late) * daily_rate.\n}\n",
        },
        "sample_tests": [
            {"args": [3, 2], "expected": 6},
            {"args": [0, 2], "expected": 0},
        ],
        "hidden_tests": [
            {"args": [-5, 2], "expected": 0},
            {"args": [10, 1.5], "expected": 15.0},
            {"args": [1, 100], "expected": 100},
        ],
    },
    {
        "id": "capitalize-each-word",
        "title": "Capitalize Each Word",
        "difficulty": "Easy",
        "function_name": "title_case",
        "time_limit_secs": 5,
        "prompt": "Given a `sentence`, return it with the first letter of each word capitalized and the rest lowercase.",
        "constraints": ["0 <= len(sentence) <= 10^4"],
        "examples": [{"input": 'sentence = "hello world"', "output": '"Hello World"'}],
        "starters": {
            "python": "def title_case(sentence):\n    # Return sentence with each word capitalized.\n    pass\n",
            "javascript": "function title_case(sentence) {\n    // Return sentence with each word capitalized.\n}\n",
        },
        "sample_tests": [
            {"args": ["hello world"], "expected": "Hello World"},
            {"args": ["THE QUICK FOX"], "expected": "The Quick Fox"},
        ],
        "hidden_tests": [
            {"args": [""], "expected": ""},
            {"args": ["a"], "expected": "A"},
            {"args": ["mUlTi CaSe HeRe"], "expected": "Multi Case Here"},
        ],
    },
    {
        "id": "find-intersection-of-arrays",
        "title": "Find Intersection Of Arrays",
        "difficulty": "Easy",
        "function_name": "array_intersection",
        "time_limit_secs": 5,
        "prompt": "Given two lists `a` and `b`, return a sorted list of the unique values present in both.",
        "constraints": ["0 <= len(a), len(b) <= 10^5"],
        "examples": [{"input": "a = [1, 2, 2, 3], b = [2, 3, 4]", "output": "[2, 3]"}],
        "starters": {
            "python": "def array_intersection(a, b):\n    # Return a sorted list of values present in both a and b.\n    pass\n",
            "javascript": "function array_intersection(a, b) {\n    // Return a sorted array of values present in both a and b.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 2, 3], [2, 3, 4]], "expected": [2, 3]},
        ],
        "hidden_tests": [
            {"args": [[], [1, 2]], "expected": []},
            {"args": [[1, 1, 1], [1]], "expected": [1]},
            {"args": [[5, 6], [7, 8]], "expected": []},
        ],
    },
    {
        "id": "count-pairs-with-sum",
        "title": "Count Pairs With Sum",
        "difficulty": "Medium",
        "function_name": "count_pairs_with_sum",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list `nums` and a `target`, return the number of index pairs (i, j) "
            "with i < j such that nums[i] + nums[j] == target."
        ),
        "constraints": ["0 <= len(nums) <= 2000"],
        "examples": [{"input": "nums = [1, 2, 3, 4], target = 5", "output": "2"}],
        "starters": {
            "python": "def count_pairs_with_sum(nums, target):\n    # Return the count of index pairs i<j whose values sum to target.\n    pass\n",
            "javascript": "function count_pairs_with_sum(nums, target) {\n    // Return the count of index pairs i<j whose values sum to target.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 3, 4], 5], "expected": 2},
            {"args": [[1, 1, 1], 2], "expected": 3},
        ],
        "hidden_tests": [
            {"args": [[], 5], "expected": 0},
            {"args": [[5], 5], "expected": 0},
            {"args": [[0, 0, 0, 0], 0], "expected": 6},
        ],
    },
    {
        "id": "validate-iso-date",
        "title": "Validate ISO Date",
        "difficulty": "Medium",
        "function_name": "is_valid_iso_date",
        "time_limit_secs": 5,
        "prompt": (
            "Given a string `date_str` in \"YYYY-MM-DD\" form, return True only if it is a "
            "real calendar date (correct days-in-month, leap years accounted for)."
        ),
        "constraints": ["len(date_str) is arbitrary — validate defensively."],
        "examples": [
            {"input": 'date_str = "2024-02-29"', "output": "true"},
            {"input": 'date_str = "2023-02-29"', "output": "false"},
        ],
        "starters": {
            "python": "def is_valid_iso_date(date_str):\n    # Return True if date_str is a real YYYY-MM-DD calendar date.\n    pass\n",
            "javascript": "function is_valid_iso_date(date_str) {\n    // Return true if date_str is a real YYYY-MM-DD calendar date.\n}\n",
        },
        "sample_tests": [
            {"args": ["2024-02-29"], "expected": True},
            {"args": ["2023-02-29"], "expected": False},
        ],
        "hidden_tests": [
            {"args": ["2024-13-01"], "expected": False},
            {"args": ["2024-00-10"], "expected": False},
            {"args": ["2024-04-31"], "expected": False},
            {"args": ["2024-01-01"], "expected": True},
            {"args": ["bad-date"], "expected": False},
        ],
    },
    {
        "id": "find-majority-element",
        "title": "Find Majority Element",
        "difficulty": "Medium",
        "function_name": "majority_element",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list `nums` where one value is guaranteed to appear more than n/2 "
            "times, return that value."
        ),
        "constraints": ["1 <= len(nums) <= 10^5"],
        "examples": [{"input": "nums = [2, 2, 1, 1, 1, 2, 2]", "output": "2"}],
        "starters": {
            "python": "def majority_element(nums):\n    # Return the value appearing more than n/2 times.\n    pass\n",
            "javascript": "function majority_element(nums) {\n    // Return the value appearing more than n/2 times.\n}\n",
        },
        "sample_tests": [
            {"args": [[3, 2, 3]], "expected": 3},
            {"args": [[2, 2, 1, 1, 1, 2, 2]], "expected": 2},
        ],
        "hidden_tests": [
            {"args": [[1]], "expected": 1},
            {"args": [[5, 5, 5, 5, 1, 1, 1]], "expected": 5},
            {"args": [[1, 1, 1, 2, 2]], "expected": 1},
        ],
    },
    {
        "id": "detect-sorted-array",
        "title": "Detect Sorted Array",
        "difficulty": "Easy",
        "function_name": "is_sorted_ascending",
        "time_limit_secs": 5,
        "prompt": "Return True if `nums` is sorted in non-decreasing order.",
        "constraints": ["0 <= len(nums) <= 10^5"],
        "examples": [
            {"input": "nums = [1, 2, 2, 3]", "output": "true"},
            {"input": "nums = [3, 1, 2]", "output": "false"},
        ],
        "starters": {
            "python": "def is_sorted_ascending(nums):\n    # Return True if nums is sorted ascending.\n    pass\n",
            "javascript": "function is_sorted_ascending(nums) {\n    // Return true if nums is sorted ascending.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 2, 3]], "expected": True},
            {"args": [[3, 1, 2]], "expected": False},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": True},
            {"args": [[5]], "expected": True},
            {"args": [[5, 4]], "expected": False},
        ],
    },
    {
        "id": "rotate-string-check",
        "title": "Rotate String Check",
        "difficulty": "Easy",
        "function_name": "is_rotation",
        "time_limit_secs": 5,
        "prompt": "Given two strings `s1` and `s2` of equal length, return True if s2 is a rotation of s1.",
        "constraints": ["0 <= len(s1), len(s2) <= 10^4"],
        "examples": [{"input": 's1 = "waterbottle", s2 = "erbottlewat"', "output": "true"}],
        "starters": {
            "python": "def is_rotation(s1, s2):\n    # Return True if s2 is a rotation of s1.\n    pass\n",
            "javascript": "function is_rotation(s1, s2) {\n    // Return true if s2 is a rotation of s1.\n}\n",
        },
        "sample_tests": [
            {"args": ["waterbottle", "erbottlewat"], "expected": True},
            {"args": ["hello", "world"], "expected": False},
        ],
        "hidden_tests": [
            {"args": ["", ""], "expected": True},
            {"args": ["abc", "abc"], "expected": True},
            {"args": ["abc", "cab"], "expected": True},
            {"args": ["abc", "acb"], "expected": False},
        ],
    },
    {
        "id": "calculate-retry-backoff",
        "title": "Calculate Retry Backoff",
        "difficulty": "Medium",
        "function_name": "exponential_backoff",
        "time_limit_secs": 5,
        "prompt": (
            "An API client retries with exponential backoff. Given the 0-based `attempt` "
            "number, `base_seconds`, and `max_seconds`, return "
            "min(base_seconds * 2^attempt, max_seconds)."
        ),
        "constraints": ["0 <= attempt <= 30"],
        "examples": [{"input": "attempt = 3, base_seconds = 1, max_seconds = 100", "output": "8"}],
        "starters": {
            "python": "def exponential_backoff(attempt, base_seconds, max_seconds):\n    # Return min(base_seconds * 2**attempt, max_seconds).\n    pass\n",
            "javascript": "function exponential_backoff(attempt, base_seconds, max_seconds) {\n    // Return Math.min(base_seconds * 2**attempt, max_seconds).\n}\n",
        },
        "sample_tests": [
            {"args": [0, 1, 100], "expected": 1},
            {"args": [3, 1, 100], "expected": 8},
        ],
        "hidden_tests": [
            {"args": [10, 1, 60], "expected": 60},
            {"args": [0, 5, 100], "expected": 5},
            {"args": [2, 2, 100], "expected": 8},
        ],
    },
    {
        "id": "find-unique-visitor-count",
        "title": "Find Unique Visitor Count",
        "difficulty": "Easy",
        "function_name": "unique_visitors",
        "time_limit_secs": 5,
        "prompt": "Given a list of `visitor_ids` (with repeats), return the number of distinct visitors.",
        "constraints": ["0 <= len(visitor_ids) <= 10^5"],
        "examples": [{"input": 'visitor_ids = ["u1", "u2", "u1", "u3"]', "output": "3"}],
        "starters": {
            "python": "def unique_visitors(visitor_ids):\n    # Return the number of distinct visitor ids.\n    pass\n",
            "javascript": "function unique_visitors(visitor_ids) {\n    // Return the number of distinct visitor ids.\n}\n",
        },
        "sample_tests": [
            {"args": [["u1", "u2", "u1", "u3"]], "expected": 3},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": 0},
            {"args": [["a"]], "expected": 1},
            {"args": [["x", "x", "x"]], "expected": 1},
        ],
    },
    {
        "id": "calculate-grade-from-score",
        "title": "Calculate Grade From Score",
        "difficulty": "Easy",
        "function_name": "letter_grade",
        "time_limit_secs": 5,
        "prompt": (
            "Given a numeric `score` (0-100), return its letter grade: \"A\" (>= 90), "
            "\"B\" (>= 80), \"C\" (>= 70), \"D\" (>= 60), else \"F\"."
        ),
        "constraints": ["0 <= score <= 100"],
        "examples": [
            {"input": "score = 95", "output": '"A"'},
            {"input": "score = 50", "output": '"F"'},
        ],
        "starters": {
            "python": "def letter_grade(score):\n    # Return the letter grade for score.\n    pass\n",
            "javascript": "function letter_grade(score) {\n    // Return the letter grade for score.\n}\n",
        },
        "sample_tests": [
            {"args": [95], "expected": "A"},
            {"args": [50], "expected": "F"},
        ],
        "hidden_tests": [
            {"args": [90], "expected": "A"},
            {"args": [89], "expected": "B"},
            {"args": [60], "expected": "D"},
            {"args": [59], "expected": "F"},
        ],
    },
    {
        "id": "two-pointer-sorted-two-sum",
        "title": "Two Sum On A Sorted Array",
        "difficulty": "Medium",
        "function_name": "two_sum_sorted",
        "time_limit_secs": 5,
        "prompt": (
            "Given a list `nums` sorted ascending with exactly one pair summing to "
            "`target`, return their 0-based indices [i, j] with i < j."
        ),
        "constraints": ["2 <= len(nums) <= 10^5", "nums is sorted ascending."],
        "examples": [{"input": "nums = [2, 7, 11, 15], target = 9", "output": "[0, 1]"}],
        "starters": {
            "python": "def two_sum_sorted(nums, target):\n    # Return [i, j] with nums[i] + nums[j] == target, using two pointers.\n    pass\n",
            "javascript": "function two_sum_sorted(nums, target) {\n    // Return [i, j] with nums[i] + nums[j] == target, using two pointers.\n}\n",
        },
        "sample_tests": [
            {"args": [[1, 2, 3, 4, 6], 6], "expected": [1, 3]},
            {"args": [[2, 7, 11, 15], 9], "expected": [0, 1]},
        ],
        "hidden_tests": [
            {"args": [[1, 2, 3], 5], "expected": [1, 2]},
            {"args": [[0, 0, 3, 4], 0], "expected": [0, 1]},
        ],
    },
    {
        "id": "find-first-non-repeating-char",
        "title": "Find First Non-Repeating Character",
        "difficulty": "Medium",
        "function_name": "first_unique_char",
        "time_limit_secs": 5,
        "prompt": "Given a string `s`, return the 0-based index of the first character that appears exactly once, or -1 if none does.",
        "constraints": ["0 <= len(s) <= 10^5"],
        "examples": [
            {"input": 's = "leetcode"', "output": "0"},
            {"input": 's = "aabb"', "output": "-1"},
        ],
        "starters": {
            "python": "def first_unique_char(s):\n    # Return the index of the first non-repeating character, or -1.\n    pass\n",
            "javascript": "function first_unique_char(s) {\n    // Return the index of the first non-repeating character, or -1.\n}\n",
        },
        "sample_tests": [
            {"args": ["leetcode"], "expected": 0},
            {"args": ["aabb"], "expected": -1},
        ],
        "hidden_tests": [
            {"args": [""], "expected": -1},
            {"args": ["z"], "expected": 0},
            {"args": ["aabbc"], "expected": 4},
        ],
    },
    {
        "id": "calculate-total-pages",
        "title": "Calculate Total Pages",
        "difficulty": "Easy",
        "function_name": "total_pages",
        "time_limit_secs": 5,
        "prompt": "Given `total_items` and `items_per_page`, return the number of pages needed (round up).",
        "constraints": ["0 <= total_items <= 10^7", "1 <= items_per_page"],
        "examples": [{"input": "total_items = 95, items_per_page = 10", "output": "10"}],
        "starters": {
            "python": "def total_pages(total_items, items_per_page):\n    # Return the number of pages needed, rounded up.\n    pass\n",
            "javascript": "function total_pages(total_items, items_per_page) {\n    // Return the number of pages needed, rounded up.\n}\n",
        },
        "sample_tests": [
            {"args": [95, 10], "expected": 10},
            {"args": [100, 10], "expected": 10},
        ],
        "hidden_tests": [
            {"args": [0, 10], "expected": 0},
            {"args": [1, 10], "expected": 1},
            {"args": [21, 7], "expected": 3},
        ],
    },
    {
        "id": "detect-palindrome-number",
        "title": "Detect Palindrome Number",
        "difficulty": "Easy",
        "function_name": "is_palindrome_number",
        "time_limit_secs": 5,
        "prompt": "Return True if the integer `n` reads the same forwards and backwards. Negative numbers are never palindromes.",
        "constraints": ["-10^9 <= n <= 10^9"],
        "examples": [
            {"input": "n = 121", "output": "true"},
            {"input": "n = 123", "output": "false"},
        ],
        "starters": {
            "python": "def is_palindrome_number(n):\n    # Return True if n's digits read the same forwards and backwards.\n    pass\n",
            "javascript": "function is_palindrome_number(n) {\n    // Return true if n's digits read the same forwards and backwards.\n}\n",
        },
        "sample_tests": [
            {"args": [121], "expected": True},
            {"args": [123], "expected": False},
        ],
        "hidden_tests": [
            {"args": [-121], "expected": False},
            {"args": [0], "expected": True},
            {"args": [1], "expected": True},
            {"args": [1221], "expected": True},
        ],
    },
    {
        "id": "merge-two-dicts-summing-values",
        "title": "Merge Two Dicts Summing Values",
        "difficulty": "Easy",
        "function_name": "sum_dicts",
        "time_limit_secs": 5,
        "prompt": "Given two dicts `d1` and `d2` of numeric values, return a merged dict where a key present in both has its values summed.",
        "constraints": ["0 <= len(d1), len(d2) <= 1000"],
        "examples": [{"input": 'd1 = {"a": 1, "b": 2}, d2 = {"b": 3, "c": 4}', "output": '{"a": 1, "b": 5, "c": 4}'}],
        "starters": {
            "python": "def sum_dicts(d1, d2):\n    # Return d1 and d2 merged, summing values on shared keys.\n    pass\n",
            "javascript": "function sum_dicts(d1, d2) {\n    // Return d1 and d2 merged, summing values on shared keys.\n}\n",
        },
        "sample_tests": [
            {"args": [{"a": 1, "b": 2}, {"b": 3, "c": 4}], "expected": {"a": 1, "b": 5, "c": 4}},
        ],
        "hidden_tests": [
            {"args": [{}, {}], "expected": {}},
            {"args": [{"x": 5}, {}], "expected": {"x": 5}},
            {"args": [{}, {"y": 10}], "expected": {"y": 10}},
        ],
    },
    {
        "id": "calculate-standard-deviation",
        "title": "Calculate Standard Deviation",
        "difficulty": "Hard",
        "function_name": "population_stddev",
        "time_limit_secs": 5,
        "prompt": "Given a non-empty list `nums`, return its population standard deviation rounded to 2 decimal places.",
        "constraints": ["1 <= len(nums) <= 10^5"],
        "examples": [{"input": "nums = [2, 4, 4, 4, 5, 5, 7, 9]", "output": "2.0"}],
        "starters": {
            "python": "def population_stddev(nums):\n    # Return the population standard deviation of nums, rounded to 2 decimals.\n    pass\n",
            "javascript": "function population_stddev(nums) {\n    // Return the population standard deviation of nums, rounded to 2 decimals.\n}\n",
        },
        "sample_tests": [
            {"args": [[2, 4, 4, 4, 5, 5, 7, 9]], "expected": 2.0},
            {"args": [[10, 10, 10, 10]], "expected": 0.0},
        ],
        "hidden_tests": [
            {"args": [[1, 2, 3, 4, 5]], "expected": 1.41},
            {"args": [[100]], "expected": 0.0},
        ],
    },
    {
        "id": "find-kth-largest",
        "title": "Find Kth Largest Element",
        "difficulty": "Medium",
        "function_name": "kth_largest",
        "time_limit_secs": 5,
        "prompt": "Given a list `nums` and an integer `k`, return the kth largest element (k=1 is the largest); duplicates count individually.",
        "constraints": ["1 <= k <= len(nums) <= 10^5"],
        "examples": [{"input": "nums = [3, 2, 1, 5, 6, 4], k = 2", "output": "5"}],
        "starters": {
            "python": "def kth_largest(nums, k):\n    # Return the kth largest element of nums.\n    pass\n",
            "javascript": "function kth_largest(nums, k) {\n    // Return the kth largest element of nums.\n}\n",
        },
        "sample_tests": [
            {"args": [[3, 2, 1, 5, 6, 4], 2], "expected": 5},
            {"args": [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], "expected": 4},
        ],
        "hidden_tests": [
            {"args": [[1], 1], "expected": 1},
            {"args": [[1, 2], 1], "expected": 2},
            {"args": [[1, 2], 2], "expected": 1},
        ],
    },
    {
        "id": "calculate-simple-interest",
        "title": "Calculate Simple Interest",
        "difficulty": "Easy",
        "function_name": "simple_interest",
        "time_limit_secs": 5,
        "prompt": (
            "Given a `principal`, an annual `rate` as a percentage, and `years`, return the "
            "simple interest earned, rounded to 2 decimals: principal * rate/100 * years."
        ),
        "constraints": ["0 <= principal <= 10^7", "0 <= rate <= 100", "0 <= years <= 50"],
        "examples": [{"input": "principal = 1000, rate = 5, years = 2", "output": "100.0"}],
        "starters": {
            "python": "def simple_interest(principal, rate, years):\n    # Return the simple interest, rounded to 2 decimals.\n    pass\n",
            "javascript": "function simple_interest(principal, rate, years) {\n    // Return the simple interest, rounded to 2 decimals.\n}\n",
        },
        "sample_tests": [
            {"args": [1000, 5, 2], "expected": 100.0},
            {"args": [500, 10, 1], "expected": 50.0},
        ],
        "hidden_tests": [
            {"args": [0, 10, 5], "expected": 0.0},
            {"args": [2000, 0, 10], "expected": 0.0},
            {"args": [1500, 7.5, 2], "expected": 225.0},
        ],
    },
    {
        "id": "count-set-bits",
        "title": "Count Set Bits",
        "difficulty": "Easy",
        "function_name": "count_set_bits",
        "time_limit_secs": 5,
        "prompt": "Given a non-negative integer `n`, return the number of 1 bits in its binary representation.",
        "constraints": ["0 <= n <= 2^31 - 1"],
        "examples": [
            {"input": "n = 7", "output": "3"},
            {"input": "n = 8", "output": "1"},
        ],
        "starters": {
            "python": "def count_set_bits(n):\n    # Return the number of 1 bits in n's binary representation.\n    pass\n",
            "javascript": "function count_set_bits(n) {\n    // Return the number of 1 bits in n's binary representation.\n}\n",
        },
        "sample_tests": [
            {"args": [7], "expected": 3},
            {"args": [8], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [0], "expected": 0},
            {"args": [1], "expected": 1},
            {"args": [255], "expected": 8},
            {"args": [1023], "expected": 10},
        ],
    },
    {
        "id": "longest-consecutive-sequence",
        "title": "Longest Consecutive Sequence",
        "difficulty": "Hard",
        "function_name": "longest_consecutive",
        "time_limit_secs": 5,
        "prompt": "Given an unsorted list `nums`, return the length of the longest run of consecutive integers (in value, not position).",
        "constraints": ["0 <= len(nums) <= 10^5"],
        "examples": [{"input": "nums = [100, 4, 200, 1, 3, 2]", "output": "4"}],
        "starters": {
            "python": "def longest_consecutive(nums):\n    # Return the length of the longest run of consecutive integers in nums.\n    pass\n",
            "javascript": "function longest_consecutive(nums) {\n    // Return the length of the longest run of consecutive integers in nums.\n}\n",
        },
        "sample_tests": [
            {"args": [[100, 4, 200, 1, 3, 2]], "expected": 4},
            {"args": [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], "expected": 9},
        ],
        "hidden_tests": [
            {"args": [[]], "expected": 0},
            {"args": [[1]], "expected": 1},
            {"args": [[1, 2, 0, 1]], "expected": 3},
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


def pick_opening_problem(job_role="", course_category="", preferred_language=None, resume_skills=None,
                          allowed_difficulties=None):
    """Choose the coding-sandbox problem to open a Completed-course interview with.

    SQL is preferred when the candidate's domain is data-oriented (that is where a query
    exercise is genuinely relevant); everyone else gets a standard function-implementation
    problem. Returns None when nothing suitable exists, in which case the caller simply
    leaves the generated verbal question in place.

    ``resume_skills`` covers the Resume-Based category, where the candidate never selected a
    domain — job_role is a generic placeholder for them, so their own listed skills are what
    decides whether a query exercise is the right opener.

    ``allowed_difficulties`` (Difficulty Range feature): an ordered low->high list (e.g.
    ``['Medium', 'Hard']`` for MEDIUM_TO_HARD) restricting which difficulties may open the
    sandbox — without it, the opener always defaults to Easy regardless of the invite's
    range, which would put a MEDIUM_TO_HARD candidate's first coding question below the
    range they were invited at. None means no restriction (today's behavior).
    """
    haystack = f"{job_role or ''} {course_category or ''} {' '.join(resume_skills or [])}".lower()
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

    if allowed_difficulties:
        restricted = [p for p in pool if p.get("difficulty") in allowed_difficulties]
        if restricted:
            pool = restricted
        # else: nothing in this pool matches the range (e.g. no Hard SQL problems yet) —
        # fall through to the full pool rather than returning nothing.

        # Open on the lowest difficulty the range actually allows, so a MEDIUM_TO_HARD
        # candidate never opens on an Easy problem their range excluded.
        for level in allowed_difficulties:
            at_level = [p for p in pool if p.get("difficulty") == level]
            if at_level:
                return at_level[0]
        return pool[0]

    # Open on an approachable problem: the first question sets the tone, and a Hard opener
    # would rattle a candidate before the interview has really begun.
    easy = [p for p in pool if p.get("difficulty") == "Easy"]
    medium = [p for p in pool if p.get("difficulty") == "Medium"]
    return (easy or medium or pool)[0]
