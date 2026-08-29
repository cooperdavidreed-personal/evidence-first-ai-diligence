from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import date
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
import random
from typing import Sequence
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
    implementation_costs_by_month: tuple[tuple[int, int], ...] = ()


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


@dataclass(frozen=True)
class PEDistribution:
    draws: int
    moic_quantiles: tuple[Decimal, Decimal, Decimal]
    xirr_quantiles: tuple[Decimal, Decimal, Decimal]
    probability_below_one: Decimal
    correlation_structure_sha256: str
    path_receipt_sha256s: tuple[str, ...]

    def receipt(self) -> dict[str, object]:
        body: dict[str, object] = {
            "schema_version": "underwriting.pe-distribution/v2",
            "draws": self.draws,
            "moic_quantiles": [format(item, "f") for item in self.moic_quantiles],
            "xirr_quantiles": [format(item, "f") for item in self.xirr_quantiles],
            "probability_below_one": format(self.probability_below_one, "f"),
            "correlation_structure_sha256": self.correlation_structure_sha256,
            "path_receipt_sha256s": list(self.path_receipt_sha256s),
        }
        body["receipt_sha256"] = digest(body)
        return body


@dataclass(frozen=True)
class PEValueLever:
    lever_id: str
    label: str
    nrr_delta: Decimal = Decimal("0")
    new_arr_rate_delta: Decimal = Decimal("0")
    gross_margin_delta: Decimal = Decimal("0")
    opex_growth_delta: Decimal = Decimal("0")
    implementation_costs_by_month: tuple[tuple[int, int], ...] = ()


@dataclass(frozen=True)
class PEValueLeverResult:
    lever_id: str
    label: str
    exit_ebitda_delta_cents: int
    exit_debt_delta_cents: int
    exit_equity_delta_cents: int
    gross_xirr_delta: Decimal
    gross_moic_delta: Decimal
    result_receipt_sha256: str


