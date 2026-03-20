from decimal import Decimal

from pydantic import BaseModel


class IncomeStatementReport(BaseModel):
    total_revenue: Decimal
    total_gross_profit: Decimal
    total_fixed_costs: Decimal
    total_variable_costs: Decimal
    total_failure_costs: Decimal
    net_income: Decimal


class RevenueSummaryItem(BaseModel):
    month: str
    total_revenue: Decimal
    total_gross_profit: Decimal
    gross_margin: Decimal


class CashFlowReport(BaseModel):
    opening_balance: Decimal
    cash_received: Decimal
    cash_paid: Decimal
    closing_balance: Decimal
