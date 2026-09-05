import re
import base64
import datetime
from typing import Optional
from fastapi import APIRouter, Body, HTTPException, status, Depends
from sqlalchemy import or_, func, case
from app.database.db import db
from app.models import (
    User, Token, Transaction, Interview, Feedback, AdminLog,
    InterviewResponse, InterviewQuestion, SecondInterviewRequest, EmailLog,
    Notification, CodeSubmission, InterviewReport, RecordingLog, ProctorSnapshot,
    ResumeAnalysis
)
from app.utils.security import admin_required, get_current_user_id, ADMIN_ROLES
from app.utils.scope import AdminScope, admin_scope
from app.utils.permissions import require_permissions
from app.utils.curriculum import company_allows_category
from app.utils.candidate import (
    COURSE_CATEGORIES, COURSE_STATUSES, SIGNUP_CATEGORIES, INSTRUCTOR_CATEGORY,
    is_instructor_category, requires_course_status, normalize_cnic, generate_otp
)
from app.email import EmailService
from app.email import templates as email_templates

admin_bp = APIRouter()

EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

# A user is "online" if their heartbeat was seen within this window (§4.2). Kept
# short since the frontend also clears last_seen_at explicitly on logout/tab-close,
# so this window only covers ungraceful disconnects (crash, network drop).
ONLINE_WINDOW_SECONDS = 60


def _is_online(user):
    if not user.last_seen_at:
        return False
    return (datetime.datetime.utcnow() - user.last_seen_at).total_seconds() <= ONLINE_WINDOW_SECONDS


def _user_directory(user_ids=None):
    """{user_id: User} in ONE query, for endpoints that decorate rows with a name/email.

    The app runs in Singapore and the database is in Mumbai, so every round trip costs
    roughly 60ms of pure network time regardless of how small or well-indexed the query is.
    A `User.query.get()` inside a loop therefore charges 60ms PER ROW: the admin lists were
    spending five to eleven seconds doing nothing but waiting. Fetching the whole directory
    once turns any number of those lookups into a single trip.
    """
    query = User.query
    if user_ids is not None:
        ids = {uid for uid in user_ids if uid is not None}
        if not ids:
            return {}
        query = query.filter(User.id.in_(ids))
    return {u.id: u for u in query.all()}

@admin_bp.get('/stats')
def get_stats(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
              _perm: User = Depends(require_permissions('analytics:read'))):
    # Each of these used to be its own round trip: six separate COUNTs, plus the whole
    # transactions and tokens tables pulled into Python just to be summed. Aggregating in
    # SQL collapses that to one trip per table and moves the arithmetic to the database,
    # which is where it belongs — and stops the totals growing slower as the tables do.
    yesterday = datetime.datetime.utcnow() - datetime.timedelta(days=1)

    def _count_if(condition):
        return func.count(case((condition, 1)))

    # Every total below is scoped. A dashboard that shows the whole platform's numbers to
    # one company's admin leaks headcount and activity even though it names nobody.
    total_users, active_users, banned_users = scope.filter_users(db.session.query(
        _count_if(User.role == 'candidate'),
        _count_if((User.role == 'candidate') & (User.status == 'active')),
        _count_if(User.status == 'banned'),
    )).one()

    total_interviews, active_interviews, daily_interviews = scope.filter_by_owner(db.session.query(
        _count_if(Interview.status == 'completed'),
        _count_if(Interview.status == 'active'),
        _count_if((Interview.status == 'completed') & (Interview.created_at >= yesterday)),
    ), Interview.user_id).one()

    total_revenue = scope.filter_by_owner(db.session.query(
        func.coalesce(func.sum(Transaction.amount), 0.0)
    ).filter(Transaction.transaction_type == 'purchase'), Transaction.user_id).scalar()

    total_available_tokens, total_consumed_tokens = scope.filter_by_owner(db.session.query(
        func.coalesce(func.sum(Token.tokens_available), 0),
        func.coalesce(func.sum(Token.tokens_consumed), 0),
    ), Token.user_id).one()

    recent_feedbacks = scope.filter_by_owner(
        Feedback.query, Feedback.user_id
    ).order_by(Feedback.created_at.desc()).limit(5).all()
    feedback_users = _user_directory(f.user_id for f in recent_feedbacks)
    feedbacks_data = []
    for f in recent_feedbacks:
        u = feedback_users.get(f.user_id)
        feedbacks_data.append({
            'id': f.id,
            'user_name': u.name if u else 'Unknown',
            'rating': f.rating,
            'feedback_text': f.feedback_text,
            'issues_reported': f.issues_reported,
            'created_at': f.created_at.isoformat()
        })

    logs = scope.filter_by_actor(
        AdminLog.query, AdminLog.admin_id
    ).order_by(AdminLog.created_at.desc()).limit(10).all()

    return {
        'users': {
            'total': total_users,
            'active': active_users,
            'banned': banned_users
        },
        'interviews': {
            'completed': total_interviews,
            'active': active_interviews,
            'daily': daily_interviews
        },
        'revenue': {
            'total': round(total_revenue, 2),
            'currency': 'USD'
        },
        'tokens': {
            'total_available': total_available_tokens,
            'total_consumed': total_consumed_tokens
        },
        'feedbacks': feedbacks_data,
        'logs': [l.to_dict() for l in logs]
    }

@admin_bp.get('/users')
def list_users(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                _perm: User = Depends(require_permissions('candidates:read'))):
    # Three queries total, not two per user. This endpoint used to issue one Token lookup
    # and one Interview lookup for every row — 89 round trips for 44 candidates, which at
    # Singapore-to-Mumbai latency is over five seconds of pure waiting.
    users = scope.filter_users(
        User.query.filter(User.role.notin_(ADMIN_ROLES))
    ).order_by(User.created_at.desc()).all()

    tokens_by_user = {
        t.user_id: t.tokens_available
        for t in Token.query.filter(Token.user_id.in_([u.id for u in users])).all()
    } if users else {}

    # Most recent interview per candidate, so the frontend can link a row straight to the
    # latest report with no extra request per click (Admin Hub §5). Only interviews that
    # actually HAVE a report qualify — the newest Interview row can be one still in
    # progress, or abandoned with no report ever generated, and linking a candidate's name
    # to that produced a dead-end "Report not generated yet" page instead of a result.
    #
    # DISTINCT ON is Postgres picking the first row of each user's ordered group, which is
    # exactly "their latest reported interview" — the same answer the per-user query gave,
    # in one trip instead of one per candidate.
    latest_by_user = {
        row.user_id: row.id
        for row in (
            Interview.query
            .join(InterviewReport, InterviewReport.interview_id == Interview.id)
            .distinct(Interview.user_id)
            .order_by(Interview.user_id, Interview.created_at.desc())
            .all()
        )
    }

    users_list = []
    for u in users:
        u_dict = u.to_dict()
        u_dict['tokens_available'] = tokens_by_user.get(u.id, 0)
        u_dict['online'] = _is_online(u)
        u_dict['latest_interview_id'] = latest_by_user.get(u.id)
        users_list.append(u_dict)

    return users_list


