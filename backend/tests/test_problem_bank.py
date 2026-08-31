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
    "order-total-with-discount": """
def calculate_order_total(prices, discount_percent):
    total = sum(prices)
    return round(total * (1 - discount_percent / 100), 2)
""",
    "password-strength-checker": """
def is_strong_password(password):
    if len(password) < 8:
        return False
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    return has_upper and has_lower and has_digit
""",
    "word-occurrence-counter": """
def count_word_occurrences(text, word):
    target = word.lower()
    count = 0
    for token in text.split():
        cleaned = token.strip(".,!?;:'\\"()[]{}").lower()
        if cleaned == target:
            count += 1
    return count
""",
    "email-format-validator": """
import re
def is_valid_email(email):
    pattern = r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'
    return bool(re.match(pattern, email or ""))
""",
    "inventory-reorder-check": """
def needs_reorder(current_stock, reorder_threshold):
    return current_stock <= reorder_threshold
""",
    "compound-interest-calculator": """
def compound_interest(principal, rate, years):
    return round(principal * (1 + rate / 100) ** years, 2)
""",
    "username-anagram-check": """
def is_anagram(a, b):
    return sorted(a.lower()) == sorted(b.lower())
""",
    "shift-time-difference": """
def minutes_between(start_time, end_time):
    sh, sm = map(int, start_time.split(':'))
    eh, em = map(int, end_time.split(':'))
    return (eh * 60 + em) - (sh * 60 + sm)
""",
    "flatten-shopping-cart": """
def flatten_cart(cart):
    result = []
    def _walk(node):
        if isinstance(node, list):
            for item in node:
                _walk(item)
        else:
            result.append(node)
    _walk(cart)
    return result
""",
    "missing-invoice-number": """
def find_missing_invoice(invoices):
    lo, hi = min(invoices), max(invoices)
    expected_sum = (hi - lo + 1) * (lo + hi) // 2
    return expected_sum - sum(invoices)
""",
    "group-logs-by-level": """
def group_log_entries(logs):
    groups = {}
    for line in logs:
        level, _, message = line.partition(': ')
        groups.setdefault(level, []).append(message)
    return groups
""",
    "longest-active-streak": """
def longest_active_streak(days):
    best = current = 0
    for d in days:
        if d:
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best
""",
    "duplicate-transaction-detector": """
def has_duplicate_transaction(transaction_ids):
    return len(transaction_ids) != len(set(transaction_ids))
""",
    "median-response-time": """
def median_response_time(times):
    s = sorted(times)
    n = len(s)
    mid = n // 2
    if n % 2 == 1:
        return float(s[mid])
    return (s[mid - 1] + s[mid]) / 2.0
""",
    "parse-csv-row": """
def parse_csv_row(header, row):
    values = [v.strip() for v in row.split(',')]
    return dict(zip(header, values))
""",
    "top-k-error-codes": """
def top_k_frequent(codes, k):
    counts = {}
    for c in codes:
        counts[c] = counts.get(c, 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: -kv[1])
    return [code for code, _ in ordered[:k]]
""",
    "sliding-window-rate-limiter": """
def is_request_allowed(existing_timestamps, new_timestamp, limit, window_seconds):
    window_start = new_timestamp - window_seconds
    count = sum(1 for t in existing_timestamps if window_start < t <= new_timestamp)
    return count < limit
""",
    "format-phone-number": """
def format_phone_number(digits):
    only = ''.join(c for c in digits if c.isdigit())
    return f"{only[:3]}-{only[3:6]}-{only[6:]}"
""",
    "average-rating-calculator": """
def average_rating(ratings):
    if not ratings:
        return 0.0
    return round(sum(ratings) / len(ratings), 1)
""",
    "merge-sorted-employee-ids": """
def merge_sorted_lists(list1, list2):
    result = []
    i = j = 0
    while i < len(list1) and j < len(list2):
        if list1[i] <= list2[j]:
            result.append(list1[i]); i += 1
        else:
            result.append(list2[j]); j += 1
    result.extend(list1[i:])
    result.extend(list2[j:])
    return result
""",
    "validate-username": """
def is_valid_username(username):
    if not (3 <= len(username) <= 16):
        return False
    if not username[0].isalpha():
        return False
    return all(c.isalnum() or c == '_' for c in username)
""",
    "employee-of-the-month": """
def find_top_performer(scores):
    best_score = max(scores.values())
    candidates = [name for name, s in scores.items() if s == best_score]
    return min(candidates)
""",
    "session-timeout-checker": """
def is_session_expired(last_activity_seconds_ago, timeout_seconds):
    return last_activity_seconds_ago >= timeout_seconds
""",
    "calculate-shipping-cost": """
def shipping_cost(weight_kg):
    if weight_kg <= 1:
        return 5
    if weight_kg <= 5:
        return 10
    return 20
""",
    "count-vowels-consonants": """
def count_letters(s):
    vowels = 0
    consonants = 0
    for ch in s.lower():
        if ch.isalpha():
            if ch in 'aeiou':
                vowels += 1
            else:
                consonants += 1
    return {"vowels": vowels, "consonants": consonants}
""",
    "reverse-words-in-sentence": """
def reverse_words(sentence):
    return ' '.join(reversed(sentence.split()))
""",
    "find-longest-word": """
def longest_word(sentence):
    words = sentence.split()
    return max(words, key=len) if words else ""
""",
    "celsius-to-fahrenheit": """
def celsius_to_fahrenheit(celsius):
    return round(celsius * 9 / 5 + 32, 1)
""",
    "leap-year-checker": """
def is_leap_year(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
""",
    "chunk-array": """
def chunk_list(arr, size):
    return [arr[i:i + size] for i in range(0, len(arr), size)]
""",
    "url-slug-generator": """
import re
def slugify(title):
    s = title.lower()
    s = re.sub(r'[^a-z0-9\\s-]', '', s)
    s = re.sub(r'[\\s-]+', '-', s)
    return s.strip('-')
""",
    "bmi-category-checker": """
def bmi_category(weight_kg, height_m):
    bmi = weight_kg / (height_m ** 2)
    if bmi < 18.5:
        return "Underweight"
    if bmi < 25:
        return "Normal"
    if bmi < 30:
        return "Overweight"
    return "Obese"
""",
    "matrix-transpose": """
def transpose_matrix(matrix):
    if not matrix:
        return []
    return [list(row) for row in zip(*matrix)]
""",
    "common-tags-finder": """
def common_tags(list1, list2):
    return sorted(set(list1) & set(list2))
""",
    "merge-user-preferences": """
def merge_preferences(defaults, overrides):
    result = dict(defaults)
    result.update(overrides)
    return result
""",
    "peak-sales-day": """
def peak_day(sales):
    return sales.index(max(sales))
""",
    "job-priority-scheduler": """
def next_job(jobs):
    best = min(jobs, key=lambda j: j[1])
    return best[0]
""",
    "discount-tier-calculator": """
def discount_tier(total_spent):
    if total_spent < 500:
        return 0
    if total_spent < 2000:
        return 5
    if total_spent < 5000:
        return 10
    return 15
""",
    "temperature-anomaly-detector": """
def find_anomalies(readings, threshold):
    if not readings:
        return []
    mean = sum(readings) / len(readings)
    return [i for i, r in enumerate(readings) if abs(r - mean) > threshold]
""",
    "count-business-days": """
def count_business_days(start_day_index, num_days):
    count = 0
    for i in range(num_days):
        day = (start_day_index + i) % 7
        if day < 5:
            count += 1
    return count
""",
    "calculate-age-in-years": """
def age_in_years(birth_year, current_year):
    return current_year - birth_year
""",
    "is-prime-number": """
def is_prime(n):
    if n < 2:
        return False
    if n < 4:
        return True
    if n % 2 == 0:
        return False
    i = 3
    while i * i <= n:
        if n % i == 0:
            return False
        i += 2
    return True
""",
    "gcd-of-two-numbers": """
def gcd(a, b):
    while b:
        a, b = b, a % b
    return a
""",
    "reverse-integer": """
def reverse_integer(n):
    sign = -1 if n < 0 else 1
    return sign * int(str(abs(n))[::-1])
""",
    "count-character-frequency": """
def char_frequency(s):
    freq = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    return freq
""",
    "validate-parentheses-depth": """
def max_nesting_depth(s):
    depth = 0
    best = 0
    for ch in s:
        if ch == '(':
            depth += 1
            best = max(best, depth)
        elif ch == ')':
            depth -= 1
    return best
""",
    "calculate-cart-item-count": """
def total_items(cart):
    return sum(cart.values())
""",
    "find-second-largest": """
def second_largest(nums):
    uniq = sorted(set(nums), reverse=True)
    return uniq[1]
""",
    "is-armstrong-number": """
def is_armstrong(n):
    digits = str(n)
    power = len(digits)
    return n == sum(int(d) ** power for d in digits)
""",
    "calculate-late-fee": """
def late_fee(days_late, daily_rate):
    return max(0, days_late) * daily_rate
""",
    "capitalize-each-word": """
def title_case(sentence):
    return ' '.join(w[:1].upper() + w[1:].lower() for w in sentence.split())
""",
    "find-intersection-of-arrays": """
def array_intersection(a, b):
    return sorted(set(a) & set(b))
""",
    "count-pairs-with-sum": """
def count_pairs_with_sum(nums, target):
    count = 0
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] + nums[j] == target:
                count += 1
    return count
""",
    "validate-iso-date": """
def is_valid_iso_date(date_str):
    parts = date_str.split('-')
    if len(parts) != 3:
        return False
    y_s, m_s, d_s = parts
    if not (len(y_s) == 4 and y_s.isdigit() and len(m_s) == 2 and m_s.isdigit()
            and len(d_s) == 2 and d_s.isdigit()):
        return False
    y, m, d = int(y_s), int(m_s), int(d_s)
    if not (1 <= y <= 9999 and 1 <= m <= 12):
        return False
    leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
    days_in_month = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return 1 <= d <= days_in_month[m - 1]
""",
    "find-majority-element": """
def majority_element(nums):
    count = 0
    candidate = None
    for n in nums:
        if count == 0:
            candidate = n
        count += 1 if n == candidate else -1
    return candidate
""",
    "detect-sorted-array": """
def is_sorted_ascending(nums):
    return all(nums[i] <= nums[i + 1] for i in range(len(nums) - 1))
""",
    "rotate-string-check": """
def is_rotation(s1, s2):
    if len(s1) != len(s2):
        return False
    return s2 in (s1 + s1)
""",
    "calculate-retry-backoff": """
def exponential_backoff(attempt, base_seconds, max_seconds):
    return min(base_seconds * (2 ** attempt), max_seconds)
""",
    "find-unique-visitor-count": """
def unique_visitors(visitor_ids):
    return len(set(visitor_ids))
""",
    "calculate-grade-from-score": """
def letter_grade(score):
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"
""",
    "two-pointer-sorted-two-sum": """
def two_sum_sorted(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        elif s < target:
            lo += 1
        else:
            hi -= 1
    return []
""",
    "find-first-non-repeating-char": """
def first_unique_char(s):
    from collections import Counter
    counts = Counter(s)
    for i, ch in enumerate(s):
        if counts[ch] == 1:
            return i
    return -1
""",
    "calculate-total-pages": """
def total_pages(total_items, items_per_page):
    if total_items <= 0:
        return 0
    return -(-total_items // items_per_page)
""",
    "detect-palindrome-number": """
def is_palindrome_number(n):
    if n < 0:
        return False
    s = str(n)
    return s == s[::-1]
""",
    "merge-two-dicts-summing-values": """
def sum_dicts(d1, d2):
    result = dict(d1)
    for k, v in d2.items():
        result[k] = result.get(k, 0) + v
    return result
""",
    "calculate-standard-deviation": """
def population_stddev(nums):
    n = len(nums)
    mean = sum(nums) / n
    variance = sum((x - mean) ** 2 for x in nums) / n
    return round(variance ** 0.5, 2)
""",
    "find-kth-largest": """
def kth_largest(nums, k):
    return sorted(nums, reverse=True)[k - 1]
""",
    "calculate-simple-interest": """
def simple_interest(principal, rate, years):
    return round(principal * rate / 100 * years, 2)
""",
    "count-set-bits": """
def count_set_bits(n):
    return bin(n).count('1')
""",
    "longest-consecutive-sequence": """
def longest_consecutive(nums):
    num_set = set(nums)
    best = 0
    for n in num_set:
        if n - 1 not in num_set:
            length = 1
            while n + length in num_set:
                length += 1
            best = max(best, length)
    return best
""",
    "count-word-length-distribution": """
def word_length_histogram(sentence):
    hist = {}
    for w in sentence.split():
        key = str(len(w))
        hist[key] = hist.get(key, 0) + 1
    return hist
""",
    "is-perfect-square": """
def is_perfect_square(n):
    if n < 0:
        return False
    r = int(n ** 0.5)
    return r * r == n or (r + 1) * (r + 1) == n
""",
    "sum-of-digits": """
def digit_sum(n):
    return sum(int(d) for d in str(abs(n)))
""",
    "is-perfect-number": """
def is_perfect_number(n):
    if n < 1:
        return False
    return sum(i for i in range(1, n) if n % i == 0) == n
""",
    "count-unique-words": """
def unique_word_count(text):
    return len(set(w.lower() for w in text.split()))
""",
    "validate-hex-color": """
import re
def is_valid_hex_color(color):
    return bool(re.match(r'^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$', color or ""))
""",
    "calculate-tip-amount": """
def tip_amount(bill, tip_percent):
    return round(bill * tip_percent / 100, 2)
""",
    "find-mode": """
def find_mode(nums):
    from collections import Counter
    counts = Counter(nums)
    best = max(counts.values())
    candidates = [n for n, c in counts.items() if c == best]
    return min(candidates)
""",
    "is-subsequence": """
def is_subsequence(s, t):
    it = iter(t)
    return all(ch in it for ch in s)
""",
    "calculate-word-count": """
def word_count(text):
    return len(text.split())
""",
    "validate-credit-card-luhn": """
def is_valid_luhn(number_str):
    digits = [int(d) for d in number_str]
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0
""",
    "find-duplicate-in-range": """
def find_duplicate(nums):
    seen = set()
    for n in nums:
        if n in seen:
            return n
        seen.add(n)
    return -1
""",
    "calculate-average-word-length": """
def average_word_length(sentence):
    words = sentence.split()
    if not words:
        return 0.0
    return round(sum(len(w) for w in words) / len(words), 2)
""",
    "is-power-of-two": """
def is_power_of_two(n):
    return n > 0 and (n & (n - 1)) == 0
""",
    "calculate-net-price-after-tax": """
def price_after_tax(price, tax_percent):
    return round(price * (1 + tax_percent / 100), 2)
""",
    "calculate-elapsed-days": """
def elapsed_days(start_day_of_year, end_day_of_year):
    return end_day_of_year - start_day_of_year
""",
    "remove-duplicates-preserve-order": """
def dedupe_preserve_order(items):
    seen = set()
    result = []
    for x in items:
        if x not in seen:
            seen.add(x)
            result.append(x)
    return result
""",
    "calculate-max-profit-multiple-transactions": """
def max_profit_multi(prices):
    profit = 0
    for i in range(1, len(prices)):
        if prices[i] > prices[i - 1]:
            profit += prices[i] - prices[i - 1]
    return profit
""",
    "group-anagrams": """
def group_anagrams(words):
    groups = {}
    order = []
    for w in words:
        key = ''.join(sorted(w))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(w)
    return [sorted(groups[k]) for k in order]
""",
    "longest-palindromic-substring": """
def longest_palindromic_substring(s):
    if not s:
        return ""
    start, max_len = 0, 1
    def expand(l, r):
        while l >= 0 and r < len(s) and s[l] == s[r]:
            l -= 1
            r += 1
        return l + 1, r - 1
    for i in range(len(s)):
        l1, r1 = expand(i, i)
        if r1 - l1 + 1 > max_len:
            start, max_len = l1, r1 - l1 + 1
        l2, r2 = expand(i, i + 1)
        if r2 - l2 + 1 > max_len:
            start, max_len = l2, r2 - l2 + 1
    return s[start:start + max_len]
""",
    "calculate-simple-moving-average": """
def moving_average(nums, window):
    result = []
    for i in range(len(nums) - window + 1):
        result.append(round(sum(nums[i:i + window]) / window, 2))
    return result
""",
    "is-valid-ipv4-address": """
def is_valid_ipv4(ip):
    parts = ip.split('.')
    if len(parts) != 4:
        return False
    for p in parts:
        if not p.isdigit():
            return False
        if len(p) > 1 and p[0] == '0':
            return False
        if not (0 <= int(p) <= 255):
            return False
    return True
""",
    "count-occurrences-of-substring": """
def count_substring_occurrences(s, sub):
    return s.count(sub) if sub else 0
""",
    "calculate-weighted-average": """
def weighted_average(values, weights):
    return round(sum(v * w for v, w in zip(values, weights)) / sum(weights), 2)
""",
    "find-pair-with-min-difference": """
def min_difference_pair(nums):
    s = sorted(nums)
    return min(s[i + 1] - s[i] for i in range(len(s) - 1))
""",
    "remove-vowels-from-string": """
def remove_vowels(s):
    return ''.join(c for c in s if c.lower() not in 'aeiou')
""",
    "calculate-factorial": """
def factorial(n):
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result
""",
    "is-happy-number": """
def is_happy_number(n):
    seen = set()
    while n != 1 and n not in seen:
        seen.add(n)
        n = sum(int(d) ** 2 for d in str(n))
    return n == 1
""",
    "find-max-consecutive-ones": """
def max_consecutive_ones(nums):
    best = current = 0
    for n in nums:
        if n == 1:
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best
""",
    "calculate-remaining-budget": """
def remaining_budget(total_budget, expenses):
    return round(total_budget - sum(expenses), 2)
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
