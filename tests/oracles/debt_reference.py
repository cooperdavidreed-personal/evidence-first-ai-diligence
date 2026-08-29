from __future__ import annotations

from decimal import Decimal, ROUND_HALF_EVEN


def cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))


def reference_debt_schedule(
    *,
    term_opening_cents: int,
    revolver_opening_cents: int,
    revolver_commitment_cents: int,
    annual_cash_rate: Decimal,
    annual_pik_rate: Decimal,
    annual_mandatory_amortization_rate: Decimal,
    sweep_rate: Decimal,
    minimum_cash_cents: int,
    maximum_gross_leverage: Decimal,
    opening_cash_cents: int,
    preclose_lender_ebitda_cents: list[int],
    operating_months: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Reference implementation organized as explicit ledger equations."""
    cash = opening_cash_cents
    term = term_opening_cents
    revolver = revolver_opening_cents
    lender_history = list(preclose_lender_ebitda_cents)
    result: list[dict[str, object]] = []
    scheduled_amortization = cents(
        Decimal(term_opening_cents)
        * annual_mandatory_amortization_rate
        / Decimal(12)
    )
    for row in operating_months:
        month = int(row["month"])
        beginning_cash = cash
        beginning_term = term
        beginning_revolver = revolver
        cash_interest = cents(
            Decimal(beginning_term + beginning_revolver)
            * annual_cash_rate
            / Decimal(12)
        )
        pik_interest = cents(
            Decimal(beginning_term) * annual_pik_rate / Decimal(12)
        )
        taxable_income = max(
            0,
            int(row["ebitda_cents"])
            - cash_interest
            - int(row["tax_depreciation_cents"])
            - int(row["deductible_fee_amortization_cents"]),
        )
        cash_taxes = cents(Decimal(taxable_income) * Decimal(row["cash_tax_rate"]))
        pre_debt_cash = (
            beginning_cash
            + int(row["ebitda_cents"])
            - cash_taxes
            - int(row["capex_cents"])
            - int(row["delta_working_capital_cents"])
            - cash_interest
        )
        mandatory = min(scheduled_amortization, beginning_term)
        cash_after_mandatory = pre_debt_cash - mandatory
        available_revolver = revolver_commitment_cents - beginning_revolver
        revolver_draw = min(
            available_revolver, max(0, minimum_cash_cents - cash_after_mandatory)
        )
        cash_before_sweep = cash_after_mandatory + revolver_draw
        sweep_available = cents(
            Decimal(max(0, cash_before_sweep - minimum_cash_cents)) * sweep_rate
        )
        revolver_repayment = min(
            beginning_revolver + revolver_draw, sweep_available
        )
        term_before_sweep = beginning_term - mandatory + pik_interest
        term_repayment = min(
            term_before_sweep, sweep_available - revolver_repayment
        )
        optional_sweep = revolver_repayment + term_repayment
        cash = cash_before_sweep - optional_sweep
        term = term_before_sweep - term_repayment
        revolver = beginning_revolver + revolver_draw - revolver_repayment
        lender_history.append(int(row["lender_ebitda_cents"]))
        ttm_lender_ebitda = sum(lender_history[-12:])
        gross_leverage = Decimal(term + revolver) / Decimal(ttm_lender_ebitda)
        result.append(
            {
                "month": month,
                "beginning_cash_cents": beginning_cash,
                "beginning_term_cents": beginning_term,
                "beginning_revolver_cents": beginning_revolver,
                "cash_interest_cents": cash_interest,
                "pik_interest_cents": pik_interest,
                "cash_taxes_cents": cash_taxes,
                "mandatory_amortization_cents": mandatory,
                "revolver_draw_cents": revolver_draw,
                "optional_sweep_cents": optional_sweep,
                "ending_cash_cents": cash,
                "ending_term_cents": term,
                "ending_revolver_cents": revolver,
                "trailing_lender_ebitda_cents": ttm_lender_ebitda,
                "covenant_breach": gross_leverage > maximum_gross_leverage,
                "payment_default": cash < 0,
            }
        )
    return result
