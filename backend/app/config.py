import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _to_bool(value: str, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./ti_diagnostic.db")
    api_key: str = os.getenv("API_KEY", "")
    cors_origins: str = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")
    allow_seed_data: bool = _to_bool(os.getenv("ALLOW_SEED_DATA"), True)
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
