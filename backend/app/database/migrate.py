"""Lightweight, idempotent schema upgrades.

The project has no migration tool (tables come from ``create_all`` on startup), so
existing databases silently miss any column added to a model after the DB file was
first created (this already affected columns like ``users.banned_until`` on older
dev databases). This helper diffs every model table against the live schema and
issues ``ALTER TABLE ... ADD COLUMN`` for anything missing. Safe to run on every
startup: it only ever adds absent columns and never drops or rewrites data.

Columns are added without NOT NULL (existing rows get NULL) — application code
already treats these fields as optional/defaulted.
"""
from sqlalchemy import inspect, text
from app.database.db import engine, Base


def ensure_schema():
    import app.models  # noqa: F401 — make sure every model is registered on Base.metadata

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table_name, table in Base.metadata.tables.items():
        if table_name not in existing_tables:
            continue  # brand-new table — create_all builds it with the full schema

        existing_cols = {col['name'] for col in inspector.get_columns(table_name)}
        missing = [col for col in table.columns if col.name not in existing_cols]
        if not missing:
            continue

        with engine.begin() as conn:
            for col in missing:
                ddl_type = col.type.compile(engine.dialect)
                conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN {col.name} {ddl_type}'))
                print(f"[migrate] Added {table_name}.{col.name} ({ddl_type})")


# Hot columns that get filtered/sorted on frequently. Unique columns (users.email/cnic,
# tokens.user_id, interview_reports.interview_id) already have implicit indexes, so they
# are omitted here. Composite entries create a multi-column index in that order.
_HOT_INDEXES = {
    'interviews': ['user_id', 'status', 'created_at'],
    'interview_questions': ['interview_id'],
    'interview_responses': ['interview_id', ('interview_id', 'question_id')],
    'recording_logs': ['status', 'created_at', 'user_id', 'interview_id'],
    'proctor_snapshots': ['user_id', 'interview_id', 'captured_at'],
    'notifications': ['user_id', 'is_read'],
    'admin_logs': ['created_at'],
    'email_logs': ['created_at', 'to_email'],
    'transactions': ['user_id'],
    'second_interview_requests': ['status'],
    'code_submissions': ['user_id', 'interview_id'],
    'users': ['status', 'banned_until'],
}


def ensure_constraints():
    """One-off idempotent constraint additions ``ensure_schema`` can't do (it only ever adds
    missing columns, never touches an existing column's constraints).

    Closes a data-model gap: ``proctor_snapshots.interview_id`` was left as a bare integer
    with no foreign key, so it was never referentially enforced or ORM-joinable to
    ``interviews``. Postgres has no ``ADD CONSTRAINT IF NOT EXISTS``, so the inspector check
    below is what makes this safe to run on every startup.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if 'proctor_snapshots' not in tables or 'interviews' not in tables:
        return

    has_fk = any(
        fk.get('constrained_columns') == ['interview_id']
        for fk in inspector.get_foreign_keys('proctor_snapshots')
    )
    if has_fk:
        return

    with engine.begin() as conn:
        # Existing rows may point at an interview that no longer exists (or never did) —
        # ADD CONSTRAINT would fail outright on those. Nulling them out first loses nothing
        # about *who* the snapshot belongs to (user_id/candidate_email are separate columns),
        # only the (already-broken) interview link.
        conn.execute(text("""
            UPDATE proctor_snapshots
            SET interview_id = NULL
            WHERE interview_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM interviews WHERE interviews.id = proctor_snapshots.interview_id)
        """))
        conn.execute(text("""
            ALTER TABLE proctor_snapshots
            ADD CONSTRAINT fk_proctor_snapshots_interview_id
            FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE SET NULL
        """))
    print("[migrate] Added FK proctor_snapshots.interview_id -> interviews.id (ON DELETE SET NULL)")


def ensure_indexes():
    """Create btree indexes on frequently filtered/sorted columns (Postgres
    ``CREATE INDEX IF NOT EXISTS`` — idempotent and additive only, never touching data).
    This keeps the hottest lookups and ORDER BYs fast as the tables grow. Each index runs
    in its own autocommit statement so one failure can never abort the others, and every
    table/column is checked to exist first so a partial schema can't raise."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table, specs in _HOT_INDEXES.items():
        if table not in existing_tables:
            continue
        existing_cols = {c['name'] for c in inspector.get_columns(table)}
        for spec in specs:
            cols = (spec,) if isinstance(spec, str) else tuple(spec)
            if any(c not in existing_cols for c in cols):
                continue
            idx_name = f"idx_{table}_{'_'.join(cols)}"
            col_list = ', '.join(cols)
            try:
                with engine.begin() as conn:
                    conn.execute(text(
                        f'CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({col_list})'
                    ))
            except Exception as e:
                print(f"[index] Could not create {idx_name}: {e}")
