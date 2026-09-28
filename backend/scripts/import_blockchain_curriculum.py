"""Import only Blockchain into configured PostgreSQL/Supabase; no app startup or schema changes.
Run from backend: python scripts/import_blockchain_curriculum.py [--dry-run]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
from scripts.import_curriculum import import_curriculum
from app.database.db import db

DATA_FILE = Path(__file__).resolve().parents[1] / 'data' / 'blockchain_curriculum.json'


def other_curricula():
    # Compare every column of the other courses/modules/topics before committing.
    statements = [
        "SELECT row_to_json(c)::text FROM curriculum_courses c WHERE c.slug <> 'blockchain' ORDER BY c.id",
        "SELECT row_to_json(m)::text FROM curriculum_modules m JOIN curriculum_courses c ON c.id=m.course_id WHERE c.slug <> 'blockchain' ORDER BY m.id",
        "SELECT row_to_json(t)::text FROM curriculum_topics t JOIN curriculum_modules m ON m.id=t.module_id JOIN curriculum_courses c ON c.id=m.course_id WHERE c.slug <> 'blockchain' ORDER BY t.id",
    ]
    return [db.session.execute(text(sql)).scalars().all() for sql in statements]


def run(dry_run=False):
    if dry_run:
        return import_curriculum(str(DATA_FILE), dry_run=True)
    try:
        db.session.execute(text("SET LOCAL statement_timeout = '15s'"))
        db.session.execute(text("SET LOCAL lock_timeout = '5s'"))
        # Serialize this importer without locking unrelated course/interview rows.
        db.session.execute(text("SELECT pg_advisory_xact_lock(78294613)"))
        before = other_curricula()
        result = import_curriculum(str(DATA_FILE), commit=False)
        if other_curricula() != before:
            raise RuntimeError('An existing curriculum changed during import; rolling back Blockchain import.')
        db.session.commit()
        print('[blockchain-import] Committed. All other curriculum rows are unchanged.')
        return result
    except Exception:
        db.session.rollback()
        raise
    finally:
        db.session.remove()


if __name__ == '__main__':
    run(dry_run='--dry-run' in sys.argv)
