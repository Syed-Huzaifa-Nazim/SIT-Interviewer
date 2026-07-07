from fastapi import APIRouter, Request, HTTPException, status, Depends
from app.database.db import db
from app.models import Feedback
from app.utils.security import get_current_user_id

feedback_bp = APIRouter()

@feedback_bp.post('')
async def submit_feedback(request: Request, user_id: int = Depends(get_current_user_id)):
    data = await request.json() or {}

    rating = data.get('rating')
    feedback_text = data.get('feedback_text')
    issues_reported = data.get('issues_reported')
    interview_id = data.get('interview_id')

    if not rating:
        raise HTTPException(status_code=400, detail="Rating is required")

    try:
        feedback = Feedback(
            user_id=user_id,
            interview_id=interview_id,
            rating=rating,
            feedback_text=feedback_text,
            issues_reported=issues_reported
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
