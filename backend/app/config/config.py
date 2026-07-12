import os
from datetime import timedelta

# Load dotenv if available (will fail silently if not found)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

class Config:
    # Flask Settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'super-secret-flask-key-change-me')
    FLASK_ENV = os.environ.get('FLASK_ENV', 'development')
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'

    # Database Settings
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', f"sqlite:///{os.path.join(BASE_DIR, 'interviewer.db')}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT Settings
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'super-secret-jwt-key-change-me')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    # Directories
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
    REPORTS_FOLDER = os.environ.get('REPORTS_FOLDER', os.path.join(BASE_DIR, 'reports'))

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
