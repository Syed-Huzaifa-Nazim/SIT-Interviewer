"""The super admin's management surface: companies, admins, and who may see whom.

Kept in its own router, behind its own sign-in, because these endpoints are the ones that
can hand somebody else access to candidate data. Nothing here is reachable with an ordinary
admin session — see `super_admin_required` for why the role alone is not enough.

Every route is `def`, not `async def`, like the rest of the app (see app/__init__.py).
"""

import datetime
import re
import secrets

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func

from app.config.config import Config
from app.database.db import db
from app.models import User, Token, Company, AdminCompanyAssignment, AdminLog, ApiKey
from app.email import EmailService
from app.email import templates as email_templates
from app.utils.candidate import generate_otp, SIGNUP_CATEGORIES
from app.utils.api_key import SCOPES, generate_key
from app.utils.security import (
    create_access_token, super_admin_required,
    create_superadmin_challenge, decode_superadmin_challenge,
    ROLE_ADMIN, ROLE_SUPER_ADMIN, ADMIN_ROLES, SUPERADMIN_CLAIM,
    SUPERADMIN_CHALLENGE_MINUTES,
)

superadmin_bp = APIRouter()

EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

# Shorter than the 12h candidate/admin session on purpose: this token can create admins and
# move candidates between companies, so an unattended tab is a bigger liability here.
SUPERADMIN_SESSION_HOURS = 4

# Long rather than "complex". This account can read every candidate in its companies, and
# it is never typed from memory — it is emailed once and then replaced.
MIN_ADMIN_PASSWORD_LENGTH = 12

# Domain for GENERATED admin login identities. Deliberately not a mailbox anyone reads: the
# login address is an identity, and the person's real address lives in contact_email. Kept
# consistent with the seeded ADMIN_EMAIL so every admin identity looks alike.
ADMIN_LOGIN_DOMAIN = 'interviewer.com'

# Enough that losing one is not a crisis, few enough to be printed and kept on paper.
RECOVERY_CODE_COUNT = 8

# Unambiguous alphabet: no O/0, I/1, S/5. These are read off a screen or a printout and
# typed back, and a code that fails because of a misread character is indistinguishable
# from a wrong one at exactly the moment somebody is already locked out.
_RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789'


def _recovery_code():
    """One code, shown as XXXXX-XXXXX. Stored without the dash."""
    raw = ''.join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
    return f'{raw[:5]}-{raw[5:]}'


def _mask_email(address):
    """a****@example.com — confirms which mailbox to open without printing it in full to
    whoever is holding a stolen password."""
    if not address or '@' not in address:
        return ''
    local, _, domain = address.partition('@')
    head = local[0] if local else ''
    return f"{head}{'*' * max(len(local) - 1, 1)}@{domain}"


def _audit(actor, action, details):
    """Audit row for a management action, stamped with the role the actor held at the time."""
    db.session.add(AdminLog(
        admin_id=actor.id,
        action=action,
        details=details,
        actor_role=actor.role,
    ))


def _slugify(name):
    slug = re.sub(r'[^a-z0-9]+', '-', (name or '').strip().lower()).strip('-')
    return slug[:80]


def _unique_slug(name):
    """A slug nothing else is using. Companies are picked from a dropdown by name, so two
    rows that collapse to the same handle are a support problem waiting to happen."""
    base = _slugify(name) or 'company'
    slug = base
    n = 2
    while Company.query.filter_by(slug=slug).first():
        suffix = f'-{n}'
        slug = f'{base[:80 - len(suffix)]}{suffix}'
        n += 1
    return slug


# ---------------------------------------------------------------------------------------
# Sign-in
# ---------------------------------------------------------------------------------------

def _issue_session(user, client_ip, how):
    """Mint the management token and record the sign-in. The one place a session is born."""
    token = create_access_token(
        user.id,
        expires_delta=datetime.timedelta(hours=SUPERADMIN_SESSION_HOURS),
        extra_claims={SUPERADMIN_CLAIM: True},
    )
    _audit(user, 'SUPERADMIN_LOGIN', f"Super admin signed in from {client_ip} ({how}).")
    return token


