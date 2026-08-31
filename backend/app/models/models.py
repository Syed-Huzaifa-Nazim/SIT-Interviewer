import datetime
import json
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

    # Candidate classification (CNIC-based signup). Nullable so pre-existing accounts
    # and the seeded admin remain valid.
    cnic = db.Column(db.String(20), unique=True, nullable=True)  # formatted 12345-1234567-1
    course_category = db.Column(db.String(80), nullable=True)
    course_status = db.Column(db.String(20), nullable=True)  # ongoing, completed
    # not_interviewed, invited, interview_completed, reinterview_pending,
    # reinterview_approved, reinterview_rejected
    interview_status = db.Column(db.String(40), default='not_interviewed')

    # One-time-password login (completed-course candidates)
    must_use_otp = db.Column(db.Boolean, default=False)
    otp_hash = db.Column(db.String(128), nullable=True)
    otp_used = db.Column(db.Boolean, default=False)
    otp_issued_at = db.Column(db.DateTime, nullable=True)
    # Deadline after which the OTP stops working, set from the per-row "Deadline" chosen in
    # the Bulk Email Module. Deliberately nullable and NULL by default: an OTP with no expiry
    # behaves exactly as it always has, so organic signups, instructor signups, re-interview
    # approvals and individual admin invites are completely unaffected by this column.
    otp_expires_at = db.Column(db.DateTime, nullable=True)

    # Password-reset code. Deliberately SEPARATE from the otp_* columns above: those are
    # the one-time interview credential, and letting a public "forgot password" flow write
    # to them would let anyone who knows a CNIC re-arm or consume a candidate's interview
    # login. Nothing here ever touches the interview OTP.
    reset_otp_hash = db.Column(db.String(128), nullable=True)
    reset_otp_expires_at = db.Column(db.DateTime, nullable=True)

    # Second factor for the super admin sign-in. A THIRD set of OTP columns, deliberately
    # kept apart from otp_* (the one-time interview credential) and reset_otp_* (forgot
    # password) for the same reason those two are apart: they are consumed by different
    # flows with different lifetimes, and sharing one pair would let one flow arm, expire or
    # burn another's code. That is not hypothetical — the interview OTP is single-use, and a
    # login code written over it would silently cost a candidate their one attempt.
    login_otp_hash = db.Column(db.String(128), nullable=True)
    login_otp_expires_at = db.Column(db.DateTime, nullable=True)

    # Single-use codes that stand in for the emailed one. Not a nicety: the second factor is
    # delivered by email, and this system's own email_logs record real delivery failures
    # ("Network is unreachable"). Without these, one bad SMTP day means nobody can administer
    # the platform at all. Stored as a JSON list of bcrypt hashes; a used code is removed.
    recovery_codes = db.Column(db.Text, nullable=True)

    # Set on an account whose password was generated for it. Until it is cleared, the admin
    # surface refuses this account everything except changing that password — an emailed
    # credential that is never replaced is a shared secret sitting in an inbox.
    must_change_password = db.Column(db.Boolean, default=False)

    # Any access token issued before this moment is rejected (forced logout).
    session_revoked_at = db.Column(db.DateTime, nullable=True)

    # Presence heartbeat for the admin online/offline indicator
    last_seen_at = db.Column(db.DateTime, nullable=True)

    # Post-interview admin email actions (Update §5): timestamps power the visible
    # "sent on <date>" audit trail on the candidate/instructor profile.
    clearance_email_sent_at = db.Column(db.DateTime, nullable=True)
    hr_invite_sent_at = db.Column(db.DateTime, nullable=True)

    # Free-form notes an admin writes about a candidate (e.g. after reviewing their
    # proctoring snapshot / interview). Admin-only; never exposed to the candidate.
    admin_remarks = db.Column(db.Text, nullable=True)

    # Which company this row belongs to. For a CANDIDATE it is the company whose admin
    # invited them, and it is what every /api/admin/* query is scoped by. For an ADMIN it is
    # unused — an admin can hold several companies, so those live in
    # admin_company_assignments instead.
    #
    # Deliberately nullable, and NULL for every account that existed before multi-admin.
    # Those rows are visible to the super admin only: showing an unassigned candidate to
    # every admin would defeat the whole point of scoping, and guessing an owner for them
    # would be worse than leaving them parked.
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True)

    # Where mail to this person should actually go, when that is not `email`.
    #
    # `email` is the LOGIN identity: admin accounts are created with a generated address on
    # our own domain, which nobody reads. Without somewhere to put the human's real address
    # there is no way to send them their credentials. NULL means email is also the contact
    # address, which is the case for every candidate.
    contact_email = db.Column(db.String(120), nullable=True)

    # Set when the account was created by the Bulk Email Module rather than by someone
    # signing up themselves. NULL means an organic signup, which is what separates the
    # "Enrolled Users" and "Bulk Invited Users" tabs in Manage Users.
    bulk_batch_id = db.Column(db.Integer, db.ForeignKey('bulk_email_batches.id', ondelete='SET NULL'), nullable=True)

    # Question Difficulty Range (Difficulty Range feature): one of
    # app.utils.difficulty.DIFFICULTY_RANGES's keys ('EASY_TO_MEDIUM', 'MEDIUM_TO_HARD',
    # 'EASY_TO_HARD'), set by whoever invites this candidate (admin single-invite, Bulk
    # Email Module, or an API key). Read at `/interviews/start` to override the difficulty
    # the candidate would otherwise be able to choose themselves.
    #
    # Deliberately nullable and NULL by default: every account that existed before this
    # feature, and every invite that doesn't set one, keeps today's behavior exactly —
    # `/interviews/start` falls back to whatever difficulty the client sends, same as always.
    question_difficulty_range = db.Column(db.String(20), nullable=True)

    # Relationships
    tokens = db.relationship('Token', backref='user', uselist=False, cascade="all, delete-orphan")
    interviews = db.relationship('Interview', backref='user', lazy=True, cascade="all, delete-orphan")
    # foreign_keys is required here, not optional tidiness: resume_analyses carries a second
    # FK back to users (flagged_by, the admin who flagged a bad parse), so without naming the
    # owning column SQLAlchemy cannot tell which one this relationship traverses and refuses
    # to map at all — it is an AmbiguousForeignKeysError on the very first query, not a
    # subtle mis-join.
    resume_analyses = db.relationship(
        'ResumeAnalysis',
        backref='user',
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys='ResumeAnalysis.user_id',
    )
    jd_analyses = db.relationship('JdAnalysis', backref='user', lazy=True, cascade="all, delete-orphan")
    notifications = db.relationship('Notification', backref='user', lazy=True, cascade="all, delete-orphan")
    feedbacks = db.relationship('Feedback', backref='user', lazy=True, cascade="all, delete-orphan")

    def set_password(self, password):
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def set_otp(self, otp):
        salt = bcrypt.gensalt()
        self.otp_hash = bcrypt.hashpw(otp.encode('utf-8'), salt).decode('utf-8')
        self.otp_issued_at = datetime.datetime.utcnow()
        self.otp_used = False

    def check_otp(self, otp):
        if not self.otp_hash:
            return False
        return bcrypt.checkpw(otp.encode('utf-8'), self.otp_hash.encode('utf-8'))

    def set_reset_otp(self, otp, ttl_minutes=15):
        salt = bcrypt.gensalt()
        self.reset_otp_hash = bcrypt.hashpw(otp.encode('utf-8'), salt).decode('utf-8')
        self.reset_otp_expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=ttl_minutes)

    def check_reset_otp(self, otp):
        """True only for a code that is set, unexpired, and matches. Single use is enforced
        by the caller clearing the code once the reset succeeds."""
        if not self.reset_otp_hash or not self.reset_otp_expires_at:
            return False
        if datetime.datetime.utcnow() > self.reset_otp_expires_at:
            return False
        return bcrypt.checkpw(otp.encode('utf-8'), self.reset_otp_hash.encode('utf-8'))

    def clear_reset_otp(self):
        self.reset_otp_hash = None
        self.reset_otp_expires_at = None

    def set_login_otp(self, otp, ttl_minutes=10):
        """Arm the sign-in second factor. Shorter-lived than the reset code: it is used
        seconds after it arrives, in a window the person is actively sitting in."""
        salt = bcrypt.gensalt()
        self.login_otp_hash = bcrypt.hashpw(otp.encode('utf-8'), salt).decode('utf-8')
        self.login_otp_expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=ttl_minutes)

    def check_login_otp(self, otp):
        """True only for a code that is set, unexpired, and matches."""
        if not self.login_otp_hash or not self.login_otp_expires_at:
            return False
        if datetime.datetime.utcnow() > self.login_otp_expires_at:
            return False
        return bcrypt.checkpw(otp.encode('utf-8'), self.login_otp_hash.encode('utf-8'))

    def clear_login_otp(self):
        self.login_otp_hash = None
        self.login_otp_expires_at = None

    def set_recovery_codes(self, codes):
        """Replace the recovery set. The PLAINTEXT codes stay the caller's to show once and
        then forget — only hashes are stored here, so a lost set cannot be recovered, only
        regenerated."""
        self.recovery_codes = json.dumps([
            bcrypt.hashpw(c.encode('utf-8'), bcrypt.gensalt()).decode('utf-8') for c in codes
        ])

    def recovery_codes_remaining(self):
        if not self.recovery_codes:
            return 0
        try:
            return len(json.loads(self.recovery_codes))
        except (ValueError, TypeError):
            return 0

    def consume_recovery_code(self, code):
        """Spend one recovery code. True if it matched, and it never matches twice.

        The caller must commit: a code that verifies but is not removed is a reusable
        password, which is the one thing a single-use code exists not to be.
        """
        if not self.recovery_codes or not code:
            return False
        try:
            hashes = json.loads(self.recovery_codes)
        except (ValueError, TypeError):
            # A corrupted blob must fail closed rather than raise inside a login.
            return False

        # Normalised the same way they are shown: printed in dashed groups, typed back in
        # whatever case and spacing the person manages.
        candidate = code.strip().replace('-', '').replace(' ', '').upper()
        for stored in list(hashes):
            try:
                if bcrypt.checkpw(candidate.encode('utf-8'), stored.encode('utf-8')):
                    hashes.remove(stored)
                    self.recovery_codes = json.dumps(hashes)
                    return True
            except (ValueError, TypeError):
                continue
        return False

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
            'cnic': self.cnic,
            'course_category': self.course_category,
            'course_status': self.course_status,
            'interview_status': self.interview_status or 'not_interviewed',
            'must_use_otp': bool(self.must_use_otp),
            'otp_used': bool(self.otp_used),
            'otp_expires_at': self.otp_expires_at.isoformat() if self.otp_expires_at else None,
            'company_id': self.company_id,
            'contact_email': self.contact_email,
            'must_change_password': bool(self.must_change_password),
            # Count only — the hashes never leave the server, and the plaintext codes exist
            # only in the one response that issued them.
            'recovery_codes_remaining': self.recovery_codes_remaining(),
            'bulk_batch_id': self.bulk_batch_id,
            'question_difficulty_range': self.question_difficulty_range,
            'last_seen_at': self.last_seen_at.isoformat() if self.last_seen_at else None,
            'clearance_email_sent_at': self.clearance_email_sent_at.isoformat() if self.clearance_email_sent_at else None,
            'hr_invite_sent_at': self.hr_invite_sent_at.isoformat() if self.hr_invite_sent_at else None,
            'admin_remarks': self.admin_remarks,
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

    # Why an interview ended, when not a normal completion (Timer feature §2.2):
    # e.g. 'time_expired'. NULL for normally-completed / proctor-failed sessions.
    terminated_reason = db.Column(db.String(40), nullable=True)

    # Background scoring state (Perf §1): answer scoring + report generation run
    # asynchronously so the candidate advances instantly. 'pending' while any answer is
    # still being scored / the report isn't generated, 'complete' once the report exists,
    # 'failed' if finalization gave up. Also used as an atomic single-winner claim so only
    # one background thread generates the final report. NULL on legacy rows (treated as
    # already-complete for old finished interviews).
    scoring_status = db.Column(db.String(20), default='pending')

    # Base64 webcam frame captured by the client on the final answer submission. Held here
    # because the report is generated later on a background thread; _finalize_report_if_ready
    # moves it onto InterviewReport.snapshot_image when it builds the report.
    completion_snapshot = db.Column(db.Text, nullable=True)

    # Full-session video recording (DB Integration §2): supabase://bucket/path reference
    # into the PRIVATE interview-recordings bucket. NULL = no recording exists (e.g. the
    # upload failed after retries), so the admin UI never implies a recording it can't play.
    video_path = db.Column(db.String(255), nullable=True)

    # Bookmark into video_path (not a separate file/recording): seconds-from-start of the
    # welcome/rules screen the candidate saw before Question 1, so the admin player can jump
    # straight to it instead of scrubbing the whole session. NULL if the candidate opened on
    # the sandbox-first flow's coding question (no intro screen) or the marker never landed.
    intro_video_start_seconds = db.Column(db.Float, nullable=True)
    intro_video_end_seconds = db.Column(db.Float, nullable=True)

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
            'terminated_reason': self.terminated_reason,
            'scoring_status': self.scoring_status,
            'has_video': bool(self.video_path),
            'intro_video_start_seconds': self.intro_video_start_seconds,
            'intro_video_end_seconds': self.intro_video_end_seconds,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class InterviewQuestion(db.Model):
    __tablename__ = 'interview_questions'
    
    id = db.Column(db.Integer, primary_key=True)
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='CASCADE'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    # conceptual, scenario, coding, hr, behavioral, plus the four coding formats:
    # coding_scenario, coding_logic, coding_concept, coding_debug (Coding Formats §2.2)
    question_type = db.Column(db.String(50), default='conceptual')
    # Code shown alongside the question (Format 4 / debugging questions). Kept separate
    # from question_text so it renders as a monospace block and is NEVER read aloud by the
    # question read-aloud voice.
    code_snippet = db.Column(db.Text, nullable=True)
    # Set only on a 'coding_sandbox' question: the coding-sandbox problem the candidate must
    # solve in the live editor. Everything needed to render and grade it is looked up from
    # the problem bank by this id, so no question content is duplicated into the DB.
    sandbox_problem_id = db.Column(db.String(100), nullable=True)
    # Set only on a 'mcq' question (§ MCQ round). mcq_options is a JSON-encoded list of 4
    # option strings; mcq_correct_index (0-3) is the answer key and is NEVER included in
    # to_dict() below — it must never reach the candidate-facing API response.
    mcq_options = db.Column(db.Text, nullable=True)
    mcq_correct_index = db.Column(db.Integer, nullable=True)
    # Resume-to-question traceability (Resume §4.2). Set only on questions generated from a
    # candidate's resume: the skill or project the question was built from, verbatim from the
    # extracted resume data. Lets an admin see at a glance whether the generator is really
    # working off the CV or inventing a connection to it — a failure mode that only exists
    # for this category, since every other category's questions come from a fixed domain.
    derived_from = db.Column(db.String(255), nullable=True)
    order_num = db.Column(db.Integer, nullable=False)

    # Per-question timer (§2). ``time_limit_seconds`` is set at creation from the
    # question type; ``started_at`` is anchored server-side the first time the question
    # is presented, so the countdown is authoritative and survives a page reload.
    time_limit_seconds = db.Column(db.Integer, default=120)
    started_at = db.Column(db.DateTime, nullable=True)

    responses = db.relationship('InterviewResponse', backref='question', lazy=True, cascade="all, delete-orphan")

    def remaining_seconds(self):
        """Server-authoritative time left for this question, or the full limit if it
        hasn't been started yet. Never negative."""
        limit = self.time_limit_seconds or 120
        if not self.started_at:
            return limit
        elapsed = (datetime.datetime.utcnow() - self.started_at).total_seconds()
        return max(0, int(round(limit - elapsed)))

    def to_dict(self):
        # mcq_correct_index is deliberately excluded — it is the answer key and must never
        # reach the candidate-facing API response.
        mcq_options = None
        if self.mcq_options:
            try:
                mcq_options = json.loads(self.mcq_options)
            except Exception:
                mcq_options = None
        return {
            'id': self.id,
            'interview_id': self.interview_id,
            'question_text': self.question_text,
            'question_type': self.question_type,
            'code_snippet': self.code_snippet,
            'sandbox_problem_id': self.sandbox_problem_id,
            'mcq_options': mcq_options,
            'derived_from': self.derived_from,
            'order_num': self.order_num,
            'time_limit_seconds': self.time_limit_seconds or 120,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'remaining_seconds': self.remaining_seconds()
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
    # Background scoring state (Perf §1): 'pending' the instant the answer is saved (the
    # candidate has already advanced), 'scored' once the LLM evaluation lands, 'failed' if
    # scoring gave up (feedback is flagged for manual review in that case). Defaults to
    # 'scored' so legacy rows written by the old synchronous path read as complete.
    scoring_status = db.Column(db.String(20), default='scored')
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
            'scoring_status': self.scoring_status,
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

    # --- Resume-Based Interview additions (Resume §2/§4) ---
    # The Resume & JD Analyzer deletes the uploaded file straight after parsing it and keeps
    # only the extracted lists, which is right for that feature. The Resume-Based Interview
    # category needs more: the raw text is what the question generator is prompted with, and
    # it is also what an admin reads when checking whether the generated questions actually
    # match the CV. Stored as text rather than the original PDF — no file is retained.
    raw_text = db.Column(db.Text, nullable=True)
    # Projects called out separately from extracted_experience: questions are supposed to ask
    # about specific things the candidate built, and those were previously blended into the
    # experience bullets with no way to address them individually.
    extracted_projects = db.Column(db.Text, nullable=True)

    # Resume-analysis quality flagging (Resume §4.2): an admin marks a parse as poor (garbled
    # PDF text, skills missed) so bad extractions are visible instead of silently producing
    # irrelevant questions. Purely an operational signal — nothing branches on it.
    flagged_at = db.Column(db.DateTime, nullable=True)
    flagged_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    flag_reason = db.Column(db.String(500), nullable=True)

    def to_dict(self, include_raw_text=False):
        # raw_text is opt-in: it is the full CV and only the owning admin view needs it, so it
        # stays out of the default payload rather than riding along on every response.
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'file_name': self.file_name,
            'extracted_skills': self.extracted_skills,
            'extracted_experience': self.extracted_experience,
            'extracted_education': self.extracted_education,
            'extracted_projects': self.extracted_projects,
            'missing_skills': self.missing_skills,
            'resume_score': self.resume_score,
            'suggestions': self.suggestions,
            'flagged_at': self.flagged_at.isoformat() if self.flagged_at else None,
            'flagged_by': self.flagged_by,
            'flag_reason': self.flag_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_raw_text:
            data['raw_text'] = self.raw_text
        return data

class PendingResume(db.Model):
    """A resume parsed BEFORE its owner has an account (Resume §1.1).

    The Resume-Based signup collects the CV on the enrolment form itself, so the parse has to
    run while the candidate is still anonymous — there is no user row to hang a
    ResumeAnalysis off yet, and ResumeAnalysis.user_id is deliberately NOT NULL. This table
    holds the parsed result against a single-use random token for the few minutes between the
    upload call and /register, which copies it into a real ResumeAnalysis and deletes the row.

    Nothing here is read once the account exists. Rows are consumed on claim, and any that are
    abandoned (candidate uploads, then never finishes signing up) are swept on the next
    upload, so the table does not accumulate unclaimed CVs.
    """
    __tablename__ = 'pending_resumes'

    id = db.Column(db.Integer, primary_key=True)
    # Random and unguessable — the only thing the client holds between the two calls, and the
    # sole authority for claiming this row, since there is no session to scope it to.
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    # Captured at upload time and re-checked at claim time: the token alone must not let a
    # resume be attached to a different signup than the one that uploaded it.
    cnic = db.Column(db.String(20), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    file_name = db.Column(db.String(150), nullable=False)

    raw_text = db.Column(db.Text, nullable=True)
    extracted_skills = db.Column(db.Text, nullable=True)
    extracted_experience = db.Column(db.Text, nullable=True)
    extracted_education = db.Column(db.Text, nullable=True)
    extracted_projects = db.Column(db.Text, nullable=True)
    missing_skills = db.Column(db.Text, nullable=True)
    resume_score = db.Column(db.Integer, default=0)
    suggestions = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)

    def is_expired(self):
        return bool(self.expires_at and datetime.datetime.utcnow() > self.expires_at)

    def to_preview(self):
        """What the enrolment form is allowed to see back — enough to show the candidate the
        upload worked and what was picked up, without echoing the whole CV."""
        return {
            'resume_token': self.token,
            'file_name': self.file_name,
            'extracted_skills': self.extracted_skills,
            'extracted_projects': self.extracted_projects,
            'resume_score': self.resume_score,
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

    # Where clicking this notification should take the candidate — an in-app route path such
    # as '/interview/report/42'. Set at creation wherever a specific destination exists, so
    # "Interview Evaluation Ready!" opens that exact report rather than a list the candidate
    # then has to search. Deliberately nullable: notifications that are purely informational
    # have nowhere better to go, and every row written before this column existed has none,
    # so the frontend falls back to a route derived from `type` (see NOTIFICATION_ROUTES).
    #
    # Stored as a path, never a full URL — it is fed straight into the router, and accepting
    # an absolute URL here would turn any write to this column into an open-redirect.
    link = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'is_read': self.is_read,
            'link': self.link,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Feedback(db.Model):
    __tablename__ = 'feedbacks'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='SET NULL'), nullable=True)
    rating = db.Column(db.Integer, nullable=False)  # 1 to 5, overall
    feedback_text = db.Column(db.Text, nullable=True)
    issues_reported = db.Column(db.Text, nullable=True)

    # Per-category ratings as a JSON object of {category_key: 1-5}, e.g.
    # {"questions": 4, "ai_interviewer": 5, "audio_video": 3}. Stored as JSON in one column
    # rather than six columns or a child table: the set of categories is presentation, not
    # data the database ever queries or joins on, and adding or renaming one should not need
    # a migration. A candidate may rate any subset, so a missing key means "not answered"
    # and is distinct from a low score. NULL for every feedback submitted before categories
    # existed, and for the report-page form which still asks a single overall question.
    category_ratings = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        import json as _json
        try:
            categories = _json.loads(self.category_ratings) if self.category_ratings else {}
        except Exception:
            # A malformed blob must not take down the whole admin feedback list.
            categories = {}
        return {
            'id': self.id,
            'user_id': self.user_id,
            'interview_id': self.interview_id,
            'rating': self.rating,
            'feedback_text': self.feedback_text,
            'issues_reported': self.issues_reported,
            'category_ratings': categories,
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

class SecondInterviewRequest(db.Model):
    """A completed-course candidate re-signing up with an already-interviewed CNIC.

    The admin approves (issues a fresh one-time password) or rejects (sends the
    ineligibility email) from the Admin Hub approval queue (§3.4/§4.3).
    """
    __tablename__ = 'second_interview_requests'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    cnic = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False)   # as submitted on the re-signup form
    email = db.Column(db.String(120), nullable=False)  # as submitted on the re-signup form
    first_interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='SET NULL'), nullable=True)
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    requested_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    decided_at = db.Column(db.DateTime, nullable=True)
    decided_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    user = db.relationship('User', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'cnic': self.cnic,
            'name': self.name,
            'email': self.email,
            'first_interview_id': self.first_interview_id,
            'status': self.status,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            'decided_at': self.decided_at.isoformat() if self.decided_at else None,
            'decided_by': self.decided_by
        }

