"""Bulk Email Module (Admin Hub).

Lets an admin import a batch of candidates, review/correct the rows, and issue interview
invitations in one action. Every recipient ends up in exactly the same state as someone who
signed up individually — CNIC username, one-time password, ``must_use_otp``, the free signup
token grant, and the same invite email — because this module reuses that logic rather than
forking it. Nothing here changes the public signup flow.

Deliberately kept in its own router file so ``admin_routes.py`` is untouched by this feature.
"""

import csv
import io
import os
import json
import datetime
import secrets
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Body, HTTPException, Depends
from fastapi.responses import StreamingResponse

from app.database.db import db
from app.models import User, Token, Transaction, Notification, AdminLog, BulkEmailBatch
from app.utils.security import admin_required
from app.utils.scope import AdminScope, admin_scope
from app.utils.permissions import require_permissions
from app.utils.candidate import (
    SIGNUP_CATEGORIES, COURSE_STATUSES, CATEGORY_JOB_ROLES,
    is_instructor_category, is_resume_category, normalize_cnic, generate_otp,
)
from app.utils.difficulty import is_valid_range, range_choices
from app.utils.curriculum import company_allows_category
from app.utils.interview_types import EXISTING_TYPES, SMIT_TYPES
from app.config.config import Config
from app.email import EmailService
from app.email import templates as email_templates

bulk_email_bp = APIRouter()

EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

# The exact columns the uploaded file must supply. Name is included because User.name is
# NOT NULL and the signup path rejects a missing name — a batch without it cannot create
# accounts at all.
REQUIRED_COLUMNS = ['name', 'email', 'cnic', 'category', 'course_status']

# Selectable per-row deadlines (days until the one-time password stops working).
DEADLINE_CHOICES = [1, 2, 3, 6, 7, 14, 30]
DEFAULT_DEADLINE_DAYS = 2

MAX_ROWS = 500

# How many invitations are sent at once. Each sender thread checks out its own database
# connection, so this is deliberately kept below the SQLAlchemy pool (pool_size=5 +
# max_overflow=5) with room to spare for the coordinator and the rest of the app. It is
# also low enough to stay well inside Gmail/SMTP rate limits — the bottleneck is the SMTP
# round trip, and a handful of parallel sends already removes most of the wait.
SEND_CONCURRENCY = int(os.environ.get('BULK_SEND_CONCURRENCY', '4'))


# --------------------------------------------------------------------------- validation

