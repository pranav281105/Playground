# Requirements Analysis (Source: CLAUDE(F), PRD, FRD, SAD, ER)

## Scope Locked for Phase 1 (MVP)
- Authentication with JWT and RBAC.
- Revenue management with strict invoice lifecycle.
- Cost tracking (fixed, variable, failure).
- Payment tracking (AR + AP baseline structures).
- Net income and dashboard summary calculations.
- Basic reports API endpoints.

## Conflicts Found and Resolution
1. GST handling:
- Mapping doc contains GST toggle and GST report references.
- `CLAUDE (F).md` explicitly says GST is Phase 2.
- Decision: Phase 1 stores `sales_amount` excluding GST and does not calculate GST.

2. Customer tenancy model:
- FRD text contains one statement implying shared customers.
- ER + CLAUDE schema define customers as branch-scoped (`branch_id` required).
- Decision: branch-scoped customers for Phase 1.

3. AI usage:
- Some docs mention AI features.
- `CLAUDE (F).md` forbids AI for deterministic modules in MVP.
- Decision: all calculations are deterministic Python functions; AI registry is placeholder-only.

## Core Non-Negotiable Business Rules
- Invoice lifecycle: `DRAFT -> FINALIZED -> VOID`.
- Only admin can void finalized invoice.
- Draft invoices excluded from financials.
- Branch managers are branch-isolated on all financial data.
- Money arithmetic uses Python `Decimal` only.
- Database monetary fields use `NUMERIC(10,2)` only.
