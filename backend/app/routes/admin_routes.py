import re
import base64
import datetime
from fastapi import APIRouter, Request, HTTPException, status, Depends
from app.database.db import db
from app.models import (
    User, Token, Transaction, Interview, Feedback, AdminLog,
    InterviewResponse, InterviewQuestion, SecondInterviewRequest, EmailLog,
    Notification, CodeSubmission, InterviewReport, RecordingLog
)
from app.utils.security import admin_required, get_current_user_id
from app.utils.candidate import (
    COURSE_CATEGORIES, COURSE_STATUSES, SIGNUP_CATEGORIES, INSTRUCTOR_CATEGORY,
    is_instructor_category, normalize_cnic, generate_otp
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

@admin_bp.get('/stats')
async def get_stats(user: User = Depends(admin_required)):
    total_users = User.query.filter_by(role='candidate').count()
    active_users = User.query.filter_by(role='candidate', status='active').count()
    banned_users = User.query.filter_by(status='banned').count()

    total_interviews = Interview.query.filter_by(status='completed').count()
    active_interviews = Interview.query.filter_by(status='active').count()
    
    yesterday = datetime.datetime.utcnow() - datetime.timedelta(days=1)
    daily_interviews = Interview.query.filter(
        Interview.created_at >= yesterday,
        Interview.status == 'completed'
    ).count()

    purchases = Transaction.query.filter_by(transaction_type='purchase').all()
    total_revenue = sum(p.amount for p in purchases)

    tokens_query = Token.query.all()
    total_available_tokens = sum(t.tokens_available for t in tokens_query)
    total_consumed_tokens = sum(t.tokens_consumed for t in tokens_query)

    recent_feedbacks = Feedback.query.order_by(Feedback.created_at.desc()).limit(5).all()
    feedbacks_data = []
    for f in recent_feedbacks:
        u = User.query.get(f.user_id)
        feedbacks_data.append({
            'id': f.id,
            'user_name': u.name if u else 'Unknown',
            'rating': f.rating,
            'feedback_text': f.feedback_text,
            'issues_reported': f.issues_reported,
            'created_at': f.created_at.isoformat()
        })

    logs = AdminLog.query.order_by(AdminLog.created_at.desc()).limit(10).all()

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
async def list_users(user: User = Depends(admin_required)):
    users = User.query.filter(User.role != 'admin').order_by(User.created_at.desc()).all()
    users_list = []

    for u in users:
        t = Token.query.filter_by(user_id=u.id).first()
        t_val = t.tokens_available if t else 0
        u_dict = u.to_dict()
        u_dict['tokens_available'] = t_val
        u_dict['online'] = _is_online(u)
        users_list.append(u_dict)

    return users_list


@admin_bp.get('/users/{target_user_id}/proctoring')
async def get_user_proctoring(target_user_id: int, user: User = Depends(admin_required)):
    """Admin-only: the proctoring snapshot + summary for a candidate's most recent
    interview. A camera snapshot is captured both when an interview is completed and
    when it is auto-terminated for a proctoring breach, so this drives the review panel
    on the Manage Users profile. Returns nulls when there is no interview/snapshot yet."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

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
async def update_user_profile(target_user_id: int, request: Request, user: User = Depends(admin_required)):
    """Full candidate profile editing (§4.1) — including course status, which only
    an admin may change after signup (§2.2)."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == 'admin' and target.id != user.id:
        raise HTTPException(status_code=400, detail="Cannot edit another administrator's account")

    data = await request.json() or {}
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
        if data['course_category'] not in SIGNUP_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        if target.course_category != data['course_category']:
            changes.append(f"category '{target.course_category}' → '{data['course_category']}'")
        target.course_category = data['course_category']

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
async def send_interview_invite(target_user_id: int, user: User = Depends(admin_required)):
    """Issue (or re-issue) one-time interview credentials to a completed-course
    candidate (§2.2 confirmed workflow: admin manually triggers the OTP email).

    From this moment the candidate's password login is disabled and only the fresh
    emailed OTP works — exactly once.
    """
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == 'admin':
        raise HTTPException(status_code=400, detail="Cannot send an interview invite to an administrator")

    # Eligible: Completed-course candidates OR Instructors (Update §3). Instructors have
    # no course-status, so they qualify by category instead.
    instructor = is_instructor_category(target.course_category)
    if not instructor and target.course_status != 'completed':
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

        db.session.add(AdminLog(
            admin_id=user.id,
            action='SEND_INTERVIEW_INVITE',
            details=f"Issued one-time interview credentials to User ID {target.id} ({target.email}, CNIC {target.cnic})"
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
async def list_reinterview_requests(user: User = Depends(admin_required)):
    """Approval queue for second-interview attempts (§4.3)."""
    requests_q = SecondInterviewRequest.query.order_by(SecondInterviewRequest.requested_at.desc()).all()
    pending, decided = [], []
    for r in requests_q:
        d = r.to_dict()
        candidate = User.query.get(r.user_id)
        d['course_category'] = candidate.course_category if candidate else None
        d['course_status'] = candidate.course_status if candidate else None

        first_itv = Interview.query.get(r.first_interview_id) if r.first_interview_id else None
        if not first_itv and candidate:
            first_itv = Interview.query.filter_by(user_id=candidate.id, status='completed') \
                .order_by(Interview.created_at.desc()).first()
        d['first_interview_date'] = first_itv.created_at.isoformat() if first_itv else None
        d['first_interview_score'] = first_itv.overall_score if first_itv else None
        d['first_interview_proctor_failed'] = bool(first_itv.is_proctor_failed) if first_itv else None

        if r.decided_by:
            decider = User.query.get(r.decided_by)
            d['decided_by_name'] = decider.name if decider else 'Unknown'

        (pending if r.status == 'pending' else decided).append(d)

    return {'pending': pending, 'decided': decided}


@admin_bp.post('/reinterview-requests/{request_id}/decision')
async def decide_reinterview_request(request_id: int, request: Request, user: User = Depends(admin_required)):
    """Approve → fresh one-time credentials emailed; Reject → ineligibility email (§3.4)."""
    req = SecondInterviewRequest.query.get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != 'pending':
        raise HTTPException(status_code=400, detail=f"This request has already been {req.status}")

    data = await request.json() or {}
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
async def list_email_logs(user: User = Depends(admin_required)):
    """Outbound email audit (§1): failed sends surface here instead of dying silently."""
    logs = EmailLog.query.order_by(EmailLog.created_at.desc()).limit(200).all()
    return [l.to_dict() for l in logs]


@admin_bp.get('/recording-logs')
async def list_recording_logs(user: User = Depends(admin_required)):
    """Interview-recording lifecycle audit: when each answer recording was created and,
    once the retention window elapses, when it was automatically deleted."""
    logs = RecordingLog.query.order_by(RecordingLog.created_at.desc()).limit(300).all()
    return [l.to_dict() for l in logs]


@admin_bp.get('/pending-actions/count')
async def pending_actions_count(user: User = Depends(admin_required)):
    """Counts for the in-portal admin badge (Update §4) — replaces admin email alerts."""
    reinterview_pending = SecondInterviewRequest.query.filter_by(status='pending').count()
    return {
        'reinterview_pending': reinterview_pending,
        'total': reinterview_pending,
    }


def _send_post_interview_email(target_user_id, admin, kind):
    """Shared handler for the two post-interview admin email actions (Update §5):
    'clearance' and 'hr_invite'. Sends a distinct template, records the timestamp for
    the profile audit trail, logs the admin action, and notifies the candidate."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == 'admin':
        raise HTTPException(status_code=400, detail="This action does not apply to administrator accounts")

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
async def send_clearance_email(target_user_id: int, user: User = Depends(admin_required)):
    """'Send Clearance Email' (Update §5): informs the candidate/instructor they cleared."""
    return _send_post_interview_email(target_user_id, user, 'clearance')


@admin_bp.post('/users/{target_user_id}/send-hr-invite')
async def send_hr_invite_email(target_user_id: int, user: User = Depends(admin_required)):
    """'Send HR Assessment Invite' (Update §5): distinct next-stage HR invitation."""
    return _send_post_interview_email(target_user_id, user, 'hr_invite')


@admin_bp.post('/users/{target_user_id}/send-proctor-snapshot')
async def send_proctor_snapshot_email(target_user_id: int, user: User = Depends(admin_required)):
    """Email the candidate their proctoring camera snapshot (attached) along with a
    termination + 30-day-block notice. Uses the snapshot from the candidate's most
    recent interview report."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == 'admin':
        raise HTTPException(status_code=400, detail="This action does not apply to administrator accounts")

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
async def toggle_ban(target_user_id: int, user: User = Depends(admin_required)):
    admin_id = user.id
    target_user = User.query.get(target_user_id)

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.role == 'admin':
        raise HTTPException(status_code=400, detail="Cannot restrict administrative accounts")

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
async def override_tokens(target_user_id: int, request: Request, user: User = Depends(admin_required)):
    admin_id = user.id
    data = await request.json() or {}
    new_balance = data.get('tokens_available')

    if new_balance is None or int(new_balance) < 0:
        raise HTTPException(status_code=400, detail="Valid token balance is required")

    target_user = User.query.get(target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

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

@admin_bp.delete('/users/{target_user_id}')
async def delete_user(target_user_id: int, user: User = Depends(admin_required)):
    """Permanently delete a candidate/instructor account and ALL their data.

    Admin accounts are hard-blocked. Dependent rows that aren't covered by an ORM
    delete-orphan cascade are removed explicitly first, so the delete is consistent
    on both SQLite (FK enforcement often off) and PostgreSQL."""
    target = User.query.get(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == 'admin':
        raise HTTPException(status_code=403, detail="Administrator accounts cannot be deleted.")

    label = f"User ID {target.id} ({target.email}, CNIC {target.cnic or 'N/A'})"
    try:
        uid = target.id
        # Explicitly clear rows not handled by the User relationship cascades.
        Transaction.query.filter_by(user_id=uid).delete(synchronize_session=False)
        CodeSubmission.query.filter_by(user_id=uid).delete(synchronize_session=False)
        SecondInterviewRequest.query.filter_by(user_id=uid).delete(synchronize_session=False)
        # Preserve the outbound-email audit trail but detach it from the deleted user.
        EmailLog.query.filter_by(user_id=uid).update({'user_id': None}, synchronize_session=False)

        # ORM cascade handles tokens, interviews (+questions/responses/report),
        # resume/JD analyses, notifications, and feedback.
        db.session.delete(target)

        db.session.add(AdminLog(
            admin_id=user.id, action='DELETE_USER',
            details=f"Permanently deleted {label} and all associated data."
        ))
        db.session.commit()
        return {'message': f'{target.name} and all their data have been permanently deleted.'}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")


def _delete_record(model, record_id, admin, label, action, pre_delete=None):
    """Shared handler for deleting a single data record with audit logging."""
    record = model.query.get(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")
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
async def delete_interview(interview_id: int, user: User = Depends(admin_required)):
    """Delete an interview and its questions/responses/report (ORM cascade). Detaches
    any feedback / code submissions that referenced it so they aren't orphaned."""
    def _detach(_itv):
        Feedback.query.filter_by(interview_id=interview_id).update({'interview_id': None}, synchronize_session=False)
        CodeSubmission.query.filter_by(interview_id=interview_id).update({'interview_id': None}, synchronize_session=False)
    return _delete_record(Interview, interview_id, user, 'Interview', 'DELETE_INTERVIEW', pre_delete=_detach)


@admin_bp.delete('/feedback/{feedback_id}')
async def delete_feedback(feedback_id: int, user: User = Depends(admin_required)):
    return _delete_record(Feedback, feedback_id, user, 'Feedback', 'DELETE_FEEDBACK')


@admin_bp.delete('/transactions/{transaction_id}')
async def delete_transaction(transaction_id: int, user: User = Depends(admin_required)):
    return _delete_record(Transaction, transaction_id, user, 'Transaction', 'DELETE_TRANSACTION')


@admin_bp.delete('/logs/{log_id}')
async def delete_admin_log(log_id: int, user: User = Depends(admin_required)):
    return _delete_record(AdminLog, log_id, user, 'Audit log', 'DELETE_ADMIN_LOG')


@admin_bp.delete('/email-logs/{log_id}')
async def delete_email_log(log_id: int, user: User = Depends(admin_required)):
    return _delete_record(EmailLog, log_id, user, 'Email log', 'DELETE_EMAIL_LOG')


@admin_bp.delete('/recording-logs/{log_id}')
async def delete_recording_log(log_id: int, user: User = Depends(admin_required)):
    return _delete_record(RecordingLog, log_id, user, 'Recording log', 'DELETE_RECORDING_LOG')


@admin_bp.delete('/reinterview-requests/{request_id}')
async def delete_reinterview_request(request_id: int, user: User = Depends(admin_required)):
    return _delete_record(SecondInterviewRequest, request_id, user, 'Second-interview request', 'DELETE_REINTERVIEW_REQUEST')


@admin_bp.get('/interviews')
async def list_interviews(user: User = Depends(admin_required)):
    interviews = Interview.query.order_by(Interview.created_at.desc()).all()
    interviews_list = []
    for i in interviews:
        u = User.query.get(i.user_id)
        d = i.to_dict()
        d['user_name'] = u.name if u else 'Unknown'
        d['user_email'] = u.email if u else ''
        interviews_list.append(d)
    return interviews_list

@admin_bp.get('/transactions')
async def list_transactions(user: User = Depends(admin_required)):
    transactions = Transaction.query.order_by(Transaction.created_at.desc()).all()
    tx_list = []
    for t in transactions:
        u = User.query.get(t.user_id)
        d = t.to_dict()
        d['user_name'] = u.name if u else 'Unknown'
        d['user_email'] = u.email if u else ''
        tx_list.append(d)
    return tx_list

@admin_bp.get('/feedback')
async def list_feedbacks(user: User = Depends(admin_required)):
    feedbacks = Feedback.query.order_by(Feedback.created_at.desc()).all()
    feedbacks_list = []
    for f in feedbacks:
        u = User.query.get(f.user_id)
        i = Interview.query.get(f.interview_id) if f.interview_id else None
        feedbacks_list.append({
            'id': f.id,
            'user_name': u.name if u else 'Unknown',
            'user_email': u.email if u else '',
            'rating': f.rating,
            'feedback_text': f.feedback_text,
            'issues_reported': f.issues_reported,
            'job_role': i.job_role if i else 'N/A',
            'created_at': f.created_at.isoformat()
        })
    return feedbacks_list

@admin_bp.get('/logs')
async def list_logs(user: User = Depends(admin_required)):
    logs = AdminLog.query.order_by(AdminLog.created_at.desc()).all()
    logs_list = []
    for l in logs:
        u = User.query.get(l.admin_id)
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
async def scoring_analytics(user: User = Depends(admin_required)):
    """Aggregate view of how the LLM has been scoring interviews (§7).

    Built entirely from the persisted per-question evaluation data (score, confidence,
    rationale) — no separate evaluation pipeline.
    """
    completed = Interview.query.filter_by(status='completed').order_by(Interview.created_at.desc()).all()

    all_scores, all_conf = [], []
    flagged_total, eval_total = 0, 0
    buckets = [0, 0, 0, 0, 0]  # 0-20, 20-40, 40-60, 60-80, 80-100
    interview_rows = []

    for itv in completed:
        responses = InterviewResponse.query.filter_by(interview_id=itv.id).all()
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

        u = User.query.get(itv.user_id)
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
async def scoring_interview_detail(interview_id: int, user: User = Depends(admin_required)):
    """Per-question breakdown for one interview: question, transcript, score, rationale (§7)."""
    itv = Interview.query.get(interview_id)
    if not itv:
        raise HTTPException(status_code=404, detail="Interview not found")

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
