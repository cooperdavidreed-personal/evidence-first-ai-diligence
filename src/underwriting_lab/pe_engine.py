from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
from .contracts import UnderwritingError, digest
from .finance import (
    DatedCashFlow,
    DebtSchedule,
    DebtTerms,
    OperatingMonth,
    SourcesAndUses,
    build_debt_schedule,
    build_sources_and_uses,
    maximum_bid_cents,
    round_cents,
    xirr,
)


@dataclass(frozen=True)
class PEOperatingAssumptions:
    starting_arr_cents: int
    starting_ltm_revenue_cents: int
    starting_normalized_ebitda_cents: int
    full_cohort_nrr: Decimal
    annual_new_arr_rate: Decimal
    gross_margin: Decimal
    annual_opex_growth_rate: Decimal
    capex_as_revenue: Decimal
    working_capital_as_incremental_revenue: Decimal
    cash_tax_rate: Decimal


@dataclass(frozen=True)
class PETransactionAssumptions:
    entry_enterprise_value_cents: int
    funded_term_face_cents: int
    term_oid_rate: Decimal
    transaction_fee_rate: Decimal
    financing_fee_rate: Decimal
    seller_rollover_cents: int
    minimum_cash_cents: int
    revolver_commitment_cents: int
    annual_cash_rate: Decimal
    annual_pik_rate: Decimal
    annual_mandatory_amortization_rate: Decimal
    sweep_rate: Decimal
    maximum_gross_leverage: Decimal
    exit_multiple: Decimal
    hold_months: int = 60
    earnout_threshold_arr_cents: int | None = None
    earnout_cap_cents: int = 0


@dataclass(frozen=True)
class PECaseResult:
    scenario_id: str
    sources_and_uses: SourcesAndUses
    debt_schedule: DebtSchedule
    operating_months: tuple[OperatingMonth, ...]
    arr_cents_by_month: tuple[int, ...]
    revenue_cents_by_month: tuple[int, ...]
    sponsor_cash_flows: tuple[DatedCashFlow, ...]
    exit_enterprise_value_cents: int
    exit_equity_value_cents: int
    earnout_cents: int
    gross_moic: Decimal
    gross_xirr: Decimal
    engine_inputs_sha256: str

    def receipt(self) -> dict[str, object]:
        body: dict[str, object] = {
            "schema_version": "underwriting.pe-case-result/v2",
            "scenario_id": self.scenario_id,
            "engine_inputs_sha256": self.engine_inputs_sha256,
            "sources_and_uses": self.sources_and_uses.receipt(),
            "debt_schedule": self.debt_schedule.receipt(),
            "arr_cents_by_month": list(self.arr_cents_by_month),
            "revenue_cents_by_month": list(self.revenue_cents_by_month),
            "sponsor_cash_flows": [
                {"date": item.date.isoformat(), "amount_cents": item.amount_cents}
                for item in self.sponsor_cash_flows
            ],
            "exit_enterprise_value_cents": self.exit_enterprise_value_cents,
            "exit_equity_value_cents": self.exit_equity_value_cents,
            "earnout_cents": self.earnout_cents,
            "gross_moic": format(self.gross_moic, "f"),
            "gross_xirr": format(self.gross_xirr, "f"),
        }
        body["receipt_sha256"] = digest(body)
        return body


def _monthly_factor(annual_rate: Decimal) -> Decimal:
    if annual_rate <= -1:
        raise UnderwritingError("annual_rate_out_of_domain")
    with localcontext() as context:
        context.prec = 36
        return ((Decimal(1) + annual_rate).ln() / Decimal(12)).exp()


