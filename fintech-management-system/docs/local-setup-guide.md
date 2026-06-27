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

## 4) Start Full Stack (Local Development)

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

## 5) Database Seeding (Mandatory for Demo Data)

To load the test data (vendors, branches, customers, invoices, and audit logs) into the database, run the seeding script.

### For Local Development (`make dev`):
Open a new terminal window or tab, activate the virtual environment, and run the seed script:
```bash
cd backend
source .venv/bin/activate
python -m app.utils.demo_seed --reset
```

### For Docker-Only Run (`make docker-up`):
Run the demo seeding target directly from your host machine:
```bash
make seed-demo
```

## 6) Stop Services

- Press `Ctrl + C` in the terminal tab running `make dev`
- Then stop the Docker database container:

```bash
make stop
```

## 7) Run Checks

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

## 8) Demo Login Accounts

All seed accounts use the default demo password: **`Demo@12345`**

- **Owner / Administrator** (Consolidated Access):
  - `owner@abc.demo`
- **Business Managers** (Scoped to specific business division):
  - `manager.businessx@abc.demo` (Business X)
  - `manager.businessy@abc.demo` (Business Y)
  - `manager.businessz@abc.demo` (Business Z)
- **Branch Managers** (Scoped to specific physical outlet):
  - **Business X Outlets**:
    - `bm.1.1@abc.demo` (Business X Downtown)
    - `bm.1.2@abc.demo` (Business X Orchard)
    - `bm.1.3@abc.demo` (Business X Harbour)
  - **Business Y Outlets**:
    - `bm.2.1@abc.demo` (Business Y Jurong)
    - `bm.2.2@abc.demo` (Business Y Tampines)
    - `bm.2.3@abc.demo` (Business Y Woodlands)
  - **Business Z Outlets**:
    - `bm.3.1@abc.demo` (Business Z East Coast)
    - `bm.3.2@abc.demo` (Business Z Changi)
    - `bm.3.3@abc.demo` (Business Z Punggol)

## 9) Common Issues

1. **Docker error**: `Cannot connect to the Docker daemon`
   - *Fix*: Start Docker Desktop, then rerun `make dev-db` or `make dev`.

2. **Port already in use** (`8000` / `5173`)
   - *Fix*: Stop existing processes using those ports, then rerun `make dev`.

3. **Frontend cannot reach backend**
   - *Fix*: Confirm backend health endpoint works using:
     `curl http://127.0.0.1:8000/health`

4. **Branch-based create operations fail for Owner/Admin**
   - *Fix*: Owners and Admins have global access and are not assigned to a single branch. When creating branch-scoped records (customers, cost entries, payments) as an Admin, make sure to select the target branch explicitly in the UI dropdown field.

---

## Docker-Only Run (Best for Migration or Clean Review)

If you want to run this project on another computer with minimal setup using Docker:

### Start:
```bash
git clone https://github.com/pranav281105/Playground.git
cd Playground/fintech-management-system

# Build and start all services in containerized mode
make docker-up

# Seed the database with demo accounts and datasets
make seed-demo
```

### Access:
- App UI: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`

### Manage:
*   To view container logs:
    ```bash
    make docker-logs
    ```
*   To stop all containers and cleanup:
    ```bash
    make docker-down
    ```

