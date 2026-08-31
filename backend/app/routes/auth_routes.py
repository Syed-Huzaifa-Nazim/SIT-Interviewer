import re
import datetime
import secrets
import threading
import jwt
from fastapi import APIRouter, Body, Request, HTTPException, status, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from app.database.db import db
from app.models import (
    User, Token, Transaction, Notification, Interview, SecondInterviewRequest,
    ResumeAnalysis, PendingResume, AdminLog,
)
from app.utils.security import (
    create_access_token, create_refresh_token, JWT_SECRET, ADMIN_ROLES, get_current_user
)
from app.utils.scope import default_company_id
from app.utils.candidate import (
    COURSE_CATEGORIES, COURSE_STATUSES, CATEGORY_JOB_ROLES,
    SIGNUP_CATEGORIES, INSTRUCTOR_CATEGORY, RESUME_CATEGORY,
    is_instructor_category, is_resume_category, requires_course_status,
    normalize_cnic, generate_otp
)
from app.utils.resume_text import extract_resume_text, MAX_RESUME_BYTES
from app.ai.mixtral.mixtral_service import MixtralService
from app.config.config import Config
from app.email import EmailService
from app.email import templates as email_templates

auth_bp = APIRouter()

EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

# A pending resume is claimed by /register minutes after it is uploaded. The window only has
# to cover finishing the enrolment form.
PENDING_RESUME_TTL = datetime.timedelta(hours=2)

# /signup-resume runs an LLM call for a caller with no account, which is a cost an
# unauthenticated endpoint should not hand out freely. This is a per-process, per-IP cap —
# it does not survive a restart and does not coordinate across containers, so treat it as a
# brake on casual abuse rather than a real rate limiter. The cheap checks (size, extension,
# CNIC format, resume-shape) all run BEFORE the model is called, so anything that gets far
# enough to cost money has already had to look like a genuine signup.
_RESUME_UPLOAD_MAX = 5
_RESUME_UPLOAD_WINDOW = datetime.timedelta(minutes=15)
_resume_upload_hits = {}
_resume_upload_lock = threading.Lock()


def _throttle_resume_upload(client_ip):
    now = datetime.datetime.utcnow()
    cutoff = now - _RESUME_UPLOAD_WINDOW
    with _resume_upload_lock:
        # Sweep every bucket, not just this caller's: without it the dict grows one entry per
        # IP that ever hit the endpoint and is never reclaimed.
        for ip in [ip for ip, hits in _resume_upload_hits.items() if all(h < cutoff for h in hits)]:
            del _resume_upload_hits[ip]

        hits = [h for h in _resume_upload_hits.get(client_ip, []) if h >= cutoff]
        if len(hits) >= _RESUME_UPLOAD_MAX:
            raise HTTPException(
                status_code=429,
                detail="Too many resume uploads from this connection. Please wait a few minutes "
                       "and try again."
            )
        hits.append(now)
        _resume_upload_hits[client_ip] = hits


# --------------------------------------------------------------------- login throttle
#
# /login had no brute-force protection at all: an unlimited number of password guesses
# could be made as fast as the network allowed. That matters more here than on a typical
# app because the platform has exactly ONE admin account, at a predictable address
# (admin@interviewer.com), so an attacker needs no username discovery — only the password.
#
# Two independent counters, because either one alone is trivially defeated:
#   - per IP, which stops the ordinary single-host password-spray outright;
#   - per identifier, which still bites when the attempts are spread across many hosts.
# Both are FAILURE counters. A successful login clears them, so a legitimate user who
# mistypes a few times and then gets it right is never left locked out.
#
# The identifier counter can in principle be abused to lock a known account out for the
# window (an attacker deliberately failing against admin@interviewer.com). That is a real
# trade-off and it is taken deliberately: fifteen minutes of denied admin login is a far
# smaller harm than an unthrottled path to admin takeover, and the threshold is set high
# enough that ordinary mistyping never reaches it.
#
# In-process and per-container, exactly like the resume-upload throttle above — a brake on
# real attacks, not a distributed rate limiter. It resets if Railway restarts the process.
_LOGIN_WINDOW = datetime.timedelta(minutes=15)
_LOGIN_MAX_PER_IP = 10
_LOGIN_MAX_PER_IDENTIFIER = 10
_login_failures = {}
_login_locked_logged = set()
_login_lock = threading.Lock()


def _login_keys(client_ip, identifier):
    return (f'ip:{client_ip}', f'id:{(identifier or "").strip().lower()}')