@superadmin_bp.post('/login')
def superadmin_login(request: Request, payload: dict = Body(default=None)):
    """Step one of the super-admin sign-in: password, then a code by email.

    This endpoint NEVER returns a session. A correct password only earns a challenge — the
    token minted here proves the first factor passed and is signed with a different key so
    it cannot be used as a session in its own right (see create_superadmin_challenge).

    Reuses the ordinary login throttle rather than counting failures separately: an attacker
    given a fresh, uncounted allowance of attempts against the highest-privilege account on
    the system would make the throttle on /auth/login pointless.
    """
    from app.routes.auth_routes import (
        _check_login_throttle, _record_login_failure, _clear_login_failures,
    )

    data = payload or {}
    email = (data.get('email') or '').strip()
    password = data.get('password')
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    client_ip = request.client.host if request.client else 'unknown'
    _check_login_throttle(client_ip, email)

    user = User.query.filter_by(email=email).first()

    # One error for every failure mode below. Distinguishing "no such account" from "not a
    # super admin" would tell an attacker which address to spend their attempts on.
    invalid = HTTPException(status_code=401, detail="Invalid credentials.")

    if not user or user.role != ROLE_SUPER_ADMIN or not user.check_password(password):
        _record_login_failure(client_ip, email)
        raise invalid

    _clear_login_failures(client_ip, email)

    otp = generate_otp()
    user.set_login_otp(otp, ttl_minutes=SUPERADMIN_CHALLENGE_MINUTES)
    db.session.commit()

    # The code goes to the human's real address, which for a generated login identity is not
    # the address they signed in with.
    subject, html = email_templates.superadmin_login_code(
        user.name, otp, ttl_minutes=SUPERADMIN_CHALLENGE_MINUTES
    )
    EmailService.send(
        user.contact_email or user.email, subject, html,
        email_type='superadmin_login_code', user_id=user.id,
    )

    return {
        'twofactor_required': True,
        'challenge': create_superadmin_challenge(user.id),
        # Enough to confirm the code went somewhere they can reach, without printing an
        # address to whoever is holding the password.
        'sent_to': _mask_email(user.contact_email or user.email),
        'expires_in_minutes': SUPERADMIN_CHALLENGE_MINUTES,
        'recovery_available': user.recovery_codes_remaining() > 0,
    }


@superadmin_bp.post('/login/verify')
def superadmin_login_verify(request: Request, payload: dict = Body(default=None)):
    """Step two: the emailed code, or one recovery code in its place."""
    from app.routes.auth_routes import (
        _check_login_throttle, _record_login_failure, _clear_login_failures,
    )

    data = payload or {}
    challenge = data.get('challenge')
    code = (data.get('code') or '').strip()
    recovery_code = (data.get('recovery_code') or '').strip()

    if not code and not recovery_code:
        raise HTTPException(status_code=400, detail="Enter the code from your email.")

    user_id = decode_superadmin_challenge(challenge)
    user = User.query.get(user_id)
    if not user or user.role != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=401, detail="Start the sign-in again.")

    client_ip = request.client.host if request.client else 'unknown'
    # Throttled on the account, not just the password step. Six digits is 1,000,000
    # possibilities and an unthrottled verify endpoint would walk them in minutes, which
    # would make the second factor decorative.
    _check_login_throttle(client_ip, user.email)

    if recovery_code:
        if not user.consume_recovery_code(recovery_code):
            _record_login_failure(client_ip, user.email)
            db.session.rollback()
            raise HTTPException(status_code=401, detail="That code is not valid.")
        used_what = 'recovery code'
        remaining = user.recovery_codes_remaining()
    else:
        if not user.check_login_otp(code):
            _record_login_failure(client_ip, user.email)
            raise HTTPException(
                status_code=401,
                detail="That code is not valid or has expired."
            )
        used_what = 'emailed code'
        remaining = None

    # Consumed either way: a code that still works after it has been used is a password.
    user.clear_login_otp()
    _clear_login_failures(client_ip, user.email)

    token = _issue_session(user, client_ip, used_what)
    if remaining is not None:
        _audit(user, 'SUPERADMIN_RECOVERY_CODE_USED',
               f"Signed in with a recovery code from {client_ip}. {remaining} remaining.")
    db.session.commit()

    return {
        'access_token': token,
        'user': user.to_dict(),
        'recovery_codes_remaining': user.recovery_codes_remaining(),
    }


@superadmin_bp.post('/recovery-codes/regenerate')
def regenerate_recovery_codes(user: User = Depends(super_admin_required)):
    """Issue a fresh set, invalidating every previous one.

    Returned in PLAINTEXT exactly once, here. Only hashes are stored, so this response is
    the only chance to keep them — which is also why regenerating is the only way to recover
    a lost set.
    """
    codes = [_recovery_code() for _ in range(RECOVERY_CODE_COUNT)]
    user.set_recovery_codes([c.replace('-', '') for c in codes])
    _audit(user, 'SUPERADMIN_RECOVERY_CODES_REGENERATED',
           f"Issued {len(codes)} new recovery codes; all previous codes invalidated.")
    db.session.commit()
    return {'codes': codes}


@superadmin_bp.get('/me')
def superadmin_me(user: User = Depends(super_admin_required)):
    return user.to_dict()


