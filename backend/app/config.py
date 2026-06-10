import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _to_bool(value: str, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _to_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./ti_diagnostic.db")
    api_key: str = os.getenv("API_KEY", "")
    cors_origins: str = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")
    allow_seed_data: bool = _to_bool(os.getenv("ALLOW_SEED_DATA"), True)
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # --- Autenticación JWT (Fase 3) ---
    jwt_secret: str = os.getenv("JWT_SECRET", "cambia-esta-clave-secreta-en-produccion")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expire_minutes: int = _to_int(os.getenv("JWT_EXPIRE_MINUTES"), 480)
    seed_admin_user: str = os.getenv("SEED_ADMIN_USER", "admin")
    seed_admin_password: str = os.getenv("SEED_ADMIN_PASSWORD", "admin123")

    # --- Retención de snapshots (Fase 5) ---
    snapshot_retention_days: int = _to_int(os.getenv("SNAPSHOT_RETENTION_DAYS"), 30)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
