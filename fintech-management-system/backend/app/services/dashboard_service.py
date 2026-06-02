from datetime import date
from decimal import Decimal
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Branch, Business, FailureCost, FixedCost, Invoice, User, VariableCost
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.dashboard import BusinessPerformancePoint, CostBreakdownPoint, DashboardSummary, RevenueTrendPoint
from app.services.financial_engine import calculate_gp_margin, calculate_net_income, quantize_money
from app.services.scope_service import apply_scope_filters


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_summary(
        self,
        user: User,
        *,
        business_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> DashboardSummary:
        invoice_query = apply_scope_filters(
            select(func.coalesce(func.sum(Invoice.sales_amount), 0)).where(Invoice.status == InvoiceStatus.FINALIZED),
            db=self.db,
            current_user=user,
            branch_column=Invoice.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )
        total_revenue = self.db.execute(invoice_query).scalar_one()
        gp_query = apply_scope_filters(
            select(func.coalesce(func.sum(Invoice.gross_profit), 0)).where(Invoice.status == InvoiceStatus.FINALIZED),
            db=self.db,
            current_user=user,
            branch_column=Invoice.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )
        gross_profit = self.db.execute(gp_query).scalar_one()

        fixed_costs = self.db.execute(
            apply_scope_filters(
                select(func.coalesce(func.sum(FixedCost.amount), 0)),
                db=self.db,
                current_user=user,
                branch_column=FixedCost.branch_id,
                business_id=business_id,
                branch_id=branch_id,
            )
        ).scalar_one()
        variable_costs = self.db.execute(
            apply_scope_filters(
                select(func.coalesce(func.sum(VariableCost.amount), 0)),
                db=self.db,
                current_user=user,
                branch_column=VariableCost.branch_id,
                business_id=business_id,
                branch_id=branch_id,
            )
        ).scalar_one()
        failure_costs = self.db.execute(
            apply_scope_filters(
                select(func.coalesce(func.sum(FailureCost.amount), 0)),
                db=self.db,
                current_user=user,
                branch_column=FailureCost.branch_id,
                business_id=business_id,
                branch_id=branch_id,
            )
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

    def revenue_trend(
        self,
        user: User,
        *,
        months: int = 6,
        business_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> list[RevenueTrendPoint]:
        if months < 1:
            months = 1
        if months > 24:
            months = 24

        start_date = self._months_ago(months - 1)
        query = (
            select(
                func.extract("year", Invoice.invoice_date).label("year"),
                func.extract("month", Invoice.invoice_date).label("month"),
                func.coalesce(func.sum(Invoice.sales_amount), 0).label("revenue"),
                func.coalesce(func.sum(Invoice.gross_profit), 0).label("gross_profit"),
            )
            .where(Invoice.status == InvoiceStatus.FINALIZED, Invoice.invoice_date >= start_date)
            .group_by(func.extract("year", Invoice.invoice_date), func.extract("month", Invoice.invoice_date))
            .order_by(
                func.extract("year", Invoice.invoice_date).asc(),
                func.extract("month", Invoice.invoice_date).asc(),
            )
        )
        query = apply_scope_filters(
            query,
            db=self.db,
            current_user=user,
            branch_column=Invoice.branch_id,
            business_id=business_id,
            branch_id=branch_id,
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

    def cost_breakdown(
        self,
        user: User,
        *,
        business_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> list[CostBreakdownPoint]:
        fixed_query = apply_scope_filters(
            select(func.coalesce(func.sum(FixedCost.amount), 0)),
            db=self.db,
            current_user=user,
            branch_column=FixedCost.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )
        variable_query = apply_scope_filters(
            select(func.coalesce(func.sum(VariableCost.amount), 0)),
            db=self.db,
            current_user=user,
            branch_column=VariableCost.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )
        failure_query = apply_scope_filters(
            select(func.coalesce(func.sum(FailureCost.amount), 0)),
            db=self.db,
            current_user=user,
            branch_column=FailureCost.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )

        fixed_total = Decimal(str(self.db.execute(fixed_query).scalar_one()))
        variable_total = Decimal(str(self.db.execute(variable_query).scalar_one()))
        failure_total = Decimal(str(self.db.execute(failure_query).scalar_one()))

        return [
            CostBreakdownPoint(category="Fixed", amount=quantize_money(fixed_total)),
            CostBreakdownPoint(category="Variable", amount=quantize_money(variable_total)),
            CostBreakdownPoint(category="Failure", amount=quantize_money(failure_total)),
        ]

    def business_performance(
        self,
        user: User,
        *,
        year: int | None = None,
        business_id: uuid.UUID | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> list[BusinessPerformancePoint]:
        if user.role == UserRole.BUSINESS_MANAGER and business_id is not None and user.business_id != business_id:
            return []
        if user.role == UserRole.BRANCH_MANAGER and business_id is not None:
            return []

        business_query = select(Business.business_id, Business.business_name)
        if user.role == UserRole.BUSINESS_MANAGER:
            if user.business_id is None:
                return []
            business_query = business_query.where(Business.business_id == user.business_id)
        elif user.role == UserRole.BRANCH_MANAGER:
            if user.branch_id is None:
                return []
            branch_business_id = self.db.execute(
                select(Branch.business_id).where(Branch.branch_id == user.branch_id)
            ).scalar_one_or_none()
            if branch_business_id is None:
                return []
            business_query = business_query.where(Business.business_id == branch_business_id)
        elif business_id is not None:
            business_query = business_query.where(Business.business_id == business_id)

        businesses = list(self.db.execute(business_query.order_by(Business.business_name.asc())).all())
        if not businesses:
            return []

        business_ids = [row.business_id for row in businesses]

        revenue_query = (
            select(
                Branch.business_id.label("business_id"),
                func.coalesce(func.sum(Invoice.sales_amount), 0).label("revenue"),
                func.coalesce(func.sum(Invoice.gross_profit), 0).label("gross_profit"),
            )
            .join(Branch, Branch.branch_id == Invoice.branch_id)
            .where(Invoice.status == InvoiceStatus.FINALIZED, Branch.business_id.in_(business_ids))
            .group_by(Branch.business_id)
        )
        if year is not None:
            revenue_query = revenue_query.where(func.extract("year", Invoice.invoice_date) == year)
        revenue_query = apply_scope_filters(
            revenue_query,
            db=self.db,
            current_user=user,
            branch_column=Invoice.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )
        revenue_rows = self.db.execute(revenue_query).all()
        revenue_map = {
            row.business_id: (
                Decimal(str(row.revenue)),
                Decimal(str(row.gross_profit)),
            )
            for row in revenue_rows
        }

        fixed_query = (
            select(
                Branch.business_id.label("business_id"),
                func.coalesce(func.sum(FixedCost.amount), 0).label("amount"),
            )
            .join(Branch, Branch.branch_id == FixedCost.branch_id)
            .where(Branch.business_id.in_(business_ids))
            .group_by(Branch.business_id)
        )
        if year is not None:
            fixed_query = fixed_query.where(func.extract("year", FixedCost.date) == year)
        fixed_query = apply_scope_filters(
            fixed_query,
            db=self.db,
            current_user=user,
            branch_column=FixedCost.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )

        variable_query = (
            select(
                Branch.business_id.label("business_id"),
                func.coalesce(func.sum(VariableCost.amount), 0).label("amount"),
            )
            .join(Branch, Branch.branch_id == VariableCost.branch_id)
            .where(Branch.business_id.in_(business_ids))
            .group_by(Branch.business_id)
        )
        if year is not None:
            variable_query = variable_query.where(func.extract("year", VariableCost.date) == year)
        variable_query = apply_scope_filters(
            variable_query,
            db=self.db,
            current_user=user,
            branch_column=VariableCost.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )

        failure_query = (
            select(
                Branch.business_id.label("business_id"),
                func.coalesce(func.sum(FailureCost.amount), 0).label("amount"),
            )
            .join(Branch, Branch.branch_id == FailureCost.branch_id)
            .where(Branch.business_id.in_(business_ids))
            .group_by(Branch.business_id)
        )
        if year is not None:
            failure_query = failure_query.where(func.extract("year", FailureCost.date) == year)
        failure_query = apply_scope_filters(
            failure_query,
            db=self.db,
            current_user=user,
            branch_column=FailureCost.branch_id,
            business_id=business_id,
            branch_id=branch_id,
        )

        costs_map: dict[uuid.UUID, Decimal] = {}
        for rows in (self.db.execute(fixed_query).all(), self.db.execute(variable_query).all(), self.db.execute(failure_query).all()):
            for row in rows:
                costs_map[row.business_id] = costs_map.get(row.business_id, Decimal("0")) + Decimal(str(row.amount))

        results: list[BusinessPerformancePoint] = []
        for business in businesses:
            revenue_raw, gp_raw = revenue_map.get(business.business_id, (Decimal("0"), Decimal("0")))
            costs_raw = costs_map.get(business.business_id, Decimal("0"))
            revenue = quantize_money(revenue_raw)
            gross_profit = quantize_money(gp_raw)
            total_costs = quantize_money(costs_raw)
            net_income = calculate_net_income(gross_profit, total_costs, Decimal("0"), Decimal("0"))
            results.append(
                BusinessPerformancePoint(
                    business_id=str(business.business_id),
                    business_name=business.business_name,
                    revenue=revenue,
                    gross_profit=gross_profit,
                    total_costs=total_costs,
                    net_income=net_income,
                    gross_profit_margin=calculate_gp_margin(gross_profit, revenue),
                )
            )

        return results

    @staticmethod
    def _months_ago(months_back: int) -> date:
        today = date.today()
        year = today.year
        month = today.month - months_back
        while month <= 0:
            month += 12
            year -= 1
        return date(year, month, 1)
