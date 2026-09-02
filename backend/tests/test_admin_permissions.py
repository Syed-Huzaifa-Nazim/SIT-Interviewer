"""Granular permissions for a company ADMIN account (app/utils/permissions.py).

WHY THIS EXISTS
----------------
AdminScope (app/utils/scope.py) answers "which company's ROWS can this admin see" — it says
nothing about which ACTIONS they may take. Before this, every admin granted a company got
every capability inside it: read candidates, write them, send invites, delete interviews,
approve re-interviews, read recordings and proctoring images, view analytics/audit/
transactions — all or nothing. This closes that gap by reusing the exact scope vocabulary an
API key already carries (app/utils/api_key.py's SCOPES, now sourced from this module), so a
company admin can be handed something narrower than full access, same as an integration.

BACKWARD COMPATIBILITY IS THE WHOLE POINT
------------------------------------------
`User.permissions` is nullable and NULL means "no restriction ever set" — full access,
exactly what every admin account had before this column existed. A super admin bypasses the
column entirely. Only an admin a super admin has EXPLICITLY narrowed (an actual list, empty
or not) is ever refused anything here.
"""

import pytest
from fastapi import HTTPException

from app.models import User
from app.utils.permissions import SCOPES, require_permissions


# --------------------------------------------------------------------------- User methods

class TestPermissionList:
    def test_a_fresh_admin_has_no_restriction(self):
        u = User(name='x', email='a@a.com', role='admin')
        assert u.permission_list() is None

    def test_setting_none_clears_any_restriction(self):
        u = User(name='x', email='a@a.com', role='admin')
        u.set_permissions(['candidates:read'])
        u.set_permissions(None)
        assert u.permission_list() is None

    def test_setting_an_explicit_empty_list_is_not_none(self):
        """An empty list is a deliberate "zero permissions" grant, distinct from never
        having set anything at all — the two must not collapse into the same answer."""
        u = User(name='x', email='a@a.com', role='admin')
        u.set_permissions([])
        assert u.permission_list() == []

    def test_scopes_are_stored_deduplicated_and_sorted(self):
        u = User(name='x', email='a@a.com', role='admin')
        u.set_permissions(['invites:send', 'candidates:read', 'candidates:read'])
        assert u.permission_list() == ['candidates:read', 'invites:send']

    def test_a_corrupted_blob_fails_closed_to_zero_permissions_not_full_access(self):
        u = User(name='x', email='a@a.com', role='admin')
        u.permissions = '{not valid json'
        assert u.permission_list() == []


class TestHasPermission:
    def test_no_restriction_means_every_scope_passes(self):
        u = User(name='x', email='a@a.com', role='admin')
        for scope in SCOPES:
            assert u.has_permission(scope)

    def test_a_granted_scope_passes(self):
        u = User(name='x', email='a@a.com', role='admin')
        u.set_permissions(['candidates:read'])
        assert u.has_permission('candidates:read')

    def test_an_ungranted_scope_is_refused(self):
        u = User(name='x', email='a@a.com', role='admin')
        u.set_permissions(['candidates:read'])
        assert not u.has_permission('invites:send')
        assert not u.has_permission('analytics:read')
        assert not u.has_permission('audit:read')

    def test_zero_permissions_means_zero_permissions(self):
        u = User(name='x', email='a@a.com', role='admin')
        u.set_permissions([])
        assert not u.has_permission('candidates:read')

    def test_a_super_admin_is_exempt_even_with_an_explicit_empty_grant(self):
        """The column is never even consulted for a super admin — it bypasses the check
        entirely, the same way AdminScope.is_super bypasses the company filter."""
        u = User(name='x', email='a@a.com', role='super_admin')
        u.set_permissions([])
        assert u.has_permission('candidates:read')
        assert u.has_permission('anything-not-even-a-real-scope')


# --------------------------------------------------------------------------- SCOPES parity

def test_admin_permissions_share_the_exact_api_key_scope_vocabulary():
    """A second, drifted copy of this list is exactly the bug this module's docstring warns
    about — pin that api_key.py's re-export is the SAME object, not a lookalike."""
    from app.utils.api_key import SCOPES as API_KEY_SCOPES
    assert SCOPES is API_KEY_SCOPES


