"""Real code execution against test cases.

The candidate implements a named function; for each test case we build a small driver
that reads the arguments from stdin as JSON, calls the function, and writes the return
value back so we can compare it to the expected output. Execution runs in a subprocess
with a per-test timeout, so infinite loops are killed rather than hanging the server.

NOTE ON ISOLATION: this local runner executes code directly on the host with a timeout
guard. It is intentionally kept behind the single ``execute_submission`` entry point so a
sandboxed backend (Judge0 / Docker) can be swapped in without touching the routes or the
frontend. It is currently gated to admins only (see §1.4). Memory limits are best-effort:
the timeout catches runaway CPU/loops; hard RSS caps are not enforced on Windows hosts.
"""

import os
import json
import time
import tempfile
import subprocess

_MARKER = "__CJ_RESULT_a7f3__"

# Interpreter candidates per language (first one found on PATH wins).
_LANG_CONFIG = {
    "python": {"cmds": ["python", "python3"], "ext": ".py"},
    "javascript": {"cmds": ["node"], "ext": ".js"},
}


def _python_driver(user_code, function_name):
    return (
        f"{user_code}\n\n"
        "import sys as _sys, json as _json\n"
        "_payload = _json.loads(_sys.stdin.read() or '[]')\n"
        f"_result = {function_name}(*_payload)\n"
        f"_sys.stdout.write('\\n{_MARKER}' + _json.dumps(_result, default=str))\n"
    )


def _javascript_driver(user_code, function_name):
    driver = (
        "const __fs = require('fs');\n"
        "let __raw = '[]';\n"
        "try { __raw = __fs.readFileSync(0, 'utf8') || '[]'; } catch (e) {}\n"
        "const __payload = JSON.parse(__raw || '[]');\n"
        "const __result = " + function_name + "(...__payload);\n"
        "process.stdout.write('\\n" + _MARKER + "' + JSON.stringify(__result));\n"
    )
    return user_code + "\n\n" + driver


def _build_driver(user_code, language, function_name):
    if language == "python":
        return _python_driver(user_code, function_name)
    if language == "javascript":
        return _javascript_driver(user_code, function_name)
    return None


def _resolve_interpreter(language):
    """Return a runnable interpreter command for the language, or None."""
    import shutil
    for cmd in _LANG_CONFIG[language]["cmds"]:
        if shutil.which(cmd):
            return cmd
    return None


def _extract_result(stdout):
    """Split the sentinel-tagged result from any stdout the user's code printed."""
    if _MARKER in stdout:
        user_out, _, result_part = stdout.rpartition(_MARKER)
        return user_out.strip(), result_part.strip()
    return stdout.strip(), None


def _run_single(interpreter, file_path, args, timeout):
    """Execute one test case. Returns (status, actual, user_stdout, error, runtime_ms)."""
    started = time.perf_counter()
    try:
        proc = subprocess.run(
            [interpreter, file_path],
            input=json.dumps(args),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        runtime_ms = int((time.perf_counter() - started) * 1000)
        return "timeout", None, "", f"Time limit exceeded ({timeout}s). Possible infinite loop.", runtime_ms

    runtime_ms = int((time.perf_counter() - started) * 1000)

    if proc.returncode != 0:
        err = (proc.stderr or "Runtime error").strip()
        return "error", None, "", err[-600:], runtime_ms

    user_stdout, result_raw = _extract_result(proc.stdout or "")
    if result_raw is None:
        return "error", None, user_stdout, "No result produced (did you define the required function?)", runtime_ms

    try:
        actual = json.loads(result_raw)
    except Exception:
        actual = result_raw  # fall back to raw string comparison
    return "ok", actual, user_stdout, None, runtime_ms


def execute_submission(code, language, function_name, test_cases, time_limit=5):
    """Run ``code`` against ``test_cases`` and return a structured result.

    Each element of ``test_cases`` is {"args": [...], "expected": ..., "hidden": bool}.
    Returns a dict with per-test results and an aggregate score.
    """
    language = (language or "").lower()
    if language not in _LANG_CONFIG:
        return {
            "supported": False,
            "error": f"Live execution for '{language}' is not available yet. Use Python or JavaScript.",
            "passed": 0, "total": len(test_cases), "score": 0, "results": [],
        }

    interpreter = _resolve_interpreter(language)
    if not interpreter:
        return {
            "supported": False,
            "error": f"The {language} runtime is not installed on the server. Please try another language.",
            "passed": 0, "total": len(test_cases), "score": 0, "results": [],
        }

    if not (code or "").strip():
        return {
            "supported": True,
            "error": "Your code is empty. Implement the function before running.",
            "passed": 0, "total": len(test_cases), "score": 0, "results": [],
        }

    driver = _build_driver(code, language, function_name)
    ext = _LANG_CONFIG[language]["ext"]

    tmp_path = None
    results = []
    passed = 0
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False, mode="w", encoding="utf-8") as tf:
            tf.write(driver)
            tmp_path = tf.name

        for idx, tc in enumerate(test_cases):
            hidden = bool(tc.get("hidden"))
            args = tc.get("args", [])
            expected = tc.get("expected")

            status, actual, user_stdout, error, runtime_ms = _run_single(
                interpreter, tmp_path, args, time_limit
            )

            if status == "ok":
                is_pass = actual == expected
                result_status = "passed" if is_pass else "failed"
            else:
                is_pass = False
                result_status = status  # 'timeout' or 'error'

            if is_pass:
                passed += 1

            entry = {
                "index": idx + 1,
                "hidden": hidden,
                "status": result_status,
                "runtime_ms": runtime_ms,
            }
            # Reveal details only for visible (sample) tests.
            if not hidden:
                entry["input"] = _format_args(args)
                entry["expected"] = expected
                entry["actual"] = actual if status == "ok" else None
                if user_stdout:
                    entry["stdout"] = user_stdout[:1000]
            if error:
                entry["error"] = error if not hidden else "Hidden test failed."
            results.append(entry)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    total = len(test_cases)
    return {
        "supported": True,
        "error": None,
        "passed": passed,
        "total": total,
        "score": round((passed / total) * 100) if total else 0,
        "results": results,
    }


def _format_args(args):
    """Render call arguments as a readable string for the console panel."""
    try:
        return ", ".join(json.dumps(a) for a in args)
    except Exception:
        return str(args)
