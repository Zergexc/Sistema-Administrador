from datetime import timedelta

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import get_db
from .models import utcnow

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# auto_error=False: permite endpoints donde el token es opcional y manejamos el 401 nosotros.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


# ---------------------------------------------------------------------------
# Hashing de contraseñas
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Tokens JWT
# ---------------------------------------------------------------------------
def create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    to_encode = data.copy()
    expire = utcnow() + timedelta(
        minutes=expires_minutes or settings.jwt_expire_minutes
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Dependencias de usuario (panel web)
# ---------------------------------------------------------------------------
def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exc

    payload = decode_access_token(token)
    if not payload:
        raise credentials_exc

    username = payload.get("sub")
    if not username:
        raise credentials_exc

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.is_active:
        raise credentials_exc
    return user


def require_admin(current: models.User = Depends(get_current_user)) -> models.User:
    if current.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de administrador",
        )
    return current


# ---------------------------------------------------------------------------
# Autenticación de agentes (machine-to-machine, X-API-Key)
# ---------------------------------------------------------------------------
def verify_api_key(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
):
    # Local-first: if API_KEY is empty, auth is disabled.
    if not settings.api_key:
        return

    bearer_key = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer_key = authorization[7:].strip()

    provided = x_api_key or bearer_key
    if provided != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key invalida o ausente",
        )
