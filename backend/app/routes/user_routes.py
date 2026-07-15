import datetime
from fastapi import APIRouter, Request, HTTPException, status, Depends, UploadFile, File
from app.database.db import db
from app.models import User, Token, Interview, ResumeAnalysis
from app.utils.security import get_current_user_id
from app.utils.supabase_service import SupabaseService

user_bp = APIRouter()

@user_bp.post('/heartbeat')
async def heartbeat(user_id: int = Depends(get_current_user_id)):
    """Lightweight presence ping (§4.2): the frontend calls this every ~20s while a
    user is active; the admin hub shows anyone seen within the last minute as online."""
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        user.last_seen_at = datetime.datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()
    return {'online': True}

@user_bp.post('/presence/offline')
async def mark_offline(user_id: int = Depends(get_current_user_id)):
    """Explicit "went offline" signal, fired on logout and on tab/browser close
    (via a keepalive fetch from `beforeunload`/`pagehide`) so the admin hub reflects
    it immediately instead of waiting out the heartbeat timeout window."""
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        user.last_seen_at = None
        db.session.commit()
    except Exception:
        db.session.rollback()
    return {'online': False}

@user_bp.get('/profile')
async def get_profile(user_id: int = Depends(get_current_user_id)):
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token_account = Token.query.filter_by(user_id=user_id).first()
    token_data = token_account.to_dict() if token_account else {}

    return {
        'user': user.to_dict(),
        'tokens': token_data
    }

@user_bp.put('/profile')
async def update_profile(request: Request, user_id: int = Depends(get_current_user_id)):
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    data = await request.json() or {}
    
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
        return {
            'message': 'Profile updated successfully',
            'user': user.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")

@user_bp.get('/achievements')
async def get_achievements(user_id: int = Depends(get_current_user_id)):
    interviews_taken = Interview.query.filter_by(user_id=user_id, status='completed').count()
    resumes_uploaded = ResumeAnalysis.query.filter_by(user_id=user_id).count()
    
    high_scores = Interview.query.filter(
        Interview.user_id == user_id, 
        Interview.status == 'completed', 
        Interview.overall_score >= 80.0
    ).count()

    badges = [
        {
            'id': 'welcome',
            'title': 'Quick Starter',
            'description': 'Created your account and set up your interview profile.',
            'icon': 'Sparkles',
            'unlocked': True
        },
        {
            'id': 'first_interview',
            'title': 'Ice Breaker',
            'description': 'Completed your first mock interview.',
            'icon': 'Award',
            'unlocked': interviews_taken >= 1
        },
        {
            'id': 'five_interviews',
            'title': 'Interview Veteran',
            'description': 'Completed 5 mock interviews.',
            'icon': 'ShieldCheck',
            'unlocked': interviews_taken >= 5
        },
        {
            'id': 'resume_analyzed',
            'title': 'ATS Optimiser',
            'description': 'Analyzed your resume using AI Analyzer.',
            'icon': 'FileText',
            'unlocked': resumes_uploaded >= 1
        },
        {
            'id': 'high_performer',
            'title': 'Elite Candidate',
            'description': 'Scored 80% or above in any mock interview.',
            'icon': 'Zap',
            'unlocked': high_scores >= 1
        }
    ]

    leaderboard = [
        {"rank": 1, "name": "Alexander Pierce", "score": 94.5, "interviews": 12, "is_current_user": False},
        {"rank": 2, "name": "Jane Cooper", "score": 92.0, "interviews": 8, "is_current_user": False},
        {"rank": 3, "name": "Wade Warren", "score": 89.5, "interviews": 15, "is_current_user": False},
    ]
    
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

    for rank_idx, entry in enumerate(leaderboard):
        entry["rank"] = rank_idx + 1

    return {
        'badges': badges,
        'leaderboard': leaderboard
    }

@user_bp.post('/profile/picture')
async def upload_profile_pic(file: UploadFile = File(...), user_id: int = Depends(get_current_user_id)):
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    filename = file.filename or "avatar.png"
    content_type = file.content_type or "image/png"
    
    # Check extension
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in {'png', 'jpg', 'jpeg', 'gif', 'webp'}:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG, GIF, and WEBP formats are supported.")
        
    try:
        contents = await file.read()
        public_url = SupabaseService.upload_profile_picture(user_id, contents, filename, content_type)
        
        user.profile_pic_url = public_url
        db.session.commit()
        
        return {
            'message': 'Profile picture uploaded successfully',
            'profile_pic_url': public_url,
            'user': user.to_dict()
        }
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload profile picture: {str(e)}")
