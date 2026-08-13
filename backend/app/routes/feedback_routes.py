import json

from fastapi import APIRouter, Body, HTTPException, status, Depends
from app.database.db import db
from app.models import Feedback
from app.utils.security import get_current_user_id

feedback_bp = APIRouter()

# The category keys a candidate can rate. Kept as an allow-list rather than accepting
# whatever the client sends: the stored JSON is read back by the admin dashboard to average
# each category, and one typo'd or injected key there would create a phantom category that
# no UI knows how to label. Anything outside this set is dropped, not rejected — a stale
# client shouldn't lose the rest of an otherwise-valid submission.
CATEGORY_KEYS = frozenset({
    'questions',       # relevance and quality of the interview questions
    'ai_interviewer',  # the AI interviewer itself — pacing, understanding, voice
    'audio_video',     # microphone, camera and transcription quality
    'proctoring',      # fairness and accuracy of the monitoring
    'platform',        # the portal's own UI and performance
    'coding_sandbox',  # the hands-on coding exercise (absent for verbal-only interviews)
})

MIN_RATING = 1
MAX_RATING = 5


def _clean_category_ratings(raw):
    """Keep only known categories carrying a valid 1-5 integer.

    Returns None when nothing survives, so the column stays NULL rather than storing an
    empty object — 'no categories rated' and 'categories rated as nothing' should read the
    same in the database.
    """
    if not isinstance(raw, dict):
        return None
    cleaned = {}
    for key, value in raw.items():
        if key not in CATEGORY_KEYS:
            continue
        try:
            score = int(value)
        except (TypeError, ValueError):
            continue
        if MIN_RATING <= score <= MAX_RATING:
            cleaned[key] = score
    return cleaned or None


@feedback_bp.post('')
def submit_feedback(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    data = payload or {}

    rating = data.get('rating')
    feedback_text = data.get('feedback_text')
    issues_reported = data.get('issues_reported')
    interview_id = data.get('interview_id')
    category_ratings = _clean_category_ratings(data.get('category_ratings'))

    if not rating:
        raise HTTPException(status_code=400, detail="Rating is required")
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Rating must be a number between 1 and 5")
    if not MIN_RATING <= rating <= MAX_RATING:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    try:
        feedback = Feedback(
            user_id=user_id,
            interview_id=interview_id,
            rating=rating,
            feedback_text=feedback_text,
            issues_reported=issues_reported,
            category_ratings=json.dumps(category_ratings) if category_ratings else None,
        )
        db.session.add(feedback)
        db.session.commit()

        return {
            'message': 'Feedback submitted successfully',
            'feedback': feedback.to_dict()
        }

    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {str(e)}")
