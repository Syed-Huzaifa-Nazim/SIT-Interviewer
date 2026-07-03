from flask import Blueprint, request, jsonify
from app.database.db import db
from app.models import User, Token, Interview, ResumeAnalysis
from flask_jwt_extended import jwt_required, get_jwt_identity

user_bp = Blueprint('users', __name__)

@user_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'message': 'User not found'}), 404

    # Fetch token stats
    token_account = Token.query.filter_by(user_id=user_id).first()
    token_data = token_account.to_dict() if token_account else {}

    return jsonify({
        'user': user.to_dict(),
        'tokens': token_data
    }), 200


@user_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if not user:
        return jsonify({'message': 'User not found'}), 404

    data = request.get_json() or {}
    
    name = data.get('name')
    country = data.get('country')
    experience_level = data.get('experience_level')
    job_role = data.get('job_role')

    if name:
        user.name = name
    if country:
        user.country = country
    if experience_level:
        user.experience_level = experience_level
    if job_role:
        user.job_role = job_role

    try:
        db.session.commit()
        return jsonify({
            'message': 'Profile updated successfully',
            'user': user.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to update profile: {str(e)}'}), 500


@user_bp.route('/achievements', methods=['GET'])
@jwt_required()
def get_achievements():
    user_id = get_jwt_identity()

    # Calculate statistics to award badges
    interviews_taken = Interview.query.filter_by(user_id=user_id, status='completed').count()
    resumes_uploaded = ResumeAnalysis.query.filter_by(user_id=user_id).count()
    
    # Check for scores > 80%
    high_scores = Interview.query.filter(
        Interview.user_id == user_id, 
        Interview.status == 'completed', 
        Interview.overall_score >= 80.0
    ).count()

    badges = []

    # 1. Welcome badge
    badges.append({
        'id': 'welcome',
        'title': 'Quick Starter',
        'description': 'Created your account and set up your interview profile.',
        'icon': 'Sparkles',
        'unlocked': True
    })

    # 2. First interview badge
    badges.append({
        'id': 'first_interview',
        'title': 'Ice Breaker',
        'description': 'Completed your first mock interview.',
        'icon': 'Award',
        'unlocked': interviews_taken >= 1
    })

    # 3. Multiple interviews badge
    badges.append({
        'id': 'five_interviews',
        'title': 'Interview Veteran',
        'description': 'Completed 5 mock interviews.',
        'icon': 'ShieldCheck',
        'unlocked': interviews_taken >= 5
    })

    # 4. Resume check
    badges.append({
        'id': 'resume_analyzed',
        'title': 'ATS Optimiser',
        'description': 'Analyzed your resume using AI Analyzer.',
        'icon': 'FileText',
        'unlocked': resumes_uploaded >= 1
    })

    # 5. Elite performance badge
    badges.append({
        'id': 'high_performer',
        'title': 'Elite Candidate',
        'description': 'Scored 80% or above in any mock interview.',
        'icon': 'Zap',
        'unlocked': high_scores >= 1
    })

    # Leaderboard statistics
    # Standard mock rankings
    leaderboard = [
        {"rank": 1, "name": "Alexander Pierce", "score": 94.5, "interviews": 12, "is_current_user": False},
        {"rank": 2, "name": "Jane Cooper", "score": 92.0, "interviews": 8, "is_current_user": False},
        {"rank": 3, "name": "Wade Warren", "score": 89.5, "interviews": 15, "is_current_user": False},
    ]
    
    # Append current user
    user = User.query.get(user_id)
    best_interview = Interview.query.filter_by(user_id=user_id, status='completed').order_by(Interview.overall_score.desc()).first()
    user_best_score = best_interview.overall_score if best_interview else 0.0
    
    user_placed = False
    for idx, player in enumerate(leaderboard):
        if user_best_score > player["score"]:
            leaderboard.insert(idx, {
                "rank": idx + 1,
                "name": f"{user.name} (You)",
                "score": user_best_score,
                "interviews": interviews_taken,
                "is_current_user": True
            })
            user_placed = True
            break
            
    if not user_placed:
        leaderboard.append({
            "rank": len(leaderboard) + 1,
            "name": f"{user.name} (You)",
            "score": user_best_score,
            "interviews": interviews_taken,
            "is_current_user": True
        })

    # Update ranks
    for rank_idx, entry in enumerate(leaderboard):
        entry["rank"] = rank_idx + 1

    return jsonify({
        'badges': badges,
        'leaderboard': leaderboard
    }), 200
