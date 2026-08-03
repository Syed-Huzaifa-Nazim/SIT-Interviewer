import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
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
from app.routes.bulk_email_routes import bulk_email_bp
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
    app.include_router(bulk_email_bp, prefix="/api/admin/bulk-email", tags=["Bulk Email"])

    # Scratch folder for transient processing only (Whisper temp audio, resume parsing).
    # Nothing is PERSISTED locally (DB Integration §3) — every file written here is
    # deleted after processing; durable media lives in Supabase Storage.
    os.makedirs(config_class.UPLOAD_FOLDER, exist_ok=True)

    # Initialize tables + apply lightweight column migrations for pre-existing DBs
    from app.database.migrate import ensure_schema, ensure_indexes
    ensure_schema()
    Base.metadata.create_all(bind=engine)
    # Add indexes on hot columns (idempotent, additive) so queries stay fast at scale.
    try:
        ensure_indexes()
    except Exception as e:
        print(f"[index] ensure_indexes skipped: {e}")

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

    # Start the background retention worker that auto-deletes interview recordings older
    # than the retention window (RECORDING_RETENTION_DAYS) and audits each deletion.
    try:
        from app.routes.interview_routes import start_recording_cleanup_worker
        start_recording_cleanup_worker()
    except Exception as e:
        print(f"Failed to start recording-cleanup worker: {str(e)}")

    # Global catch-all: any error not already handled (FastAPI still handles HTTPException
    # and validation errors itself, which take precedence) returns a clean JSON body
    # instead of leaking a stack trace, and rolls back so a broken transaction can't poison
    # the pooled connection. Purely a safety net — it never changes successful responses.
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        print(f"[error] Unhandled exception on {request.method} {request.url.path}: {exc}")
        try:
            db.session.rollback()
        except Exception:
            pass
        return JSONResponse(
            status_code=500,
            content={'detail': 'An internal error occurred. Please try again in a moment.'},
        )

    # Health/diagnostics: reports whether the app can actually reach the database, so an
    # uptime monitor or load balancer can tell a live-but-degraded instance from a healthy
    # one. Returns 503 when the DB is unreachable.
    @app.get("/health")
    def health():
        db_ok = True
        try:
            db.session.execute(text("SELECT 1"))
        except Exception as e:
            db_ok = False
            print(f"[health] Database check failed: {e}")
        finally:
            db.session.remove()
        return JSONResponse(
            status_code=200 if db_ok else 503,
            content={
                'status': 'healthy' if db_ok else 'degraded',
                'database': 'up' if db_ok else 'down',
                'mode': config_class.AI_MODE,
            },
        )

    return app
