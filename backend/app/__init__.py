import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from app.config.config import Config
from app.database.db import db

# Import Blueprints
from app.routes.auth_routes import auth_bp
from app.routes.user_routes import user_bp
from app.routes.token_routes import token_bp
from app.routes.interview_routes import interview_bp
from app.routes.resume_jd_routes import resume_jd_bp
from app.routes.notification_routes import notification_bp
from app.routes.feedback_routes import feedback_bp
from app.routes.admin_routes import admin_bp

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Enable CORS for React frontend (localhost:5173 or all origins in development)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize Database
    db.init_app(app)

    # Initialize JWT Manager
    jwt = JWTManager(app)

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({
            'message': 'The token has expired. Please refresh your session.',
            'error': 'token_expired'
        }), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({
            'message': 'Signature verification failed. Token is invalid.',
            'error': 'token_invalid'
        }), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({
            'message': 'Request does not contain an access token.',
            'error': 'authorization_required'
        }), 401

    # Register Blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(user_bp, url_prefix='/api/users')
    app.register_blueprint(token_bp, url_prefix='/api/tokens')
    app.register_blueprint(interview_bp, url_prefix='/api/interviews')
    app.register_blueprint(resume_jd_bp, url_prefix='/api/resume-jd')
    app.register_blueprint(notification_bp, url_prefix='/api/notifications')
    app.register_blueprint(feedback_bp, url_prefix='/api/feedback')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    # Create storage folders if they do not exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['REPORTS_FOLDER'], exist_ok=True)

    # Create tables on startup
    with app.app_context():
        db.create_all()
        # Seed Dedicated Admin if not exists
        try:
            from app.models import User, Token
            admin_email = "admin@interviewer.com"
            admin = User.query.filter_by(email=admin_email).first()
            if not admin:
                print("Seeding dedicated admin account...")
                admin = User(
                    name="Administrator",
                    email=admin_email,
                    role="admin",
                    country="United States",
                    experience_level="Senior",
                    job_role="Platform Manager"
                )
                admin.set_password("admin123")
                db.session.add(admin)
                db.session.flush()
                
                # Give admin tokens
                token_account = Token(user_id=admin.id, tokens_available=999)
                db.session.add(token_account)
                
                db.session.commit()
                print("Dedicated admin seeded successfully!")
        except Exception as e:
            db.session.rollback()
            print(f"Failed to seed admin on startup: {str(e)}")

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({'status': 'healthy', 'mode': app.config['AI_MODE']}), 200

    return app
