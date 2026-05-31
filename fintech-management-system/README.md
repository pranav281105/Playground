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

## Local Development

### One-time setup
```bash
make install
```

### Run full dev stack
```bash
make dev
```

This command starts:
- PostgreSQL via Docker Compose (`localhost:5432`)
- Backend FastAPI server (`http://localhost:8000`)
- Frontend Vite dev server (`http://localhost:5173`)

Press `Ctrl+C` to stop the frontend and backend. To stop Docker services:

```bash
make stop
```

### Run services individually
```bash
make dev-db
make dev-backend
make dev-frontend
```

## API Docs
- Swagger: `http://localhost:8000/docs`

## New Laptop Setup
- Step-by-step setup/run guide: `docs/local-setup-guide.md`

## Note
This repo implements the core MVP architecture and rules from PRD/FRD/SAD and `CLAUDE (F).md`.
