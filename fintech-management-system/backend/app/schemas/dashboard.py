from decimal import Decimal

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    total_revenue: Decimal
    gross_profit: Decimal
    total_costs: Decimal
    net_income: Decimal
    gross_profit_margin: Decimal
    net_margin: Decimal
