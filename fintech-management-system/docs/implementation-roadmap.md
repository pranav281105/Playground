# Implementation Roadmap

This document outlines the delivery phases of the FinTech Management System.

## Phase 1: Core Financial Platform (Completed & Shipped)
- **Monorepo Scaffold**: Integrated Vite-React SPA frontend and FastAPI backend with local/Docker configurations.
- **Hierarchical Access Controls**: Role-based access control (RBAC) with scoped filters (Owner, Business Manager, Branch Manager isolation).
- **Core Domain Schema**: Established PostgreSQL relational tables and SQLAlchemy ORM models.
- **Deterministic Financial Engine**: Python `Decimal` money math for precise, floating-point-free calculations.
- **Invoice Lifecycle State Machine**: Implemented locked transitions (`DRAFT` -> `FINALIZED` -> `VOID`) to secure revenue reporting.
- **Bulk Imports**: Client-side Excel/CSV sheet parsing (via SheetJS) with format validation and bulk upload APIs.
- **Accounts Receivable (AR)**: Tracks customer collections, partial payments, and outstanding balances.
- **Accounts Payable (AP)**: Supplier registry directory and outbound vendor payment logging.
- **Operational Expense Registry**: Tracking system for Fixed, Variable, and Failure costs.
- **Consolidated Dashboard & Reporting**: Visual time-series trends (Recharts), side-by-side branch comparisons, and income statements/cash flow report compile logic.
- **System Auditing Service**: Interceptor logging database edits (before-and-after values) into JSON audit trails.

## Phase 2: Active Development Backlog (Next Steps)
Refer to [todo-backlog.md](file:///Users/pranav/Documents/Playground/fintech-management-system/docs/todo-backlog.md) for detailed scopes.
- **Dashboard Date-Range Filters**: Preset filters (This Month, Last Month, YTD) and custom calendar date range controls.
- **Due-Date Invoicing**: Adding a due-date field to invoices to enable precise customer aging buckets (`0-30`, `31-60`, `61-90`, `90+` days).
- **Recurring Expenses**: Support for automated monthly fixed-cost entries (e.g., rent, baseline utilities).
- **Vendor Scorecards**: Supplier metrics monitoring for return rate, defect analysis, and trade volume.

## Phase 3: Reporting & Analytics Parity
- **Export Formats**: PDF invoice generation and stylized Excel reports (maintaining grid styling and structure).
- **Custom Report Builder**: Drag-and-drop builder for custom columns, groupings, and filters.
- **Tax & Compliance Module**: GST toggle computation, tax liability summaries, and audit reports.
