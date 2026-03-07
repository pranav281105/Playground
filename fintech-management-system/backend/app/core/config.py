from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FinTech Management System API"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "replace-me"
    access_token_expire_minutes: int = 60
    database_url: str = "postgresql+psycopg://fintech:fintech@localhost:5432/fintech"


@lru_cache
def get_settings() -> Settings:
    return Settings()
