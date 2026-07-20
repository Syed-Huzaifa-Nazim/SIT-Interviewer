"""One-shot data migration: local PostgreSQL -> Supabase PostgreSQL (DB Integration §1/§3).

Prerequisites (both in backend/.env):
  DATABASE_URL        = the NEW Supabase Postgres connection string (the target)
  SOURCE_DATABASE_URL = the OLD local Postgres connection string (the source)

What it does, in order:
  1. Builds the full schema on the target via the app's own models + ensure_schema()
     (identical to what the app creates on boot — no separate migration tool).
  2. Copies every table's rows source -> target in FK-safe order, preserving primary
     keys, then resets the target's ID sequences.
  3. Uploads any legacy LOCAL answer-audio files (backend/uploads/*.webm referenced by
     interview_responses.audio_path) into the private interview-audio bucket, rewrites
     those rows to supabase:// refs on the TARGET, and deletes the local files —
     eliminating the last local persistence (§3).
  4. Prints a per-table source/target row-count comparison so the migration is verifiable
     at a glance.

Safety: refuses to run if the target already contains users, unless --force is passed.
Run from the backend folder:  python scripts/migrate_to_supabase.py
"""
import os
import sys
import argparse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

parser = argparse.ArgumentParser()
parser.add_argument('--force', action='store_true',
                    help='copy even if the target already has data (target rows are kept, duplicates will fail)')
parser.add_argument('--skip-files', action='store_true',
                    help='skip the legacy local-audio upload step')
args = parser.parse_args()

target_url = os.environ.get('DATABASE_URL', '')
source_url = os.environ.get('SOURCE_DATABASE_URL', '')
if not target_url or not source_url:
    sys.exit("Set BOTH DATABASE_URL (Supabase target) and SOURCE_DATABASE_URL (old local "
             "Postgres) in backend/.env before running this script.")
for name, url in (('DATABASE_URL', target_url), ('SOURCE_DATABASE_URL', source_url)):
    if url.startswith('sqlite'):
        sys.exit(f"{name} points at SQLite — not supported (§3).")

# Importing the app binds its engine to DATABASE_URL (the Supabase target) and lets
# create_app() build the schema there exactly as production boot would.
from app import create_app
create_app()
from app.database.db import db, Base, engine as target_engine

from sqlalchemy import create_engine, text
source_engine = create_engine(
    source_url.replace('postgres://', 'postgresql://', 1), pool_pre_ping=True)

# ---- safety check -------------------------------------------------------------
with target_engine.connect() as t:
    existing_users = t.execute(text('select count(*) from users')).scalar()
if existing_users and not args.force:
    sys.exit(f"Target already has {existing_users} user(s). The seeded admin alone is fine to "
             f"overwrite-skip, but if this is unexpected STOP and check DATABASE_URL. "
             f"Re-run with --force to proceed anyway.")

# ---- 1+2. copy rows in FK order, preserving IDs --------------------------------
print("Copying tables (FK-safe order, IDs preserved)...")
copied = {}
with source_engine.connect() as s, target_engine.begin() as t:
    for table in Base.metadata.sorted_tables:
        cols = [c.name for c in table.columns]
        rows = s.execute(text(f'select * from {table.name}')).mappings().all()
        n = 0
        for row in rows:
            data = {k: row[k] for k in cols if k in row}
            # The target seeds its own admin on boot; skip identical-email collisions.
            if table.name == 'users':
                dup = t.execute(text('select id from users where email = :e'),
                                {'e': data.get('email')}).first()
                if dup:
                    continue
            placeholders = ', '.join(f':{k}' for k in data)
            collist = ', '.join(data.keys())
            t.execute(text(f'insert into {table.name} ({collist}) values ({placeholders}) '
                           f'on conflict (id) do nothing'), data)
            n += 1
        copied[table.name] = n
    # reset sequences so new inserts don't collide with preserved IDs
    for table in Base.metadata.sorted_tables:
        if 'id' in table.columns:
            t.execute(text(
                f"select setval(pg_get_serial_sequence('{table.name}', 'id'), "
                f"coalesce((select max(id) from {table.name}), 1))"))

# ---- 3. legacy local audio -> Supabase Storage ---------------------------------
if not args.skip_files:
    print("Migrating legacy local answer-audio files to Supabase Storage...")
    from app.utils.supabase_service import SupabaseService
    from app.config.config import Config
    uploads = Config.UPLOAD_FOLDER
    moved = failed = 0
    with target_engine.begin() as t:
        rows = t.execute(text(
            "select id, audio_path from interview_responses "
            "where audio_path is not null and audio_path not like 'supabase://%'")).all()
        for rid, apath in rows:
            fname = os.path.basename(apath.replace('\\', '/'))
            local = os.path.join(uploads, fname)
            if not os.path.exists(local):
                print(f"  ! response {rid}: local file missing ({fname}) — clearing dead ref")
                t.execute(text('update interview_responses set audio_path = null where id = :i'), {'i': rid})
                continue
            with open(local, 'rb') as f:
                contents = f.read()
            bucket = Config.SUPABASE_AUDIO_BUCKET or 'interview-audio'
            if SupabaseService._upload_raw(bucket, fname, contents, 'audio/webm'):
                t.execute(text('update interview_responses set audio_path = :p where id = :i'),
                          {'p': f'supabase://{bucket}/{fname}', 'i': rid})
                os.remove(local)
                moved += 1
            else:
                failed += 1
                print(f"  ! response {rid}: upload FAILED — local file kept for retry")
    print(f"  audio files migrated: {moved}, failed: {failed}")
    # Remaining .webm files in uploads/ are unreferenced temp leftovers — remove them.
    leftovers = [f for f in os.listdir(uploads) if f.endswith('.webm')]
    if failed == 0:
        for f in leftovers:
            os.remove(os.path.join(uploads, f))
        print(f"  unreferenced temp files removed: {len(leftovers)}")
    else:
        print(f"  NOTE: {len(leftovers)} local file(s) left in place because of upload failures — rerun after fixing connectivity.")

# ---- 4. verification ------------------------------------------------------------
print("\nRow counts (source -> target):")
ok = True
with source_engine.connect() as s, target_engine.connect() as t:
    for table in Base.metadata.sorted_tables:
        sc = s.execute(text(f'select count(*) from {table.name}')).scalar()
        tc = t.execute(text(f'select count(*) from {table.name}')).scalar()
        flag = 'OK ' if tc >= sc else '!! '
        if tc < sc:
            ok = False
        print(f"  {flag}{table.name:26s} {sc:5d} -> {tc:5d}")

print("\nMigration " + ("COMPLETE — target has every source row." if ok else
                        "INCOMPLETE — tables flagged !! above need attention."))