# --------------------------------------------------------------------------- dependency

class FakeAdmin:
    """Minimal User stand-in — require_permissions only ever calls .has_permission."""

    def __init__(self, permissions):
        self._permissions = permissions

    def has_permission(self, scope):
        return scope in self._permissions if self._permissions is not None else True


def _call(dependency, user):
    """require_permissions returns a function taking `user` as its sole (Depends-wrapped)
    parameter — calling it directly exercises the exact same logic FastAPI would run,
    without needing a running app or a database."""
    return dependency(user=user)


class TestRequirePermissionsDependency:
    def test_a_granted_scope_passes(self):
        dep = require_permissions('candidates:read')
        admin = FakeAdmin(['candidates:read'])
        assert _call(dep, admin) is admin

    def test_a_missing_scope_is_refused_with_403(self):
        dep = require_permissions('invites:send')
        admin = FakeAdmin(['candidates:read'])
        with pytest.raises(HTTPException) as exc:
            _call(dep, admin)
        assert exc.value.status_code == 403

    def test_every_required_scope_must_be_present(self):
        dep = require_permissions('candidates:read', 'invites:send')
        admin = FakeAdmin(['candidates:read'])
        with pytest.raises(HTTPException):
            _call(dep, admin)

    def test_the_error_names_what_is_missing(self):
        dep = require_permissions('invites:send')
        admin = FakeAdmin([])
        with pytest.raises(HTTPException) as exc:
            _call(dep, admin)
        assert 'invites:send' in exc.value.detail

    def test_unrestricted_admin_passes_everything(self):
        dep = require_permissions('candidates:read', 'invites:send', 'audit:read')
        admin = FakeAdmin(None)
        assert _call(dep, admin) is admin


# ------------------------------------------------------- structural: every route is gated

import ast
import pathlib

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_DIR = BACKEND_ROOT / 'app'

PERMISSION_ROUTERS = {'admin_bp': APP_DIR / 'routes' / 'admin_routes.py',
                      'bulk_email_bp': APP_DIR / 'routes' / 'bulk_email_routes.py'}

# Routes that legitimately take no permission gate. Keep this SHORT and justified — this is
# the only automatic tripwire against a new route quietly shipping without one.
PERMISSION_EXEMPT = {
    # Notification-badge count only — no candidate names, no row content, already scoped by
    # company via AdminScope. Gating it would just make the badge silently blank for a
    # narrowly-permissioned admin instead of a deliberate 403 on an actual data view.
    'pending_actions_count',
    # Static reference data: fixed column headers + two invented example rows, reads nothing
    # from the database. Matches admin_routes.py's own scope-exemption for the same reason.
    'download_template',
    # No side effect and returns only per-row pass/fail — the real gate is on /send, which
    # performs the actual account creation and invitation this scope protects.
    'validate_batch',
    'bulk_config',
}


def _permission_routes():
    found = []
    for router_name, path in PERMISSION_ROUTERS.items():
        tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for dec in node.decorator_list:
                if (
                    isinstance(dec, ast.Call)
                    and isinstance(dec.func, ast.Attribute)
                    and isinstance(dec.func.value, ast.Name)
                    and dec.func.value.id == router_name
                ):
                    found.append((node, path))
                    break
    return found


ALL_PERMISSION_ROUTES = [
    pytest.param(fn, path, id=f"{path.stem}::{fn.name}")
    for fn, path in _permission_routes()
]


def test_permission_routes_were_actually_discovered():
    assert len(ALL_PERMISSION_ROUTES) > 30, (
        f"only found {len(ALL_PERMISSION_ROUTES)} routes — is the parser still right?"
    )


@pytest.mark.parametrize('fn,path', ALL_PERMISSION_ROUTES)
def test_every_data_route_declares_a_permission_gate(fn, path):
    if fn.name in PERMISSION_EXEMPT:
        pytest.skip(f"{fn.name} is explicitly exempt")

    src = ast.unparse(fn.args)
    assert 'require_permissions' in src, (
        f"{path.name}::{fn.name} serves admin data/actions but declares no "
        f"require_permissions(...) dependency. Add one naming the closest-fitting "
        f"scope from app.utils.permissions.SCOPES, or add it to PERMISSION_EXEMPT "
        f"with a reason."
    )
