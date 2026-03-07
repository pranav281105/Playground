from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import FailureCost, FixedCost, Invoice, User, VariableCost
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.report import IncomeStatementReport
from app.services.financial_engine import calculate_net_income, quantize_money


class ReportingService:
    def __init__(self, db: Session):
        self.db = db

    def income_statement(self, current_user: User) -> IncomeStatementReport:
        invoice_filters = [Invoice.status == InvoiceStatus.FINALIZED]
        if current_user.role != UserRole.ADMIN:
            invoice_filters.append(Invoice.branch_id == current_user.branch_id)

        total_revenue = self.db.execute(
            select(func.coalesce(func.sum(Invoice.sales_amount), 0)).where(*invoice_filters)
        ).scalar_one()
        total_gp = self.db.execute(
            select(func.coalesce(func.sum(Invoice.gross_profit), 0)).where(*invoice_filters)
        ).scalar_one()

        fixed_query = select(func.coalesce(func.sum(FixedCost.amount), 0))
        variable_query = select(func.coalesce(func.sum(VariableCost.amount), 0))
        failure_query = select(func.coalesce(func.sum(FailureCost.amount), 0))
        if current_user.role != UserRole.ADMIN:
            fixed_query = fixed_query.where(FixedCost.branch_id == current_user.branch_id)
            variable_query = variable_query.where(VariableCost.branch_id == current_user.branch_id)
            failure_query = failure_query.where(FailureCost.branch_id == current_user.branch_id)

        fixed_costs = self.db.execute(fixed_query).scalar_one()
        variable_costs = self.db.execute(variable_query).scalar_one()
        failure_costs = self.db.execute(failure_query).scalar_one()

        net_income = calculate_net_income(
            Decimal(str(total_gp)),
            Decimal(str(fixed_costs)),
            Decimal(str(variable_costs)),
            Decimal(str(failure_costs)),
        )

        return IncomeStatementReport(
            total_revenue=quantize_money(Decimal(str(total_revenue))),
            total_gross_profit=quantize_money(Decimal(str(total_gp))),
            total_fixed_costs=quantize_money(Decimal(str(fixed_costs))),
            total_variable_costs=quantize_money(Decimal(str(variable_costs))),
            total_failure_costs=quantize_money(Decimal(str(failure_costs))),
            net_income=net_income,
        )
