# Backend

FastAPI backend for the FinTech Management System.

## Environment
Copy `.env.example` to `.env` and update values.

## Migrations
```bash
alembic upgrade head
```

## Run
```bash
uvicorn app.main:app --reload
```

For local bootstrap without running migrations first, set `AUTO_CREATE_TABLES=true` in `.env`.
