from decimal import Decimal, ROUND_HALF_UP

MONEY_QUANT = Decimal("0.01")
PERCENT_QUANT = Decimal("0.01")


def quantize_money(amount: Decimal) -> Decimal:
    return amount.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def calculate_cogs(sales_amount: Decimal, gross_profit: Decimal) -> Decimal:
    return quantize_money(sales_amount - gross_profit)


def calculate_gp_margin(gross_profit: Decimal, sales_amount: Decimal) -> Decimal:
    if sales_amount == Decimal("0"):
        return Decimal("0.00")
    return ((gross_profit / sales_amount) * Decimal("100")).quantize(PERCENT_QUANT, rounding=ROUND_HALF_UP)


def calculate_net_income(
    gross_profit: Decimal,
    fixed_costs: Decimal,
    variable_costs: Decimal,
    failure_costs: Decimal,
) -> Decimal:
    return quantize_money(gross_profit - (fixed_costs + variable_costs + failure_costs))


def calculate_closing_balance(opening_balance: Decimal, cash_received: Decimal, cash_paid: Decimal) -> Decimal:
    return quantize_money(opening_balance + cash_received - cash_paid)


def get_payment_status(invoice_amount: Decimal, paid_amount: Decimal) -> str:
    if paid_amount >= invoice_amount:
        return "Paid"
    if paid_amount > Decimal("0"):
        return "Partial"
    return "Pending"
