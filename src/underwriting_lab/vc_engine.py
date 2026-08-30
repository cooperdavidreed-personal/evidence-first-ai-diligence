from __future__ import annotations

from calendar import monthrange
from dataclasses import asdict, dataclass, replace
from datetime import date
from decimal import Decimal, ROUND_HALF_EVEN
from fractions import Fraction
from itertools import product
import random
from typing import Any, Iterable, Mapping

from .contracts import UnderwritingError, digest
from .finance import DatedCashFlow, npv_cents, xirr


@dataclass(frozen=True)
class PreferenceTerms:
    class_id: str
    seniority: int
    invested_cents: int
    preference_multiple: Decimal
    participation: str
    participation_cap_multiple: Decimal | None = None
    conversion_numerator: int = 1
    conversion_denominator: int = 1

    def __post_init__(self) -> None:
        if self.invested_cents < 0 or self.preference_multiple < 0:
            raise UnderwritingError("vc_preference_amount_invalid")
        if self.seniority < 0 or self.conversion_numerator < 1 or self.conversion_denominator < 1:
            raise UnderwritingError("vc_preference_terms_invalid")
        if self.participation not in {
            "NON_PARTICIPATING",
            "PARTICIPATING",
            "CAPPED_PARTICIPATING",
        }:
            raise UnderwritingError("vc_participation_type_invalid")
        if self.participation == "CAPPED_PARTICIPATING" and (
            self.participation_cap_multiple is None
            or self.participation_cap_multiple < self.preference_multiple
        ):
            raise UnderwritingError("vc_participation_cap_invalid")


@dataclass(frozen=True)
class Holder:
    holder_id: str
    class_id: str
    shares: int

    def __post_init__(self) -> None:
        if self.shares < 0:
            raise UnderwritingError("vc_holder_shares_negative")


@dataclass(frozen=True)
class FundingEvent:
    event_id: str
    scheduled_month: int
    sequence: int
    event_type: str
    holder_id: str
    class_id: str
    new_money_cents: int
    pre_money_cents: int | None
    price_rule: str
    pool_target: Decimal = Decimal("0")
    milestone_tests: tuple[str, ...] = ()
    milestone_results: tuple[tuple[str, str], ...] = ()
    milestone_state: str = "NOT_APPLICABLE"
    evaluator: str = "NOT_APPLICABLE"
    cure_period_days: int = 0
    funded: bool = True
    shortfall_discount: Decimal | None = None
    preference_multiple: Decimal = Decimal("1")
    participation: str = "NON_PARTICIPATING"
    participation_cap_multiple: Decimal | None = None
    seniority: int = 0

    def __post_init__(self) -> None:
        if self.scheduled_month < 1 or self.sequence < 0 or self.new_money_cents < 0:
            raise UnderwritingError("vc_funding_event_invalid")
        if self.event_type not in {"PRIMARY", "MILESTONE", "LATER_ROUND", "SHORTFALL"}:
            raise UnderwritingError("vc_funding_event_type_invalid")
        if self.price_rule not in {"PRE_MONEY", "SAME_AS_SERIES_C", "DISCOUNT_TO_SERIES_C"}:
            raise UnderwritingError("vc_price_rule_invalid")
        if not Decimal("0") <= self.pool_target < Decimal("1"):
            raise UnderwritingError("vc_pool_target_invalid")
        if self.event_type == "MILESTONE" and self.milestone_state not in {"PASS", "FAIL", "OPEN"}:
            raise UnderwritingError("vc_milestone_state_invalid")
        if self.event_type == "MILESTONE":
            if not self.milestone_tests or len(set(self.milestone_tests)) != len(
                self.milestone_tests
            ):
                raise UnderwritingError("vc_milestone_tests_invalid")
            result_map = dict(self.milestone_results)
            if len(result_map) != len(self.milestone_results) or set(result_map) != set(
                self.milestone_tests
            ):
                raise UnderwritingError("vc_milestone_results_incomplete")
            if not set(result_map.values()).issubset({"PASS", "FAIL", "OPEN"}):
                raise UnderwritingError("vc_milestone_result_state_invalid")
            derived_state = (
                "PASS"
                if all(value == "PASS" for value in result_map.values())
                else "FAIL"
                if any(value == "FAIL" for value in result_map.values())
                else "OPEN"
            )
            if self.milestone_state != derived_state:
                raise UnderwritingError("vc_milestone_state_not_derived")
            if self.funded != (derived_state == "PASS"):
                raise UnderwritingError("vc_milestone_funding_not_derived")
        elif self.milestone_tests or self.milestone_results or self.milestone_state != "NOT_APPLICABLE":
            raise UnderwritingError("vc_non_milestone_has_test_state")