# ---------------------------------------------------------------------------------------
# Companies
# ---------------------------------------------------------------------------------------

@superadmin_bp.get('/companies')
def list_companies(user: User = Depends(super_admin_required)):
    """Every company, with how many admins and candidates each holds."""
    companies = Company.query.order_by(Company.name.asc()).all()

    # Two grouped queries rather than two per company: this list is small today and the
    # per-row version would quietly become 2N round trips at Singapore-to-Supabase latency.
    admin_counts = dict(
        db.session.query(
            AdminCompanyAssignment.company_id, func.count(AdminCompanyAssignment.id)
        ).group_by(AdminCompanyAssignment.company_id).all()
    )
    candidate_counts = dict(
        db.session.query(User.company_id, func.count(User.id))
        .filter(User.company_id.isnot(None), User.role.notin_(ADMIN_ROLES))
        .group_by(User.company_id).all()
    )

    out = []
    for c in companies:
        row = c.to_dict()
        row['admin_count'] = admin_counts.get(c.id, 0)
        row['candidate_count'] = candidate_counts.get(c.id, 0)
        out.append(row)
    return out


@superadmin_bp.post('/companies')
def create_company(payload: dict = Body(default=None), user: User = Depends(super_admin_required)):
    data = payload or {}
    name = (data.get('name') or '').strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    if len(name) > 150:
        raise HTTPException(status_code=400, detail="Company name is too long (max 150 characters)")

    # Optional. Omitted/null means every interview type — the same unrestricted default
    # every company that existed before this feature keeps (confirmed decision).
    allowed_interview_types = data.get('allowed_interview_types', None)
    if allowed_interview_types is not None:
        if not isinstance(allowed_interview_types, list):
            raise HTTPException(status_code=400, detail="allowed_interview_types must be a list")
        unknown = [c for c in allowed_interview_types if c not in SIGNUP_CATEGORIES]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown interview type(s): {', '.join(unknown)}")

    company = Company(name=name, slug=_unique_slug(name), status='active', created_by=user.id)
    company.set_allowed_interview_types(allowed_interview_types)
    db.session.add(company)
    db.session.flush()
    access_note = 'every interview type' if allowed_interview_types is None else (', '.join(sorted(allowed_interview_types)) or 'none')
    _audit(user, 'COMPANY_CREATED', f"Created company '{name}' (id {company.id}). Interview access: {access_note}.")
    db.session.commit()
    return company.to_dict()


@superadmin_bp.put('/companies/{company_id}')
def update_company(company_id: int, payload: dict = Body(default=None),
                   user: User = Depends(super_admin_required)):
    """Rename or archive. There is deliberately no delete.

    Deleting a company would either orphan its candidates or cascade real interview records
    away, and neither belongs behind a single button. Archiving hides it from new
    assignments while every existing record stays exactly where it is.
    """
    company = Company.query.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    data = payload or {}
    changes = []

    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            raise HTTPException(status_code=400, detail="Company name cannot be empty")
        if name != company.name:
            changes.append(f"name '{company.name}' -> '{name}'")
            company.name = name

    if 'status' in data:
        new_status = (data.get('status') or '').strip().lower()
        if new_status not in ('active', 'archived'):
            raise HTTPException(status_code=400, detail="Status must be 'active' or 'archived'")
        if new_status != (company.status or 'active'):
            changes.append(f"status '{company.status}' -> '{new_status}'")
            company.status = new_status
        if new_status == 'archived' and company.is_default:
            # An archived company must not keep receiving new signups. Clearing the flag
            # sends them back to the unassigned list, which is visible and worked down,
            # rather than into a company nobody is looking at.
            company.is_default = False
            changes.append('cleared default (archived)')

    if 'is_default' in data:
        make_default = bool(data.get('is_default'))
        if make_default:
            if (company.status or 'active') != 'active':
                raise HTTPException(
                    status_code=400,
                    detail="An archived company cannot receive new signups."
                )
            # Exactly one default. Two would make where a signup lands depend on row order,
            # which is the kind of thing that is only noticed months later from the wrong
            # company's candidate list.
            Company.query.filter(
                Company.id != company.id, Company.is_default.is_(True)
            ).update({'is_default': False}, synchronize_session=False)
        if bool(company.is_default) != make_default:
            changes.append(f"default {bool(company.is_default)} -> {make_default}")
            company.is_default = make_default

    if 'allowed_interview_types' in data:
        # Present-but-null clears the restriction back to every type — an admin must say so
        # explicitly (this is a PUT field, not silently omitted), same rule as the admin-
        # permissions PUT endpoint's own 'permissions' field.
        allowed = data['allowed_interview_types']
        if allowed is not None:
            if not isinstance(allowed, list):
                raise HTTPException(status_code=400, detail="allowed_interview_types must be a list or null")
            unknown = [c for c in allowed if c not in SIGNUP_CATEGORIES]
            if unknown:
                raise HTTPException(status_code=400, detail=f"Unknown interview type(s): {', '.join(unknown)}")
        before = company.allowed_interview_types_list()
        company.set_allowed_interview_types(allowed)
        after = company.allowed_interview_types_list()
        if before != after:
            before_note = 'every type' if before is None else (', '.join(before) or 'none')
            after_note = 'every type' if after is None else (', '.join(after) or 'none')
            changes.append(f"interview access '{before_note}' -> '{after_note}'")

    if changes:
        _audit(user, 'COMPANY_UPDATED', f"Company {company.id}: " + ', '.join(changes))
    db.session.commit()
    return company.to_dict()