@dataclass(frozen=True)
class PEValueCreationBridge:
    base_receipt_sha256: str
    standalone: tuple[PEValueLeverResult, ...]
    combined_receipt_sha256: str
    combined_exit_equity_delta_cents: int
    sum_standalone_exit_equity_delta_cents: int
    interaction_residual_cents: int
    combined_gross_xirr_delta: Decimal
    combined_gross_moic_delta: Decimal

    def receipt(self) -> dict[str, object]:
        body: dict[str, object] = {
            "schema_version": "underwriting.pe-value-creation-bridge/v2",
            "base_receipt_sha256": self.base_receipt_sha256,
            "standalone": [
                {
                    **asdict(item),
                    "gross_xirr_delta": format(item.gross_xirr_delta, "f"),
                    "gross_moic_delta": format(item.gross_moic_delta, "f"),
                }
                for item in self.standalone
            ],
            "combined_receipt_sha256": self.combined_receipt_sha256,
            "combined_exit_equity_delta_cents": self.combined_exit_equity_delta_cents,
            "sum_standalone_exit_equity_delta_cents": self.sum_standalone_exit_equity_delta_cents,
            "interaction_residual_cents": self.interaction_residual_cents,
            "combined_gross_xirr_delta": format(self.combined_gross_xirr_delta, "f"),
            "combined_gross_moic_delta": format(self.combined_gross_moic_delta, "f"),
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
    implementation_costs = dict(assumptions.implementation_costs_by_month)
    if len(implementation_costs) != len(assumptions.implementation_costs_by_month):
        raise UnderwritingError("implementation_cost_month_duplicate")
    if any(month < 1 or month > months or cost < 0 for month, cost in implementation_costs.items()):
        raise UnderwritingError("implementation_cost_invalid")
    result: list[OperatingMonth] = []
    arr_path: list[int] = []
    revenue_path: list[int] = []
    for month in range(1, months + 1):
        arr *= arr_factor
        monthly_revenue *= arr_factor
        revenue = monthly_revenue
        opex *= opex_factor
        gross_profit = revenue * assumptions.gross_margin
        ebitda = gross_profit - opex - Decimal(implementation_costs.get(month, 0))
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


def _quantile(values: list[Decimal], probability: Decimal) -> Decimal:
    ordered = sorted(values)
    index = round_cents(Decimal(len(ordered) - 1) * probability)
    return ordered[index]


def simulate_pe_distribution(
    *,
    operating: PEOperatingAssumptions,
    transaction: PETransactionAssumptions,
    seed: int,
    draws: int,
) -> PEDistribution:
    if draws < 100:
        raise UnderwritingError("pe_distribution_draws_below_minimum")
    rng = random.Random(seed)
    correlation_structure = {
        "schema_version": "underwriting.pe-correlation-structure/v2",
        "common_factor": "standard_normal",
        "drivers": {
            "full_cohort_nrr": {"common_loading": "0.020", "idiosyncratic_loading": "0.005"},
            "annual_new_arr_rate": {"common_loading": "0.020", "idiosyncratic_loading": "0.010"},
            "gross_margin": {"common_loading": "0.010", "idiosyncratic_loading": "0.005"},
            "exit_multiple": {"common_loading": "0.400", "idiosyncratic_loading": "0.350"},
        },
        "bounds": {
            "full_cohort_nrr": ["0.94", "1.04"],
            "annual_new_arr_rate": ["0.08", "0.16"],
            "gross_margin": ["0.70", "0.78"],
            "exit_multiple": ["5.00", "8.50"],
        },
    }
    moics: list[Decimal] = []
    xirrs: list[Decimal] = []
    receipt_hashes: list[str] = []
    for draw in range(draws):
        common = Decimal(str(rng.gauss(0, 1)))
        idiosyncratic = [Decimal(str(rng.gauss(0, 1))) for _ in range(4)]
        nrr = min(
            Decimal("1.04"),
            max(Decimal("0.94"), operating.full_cohort_nrr + common * Decimal("0.020") + idiosyncratic[0] * Decimal("0.005")),
        )
        new_arr = min(
            Decimal("0.16"),
            max(Decimal("0.08"), operating.annual_new_arr_rate + common * Decimal("0.020") + idiosyncratic[1] * Decimal("0.010")),
        )
        gross_margin = min(
            Decimal("0.78"),
            max(Decimal("0.70"), operating.gross_margin + common * Decimal("0.010") + idiosyncratic[2] * Decimal("0.005")),
        )
        exit_multiple = min(
            Decimal("8.50"),
            max(Decimal("5.00"), transaction.exit_multiple + common * Decimal("0.400") + idiosyncratic[3] * Decimal("0.350")),
        )
        path = run_pe_case(
            scenario_id=f"DISTRIBUTION_{draw:05d}",
            operating=replace(
                operating,
                full_cohort_nrr=nrr,
                annual_new_arr_rate=new_arr,
                gross_margin=gross_margin,
            ),
            transaction=replace(transaction, exit_multiple=exit_multiple),
        )
        moics.append(path.gross_moic)
        xirrs.append(path.gross_xirr)
        receipt_hashes.append(path.receipt()["receipt_sha256"])
    moic_quantiles = (
        _quantile(moics, Decimal("0.10")),
        _quantile(moics, Decimal("0.50")),
        _quantile(moics, Decimal("0.90")),
    )
    xirr_quantiles = (
        _quantile(xirrs, Decimal("0.10")),
        _quantile(xirrs, Decimal("0.50")),
        _quantile(xirrs, Decimal("0.90")),
    )
    return PEDistribution(
        draws=draws,
        moic_quantiles=moic_quantiles,
        xirr_quantiles=xirr_quantiles,
        probability_below_one=(Decimal(sum(item < 1 for item in moics)) / Decimal(draws)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN),
        correlation_structure_sha256=digest(correlation_structure),
        path_receipt_sha256s=tuple(receipt_hashes),
    )


def _apply_levers(
    operating: PEOperatingAssumptions,
    levers: Sequence[PEValueLever],
) -> PEOperatingAssumptions:
    costs: dict[int, int] = dict(operating.implementation_costs_by_month)
    for lever in levers:
        for month, cost in lever.implementation_costs_by_month:
            costs[month] = costs.get(month, 0) + cost
    return replace(
        operating,
        full_cohort_nrr=operating.full_cohort_nrr + sum((item.nrr_delta for item in levers), Decimal(0)),
        annual_new_arr_rate=operating.annual_new_arr_rate + sum((item.new_arr_rate_delta for item in levers), Decimal(0)),
        gross_margin=operating.gross_margin + sum((item.gross_margin_delta for item in levers), Decimal(0)),
        annual_opex_growth_rate=operating.annual_opex_growth_rate + sum((item.opex_growth_delta for item in levers), Decimal(0)),
        implementation_costs_by_month=tuple(sorted(costs.items())),
    )


def build_value_creation_bridge(
    *,
    operating: PEOperatingAssumptions,
    transaction: PETransactionAssumptions,
    levers: Sequence[PEValueLever],
) -> PEValueCreationBridge:
    if len(levers) < 3 or len(levers) > 5 or len({item.lever_id for item in levers}) != len(levers):
        raise UnderwritingError("value_creation_lever_count_or_identity_invalid")
    base = run_pe_case(scenario_id="VALUE_BASE", operating=operating, transaction=transaction)
    base_receipt = base.receipt()
    base_exit_ebitda = sum(item.ebitda_cents for item in base.operating_months[-12:])
    standalone: list[PEValueLeverResult] = []
    for lever in levers:
        result = run_pe_case(
            scenario_id=f"VALUE_{lever.lever_id}",
            operating=_apply_levers(operating, [lever]),
            transaction=transaction,
        )
        result_receipt = result.receipt()
        standalone.append(
            PEValueLeverResult(
                lever_id=lever.lever_id,
                label=lever.label,
                exit_ebitda_delta_cents=sum(item.ebitda_cents for item in result.operating_months[-12:]) - base_exit_ebitda,
                exit_debt_delta_cents=result.debt_schedule.ending_debt_cents - base.debt_schedule.ending_debt_cents,
                exit_equity_delta_cents=result.exit_equity_value_cents - base.exit_equity_value_cents,
                gross_xirr_delta=result.gross_xirr - base.gross_xirr,
                gross_moic_delta=result.gross_moic - base.gross_moic,
                result_receipt_sha256=str(result_receipt["receipt_sha256"]),
            )
        )
    combined = run_pe_case(
        scenario_id="VALUE_COMBINED",
        operating=_apply_levers(operating, levers),
        transaction=transaction,
    )
    combined_receipt = combined.receipt()
    combined_delta = combined.exit_equity_value_cents - base.exit_equity_value_cents
    standalone_sum = sum(item.exit_equity_delta_cents for item in standalone)
    return PEValueCreationBridge(
        base_receipt_sha256=str(base_receipt["receipt_sha256"]),
        standalone=tuple(standalone),
        combined_receipt_sha256=str(combined_receipt["receipt_sha256"]),
        combined_exit_equity_delta_cents=combined_delta,
        sum_standalone_exit_equity_delta_cents=standalone_sum,
        interaction_residual_cents=combined_delta - standalone_sum,
        combined_gross_xirr_delta=combined.gross_xirr - base.gross_xirr,
        combined_gross_moic_delta=combined.gross_moic - base.gross_moic,
    )
