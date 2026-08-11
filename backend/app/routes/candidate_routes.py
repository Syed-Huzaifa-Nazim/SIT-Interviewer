"""Endpoints specific to one-time (completed-course) candidates — §3.3.

These wrap AROUND the existing interview flow; they never touch how the interview
itself is conducted or scored.
"""
import datetime
from fastapi import APIRouter, HTTPException, Depends
from app.database.db import db
from app.models import User, Interview
from app.utils.security import get_current_user_id

candidate_bp = APIRouter()


@candidate_bp.post('/official-interview/complete')
def complete_official_session(user_id: int = Depends(get_current_user_id)):
    """Called by the thank-you screen after the one-time interview concludes.

    Marks the candidate as interviewed (which drives the §3.4 re-signup detection)
    and revokes the session server-side so no token issued for this login can be
    used again — refreshing or reopening the tab cannot resume anything.
    """
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.must_use_otp:
        raise HTTPException(status_code=400, detail="Only one-time interview sessions can be closed this way")

    # Scope to the current OTP cycle so old mock interviews can't satisfy this check
    scope = Interview.query.filter_by(user_id=user_id)
    if user.otp_issued_at:
        scope = scope.filter(Interview.created_at >= user.otp_issued_at)
    latest = scope.order_by(Interview.created_at.desc()).first()
    if not latest or latest.status != 'completed':
        raise HTTPException(status_code=400, detail="No completed interview found for this session")

    try:
        user.interview_status = 'interview_completed'
        user.session_revoked_at = datetime.datetime.utcnow()
        user.last_seen_at = None  # show offline in the admin hub immediately
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to close session: {str(e)}")

    return {'message': 'Session closed. Thank you for giving the interview.'}
