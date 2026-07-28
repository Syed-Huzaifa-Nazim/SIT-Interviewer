"""Shared pytest setup.

DATABASE SAFETY
---------------
`app.database.db` does get imported transitively (some AI helpers pull in
`app.utils.candidate`), which constructs a SQLAlchemy Engine. SQLAlchemy engines are lazy,
so constructing one opens no socket — but "should not connect" is not good enough when the
configured DATABASE_URL points at the real Supabase database.

So this file installs a hard guard: the first time anything attempts an actual DB
connection, the test run FAILS LOUDLY instead of touching real data. The suite is designed
to need no database at all; if that guard ever fires, it is a bug in the test, not
something to work around.

AI SAFETY
---------
Every test runs with AI_MODE=mock and the API keys blanked, so no outbound call is made to
any AI provider and nothing is billed.
"""

import os
import sys

# Make `import app...` resolve from the backend package root regardless of where pytest
# was invoked from.
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

# Force offline, deterministic AI behaviour BEFORE app.config is first imported.
os.environ['AI_MODE'] = 'mock'
os.environ.pop('MIXTRAL_API_KEY', None)
os.environ.pop('WHISPER_API_KEY', None)

import pytest  # noqa: E402
from sqlalchemy import event  # noqa: E402
from app.config.config import Config  # noqa: E402


def _install_db_connection_guard():
    """Fail the run if anything tries to open a real database connection.

    The engine object is built at import time (lazily, no socket). This listener fires only
    on an ACTUAL connect attempt, which must never happen in this suite.
    """
    try:
        from app.database.db import engine
    except Exception:
        # No engine importable — nothing to guard, which is even safer.
        return

    @event.listens_for(engine, 'do_connect')
    def _block_real_connections(dialect, conn_rec, cargs, cparams):  # noqa: ARG001
        raise RuntimeError(
            "TEST SAFETY: a test attempted a real database connection. "
            "This suite must not touch the configured DATABASE_URL "
            "(it points at the live Supabase database). Fix the test instead."
        )


_install_db_connection_guard()


@pytest.fixture(autouse=True)
def offline_ai_mode():
    """Guarantee every test sees mock mode with no keys, and restore afterwards.

    Config reads the environment once at import time, so the values are pinned on the
    Config object directly rather than via os.environ.
    """
    previous = (Config.AI_MODE, Config.MIXTRAL_API_KEY, Config.WHISPER_API_KEY)
    Config.AI_MODE = 'mock'
    Config.MIXTRAL_API_KEY = ''
    Config.WHISPER_API_KEY = ''
    yield
    Config.AI_MODE, Config.MIXTRAL_API_KEY, Config.WHISPER_API_KEY = previous