class EmailLog(db.Model):
    """Delivery record for every outbound email so failures surface to the admin
    instead of failing silently (§1)."""
    __tablename__ = 'email_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    to_email = db.Column(db.String(120), nullable=False)
    email_type = db.Column(db.String(50), nullable=False)  # ongoing_signup, completed_signup, reinterview_approved, ...
    subject = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default='sent')  # sent, failed
    error = db.Column(db.Text, nullable=True)
    attempts = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'to_email': self.to_email,
            'email_type': self.email_type,
            'subject': self.subject,
            'status': self.status,
            'error': self.error,
            'attempts': self.attempts,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class RecordingLog(db.Model):
    """Lifecycle record for every interview recording (per-answer audio + full-session
    video), so the admin can audit when a recording was created, when it was auto-deleted,
    and — mirroring EmailLog's failure auditing — when an upload attempt FAILED. Previously
    failed uploads left no trace anywhere (a session-video upload could fail silently with
    nothing queryable to explain why); a 'failed' row now records the reason. Deletion
    stamps ``deleted_at``/``status`` here rather than removing the row, so the audit trail
    survives the file."""
    __tablename__ = 'recording_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Denormalized so the log stays readable even after the candidate is deleted.
    candidate_email = db.Column(db.String(120), nullable=True)
    interview_id = db.Column(db.Integer, nullable=True)
    question_id = db.Column(db.Integer, nullable=True)
    # Where the recording lives: a 'supabase://bucket/path' ref or a local upload path.
    # NULL for a 'failed' row — the upload never produced a stored object.
    storage_ref = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='active')  # active, deleted, failed
    # Failure reason (only set when status='failed'), e.g. "Supabase Storage upload failed
    # after retries" or "Empty video payload".
    error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    deleted_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'candidate_email': self.candidate_email,
            'interview_id': self.interview_id,
            'question_id': self.question_id,
            'storage_ref': self.storage_ref,
            'status': self.status,
            'error': self.error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }


