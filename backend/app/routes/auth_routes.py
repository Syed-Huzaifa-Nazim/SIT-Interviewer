from flask import Blueprint, request, jsonify
from app.database.db import db
from app.models import User, Token, Transaction, Notification
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt
)
import re
import datetime

auth_bp = Blueprint('auth', __name__)

# Regular expressions for validation
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    country = data.get('country')
    experience_level = data.get('experience_level')
    job_role = data.get('job_role')

    # Validations
    if not name or not email or not password:
        return jsonify({'message': 'Name, email and password are required'}), 400

    if not re.match(EMAIL_REGEX, email):
        return jsonify({'message': 'Invalid email format'}), 400

    if len(password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters long'}), 400

    # Prevent duplicate accounts
    if User.query.filter_by(email=email).first():
        return jsonify({'message': 'Account with this email already exists'}), 409

    try:
        # Create User
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
        db.session.flush()  # gets the user ID

        # Create Token account with 5 free signup tokens
        token_account = Token(
            user_id=user.id,
            tokens_available=5,
            tokens_consumed=0,
            tokens_purchased=0
        )
        db.session.add(token_account)

        # Create Signup Bonus Transaction
        transaction = Transaction(
            user_id=user.id,
            amount=0.0,
            tokens_added=5,
            transaction_type='signup_bonus'
        )
        db.session.add(transaction)

        # Create Welcome Notification
        welcome_notification = Notification(
            user_id=user.id,
            title='Welcome to AI Interviewer!',
            message='Thank you for registering. You have been credited with 5 free mock interview tokens.',
            type='token'
        )
        db.session.add(welcome_notification)

        db.session.commit()

        # Generate JWT
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))

        return jsonify({
            'message': 'Registration successful',
            'user': user.to_dict(),
            'tokens': token_account.to_dict(),
            'access_token': access_token,
            'refresh_token': refresh_token
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error creating account: {str(e)}'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'message': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({'message': 'Invalid email or password'}), 401

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
            return jsonify({'message': msg}), 403

    # Generate tokens
    # Store user role in JWT claims if needed, or simply let frontend fetch user profile
    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    # Retrieve current token status
    token_account = Token.query.filter_by(user_id=user.id).first()
    token_data = token_account.to_dict() if token_account else {'tokens_available': 0}

    return jsonify({
        'message': 'Login successful',
        'user': user.to_dict(),
        'tokens': token_data,
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)
    return jsonify({
        'access_token': new_access_token
    }), 200


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json() or {}
    email = data.get('email')

    if not email:
        return jsonify({'message': 'Email is required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # Prevent email enumeration by returning a generic success but let's be developer friendly
        return jsonify({'message': 'If the email exists in our system, a password reset code has been sent'}), 200

    # In a real app, generate OTP and mail it. Here, we generate a mock OTP code:
    # We will return the code directly for demonstration purposes in local development
    mock_otp = "123456"

    return jsonify({
        'message': 'If the email exists, a password reset code has been sent.',
        'debug_otp': mock_otp  # Easy testing for the user
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() or {}
    email = data.get('email')
    otp = data.get('otp')
    new_password = data.get('new_password')

    if not email or not otp or not new_password:
        return jsonify({'message': 'Email, OTP, and new password are required'}), 400

    if otp != "123456":
        return jsonify({'message': 'Invalid OTP code'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404

    try:
        user.set_password(new_password)
        db.session.commit()
        return jsonify({'message': 'Password has been reset successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error resetting password: {str(e)}'}), 500


@auth_bp.route('/logout', methods=['POST'])
@jwt_required(optional=True)
def logout():
    # Since we are stateless JWT, front-end will delete tokens. We return success.
    return jsonify({'message': 'Logged out successfully'}), 200
