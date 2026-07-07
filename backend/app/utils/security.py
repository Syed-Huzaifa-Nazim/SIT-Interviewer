import jwt
import datetime
from fastapi import Request, HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config.config import Config
from app.models import User

# Configure security schemes
security_scheme = HTTPBearer(auto_error=False)
JWT_SECRET = Config.JWT_SECRET_KEY

def create_access_token(identity: int, expires_delta: datetime.timedelta = None) -> str:
    """Encodes a new JWT access token containing user claims."""
    if not expires_delta:
        expires_delta = datetime.timedelta(hours=12) # generous session limit
        
    payload = {
        "sub": str(identity),
        "exp": datetime.datetime.utcnow() + expires_delta,
        "iat": datetime.datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def create_refresh_token(identity: int, expires_delta: datetime.timedelta = None) -> str:
    """Encodes a refresh token for candidate session longevity."""
    if not expires_delta:
        expires_delta = datetime.timedelta(days=7)
        
    payload = {
        "sub": str(identity),
        "exp": datetime.datetime.utcnow() + expires_delta,
        "iat": datetime.datetime.utcnow(),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> int:
    """Dependency validator: checks token signature, expiry, and returns decoded user_id."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Request does not contain an access token."
        )
    
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The token has expired. Please refresh your session."
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature verification failed. Token is invalid."
        )

def get_current_user(user_id: int = Depends(get_current_user_id)) -> User:
    """Resolves active candidate model instance or raises 401."""
    user = User.query.get(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account record not found."
        )
    return user

def admin_required(user: User = Depends(get_current_user)):
    """Verifies candidate roles, throwing 403 if admin role is absent."""
    if user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    return user