class ProctorSnapshot(db.Model):
    """Archive of proctoring images captured during a proctored interview — both the
    candidate's webcam frame at the moment of a termination and periodic/suspicious
    screenshots of their actual computer screen. Each image is stored as a file in a
    PRIVATE Supabase bucket under a ``user_<id>/<date>/`` folder tree, not inline in the
    DB; this row is the index the admin browses, holding only the storage reference."""
    __tablename__ = 'proctor_snapshots'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Denormalized so the archive stays readable even after the candidate is deleted.
    candidate_email = db.Column(db.String(120), nullable=True)
    # ON DELETE SET NULL (not CASCADE): delete_user()/delete_interview() in admin_routes.py
    # already hand-delete these rows and their storage files explicitly, so this FK is a
    # referential-integrity safety net, not a new delete path.
    interview_id = db.Column(db.Integer, db.ForeignKey('interviews.id', ondelete='SET NULL'), nullable=True)
    interview = db.relationship('Interview', backref=db.backref('proctor_snapshots', lazy='dynamic'))
    # 'termination' = webcam frame at auto-termination; 'screen' = a monitored screenshot.
    kind = db.Column(db.String(20), default='termination')
    # Short human label, e.g. the violation reason or 'periodic'.
    label = db.Column(db.String(255), nullable=True)
    # 'supabase://bucket/user_<id>/<date>/<file>' reference to the stored image.
    storage_ref = db.Column(db.Text, nullable=True)
    captured_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'candidate_email': self.candidate_email,
            'interview_id': self.interview_id,
            'kind': self.kind,
            'label': self.label,
            'storage_ref': self.storage_ref,
            'captured_at': self.captured_at.isoformat() if self.captured_at else None
        }


