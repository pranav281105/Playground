from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FinTech Management System API"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "replace-me"
    access_token_expire_minutes: int = 60
    database_url: str = "postgresql+psycopg://fintech:fintech@localhost:5432/fintech"
    auto_create_tables: bool = False
    request_rate_limit_per_minute: int = 120
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_allow_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
