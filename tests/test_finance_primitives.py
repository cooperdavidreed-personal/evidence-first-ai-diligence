from datetime import date
from decimal import Decimal

import pytest

from underwriting_lab.contracts import UnderwritingError
from underwriting_lab.finance import (
    DatedCashFlow,
    DebtTerms,
    OperatingMonth,
    build_debt_schedule,
    build_sources_and_uses,
    maximum_bid_cents,
    npv_cents,
    xirr,
)


def _operating_month(month: int, ebitda: int = 20_000_000) -> OperatingMonth:
    return OperatingMonth(
        month=month,
        ebitda_cents=ebitda,
        capex_cents=1_000_000,
        delta_working_capital_cents=500_000,
        tax_depreciation_cents=800_000,
        deductible_fee_amortization_cents=100_000,
        cash_tax_rate=Decimal("0.25"),
        lender_ebitda_cents=ebitda,
    )


def test_sources_and_uses_excludes_undrawn_revolver_capacity() -> None:
    model = build_sources_and_uses(
        uses_cents={"purchase_equity": 1_000_000_000, "fees": 50_000_000, "minimum_cash": 25_000_000},
        funded_sources_cents={"funded_term_debt_net_oid": 500_000_000},
        revolver_commitment_cents=100_000_000,
    )
    assert model.sponsor_equity_cents == 575_000_000
    assert model.undrawn_revolver_commitment_cents == 100_000_000
    assert model.total_sources_cents == model.total_uses_cents
    with pytest.raises(UnderwritingError, match="undrawn_revolver_is_not_closing_source"):
        build_sources_and_uses(
            uses_cents={"purchase": 100},
            funded_sources_cents={"undrawn_revolver_commitment": 50},
            revolver_commitment_cents=50,
        )


def test_monthly_debt_schedule_reconciles_and_computes_status() -> None:
    terms = DebtTerms(
        term_opening_cents=600_000_000,
        revolver_opening_cents=0,
        revolver_commitment_cents=100_000_000,
        annual_cash_rate=Decimal("0.09"),
        annual_pik_rate=Decimal("0.01"),
        annual_mandatory_amortization_rate=Decimal("0.02"),
        sweep_rate=Decimal("0.50"),
        minimum_cash_cents=25_000_000,
        maximum_gross_leverage=Decimal("4.25"),
    )
    schedule = build_debt_schedule(
        terms=terms,
        operating_months=[_operating_month(month) for month in range(1, 13)],
        opening_cash_cents=25_000_000,
        preclose_lender_ebitda_cents=[20_000_000] * 11,
    )
    assert len(schedule.months) == 12
    assert schedule.ending_debt_cents < terms.term_opening_cents
    assert not schedule.has_payment_default
    assert schedule.first_covenant_breach_month is None
    for previous, current in zip(schedule.months, schedule.months[1:], strict=False):
        assert previous.ending_cash_cents == current.beginning_cash_cents
        assert previous.ending_term_cents == current.beginning_term_cents
        assert previous.ending_revolver_cents == current.beginning_revolver_cents


def test_debt_schedule_draws_revolver_but_never_counts_capacity_as_cash() -> None:
    terms = DebtTerms(
        term_opening_cents=600_000_000,
        revolver_opening_cents=0,
        revolver_commitment_cents=50_000_000,
        annual_cash_rate=Decimal("0.10"),
        annual_pik_rate=Decimal("0"),
        annual_mandatory_amortization_rate=Decimal("0"),
        sweep_rate=Decimal("0"),
        minimum_cash_cents=25_000_000,
        maximum_gross_leverage=Decimal("10"),
    )
    weak = _operating_month(1, ebitda=-10_000_000)
    schedule = build_debt_schedule(
        terms=terms,
        operating_months=[weak],
        opening_cash_cents=25_000_000,
        preclose_lender_ebitda_cents=[20_000_000] * 11,
    )
    assert schedule.months[0].revolver_draw_cents > 0
    assert schedule.months[0].ending_revolver_cents == schedule.months[0].revolver_draw_cents


def test_xirr_uses_dated_cash_flows_and_one_cent_npv_oracle() -> None:
    flows = [
        DatedCashFlow(date(2026, 8, 29), -100_000_000),
        DatedCashFlow(date(2031, 8, 29), 200_000_000),
    ]
    rate = xirr(flows)
    assert Decimal("0.148") < rate < Decimal("0.149")
    assert abs(npv_cents(rate, flows)) <= Decimal(1)
    with pytest.raises(UnderwritingError, match="xirr_not_identified"):
        xirr([DatedCashFlow(date(2026, 1, 1), 1), DatedCashFlow(date(2027, 1, 1), 2)])


def test_maximum_bid_is_monotone_one_dimensional_bisection() -> None:
    assert maximum_bid_cents(
        low_cents=100,
        high_cents=300,
        clears_hurdles=lambda bid: bid <= 237,
    ) == 237