def _validate_row(raw, seen_cnics, seen_emails, company_id=None):
    """Validate one row against the SAME rules the public signup enforces.

    Returns ``(normalized_or_None, errors)``. Duplicate detection covers both the database
    and earlier rows in this same file, so a batch that repeats a CNIC is caught before any
    account is created rather than blowing up halfway through the send.

    ``company_id`` (curriculum feature — Company.allowed_interview_types): when given, a
    row's category must be one this company is actually allowed to invite under. Never
    trusts the frontend dropdown having already filtered it out — this is the real gate.
    """
    import re

    errors = []
    name = (raw.get('name') or '').strip()
    email = (raw.get('email') or '').strip()
    category = (raw.get('category') or '').strip()
    course_status = (raw.get('course_status') or '').strip().lower()
    cnic_raw = (raw.get('cnic') or '').strip()

    try:
        deadline_days = int(raw.get('deadline_days') or DEFAULT_DEADLINE_DAYS)
    except (TypeError, ValueError):
        deadline_days = DEFAULT_DEADLINE_DAYS
        errors.append('Deadline must be a number of days')
    if deadline_days not in DEADLINE_CHOICES:
        errors.append(f"Deadline must be one of: {', '.join(str(d) for d in DEADLINE_CHOICES)} days")

    # Question Difficulty Range: optional, per-row. Empty/absent means "no range" — the
    # candidate's interview keeps today's behavior (client-chosen difficulty). The batch-level
    # default (applied in /validate and /send before rows reach here) has already been merged
    # into each row by that point, so a row only ever arrives here with its OWN final choice.
    difficulty_range = (raw.get('difficulty_range') or '').strip().upper() or None
    if difficulty_range and not is_valid_range(difficulty_range):
        errors.append('Question difficulty range must be one of EASY_TO_MEDIUM, MEDIUM_TO_HARD, EASY_TO_HARD')

    if not name:
        errors.append('Name is required')

    if not email:
        errors.append('Email is required')
    elif not re.match(EMAIL_REGEX, email):
        errors.append('Invalid email format')

    cnic = normalize_cnic(cnic_raw)
    if not cnic:
        errors.append('Invalid CNIC (must be 13 digits, e.g. 42101-1234567-1)')

    instructor = is_instructor_category(category)
    if category not in SIGNUP_CATEGORIES:
        errors.append(f"Category must be one of: {', '.join(SIGNUP_CATEGORIES)}")
    elif not company_allows_category(company_id, category):
        errors.append("This interview type is not enabled for your company.")
    elif is_resume_category(category):
        # A Resume-Based interview is generated entirely from the candidate's CV, and a
        # spreadsheet row has no way to carry one. Inviting them in bulk would create an
        # account that can never start an interview, so it is refused here rather than
        # failing later at the point the candidate tries to begin.
        errors.append(
            f"'{category}' candidates cannot be invited in bulk — their interview is built "
            "from an uploaded resume, so they must enrol themselves through the signup form"
        )
    elif not instructor:
        # Instructors have no course status; everyone else must supply a valid one.
        if course_status not in COURSE_STATUSES:
            errors.append("Course status must be 'ongoing' or 'completed'")
        elif course_status == 'ongoing':
            # A bulk invite issues one-time interview credentials, which only apply to the
            # official-interview flow. Ongoing candidates use a normal password login and
            # are additionally disabled for new signups.
            errors.append(
                "Only 'completed' candidates can be sent an interview invite"
                + ('' if Config.ONGOING_CATEGORY_ENABLED else " ('Ongoing' is currently disabled)")
            )

    # Duplicates — within the file first, then against existing accounts.
    if cnic:
        if cnic in seen_cnics:
            errors.append('Duplicate CNIC — already appears earlier in this file')
        elif User.query.filter_by(cnic=cnic).first():
            errors.append('An account with this CNIC already exists')
    if email:
        lowered = email.lower()
        if lowered in seen_emails:
            errors.append('Duplicate email — already appears earlier in this file')
        elif User.query.filter_by(email=email).first():
            errors.append('An account with this email already exists')

    if errors:
        return None, errors

    seen_cnics.add(cnic)
    seen_emails.add(email.lower())
    return {
        'name': name,
        'email': email,
        'cnic': cnic,
        'category': category,
        'course_status': None if instructor else course_status,
        'instructor': instructor,
        'deadline_days': deadline_days,
        'difficulty_range': difficulty_range,
    }, []


def _apply_batch_difficulty_default(rows, batch_default):
    """Fill in a row's difficulty_range from the batch-level default when the row itself
    didn't set one — lets an admin pick one range for the whole file instead of typing it
    into every row, while a row that DID set its own still wins (per-row override)."""
    if not batch_default:
        return rows
    filled = []
    for raw in rows:
        raw = dict(raw or {})
        if not (raw.get('difficulty_range') or '').strip():
            raw['difficulty_range'] = batch_default
        filled.append(raw)
    return filled


def _validate_rows(rows, company_id=None):
    """Validate the whole batch, preserving the client's row order/indices."""
    seen_cnics, seen_emails = set(), set()
    results = []
    for idx, raw in enumerate(rows):
        normalized, errors = _validate_row(raw or {}, seen_cnics, seen_emails, company_id=company_id)
        results.append({
            'index': idx,
            'valid': not errors,
            'errors': errors,
            'normalized': normalized,
        })
    return results


