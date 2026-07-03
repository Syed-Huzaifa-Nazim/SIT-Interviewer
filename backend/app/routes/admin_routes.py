from flask import Blueprint, request, jsonify
from app.database.db import db
from app.models import User, Token, Transaction, Interview, Feedback, AdminLog
from flask_jwt_extended import jwt_required, get_jwt_identity
import datetime

admin_bp = Blueprint('admin', __name__)

def admin_required(fn):
    # Custom decorator to check admin roles
    def wrapper(*args, **kwargs):
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({'message': 'Administrative privileges required'}), 403
        return fn(*args, **kwargs)
    wrapper.__name__ = fn.__name__
    return wrapper

@admin_bp.route('/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_stats():
    # 1. User stats
    total_users = User.query.filter_by(role='candidate').count()
    active_users = User.query.filter_by(role='candidate', status='active').count()
    banned_users = User.query.filter_by(status='banned').count()

    # 2. Interview stats
    total_interviews = Interview.query.filter_by(status='completed').count()
    active_interviews = Interview.query.filter_by(status='active').count()
    
    # Daily interviews (last 24 hours)
    yesterday = datetime.datetime.utcnow() - datetime.timedelta(days=1)
    daily_interviews = Interview.query.filter(
        Interview.created_at >= yesterday,
        Interview.status == 'completed'
    ).count()

    # 3. Revenue stats
    purchases = Transaction.query.filter_by(transaction_type='purchase').all()
    total_revenue = sum(p.amount for p in purchases)

    # 4. Token metrics
    tokens_query = Token.query.all()
    total_available_tokens = sum(t.tokens_available for t in tokens_query)
    total_consumed_tokens = sum(t.tokens_consumed for t in tokens_query)

    # 5. Recent Feedbacks
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

    # 6. Admin Logs
    logs = AdminLog.query.order_by(AdminLog.created_at.desc()).limit(10).all()

    return jsonify({
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
    }), 200


@admin_bp.route('/users', methods=['GET'])
@jwt_required()
@admin_required
def list_users():
    users = User.query.filter(User.role != 'admin').order_by(User.created_at.desc()).all()
    users_list = []
    
    for u in users:
        t = Token.query.filter_by(user_id=u.id).first()
        t_val = t.tokens_available if t else 0
        u_dict = u.to_dict()
        u_dict['tokens_available'] = t_val
        users_list.append(u_dict)

    return jsonify(users_list), 200


@admin_bp.route('/users/<int:target_user_id>/ban', methods=['POST'])
@jwt_required()
@admin_required
def toggle_ban(target_user_id):
    admin_id = get_jwt_identity()
    user = User.query.get(target_user_id)

    if not user:
        return jsonify({'message': 'User not found'}), 404

    if user.role == 'admin':
        return jsonify({'message': 'Cannot restrict administrative accounts'}), 400

    # Toggle status
    new_status = 'banned' if user.status == 'active' else 'active'
    user.status = new_status
    if new_status == 'active':
        user.banned_until = None
    
    # Log action
    log = AdminLog(
        admin_id=admin_id,
        action='TOGGLE_BAN',
        details=f"Changed status of User ID {target_user_id} ({user.email}) to {new_status}"
    )
    db.session.add(log)
    
    try:
        db.session.commit()
        return jsonify({
            'message': f"User status changed successfully to {new_status}",
            'user': user.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to update user status: {str(e)}'}), 500


@admin_bp.route('/users/<int:target_user_id>/tokens', methods=['POST'])
@jwt_required()
@admin_required
def override_tokens(target_user_id):
    admin_id = get_jwt_identity()
    data = request.get_json() or {}
    new_balance = data.get('tokens_available')

    if new_balance is None or int(new_balance) < 0:
        return jsonify({'message': 'Valid token balance is required'}), 400

    user = User.query.get(target_user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    token_account = Token.query.filter_by(user_id=target_user_id).first()
    if not token_account:
        token_account = Token(user_id=target_user_id, tokens_available=0)
        db.session.add(token_account)

    old_balance = token_account.tokens_available
    token_account.tokens_available = int(new_balance)

    # Log action
    log = AdminLog(
        admin_id=admin_id,
        action='OVERRIDE_TOKENS',
        details=f"Overwrote tokens of User ID {target_user_id} ({user.email}) from {old_balance} to {new_balance}"
    )
    db.session.add(log)

    try:
        db.session.commit()
        return jsonify({
            'message': f"User tokens balance updated successfully to {new_balance}",
            'tokens': token_account.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to override user tokens: {str(e)}'}), 500


@admin_bp.route('/interviews', methods=['GET'])
@jwt_required()
@admin_required
def list_interviews():
    interviews = Interview.query.order_by(Interview.created_at.desc()).all()
    interviews_list = []
    for i in interviews:
        u = User.query.get(i.user_id)
        d = i.to_dict()
        d['user_name'] = u.name if u else 'Unknown'
        d['user_email'] = u.email if u else ''
        interviews_list.append(d)
    return jsonify(interviews_list), 200


@admin_bp.route('/transactions', methods=['GET'])
@jwt_required()
@admin_required
def list_transactions():
    transactions = Transaction.query.order_by(Transaction.created_at.desc()).all()
    tx_list = []
    for t in transactions:
        u = User.query.get(t.user_id)
        d = t.to_dict()
        d['user_name'] = u.name if u else 'Unknown'
        d['user_email'] = u.email if u else ''
        tx_list.append(d)
    return jsonify(tx_list), 200


@admin_bp.route('/feedback', methods=['GET'])
@jwt_required()
@admin_required
def list_feedbacks():
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
    return jsonify(feedbacks_list), 200


@admin_bp.route('/logs', methods=['GET'])
@jwt_required()
@admin_required
def list_logs():
    logs = AdminLog.query.order_by(AdminLog.created_at.desc()).all()
    logs_list = []
    for l in logs:
        u = User.query.get(l.admin_id)
        d = l.to_dict()
        d['admin_name'] = u.name if u else 'System'
        d['admin_email'] = u.email if u else ''
        logs_list.append(d)
    return jsonify(logs_list), 200