@dataclass(frozen=True)
class VCScenarioAssumptions:
    scenario_id: str
    close_date: date
    exit_month: int
    exit_value_cents: int
    monthly_net_cash_flow_cents: tuple[int, ...]
    events: tuple[FundingEvent, ...]
    target_holder_id: str
    exit_valuation: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.scenario_id not in {"BASE", "MILESTONE", "DOWNSIDE", "FINANCING_SHORTFALL"}:
            raise UnderwritingError("vc_scenario_id_invalid")
        if self.exit_month < 12 or self.exit_month > len(self.monthly_net_cash_flow_cents):
            raise UnderwritingError("vc_exit_month_invalid")
        if self.exit_value_cents < 0:
            raise UnderwritingError("vc_exit_value_invalid")
        if self.exit_valuation is not None:
            bridge = self.exit_valuation
            required = {
                "observed_ltm_revenue_cents", "annual_revenue_growth", "years",
                "exit_revenue_multiple", "terminal_revenue_cents", "net_debt_cents",
                "exit_enterprise_value_cents", "exit_equity_value_cents",
            }
            if bridge.get("schema_version") != "underwriting.operating-exit-bridge/v1" or not required.issubset(bridge):
                raise UnderwritingError("vc_exit_valuation_contract_invalid")
            terminal_revenue = int(
                (
                    Decimal(int(bridge["observed_ltm_revenue_cents"]))
                    * (Decimal(1) + Decimal(str(bridge["annual_revenue_growth"])))
                    ** int(bridge["years"])
                ).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
            )
            enterprise_value = int(
                (Decimal(terminal_revenue) * Decimal(str(bridge["exit_revenue_multiple"]))).quantize(
                    Decimal("1"), rounding=ROUND_HALF_EVEN
                )
            )
            equity_value = enterprise_value - int(bridge["net_debt_cents"])
            if (
                terminal_revenue != int(bridge["terminal_revenue_cents"])
                or enterprise_value != int(bridge["exit_enterprise_value_cents"])
                or equity_value != int(bridge["exit_equity_value_cents"])
                or equity_value != self.exit_value_cents
            ):
                raise UnderwritingError("vc_exit_valuation_bridge_mismatch")


@dataclass(frozen=True)
class WaterfallResult:
    exit_value_cents: int
    conversion_profile: Mapping[str, bool]
    class_preference_cents: Mapping[str, int]
    class_residual_cents: Mapping[str, int]
    class_proceeds_cents: Mapping[str, int]
    common_proceeds_cents: int
    breakpoint_candidates_cents: tuple[int, ...]

    def receipt(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "schema_version": "underwriting.vc-waterfall/v2",
            "exit_value_cents": self.exit_value_cents,
            "conversion_profile": dict(self.conversion_profile),
            "class_preference_cents": dict(self.class_preference_cents),
            "class_residual_cents": dict(self.class_residual_cents),
            "class_proceeds_cents": dict(self.class_proceeds_cents),
            "common_proceeds_cents": self.common_proceeds_cents,
            "breakpoint_candidates_cents": list(self.breakpoint_candidates_cents),
            "conservation_residual_cents": self.exit_value_cents
            - self.common_proceeds_cents
            - sum(self.class_proceeds_cents.values()),
        }
        body["receipt_sha256"] = digest(body)
        return body


@dataclass(frozen=True)
class VCScenarioResult:
    scenario_id: str
    assumptions: VCScenarioAssumptions
    opening_cash_cents: int
    initial_holders: tuple[Holder, ...]
    initial_preferences: tuple[PreferenceTerms, ...]
    initial_unissued_pool_shares: int
    financing_events: tuple[dict[str, Any], ...]
    holders: tuple[Holder, ...]
    preferences: tuple[PreferenceTerms, ...]
    unissued_pool_shares: int
    cash_by_month: tuple[dict[str, Any], ...]
    first_cash_exhaustion_month_without_contingent_financing: int | None
    minimum_cash_cents: int
    waterfall: WaterfallResult
    target_invested_cents: int
    target_proceeds_cents: int
    target_cash_flows: tuple[dict[str, Any], ...]
    target_ownership: Decimal
    gross_moic: Decimal
    gross_xirr: Decimal
    xirr_npv_residual_cents: Decimal
    engine_inputs_sha256: str

    def receipt(self) -> dict[str, Any]:
        engine_inputs = {
            **_scenario_inputs(self.assumptions),
            "opening_cash_cents": self.opening_cash_cents,
            "initial_holders": [asdict(item) for item in self.initial_holders],
            "initial_preferences": [
                _preference_dict(item) for item in self.initial_preferences
            ],
            "initial_unissued_pool_shares": self.initial_unissued_pool_shares,
        }
        body: dict[str, Any] = {
            "schema_version": "underwriting.vc-scenario-result/v2",
            "scenario_id": self.scenario_id,
            "engine_inputs_sha256": self.engine_inputs_sha256,
            "engine_inputs": engine_inputs,
            "opening_cash_cents": self.opening_cash_cents,
            "financing_events": list(self.financing_events),
            "holders": [asdict(item) for item in self.holders],
            "preferences": [_preference_dict(item) for item in self.preferences],
            "unissued_pool_shares": self.unissued_pool_shares,
            "cash_by_month": list(self.cash_by_month),
            "first_cash_exhaustion_month_without_contingent_financing": (
                self.first_cash_exhaustion_month_without_contingent_financing
            ),
            "minimum_cash_cents": self.minimum_cash_cents,
            "waterfall": self.waterfall.receipt(),
            "target_invested_cents": self.target_invested_cents,
            "target_proceeds_cents": self.target_proceeds_cents,
            "target_cash_flows": list(self.target_cash_flows),
            "target_ownership": format(self.target_ownership, "f"),
            "gross_moic": format(self.gross_moic, "f"),
            "gross_xirr": format(self.gross_xirr, "f"),
            "xirr_npv_residual_cents": format(self.xirr_npv_residual_cents, "f"),
        }
        body["receipt_sha256"] = digest(body)
        return body


