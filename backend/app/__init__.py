import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.config.config import Config
from app.database.db import db, Base, engine, new_request_scope, reset_request_scope

# Import routers
from app.routes.auth_routes import auth_bp
from app.routes.user_routes import user_bp
from app.routes.token_routes import token_bp
from app.routes.interview_routes import interview_bp
from app.routes.resume_jd_routes import resume_jd_bp
from app.routes.notification_routes import notification_bp
from app.routes.feedback_routes import feedback_bp
from app.routes.admin_routes import admin_bp
from app.routes.coding_routes import coding_bp
from app.routes.candidate_routes import candidate_bp

def create_app(config_class=Config):
    app = FastAPI(
        title="Interviewer.AI API",
        description="High-performance asynchronous API powered by FastAPI",
        version="1.0.0"
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Scoped database session cleanup middleware
    @app.middleware("http")
    async def db_session_middleware(request: Request, call_next):
        # Stamp a per-request session identity BEFORE call_next so it propagates into the
        # worker thread that runs the sync endpoint; remove() then closes that same session
        # and returns its connection to the pool (see db.py for the full rationale).
        token = new_request_scope()
        try:
            response = await call_next(request)
            return response
        finally:
            db.session.remove()
            reset_request_scope(token)

    # Register Routers
    app.include_router(auth_bp, prefix="/api/auth", tags=["Auth"])
    app.include_router(user_bp, prefix="/api/users", tags=["Users"])
    app.include_router(token_bp, prefix="/api/tokens", tags=["Tokens"])
    app.include_router(interview_bp, prefix="/api/interviews", tags=["Interviews"])
    app.include_router(resume_jd_bp, prefix="/api/resume-jd", tags=["Resume & JD"])
    app.include_router(notification_bp, prefix="/api/notifications", tags=["Notifications"])
    app.include_router(feedback_bp, prefix="/api/feedback", tags=["Feedback"])
    app.include_router(admin_bp, prefix="/api/admin", tags=["Admin"])
    app.include_router(coding_bp, prefix="/api/coding", tags=["Coding Sandbox"])
    app.include_router(candidate_bp, prefix="/api/candidate", tags=["Candidate"])

    # Scratch folder for transient processing only (Whisper temp audio, resume parsing).
    # Nothing is PERSISTED locally (DB Integration §3) — every file written here is
    # deleted after processing; durable media lives in Supabase Storage.
    os.makedirs(config_class.UPLOAD_FOLDER, exist_ok=True)

    # Initialize tables + apply lightweight column migrations for pre-existing DBs
    from app.database.migrate import ensure_schema
    ensure_schema()
    Base.metadata.create_all(bind=engine)

    # Seed Admin User
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
            
            token_account = Token(user_id=admin.id, tokens_available=999)
            db.session.add(token_account)
            
            db.session.commit()
            print("Dedicated admin seeded successfully!")
    except Exception as e:
        db.session.rollback()
        print(f"Failed to seed admin on startup: {str(e)}")

    @app.get("/health")
    def health():
        return {'status': 'healthy', 'mode': config_class.AI_MODE}

    return app
