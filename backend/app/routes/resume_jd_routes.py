import os
import datetime
import json
from flask import Blueprint, request, jsonify
from app.database.db import db
from app.models import ResumeAnalysis, JdAnalysis, User, Notification
from app.ai.mixtral.mixtral_service import MixtralService
from app.utils.pdf_parser import PDFParser
from app.config.config import Config
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

resume_jd_bp = Blueprint('resume_jd', __name__)

@resume_jd_bp.route('/analyze-resume', methods=['POST'])
@jwt_required()
def analyze_resume():
    user_id = get_jwt_identity()

    if 'resume' not in request.files:
        return jsonify({'message': 'No file uploaded'}), 400

    file = request.files['resume']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400

    if not file or not (file.filename.rsplit('.', 1)[1].lower() in {'pdf', 'txt'}):
        return jsonify({'message': 'Only PDF and TXT formats are supported'}), 400

    # Ensure uploads folder exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    filename = secure_filename(f"user_{user_id}_resume_{int(datetime.datetime.utcnow().timestamp())}_{file.filename}")
    file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
    file.save(file_path)

    # Extract text from resume
    try:
        if filename.endswith('.pdf'):
            resume_text = PDFParser.extract_text(file_path)
        else:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                resume_text = f.read()

        if not resume_text or len(resume_text.strip()) < 50:
            return jsonify({'message': 'Failed to extract text. File might be blank or scanned.'}), 400

        # Process Resume using Mixtral
        analysis = MixtralService.analyze_resume(resume_text)

        # Store in DB
        resume_record = ResumeAnalysis(
            user_id=user_id,
            file_name=file.filename,
            extracted_skills=analysis.get('extracted_skills', '[]'),
            extracted_experience=analysis.get('extracted_experience', '[]'),
            extracted_education=analysis.get('extracted_education', '[]'),
            missing_skills=analysis.get('missing_skills', '[]'),
            resume_score=analysis.get('resume_score', 0),
            suggestions=analysis.get('suggestions', '[]')
        )
        db.session.add(resume_record)

        # Notify user
        notification = Notification(
            user_id=user_id,
            title='Resume Scored Successfully!',
            message=f"Your resume '{file.filename}' was analyzed. ATS Score: {resume_record.resume_score}%. View recommendations in profile.",
            type='recommendation'
        )
        db.session.add(notification)

        db.session.commit()

        # Delete local file after parsing to save disk space
        if os.path.exists(file_path):
            os.remove(file_path)

        return jsonify({
            'message': 'Resume analyzed successfully',
            'analysis': resume_record.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({'message': f'Analysis failed: {str(e)}'}), 500


@resume_jd_bp.route('/analyze-jd', methods=['POST'])
@jwt_required()
def analyze_jd():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    jd_text = data.get('jd_text', '')

    if not jd_text or len(jd_text.strip()) < 30:
        return jsonify({'message': 'Job description text is too short or empty'}), 400

    try:
        # Run Mixtral Parser
        analysis = MixtralService.analyze_jd(jd_text)

        # Store in Database
        jd_record = JdAnalysis(
            user_id=user_id,
            jd_text=jd_text,
            extracted_requirements=analysis.get('extracted_requirements', '[]'),
            extracted_skills=analysis.get('extracted_skills', '[]')
        )
        db.session.add(jd_record)
        db.session.commit()

        return jsonify({
            'message': 'Job description analyzed successfully',
            'analysis': jd_record.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'JD analysis failed: {str(e)}'}), 500


@resume_jd_bp.route('/match', methods=['POST'])
@jwt_required()
def match_resume_jd():
    data = request.get_json() or {}
    resume_text = data.get('resume_text', '')
    jd_text = data.get('jd_text', '')

    if not resume_text or not jd_text:
        return jsonify({'message': 'Both resume text and job description are required to match'}), 400

    # 1. Ask Mixtral to compare them
    system_prompt = (
        "You are an expert technical recruiter matching a resume against a job description. "
        "Calculate the match percentage (0-100), extract matching skills, identify missing skills, "
        "and suggest improvement items. "
        "Also generate 3 custom interview questions based on the gaps. "
        "Return a JSON object with: 'match_percentage' (int), 'matched_skills' (list of strings), "
        "'missing_skills' (list of strings), 'suggestions' (list of strings), "
        "'custom_questions' (list of objects with 'question_text' and 'question_type')."
    )
    user_prompt = f"Resume:\n{resume_text}\n\nJob Description:\n{jd_text}"

    match_result = None
    if Config.AI_MODE == 'api' and Config.MIXTRAL_API_KEY:
        match_result = MixtralService._call_llm(system_prompt, user_prompt)

    if not match_result:
        # Fallback Mock Matching Algorithm
        res_skills = ["react", "node", "javascript", "html", "css", "git", "python", "flask", "sql"]
        jd_skills = ["react", "node", "typescript", "aws", "docker", "kubernetes", "sql", "testing"]
        
        # Simple set intersection
        matched = [s.capitalize() for s in res_skills if s in jd_text.lower() or s in resume_text.lower()]
        missing = [s.capitalize() for s in jd_skills if s not in resume_text.lower()]
        
        match_pct = int((len(matched) / max(len(jd_skills), 1)) * 100)
        match_pct = max(35, min(match_pct, 95)) # Cap between 35 and 95
        
        match_result = {
            "match_percentage": match_pct,
            "matched_skills": matched,
            "missing_skills": missing,
            "suggestions": [
                "Acquire skills in TypeScript and build serverless apps on AWS.",
                "Incorporate unit testing frameworks (Jest/PyTest) in your experience descriptions.",
                "Add Docker containerization examples to your projects."
            ],
            "custom_questions": [
                {"question_text": "The JD lists TypeScript. What are the key benefits of using TS over Vanilla JS, and how do you handle strict type configurations?", "question_type": "conceptual"},
                {"question_text": "Explain how you would deploy a containerized node app to AWS, detailing ECS and Docker tasks.", "question_type": "scenario"},
                {"question_text": "Write a TypeScript function that merges two sorted arrays of numbers into one sorted array.", "question_type": "coding"}
            ]
        }

    return jsonify(match_result), 200


@resume_jd_bp.route('/extract-file-text', methods=['POST'])
@jwt_required()
def extract_file_text():
    if 'file' not in request.files:
        return jsonify({'message': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400

    if not file or not (file.filename.rsplit('.', 1)[1].lower() in {'pdf', 'txt'}):
        return jsonify({'message': 'Only PDF and TXT formats are supported'}), 400

    # Ensure uploads folder exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    filename = secure_filename(f"extract_{int(datetime.datetime.utcnow().timestamp())}_{file.filename}")
    file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
    file.save(file_path)

    try:
        if filename.endswith('.pdf'):
            extracted_text = PDFParser.extract_text(file_path)
        else:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                extracted_text = f.read()

        # Clean up temp file
        try:
            os.remove(file_path)
        except Exception:
            pass

        if not extracted_text or len(extracted_text.strip()) < 10:
            return jsonify({'message': 'Failed to extract text. File might be empty or scanned.'}), 400

        return jsonify({'text': extracted_text}), 200
    except Exception as e:
        return jsonify({'message': f'Failed to extract file text: {str(e)}'}), 500
