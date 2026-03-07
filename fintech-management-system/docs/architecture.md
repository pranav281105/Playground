# Phase 1 Architecture

## Backend
- Framework: FastAPI.
- Pattern: API Layer -> Service Layer -> Repository/ORM Layer -> PostgreSQL.
- Auth: JWT bearer tokens, role-based authorization.
- Domain services:
  - AuthService
  - InvoiceService
  - PaymentService
  - CostService
  - DashboardService
  - ReportingService
  - AuditService
- Deterministic calculations in `app/services/financial_engine.py`.

## Data Integrity
- `NUMERIC(10,2)` for all money columns.
- Unique invoice numbers.
- One payment per invoice (`UNIQUE(invoice_id)` in payments).
- Invoice status enum: `DRAFT`, `FINALIZED`, `VOID`.

## Security and Isolation
- Admin: unrestricted cross-branch data access.
- Branch manager: all financial queries are filtered by `branch_id`.
- Sensitive workflows are guarded by role checks in API dependencies + services.

## Frontend
- React + TypeScript scaffold.
- Axios API client with JWT interceptor.
- Module pages: Dashboard, Invoices, Reports.

## Deployment Baseline
- Backend container + managed PostgreSQL.
- Frontend on Vercel/Netlify.
- Follow-up: Alembic migrations, Redis cache, background jobs.
