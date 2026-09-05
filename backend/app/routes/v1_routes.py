"""/api/v1 — the versioned public API, authenticated by API key.

WHY THIS IS A SEPARATE SURFACE
------------------------------
/api/admin exists to serve the Admin Hub. Its shapes change whenever a page changes, which
is fine for a frontend deployed alongside it and unacceptable for an integration somebody
else maintains. Exposing those endpoints to API keys would have made every future admin-UI
tweak a breaking change for people not in the room.

So this is a small, deliberately stable surface with its own version in the path. Its
responses are built here rather than reusing the admin serialisers, precisely so that
changing an admin page cannot change what an integration receives.

WHAT IT CAN REACH
-----------------
Exactly one company's rows — the company its key is bound to — enforced through the same
AdminScope every admin route uses. Nothing here writes its own filter.

Every route is `def`, not `async def`, like the rest of the app (see app/__init__.py).
"""

import datetime
import threading

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func

from app.database.db import db
from app.models import (
    User, Interview, InterviewReport, InterviewQuestion, InterviewResponse,
    AdminLog, Transaction, ProctorSnapshot, SecondInterviewRequest, BulkEmailBatch,
)
from app.utils.api_key import ApiKeyPrincipal, require_scopes
from app.utils.candidate import requires_course_status, generate_otp
from app.utils.difficulty import is_valid_range
from app.email import EmailService
from app.email import templates as email_templates

# Reused rather than re-implemented. The validation rules (CNIC/email dedupe, category
# eligibility, resume-category rejection, the deadline choices) are exactly the rules the
# Admin Hub's Bulk Email Module enforces, and _process_batch is the same background worker
# that creates the accounts and sends the invites. A second copy of any of this here is a
# second place for those rules to drift out of step — the same reasoning that keeps
# candidate-eligibility logic in one place for send_invite below.
from app.routes.bulk_email_routes import (
    MAX_ROWS as BULK_MAX_ROWS,
    _validate_rows as _bulk_validate_rows,
    _process_batch as _bulk_process_batch,
    _apply_batch_difficulty_default as _bulk_apply_batch_difficulty_default,
)

v1_bp = APIRouter()

# Paging is mandatory rather than optional. An unpaged list endpoint is fine on the day it
# ships and becomes a timeout once a company has thirty thousand candidates — and the
# integration that was written against the unpaged version breaks at exactly that moment.
DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def _page(query, limit, offset, order_column):
    """One count and one page, ordered so paging is stable.

    An ORDER BY that is not unique lets a row appear on two consecutive pages, or on
    neither, as rows are inserted underneath — so the id is always the tiebreaker.
    """
    total = query.order_by(None).count()
    rows = query.order_by(order_column.desc()).limit(limit).offset(offset).all()
    return rows, total


def _envelope(items, total, limit, offset):
    return {
        'data': items,
        'pagination': {
            'total': total,
            'limit': limit,
            'offset': offset,
            'has_more': offset + len(items) < total,
        },
    }


def _candidate(user):
    """The public shape of a candidate. Deliberately narrower than the admin one.

    No CNIC, no remarks, no OTP state. A national identity number is not something to hand
    to every integration by default, admin_remarks are internal notes written on the
    understanding that the candidate never sees them, and the OTP fields are a live
    credential's metadata.
    """
    return {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'course_category': user.course_category,
        'course_status': user.course_status,
        'interview_status': user.interview_status or 'not_interviewed',
        'status': user.status,
        'company_id': user.company_id,
        'question_difficulty_range': user.question_difficulty_range,
        'created_at': user.created_at.isoformat() if user.created_at else None,
    }


def _interview(interview):
    return {
        'id': interview.id,
        'candidate_id': interview.user_id,
        'type': interview.type,
        'job_role': interview.job_role,
        'difficulty': interview.difficulty,
        'status': interview.status,
        'overall_score': interview.overall_score,
        'proctor_failed': bool(interview.is_proctor_failed),
        'created_at': interview.created_at.isoformat() if interview.created_at else None,
    }