class AdminLog(db.Model):
    __tablename__ = 'admin_logs'

    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    details = db.Column(db.Text, nullable=True)
    # Role the actor held AT THE TIME of the action. Reading it back off the user row would
    # be wrong: roles change, and an audit trail that says a super admin did something
    # because they were promoted afterwards is not an audit trail. NULL on every pre-existing
    # row, which is simply "unknown, predates this column".
    actor_role = db.Column(db.String(20), nullable=True)
    # Which API key performed this, when one did. A real column rather than something to be
    # read back out of `details`: that text is written for humans, and a filter that pattern
    # matches it breaks silently the day somebody rewords a message — returning nothing,
    # which looks exactly like "this key has done nothing".
    api_key_id = db.Column(db.Integer, db.ForeignKey('api_keys.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    admin = db.relationship('User', foreign_keys=[admin_id])

    def to_dict(self):
        return {
            'id': self.id,
            'admin_id': self.admin_id,
            'action': self.action,
            'details': self.details,
            'actor_role': self.actor_role,
            'api_key_id': self.api_key_id,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class BulkEmailBatch(db.Model):
    """One run of the Bulk Email Module: who triggered it, from what file, and how it went.

    Serves two purposes at once — it is the audit trail for a batch of invitations, and it
    is what the "Bulk Invited Users" tab filters on (via ``User.bulk_batch_id``). Rows are
    written before sending starts so the admin can poll this record for live progress.
    """
    __tablename__ = 'bulk_email_batches'

    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    # Set when an API key triggered this batch rather than an admin in the Admin Hub.
    # admin_id is still populated in that case (the key's creator), so nothing that already
    # reads admin_id breaks — this only adds the ability to tell the two apart, the same
    # distinction AdminLog.api_key_id draws for the audit trail.
    api_key_id = db.Column(db.Integer, db.ForeignKey('api_keys.id', ondelete='SET NULL'), nullable=True)
    # The company every account in this batch is created under. Stored on the batch rather
    # than passed through the row payload because the background worker creates the accounts
    # minutes later on another thread, and the batch row is the only thing it still has.
    # NULL on batches that predate multi-admin.
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True)
    file_name = db.Column(db.String(255), nullable=True)
    subject = db.Column(db.String(255), nullable=False)
    personalize = db.Column(db.Boolean, default=False)

    # Admin-chosen label for the group this batch created, e.g. "Spring 2026 Intake" — what
    # the Bulk Invited tab shows as a filter chip. Distinct from `subject`, which is the
    # email's own subject line: that is written for the candidate reading the invitation,
    # not for the admin picking a cohort out of a list months later, and two intakes sent
    # with the same template were previously indistinguishable in Batch History.
    # Nullable, so every batch sent before this existed (and any sent without a name) stays
    # valid and simply falls back to its subject for display.
    batch_name = db.Column(db.String(120), nullable=True)

    # pending → sending → complete. 'complete' covers partial success too; the counts below
    # say what actually happened, so a single failed recipient never marks the batch failed.
    status = db.Column(db.String(20), default='pending')
    total_count = db.Column(db.Integer, default=0)
    sent_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)
    # JSON list of {row, email, error} for whichever recipients did not go out, so the admin
    # can see exactly which ones to correct and retry rather than re-sending the whole batch.
    failures = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    admin = db.relationship('User', foreign_keys=[admin_id])
    # Explicit foreign_keys: User points back here via bulk_batch_id while this table points
    # at users via admin_id, so SQLAlchemy cannot infer the join on its own.
    recipients = db.relationship(
        'User', foreign_keys='User.bulk_batch_id', backref='bulk_batch', lazy='dynamic'
    )

    def to_dict(self):
        import json as _json
        try:
            failures = _json.loads(self.failures) if self.failures else []
        except Exception:
            failures = []
        return {
            'id': self.id,
            'admin_id': self.admin_id,
            'admin_name': self.admin.name if self.admin else None,
            'api_key_id': self.api_key_id,
            'company_id': self.company_id,
            'file_name': self.file_name,
            'subject': self.subject,
            'batch_name': self.batch_name,
            # What to render wherever a batch needs a human label. Falls back to the subject
            # so pre-existing unnamed batches still read sensibly instead of showing blank.
            'display_name': self.batch_name or self.subject,
            'personalize': bool(self.personalize),
            'status': self.status,
            'total_count': self.total_count or 0,
            'sent_count': self.sent_count or 0,
            'failed_count': self.failed_count or 0,
            'failures': failures,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }


class Company(db.Model):
    """A tenant. Every candidate belongs to at most one; every admin is granted one or more.

    This is the unit that /api/admin/* is scoped by, so it is the whole reason a second
    admin can exist without seeing the first admin's candidates.
    """
    __tablename__ = 'companies'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    # Stable, URL-safe handle. Unique so two companies cannot be created under names that
    # only differ by case or spacing and then be impossible to tell apart in a dropdown.
    slug = db.Column(db.String(80), unique=True, nullable=False)
    # active | archived. Archiving is how a company is retired: deleting it would either
    # orphan or cascade away real candidate records, and neither is acceptable for data an
    # audit may need later.
    status = db.Column(db.String(20), default='active')
    # Where a PUBLIC signup lands. Somebody enrolling through the signup form picks a course
    # category, not a company, so without this every organic signup would be created with no
    # company at all — invisible to every admin, visible only in the super admin's
    # unassigned list, forever growing. At most one company carries this at a time; the
    # super admin route clears it from the others when it is set.
    #
    # NULL/false everywhere is the pre-multi-admin behaviour and stays valid: signups then
    # land unassigned exactly as they do today, and the super admin places them by hand.
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'status': self.status or 'active',
            'is_default': bool(self.is_default),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
        }


