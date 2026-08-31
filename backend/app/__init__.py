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
from app.routes.superadmin_routes import superadmin_bp
from app.routes.v1_routes import v1_bp
from app.routes.coding_routes import coding_bp
from app.routes.bulk_email_routes import bulk_email_bp
from app.routes.candidate_routes import candidate_bp


def cors_headers_for(origin, allowed_origins):
    """CORS headers to put on a response that never passed through CORSMiddleware.

    Starlette hands the app-level ``Exception`` handler to ServerErrorMiddleware, which
    wraps everything INCLUDING CORSMiddleware. A 500 built there is returned from outside
    the CORS layer, so it carries no ``Access-Control-Allow-Origin`` and the browser reports
    it as "blocked by CORS policy" — hiding the actual server error completely. That cost a
    live debugging session: a NameError in send-interview-invite looked like a CORS
    misconfiguration from the frontend, and the real 500 was invisible.

    Returns {} for an origin that is not allowed, so this can never widen CORS beyond what
    CORSMiddleware itself would have permitted.
    """
    if not origin:
        return {}
    if "*" not in (allowed_origins or []) and origin not in (allowed_origins or []):
        return {}
    return {
        # Echo the caller's origin rather than "*" so the header is identical to the one
        # CORSMiddleware would have set for this request.
        'Access-Control-Allow-Origin': origin,
        # The response body is the same for every origin, but the header is not — caches
        # must key on Origin or one caller's rejection can be served to another.
        'Vary': 'Origin',
    }


