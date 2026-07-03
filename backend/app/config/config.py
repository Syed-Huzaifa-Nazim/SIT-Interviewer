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
    AI_PROVIDER = os.environ.get('AI_PROVIDER', 'groq')  # 'groq', 'together', 'openai'
    MIXTRAL_API_KEY = os.environ.get('MIXTRAL_API_KEY', '')
    WHISPER_API_KEY = os.environ.get('WHISPER_API_KEY', '')
    
    # API endpoints custom overrides
    MIXTRAL_API_URL = os.environ.get('MIXTRAL_API_URL', 'https://api.groq.com/openai/v1/chat/completions')
    WHISPER_API_URL = os.environ.get('WHISPER_API_URL', 'https://api.groq.com/openai/v1/audio/transcriptions')

    # Media settings
    ALLOWED_EXTENSIONS = {'pdf', 'txt', 'mp3', 'wav', 'ogg', 'webm', 'm4a'}
    MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32MB Max Upload
