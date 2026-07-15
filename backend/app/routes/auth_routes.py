import re
import datetime
import secrets
import jwt
from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from app.database.db import db
from app.models import User, Token, Transaction, Notification, Interview, SecondInterviewRequest
from app.utils.security import create_access_token, create_refresh_token, JWT_SECRET
from app.utils.candidate import (
    COURSE_CATEGORIES, COURSE_STATUSES, CATEGORY_JOB_ROLES,
    SIGNUP_CATEGORIES, INSTRUCTOR_CATEGORY, is_instructor_category,
    normalize_cnic, generate_otp
)
from app.config.config import Config
from app.email import EmailService
from app.email import templates as email_templates

auth_bp = APIRouter()

EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'


def _grant_signup_tokens(user_id):
    """Free tokens + ledger entry, identical to the original signup behavior."""
    token_account = Token(
        user_id=user_id,
        tokens_available=5,
        tokens_consumed=0,
        tokens_purchased=0
    )
    db.session.add(token_account)
    db.session.add(Transaction(
        user_id=user_id,
        amount=0.0,
        tokens_added=5,
        transaction_type='signup_bonus'
    ))
    return token_account


def _notify_admins(title, message, notif_type='activity'):
    for admin in User.query.filter_by(role='admin').all():
        db.session.add(Notification(
            user_id=admin.id, title=title, message=message, type=notif_type
        ))


def _handle_reinterview_signup(existing_user, name, email):
    """A CNIC that already completed an interview is signing up again (§3.4):
    queue an admin approval request instead of auto-sending credentials."""
    pending = SecondInterviewRequest.query.filter_by(
        user_id=existing_user.id, status='pending'
    ).first()
    if pending:
        return {
            'message': 'Your second-interview request is already awaiting admin approval. '
                       'You will receive an email once a decision is made.',
            'status': 'reinterview_pending'
        }

    # Refresh contact info from the new form (email must not belong to someone else)
    email_owner = User.query.filter_by(email=email).first()
    if email_owner and email_owner.id != existing_user.id:
        raise HTTPException(status_code=409, detail="Account with this email already exists")

    first_interview = Interview.query.filter_by(
        user_id=existing_user.id, status='completed'
    ).order_by(Interview.created_at.desc()).first()

    existing_user.name = name
    existing_user.email = email
    existing_user.interview_status = 'reinterview_pending'

    req = SecondInterviewRequest(
        user_id=existing_user.id,
        cnic=existing_user.cnic,
        name=name,
        email=email,
        first_interview_id=first_interview.id if first_interview else None
    )
    db.session.add(req)

    # Admin is notified IN-PORTAL only (Update §4): a persistent notification plus the
    # Approval Queue / sidebar badge. No email is sent to the admin anymore.
    _notify_admins(
        'Second Interview Request',
        f'{name} (CNIC {existing_user.cnic}) has requested a second interview attempt. '
        f'Review it in the Approval Queue.'
    )
    db.session.commit()

    return {
        'message': 'You have already completed an interview. Your request for a second attempt '
                   'has been sent to the administrator — you will receive an email with the decision.',
        'status': 'reinterview_pending'
    }


