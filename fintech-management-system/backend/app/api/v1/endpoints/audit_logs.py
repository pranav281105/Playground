import csv
from io import StringIO

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.deps import AdminUser, DbSession
from app.schemas.audit import AuditLogResponse
from app.services.audit_query_service import AuditQueryService

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    db: DbSession,
    current_user: AdminUser,
    entity: str | None = Query(default=None),
) -> list[AuditLogResponse]:
    records = AuditQueryService(db).list_audit_logs(current_user, entity=entity)
    return [AuditLogResponse.model_validate(record) for record in records]


@router.get("/export")
def export_audit_logs(
    db: DbSession,
    current_user: AdminUser,
    entity: str | None = Query(default=None),
) -> Response:
    records = AuditQueryService(db).list_audit_logs(current_user, entity=entity)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["audit_id", "timestamp", "user_id", "branch_id", "action", "entity", "entity_id"])
    for record in records:
        writer.writerow(
            [
                record.audit_id,
                record.timestamp.isoformat(),
                record.user_id,
                record.branch_id,
                record.action,
                record.entity,
                record.entity_id,
            ]
        )

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )
