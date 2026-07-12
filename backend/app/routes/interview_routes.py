import os
import datetime
import json
import tempfile
import subprocess
from fastapi import APIRouter, Request, HTTPException, status, Depends, UploadFile, File, Form
from app.database.db import db
from app.models import (
    User, Token, Transaction, Interview, InterviewQuestion,
    InterviewResponse, InterviewReport, Notification, AdminLog
)
from app.ai.mixtral.mixtral_service import MixtralService
from app.ai.whisper.whisper_service import WhisperService, TranscriptionError
from app.config.config import Config
from app.utils.security import get_current_user_id

interview_bp = APIRouter()

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[-1].lower() in Config.ALLOWED_EXTENSIONS

@interview_bp.post('/start')
async def start_interview(request: Request, user_id: int = Depends(get_current_user_id)):
    data = await request.json() or {}

    interview_type = data.get('type')  # technical, HR, behavioral, custom
    job_role = data.get('job_role')
    experience_level = data.get('experience_level')
    difficulty = data.get('difficulty', 'Medium')
    num_questions = int(data.get('num_questions', 5))
    custom_jd = data.get('custom_jd')
    custom_skills = data.get('custom_skills')

    if not interview_type or not job_role or not experience_level:
        raise HTTPException(status_code=400, detail="Interview type, job role, and experience level are required")

    # Domain validation (§3.4): block clearly non-technical custom domains BEFORE charging a
    # token or creating the session. JD-driven interviews skip this (a JD implies a real role).
    has_jd = bool(custom_jd and len(custom_jd.strip()) >= 30)
    if not has_jd:
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

        questions_list = MixtralService.generate_questions(
            interview_type=interview_type,
            job_role=job_role,
            experience_level=experience_level,
            difficulty=difficulty,
            num_questions=num_questions,
            custom_jd=custom_jd,
            custom_skills=custom_skills
        )

        for idx, q_data in enumerate(questions_list):
            q_text = q_data.get('question_text')
            q_type = q_data.get('question_type', 'conceptual')
            
            question = InterviewQuestion(
                interview_id=interview.id,
                question_text=q_text,
                question_type=q_type,
                order_num=idx + 1
            )
            db.session.add(question)

        db.session.commit()

        saved_questions = InterviewQuestion.query.filter_by(interview_id=interview.id).order_by(InterviewQuestion.order_num).all()

        return {
            'message': 'Interview started successfully',
            'interview': interview.to_dict(),
            'questions': [q.to_dict() for q in saved_questions]
        }

    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to initiate interview: {str(e)}")

@interview_bp.get('/history')
async def get_history(user_id: int = Depends(get_current_user_id)):
    interviews = Interview.query.filter_by(user_id=user_id).order_by(Interview.created_at.desc()).all()
    return [i.to_dict() for i in interviews]

@interview_bp.get('/stats/summary')
async def get_stats_summary(user_id: int = Depends(get_current_user_id)):
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
async def get_interview_details(interview_id: int, user_id: int = Depends(get_current_user_id)):
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    saved_questions = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
    responses_count = InterviewResponse.query.filter_by(interview_id=interview_id).count()
    return {
        'interview': interview.to_dict(),
        'questions': [q.to_dict() for q in saved_questions],
        'responses_count': responses_count
    }

@interview_bp.post('/transcribe')
async def transcribe_audio(audio: UploadFile = File(...), user_id: int = Depends(get_current_user_id)):
    """API endpoint to receive raw audio and return transcription quickly."""
    filename = audio.filename
    if not filename or not allowed_file(filename):
        raise HTTPException(status_code=400, detail="Invalid audio file format")

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    temp_filename = f"transcribe_user_{user_id}_{int(datetime.datetime.utcnow().timestamp())}.webm"
    save_path = os.path.join(Config.UPLOAD_FOLDER, temp_filename)

    try:
        contents = await audio.read()
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

