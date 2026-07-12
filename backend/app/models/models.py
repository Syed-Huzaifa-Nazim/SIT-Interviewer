import datetime
import bcrypt
from app.database.db import db

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    country = db.Column(db.String(100), nullable=True)
    experience_level = db.Column(db.String(50), nullable=True)  # Entry, Mid, Senior
    job_role = db.Column(db.String(100), nullable=True)  # React Developer, Python Dev, etc.
    role = db.Column(db.String(20), default='candidate')  # candidate, admin
    status = db.Column(db.String(20), default='active')  # active, banned
    banned_until = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    profile_pic_url = db.Column(db.Text, nullable=True)

    # Relationships
    tokens = db.relationship('Token', backref='user', uselist=False, cascade="all, delete-orphan")
    interviews = db.relationship('Interview', backref='user', lazy=True, cascade="all, delete-orphan")
    resume_analyses = db.relationship('ResumeAnalysis', backref='user', lazy=True, cascade="all, delete-orphan")
    jd_analyses = db.relationship('JdAnalysis', backref='user', lazy=True, cascade="all, delete-orphan")
    notifications = db.relationship('Notification', backref='user', lazy=True, cascade="all, delete-orphan")
    feedbacks = db.relationship('Feedback', backref='user', lazy=True, cascade="all, delete-orphan")

    def set_password(self, password):
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'country': self.country,
            'experience_level': self.experience_level,
            'job_role': self.job_role,
            'role': self.role,
            'status': self.status,
            'profile_pic_url': self.profile_pic_url,
            'banned_until': self.banned_until.isoformat() if self.banned_until else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class Token(db.Model):
    __tablename__ = 'tokens'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False)
    tokens_available = db.Column(db.Integer, default=5)  # Free 5 tokens on signup
    tokens_consumed = db.Column(db.Integer, default=0)
    tokens_purchased = db.Column(db.Integer, default=0)
    last_updated = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'tokens_available': self.tokens_available,
            'tokens_consumed': self.tokens_consumed,
            'tokens_purchased': self.tokens_purchased,
            'last_updated': self.last_updated.isoformat() if self.last_updated else None
        }

