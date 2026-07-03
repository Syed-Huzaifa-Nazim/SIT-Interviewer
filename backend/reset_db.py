import os
from app import create_app
from app.database.db import db
from app.models import User, Token

app = create_app()

with app.app_context():
    print("Connecting to database and dropping existing tables...")
    try:
        db.drop_all()
        print("Recreating database tables with new schema...")
        db.create_all()
        
        # Seed Dedicated Admin
        admin_email = "admin@interviewer.com"
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
        print("Database sync completed successfully & seeded dedicated admin (admin@interviewer.com / admin123)!")
    except Exception as e:
        db.session.rollback()
        print(f"Failed to sync database: {str(e)}")
