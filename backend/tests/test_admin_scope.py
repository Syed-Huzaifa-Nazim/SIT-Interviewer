"""AdminScope: what one admin is allowed to see.

WHY THIS MATTERS MORE THAN THE USUAL TEST
-----------------------------------------
Until now there was exactly one admin, so every /api/admin/* endpoint could safely answer
"everything". Multi-admin turns that same behaviour into a data leak between companies —
candidates, interviews, recordings, proctoring images. AdminScope is the single object that
decides the cut, so a mistake in it is a leak on forty-odd endpoints at once, and a mistake
in the direction of "too permissive" is silent: every page still loads, it just shows rows
it should not.

These tests pin both directions. The permissive direction (a super admin filters nothing,
an admin sees their own companies) is what makes the portal work at all. The restrictive
direction — an unassigned candidate, an admin with no companies, a company the admin does
not hold — is what makes it safe, and it is the half that fails quietly.

No database is touched: predicates are SQLAlchemy expression objects, which are built
without connecting, and the object checks work on plain stand-ins. The suite has a hard
guard against real connections (see conftest).
"""

import pytest
from sqlalchemy.sql.elements import False_

from app.utils.scope import AdminScope
from app.utils.security import ROLE_ADMIN, ROLE_SUPER_ADMIN
from app.models import User, Interview, AdminLog


class FakeUser:
    """Stand-in for a User row. Only the three attributes scoping reads."""

    def __init__(self, id, company_id=None, role='candidate'):
        self.id = id
        self.company_id = company_id
        self.role = role


ACME, GLOBEX = 1, 2

ACME_ADMIN = FakeUser(id=10, role=ROLE_ADMIN)
SUPER = FakeUser(id=1, role=ROLE_SUPER_ADMIN)


def acme_scope():
    return AdminScope(ACME_ADMIN, [ACME], is_super=False)


def super_scope():
    return AdminScope(SUPER, (), is_super=True)


def empty_scope():
    """An admin who exists but has been granted no company yet."""
    return AdminScope(FakeUser(id=11, role=ROLE_ADMIN), [], is_super=False)


class TestSuperAdminSeesEverything:
    """A None predicate means "add no filter". Returning a filter that merely happens to
    match everything would silently exclude rows with a NULL company_id."""

    def test_the_user_predicate_is_none(self):
        assert super_scope().user_predicate() is None

    def test_the_owner_predicate_is_none(self):
        assert super_scope().owner_predicate(Interview.user_id) is None

    def test_the_actor_predicate_is_none(self):
        assert super_scope().actor_predicate(AdminLog.admin_id) is None

    def test_filtering_a_query_leaves_it_untouched(self):
        query = User.query
        assert super_scope().filter_users(query) is query


class TestAdminWithCompanies:
    def test_a_predicate_is_produced(self):
        assert acme_scope().user_predicate() is not None

    def test_the_predicate_names_the_company_column(self):
        assert 'company_id' in str(acme_scope().user_predicate())

    def test_the_owner_predicate_is_a_subquery_not_an_id_list(self):
        """A materialised IN list grows with the candidate table and is shipped on every
        admin page load. It must stay a subquery."""
        rendered = str(acme_scope().owner_predicate(Interview.user_id))
        assert 'SELECT' in rendered.upper()

    def test_the_actor_predicate_matches_only_this_admin(self):
        rendered = str(acme_scope().actor_predicate(AdminLog.admin_id))
        assert 'admin_logs.admin_id' in rendered


class TestAdminWithNoCompanies:
    """Granting nothing must mean seeing nothing — the failure everyone gets backwards."""

    @pytest.mark.parametrize('build', [
        lambda s: s.user_predicate(),
        lambda s: s.owner_predicate(Interview.user_id),
    ])
    def test_the_predicate_is_an_explicit_false(self, build):
        assert isinstance(build(empty_scope()), False_)

    def test_no_user_is_allowed(self):
        assert empty_scope().allows_user(FakeUser(id=99, company_id=ACME)) is False


