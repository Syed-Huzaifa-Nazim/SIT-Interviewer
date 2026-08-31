"""The super admin's second factor, and the pieces that make it worth having.

THE ATTACK THIS DEFENDS AGAINST
-------------------------------
Somebody has the super admin password. That is not far-fetched — it is emailed at least
once, typed into browsers, and until now it was the single thing standing between an
attacker and an account that can create admins, grant them any company, and read every
candidate on the platform.

WHAT THESE TESTS PIN, AND WHY EACH ONE
--------------------------------------
1. A password alone must never produce a session. The whole factor is worthless if
   /login still hands back an access token on the way to asking for a code.
2. The challenge must not BE a session. This is the sharp edge: a challenge is a JWT
   naming a user id, and get_current_user_id accepts any correctly-signed token with a
   `sub`. Signed with the ordinary secret, the challenge would be a working access token
   and the second factor would be skippable by sending it straight to any endpoint. It is
   signed with a derived key instead, and that is asserted from both directions.
3. Codes are single-use, expiring, and stored only as hashes.
4. Recovery codes work exactly once, because the alternative is a permanent password.
5. The three OTP column-sets stay separate. The interview OTP is single-use and worth a
   candidate's one attempt; a login code written over it would silently cost them that.

No database: the model methods operate on an unsaved instance, and JWTs need nothing.
"""

import datetime
import json

import jwt
import pytest

from app.models import User
from app.utils.security import (
    JWT_SECRET,
    SUPERADMIN_CHALLENGE_MINUTES,
    create_access_token,
    create_superadmin_challenge,
    decode_superadmin_challenge,
    get_current_user_id,
)


def blank_user():
    """An unsaved User. Nothing here touches the session."""
    return User(name='Administrator', email='admin@interviewer.com')


# ---------------------------------------------------------------------------------------
# The challenge must not be a session
# ---------------------------------------------------------------------------------------

class TestChallengeIsolation:
    def test_a_challenge_carries_the_user_id(self):
        assert decode_superadmin_challenge(create_superadmin_challenge(42)) == 42

    def test_a_challenge_is_not_signed_with_the_ordinary_secret(self):
        """If it were, it would be a valid access token — the second factor would be
        skippable by sending the challenge to any authenticated endpoint."""
        with pytest.raises(jwt.InvalidTokenError):
            jwt.decode(create_superadmin_challenge(42), JWT_SECRET, algorithms=['HS256'])

    def test_an_access_token_is_not_accepted_as_a_challenge(self):
        """The reverse direction. An ordinary session must not be replayable as proof that
        the password step just happened."""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            decode_superadmin_challenge(create_access_token(42))
        assert excinfo.value.status_code == 401

    def test_a_challenge_is_rejected_by_the_ordinary_token_validator(self):
        """The end-to-end version of the same claim, exercised through the real dependency
        rather than through jwt.decode."""
        from fastapi import HTTPException
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(
            scheme='Bearer', credentials=create_superadmin_challenge(42)
        )
        with pytest.raises(HTTPException) as excinfo:
            get_current_user_id(credentials=credentials)
        assert excinfo.value.status_code == 401

    def test_a_missing_challenge_is_rejected_rather_than_crashing(self):
        from fastapi import HTTPException

        for value in (None, ''):
            with pytest.raises(HTTPException) as excinfo:
                decode_superadmin_challenge(value)
            assert excinfo.value.status_code == 401

    def test_a_challenge_expires(self):
        payload = jwt.decode(
            create_superadmin_challenge(42),
            options={'verify_signature': False},
        )
        assert payload['exp'] - payload['iat'] == SUPERADMIN_CHALLENGE_MINUTES * 60

    def test_the_challenge_window_is_short(self):
        """A challenge left in a closed tab should not be a standing invitation."""
        assert SUPERADMIN_CHALLENGE_MINUTES <= 15


# ---------------------------------------------------------------------------------------
# The emailed code
# ---------------------------------------------------------------------------------------