def create_app(config_class=Config):
    app = FastAPI(
        title="Interviewer.AI API",
        description="High-performance asynchronous API powered by FastAPI",
        version="1.0.0"
    )

    # Configure CORS. Pin this to the real frontend origins via CORS_ORIGINS in production;
    # the wildcard is only the local-development fallback. allow_credentials is off because
    # auth travels in an Authorization header, not a cookie — asking for credentialed
    # wildcard CORS is rejected by browsers anyway.
    allowed_origins = config_class.CORS_ORIGINS or ["*"]
    if not config_class.CORS_ORIGINS:
        print("[SECURITY] CORS_ORIGINS is not set — accepting requests from any origin.")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Scoped database session cleanup middleware.
    #
    # This middleware is the one place that has to stay `async` — it wraps call_next. Every
    # ROUTE HANDLER in app/routes, by contrast, is deliberately declared `def` rather than
    # `async def`, and new ones must follow suit. Nothing in this app is actually
    # asynchronous: the ORM is synchronous SQLAlchemy, Supabase Storage is called with
    # blocking `requests`, candidate code runs under subprocess.run(), password checks are
    # bcrypt, and the LLM/Whisper/SMTP services all block on network I/O. An `async def`
    # handler runs those bodies ON the event loop, and the app is a single uvicorn process,
    # so one of them stalls every other request in flight — a whole cohort mid-interview
    # queues behind one admin opening a recording, or one candidate's infinite loop hitting
    # the sandbox timeout. Declared `def`, FastAPI dispatches to its worker threadpool
    # instead and requests genuinely overlap. The pool in db.py (25 + 35 overflow) is sized
    # above that threadpool for exactly this reason.
    #
    # The practical constraint: a `def` handler cannot await. Take a JSON body with
    # `payload: dict = Body(default=None)` and read an upload with `file.file.read()`.
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
    app.include_router(superadmin_bp, prefix="/api/superadmin", tags=["Super Admin"])
    # Versioned public API, authenticated by an API key rather than a session. Its own
    # prefix because its response shapes are a contract with integrations this team does
    # not deploy — /api/admin changes whenever an admin page does, which is fine for a
    # frontend shipped alongside it and a breaking change for anybody else.
    app.include_router(v1_bp, prefix="/api/v1", tags=["Public API v1"])
    app.include_router(coding_bp, prefix="/api/coding", tags=["Coding Sandbox"])
    app.include_router(candidate_bp, prefix="/api/candidate", tags=["Candidate"])
    app.include_router(bulk_email_bp, prefix="/api/admin/bulk-email", tags=["Bulk Email"])

    # Scratch folder for transient processing only (Whisper temp audio, resume parsing).
    # Nothing is PERSISTED locally (DB Integration §3) — every file written here is
    # deleted after processing; durable media lives in Supabase Storage.
    os.makedirs(config_class.UPLOAD_FOLDER, exist_ok=True)

    # Initialize tables + apply lightweight column migrations for pre-existing DBs
    from app.database.migrate import ensure_schema, ensure_constraints, ensure_indexes
    ensure_schema()
    Base.metadata.create_all(bind=engine)
    # Add the proctor_snapshots -> interviews FK for pre-existing DBs (own try/except: a
    # constraint add is more failure-prone than a plain ADD COLUMN, but nothing in the
    # request path depends on it existing, only on the columns existing).
    try:
        ensure_constraints()
    except Exception as e:
        print(f"[migrate] ensure_constraints skipped: {e}")
    # Add indexes on hot columns (idempotent, additive) so queries stay fast at scale.
    try:
        ensure_indexes()
    except Exception as e:
        print(f"[index] ensure_indexes skipped: {e}")

    # Seed / maintain the admin account.
    #
    # This used to seed admin@interviewer.com with the password "admin123", written in this
    # file. That is a working credential for anyone who has seen the repository, and it is
    # exactly how someone signs into the Admin Portal "without credentials". The password
    # now comes only from ADMIN_PASSWORD, and setting that variable also ROTATES an existing
    # admin's password on the next boot — which is how a leaked one gets retired.
    try:
        import secrets as _secrets
        from app.models import User, Token
        from app.utils.security import ROLE_SUPER_ADMIN
        admin_email = config_class.ADMIN_EMAIL
        admin_password = config_class.ADMIN_PASSWORD
        admin = User.query.filter_by(email=admin_email).first()

        if not admin:
            # Without a configured password, seed an unusable random one rather than a
            # guessable one: a locked-out admin is recoverable, a public admin login is not.
            generated = None
            if not admin_password:
                generated = _secrets.token_urlsafe(18)
                admin_password = generated

            print("Seeding dedicated admin account...")
            admin = User(
                name="Administrator",
                email=admin_email,
                # Seeded as SUPER admin: on an empty database this is the only account
                # there will ever be until somebody creates more, and only a super admin
                # can create them. Seeding a plain admin would produce a system nobody can
                # add a second admin to.
                role=ROLE_SUPER_ADMIN,
                country="United States",
                experience_level="Senior",
                job_role="Platform Manager"
            )
            admin.set_password(admin_password)
            db.session.add(admin)
            db.session.flush()

            token_account = Token(user_id=admin.id, tokens_available=999)
            db.session.add(token_account)

            db.session.commit()
            if generated:
                print(
                    f"[SECURITY] ADMIN_PASSWORD was not set, so a random admin password was\n"
                    f"[SECURITY] generated. It is shown ONCE, here:\n"
                    f"[SECURITY]     {admin_email} / {generated}\n"
                    f"[SECURITY] Save it now, or set ADMIN_PASSWORD and restart to choose your own."
                )
            else:
                print("Dedicated admin seeded successfully!")

        elif admin_password and not admin.check_password(admin_password):
            # ADMIN_PASSWORD changed (or is being applied for the first time to an account
            # created under the old hard-coded default) — rotate to it and kill every token
            # issued under the previous password.
            import datetime as _dt
            admin.set_password(admin_password)
            admin.session_revoked_at = _dt.datetime.utcnow().replace(microsecond=0)
            db.session.commit()
            print("[SECURITY] Admin password rotated from ADMIN_PASSWORD; old sessions revoked.")

        elif not admin_password:
            print(
                "[SECURITY] ADMIN_PASSWORD is not set. If this admin account still uses an\n"
                "[SECURITY] old default password, set ADMIN_PASSWORD and restart to replace it."
            )

        # Bootstrap: make sure SOMEONE can reach the management surface.
        #
        # This database predates the super_admin role, so its one admin account is still a
        # plain 'admin' — and only a super admin can create companies or other admins. That
        # is a system with no way in. Promoting the configured ADMIN_EMAIL account closes it.
        #
        # Guarded on there being no super admin at all, so this runs exactly once, on the
        # first boot after this change, and never touches roles again afterwards. It also
        # never DEMOTES anyone: if a super admin already exists this block does nothing.
        if admin and not User.query.filter_by(role=ROLE_SUPER_ADMIN).first():
            admin.role = ROLE_SUPER_ADMIN
            db.session.commit()
            print(f"[SECURITY] Promoted {admin_email} to super admin (no super admin existed).")
    except Exception as e:
        db.session.rollback()
        print(f"Failed to seed admin on startup: {str(e)}")
    finally:
        # Not optional, and not tidiness. This block always runs `SELECT ... FROM users`,
        # and on the common path (the admin already exists) it never commits — so without
        # this the startup session stays open, idle in transaction, holding an ACCESS SHARE
        # lock on `users` for the entire life of the process.
        #
        # That is not a slow leak, it is a permanent one, and it broke deploys: this exact
        # session, left behind by the container from two days earlier, is what blocked
        # `ALTER TABLE users ADD COLUMN` in the next deployment. ADD COLUMN needs ACCESS
        # EXCLUSIVE, which can never be granted while an ACCESS SHARE holder sits there, so
        # the migration timed out and the new container died — the old boot sabotaging the
        # new one. Every future column add would have hit the same wall.
        #
        # remove() returns the connection to the pool and ends its transaction. Requests
        # already get this from db_session_middleware; startup ran outside that middleware.
        db.session.remove()

    # Start the background retention worker that auto-deletes interview recordings older
    # than the retention window (RECORDING_RETENTION_DAYS) and audits each deletion.
    try:
        from app.routes.interview_routes import start_recording_cleanup_worker
        start_recording_cleanup_worker()
    except Exception as e:
        print(f"Failed to start recording-cleanup worker: {str(e)}")

    # Joins the parts of any completed interview whose browser-side /finalize-video never
    # landed — chiefly the one-time candidate whose forced logout revokes the session while
    # that request is still assembling.
    try:
        from app.routes.interview_routes import start_recording_assembly_worker
        start_recording_assembly_worker()
    except Exception as e:
        print(f"Failed to start recording-assembly worker: {str(e)}")

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
            # This response is built outside CORSMiddleware and would otherwise reach the
            # browser with no CORS headers at all, which is reported as a CORS failure
            # instead of the 500 it actually is. See cors_headers_for above.
            headers=cors_headers_for(request.headers.get('origin'), allowed_origins),
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