# ---------------------------------------------------------------------------------------
# Admins
# ---------------------------------------------------------------------------------------

@superadmin_bp.get('/admins')
def list_admins(user: User = Depends(super_admin_required)):
    """Every admin and super admin, each with the companies granted to them."""
    admins = User.query.filter(User.role.in_(ADMIN_ROLES)).order_by(User.created_at.asc()).all()

    assignments_by_admin = {}
    if admins:
        rows = AdminCompanyAssignment.query.filter(
            AdminCompanyAssignment.admin_user_id.in_([u.id for u in admins])
        ).all()
        for a in rows:
            assignments_by_admin.setdefault(a.admin_user_id, []).append(a)

    out = []
    for a in admins:
        row = a.to_dict()
        row['companies'] = [x.to_dict() for x in assignments_by_admin.get(a.id, [])]
        out.append(row)
    return out


def _generated_login_email(name):
    """A login identity nobody types by hand.

    The address is an IDENTITY, not a mailbox — mail for this person goes to contact_email.
    Generating it removes a class of mistake that is invisible until it matters: a
    mistyped login address still creates a working account, and the person simply cannot
    sign in with the address they were given, which reads as a broken system.
    """
    base = re.sub(r'[^a-z0-9]+', '.', (name or '').strip().lower()).strip('.') or 'admin'
    base = base[:40]
    candidate = f'{base}@{ADMIN_LOGIN_DOMAIN}'
    n = 2
    while User.query.filter_by(email=candidate).first():
        candidate = f'{base}{n}@{ADMIN_LOGIN_DOMAIN}'
        n += 1
    return candidate


def _generated_password():
    """A password the person never chose and will replace on first sign-in.

    token_urlsafe rather than a human-friendly pattern: it is copied out of an email once,
    used once, and then discarded, so there is no reason to trade entropy for readability.
    """
    return secrets.token_urlsafe(18)


@superadmin_bp.post('/admins')
def create_admin(payload: dict = Body(default=None), user: User = Depends(super_admin_required)):
    """Create an ordinary admin, mail them their credentials, and grant companies.

    The super admin supplies a name, the person's REAL email, and which companies they get.
    The login address and the password are both generated here — neither is chosen or typed
    by whoever fills the form. The password is returned once, so it can be read out if the
    email does not arrive, and the account cannot be used for anything until it is replaced.
    """
    data = payload or {}
    name = (data.get('name') or '').strip()
    contact_email = (data.get('contact_email') or data.get('email') or '').strip().lower()
    company_ids = data.get('company_ids') or []
    # Optional. Omitted (key absent, or null) means "no restriction" — the same full access
    # every admin has always had. Present means the super admin made a deliberate choice,
    # even if that choice is an empty list (zero permissions granted).
    permissions = data.get('permissions', None)

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not re.match(EMAIL_REGEX, contact_email or ''):
        raise HTTPException(
            status_code=400,
            detail="A valid contact email is required — it is where the credentials are sent."
        )

    email = _generated_login_email(name)
    password = _generated_password()

    if not isinstance(company_ids, list):
        raise HTTPException(status_code=400, detail="company_ids must be a list")
    companies = []
    for cid in company_ids:
        company = Company.query.get(cid)
        if not company:
            raise HTTPException(status_code=404, detail=f"Company {cid} not found")
        companies.append(company)

    if permissions is not None:
        if not isinstance(permissions, list):
            raise HTTPException(status_code=400, detail="permissions must be a list")
        unknown = [p for p in permissions if p not in SCOPES]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown permission(s): {', '.join(unknown)}")

    admin = User(
        name=name,
        email=email,
        contact_email=contact_email,
        role=ROLE_ADMIN,
        country=user.country,
        experience_level='Senior',
        job_role='Administrator',
    )
    admin.set_password(password)
    # The generated password is a credential sitting in an inbox until it is replaced, so
    # the account can do nothing else until it is (enforced in admin_required).
    admin.must_change_password = True
    admin.set_permissions(permissions)
    db.session.add(admin)
    db.session.flush()

    # Every other account in this system has a token row, and admin code paths read it
    # without checking — creating one without it would fail somewhere unrelated later.
    db.session.add(Token(user_id=admin.id, tokens_available=999))

    for company in companies:
        db.session.add(AdminCompanyAssignment(
            admin_user_id=admin.id, company_id=company.id, created_by=user.id
        ))

    granted = ', '.join(c.name for c in companies) or 'none'
    perm_note = ('full access' if permissions is None
                 else (', '.join(sorted(permissions)) or 'none'))
    # The password is never written to the audit trail — the log is readable by this account
    # forever, and a credential recorded there outlives every rotation.
    _audit(user, 'ADMIN_CREATED',
           f"Created admin {email} (id {admin.id}) for {contact_email}. Companies: {granted}. "
           f"Permissions: {perm_note}.")
    db.session.commit()

    subject, html = email_templates.admin_account_created(
        name=name, login_email=email, password=password,
        portal_url=Config.APP_BASE_URL + '/admin',
    )
    EmailService.send(
        contact_email, subject, html,
        email_type='admin_account_created', user_id=admin.id,
    )

    return {
        'admin': admin.to_dict(),
        'companies': [c.to_dict() for c in companies],
        'login_email': email,
        # Returned ONCE. Delivery can fail — this system's email_logs prove it — and an
        # admin account nobody can sign into is not recoverable without a password reset
        # flow that does not exist yet.
        'password': password,
        'emailed_to': contact_email,
    }


