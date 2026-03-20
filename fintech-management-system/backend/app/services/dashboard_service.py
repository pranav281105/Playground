from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import FailureCost, FixedCost, Invoice, User, VariableCost
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.dashboard import CostBreakdownPoint, DashboardSummary, RevenueTrendPoint
from app.services.financial_engine import calculate_gp_margin, calculate_net_income, quantize_money


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _invoice_filter(self, user: User):
        if user.role == UserRole.ADMIN:
            return []
        return [Invoice.branch_id == user.branch_id]

    def get_summary(self, user: User) -> DashboardSummary:
        revenue_filter = [Invoice.status == InvoiceStatus.FINALIZED, *self._invoice_filter(user)]
        branch_filters = [] if user.role == UserRole.ADMIN else [FixedCost.branch_id == user.branch_id]
        variable_filters = [] if user.role == UserRole.ADMIN else [VariableCost.branch_id == user.branch_id]
        failure_filters = [] if user.role == UserRole.ADMIN else [FailureCost.branch_id == user.branch_id]

        total_revenue = self.db.execute(
            select(func.coalesce(func.sum(Invoice.sales_amount), 0)).where(*revenue_filter)
        ).scalar_one()
        gross_profit = self.db.execute(
            select(func.coalesce(func.sum(Invoice.gross_profit), 0)).where(*revenue_filter)
        ).scalar_one()

        fixed_costs = self.db.execute(
            select(func.coalesce(func.sum(FixedCost.amount), 0)).where(*branch_filters)
        ).scalar_one()
        variable_costs = self.db.execute(
            select(func.coalesce(func.sum(VariableCost.amount), 0)).where(*variable_filters)
        ).scalar_one()
        failure_costs = self.db.execute(
            select(func.coalesce(func.sum(FailureCost.amount), 0)).where(*failure_filters)
        ).scalar_one()

        total_costs = quantize_money(Decimal(str(fixed_costs + variable_costs + failure_costs)))
        gp = quantize_money(Decimal(str(gross_profit)))
        revenue = quantize_money(Decimal(str(total_revenue)))
        net_income = calculate_net_income(gp, Decimal(str(fixed_costs)), Decimal(str(variable_costs)), Decimal(str(failure_costs)))

        gross_margin = calculate_gp_margin(gp, revenue)
        net_margin = calculate_gp_margin(net_income, revenue)

        return DashboardSummary(
            total_revenue=revenue,
            gross_profit=gp,
            total_costs=total_costs,
            net_income=net_income,
            gross_profit_margin=gross_margin,
            net_margin=net_margin,
        )

    def revenue_trend(self, user: User, months: int = 6) -> list[RevenueTrendPoint]:
        if months < 1:
            months = 1
        if months > 24:
            months = 24

        start_date = self._months_ago(months - 1)
        filters = [Invoice.status == InvoiceStatus.FINALIZED, Invoice.invoice_date >= start_date]
        if user.role != UserRole.ADMIN:
            filters.append(Invoice.branch_id == user.branch_id)

        query = (
            select(
                func.extract("year", Invoice.invoice_date).label("year"),
                func.extract("month", Invoice.invoice_date).label("month"),
                func.coalesce(func.sum(Invoice.sales_amount), 0).label("revenue"),
                func.coalesce(func.sum(Invoice.gross_profit), 0).label("gross_profit"),
            )
            .where(*filters)
            .group_by(func.extract("year", Invoice.invoice_date), func.extract("month", Invoice.invoice_date))
            .order_by(
                func.extract("year", Invoice.invoice_date).asc(),
                func.extract("month", Invoice.invoice_date).asc(),
            )
        )
        rows = self.db.execute(query).all()
        return [
            RevenueTrendPoint(
                month=f"{int(row.year):04d}-{int(row.month):02d}",
                revenue=quantize_money(Decimal(str(row.revenue))),
                gross_profit=quantize_money(Decimal(str(row.gross_profit))),
            )
            for row in rows
        ]

    def cost_breakdown(self, user: User) -> list[CostBreakdownPoint]:
        fixed_query = select(func.coalesce(func.sum(FixedCost.amount), 0))
        variable_query = select(func.coalesce(func.sum(VariableCost.amount), 0))
        failure_query = select(func.coalesce(func.sum(FailureCost.amount), 0))
        if user.role != UserRole.ADMIN:
            fixed_query = fixed_query.where(FixedCost.branch_id == user.branch_id)
            variable_query = variable_query.where(VariableCost.branch_id == user.branch_id)
            failure_query = failure_query.where(FailureCost.branch_id == user.branch_id)

        fixed_total = Decimal(str(self.db.execute(fixed_query).scalar_one()))
        variable_total = Decimal(str(self.db.execute(variable_query).scalar_one()))
        failure_total = Decimal(str(self.db.execute(failure_query).scalar_one()))

        return [
            CostBreakdownPoint(category="Fixed", amount=quantize_money(fixed_total)),
            CostBreakdownPoint(category="Variable", amount=quantize_money(variable_total)),
            CostBreakdownPoint(category="Failure", amount=quantize_money(failure_total)),
        ]

    @staticmethod
    def _months_ago(months_back: int) -> date:
        today = date.today()
        year = today.year
        month = today.month - months_back
        while month <= 0:
            month += 12
            year -= 1
        return date(year, month, 1)
