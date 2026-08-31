"""The two conditions that guard the super-admin management surface.

WHAT IS BEHIND THIS GATE
------------------------
Creating admins, granting companies, and moving candidates between them. Everything that
can hand another person access to candidate data. It is the highest-privilege surface in
the app and the only one whose misuse is invisible from the outside — a wrongly granted
company looks exactly like a correctly granted one afterwards.

WHY THE ROLE ALONE IS NOT THE GATE
----------------------------------
`super_admin_required` demands the role AND a claim that only the dedicated super-admin
sign-in mints. Without the second half, every ordinary session belonging to a super admin
would silently carry full management rights — including one already sitting in a browser
tab from before they were promoted, and any token lifted from the normal Admin Hub.

The dependency is exercised directly. Wiring it through TestClient would need create_app(),
which connects to the live database on boot; this suite must never do that (see conftest).
"""

import datetime

import jwt
import pytest
from fastapi import HTTPException

from app.utils.security import (
    JWT_SECRET, SUPERADMIN_CLAIM, ADMIN_ROLES,
    ROLE_ADMIN, ROLE_SUPER_ADMIN,
    admin_required, super_admin_required, create_access_token,
)


class FakeUser:
    def __init__(self, role, id=1, must_change_password=False):
        self.id = id
        self.role = role
        self.must_change_password = must_change_password


SUPER = FakeUser(ROLE_SUPER_ADMIN)
ADMIN = FakeUser(ROLE_ADMIN, id=2)
CANDIDATE = FakeUser('candidate', id=3)

MANAGEMENT_TOKEN = {SUPERADMIN_CLAIM: True}
ORDINARY_TOKEN = {}


class TestSuperAdminRequired:
    def test_a_super_admin_with_a_management_token_passes(self):
        assert super_admin_required(user=SUPER, payload=MANAGEMENT_TOKEN) is SUPER

    def test_a_super_admin_on_an_ordinary_session_is_refused(self):
        """The case the claim exists for: signing in at /auth/login must not open the
        management surface, even for the right person."""
        with pytest.raises(HTTPException) as excinfo:
            super_admin_required(user=SUPER, payload=ORDINARY_TOKEN)
        assert excinfo.value.status_code == 403

    def test_an_ordinary_admin_is_refused_even_holding_the_claim(self):
        """Belt and braces: a forged or stale claim must not be sufficient on its own.
        The role is the authority; the claim only proves which door they came through."""
        with pytest.raises(HTTPException) as excinfo:
            super_admin_required(user=ADMIN, payload=MANAGEMENT_TOKEN)
        assert excinfo.value.status_code == 403

    def test_a_candidate_is_refused(self):
        with pytest.raises(HTTPException) as excinfo:
            super_admin_required(user=CANDIDATE, payload=MANAGEMENT_TOKEN)
        assert excinfo.value.status_code == 403

    @pytest.mark.parametrize('claim_value', [False, None, 0, ''])
    def test_a_falsey_claim_does_not_count_as_present(self, claim_value):
        with pytest.raises(HTTPException):
            super_admin_required(user=SUPER, payload={SUPERADMIN_CLAIM: claim_value})


class TestAdminRequired:
    """A super admin must keep working everywhere an admin works. `role != 'admin'` used to
    be the check, which would have locked the super admin out of the entire Admin Hub the
    moment the role was introduced."""

    @pytest.mark.parametrize('user', [ADMIN, SUPER])
    def test_both_admin_roles_pass(self, user):
        assert admin_required(user=user) is user

    def test_a_candidate_is_refused(self):
        with pytest.raises(HTTPException) as excinfo:
            admin_required(user=CANDIDATE)
        assert excinfo.value.status_code == 403

    def test_the_role_constants_agree(self):
        assert set(ADMIN_ROLES) == {ROLE_ADMIN, ROLE_SUPER_ADMIN}


class TestTokenClaims:
    def test_extra_claims_reach_the_token(self):
        token = create_access_token(7, extra_claims={SUPERADMIN_CLAIM: True})
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        assert payload[SUPERADMIN_CLAIM] is True
        assert payload['sub'] == '7'

    def test_an_ordinary_token_carries_no_management_claim(self):
        payload = jwt.decode(create_access_token(7), JWT_SECRET, algorithms=['HS256'])
        assert SUPERADMIN_CLAIM not in payload

    def test_extra_claims_cannot_overwrite_the_subject(self):
        """Otherwise a caller-supplied "sub" would be an outright authentication bypass —
        mint a token for yourself, name someone else in it."""
        token = create_access_token(7, extra_claims={'sub': '1', 'exp': 0})
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        assert payload['sub'] == '7'

    def test_the_management_session_is_shorter_than_a_normal_one(self):
        """This token can create admins; an unattended tab is a bigger liability than an
        ordinary admin session."""
        from app.routes.superadmin_routes import SUPERADMIN_SESSION_HOURS

        assert SUPERADMIN_SESSION_HOURS < 12

        token = create_access_token(
            7,
            expires_delta=datetime.timedelta(hours=SUPERADMIN_SESSION_HOURS),
            extra_claims={SUPERADMIN_CLAIM: True},
        )
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        lifetime = payload['exp'] - payload['iat']
        assert lifetime == SUPERADMIN_SESSION_HOURS * 3600