@superadmin_bp.post('/admins/{admin_id}/companies')
def grant_company(admin_id: int, payload: dict = Body(default=None),
                  user: User = Depends(super_admin_required)):
    """Grant one company to one admin."""
    target = User.query.get(admin_id)
    if not target or target.role not in ADMIN_ROLES:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target.role == ROLE_SUPER_ADMIN:
        # A super admin already sees everything; a row here would imply their access is
        # narrower than it is, which is exactly the sort of thing an audit gets wrong.
        raise HTTPException(
            status_code=400,
            detail="A super admin already has access to every company."
        )

    company_id = (payload or {}).get('company_id')
    company = Company.query.get(company_id) if company_id else None
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if (company.status or 'active') != 'active':
        raise HTTPException(status_code=400, detail="That company is archived")

    existing = AdminCompanyAssignment.query.filter_by(
        admin_user_id=target.id, company_id=company.id
    ).first()
    if existing:
        return existing.to_dict()

    assignment = AdminCompanyAssignment(
        admin_user_id=target.id, company_id=company.id, created_by=user.id
    )
    db.session.add(assignment)
    _audit(user, 'ADMIN_COMPANY_GRANTED',
           f"Granted '{company.name}' (id {company.id}) to admin {target.email} (id {target.id}).")
    db.session.commit()
    return assignment.to_dict()


@superadmin_bp.delete('/admins/{admin_id}/companies/{company_id}')
def revoke_company(admin_id: int, company_id: int, user: User = Depends(super_admin_required)):
    """Revoke one company from one admin. The admin account itself is untouched."""
    assignment = AdminCompanyAssignment.query.filter_by(
        admin_user_id=admin_id, company_id=company_id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="That admin does not have this company")

    company = Company.query.get(company_id)
    target = User.query.get(admin_id)
    db.session.delete(assignment)
    _audit(user, 'ADMIN_COMPANY_REVOKED',
           f"Revoked '{company.name if company else company_id}' from admin "
           f"{target.email if target else admin_id} (id {admin_id}).")
    db.session.commit()
    return {'message': 'Access revoked'}


@superadmin_bp.post('/admins/{admin_id}/revoke-sessions')
def revoke_admin_sessions(admin_id: int, user: User = Depends(super_admin_required)):
    """Force an admin's live sessions to end immediately.

    Revoking a company grant does NOT need this — scope is read fresh from the database on
    every request, so a revoke takes effect at once. This is for the harder case: an admin
    who should be out of the system entirely, right now.
    """
    target = User.query.get(admin_id)
    if not target or target.role not in ADMIN_ROLES:
        raise HTTPException(status_code=404, detail="Admin not found")

    target.session_revoked_at = datetime.datetime.utcnow().replace(microsecond=0)
    _audit(user, 'ADMIN_SESSIONS_REVOKED',
           f"Revoked all live sessions for {target.email} (id {target.id}).")
    db.session.commit()
    return {'message': 'Sessions revoked'}


