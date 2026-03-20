from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import FailureCost, FixedCost, Invoice, Payment, User, VariableCost, VendorPayment
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.report import CashFlowReport, IncomeStatementReport, RevenueSummaryItem
from app.services.financial_engine import (
    calculate_closing_balance,
    calculate_gp_margin,
    calculate_net_income,
    quantize_money,
)


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

    def revenue_summary(self, current_user: User, months: int = 6) -> list[RevenueSummaryItem]:
        if months < 1:
            months = 1
        if months > 24:
            months = 24

        filters = [Invoice.status == InvoiceStatus.FINALIZED, Invoice.invoice_date >= self._months_ago(months - 1)]
        if current_user.role != UserRole.ADMIN:
            filters.append(Invoice.branch_id == current_user.branch_id)

        query = (
            select(
                func.extract("year", Invoice.invoice_date).label("year"),
                func.extract("month", Invoice.invoice_date).label("month"),
                func.coalesce(func.sum(Invoice.sales_amount), 0).label("total_revenue"),
                func.coalesce(func.sum(Invoice.gross_profit), 0).label("total_gross_profit"),
            )
            .where(*filters)
            .group_by(func.extract("year", Invoice.invoice_date), func.extract("month", Invoice.invoice_date))
            .order_by(
                func.extract("year", Invoice.invoice_date).asc(),
                func.extract("month", Invoice.invoice_date).asc(),
            )
        )

        rows = self.db.execute(query).all()
        summary: list[RevenueSummaryItem] = []
        for row in rows:
            revenue = quantize_money(Decimal(str(row.total_revenue)))
            gp = quantize_money(Decimal(str(row.total_gross_profit)))
            summary.append(
                RevenueSummaryItem(
                    month=f"{int(row.year):04d}-{int(row.month):02d}",
                    total_revenue=revenue,
                    total_gross_profit=gp,
                    gross_margin=calculate_gp_margin(gp, revenue),
                )
            )
        return summary

    def cash_flow(self, current_user: User, opening_balance: Decimal) -> CashFlowReport:
        payment_query = (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .join(Invoice, Payment.invoice_id == Invoice.invoice_id)
            .where(Invoice.status == InvoiceStatus.FINALIZED)
        )
        fixed_query = select(func.coalesce(func.sum(FixedCost.amount), 0))
        variable_query = select(func.coalesce(func.sum(VariableCost.amount), 0))
        failure_query = select(func.coalesce(func.sum(FailureCost.amount), 0))
        vendor_payment_query = select(func.coalesce(func.sum(VendorPayment.amount), 0))

        if current_user.role != UserRole.ADMIN:
            payment_query = payment_query.where(Invoice.branch_id == current_user.branch_id)
            fixed_query = fixed_query.where(FixedCost.branch_id == current_user.branch_id)
            variable_query = variable_query.where(VariableCost.branch_id == current_user.branch_id)
            failure_query = failure_query.where(FailureCost.branch_id == current_user.branch_id)
            vendor_payment_query = vendor_payment_query.where(VendorPayment.branch_id == current_user.branch_id)

        cash_received = Decimal(str(self.db.execute(payment_query).scalar_one()))
        fixed_costs = Decimal(str(self.db.execute(fixed_query).scalar_one()))
        variable_costs = Decimal(str(self.db.execute(variable_query).scalar_one()))
        failure_costs = Decimal(str(self.db.execute(failure_query).scalar_one()))
        vendor_payments = Decimal(str(self.db.execute(vendor_payment_query).scalar_one()))

        cash_paid = fixed_costs + variable_costs + failure_costs + vendor_payments
        opening = quantize_money(opening_balance)
        closing = calculate_closing_balance(opening, cash_received, cash_paid)
        return CashFlowReport(
            opening_balance=opening,
            cash_received=quantize_money(cash_received),
            cash_paid=quantize_money(cash_paid),
            closing_balance=closing,
        )

    @staticmethod
    def _months_ago(months_back: int) -> date:
        today = date.today()
        year = today.year
        month = today.month - months_back
        while month <= 0:
            month += 12
            year -= 1
        return date(year, month, 1)
