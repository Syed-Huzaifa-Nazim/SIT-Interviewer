"""Centralized HTML email templates (§1).

Every template function returns ``(subject, html)``. All styling is inline (email
clients strip <style> blocks) and uses the SMIT brand palette: blue #0d6db7,
green #8dc63f.
"""
from app.config.config import Config

BRAND_BLUE = '#0d6db7'
BRAND_GREEN = '#8dc63f'


def _base(title, body_html):
    """Shared shell: brand header, white card body, footer."""
    return f"""
<div style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:Segoe UI,Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:{BRAND_BLUE};padding:22px 32px;">
      <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px;">SMIT Assessment Portal</span>
      <span style="display:block;color:#bfdcf2;font-size:11px;margin-top:2px;text-transform:uppercase;letter-spacing:2px;">SIT Interviewer</span>
    </div>
    <div style="padding:28px 32px;color:#334155;font-size:14px;line-height:1.7;">
      <h2 style="margin:0 0 14px 0;color:#0f172a;font-size:18px;">{title}</h2>
      {body_html}
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;line-height:1.6;">
      This is an automated message from the SMIT Assessment Portal — please do not reply to this email.<br>
      If you did not expect this email, you can safely ignore it.
    </div>
  </div>
</div>
"""


def _credentials_box(rows):
    """rows: list of (label, value) shown in a highlighted credential panel."""
    row_html = ''.join(
        f'<tr>'
        f'<td style="padding:6px 14px 6px 0;color:#64748b;font-size:12px;white-space:nowrap;">{label}</td>'
        f'<td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:bold;font-family:Consolas,Courier New,monospace;">{value}</td>'
        f'</tr>'
        for label, value in rows
    )
    return (
        f'<div style="margin:18px 0;padding:16px 20px;background:#f0f7fc;border:1px solid {BRAND_BLUE}33;'
        f'border-left:4px solid {BRAND_BLUE};border-radius:8px;">'
        f'<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">{row_html}</table>'
        f'</div>'
    )


def _button(href, label):
    return (
        f'<div style="margin:20px 0;">'
        f'<a href="{href}" style="display:inline-block;padding:11px 26px;background:{BRAND_BLUE};color:#ffffff;'
        f'text-decoration:none;border-radius:8px;font-weight:bold;font-size:13px;">{label}</a>'
        f'</div>'
    )


def ongoing_signup(name, cnic, password):
    """1. Ongoing-course candidate signup confirmation (CNIC + password) — §3.1."""
    subject = 'Welcome to SMIT Assessment Portal — Your Login Credentials'
    body = f"""
<p>Dear {name},</p>
<p>Your account has been created successfully. Since your course is currently <b>ongoing</b>,
you have access to the <b>Mock Interviewer</b> and all practice services on the platform.</p>
<p>Use the credentials below to sign in — you can log in as many times as you like:</p>
{_credentials_box([('Username (CNIC)', cnic), ('Password', password)])}
{_button(Config.APP_BASE_URL + '/login', 'Open the Portal')}
<p style="color:#64748b;font-size:12px;">Once you complete your course and receive your certification,
the administration will upgrade your account for the official interview. Keep this email safe.</p>
"""
    return subject, _base('Welcome aboard! Your practice account is ready', body)


def completed_signup(name, cnic, otp):
    """2. Completed-course candidate signup confirmation (CNIC + one-time password) — §3.2."""
    subject = 'Your SMIT Interview Invitation — One-Time Login Credentials'
    body = f"""
<p>Dear {name},</p>
<p>You have completed your course and are invited to take your <b>official
AI-proctored interview</b>. Use the credentials below to sign in:</p>
{_credentials_box([('Username (CNIC)', cnic), ('One-Time Password', otp)])}
<div style="margin:16px 0;padding:12px 16px;background:#fef9ec;border:1px solid #f5d67b;border-radius:8px;color:#8a6d1a;font-size:12px;">
<b>Important:</b> this password works exactly <b>once</b>. Only log in when you are ready to
take the interview — a working camera and microphone are required, and the session runs in
full-screen under AI proctoring.
</div>
{_button(Config.APP_BASE_URL + '/login', 'Log in & Start Interview')}
<p style="color:#64748b;font-size:12px;">After the interview, you will be signed out automatically and these credentials will no longer work.</p>
"""
    return subject, _base('You are invited to your official interview', body)


