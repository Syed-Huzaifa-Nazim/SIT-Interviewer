"""POST /api/v1/bulk-invites: the API-key path into the Bulk Email Module.

WHY THIS REUSES CODE INSTEAD OF DUPLICATING IT
-----------------------------------------------
An integration hitting this endpoint must end up with EXACTLY the rules an admin filling in
the Bulk Email Module gets: the same CNIC/email dedupe, the same category eligibility, the
same rejection of Resume-Based candidates (their interview needs an uploaded CV, which a
spreadsheet row cannot carry), the same account shape. Writing a second copy of any of that
here would be a second place for it to drift — and the version that drifts is the one that
lets an integration create an account the admin UI would have refused.

So `create_bulk_invite` imports `_validate_rows` and `_process_batch` from
`bulk_email_routes` rather than re-implementing them. These tests pin that it actually does
— an import that quietly gets replaced by a local copy during some future edit is exactly
the kind of change that passes review and drifts later.

THE COMPANY IS NEVER A CHOICE
------------------------------
Unlike the admin route (`/api/admin/bulk-email/send`), which lets an admin holding several
companies pick one per batch, this endpoint pins the batch to `principal.api_key.company_id`
directly. A key is bound to exactly one company for its whole life, so there is nothing to
choose and nothing in the payload that could send a batch somewhere else.
"""

import ast
import pathlib

import pytest
from fastapi import HTTPException

from app.models import User
from app.utils.scope import AdminScope
from app.utils.security import ROLE_ADMIN

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
V1_ROUTES = BACKEND_ROOT / 'app' / 'routes' / 'v1_routes.py'


class FakeUser:
    def __init__(self, id, role=ROLE_ADMIN):
        self.id = id
        self.role = role


class FakeBatch:
    """Stand-in for a BulkEmailBatch row — only the attribute scoping reads."""

    def __init__(self, company_id):
        self.company_id = company_id


ACME, GLOBEX = 1, 2


def acme_scope():
    return AdminScope(FakeUser(id=10), [ACME], is_super=False)


def super_scope():
    return AdminScope(FakeUser(id=1), (), is_super=True)


# ---------------------------------------------------------------------------------------
# AdminScope: the direct-company-column helpers this endpoint relies on
# ---------------------------------------------------------------------------------------

class TestCompanyScoping:
    """BulkEmailBatch carries company_id directly rather than through a user_id
    relationship, so it needs the company_predicate family, not owner_predicate."""

    def test_a_super_admin_filters_nothing(self):
        from app.models import BulkEmailBatch

        assert super_scope().company_predicate(BulkEmailBatch.company_id) is None

    def test_an_admin_with_companies_gets_a_predicate(self):
        from app.models import BulkEmailBatch

        predicate = acme_scope().company_predicate(BulkEmailBatch.company_id)
        assert predicate is not None
        assert 'company_id' in str(predicate)

    def test_no_companies_means_an_explicit_false(self):
        from sqlalchemy.sql.elements import False_
        from app.models import BulkEmailBatch

        empty = AdminScope(FakeUser(id=11), [], is_super=False)
        assert isinstance(empty.company_predicate(BulkEmailBatch.company_id), False_)

    def test_filtering_a_query_leaves_a_super_admins_untouched(self):
        from app.models import BulkEmailBatch

        query = BulkEmailBatch.query
        assert super_scope().filter_by_company(query, BulkEmailBatch.company_id) is query


class TestRequireCompanyOwned:
    def test_a_batch_in_the_keys_company_is_returned(self):
        batch = FakeBatch(company_id=ACME)
        assert acme_scope().require_company_owned(batch) is batch

    def test_a_batch_in_another_company_is_refused_as_404_not_403(self):
        """Same reasoning as require_user: a 403 would confirm the batch id exists,
        turning /bulk-invites/{id} into an oracle for another company's batch count."""
        with pytest.raises(HTTPException) as excinfo:
            acme_scope().require_company_owned(FakeBatch(company_id=GLOBEX))
        assert excinfo.value.status_code == 404

    def test_a_missing_batch_gets_the_same_404(self):
        with pytest.raises(HTTPException) as excinfo:
            acme_scope().require_company_owned(None)
        assert excinfo.value.status_code == 404

    def test_a_super_admin_sees_any_company(self):
        batch = FakeBatch(company_id=GLOBEX)
        assert super_scope().require_company_owned(batch) is batch

    def test_a_batch_with_no_company_is_refused(self):
        """Nothing should produce a company-less batch (see the structural test below),
        but if one ever exists, treating NULL as "visible to everyone" would be the
        exact mistake company scoping exists to prevent."""
        with pytest.raises(HTTPException):
            acme_scope().require_company_owned(FakeBatch(company_id=None))