# ---------------------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------------------

@v1_bp.get('/whoami')
def whoami(principal: ApiKeyPrincipal = Depends(require_scopes())):
    """What this key is and what it may do.

    Needs no scope on purpose: it is how an integration author confirms their key works and
    diagnoses a 403 elsewhere, and gating it behind a scope would mean the endpoint that
    explains missing scopes can itself be missing a scope.
    """
    key = principal.api_key
    return {
        'key_prefix': key.key_prefix,
        'name': key.name,
        'company_id': key.company_id,
        'company_name': key.company.name if key.company else None,
        'scopes': key.scope_list(),
        'rate_limit_per_minute': key.rate_limit_per_minute or 60,
        'rate_limit_remaining': principal.rate_limit_remaining,
    }


# ---------------------------------------------------------------------------------------
# Candidates
# ---------------------------------------------------------------------------------------

@v1_bp.get('/candidates')
def list_candidates(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    interview_status: str = Query(None),
    principal: ApiKeyPrincipal = Depends(require_scopes('candidates:read')),
):
    query = principal.scope.filter_users(User.query.filter(User.role == 'candidate'))
    if interview_status:
        query = query.filter(User.interview_status == interview_status)
    rows, total = _page(query, limit, offset, User.created_at)
    return _envelope([_candidate(u) for u in rows], total, limit, offset)


@v1_bp.get('/candidates/{candidate_id}')
def get_candidate(
    candidate_id: int,
    principal: ApiKeyPrincipal = Depends(require_scopes('candidates:read')),
):
    target = User.query.get(candidate_id)
    # 404 for out of company, never 403 — see AdminScope.require_user for why.
    principal.scope.require_user(target)
    return _candidate(target)


@v1_bp.put('/candidates/{candidate_id}')
def update_candidate(
    candidate_id: int,
    payload: dict = Body(default=None),
    principal: ApiKeyPrincipal = Depends(require_scopes('candidates:write')),
):
    """Update the fields an integration has any business setting.

    An allowlist, not an exclusion list. A blocklist has to be updated every time a column
    is added, and the update that is forgotten is the one that lets an integration write
    `role`.
    """
    target = User.query.get(candidate_id)
    principal.scope.require_user(target)

    data = payload or {}
    changed = []

    if 'course_status' in data:
        value = (data.get('course_status') or '').strip().lower()
        if value not in ('ongoing', 'completed'):
            raise HTTPException(status_code=400, detail="course_status must be 'ongoing' or 'completed'")
        if target.course_status != value:
            changed.append(f"course_status '{target.course_status}' -> '{value}'")
            target.course_status = value

    if 'name' in data:
        value = (data.get('name') or '').strip()
        if not value:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        if target.name != value:
            changed.append('name')
            target.name = value

    if changed:
        db.session.add(AdminLog(
            admin_id=principal.api_key.created_by,
            action='API_CANDIDATE_UPDATED',
            details=f"API key {principal.api_key.key_prefix} updated user {target.id}: "
                    + ', '.join(changed),
            actor_role='api_key',
        api_key_id=principal.api_key.id,
        ))
    db.session.commit()
    return _candidate(target)


