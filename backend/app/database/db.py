import contextvars
import threading

from sqlalchemy import (
    create_engine, Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean,
    UniqueConstraint,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session, relationship, backref
from app.config.config import Config

# Safe database URL parsing (Postgres URL format fix)
db_url = Config.SQLALCHEMY_DATABASE_URI
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# DB Integration §3: Postgres/Supabase is the ONLY supported database. Fail fast and
# loudly rather than silently falling back to a local file store.
if not db_url:
    raise RuntimeError(
        "DATABASE_URL is not set. This application requires a PostgreSQL/Supabase "
        "database — local/SQLite storage is not supported. Set DATABASE_URL in "
        "backend/.env (Supabase Dashboard -> Project Settings -> Database -> "
        "Connection string)."
    )
if db_url.startswith("sqlite"):
    raise RuntimeError(
        "SQLite is not supported (DB Integration §3 — no local storage anywhere, "
        "including development). Point DATABASE_URL at PostgreSQL/Supabase instead."
    )

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    # DATABASE_URL points at Supabase's TRANSACTION pooler (port 6543), which multiplexes
    # ~200 client connections over a few server ones, so the ceiling here is ours to choose
    # rather than the database's.
    #
    # This was pool_size=5/max_overflow=5. Ten connections is plenty for "two developers
    # plus background threads", which is what it was sized for — but the app runs as a
    # SINGLE uvicorn process, so that same ten is the entire concurrency budget for every
    # candidate at once. Under a real cohort it ran dry and threw
    #   TimeoutError: QueuePool limit of size 5 overflow 5 reached, connection timed out
    # on ordinary traffic (heartbeats, /users/profile, admin polling). Because the auth
    # bootstrap call is one of the requests that blocks, the app never leaves its loading
    # state and candidates just sit on a blank page mid-interview — the pool is a single
    # shared failure point, so a handful of slow requests stalls everyone, not just the
    # candidate who caused it.
    #
    # 60 concurrent checkouts stays far below the pooler's ~200 client-connection budget
    # while leaving headroom for a full cohort plus the background email/scoring threads,
    # which take their own sessions and would otherwise compete with live interviews.
    pool_size=25,
    max_overflow=35,
    # Recycle idle connections so the pooler doesn't hold a server slot indefinitely.
    pool_recycle=300,
    pool_timeout=30,
    # libpq connection hardening (passed through psycopg2). Without connect_timeout, an
    # unreachable database makes the very first connect — which happens during app startup
    # (ensure_schema) — hang indefinitely, so the server never binds its port and a
    # platform healthcheck just times out with no useful error. A bounded timeout instead
    # surfaces a clear "connection timed out" in the logs within seconds. The keepalives
    # keep pooled connections alive through the PgBouncer front-end and detect dropped
    # links promptly.
    connect_args={
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    },
)

# FastAPI runs sync endpoints in anyio worker threads, so a query started inside a request
# checks out its connection under the *worker* thread — but the HTTP middleware that calls
# db.session.remove() runs on the *event-loop* thread. With the default thread-id scoping
# those are different sessions, so the worker's connection is never returned and the pool
# leaks itself dry within a handful of requests.
#
# Scope each session to the request instead: the middleware stamps a unique id into this
# contextvar, which anyio copies into the worker thread, so the query and the remove() land
# on the SAME session. Background scoring/email threads (plain threading.Thread, no request
# context) fall back to per-thread scoping and clean up with their own db.session.remove().
_request_scope_id = contextvars.ContextVar("db_request_scope_id", default=None)


def new_request_scope():
    """Middleware entry: give this request its own session identity. Returns a token to reset."""
    import uuid
    return _request_scope_id.set(uuid.uuid4().hex)


def reset_request_scope(token):
    _request_scope_id.reset(token)


def _session_scopefunc():
    rid = _request_scope_id.get()
    if rid is not None:
        return ("request", rid)
    return ("thread", threading.get_ident())


db_session = scoped_session(
    sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine
    ),
    scopefunc=_session_scopefunc,
)

Base = declarative_base()
Base.query = db_session.query_property()

class db:
    # Model Base
    Model = Base
    
    # Session Reference
    session = db_session
    
    # Column mapping helpers to preserve Flask-SQLAlchemy schemas
    Column = Column
    Integer = Integer
    String = String
    Float = Float
    Text = Text
    DateTime = DateTime
    ForeignKey = ForeignKey
    Boolean = Boolean
    UniqueConstraint = UniqueConstraint
    relationship = relationship
    backref = backref
