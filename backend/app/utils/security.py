import jwt
import datetime
import hashlib
from fastapi import Request, HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config.config import Config
from app.models import User

# Configure security schemes
security_scheme = HTTPBearer(auto_error=False)
JWT_SECRET = Config.JWT_SECRET_KEY

# Role vocabulary. `super_admin` is a strict superset of `admin`: it passes every check an
# admin passes, and additionally owns the company/admin management surface. Keeping it a
# separate role rather than an `is_super` flag means an existing `role != 'admin'` check
# fails CLOSED for it, which is the safe direction to be wrong in.
ROLE_ADMIN = 'admin'
ROLE_SUPER_ADMIN = 'super_admin'
ADMIN_ROLES = (ROLE_ADMIN, ROLE_SUPER_ADMIN)

# Claim marking a token minted by the dedicated super-admin login. Signing in through the
# ordinary /auth/login gets a super admin an ordinary admin session and nothing more: the
# management surface needs its own deliberate sign-in, so a token lifted from a normal
# admin session cannot reach it.
SUPERADMIN_CLAIM = 'sa'

# The half-finished super-admin sign-in: password accepted, second factor still owed.
#
# Signed with a DERIVED secret rather than JWT_SECRET, and that is the whole point. A
# challenge is just a JWT naming a user id, and get_current_user_id validates any token that
# carries a valid signature and a `sub` — so a challenge signed with the ordinary secret
# would BE a working access token, and the second factor would be skippable by simply
# sending the challenge to any authenticated endpoint. Signing it with a different key makes
# that structurally impossible instead of relying on a claim check nobody remembers to add.
_SUPERADMIN_CHALLENGE_SECRET = hashlib.sha256(
    (JWT_SECRET + '::superadmin-2fa-challenge').encode('utf-8')
).hexdigest()

# Long enough to read an email and type six digits, short enough that a challenge left in a
# closed tab is not a standing invitation.
SUPERADMIN_CHALLENGE_MINUTES = 10

# Every token this app mints carries one of these. Access and refresh tokens are signed
# with the SAME key and differ only by this claim, which is what makes checking it load
# bearing rather than cosmetic.
TOKEN_TYPE_ACCESS = 'access'
TOKEN_TYPE_REFRESH = 'refresh'


def _require_access_token(payload):
    """Refuse a token that is not an access token.

    THE HOLE THIS CLOSES
    --------------------
    /auth/refresh already refuses to mint a session from an access token. The reverse was
    open: a refresh token is signed with the same key and carries a `sub`, and every
    authenticated dependency validated only the signature, the expiry and that `sub` — so a
    refresh token worked as an access token on every endpoint in the app.

    That matters because the two are not equivalent. A refresh token lives seven days
    against an access token's twelve hours, and it is deliberately handed out to be stored
    for exactly that longevity. Anything that leaked one — a log line, a proxy, a copied
    localStorage — got a week of full API access rather than a token that had to be
    exchanged first, in a place the exchange step could have been noticed.

    Tokens minted before this check carry no `type` at all, so an absent claim is accepted:
    rejecting it would sign out every live session on the deploy that shipped this. Only a
    claim that is present and wrong is refused, which covers refresh tokens today and any
    future token kind by default.
    """
    token_type = payload.get('type')
    if token_type is not None and token_type != TOKEN_TYPE_ACCESS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This token cannot be used to authenticate a request."
        )