@admin_bp.get('/users/{target_user_id}')
def get_user_detail(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                     _perm: User = Depends(require_permissions('candidates:read'))):
    """Single-candidate fetch for the Admin Hub profile page — same shape as one row of
    GET /users, so a direct load/refresh/bookmark of the profile page doesn't need the
    full list re-fetched just to find one row."""
    target = User.query.get(target_user_id)
    if not target or target.role in ADMIN_ROLES:
        raise HTTPException(status_code=404, detail="User not found")
    scope.require_user(target)

    t = Token.query.filter_by(user_id=target.id).first()
    latest_interview = (
        Interview.query
        .join(InterviewReport, InterviewReport.interview_id == Interview.id)
        .filter(Interview.user_id == target.id)
        .order_by(Interview.created_at.desc())
        .first()
    )
    u_dict = target.to_dict()
    u_dict['tokens_available'] = t.tokens_available if t else 0
    u_dict['online'] = _is_online(target)
    u_dict['latest_interview_id'] = latest_interview.id if latest_interview else None
    return u_dict


@admin_bp.get('/users/{target_user_id}/resume')
def get_user_resume(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                     _perm: User = Depends(require_permissions('candidates:read'))):
    """Admin-only: the resume a Resume-Based candidate's interview was generated from
    (Resume §4.2).

    Without this an admin reviewing the report has no way to judge whether the questions
    actually matched the CV — which is the one thing that can go wrong in this category and
    nowhere else. The raw text is included deliberately; the original file is never retained,
    so this is the whole document as the generator saw it.

    Returns the most recent analysis, matching what start_interview reads: a candidate
    approved for a second attempt uploads a fresh CV, and the report should be read against
    the one their questions actually came from.
    """
    target = User.query.get(target_user_id)
    scope.require_user(target)

    record = (
        ResumeAnalysis.query
        .filter_by(user_id=target_user_id)
        .order_by(ResumeAnalysis.created_at.desc())
        .first()
    )
    if not record:
        return {'has_resume': False}

    flagged_by_admin = User.query.get(record.flagged_by) if record.flagged_by else None
    return {
        'has_resume': True,
        'resume': record.to_dict(include_raw_text=True),
        'flagged_by_name': flagged_by_admin.name if flagged_by_admin else None,
    }


@admin_bp.post('/resume-analyses/{analysis_id}/flag')
def flag_resume_analysis(
    analysis_id: int,
    payload: dict = Body(default=None),
    user: User = Depends(admin_required),
    scope: AdminScope = Depends(admin_scope),
    _perm: User = Depends(require_permissions('candidates:write')),
):
    """Admin-only: mark a resume as badly parsed, or clear that mark (Resume §4.2).

    Purely an operational signal — nothing branches on it, no interview changes. It exists
    so a garbled PDF or a missed skill set is visible as the cause of a poor interview
    instead of being mistaken for a bad candidate, and so recurring extraction failures can
    be seen rather than guessed at.
    """
    record = ResumeAnalysis.query.get(analysis_id)
    if not record:
        raise HTTPException(status_code=404, detail="Resume analysis not found")
    scope.require_owned(record)

    data = payload or {}
    flagged = bool(data.get('flagged', True))

    if flagged:
        reason = (data.get('reason') or '').strip()
        if not reason:
            raise HTTPException(
                status_code=400,
                detail="Please describe what the resume analysis got wrong."
            )
        record.flagged_at = datetime.datetime.utcnow()
        record.flagged_by = user.id
        record.flag_reason = reason[:500]
        action, detail = 'FLAG_RESUME_ANALYSIS', f"Flagged resume analysis {record.id} (user {record.user_id}): {reason[:200]}"
    else:
        record.flagged_at = None
        record.flagged_by = None
        record.flag_reason = None
        action, detail = 'UNFLAG_RESUME_ANALYSIS', f"Cleared the flag on resume analysis {record.id} (user {record.user_id})"

    try:
        db.session.add(AdminLog(admin_id=user.id, action=action, details=detail))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Could not update the flag: {str(e)}")

    return {'message': 'Flag updated', 'resume': record.to_dict()}


@admin_bp.get('/users/{target_user_id}/proctoring')
def get_user_proctoring(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                         _perm: User = Depends(require_permissions('proctor_snapshots:read'))):
    """Admin-only: the proctoring snapshot + summary for a candidate's most recent
    interview. A camera snapshot is captured both when an interview is completed and
    when it is auto-terminated for a proctoring breach, so this drives the review panel
    on the Manage Users profile. Returns nulls when there is no interview/snapshot yet."""
    target = User.query.get(target_user_id)
    scope.require_user(target)

    interview = (
        Interview.query.filter_by(user_id=target_user_id)
        .order_by(Interview.created_at.desc())
        .first()
    )
    if not interview:
        return {'has_interview': False}

    report = InterviewReport.query.filter_by(interview_id=interview.id).first()

    return {
        'has_interview': True,
        'interview_id': interview.id,
        'status': interview.status,
        'is_proctor_failed': bool(interview.is_proctor_failed),
        'terminated_reason': interview.terminated_reason,
        'proctor_violations_count': interview.proctor_violations_count or 0,
        'snapshot_image': report.snapshot_image if report else None,
        'snapshot_description': report.snapshot_description if report else None,
        'created_at': interview.created_at.isoformat() if interview.created_at else None,
    }