def _preference_dict(item: PreferenceTerms) -> dict[str, Any]:
    return {
        **asdict(item),
        "preference_multiple": format(item.preference_multiple, "f"),
        "participation_cap_multiple": (
            format(item.participation_cap_multiple, "f")
            if item.participation_cap_multiple is not None
            else None
        ),
    }


def _event_dict(item: FundingEvent) -> dict[str, Any]:
    return {
        **asdict(item),
        "pool_target": format(item.pool_target, "f"),
        "shortfall_discount": (
            format(item.shortfall_discount, "f") if item.shortfall_discount is not None else None
        ),
        "preference_multiple": format(item.preference_multiple, "f"),
        "participation_cap_multiple": (
            format(item.participation_cap_multiple, "f")
            if item.participation_cap_multiple is not None
            else None
        ),
        "milestone_tests": list(item.milestone_tests),
        "milestone_results": [list(result) for result in item.milestone_results],
    }


def _scenario_inputs(item: VCScenarioAssumptions) -> dict[str, Any]:
    return {
        "scenario_id": item.scenario_id,
        "close_date": item.close_date.isoformat(),
        "exit_month": item.exit_month,
        "exit_value_cents": item.exit_value_cents,
        "monthly_net_cash_flow_cents": list(item.monthly_net_cash_flow_cents),
        "events": [_event_dict(event) for event in item.events],
        "target_holder_id": item.target_holder_id,
        "exit_valuation": dict(item.exit_valuation) if item.exit_valuation is not None else None,
    }


def _floor_shares(new_money_cents: int, fully_diluted_pre: int, pre_money_cents: int) -> int:
    if new_money_cents <= 0 or fully_diluted_pre <= 0 or pre_money_cents <= 0:
        raise UnderwritingError("vc_share_pricing_input_invalid")
    shares = Fraction(new_money_cents * fully_diluted_pre, pre_money_cents)
    result = shares.numerator // shares.denominator
    if result <= 0:
        raise UnderwritingError("vc_new_shares_zero")
    return result


def solve_pool_top_up(
    *,
    issued_shares: int,
    unissued_pool_shares: int,
    new_money_cents: int,
    pre_money_cents: int,
    target: Decimal,
) -> tuple[int, int]:
    if issued_shares <= 0 or unissued_pool_shares < 0:
        raise UnderwritingError("vc_pool_state_invalid")

    target_fraction = Fraction(target)

    def clears(top_up: int) -> tuple[bool, int]:
        fully_diluted_pre = issued_shares + unissued_pool_shares + top_up
        new_shares = _floor_shares(new_money_cents, fully_diluted_pre, pre_money_cents)
        ratio = Fraction(unissued_pool_shares + top_up, fully_diluted_pre + new_shares)
        return ratio >= target_fraction, new_shares

    if target == 0:
        return 0, _floor_shares(
            new_money_cents, issued_shares + unissued_pool_shares, pre_money_cents
        )
    high = 1
    while not clears(high)[0]:
        high *= 2
        if high > 1_000_000_000:
            raise UnderwritingError("vc_pool_top_up_not_bracketed")
    low = 0
    while low < high:
        midpoint = (low + high) // 2
        if clears(midpoint)[0]:
            high = midpoint
        else:
            low = midpoint + 1
    passed, new_shares = clears(low)
    if not passed or (low and clears(low - 1)[0]):
        raise UnderwritingError("vc_pool_top_up_not_minimal")
    return low, new_shares


def _pro_rata(total_cents: int, weights: Mapping[str, int]) -> dict[str, int]:
    positive = {key: value for key, value in weights.items() if value > 0}
    if total_cents < 0 or not positive:
        if total_cents:
            raise UnderwritingError("vc_pro_rata_no_weights")
        return {key: 0 for key in weights}
    denominator = sum(positive.values())
    floors: dict[str, int] = {}
    remainders: list[tuple[Fraction, str]] = []
    for key, weight in positive.items():
        exact = Fraction(total_cents * weight, denominator)
        floor = exact.numerator // exact.denominator
        floors[key] = floor
        remainders.append((exact - floor, key))
    remainder_cents = total_cents - sum(floors.values())
    for _, key in sorted(remainders, key=lambda item: (-item[0], item[1]))[:remainder_cents]:
        floors[key] += 1
    return {key: floors.get(key, 0) for key in weights}