class Transaction(db.Model):
    __tablename__ = 'transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    amount = db.Column(db.Float, default=0.0)  # Amount paid for purchase
    tokens_added = db.Column(db.Integer, nullable=False)
    transaction_type = db.Column(db.String(50), nullable=False)  # signup_bonus, purchase, refund, admin_adjustment
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    user = db.relationship('User', backref=db.backref('transactions', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'amount': self.amount,
            'tokens_added': self.tokens_added,
            'transaction_type': self.transaction_type,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Interview(db.Model):
    __tablename__ = 'interviews'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # technical, HR, behavioral, custom
    job_role = db.Column(db.String(100), nullable=False)
    experience_level = db.Column(db.String(50), nullable=False)
    difficulty = db.Column(db.String(50), nullable=False)  # Easy, Medium, Hard
    num_questions = db.Column(db.Integer, default=5)
    status = db.Column(db.String(20), default='pending')  # pending, active, completed
    overall_score = db.Column(db.Float, nullable=True)
    feedback_summary = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    
    # Proctoring Systems Columns
    is_proctor_failed = db.Column(db.Boolean, default=False)
    proctor_violations_count = db.Column(db.Integer, default=0)
    proctor_logs = db.Column(db.Text, default='[]')  # Serialized list of timestamped events

    # Relationships
    questions = db.relationship('InterviewQuestion', backref='interview', lazy=True, cascade="all, delete-orphan")
    responses = db.relationship('InterviewResponse', backref='interview', lazy=True, cascade="all, delete-orphan")
    report = db.relationship('InterviewReport', backref='interview', uselist=False, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'job_role': self.job_role,
            'experience_level': self.experience_level,
            'difficulty': self.difficulty,
            'num_questions': self.num_questions,
            'status': self.status,
            'overall_score': self.overall_score,
            'feedback_summary': self.feedback_summary,
            'is_proctor_failed': self.is_proctor_failed,
            'proctor_violations_count': self.proctor_violations_count,
            'proctor_logs': self.proctor_logs,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class InterviewQuestion(db.Model):
    __tablename__ = 'interview_questions'
    
    id = db.Column(db.Integer, primary_key=True)
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='CASCADE'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(db.String(50), default='conceptual')  # conceptual, scenario, coding, hr, behavioral
    order_num = db.Column(db.Integer, nullable=False)

    responses = db.relationship('InterviewResponse', backref='question', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'interview_id': self.interview_id,
            'question_text': self.question_text,
            'question_type': self.question_type,
            'order_num': self.order_num
        }

class InterviewResponse(db.Model):
    __tablename__ = 'interview_responses'
    
    id = db.Column(db.Integer, primary_key=True)
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='CASCADE'), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('interview_questions.id', ondelete='CASCADE'), nullable=False)
    response_text = db.Column(db.Text, nullable=True)  # Answer transcribed or typed
    audio_path = db.Column(db.String(255), nullable=True)
    duration = db.Column(db.Integer, nullable=True)  # Duration in seconds
    score = db.Column(db.Float, nullable=True)
    technical_score = db.Column(db.Float, nullable=True)
    communication_score = db.Column(db.Float, nullable=True)
    confidence_score = db.Column(db.Float, nullable=True)
    feedback = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'interview_id': self.interview_id,
            'question_id': self.question_id,
            'response_text': self.response_text,
            'audio_path': self.audio_path,
            'duration': self.duration,
            'score': self.score,
            'technical_score': self.technical_score,
            'communication_score': self.communication_score,
            'confidence_score': self.confidence_score,
            'feedback': self.feedback,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class InterviewReport(db.Model):
    __tablename__ = 'interview_reports'
    
    id = db.Column(db.Integer, primary_key=True)
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='CASCADE'), unique=True, nullable=False)
    overall_score = db.Column(db.Float, nullable=False)
    technical_score = db.Column(db.Float, nullable=False)
    communication_score = db.Column(db.Float, nullable=False)
    confidence_score = db.Column(db.Float, nullable=False)
    problem_solving_score = db.Column(db.Float, nullable=False)
    strengths = db.Column(db.Text, nullable=True)  # JSON or text list
    weaknesses = db.Column(db.Text, nullable=True)  # JSON or text list
    missing_concepts = db.Column(db.Text, nullable=True)
    recommendations = db.Column(db.Text, nullable=True)
    report_pdf_path = db.Column(db.String(255), nullable=True)
    snapshot_image = db.Column(db.Text, nullable=True)  # Base64 data string
    snapshot_description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'interview_id': self.interview_id,
            'overall_score': self.overall_score,
            'technical_score': self.technical_score,
            'communication_score': self.communication_score,
            'confidence_score': self.confidence_score,
            'problem_solving_score': self.problem_solving_score,
            'strengths': self.strengths,
            'weaknesses': self.weaknesses,
            'missing_concepts': self.missing_concepts,
            'recommendations': self.recommendations,
            'report_pdf_path': self.report_pdf_path,
            'snapshot_image': self.snapshot_image,
            'snapshot_description': self.snapshot_description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class ResumeAnalysis(db.Model):
    __tablename__ = 'resume_analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    file_name = db.Column(db.String(150), nullable=False)
    extracted_skills = db.Column(db.Text, nullable=True)  # Comma separated or JSON
    extracted_experience = db.Column(db.Text, nullable=True)
    extracted_education = db.Column(db.Text, nullable=True)
    missing_skills = db.Column(db.Text, nullable=True)
    resume_score = db.Column(db.Integer, default=0)
    suggestions = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'file_name': self.file_name,
            'extracted_skills': self.extracted_skills,
            'extracted_experience': self.extracted_experience,
            'extracted_education': self.extracted_education,
            'missing_skills': self.missing_skills,
            'resume_score': self.resume_score,
            'suggestions': self.suggestions,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class JdAnalysis(db.Model):
    __tablename__ = 'jd_analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    jd_text = db.Column(db.Text, nullable=False)
    extracted_requirements = db.Column(db.Text, nullable=True)
    extracted_skills = db.Column(db.Text, nullable=True)
    missing_skills = db.Column(db.Text, nullable=True)
    match_percentage = db.Column(db.Integer, default=0)
    custom_questions = db.Column(db.Text, nullable=True)  # JSON representation of generated questions
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'jd_text': self.jd_text,
            'extracted_requirements': self.extracted_requirements,
            'extracted_skills': self.extracted_skills,
            'missing_skills': self.missing_skills,
            'match_percentage': self.match_percentage,
            'custom_questions': self.custom_questions,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Notification(db.Model):
    __tablename__ = 'notifications'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(50), default='activity')  # interview, token, activity, recommendation
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Feedback(db.Model):
    __tablename__ = 'feedbacks'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='SET NULL'), nullable=True)
    rating = db.Column(db.Integer, nullable=False)  # 1 to 5
    feedback_text = db.Column(db.Text, nullable=True)
    issues_reported = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'interview_id': self.interview_id,
            'rating': self.rating,
            'feedback_text': self.feedback_text,
            'issues_reported': self.issues_reported,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class CodeSubmission(db.Model):
    __tablename__ = 'code_submissions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    # Optional link to an interview once the sandbox is embedded in the live flow (§3.5).
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='SET NULL'), nullable=True)
    problem_id = db.Column(db.String(100), nullable=False)
    language = db.Column(db.String(30), nullable=False)
    code = db.Column(db.Text, nullable=True)
    passed = db.Column(db.Integer, default=0)
    total = db.Column(db.Integer, default=0)
    score = db.Column(db.Float, default=0.0)
    results = db.Column(db.Text, nullable=True)  # JSON: per-test-case pass/fail + timing
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'interview_id': self.interview_id,
            'problem_id': self.problem_id,
            'language': self.language,
            'code': self.code,
            'passed': self.passed,
            'total': self.total,
            'score': self.score,
            'results': self.results,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class AdminLog(db.Model):
    __tablename__ = 'admin_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    admin = db.relationship('User', foreign_keys=[admin_id])

    def to_dict(self):
        return {
            'id': self.id,
            'admin_id': self.admin_id,
            'action': self.action,
            'details': self.details,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
