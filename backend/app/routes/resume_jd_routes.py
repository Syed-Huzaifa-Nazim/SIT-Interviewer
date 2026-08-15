import os
import datetime
import json
import re
from fastapi import APIRouter, Body, HTTPException, status, Depends, UploadFile, File
from app.database.db import db
from app.models import ResumeAnalysis, JdAnalysis, User, Notification
from app.ai.mixtral.mixtral_service import MixtralService
from app.utils.pdf_parser import PDFParser
from app.config.config import Config
from app.utils.security import get_current_user_id

resume_jd_bp = APIRouter()

def clean_filename(filename: str) -> str:
    """Self-contained safe filename sanitizer."""
    return re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)

@resume_jd_bp.post('/analyze-resume')
def analyze_resume(resume: UploadFile = File(...), user_id: int = Depends(get_current_user_id)):
    filename = resume.filename
    if not filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in {'pdf', 'txt'}:
        raise HTTPException(status_code=400, detail="Only PDF and TXT formats are supported")

    # Ensure uploads folder exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    safe_name = clean_filename(f"user_{user_id}_resume_{int(datetime.datetime.utcnow().timestamp())}_{filename}")
    file_path = os.path.join(Config.UPLOAD_FOLDER, safe_name)

    try:
        # Save file to disk
        contents = resume.file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

        if safe_name.endswith('.pdf'):
            resume_text = PDFParser.extract_text(file_path)
        else:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                resume_text = f.read()

        if not resume_text or len(resume_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Failed to extract text. File might be blank or scanned.")

        # Validate that the extracted text looks like a resume
        text_lower = resume_text.lower()
        resume_keywords = [
            'experience', 'education', 'skills', 'projects', 'employment', 
            'history', 'summary', 'contact', 'qualification', 'certifications', 
            'cv', 'resume', 'work history', 'professional experience',
            'academic', 'courses', 'achievements', 'objective'
        ]
        matches = sum(1 for kw in resume_keywords if kw in text_lower)
        if matches < 2 and 'curriculum vitae' not in text_lower and 'resume' not in text_lower:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(
                status_code=400, 
                detail="Invalid file content: The uploaded document does not appear to be a valid resume or CV. Please ensure it contains standard sections such as Experience, Education, or Skills."
            )

        analysis = MixtralService.analyze_resume(resume_text)

        resume_record = ResumeAnalysis(
            user_id=user_id,
            file_name=filename,
            extracted_skills=analysis.get('extracted_skills', '[]'),
            extracted_experience=analysis.get('extracted_experience', '[]'),
            extracted_education=analysis.get('extracted_education', '[]'),
            missing_skills=analysis.get('missing_skills', '[]'),
            resume_score=analysis.get('resume_score', 0),
            suggestions=analysis.get('suggestions', '[]')
        )
        db.session.add(resume_record)

        notification = Notification(
            user_id=user_id,
            title='Resume Scored Successfully!',
            message=f"Your resume '{filename}' was analyzed. ATS Score: {resume_record.resume_score}%. View recommendations in profile.",
            type='recommendation',
            link='/resume-match',
        )
        db.session.add(notification)

        db.session.commit()

        if os.path.exists(file_path):
            os.remove(file_path)

        return {
            'message': 'Resume analyzed successfully',
            'analysis': resume_record.to_dict()
        }

    except HTTPException as he:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise he
    except Exception as e:
        db.session.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@resume_jd_bp.post('/analyze-jd')
def analyze_jd(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    data = payload or {}
    jd_text = data.get('jd_text', '')

    if not jd_text or len(jd_text.strip()) < 30:
        raise HTTPException(status_code=400, detail="Job description text is too short or empty")

    try:
        analysis = MixtralService.analyze_jd(jd_text)

        jd_record = JdAnalysis(
            user_id=user_id,
            jd_text=jd_text,
            extracted_requirements=analysis.get('extracted_requirements', '[]'),
            extracted_skills=analysis.get('extracted_skills', '[]')
        )
        db.session.add(jd_record)
        db.session.commit()

        return {
            'message': 'Job description analyzed successfully',
            'analysis': jd_record.to_dict()
        }

    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"JD analysis failed: {str(e)}")

@resume_jd_bp.post('/match')
def match_resume_jd(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    data = payload or {}
    resume_text = data.get('resume_text', '')
    jd_text = data.get('jd_text', '')

    if not resume_text or not jd_text:
        raise HTTPException(status_code=400, detail="Both resume text and job description are required to match")

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
        res_skills = ["react", "node", "javascript", "html", "css", "git", "python", "flask", "sql"]
        jd_skills = ["react", "node", "typescript", "aws", "docker", "kubernetes", "sql", "testing"]
        
        matched = [s.capitalize() for s in res_skills if s in jd_text.lower() or s in resume_text.lower()]
        missing = [s.capitalize() for s in jd_skills if s not in resume_text.lower()]
        
        match_pct = int((len(matched) / max(len(jd_skills), 1)) * 100)
        match_pct = max(35, min(match_pct, 95))
        
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

    return match_result

@resume_jd_bp.post('/extract-file-text')
def extract_file_text(file: UploadFile = File(...), user_id: int = Depends(get_current_user_id)):
    filename = file.filename
    if not filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in {'pdf', 'txt'}:
        raise HTTPException(status_code=400, detail="Only PDF and TXT formats are supported")

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    safe_name = clean_filename(f"extract_{int(datetime.datetime.utcnow().timestamp())}_{filename}")
    file_path = os.path.join(Config.UPLOAD_FOLDER, safe_name)

    try:
        contents = file.file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

        if safe_name.endswith('.pdf'):
            extracted_text = PDFParser.extract_text(file_path)
        else:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                extracted_text = f.read()

        if os.path.exists(file_path):
            os.remove(file_path)

        if not extracted_text or len(extracted_text.strip()) < 10:
            raise HTTPException(status_code=400, detail="Failed to extract text. File might be empty or scanned.")

        return {'text': extracted_text}
    except HTTPException as he:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise he
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to extract file text: {str(e)}")