def _profile_allocation(
    *,
    exit_value_cents: int,
    profile: Mapping[str, bool],
    class_shares: Mapping[str, int],
    common_shares: int,
    preferences: Mapping[str, PreferenceTerms],
) -> tuple[dict[str, int], dict[str, int], int]:
    preference_proceeds = {class_id: 0 for class_id in preferences}
    residual_proceeds = {class_id: 0 for class_id in preferences}
    remaining = exit_value_cents

    for seniority in sorted({term.seniority for term in preferences.values()}):
        tier = {
            class_id: int(
                (Decimal(term.invested_cents) * term.preference_multiple).quantize(
                    Decimal("1"), rounding=ROUND_HALF_EVEN
                )
            )
            for class_id, term in preferences.items()
            if term.seniority == seniority and not profile[class_id]
        }
        if not tier:
            continue
        allocation = _pro_rata(min(remaining, sum(tier.values())), tier)
        for class_id, amount in allocation.items():
            preference_proceeds[class_id] += amount
        remaining -= sum(allocation.values())
        if remaining == 0:
            break

    weights = {"COMMON": common_shares}
    caps: dict[str, int | None] = {"COMMON": None}
    for class_id, term in preferences.items():
        eligible = profile[class_id] or term.participation in {
            "PARTICIPATING",
            "CAPPED_PARTICIPATING",
        }
        converted_shares = class_shares.get(class_id, 0) * term.conversion_numerator
        if converted_shares % term.conversion_denominator:
            raise UnderwritingError("vc_fractional_conversion_share")
        weights[class_id] = converted_shares // term.conversion_denominator if eligible else 0
        caps[class_id] = (
            int(
                (Decimal(term.invested_cents) * term.participation_cap_multiple).quantize(
                    Decimal("1"), rounding=ROUND_HALF_EVEN
                )
            )
            if not profile[class_id]
            and term.participation == "CAPPED_PARTICIPATING"
            and term.participation_cap_multiple is not None
            else None
        )

    active = {key for key, weight in weights.items() if weight > 0}
    common_proceeds = 0
    while remaining and active:
        proposal = _pro_rata(remaining, {key: weights[key] for key in active})
        distributed = 0
        capped_keys: set[str] = set()
        for key in sorted(active):
            allocation = proposal[key]
            cap = caps[key]
            already = common_proceeds if key == "COMMON" else (
                preference_proceeds[key] + residual_proceeds[key]
            )
            if cap is not None and already + allocation > cap:
                allocation = max(0, cap - already)
                capped_keys.add(key)
            if key == "COMMON":
                common_proceeds += allocation
            else:
                residual_proceeds[key] += allocation
            distributed += allocation
        remaining -= distributed
        active -= capped_keys
        if not capped_keys:
            break
        if distributed == 0 and not active:
            break
    if remaining:
        common_proceeds += remaining
    total = common_proceeds + sum(preference_proceeds.values()) + sum(residual_proceeds.values())
    if total != exit_value_cents:
        raise UnderwritingError("vc_waterfall_conservation_failed")
    return preference_proceeds, residual_proceeds, common_proceeds


def solve_waterfall(
    *,
    exit_value_cents: int,
    holders: Iterable[Holder],
    preferences: Iterable[PreferenceTerms],
) -> WaterfallResult:
    if exit_value_cents < 0:
        raise UnderwritingError("vc_exit_value_negative")
    holders_tuple = tuple(holders)
    preferences_tuple = tuple(preferences)
    terms = {item.class_id: item for item in preferences_tuple}
    if len(terms) != len(preferences_tuple):
        raise UnderwritingError("vc_preference_class_duplicate")
    class_shares = {
        class_id: sum(item.shares for item in holders_tuple if item.class_id == class_id)
        for class_id in terms
    }
    common_shares = sum(item.shares for item in holders_tuple if item.class_id == "COMMON")
    class_ids = sorted(terms)
    allocations: dict[tuple[bool, ...], tuple[dict[str, int], dict[str, int], int]] = {}
    for choices in product((False, True), repeat=len(class_ids)):
        profile = dict(zip(class_ids, choices, strict=True))
        allocations[choices] = _profile_allocation(
            exit_value_cents=exit_value_cents,
            profile=profile,
            class_shares=class_shares,
            common_shares=common_shares,
            preferences=terms,
        )
    legal: list[tuple[bool, ...]] = []
    for choices, (preference, residual, _) in allocations.items():
        current = {key: preference[key] + residual[key] for key in class_ids}
        valid = True
        for index, class_id in enumerate(class_ids):
            alternative_choices = list(choices)
            alternative_choices[index] = not alternative_choices[index]
            alternative_preference, alternative_residual, _ = allocations[tuple(alternative_choices)]
            alternative = alternative_preference[class_id] + alternative_residual[class_id]
            if alternative > current[class_id] or (alternative == current[class_id] and choices[index]):
                valid = False
                break
        if valid:
            legal.append(choices)
    if len(legal) != 1:
        raise UnderwritingError(f"vc_waterfall_legal_profile_count:{len(legal)}")
    chosen = legal[0]
    preference, residual, common = allocations[chosen]
    proceeds = {key: preference[key] + residual[key] for key in class_ids}
    claims = sorted(
        {
            int(
                (Decimal(term.invested_cents) * term.preference_multiple).quantize(
                    Decimal("1"), rounding=ROUND_HALF_EVEN
                )
            )
            for term in terms.values()
        }
        | {
            sum(
                int(
                    (Decimal(term.invested_cents) * term.preference_multiple).quantize(
                        Decimal("1"), rounding=ROUND_HALF_EVEN
                    )
                )
                for term in terms.values()
                if term.seniority <= tier
            )
            for tier in {term.seniority for term in terms.values()}
        }
    )
    return WaterfallResult(
        exit_value_cents=exit_value_cents,
        conversion_profile=dict(zip(class_ids, chosen, strict=True)),
        class_preference_cents=preference,
        class_residual_cents=residual,
        class_proceeds_cents=proceeds,
        common_proceeds_cents=common,
        breakpoint_candidates_cents=tuple(claims),
    )