class AdminCompanyAssignment(db.Model):
    """Which companies an admin may act on. One row per (admin, company) pair.

    A join table rather than a column on users because the requirement is explicitly
    many-to-many: one admin can be given several companies, and a company can have several
    admins. Revoking access is deleting a row, which leaves the admin account itself intact.
    """
    __tablename__ = 'admin_company_assignments'
    __table_args__ = (
        # Two grants of the same company to the same admin are not merely redundant, they
        # would make a revoke look like it silently failed — the second row still grants it.
        db.UniqueConstraint('admin_user_id', 'company_id', name='uq_admin_company'),
    )

    id = db.Column(db.Integer, primary_key=True)
    admin_user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    admin = db.relationship('User', foreign_keys=[admin_user_id])
    company = db.relationship('Company', foreign_keys=[company_id])

    def to_dict(self):
        return {
            'id': self.id,
            'admin_user_id': self.admin_user_id,
            'company_id': self.company_id,
            'company_name': self.company.name if self.company else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ApiKey(db.Model):
    """A credential for machine access to one company's data.

    ONE COMPANY, ALWAYS
    -------------------
    Unlike an admin, who can hold several, a key is bound to exactly one company. Two
    companies means two keys. That is not a limitation so much as the point: a key is
    handed to an integration and then lives in somebody else's configuration, and "which
    data does this key reach" should be answerable without looking anything up.

    HASHED LIKE A PASSWORD, VERIFIED LIKE A TOKEN
    ---------------------------------------------
    Stored as SHA-256, not bcrypt. bcrypt is right for passwords precisely because it is
    slow, which defends a low-entropy secret a human chose. An API key is 32 random bytes
    generated here — brute force is not the threat — and it arrives on EVERY request, so
    ~100ms per verification would cost more throughput than the whole rest of the request.
    The prefix is indexed and stored in the clear so a lookup is one indexed hit rather
    than a scan comparing every hash on the table.
    """
    __tablename__ = 'api_keys'

    id = db.Column(db.Integer, primary_key=True)

    # Human label ("Zapier integration", "HR dashboard"). What appears in the audit trail,
    # because a key id tells whoever is reading it nothing.
    name = db.Column(db.String(120), nullable=False)

    # First characters of the key, shown in the clear everywhere the key is listed. The
    # secret is unrecoverable after creation, so without this there is no way to tell two
    # keys apart when deciding which to revoke.
    key_prefix = db.Column(db.String(24), unique=True, nullable=False, index=True)
    key_hash = db.Column(db.String(64), nullable=False)

    company_id = db.Column(db.Integer, db.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)

    # JSON list of scope strings. A key with no scopes can authenticate and do nothing,
    # which is the safe thing for it to default to.
    scopes = db.Column(db.Text, nullable=True)

    # Requests per minute. Per key rather than per IP: an integration is one caller however
    # many machines it runs on, and an IP limit would punish everyone behind one NAT.
    rate_limit_per_minute = db.Column(db.Integer, default=60)

    created_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    # Optional. An integration that was meant to be temporary and has no expiry is one
    # nobody ever remembers to turn off.
    expires_at = db.Column(db.DateTime, nullable=True)

    # Revocation is a timestamp, not a delete: the audit trail refers to this key by id, and
    # deleting the row would turn every one of those entries into a dangling number.
    revoked_at = db.Column(db.DateTime, nullable=True)
    revoked_by = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    # Written on use, best-effort. Answers the only question that matters when deciding
    # whether a key is still needed: is anything still calling with it?
    last_used_at = db.Column(db.DateTime, nullable=True)

    company = db.relationship('Company', foreign_keys=[company_id])

    def scope_list(self):
        if not self.scopes:
            return []
        try:
            value = json.loads(self.scopes)
        except (ValueError, TypeError):
            # A corrupted blob must mean "no permissions", never "all permissions".
            return []
        return value if isinstance(value, list) else []

    def set_scopes(self, scopes):
        self.scopes = json.dumps(sorted(set(scopes or [])))

    def has_scope(self, scope):
        return scope in self.scope_list()

    def is_active(self, now=None):
        now = now or datetime.datetime.utcnow()
        if self.revoked_at is not None:
            return False
        if self.expires_at is not None and now > self.expires_at:
            return False
        return True

    def status(self):
        if self.revoked_at is not None:
            return 'revoked'
        if self.expires_at is not None and datetime.datetime.utcnow() > self.expires_at:
            return 'expired'
        return 'active'

    def to_dict(self):
        """Never includes the secret — it exists only in the response that created it."""
        return {
            'id': self.id,
            'name': self.name,
            'key_prefix': self.key_prefix,
            'company_id': self.company_id,
            'company_name': self.company.name if self.company else None,
            'scopes': self.scope_list(),
            'rate_limit_per_minute': self.rate_limit_per_minute or 60,
            'status': self.status(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'revoked_at': self.revoked_at.isoformat() if self.revoked_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
        }