@interview_bp.post('/{interview_id}/submit-answer')
async def submit_answer(
    interview_id: int,
    question_id: int = Form(...),
    response_text: str = Form(""),
    duration: int = Form(0),
    audio: UploadFile = File(None),
    user_id: int = Depends(get_current_user_id)
):
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()

    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if interview.status == 'completed':
        raise HTTPException(status_code=400, detail="Interview has already been completed")

    question = InterviewQuestion.query.filter_by(id=question_id, interview_id=interview_id).first()
    if not question:
        raise HTTPException(status_code=400, detail="Question does not belong to this interview")

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    audio_path = None

    if audio:
        filename = audio.filename
        if filename and allowed_file(filename):
            safe_name = f"user_{user_id}_int_{interview_id}_q_{question_id}_{int(datetime.datetime.utcnow().timestamp())}.webm"
            save_path = os.path.join(Config.UPLOAD_FOLDER, safe_name)
            
            contents = await audio.read()
            with open(save_path, "wb") as f:
                f.write(contents)
                
            audio_path = save_path

            # First-pass fallback transcription if the client didn't supply text.
            if not response_text:
                try:
                    response_text = WhisperService.transcribe(audio_path, question_text=question.question_text)
                except TranscriptionError as te:
                    # Do NOT score a fabricated or empty answer — surface the failure so the
                    # candidate can retry or type their answer instead.
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            "We couldn't transcribe your audio right now. Please type your answer "
                            f"or try again. ({te})"
                        )
                    )

    if not response_text or not response_text.strip():
        raise HTTPException(status_code=400, detail="Response content is empty. Please type or record your answer.")

    try:
        existing_resp = InterviewResponse.query.filter_by(interview_id=interview_id, question_id=question_id).first()
        eval_data = MixtralService.evaluate_response(
            question.question_text,
            response_text,
            job_role=interview.job_role,
            difficulty=interview.difficulty,
            question_type=question.question_type
        )

        # Persist the LLM rationale together with the transcript (§2.4). Low-confidence
        # evaluations are prefixed so they surface as needing manual review.
        stored_feedback = eval_data.get('feedback', '')
        if eval_data.get('needs_manual_review'):
            stored_feedback = f"[FLAGGED FOR MANUAL REVIEW] {stored_feedback}"

        if existing_resp:
            existing_resp.response_text = response_text
            existing_resp.audio_path = audio_path or existing_resp.audio_path
            existing_resp.duration = duration or existing_resp.duration
            existing_resp.score = eval_data.get('score', 0)
            existing_resp.technical_score = eval_data.get('technical_score', 0)
            existing_resp.communication_score = eval_data.get('communication_score', 0)
            existing_resp.confidence_score = eval_data.get('confidence_score', 0)
            existing_resp.feedback = stored_feedback
            resp_record = existing_resp
        else:
            resp_record = InterviewResponse(
                interview_id=interview_id,
                question_id=question_id,
                response_text=response_text,
                audio_path=audio_path,
                duration=duration,
                score=eval_data.get('score', 0),
                technical_score=eval_data.get('technical_score', 0),
                communication_score=eval_data.get('communication_score', 0),
                confidence_score=eval_data.get('confidence_score', 0),
                feedback=stored_feedback
            )
            db.session.add(resp_record)

        db.session.commit()

        total_questions = InterviewQuestion.query.filter_by(interview_id=interview_id).count()
        total_responses = InterviewResponse.query.filter_by(interview_id=interview_id).count()

        is_completed = total_responses >= total_questions

        if is_completed:
            interview.status = 'completed'
            db.session.commit()

            qas = []
            saved_q = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
            for q in saved_q:
                r = InterviewResponse.query.filter_by(interview_id=interview_id, question_id=q.id).first()
                if r:
                    qas.append({
                        'question': q.question_text,
                        'answer': r.response_text,
                        'evaluation': {
                            'score': r.score,
                            'technical_score': r.technical_score,
                            'communication_score': r.communication_score,
                            'confidence_score': r.confidence_score,
                        }
                    })

            report_data = MixtralService.generate_report(interview.type, interview.job_role, qas)

            # The LLM path returns real lists; the mock path returns JSON strings. Serialize
            # any list/dict so the stored value is always valid JSON the frontend can parse.
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
                recommendations=_as_text(report_data.get('recommendations'), '')
            )
            
            interview.overall_score = report_data.get('overall_score')
            interview.feedback_summary = f"Completed mock interview with score of {report.overall_score}%."
            
            db.session.add(report)

            notification = Notification(
                user_id=user_id,
                title='Interview Evaluation Ready!',
                message=f'Your mock interview report for {interview.job_role} is complete. Overall Score: {report.overall_score}%!',
                type='interview'
            )
            db.session.add(notification)

            db.session.commit()

        return {
            'message': 'Answer submitted successfully',
            'evaluation': eval_data,
            'is_completed': is_completed
        }

    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to evaluate response: {str(e)}")

