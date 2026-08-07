import os
import secrets
from app import create_app
from app.config.config import Config
from app.database.db import db
from app.models import User, Token

app = create_app()

with app.app_context():
    print("Connecting to database and dropping existing tables...")
    try:
        db.drop_all()
        print("Recreating database tables with new schema...")
        db.create_all()
        
        # Seed Dedicated Admin. The password comes from ADMIN_PASSWORD, or is randomly
        # generated and printed once — never a fixed literal, which would be a published
        # credential for the live Admin Portal login.
        admin_email = Config.ADMIN_EMAIL
        admin_password = Config.ADMIN_PASSWORD
        generated = None
        if not admin_password:
            generated = secrets.token_urlsafe(18)
            admin_password = generated

        admin = User(
            name="Administrator",
            email=admin_email,
            role="admin",
            country="United States",
            experience_level="Senior",
            job_role="Platform Manager"
        )
        admin.set_password(admin_password)
        db.session.add(admin)
        db.session.flush()
        
        # Give admin tokens
        token_account = Token(user_id=admin.id, tokens_available=999)
        db.session.add(token_account)
        
        db.session.commit()
        if generated:
            print(f"Database sync completed. Admin seeded — SAVE THIS NOW:\n    {admin_email} / {generated}")
        else:
            print(f"Database sync completed & seeded dedicated admin ({admin_email}) using ADMIN_PASSWORD.")
    except Exception as e:
        db.session.rollback()
        print(f"Failed to sync database: {str(e)}")