@v1_bp.post('/candidates/{candidate_id}/invite')
def send_invite(
    candidate_id: int,
    payload: dict = Body(default=None),
    principal: ApiKeyPrincipal = Depends(require_scopes('invites:send')),
):
    """Issue one-time interview credentials, the same way the Admin Hub does.

    Reuses the eligibility rule rather than restating it: a second copy would drift, and the
    version that drifts is the one that lets somebody sit an interview they had not
    completed the course for.

    Optional body: {"questionDifficulty": "EASY_TO_MEDIUM" | "MEDIUM_TO_HARD" | "EASY_TO_HARD"}
    pins this candidate's interview to that range — see app/utils/difficulty.py.
    """
    data = payload or {}
    difficulty_range = (data.get('questionDifficulty') or data.get('question_difficulty_range') or '').strip().upper() or None
    if difficulty_range and not is_valid_range(difficulty_range):
        raise HTTPException(
            status_code=400,
            detail="questionDifficulty must be one of EASY_TO_MEDIUM, MEDIUM_TO_HARD, EASY_TO_HARD"
        )

    target = User.query.get(candidate_id)
    principal.scope.require_user(target)

    if requires_course_status(target.course_category) and target.course_status != 'completed':
        raise HTTPException(
            status_code=400,
            detail="This candidate's course status must be 'completed' before inviting them."
        )
    if not target.cnic:
        raise HTTPException(status_code=400, detail="This candidate has no CNIC on record.")

    otp = generate_otp()
    target.must_use_otp = True
    target.set_otp(otp)
    target.interview_status = 'invited'
    # Cleared for the same reason the admin route clears it: a deadline left over from a
    # bulk invite would make this fresh credential fail at login as "expired".
    target.otp_expires_at = None
    if difficulty_range:
        target.question_difficulty_range = difficulty_range

    db.session.add(AdminLog(
        admin_id=principal.api_key.created_by,
        action='API_INTERVIEW_INVITE',
        details=f"API key {principal.api_key.key_prefix} issued interview credentials to "
                f"user {target.id} ({target.email}).",
        actor_role='api_key',
        api_key_id=principal.api_key.id,
    ))
    db.session.commit()

    subject, html = email_templates.completed_signup(target.name, target.cnic, otp)
    EmailService.send(
        target.email, subject, html,
        email_type='interview_invite', user_id=target.id,
    )
    return {'message': 'Interview credentials sent.', 'candidate': _candidate(target)}


@v1_bp.post('/bulk-invites')
def create_bulk_invite(
    payload: dict = Body(default=None),
    principal: ApiKeyPrincipal = Depends(require_scopes('invites:send')),
):
    """Create a batch of candidate accounts and issue interview invites to all of them.

    The equivalent of the Admin Hub's Bulk Email Module, reached by an integration instead
    of an admin filling in a form. Each row is created in exactly the same state a bulk
    admin invite produces — CNIC username, one-time password, the free signup token grant —
    because it runs through the SAME background worker (_process_batch), not a rewrite of
    it. Rows: [{name, email, cnic, category, course_status}, ...], the same shape the Bulk
    Email Module's CSV template uses.

    The company is the key's own — never a choice in the payload. Unlike an admin, who can
    hold several companies and picks one per batch, a key is bound to exactly one, so there
    is nothing to choose and nothing to get wrong.

    Returns immediately with a batch id; the accounts are created and the emails sent on a
    background thread, because sending fifty-plus invites can take minutes and a request
    left open that long is the kind of thing an integration's own timeout kills first.
    """
    data = payload or {}
    rows = data.get('rows') or []
    subject = (data.get('subject') or '').strip()
    personalize = bool(data.get('personalize', True))
    batch_name = (data.get('batch_name') or '').strip()[:120] or None
    file_name = (data.get('file_name') or '').strip() or None

    if not subject:
        raise HTTPException(status_code=400, detail="subject is required")
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="rows must be a non-empty list")
    if len(rows) > BULK_MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many rows - the limit is {BULK_MAX_ROWS} per batch."
        )

    # Question Difficulty Range: a row may set its own "questionDifficulty" (normalized here
    # to the "difficulty_range" key _validate_row/_create_and_invite actually read), or the
    # whole batch can set one as the default for every row that doesn't.
    rows = [
        {**(r or {}), 'difficulty_range': (r or {}).get('questionDifficulty') or (r or {}).get('difficulty_range')}
        for r in rows
    ]
    batch_difficulty_range = (data.get('questionDifficulty') or data.get('difficulty_range') or '').strip().upper() or None
    if batch_difficulty_range and not is_valid_range(batch_difficulty_range):
        raise HTTPException(
            status_code=400,
            detail="questionDifficulty must be one of EASY_TO_MEDIUM, MEDIUM_TO_HARD, EASY_TO_HARD"
        )
    rows = _bulk_apply_batch_difficulty_default(rows, batch_difficulty_range)

    # A key never chooses its company (it's bound to exactly one for its whole life — see
    # this route's own docstring), so there's no company_id to resolve here, only to check
    # each row's category against; company_allows_category handles the check identically to
    # the Admin Hub's own bulk-email path (this shares that same _bulk_validate_rows call).
    results = _bulk_validate_rows(rows, company_id=principal.api_key.company_id)
    invalid = [r for r in results if not r['valid']]
    if invalid:
        # Refuses the WHOLE batch rather than sending the valid rows and reporting the
        # rest as failed — the same choice the admin flow makes, so a caller fixes its
        # source data once instead of discovering a half-sent batch and having to work out
        # which rows already went out before retrying.
        raise HTTPException(
            status_code=400,
            detail=(
                f"{len(invalid)} row(s) failed validation. Nothing was sent. First problem "
                f"— row {invalid[0]['index'] + 1}: {'; '.join(invalid[0]['errors'])}"
            ),
        )

    normalized = [r['normalized'] for r in results]

    batch = BulkEmailBatch(
        admin_id=principal.api_key.created_by,
        api_key_id=principal.api_key.id,
        company_id=principal.api_key.company_id,
        file_name=file_name,
        subject=subject,
        batch_name=batch_name,
        personalize=personalize,
        status='pending',
        total_count=len(normalized),
        sent_count=0,
        failed_count=0,
    )
    db.session.add(batch)
    db.session.add(AdminLog(
        admin_id=principal.api_key.created_by,
        action='API_BULK_INVITE_STARTED',
        details=f"API key {principal.api_key.key_prefix} started a bulk invitation batch "
                f"of {len(normalized)} recipient(s) with subject '{subject}'.",
        actor_role='api_key',
        api_key_id=principal.api_key.id,
    ))
    db.session.commit()

    batch_id = batch.id
    threading.Thread(target=_bulk_process_batch, args=(batch_id, normalized), daemon=True).start()

    return {
        'message': f'Sending {len(normalized)} invitation(s) in the background.',
        'batch': batch.to_dict(),
    }


