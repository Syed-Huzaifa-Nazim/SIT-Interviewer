from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session, relationship, backref
from app.config.config import Config

# Safe database URL parsing (Postgres URL format fix)
db_url = Config.SQLALCHEMY_DATABASE_URI
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
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