def instructor_invite(name, cnic, otp):
    """Instructor signup / invite confirmation (CNIC + one-time password) — Update §3.
    Mirrors the completed-course invite but with instructor-appropriate wording."""
    subject = 'Your SMIT Instructor Interview Invitation — One-Time Login Credentials'
    body = f"""
<p>Dear {name},</p>
<p>You have been invited to take your <b>instructor assessment interview</b> on the
SMIT Assessment Portal. Use the credentials below to sign in:</p>
{_credentials_box([('Username (CNIC)', cnic), ('One-Time Password', otp)])}
<div style="margin:16px 0;padding:12px 16px;background:#fef9ec;border:1px solid #f5d67b;border-radius:8px;color:#8a6d1a;font-size:12px;">
<b>Important:</b> this password works exactly <b>once</b>. Only log in when you are ready to
take the interview — a working camera and microphone are required, and the session runs in
full-screen under AI proctoring.
</div>
{_button(Config.APP_BASE_URL + '/login', 'Log in & Start Interview')}
<p style="color:#64748b;font-size:12px;">After the interview, you will be signed out automatically and these credentials will no longer work.</p>
"""
    return subject, _base('You are invited to your instructor interview', body)


def bulk_invite(name, cnic, otp, subject_override, instructor=False,
                category=None, deadline_days=None, personalize=True):
    """Invitation sent by the Bulk Email Module.

    Deliberately built on the same shell and credential box as ``completed_signup`` /
    ``instructor_invite`` so a bulk-invited candidate receives a visually identical email —
    the only differences are the admin-chosen subject line and, when personalization is on,
    the candidate's own category and deadline woven into the copy.
    """
    role_line = (
        'your <b>instructor assessment interview</b>' if instructor
        else 'your <b>official AI-proctored interview</b>'
    )
    greeting = f'Dear {name},' if personalize else 'Dear Candidate,'

    category_line = ''
    if personalize and category and not instructor:
        category_line = f'<p>This assessment covers your <b>{category}</b> track.</p>'

    deadline_html = ''
    if personalize and deadline_days:
        day_word = 'day' if deadline_days == 1 else 'days'
        deadline_html = (
            f'<div style="margin:16px 0;padding:12px 16px;background:#fdecec;border:1px solid #f5b7b7;'
            f'border-radius:8px;color:#9b2c2c;font-size:12px;">'
            f'<b>Deadline:</b> these credentials expire in <b>{deadline_days} {day_word}</b>. '
            f'Please complete your interview before then — after that they will stop working '
            f'and you will need to be re-invited.'
            f'</div>'
        )

    body = f"""
<p>{greeting}</p>
<p>You have been invited to take {role_line} on the SMIT Assessment Portal.
Use the credentials below to sign in:</p>
{category_line}
{_credentials_box([('Username (CNIC)', cnic), ('One-Time Password', otp)])}
<div style="margin:16px 0;padding:12px 16px;background:#fef9ec;border:1px solid #f5d67b;border-radius:8px;color:#8a6d1a;font-size:12px;">
<b>Important:</b> this password works exactly <b>once</b>. Only log in when you are ready to
take the interview — a working camera and microphone are required, and the session runs in
full-screen under AI proctoring.
</div>
{deadline_html}
{_button(Config.APP_BASE_URL + '/login', 'Log in &amp; Start Interview')}
<p style="color:#64748b;font-size:12px;">After the interview, you will be signed out automatically and these credentials will no longer work.</p>
"""
    title = ('You are invited to your instructor interview' if instructor
             else 'You are invited to your official interview')
    return subject_override, _base(title, body)


def interview_clearance(name):
    """Admin-triggered interview clearance / pass confirmation — Update §5."""
    subject = 'Congratulations — You Have Cleared Your SMIT Interview'
    body = f"""
<p>Dear {name},</p>
<p>We are pleased to inform you that, following a review of your interview, you have
<b style="color:{BRAND_GREEN};">successfully cleared</b> the SMIT assessment interview.</p>
<p>Thank you for your effort and the quality of your responses. Please keep an eye on your
inbox — our team will be in touch regarding the next steps in the process.</p>
<p style="color:#64748b;font-size:12px;">This is an official confirmation of your interview clearance from the SMIT administration.</p>
"""
    return subject, _base('Your interview has been cleared', body)


def hr_assessment_invite(name):
    """Admin-triggered HR assessment invitation — Update §5. Distinct from clearance."""
    subject = 'Next Step — Invitation to Your SMIT HR Assessment'
    body = f"""
<p>Dear {name},</p>
<p>Following your interview, you are invited to proceed to the <b>HR assessment</b> stage of
the SMIT selection process.</p>
<p>Our HR team will contact you shortly with the schedule and any further details you need to
prepare. Please ensure your contact information is up to date and watch your inbox for the
follow-up.</p>
<p style="color:#64748b;font-size:12px;">If you have any questions in the meantime, please reach out to the SMIT administration office.</p>
"""
    return subject, _base('You are invited to the HR assessment stage', body)


