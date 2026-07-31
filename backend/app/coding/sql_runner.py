"""SQL execution for the coding sandbox.

Each SQL problem ships a schema plus per-test seed data. For every test case we build a
FRESH in-memory SQLite database, apply the schema and that test's seed rows, run the
candidate's query, and compare the returned result set against the expected rows.

Why in-memory SQLite:
  * Total isolation — the database exists only inside this process for the duration of one
    test and is discarded afterwards, so a candidate's query has no path whatsoever to the
    platform's real Supabase/Postgres data (§4). Nothing is ever written to disk.
  * Deterministic — every run starts from the same seed, so results are comparable.
  * No infrastructure — it is in the Python standard library, so there is no extra service
    to provision, unlike spinning up a Postgres instance per submission.

Safety model (mirrors the constraints the other languages' runner enforces):
  * READ-ONLY. A sqlite3 authorizer rejects every write/DDL operation at the engine level,
    so INSERT/UPDATE/DELETE/DROP/ALTER/ATTACH cannot execute even if the text filter is
    somehow bypassed. This is enforced by SQLite itself, not by string matching.
  * One statement only — prevents stacked queries like "SELECT 1; DROP TABLE x".
  * Wall-clock timeout via a progress handler, so an unbounded cross join is aborted
    instead of hanging the worker.
  * No filesystem or network access is reachable from SQLite's query surface.
"""

import re
import sqlite3
import time

# Statement types the authorizer will allow. Everything else is denied outright.
_ALLOWED_ACTIONS = {
    sqlite3.SQLITE_SELECT,
    sqlite3.SQLITE_READ,
    sqlite3.SQLITE_FUNCTION,
    sqlite3.SQLITE_RECURSIVE,
}

# Blocked up-front so the candidate gets a clear message rather than an opaque engine
# error. The authorizer below is the real enforcement; this is just a friendlier gate.
_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|"
    r"PRAGMA|VACUUM|REINDEX|GRANT|REVOKE)\b",
    re.IGNORECASE,
)

_MAX_ROWS = 500  # guard against a query that returns an enormous result set


def _authorizer(action, arg1, arg2, db_name, trigger):
    """Engine-level read-only enforcement — denies anything that could mutate data."""
    if action in _ALLOWED_ACTIONS:
        return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY


def _strip_sql_comments(query):
    """Remove -- line and /* block */ comments so keyword checks can't be smuggled past."""
    query = re.sub(r"--[^\n]*", " ", query)
    query = re.sub(r"/\*.*?\*/", " ", query, flags=re.DOTALL)
    return query


def _validate(query):
    """Return an error string if the query must not run, else None."""
    if not (query or "").strip():
        return "Your query is empty. Write a SELECT statement before running."

    cleaned = _strip_sql_comments(query).strip().rstrip(";").strip()
    if not cleaned:
        return "Your query is empty. Write a SELECT statement before running."

    # Reject stacked statements ("SELECT 1; DROP TABLE t") — only one statement is allowed.
    if ";" in cleaned:
        return "Only a single SQL statement is allowed. Remove the extra ';' and try again."

    if _FORBIDDEN.search(cleaned):
        return (
            "Only read-only SELECT queries are allowed in this exercise. "
            "Statements that modify data or schema are blocked."
        )

    lowered = cleaned.lstrip("( \t\n").lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        return "Your query must be a SELECT statement (it may start with a WITH clause)."

    return None


def _normalise_row(row):
    """Make engine values comparable to the JSON-ish expected values in the problem bank."""
    out = []
    for value in row:
        # SQLite returns Decimal-free numerics already; collapse float ints (2.0 -> 2) so a
        # COUNT/SUM answer compares equal to the integer written in the expected rows.
        if isinstance(value, float) and value.is_integer():
            out.append(int(value))
        else:
            out.append(value)
    return out


