"""A 500 must reach the browser as a 500, not as a CORS failure.

THE PROBLEM THIS FIXES
----------------------
Starlette passes the app-level ``Exception`` handler to ServerErrorMiddleware, which wraps
the entire middleware stack — CORSMiddleware included. A response built there is returned
from OUTSIDE the CORS layer, so it carries no ``Access-Control-Allow-Origin``. The browser
does not report "500 Internal Server Error"; it reports "blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present", and the real error is invisible from the
frontend.

That cost a live debugging session. A NameError in ``send_interview_invite`` presented as a
CORS error, which sent the investigation into CORS configuration and an unrelated SMTP
failure before the actual undefined variable was found. Every unhandled 500 in this app had
the same disguise.

``cors_headers_for`` puts the headers back on that one response. These tests pin both halves
of the contract: the headers are added for an allowed origin, and they are NOT added for an
origin CORSMiddleware itself would have rejected — a fix that widened CORS to every caller
would be worse than the bug.

The header builder is tested directly rather than through the app, because create_app()
connects to the live database on boot and this suite must never do that (see conftest).
"""

import pytest

from app import cors_headers_for


ALLOWED = ['https://sit-interviewer.vercel.app']
ORIGIN = 'https://sit-interviewer.vercel.app'


class TestAllowedOrigin:
    def test_the_origin_is_echoed_back(self):
        """Without this header the browser hides the 500 behind a CORS message."""
        headers = cors_headers_for(ORIGIN, ALLOWED)
        assert headers['Access-Control-Allow-Origin'] == ORIGIN

    def test_the_response_varies_on_origin(self):
        """The header differs per caller, so a cache keyed only on URL would serve one
        origin's response to another."""
        assert cors_headers_for(ORIGIN, ALLOWED)['Vary'] == 'Origin'

    def test_a_wildcard_allowlist_permits_any_origin(self):
        """CORS_ORIGINS unset falls back to ["*"] for local development, and the error path
        must behave the same way the normal path does."""
        headers = cors_headers_for('http://localhost:5173', ['*'])
        assert headers['Access-Control-Allow-Origin'] == 'http://localhost:5173'

    def test_the_echoed_origin_is_never_the_literal_wildcard(self):
        """Echoing "*" instead of the caller would break any future move to credentialed
        CORS, which browsers reject outright against a wildcard."""
        headers = cors_headers_for(ORIGIN, ['*'])
        assert headers['Access-Control-Allow-Origin'] != '*'


class TestDisallowedOrigin:
    """The fix must not become a CORS bypass that only shows up on error responses."""

    def test_an_unlisted_origin_gets_no_headers(self):
        assert cors_headers_for('https://evil.example.com', ALLOWED) == {}

    def test_a_near_miss_origin_is_not_matched(self):
        """Substring or prefix matching here would let an attacker-controlled host through."""
        assert cors_headers_for('https://sit-interviewer.vercel.app.evil.com', ALLOWED) == {}
        assert cors_headers_for('https://evil-sit-interviewer.vercel.app', ALLOWED) == {}

    def test_a_scheme_mismatch_is_not_matched(self):
        assert cors_headers_for('http://sit-interviewer.vercel.app', ALLOWED) == {}


class TestNoOrigin:
    """A server-to-server call (curl, the keep-alive ping, an API-key integration) sends no
    Origin at all — it must not receive a header naming one."""

    @pytest.mark.parametrize('origin', [None, ''])
    def test_a_request_without_an_origin_gets_no_headers(self, origin):
        assert cors_headers_for(origin, ALLOWED) == {}


class TestDefensiveInputs:
    """This runs inside the last-resort error handler. It raising would replace a useful
    500 with a completely opaque one, so it has to tolerate anything."""

    @pytest.mark.parametrize('allowed', [None, []])
    def test_a_missing_allowlist_denies_rather_than_raises(self, allowed):
        assert cors_headers_for(ORIGIN, allowed) == {}