def _check_login_throttle(client_ip, identifier):
    """Refuse the attempt outright when this IP or this account has failed too often."""
    now = datetime.datetime.utcnow()
    cutoff = now - _LOGIN_WINDOW
    ip_key, id_key = _login_keys(client_ip, identifier)

    with _login_lock:
        # Sweep expired buckets so the dict cannot grow unbounded across a long uptime.
        for key in [k for k, ts in _login_failures.items() if all(t < cutoff for t in ts)]:
            del _login_failures[key]
            _login_locked_logged.discard(key)

        for key, limit in ((ip_key, _LOGIN_MAX_PER_IP), (id_key, _LOGIN_MAX_PER_IDENTIFIER)):
            recent = [t for t in _login_failures.get(key, []) if t >= cutoff]
            if len(recent) >= limit:
                retry_after = int((min(recent) + _LOGIN_WINDOW - now).total_seconds())
                raise HTTPException(
                    status_code=429,
                    detail="Too many failed sign-in attempts. Please wait a few minutes before "
                           "trying again.",
                    headers={'Retry-After': str(max(retry_after, 1))},
                )


def _record_login_failure(client_ip, identifier):
    """Count a failed attempt, and leave an audit trail the first time a key locks.

    Only the crossing is logged, not every subsequent blocked attempt — a sustained attack
    would otherwise write thousands of rows and bury the very signal it is meant to raise.
    """
    now = datetime.datetime.utcnow()
    cutoff = now - _LOGIN_WINDOW
    ip_key, id_key = _login_keys(client_ip, identifier)
    newly_locked = []

    with _login_lock:
        for key, limit in ((ip_key, _LOGIN_MAX_PER_IP), (id_key, _LOGIN_MAX_PER_IDENTIFIER)):
            recent = [t for t in _login_failures.get(key, []) if t >= cutoff]
            recent.append(now)
            _login_failures[key] = recent
            if len(recent) >= limit and key not in _login_locked_logged:
                _login_locked_logged.add(key)
                newly_locked.append(key)

    for key in newly_locked:
        try:
            # in_(ADMIN_ROLES), not role='admin': admin_id is NOT NULL, so once the
            # only privileged account became a super admin a role='admin' lookup
            # returned None and this audit row failed to insert — silently, since the
            # whole block swallows exceptions on purpose.
            admin_user = User.query.filter(User.role.in_(ADMIN_ROLES)).first()
            db.session.add(AdminLog(
                admin_id=admin_user.id if admin_user else None,
                action='LOGIN_THROTTLED',
                details=(
                    f"Blocked further sign-in attempts after {_LOGIN_MAX_PER_IP} failures "
                    f"({key}). Identifier tried: {identifier!r}, source IP: {client_ip}."
                ),
            ))
            db.session.commit()
        except Exception:
            # An audit write must never be the reason a login request errors out.
            db.session.rollback()


def _clear_login_failures(client_ip, identifier):
    ip_key, id_key = _login_keys(client_ip, identifier)
    with _login_lock:
        for key in (ip_key, id_key):
            _login_failures.pop(key, None)
            _login_locked_logged.discard(key)


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
    for admin in User.query.filter(User.role.in_(ADMIN_ROLES)).all():
        db.session.add(Notification(
            user_id=admin.id, title=title, message=message, type=notif_type
        ))


def _handle_reinterview_signup(existing_user, name, email, pending_resume=None):
    """A CNIC that already completed an interview is signing up again (§3.4):
    queue an admin approval request instead of auto-sending credentials.

    ``pending_resume`` carries a Resume-Based candidate's freshly uploaded CV. It is added as
    a NEW analysis row rather than replacing the old one — start_interview reads the most
    recent, so an approved second attempt is built from the resume they just submitted. The
    alternative was discarding the upload and re-interviewing them on a CV that may be a year
    stale, which for this category is the wrong answer; nothing is overwritten either way,
    and this is the same "refresh what the new form told us" the name and email already get.
    """
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

    if pending_resume:
        db.session.add(ResumeAnalysis(
            user_id=existing_user.id,
            file_name=pending_resume.file_name,
            raw_text=pending_resume.raw_text,
            extracted_skills=pending_resume.extracted_skills,
            extracted_experience=pending_resume.extracted_experience,
            extracted_education=pending_resume.extracted_education,
            extracted_projects=pending_resume.extracted_projects,
            missing_skills=pending_resume.missing_skills,
            resume_score=pending_resume.resume_score,
            suggestions=pending_resume.suggestions,
        ))
        db.session.delete(pending_resume)

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