class TestLoginOtp:
    def test_a_correct_code_verifies(self):
        user = blank_user()
        user.set_login_otp('123456')
        assert user.check_login_otp('123456') is True

    def test_a_wrong_code_does_not(self):
        user = blank_user()
        user.set_login_otp('123456')
        assert user.check_login_otp('123457') is False

    def test_the_code_is_never_stored_in_the_clear(self):
        """A database read — a backup, a support query, an SQL injection — must not hand
        somebody a live second factor."""
        user = blank_user()
        user.set_login_otp('123456')
        assert '123456' not in (user.login_otp_hash or '')

    def test_an_expired_code_is_refused(self):
        user = blank_user()
        user.set_login_otp('123456')
        user.login_otp_expires_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
        assert user.check_login_otp('123456') is False

    def test_no_code_set_means_nothing_verifies(self):
        """Otherwise an account that was never sent a code would accept an empty one."""
        user = blank_user()
        assert user.check_login_otp('123456') is False
        assert user.check_login_otp('') is False

    def test_clearing_makes_it_stop_working(self):
        user = blank_user()
        user.set_login_otp('123456')
        user.clear_login_otp()
        assert user.check_login_otp('123456') is False
        assert user.login_otp_hash is None


class TestOtpColumnsStaySeparate:
    """Three OTP flows share this table. Arming one must not touch the others.

    The interview OTP is the one that matters most: it is single-use and it IS the
    candidate's one attempt. A login code written over it would consume that silently, and
    the candidate would simply be told their credentials had already been used.
    """

    def test_arming_the_login_code_leaves_the_interview_otp_alone(self):
        user = blank_user()
        user.set_otp('999999')
        interview_hash = user.otp_hash

        user.set_login_otp('123456')

        assert user.otp_hash == interview_hash
        assert user.check_otp('999999') is True

    def test_arming_the_login_code_leaves_the_reset_code_alone(self):
        user = blank_user()
        user.set_reset_otp('888888')
        reset_hash = user.reset_otp_hash

        user.set_login_otp('123456')

        assert user.reset_otp_hash == reset_hash

    def test_clearing_the_login_code_leaves_the_others_alone(self):
        user = blank_user()
        user.set_otp('999999')
        user.set_reset_otp('888888')
        user.set_login_otp('123456')

        user.clear_login_otp()

        assert user.check_otp('999999') is True
        assert user.check_reset_otp('888888') is True

    def test_the_three_hashes_are_distinct_columns(self):
        user = blank_user()
        user.set_otp('111111')
        user.set_reset_otp('111111')
        user.set_login_otp('111111')
        assert len({user.otp_hash, user.reset_otp_hash, user.login_otp_hash}) == 3


# ---------------------------------------------------------------------------------------
# Recovery codes
# ---------------------------------------------------------------------------------------