def _selectable_companies(scope):
    """Active companies the caller may create accounts under."""
    from app.models import Company
    query = Company.query.filter(Company.status != 'archived')
    if not scope.is_super:
        if not scope.company_ids:
            return []
        query = query.filter(Company.id.in_(scope.company_ids))
    return query.order_by(Company.name.asc()).all()


def _resolve_batch_company(scope, company_id):
    """The company a batch will create its accounts under, or raise.

    Every account this module creates is a candidate, and a candidate with no company is
    invisible to the admin who just invited them (only the super admin sees unassigned
    rows). So the company is required rather than optional — an omitted one would produce a
    batch of accounts that immediately vanish from the inviter's own list.

    The single exception is a database with no companies at all, which is what the system
    looks like before the super admin sets any up: batches there behave exactly as they did
    before multi-admin.
    """
    from app.models import Company

    available = _selectable_companies(scope)
    if not available and Company.query.first() is None:
        return None

    if company_id is None:
        if len(available) == 1:
            # An admin who holds exactly one company has no choice to make.
            return available[0].id
        raise HTTPException(
            status_code=400,
            detail="Choose which company these candidates belong to before sending."
        )

    if not any(c.id == company_id for c in available):
        raise HTTPException(status_code=404, detail="Company not found")
    return company_id


# --------------------------------------------------------------------------- endpoints

@bulk_email_bp.get('/config')
def bulk_config(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope)):
    """Everything the modal needs to render and validate client-side, straight from the
    server's own constants so the two can never drift apart."""
    return {
        'required_columns': REQUIRED_COLUMNS,
        # Flat list kept for anything still consuming the old shape; the modal itself now
        # renders from the grouped 'category_groups' below so "Existing Interviews" and
        # "SMIT Curriculum Interviews" can be shown as two clearly separated sections
        # without the two ever being merged into one flat, hard-to-scan list.
        'categories': SIGNUP_CATEGORIES,
        'category_groups': {
            'existing': [t.category for t in EXISTING_TYPES],
            'smit': [t.category for t in SMIT_TYPES],
        },
        'course_statuses': COURSE_STATUSES,
        'deadline_choices': DEADLINE_CHOICES,
        'default_deadline_days': DEFAULT_DEADLINE_DAYS,
        'max_rows': MAX_ROWS,
        'ongoing_enabled': bool(Config.ONGOING_CATEGORY_ENABLED),
        'difficulty_ranges': range_choices(),
        # Which companies this admin may invite into, so the modal can offer exactly those
        # and never a company the send would then reject. Each company's own to_dict()
        # already carries allowed_interview_types (curriculum feature) — null meaning every
        # category, else the exact list — which is what the modal filters the Category
        # column to once a company is chosen; /validate and /send enforce the same thing
        # server-side regardless of what the dropdown showed.
        'companies': [c.to_dict() for c in _selectable_companies(scope)],
    }