def _add_months(origin: date, months: int) -> date:
    raw = origin.month - 1 + months
    year, month = origin.year + raw // 12, raw % 12 + 1
    return date(year, month, min(origin.day, monthrange(year, month)[1]))


def _priced_shares(
    event: FundingEvent,
    *,
    before_issued: int,
    before_pool: int,
    series_c_price: Fraction | None,
) -> tuple[int, int, Fraction]:
    if event.price_rule == "PRE_MONEY":
        if event.pre_money_cents is None:
            raise UnderwritingError("vc_pre_money_missing")
        top_up, shares = solve_pool_top_up(
            issued_shares=before_issued,
            unissued_pool_shares=before_pool,
            new_money_cents=event.new_money_cents,
            pre_money_cents=event.pre_money_cents,
            target=event.pool_target,
        )
        return top_up, shares, Fraction(event.pre_money_cents, before_issued + before_pool + top_up)
    if series_c_price is None:
        raise UnderwritingError("vc_series_c_price_missing")
    if event.price_rule == "SAME_AS_SERIES_C":
        price = series_c_price
    else:
        if event.shortfall_discount is None or not Decimal("0") < event.shortfall_discount < Decimal("1"):
            raise UnderwritingError("vc_shortfall_discount_invalid")
        price = series_c_price * Fraction(Decimal("1") - event.shortfall_discount)
    exact_shares = Fraction(event.new_money_cents, 1) / price
    shares = exact_shares.numerator // exact_shares.denominator
    if shares <= 0:
        raise UnderwritingError("vc_new_shares_zero")
    return 0, shares, price


