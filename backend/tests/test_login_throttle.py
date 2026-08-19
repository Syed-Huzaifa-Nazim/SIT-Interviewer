"""Brute-force protection on /auth/login.

THE GAP THIS CLOSES
-------------------
/login accepted an unlimited number of password guesses at whatever rate the network
allowed. Verified against live production before the fix: twenty consecutive wrong
passwords, including eight against the real admin address, all returned a plain 401 with
no delay, no lockout and no record anywhere.

That matters more here than on a typical app. The platform has exactly ONE admin account,
at a predictable address, so an attacker needs no username discovery — only the password.

These tests exercise the throttle helpers directly rather than through the route, because
the suite's conftest blocks real database connections and the route needs one to look a
user up. The helpers are where all the counting logic actually lives.
"""

import datetime

import pytest
from fastapi import HTTPException

from app.routes import auth_routes as ar


@pytest.fixture(autouse=True)
def clean_throttle_state():
    """Every test starts from an empty counter — these are module-level dicts, so without
    this one test's failures would leak into the next and the thresholds would drift."""
    ar._login_failures.clear()
    ar._login_locked_logged.clear()
    yield
    ar._login_failures.clear()
    ar._login_locked_logged.clear()


IP = '203.0.113.7'
ADMIN = 'admin@interviewer.com'


def fail_n(n, ip=IP, identifier=ADMIN):
    for _ in range(n):
        ar._record_login_failure(ip, identifier)


# --------------------------------------------------------------------------- the basics

def test_a_fresh_caller_is_allowed_through():
    ar._check_login_throttle(IP, ADMIN)  # must not raise


def test_attempts_below_the_limit_stay_allowed():
    fail_n(ar._LOGIN_MAX_PER_IP - 1)
    ar._check_login_throttle(IP, ADMIN)  # still under, must not raise


def test_the_limit_blocks_further_attempts():
    """The actual fix: past the threshold the endpoint stops answering guesses."""
    fail_n(ar._LOGIN_MAX_PER_IP)
    with pytest.raises(HTTPException) as exc:
        ar._check_login_throttle(IP, ADMIN)
    assert exc.value.status_code == 429


def test_a_blocked_response_tells_the_caller_when_to_retry():
    """Without Retry-After a legitimate user who tripped it has no idea whether to wait
    ten seconds or an hour."""
    fail_n(ar._LOGIN_MAX_PER_IP)
    with pytest.raises(HTTPException) as exc:
        ar._check_login_throttle(IP, ADMIN)
    retry = int(exc.value.headers['Retry-After'])
    assert 0 < retry <= ar._LOGIN_WINDOW.total_seconds()


# ------------------------------------------------------------------ the two counters

def test_spreading_attempts_across_hosts_still_trips_the_identifier_counter():
    """A per-IP limit alone is defeated by rotating source addresses, which is exactly what
    a real password spray does. One attempt from each of many hosts must still add up."""
    for i in range(ar._LOGIN_MAX_PER_IDENTIFIER):
        ar._record_login_failure(f'198.51.100.{i}', ADMIN)

    with pytest.raises(HTTPException) as exc:
        ar._check_login_throttle('198.51.100.250', ADMIN)  # a host that never tried before
    assert exc.value.status_code == 429


def test_one_host_guessing_many_accounts_still_trips_the_ip_counter():
    """The mirror case: a per-identifier limit alone is defeated by spraying one password
    across many usernames from a single host."""
    for i in range(ar._LOGIN_MAX_PER_IP):
        ar._record_login_failure(IP, f'candidate{i}@gmail.com')

    with pytest.raises(HTTPException) as exc:
        ar._check_login_throttle(IP, 'someone-else@gmail.com')
    assert exc.value.status_code == 429


def test_an_unrelated_visitor_is_not_caught_in_the_blast_radius():
    """A different person on a different connection must be unaffected by someone else's
    lockout — otherwise one attacker takes the whole login page down."""
    fail_n(ar._LOGIN_MAX_PER_IP)
    ar._check_login_throttle('192.0.2.99', 'candidate@gmail.com')  # must not raise


# ----------------------------------------------------------------- not locking out users

def test_a_successful_login_clears_the_counter():
    """THE ONE THAT PROTECTS REAL USERS. Someone who mistypes a few times and then gets it
    right must not be carrying those failures into their next session."""
    fail_n(ar._LOGIN_MAX_PER_IP - 1)
    ar._clear_login_failures(IP, ADMIN)
    fail_n(ar._LOGIN_MAX_PER_IP - 1)
    ar._check_login_throttle(IP, ADMIN)  # must not raise