@admin_bp.put('/users/{target_user_id}/profile')
def update_user_profile(target_user_id: int, payload: dict = Body(default=None), user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                         _perm: User = Depends(require_permissions('candidates:write'))):
    """Full candidate profile editing (§4.1) — including course status, which only
    an admin may change after signup (§2.2)."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role in ADMIN_ROLES and target.id != user.id:
        raise HTTPException(status_code=400, detail="Cannot edit another administrator's account")
    if target.id != user.id:
        # Editing one's own account stays open regardless of scope — an admin's own row has
        # no company_id and would otherwise be unreachable to them.
        scope.require_user(target)

    data = payload or {}
    changes = []

    if data.get('name'):
        if target.name != data['name']:
            changes.append(f"name '{target.name}' → '{data['name']}'")
        target.name = data['name']

    if data.get('email'):
        new_email = data['email'].strip()
        if not re.match(EMAIL_REGEX, new_email):
            raise HTTPException(status_code=400, detail="Invalid email format")
        owner = User.query.filter_by(email=new_email).first()
        if owner and owner.id != target.id:
            raise HTTPException(status_code=409, detail="Another account already uses this email")
        if target.email != new_email:
            changes.append(f"email '{target.email}' → '{new_email}'")
        target.email = new_email

    if data.get('cnic'):
        new_cnic = normalize_cnic(data['cnic'])
        if not new_cnic:
            raise HTTPException(status_code=400, detail="Invalid CNIC format (13 digits required)")
        owner = User.query.filter_by(cnic=new_cnic).first()
        if owner and owner.id != target.id:
            raise HTTPException(status_code=409, detail="Another account already uses this CNIC")
        if target.cnic != new_cnic:
            changes.append(f"CNIC '{target.cnic}' → '{new_cnic}'")
        target.cnic = new_cnic

    if data.get('course_category'):
        new_category = data['course_category']
        # Leaving a candidate's category exactly as it is must always be allowed, even for a
        # LEGACY value no longer in SIGNUP_CATEGORIES (curriculum feature) — otherwise saving
        # ANY unrelated field on that candidate's profile (name, remarks, anything) would be
        # rejected outright, since the edit form always resubmits the current category as
        # part of the payload. Only an actual CHANGE is held to the current, selectable list.
        if new_category != target.course_category and new_category not in SIGNUP_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        # Curriculum feature: an actual change must also be a type this candidate's own
        # company is allowed to use — never trusts that the admin's category dropdown had
        # already filtered it out client-side.
        if new_category != target.course_category and not company_allows_category(target.company_id, new_category):
            raise HTTPException(status_code=403, detail="This interview type is not enabled for your company.")
        if target.course_category != new_category:
            changes.append(f"category '{target.course_category}' → '{new_category}'")
        target.course_category = new_category

    if data.get('course_status'):
        new_status = data['course_status'].lower()
        if new_status not in COURSE_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid course status")
        if target.course_status != new_status:
            changes.append(f"course status '{target.course_status}' → '{new_status}'")
        # Per the confirmed workflow: flipping the status does NOT auto-send credentials.
        # The admin explicitly triggers the interview invite (send-interview-invite).
        target.course_status = new_status

    for field in ('country', 'experience_level', 'job_role'):
        if data.get(field) is not None and data[field] != '':
            if getattr(target, field) != data[field]:
                changes.append(f"{field} → '{data[field]}'")
            setattr(target, field, data[field])

    # Admin remarks: allow setting or clearing (empty string clears the note).
    if 'admin_remarks' in data:
        new_remarks = (data.get('admin_remarks') or '').strip() or None
        if target.admin_remarks != new_remarks:
            changes.append('admin remarks updated')
        target.admin_remarks = new_remarks

    db.session.add(AdminLog(
        admin_id=user.id,
        action='EDIT_PROFILE',
        details=f"Edited profile of User ID {target.id} ({target.email}): " + ('; '.join(changes) if changes else 'no changes')
    ))

    try:
        db.session.commit()
        return {'message': 'Profile updated successfully', 'user': target.to_dict()}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@admin_bp.post('/users/{target_user_id}/send-interview-invite')
def send_interview_invite(target_user_id: int, payload: dict = Body(default=None),
                           user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                           _perm: User = Depends(require_permissions('invites:send'))):
    """Issue (or re-issue) one-time interview credentials to a completed-course
    candidate (§2.2 confirmed workflow: admin manually triggers the OTP email).

    From this moment the candidate's password login is disabled and only the fresh
    emailed OTP works — exactly once.
    """
    from app.utils.difficulty import is_valid_range
    difficulty_range = ((payload or {}).get('question_difficulty_range') or '').strip().upper() or None
    if difficulty_range and not is_valid_range(difficulty_range):
        raise HTTPException(status_code=400, detail="Invalid question_difficulty_range")

    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role in ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="Cannot send an interview invite to an administrator")
    scope.require_user(target)

    # Only true Instructors get the instructor-worded invite. Resume-Based candidates are
    # also status-less but take the standard candidate wording, same as they do at signup.
    instructor = is_instructor_category(target.course_category)

    # Eligible: Completed-course candidates, OR any category that has no course-status at
    # all (Instructor, Resume-Based). Those qualify by category instead — requiring
    # 'completed' of them would be requiring a field they can never have.
    if requires_course_status(target.course_category) and target.course_status != 'completed':
        raise HTTPException(
            status_code=400,
            detail="Candidate's course status must be 'Completed' before sending an interview invite. "
                   "Update their course status first."
        )
    if not target.cnic:
        raise HTTPException(status_code=400, detail="Candidate has no CNIC on record — edit their profile first.")

    otp = generate_otp()
    try:
        target.must_use_otp = True
        target.set_otp(otp)  # also resets otp_used to False
        target.interview_status = 'invited'
        # Clears any deadline left over from an earlier Bulk Email Module invite. This is a
        # fresh, individually-issued credential — otp_expires_at is only ever meant to be set
        # by the bulk flow (bulk_email_routes.py) — so without this, a candidate re-invited
        # after their old bulk deadline passed would get a working-looking OTP that
        # login (auth_routes.py) then still rejects as "expired", and the admin dashboard
        # would keep showing the stale old date as if this invite never happened.
        target.otp_expires_at = None
        # Only overwritten when this invite explicitly names a range — re-inviting without
        # one keeps whatever range (if any) an earlier invite already set, instead of
        # silently clearing it back to "no range" on every re-issue.
        if difficulty_range:
            target.question_difficulty_range = difficulty_range

        db.session.add(AdminLog(
            admin_id=user.id,
            action='SEND_INTERVIEW_INVITE',
            details=f"Issued one-time interview credentials to User ID {target.id} ({target.email}, CNIC {target.cnic})"
                    + (f" with question difficulty range {difficulty_range}" if difficulty_range else "")
        ))
        db.session.add(Notification(
            user_id=target.id,
            title='Official Interview Invitation',
            message='You have been invited to your official interview. Check your email for one-time login credentials.',
            type='interview'
        ))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to issue invite: {str(e)}")

    if instructor:
        subject, html = email_templates.instructor_invite(target.name, target.cnic, otp)
    else:
        subject, html = email_templates.completed_signup(target.name, target.cnic, otp)
    EmailService.send(target.email, subject, html, email_type='interview_invite', user_id=target.id)

    return {'message': f'One-time interview credentials sent to {target.email}', 'user': target.to_dict()}


@admin_bp.get('/reinterview-requests')
def list_reinterview_requests(user_id: Optional[int] = None, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                               _perm: User = Depends(require_permissions('reinterview:decide'))):
    """Approval queue for second-interview attempts (§4.3). Optional user_id scopes this to
    one candidate's approval history (cross-linked from their profile)."""
    requests_query = scope.filter_by_owner(
        SecondInterviewRequest.query, SecondInterviewRequest.user_id
    )
    if user_id is not None:
        requests_query = requests_query.filter_by(user_id=user_id)
    requests_q = requests_query.order_by(SecondInterviewRequest.requested_at.desc()).all()

    # Up to four round trips per row otherwise: the candidate, the linked first interview,
    # a fallback lookup for it, and the deciding admin.
    people = _user_directory(
        [r.user_id for r in requests_q] + [r.decided_by for r in requests_q]
    )
    linked_ids = {r.first_interview_id for r in requests_q if r.first_interview_id}
    linked_interviews = (
        {i.id: i for i in Interview.query.filter(Interview.id.in_(linked_ids)).all()}
        if linked_ids else {}
    )
    # Fallback for legacy rows whose FK is null: the candidate's latest completed interview.
    candidate_ids = {r.user_id for r in requests_q if r.user_id}
    latest_completed = {}
    if candidate_ids:
        for itv in (
            Interview.query
            .filter(Interview.user_id.in_(candidate_ids), Interview.status == 'completed')
            .distinct(Interview.user_id)
            .order_by(Interview.user_id, Interview.created_at.desc())
            .all()
        ):
            latest_completed[itv.user_id] = itv

    pending, decided = [], []
    for r in requests_q:
        d = r.to_dict()
        candidate = people.get(r.user_id)
        d['course_category'] = candidate.course_category if candidate else None
        d['course_status'] = candidate.course_status if candidate else None

        first_itv = linked_interviews.get(r.first_interview_id) if r.first_interview_id else None
        if not first_itv and candidate:
            first_itv = latest_completed.get(candidate.id)
        # The stored FK can be null on legacy requests — always report the resolved id
        # (whichever path found it) so the frontend has a reliable "View First Interview" link.
        d['first_interview_id'] = first_itv.id if first_itv else None
        d['first_interview_date'] = first_itv.created_at.isoformat() if first_itv else None
        d['first_interview_score'] = first_itv.overall_score if first_itv else None
        d['first_interview_proctor_failed'] = bool(first_itv.is_proctor_failed) if first_itv else None

        if r.decided_by:
            decider = people.get(r.decided_by)
            d['decided_by_name'] = decider.name if decider else 'Unknown'

        (pending if r.status == 'pending' else decided).append(d)

    return {'pending': pending, 'decided': decided}