@auth_bp.post('/signup-resume')
def signup_resume(
    request: Request,
    resume: UploadFile = File(...),
    cnic: str = Form(...),
    email: str = Form(...),
):
    """Public: parse a Resume-Based candidate's CV during enrolment (Resume §1.1/§2).

    The category collects the resume on the enrolment form, so this necessarily runs before
    the account exists — /analyze-resume cannot be reused directly because it is scoped to a
    logged-in user, and ResumeAnalysis.user_id is NOT NULL. The parse is held in
    pending_resumes against a single-use token that /register then claims.

    Analysis happens HERE, at enrolment, and never again: the interview reads the stored
    result. Nothing on the interview path waits on a model call, which is the same rule the
    proctoring work already follows.
    """
    _throttle_resume_upload(request.client.host if request.client else 'unknown')

    normalized_cnic = normalize_cnic(cnic)
    if not normalized_cnic:
        raise HTTPException(
            status_code=400,
            detail="A valid CNIC number is required (13 digits, e.g. 42101-1234567-1)"
        )

    email = (email or '').strip()
    if not re.match(EMAIL_REGEX, email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    # Mirrors /register exactly rather than inventing a second account policy: an existing
    # CNIC that is eligible for a second attempt still has to reach the re-interview flow,
    # so only a plain duplicate is refused here.
    existing_by_cnic = User.query.filter_by(cnic=normalized_cnic).first()
    if existing_by_cnic:
        if existing_by_cnic.interview_status not in (
            'interview_completed', 'reinterview_pending', 'reinterview_rejected'
        ):
            raise HTTPException(
                status_code=409,
                detail="An account with this CNIC already exists. Please log in instead."
            )
    elif User.query.filter_by(email=email).first():
        raise HTTPException(status_code=409, detail="Account with this email already exists")

    contents = resume.file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Raises a candidate-actionable 400 for the wrong format, an oversized file, a scanned
    # PDF, or a document that is not a CV — all before a single token is spent on the model.
    resume_text = extract_resume_text(contents, resume.filename or '')

    analysis = MixtralService.analyze_resume(resume_text)

    try:
        now = datetime.datetime.utcnow()
        # Sweep abandoned uploads (parsed, then the candidate never finished signing up) so
        # the table does not accumulate CVs belonging to nobody.
        PendingResume.query.filter(PendingResume.expires_at < now).delete(synchronize_session=False)
        # One live upload per CNIC: re-uploading replaces the previous attempt instead of
        # leaving a stale token that could still be claimed.
        PendingResume.query.filter_by(cnic=normalized_cnic).delete(synchronize_session=False)

        pending = PendingResume(
            token=secrets.token_urlsafe(32),
            cnic=normalized_cnic,
            email=email,
            file_name=(resume.filename or 'resume')[:150],
            raw_text=resume_text,
            extracted_skills=analysis.get('extracted_skills', '[]'),
            extracted_experience=analysis.get('extracted_experience', '[]'),
            extracted_education=analysis.get('extracted_education', '[]'),
            extracted_projects=analysis.get('extracted_projects', '[]'),
            missing_skills=analysis.get('missing_skills', '[]'),
            resume_score=analysis.get('resume_score', 0),
            suggestions=analysis.get('suggestions', '[]'),
            expires_at=now + PENDING_RESUME_TTL,
        )
        db.session.add(pending)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Could not save the resume analysis: {str(e)}")

    return {
        'message': 'Resume analyzed successfully',
        **pending.to_preview(),
    }


def _claim_pending_resume(resume_token, cnic):
    """Consume the upload from /signup-resume, or explain why it cannot be used."""
    if not resume_token:
        raise HTTPException(
            status_code=400,
            detail="Please upload your resume before creating your profile."
        )

    pending = PendingResume.query.filter_by(token=resume_token).first()
    if not pending:
        raise HTTPException(
            status_code=400,
            detail="That resume upload was not found. Please upload your resume again."
        )
    # The token is the only thing guarding this row, so it must not be usable to attach one
    # person's CV to a different person's signup.
    if pending.cnic != cnic:
        raise HTTPException(
            status_code=400,
            detail="That resume was uploaded for a different CNIC. Please upload it again."
        )
    if pending.is_expired():
        db.session.delete(pending)
        db.session.commit()
        raise HTTPException(
            status_code=400,
            detail="That resume upload has expired. Please upload your resume again."
        )
    return pending


@auth_bp.post('/register')
def register(payload: dict = Body(default=None)):
    data = payload or {}

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
    resume_signup = is_resume_category(course_category)

    # Instructor (Update §2/§3) and Resume-Based (Resume §1.1): neither is a course, so
    # neither has a course-status. Both always take the one-time-OTP official-interview
    # flow, like Completed-course candidates.
    if not requires_course_status(course_category):
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

    # Resume-Based signups carry the token from /signup-resume. Claimed up front, before
    # either branch below, for two reasons: a bad or expired token must fail the signup
    # outright rather than leave a candidate in this category with no resume — an account
    # that could never start an interview, since the whole question set comes from the CV —
    # and a re-interview request needs the upload too, or the CV they just submitted would
    # be silently discarded.
    pending_resume = _claim_pending_resume(data.get('resume_token'), cnic) if resume_signup else None

    # CNIC re-signup detection (§3.4): same CNIC + a completed interview on record
    # routes into the admin approval workflow instead of a normal signup.
    existing_by_cnic = User.query.filter_by(cnic=cnic).first()
    if existing_by_cnic:
        if existing_by_cnic.interview_status in ('interview_completed', 'reinterview_pending', 'reinterview_rejected'):
            return _handle_reinterview_signup(existing_by_cnic, name, email, pending_resume)
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
            interview_status='not_interviewed',
            # Whichever company the super admin nominated to receive public signups. None
            # when no default is set, which leaves the account unassigned exactly as it was
            # before company scoping existed.
            company_id=default_company_id(),
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

        # Move the enrolment upload onto the account now that it has an id, and drop the
        # staging row — the CV lives in exactly one place from here on.
        if pending_resume:
            db.session.add(ResumeAnalysis(
                user_id=user.id,
                file_name=pending_resume.file_name,
                raw_text=pending_resume.raw_text,
                extracted_skills=pending_resume.extracted_skills,
                extracted_experience=pending_resume.extracted_experience,
                extracted_education=pending_resume.extracted_education,
                extracted_projects=pending_resume.extracted_projects,
                missing_skills=pending_resume.missing_skills,
                resume_score=pending_resume.resume_score,
                suggestions=pending_resume.suggestions,
            ))
            db.session.delete(pending_resume)

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
            elif resume_signup:
                # Deliberately the same email as a completed-course candidate: the wording is
                # about the one-time credential and the official interview, both of which
                # apply here unchanged. Only the response status differs, so the enrolment
                # form can confirm the resume was attached.
                subject, html = email_templates.completed_signup(name, cnic, otp)
                email_type, resp_status = 'resume_signup', 'resume_pending_login'
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
def signup_options():
    """Public: drives the signup form so a single backend flag (ONGOING_CATEGORY_ENABLED)
    controls the 'Coming Soon' state everywhere without a frontend redeploy (Update §1)."""
    return {
        'categories': SIGNUP_CATEGORIES,
        'course_categories': COURSE_CATEGORIES,
        'instructor_category': INSTRUCTOR_CATEGORY,
        'resume_category': RESUME_CATEGORY,
        'ongoing_enabled': Config.ONGOING_CATEGORY_ENABLED,
        'max_resume_bytes': MAX_RESUME_BYTES,
    }


@auth_bp.post('/login')
def login(request: Request, payload: dict = Body(default=None)):
    data = payload or {}
    identifier = data.get('email') or data.get('identifier') or data.get('cnic')
    password = data.get('password')

    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Email/CNIC and password are required")

    client_ip = request.client.host if request.client else 'unknown'
    # Checked BEFORE any credential work: a throttled caller must not even get to spend a
    # bcrypt comparison, or the endpoint stays a CPU amplifier even while it refuses to
    # authenticate anyone.
    _check_login_throttle(client_ip, identifier)

    # The login identifier may be an email or a CNIC number (§3.1)
    user = User.query.filter_by(email=identifier).first()
    if not user:
        cnic = normalize_cnic(identifier)
        if cnic:
            user = User.query.filter_by(cnic=cnic).first()

    invalid_error = HTTPException(status_code=401, detail="Invalid credentials. Please check your email/CNIC and password.")

    if not user:
        # An unknown identifier is counted too. Skipping it would leave a free, unlimited
        # channel for probing which accounts exist before spending attempts on real ones.
        _record_login_failure(client_ip, identifier)
        raise invalid_error

    if user.must_use_otp:
        # Completed-course candidates: strictly one successful login per OTP (§3.2)
        if user.otp_used or not user.otp_hash:
            raise HTTPException(
                status_code=401,
                detail="Your one-time login credentials have already been used and are no longer valid. "
                       "Please contact the administration if you believe you should have access."
            )
        # Deadline set by the Bulk Email Module. Only applies when a deadline was actually
        # issued — otp_expires_at is NULL for every organic signup, instructor signup,
        # re-interview approval and individual admin invite, so those keep behaving exactly
        # as before and this branch never runs for them.
        if user.otp_expires_at and datetime.datetime.utcnow() > user.otp_expires_at:
            raise HTTPException(
                status_code=401,
                detail="Your one-time login credentials have expired. "
                       "Please contact the administration to be re-invited."
            )
        if not user.check_otp(password):
            _record_login_failure(client_ip, identifier)
            raise invalid_error
    else:
        if not user.check_password(password):
            _record_login_failure(client_ip, identifier)
            raise invalid_error

    if user.status == 'banned' and user.role not in ADMIN_ROLES:
        if user.banned_until and user.banned_until <= datetime.datetime.utcnow():
            user.status = 'active'
            user.banned_until = None
            db.session.commit()
        else:
            msg = 'This account has been suspended by the administrator'
            if user.banned_until:
                local_time = user.banned_until + datetime.timedelta(hours=5)
                msg = f"Your account has been blocked for 30 days due to a proctoring violation during your interview. It will automatically reopen after {local_time.strftime('%Y-%m-%d %H:%M:%S')}."
            raise HTTPException(status_code=403, detail=msg)

    # Correct credentials: wipe the failure counters so an earlier run of typos can never
    # carry over and lock out the person who has just proved who they are.
    _clear_login_failures(client_ip, identifier)

    one_time = bool(user.must_use_otp)
    if one_time:
        user.otp_used = True  # consume the OTP on this single successful login

    user.last_seen_at = datetime.datetime.utcnow()

    # Record every ADMIN sign-in, with where it came from.
    #
    # Sessions here are stateless JWTs, so there is no list of "currently signed-in devices"
    # to show anybody — the honest thing to record is when somebody signed in and from
    # where. That is also what makes the super admin's "end all sessions" button usable as
    # more than a blunt instrument: without a sign-in trail there is no way to notice the
    # login from an unfamiliar address that would make anyone want to press it.
    #
    # Candidates are deliberately not logged. There are far more of them, they sign in
    # constantly, and burying a handful of admin sign-ins under thousands of candidate rows
    # would destroy the only signal this is for.
    if user.role in ADMIN_ROLES:
        db.session.add(AdminLog(
            admin_id=user.id,
            action='ADMIN_LOGIN',
            details=f"{user.email} signed in from {client_ip}.",
            actor_role=user.role,
        ))

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
def refresh(request: Request, payload: dict = Body(default=None)):
    data = payload or {}
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

        # Only a real refresh token may mint access tokens. Without this check an ACCESS
        # token is accepted here too, which would hand one-time interview sessions — issued
        # a deliberately short-lived access token and no refresh token at all (§3.3) — an
        # unlimited renewal loop.
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")

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


# Password reset tuning. The code is short because it is delivered out-of-band by email;
# the security comes from it being random, hashed at rest, expiring, and single-use.
RESET_CODE_TTL_MINUTES = 15
RESET_RESEND_COOLDOWN_SECONDS = 60
RESET_MIN_PASSWORD_LENGTH = 8

# Deliberately identical for every outcome — a different response for a known vs unknown
# address would turn this endpoint into an account-enumeration oracle.
_RESET_GENERIC_MESSAGE = (
    'If an account exists for that email address, a password reset code has been sent to it. '
    'Please check your inbox.'
)


@auth_bp.post('/forgot-password')
def forgot_password(payload: dict = Body(default=None)):
    """Issues a random, hashed, expiring reset code and EMAILS it to the account owner.

    The code is never returned in the response. The previous implementation accepted a
    hard-coded '123456' and even handed it back to the caller, so anyone who knew an
    email address could take over that account — including the admin account.
    """
    data = payload or {}
    email = (data.get('email') or '').strip()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = User.query.filter_by(email=email).first()

    # Silently no-op for unknown addresses and for one-time-credential accounts (their
    # login is the admin-issued interview OTP; there is no password to reset).
    if not user or user.must_use_otp:
        return {'message': _RESET_GENERIC_MESSAGE}

    # Throttle re-sends so this endpoint can't be used to spam a real inbox.
    if user.reset_otp_expires_at:
        issued_at = user.reset_otp_expires_at - datetime.timedelta(minutes=RESET_CODE_TTL_MINUTES)
        if (datetime.datetime.utcnow() - issued_at).total_seconds() < RESET_RESEND_COOLDOWN_SECONDS:
            return {'message': _RESET_GENERIC_MESSAGE}

    try:
        otp = generate_otp()
        user.set_reset_otp(otp, ttl_minutes=RESET_CODE_TTL_MINUTES)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise HTTPException(status_code=500, detail="Could not start the password reset. Please try again.")

    subject, html = email_templates.password_reset_code(user.name, otp, RESET_CODE_TTL_MINUTES)
    EmailService.send(user.email, subject, html, email_type='password_reset', user_id=user.id)

    return {'message': _RESET_GENERIC_MESSAGE}


@auth_bp.post('/reset-password')
def reset_password(payload: dict = Body(default=None)):
    data = payload or {}
    email = (data.get('email') or '').strip()
    otp = (data.get('otp') or '').strip()
    new_password = data.get('new_password')

    if not email or not otp or not new_password:
        raise HTTPException(status_code=400, detail="Email, reset code, and new password are required")

    if len(new_password) < RESET_MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {RESET_MIN_PASSWORD_LENGTH} characters long"
        )

    user = User.query.filter_by(email=email).first()

    # One message for "no such account", "wrong code" and "expired code" alike, for the
    # same enumeration reason as above.
    invalid_error = HTTPException(
        status_code=400,
        detail="That reset code is invalid or has expired. Please request a new one."
    )

    if not user or user.must_use_otp or not user.check_reset_otp(otp):
        raise invalid_error

    try:
        user.set_password(new_password)
        user.clear_reset_otp()  # single use
        # A reset is the remedy for a compromised account, so it must also end any session
        # an attacker already holds — every token issued before this instant stops working.
        # Truncated to the second because a JWT's `iat` only has second resolution: with
        # microseconds kept, a token minted in this same second would compare as older than
        # the revocation and lock the legitimate owner straight back out.
        user.session_revoked_at = datetime.datetime.utcnow().replace(microsecond=0)
        db.session.commit()
        return {'message': 'Password has been reset successfully. Please log in with your new password.'}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")


