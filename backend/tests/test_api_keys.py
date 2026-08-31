"""API keys: the credential, its scopes, its rate limit, and the guard on /api/v1.

WHAT AN API KEY IS, AND WHY THAT SHAPES THESE TESTS
---------------------------------------------------
A key is handed to an integration and then lives in somebody else's configuration file for
months. Nobody is watching it. That makes three things load bearing in a way they are not
for a session:

  - It must be bound to one company, and its data access must go through the SAME filtering
    the Admin Hub uses. A second filtering mechanism written for /api/v1 is a second chance
    to get the rule wrong, and a too-wide filter still returns a valid-looking response.
  - Scopes must be enforced per route, not per key-holder's good intentions. A read-only
    integration that can write is a read-only integration in name only.
  - Revoking must take effect immediately, and expiry must actually expire, because "turn it
    off" is the only control anybody has once a key has leaked.

WHAT IS TESTED WITHOUT A DATABASE
---------------------------------
Everything except the dependency's own lookup: hashing, extraction, scope checks, rate
limiting, and the model's lifecycle logic all work on values or on an unsaved instance. The
route-level guarantee is covered structurally at the bottom, the same way /api/admin is.
"""

import ast
import datetime
import pathlib

import pytest
from fastapi import HTTPException

from app.models import ApiKey
from app.utils.api_key import (
    KEY_PREFIX,
    PREFIX_LENGTH,
    SCOPES,
    ApiKeyPrincipal,
    _check_rate_limit,
    _extract_key,
    generate_key,
    hash_key,
    reset_rate_limits,
)

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
V1_ROUTES = BACKEND_ROOT / 'app' / 'routes' / 'v1_routes.py'


class FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


@pytest.fixture(autouse=True)
def clean_rate_limits():
    reset_rate_limits()
    yield
    reset_rate_limits()


# ---------------------------------------------------------------------------------------
# The secret itself
# ---------------------------------------------------------------------------------------

class TestKeyGeneration:
    def test_a_key_is_recognisable_as_one(self):
        """The prefix is what lets a leaked key be spotted in a log, a paste or a public
        repo — and what secret scanners match on. A key nobody can recognise is a key
        nobody reports."""
        full, prefix, _ = generate_key()
        assert full.startswith(KEY_PREFIX)
        assert prefix.startswith(KEY_PREFIX)

    def test_the_stored_prefix_is_too_short_to_use(self):
        full, prefix, _ = generate_key()
        assert prefix == full[:PREFIX_LENGTH]
        assert len(prefix) < len(full)

    def test_keys_are_not_repeated(self):
        assert len({generate_key()[0] for _ in range(200)}) == 200

    def test_the_hash_is_not_the_key(self):
        full, _, key_hash = generate_key()
        assert full not in key_hash

    def test_hashing_is_deterministic(self):
        """The dependency re-hashes what was presented and compares. If this were salted per
        call, no key would ever verify."""
        full, _, key_hash = generate_key()
        assert hash_key(full) == key_hash

    def test_a_different_key_does_not_collide(self):
        assert hash_key('sit_aaa') != hash_key('sit_bbb')

    def test_the_hash_is_sha256_shaped(self):
        """SHA-256 rather than bcrypt is deliberate: this arrives on EVERY request, and
        ~100ms of bcrypt per call would cost more than the rest of the request. The secret
        is 32 random bytes, so slowness buys nothing here."""
        assert len(hash_key('sit_anything')) == 64


# ---------------------------------------------------------------------------------------
# How a key is presented
# ---------------------------------------------------------------------------------------

class TestKeyExtraction:
    def test_the_dedicated_header_is_read(self):
        assert _extract_key(FakeRequest(), 'sit_abc') == 'sit_abc'

    def test_a_bearer_api_key_is_read(self):
        """Two accepted forms because integrations differ in what they can send. An API
        nobody can authenticate against is not safer, only unused."""
        request = FakeRequest({'Authorization': 'Bearer sit_abc'})
        assert _extract_key(request, None) == 'sit_abc'

    def test_a_jwt_in_the_bearer_header_is_not_treated_as_a_key(self):
        """A session token sent here must fall through to the ordinary error rather than be
        hashed and compared, or the failure reads as "invalid key" to somebody who sent a
        perfectly good session token to the wrong surface."""
        request = FakeRequest({'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.def'})
        assert _extract_key(request, None) is None

    def test_the_dedicated_header_wins(self):
        request = FakeRequest({'Authorization': 'Bearer sit_from_bearer'})
        assert _extract_key(request, 'sit_from_header') == 'sit_from_header'

    def test_surrounding_whitespace_is_ignored(self):
        assert _extract_key(FakeRequest(), '  sit_abc  ') == 'sit_abc'

    def test_no_credential_at_all_returns_nothing(self):
        assert _extract_key(FakeRequest(), None) is None
        assert _extract_key(FakeRequest({'Authorization': 'Basic abc'}), None) is None


