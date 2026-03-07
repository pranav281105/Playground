from decimal import Decimal

from app.services.financial_engine import (
    calculate_closing_balance,
    calculate_cogs,
    calculate_gp_margin,
    calculate_net_income,
    get_payment_status,
)


def test_calculate_cogs_matches_excel_reference() -> None:
    assert calculate_cogs(Decimal("784.80"), Decimal("70.00")) == Decimal("714.80")


def test_calculate_gp_margin() -> None:
    assert calculate_gp_margin(Decimal("70.00"), Decimal("784.80")) == Decimal("8.92")


def test_calculate_net_income() -> None:
    result = calculate_net_income(
        Decimal("1000.00"),
        Decimal("200.00"),
        Decimal("300.00"),
        Decimal("100.00"),
    )
    assert result == Decimal("400.00")


def test_calculate_closing_balance() -> None:
    assert calculate_closing_balance(Decimal("100.00"), Decimal("50.00"), Decimal("20.00")) == Decimal("130.00")


def test_payment_status_logic() -> None:
    assert get_payment_status(Decimal("100.00"), Decimal("0.00")) == "Pending"
    assert get_payment_status(Decimal("100.00"), Decimal("30.00")) == "Partial"
    assert get_payment_status(Decimal("100.00"), Decimal("100.00")) == "Paid"
