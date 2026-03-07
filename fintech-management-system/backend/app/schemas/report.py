from decimal import Decimal

from pydantic import BaseModel


class IncomeStatementReport(BaseModel):
    total_revenue: Decimal
    total_gross_profit: Decimal
    total_fixed_costs: Decimal
    total_variable_costs: Decimal
    total_failure_costs: Decimal
    net_income: Decimal
