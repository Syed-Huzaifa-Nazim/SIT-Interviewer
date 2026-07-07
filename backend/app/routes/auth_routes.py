import re
import datetime
import jwt
from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from app.database.db import db
from app.models import User, Token, Transaction, Notification
from app.utils.security import create_access_token, create_refresh_token, JWT_SECRET

auth_bp = APIRouter()

EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

@auth_bp.post('/register')
async def register(request: Request):
    data = await request.json() or {}
    
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    country = data.get('country')
    experience_level = data.get('experience_level')
    job_role = data.get('job_role')

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email and password are required")

    if not re.match(EMAIL_REGEX, email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    if User.query.filter_by(email=email).first():
        raise HTTPException(status_code=409, detail="Account with this email already exists")

    try:
        user = User(
            name=name,
            email=email,
            country=country,
            experience_level=experience_level,
            job_role=job_role,
            role='candidate'
        )
        user.set_password(password)
        db.session.add(user)
        db.session.flush()

        token_account = Token(
            user_id=user.id,
            tokens_available=5,
            tokens_consumed=0,
            tokens_purchased=0
        )
        db.session.add(token_account)

        transaction = Transaction(
            user_id=user.id,
            amount=0.0,
            tokens_added=5,
            transaction_type='signup_bonus'
        )
        db.session.add(transaction)

        welcome_notification = Notification(
            user_id=user.id,
            title='Welcome to AI Interviewer!',
            message='Thank you for registering. You have been credited with 5 free mock interview tokens.',
            type='token'
        )
        db.session.add(welcome_notification)

        db.session.commit()

        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)

        return {
            'message': 'Registration successful',
            'user': user.to_dict(),
            'tokens': token_account.to_dict(),
            'access_token': access_token,
            'refresh_token': refresh_token
        }

    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating account: {str(e)}")

@auth_bp.post('/login')
async def login(request: Request):
    data = await request.json() or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.status == 'banned':
        if user.banned_until and user.banned_until <= datetime.datetime.utcnow():
            user.status = 'active'
            user.banned_until = None
            db.session.commit()
        else:
            msg = 'This account has been suspended by the administrator'
            if user.banned_until:
                local_time = user.banned_until + datetime.timedelta(hours=5)
                msg = f"Your account has been temporarily blocked due to multiple proctoring violations. It will automatically reopen after {local_time.strftime('%Y-%m-%d %H:%M:%S')}."
            raise HTTPException(status_code=403, detail=msg)

    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    token_account = Token.query.filter_by(user_id=user.id).first()
    token_data = token_account.to_dict() if token_account else {'tokens_available': 0}

    return {
        'message': 'Login successful',
        'user': user.to_dict(),
        'tokens': token_data,
        'access_token': access_token,
        'refresh_token': refresh_token
    }

@auth_bp.post('/refresh')
async def refresh(request: Request):
    data = await request.json() or {}
    refresh_token = data.get('refresh_token')
    if not refresh_token:
        # Fallback to authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith("Bearer "):
            refresh_token = auth_header.split(" ")[1]

    if not refresh_token:
        raise HTTPException(status_code=400, detail="Refresh token required")

    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=["HS256"])
        new_access_token = create_access_token(identity=int(payload["sub"]))
        return {'access_token': new_access_token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@auth_bp.post('/forgot-password')
async def forgot_password(request: Request):
    data = await request.json() or {}
    email = data.get('email')

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = User.query.filter_by(email=email).first()
    if not user:
        return {'message': 'If the email exists in our system, a password reset code has been sent'}

    mock_otp = "123456"
    return {
        'message': 'If the email exists, a password reset code has been sent.',
        'debug_otp': mock_otp
    }

@auth_bp.post('/reset-password')
async def reset_password(request: Request):
    data = await request.json() or {}
    email = data.get('email')
    otp = data.get('otp')
    new_password = data.get('new_password')

    if not email or not otp or not new_password:
        raise HTTPException(status_code=400, detail="Email, OTP, and new password are required")

    if otp != "123456":
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    user = User.query.filter_by(email=email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        user.set_password(new_password)
        db.session.commit()
        return {'message': 'Password has been reset successfully'}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")

@auth_bp.post('/logout')
async def logout():
    return {'message': 'Logged out successfully'}
