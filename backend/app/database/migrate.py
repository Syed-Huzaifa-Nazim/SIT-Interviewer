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