@v1_bp.get('/bulk-invites/{batch_id}')
def get_bulk_invite(
    batch_id: int,
    principal: ApiKeyPrincipal = Depends(require_scopes('invites:send')),
):
    """Poll one batch's progress: how many sent, how many failed, and why."""
    batch = BulkEmailBatch.query.get(batch_id)
    principal.scope.require_company_owned(batch)
    return {'batch': batch.to_dict()}


@v1_bp.get('/bulk-invites')
def list_bulk_invites(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    principal: ApiKeyPrincipal = Depends(require_scopes('invites:send')),
):
    query = principal.scope.filter_by_company(BulkEmailBatch.query, BulkEmailBatch.company_id)
    rows, total = _page(query, limit, offset, BulkEmailBatch.created_at)
    return _envelope([b.to_dict() for b in rows], total, limit, offset)


# ---------------------------------------------------------------------------------------
# Interviews
# ---------------------------------------------------------------------------------------

@v1_bp.get('/interviews')
def list_interviews(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    candidate_id: int = Query(None),
    status: str = Query(None),
    principal: ApiKeyPrincipal = Depends(require_scopes('interviews:read')),
):
    query = principal.scope.filter_by_owner(Interview.query, Interview.user_id)
    if candidate_id is not None:
        query = query.filter(Interview.user_id == candidate_id)
    if status:
        query = query.filter(Interview.status == status)
    rows, total = _page(query, limit, offset, Interview.created_at)
    return _envelope([_interview(i) for i in rows], total, limit, offset)


@v1_bp.get('/interviews/{interview_id}')
def get_interview(
    interview_id: int,
    principal: ApiKeyPrincipal = Depends(require_scopes('interviews:read')),
):
    interview = Interview.query.get(interview_id)
    principal.scope.require_owned(interview)
    return _interview(interview)