@admin_bp.post('/reinterview-requests/{request_id}/decision')
def decide_reinterview_request(request_id: int, payload: dict = Body(default=None), user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                                _perm: User = Depends(require_permissions('reinterview:decide'))):
    """Approve → fresh one-time credentials emailed; Reject → ineligibility email (§3.4)."""
    req = SecondInterviewRequest.query.get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    scope.require_owned(req)
    if req.status != 'pending':
        raise HTTPException(status_code=400, detail=f"This request has already been {req.status}")

    data = payload or {}
    decision = (data.get('decision') or '').lower()
    if decision not in ('approve', 'reject'):
        raise HTTPException(status_code=400, detail="Decision must be 'approve' or 'reject'")

    candidate = User.query.get(req.user_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate account no longer exists")

    otp = None
    try:
        req.decided_at = datetime.datetime.utcnow()
        req.decided_by = user.id

        if decision == 'approve':
            req.status = 'approved'
            otp = generate_otp()
            candidate.must_use_otp = True
            candidate.set_otp(otp)  # resets otp_used → login works exactly once again
            candidate.interview_status = 'reinterview_approved'
            action, details = 'APPROVE_REINTERVIEW', \
                f"Approved second interview for {candidate.name} (CNIC {candidate.cnic}); one-time credentials emailed."
        else:
            req.status = 'rejected'
            candidate.interview_status = 'reinterview_rejected'
            action, details = 'REJECT_REINTERVIEW', \
                f"Rejected second interview for {candidate.name} (CNIC {candidate.cnic}); ineligibility email sent."

        db.session.add(AdminLog(admin_id=user.id, action=action, details=details))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record decision: {str(e)}")

    if decision == 'approve':
        subject, html = email_templates.reinterview_approved(req.name, candidate.cnic, otp)
        EmailService.send(req.email, subject, html, email_type='reinterview_approved', user_id=candidate.id)
    else:
        subject, html = email_templates.reinterview_rejected(req.name)
        EmailService.send(req.email, subject, html, email_type='reinterview_rejected', user_id=candidate.id)

    return {'message': f'Request {req.status}. The candidate has been emailed.', 'request': req.to_dict()}


@admin_bp.get('/email-logs')
def list_email_logs(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                     _perm: User = Depends(require_permissions('audit:read'))):
    """Outbound email audit (§1): failed sends surface here instead of dying silently."""
    # Scoped by recipient. An email log row carries the candidate's address and the
    # subject line of what was sent to them, so an unscoped list is a candidate list.
    logs = scope.filter_by_owner(
        EmailLog.query, EmailLog.user_id
    ).order_by(EmailLog.created_at.desc()).limit(200).all()
    return [l.to_dict() for l in logs]


@admin_bp.get('/recording-logs')
def list_recording_logs(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                         _perm: User = Depends(require_permissions('audit:read'))):
    """Interview-recording lifecycle audit: when each answer recording was created and,
    once the retention window elapses, when it was automatically deleted."""
    logs = scope.filter_by_owner(
        RecordingLog.query, RecordingLog.user_id
    ).order_by(RecordingLog.created_at.desc()).limit(300).all()
    return [l.to_dict() for l in logs]


@admin_bp.get('/pending-actions/count')
def pending_actions_count(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope)):
    """Counts for the in-portal admin badge (Update §4) — replaces admin email alerts."""
    reinterview_pending = scope.filter_by_owner(
        SecondInterviewRequest.query.filter_by(status='pending'),
        SecondInterviewRequest.user_id,
    ).count()
    return {
        'reinterview_pending': reinterview_pending,
        'total': reinterview_pending,
    }


def _send_post_interview_email(target_user_id, admin, kind, scope):
    """Shared handler for the two post-interview admin email actions (Update §5):
    'clearance' and 'hr_invite'. Sends a distinct template, records the timestamp for
    the profile audit trail, logs the admin action, and notifies the candidate.

    Takes the caller's scope rather than re-deriving it: both entry points are already
    scoped routes, and a helper that quietly widened access would undo them."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role in ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="This action does not apply to administrator accounts")
    scope.require_user(target)

    if kind == 'clearance':
        subject, html = email_templates.interview_clearance(target.name)
        email_type = 'interview_clearance'
        target.clearance_email_sent_at = datetime.datetime.utcnow()
        action = 'SEND_CLEARANCE_EMAIL'
        notif_title = 'Interview Cleared'
        notif_msg = 'Congratulations! You have cleared your interview. Please check your email.'
        ok_msg = f'Clearance email sent to {target.email}'
    else:  # hr_invite
        subject, html = email_templates.hr_assessment_invite(target.name)
        email_type = 'hr_assessment_invite'
        target.hr_invite_sent_at = datetime.datetime.utcnow()
        action = 'SEND_HR_INVITE'
        notif_title = 'HR Assessment Invitation'
        notif_msg = 'You have been invited to the HR assessment stage. Please check your email.'
        ok_msg = f'HR assessment invite sent to {target.email}'

    try:
        db.session.add(AdminLog(
            admin_id=admin.id, action=action,
            details=f"{action} for User ID {target.id} ({target.email})"
        ))
        db.session.add(Notification(
            user_id=target.id, title=notif_title, message=notif_msg, type='activity'
        ))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record action: {str(e)}")

    EmailService.send(target.email, subject, html, email_type=email_type, user_id=target.id)
    return {'message': ok_msg, 'user': target.to_dict()}


@admin_bp.post('/users/{target_user_id}/send-clearance')
def send_clearance_email(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                          _perm: User = Depends(require_permissions('invites:send'))):
    """'Send Clearance Email' (Update §5): informs the candidate/instructor they cleared."""
    return _send_post_interview_email(target_user_id, user, 'clearance', scope)


@admin_bp.post('/users/{target_user_id}/send-hr-invite')
def send_hr_invite_email(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                          _perm: User = Depends(require_permissions('invites:send'))):
    """'Send HR Assessment Invite' (Update §5): distinct next-stage HR invitation."""
    return _send_post_interview_email(target_user_id, user, 'hr_invite', scope)


@admin_bp.post('/users/{target_user_id}/send-proctor-snapshot')
def send_proctor_snapshot_email(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                                 _perm: User = Depends(require_permissions('proctor_snapshots:read'))):
    """Email the candidate their proctoring camera snapshot (attached) along with a
    termination + 30-day-block notice. Uses the snapshot from the candidate's most
    recent interview report."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role in ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="This action does not apply to administrator accounts")
    scope.require_user(target)

    interview = (
        Interview.query.filter_by(user_id=target_user_id)
        .order_by(Interview.created_at.desc())
        .first()
    )
    report = InterviewReport.query.filter_by(interview_id=interview.id).first() if interview else None
    if not report or not report.snapshot_image:
        raise HTTPException(status_code=400, detail="No proctoring snapshot is available for this candidate.")

    # The snapshot is stored as a data URL ("data:image/jpeg;base64,...."). Strip the
    # prefix and decode to raw bytes for the email attachment.
    raw = report.snapshot_image
    mimetype = 'image/jpeg'
    if raw.startswith('data:'):
        try:
            header, raw = raw.split(',', 1)
            mimetype = header.split(';')[0].replace('data:', '') or mimetype
        except ValueError:
            raise HTTPException(status_code=400, detail="Stored snapshot is malformed.")
    try:
        image_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode the stored snapshot.")

    subject, html = email_templates.proctoring_termination_notice(target.name)

    try:
        db.session.add(AdminLog(
            admin_id=user.id, action='SEND_PROCTOR_SNAPSHOT',
            details=f"Emailed proctoring snapshot + termination notice to User ID {target.id} ({target.email})"
        ))
        db.session.add(Notification(
            user_id=target.id, title='Interview Terminated',
            message='Your interview was terminated for a proctoring violation. Please check your email.',
            type='activity'
        ))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record action: {str(e)}")

    EmailService.send(
        target.email, subject, html,
        email_type='proctoring_termination', user_id=target.id,
        attachments=[{
            'filename': 'proctoring-snapshot.jpg',
            'content': image_bytes,
            'mimetype': mimetype,
        }]
    )
    return {'message': f'Proctoring snapshot emailed to {target.email}'}

