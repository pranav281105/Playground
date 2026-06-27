# Architecture Overview

## Backend
- **Framework**: FastAPI.
- **Pattern**: API Layer (Routers & Dependencies) -> Service Layer -> Repository/ORM Layer -> PostgreSQL.
- **Auth**: JWT bearer tokens, role-based authorization (RBAC) with user scope injection.
- **Domain Services**:
  - `AuthService`: Handles user login, registration, and token validation.
  - `ScopeService` & `AccessControl`: Resolves and enforces organizational hierarchy data boundaries.
  - `InvoiceService`: Manages sales invoices, lifecycle locks (`DRAFT` -> `FINALIZED` -> `VOID`), and bulk imports.
  - `PaymentService`: Tracks Accounts Receivable collections and aging summaries.
  - `CostService`: Manages Fixed, Variable, and Failure cost registries.
  - `VendorService`: Supplier directory profiles database entries.
  - `VendorPaymentService`: Tracks Accounts Payable outflows to suppliers.
  - `DashboardService`: Aggregates company/business/branch metrics and Recharts trends.
  - `ReportingService`: Compiles Income Statements, Revenue Summaries, and Cash Flow statements.
  - `AuditService` & `AuditQueryService`: Automatic change interception logging and admin viewing query logic.
- **Financial Calculation Engine**: Deterministic exact decimal math calculations in `app/services/financial_engine.py`.

## Data Integrity
- `NUMERIC(10,2)` for all money columns in PostgreSQL.
- Unique invoice numbers.
- Accounts Receivable: Logs customer collections against finalized invoices.
- Accounts Payable: Logs supplier bills and disbursements against registered vendors.
- Invoice status enum: `DRAFT`, `FINALIZED`, `VOID`.

## Security and Isolation
- **Owner / Administrator**: Unrestricted global cross-company/business/branch data access.
- **Business Manager**: All queries are automatically filtered by `business_id`.
- **Branch Manager**: All queries are automatically filtered by `branch_id`.
- Sensitive workflows (hierarchy management, invoice voiding, audit log viewing) are guarded by role checks in API dependencies.

## Frontend
- **Framework**: React 18 + TypeScript + Vite + Tailwind CSS.
- **API Client**: Axios instance with JWT interceptor.
- **State Management**: React Query (`@tanstack/react-query`) for API caching and data pre-fetching.
- **Module Pages**:
  - **Dashboard**: Financial overview metrics and charts.
  - **Invoices**: Manual creation, state validation, and Excel import.
  - **Payments**: Customer receivables ledger.
  - **Vendors**: Supplier registration and index.
  - **Vendor Payments**: Outbound supplier payments tracker.
  - **Costs**: fixed, variable, and failure overhead entry forms.
  - **Reports**: income statements, revenues, and cash flow reports.
  - **Admin**: User directory and database audit log viewer.

## Deployment Baseline
- Backend container + managed PostgreSQL (Docker Compose/AWS/Render).
- Frontend on Vercel/Netlify.
- Follow-up: Alembic migrations, Redis cache, background jobs.