def create_access_token(identity: int, expires_delta: datetime.timedelta = None,
                        extra_claims: dict = None) -> str:
    """Encodes a new JWT access token containing user claims."""
    if not expires_delta:
        expires_delta = datetime.timedelta(hours=12) # generous session limit
        
    payload = {
        "sub": str(identity),
        "exp": datetime.datetime.utcnow() + expires_delta,
        "iat": datetime.datetime.utcnow(),
        "type": TOKEN_TYPE_ACCESS,
    }
    if extra_claims:
        # Merged first so nothing passed in can overwrite sub/exp/iat/type — a
        # caller-supplied "sub" would be an outright authentication bypass, and a
        # caller-supplied "type" would undo the check in _require_access_token.
        payload = {**extra_claims, **payload}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def create_refresh_token(identity: int, expires_delta: datetime.timedelta = None) -> str:
    """Encodes a refresh token for candidate session longevity."""
    if not expires_delta:
        expires_delta = datetime.timedelta(days=7)
        
    payload = {
        "sub": str(identity),
        "exp": datetime.datetime.utcnow() + expires_delta,
        "iat": datetime.datetime.utcnow(),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> int:
    """Dependency validator: checks token signature, expiry, and server-side session
    revocation (forced logout after a one-time interview), returning the user_id."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Request does not contain an access token."
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The token has expired. Please refresh your session."
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature verification failed. Token is invalid."
        )

    _require_access_token(payload)

    # Server-side revocation: tokens issued before session_revoked_at are dead.
    # This is what makes the post-interview forced logout airtight (§3.3) — a
    # candidate keeping a copied token cannot reuse it after the session closes.
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account record not found."
        )
    if user.session_revoked_at:
        iat = payload.get("iat")
        issued_at = datetime.datetime.utcfromtimestamp(iat) if iat else datetime.datetime.min
        if issued_at < user.session_revoked_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has ended. This one-time access is no longer valid."
            )
    return user_id

def get_current_user(user_id: int = Depends(get_current_user_id)) -> User:
    """Resolves active candidate model instance or raises 401."""
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account record not found."
        )
    return user

def get_token_payload(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> dict:
    """The decoded claims of the presented token.

    A second decode rather than a refactor of get_current_user_id: HS256 verification is
    microseconds, and threading the payload out through every existing caller of that
    dependency would touch far more code than this is worth. Signature and expiry are
    re-checked here, so this cannot be used to read claims off a token that would have
    been rejected.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Request does not contain an access token."
        )
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The token has expired. Please refresh your session."
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature verification failed. Token is invalid."
        )

    # Independently guarded, not left to get_current_user_id. This is a separate entry point
    # into the same claims, and a dependency that is only safe because of what runs beside
    # it stops being safe the moment somebody uses it on its own.
    _require_access_token(payload)
    return payload


def admin_required(user: User = Depends(get_current_user)):
    """Verifies candidate roles, throwing 403 if admin role is absent.

    A super admin passes here too — they can use every part of the Admin Hub, unscoped.
    What they get that an ordinary admin does not is the management surface, and that is
    gated separately by super_admin_required.
    """
    if user.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    # An account still on its generated password reaches nothing but the change-password
    # endpoint, which does not go through here. Enforced at the gate rather than per route
    # because "everything except one thing" is only safe when it is one check: a per-route
    # version is a list to forget an entry from, and the entry forgotten would be the one
    # exposing candidate data under a password sitting in an email inbox.
    #
    # PASSWORD_CHANGE_REQUIRED is a machine-readable marker; the frontend switches to the
    # change-password form on it rather than pattern-matching English.
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PASSWORD_CHANGE_REQUIRED: Set your own password before using the portal."
        )
    return user


def super_admin_required(user: User = Depends(get_current_user),
                         payload: dict = Depends(get_token_payload)):
    """Gate for the company/admin management surface.

    TWO conditions, not one. The role is the authority; the token claim is the proof that
    this particular session was opened through the dedicated super-admin sign-in. Without
    the claim, any ordinary admin session belonging to a super admin — including one still
    live in a browser tab from before they were promoted — would carry full management
    rights silently.
    """
    if user.role != ROLE_SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super administrator privileges required"
        )
    if not payload.get(SUPERADMIN_CLAIM):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign in through the super admin portal to use this."
        )
    return user


def create_superadmin_challenge(user_id: int) -> str:
    """Token proving the password step passed, and nothing more."""
    now = datetime.datetime.utcnow()
    return jwt.encode(
        {
            'sub': str(user_id),
            'iat': now,
            'exp': now + datetime.timedelta(minutes=SUPERADMIN_CHALLENGE_MINUTES),
        },
        _SUPERADMIN_CHALLENGE_SECRET,
        algorithm='HS256',
    )


def decode_superadmin_challenge(token: str) -> int:
    """The user id inside a challenge, or 401. Never returns for a token signed with the
    ordinary secret — that is what stops an access token being replayed as a challenge."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Start the sign-in again."
        )
    try:
        payload = jwt.decode(token, _SUPERADMIN_CHALLENGE_SECRET, algorithms=['HS256'])
        return int(payload['sub'])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code request has expired. Please sign in again."
        )
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Start the sign-in again."
        )