class TestAllowsUser:
    def test_a_candidate_in_the_admins_company_is_allowed(self):
        assert acme_scope().allows_user(FakeUser(id=5, company_id=ACME)) is True

    def test_a_candidate_in_another_company_is_refused(self):
        assert acme_scope().allows_user(FakeUser(id=6, company_id=GLOBEX)) is False

    def test_a_candidate_with_no_company_is_refused(self):
        """Every account predating multi-admin has company_id NULL. Treating NULL as
        "anyone may see it" would hand the entire existing candidate base to the first
        admin created — the exact opposite of what scoping is for."""
        assert acme_scope().allows_user(FakeUser(id=7, company_id=None)) is False

    def test_a_candidate_with_no_company_is_allowed_for_the_super_admin(self):
        """...but they must remain reachable by someone, or they can never be assigned."""
        assert super_scope().allows_user(FakeUser(id=7, company_id=None)) is True

    def test_a_missing_row_is_refused_rather_than_crashing(self):
        """Callers pass the result of User.query.get(), which is None for a deleted id."""
        assert acme_scope().allows_user(None) is False
        assert super_scope().allows_user(None) is False


class TestRequireUser:
    def test_an_in_scope_user_is_returned(self):
        target = FakeUser(id=5, company_id=ACME)
        assert acme_scope().require_user(target) is target

    def test_an_out_of_scope_user_raises_404_not_403(self):
        """A 403 confirms the row exists, which turns /users/{id} into an oracle for
        enumerating another company's candidate ids by walking the integers."""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            acme_scope().require_user(FakeUser(id=6, company_id=GLOBEX))
        assert excinfo.value.status_code == 404

    def test_a_missing_user_raises_the_same_404(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            acme_scope().require_user(None)
        assert excinfo.value.status_code == 404


class TestRequireSuper:
    def test_a_super_admin_passes(self):
        super_scope().require_super()  # must not raise

    def test_an_ordinary_admin_is_refused(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            acme_scope().require_super()
        assert excinfo.value.status_code == 403


class TestConstruction:
    def test_company_ids_are_frozen(self):
        """The scope is built once per request and read by many helpers; a mutable set
        invites one of them to narrow or widen it as a side effect."""
        scope = acme_scope()
        assert isinstance(scope.company_ids, frozenset)

    def test_none_company_ids_becomes_empty_rather_than_raising(self):
        scope = AdminScope(ACME_ADMIN, None, is_super=False)
        assert scope.company_ids == frozenset()


class TestDefaultCompanyIsWiredIntoSignup:
    """Where a PUBLIC signup lands.

    Somebody enrolling through the signup form picks a course category, not a company. Before
    `default_company_id` existed, every organic signup was created with company_id NULL, which
    means invisible to every admin and parked in the super admin's unassigned list — a list
    that would then grow with every new candidate, forever, while the admin who should be
    inviting them to interview never saw them at all.

    The function itself needs a database, so what is pinned here is the wiring: that the
    signup route reads it, and that it is applied to the account being created rather than
    computed and dropped. A regression there is silent — signup keeps working perfectly, the
    candidate simply never appears for their admin.
    """

    def _signup_source(self):
        import pathlib
        path = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'routes' / 'auth_routes.py'
        return path.read_text(encoding='utf-8')

    def test_the_signup_route_imports_it(self):
        assert 'from app.utils.scope import default_company_id' in self._signup_source()

    def test_the_created_user_is_given_a_company(self):
        source = self._signup_source()
        assert 'company_id=default_company_id()' in source, (
            "auth_routes creates the signup User without company_id, so every organic "
            "signup lands unassigned and no admin ever sees it."
        )

    def test_it_is_exported_from_the_scope_module(self):
        from app.utils import scope

        assert callable(scope.default_company_id)