@superadmin_bp.put('/admins/{admin_id}/permissions')
def update_admin_permissions(admin_id: int, payload: dict = Body(default=None),
                             user: User = Depends(super_admin_required)):
    """Narrow (or widen, or clear) one admin's permissions — see User.has_permission.

    Takes effect on the admin's very next request, same as a company grant: nothing about
    it is cached in their session token, so there is no separate "apply now" step and no
    window where a just-revoked permission still works.
    """
    target = User.query.get(admin_id)
    if not target or target.role not in ADMIN_ROLES:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target.role == ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="A super admin is never restricted by permissions.")

    data = payload or {}
    # 'permissions' explicitly absent from the body is refused rather than silently treated
    # as "clear it" — a caller must say null on purpose to widen an admin back to full access.
    if 'permissions' not in data:
        raise HTTPException(status_code=400, detail="permissions is required (a list, or null to clear).")
    permissions = data['permissions']
    if permissions is not None:
        if not isinstance(permissions, list):
            raise HTTPException(status_code=400, detail="permissions must be a list or null")
        unknown = [p for p in permissions if p not in SCOPES]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown permission(s): {', '.join(unknown)}")

    before = target.permission_list()
    target.set_permissions(permissions)
    after = target.permission_list()
    if before != after:
        before_note = 'full access' if before is None else (', '.join(before) or 'none')
        after_note = 'full access' if after is None else (', '.join(after) or 'none')
        _audit(user, 'ADMIN_PERMISSIONS_UPDATED',
               f"{target.email} (id {target.id}): permissions {before_note} -> {after_note}.")
    db.session.commit()
    return {'admin': target.to_dict()}


# ---------------------------------------------------------------------------------------
# Candidate assignment
# ---------------------------------------------------------------------------------------

@superadmin_bp.get('/unassigned-users')
def list_unassigned_users(user: User = Depends(super_admin_required)):
    """Candidates with no company — every account that predates multi-admin.

    Nobody but the super admin can see these, so this list is the only route by which they
    ever reach an admin. It is meant to be worked down to empty.
    """
    users = (
        User.query
        .filter(User.company_id.is_(None), User.role.notin_(ADMIN_ROLES))
        .order_by(User.created_at.desc())
        .all()
    )
    return [u.to_dict() for u in users]


@superadmin_bp.put('/users/{target_user_id}/company')
def assign_user_company(target_user_id: int, payload: dict = Body(default=None),
                        user: User = Depends(super_admin_required)):
    """Move one candidate into a company (or back out of one, with company_id null)."""
    target = User.query.get(target_user_id)
    if not target or target.role in ADMIN_ROLES:
        raise HTTPException(status_code=404, detail="User not found")

    company_id = (payload or {}).get('company_id')
    if company_id is None:
        previous = target.company_id
        target.company_id = None
        _audit(user, 'USER_COMPANY_CLEARED',
               f"Removed {target.email} (id {target.id}) from company {previous}.")
    else:
        company = Company.query.get(company_id)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        previous = target.company_id
        target.company_id = company.id
        _audit(user, 'USER_COMPANY_ASSIGNED',
               f"Moved {target.email} (id {target.id}) from company {previous} to "
               f"'{company.name}' (id {company.id}).")

    db.session.commit()
    return target.to_dict()


@superadmin_bp.post('/users/bulk-assign-company')
def bulk_assign_company(payload: dict = Body(default=None),
                        user: User = Depends(super_admin_required)):
    """Assign many candidates to one company at once.

    The unassigned backlog is a few dozen rows today; doing that one PUT at a time is how a
    migration step gets abandoned half-finished.
    """
    data = payload or {}
    user_ids = data.get('user_ids') or []
    company_id = data.get('company_id')

    if not isinstance(user_ids, list) or not user_ids:
        raise HTTPException(status_code=400, detail="user_ids must be a non-empty list")
    company = Company.query.get(company_id) if company_id else None
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    targets = User.query.filter(
        User.id.in_(user_ids), User.role.notin_(ADMIN_ROLES)
    ).all()
    for t in targets:
        t.company_id = company.id

    _audit(user, 'USER_COMPANY_BULK_ASSIGNED',
           f"Moved {len(targets)} candidate(s) into '{company.name}' (id {company.id}).")
    db.session.commit()
    return {'moved': len(targets), 'company': company.to_dict()}


# ---------------------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------------------

@superadmin_bp.get('/api-scopes')
def list_api_scopes(user: User = Depends(super_admin_required)):
    """Every scope a key can be given, straight from the server's own table so the form and
    the validator can never drift apart."""
    return [{'scope': k, 'description': v} for k, v in sorted(SCOPES.items())]


