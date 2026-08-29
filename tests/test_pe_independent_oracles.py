from __future__ import annotations

from dataclasses import asdict
from datetime import date
from decimal import Decimal
import random

from underwriting_lab.finance import (
    DatedCashFlow,
    DebtTerms,
    OperatingMonth,
    build_debt_schedule,
    xirr,
)

from .oracles.debt_reference import reference_debt_schedule
from .oracles.xirr_reference import reference_npv, reference_xirr


def _random_case(rng: random.Random) -> tuple[DebtTerms, list[OperatingMonth], int, list[int]]:
    opening_term = rng.randrange(50_000_000, 1_000_000_001)
    minimum_cash = rng.randrange(2_000_000, 30_000_001)
    terms = DebtTerms(
        term_opening_cents=opening_term,
        revolver_opening_cents=0,
        revolver_commitment_cents=rng.randrange(20_000_000, 150_000_001),
        annual_cash_rate=Decimal(rng.randrange(500, 1401)) / Decimal(10_000),
        annual_pik_rate=Decimal(rng.randrange(0, 301)) / Decimal(10_000),
        annual_mandatory_amortization_rate=Decimal(rng.randrange(0, 501)) / Decimal(10_000),
        sweep_rate=Decimal(rng.randrange(0, 101)) / Decimal(100),
        minimum_cash_cents=minimum_cash,
        maximum_gross_leverage=Decimal(rng.randrange(350, 801)) / Decimal(100),
        maturity_months=72,
    )
    operating = [
        OperatingMonth(
            month=month,
            ebitda_cents=rng.randrange(5_000_000, 60_000_001),
            capex_cents=rng.randrange(0, 5_000_001),
            delta_working_capital_cents=rng.randrange(-2_000_000, 4_000_001),
            tax_depreciation_cents=rng.randrange(0, 4_000_001),
            deductible_fee_amortization_cents=rng.randrange(0, 1_000_001),
            cash_tax_rate=Decimal(rng.randrange(0, 3101)) / Decimal(10_000),
            lender_ebitda_cents=rng.randrange(8_000_000, 65_000_001),
        )
        for month in range(1, 13)
    ]
    opening_cash = minimum_cash + rng.randrange(0, 20_000_001)
    preclose = [rng.randrange(8_000_000, 65_000_001) for _ in range(11)]
    return terms, operating, opening_cash, preclose


def test_debt_schedule_matches_independent_oracle_for_500_generated_examples() -> None:
    rng = random.Random(20260829)
    for _ in range(500):
        terms, operating, opening_cash, preclose = _random_case(rng)
        actual = build_debt_schedule(
            terms=terms,
            operating_months=operating,
            opening_cash_cents=opening_cash,
            preclose_lender_ebitda_cents=preclose,
        )
        expected = reference_debt_schedule(
            term_opening_cents=terms.term_opening_cents,
            revolver_opening_cents=terms.revolver_opening_cents,
            revolver_commitment_cents=terms.revolver_commitment_cents,
            annual_cash_rate=terms.annual_cash_rate,
            annual_pik_rate=terms.annual_pik_rate,
            annual_mandatory_amortization_rate=terms.annual_mandatory_amortization_rate,
            sweep_rate=terms.sweep_rate,
            minimum_cash_cents=terms.minimum_cash_cents,
            maximum_gross_leverage=terms.maximum_gross_leverage,
            opening_cash_cents=opening_cash,
            preclose_lender_ebitda_cents=preclose,
            operating_months=[
                {**asdict(item), "cash_tax_rate": str(item.cash_tax_rate)}
                for item in operating
            ],
        )
        assert len(actual.months) == len(expected)
        for actual_month, expected_month in zip(actual.months, expected, strict=True):
            for field, value in expected_month.items():
                assert getattr(actual_month, field) == value


def test_accounting_invariants_hold_across_100_explicit_seeds() -> None:
    for seed in range(100):
        terms, operating, opening_cash, preclose = _random_case(random.Random(seed))
        schedule = build_debt_schedule(
            terms=terms,
            operating_months=operating,
            opening_cash_cents=opening_cash,
            preclose_lender_ebitda_cents=preclose,
        )
        assert all(value == 0 for value in schedule.reconciliation.values())
        for previous, current in zip(
            schedule.months, schedule.months[1:], strict=False
        ):
            assert previous.ending_cash_cents == current.beginning_cash_cents
            assert previous.ending_term_cents == current.beginning_term_cents
            assert previous.ending_revolver_cents == current.beginning_revolver_cents


def test_decimal_xirr_matches_independent_brent_oracle_on_irregular_dates() -> None:
    fixtures = [
        [
            (date(2026, 1, 31), -100_000_000),
            (date(2027, 3, 17), -15_000_000),
            (date(2030, 11, 5), 240_000_000),
        ],
        [
            (date(2024, 2, 29), -725_000_000),
            (date(2025, 7, 1), 50_000_000),
            (date(2029, 2, 28), 1_100_000_000),
        ],
    ]
    for fixture in fixtures:
        actual = xirr([DatedCashFlow(when, amount) for when, amount in fixture])
        expected = reference_xirr(fixture)
        assert abs(float(actual) - expected) < 1e-8
        assert abs(reference_npv(float(actual), fixture)) <= 1.5


def test_irregular_xirr_is_not_moic_cagr() -> None:
    fixture = [
        DatedCashFlow(date(2026, 1, 1), -100_000_000),
        DatedCashFlow(date(2027, 1, 1), -50_000_000),
        DatedCashFlow(date(2031, 1, 1), 300_000_000),
    ]
    actual = xirr(fixture)
    moic_cagr = (Decimal(2) ** (Decimal(1) / Decimal(5))) - Decimal(1)
    assert abs(actual - moic_cagr) > Decimal("0.01")