def build_operating_case(
    assumptions: PEOperatingAssumptions,
    *,
    months: int,
) -> tuple[tuple[OperatingMonth, ...], tuple[int, ...], tuple[int, ...]]:
    if months < 12:
        raise UnderwritingError("pe_hold_period_too_short")
    annual_arr_growth = assumptions.full_cohort_nrr - Decimal(1) + assumptions.annual_new_arr_rate
    arr_factor = _monthly_factor(annual_arr_growth)
    opex_factor = _monthly_factor(assumptions.annual_opex_growth_rate)
    arr = Decimal(assumptions.starting_arr_cents)
    monthly_revenue = Decimal(assumptions.starting_ltm_revenue_cents) / Decimal(12)
    starting_monthly_ebitda = Decimal(assumptions.starting_normalized_ebitda_cents) / Decimal(12)
    opex = monthly_revenue * assumptions.gross_margin - starting_monthly_ebitda
    previous_revenue = monthly_revenue
    result: list[OperatingMonth] = []
    arr_path: list[int] = []
    revenue_path: list[int] = []
    for month in range(1, months + 1):
        arr *= arr_factor
        monthly_revenue *= arr_factor
        revenue = monthly_revenue
        opex *= opex_factor
        gross_profit = revenue * assumptions.gross_margin
        ebitda = gross_profit - opex
        capex = revenue * assumptions.capex_as_revenue
        incremental_revenue = revenue - previous_revenue
        working_capital = incremental_revenue * assumptions.working_capital_as_incremental_revenue
        depreciation = capex * Decimal("0.80")
        arr_cents = round_cents(arr)
        revenue_cents = round_cents(revenue)
        ebitda_cents = round_cents(ebitda)
        result.append(
            OperatingMonth(
                month=month,
                ebitda_cents=ebitda_cents,
                capex_cents=round_cents(capex),
                delta_working_capital_cents=round_cents(working_capital),
                tax_depreciation_cents=round_cents(depreciation),
                deductible_fee_amortization_cents=0,
                cash_tax_rate=assumptions.cash_tax_rate,
                lender_ebitda_cents=ebitda_cents,
            )
        )
        arr_path.append(arr_cents)
        revenue_path.append(revenue_cents)
        previous_revenue = revenue
    return tuple(result), tuple(arr_path), tuple(revenue_path)


def _earnout_cents(terms: PETransactionAssumptions, month_24_arr_cents: int) -> int:
    threshold = terms.earnout_threshold_arr_cents
    if threshold is None or terms.earnout_cap_cents == 0 or month_24_arr_cents <= threshold:
        return 0
    maximum_arr = round_cents(Decimal(threshold) * Decimal("1.20"))
    achievement = min(
        Decimal(1),
        Decimal(month_24_arr_cents - threshold) / Decimal(maximum_arr - threshold),
    )
    return round_cents(Decimal(terms.earnout_cap_cents) * achievement)


