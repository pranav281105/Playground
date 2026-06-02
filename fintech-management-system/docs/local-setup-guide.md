# FinTech Management System - Local Setup Guide (New Laptop)

This guide helps any developer run the project end-to-end on a fresh machine.

## 1) Prerequisites

Install these first:

- Git
- Docker Desktop (must be running)
- Python 3.13 (or the version used by your team)
- Node.js 20+ and npm

## 2) Clone Repository

```bash
git clone https://github.com/pranav281105/Playground.git
cd Playground/fintech-management-system
```

## 3) Install Dependencies

```bash
make install
```

What this does:

- Creates backend virtual env at `backend/.venv`
- Installs backend dependencies
- Installs frontend dependencies

## 4) Start Full Stack

```bash
make dev
```

This starts:

- Postgres (Docker): `localhost:5432`
- Backend (FastAPI): `http://localhost:8000`
- Frontend (Vite): `http://localhost:5173`

Open:

- App UI: `http://localhost:5173`
- API Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## 5) Stop Services

- `Ctrl + C` in terminal running `make dev`
- Then stop DB:

```bash
make stop
```

## 6) Run Checks

Backend tests:

```bash
cd backend
source .venv/bin/activate
pytest -q
```

Frontend lint:

```bash
cd frontend
npm run lint
```

## 7) Demo Login Accounts

If demo seed has been loaded, common accounts are:

- Owner: `owner@abc.demo`
- Business Managers:
  - `manager.businessx@abc.demo`
  - `manager.businessy@abc.demo`
  - `manager.businessz@abc.demo`
- Branch Managers:
  - `bm.x1@abc.demo`, `bm.x2@abc.demo`, `bm.x3@abc.demo`
  - `bm.y1@abc.demo`, `bm.y2@abc.demo`, `bm.y3@abc.demo`
  - `bm.z1@abc.demo`, `bm.z2@abc.demo`, `bm.z3@abc.demo`

Default demo password:

- `Demo@12345`

## 8) Common Issues

1. Docker error: `Cannot connect to the Docker daemon`
- Fix: start Docker Desktop, then rerun `make dev-db` or `make dev`.

2. Port already in use (`8000` / `5173`)
- Stop existing process using the port, then rerun `make dev`.

3. Frontend cannot reach backend
- Confirm backend health endpoint works:
  - `curl http://127.0.0.1:8000/health`

4. Branch-based create operations fail for admin
- Admin/owner may need explicit branch selection in UI for branch-scoped records (customers/cost entries/payments).

