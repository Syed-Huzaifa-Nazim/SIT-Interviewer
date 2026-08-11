"""Coding Sandbox API.

Serves problems (without hidden tests or solutions), runs candidate code against the
visible sample tests ("Run"), and evaluates against the full hidden suite ("Submit"),
persisting each submission for later admin reporting.

Access is gated to admins (§1.4): the sandbox stays hidden from real candidates until it
is verified stable and then wired into the interview flow (§3.5). Lift the `admin_required`
dependency at that point.
"""

import json
from fastapi import APIRouter, Body, HTTPException, Depends
from app.database.db import db
from app.models import User, CodeSubmission
from app.coding.problem_bank import list_problems, get_problem, public_problem, is_sql_problem
from app.coding.runner import execute_submission
from app.coding.sql_runner import execute_sql_submission
from app.models import InterviewQuestion, Interview
from app.utils.security import admin_required, get_current_user_id


def _assigned_problem_or_403(problem_id, user_id):
    """Allow a candidate through only for the exact problem their own live interview
    assigned them.

    The sandbox as a whole stays admin-only (§1.4). This is the single narrow exception that
    lets a Completed-course candidate solve the coding question their interview opens with —
    they cannot list problems, and they cannot reach any problem other than the one attached
    to one of their own interviews.
    """
    if not problem_id:
        raise HTTPException(status_code=403, detail="Not authorised for this problem")
    owns = (
        db.session.query(InterviewQuestion.id)
        .join(Interview, Interview.id == InterviewQuestion.interview_id)
        .filter(
            InterviewQuestion.sandbox_problem_id == problem_id,
            Interview.user_id == user_id,
        )
        .first()
    )
    if not owns:
        raise HTTPException(status_code=403, detail="Not authorised for this problem")
    problem = get_problem(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Coding problem not found")
    return problem

coding_bp = APIRouter()


@coding_bp.get('/problems')
def get_problems(user: User = Depends(admin_required)):
    return {'problems': list_problems()}


@coding_bp.get('/problems/{problem_id}')
def get_single_problem(problem_id: str, user: User = Depends(admin_required)):
    problem = get_problem(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Coding problem not found")
    return {'problem': public_problem(problem)}


# ---- Candidate-facing endpoints (live interview opening question) -------------------
# Scoped by _assigned_problem_or_403 to the one problem the candidate's own interview
# assigned them, so the rest of the sandbox stays admin-only.

@coding_bp.get('/interview-problem/{problem_id}')
def get_interview_problem(problem_id: str, user_id: int = Depends(get_current_user_id)):
    problem = _assigned_problem_or_403(problem_id, user_id)
    return {'problem': public_problem(problem)}


@coding_bp.post('/interview-run')
def interview_run(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    """Run the candidate's code against the VISIBLE sample tests only."""
    data = payload or {}
    problem = _assigned_problem_or_403(data.get('problem_id'), user_id)
    language = (data.get('language') or '').lower()
    sample_tests = [dict(t, hidden=False) for t in problem.get('sample_tests', [])]
    result = _evaluate(problem, language, data.get('code', ''), sample_tests)
    result['mode'] = 'run'
    return result


@coding_bp.post('/interview-submit')
def interview_submit(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    """Evaluate against ALL tests and persist the submission against the interview."""
    data = payload or {}
    problem = _assigned_problem_or_403(data.get('problem_id'), user_id)
    language = (data.get('language') or '').lower()
    code = data.get('code', '')
    interview_id = data.get('interview_id')

    all_tests = (
        [dict(t, hidden=False) for t in problem.get('sample_tests', [])]
        + [dict(t, hidden=True) for t in problem.get('hidden_tests', [])]
    )
    result = _evaluate(problem, language, code, all_tests)
    result['mode'] = 'submit'

    try:
        submission = CodeSubmission(
            user_id=user_id,
            interview_id=interview_id if isinstance(interview_id, int) else None,
            problem_id=problem['id'],
            language=language,
            code=code,
            passed=result.get('passed', 0),
            total=result.get('total', 0),
            score=result.get('score', 0),
            results=json.dumps(result.get('results', [])),
        )
        db.session.add(submission)
        db.session.commit()
        result['submission_id'] = submission.id
    except Exception:
        db.session.rollback()
        result['submission_id'] = None

    return result


def _evaluate(problem, language, code, tests):
    """Route the submission to the right engine.

    SQL queries run against an isolated in-memory SQLite database seeded per test case;
    every other language goes through the existing subprocess runner. Both return the same
    result shape, so callers and the frontend need no special-casing.
    """
    time_limit = problem.get('time_limit_secs', 5)
    if is_sql_problem(problem):
        if language != 'sql':
            return {
                'supported': False,
                'error': "This is a SQL question — select SQL as the language.",
                'passed': 0, 'total': len(tests), 'score': 0, 'results': [],
            }
        return execute_sql_submission(code, problem, tests, time_limit=time_limit)

    if language == 'sql':
        return {
            'supported': False,
            'error': "SQL is only available for SQL questions. Pick Python or JavaScript here.",
            'passed': 0, 'total': len(tests), 'score': 0, 'results': [],
        }
    return execute_submission(code, language, problem['function_name'], tests, time_limit=time_limit)


def _load_request(problem_id, language):
    problem = get_problem(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Coding problem not found")
    if not language:
        raise HTTPException(status_code=400, detail="A language selection is required")
    return problem


@coding_bp.post('/run')
def run_code(payload: dict = Body(default=None), user: User = Depends(admin_required)):
    """Run against the visible SAMPLE tests only (no persistence)."""
    data = payload or {}
    problem = _load_request(data.get('problem_id'), data.get('language'))
    language = data.get('language').lower()
    code = data.get('code', '')

    sample_tests = [dict(t, hidden=False) for t in problem.get('sample_tests', [])]
    result = _evaluate(problem, language, code, sample_tests)
    result['mode'] = 'run'
    return result


@coding_bp.post('/submit')
def submit_code(payload: dict = Body(default=None), user: User = Depends(admin_required)):
    """Evaluate against ALL tests (sample + hidden) and persist the result."""
    data = payload or {}
    problem = _load_request(data.get('problem_id'), data.get('language'))
    language = data.get('language').lower()
    code = data.get('code', '')
    interview_id = data.get('interview_id')

    all_tests = (
        [dict(t, hidden=False) for t in problem.get('sample_tests', [])]
        + [dict(t, hidden=True) for t in problem.get('hidden_tests', [])]
    )
    result = _evaluate(problem, language, code, all_tests)
    result['mode'] = 'submit'

    # Persist the submission so it is available later in Admin Hub reporting (§1.3).
    try:
        submission = CodeSubmission(
            user_id=user.id,
            interview_id=interview_id if isinstance(interview_id, int) else None,
            problem_id=problem['id'],
            language=language,
            code=code,
            passed=result.get('passed', 0),
            total=result.get('total', 0),
            score=result.get('score', 0),
            results=json.dumps(result.get('results', []))
        )
        db.session.add(submission)
        db.session.commit()
        result['submission_id'] = submission.id
    except Exception:
        db.session.rollback()
        # Logging failure must not break the candidate's result.
        result['submission_id'] = None

    return result