@admin_bp.post('/users/{target_user_id}/ban')
def toggle_ban(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                _perm: User = Depends(require_permissions('candidates:write'))):
    admin_id = user.id
    target_user = User.query.get(target_user_id)

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.role in ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="Cannot restrict administrative accounts")
    scope.require_user(target_user)

    new_status = 'banned' if target_user.status == 'active' else 'active'
    target_user.status = new_status
    if new_status == 'active':
        target_user.banned_until = None
    
    log = AdminLog(
        admin_id=admin_id,
        action='TOGGLE_BAN',
        details=f"Changed status of User ID {target_user_id} ({target_user.email}) to {new_status}"
    )
    db.session.add(log)
    
    try:
        db.session.commit()
        return {
            'message': f"User status changed successfully to {new_status}",
            'user': target_user.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update user status: {str(e)}")

@admin_bp.post('/users/{target_user_id}/tokens')
def override_tokens(target_user_id: int, payload: dict = Body(default=None), user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                     _perm: User = Depends(require_permissions('candidates:write'))):
    admin_id = user.id
    data = payload or {}
    new_balance = data.get('tokens_available')

    if new_balance is None or int(new_balance) < 0:
        raise HTTPException(status_code=400, detail="Valid token balance is required")

    target_user = User.query.get(target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    scope.require_user(target_user)

    token_account = Token.query.filter_by(user_id=target_user_id).first()
    if not token_account:
        token_account = Token(user_id=target_user_id, tokens_available=0)
        db.session.add(token_account)

    old_balance = token_account.tokens_available
    token_account.tokens_available = int(new_balance)

    log = AdminLog(
        admin_id=admin_id,
        action='OVERRIDE_TOKENS',
        details=f"Overwrote tokens of User ID {target_user_id} ({target_user.email}) from {old_balance} to {new_balance}"
    )
    db.session.add(log)

    try:
        db.session.commit()
        return {
            'message': f"User tokens balance updated successfully to {new_balance}",
            'tokens': token_account.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to override user tokens: {str(e)}")

# ---------------------------------------------------------------------------
# Admin deletion (destructive, irreversible). Admins can delete any record type,
# but ADMIN ACCOUNTS CAN NEVER BE DELETED. Every deletion is written to the audit log.
# ---------------------------------------------------------------------------

def _collect_user_storage_refs(uid, target):
    """Every Supabase Storage object belonging to a user, gathered BEFORE the DB rows
    disappear (Cascade §4.2): per-answer audio, full-session videos, proctoring snapshots,
    profile picture. Returns a list of (bucket, path) tuples."""
    from app.utils.supabase_service import SupabaseService
    refs = []
    interview_ids = [i.id for i in Interview.query.filter_by(user_id=uid).all()]
    if interview_ids:
        for resp in InterviewResponse.query.filter(
                InterviewResponse.interview_id.in_(interview_ids)).all():
            parsed = SupabaseService.parse_storage_ref(resp.audio_path)
            if parsed:
                refs.append(parsed)
        for iv in Interview.query.filter(Interview.id.in_(interview_ids)).all():
            parsed = SupabaseService.parse_storage_ref(iv.video_path)
            if parsed:
                refs.append(parsed)
    # Proctoring images (webcam/screen/termination/identity frames) live in their own
    # private bucket and are indexed by ProctorSnapshot. They were previously missed here,
    # so deleting a candidate left every snapshot orphaned in Supabase Storage. Matched on
    # user_id AND the user's interview ids, so a row whose user_id was already nulled by an
    # earlier FK 'SET NULL' is still cleaned up.
    snap_filter = [ProctorSnapshot.user_id == uid]
    if interview_ids:
        snap_filter.append(ProctorSnapshot.interview_id.in_(interview_ids))
    for snap in ProctorSnapshot.query.filter(or_(*snap_filter)).all():
        parsed = SupabaseService.parse_storage_ref(snap.storage_ref)
        if parsed:
            refs.append(parsed)
    parsed = SupabaseService.parse_storage_ref(target.profile_pic_url)
    if parsed:
        refs.append(parsed)
    return refs


def _delete_storage_refs(refs, context_label, admin_id=None):
    """Best-effort removal of Supabase Storage objects AFTER the DB transaction commits
    (§4.3 — Postgres cascades can't touch object storage). Any failure is logged loudly,
    and recorded as an AdminLog row when an admin id is available, so orphans are
    traceable and manually cleanable instead of silently accumulating."""
    from app.utils.supabase_service import SupabaseService
    failed = []
    for bucket, path in refs:
        if not SupabaseService.delete_object(bucket, path):
            failed.append(f"{bucket}/{path}")
    if failed:
        print(f"[cascade-delete] STORAGE CLEANUP INCOMPLETE for {context_label}: "
              f"{len(failed)} object(s) need manual removal: {', '.join(failed[:10])}")
        if admin_id:
            try:
                db.session.add(AdminLog(
                    admin_id=admin_id, action='STORAGE_CLEANUP_NEEDED',
                    details=f"While deleting {context_label}, these storage objects could not "
                            f"be removed and must be cleaned up manually: {', '.join(failed)}"
                ))
                db.session.commit()
            except Exception:
                db.session.rollback()
    return len(refs) - len(failed), len(failed)


def _anonymize_user_in_logs(target):
    """Retain-but-anonymize policy (confirmed §4.2): audit rows survive, but every
    identifying detail of the deleted user is scrubbed from them."""
    uid = target.id
    # Email delivery audit: detach + redact the recipient address.
    EmailLog.query.filter_by(user_id=uid).update(
        {'user_id': None, 'to_email': '[deleted-user]'}, synchronize_session=False)
    EmailLog.query.filter_by(to_email=target.email).update(
        {'to_email': '[deleted-user]'}, synchronize_session=False)
    # Admin action log: free-text details may embed the user's email/CNIC/name — find
    # affected rows with targeted LIKE queries, then scrub each match in place.
    needles = [n for n in (target.email, target.cnic, target.name) if n and len(n) >= 4]
    seen = {}
    for n in needles:
        for log in AdminLog.query.filter(AdminLog.details.like(f'%{n}%')).all():
            seen[log.id] = log
    for log in seen.values():
        scrubbed = log.details
        for n in needles:
            scrubbed = scrubbed.replace(n, '[deleted user]')
        log.details = scrubbed


@admin_bp.delete('/users/{target_user_id}')
def delete_user(target_user_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                 _perm: User = Depends(require_permissions('candidates:write'))):
    """Permanently delete a candidate/instructor account and ALL their data — database
    rows AND Supabase Storage files (Cascade §4). Admin accounts are hard-blocked.

    Order matters: storage refs are collected first, the whole database removal commits
    as one transaction (so a partial failure rolls back cleanly), and only then are the
    storage objects deleted — a failed object delete can never leave the DB half-done,
    and every storage failure is logged for manual cleanup. Audit logs are retained but
    anonymized per the confirmed policy."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Administrator accounts cannot be deleted.")
    scope.require_user(target)

    uid = target.id
    target_name = target.name
    storage_refs = _collect_user_storage_refs(uid, target)
    # Needed below to clear proctoring snapshots that are indexed by interview as well as
    # by user; captured before the interviews are cascade-deleted.
    interview_ids = [i.id for i in Interview.query.filter_by(user_id=uid).all()]

    try:
        # Explicitly clear rows not handled by the User relationship cascades.
        Transaction.query.filter_by(user_id=uid).delete(synchronize_session=False)
        CodeSubmission.query.filter_by(user_id=uid).delete(synchronize_session=False)
        SecondInterviewRequest.query.filter_by(user_id=uid).delete(synchronize_session=False)
        # ProctorSnapshot's user_id FK is ON DELETE SET NULL and has no ORM cascade, so
        # without this the index rows survived the candidate's deletion as orphans that
        # kept showing up in the admin snapshot archive. Delete them explicitly (their
        # storage objects were collected above and are removed after the commit).
        snap_filter = [ProctorSnapshot.user_id == uid]
        if interview_ids:
            snap_filter.append(ProctorSnapshot.interview_id.in_(interview_ids))
        ProctorSnapshot.query.filter(or_(*snap_filter)).delete(synchronize_session=False)

        # Retain-but-anonymize the audit trail (confirmed §4.2 policy).
        _anonymize_user_in_logs(target)

        # ORM cascade handles tokens, interviews (+questions/responses/report),
        # resume/JD analyses, notifications, and feedback.
        db.session.delete(target)

        db.session.add(AdminLog(
            admin_id=user.id, action='DELETE_USER',
            details=f"Permanently deleted user ID {uid} and all associated data "
                    f"({len(storage_refs)} stored media file(s) queued for removal)."
        ))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

    # DB is consistent; now remove the media files from Supabase Storage.
    ok, failed = _delete_storage_refs(storage_refs, f"user {uid}", admin_id=user.id)

    msg = f'{target_name} and all their data have been permanently deleted.'
    if failed:
        msg += f' Warning: {failed} stored media file(s) could not be removed and were logged for manual cleanup.'
    return {'message': msg}


def _delete_record(model, record_id, admin, label, action, scope, pre_delete=None,
                   owner_attr='user_id'):
    """Shared handler for deleting a single data record with audit logging.

    `scope` is required rather than optional. Six routes funnel through here, all of them
    destructive and all addressed by a bare integer id; an optional scope is one forgotten
    keyword away from letting an admin delete another company's records by guessing.
    Pass owner_attr=None for a table that hangs off the acting admin rather than a
    candidate.
    """
    record = model.query.get(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    if owner_attr is None:
        # admin_logs: scoped by who wrote the row, exactly as the listing is.
        if not scope.is_super and getattr(record, 'admin_id', None) != scope.admin.id:
            raise HTTPException(status_code=404, detail=f"{label} not found")
    else:
        scope.require_owned(record, owner_attr)
    try:
        if pre_delete:
            pre_delete(record)
        db.session.delete(record)
        db.session.add(AdminLog(
            admin_id=admin.id, action=action,
            details=f"Deleted {label} ID {record_id}."
        ))
        db.session.commit()
        return {'message': f'{label} deleted successfully.'}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete {label.lower()}: {str(e)}")


@admin_bp.delete('/interviews/{interview_id}')
def delete_interview(interview_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                      _perm: User = Depends(require_permissions('interviews:delete'))):
    """Delete an interview and its questions/responses/report (ORM cascade), plus its
    stored media — answer audio, session video and proctoring snapshots — from Supabase
    Storage (Cascade §4). Detaches any feedback / code submissions that referenced it so
    they aren't orphaned."""
    from app.utils.supabase_service import SupabaseService
    # Collect storage refs before the rows vanish.
    refs = []
    itv = Interview.query.get(interview_id)
    if itv:
        # Checked here as well as inside _delete_record: the block below reads storage
        # references for the interview, and there is no reason to touch another company's
        # rows at all before refusing.
        scope.require_owned(itv)
        for resp in InterviewResponse.query.filter_by(interview_id=interview_id).all():
            parsed = SupabaseService.parse_storage_ref(resp.audio_path)
            if parsed:
                refs.append(parsed)
        parsed = SupabaseService.parse_storage_ref(itv.video_path)
        if parsed:
            refs.append(parsed)
        # Proctoring images for this interview — previously missed, leaving them orphaned
        # in the private snapshot bucket after the interview row was gone.
        for snap in ProctorSnapshot.query.filter_by(interview_id=interview_id).all():
            parsed = SupabaseService.parse_storage_ref(snap.storage_ref)
            if parsed:
                refs.append(parsed)

    def _detach(_itv):
        Feedback.query.filter_by(interview_id=interview_id).update({'interview_id': None}, synchronize_session=False)
        CodeSubmission.query.filter_by(interview_id=interview_id).update({'interview_id': None}, synchronize_session=False)
        # ProctorSnapshot.interview_id is a plain column (no FK cascade), so its index rows
        # must be removed explicitly or they linger pointing at a deleted interview.
        ProctorSnapshot.query.filter_by(interview_id=interview_id).delete(synchronize_session=False)

    result = _delete_record(Interview, interview_id, user, 'Interview', 'DELETE_INTERVIEW',
                            scope, pre_delete=_detach)
    _delete_storage_refs(refs, f"interview {interview_id}", admin_id=user.id)
    return result


@admin_bp.delete('/feedback/{feedback_id}')
def delete_feedback(feedback_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                     _perm: User = Depends(require_permissions('candidates:write'))):
    return _delete_record(Feedback, feedback_id, user, 'Feedback', 'DELETE_FEEDBACK', scope)


@admin_bp.delete('/transactions/{transaction_id}')
def delete_transaction(transaction_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                        _perm: User = Depends(require_permissions('transactions:read'))):
    return _delete_record(Transaction, transaction_id, user, 'Transaction', 'DELETE_TRANSACTION', scope)


@admin_bp.delete('/logs/{log_id}')
def delete_admin_log(log_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                      _perm: User = Depends(require_permissions('audit:read'))):
    return _delete_record(AdminLog, log_id, user, 'Audit log', 'DELETE_ADMIN_LOG', scope,
                          owner_attr=None)


@admin_bp.delete('/email-logs/{log_id}')
def delete_email_log(log_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                      _perm: User = Depends(require_permissions('audit:read'))):
    return _delete_record(EmailLog, log_id, user, 'Email log', 'DELETE_EMAIL_LOG', scope)


@admin_bp.delete('/recording-logs/{log_id}')
def delete_recording_log(log_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                          _perm: User = Depends(require_permissions('audit:read'))):
    return _delete_record(RecordingLog, log_id, user, 'Recording log', 'DELETE_RECORDING_LOG', scope)


@admin_bp.delete('/reinterview-requests/{request_id}')
def delete_reinterview_request(request_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                                _perm: User = Depends(require_permissions('reinterview:decide'))):
    return _delete_record(SecondInterviewRequest, request_id, user, 'Second-interview request',
                          'DELETE_REINTERVIEW_REQUEST', scope)


@admin_bp.get('/proctor-snapshots')
def list_proctor_snapshots(
    interview_id: Optional[int] = None,
    user_id: Optional[int] = None,
    user: User = Depends(admin_required),
    scope: AdminScope = Depends(admin_scope),
    _perm: User = Depends(require_permissions('proctor_snapshots:read')),
):
    """Proctoring image archive index (newest first): termination webcam frames and
    monitored screen screenshots. Images live in a PRIVATE Supabase bucket under
    user_<id>/<date>/ — this returns only the metadata rows; view URLs are fetched
    on demand per image via the /url endpoint below. Optional filters scope this to one
    interview (cross-linked from a report) or one candidate (cross-linked from a profile);
    the unfiltered call keeps its existing 400-row cap."""
    query = scope.filter_by_owner(ProctorSnapshot.query, ProctorSnapshot.user_id)
    if interview_id is not None:
        query = query.filter_by(interview_id=interview_id)
    if user_id is not None:
        query = query.filter_by(user_id=user_id)
    query = query.order_by(ProctorSnapshot.captured_at.desc())
    if interview_id is None and user_id is None:
        query = query.limit(400)
    return [s.to_dict() for s in query.all()]


@admin_bp.get('/proctor-snapshots/{snapshot_id}/url')
def get_proctor_snapshot_url(snapshot_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                              _perm: User = Depends(require_permissions('proctor_snapshots:read'))):
    """Short-lived signed URL to view one archived proctoring image. These are sensitive
    (a candidate's camera/screen), so they are never public — this is the only way in."""
    from app.utils.supabase_service import SupabaseService
    snap = ProctorSnapshot.query.get(snapshot_id)
    if not snap or not snap.storage_ref:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    scope.require_owned(snap)
    signed = SupabaseService.get_signed_url(snap.storage_ref, expires_in=600)
    if not signed:
        raise HTTPException(status_code=503, detail="Could not generate a view link right now")
    return {'image_url': signed, 'expires_in': 600}


@admin_bp.delete('/proctor-snapshots/{snapshot_id}')
def delete_proctor_snapshot(snapshot_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                             _perm: User = Depends(require_permissions('proctor_snapshots:read'))):
    """Permanently remove one archived proctoring image — both the stored file and its
    index row (Cascade §4: a DB delete can't reach Supabase Storage, so do it here)."""
    from app.utils.supabase_service import SupabaseService
    snap = ProctorSnapshot.query.get(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    scope.require_owned(snap)
    parsed = SupabaseService.parse_storage_ref(snap.storage_ref)
    if parsed:
        SupabaseService.delete_object(parsed[0], parsed[1])
    db.session.delete(snap)
    db.session.add(AdminLog(
        admin_id=user.id,
        action='DELETE_PROCTOR_SNAPSHOT',
        details=f"Deleted proctoring snapshot #{snapshot_id} ({snap.kind}) for interview {snap.interview_id}"
    ))
    db.session.commit()
    return {'message': 'Proctoring snapshot deleted'}


@admin_bp.post('/interviews/{interview_id}/assemble-recording')
def assemble_interview_recording(interview_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                                  _perm: User = Depends(require_permissions('recordings:read'))):
    """Rebuild a session recording from the slices the candidate's browser uploaded.

    The candidate's own finalize call is the normal path, but it runs at the moment they are
    being redirected away, so it can be missed — a closed tab, a dead connection, a
    terminated session. The slices are already stored regardless, so this lets an admin
    recover the footage afterwards instead of it being lost with the session that produced
    it. Scoped to admins because it acts on another user's interview.
    """
    from app.utils.supabase_service import SupabaseService
    from app.models import RecordingLog
    interview = Interview.query.get(interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    scope.require_owned(interview)
    if interview.video_path:
        return {'message': 'A recording is already stored for this session', 'stored': True}

    parts = SupabaseService.list_interview_video_parts(interview.user_id, interview_id)
    if not parts:
        raise HTTPException(
            status_code=404,
            detail="No recording slices exist for this session — nothing to recover."
        )

    final_ref = SupabaseService.assemble_interview_video(interview.user_id, interview_id)
    if not final_ref:
        raise HTTPException(status_code=502, detail="Could not assemble the recording from its slices")

    candidate = User.query.get(interview.user_id)
    interview.video_path = final_ref
    db.session.add(RecordingLog(
        user_id=interview.user_id,
        candidate_email=candidate.email if candidate else None,
        interview_id=interview_id, question_id=None,
        storage_ref=final_ref, status='active',
    ))
    db.session.add(AdminLog(
        admin_id=user.id, action='ASSEMBLE_RECORDING',
        details=f"Recovered the session recording for Interview ID {interview_id} from {len(parts)} stored slice(s).",
    ))
    db.session.commit()
    return {'message': f'Recording recovered from {len(parts)} slice(s)', 'stored': True}


@admin_bp.get('/interviews/{interview_id}/video-url')
def get_interview_video_url(interview_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                             _perm: User = Depends(require_permissions('recordings:read'))):
    """Admin-only playback of a session recording (DB Integration §2.2): returns a
    short-lived signed URL into the PRIVATE interview-recordings bucket. Recordings are
    never publicly reachable — this is the only way they're served."""
    from app.utils.supabase_service import SupabaseService
    interview = Interview.query.get(interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    scope.require_owned(interview)
    if not interview.video_path:
        raise HTTPException(status_code=404, detail="No recording exists for this session")
    signed = SupabaseService.get_signed_url(interview.video_path, expires_in=600)
    if not signed:
        raise HTTPException(status_code=503, detail="Could not generate a playback link right now")
    return {'video_url': signed, 'expires_in': 600}


@admin_bp.get('/interviews')
def list_interviews(user_id: Optional[int] = None, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                     _perm: User = Depends(require_permissions('interviews:read'))):
    query = scope.filter_by_owner(Interview.query, Interview.user_id)
    if user_id is not None:
        query = query.filter_by(user_id=user_id)
    interviews = query.order_by(Interview.created_at.desc()).all()
    users = _user_directory(i.user_id for i in interviews)
    interviews_list = []
    for i in interviews:
        u = users.get(i.user_id)
        d = i.to_dict()
        d['user_name'] = u.name if u else 'Unknown'
        d['user_email'] = u.email if u else ''
        interviews_list.append(d)
    return interviews_list

@admin_bp.get('/transactions')
def list_transactions(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                       _perm: User = Depends(require_permissions('transactions:read'))):
    transactions = scope.filter_by_owner(
        Transaction.query, Transaction.user_id
    ).order_by(Transaction.created_at.desc()).all()
    users = _user_directory(t.user_id for t in transactions)
    tx_list = []
    for t in transactions:
        u = users.get(t.user_id)
        d = t.to_dict()
        d['user_name'] = u.name if u else 'Unknown'
        d['user_email'] = u.email if u else ''
        tx_list.append(d)
    return tx_list

@admin_bp.get('/feedback')
def list_feedbacks(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                    _perm: User = Depends(require_permissions('candidates:read'))):
    feedbacks = scope.filter_by_owner(
        Feedback.query, Feedback.user_id
    ).order_by(Feedback.created_at.desc()).all()
    users = _user_directory(f.user_id for f in feedbacks)
    interview_ids = {f.interview_id for f in feedbacks if f.interview_id}
    interviews = (
        {i.id: i for i in Interview.query.filter(Interview.id.in_(interview_ids)).all()}
        if interview_ids else {}
    )
    feedbacks_list = []
    for f in feedbacks:
        u = users.get(f.user_id)
        i = interviews.get(f.interview_id) if f.interview_id else None
        feedbacks_list.append({
            'id': f.id,
            'user_name': u.name if u else 'Unknown',
            'user_email': u.email if u else '',
            'rating': f.rating,
            'feedback_text': f.feedback_text,
            'issues_reported': f.issues_reported,
            # Per-category scores from the post-interview form; {} for the report-page form
            # and anything submitted before categories existed. Decoded by Feedback.to_dict,
            # which is reused here rather than duplicating the JSON parsing and its
            # malformed-blob guard.
            'category_ratings': f.to_dict()['category_ratings'],
            'job_role': i.job_role if i else 'N/A',
            'created_at': f.created_at.isoformat()
        })
    return feedbacks_list

@admin_bp.get('/logs')
def list_logs(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
               _perm: User = Depends(require_permissions('audit:read'))):
    logs = scope.filter_by_actor(
        AdminLog.query, AdminLog.admin_id
    ).order_by(AdminLog.created_at.desc()).all()
    admins = _user_directory(l.admin_id for l in logs)
    logs_list = []
    for l in logs:
        u = admins.get(l.admin_id)
        d = l.to_dict()
        d['admin_name'] = u.name if u else 'System'
        d['admin_email'] = u.email if u else ''
        logs_list.append(d)
    return logs_list


def _is_flagged(response):
    """A response needs manual review if the LLM was low-confidence or the fallback
    marked it (matches the persistence in §2)."""
    if response.confidence_score is not None and response.confidence_score < 40:
        return True
    return (response.feedback or '').startswith('[FLAGGED')


@admin_bp.get('/scoring/analytics')
def scoring_analytics(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                       _perm: User = Depends(require_permissions('analytics:read'))):
    """Aggregate view of how the LLM has been scoring interviews (§7).

    Built entirely from the persisted per-question evaluation data (score, confidence,
    rationale) — no separate evaluation pipeline.
    """
    completed = scope.filter_by_owner(
        Interview.query.filter_by(status='completed'), Interview.user_id
    ).order_by(Interview.created_at.desc()).all()

    # Two extra queries for the whole report instead of two per interview: every response
    # in one trip, grouped in memory, plus the candidate directory. At 81 completed
    # interviews the old shape was ~160 round trips to build a single page.
    responses_by_interview = {}
    if completed:
        for r in InterviewResponse.query.filter(
            InterviewResponse.interview_id.in_([i.id for i in completed])
        ).all():
            responses_by_interview.setdefault(r.interview_id, []).append(r)
    candidates = _user_directory(i.user_id for i in completed)

    all_scores, all_conf = [], []
    flagged_total, eval_total = 0, 0
    buckets = [0, 0, 0, 0, 0]  # 0-20, 20-40, 40-60, 60-80, 80-100
    interview_rows = []

    for itv in completed:
        responses = responses_by_interview.get(itv.id, [])
        if not responses:
            continue

        scores = [r.score for r in responses if r.score is not None]
        confs = [r.confidence_score for r in responses if r.confidence_score is not None]
        flagged = 0
        for r in responses:
            eval_total += 1
            if r.score is not None:
                all_scores.append(r.score)
                buckets[min(int(r.score // 20), 4)] += 1
            if r.confidence_score is not None:
                all_conf.append(r.confidence_score)
            if _is_flagged(r):
                flagged += 1
        flagged_total += flagged

        u = candidates.get(itv.user_id)
        interview_rows.append({
            'interview_id': itv.id,
            'candidate_name': u.name if u else 'Unknown',
            'job_role': itv.job_role,
            'type': itv.type,
            'question_count': len(responses),
            'avg_score': round(sum(scores) / len(scores), 1) if scores else 0,
            'avg_confidence': round(sum(confs) / len(confs), 1) if confs else 0,
            'flagged_count': flagged,
            'overall_score': itv.overall_score,
            'created_at': itv.created_at.isoformat() if itv.created_at else None,
        })

    overview = {
        'total_interviews': len(interview_rows),
        'total_evaluations': eval_total,
        'avg_score': round(sum(all_scores) / len(all_scores), 1) if all_scores else 0,
        'avg_confidence': round(sum(all_conf) / len(all_conf), 1) if all_conf else 0,
        'flagged_evaluations': flagged_total,
        'score_distribution': [
            {'range': '0-20', 'count': buckets[0]},
            {'range': '20-40', 'count': buckets[1]},
            {'range': '40-60', 'count': buckets[2]},
            {'range': '60-80', 'count': buckets[3]},
            {'range': '80-100', 'count': buckets[4]},
        ],
    }
    return {'overview': overview, 'interviews': interview_rows}


@admin_bp.get('/scoring/interviews/{interview_id}')
def scoring_interview_detail(interview_id: int, user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                              _perm: User = Depends(require_permissions('interviews:read'))):
    """Per-question breakdown for one interview: question, transcript, score, rationale (§7)."""
    itv = Interview.query.get(interview_id)
    if not itv:
        raise HTTPException(status_code=404, detail="Interview not found")
    scope.require_owned(itv)

    u = User.query.get(itv.user_id)
    questions = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
    resp_map = {r.question_id: r for r in InterviewResponse.query.filter_by(interview_id=interview_id).all()}

    items = []
    for q in questions:
        r = resp_map.get(q.id)
        feedback = (r.feedback if r else '') or ''
        items.append({
            'question': q.question_text,
            'question_type': q.question_type,
            'transcript': r.response_text if r else None,
            'score': r.score if r else None,
            'confidence': r.confidence_score if r else None,
            'technical_score': r.technical_score if r else None,
            'communication_score': r.communication_score if r else None,
            'rationale': feedback,
            'flagged': _is_flagged(r) if r else False,
        })

    return {
        'interview': {
            'id': itv.id,
            'candidate_name': u.name if u else 'Unknown',
            'job_role': itv.job_role,
            'type': itv.type,
            'difficulty': itv.difficulty,
            'overall_score': itv.overall_score,
            'created_at': itv.created_at.isoformat() if itv.created_at else None,
        },
        'questions': items,
    }