@auth_bp.post('/change-password')
def change_password(payload: dict = Body(default=None), user: User = Depends(get_current_user)):
    """Replace your own password, knowing the current one.

    Deliberately NOT behind admin_required. An account created by the super admin is issued
    a generated password and is refused everything on the admin surface until it replaces it
    — so a change-password endpoint sitting behind that same gate would be unreachable by
    exactly the accounts that have to use it.

    Distinct from /reset-password, which proves identity with an emailed code because the
    person cannot sign in. Here they are already signed in and prove it with the old
    password, which is what stops a borrowed session silently taking the account over.
    """
    data = payload or {}
    current_password = data.get('current_password') or ''
    new_password = data.get('new_password') or ''

    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Both the current and new password are required")

    # Admin accounts carry a longer minimum than candidates: one of them can read every
    # candidate in its companies.
    minimum = 12 if user.role in ADMIN_ROLES else 6
    if len(new_password) < minimum:
        raise HTTPException(
            status_code=400,
            detail=f"The new password must be at least {minimum} characters."
        )
    if not user.check_password(current_password):
        raise HTTPException(status_code=401, detail="Your current password is not correct.")
    if user.check_password(new_password):
        raise HTTPException(
            status_code=400,
            detail="The new password must be different from the current one."
        )

    user.set_password(new_password)
    user.must_change_password = False
    # Everything issued under the old password dies, INCLUDING the token making this very
    # request. That is the point: a password is changed because the old one may be known,
    # and leaving sessions opened with it alive would change nothing for whoever holds it.
    user.session_revoked_at = datetime.datetime.utcnow().replace(microsecond=0)

    if user.role in ADMIN_ROLES:
        db.session.add(AdminLog(
            admin_id=user.id,
            action='ADMIN_PASSWORD_CHANGED',
            details=f"{user.email} set a new password; all previous sessions revoked.",
            actor_role=user.role,
        ))
    db.session.commit()

    return {
        'message': 'Password changed. Please sign in again with your new password.',
        'reauthentication_required': True,
    }


@auth_bp.post('/logout')
def logout():
    return {'message': 'Logged out successfully'}
