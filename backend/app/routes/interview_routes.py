import os
import time
import datetime
import json
import base64
import tempfile
import subprocess
import threading
from fastapi import APIRouter, Body, HTTPException, status, Depends, UploadFile, File, Form
from sqlalchemy import text
from app.database.db import db
from app.models import (
    User, Token, Transaction, Interview, InterviewQuestion,
    InterviewResponse, InterviewReport, Notification, AdminLog, RecordingLog,
    ProctorSnapshot, Feedback
)
from app.ai.mixtral.mixtral_service import MixtralService
from app.ai.whisper.whisper_service import WhisperService, TranscriptionError
from app.config.config import Config
from app.utils.security import get_current_user_id
from app.utils.candidate import question_time_limit
from app.utils.supabase_service import SupabaseService

interview_bp = APIRouter()

# Fixed size of the MCQ round (MixtralService.generate_mcqs' own default). Used to compute
# an interview's expected total question count WITHOUT counting mcq rows in the database —
# see submit_answer's is_completed check below for why that distinction matters.
MCQ_ROUND_SIZE = 10

# ---------------------------------------------------------------------------------------
# Why every handler below is `def` and not `async def`
#
# Nothing in this file is actually asynchronous: the database is synchronous SQLAlchemy,
# Supabase Storage is called with blocking `requests`, and the LLM/Whisper services block
# on network I/O. A FastAPI handler declared `async def` runs ON the event loop, so a
# blocking body there stops the loop — and the app is a SINGLE uvicorn process, so that
# means the entire backend serves exactly one request at a time while every other
# candidate's request waits in line.
#
# That is not theoretical. Every candidate POSTs a session-recording slice to
# /upload-video-part every 30 seconds, and that handler blocks on a multi-megabyte upload
# to Supabase. With a cohort of twenty, an upload is in flight almost continuously and the
# server is permanently backlogged; /start (two LLM calls) and the final /submit-answer
# (report generation) freeze it for seconds at a time on top of that. Candidates saw this
# as every request crawling — the frontend's slow-request banner even mislabelled it as the
# server "waking up".
#
# Declared `def`, FastAPI runs the handler in its worker threadpool instead and the loop
# stays free, so requests genuinely overlap. The rest of the stack already assumed this:
# db_session_middleware stamps the session scope before call_next specifically so it
# propagates into that worker thread, and the connection pool (25 + 35 overflow) is sized
# well above the threadpool's default 40 workers.
#
# Consequence to respect when editing: a `def` handler cannot `await`. Read a JSON body
# with `payload: dict = Body(...)` and an upload with `file.file.read()` (both synchronous)
# rather than reintroducing `await request.json()` / `await file.read()`.
# ---------------------------------------------------------------------------------------

# Interview answer recordings are automatically purged this many days after they are
# created. Each deletion is stamped on the RecordingLog audit trail.
RECORDING_RETENTION_DAYS = 20
# How often the background retention worker scans for expired recordings.
RECORDING_CLEANUP_INTERVAL_SECONDS = 6 * 60 * 60  # every 6 hours


def cleanup_expired_recordings():
    """Delete interview recordings older than the retention window and stamp each one as
    deleted on its RecordingLog row. Safe to call repeatedly: it only touches rows still
    marked 'active'. Runs on a background thread with its own scoped session."""
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=RECORDING_RETENTION_DAYS)
    try:
        expired = RecordingLog.query.filter(
            RecordingLog.status == 'active',
            RecordingLog.created_at < cutoff
        ).all()
        for rec in expired:
            ref = rec.storage_ref or ''
            deleted_ok = True
            if ref.startswith('supabase://'):
                deleted_ok = SupabaseService.delete_interview_audio(ref)
            elif ref:
                # Local upload path — remove the file if it's still on disk.
                try:
                    if os.path.exists(ref):
                        os.remove(ref)
                except OSError as oe:
                    print(f"[recording-cleanup] Could not remove local file {ref}: {oe}")
                    deleted_ok = False

            if deleted_ok:
                rec.status = 'deleted'
                rec.deleted_at = datetime.datetime.utcnow()
                # Detach the pointer so the UI no longer offers playback of a purged file.
                if rec.question_id is None:
                    # Full-session video: clear it off the interview so has_video turns false.
                    itv = Interview.query.get(rec.interview_id)
                    if itv and itv.video_path == rec.storage_ref:
                        itv.video_path = None
                else:
                    resp = InterviewResponse.query.filter_by(
                        interview_id=rec.interview_id, question_id=rec.question_id
                    ).first()
                    if resp and resp.audio_path == rec.storage_ref:
                        resp.audio_path = None
        db.session.commit()
        if expired:
            print(f"[recording-cleanup] Purged {len(expired)} recording(s) older than {RECORDING_RETENTION_DAYS} days.")
    except Exception as e:
        db.session.rollback()
        print(f"[recording-cleanup] Cleanup pass failed: {e}")
    finally:
        db.session.remove()


RECORDING_ASSEMBLY_INTERVAL_SECONDS = 5 * 60
# Marks a recording the sweeper has permanently given up on, so it is recognisable in the
# admin's Recording Logs and never retried. Matched with LIKE, so it must stay stable.
_TOO_LARGE_PREFIX = 'Assembled recording too large to store'
# A session's parts are only joined once uploads have clearly stopped. Without this a sweep
# could catch a recording mid-upload and assemble a truncated file.
ASSEMBLY_QUIET_PERIOD_SECONDS = 120


def assemble_pending_recordings():
    """Join the stored parts of any completed interview that never got a final recording.

    /finalize-video is called by the candidate's browser, and for a one-time candidate that
    call races the forced logout the very same navigation triggers: the thank-you screen
    wipes the token and revokes the session server-side while the assemble request — which
    takes seconds, since it downloads and joins every part — is still in flight. The request
    then 401s, and its retries cannot recover because the token is already gone. Ten
    interviews' recordings were sitting in storage fully uploaded and never assembled.

    Doing it here removes the race entirely: the server owns the parts, needs no candidate
    token, and cannot be interrupted by the candidate leaving. It also rescues sessions
    abandoned mid-redirect, which never reached /finalize-video at all.
    """
    try:
        pending = SupabaseService.list_interviews_with_pending_parts()
    except Exception as e:
        print(f"[assemble-worker] Could not list pending parts: {e}")
        return

    for user_id, interview_id in pending:
        try:
            interview = Interview.query.get(interview_id)
            # Deleted interview, already assembled, or still running — leave the parts alone.
            if not interview or interview.video_path or interview.status != 'completed':
                continue

            age = SupabaseService.newest_part_age_seconds(user_id, interview_id)
            if age is None or age < ASSEMBLY_QUIET_PERIOD_SECONDS:
                continue

            # Already given up on this one — see the size check below. Without this the
            # sweep would re-download and re-join the same oversized recording every five
            # minutes, forever, for a file storage will never accept.
            if RecordingLog.query.filter(
                RecordingLog.interview_id == interview_id,
                RecordingLog.question_id.is_(None),
                RecordingLog.status == 'failed',
                RecordingLog.error.like(f'{_TOO_LARGE_PREFIX}%'),
            ).first():
                continue

            # Storage caps object size at the project level, so an over-limit recording is
            # refused with a 413 AFTER the whole file has been downloaded and joined.
            # Checking first turns tens of megabytes of pointless transfer into one listing
            # call, and turns a silent repeated failure into a visible log entry.
            total_bytes = SupabaseService.pending_parts_total_bytes(user_id, interview_id)
            limit = Config.MAX_RECORDING_UPLOAD_BYTES
            if total_bytes > limit:
                candidate = User.query.get(user_id)
                db.session.add(RecordingLog(
                    user_id=user_id,
                    candidate_email=candidate.email if candidate else None,
                    interview_id=interview_id, question_id=None, storage_ref=None,
                    status='failed',
                    error=(f'{_TOO_LARGE_PREFIX}: {total_bytes / 1048576:.1f} MB exceeds the '
                           f'{limit / 1048576:.0f} MB storage limit. The parts are kept — raise the '
                           f'Supabase storage limit and set MAX_RECORDING_UPLOAD_BYTES to assemble it.'),
                ))
                db.session.commit()
                print(f"[assemble-worker] Interview {interview_id} is {total_bytes / 1048576:.1f} MB, "
                      f"over the {limit / 1048576:.0f} MB limit; parts kept, not retrying.")
                continue

            final_ref = SupabaseService.assemble_interview_video(user_id, interview_id)
            if not final_ref:
                # assemble_interview_video leaves every part in place on failure, so the
                # next sweep can try again. Nothing is lost by failing here.
                print(f"[assemble-worker] Could not assemble interview {interview_id}; parts kept.")
                continue

            candidate = User.query.get(user_id)
            interview.video_path = final_ref
            db.session.add(RecordingLog(
                user_id=user_id,
                candidate_email=candidate.email if candidate else None,
                interview_id=interview_id, question_id=None,
                storage_ref=final_ref, status='active',
            ))
            db.session.commit()
            print(f"[assemble-worker] Assembled recording for interview {interview_id}.")
        except Exception as e:
            db.session.rollback()
            print(f"[assemble-worker] Interview {interview_id} failed: {e}")

    db.session.remove()


