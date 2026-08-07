import os
import secrets
from datetime import timedelta

# Load dotenv if available (will fail silently if not found)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))


def _required_secret(env_name):
    """Returns the configured secret, or a random per-process one if it is unset.

    These used to fall back to a fixed literal committed to this repository. A hard-coded
    JWT signing key is not a weak secret, it is a published one: anyone with the source can
    mint a token for any user id, including an admin, without ever touching the login
    endpoint. No route check can defend against that, because such a token is genuinely
    valid.

    The fallback is random rather than fatal so a missing variable can't take the service
    down mid-interview. The cost is that sessions do not survive a restart or span more than
    one instance, which is why the warning below is loud: set the variable in the host's
    environment and the behaviour goes back to normal.
    """
    value = os.environ.get(env_name)
    if value:
        return value
    print(
        f"\n[SECURITY] {env_name} is not set. Using a random key generated for this process.\n"
        f"[SECURITY] Everyone will be signed out whenever the server restarts, and sessions\n"
        f"[SECURITY] will not work across multiple instances. Set {env_name} in the\n"
        f"[SECURITY] environment (any long random string) to fix this.\n"
    )
    return secrets.token_urlsafe(64)


class Config:
    # Flask Settings
    SECRET_KEY = _required_secret('SECRET_KEY')
    FLASK_ENV = os.environ.get('FLASK_ENV', 'development')
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'

    # Database Settings (DB Integration §3): PostgreSQL/Supabase ONLY — there is no
    # SQLite fallback, in any environment including local development. DATABASE_URL must
    # be set explicitly; db.py fails fast with a clear message if it is missing.
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', '')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT Settings
    JWT_SECRET_KEY = _required_secret('JWT_SECRET_KEY')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    # Browser origins allowed to call this API, comma-separated (e.g.
    # "https://sit-interviewer.vercel.app,http://localhost:5173"). Empty means allow any
    # origin, which is only appropriate for local development.
    CORS_ORIGINS = [o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()]

    # The startup admin account. The password MUST come from the environment: an admin
    # password written into the source is a published credential for a publicly reachable
    # login form. Setting ADMIN_PASSWORD also rotates the existing admin's password on the
    # next boot, which is how a leaked one gets replaced.
    ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@interviewer.com')
    ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')

    # Scratch directory for TRANSIENT processing files only (Whisper temp audio, resume
    # parsing). Files here are always deleted after use — no persistence (§3).
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))

    # Feature flags
    # Temporarily disables the "Ongoing" course-status option for NEW signups
    # (Update §1). Existing Ongoing users are unaffected. Flip to 'True' to re-enable
    # instantly without any code change or redeploy of core logic.
    ONGOING_CATEGORY_ENABLED = os.environ.get('ONGOING_CATEGORY_ENABLED', 'False').lower() == 'true'

    # AI Configurations
    # 'api' to run with real API keys, 'mock' to use dummy evaluations
    AI_MODE = os.environ.get('AI_MODE', 'mock')
    
    # We support multiple API configurations for flexibility (e.g., Groq, Together, or OpenAI)
    AI_PROVIDER = os.environ.get('AI_PROVIDER', 'groq')  # 'groq', 'together', 'openai', 'openrouter'
    MIXTRAL_API_KEY = os.environ.get('MIXTRAL_API_KEY', '')
    WHISPER_API_KEY = os.environ.get('WHISPER_API_KEY', '')
    
    # API endpoints custom overrides based on provider selection
    default_mixtral_url = 'https://api.groq.com/openai/v1/chat/completions'
    if AI_PROVIDER == 'openrouter':
        default_mixtral_url = 'https://openrouter.ai/api/v1/chat/completions'
    elif AI_PROVIDER == 'together':
        default_mixtral_url = 'https://api.together.xyz/v1/chat/completions'
    elif AI_PROVIDER == 'openai':
        default_mixtral_url = 'https://api.openai.com/v1/chat/completions'
        
    MIXTRAL_API_URL = os.environ.get('MIXTRAL_API_URL', default_mixtral_url)

    # Speech-to-text (Whisper) is a SEPARATE provider from the chat model. OpenRouter
    # does NOT offer audio transcription, so WHISPER must point at Groq (free Whisper) or
    # OpenAI, with a matching WHISPER_API_KEY for that provider.
    WHISPER_PROVIDER = os.environ.get('WHISPER_PROVIDER', 'groq')  # 'groq' or 'openai'
    default_whisper_url = 'https://api.groq.com/openai/v1/audio/transcriptions'
    if WHISPER_PROVIDER == 'openai':
        default_whisper_url = 'https://api.openai.com/v1/audio/transcriptions'
    WHISPER_API_URL = os.environ.get('WHISPER_API_URL', default_whisper_url)

    # Primary chat model used for question generation, answer evaluation, and domain
    # classification. Override with LLM_MODEL in .env. Defaults are chosen per provider
    # to favour stronger reasoning + reliable JSON output over the older mixtral-8x7b.
    default_llm_model = 'llama-3.3-70b-versatile'  # groq default
    if AI_PROVIDER == 'openrouter':
        default_llm_model = 'meta-llama/llama-3.3-70b-instruct'
    elif AI_PROVIDER == 'together':
        default_llm_model = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
    elif AI_PROVIDER == 'openai':
        default_llm_model = 'gpt-4o-mini'
    LLM_MODEL = os.environ.get('LLM_MODEL', default_llm_model)

    # LLM call tuning
    LLM_TIMEOUT = int(os.environ.get('LLM_TIMEOUT', '30'))       # seconds per request
    LLM_MAX_RETRIES = int(os.environ.get('LLM_MAX_RETRIES', '2'))  # retries on failure

    # Media settings
    ALLOWED_EXTENSIONS = {'pdf', 'txt', 'mp3', 'wav', 'ogg', 'webm', 'm4a', 'png', 'jpg', 'jpeg', 'gif', 'webp'}
    MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32MB Max Upload

    # Supabase Storage Configuration
    SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
    SUPABASE_KEY = os.environ.get('SUPABASE_SECRET_KEY', os.environ.get('SUPABASE_KEY', ''))
    SUPABASE_BUCKET = os.environ.get('SUPABASE_BUCKET', 'profile-pictures')
    # Separate bucket for recorded interview answer audio (create this bucket in the
    # Supabase project — it can be private; the backend uses the service key to write).
    SUPABASE_AUDIO_BUCKET = os.environ.get('SUPABASE_AUDIO_BUCKET', 'interview-audio')
    # Private bucket for full-session interview video recordings (§2.2). Never public —
    # admin playback uses short-lived signed URLs only.
    SUPABASE_VIDEO_BUCKET = os.environ.get('SUPABASE_VIDEO_BUCKET', 'interview-recordings')
    # Private bucket for proctoring images: termination webcam frames and monitored screen
    # screenshots, filed under user_<id>/<date>/. Admin viewing uses signed URLs only.
    SUPABASE_SNAPSHOT_BUCKET = os.environ.get('SUPABASE_SNAPSHOT_BUCKET', 'proctor-snapshots')

    # Email service (Python smtplib — no third-party provider required).
    # 'smtp' sends real mail; 'console' prints the rendered email to the server log
    # so the whole platform stays testable with zero credentials (same philosophy
    # as AI_MODE=mock). Credentials come exclusively from the environment.
    EMAIL_MODE = os.environ.get('EMAIL_MODE', 'console')  # 'gmail_api', 'smtp', or 'console'
    SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_USERNAME = os.environ.get('SMTP_USERNAME', '')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')  # e.g. a Gmail App Password
    SMTP_USE_TLS = os.environ.get('SMTP_USE_TLS', 'True').lower() == 'true'   # STARTTLS (port 587)
    SMTP_USE_SSL = os.environ.get('SMTP_USE_SSL', 'False').lower() == 'true'  # implicit SSL (port 465)
    EMAIL_FROM = os.environ.get('EMAIL_FROM', os.environ.get('SMTP_USERNAME', 'no-reply@smit-portal.local'))
    EMAIL_FROM_NAME = os.environ.get('EMAIL_FROM_NAME', 'SMIT Assessment Portal')
    EMAIL_MAX_RETRIES = int(os.environ.get('EMAIL_MAX_RETRIES', '2'))
    EMAIL_RETRY_DELAY = int(os.environ.get('EMAIL_RETRY_DELAY', '3'))  # seconds between attempts

    # Gmail API delivery (EMAIL_MODE=gmail_api): sends over HTTPS as EMAIL_FROM's own Gmail
    # account via OAuth2, instead of raw SMTP sockets. Needed on hosts (e.g. Render's free
    # tier) that block outbound SMTP but allow normal HTTPS. No domain ownership required —
    # unlike every transactional-email API (Resend, SendGrid, etc.), which can only send to
    # arbitrary recipients from a DNS-verified domain you own. Minted once via
    # scripts/gmail_oauth_setup.py.
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REFRESH_TOKEN = os.environ.get('GOOGLE_REFRESH_TOKEN', '')
    # Used for links inside emails (e.g. the admin approval queue, candidate login page)
    APP_BASE_URL = os.environ.get('APP_BASE_URL', 'http://localhost:5173')
