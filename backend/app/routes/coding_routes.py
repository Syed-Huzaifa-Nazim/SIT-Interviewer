"""Coding Sandbox API.

Serves problems (without hidden tests or solutions), runs candidate code against the
visible sample tests ("Run"), and evaluates against the full hidden suite ("Submit"),
persisting each submission for later admin reporting.

Access is gated to admins (§1.4): the sandbox stays hidden from real candidates until it
is verified stable and then wired into the interview flow (§3.5). Lift the `admin_required`
dependency at that point.
"""

import json
from fastapi import APIRouter, Request, HTTPException, Depends
from app.database.db import db
from app.models import User, CodeSubmission
from app.coding.problem_bank import list_problems, get_problem, public_problem
from app.coding.runner import execute_submission
from app.utils.security import admin_required

coding_bp = APIRouter()


@coding_bp.get('/problems')
async def get_problems(user: User = Depends(admin_required)):
    return {'problems': list_problems()}


@coding_bp.get('/problems/{problem_id}')
async def get_single_problem(problem_id: str, user: User = Depends(admin_required)):
    problem = get_problem(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Coding problem not found")
    return {'problem': public_problem(problem)}


def _load_request(problem_id, language):
    problem = get_problem(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Coding problem not found")
    if not language:
        raise HTTPException(status_code=400, detail="A language selection is required")
    return problem


@coding_bp.post('/run')
async def run_code(request: Request, user: User = Depends(admin_required)):
    """Run against the visible SAMPLE tests only (no persistence)."""
    data = await request.json() or {}
    problem = _load_request(data.get('problem_id'), data.get('language'))
    language = data.get('language').lower()
    code = data.get('code', '')

    sample_tests = [dict(t, hidden=False) for t in problem.get('sample_tests', [])]
    result = execute_submission(
        code, language, problem['function_name'], sample_tests,
        time_limit=problem.get('time_limit_secs', 5)
    )
    result['mode'] = 'run'
    return result


@coding_bp.post('/submit')
async def submit_code(request: Request, user: User = Depends(admin_required)):
    """Evaluate against ALL tests (sample + hidden) and persist the result."""
    data = await request.json() or {}
    problem = _load_request(data.get('problem_id'), data.get('language'))
    language = data.get('language').lower()
    code = data.get('code', '')
    interview_id = data.get('interview_id')

    all_tests = (
        [dict(t, hidden=False) for t in problem.get('sample_tests', [])]
        + [dict(t, hidden=True) for t in problem.get('hidden_tests', [])]
    )
    result = execute_submission(
        code, language, problem['function_name'], all_tests,
        time_limit=problem.get('time_limit_secs', 5)
    )
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