def run_vc_scenario(
    *,
    assumptions: VCScenarioAssumptions,
    opening_cash_cents: int,
    initial_holders: Iterable[Holder],
    initial_preferences: Iterable[PreferenceTerms],
    unissued_pool_shares: int,
) -> VCScenarioResult:
    initial_holders_tuple = tuple(initial_holders)
    initial_preferences_tuple = tuple(initial_preferences)
    holders = {item.holder_id: item for item in initial_holders_tuple}
    preferences = {item.class_id: item for item in initial_preferences_tuple}
    if len(holders) != len(initial_holders_tuple) or len(preferences) != len(initial_preferences_tuple):
        raise UnderwritingError("vc_initial_cap_table_duplicate")
    if opening_cash_cents < 0 or unissued_pool_shares < 0:
        raise UnderwritingError("vc_opening_balance_invalid")

    cash = opening_cash_cents
    cash_path: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    series_c_price: Fraction | None = None
    first_shortfall_without_contingent: int | None = None
    target_cash_flows: list[DatedCashFlow] = []
    ordinary_events_by_month: dict[int, list[FundingEvent]] = {}
    shortfall_events = [item for item in assumptions.events if item.event_type == "SHORTFALL"]
    for event in assumptions.events:
        if event.event_type != "SHORTFALL":
            ordinary_events_by_month.setdefault(event.scheduled_month, []).append(event)

    for month in range(1, assumptions.exit_month + 1):
        net_cash_flow = assumptions.monthly_net_cash_flow_cents[month - 1]
        beginning_cash = cash
        month_events = list(ordinary_events_by_month.get(month, []))
        expected_funding = sum(item.new_money_cents for item in month_events if item.funded)
        if cash + expected_funding + net_cash_flow < 0:
            first_shortfall_without_contingent = first_shortfall_without_contingent or month
            eligible = [
                item
                for item in shortfall_events
                if item.funded
                and item.scheduled_month <= month
                and not any(record["event_id"] == item.event_id for record in records)
            ]
            if eligible:
                month_events.append(sorted(eligible, key=lambda item: (item.sequence, item.event_id))[0])

        financing_cash = 0
        for event in sorted(month_events, key=lambda item: (item.sequence, item.event_id)):
            if any(record["event_id"] == event.event_id for record in records):
                continue
            before_issued = sum(item.shares for item in holders.values())
            before_pool = unissued_pool_shares
            before_fd = before_issued + before_pool
            record: dict[str, Any] = {
                "event_id": event.event_id,
                "event_type": event.event_type,
                "holder_id": event.holder_id,
                "class_id": event.class_id,
                "scheduled_month": event.scheduled_month,
                "actual_month": month,
                "sequence": event.sequence,
                "date": _add_months(assumptions.close_date, month - 1).isoformat(),
                "milestone_tests": list(event.milestone_tests),
                "milestone_results": [list(result) for result in event.milestone_results],
                "milestone_state": event.milestone_state,
                "evaluator": event.evaluator,
                "cure_period_days": event.cure_period_days,
                "status": "NOT_FUNDED",
                "new_money_cents": 0,
                "new_shares": 0,
                "pool_top_up_shares": 0,
                "issued_shares_before": before_issued,
                "unissued_pool_before": before_pool,
                "fully_diluted_before": before_fd,
                "cash_before_cents": cash,
            }
            if not event.funded:
                record.update(
                    {
                        "issued_shares_after": before_issued,
                        "unissued_pool_after": before_pool,
                        "fully_diluted_after": before_fd,
                        "cash_after_cents": cash,
                        "ownership_numerator": 0,
                        "ownership_denominator": before_fd,
                    }
                )
                record["event_sha256"] = digest(record)
                records.append(record)
                continue

            top_up, new_shares, price = _priced_shares(
                event,
                before_issued=before_issued,
                before_pool=before_pool,
                series_c_price=series_c_price,
            )
            if series_c_price is None and event.class_id == "SERIES_C":
                series_c_price = price
            unissued_pool_shares += top_up
            existing = holders.get(event.holder_id)
            if existing and existing.class_id != event.class_id:
                raise UnderwritingError("vc_holder_class_change")
            holders[event.holder_id] = Holder(
                event.holder_id,
                event.class_id,
                (existing.shares if existing else 0) + new_shares,
            )
            existing_term = preferences.get(event.class_id)
            if existing_term and (
                existing_term.seniority != event.seniority
                or existing_term.preference_multiple != event.preference_multiple
                or existing_term.participation != event.participation
                or existing_term.participation_cap_multiple != event.participation_cap_multiple
            ):
                raise UnderwritingError("vc_class_terms_changed")
            preferences[event.class_id] = PreferenceTerms(
                class_id=event.class_id,
                seniority=event.seniority,
                invested_cents=(existing_term.invested_cents if existing_term else 0)
                + event.new_money_cents,
                preference_multiple=event.preference_multiple,
                participation=event.participation,
                participation_cap_multiple=event.participation_cap_multiple,
            )
            cash += event.new_money_cents
            financing_cash += event.new_money_cents
            if event.holder_id == assumptions.target_holder_id:
                target_cash_flows.append(
                    DatedCashFlow(
                        _add_months(assumptions.close_date, month - 1), -event.new_money_cents
                    )
                )
            after_issued = sum(item.shares for item in holders.values())
            after_fd = after_issued + unissued_pool_shares
            paid_for_shares = price * new_shares
            apic_remainder = Fraction(event.new_money_cents, 1) - paid_for_shares
            record.update(
                {
                    "status": "FUNDED",
                    "new_money_cents": event.new_money_cents,
                    "new_shares": new_shares,
                    "pool_top_up_shares": top_up,
                    "price_per_share_numerator_cents": price.numerator,
                    "price_per_share_denominator": price.denominator,
                    "apic_remainder_numerator_cents": apic_remainder.numerator,
                    "apic_remainder_denominator": apic_remainder.denominator,
                    "issued_shares_after": after_issued,
                    "unissued_pool_after": unissued_pool_shares,
                    "fully_diluted_after": after_fd,
                    "cash_after_cents": cash,
                    "ownership_numerator": new_shares,
                    "ownership_denominator": after_fd,
                }
            )
            record["event_sha256"] = digest(record)
            records.append(record)

        cash += net_cash_flow
        cash_path.append(
            {
                "month": month,
                "date": _add_months(assumptions.close_date, month - 1).isoformat(),
                "beginning_cash_cents": beginning_cash,
                "financing_cash_cents": financing_cash,
                "operating_net_cash_flow_cents": net_cash_flow,
                "ending_cash_cents": cash,
                "first_exhaustion_without_contingent": month
                == first_shortfall_without_contingent,
            }
        )
        if cash < 0:
            raise UnderwritingError(f"vc_cash_exhausted:{assumptions.scenario_id}:{month}")

    waterfall = solve_waterfall(
        exit_value_cents=assumptions.exit_value_cents,
        holders=holders.values(),
        preferences=preferences.values(),
    )
    target_holder = holders.get(assumptions.target_holder_id)
    if target_holder is None:
        raise UnderwritingError("vc_target_holder_missing")
    target_class_holders = {
        item.holder_id: item.shares
        for item in holders.values()
        if item.class_id == target_holder.class_id
    }
    target_proceeds = _pro_rata(
        waterfall.class_proceeds_cents[target_holder.class_id], target_class_holders
    )[assumptions.target_holder_id]
    target_invested = -sum(item.amount_cents for item in target_cash_flows)
    if target_invested <= 0:
        raise UnderwritingError("vc_target_investment_missing")
    target_cash_flows.append(
        DatedCashFlow(
            _add_months(assumptions.close_date, assumptions.exit_month), target_proceeds
        )
    )
    moic = (Decimal(target_proceeds) / Decimal(target_invested)).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_EVEN
    )
    irr = Decimal("-1") if target_proceeds == 0 else xirr(target_cash_flows)
    residual = Decimal(0) if target_proceeds == 0 else abs(npv_cents(irr, target_cash_flows))
    issued_total = sum(item.shares for item in holders.values())
    ownership = (Decimal(target_holder.shares) / Decimal(issued_total + unissued_pool_shares)).quantize(
        Decimal("0.00000001"), rounding=ROUND_HALF_EVEN
    )
    inputs = {
        **_scenario_inputs(assumptions),
        "opening_cash_cents": opening_cash_cents,
        "initial_holders": [asdict(item) for item in initial_holders_tuple],
        "initial_preferences": [_preference_dict(item) for item in initial_preferences_tuple],
        "initial_unissued_pool_shares": unissued_pool_shares
        - sum(int(item["pool_top_up_shares"]) for item in records),
    }
    return VCScenarioResult(
        scenario_id=assumptions.scenario_id,
        assumptions=assumptions,
        opening_cash_cents=opening_cash_cents,
        initial_holders=initial_holders_tuple,
        initial_preferences=initial_preferences_tuple,
        initial_unissued_pool_shares=inputs["initial_unissued_pool_shares"],
        financing_events=tuple(records),
        holders=tuple(sorted(holders.values(), key=lambda item: item.holder_id)),
        preferences=tuple(sorted(preferences.values(), key=lambda item: item.class_id)),
        unissued_pool_shares=unissued_pool_shares,
        cash_by_month=tuple(cash_path),
        first_cash_exhaustion_month_without_contingent_financing=first_shortfall_without_contingent,
        minimum_cash_cents=min(item["ending_cash_cents"] for item in cash_path),
        waterfall=waterfall,
        target_invested_cents=target_invested,
        target_proceeds_cents=target_proceeds,
        target_cash_flows=tuple(
            {
                "date": item.date.isoformat(),
                "amount_cents": item.amount_cents,
            }
            for item in target_cash_flows
        ),
        target_ownership=ownership,
        gross_moic=moic,
        gross_xirr=irr,
        xirr_npv_residual_cents=residual,
        engine_inputs_sha256=digest(inputs),
    )