@auth_bp.post('/register')
async def register(request: Request):
    data = await request.json() or {}

    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    country = data.get('country')
    experience_level = data.get('experience_level')
    cnic_raw = data.get('cnic')
    course_category = data.get('course_category')
    course_status = (data.get('course_status') or '').lower()

    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required")

    if not re.match(EMAIL_REGEX, email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    # New mandatory classification fields (§2.1)
    cnic = normalize_cnic(cnic_raw)
    if not cnic:
        raise HTTPException(status_code=400, detail="A valid CNIC number is required (13 digits, e.g. 42101-1234567-1)")

    if course_category not in SIGNUP_CATEGORIES:
        raise HTTPException(status_code=400, detail="Please select a valid category")

    instructor_signup = is_instructor_category(course_category)

    # Instructor (Update §2/§3): its own signup branch — no course-status, always the
    # one-time-OTP official-interview flow (like Completed-course candidates).
    if instructor_signup:
        course_status = None
        one_time_signup = True
    else:
        if course_status not in COURSE_STATUSES:
            raise HTTPException(status_code=400, detail="Please select your course status (Ongoing or Completed)")

        # "Ongoing" is temporarily disabled for new signups (Update §1). Existing
        # Ongoing users are unaffected; this only blocks NEW ongoing registrations and
        # is reversible via the ONGOING_CATEGORY_ENABLED flag.
        if course_status == 'ongoing' and not Config.ONGOING_CATEGORY_ENABLED:
            raise HTTPException(
                status_code=400,
                detail="The 'Ongoing' course option is coming soon and is not available for signup yet. "
                       "Please contact the administration if you have already completed your course."
            )

        one_time_signup = (course_status == 'completed')

        # Ongoing candidates use a persistent password; completed candidates receive a
        # one-time password by email, so no signup password is needed for them (§3.1/§3.2).
        if course_status == 'ongoing':
            if not password:
                raise HTTPException(status_code=400, detail="Password is required")
            if len(password) < 6:
                raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    # CNIC re-signup detection (§3.4): same CNIC + a completed interview on record
    # routes into the admin approval workflow instead of a normal signup.
    existing_by_cnic = User.query.filter_by(cnic=cnic).first()
    if existing_by_cnic:
        if existing_by_cnic.interview_status in ('interview_completed', 'reinterview_pending', 'reinterview_rejected'):
            return _handle_reinterview_signup(existing_by_cnic, name, email)
        raise HTTPException(status_code=409, detail="An account with this CNIC already exists. Please log in instead.")

    if User.query.filter_by(email=email).first():
        raise HTTPException(status_code=409, detail="Account with this email already exists")

    default_job_role = CATEGORY_JOB_ROLES.get(course_category, 'Software Engineer')

    try:
        user = User(
            name=name,
            email=email,
            country=country,
            experience_level=experience_level or 'Entry',
            job_role=default_job_role,
            role='candidate',
            cnic=cnic,
            course_category=course_category,
            course_status=course_status,
            interview_status='not_interviewed'
        )

        otp = None
        if one_time_signup:
            # One-time credential login only — the stored password is random and unusable.
            user.set_password(secrets.token_urlsafe(24))
            user.must_use_otp = True
            otp = generate_otp()
            user.set_otp(otp)
            user.interview_status = 'invited'
        else:
            user.set_password(password)

        db.session.add(user)
        db.session.flush()

        token_account = _grant_signup_tokens(user.id)

        db.session.add(Notification(
            user_id=user.id,
            title='Welcome to AI Interviewer!',
            message='Thank you for registering. You have been credited with 5 free mock interview tokens.',
            type='token'
        ))

        db.session.commit()

        if one_time_signup:
            # Instructors get an instructor-worded invite; completed-course candidates the
            # standard one. Same one-time-OTP mechanism for both (Update §3).
            if instructor_signup:
                subject, html = email_templates.instructor_invite(name, cnic, otp)
                email_type, resp_status = 'instructor_signup', 'instructor_pending_login'
            else:
                subject, html = email_templates.completed_signup(name, cnic, otp)
                email_type, resp_status = 'completed_signup', 'completed_pending_login'
            EmailService.send(email, subject, html, email_type=email_type, user_id=user.id)
            # No JWTs: the candidate must log in with the emailed one-time password.
            return {
                'message': 'Registration successful. Check your email for your one-time login credentials.',
                'status': resp_status,
                'user': user.to_dict()
            }

        subject, html = email_templates.ongoing_signup(name, cnic, password)
        EmailService.send(email, subject, html, email_type='ongoing_signup', user_id=user.id)

        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)

        return {
            'message': 'Registration successful',
            'status': 'ongoing_registered',
            'user': user.to_dict(),
            'tokens': token_account.to_dict(),
            'access_token': access_token,
            'refresh_token': refresh_token
        }

    except HTTPException:
        raise
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating account: {str(e)}")


@auth_bp.get('/signup-options')
async def signup_options():
    """Public: drives the signup form so a single backend flag (ONGOING_CATEGORY_ENABLED)
    controls the 'Coming Soon' state everywhere without a frontend redeploy (Update §1)."""
    return {
        'categories': SIGNUP_CATEGORIES,
        'course_categories': COURSE_CATEGORIES,
        'instructor_category': INSTRUCTOR_CATEGORY,
        'ongoing_enabled': Config.ONGOING_CATEGORY_ENABLED,
    }


