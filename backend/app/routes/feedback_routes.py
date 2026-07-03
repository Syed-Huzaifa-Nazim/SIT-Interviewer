from flask import Blueprint, request, jsonify
from app.database.db import db
from app.models import Feedback
from flask_jwt_extended import jwt_required, get_jwt_identity

feedback_bp = Blueprint('feedback', __name__)

@feedback_bp.route('', methods=['POST'])
@jwt_required()
def submit_feedback():
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    rating = data.get('rating')
    feedback_text = data.get('feedback_text')
    issues_reported = data.get('issues_reported')
    interview_id = data.get('interview_id')

    if not rating:
        return jsonify({'message': 'Rating is required'}), 400

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

        return jsonify({
            'message': 'Feedback submitted successfully',
            'feedback': feedback.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to submit feedback: {str(e)}'}), 500