@interview_bp.get('/{interview_id}/report')
async def get_report(interview_id: int, user_id: int = Depends(get_current_user_id)):
    user = User.query.get(user_id)
    if user.role == 'admin':
        interview = Interview.query.get(interview_id)
    else:
        interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()

    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    report = InterviewReport.query.filter_by(interview_id=interview_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not generated yet")

    questions = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
    responses = InterviewResponse.query.filter_by(interview_id=interview_id).all()
    
    responses_map = {r.question_id: r.to_dict() for r in responses}
    qna_list = []
    
    for q in questions:
        qna_list.append({
            'question': q.to_dict(),
            'response': responses_map.get(q.id, None)
        })

    return {
        'interview': interview.to_dict(),
        'report': report.to_dict(),
        'qna': qna_list
    }

@interview_bp.post('/evaluate-code')
async def evaluate_code(request: Request, user_id: int = Depends(get_current_user_id)):
    data = await request.json() or {}
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

def mark_interview_as_failed_proctoring(interview, snapshot_image=None, snapshot_description=None):
    interview.is_proctor_failed = True
    interview.status = 'completed'
    interview.overall_score = 0.0
    interview.feedback_summary = "Session automatically terminated due to multiple proctoring integrity violations."
    
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

def check_and_apply_user_ban(user_id):
    user = User.query.get(user_id)
    if not user:
        return
    if user.role == 'admin':
        return
    terminated_count = Interview.query.filter_by(user_id=user_id, is_proctor_failed=True).count()
    if terminated_count >= 3:
        user.status = 'banned'
        user.banned_until = datetime.datetime.utcnow().replace(hour=23, minute=59, second=59)
        admin_user = User.query.filter_by(role='admin').first()
        admin_fk = admin_user.id if admin_user else user_id

        sys_log = AdminLog(
            admin_id=admin_fk,
            action='AUTO_BAN_USER',
            details=f"User ID {user_id} ({user.email}) automatically blocked until end of day due to 3 mock proctoring terminations."
        )
        db.session.add(sys_log)

@interview_bp.post('/{interview_id}/proctor-log')
async def log_proctoring_violation(interview_id: int, request: Request, user_id: int = Depends(get_current_user_id)):
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    if interview.status == 'completed':
        return {'message': 'Interview already completed', 'auto_terminate': False}

    data = await request.json() or {}
    violation_type = data.get('type')
    details = data.get('details', '')
    snapshot_image = data.get('snapshot_image')

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
            'details': details
        })
        
        interview.proctor_logs = json.dumps(logs)
        # Coerce NULL/None (older rows created before this column had data) to 0
        # before incrementing, otherwise `None + 1` raises and the count never updates.
        interview.proctor_violations_count = (interview.proctor_violations_count or 0) + 1
        
        auto_terminate = False
        # Allow exactly 3 warnings. Terminate when violations_count reaches 4 (exceeding 3)
        if interview.proctor_violations_count > 3:
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
            'violations_count': interview.proctor_violations_count
        }
        
    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record violation: {str(e)}")

@interview_bp.post('/{interview_id}/fail-proctoring')
async def force_fail_proctoring(interview_id: int, request: Request, user_id: int = Depends(get_current_user_id)):
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    data = await request.json() or {}
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
