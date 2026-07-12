import datetime
from fastapi import APIRouter, Request, HTTPException, status, Depends
from app.database.db import db
from app.models import (
    User, Token, Transaction, Interview, Feedback, AdminLog,
    InterviewResponse, InterviewQuestion
)
from app.utils.security import admin_required, get_current_user_id

admin_bp = APIRouter()

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
        users_list.append(u_dict)

    return users_list

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
