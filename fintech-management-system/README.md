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

## Portable Docker Setup (Recommended for Migration)

Use this when running on a new laptop without setting up Python/Node locally.

### Start everything in containers
```bash
make docker-up
```

This starts:
- PostgreSQL (`localhost:5432`)
- Backend API (`http://localhost:8000`)
- Frontend (`http://localhost:5173`)

The backend container auto-creates tables on startup for first-run portability.

### Stop containers
```bash
make docker-down
```

### View logs
```bash
make docker-logs
```

### Database Seeding
To populate the database with mock branches, vendors, invoices, payments, and audit logs:
- **Local Dev**: Run `cd backend && python -m app.utils.demo_seed --reset`
- **Docker-Only**: Run `make seed-demo`

### Default Login Credentials
All mock accounts share the password **`Demo@12345`**:
- **Owner / Admin**: `owner@abc.demo` (Consolidated Access)
- **Business Manager**: `manager.businessx@abc.demo` (Business X scope)
- **Branch Manager**: `bm.1.1@abc.demo` (Downtown Branch scope)

Refer to [docs/local-setup-guide.md](file:///Users/pranav/Documents/Playground/fintech-management-system/docs/local-setup-guide.md) for the full list of branch manager credentials.

## API Docs
- Swagger: `http://localhost:8000/docs`

## New Laptop Setup
- Step-by-step setup/run guide: `docs/local-setup-guide.md`

## Note
This repo implements the core MVP architecture and rules from PRD/FRD/SAD and `CLAUDE (F).md`.

