from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
from typing import Callable, Mapping, Sequence

from .contracts import UnderwritingError, digest


CENT = Decimal("1")
RATE_QUANTUM = Decimal("0.0000000001")


def _cents(value: int, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise UnderwritingError(f"integer_cents_required:{field}")
    return value


def _decimal(value: Decimal, field: str) -> Decimal:
    if not isinstance(value, Decimal) or not value.is_finite():
        raise UnderwritingError(f"decimal_required:{field}")
    return value


def round_cents(value: Decimal) -> int:
    return int(value.quantize(CENT, rounding=ROUND_HALF_EVEN))


@dataclass(frozen=True)
class SourcesAndUses:
    uses_cents: Mapping[str, int]
    non_sponsor_sources_cents: Mapping[str, int]
    sponsor_equity_cents: int
    undrawn_revolver_commitment_cents: int

    def __post_init__(self) -> None:
        for label, value in self.uses_cents.items():
            if _cents(value, f"use:{label}") < 0:
                raise UnderwritingError("sources_uses_negative")
        for label, value in self.non_sponsor_sources_cents.items():
            if _cents(value, f"source:{label}") < 0:
                raise UnderwritingError("sources_uses_negative")
        if _cents(self.sponsor_equity_cents, "sponsor_equity") < 0:
            raise UnderwritingError("sources_uses_negative")
        if _cents(self.undrawn_revolver_commitment_cents, "undrawn_revolver") < 0:
            raise UnderwritingError("sources_uses_negative")
        if any("undrawn" in label.lower() or "commitment" in label.lower() for label in self.non_sponsor_sources_cents):
            raise UnderwritingError("undrawn_revolver_is_not_closing_source")
        if self.total_uses_cents != self.total_sources_cents:
            raise UnderwritingError("sources_uses_do_not_reconcile")

    @property
    def total_uses_cents(self) -> int:
        return sum(self.uses_cents.values())

    @property
    def total_sources_cents(self) -> int:
        return sum(self.non_sponsor_sources_cents.values()) + self.sponsor_equity_cents

    def receipt(self) -> dict[str, object]:
        body: dict[str, object] = {
            "schema_version": "underwriting.sources-and-uses/v2",
            "uses_cents": dict(sorted(self.uses_cents.items())),
            "non_sponsor_sources_cents": dict(sorted(self.non_sponsor_sources_cents.items())),
            "sponsor_equity_cents": self.sponsor_equity_cents,
            "undrawn_revolver_commitment_cents": self.undrawn_revolver_commitment_cents,
            "total_uses_cents": self.total_uses_cents,
            "total_sources_cents": self.total_sources_cents,
        }
        body["receipt_sha256"] = digest(body)
        return body


def build_sources_and_uses(
    *,
    uses_cents: Mapping[str, int],
    funded_sources_cents: Mapping[str, int],
    revolver_commitment_cents: int,
    revolver_closing_draw_cents: int = 0,
) -> SourcesAndUses:
    _cents(revolver_commitment_cents, "revolver_commitment")
    _cents(revolver_closing_draw_cents, "revolver_closing_draw")
    if revolver_closing_draw_cents > revolver_commitment_cents:
        raise UnderwritingError("revolver_closing_draw_exceeds_commitment")
    sources = dict(funded_sources_cents)
    if revolver_closing_draw_cents:
        sources["revolver_closing_draw"] = revolver_closing_draw_cents
    sponsor_equity = sum(uses_cents.values()) - sum(sources.values())
    return SourcesAndUses(
        uses_cents=uses_cents,
        non_sponsor_sources_cents=sources,
        sponsor_equity_cents=sponsor_equity,
        undrawn_revolver_commitment_cents=revolver_commitment_cents - revolver_closing_draw_cents,
    )


@dataclass(frozen=True)
class DebtTerms:
    term_opening_cents: int
    revolver_opening_cents: int
    revolver_commitment_cents: int
    annual_cash_rate: Decimal
    annual_pik_rate: Decimal
    annual_mandatory_amortization_rate: Decimal
    sweep_rate: Decimal
    minimum_cash_cents: int
    maximum_gross_leverage: Decimal
    maturity_months: int = 60
    interest_balance_convention: str = "BEGINNING_FUNDED_PRINCIPAL"
    paydown_priority: tuple[str, str] = ("REVOLVER", "TERM")

    def __post_init__(self) -> None:
        for name in ("term_opening_cents", "revolver_opening_cents", "revolver_commitment_cents", "minimum_cash_cents"):
            if _cents(getattr(self, name), name) < 0:
                raise UnderwritingError("debt_term_negative")
        for name in ("annual_cash_rate", "annual_pik_rate", "annual_mandatory_amortization_rate", "sweep_rate", "maximum_gross_leverage"):
            value = _decimal(getattr(self, name), name)
            if value < 0:
                raise UnderwritingError("debt_term_negative")
        if self.revolver_opening_cents > self.revolver_commitment_cents:
            raise UnderwritingError("opening_revolver_exceeds_commitment")
        if self.sweep_rate > 1 or self.annual_mandatory_amortization_rate > 1:
            raise UnderwritingError("debt_rate_out_of_range")
        if self.maturity_months < 1:
            raise UnderwritingError("debt_maturity_invalid")
        if self.interest_balance_convention != "BEGINNING_FUNDED_PRINCIPAL":
            raise UnderwritingError("debt_interest_convention_unsupported")
        if self.paydown_priority != ("REVOLVER", "TERM"):
            raise UnderwritingError("debt_paydown_priority_unsupported")


@dataclass(frozen=True)
class OperatingMonth:
    month: int
    ebitda_cents: int
    capex_cents: int
    delta_working_capital_cents: int
    tax_depreciation_cents: int
    deductible_fee_amortization_cents: int
    cash_tax_rate: Decimal
    lender_ebitda_cents: int

    def __post_init__(self) -> None:
        if self.month < 1:
            raise UnderwritingError("operating_month_invalid")
        for name in ("ebitda_cents", "capex_cents", "delta_working_capital_cents", "tax_depreciation_cents", "deductible_fee_amortization_cents", "lender_ebitda_cents"):
            _cents(getattr(self, name), name)
        tax_rate = _decimal(self.cash_tax_rate, "cash_tax_rate")
        if tax_rate < 0 or tax_rate > 1:
            raise UnderwritingError("cash_tax_rate_out_of_range")


@dataclass(frozen=True)
class DebtMonth:
    month: int
    beginning_cash_cents: int
    beginning_term_cents: int
    beginning_revolver_cents: int
    cash_interest_cents: int
    pik_interest_cents: int
    cash_taxes_cents: int
    mandatory_amortization_cents: int
    revolver_draw_cents: int
    optional_sweep_cents: int
    ending_cash_cents: int
    ending_term_cents: int
    ending_revolver_cents: int
    trailing_lender_ebitda_cents: int
    gross_leverage: Decimal
    covenant_headroom: Decimal
    covenant_breach: bool
    payment_default: bool


@dataclass(frozen=True)
class DebtSchedule:
    terms: DebtTerms
    months: tuple[DebtMonth, ...]
    engine_inputs_sha256: str
    reconciliation: Mapping[str, int]

    @property
    def ending_debt_cents(self) -> int:
        final = self.months[-1]
        return final.ending_term_cents + final.ending_revolver_cents

    @property
    def minimum_liquidity_cents(self) -> int:
        return min(item.ending_cash_cents for item in self.months)

    @property
    def first_covenant_breach_month(self) -> int | None:
        return next((item.month for item in self.months if item.covenant_breach), None)

    @property
    def has_payment_default(self) -> bool:
        return any(item.payment_default for item in self.months)

    def receipt(self) -> dict[str, object]:
        body: dict[str, object] = {
            "schema_version": "underwriting.debt-schedule/v2",
            "engine_inputs_sha256": self.engine_inputs_sha256,
            "months": [
                {
                    **asdict(item),
                    "gross_leverage": format(item.gross_leverage, "f"),
                    "covenant_headroom": format(item.covenant_headroom, "f"),
                }
                for item in self.months
            ],
            "ending_debt_cents": self.ending_debt_cents,
            "minimum_liquidity_cents": self.minimum_liquidity_cents,
            "first_covenant_breach_month": self.first_covenant_breach_month,
            "has_payment_default": self.has_payment_default,
            "reconciliation": dict(sorted(self.reconciliation.items())),
        }
        body["receipt_sha256"] = digest(body)
        return body


def build_debt_schedule(
    *,
    terms: DebtTerms,
    operating_months: Sequence[OperatingMonth],
    opening_cash_cents: int,
    preclose_lender_ebitda_cents: Sequence[int],
) -> DebtSchedule:
    if len(preclose_lender_ebitda_cents) != 11:
        raise UnderwritingError("preclose_lender_ebitda_requires_11_months")
    if not operating_months:
        raise UnderwritingError("operating_schedule_empty")
    if len(operating_months) > terms.maturity_months:
        raise UnderwritingError("debt_schedule_exceeds_maturity")
    if [item.month for item in operating_months] != list(range(1, len(operating_months) + 1)):
        raise UnderwritingError("operating_months_not_contiguous")
    beginning_cash = _cents(opening_cash_cents, "opening_cash")
    term_balance = terms.term_opening_cents
    revolver_balance = terms.revolver_opening_cents
    monthly_ebitda = list(preclose_lender_ebitda_cents)
    schedule: list[DebtMonth] = []
    maximum_cash_rollforward_residual = 0
    maximum_term_rollforward_residual = 0
    maximum_revolver_rollforward_residual = 0
    maximum_interest_residual = 0
    covenant_status_mismatches = 0
    monthly_cash_rate = terms.annual_cash_rate / Decimal(12)
    monthly_pik_rate = terms.annual_pik_rate / Decimal(12)
    monthly_mandatory = round_cents(
        Decimal(terms.term_opening_cents) * terms.annual_mandatory_amortization_rate / Decimal(12)
    )

    for operating in operating_months:
        beginning_term = term_balance
        beginning_revolver = revolver_balance
        cash_interest = round_cents(Decimal(beginning_term + beginning_revolver) * monthly_cash_rate)
        pik_interest = round_cents(Decimal(beginning_term) * monthly_pik_rate)
        taxable_income = max(
            0,
            operating.ebitda_cents
            - cash_interest
            - operating.tax_depreciation_cents
            - operating.deductible_fee_amortization_cents,
        )
        cash_taxes = round_cents(Decimal(taxable_income) * operating.cash_tax_rate)
        pre_debt_cash = (
            beginning_cash
            + operating.ebitda_cents
            - cash_taxes
            - operating.capex_cents
            - operating.delta_working_capital_cents
            - cash_interest
        )
        mandatory = min(monthly_mandatory, beginning_term)
        cash_after_mandatory = pre_debt_cash - mandatory
        remaining_commitment = terms.revolver_commitment_cents - beginning_revolver
        revolver_draw = min(remaining_commitment, max(0, terms.minimum_cash_cents - cash_after_mandatory))
        cash_before_sweep = cash_after_mandatory + revolver_draw
        sweep_pool = round_cents(
            Decimal(max(0, cash_before_sweep - terms.minimum_cash_cents)) * terms.sweep_rate
        )
        revolver_paydown = min(beginning_revolver + revolver_draw, sweep_pool)
        remaining_sweep = sweep_pool - revolver_paydown
        term_before_sweep = beginning_term - mandatory + pik_interest
        term_paydown = min(term_before_sweep, remaining_sweep)
        optional_sweep = revolver_paydown + term_paydown
        ending_cash = cash_before_sweep - optional_sweep
        term_balance = term_before_sweep - term_paydown
        revolver_balance = beginning_revolver + revolver_draw - revolver_paydown
        monthly_ebitda.append(operating.lender_ebitda_cents)
        trailing_lender_ebitda = sum(monthly_ebitda[-12:])
        if trailing_lender_ebitda <= 0:
            raise UnderwritingError("lender_ebitda_nonpositive")
        gross_debt = term_balance + revolver_balance
        leverage = Decimal(gross_debt) / Decimal(trailing_lender_ebitda)
        headroom = terms.maximum_gross_leverage - leverage
        payment_default = ending_cash < 0
        maximum_cash_rollforward_residual = max(
            maximum_cash_rollforward_residual,
            abs(
                ending_cash
                - (
                    beginning_cash
                    + operating.ebitda_cents
                    - cash_taxes
                    - operating.capex_cents
                    - operating.delta_working_capital_cents
                    - cash_interest
                    - mandatory
                    + revolver_draw
                    - optional_sweep
                )
            ),
        )
        derived_revolver_paydown = (
            beginning_revolver + revolver_draw - revolver_balance
        )
        derived_term_paydown = optional_sweep - derived_revolver_paydown
        maximum_term_rollforward_residual = max(
            maximum_term_rollforward_residual,
            abs(
                term_balance
                - (
                    beginning_term
                    - mandatory
                    + pik_interest
                    - derived_term_paydown
                )
            ),
        )
        maximum_revolver_rollforward_residual = max(
            maximum_revolver_rollforward_residual,
            abs(
                revolver_balance
                - (
                    beginning_revolver
                    + revolver_draw
                    - derived_revolver_paydown
                )
            ),
        )
        maximum_interest_residual = max(
            maximum_interest_residual,
            abs(
                cash_interest
                - round_cents(
                    Decimal(beginning_term + beginning_revolver)
                    * terms.annual_cash_rate
                    / Decimal(12)
                )
            ),
        )
        covenant_status_mismatches += int(
            (leverage > terms.maximum_gross_leverage)
            != (headroom < Decimal(0))
        )
        schedule.append(
            DebtMonth(
                month=operating.month,
                beginning_cash_cents=beginning_cash,
                beginning_term_cents=beginning_term,
                beginning_revolver_cents=beginning_revolver,
                cash_interest_cents=cash_interest,
                pik_interest_cents=pik_interest,
                cash_taxes_cents=cash_taxes,
                mandatory_amortization_cents=mandatory,
                revolver_draw_cents=revolver_draw,
                optional_sweep_cents=optional_sweep,
                ending_cash_cents=ending_cash,
                ending_term_cents=term_balance,
                ending_revolver_cents=revolver_balance,
                trailing_lender_ebitda_cents=trailing_lender_ebitda,
                gross_leverage=leverage.quantize(RATE_QUANTUM, rounding=ROUND_HALF_EVEN),
                covenant_headroom=headroom.quantize(RATE_QUANTUM, rounding=ROUND_HALF_EVEN),
                covenant_breach=leverage > terms.maximum_gross_leverage,
                payment_default=payment_default,
            )
        )
        beginning_cash = ending_cash

    inputs = {
        "terms": {
            **asdict(terms),
            "annual_cash_rate": format(terms.annual_cash_rate, "f"),
            "annual_pik_rate": format(terms.annual_pik_rate, "f"),
            "annual_mandatory_amortization_rate": format(terms.annual_mandatory_amortization_rate, "f"),
            "sweep_rate": format(terms.sweep_rate, "f"),
            "maximum_gross_leverage": format(terms.maximum_gross_leverage, "f"),
        },
        "operating_months": [
            {**asdict(item), "cash_tax_rate": format(item.cash_tax_rate, "f")}
            for item in operating_months
        ],
        "opening_cash_cents": opening_cash_cents,
        "preclose_lender_ebitda_cents": list(preclose_lender_ebitda_cents),
    }
    return DebtSchedule(
        terms=terms,
        months=tuple(schedule),
        engine_inputs_sha256=digest(inputs),
        reconciliation={
            "cash_rollforward_max_residual_cents": maximum_cash_rollforward_residual,
            "term_rollforward_max_residual_cents": maximum_term_rollforward_residual,
            "revolver_rollforward_max_residual_cents": maximum_revolver_rollforward_residual,
            "cash_interest_max_residual_cents": maximum_interest_residual,
            "covenant_status_mismatches": covenant_status_mismatches,
        },
    )


@dataclass(frozen=True)
class DatedCashFlow:
    date: date
    amount_cents: int

    def __post_init__(self) -> None:
        _cents(self.amount_cents, "dated_cash_flow")


def npv_cents(rate: Decimal, cash_flows: Sequence[DatedCashFlow]) -> Decimal:
    if rate <= -1:
        raise UnderwritingError("xirr_rate_out_of_domain")
    if not cash_flows:
        raise UnderwritingError("xirr_cash_flows_empty")
    origin = min(item.date for item in cash_flows)
    with localcontext() as context:
        context.prec = 42
        base = Decimal(1) + rate
        return sum(
            Decimal(item.amount_cents)
            / (base.ln() * (Decimal((item.date - origin).days) / Decimal(365))).exp()
            for item in cash_flows
        )


def xirr(cash_flows: Sequence[DatedCashFlow]) -> Decimal:
    ordered = sorted(cash_flows, key=lambda item: item.date)
    signs = [1 if item.amount_cents > 0 else -1 for item in ordered if item.amount_cents]
    sign_changes = sum(left != right for left, right in zip(signs, signs[1:], strict=False))
    if sign_changes != 1:
        raise UnderwritingError("xirr_not_identified")
    low, high = Decimal("-0.999999"), Decimal("10")
    low_npv, high_npv = npv_cents(low, ordered), npv_cents(high, ordered)
    if low_npv * high_npv > 0:
        raise UnderwritingError("xirr_root_not_bracketed")
    for _ in range(256):
        midpoint = (low + high) / 2
        midpoint_npv = npv_cents(midpoint, ordered)
        if abs(midpoint_npv) <= Decimal(1):
            return midpoint.quantize(RATE_QUANTUM, rounding=ROUND_HALF_EVEN)
        if low_npv * midpoint_npv <= 0:
            high = midpoint
        else:
            low, low_npv = midpoint, midpoint_npv
    raise UnderwritingError("xirr_did_not_converge")


def maximum_bid_cents(
    *,
    low_cents: int,
    high_cents: int,
    clears_hurdles: Callable[[int], bool],
) -> int:
    _cents(low_cents, "max_bid_low")
    _cents(high_cents, "max_bid_high")
    if low_cents > high_cents or not clears_hurdles(low_cents):
        raise UnderwritingError("max_bid_not_bracketed")
    if clears_hurdles(high_cents):
        return high_cents
    low, high = low_cents, high_cents
    while low < high:
        midpoint = (low + high + 1) // 2
        if clears_hurdles(midpoint):
            low = midpoint
        else:
            high = midpoint - 1
    return low