@superadmin_bp.get('/api-keys')
def list_api_keys(user: User = Depends(super_admin_required)):
    """Every key, including revoked and expired ones.

    Revoked keys stay listed rather than disappearing: the audit trail refers to them, and a
    key that vanishes from the list is one nobody can look up when an old entry names it.
    """
    keys = ApiKey.query.order_by(ApiKey.created_at.desc()).all()
    return [k.to_dict() for k in keys]


@superadmin_bp.post('/api-keys')
def create_api_key(payload: dict = Body(default=None), user: User = Depends(super_admin_required)):
    """Mint a key. The secret is returned exactly once, here, and never stored in the clear.

    Bound to ONE company. Two companies means two keys — a key ends up living in somebody
    else's configuration for a long time, and "which data does this reach" should be
    answerable without looking anything up.
    """
    data = payload or {}
    name = (data.get('name') or '').strip()
    company_id = data.get('company_id')
    scopes = data.get('scopes') or []
    rate_limit = data.get('rate_limit_per_minute')
    expires_in_days = data.get('expires_in_days')

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Give the key a name — it is what the audit log shows."
        )
    company = Company.query.get(company_id) if company_id else None
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if (company.status or 'active') != 'active':
        raise HTTPException(status_code=400, detail="That company is archived.")

    if not isinstance(scopes, list):
        raise HTTPException(status_code=400, detail="scopes must be a list")
    unknown = [sc for sc in scopes if sc not in SCOPES]
    if unknown:
        # Refused rather than ignored. A silently dropped scope produces a key that appears
        # to have a permission and does not, which surfaces later as a mystery 403.
        raise HTTPException(status_code=400, detail=f"Unknown scope(s): {', '.join(unknown)}")

    try:
        rate_limit = int(rate_limit) if rate_limit is not None else 60
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="rate_limit_per_minute must be a number")
    if not 1 <= rate_limit <= 6000:
        raise HTTPException(
            status_code=400,
            detail="rate_limit_per_minute must be between 1 and 6000"
        )

    expires_at = None
    if expires_in_days:
        try:
            days = int(expires_in_days)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="expires_in_days must be a number")
        if days < 1:
            raise HTTPException(status_code=400, detail="expires_in_days must be at least 1")
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=days)

    full_key, prefix, key_hash = generate_key()

    record = ApiKey(
        name=name,
        key_prefix=prefix,
        key_hash=key_hash,
        company_id=company.id,
        rate_limit_per_minute=rate_limit,
        expires_at=expires_at,
        created_by=user.id,
    )
    record.set_scopes(scopes)
    db.session.add(record)
    db.session.flush()

    # The prefix is logged, never the key. This log is readable forever by anyone who
    # reaches the audit trail, and a secret recorded there outlives every rotation.
    _audit(user, 'API_KEY_CREATED',
           f"Created API key '{name}' ({prefix}...) for '{company.name}' with scopes: "
           f"{', '.join(sorted(scopes)) or 'none'}.")
    db.session.commit()

    return {
        'api_key': record.to_dict(),
        # Shown once. Only the hash is kept, so a lost key can be replaced but never read.
        'key': full_key,
    }


@superadmin_bp.post('/api-keys/{key_id}/revoke')
def revoke_api_key(key_id: int, user: User = Depends(super_admin_required)):
    """Switch a key off. Takes effect on its very next request — nothing is cached."""
    record = ApiKey.query.get(key_id)
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")
    if record.revoked_at:
        return record.to_dict()

    record.revoked_at = datetime.datetime.utcnow()
    record.revoked_by = user.id
    _audit(user, 'API_KEY_REVOKED',
           f"Revoked API key '{record.name}' ({record.key_prefix}...).")
    db.session.commit()
    return record.to_dict()


@superadmin_bp.put('/api-keys/{key_id}')
def update_api_key(key_id: int, payload: dict = Body(default=None),
                   user: User = Depends(super_admin_required)):
    """Adjust scopes or rate limit. The company and the secret are both immutable.

    Moving a key between companies would silently redirect an integration at somebody else's
    data while every dashboard still showed it working. Issuing a new key is the honest way
    to change what something reaches.
    """
    record = ApiKey.query.get(key_id)
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")
    if record.revoked_at:
        raise HTTPException(status_code=400, detail="This key has been revoked.")

    data = payload or {}
    changes = []

    if 'scopes' in data:
        scopes = data.get('scopes') or []
        if not isinstance(scopes, list):
            raise HTTPException(status_code=400, detail="scopes must be a list")
        unknown = [sc for sc in scopes if sc not in SCOPES]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown scope(s): {', '.join(unknown)}")
        before = record.scope_list()
        record.set_scopes(scopes)
        if before != record.scope_list():
            changes.append(f"scopes {before} -> {record.scope_list()}")

    if 'rate_limit_per_minute' in data:
        try:
            rate_limit = int(data.get('rate_limit_per_minute'))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="rate_limit_per_minute must be a number")
        if not 1 <= rate_limit <= 6000:
            raise HTTPException(
                status_code=400,
                detail="rate_limit_per_minute must be between 1 and 6000"
            )
        if record.rate_limit_per_minute != rate_limit:
            changes.append(f"rate limit {record.rate_limit_per_minute} -> {rate_limit}")
            record.rate_limit_per_minute = rate_limit

    if changes:
        _audit(user, 'API_KEY_UPDATED',
               f"API key '{record.name}' ({record.key_prefix}...): " + ', '.join(changes))
    db.session.commit()
    return record.to_dict()


