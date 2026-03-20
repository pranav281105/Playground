import csv
from decimal import Decimal
from io import StringIO

from fastapi import APIRouter
from fastapi.responses import Response

from app.api.deps import CurrentUser, DbSession
from app.schemas.report import CashFlowReport, IncomeStatementReport, RevenueSummaryItem
from app.services.reporting_service import ReportingService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/income-statement", response_model=IncomeStatementReport)
def income_statement(db: DbSession, current_user: CurrentUser) -> IncomeStatementReport:
    return ReportingService(db).income_statement(current_user)


@router.get("/revenue-summary", response_model=list[RevenueSummaryItem])
def revenue_summary(db: DbSession, current_user: CurrentUser, months: int = 6) -> list[RevenueSummaryItem]:
    return ReportingService(db).revenue_summary(current_user, months=months)


@router.get("/cash-flow", response_model=CashFlowReport)
def cash_flow(
    db: DbSession,
    current_user: CurrentUser,
    opening_balance: Decimal = Decimal("0.00"),
) -> CashFlowReport:
    return ReportingService(db).cash_flow(current_user, opening_balance=opening_balance)


@router.get("/income-statement/export")
def export_income_statement(db: DbSession, current_user: CurrentUser) -> Response:
    report = ReportingService(db).income_statement(current_user)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "total_revenue",
            "total_gross_profit",
            "total_fixed_costs",
            "total_variable_costs",
            "total_failure_costs",
            "net_income",
        ]
    )
    writer.writerow(
        [
            report.total_revenue,
            report.total_gross_profit,
            report.total_fixed_costs,
            report.total_variable_costs,
            report.total_failure_costs,
            report.net_income,
        ]
    )
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=income_statement.csv"},
    )


@router.get("/revenue-summary/export")
def export_revenue_summary(db: DbSession, current_user: CurrentUser, months: int = 6) -> Response:
    rows = ReportingService(db).revenue_summary(current_user, months=months)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["month", "total_revenue", "total_gross_profit", "gross_margin"])
    for item in rows:
        writer.writerow([item.month, item.total_revenue, item.total_gross_profit, item.gross_margin])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=revenue_summary.csv"},
    )


@router.get("/cash-flow/export")
def export_cash_flow(
    db: DbSession,
    current_user: CurrentUser,
    opening_balance: Decimal = Decimal("0.00"),
) -> Response:
    report = ReportingService(db).cash_flow(current_user, opening_balance=opening_balance)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["opening_balance", "cash_received", "cash_paid", "closing_balance"])
    writer.writerow([report.opening_balance, report.cash_received, report.cash_paid, report.closing_balance])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cash_flow.csv"},
    )
