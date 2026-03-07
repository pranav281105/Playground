# FinTech Management System

Production-grade Phase 1 foundation for the Income Statement Web App.

## Stack
- Backend: FastAPI, SQLAlchemy, PostgreSQL, JWT auth
- Frontend: React + TypeScript (scaffold)
- Money handling: Python `Decimal` + PostgreSQL `NUMERIC(10,2)` only

## Key Rules Enforced
- Invoice lifecycle: `DRAFT -> FINALIZED -> VOID`
- Branch data isolation for branch managers
- Admin-only void invoice flow
- Deterministic financial formulas (no AI for calculations)

## Run Backend (local)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload
```

## API Docs
- Swagger: `http://localhost:8000/docs`

## Note
This repo implements the core MVP architecture and rules from PRD/FRD/SAD and `CLAUDE (F).md`.
