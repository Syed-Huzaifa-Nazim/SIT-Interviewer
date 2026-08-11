"""Guards the property that keeps the backend able to serve more than one request at a time.

Nothing in this app is genuinely asynchronous — synchronous SQLAlchemy, blocking `requests`
calls to Supabase Storage, subprocess execution of candidate code, bcrypt, and the
LLM/Whisper/SMTP clients. FastAPI runs an `async def` handler on the event loop itself, and
the app is deployed as a single uvicorn process, so any blocking body declared that way
stops the loop and every other request queues behind it. A cohort mid-interview would stall
on one admin opening a recording, or on one candidate's runaway loop hitting the sandbox
timeout.

Declared `def`, the handler is dispatched to FastAPI's worker threadpool and requests
overlap properly. That is easy to undo by reflex — `async def` is the shape most FastAPI
examples show — so it is asserted here rather than left to review.

The routers are imported directly instead of through create_app(), which would connect to
the database on boot (see conftest's connection guard).
"""

import inspect

import pytest
from fastapi import FastAPI

from app.routes.admin_routes import admin_bp
from app.routes.auth_routes import auth_bp
from app.routes.bulk_email_routes import bulk_email_bp
from app.routes.candidate_routes import candidate_bp
from app.routes.coding_routes import coding_bp
from app.routes.feedback_routes import feedback_bp
from app.routes.interview_routes import interview_bp
from app.routes.notification_routes import notification_bp
from app.routes.resume_jd_routes import resume_jd_bp
from app.routes.token_routes import token_bp
from app.routes.user_routes import user_bp

ROUTERS = {
    'admin': admin_bp,
    'auth': auth_bp,
    'bulk-email': bulk_email_bp,
    'candidates': candidate_bp,
    'coding': coding_bp,
    'feedback': feedback_bp,
    'interviews': interview_bp,
    'notifications': notification_bp,
    'resume-jd': resume_jd_bp,
    'tokens': token_bp,
    'users': user_bp,
}

# FastAPI's own auto-generated documentation endpoints are legitimately async.
_BUILTIN_ENDPOINTS = {'openapi', 'swagger_ui_html', 'swagger_ui_redirect', 'redoc_html'}


@pytest.fixture(scope='module')
def app():
    application = FastAPI()
    for prefix, router in ROUTERS.items():
        application.include_router(router, prefix=f'/api/{prefix}')
    return application


def _handlers(application):
    return [
        route for route in application.routes
        if hasattr(route, 'endpoint') and route.endpoint.__name__ not in _BUILTIN_ENDPOINTS
    ]


def test_no_route_handler_is_declared_async(app):
    offenders = sorted(
        f'{route.path} -> {route.endpoint.__name__}'
        for route in _handlers(app)
        if inspect.iscoroutinefunction(route.endpoint)
    )
    assert not offenders, (
        'These handlers are `async def` but their bodies block, so they run on the event '
        'loop and serialise the entire server. Declare them `def` and read the body with '
        '`payload: dict = Body(default=None)` / `file.file.read()` instead of awaiting:\n  '
        + '\n  '.join(offenders)
    )


def test_every_router_is_actually_mounted(app):
    """Without this, deleting a router from ROUTERS would quietly make the test above
    pass by checking nothing."""
    assert len(_handlers(app)) > 80


def test_openapi_schema_builds(app):
    """Building the schema resolves every handler signature, so a malformed Body()/Depends()
    combination fails here rather than on the first live request."""
    schema = app.openapi()
    assert schema['paths']