# ---------------------------------------------------------------------------------------
# Reuse, not duplication
# ---------------------------------------------------------------------------------------

class TestReusesTheAdminBulkLogic:
    def test_it_imports_validation_from_bulk_email_routes_rather_than_redefining_it(self):
        from app.routes import v1_routes
        from app.routes.bulk_email_routes import _validate_rows

        assert v1_routes._bulk_validate_rows is _validate_rows

    def test_it_imports_the_same_background_worker(self):
        """Same function object, not a rewrite — so the account shape (CNIC username, OTP,
        free signup tokens) can never quietly diverge between the admin and API paths."""
        from app.routes import v1_routes
        from app.routes.bulk_email_routes import _process_batch

        assert v1_routes._bulk_process_batch is _process_batch

    def test_it_reuses_the_same_row_cap(self):
        from app.routes import v1_routes
        from app.routes.bulk_email_routes import MAX_ROWS

        assert v1_routes.BULK_MAX_ROWS == MAX_ROWS

    def test_v1_routes_defines_no_second_copy_of_row_validation(self):
        """The failure mode this guards: someone inlines a quick validation check directly
        into create_bulk_invite instead of calling the shared one, and it starts drifting
        from the very next edit to the admin flow."""
        tree = ast.parse(V1_ROUTES.read_text(encoding='utf-8'), filename=str(V1_ROUTES))
        defined_names = {
            node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        suspicious = {n for n in defined_names if 'valid' in n.lower() and 'row' in n.lower()}
        assert not suspicious, f"v1_routes.py defines its own row validator: {suspicious}"


# ---------------------------------------------------------------------------------------
# Structural: the endpoints exist with the right shape
# ---------------------------------------------------------------------------------------

def _route(name):
    tree = ast.parse(V1_ROUTES.read_text(encoding='utf-8'), filename=str(V1_ROUTES))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"no route function named {name} in v1_routes.py")


class TestBulkInviteRouteShape:
    def test_create_and_poll_and_list_all_exist(self):
        for name in ('create_bulk_invite', 'get_bulk_invite', 'list_bulk_invites'):
            _route(name)  # raises if missing

    def test_all_three_require_invites_send(self):
        """The scope decided earlier: reuse invites:send rather than mint a separate
        bulk-only scope, so an existing single-invite key keeps working unmodified."""
        for name in ('create_bulk_invite', 'get_bulk_invite', 'list_bulk_invites'):
            fn = _route(name)
            source = ast.get_source_segment(V1_ROUTES.read_text(encoding='utf-8'), fn)
            assert "require_scopes('invites:send')" in source, (
                f"{name} does not require the invites:send scope"
            )

    def test_the_create_route_sets_company_id_from_the_key_not_the_payload(self):
        """The one thing that must never be a caller-supplied field: which company a batch
        is created under. If `company_id` were read from `data` instead of
        `principal.api_key.company_id`, an integration could target another company's
        candidates outright."""
        fn = _route('create_bulk_invite')
        source = ast.get_source_segment(V1_ROUTES.read_text(encoding='utf-8'), fn)
        assert 'company_id=principal.api_key.company_id' in source.replace(' ', '')
        assert "data.get('company_id')" not in source

    def test_the_create_route_runs_the_worker_on_a_background_thread(self):
        """Sending fifty-plus invites can take minutes; a request held open that long is
        the kind of thing an integration's own HTTP client times out on."""
        fn = _route('create_bulk_invite')
        source = ast.get_source_segment(V1_ROUTES.read_text(encoding='utf-8'), fn)
        assert 'threading.Thread' in source
        assert '.start()' in source
