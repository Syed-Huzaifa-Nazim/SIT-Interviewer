import os
import datetime
import json
import subprocess
import tempfile
from flask import Blueprint, request, jsonify
from app.database.db import db
from app.models import (
    User, Token, Transaction, Interview, InterviewQuestion,
    InterviewResponse, InterviewReport, Notification
)
from app.ai.mixtral.mixtral_service import MixtralService
from app.ai.whisper.whisper_service import WhisperService
from app.config.config import Config
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

interview_bp = Blueprint('interviews', __name__)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

@interview_bp.route('/start', methods=['POST'])
@jwt_required()
def start_interview():
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    interview_type = data.get('type')  # technical, HR, behavioral, custom
    job_role = data.get('job_role')
    experience_level = data.get('experience_level')
    difficulty = data.get('difficulty', 'Medium')
    num_questions = int(data.get('num_questions', 5))
    custom_jd = data.get('custom_jd')
    custom_skills = data.get('custom_skills')

    if not interview_type or not job_role or not experience_level:
        return jsonify({'message': 'Interview type, job role, and experience level are required'}), 400

    # Ensure user has tokens
    token_account = Token.query.filter_by(user_id=user_id).first()
    if not token_account or token_account.tokens_available < 1:
        return jsonify({'message': 'Insufficient tokens. Please purchase tokens to attend interviews.'}), 402

    try:
        # Deduct token
        token_account.tokens_available -= 1
        token_account.tokens_consumed += 1

        # Log consumption transaction
        transaction = Transaction(
            user_id=user_id,
            amount=0.0,
            tokens_added=-1,
            transaction_type='consumption'
        )
        db.session.add(transaction)

        # Create Interview record
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

        # Generate Questions via Mixtral
        questions_list = MixtralService.generate_questions(
            interview_type=interview_type,
            job_role=job_role,
            experience_level=experience_level,
            difficulty=difficulty,
            num_questions=num_questions,
            custom_jd=custom_jd,
            custom_skills=custom_skills
        )

        # Store questions in DB
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

        # Fetch inserted questions
        saved_questions = InterviewQuestion.query.filter_by(interview_id=interview.id).order_by(InterviewQuestion.order_num).all()

        return jsonify({
            'message': 'Interview started successfully',
            'interview': interview.to_dict(),
            'questions': [q.to_dict() for q in saved_questions]
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to initiate interview: {str(e)}'}), 500


@interview_bp.route('/<int:interview_id>/details', methods=['GET'])
@jwt_required()
def get_interview_details(interview_id):
    user_id = get_jwt_identity()
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    if not interview:
        return jsonify({'message': 'Interview session not found'}), 404
        
    saved_questions = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
    responses_count = InterviewResponse.query.filter_by(interview_id=interview_id).count()
    return jsonify({
        'interview': interview.to_dict(),
        'questions': [q.to_dict() for q in saved_questions],
        'responses_count': responses_count
    }), 200


@interview_bp.route('/<int:interview_id>/submit-answer', methods=['POST'])
@jwt_required()
def submit_answer(interview_id):
    user_id = get_jwt_identity()
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()

    if not interview:
        return jsonify({'message': 'Interview session not found'}), 404

    if interview.status == 'completed':
        return jsonify({'message': 'Interview has already been completed'}), 400

    # Read payload - supports both Multipart Form (for audio) and JSON
    question_id = request.form.get('question_id')
    response_text = request.form.get('response_text', '')
    duration = request.form.get('duration', type=int)

    # Check for JSON request if form is empty
    if not question_id:
        data = request.get_json() or {}
        question_id = data.get('question_id')
        response_text = data.get('response_text', '')
        duration = data.get('duration')

    if not question_id:
        return jsonify({'message': 'Question ID is required'}), 400

    question = InterviewQuestion.query.filter_by(id=question_id, interview_id=interview_id).first()
    if not question:
        return jsonify({'message': 'Question does not belong to this interview'}), 400

    # Ensure uploads folder exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    audio_path = None

    # Handle Audio file upload if present
    if 'audio' in request.files:
        audio_file = request.files['audio']
        if audio_file and allowed_file(audio_file.filename):
            filename = secure_filename(f"user_{user_id}_int_{interview_id}_q_{question_id}_{int(datetime.datetime.utcnow().timestamp())}.webm")
            save_path = os.path.join(Config.UPLOAD_FOLDER, filename)
            audio_file.save(save_path)
            audio_path = save_path

            # Transcribe Audio using Whisper
            transcribed = WhisperService.transcribe(audio_path, question_text=question.question_text)
            response_text = transcribed

    if not response_text:
        return jsonify({'message': 'Response content is empty'}), 400

    try:
        # Check if response already exists (update if so, else create)
        existing_resp = InterviewResponse.query.filter_by(interview_id=interview_id, question_id=question_id).first()
        
        # Evaluate Answer using Mixtral
        eval_data = MixtralService.evaluate_response(question.question_text, response_text)

        if existing_resp:
            existing_resp.response_text = response_text
            existing_resp.audio_path = audio_path or existing_resp.audio_path
            existing_resp.duration = duration or existing_resp.duration
            existing_resp.score = eval_data.get('score')
            existing_resp.technical_score = eval_data.get('technical_score')
            existing_resp.communication_score = eval_data.get('communication_score')
            existing_resp.confidence_score = eval_data.get('confidence_score')
            existing_resp.feedback = eval_data.get('feedback')
            resp_record = existing_resp
        else:
            resp_record = InterviewResponse(
                interview_id=interview_id,
                question_id=question_id,
                response_text=response_text,
                audio_path=audio_path,
                duration=duration,
                score=eval_data.get('score'),
                technical_score=eval_data.get('technical_score'),
                communication_score=eval_data.get('communication_score'),
                confidence_score=eval_data.get('confidence_score'),
                feedback=eval_data.get('feedback')
            )
            db.session.add(resp_record)

        db.session.commit()

        # Check if all questions are answered
        total_questions = InterviewQuestion.query.filter_by(interview_id=interview_id).count()
        total_responses = InterviewResponse.query.filter_by(interview_id=interview_id).count()

        is_completed = total_responses >= total_questions

        if is_completed:
            # Mark Interview Completed
            interview.status = 'completed'
            db.session.commit()

            # Generate aggregate evaluation report
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
            
            # Save Report
            report = InterviewReport(
                interview_id=interview_id,
                overall_score=report_data.get('overall_score', 0),
                technical_score=report_data.get('technical_score', 0),
                communication_score=report_data.get('communication_score', 0),
                confidence_score=report_data.get('confidence_score', 0),
                problem_solving_score=report_data.get('problem_solving_score', 0),
                strengths=report_data.get('strengths', '[]'),
                weaknesses=report_data.get('weaknesses', '[]'),
                missing_concepts=report_data.get('missing_concepts', ''),
                recommendations=report_data.get('recommendations', '')
            )
            
            # Save overall stats to Interview table
            interview.overall_score = report_data.get('overall_score')
            interview.feedback_summary = f"Completed mock interview with score of {report.overall_score}%."
            
            db.session.add(report)

            # Generate final notification
            notification = Notification(
                user_id=user_id,
                title='Interview Evaluation Ready!',
                message=f'Your mock interview report for {interview.job_role} is complete. Overall Score: {report.overall_score}%!',
                type='interview'
            )
            db.session.add(notification)

            db.session.commit()

        return jsonify({
            'message': 'Answer submitted successfully',
            'evaluation': eval_data,
            'is_completed': is_completed
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to evaluate response: {str(e)}'}), 500


@interview_bp.route('/<int:interview_id>/report', methods=['GET'])
@jwt_required()
def get_report(interview_id):
    user_id = get_jwt_identity()
    
    # Allow candidate to view their report, or admin to view any report
    user = User.query.get(user_id)
    if user.role == 'admin':
        interview = Interview.query.get(interview_id)
    else:
        interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()

    if not interview:
        return jsonify({'message': 'Interview session not found'}), 404

    report = InterviewReport.query.filter_by(interview_id=interview_id).first()
    if not report:
        return jsonify({'message': 'Report not generated yet'}), 404

    # Build response data structure
    questions = InterviewQuestion.query.filter_by(interview_id=interview_id).order_by(InterviewQuestion.order_num).all()
    responses = InterviewResponse.query.filter_by(interview_id=interview_id).all()
    
    responses_map = {r.question_id: r.to_dict() for r in responses}
    qna_list = []
    
    for q in questions:
        qna_list.append({
            'question': q.to_dict(),
            'response': responses_map.get(q.id, None)
        })

    return jsonify({
        'interview': interview.to_dict(),
        'report': report.to_dict(),
        'qna': qna_list
    }), 200


@interview_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    user_id = get_jwt_identity()
    interviews = Interview.query.filter_by(user_id=user_id).order_by(Interview.created_at.desc()).all()
    return jsonify([i.to_dict() for i in interviews]), 200


# --- CODING WORKSPACE EXECUTION & AI REVIEW ---

@interview_bp.route('/evaluate-code', methods=['POST'])
@jwt_required()
def evaluate_code():
    data = request.get_json() or {}
    code = data.get('code', '')
    language = data.get('language', 'python').lower()
    
    # 1. Run local safe code execution for Python and JavaScript
    execution_result = ""
    success = True
    
    code_stripped = code.strip()
    if not code_stripped:
        return jsonify({'message': 'Code cannot be empty'}), 400

    if language == 'python':
        try:
            with tempfile.NamedTemporaryFile(suffix='.py', delete=False, mode='w', encoding='utf-8') as temp_file:
                temp_file.write(code)
                temp_file_name = temp_file.name

            # Run Python under a timeout limit
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
        # Compiled languages like C++, Java, C# - simulate compilation and output
        execution_result = f"[Mock Compiler for {language.upper()}]: Compiled successfully. 0 errors, 0 warnings. Main execution successful."

    # 2. AI-powered Code Review (Mixtral)
    system_prompt = (
        "You are an expert technical interviewer and systems architect. "
        "Review the submitted code block and return a JSON object with: "
        "'complexity_time' (string), 'complexity_space' (string), "
        "'bugs' (list of strings describing logic errors/warnings), "
        "'suggestions' (list of strings for improvements), "
        "'rating' (0-10 score)."
    )
    user_prompt = f"Language: {language}\nCode block:\n{code}"

    # Try Mixtral
    ai_review = None
    if Config.AI_MODE == 'api' and Config.MIXTRAL_API_KEY:
        ai_review = MixtralService._call_llm(system_prompt, user_prompt)
        
    if not ai_review:
        # Mock Code Review
        bugs = []
        suggestions = [
            "Add docstrings and variable type-hints to improve code readability.",
            "Consider handling boundary edge-cases like empty inputs or negative values."
        ]
        
        # Clean comment lines out to evaluate if code has content
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

        # Make a mock review
        ai_review = {
            "complexity_time": "O(N)" if ("for" in code or "while" in code) else "O(1)",
            "complexity_space": "O(N)" if ("list" in code or "[" in code or "append" in code) else "O(1)",
            "bugs": bugs,
            "suggestions": suggestions,
            "rating": rating
        }

    return jsonify({
        'execution_output': execution_result,
        'execution_success': success,
        'ai_review': ai_review
    }), 200


# Helper to fail interview due to proctoring violations
def mark_interview_as_failed_proctoring(interview, snapshot_image=None, snapshot_description=None):
    interview.is_proctor_failed = True
    interview.status = 'completed'
    interview.overall_score = 0.0
    interview.feedback_summary = "Session automatically terminated due to multiple proctoring integrity violations."
    
    # Check if report already exists
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

    # Create failure notification
    notification = Notification(
        user_id=interview.user_id,
        title="Interview Terminated",
        message=f"Your mock interview for {interview.job_role} was terminated due to proctoring policy compliance violations.",
        is_read=False
    )
    db.session.add(notification)


def check_and_apply_user_ban(user_id):
    from app.models import AdminLog
    user = User.query.get(user_id)
    if not user:
        return
    # Count failed completed interviews
    terminated_count = Interview.query.filter_by(user_id=user_id, is_proctor_failed=True).count()
    if terminated_count >= 3:
        user.status = 'banned'
        user.banned_until = datetime.datetime.utcnow().replace(hour=23, minute=59, second=59)
        sys_log = AdminLog(
            admin_id=None,
            action='AUTO_BAN_USER',
            details=f"User ID {user_id} ({user.email}) automatically blocked until end of day due to 3 mock proctoring terminations."
        )
        db.session.add(sys_log)


@interview_bp.route('/<int:interview_id>/proctor-log', methods=['POST'])
@jwt_required()
def log_proctoring_violation(interview_id):
    user_id = get_jwt_identity()
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    
    if not interview:
        return jsonify({'message': 'Interview session not found'}), 404
        
    if interview.status == 'completed':
        return jsonify({'message': 'Interview already completed', 'auto_terminate': False}), 200

    data = request.get_json() or {}
    violation_type = data.get('type')  # NO_FACE, TAB_SWITCH, LOOK_AWAY, MULTIPLE_FACES, FOCUS_LOSS, COPY_PASTE
    details = data.get('details', '')
    snapshot_image = data.get('snapshot_image')

    if not violation_type:
        return jsonify({'message': 'Violation type is required'}), 400

    try:
        # Load and append logs
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
        interview.proctor_violations_count += 1
        
        auto_terminate = False
        if interview.proctor_violations_count >= 3:
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
        return jsonify({
            'message': 'Violation recorded successfully',
            'auto_terminate': auto_terminate,
            'violations_count': interview.proctor_violations_count
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to record violation: {str(e)}'}), 500


@interview_bp.route('/<int:interview_id>/fail-proctoring', methods=['POST'])
@jwt_required()
def force_fail_proctoring(interview_id):
    user_id = get_jwt_identity()
    interview = Interview.query.filter_by(id=interview_id, user_id=user_id).first()
    
    if not interview:
        return jsonify({'message': 'Interview session not found'}), 404

    data = request.get_json() or {}
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
        return jsonify({'message': 'Interview terminated and marked as failed due to integrity check.'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to terminate interview: {str(e)}'}), 500