def simulate_vc_distribution(
    *,
    base_result: VCScenarioResult,
    scenario_results: Iterable[VCScenarioResult] | None = None,
    seed: int,
    draws: int,
    scenario_weights: Mapping[str, Decimal] | None = None,
    exit_multiple_low: Decimal = Decimal("0.35"),
    exit_multiple_high: Decimal = Decimal("1.85"),
) -> dict[str, Any]:
    if draws < 500:
        raise UnderwritingError("vc_distribution_draws_below_minimum")
    rng = random.Random(seed)
    templates = {item.scenario_id: item for item in (scenario_results or (base_result,))}
    if base_result.scenario_id not in templates:
        templates[base_result.scenario_id] = base_result
    canonical_order = [
        item for item in ("MILESTONE", "BASE", "DOWNSIDE", "FINANCING_SHORTFALL")
        if item in templates
    ]
    if not canonical_order:
        raise UnderwritingError("vc_distribution_template_missing")
    if scenario_weights is None:
        canonical_defaults = {
            "MILESTONE": Decimal("0.45"),
            "BASE": Decimal("0.30"),
            "DOWNSIDE": Decimal("0.15"),
            "FINANCING_SHORTFALL": Decimal("0.10"),
        }
        default_total = sum(
            (canonical_defaults[item] for item in canonical_order), Decimal("0")
        )
        declared_weights = {
            item: canonical_defaults[item] / default_total for item in canonical_order
        }
    else:
        declared_weights = scenario_weights
    if set(declared_weights) != set(canonical_order):
        raise UnderwritingError("vc_distribution_weight_keys_invalid")
    if any(value <= 0 for value in declared_weights.values()):
        raise UnderwritingError("vc_distribution_weight_nonpositive")
    if sum(declared_weights.values(), Decimal("0")) != Decimal("1"):
        raise UnderwritingError("vc_distribution_weights_do_not_sum_to_one")
    weights = [float(declared_weights[item]) for item in canonical_order]
    records: list[dict[str, Any]] = []
    for index in range(draws):
        template_id = rng.choices(canonical_order, weights=weights, k=1)[0]
        template = templates[template_id]
        shock = Decimal(str(rng.gauss(0, 1)))
        multiple = min(
            exit_multiple_high,
            max(exit_multiple_low, Decimal("1") + shock * Decimal("0.32")),
        )
        timing_delta = max(-12, min(18, int(round(rng.gauss(2, 7)))))
        operating_factor = Decimal(
            str(
                max(
                    0.85,
                    min(
                        1.00 if template_id == "FINANCING_SHORTFALL" else 1.12,
                        rng.gauss(1.00, 0.07),
                    ),
                )
            )
        )
        exit_value = int(
            (Decimal(template.assumptions.exit_value_cents) * multiple).quantize(
                Decimal("1"), rounding=ROUND_HALF_EVEN
            )
        )
        operating_path_values = [
            int((Decimal(value) * operating_factor).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
            for value in template.assumptions.monthly_net_cash_flow_cents
        ]
        adjusted_horizon_cash = (
            template.cash_by_month[-1]["ending_cash_cents"]
            + sum(operating_path_values)
            - sum(template.assumptions.monthly_net_cash_flow_cents)
        )
        terminal_monthly_cash = operating_path_values[-1]
        extra_liquidity_months = (
            18
            if terminal_monthly_cash >= 0
            else max(0, adjusted_horizon_cash // abs(terminal_monthly_cash))
        )
        liquidity_supported_ceiling = min(
            78, template.assumptions.exit_month + extra_liquidity_months
        )
        exit_month = max(
            24,
            min(
                liquidity_supported_ceiling,
                template.assumptions.exit_month + timing_delta,
            ),
        )
        # The deterministic cases end at month 60, but the distribution must
        # make delayed exits economically real. Extend the final declared
        # monthly cash assumption instead of recording an inert timing delta.
        if exit_month > len(operating_path_values):
            operating_path_values.extend(
                [operating_path_values[-1]] * (exit_month - len(operating_path_values))
            )
        operating_path = tuple(operating_path_values)
        path_assumptions = replace(
            template.assumptions,
            exit_month=exit_month,
            exit_value_cents=exit_value,
            monthly_net_cash_flow_cents=operating_path,
            # A stochastic path perturbs the operating-derived scenario value;
            # it is a conditional stress draw, not the deterministic bridge.
            exit_valuation=None,
        )
        path_result = run_vc_scenario(
            assumptions=path_assumptions,
            opening_cash_cents=template.opening_cash_cents,
            initial_holders=template.initial_holders,
            initial_preferences=template.initial_preferences,
            unissued_pool_shares=template.initial_unissued_pool_shares,
        )
        path_receipt = path_result.receipt()
        body: dict[str, Any] = {
            "path_id": f"VC_PATH_{index:05d}",
            "template_scenario_id": template_id,
            "engine_inputs_sha256": path_result.engine_inputs_sha256,
            "exit_value_cents": exit_value,
            "exit_month": exit_month,
            "exit_value_multiple": format(multiple, "f"),
            "timing_delta_months": timing_delta,
            "realized_timing_delta_months": exit_month - template.assumptions.exit_month,
            "liquidity_supported_exit_ceiling_month": liquidity_supported_ceiling,
            "operating_cash_factor": format(operating_factor, "f"),
            "milestone_state": next(
                (
                    event.milestone_state
                    for event in path_assumptions.events
                    if event.event_type == "MILESTONE"
                ),
                "NOT_APPLICABLE",
            ),
            "target_proceeds_cents": path_result.target_proceeds_cents,
            "gross_moic": format(path_result.gross_moic, "f"),
            "gross_xirr": format(path_result.gross_xirr, "f"),
            "scenario_receipt_sha256": path_receipt["receipt_sha256"],
            "waterfall_receipt_sha256": path_receipt["waterfall"]["receipt_sha256"],
        }
        body["receipt_sha256"] = digest(body)
        records.append(body)
    probabilities = (Decimal("0.10"), Decimal("0.50"), Decimal("0.90"))
    indices = [
        int((Decimal(draws - 1) * value).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
        for value in probabilities
    ]
    moics = sorted(Decimal(item["gross_moic"]) for item in records)
    irrs = sorted(Decimal(item["gross_xirr"]) for item in records)
    body = {
        "schema_version": "underwriting.vc-distribution/v2",
        "seed": seed,
        "draws": draws,
        "base_result_receipt_sha256": base_result.receipt()["receipt_sha256"],
        "template_result_receipt_sha256s": {
            scenario_id: templates[scenario_id].receipt()["receipt_sha256"]
            for scenario_id in canonical_order
        },
        "template_weights": {
            scenario_id: format(declared_weights[scenario_id], "f")
            for scenario_id in canonical_order
        },
        "moic_quantiles": [format(moics[index], "f") for index in indices],
        "xirr_quantiles": [format(irrs[index], "f") for index in indices],
        "probability_below_one": format(
            (
                Decimal(sum(value < 1 for value in moics)) / Decimal(draws)
            ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN),
            "f",
        ),
        "path_records": records,
    }
    body["receipt_sha256"] = digest(body)
    return body
