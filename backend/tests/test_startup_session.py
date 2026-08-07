"""Guards the startup path against leaking an open transaction.

`create_app` queries `users` to seed/maintain the admin account, and on the common path
(the admin already exists) it never commits. Requests are covered by
`db_session_middleware`, which calls `db.session.remove()` in a finally — but startup runs
outside that middleware, so the session it opens stays alive for the whole process, idle in
transaction, holding an ACCESS SHARE lock on `users`.

That lock made two deployments fail. `ALTER TABLE users ADD COLUMN` needs ACCESS EXCLUSIVE,
which Postgres can never grant while an ACCESS SHARE holder is sitting there, so the
boot-time migration in each new container timed out against a session left behind by the
previous container — one of them two days old. Every future column add would have hit the
same wall.

These are source-level assertions because the behaviour only manifests against a real
database, and this suite deliberately runs without one.
"""

import re
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
INIT_SOURCE = (BACKEND_ROOT / 'app' / '__init__.py').read_text(encoding='utf-8')


def test_startup_admin_block_releases_its_session():
    """The admin seed/maintain block must end in a finally that removes the session."""
    block = INIT_SOURCE.split('# Seed / maintain the admin account.')[1]
    # Stop at the next top-level startup step so we only inspect this block's own finally.
    block = block.split('# Start the background retention worker')[0]

    assert 'finally:' in block, 'startup admin block has no finally clause'
    finally_body = block.split('finally:')[1]
    assert 'db.session.remove()' in finally_body, (
        'startup admin block must call db.session.remove() in its finally — otherwise it '
        'holds an ACCESS SHARE lock on users for the life of the process and blocks every '
        'future ALTER TABLE'
    )


def test_request_middleware_still_removes_the_session():
    """The per-request cleanup is the other half of the same contract."""
    middleware = INIT_SOURCE.split('async def db_session_middleware')[1].split('# Register Routers')[0]
    assert 'finally:' in middleware
    assert 'db.session.remove()' in middleware.split('finally:')[1]


def test_background_worker_removes_its_session():
    """The retention worker runs on its own thread, outside the request middleware, so it
    owns the same responsibility."""
    source = (BACKEND_ROOT / 'app' / 'routes' / 'interview_routes.py').read_text(encoding='utf-8')
    cleanup = source.split('def cleanup_expired_recordings')[1].split('\ndef ')[0]
    assert 'finally:' in cleanup
    assert 'db.session.remove()' in cleanup.split('finally:')[1]


def test_column_adds_are_bounded_by_a_lock_timeout():
    """A boot-time ALTER must never queue indefinitely: once it is waiting for ACCESS
    EXCLUSIVE, every query arriving behind it blocks too, so an unbounded wait can stall the
    site that is still serving."""
    source = (BACKEND_ROOT / 'app' / 'database' / 'migrate.py').read_text(encoding='utf-8')
    assert re.search(r'SET LOCAL lock_timeout', source), 'ADD COLUMN runs without a lock_timeout'
    assert 'ADD COLUMN' in source
