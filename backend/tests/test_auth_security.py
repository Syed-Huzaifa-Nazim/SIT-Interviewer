"""Regression guards for the authentication holes that let anyone into the Admin Portal.

Three separate published credentials existed at once, each sufficient on its own for a
full admin takeover of the live site:

  1. ``/auth/reset-password`` accepted the literal OTP ``"123456"`` for ANY email address,
     and ``/auth/forgot-password`` helpfully returned that code in its JSON response. The
     reset page then printed it on screen. Knowing an email address was the entire attack.
  2. The startup seeder created ``admin@interviewer.com`` with the password ``admin123``,
     written in the source of a public repository.
  3. ``JWT_SECRET_KEY`` fell back to a fixed literal in the source, so tokens for any user
     id — including an admin's — could be minted offline without touching the login form.

None of these are things a route guard can catch: every admin endpoint already required
``admin_required``, and it was working. The tokens were simply legitimate.

These tests need no database: they cover the credential primitives and scan the source for
the literals, so reintroducing any of them fails the suite rather than reaching production.
"""

import datetime
import re
from pathlib import Path

import jwt
import pytest

from app.config.config import Config
from app.models import User
from app.utils.security import create_access_token, create_refresh_token

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _fresh_user():
    """A model instance only — never added to a session, so nothing touches the DB."""
    return User(name='Test Candidate', email='candidate@example.com', role='candidate')


# --------------------------------------------------------------- reset code primitives

class TestResetCode:
    def test_correct_code_verifies(self):
        user = _fresh_user()
        user.set_reset_otp('482913')
        assert user.check_reset_otp('482913') is True

    def test_wrong_code_is_rejected(self):
        user = _fresh_user()
        user.set_reset_otp('482913')
        assert user.check_reset_otp('482914') is False

    def test_the_old_hardcoded_code_is_not_special(self):
        """'123456' must be worth no more than any other guess."""
        user = _fresh_user()
        user.set_reset_otp('482913')
        assert user.check_reset_otp('123456') is False

    def test_no_code_issued_means_no_reset(self):
        """A user who never asked for a reset cannot be reset by anyone."""
        user = _fresh_user()
        assert user.check_reset_otp('123456') is False
        assert user.check_reset_otp('') is False

    def test_code_is_stored_hashed_not_in_the_clear(self):
        user = _fresh_user()
        user.set_reset_otp('482913')
        assert '482913' not in (user.reset_otp_hash or '')

    def test_expired_code_is_rejected(self):
        user = _fresh_user()
        user.set_reset_otp('482913')
        user.reset_otp_expires_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
        assert user.check_reset_otp('482913') is False

    def test_clearing_makes_the_code_single_use(self):
        user = _fresh_user()
        user.set_reset_otp('482913')
        user.clear_reset_otp()
        assert user.check_reset_otp('482913') is False

    def test_reset_code_never_touches_the_interview_otp(self):
        """The one-time interview credential and the reset code share no storage — a public
        reset flow must not be able to re-arm or consume a candidate's interview login."""
        user = _fresh_user()
        user.set_otp('111111')
        interview_hash = user.otp_hash

        user.set_reset_otp('482913')
        user.clear_reset_otp()

        assert user.otp_hash == interview_hash
        assert user.check_otp('111111') is True


# ------------------------------------------------------------------- token type safety

class TestTokenTypes:
    def test_refresh_token_is_marked_as_one(self):
        assert jwt.decode(create_refresh_token(7), Config.JWT_SECRET_KEY, algorithms=['HS256'])['type'] == 'refresh'

    def test_access_token_is_not_accepted_as_a_refresh_token(self):
        """/auth/refresh requires type == 'refresh'. Without that, a one-time interview
        session — issued no refresh token by design — could renew itself forever."""
        payload = jwt.decode(create_access_token(7), Config.JWT_SECRET_KEY, algorithms=['HS256'])
        assert payload.get('type') != 'refresh'


# ------------------------------------------------------------------- published secrets

class TestNoPublishedCredentials:
    def test_jwt_secret_is_not_the_old_source_literal(self):
        assert Config.JWT_SECRET_KEY != 'super-secret-jwt-key-change-me'
        assert Config.SECRET_KEY != 'super-secret-flask-key-change-me'

    def test_admin_password_is_never_hardcoded(self):
        """Config exposes no admin password unless the environment supplied one."""
        import os
        if not os.environ.get('ADMIN_PASSWORD'):
            assert Config.ADMIN_PASSWORD == ''

    @pytest.mark.parametrize('literal', ['admin123', 'super-secret-jwt-key-change-me'])
    def test_no_credential_literals_remain_in_source(self, literal):
        """Scans the backend for the leaked credentials. Comments explaining the fix are
        allowed; an assignment is not."""
        offenders = []
        for path in BACKEND_ROOT.rglob('*.py'):
            if '__pycache__' in path.parts or path.name == Path(__file__).name:
                continue
            for lineno, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                if literal in line and not line.lstrip().startswith('#'):
                    offenders.append(f'{path.relative_to(BACKEND_ROOT)}:{lineno}')
        assert not offenders, f'{literal!r} still present in: {offenders}'

    def test_forgot_password_never_returns_the_code(self):
        """The response body must not carry the reset code back to the caller — that was
        the bug, and it is invisible in the UI once the debug box is removed."""
        source = (BACKEND_ROOT / 'app' / 'routes' / 'auth_routes.py').read_text(encoding='utf-8')
        assert 'debug_otp' not in source

    def test_reset_endpoint_does_not_compare_against_a_literal(self):
        source = (BACKEND_ROOT / 'app' / 'routes' / 'auth_routes.py').read_text(encoding='utf-8')
        reset_block = source.split("@auth_bp.post('/reset-password')")[1]
        assert re.search(r"otp\s*(==|!=)\s*['\"]", reset_block) is None
        assert 'check_reset_otp' in reset_block