# ---------------------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------------------

class TestScopes:
    def _key(self, scopes):
        record = ApiKey(name='test', key_prefix='sit_x', key_hash='x', company_id=1)
        record.set_scopes(scopes)
        return record

    def test_a_granted_scope_passes(self):
        principal = ApiKeyPrincipal(self._key(['candidates:read']), None, 60)
        principal.require('candidates:read')  # must not raise

    def test_a_missing_scope_is_refused(self):
        principal = ApiKeyPrincipal(self._key(['candidates:read']), None, 60)
        with pytest.raises(HTTPException) as excinfo:
            principal.require('candidates:write')
        assert excinfo.value.status_code == 403

    def test_the_error_names_what_is_missing(self):
        """403 and a name, unlike the 404 used for out-of-company rows. A missing scope is a
        fact about the caller's OWN key, which they already know — stating it leaks nothing
        and saves an integration author from guessing."""
        principal = ApiKeyPrincipal(self._key([]), None, 60)
        with pytest.raises(HTTPException) as excinfo:
            principal.require('recordings:read')
        assert 'recordings:read' in excinfo.value.detail

    def test_every_required_scope_must_be_present(self):
        principal = ApiKeyPrincipal(self._key(['candidates:read']), None, 60)
        with pytest.raises(HTTPException):
            principal.require('candidates:read', 'candidates:write')

    def test_a_key_with_no_scopes_can_do_nothing(self):
        """The safe default. An empty scope list must not read as "unrestricted"."""
        record = self._key([])
        assert record.scope_list() == []
        for scope in SCOPES:
            assert record.has_scope(scope) is False

    @pytest.mark.parametrize('corrupt', ['not json', '{}', '"a string"', ''])
    def test_a_corrupt_scope_blob_means_no_permissions(self, corrupt):
        """Fails closed. A parse error must never be read as "all permissions"."""
        record = ApiKey(name='t', key_prefix='sit_x', key_hash='x', company_id=1)
        record.scopes = corrupt
        assert record.scope_list() == []

    def test_scopes_are_stored_deduplicated_and_ordered(self):
        """So two keys with the same permissions compare equal in the UI and the audit log
        instead of differing by the order somebody happened to tick the boxes."""
        record = self._key(['interviews:read', 'candidates:read', 'interviews:read'])
        assert record.scope_list() == ['candidates:read', 'interviews:read']

    def test_the_scope_table_covers_every_scope_the_routes_ask_for(self):
        """A route requiring a scope that is not in SCOPES could never be granted it — the
        key creation endpoint refuses unknown scopes, so that route would be permanently
        unreachable, and nothing else would report it."""
        source = V1_ROUTES.read_text(encoding='utf-8')
        tree = ast.parse(source)
        asked = set()
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == 'require_scopes'
            ):
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        asked.add(arg.value)
        unknown = asked - set(SCOPES)
        assert not unknown, f"/api/v1 requires scopes that cannot be granted: {sorted(unknown)}"


# ---------------------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------------------

