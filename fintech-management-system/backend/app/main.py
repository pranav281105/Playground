from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine
from app.models import entities  # noqa: F401

settings = get_settings()

app = FastAPI(title=settings.app_name)


@app.on_event("startup")
def on_startup() -> None:
    # Local/dev bootstrap. Replace with Alembic migrations in production pipelines.
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router, prefix=settings.api_v1_prefix)