class TestRecoveryCodes:
    """The second factor is delivered by email, and this system's email_logs record real
    delivery failures. Without these, one bad SMTP day means nobody can administer the
    platform at all."""

    CODES = ['ABCDEFGHJK', 'LMNPQRTUVW', 'XYZ234678A']

    def test_a_code_verifies(self):
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        assert user.consume_recovery_code('ABCDEFGHJK') is True

    def test_a_code_works_exactly_once(self):
        """A recovery code that survives its use is a second password."""
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        assert user.consume_recovery_code('ABCDEFGHJK') is True
        assert user.consume_recovery_code('ABCDEFGHJK') is False

    def test_spending_one_leaves_the_others(self):
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        user.consume_recovery_code('ABCDEFGHJK')
        assert user.recovery_codes_remaining() == 2
        assert user.consume_recovery_code('LMNPQRTUVW') is True

    @pytest.mark.parametrize('typed', [
        'abcdefghjk',       # typed in lower case
        'ABCDE-FGHJK',      # copied with the dash it is displayed with
        '  ABCDEFGHJK  ',   # pasted with whitespace
        'ABCDE FGHJK',      # read off paper with a space
    ])
    def test_it_accepts_the_shapes_a_person_actually_types(self, typed):
        """These are used at the worst possible moment — locked out, under pressure. A code
        that fails on a dash is indistinguishable from a wrong one."""
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        assert user.consume_recovery_code(typed) is True

    def test_a_wrong_code_is_refused_and_spends_nothing(self):
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        assert user.consume_recovery_code('NOTACODE00') is False
        assert user.recovery_codes_remaining() == 3

    def test_codes_are_never_stored_in_the_clear(self):
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        assert 'ABCDEFGHJK' not in user.recovery_codes

    def test_regenerating_invalidates_the_previous_set(self):
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        user.set_recovery_codes(['ZZZZZZZZZZ'])
        assert user.consume_recovery_code('ABCDEFGHJK') is False
        assert user.consume_recovery_code('ZZZZZZZZZZ') is True

    @pytest.mark.parametrize('stored', [None, '', 'not json', '{}'])
    def test_a_missing_or_corrupt_set_fails_closed(self, stored):
        """This runs inside a sign-in. Raising here would turn a wrong code into a 500, and
        a 500 on a login is indistinguishable from the site being down."""
        user = blank_user()
        user.recovery_codes = stored
        assert user.consume_recovery_code('ABCDEFGHJK') is False
        assert user.recovery_codes_remaining() == 0

    def test_an_empty_code_never_matches(self):
        user = blank_user()
        user.set_recovery_codes(self.CODES)
        assert user.consume_recovery_code('') is False
        assert user.consume_recovery_code(None) is False

    def test_enough_codes_are_issued_to_survive_losing_a_few(self):
        from app.routes.superadmin_routes import RECOVERY_CODE_COUNT

        assert RECOVERY_CODE_COUNT >= 5


class TestGeneratedRecoveryCodes:
    def test_the_alphabet_excludes_characters_that_are_misread(self):
        """O/0, I/1 and S/5 are the classic pairs. A code that fails because of a misread
        character looks exactly like a wrong code to somebody already locked out."""
        from app.routes.superadmin_routes import _RECOVERY_ALPHABET

        for ambiguous in 'O0I1S5':
            assert ambiguous not in _RECOVERY_ALPHABET

    def test_generated_codes_are_unique_across_a_batch(self):
        from app.routes.superadmin_routes import _recovery_code

        codes = {_recovery_code() for _ in range(200)}
        assert len(codes) == 200

    def test_a_generated_code_round_trips_through_storage(self):
        from app.routes.superadmin_routes import _recovery_code

        shown = _recovery_code()
        user = blank_user()
        user.set_recovery_codes([shown.replace('-', '')])
        # Typed back exactly as it was displayed, dash and all.
        assert user.consume_recovery_code(shown) is True


# ---------------------------------------------------------------------------------------
# The generated password gate
# ---------------------------------------------------------------------------------------

class TestMustChangePassword:
    def test_an_account_on_a_generated_password_is_refused_the_admin_surface(self):
        """The credential is sitting in an email inbox until it is replaced."""
        from fastapi import HTTPException
        from app.utils.security import admin_required, ROLE_ADMIN

        class Fake:
            id = 5
            role = ROLE_ADMIN
            must_change_password = True

        with pytest.raises(HTTPException) as excinfo:
            admin_required(user=Fake())
        assert excinfo.value.status_code == 403
        # Machine-readable, so the frontend switches forms rather than matching English.
        assert 'PASSWORD_CHANGE_REQUIRED' in excinfo.value.detail

    def test_the_same_account_passes_once_the_password_is_its_own(self):
        from app.utils.security import admin_required, ROLE_ADMIN

        class Fake:
            id = 5
            role = ROLE_ADMIN
            must_change_password = False

        user = Fake()
        assert admin_required(user=user) is user


class TestGeneratedCredentials:
    def test_a_generated_password_is_long_enough_to_survive_being_emailed(self):
        from app.routes.superadmin_routes import _generated_password, MIN_ADMIN_PASSWORD_LENGTH

        assert len(_generated_password()) >= MIN_ADMIN_PASSWORD_LENGTH

    def test_generated_passwords_are_not_repeated(self):
        from app.routes.superadmin_routes import _generated_password

        assert len({_generated_password() for _ in range(100)}) == 100