class TestKeyLifecycle:
    def _key(self, **kwargs):
        return ApiKey(name='t', key_prefix='sit_x', key_hash='x', company_id=1, **kwargs)

    def test_a_fresh_key_is_active(self):
        record = self._key()
        assert record.is_active() is True
        assert record.status() == 'active'

    def test_a_revoked_key_is_not(self):
        """Revocation is the only control anybody has once a key has leaked, so it has to
        be absolute — not a flag some code paths consult."""
        record = self._key(revoked_at=datetime.datetime.utcnow())
        assert record.is_active() is False
        assert record.status() == 'revoked'

    def test_an_expired_key_is_not(self):
        record = self._key(
            expires_at=datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
        )
        assert record.is_active() is False
        assert record.status() == 'expired'

    def test_a_future_expiry_is_still_active(self):
        record = self._key(expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=1))
        assert record.is_active() is True

    def test_no_expiry_means_no_expiry(self):
        assert self._key(expires_at=None).is_active() is True

    def test_revocation_beats_a_valid_expiry(self):
        record = self._key(
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=365),
            revoked_at=datetime.datetime.utcnow(),
        )
        assert record.is_active() is False

    def test_the_serialised_key_never_carries_the_secret(self):
        """This shape goes to the management UI on every page load. The hash appearing here
        would put it in a browser, a cache and a screenshot."""
        record = self._key()
        record.key_hash = hash_key('sit_supersecret')
        body = record.to_dict()
        assert 'key_hash' not in body
        assert record.key_hash not in str(body)
        # The prefix is deliberately present — it is how two keys are told apart.
        assert body['key_prefix'] == 'sit_x'


# ---------------------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------------------

class TestRateLimiting:
    def test_requests_up_to_the_limit_are_allowed(self):
        for _ in range(5):
            _check_rate_limit(key_id=1, limit=5)

    def test_the_next_request_is_refused(self):
        for _ in range(5):
            _check_rate_limit(key_id=1, limit=5)
        with pytest.raises(HTTPException) as excinfo:
            _check_rate_limit(key_id=1, limit=5)
        assert excinfo.value.status_code == 429

    def test_the_refusal_says_when_to_come_back(self):
        """Without Retry-After a well-behaved client has to guess, and guessing means
        hammering — which is what the limit exists to stop."""
        for _ in range(2):
            _check_rate_limit(key_id=1, limit=2)
        with pytest.raises(HTTPException) as excinfo:
            _check_rate_limit(key_id=1, limit=2)
        assert int(excinfo.value.headers['Retry-After']) >= 1

    def test_the_remaining_count_counts_down(self):
        """Reported back on /whoami so an integration can pace itself."""
        assert _check_rate_limit(key_id=1, limit=3) == 2
        assert _check_rate_limit(key_id=1, limit=3) == 1
        assert _check_rate_limit(key_id=1, limit=3) == 0

    def test_keys_are_limited_independently(self):
        """One noisy integration must not throttle everybody else's."""
        for _ in range(5):
            _check_rate_limit(key_id=1, limit=5)
        _check_rate_limit(key_id=2, limit=5)  # must not raise

    def test_limits_are_per_key_not_per_ip(self):
        """An integration is one caller however many machines it runs on, and an IP limit
        would punish everyone behind one NAT."""
        import inspect
        from app.utils import api_key

        assert 'key_id' in inspect.signature(api_key._check_rate_limit).parameters


# ---------------------------------------------------------------------------------------
# Structural guard on /api/v1
# ---------------------------------------------------------------------------------------

def _v1_routes():
    tree = ast.parse(V1_ROUTES.read_text(encoding='utf-8'), filename=str(V1_ROUTES))
    found = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            if (
                isinstance(dec, ast.Call)
                and isinstance(dec.func, ast.Attribute)
                and isinstance(dec.func.value, ast.Name)
                and dec.func.value.id == 'v1_bp'
            ):
                found.append(node)
                break
    return found


ALL_V1 = [pytest.param(fn, id=fn.name) for fn in _v1_routes()]

# `whoami` needs no scope on purpose: it is how an integration author confirms their key
# works and diagnoses a 403 elsewhere. Gating it would mean the endpoint that explains
# missing scopes can itself be missing a scope.
SCOPELESS_BY_DESIGN = {'whoami'}

# Routes that filter by something NARROWER than the company scope, and so legitimately
# never touch principal.scope. Keep this short and justified — every entry is a permanent
# exemption from the only automatic check that a /api/v1 route is filtered at all.
NARROWER_THAN_COMPANY = {
    # Scoped to the calling key's own actions, not its company's. An audit entry's `details`
    # is free text naming candidates, so a row written by a human admin of the same company
    # can carry information no integration was granted a scope for.
    'list_audit_log',
}

