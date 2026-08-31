"""Company scoping for the Admin Hub.

WHAT THIS IS FOR
----------------
There used to be exactly one admin, so every /api/admin/* endpoint could safely answer
"show me everything". With several admins that is a data leak: one company's admin must not
see another company's candidates, their interviews, their recordings, or their proctoring
snapshots.

`AdminScope` is the single place that decides what "everything" means for the admin making
the request. A super admin gets a scope that filters nothing. An ordinary admin gets one
restricted to the companies granted to them in admin_company_assignments.

WHY EVERYTHING ROUTES THROUGH ONE OBJECT
----------------------------------------
The alternative — writing `.filter(User.company_id.in_(...))` into forty-odd handlers by
hand — leaks the day someone adds the forty-first and forgets. Concentrating it here means
there is one implementation to get right, one place to test, and a dependency whose absence
from a route is mechanically detectable (see tests/test_admin_routes_scoped.py).

CANDIDATES WITH NO COMPANY
--------------------------
Accounts that predate multi-admin have company_id NULL. They are visible to the SUPER ADMIN
ONLY. Showing them to every admin would defeat scoping entirely, and inventing an owner for
them would be a guess written into production data. They stay parked until a super admin
assigns them.

New signups do not join them: `default_company_id` at the bottom of this file is what stops
the unassigned list growing forever, and the reasoning is there.
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy import false

from app.database.db import db
from app.models import User, AdminCompanyAssignment
from app.utils.security import admin_required, ROLE_SUPER_ADMIN


class AdminScope:
    """What one admin is allowed to see. Construct via the `admin_scope` dependency."""

    def __init__(self, admin, company_ids, is_super):
        self.admin = admin
        self.is_super = is_super
        self.company_ids = frozenset(company_ids or ())

    # -- predicates ------------------------------------------------------------------

    def user_predicate(self):
        """A SQLAlchemy condition selecting the users this admin may see.

        ``None`` for a super admin, meaning "no restriction" — callers check for None and
        skip the filter rather than appending a tautology to every query.
        """
        if self.is_super:
            return None
        if not self.company_ids:
            # An admin with no company assigned sees nothing. Note this is `false()` and not
            # an empty IN: SQLAlchemy renders an empty IN as a false constant but warns, and
            # being explicit says the emptiness is intended rather than a bug upstream.
            return false()
        return User.company_id.in_(self.company_ids)

    def owner_predicate(self, owner_column):
        """Condition scoping any table that hangs off a user, via its user_id column.

        Expressed as a correlated subquery instead of loading the id list into Python: the
        candidate set grows without bound, and a 40 000-element IN clause shipped over the
        wire on every admin page load is not a thing to build on purpose.
        """
        if self.is_super:
            return None
        if not self.company_ids:
            return false()
        visible = db.session.query(User.id).filter(User.company_id.in_(self.company_ids))
        return owner_column.in_(visible.scalar_subquery())

    # -- query helpers ---------------------------------------------------------------

    def filter_users(self, query):
        """Restrict a query over User rows to this scope."""
        predicate = self.user_predicate()
        return query if predicate is None else query.filter(predicate)

    def filter_by_owner(self, query, owner_column):
        """Restrict a query over any user-owned table to this scope."""
        predicate = self.owner_predicate(owner_column)
        return query if predicate is None else query.filter(predicate)

    def company_predicate(self, company_id_column):
        """Condition scoping a table that names its company directly (BulkEmailBatch,
        ApiKey), rather than through a user_id relationship.

        Separate from owner_predicate: those tables hang off a candidate and need the
        subquery-through-users dance. A table that already carries company_id needs nothing
        of the sort — filtering it any other way would be indirection for no reason.
        """
        if self.is_super:
            return None
        if not self.company_ids:
            return false()
        return company_id_column.in_(self.company_ids)

    def filter_by_company(self, query, company_id_column):
        """Restrict a query over a directly-company-owned table to this scope."""
        predicate = self.company_predicate(company_id_column)
        return query if predicate is None else query.filter(predicate)

    def require_company_owned(self, record, company_attr='company_id'):
        """Same as require_owned, for a record that names its company directly."""
        if record is None:
            raise HTTPException(status_code=404, detail="Not found")
        if self.is_super:
            return record
        company_id = getattr(record, company_attr, None)
        if company_id is None or company_id not in self.company_ids:
            raise HTTPException(status_code=404, detail="Not found")
        return record

    def actor_predicate(self, actor_column):
        """Condition scoping the audit trail: an admin sees only their own actions.

        Not scoped by company, because a log row is not owned by a company — its `details`
        text names candidates in free form, so a row written by another company's admin can
        carry that company's candidate emails. Filtering on the actor is the only cut that
        is certainly safe. A super admin sees everything, which is the point of the log.
        """
        if self.is_super:
            return None
        return actor_column == self.admin.id

    def filter_by_actor(self, query, actor_column):
        """Restrict a query over admin_logs to this scope."""
        predicate = self.actor_predicate(actor_column)
        return query if predicate is None else query.filter(predicate)

    # -- single-object checks --------------------------------------------------------

    def allows_user(self, target):
        """Whether this admin may act on one specific user row."""
        if target is None:
            return False
        if self.is_super:
            return True
        return target.company_id is not None and target.company_id in self.company_ids

    def require_user(self, target):
        """Return `target`, or raise. Out-of-scope reads as 404, never 403.

        Deliberate: a 403 confirms the row exists, which turns /users/{id} into an oracle
        for enumerating another company's candidate ids. Out of scope and not present are
        the same answer from outside.
        """
        if not self.allows_user(target):
            raise HTTPException(status_code=404, detail="User not found")
        return target

    def require_owned(self, record, owner_attr='user_id'):
        """Same, for a record that belongs to a user (interview, snapshot, submission...)."""
        if record is None:
            raise HTTPException(status_code=404, detail="Not found")
        if self.is_super:
            return record
        owner_id = getattr(record, owner_attr, None)
        owner = User.query.get(owner_id) if owner_id else None
        if not self.allows_user(owner):
            raise HTTPException(status_code=404, detail="Not found")
        return record

    def require_super(self):
        """Guard for actions only a super admin may take from inside an admin route."""
        if not self.is_super:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a super administrator can do this."
            )


def build_scope(admin) -> AdminScope:
    """The scope belonging to one admin row.

    Separate from the dependency below so code that already holds a User — an endpoint
    outside /api/admin that happens to grant admins wider access, such as the shared
    interview-report route — can apply the same rule instead of inventing its own.
    """
    if admin.role == ROLE_SUPER_ADMIN:
        return AdminScope(admin, (), is_super=True)

    company_ids = [
        row.company_id
        for row in AdminCompanyAssignment.query.filter_by(admin_user_id=admin.id).all()
    ]
    return AdminScope(admin, company_ids, is_super=False)


def admin_scope(admin: User = Depends(admin_required)) -> AdminScope:
    """Dependency: the calling admin's scope. Use this on every /api/admin/* route."""
    return build_scope(admin)


def default_company_id():
    """The company a PUBLIC signup belongs to, or None.

    Somebody enrolling through the signup form chooses a course category, not a company —
    they have no idea companies exist. Without this every organic signup would be created
    with company_id NULL: invisible to every admin, sitting in the super admin's unassigned
    list, and growing there indefinitely while the admin who should be inviting them to
    interview never sees them at all.

    None is a valid answer and the pre-multi-admin behaviour: on a database with no default
    set, signups land unassigned exactly as they did before, for a super admin to place.
    """
    from app.models import Company

    company = Company.query.filter(
        Company.is_default.is_(True), Company.status != 'archived'
    ).first()
    return company.id if company else None