@bulk_email_bp.get('/template')
def download_template(user: User = Depends(admin_required)):
    """A ready-made CSV with the correct headers (and one example row), so the admin never
    has to guess the column names or their order."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(REQUIRED_COLUMNS)
    writer.writerow(['Ali Khan', 'ali.khan@example.com', '42101-1234567-1', 'AI', 'completed'])
    writer.writerow(['Sara Ahmed', 'sara.ahmed@example.com', '35202-9876543-2', 'AI & Data Science — SMIT', 'completed'])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="bulk_invite_template.csv"'},
    )


@bulk_email_bp.post('/validate')
def validate_batch(payload: dict = Body(default=None), user: User = Depends(admin_required),
                   scope: AdminScope = Depends(admin_scope)):
    """Server-side validation of the parsed rows.

    The modal parses the file in the browser for an instant preview, but correctness is
    decided here — the client's verdict is never trusted, and ``/send`` re-runs exactly this
    same check before creating anything.
    """
    data = payload or {}
    rows = data.get('rows') or []
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="'rows' must be a list")
    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows — the limit is {MAX_ROWS} per batch")

    # Resolved here as well as in /send so the preview refuses a batch the send would
    # refuse anyway, rather than letting the admin fill in a whole file first.
    company_id = _resolve_batch_company(scope, data.get('company_id'))

    batch_difficulty_range = (data.get('difficulty_range') or '').strip().upper() or None
    if batch_difficulty_range and not is_valid_range(batch_difficulty_range):
        raise HTTPException(status_code=400, detail="Invalid difficulty_range")
    rows = _apply_batch_difficulty_default(rows, batch_difficulty_range)

    results = _validate_rows(rows, company_id=company_id)
    valid_count = sum(1 for r in results if r['valid'])
    return {
        'total': len(results),
        'valid_count': valid_count,
        'invalid_count': len(results) - valid_count,
        # Strip the normalized payload — the client only needs the verdict per row.
        'results': [{'index': r['index'], 'valid': r['valid'], 'errors': r['errors']} for r in results],
    }


@bulk_email_bp.post('/send')
def send_batch(payload: dict = Body(default=None), user: User = Depends(admin_required),
               scope: AdminScope = Depends(admin_scope),
               _perm: User = Depends(require_permissions('invites:send'))):
    """Create accounts and queue the invitations, then return immediately.

    The actual work runs on a daemon thread so a large batch never blocks the admin's
    request; the modal polls ``/batches/{id}`` for progress.
    """
    data = payload or {}
    rows = data.get('rows') or []
    subject = (data.get('subject') or '').strip()
    personalize = bool(data.get('personalize', True))
    file_name = (data.get('file_name') or '').strip() or None
    # Optional cohort label ("Spring 2026 Intake") the Bulk Invited tab filters by. Capped to
    # the column width here rather than relying on the client's maxLength, which a direct API
    # call bypasses — an over-long value would otherwise fail at INSERT with a database error
    # after the accounts were already validated.
    batch_name = (data.get('batch_name') or '').strip()[:120] or None
    company_id = _resolve_batch_company(scope, data.get('company_id'))

    if not subject:
        raise HTTPException(status_code=400, detail="An email subject/title is required")
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="No rows to send")
    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many rows — the limit is {MAX_ROWS} per batch")

    batch_difficulty_range = (data.get('difficulty_range') or '').strip().upper() or None
    if batch_difficulty_range and not is_valid_range(batch_difficulty_range):
        raise HTTPException(status_code=400, detail="Invalid difficulty_range")
    rows = _apply_batch_difficulty_default(rows, batch_difficulty_range)

    # Re-validate server-side; refuse the whole batch if anything is wrong so the admin
    # fixes it in the preview rather than discovering a half-sent batch afterwards.
    results = _validate_rows(rows, company_id=company_id)
    invalid = [r for r in results if not r['valid']]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{len(invalid)} row(s) failed validation. Fix them in the preview table "
                f"before sending. First problem — row {invalid[0]['index'] + 1}: "
                f"{'; '.join(invalid[0]['errors'])}"
            ),
        )

    payload = [r['normalized'] for r in results]

    batch = BulkEmailBatch(
        admin_id=user.id,
        company_id=company_id,
        file_name=file_name,
        subject=subject,
        batch_name=batch_name,
        personalize=personalize,
        status='pending',
        total_count=len(payload),
        sent_count=0,
        failed_count=0,
    )
    db.session.add(batch)
    db.session.add(AdminLog(
        admin_id=user.id,
        action='BULK_INVITE_STARTED',
        details=f"Started a bulk invitation batch of {len(payload)} recipient(s)"
                f"{f' from {file_name}' if file_name else ''} with subject '{subject}'",
    ))
    db.session.commit()

    batch_id = batch.id
    threading.Thread(target=_process_batch, args=(batch_id, payload), daemon=True).start()

    return {
        'message': f'Sending {len(payload)} invitation(s) in the background',
        'batch': batch.to_dict(),
    }


@bulk_email_bp.get('/batches')
def list_batches(user: User = Depends(admin_required), scope: AdminScope = Depends(admin_scope),
                  _perm: User = Depends(require_permissions('invites:send'))):
    # Scoped by who ran the batch, the same cut as the audit log: a batch row carries a
    # file name and subject line belonging to whoever sent it.
    batches = scope.filter_by_actor(
        BulkEmailBatch.query, BulkEmailBatch.admin_id
    ).order_by(BulkEmailBatch.created_at.desc()).limit(50).all()
    return {'batches': [b.to_dict() for b in batches]}


@bulk_email_bp.get('/batches/{batch_id}')
def get_batch(batch_id: int, user: User = Depends(admin_required),
              scope: AdminScope = Depends(admin_scope),
              _perm: User = Depends(require_permissions('invites:send'))):
    """Progress endpoint the modal polls while a batch is sending."""
    batch = BulkEmailBatch.query.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not scope.is_super and batch.admin_id != scope.admin.id:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {'batch': batch.to_dict()}


# --------------------------------------------------------------------------- worker

def _discard_account(user_id):
    """Remove an account whose invitation never went out, so the row can be retried cleanly.

    Only ever called for an account this worker just created and failed to email, and only
    for one that is still untouched (unused OTP, no interviews), so it can never delete a
    real candidate who has started working.
    """
    try:
        u = User.query.get(user_id)
        if not u or u.bulk_batch_id is None or u.otp_used:
            return
        Token.query.filter_by(user_id=user_id).delete()
        Transaction.query.filter_by(user_id=user_id).delete()
        Notification.query.filter_by(user_id=user_id).delete()
        db.session.delete(u)
        db.session.commit()
    except Exception:
        db.session.rollback()


def _create_and_invite(row, batch_id, subject, personalize, company_id=None):
    """Create ONE account and send its invitation.

    Mirrors the public signup path exactly — same User fields, same random unusable
    password, same ``must_use_otp`` one-time credential, same free token grant — plus the
    bulk-specific deadline and batch link. Raises on failure so the caller can record which
    row failed and why without aborting the rest of the batch.
    """
    otp = generate_otp()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=row['deadline_days'])

    user = User(
        name=row['name'],
        email=row['email'],
        country=None,
        experience_level='Entry',
        job_role=CATEGORY_JOB_ROLES.get(row['category'], 'Software Engineer'),
        role='candidate',
        cnic=row['cnic'],
        course_category=row['category'],
        course_status=row['course_status'],
        interview_status='invited',
        company_id=company_id,
        bulk_batch_id=batch_id,
        question_difficulty_range=row.get('difficulty_range'),
    )
    # One-time credential login only — the stored password is random and unusable, exactly
    # as the signup path does for completed-course candidates and instructors.
    user.set_password(secrets.token_urlsafe(24))
    user.must_use_otp = True
    user.set_otp(otp)
    user.otp_expires_at = expires_at

    db.session.add(user)
    db.session.flush()

    # Same free signup token grant as the public flow. Without this the candidate cannot
    # start their interview at all — start_interview requires at least one token.
    db.session.add(Token(user_id=user.id, tokens_available=5, tokens_consumed=0, tokens_purchased=0))
    db.session.add(Transaction(
        user_id=user.id, amount=0.0, tokens_added=5, transaction_type='signup_bonus'
    ))
    db.session.add(Notification(
        user_id=user.id,
        title='Official Interview Invitation',
        message='You have been invited to your interview. Check your email for one-time login credentials.',
        type='interview',
    ))
    db.session.commit()

    # Read every attribute we still need BEFORE sending. EmailService._log() ends with
    # db.session.remove(), which detaches this instance — touching user.id afterwards would
    # raise "not bound to a Session" and wrongly report a delivered email as a failure.
    user_id = user.id

    subject_line, html = email_templates.bulk_invite(
        name=row['name'],
        cnic=row['cnic'],
        otp=otp,
        subject_override=subject,
        instructor=row['instructor'],
        category=row['category'],
        deadline_days=row['deadline_days'],
        personalize=personalize,
    )
    # Delivered synchronously on this worker thread (background=False) so a failure is
    # actually observable here and can be recorded against the row — the default background
    # mode would fire-and-forget and always look successful.
    ok = EmailService.send(
        row['email'], subject_line, html,
        email_type='bulk_interview_invite', user_id=user_id, background=False,
    )
    if ok is False:
        # The invitation never reached them, so leaving the account behind would be worse
        # than useless: the admin could not simply fix and retry the row (the CNIC/email
        # would now collide with this orphan). Undo it so every row stays all-or-nothing.
        _discard_account(user_id)
        raise RuntimeError('Email delivery failed after retries — account rolled back, retry this row')
    return user_id


def _invite_one(row, batch_id, subject, personalize, company_id=None):
    """Pool-thread task: invite ONE recipient. Returns None on success, else the error text.

    Never raises, so one bad recipient can never cancel the rest of the batch. Each pool
    thread gets its own thread-scoped session and returns it at the end — pool threads are
    reused across tasks, so skipping this would hold a database connection per worker for
    the life of the batch.
    """
    try:
        _create_and_invite(row, batch_id, subject, personalize, company_id)
        return None
    except Exception as e:
        db.session.rollback()
        return str(e)[:300]
    finally:
        db.session.remove()


def _process_batch(batch_id, rows):
    """Background worker: create + invite every recipient, recording progress as it goes.

    Runs on its own daemon thread with its own thread-local scoped session (mirroring the
    answer-scoring worker), and always removes that session at the end so no connection is
    leaked. One recipient failing never aborts the batch.
    """
    try:
        batch = BulkEmailBatch.query.get(batch_id)
        if not batch:
            return
        subject, personalize = batch.subject, bool(batch.personalize)
        company_id = batch.company_id
        batch.status = 'sending'
        db.session.commit()

        sent = 0
        failures = []

        # Send a few at a time rather than strictly one-by-one: each recipient costs a full
        # SMTP round trip (plus up to EMAIL_MAX_RETRIES retries with a delay between them),
        # so a serial loop spends almost all of its time waiting on the network.
        with ThreadPoolExecutor(max_workers=max(1, SEND_CONCURRENCY)) as pool:
            futures = {
                pool.submit(_invite_one, row, batch_id, subject, personalize, company_id): idx
                for idx, row in enumerate(rows)
            }
            for future in as_completed(futures):
                idx = futures[future]
                error = future.result()
                if error is None:
                    sent += 1
                else:
                    failures.append({
                        'row': idx + 1,
                        'email': rows[idx].get('email'),
                        'error': error,
                    })

                # Progress is written only here, on the coordinator thread, so no locking is
                # needed and the polling endpoint always sees a consistent count.
                try:
                    batch = BulkEmailBatch.query.get(batch_id)
                    if batch:
                        batch.sent_count = sent
                        batch.failed_count = len(failures)
                        batch.failures = json.dumps(sorted(failures, key=lambda f: f['row'])) if failures else None
                        db.session.commit()
                except Exception:
                    db.session.rollback()

        # Completion order is non-deterministic with a pool, so present failures in the
        # admin's original row order.
        failures.sort(key=lambda f: f['row'])

        try:
            batch = BulkEmailBatch.query.get(batch_id)
            if batch:
                batch.status = 'complete'
                batch.sent_count = sent
                batch.failed_count = len(failures)
                batch.failures = json.dumps(failures) if failures else None
                batch.completed_at = datetime.datetime.utcnow()
                db.session.add(AdminLog(
                    admin_id=batch.admin_id,
                    action='BULK_INVITE_COMPLETED',
                    details=f"Bulk batch #{batch_id} finished: {sent} sent, {len(failures)} failed",
                ))
                db.session.commit()
        except Exception:
            db.session.rollback()
    finally:
        db.session.remove()
