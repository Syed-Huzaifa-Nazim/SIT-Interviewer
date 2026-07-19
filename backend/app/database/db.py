from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
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
    # Sized for a shared hosted Postgres (Supabase) with two developers plus background
    # scoring/email threads connecting to the same instance — modest per-process pool so
    # combined connections stay well under Supabase's limits.
    pool_size=5,
    max_overflow=10
)

db_session = scoped_session(
    sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine
    )
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
    relationship = relationship
    backref = backref