def test_clearing_also_lets_a_locked_key_back_in():
    fail_n(ar._LOGIN_MAX_PER_IP)
    ar._clear_login_failures(IP, ADMIN)
    ar._check_login_throttle(IP, ADMIN)  # must not raise


def test_failures_age_out_of_the_window():
    """The block is temporary, not permanent — a locked-out admin recovers on their own
    without anyone having to restart the server."""
    stale = datetime.datetime.utcnow() - ar._LOGIN_WINDOW - datetime.timedelta(minutes=1)
    ip_key, id_key = ar._login_keys(IP, ADMIN)
    ar._login_failures[ip_key] = [stale] * (ar._LOGIN_MAX_PER_IP + 5)
    ar._login_failures[id_key] = [stale] * (ar._LOGIN_MAX_PER_IDENTIFIER + 5)

    ar._check_login_throttle(IP, ADMIN)  # must not raise


def test_the_identifier_counter_ignores_case_and_padding():
    """Otherwise ' Admin@Interviewer.com ' is a brand new bucket and the limit means
    nothing."""
    for _ in range(ar._LOGIN_MAX_PER_IDENTIFIER):
        ar._record_login_failure('198.51.100.1', '  ADMIN@Interviewer.COM ')

    with pytest.raises(HTTPException):
        ar._check_login_throttle('198.51.100.2', ADMIN)


# --------------------------------------------------------------------------- housekeeping

def test_expired_buckets_are_swept_rather_than_accumulating():
    """These dicts live for the process lifetime; without a sweep they grow one entry per
    address that ever touched the login page and are never reclaimed."""
    stale = datetime.datetime.utcnow() - ar._LOGIN_WINDOW - datetime.timedelta(minutes=1)
    for i in range(50):
        ar._login_failures[f'ip:198.51.100.{i}'] = [stale]

    ar._check_login_throttle('192.0.2.1', 'someone@gmail.com')

    leftover = [k for k in ar._login_failures if k.startswith('ip:198.51.100.')]
    assert leftover == []


def test_a_live_bucket_survives_the_sweep():
    """The sweep must only drop buckets that are entirely stale — dropping a partly-recent
    one would silently reset an attacker's count."""
    fail_n(3)
    ar._check_login_throttle('192.0.2.1', 'someone@gmail.com')

    ip_key, _ = ar._login_keys(IP, ADMIN)
    assert len(ar._login_failures[ip_key]) == 3


def test_the_login_route_asks_for_the_client_address():
    """The throttle is keyed on the caller's IP, so the handler has to actually receive a
    Request. Losing that parameter in a refactor would silently key everything to one
    bucket."""
    import inspect
    assert 'request' in inspect.signature(ar.login).parameters


# ------------------------------------------------------------------------- route wiring
#
# The tests above prove the counters work in isolation. They would all still pass if the
# login handler never called them — which is the failure that actually matters, because it
# leaves the endpoint exactly as unprotected as it was before. The route needs a database
# to run and this suite forbids that, so the wiring is asserted against the source.

def _login_source():
    import inspect
    return inspect.getsource(ar.login)


def test_the_route_checks_the_throttle_before_authenticating():
    src = _login_source()
    assert '_check_login_throttle(' in src
    # Before the password comparison, or a blocked caller still costs a bcrypt hash on
    # every guess and the endpoint remains a CPU amplifier.
    assert src.index('_check_login_throttle(') < src.index('check_password(')


def test_the_route_counts_a_wrong_password():
    assert _login_source().count('_record_login_failure(') >= 3


def test_the_route_counts_an_unknown_identifier():
    """Not counting these leaves a free, unlimited channel for probing which accounts exist
    before spending any attempts on real ones."""
    src = _login_source()
    unknown_branch = src[src.index('if not user:'):src.index('if user.must_use_otp:')]
    assert '_record_login_failure(' in unknown_branch


def test_the_route_clears_the_counter_on_success():
    src = _login_source()
    assert '_clear_login_failures(' in src
    # After the credential checks — clearing earlier would wipe the count on every attempt
    # and make the whole thing a no-op.
    assert src.index('_clear_login_failures(') > src.index('check_password(')