@v1_bp.get('/interviews/{interview_id}/report')
def get_interview_report(
    interview_id: int,
    principal: ApiKeyPrincipal = Depends(require_scopes('interviews:read')),
):
    """The scored result: per-question scores and the overall outcome."""
    interview = Interview.query.get(interview_id)
    principal.scope.require_owned(interview)

    report = InterviewReport.query.filter_by(interview_id=interview_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="No report has been generated for this interview.")

    questions = (
        InterviewQuestion.query.filter_by(interview_id=interview_id)
        .order_by(InterviewQuestion.order_num).all()
    )
    responses = {
        r.question_id: r
        for r in InterviewResponse.query.filter_by(interview_id=interview_id).all()
    }

    return {
        'interview': _interview(interview),
        'overall_score': interview.overall_score,
        'questions': [
            {
                'order': q.order_num,
                'question': q.question_text,
                'type': q.question_type,
                'score': responses[q.id].score if q.id in responses else None,
                'confidence': responses[q.id].confidence_score if q.id in responses else None,
            }
            for q in questions
        ],
    }


@v1_bp.get('/interviews/{interview_id}/recording')
def get_interview_recording(
    interview_id: int,
    principal: ApiKeyPrincipal = Depends(require_scopes('recordings:read')),
):
    """A short-lived signed URL. Recordings are never public — this is the only way to one.

    Its own scope, separate from interviews:read, because a score is a fact about an
    interview and a recording is video of a person's face and home.
    """
    from app.utils.supabase_service import SupabaseService

    interview = Interview.query.get(interview_id)
    principal.scope.require_owned(interview)

    if not interview.video_path:
        raise HTTPException(status_code=404, detail="No recording exists for this session.")
    signed = SupabaseService.get_signed_url(interview.video_path, expires_in=600)
    if not signed:
        raise HTTPException(status_code=503, detail="Could not generate a playback link right now.")
    return {'video_url': signed, 'expires_in': 600}


@v1_bp.delete('/interviews/{interview_id}')
def delete_interview(
    interview_id: int,
    principal: ApiKeyPrincipal = Depends(require_scopes('interviews:delete')),
):
    interview = Interview.query.get(interview_id)
    principal.scope.require_owned(interview)

    db.session.add(AdminLog(
        admin_id=principal.api_key.created_by,
        action='API_INTERVIEW_DELETED',
        details=f"API key {principal.api_key.key_prefix} deleted interview {interview_id} "
                f"(candidate {interview.user_id}).",
        actor_role='api_key',
        api_key_id=principal.api_key.id,
    ))
    db.session.delete(interview)
    db.session.commit()
    return {'message': 'Interview deleted.'}


# ---------------------------------------------------------------------------------------
# Proctoring
# ---------------------------------------------------------------------------------------

@v1_bp.get('/proctor-snapshots')
def list_proctor_snapshots(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    interview_id: int = Query(None),
    principal: ApiKeyPrincipal = Depends(require_scopes('proctor_snapshots:read')),
):
    query = principal.scope.filter_by_owner(ProctorSnapshot.query, ProctorSnapshot.user_id)
    if interview_id is not None:
        query = query.filter(ProctorSnapshot.interview_id == interview_id)
    rows, total = _page(query, limit, offset, ProctorSnapshot.captured_at)
    return _envelope([s.to_dict() for s in rows], total, limit, offset)


# ---------------------------------------------------------------------------------------
# Re-interview requests
# ---------------------------------------------------------------------------------------

@v1_bp.get('/reinterview-requests')
def list_reinterview_requests(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    status: str = Query(None),
    principal: ApiKeyPrincipal = Depends(require_scopes('reinterview:decide')),
):
    query = principal.scope.filter_by_owner(
        SecondInterviewRequest.query, SecondInterviewRequest.user_id
    )
    if status:
        query = query.filter(SecondInterviewRequest.status == status)
    rows, total = _page(query, limit, offset, SecondInterviewRequest.requested_at)
    return _envelope([r.to_dict() for r in rows], total, limit, offset)


