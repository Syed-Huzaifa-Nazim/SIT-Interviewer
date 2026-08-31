"""A refresh token must not work as an access token.

THE HOLE
--------
Access and refresh tokens are signed with the SAME key and differ only by a `type` claim.
`/auth/refresh` checks that claim and refuses to mint a session from an access token. The
reverse direction was not checked anywhere: every authenticated dependency validated the
signature, the expiry and `sub`, all three of which a refresh token satisfies. So a refresh
token authenticated any request in the app.

WHY IT MATTERS
--------------
The two are not interchangeable. A refresh token lives seven days against an access token's
twelve hours, and it is handed to the client to be STORED for exactly that longevity — it
sits in localStorage across sessions by design. Anything that leaked one (a log line, a
proxy, a copied browser profile) got a week of full API access directly, instead of a token
that had to be exchanged first at the one endpoint where the exchange could be seen.

BACKWARD COMPATIBILITY
----------------------
Tokens minted before this check carry no `type` at all. An absent claim is therefore
accepted — rejecting it would sign out every live session on the deploy that ships this, and
the point is to close a hole, not to cause an outage. Only a claim that is present and wrong
is refused, which covers refresh tokens now and any future token kind by default.
"""

import datetime

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.utils.security import (
    JWT_SECRET,
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    get_current_user_id,
    get_token_payload,
)


def bearer(token):
    return HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)


def legacy_access_token(user_id=7):
    """An access token as this app minted them before `type` existed. Still in the wild for
    up to twelve hours after the deploy that adds the check."""
    now = datetime.datetime.utcnow()
    return jwt.encode(
        {'sub': str(user_id), 'iat': now, 'exp': now + datetime.timedelta(hours=12)},
        JWT_SECRET,
        algorithm='HS256',
    )


class TestTokensAreLabelled:
    def test_an_access_token_says_so(self):
        payload = jwt.decode(create_access_token(7), JWT_SECRET, algorithms=['HS256'])
        assert payload['type'] == TOKEN_TYPE_ACCESS

    def test_a_refresh_token_says_so(self):
        payload = jwt.decode(create_refresh_token(7), JWT_SECRET, algorithms=['HS256'])
        assert payload['type'] == TOKEN_TYPE_REFRESH

    def test_the_two_labels_differ(self):
        """Stating the obvious on purpose: if these ever collapsed to the same string the
        check below would pass while protecting nothing."""
        assert TOKEN_TYPE_ACCESS != TOKEN_TYPE_REFRESH

    def test_a_caller_cannot_relabel_a_token_through_extra_claims(self):
        """extra_claims is how the super-admin marker is attached. It must not be a way to
        stamp an arbitrary type onto a token."""
        token = create_access_token(7, extra_claims={'type': TOKEN_TYPE_REFRESH})
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        assert payload['type'] == TOKEN_TYPE_ACCESS


class TestRefreshTokensAreRefusedForAuthentication:
    def test_get_current_user_id_rejects_a_refresh_token(self):
        with pytest.raises(HTTPException) as excinfo:
            get_current_user_id(credentials=bearer(create_refresh_token(7)))
        assert excinfo.value.status_code == 401

    def test_get_token_payload_rejects_a_refresh_token(self):
        """Guarded independently rather than relying on get_current_user_id running first:
        a dependency that is only safe because of what sits beside it stops being safe the
        moment somebody uses it alone."""
        with pytest.raises(HTTPException) as excinfo:
            get_token_payload(credentials=bearer(create_refresh_token(7)))
        assert excinfo.value.status_code == 401

    def test_the_rejection_happens_before_any_database_lookup(self):
        """This suite cannot touch a database (see conftest), so reaching User.query would
        fail the run loudly rather than pass. Getting a clean 401 IS the assertion that the
        check runs first — which also means a refresh token cannot be used to probe whether
        a user id exists."""
        with pytest.raises(HTTPException) as excinfo:
            get_current_user_id(credentials=bearer(create_refresh_token(999999)))
        assert excinfo.value.status_code == 401

    @pytest.mark.parametrize('token_type', ['refresh', 'sa_challenge', 'api_key', 'anything'])
    def test_any_unknown_token_kind_is_refused(self, token_type):
        """Fails closed for token kinds that do not exist yet."""
        now = datetime.datetime.utcnow()
        token = jwt.encode(
            {'sub': '7', 'iat': now, 'exp': now + datetime.timedelta(hours=1), 'type': token_type},
            JWT_SECRET,
            algorithm='HS256',
        )
        with pytest.raises(HTTPException):
            get_token_payload(credentials=bearer(token))


class TestLegacyTokensKeepWorking:
    """The deploy that ships this must not sign everybody out."""

    def test_a_token_with_no_type_claim_is_accepted(self):
        payload = get_token_payload(credentials=bearer(legacy_access_token()))
        assert payload['sub'] == '7'


class TestRefreshStillWorksWhereItShould:
    """The fix closes one direction without breaking the other. /auth/refresh decodes the
    token itself rather than through these dependencies, so a refresh token must remain
    fully valid there — otherwise nobody's session could ever be renewed."""

    def test_a_refresh_token_still_verifies_and_carries_its_subject(self):
        payload = jwt.decode(create_refresh_token(7), JWT_SECRET, algorithms=['HS256'])
        assert payload['sub'] == '7'
        assert payload['type'] == TOKEN_TYPE_REFRESH

    def test_the_refresh_endpoint_still_demands_a_refresh_token(self):
        """The guard in the other direction, which already existed: an access token must not
        be exchangeable for a new session, or a one-time interview token would have an
        unlimited renewal loop."""
        import pathlib

        source = (
            pathlib.Path(__file__).resolve().parent.parent / 'app' / 'routes' / 'auth_routes.py'
        ).read_text(encoding='utf-8')
        assert 'payload.get("type") != "refresh"' in source