# ---------------------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------------------

# Paged rather than capped. The admin log is the one place that answers "who did this", and
# a hard limit silently hides exactly the older entry somebody is looking for.
AUDIT_PAGE_SIZE = 50
AUDIT_MAX_PAGE_SIZE = 200


@superadmin_bp.get('/audit-log')
def superadmin_audit_log(
    limit: int = AUDIT_PAGE_SIZE,
    offset: int = 0,
    admin_id: int = None,
    api_key_id: int = None,
    action: str = None,
    actor_role: str = None,
    search: str = None,
    user: User = Depends(super_admin_required),
):
    """The whole platform's audit trail, unscoped.

    The ADMIN view of this same table is scoped to its own actor, because an entry's
    `details` names candidates in free text and one admin's entries can carry another
    company's data. The super admin is the one person for whom that is not a leak — they
    already see every company — and being able to read across all of them is the entire
    point of an audit trail. Anything narrower and there is nobody who can answer "who
    touched this candidate".
    """
    limit = max(1, min(int(limit or AUDIT_PAGE_SIZE), AUDIT_MAX_PAGE_SIZE))
    offset = max(0, int(offset or 0))

    query = AdminLog.query
    if admin_id is not None:
        query = query.filter(AdminLog.admin_id == admin_id)
    if api_key_id is not None:
        query = query.filter(AdminLog.api_key_id == api_key_id)
    if action:
        query = query.filter(AdminLog.action == action)
    if actor_role:
        query = query.filter(AdminLog.actor_role == actor_role)
    if search:
        # Case-insensitive because the thing being searched for is usually an email or a
        # name pasted from somewhere that cased it differently.
        term = f'%{search.strip()}%'
        query = query.filter(AdminLog.details.ilike(term))

    total = query.order_by(None).count()
    rows = (
        query.order_by(AdminLog.created_at.desc(), AdminLog.id.desc())
        .limit(limit).offset(offset).all()
    )

    # One directory lookup rather than one per row: the app and the database are in
    # different regions, so a per-row query costs real time on every page of this list.
    actor_ids = {r.admin_id for r in rows if r.admin_id}
    actors = (
        {u.id: u for u in User.query.filter(User.id.in_(actor_ids)).all()}
        if actor_ids else {}
    )
    key_ids = {r.api_key_id for r in rows if r.api_key_id}
    keys = (
        {k.id: k for k in ApiKey.query.filter(ApiKey.id.in_(key_ids)).all()}
        if key_ids else {}
    )

    items = []
    for row in rows:
        entry = row.to_dict()
        actor = actors.get(row.admin_id)
        entry['actor_name'] = actor.name if actor else None
        # "System" rather than blank for a row whose actor has since been deleted — the FK
        # is ON DELETE CASCADE for the row itself, but a NULL admin_id can still reach here
        # from older data, and an empty cell reads as a rendering bug.
        entry['actor_email'] = actor.email if actor else 'System'
        key = keys.get(row.api_key_id)
        entry['api_key_name'] = key.name if key else None
        entry['api_key_prefix'] = key.key_prefix if key else None
        items.append(entry)

    return {
        'data': items,
        'pagination': {
            'total': total,
            'limit': limit,
            'offset': offset,
            'has_more': offset + len(items) < total,
        },
    }


@superadmin_bp.get('/audit-log/actions')
def superadmin_audit_actions(user: User = Depends(super_admin_required)):
    """Every action name that actually appears in the log.

    Read from the data rather than from a hard-coded list, so a filter dropdown cannot go
    stale the moment somebody adds a new action — a filter that silently omits an action is
    worse than no filter, because the empty result looks like an answer.
    """
    rows = db.session.query(AdminLog.action).distinct().order_by(AdminLog.action.asc()).all()
    return [r[0] for r in rows if r[0]]