# Routes that WRITE a new row under the key's own company without ever querying one — there
# is no existing data to filter, so there is nothing for principal.scope to narrow. The
# company on the new row comes directly from principal.api_key.company_id, which is
# structurally the key's own: a key cannot name a different company because it is bound to
# exactly one for its whole life. Verified separately below, so this exemption cannot
# quietly become "writes under no company check at all".
WRITES_UNDER_OWN_COMPANY = {'create_bulk_invite'}


def test_v1_routes_were_discovered():
    """A decorator rename would make every assertion below vacuously pass."""
    assert len(ALL_V1) >= 8


@pytest.mark.parametrize('fn', ALL_V1)
def test_every_v1_route_authenticates(fn):
    params = [a.arg for a in fn.args.args + fn.args.kwonlyargs]
    assert 'principal' in params, (
        f"/api/v1 {fn.name} takes no principal, so it is unauthenticated and unscoped."
    )


@pytest.mark.parametrize('fn', ALL_V1)
def test_every_v1_route_declares_the_scopes_it_needs(fn):
    if fn.name in SCOPELESS_BY_DESIGN:
        pytest.skip(f"{fn.name} is scopeless by design")

    scoped = False
    for default in fn.args.defaults + fn.args.kw_defaults:
        for node in ast.walk(default) if default is not None else []:
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == 'require_scopes'
                and node.args
            ):
                scoped = True
    assert scoped, (
        f"/api/v1 {fn.name} authenticates but names no scope, so ANY valid key can call it. "
        f"Use Depends(require_scopes('...'))."
    )


@pytest.mark.parametrize('fn', ALL_V1)
def test_every_v1_route_filters_through_the_company_scope(fn):
    """Authenticating is not the same as being scoped.

    A route can hold a perfectly valid key and still query the whole table. That is the
    failure this catches, and it is silent: the response is well-formed, it just contains
    other companies' rows.
    """
    if fn.name in SCOPELESS_BY_DESIGN:
        pytest.skip(f"{fn.name} is scopeless by design")
    if fn.name in NARROWER_THAN_COMPANY:
        # Still filtered, just on the key rather than the company — asserted separately
        # below so the exemption cannot become "filtered by nothing".
        pytest.skip(f"{fn.name} filters more narrowly than the company scope")
    if fn.name in WRITES_UNDER_OWN_COMPANY:
        # A write with no query to filter — asserted separately below.
        pytest.skip(f"{fn.name} writes under the key's own company; nothing to query-filter")

    uses_scope = any(
        isinstance(node, ast.Attribute) and node.attr == 'scope'
        for stmt in fn.body
        for node in ast.walk(stmt)
    )
    assert uses_scope, (
        f"/api/v1 {fn.name} never touches principal.scope, so its queries are unfiltered "
        f"and reach every company."
    )


@pytest.mark.parametrize('fn', [p for p in ALL_V1 if p.values[0].name in WRITES_UNDER_OWN_COMPANY])
def test_a_write_route_pins_the_company_to_the_keys_own(fn):
    """The exemption above must not become an exemption from setting a company at all.

    Without this, a route could quietly stop setting company_id — creating rows with no
    company that only the super admin would ever see, and nobody watching this test would
    notice, because it looks identical to "created successfully".
    """
    sets_own_company = any(
        isinstance(node, ast.Attribute) and node.attr == 'company_id'
        for stmt in fn.body
        for node in ast.walk(stmt)
    )
    assert sets_own_company, (
        f"/api/v1 {fn.name} is exempt from company-scope filtering but never references "
        f"company_id either, so the row it creates may not be assigned to any company."
    )


@pytest.mark.parametrize('fn', [p for p in ALL_V1 if p.values[0].name in NARROWER_THAN_COMPANY])
def test_a_narrower_route_still_filters_on_the_key(fn):
    """An exemption from the company-scope check must not become an exemption from filtering.

    The audit route is filtered on api_key_id — a real indexed column. It used to match on
    `details LIKE 'API key <prefix>%'`, which depended on the wording of a human-readable
    message: reword the message and the filter silently returns nothing, which looks exactly
    like "this key has done nothing" rather than like a bug.
    """
    filters_on_key = any(
        isinstance(node, ast.Attribute) and node.attr == 'api_key_id'
        for stmt in fn.body
        for node in ast.walk(stmt)
    )
    assert filters_on_key, (
        f"/api/v1 {fn.name} is exempt from the company-scope check but does not filter on "
        f"api_key_id either, so it is filtered by nothing."
    )