@auth_bp.post('/login')
async def login(request: Request):
    data = await request.json() or {}
    identifier = data.get('email') or data.get('identifier') or data.get('cnic')
    password = data.get('password')

    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Email/CNIC and password are required")

    # The login identifier may be an email or a CNIC number (§3.1)
    user = User.query.filter_by(email=identifier).first()
    if not user:
        cnic = normalize_cnic(identifier)
        if cnic:
            user = User.query.filter_by(cnic=cnic).first()

    invalid_error = HTTPException(status_code=401, detail="Invalid credentials. Please check your email/CNIC and password.")

    if not user:
        raise invalid_error

    if user.must_use_otp:
        # Completed-course candidates: strictly one successful login per OTP (§3.2)
        if user.otp_used or not user.otp_hash:
            raise HTTPException(
                status_code=401,
                detail="Your one-time login credentials have already been used and are no longer valid. "
                       "Please contact the administration if you believe you should have access."
            )
        if not user.check_otp(password):
            raise invalid_error
    else:
        if not user.check_password(password):
            raise invalid_error

    if user.status == 'banned' and user.role != 'admin':
        if user.banned_until and user.banned_until <= datetime.datetime.utcnow():
            user.status = 'active'
            user.banned_until = None
            db.session.commit()
        else:
            msg = 'This account has been suspended by the administrator'
            if user.banned_until:
                local_time = user.banned_until + datetime.timedelta(hours=5)
                msg = f"Your account has been temporarily blocked due to multiple proctoring violations. It will automatically reopen after {local_time.strftime('%Y-%m-%d %H:%M:%S')}."
            raise HTTPException(status_code=403, detail=msg)

    one_time = bool(user.must_use_otp)
    if one_time:
        user.otp_used = True  # consume the OTP on this single successful login

    user.last_seen_at = datetime.datetime.utcnow()
    db.session.commit()

    access_token = create_access_token(identity=user.id)
    # One-time sessions get no refresh token: the session cannot be silently renewed,
    # and once revoked after the interview it is gone for good (§3.3).
    refresh_token = None if one_time else create_refresh_token(identity=user.id)

    token_account = Token.query.filter_by(user_id=user.id).first()
    token_data = token_account.to_dict() if token_account else {'tokens_available': 0}

    return {
        'message': 'Login successful',
        'one_time': one_time,
        'user': user.to_dict(),
        'tokens': token_data,
        'access_token': access_token,
        'refresh_token': refresh_token
    }


@auth_bp.post('/refresh')
async def refresh(request: Request):
    data = await request.json() or {}
    refresh_token = data.get('refresh_token')
    if not refresh_token:
        # Fallback to authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith("Bearer "):
            refresh_token = auth_header.split(" ")[1]

    if not refresh_token:
        raise HTTPException(status_code=400, detail="Refresh token required")

    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=["HS256"])
        user_id = int(payload["sub"])

        # Revoked sessions must not be renewable via a kept refresh token (§3.3)
        user = User.query.get(user_id)
        if user and user.session_revoked_at:
            iat = payload.get("iat")
            issued_at = datetime.datetime.utcfromtimestamp(iat) if iat else datetime.datetime.min
            if issued_at < user.session_revoked_at:
                raise HTTPException(status_code=401, detail="Session has been revoked")

        new_access_token = create_access_token(identity=user_id)
        return {'access_token': new_access_token}
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@auth_bp.post('/forgot-password')
async def forgot_password(request: Request):
    data = await request.json() or {}
    email = data.get('email')

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = User.query.filter_by(email=email).first()
    if not user:
        return {'message': 'If the email exists in our system, a password reset code has been sent'}

    mock_otp = "123456"
    return {
        'message': 'If the email exists, a password reset code has been sent.',
        'debug_otp': mock_otp
    }


@auth_bp.post('/reset-password')
async def reset_password(request: Request):
    data = await request.json() or {}
    email = data.get('email')
    otp = data.get('otp')
    new_password = data.get('new_password')

    if not email or not otp or not new_password:
        raise HTTPException(status_code=400, detail="Email, OTP, and new password are required")

    if otp != "123456":
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    user = User.query.filter_by(email=email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # One-time-credential accounts cannot self-reset into a persistent password
    if user.must_use_otp:
        raise HTTPException(status_code=403, detail="This account uses one-time credentials issued by the administration.")

    try:
        user.set_password(new_password)
        db.session.commit()
        return {'message': 'Password has been reset successfully'}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")


@auth_bp.post('/logout')
async def logout():
    return {'message': 'Logged out successfully'}