def proctoring_termination_notice(name):
    """Admin-triggered notice to a candidate whose interview was terminated for a
    proctoring violation, with their camera snapshot attached as evidence. Explains
    the 30-day account block."""
    subject = 'Interview Terminated — Proctoring Violation Notice'
    body = f"""
<p>Dear {name},</p>
<p>Your recent SMIT interview was <b style="color:#dc2626;">terminated</b> because our
automated proctoring system detected a violation of the interview integrity rules
(for example, a mobile phone, another person, or leaving the camera view).</p>
<div style="margin:16px 0;padding:12px 16px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:13px;">
<b>Your account has been blocked for 30 days.</b> It will automatically reopen after the
block period ends, after which you may be eligible to attempt the interview again.
</div>
<p>A snapshot captured by the proctoring system at the time of the violation is attached
to this email for your reference.</p>
<p style="color:#64748b;font-size:12px;">If you believe this was a mistake, please contact the SMIT administration office.</p>
"""
    return subject, _base('Your interview was terminated', body)


def reinterview_approved(name, cnic, otp):
    """3. Second-interview approval email (fresh one-time password) — §3.4."""
    subject = 'Second Interview Approved — Your One-Time Login Credentials'
    body = f"""
<p>Dear {name},</p>
<p>Good news — the administration has <b style="color:{BRAND_GREEN};">approved</b> your request
for a second interview attempt. Use the fresh credentials below to sign in:</p>
{_credentials_box([('Username (CNIC)', cnic), ('One-Time Password', otp)])}
<div style="margin:16px 0;padding:12px 16px;background:#fef9ec;border:1px solid #f5d67b;border-radius:8px;color:#8a6d1a;font-size:12px;">
<b>Important:</b> as before, this password works exactly <b>once</b>. Only log in when you are ready to take the interview.
</div>
{_button(Config.APP_BASE_URL + '/login', 'Log in & Start Interview')}
"""
    return subject, _base('Your second interview attempt has been approved', body)


def reinterview_rejected(name):
    """4. Second-interview rejection email — §3.4."""
    subject = 'Update on Your Second Interview Request'
    body = f"""
<p>Dear {name},</p>
<p>Thank you for your interest in taking the interview again.</p>
<p><b>Sorry, you're not eligible for a second-time interview.</b></p>
<p style="color:#64748b;font-size:12px;">If you believe this is a mistake, please contact the SMIT administration office.</p>
"""
    return subject, _base('Second interview request — decision', body)


def admin_reinterview_request(candidate_name, cnic, email, course_category,
                              first_interview_date=None, first_interview_score=None):
    """Approval request sent to the admin when an already-interviewed CNIC signs up again — §3.4."""
    subject = f'Second Interview Request for Review — {candidate_name} ({cnic})'
    history_rows = [
        ('Candidate', candidate_name),
        ('CNIC', cnic),
        ('Email', email),
        ('Course Category', course_category or '—'),
        ('First Interview', first_interview_date or 'On record'),
    ]
    if first_interview_score is not None:
        history_rows.append(('First Interview Score', f'{first_interview_score}%'))
    body = f"""
<p>Hello Administrator,</p>
<p>A candidate who has <b>already completed an interview</b> has signed up again and is requesting
a <b>second interview attempt</b>. No credentials have been sent to the candidate — the request is
waiting for your decision.</p>
{_credentials_box(history_rows)}
<p>Review and approve or reject this request from the Admin Hub. The candidate will automatically
receive the corresponding email based on your decision.</p>
{_button(Config.APP_BASE_URL + '/admin/approvals', 'Open Approval Queue')}
"""
    return subject, _base('Second interview approval needed', body)


def password_reset_code(name, otp, ttl_minutes=15):
    """Password reset code. The code is generated server-side, stored only as a bcrypt
    hash, and delivered here — it is never returned in any API response, which is what
    stops a stranger who knows an email address from resetting that account."""
    subject = 'Your SMIT Portal Password Reset Code'
    body = f"""
<p>Dear {name},</p>
<p>We received a request to reset the password on your SMIT Assessment Portal account.
Enter the code below to choose a new password:</p>
{_credentials_box([('Reset Code', otp), ('Valid for', f'{ttl_minutes} minutes')])}
<div style="margin:16px 0;padding:12px 16px;background:#fef9ec;border:1px solid #f5d67b;border-radius:8px;color:#8a6d1a;font-size:12px;">
<b>Didn't request this?</b> You can safely ignore this email — your password has not
been changed, and the code above expires on its own. Never share this code with anyone.
</div>
{_button(Config.APP_BASE_URL + '/forgot-password', 'Reset My Password')}
<p style="color:#64748b;font-size:12px;">Resetting your password signs you out of every device.</p>
"""
    return subject, _base('Password reset code', body)
