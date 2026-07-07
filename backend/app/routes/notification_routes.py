from fastapi import APIRouter, Request, HTTPException, status, Depends
from app.database.db import db
from app.models import Notification
from app.utils.security import get_current_user_id

notification_bp = APIRouter()

@notification_bp.get('')
async def get_notifications(user_id: int = Depends(get_current_user_id)):
    notifications = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).all()
    return [n.to_dict() for n in notifications]

@notification_bp.post('/read')
async def mark_as_read(request: Request, user_id: int = Depends(get_current_user_id)):
    data = await request.json() or {}
    notification_id = data.get('notification_id')

    try:
        if notification_id:
            n = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
            if n:
                n.is_read = True
        else:
            notifications = Notification.query.filter_by(user_id=user_id, is_read=False).all()
            for n in notifications:
                n.is_read = True
        
        db.session.commit()
        return {'message': 'Notifications marked as read successfully'}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update notifications: {str(e)}")