@v1_bp.post('/reinterview-requests/{request_id}/decision')
def decide_reinterview(
    request_id: int,
    payload: dict = Body(default=None),
    principal: ApiKeyPrincipal = Depends(require_scopes('reinterview:decide')),
):
    req = SecondInterviewRequest.query.get(request_id)
    principal.scope.require_owned(req)
    if req.status != 'pending':
        raise HTTPException(status_code=400, detail=f"This request has already been {req.status}.")

    decision = ((payload or {}).get('decision') or '').lower()
    if decision not in ('approve', 'reject'):
        raise HTTPException(status_code=400, detail="decision must be 'approve' or 'reject'")

    candidate = User.query.get(req.user_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="That candidate no longer exists.")

    req.decided_at = datetime.datetime.utcnow()
    req.decided_by = principal.api_key.created_by

    otp = None
    if decision == 'approve':
        req.status = 'approved'
        otp = generate_otp()
        candidate.must_use_otp = True
        candidate.set_otp(otp)
        candidate.interview_status = 'reinterview_approved'
    else:
        req.status = 'rejected'
        candidate.interview_status = 'reinterview_rejected'

    db.session.add(AdminLog(
        admin_id=principal.api_key.created_by,
        action=f'API_REINTERVIEW_{req.status.upper()}',
        details=f"API key {principal.api_key.key_prefix} {req.status} the second-interview "
                f"request for user {candidate.id}.",
        actor_role='api_key',
        api_key_id=principal.api_key.id,
    ))
    db.session.commit()

    if decision == 'approve':
        subject, html = email_templates.reinterview_approved(req.name, candidate.cnic, otp)
    else:
        subject, html = email_templates.reinterview_rejected(req.name)
    EmailService.send(
        req.email, subject, html,
        email_type=f'reinterview_{req.status}', user_id=candidate.id,
    )

    return {'message': f'Request {req.status}.', 'request': req.to_dict()}


# ---------------------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------------------

@v1_bp.get('/analytics/summary')
def analytics_summary(
    principal: ApiKeyPrincipal = Depends(require_scopes('analytics:read')),
):
    """Headline numbers for this key's company. Aggregates only — no per-person rows, so an
    integration that only needs a dashboard never has to be given candidates:read."""
    scope = principal.scope

    candidates = scope.filter_users(User.query.filter(User.role == 'candidate')).count()
    interviews_completed = scope.filter_by_owner(
        Interview.query.filter(Interview.status == 'completed'), Interview.user_id
    ).count()
    average = scope.filter_by_owner(
        db.session.query(func.avg(Interview.overall_score))
        .filter(Interview.status == 'completed', Interview.overall_score.isnot(None)),
        Interview.user_id,
    ).scalar()

    return {
        'company_id': principal.api_key.company_id,
        'candidates': candidates,
        'interviews_completed': interviews_completed,
        'average_score': round(float(average), 2) if average is not None else None,
    }


@v1_bp.get('/transactions')
def list_transactions(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    principal: ApiKeyPrincipal = Depends(require_scopes('transactions:read')),
):
    query = principal.scope.filter_by_owner(Transaction.query, Transaction.user_id)
    rows, total = _page(query, limit, offset, Transaction.created_at)
    return _envelope([t.to_dict() for t in rows], total, limit, offset)


@v1_bp.get('/audit-log')
def list_audit_log(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    principal: ApiKeyPrincipal = Depends(require_scopes('audit:read')),
):
    """Actions taken by THIS key, not the whole platform's audit trail.

    Scoped to the key rather than to its company, which is narrower than every other route
    here and deliberately so. A log entry's `details` names candidates in free text, so an
    entry written by a human admin of the same company can still carry information no
    integration was given a scope for. The key's own actions are the only cut that is
    certainly safe — the same reasoning that scopes the admin log to its own actor.
    """
    query = AdminLog.query.filter(AdminLog.api_key_id == principal.api_key.id)
    rows, total = _page(query, limit, offset, AdminLog.created_at)
    return _envelope([l.to_dict() for l in rows], total, limit, offset)
