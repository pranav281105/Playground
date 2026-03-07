# Implementation Roadmap (Lead Plan)

## Sprint 1 (Completed in this scaffold)
- Monorepo setup (backend/frontend/docs).
- Core domain schema and enums.
- JWT auth, RBAC guards, branch isolation checks.
- Invoice lifecycle API and service policy.
- Deterministic financial engine + tests.
- Dashboard summary and income statement endpoints.

## Sprint 2
- Alembic migrations and seed data script.
- Invoice list filters and sorting API.
- Payment aging buckets and payable reminders.
- Vendor and branch manager management flows.
- Audit log query endpoint (admin-only).

## Sprint 3
- Full dashboard charts (`revenue-trend`, `cost-breakdown`).
- Report exports (CSV, Excel, PDF).
- Role-specific frontend routes and forms.
- Integration tests and performance benchmarks against target SLAs.

## Go-Live Hardening
- Rate limits and API request logging middleware.
- Dockerized backend + environment promotion configs.
- Backup/restore runbook and release checklist.