def run_pe_case(
    *,
    scenario_id: str,
    operating: PEOperatingAssumptions,
    transaction: PETransactionAssumptions,
    close_date: date = date(2026, 8, 29),
) -> PECaseResult:
    if transaction.hold_months != 60:
        raise UnderwritingError("pe_default_requires_sixty_months")
    operating_months, arr_path, revenue_path = build_operating_case(
        operating, months=transaction.hold_months
    )
    transaction_fees = round_cents(
        Decimal(transaction.entry_enterprise_value_cents) * transaction.transaction_fee_rate
    )
    financing_fees = round_cents(
        Decimal(transaction.funded_term_face_cents) * transaction.financing_fee_rate
    )
    funded_term_net_oid = round_cents(
        Decimal(transaction.funded_term_face_cents) * (Decimal(1) - transaction.term_oid_rate)
    )
    sources_and_uses = build_sources_and_uses(
        uses_cents={
            "cash_enterprise_value": transaction.entry_enterprise_value_cents,
            "transaction_fees": transaction_fees,
            "financing_fees": financing_fees,
            "minimum_cash": transaction.minimum_cash_cents,
        },
        funded_sources_cents={
            "funded_term_debt_net_oid": funded_term_net_oid,
            "seller_rollover": transaction.seller_rollover_cents,
        },
        revolver_commitment_cents=transaction.revolver_commitment_cents,
    )
    debt_terms = DebtTerms(
        term_opening_cents=transaction.funded_term_face_cents,
        revolver_opening_cents=0,
        revolver_commitment_cents=transaction.revolver_commitment_cents,
        annual_cash_rate=transaction.annual_cash_rate,
        annual_pik_rate=transaction.annual_pik_rate,
        annual_mandatory_amortization_rate=transaction.annual_mandatory_amortization_rate,
        sweep_rate=transaction.sweep_rate,
        minimum_cash_cents=transaction.minimum_cash_cents,
        maximum_gross_leverage=transaction.maximum_gross_leverage,
    )
    preclose_monthly_ebitda = round_cents(
        Decimal(operating.starting_normalized_ebitda_cents) / Decimal(12)
    )
    debt_schedule = build_debt_schedule(
        terms=debt_terms,
        operating_months=operating_months,
        opening_cash_cents=transaction.minimum_cash_cents,
        preclose_lender_ebitda_cents=[preclose_monthly_ebitda] * 11,
    )
    exit_ltm_ebitda = sum(item.ebitda_cents for item in operating_months[-12:])
    exit_enterprise_value = round_cents(Decimal(exit_ltm_ebitda) * transaction.exit_multiple)
    ending_cash = debt_schedule.months[-1].ending_cash_cents
    exit_equity_value = max(
        0, exit_enterprise_value - debt_schedule.ending_debt_cents + ending_cash
    )
    earnout = _earnout_cents(transaction, arr_path[23])
    cash_flows = [DatedCashFlow(close_date, -sources_and_uses.sponsor_equity_cents)]
    if earnout:
        cash_flows.append(DatedCashFlow(date(2028, 9, 29), -earnout))
    cash_flows.append(DatedCashFlow(date(2031, 8, 29), exit_equity_value))
    total_invested = -sum(item.amount_cents for item in cash_flows if item.amount_cents < 0)
    total_proceeds = sum(item.amount_cents for item in cash_flows if item.amount_cents > 0)
    gross_moic = (Decimal(total_proceeds) / Decimal(total_invested)).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_EVEN
    )
    gross_xirr = xirr(cash_flows)
    inputs = {
        "scenario_id": scenario_id,
        "operating": {
            **asdict(operating),
            "full_cohort_nrr": format(operating.full_cohort_nrr, "f"),
            "annual_new_arr_rate": format(operating.annual_new_arr_rate, "f"),
            "gross_margin": format(operating.gross_margin, "f"),
            "annual_opex_growth_rate": format(operating.annual_opex_growth_rate, "f"),
            "capex_as_revenue": format(operating.capex_as_revenue, "f"),
            "working_capital_as_incremental_revenue": format(operating.working_capital_as_incremental_revenue, "f"),
            "cash_tax_rate": format(operating.cash_tax_rate, "f"),
        },
        "transaction": {
            **asdict(transaction),
            "term_oid_rate": format(transaction.term_oid_rate, "f"),
            "transaction_fee_rate": format(transaction.transaction_fee_rate, "f"),
            "financing_fee_rate": format(transaction.financing_fee_rate, "f"),
            "annual_cash_rate": format(transaction.annual_cash_rate, "f"),
            "annual_pik_rate": format(transaction.annual_pik_rate, "f"),
            "annual_mandatory_amortization_rate": format(transaction.annual_mandatory_amortization_rate, "f"),
            "sweep_rate": format(transaction.sweep_rate, "f"),
            "maximum_gross_leverage": format(transaction.maximum_gross_leverage, "f"),
            "exit_multiple": format(transaction.exit_multiple, "f"),
        },
        "close_date": close_date.isoformat(),
    }
    return PECaseResult(
        scenario_id=scenario_id,
        sources_and_uses=sources_and_uses,
        debt_schedule=debt_schedule,
        operating_months=operating_months,
        arr_cents_by_month=arr_path,
        revenue_cents_by_month=revenue_path,
        sponsor_cash_flows=tuple(cash_flows),
        exit_enterprise_value_cents=exit_enterprise_value,
        exit_equity_value_cents=exit_equity_value,
        earnout_cents=earnout,
        gross_moic=gross_moic,
        gross_xirr=gross_xirr,
        engine_inputs_sha256=digest(inputs),
    )


def solve_maximum_bid(
    *,
    operating: PEOperatingAssumptions,
    transaction: PETransactionAssumptions,
    minimum_irr: Decimal,
    minimum_moic: Decimal,
    low_cents: int,
    high_cents: int,
) -> int:
    def clears(entry_enterprise_value_cents: int) -> bool:
        candidate = PETransactionAssumptions(
            **{**asdict(transaction), "entry_enterprise_value_cents": entry_enterprise_value_cents}
        )
        result = run_pe_case(
            scenario_id="max-bid-candidate", operating=operating, transaction=candidate
        )
        return result.gross_xirr >= minimum_irr and result.gross_moic >= minimum_moic

    return maximum_bid_cents(
        low_cents=low_cents,
        high_cents=high_cents,
        clears_hurdles=clears,
    )
