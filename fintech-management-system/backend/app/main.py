import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.middleware import RateLimitMiddleware, RequestLoggingMiddleware
from app.db.base import Base
from app.db.session import engine
from app.models import entities  # noqa: F401

settings = get_settings()
logging.basicConfig(level=logging.INFO)

app = FastAPI(title=settings.app_name)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware, limit_per_minute=settings.request_rate_limit_per_minute)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router, prefix=settings.api_v1_prefix)
