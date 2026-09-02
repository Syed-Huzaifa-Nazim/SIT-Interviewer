"""Shared permission-scope vocabulary for BOTH an API key (app/utils/api_key.py) and a
company-admin USER account (this module's own ``require_permissions`` dependency).

WHY SHARED
----------
An API key and a company admin reach the same underlying data through the same routes'
data model — a scope name should mean the same thing regardless of which credential is
asking. Two separate scope lists is two places for "candidates:read" to quietly drift
apart, which is exactly the kind of gap a security review exists to catch.

WHY A COMPANY ADMIN NEEDS THIS AT ALL
--------------------------------------
Before this, every admin granted a company got EVERY capability inside it — there was no
way to hand someone read-only access, or access to invites but not deletions. AdminScope
(app/utils/scope.py) answers "which company's ROWS can this admin see"; this module
answers the orthogonal question, "which ACTIONS can this admin take at all". A super admin
is exempt from both — see ``User.has_permission``.
"""

from fastapi import Depends, HTTPException, status

from app.models import User
from app.utils.security import admin_required

# Every scope the system understands, for an API key OR an admin account. Creating either
# with an unknown scope name is refused rather than silently ignored — see the validation
# in superadmin_routes.py (create_admin / update_api_key / grant permissions).
SCOPES = {
    'candidates:read': 'Read candidate records',
    'candidates:write': 'Update candidate profiles',
    'interviews:read': 'Read interviews and reports',
    'interviews:delete': 'Delete interviews',
    'recordings:read': 'Get playback links for session recordings',
    'proctor_snapshots:read': 'Read proctoring images',
    'invites:send': 'Send interview invitations',
    'reinterview:decide': 'Approve or reject second-interview requests',
    'analytics:read': 'Read aggregate scoring analytics',
    'audit:read': 'Read the audit log',
    'transactions:read': 'Read transactions',
}


def require_permissions(*scopes):
    """Build a FastAPI dependency that 403s unless the calling admin holds every scope
    named, exactly like api_key.py's ``require_scopes``.

    Layered ON TOP of ``admin_required`` (which every /api/admin route already depends
    on for its own ``user`` parameter) rather than replacing it — FastAPI caches a
    dependency call by callable+arguments within one request, so this does not cost a
    second lookup. A super admin, and any admin whose ``permissions`` was never
    narrowed (NULL — see User.has_permission), always passes.
    """

    def dependency(user: User = Depends(admin_required)) -> User:
        missing = [s for s in scopes if not user.has_permission(s)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your admin account is missing the required permission(s): {', '.join(missing)}."
            )
        return user

    return dependency