def start_recording_assembly_worker():
    """Daemon thread that sweeps for unassembled recordings. Called once at startup."""
    def _loop():
        while True:
            # Delay the first pass so a restart never collides with an interview that is
            # still uploading its closing slices.
            time.sleep(ASSEMBLY_QUIET_PERIOD_SECONDS)
            assemble_pending_recordings()
            time.sleep(RECORDING_ASSEMBLY_INTERVAL_SECONDS)

    threading.Thread(target=_loop, daemon=True).start()


def start_recording_cleanup_worker():
    """Start a daemon thread that periodically purges expired recordings while the app is
    running. Idempotent-ish: intended to be called once at startup."""
    def _loop():
        while True:
            cleanup_expired_recordings()
            time.sleep(RECORDING_CLEANUP_INTERVAL_SECONDS)

    threading.Thread(target=_loop, daemon=True).start()


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[-1].lower() in Config.ALLOWED_EXTENSIONS


# Interview IDs with an MCQ-generation thread currently in flight (single in-process set —
# this deployment runs one uvicorn worker, no multi-process coordination needed; see
# railway.toml/main.py). Without this, get_interview_details polled every ~1.5s by a
# candidate waiting on the MCQ round would spawn a fresh background thread on every single
# poll for as long as none had committed yet, each kicking off its own LLM call — wasted
# API cost and, worse, duplicate rows once more than one finished.
_mcq_generation_in_flight = set()


def _generate_and_save_mcqs(interview_id, job_role, experience_level, difficulty):
    """Generate the 10-question MCQ round and save it — unless it's already there.

    Idempotent by design: checks for existing mcq rows first and no-ops if it finds any.
    Called from _generate_mcqs_in_background's worker only — see that function's own guard
    for how concurrent callers for the same interview are prevented from racing.
    """
    already = InterviewQuestion.query.filter_by(interview_id=interview_id, question_type='mcq').count()
    if already > 0:
        return

    mcqs_list = MixtralService.generate_mcqs(
        job_role=job_role,
        experience_level=experience_level,
        difficulty=difficulty,
    )

    num_main_questions = InterviewQuestion.query.filter_by(interview_id=interview_id).count()
    for m_idx, m_data in enumerate(mcqs_list):
        db.session.add(InterviewQuestion(
            interview_id=interview_id,
            question_text=m_data['question_text'],
            question_type='mcq',
            mcq_options=json.dumps(m_data['options']),
            mcq_correct_index=m_data['correct_index'],
            order_num=num_main_questions + m_idx + 1,
            time_limit_seconds=question_time_limit('mcq'),
        ))
    db.session.commit()


def _generate_mcqs_in_background(interview_id, job_role, experience_level, difficulty):
    """Kick off MCQ-round generation off the request thread (Perf): 'Start Interview' no
    longer waits on it, and neither does submit_answer on the last main question — by design
    the candidate has several minutes (the intro screen plus every main question) before
    reaching the MCQ round, so this is normally long done by then.

    Called twice by design: once from /interviews/start (the normal case), and again from
    get_interview_details every time a candidate who has run out of loaded questions polls it
    (the self-heal case — covers this call never having been made, or having failed, e.g. the
    process restarting mid-generation). The in-flight guard is what makes calling it
    liberally from a polled endpoint safe instead of piling up redundant LLM calls.
    """
    if interview_id in _mcq_generation_in_flight:
        return
    _mcq_generation_in_flight.add(interview_id)

    def _worker():
        try:
            _generate_and_save_mcqs(interview_id, job_role, experience_level, difficulty)
        except Exception as e:
            print(f"[mcq-gen] Background MCQ generation failed for interview {interview_id}: {e}")
        finally:
            _mcq_generation_in_flight.discard(interview_id)
            # Outside the request middleware, so this thread owns its session and must
            # return the connection itself or it leaks and holds locks (see app/__init__).
            db.session.remove()

    threading.Thread(target=_worker, daemon=True).start()


