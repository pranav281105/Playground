# Backup and Release Runbook

## Database Backup
1. Run a logical backup before release:
   - `pg_dump "$DATABASE_URL" --format=custom --file=backup-$(date +%Y%m%d-%H%M).dump`
2. Verify backup integrity:
   - `pg_restore --list backup-<timestamp>.dump`
3. Store backup in off-site object storage with retention policy.

## Pre-Release Checklist
1. `alembic upgrade head` on staging.
2. Run backend test suite: `python3 -m pytest -q`.
3. Run frontend build: `npm run build`.
4. Verify smoke flows:
   - Login
   - Create/finalize invoice
   - Record payment
   - Add cost
   - Dashboard/report load

## Release Steps
1. Deploy backend image.
2. Run migrations on production database.
3. Deploy frontend static build.
4. Verify health endpoints and key business flows.

## Rollback Steps
1. Revert application deployment to previous stable image/build.
2. Restore latest verified backup if data rollback is required.
3. Run post-restore validation queries.

## Operational Observability
- Request logs are JSON payloads emitted by `RequestLoggingMiddleware`.
- Rate limiting is enforced by `RateLimitMiddleware`.
- Monitor 429/5xx rates and p95 latency.
