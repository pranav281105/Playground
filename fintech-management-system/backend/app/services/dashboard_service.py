from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import FailureCost, FixedCost, Invoice, User, VariableCost
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.dashboard import DashboardSummary
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