@interview_bp.post('/start')
def start_interview(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    data = payload or {}

    interview_type = data.get('type')  # technical, HR, behavioral, custom
    job_role = data.get('job_role')
    experience_level = data.get('experience_level')
    difficulty = data.get('difficulty', 'Medium')
    num_questions = int(data.get('num_questions', 5))
    custom_jd = data.get('custom_jd')
    custom_skills = data.get('custom_skills')

    if not interview_type or not job_role or not experience_level:
        raise HTTPException(status_code=400, detail="Interview type, job role, and experience level are required")

    # Instructor interviews (Update §3): the backend is authoritative — regardless of what
    # the client sends, an Instructor account always gets the instructor competency question
    # set and skips the technical-domain classifier (its domain isn't "technical").
    from app.utils.candidate import is_instructor_category
    _requesting_user = User.query.get(user_id)
    is_instructor = bool(_requesting_user and is_instructor_category(_requesting_user.course_category))
    if is_instructor:
        interview_type = 'instructor'
        job_role = 'Instructor'

    # One-time (completed-course) candidates get exactly one official interview (§3.2):
    # resume an in-progress session instead of creating another, and hard-block any
    # attempt to start again after completion. Scoped to interviews created after the
    # current OTP was issued, so mock interviews taken earlier as an "Ongoing" candidate
    # (or a previous official attempt before a re-approval) don't consume the attempt.
    # Regular candidates are unaffected.
    requesting_user = User.query.get(user_id)
    if requesting_user and requesting_user.must_use_otp:
        official_scope = Interview.query.filter_by(user_id=user_id)
        if requesting_user.otp_issued_at:
            official_scope = official_scope.filter(Interview.created_at >= requesting_user.otp_issued_at)
        existing_official = official_scope.order_by(Interview.created_at.desc()).first()
        if existing_official:
            if existing_official.status == 'completed':
                raise HTTPException(
                    status_code=403,
                    detail="Your official interview has already been completed. You cannot start another session."
                )
            if existing_official.status == 'active':
                resumed_questions = InterviewQuestion.query.filter_by(
                    interview_id=existing_official.id
                ).order_by(InterviewQuestion.order_num).all()
                return {
                    'message': 'Resuming your official interview session',
                    'interview': existing_official.to_dict(),
                    'questions': [q.to_dict() for q in resumed_questions]
                }

    # Domain validation (§3.4): block clearly non-technical custom domains BEFORE charging a
    # token or creating the session. JD-driven interviews skip this (a JD implies a real role).
    # Instructor interviews also skip it — they use a dedicated non-technical competency set.
    has_jd = bool(custom_jd and len(custom_jd.strip()) >= 30)
    if not has_jd and not is_instructor:
        classification = MixtralService.classify_domain(job_role)
        # Only block when we are reasonably sure the domain is non-technical.
        if not classification['is_technical'] and classification['confidence'] >= 50:
            # Log the rejected domain so admins can see which unsupported domains are requested.
            try:
                admin_user = User.query.filter_by(role='admin').first()
                db.session.add(AdminLog(
                    admin_id=admin_user.id if admin_user else user_id,
                    action='REJECTED_DOMAIN',
                    details=(
                        f"User ID {user_id} attempted an interview for unsupported domain "
                        f"'{job_role}'. Reason: {classification['reason']} "
                        f"(confidence {classification['confidence']}%, source {classification['source']})."
                    )
                ))
                db.session.commit()
            except Exception:
                db.session.rollback()

            raise HTTPException(
                status_code=422,
                detail=(
                    "Sorry, interviews cannot currently be conducted for this domain. "
                    "This feature is under development and will be supported in a future update."
                )
            )

    token_account = Token.query.filter_by(user_id=user_id).first()
    if not token_account or token_account.tokens_available < 1:
        raise HTTPException(status_code=402, detail="Insufficient tokens. Please purchase tokens to attend interviews.")

    try:
        token_account.tokens_available -= 1
        token_account.tokens_consumed += 1

        transaction = Transaction(
            user_id=user_id,
            amount=0.0,
            tokens_added=-1,
            transaction_type='consumption'
        )
        db.session.add(transaction)

        interview = Interview(
            user_id=user_id,
            type=interview_type,
            job_role=job_role,
            experience_level=experience_level,
            difficulty=difficulty,
            num_questions=num_questions,
            status='active'
        )
        db.session.add(interview)
        db.session.flush()

        # Only the 5 main questions are generated on the request path now — the candidate's
        # "Start Interview" response no longer waits on the MCQ round at all (see
        # _generate_mcqs_in_background below), so this is a single LLM call, not two run
        # concurrently. Splitting it this way (rather than the earlier "generate both, wait
        # for the slower one" approach) is what actually removes the MCQ round's latency from
        # interview creation, instead of just parallelizing it.
        questions_list = MixtralService.generate_questions(
            interview_type=interview_type,
            job_role=job_role,
            experience_level=experience_level,
            difficulty=difficulty,
            num_questions=num_questions,
            custom_jd=custom_jd,
            custom_skills=custom_skills
        )

        # Completed-course candidates open on a hands-on coding-sandbox exercise instead of
        # a verbal question. It REPLACES the generated first question rather than being added
        # on top, so the interview length and pacing are unchanged. Scoped deliberately to
        # completed-course candidates only — Instructor interviews keep their verbal opener,
        # and Ongoing/mock candidates have no sandbox access at all.
        opening_problem = None
        if requesting_user and requesting_user.must_use_otp and not is_instructor:
            try:
                from app.coding.problem_bank import pick_opening_problem
                opening_problem = pick_opening_problem(
                    job_role=job_role,
                    course_category=getattr(requesting_user, 'course_category', '') or '',
                )
            except Exception as e:
                # Never block the interview on the sandbox opener — fall back to the
                # generated verbal question the candidate would otherwise have had.
                print(f"[coding] Opening sandbox question unavailable: {e}")
                opening_problem = None

        for idx, q_data in enumerate(questions_list):
            q_text = q_data.get('question_text')
            q_type = q_data.get('question_type', 'conceptual')
            sandbox_problem_id = None
            code_snippet = q_data.get('code_snippet')  # debugging-format questions only

            if idx == 0 and opening_problem:
                q_type = 'coding_sandbox'
                sandbox_problem_id = opening_problem['id']
                q_text = opening_problem['title']
                code_snippet = None

            question = InterviewQuestion(
                interview_id=interview.id,
                question_text=q_text,
                question_type=q_type,
                # Only debugging-format questions carry one (Coding Formats §2.2).
                code_snippet=code_snippet,
                sandbox_problem_id=sandbox_problem_id,
                order_num=idx + 1,
                time_limit_seconds=question_time_limit(q_type)  # per-question timer (§2)
            )
            db.session.add(question)

        db.session.commit()

        saved_questions = InterviewQuestion.query.filter_by(interview_id=interview.id).order_by(InterviewQuestion.order_num).all()

        # MCQ round (§ MCQ round): 10 single-select questions appended after the main ones.
        # Generated off the request thread so the candidate's "Start Interview" response
        # doesn't wait on it — they have the whole intro screen plus every main question
        # (several minutes) before they'd actually need it. submit_answer has a synchronous
        # fallback for the rare case a candidate reaches the end of the main round before
        # this finishes (see _generate_and_save_mcqs).
        _generate_mcqs_in_background(interview.id, job_role, experience_level, difficulty)

        return {
            'message': 'Interview started successfully',
            'interview': interview.to_dict(),
            'questions': [q.to_dict() for q in saved_questions]
        }

    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to initiate interview: {str(e)}")

@interview_bp.get('/history')
def get_history(user_id: int = Depends(get_current_user_id)):
    interviews = Interview.query.filter_by(user_id=user_id).order_by(Interview.created_at.desc()).all()
    return [i.to_dict() for i in interviews]

@interview_bp.get('/stats/summary')
def get_stats_summary(user_id: int = Depends(get_current_user_id)):
    completed_interviews = Interview.query.filter_by(user_id=user_id, status='completed').all()
    total_interviews = len(completed_interviews)
    total_score = sum(i.overall_score for i in completed_interviews if i.overall_score is not None)
    average_score = round(total_score / total_interviews) if total_interviews > 0 else 0
    return {
        'total_interviews': total_interviews,
        'average_score': average_score,
        'top_skills': []
    }

@interview_bp.get('/{interview_id}/details')
def get_interview_details(interview_id: int, user_id: int = Depends(get_current_user_id)):
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    saved_questions = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
    responses_count = InterviewResponse.query.filter_by(interview_id=interview_id).count()

    # Self-heal (see _generate_mcqs_in_background's docstring): the frontend polls this
    # endpoint once it runs out of the questions it loaded at /start, waiting for the MCQ
    # round to land. If it genuinely isn't there yet — the background call from /start never
    # ran, or failed outright — kick it off again here instead of leaving the candidate
    # polling forever. Scoped to interviews that have actually finished their main round, so
    # this never fires while someone is still partway through it. No-ops instantly if
    # generation is already in flight or already saved.
    has_mcqs = any(q.question_type == 'mcq' for q in saved_questions)
    if not has_mcqs:
        main_questions = [q for q in saved_questions if q.question_type != 'mcq']
        if main_questions and responses_count >= len(main_questions):
            _generate_mcqs_in_background(interview_id, interview.job_role, interview.experience_level, interview.difficulty)

    return {
        'interview': interview.to_dict(),
        'questions': [q.to_dict() for q in saved_questions],
        'responses_count': responses_count
    }

@interview_bp.post('/{interview_id}/start-question')
def start_question(interview_id: int, payload: dict = Body(default=None),
                   user_id: int = Depends(get_current_user_id)):
    """Anchor the server-side countdown for a question the first time it is presented
    (§2.3 backend-enforced timer). Idempotent: calling it again (e.g. after a page
    reload / reconnect) returns the already-reduced remaining time, so the clock keeps
    running server-side and can't be reset or extended by the client."""
    data = payload or {}
    question_id = data.get('question_id')
    if not question_id:
        raise HTTPException(status_code=400, detail="question_id is required")

    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    question = InterviewQuestion.query.filter_by(id=question_id, interview_id=interview_id).first()
    if not question:
        raise HTTPException(status_code=400, detail="Question does not belong to this interview")

    if not question.started_at:
        question.started_at = datetime.datetime.utcnow()
        db.session.commit()

    return {
        'question_id': question.id,
        'time_limit_seconds': question.time_limit_seconds or 120,
        'remaining_seconds': question.remaining_seconds(),
        'started_at': question.started_at.isoformat() if question.started_at else None,
    }


@interview_bp.post('/{interview_id}/mark-intro-segment')
def mark_intro_segment(interview_id: int, payload: dict = Body(default=None),
                       user_id: int = Depends(get_current_user_id)):
    """Bookmark, not a second recording (see Interview.intro_video_start_seconds): the
    candidate's welcome/rules screen is already part of the one continuous session
    recording — this just records where in it that screen started and ended, in seconds
    from the recording's own start, so the admin player can jump straight there."""
    data = payload or {}
    start_seconds = data.get('start_seconds')
    end_seconds = data.get('end_seconds')
    if start_seconds is None or end_seconds is None:
        raise HTTPException(status_code=400, detail="start_seconds and end_seconds are required")

    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    interview.intro_video_start_seconds = max(0.0, float(start_seconds))
    interview.intro_video_end_seconds = max(interview.intro_video_start_seconds, float(end_seconds))
    db.session.commit()

    return {'message': 'Intro segment marked'}


@interview_bp.get('/{interview_id}/timer')
def get_timer(interview_id: int, question_id: int, user_id: int = Depends(get_current_user_id)):
    """Lightweight resync endpoint: returns the authoritative remaining time for a
    question so the visual countdown re-aligns to the server after any drift/reconnect."""
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
    question = InterviewQuestion.query.filter_by(id=question_id, interview_id=interview_id).first()
    if not question:
        raise HTTPException(status_code=400, detail="Question does not belong to this interview")
    return {
        'question_id': question.id,
        'time_limit_seconds': question.time_limit_seconds or 120,
        'remaining_seconds': question.remaining_seconds(),
    }


@interview_bp.post('/{interview_id}/upload-video-part')
def upload_session_video_part(
    interview_id: int,
    part_index: int = Form(...),
    video: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id)
):
    """Store one slice of the session recording while the interview is still running.

    The recording used to be sent as a single file once the session ended, which meant a
    long interview produced tens of MB that had to survive an upload starting at the exact
    moment the candidate was being redirected away — and it frequently did not, leaving no
    recording and (because the request never reached the server) no failure log either.
    Slices arrive continuously instead, so whatever has already landed is safe no matter
    how abruptly the candidate leaves.
    """
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    contents = video.file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty video part")
    # Generous per-part ceiling: a 30s slice is a couple of MB, so anything near this is a
    # client bug rather than a real recording.
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Video part too large")

    ref = SupabaseService.upload_interview_video_part(user_id, interview_id, part_index, contents)
    if not ref:
        # A failing slice used to leave no trace anywhere: this endpoint just returned 502,
        # and because a session whose slices all fail never reaches /finalize-video, the
        # RecordingLog failure row that exists for every OTHER recording failure was never
        # written either. A storage outage therefore looked identical to "recording simply
        # didn't happen". Best-effort, and never allowed to mask the 502 itself.
        try:
            candidate = User.query.get(user_id)
            db.session.add(RecordingLog(
                user_id=user_id,
                candidate_email=candidate.email if candidate else None,
                interview_id=interview_id, question_id=None, storage_ref=None,
                status='failed',
                error=f"Could not store session recording part {part_index} ({len(contents)} bytes)",
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()
        raise HTTPException(status_code=502, detail="Could not store video part")
    return {'stored': True, 'part_index': part_index, 'bytes': len(contents)}


@interview_bp.post('/{interview_id}/finalize-video')
def finalize_session_video(interview_id: int, user_id: int = Depends(get_current_user_id)):
    """Join the uploaded parts into the final recording and attach it to the interview.

    Safe to call more than once and safe to never call at all: the parts remain in storage
    either way, so a session the candidate abandoned mid-redirect can still be assembled
    later instead of being lost outright.
    """
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if interview.video_path:
        return {'message': 'Recording already stored for this session', 'stored': True}

    candidate = User.query.get(user_id)
    final_ref = SupabaseService.assemble_interview_video(user_id, interview_id)
    if not final_ref:
        try:
            db.session.add(RecordingLog(
                user_id=user_id,
                candidate_email=candidate.email if candidate else None,
                interview_id=interview_id, question_id=None, storage_ref=None,
                status='failed', error='Could not assemble session recording from parts',
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()
        raise HTTPException(status_code=502, detail="Could not assemble the session recording")

    interview.video_path = final_ref
    db.session.add(RecordingLog(
        user_id=user_id,
        candidate_email=candidate.email if candidate else None,
        interview_id=interview_id, question_id=None,
        storage_ref=final_ref, status='active',
    ))
    db.session.commit()
    return {'message': 'Session recording stored', 'stored': True}


@interview_bp.post('/{interview_id}/upload-video')
def upload_session_video(
    interview_id: int,
    video: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id)
):
    """Receives the full-session recording captured client-side from the proctoring
    camera stream (DB Integration §2) and stores it in the PRIVATE interview-recordings
    bucket. Called once when the session ends (normal completion, timer expiry, or
    proctor termination). If storage is unreachable after retries, video_path stays NULL
    — the admin UI then truthfully shows no recording instead of a broken link."""
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if interview.video_path:
        return {'message': 'Recording already stored for this session', 'stored': True}

    candidate = User.query.get(user_id)

    def _log_failed(reason: str):
        # Mirrors EmailLog's failure auditing (§ recording-lifecycle). Previously a failed
        # video upload left NO trace anywhere — only successful uploads created a
        # RecordingLog row — so a silently-missing recording was undiagnosable after the
        # fact. Best-effort: never let logging the failure itself break the error response.
        try:
            db.session.add(RecordingLog(
                user_id=user_id,
                candidate_email=candidate.email if candidate else None,
                interview_id=interview_id,
                question_id=None,
                storage_ref=None,
                status='failed',
                error=reason[:2000],
            ))
            db.session.commit()
        except Exception as log_err:
            db.session.rollback()
            print(f"[upload-video] Could not persist failure log for interview {interview_id}: {log_err}")

    contents = video.file.read()
    if not contents:
        _log_failed("Empty video payload")
        raise HTTPException(status_code=400, detail="Empty video payload")
    # Sanity cap: a 480p video-only WebM at ~0.6 Mbps stays far below this even for a
    # very long session; anything bigger indicates a client bug, not a real recording.
    if len(contents) > 300 * 1024 * 1024:
        _log_failed(f"Payload exceeded 300MB cap ({len(contents)} bytes)")
        raise HTTPException(status_code=413, detail="Recording exceeds the maximum accepted size")

    storage_ref = SupabaseService.upload_interview_video(
        user_id, interview_id, contents, content_type=video.content_type or 'video/webm'
    )
    if not storage_ref:
        reason = f"Supabase Storage upload failed after retries ({len(contents)} bytes)"
        print(f"[upload-video] FAILED to store session recording for interview {interview_id} "
              f"(user {user_id}, {len(contents)} bytes) — video_path left NULL.")
        _log_failed(reason)
        raise HTTPException(status_code=503, detail="Could not store the recording right now")

    try:
        interview.video_path = storage_ref
        # Audit the recording's creation so it appears in the admin Recordings log and the
        # retention job knows what to purge. question_id stays NULL — this is a full-session
        # video, not a per-answer clip.
        db.session.add(RecordingLog(
            user_id=user_id,
            candidate_email=candidate.email if candidate else None,
            interview_id=interview_id,
            question_id=None,
            storage_ref=storage_ref,
            status='active'
        ))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # The object is in storage but unreferenced; log enough detail to reconcile.
        print(f"[upload-video] Stored {storage_ref} but failed to save reference on "
              f"interview {interview_id} — manual reconciliation needed.")
        _log_failed(f"Uploaded to {storage_ref} but failed to link to interview: {e}")
        raise HTTPException(status_code=500, detail="Failed to link the recording")

    return {'message': 'Session recording stored', 'stored': True}


@interview_bp.post('/transcribe')
def transcribe_audio(audio: UploadFile = File(...), user_id: int = Depends(get_current_user_id)):
    """API endpoint to receive raw audio and return transcription quickly."""
    filename = audio.filename
    if not filename or not allowed_file(filename):
        raise HTTPException(status_code=400, detail="Invalid audio file format")

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    temp_filename = f"transcribe_user_{user_id}_{int(datetime.datetime.utcnow().timestamp())}.webm"
    save_path = os.path.join(Config.UPLOAD_FOLDER, temp_filename)

    try:
        contents = audio.file.read()
        with open(save_path, "wb") as f:
            f.write(contents)
        print(f"[transcribe] Received {len(contents)} bytes of audio from user {user_id}.")

        transcribed = WhisperService.transcribe(save_path)

        if os.path.exists(save_path):
            os.remove(save_path)

        return {'transcript': transcribed}
    except TranscriptionError as te:
        # STT genuinely failed — tell the client clearly instead of returning fake/empty
        # text. The frontend surfaces this and lets the candidate type their answer.
        if os.path.exists(save_path):
            os.remove(save_path)
        raise HTTPException(status_code=503, detail=str(te))
    except Exception as e:
        if os.path.exists(save_path):
            os.remove(save_path)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

def _run_answer_scoring(interview_id, question_id, response_id, user_id,
                        local_audio_path, audio_content_type, fallback_text, timed_out):
    """Background worker (Perf §1.3): transcribe (if audio) + LLM-evaluate ONE answer, then
    finalize the report if this was the last outstanding answer. Runs on its own daemon
    thread with its own thread-local scoped session (mirrors EmailService) — the candidate's
    submit request already returned and they've advanced to the next question, so nothing
    here is on the critical path. The session is always removed at the end so no connection
    leaks."""
    try:
        response = InterviewResponse.query.get(response_id)
        if not response:
            return
        question = InterviewQuestion.query.get(question_id)
        interview = Interview.query.get(interview_id)
        if not question or not interview:
            return

        answer_text = (response.response_text or '')
        # The fast path stored a display placeholder for empty timed-out skips; treat that
        # as "no text yet" so a real transcript can still fill it in.
        if answer_text.strip() == '[No answer recorded — time expired]':
            answer_text = ''
        audio_ref = response.audio_path

        # 1. Authoritative transcription (Whisper) from the recording, when there's audio and
        #    no typed/authoritative text was supplied. On failure fall back to the live
        #    browser transcript so an answer is never lost (§3). Then push the recording to
        #    the PRIVATE Supabase bucket and drop the local temp file.
        if local_audio_path and os.path.exists(local_audio_path):
            if not answer_text.strip():
                try:
                    answer_text = WhisperService.transcribe(local_audio_path, question_text=question.question_text)
                except TranscriptionError as te:
                    answer_text = fallback_text if (fallback_text and fallback_text.strip()) else ''
                    print(f"[scoring] Whisper failed for response {response_id} ({te}); used live-transcript fallback.")
            # No local persistence (DB Integration §3): the recording either lands in
            # Supabase Storage (with retries inside _upload_raw) or is dropped with a loud
            # log — the temp file is ALWAYS deleted. The transcript itself is already safe
            # in the DB, so a lost audio file never loses the candidate's answer.
            try:
                with open(local_audio_path, 'rb') as f:
                    contents = f.read()
                storage_ref = SupabaseService.upload_interview_audio(
                    user_id, interview_id, question_id, contents,
                    content_type=audio_content_type or 'audio/webm'
                )
                if storage_ref:
                    audio_ref = storage_ref
                else:
                    audio_ref = None
                    print(f"[scoring] AUDIO UPLOAD FAILED for response {response_id} "
                          f"(interview {interview_id}) — recording discarded after retries; "
                          f"transcript preserved.")
            except OSError as oe:
                audio_ref = None
                print(f"[scoring] Could not read temp audio {local_audio_path}: {oe}")
            finally:
                try:
                    os.remove(local_audio_path)
                except OSError:
                    pass

        is_empty = not answer_text or not answer_text.strip()
        display_text = answer_text if not is_empty else '[No answer recorded — time expired]'

        # 2. LLM evaluation. All coding formats are verbal, so they route through this same
        #    transcript -> LLM pipeline (Coding Formats §2.4); the format-specific rubric is
        #    applied inside evaluate_response. It never raises — it returns a neutral,
        #    manual-review fallback if the model is unavailable, so a transient outage can't
        #    zero a candidate unfairly.
        eval_data = MixtralService.evaluate_response(
            question.question_text,
            answer_text or '',
            job_role=interview.job_role,
            difficulty=interview.difficulty,
            question_type=question.question_type,
            code_snippet=question.code_snippet
        )
        stored_feedback = eval_data.get('feedback', '')
        if eval_data.get('needs_manual_review'):
            stored_feedback = f"[FLAGGED FOR MANUAL REVIEW] {stored_feedback}"

        response.response_text = display_text
        response.audio_path = audio_ref
        response.score = eval_data.get('score', 0)
        response.technical_score = eval_data.get('technical_score', 0)
        response.communication_score = eval_data.get('communication_score', 0)
        response.confidence_score = eval_data.get('confidence_score', 0)
        response.feedback = stored_feedback
        response.scoring_status = 'scored'

        # Audit the recording's creation so the admin can see its lifecycle (and so the
        # retention job knows what to purge). Only when a recording actually exists.
        if audio_ref:
            candidate = User.query.get(user_id)
            db.session.add(RecordingLog(
                user_id=user_id,
                candidate_email=candidate.email if candidate else None,
                interview_id=interview_id,
                question_id=question_id,
                storage_ref=audio_ref,
                status='active'
            ))

        db.session.commit()

        # 3. If every answer is now scored, generate the final report — guarded so exactly
        #    one thread does it even when answers finish scoring out of order.
        _finalize_report_if_ready(interview_id)

    except Exception as e:
        db.session.rollback()
        # Never lose the answer: flag it for manual review instead of crashing the thread.
        try:
            response = InterviewResponse.query.get(response_id)
            if response:
                response.scoring_status = 'failed'
                if not response.feedback:
                    response.feedback = "[FLAGGED FOR MANUAL REVIEW] Automated scoring failed unexpectedly."
                db.session.commit()
                _finalize_report_if_ready(interview_id)
        except Exception:
            db.session.rollback()
        print(f"[scoring] Unexpected error scoring response {response_id}: {e}")
    finally:
        db.session.remove()


def _finalize_report_in_background(interview_id):
    """Run report finalization off the request thread.

    Scoring an MCQ is instant, but finalizing is not: the last scored answer in an
    interview triggers _finalize_report_if_ready, which calls the LLM to write the report.
    MCQs are always the closing round, so that landed on the candidate's very last
    submit-answer and held the response open for the full generation — the one moment they
    are most eager to be done. Verbal answers never had this problem because their whole
    scoring path, finalization included, already runs in a thread.

    Nothing waits on the report here: submit-answer replies scoring_status 'processing' and
    the report page polls until it exists, which is the same contract the verbal path has
    always used.
    """
    def _worker():
        try:
            _finalize_report_if_ready(interview_id)
        except Exception as e:
            print(f"[scoring] Report finalization failed for interview {interview_id}: {e}")
        finally:
            # Outside the request middleware, so this thread owns its session and must
            # return the connection itself or it leaks and holds locks (see app/__init__).
            db.session.remove()

    threading.Thread(target=_worker, daemon=True).start()


def _score_mcq_response(response, question):
    """Grade an MCQ response instantly and deterministically — no LLM call needed, since
    correctness is just a string comparison against the answer key
    (question.mcq_correct_index), never exposed to the candidate (see InterviewQuestion.
    to_dict). A skipped/timed-out MCQ (empty response_text) is simply incorrect.

    The grade is written synchronously because it is free; only the report generation it
    may trigger is deferred (see _finalize_report_in_background)."""
    correct_text = None
    try:
        options = json.loads(question.mcq_options or '[]')
        if question.mcq_correct_index is not None and 0 <= question.mcq_correct_index < len(options):
            correct_text = options[question.mcq_correct_index]
    except Exception:
        correct_text = None

    submitted = (response.response_text or '').strip()
    is_correct = bool(correct_text) and submitted == correct_text.strip()

    response.score = 100.0 if is_correct else 0.0
    response.technical_score = response.score
    response.communication_score = None
    response.confidence_score = None
    response.feedback = 'Correct.' if is_correct else 'Incorrect.'
    response.scoring_status = 'scored'
    db.session.commit()
    _finalize_report_in_background(question.interview_id)


def _finalize_report_if_ready(interview_id):
    """Generate the interview report once ALL answers are scored — exactly once. A failed
    answer counts as resolved so one bad answer can't stall the whole report. Uses an atomic
    single-row UPDATE ('pending' -> 'finalizing') as a claim, so concurrent scoring threads
    can never double-generate the report."""
    interview = Interview.query.get(interview_id)
    if not interview or interview.status != 'completed':
        return
    if interview.scoring_status != 'pending':
        return  # already finalized / claimed / not applicable (e.g. proctor-terminated)

    total_questions = InterviewQuestion.query.filter_by(interview_id=interview_id).count()
    total_responses = InterviewResponse.query.filter_by(interview_id=interview_id).count()
    resolved = InterviewResponse.query.filter(
        InterviewResponse.interview_id == interview_id,
        InterviewResponse.scoring_status.in_(('scored', 'failed'))
    ).count()
    if total_responses < total_questions or resolved < total_questions:
        return  # some answers are still being scored

    # Atomic claim: only the thread that flips 'pending' -> 'finalizing' proceeds.
    claimed = db.session.query(Interview).filter(
        Interview.id == interview_id,
        Interview.scoring_status == 'pending'
    ).update({Interview.scoring_status: 'finalizing'}, synchronize_session=False)
    db.session.commit()
    if not claimed:
        return  # another thread won the claim

    try:
        if InterviewReport.query.filter_by(interview_id=interview_id).first():
            interview.scoring_status = 'complete'
            db.session.commit()
            return

        qas = []
        saved_q = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
        for q in saved_q:
            r = InterviewResponse.query.filter_by(interview_id=interview_id, question_id=q.id).first()
            if r:
                qas.append({
                    'question': q.question_text,
                    'answer': r.response_text,
                    'evaluation': {
                        'score': r.score or 0,
                        'technical_score': r.technical_score or 0,
                        'communication_score': r.communication_score or 0,
                        'confidence_score': r.confidence_score or 0,
                    }
                })

        report_data = MixtralService.generate_report(interview.type, interview.job_role, qas)

        # The LLM path returns real lists; the mock path returns JSON strings. Serialize any
        # list/dict so the stored value is always valid JSON the frontend can parse.
        def _as_text(value, empty='[]'):
            if value is None:
                return empty
            if isinstance(value, (list, dict)):
                return json.dumps(value)
            return value

        report = InterviewReport(
            interview_id=interview_id,
            overall_score=report_data.get('overall_score', 0),
            technical_score=report_data.get('technical_score', 0),
            communication_score=report_data.get('communication_score', 0),
            confidence_score=report_data.get('confidence_score', 0),
            problem_solving_score=report_data.get('problem_solving_score', 0),
            strengths=_as_text(report_data.get('strengths'), '[]'),
            weaknesses=_as_text(report_data.get('weaknesses'), '[]'),
            missing_concepts=_as_text(report_data.get('missing_concepts'), ''),
            recommendations=_as_text(report_data.get('recommendations'), ''),
            # Completion snapshot the client sent with the final answer, stashed on the
            # interview by submit_answer since the report only exists at this point.
            snapshot_image=interview.completion_snapshot or None,
            snapshot_description=(
                'Camera snapshot captured at interview completion.'
                if interview.completion_snapshot else None
            )
        )
        db.session.add(report)

        interview.overall_score = report_data.get('overall_score')
        interview.feedback_summary = f"Completed interview with score of {report_data.get('overall_score', 0)}%."

        notification = Notification(
            user_id=interview.user_id,
            title='Interview Evaluation Ready!',
            message=f"Your interview report for {interview.job_role} is complete. Overall Score: {report_data.get('overall_score', 0)}%!",
            type='interview'
        )
        db.session.add(notification)

        interview.scoring_status = 'complete'
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # Release the claim so a later trigger can retry instead of getting stuck 'finalizing'.
        try:
            interview = Interview.query.get(interview_id)
            if interview and interview.scoring_status == 'finalizing':
                interview.scoring_status = 'pending'
                db.session.commit()
        except Exception:
            db.session.rollback()
        print(f"[scoring] Report finalization failed for interview {interview_id}: {e}")


@interview_bp.post('/{interview_id}/submit-answer')
def submit_answer(
    interview_id: int,
    question_id: int = Form(...),
    response_text: str = Form(""),
    # Live browser (Web Speech API) transcript — used as the display/fallback answer if
    # authoritative Whisper transcription of the audio fails, so an answer is never lost (§3).
    fallback_text: str = Form(""),
    duration: int = Form(0),
    # True when the client submitted because the question's timer expired (§2.2). A
    # timed-out question may legitimately carry an empty answer (a skip).
    timed_out: bool = Form(False),
    # Base64 webcam frame captured by the client on the final submission, stored on the
    # report so an admin can see a completion snapshot (mirrors the auto-terminate one).
    snapshot_image: str = Form(""),
    audio: UploadFile = File(None),
    user_id: int = Depends(get_current_user_id)
):
    """Fast path (Perf §1.3): persist the answer and let the candidate advance IMMEDIATELY.
    Transcription, LLM scoring, Supabase audio upload, and report generation all happen on a
    background thread so there is no idle gap between questions for a candidate to exploit —
    proctoring/termination now reacts in real time instead of waiting on the LLM."""
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()

    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if interview.status == 'completed':
        raise HTTPException(status_code=400, detail="Interview has already been completed")

    question = InterviewQuestion.query.filter_by(id=question_id, interview_id=interview_id).first()
    if not question:
        raise HTTPException(status_code=400, detail="Question does not belong to this interview")

    # Server-side timer enforcement (§2.3): `started_at` is anchored authoritatively by
    # /start-question and can't be reset by a reload, but until now nothing here actually
    # checked it — a candidate who intercepted or skipped the client's auto-submit could
    # submit a fresh answer well past the deadline with timed_out=false and have it accepted
    # (and scored) as on-time. grace_seconds absorbs normal request latency, not a loophole
    # to pause on. Whatever they typed during the stolen extra time is discarded below
    # (server_forced_timeout), not just relabeled — otherwise the "enforcement" would be
    # cosmetic bookkeeping while the late answer still counted.
    server_forced_timeout = False
    if question.started_at and not timed_out:
        grace_seconds = 5
        elapsed = (datetime.datetime.utcnow() - question.started_at).total_seconds()
        if elapsed > (question.time_limit_seconds or 240) + grace_seconds:
            timed_out = True
            server_forced_timeout = True

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    local_audio_path = None
    audio_content_type = None

    # Write any recording to a local temp file quickly (fast local IO only). Whisper needs a
    # local file to read, and the background worker both transcribes it and uploads it to
    # Supabase — keeping both off the request path. Skipped entirely for a server-forced
    # timeout (see above) — the recording was made during time that had already run out.
    if audio and not server_forced_timeout:
        filename = audio.filename
        if filename and allowed_file(filename):
            safe_name = f"user_{user_id}_int_{interview_id}_q_{question_id}_{int(datetime.datetime.utcnow().timestamp())}.webm"
            save_path = os.path.join(Config.UPLOAD_FOLDER, safe_name)
            contents = audio.file.read()
            with open(save_path, "wb") as f:
                f.write(contents)
            local_audio_path = save_path
            audio_content_type = audio.content_type or 'audio/webm'

    # Best-available text to store immediately (typed answer is authoritative; otherwise the
    # live browser transcript). The authoritative Whisper transcript replaces this in the
    # background for voice answers. A server-forced timeout discards whatever text arrived —
    # it was composed during time that had already run out, so it earns no credit.
    initial_text = ''
    if not server_forced_timeout:
        if response_text and response_text.strip():
            initial_text = response_text.strip()
        elif fallback_text and fallback_text.strip():
            initial_text = fallback_text.strip()

    # A normal (non-timeout) submission must carry SOMETHING (text or audio). A timed-out
    # question may legitimately be an empty skip (§2.2).
    if not timed_out and not initial_text and not local_audio_path:
        raise HTTPException(status_code=400, detail="Response content is empty. Please type or record your answer.")

    try:
        display_now = initial_text or ('[No answer recorded — time expired]' if timed_out else '')

        # audio_path is NEVER a local filesystem path (§3): it stays NULL until the
        # background worker uploads the recording to Supabase and writes the
        # supabase:// reference (or leaves it NULL if the upload fails after retries).
        existing_resp = InterviewResponse.query.filter_by(interview_id=interview_id, question_id=question_id).first()
        if existing_resp:
            existing_resp.response_text = display_now
            existing_resp.duration = duration or existing_resp.duration
            existing_resp.scoring_status = 'pending'
            resp_record = existing_resp
        else:
            resp_record = InterviewResponse(
                interview_id=interview_id,
                question_id=question_id,
                response_text=display_now,
                audio_path=None,
                duration=duration,
                scoring_status='pending'
            )
            db.session.add(resp_record)

        db.session.commit()

        # The MCQ round is generated in the background (see _generate_mcqs_in_background) so
        # it's normally already saved well before a candidate gets here — but this request
        # must never block waiting on it (an earlier version generated it synchronously right
        # here, which meant a candidate who reached the end of the main round faster than that
        # background call finished sat on a submit button that looked hung for 10-20s while it
        # ran). So "expected total" is computed WITHOUT counting mcq rows at all: actual main
        # questions actually saved (not interview.num_questions — generation can fall short of
        # what was requested) plus the MCQ round's fixed size, regardless of whether those mcq
        # rows physically exist in the database yet. get_interview_details is what actually
        # self-heals a stuck background generation, by polling.
        total_main_questions = InterviewQuestion.query.filter(
            InterviewQuestion.interview_id == interview_id,
            InterviewQuestion.question_type != 'mcq',
        ).count()
        total_questions = total_main_questions + MCQ_ROUND_SIZE
        total_responses = InterviewResponse.query.filter_by(interview_id=interview_id).count()

        is_completed = total_responses >= total_questions

        if is_completed:
            # Mark the session finished right away so routing / forced-logout / re-signup
            # detection don't wait on background scoring. The report is produced by the
            # background worker; scoring_status stays 'pending' until it lands (§1.6).
            interview.status = 'completed'
            interview.scoring_status = 'pending'
            # When the final question is submitted because its timer ran out, record that
            # the session ended on time expiry for admin visibility (§2.2).
            if timed_out and not interview.terminated_reason:
                interview.terminated_reason = 'time_expired'
            # Completion snapshot: the client sends a webcam frame with the final answer for
            # admin review. Report generation is now asynchronous, and whichever scoring
            # thread finishes LAST wins the finalization claim — not necessarily this
            # request's thread — so the frame is persisted on the interview here and read
            # back by _finalize_report_if_ready when it builds the report.
            if snapshot_image:
                interview.completion_snapshot = snapshot_image
            # One-time candidates: record that their single official interview is done
            # (drives §3.4 re-signup detection even if the thank-you screen never loads).
            completing_user = User.query.get(user_id)
            if completing_user and completing_user.must_use_otp:
                completing_user.interview_status = 'interview_completed'
            db.session.commit()

        response_id = resp_record.id

        if question.question_type == 'mcq':
            # Deterministic, instant — no LLM/transcription needed, so no reason to defer
            # this to a background thread the way verbal answers are (§ MCQ round).
            _score_mcq_response(resp_record, question)
        else:
            # Kick off async scoring — the candidate does NOT wait for this.
            threading.Thread(
                target=_run_answer_scoring,
                args=(interview_id, question_id, response_id, user_id,
                      local_audio_path, audio_content_type, fallback_text, bool(timed_out)),
                daemon=True
            ).start()

        return {
            'message': 'Answer submitted successfully',
            'is_completed': is_completed,
            'scoring_status': 'processing'
        }

    except HTTPException:
        raise
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to submit response: {str(e)}")

@interview_bp.get('/{interview_id}/report')
def get_report(interview_id: int, user_id: int = Depends(get_current_user_id)):
    user = User.query.get(user_id)
    if user.role == 'admin':
        interview = Interview.query.get(interview_id)
    else:
        interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()

    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    report = InterviewReport.query.filter_by(interview_id=interview_id).first()

    questions = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
    responses = InterviewResponse.query.filter_by(interview_id=interview_id).all()

    responses_map = {r.question_id: r.to_dict() for r in responses}
    qna_list = []

    for q in questions:
        qna_list.append({
            'question': q.to_dict(),
            'response': responses_map.get(q.id, None)
        })

    # Whether the person viewing this has already rated the interview. Drives the feedback
    # prompt the report page shows a candidate who hasn't: asked of the server rather than
    # remembered in the browser, so it stays right across devices, a re-login or a cleared
    # cache, and one interview can't collect two ratings from the same person. Scoped to
    # the viewer — an admin reviewing a candidate's report is answering for themselves.
    feedback_submitted = db.session.query(
        Feedback.query.filter_by(interview_id=interview_id, user_id=user_id).exists()
    ).scalar()

    if not report:
        # Perf §1.6: distinguish "background scoring still running" from a genuine error so
        # the UI can show a 'Scoring in progress' state and poll, instead of erroring. A
        # freshly-completed interview whose report hasn't been generated yet has
        # scoring_status pending/finalizing.
        if interview.status == 'completed' and interview.scoring_status in ('pending', 'finalizing'):
            return {
                'interview': interview.to_dict(),
                'report': None,
                'qna': qna_list,
                'scoring_status': 'in_progress',
                'feedback_submitted': feedback_submitted,
            }
        raise HTTPException(status_code=404, detail="Report not generated yet")

    return {
        'interview': interview.to_dict(),
        'report': report.to_dict(),
        'qna': qna_list,
        'scoring_status': 'complete',
        'feedback_submitted': feedback_submitted,
    }

@interview_bp.post('/evaluate-code')
def evaluate_code(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    data = payload or {}
    code = data.get('code', '')
    language = data.get('language', 'python').lower()
    
    code_stripped = code.strip()
    if not code_stripped:
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    execution_result = ""
    success = True

    if language == 'python':
        try:
            with tempfile.NamedTemporaryFile(suffix='.py', delete=False, mode='w', encoding='utf-8') as temp_file:
                temp_file.write(code)
                temp_file_name = temp_file.name

            proc = subprocess.run(
                ['python', temp_file_name],
                capture_output=True,
                text=True,
                timeout=3.0
            )
            os.remove(temp_file_name)
            
            if proc.returncode == 0:
                execution_result = proc.stdout
            else:
                execution_result = proc.stderr
                success = False
        except subprocess.TimeoutExpired:
            execution_result = "Execution Error: Code execution timed out (limit: 3 seconds)."
            success = False
        except Exception as e:
            execution_result = f"Execution Error: Failed to run Python code. {str(e)}"
            success = False

    elif language == 'javascript':
        try:
            with tempfile.NamedTemporaryFile(suffix='.js', delete=False, mode='w', encoding='utf-8') as temp_file:
                temp_file.write(code)
                temp_file_name = temp_file.name

            proc = subprocess.run(
                ['node', temp_file_name],
                capture_output=True,
                text=True,
                timeout=3.0
            )
            os.remove(temp_file_name)
            
            if proc.returncode == 0:
                execution_result = proc.stdout
            else:
                execution_result = proc.stderr
                success = False
        except FileNotFoundError:
            execution_result = "Execution System Alert: Node.js runtime not found on host. Executed code locally as syntax validated."
            success = True
        except subprocess.TimeoutExpired:
            execution_result = "Execution Error: Code execution timed out (limit: 3 seconds)."
            success = False
        except Exception as e:
            execution_result = f"Execution Error: Failed to run JS code. {str(e)}"
            success = False
    else:
        execution_result = f"[Mock Compiler for {language.upper()}]: Compiled successfully. 0 errors, 0 warnings. Main execution successful."

    system_prompt = (
        "You are an expert technical interviewer and systems architect. "
        "Review the submitted code block and return a JSON object with: "
        "'complexity_time' (string), 'complexity_space' (string), "
        "'bugs' (list of strings describing logic errors/warnings), "
        "'suggestions' (list of strings for improvements), "
        "'rating' (0-10 score)."
    )
    user_prompt = f"Language: {language}\nCode block:\n{code}"

    ai_review = None
    if Config.AI_MODE == 'api' and Config.MIXTRAL_API_KEY:
        ai_review = MixtralService._call_llm(system_prompt, user_prompt)
        
    if not ai_review:
        bugs = []
        suggestions = [
            "Add docstrings and variable type-hints to improve code readability.",
            "Consider handling boundary edge-cases like empty inputs or negative values."
        ]
        
        lines = [line.strip() for line in code_stripped.split('\n') if line.strip() and not line.strip().startswith('#') and not line.strip().startswith('//')]
        non_comment_code = "\n".join(lines).strip()
        
        rating = 8.5
        
        if not non_comment_code or len(non_comment_code) < 10:
            rating = 0.0
            bugs.append("No active code logic found. The script contains only comments or blank spaces.")
            suggestions.append("Write a concrete function implementation to solve the selected problem.")
        elif not success:
            rating = 3.0
            bugs.append("Runtime/Compiler Error: The code did not execute successfully. Check logs.")
            suggestions.append("Fix variable scopes, indentations, or parameters mismatches.")
        else:
            if "while True" in code and "break" not in code:
                bugs.append("Potential infinite loop detected.")
                rating = max(1.0, rating - 2.5)
            if "eval(" in code:
                bugs.append("Security risk: Avoid using 'eval()' function.")
                rating = max(1.0, rating - 2.0)

        ai_review = {
            "complexity_time": "O(N)" if ("for" in code or "while" in code) else "O(1)",
            "complexity_space": "O(N)" if ("list" in code or "[" in code or "append" in code) else "O(1)",
            "bugs": bugs,
            "suggestions": suggestions,
            "rating": rating
        }

    return {
        'execution_output': execution_result,
        'execution_success': success,
        'ai_review': ai_review
    }

def archive_proctor_snapshot(interview, kind, image_data_url, label=None):
    """Decode a base64 data-URL proctoring image and file it in the PRIVATE Supabase
    proctor-snapshots bucket under user_<id>/<date>/, recording a ProctorSnapshot index
    row the admin can browse. Best-effort: any failure is logged and swallowed so it never
    disrupts the interview flow (the snapshot is a supplementary audit artifact). Returns
    the created ProctorSnapshot or None."""
    if not interview or not image_data_url:
        return None
    try:
        raw = image_data_url
        if ',' in raw and raw.strip().startswith('data:'):
            raw = raw.split(',', 1)[1]
        image_bytes = base64.b64decode(raw)
        if not image_bytes:
            return None

        storage_ref = SupabaseService.upload_proctor_image(
            interview.user_id, interview.id, kind, image_bytes
        )
        if not storage_ref:
            print(f"[proctor-snapshot] Supabase upload failed for interview {interview.id} "
                  f"(kind={kind}) — snapshot not archived.")
            return None

        candidate = User.query.get(interview.user_id)
        snap = ProctorSnapshot(
            user_id=interview.user_id,
            candidate_email=candidate.email if candidate else None,
            interview_id=interview.id,
            kind=kind,
            label=(label or '')[:255],
            storage_ref=storage_ref
        )
        db.session.add(snap)
        return snap
    except Exception as e:
        print(f"[proctor-snapshot] Could not archive {kind} snapshot for interview "
              f"{getattr(interview, 'id', '?')}: {e}")
        return None


def mark_interview_as_failed_proctoring(interview, snapshot_image=None, snapshot_description=None):
    # NOTE: we deliberately do NOT archive a ProctorSnapshot row here. The client already
    # files exactly one webcam + one screen snapshot for EVERY counted violation, including
    # the terminating one. Archiving a 'termination' copy as well made that last violation
    # produce three rows instead of two (N violations => 2N+1 snapshots, not 2N).
    # The inline copy kept on the report below still powers the Compliance Audit card.

    interview.is_proctor_failed = True
    interview.status = 'completed'
    interview.overall_score = 0.0
    interview.feedback_summary = "Session automatically terminated due to multiple proctoring integrity violations."
    # A proctor termination writes its own zero-score report below, so mark scoring as done
    # (Perf §1): this prevents any still-pending background answer-scoring thread from later
    # claiming report finalization and overwriting the termination result.
    interview.scoring_status = 'complete'
    
    report = InterviewReport.query.filter_by(interview_id=interview.id).first()
    if not report:
        report = InterviewReport(
            interview_id=interview.id,
            overall_score=0.0,
            technical_score=0.0,
            communication_score=0.0,
            confidence_score=0.0,
            problem_solving_score=0.0,
            strengths=json.dumps(["None - Session Flagged"]),
            weaknesses=json.dumps(["Multiple proctoring integrity violations"]),
            missing_concepts="Proctoring compliance was breached.",
            recommendations="Ensure you remain in full view of the camera, do not switch tabs, and do not look away during assessments.",
            snapshot_image=snapshot_image,
            snapshot_description=snapshot_description
        )
        db.session.add(report)
    else:
        report.overall_score = 0.0
        report.technical_score = 0.0
        report.communication_score = 0.0
        report.confidence_score = 0.0
        report.problem_solving_score = 0.0
        report.strengths = json.dumps(["None - Session Flagged"])
        report.weaknesses = json.dumps(["Multiple proctoring integrity violations"])
        report.missing_concepts = "Proctoring compliance was breached."
        report.recommendations = "Ensure you remain in full view of the camera, do not switch tabs, and do not look away during assessments."
        report.snapshot_image = snapshot_image
        report.snapshot_description = snapshot_description

    notification = Notification(
        user_id=interview.user_id,
        title="Interview Terminated",
        message=f"Your mock interview for {interview.job_role} was terminated due to proctoring policy compliance violations.",
        is_read=False
    )
    db.session.add(notification)

    # A proctor-terminated session still counts as the one-time candidate's single
    # official attempt (§3.2) — mark it so re-signup routes into admin approval.
    terminated_user = User.query.get(interview.user_id)
    if terminated_user and terminated_user.must_use_otp:
        terminated_user.interview_status = 'interview_completed'

# A single proctoring termination blocks the candidate (their CNIC/account) for this
# many days. Login auto-reopens the account once banned_until has passed.
PROCTOR_BAN_DAYS = 30

def check_and_apply_user_ban(user_id):
    user = User.query.get(user_id)
    if not user:
        return
    if user.role == 'admin':
        return
    terminated_count = Interview.query.filter_by(user_id=user_id, is_proctor_failed=True).count()
    # Any proctoring termination blocks the candidate for 30 days. Re-terminations only
    # extend the block (never shorten an already-longer one).
    if terminated_count >= 1:
        new_until = datetime.datetime.utcnow() + datetime.timedelta(days=PROCTOR_BAN_DAYS)
        user.status = 'banned'
        if not user.banned_until or new_until > user.banned_until:
            user.banned_until = new_until
        admin_user = User.query.filter_by(role='admin').first()
        admin_fk = admin_user.id if admin_user else user_id

        sys_log = AdminLog(
            admin_id=admin_fk,
            action='AUTO_BAN_USER',
            details=(
                f"User ID {user_id} ({user.email}, CNIC {user.cnic or 'n/a'}) automatically "
                f"blocked for {PROCTOR_BAN_DAYS} days (until {user.banned_until.strftime('%Y-%m-%d %H:%M UTC')}) "
                f"due to a proctoring termination."
            )
        )
        db.session.add(sys_log)

@interview_bp.post('/{interview_id}/proctor-log')
def log_proctoring_violation(interview_id: int, payload: dict = Body(default=None),
                             user_id: int = Depends(get_current_user_id)):
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    if interview.status == 'completed':
        return {'message': 'Interview already completed', 'auto_terminate': False}

    data = payload or {}
    violation_type = data.get('type')
    details = data.get('details', '')
    snapshot_image = data.get('snapshot_image')
    # Soft violations (e.g. full-face-not-visible, §4.2) are logged for admin visibility
    # but never increment the terminating counter or auto-terminate — face positioning is
    # often an innocent, temporary issue, so it must not fail an interview.
    soft = bool(data.get('soft', False))

    if not violation_type:
        raise HTTPException(status_code=400, detail="Violation type is required")

    try:
        try:
            logs = json.loads(interview.proctor_logs or '[]')
        except Exception:
            logs = []

        logs.append({
            'timestamp': datetime.datetime.utcnow().isoformat(),
            'type': violation_type,
            'details': details,
            'soft': soft
        })

        interview.proctor_logs = json.dumps(logs)

        if soft:
            # Warning-only: recorded above, counter untouched, interview continues.
            db.session.commit()
            return {
                'message': 'Warning recorded',
                'auto_terminate': False,
                'violations_count': interview.proctor_violations_count or 0,
                'soft': True
            }

        # Atomic increment AND termination guard in a single statement.
        #
        # The increment was already atomic on its own, but the "has this session already been
        # terminated?" check sat in a separate statement before it, which left a real window
        # open: request B reads status='active', then blocks on the row lock request A holds,
        # then increments on top of A's terminating write — producing a 6th strike past the
        # 5-strike ceiling and running termination a second time. Folding the condition into
        # the UPDATE closes it, because Postgres re-evaluates this WHERE against the latest
        # committed version of the row *after* acquiring the lock: once A has committed the
        # termination, B matches zero rows and backs off having counted nothing.
        #
        # RETURNING gives back the true post-increment value, so the threshold below is never
        # evaluated against a stale read. `IS DISTINCT FROM` rather than `<>` so legacy rows
        # with a NULL status still match instead of silently failing the guard.
        row = db.session.execute(
            text("""
                UPDATE interviews
                   SET proctor_violations_count = COALESCE(proctor_violations_count, 0) + 1
                 WHERE id = :interview_id
                   AND status IS DISTINCT FROM 'completed'
              RETURNING proctor_violations_count
            """),
            {'interview_id': interview_id},
        ).first()

        if row is None:
            # A concurrent violation already terminated this session. The log entry appended
            # above is still committed (it remains evidence of what happened), but nothing is
            # counted — and this deliberately returns NO violations_count: the value this
            # request's instance holds is the PRE-increment one, and replying with it is
            # exactly what made the candidate's counter visibly fall back from 6 to 4 in the
            # seconds before termination.
            db.session.commit()
            return {
                'message': 'Interview already completed',
                'auto_terminate': False,
            }

        new_count = row[0]
        # The raw UPDATE bypassed the ORM, so this instance still carries the old number.
        # Expiring (rather than assigning) keeps it truthful without marking the column dirty,
        # which would make the commit below issue a second, redundant UPDATE for it.
        db.session.expire(interview, ['proctor_violations_count'])

        auto_terminate = False
        # Allow exactly 4 warnings. Terminate when violations_count reaches 5 (exceeding 4)
        if new_count > 4:
            snapshot_description = f"Integrity breach detected: {details} (Violation type: {violation_type})."
            mark_interview_as_failed_proctoring(
                interview,
                snapshot_image=snapshot_image,
                snapshot_description=snapshot_description
            )
            db.session.flush()
            check_and_apply_user_ban(user_id)
            auto_terminate = True

        db.session.commit()
        return {
            'message': 'Violation recorded successfully',
            'auto_terminate': auto_terminate,
            'violations_count': new_count
        }
        
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record violation: {str(e)}")


@interview_bp.post('/{interview_id}/proctor-snapshot')
def upload_proctor_snapshot(interview_id: int, payload: dict = Body(default=None),
                            user_id: int = Depends(get_current_user_id)):
    """Receive a proctoring screenshot of the candidate's actual computer screen (periodic
    monitoring or captured on a suspicious event) and file it in the PRIVATE Supabase
    proctor-snapshots archive. Best-effort and non-blocking: a storage hiccup returns a
    soft failure rather than interrupting the interview."""
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
    # NOTE: we intentionally do NOT reject a just-completed interview here. The
    # terminating violation marks the interview completed almost simultaneously with the
    # client firing its snapshot for that same violation — rejecting on 'completed' would
    # drop the terminating violation's frame. Archiving it is exactly what we want.

    data = payload or {}
    image = data.get('image')
    kind = data.get('kind', 'screen')
    label = data.get('label', 'periodic')
    if not image:
        raise HTTPException(status_code=400, detail="Snapshot image is required")

    # Only these monitoring kinds are accepted here. 'identity' is the pre-interview
    # baseline face photo captured during the identity check.
    if kind not in ('screen', 'webcam', 'identity'):
        kind = 'screen'

    snap = archive_proctor_snapshot(interview, kind, image, label=label)
    if not snap:
        return {'stored': False, 'message': 'Snapshot could not be stored right now'}
    db.session.commit()
    return {'stored': True, 'id': snap.id}


@interview_bp.post('/{interview_id}/identity-failed')
def identity_verification_failed(interview_id: int, payload: dict = Body(default=None),
                                 user_id: int = Depends(get_current_user_id)):
    """Hard-terminate an interview because the person on camera is no longer the person who
    passed the pre-interview identity check.

    This is deliberately NOT part of the 4-strike violation flow: the violation counter is
    left untouched and no warning is issued — a swapped candidate is an immediate block, not
    a strike. The event gets its own AdminLog entry (action IDENTITY_VERIFICATION_FAILED)
    carrying the candidate email, interview id and timestamp, plus an archived 'identity'
    snapshot of the mismatching frame, so the admin can see exactly why it ended."""
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if interview.status == 'completed':
        return {'message': 'Interview already completed', 'terminated': False}

    data = payload or {}
    details = (data.get('details') or 'Face on camera did not match the verified candidate.')[:255]
    snapshot_image = data.get('snapshot_image')

    try:
        candidate = User.query.get(user_id)
        # Archive the mismatching frame so the admin can visually confirm the decision.
        if snapshot_image:
            archive_proctor_snapshot(interview, 'identity', snapshot_image,
                                     label=f"identity-mismatch: {details}")

        # Reuse the standard termination path (zero-score report, candidate notification,
        # one-time attempt consumed), then overwrite the wording so the report and logs say
        # identity — not "proctoring violations", which would be misleading here.
        mark_interview_as_failed_proctoring(
            interview,
            snapshot_image=snapshot_image,
            snapshot_description=f"Identity verification failed: {details}"
        )
        interview.terminated_reason = 'identity_mismatch'
        interview.feedback_summary = (
            "Session automatically terminated: the person on camera did not match the "
            "candidate verified at the start of the interview."
        )
        # Explicitly NOT touched: interview.proctor_violations_count. Identity failure is a
        # hard block that must not consume or inflate the candidate's violation strikes.

        report = InterviewReport.query.filter_by(interview_id=interview.id).first()
        if report:
            report.weaknesses = json.dumps(["Identity verification failed"])
            report.missing_concepts = "The candidate on camera could not be verified."
            report.recommendations = (
                "The face detected during the interview did not match the photo captured at "
                "the identity check. Contact the administrator if you believe this is an error."
            )

        admin_user = User.query.filter_by(role='admin').first()
        db.session.add(AdminLog(
            admin_id=admin_user.id if admin_user else user_id,
            action='IDENTITY_VERIFICATION_FAILED',
            details=(
                f"Identity verification FAILED for {candidate.email if candidate else 'unknown'} "
                f"(user ID {user_id}) during interview ID {interview_id} at "
                f"{datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}. "
                f"{details} Interview was terminated immediately without counting a proctoring "
                f"violation. A snapshot of the mismatching frame was archived."
            )
        ))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record identity failure: {str(e)}")

    return {'message': 'Interview terminated — identity verification failed', 'terminated': True}

@interview_bp.post('/{interview_id}/fail-proctoring')
def force_fail_proctoring(interview_id: int, payload: dict = Body(default=None),
                          user_id: int = Depends(get_current_user_id)):
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    data = payload or {}
    snapshot_image = data.get('snapshot_image')
    snapshot_description = data.get('snapshot_description', 'Interview manually failed or integrity checkpoint breached.')

    try:
        mark_interview_as_failed_proctoring(
            interview, 
            snapshot_image=snapshot_image, 
            snapshot_description=snapshot_description
        )
        db.session.flush()
        check_and_apply_user_ban(user_id)
        db.session.commit()
        return {'message': 'Interview terminated and marked as failed due to integrity check.'}
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to terminate interview: {str(e)}")
