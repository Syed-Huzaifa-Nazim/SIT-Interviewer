from flask import Blueprint, jsonify, request
from app.database.db import db
from app.models import Notification
from flask_jwt_extended import jwt_required, get_jwt_identity

notification_bp = Blueprint('notifications', __name__)

@notification_bp.route('', methods=['GET'])
@jwt_required()
def get_notifications():
    user_id = get_jwt_identity()
    notifications = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).all()
    return jsonify([n.to_dict() for n in notifications]), 200


@notification_bp.route('/read', methods=['POST'])
@jwt_required()
def mark_as_read():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    notification_id = data.get('notification_id')

    try:
        if notification_id:
            # Mark specific notification read
            n = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
            if n:
                n.is_read = True
        else:
            # Mark all read
            notifications = Notification.query.filter_by(user_id=user_id, is_read=False).all()
            for n in notifications:
                n.is_read = True
        
        db.session.commit()
        return jsonify({'message': 'Notifications marked as read successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to update notifications: {str(e)}'}), 500