def _run_one(query, schema_sql, seed_sql, time_limit):
    """Execute the query against a freshly seeded in-memory DB.

    Returns (status, columns, rows, error, runtime_ms) where status is 'ok', 'error' or
    'timeout'.
    """
    started = time.perf_counter()
    conn = sqlite3.connect(":memory:")
    try:
        # Build the fixture with the authorizer OFF — the schema and seed are ours, not the
        # candidate's. It is switched on immediately afterwards, before their query runs.
        conn.executescript(schema_sql)
        if seed_sql:
            conn.executescript(seed_sql)
        conn.commit()

        deadline = time.perf_counter() + time_limit

        def _guard():
            # Non-zero return aborts the running statement — this is what kills a runaway
            # cross join instead of letting it block the worker.
            return 1 if time.perf_counter() > deadline else 0

        conn.set_progress_handler(_guard, 2000)
        conn.set_authorizer(_authorizer)

        cur = conn.execute(query)
        rows = cur.fetchmany(_MAX_ROWS + 1)
        columns = [d[0] for d in (cur.description or [])]

        runtime_ms = int((time.perf_counter() - started) * 1000)

        if len(rows) > _MAX_ROWS:
            return ("error", columns, [],
                    f"Your query returned more than {_MAX_ROWS} rows. Narrow the result set.",
                    runtime_ms)

        return ("ok", columns, [_normalise_row(r) for r in rows], None, runtime_ms)

    except sqlite3.OperationalError as e:
        runtime_ms = int((time.perf_counter() - started) * 1000)
        message = str(e)
        # The progress handler aborts with "interrupted"; surface that as a timeout so the
        # candidate sees the same wording other languages use.
        if "interrupt" in message.lower():
            return ("timeout", [], [],
                    f"Time limit exceeded ({time_limit}s). Check for an unbounded join.",
                    runtime_ms)
        return ("error", [], [], f"SQL error: {message}", runtime_ms)
    except sqlite3.DatabaseError as e:
        runtime_ms = int((time.perf_counter() - started) * 1000)
        msg = str(e)
        if "not authorized" in msg.lower():
            return ("error", [], [],
                    "Only read-only SELECT queries are allowed in this exercise.", runtime_ms)
        return ("error", [], [], f"SQL error: {msg}", runtime_ms)
    except Exception as e:  # pragma: no cover - defensive
        runtime_ms = int((time.perf_counter() - started) * 1000)
        return ("error", [], [], f"Execution failed: {e}", runtime_ms)
    finally:
        try:
            conn.set_authorizer(None)
        except Exception:
            pass
        conn.close()


def execute_sql_submission(query, problem, test_cases, time_limit=5):
    """Run a candidate SQL query against every test case for ``problem``.

    Mirrors the return shape of runner.execute_submission so the route and the frontend
    handle SQL results exactly like any other language.
    """
    invalid = _validate(query)
    if invalid:
        return {
            "supported": True,
            "language": "sql",
            "error": invalid,
            "passed": 0,
            "total": len(test_cases),
            "score": 0,
            "results": [],
        }

    schema_sql = problem.get("schema_sql") or ""
    clean_query = _strip_sql_comments(query).strip().rstrip(";").strip()

    results = []
    passed = 0

    for idx, tc in enumerate(test_cases):
        hidden = bool(tc.get("hidden"))
        expected_rows = [list(r) for r in tc.get("expected", [])]

        status, columns, rows, error, runtime_ms = _run_one(
            clean_query, schema_sql, tc.get("seed", ""), time_limit
        )

        if status == "ok":
            is_pass = rows == expected_rows
            result_status = "passed" if is_pass else "failed"
        else:
            is_pass = False
            result_status = status

        if is_pass:
            passed += 1

        entry = {
            "index": idx + 1,
            "hidden": hidden,
            "status": result_status,
            "runtime_ms": runtime_ms,
        }
        # Reveal the dataset and both result sets only for visible sample tests.
        if not hidden:
            entry["scenario"] = tc.get("name", "")
            entry["columns"] = columns or tc.get("expected_columns", [])
            entry["rows"] = rows
            entry["expected_rows"] = expected_rows
            entry["expected_columns"] = tc.get("expected_columns", [])
        if error:
            entry["error"] = error if not hidden else "Hidden test failed."
        results.append(entry)

    total = len(test_cases)
    return {
        "supported": True,
        "language": "sql",
        "error": None,
        "passed": passed,
        "total": total,
        "score": round((passed / total) * 100) if total else 0,
        "results": results,
    }
