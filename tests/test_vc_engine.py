from dataclasses import replace
from datetime import date
from decimal import Decimal
import random

import pytest

from underwriting_lab.contracts import UnderwritingError, digest
from underwriting_lab.finance import DatedCashFlow, npv_cents, xirr
from underwriting_lab.vc_engine import (
    FundingEvent,
    Holder,
    PreferenceTerms,
    VCScenarioAssumptions,
    run_vc_scenario,
    simulate_vc_distribution,
    solve_pool_top_up,
    solve_waterfall,
)
from tests.oracles.waterfall_reference import (
    reference_breakpoints,
    reference_waterfall,
)


def _opening() -> tuple[tuple[Holder, ...], tuple[PreferenceTerms, ...]]:
    holders = (
        Holder("founders", "COMMON", 4_800_000),
        Holder("employees", "COMMON", 1_300_000),
        Holder("series-a-investor", "SERIES_A", 2_050_000),
        Holder("series-b-investor", "SERIES_B", 1_850_000),
    )
    preferences = (
        PreferenceTerms(
            "SERIES_A", 3, 1_200_000_000, Decimal("1"), "NON_PARTICIPATING"
        ),
        PreferenceTerms(
            "SERIES_B",
            2,
            2_400_000_000,
            Decimal("1"),
            "CAPPED_PARTICIPATING",
            Decimal("2"),
        ),
    )
    return holders, preferences


def _event(
    event_id: str,
    month: int,
    amount: int,
    class_id: str,
    holder_id: str,
    *,
    event_type: str = "PRIMARY",
    funded: bool = True,
    pre_money: int | None = 16_000_000_000,
    price_rule: str = "PRE_MONEY",
    seniority: int = 1,
    sequence: int = 10,
    discount: str | None = None,
) -> FundingEvent:
    return FundingEvent(
        event_id=event_id,
        scheduled_month=month,
        sequence=sequence,
        event_type=event_type,
        holder_id=holder_id,
        class_id=class_id,
        new_money_cents=amount,
        pre_money_cents=pre_money,
        price_rule=price_rule,
        pool_target=Decimal("0.12") if event_type == "PRIMARY" else Decimal("0"),
        milestone_tests=("HX-NRR", "HX-GM") if event_type == "MILESTONE" else (),
        milestone_results=(
            (("HX-NRR", "PASS"), ("HX-GM", "PASS"))
            if funded and event_type == "MILESTONE"
            else (("HX-NRR", "FAIL"), ("HX-GM", "PASS"))
            if event_type == "MILESTONE"
            else ()
        ),
        milestone_state="PASS" if funded and event_type == "MILESTONE" else (
            "FAIL" if event_type == "MILESTONE" else "NOT_APPLICABLE"
        ),
        evaluator="IC_OBSERVER" if event_type == "MILESTONE" else "NOT_APPLICABLE",
        cure_period_days=30 if event_type == "MILESTONE" else 0,
        funded=funded,
        shortfall_discount=Decimal(discount) if discount else None,
        seniority=seniority,
    )


def _scenario(scenario_id: str) -> VCScenarioAssumptions:
    close = _event("series-c-close", 1, 2_500_000_000, "SERIES_C", "series-c-investor")
    withheld = _event(
        "series-c-tranche",
        12,
        1_500_000_000,
        "SERIES_C",
        "series-c-investor",
        event_type="MILESTONE",
        funded=False,
        pre_money=None,
        price_rule="SAME_AS_SERIES_C",
    )
    if scenario_id == "BASE":
        events = (
            close,
            withheld,
            _event(
                "series-d-base",
                30,
                2_000_000_000,
                "SERIES_D",
                "series-d-investor",
                event_type="LATER_ROUND",
                pre_money=45_000_000_000,
                seniority=0,
            ),
        )
        path = tuple(-82_500_000 for _ in range(60))
        exit_value = 120_000_000_000
    elif scenario_id == "MILESTONE":
        events = (
            close,
            replace(
                withheld,
                funded=True,
                milestone_state="PASS",
                milestone_results=(("HX-NRR", "PASS"), ("HX-GM", "PASS")),
            ),
        )
        path = tuple(-75_000_000 for _ in range(60))
        exit_value = 160_000_000_000
    elif scenario_id == "DOWNSIDE":
        events = (
            close,
            withheld,
            _event(
                "series-d-down",
                18,
                4_000_000_000,
                "SERIES_D",
                "series-d-investor",
                event_type="LATER_ROUND",
                pre_money=12_000_000_000,
                seniority=0,
            ),
        )
        path = tuple(-125_000_000 for _ in range(60))
        exit_value = 35_000_000_000
    else:
        events = (
            close,
            withheld,
            _event(
                "series-c-bridge",
                1,
                3_500_000_000,
                "SERIES_BRIDGE",
                "bridge-investor",
                event_type="SHORTFALL",
                pre_money=None,
                price_rule="DISCOUNT_TO_SERIES_C",
                seniority=0,
                sequence=90,
                discount="0.25",
            ),
        )
        path = tuple(-125_000_000 for _ in range(60))
        exit_value = 50_000_000_000
    return VCScenarioAssumptions(
        scenario_id=scenario_id,
        close_date=date(2024, 12, 31),
        exit_month=60,
        exit_value_cents=exit_value,
        monthly_net_cash_flow_cents=path,
        events=events,
        target_holder_id="series-c-investor",
    )


def _run(scenario_id: str):
    holders, preferences = _opening()
    return run_vc_scenario(
        assumptions=_scenario(scenario_id),
        opening_cash_cents=1_900_000_000,
        initial_holders=holders,
        initial_preferences=preferences,
        unissued_pool_shares=1_400_000,
    )


def test_pool_top_up_is_exact_and_minimal() -> None:
    top_up, shares = solve_pool_top_up(
        issued_shares=10_000_000,
        unissued_pool_shares=1_400_000,
        new_money_cents=2_500_000_000,
        pre_money_cents=16_000_000_000,
        target=Decimal("0.12"),
    )
    denominator = 11_400_000 + top_up + shares
    assert Decimal(1_400_000 + top_up) / Decimal(denominator) >= Decimal("0.12")
    previous_shares = (2_500_000_000 * (11_400_000 + top_up - 1)) // 16_000_000_000
    assert Decimal(1_400_000 + top_up - 1) / Decimal(
        11_400_000 + top_up - 1 + previous_shares
    ) < Decimal("0.12")


def test_four_scenarios_are_real_recomputations() -> None:
    results = [_run(item) for item in ("BASE", "MILESTONE", "DOWNSIDE", "FINANCING_SHORTFALL")]
    assert len({item.engine_inputs_sha256 for item in results}) == 4
    assert len({item.receipt()["receipt_sha256"] for item in results}) == 4
    assert all(item.target_proceeds_cents >= 0 for item in results)
    assert all(item.xirr_npv_residual_cents <= 1 for item in results)
    assert all(item.waterfall.receipt()["conservation_residual_cents"] == 0 for item in results)
    milestone = results[1]
    assert sum(item["new_money_cents"] for item in milestone.financing_events) == 4_000_000_000
    downside = results[2]
    assert any(item["event_id"] == "series-d-down" for item in downside.financing_events)
    shortfall = results[3]
    bridge = next(item for item in shortfall.financing_events if item["event_type"] == "SHORTFALL")
    assert bridge["actual_month"] == shortfall.first_cash_exhaustion_month_without_contingent_financing


def test_unfunded_milestone_has_no_cash_shares_preference_or_investment() -> None:
    base = _run("BASE")
    milestone = next(item for item in base.financing_events if item["event_type"] == "MILESTONE")
    assert milestone["status"] == "NOT_FUNDED"
    assert milestone["new_money_cents"] == milestone["new_shares"] == 0
    assert base.target_invested_cents == 2_500_000_000


def test_milestone_funding_is_derived_from_complete_test_results() -> None:
    with pytest.raises(UnderwritingError, match="vc_milestone_funding_not_derived"):
        replace(
            _event(
                "bad-tranche",
                12,
                1_500_000_000,
                "SERIES_C",
                "series-c-investor",
                event_type="MILESTONE",
                funded=False,
            ),
            funded=True,
        )
    with pytest.raises(UnderwritingError, match="vc_milestone_results_incomplete"):
        FundingEvent(
            event_id="missing-test",
            scheduled_month=12,
            sequence=1,
            event_type="MILESTONE",
            holder_id="series-c-investor",
            class_id="SERIES_C",
            new_money_cents=1_500_000_000,
            pre_money_cents=None,
            price_rule="SAME_AS_SERIES_C",
            milestone_tests=("HX-NRR", "HX-GM"),
            milestone_results=(("HX-NRR", "PASS"),),
            milestone_state="PASS",
            funded=True,
        )


def test_unissued_pool_receives_no_exit_proceeds() -> None:
    result = _run("MILESTONE")
    assert result.unissued_pool_shares > 0
    assert sum(result.waterfall.class_proceeds_cents.values()) + result.waterfall.common_proceeds_cents == result.waterfall.exit_value_cents
    assert "OPTION_POOL" not in result.waterfall.class_proceeds_cents


def test_fully_granted_pool_is_a_conservative_exit_sensitivity() -> None:
    holders, preferences = _opening()
    cancelled = _run("MILESTONE")
    granted = run_vc_scenario(
        assumptions=replace(
            _scenario("MILESTONE"), pool_exit_treatment="FULLY_GRANTED_COMMON"
        ),
        opening_cash_cents=1_900_000_000,
        initial_holders=holders,
        initial_preferences=preferences,
        unissued_pool_shares=1_400_000,
    )
    assert granted.target_proceeds_cents <= cancelled.target_proceeds_cents
    assert granted.gross_moic <= cancelled.gross_moic
    assert (
        sum(granted.waterfall.class_proceeds_cents.values())
        + granted.waterfall.common_proceeds_cents
        == granted.waterfall.exit_value_cents
    )
    assert granted.receipt()["pool_exit_treatment"] == "FULLY_GRANTED_COMMON"


def test_waterfall_conserves_and_changes_conversion_at_boundaries() -> None:
    holders, preferences = _opening()
    profiles = set()
    for exit_value in (0, 1, 1_199_999_999, 1_200_000_000, 3_600_000_000, 20_000_000_000, 200_000_000_000):
        result = solve_waterfall(
            exit_value_cents=exit_value, holders=holders, preferences=preferences
        )
        assert sum(result.class_proceeds_cents.values()) + result.common_proceeds_cents == exit_value
        profiles.add(tuple(sorted(result.conversion_profile.items())))
    assert len(profiles) >= 2


def test_seeded_waterfall_properties_cover_500_examples() -> None:
    rng = random.Random(20260829)
    holders, preferences = _opening()
    for _ in range(500):
        exit_value = rng.randrange(0, 300_000_000_001)
        result = solve_waterfall(
            exit_value_cents=exit_value, holders=holders, preferences=preferences
        )
        assert result.common_proceeds_cents >= 0
        assert all(value >= 0 for value in result.class_proceeds_cents.values())
        assert sum(result.class_proceeds_cents.values()) + result.common_proceeds_cents == exit_value


def test_independent_waterfall_oracle_matches_500_draws_and_breakpoints() -> None:
    rng = random.Random(20260830)
    holders, preferences = _opening()
    for exit_value in [rng.randrange(0, 300_000_000_001) for _ in range(500)]:
        actual = solve_waterfall(
            exit_value_cents=exit_value, holders=holders, preferences=preferences
        )
        profile, class_proceeds, common_proceeds = reference_waterfall(
            exit_value, holders, preferences
        )
        assert actual.conversion_profile == profile
        assert actual.class_proceeds_cents == class_proceeds
        assert actual.common_proceeds_cents == common_proceeds
    breakpoints = reference_breakpoints(holders, preferences, 300_000_000_000)
    assert breakpoints
    for breakpoint in breakpoints:
        for exit_value in (breakpoint - 1, breakpoint, breakpoint + 1):
            actual = solve_waterfall(
                exit_value_cents=exit_value,
                holders=holders,
                preferences=preferences,
            )
            profile, class_proceeds, common_proceeds = reference_waterfall(
                exit_value, holders, preferences
            )
            assert actual.conversion_profile == profile
            assert actual.class_proceeds_cents == class_proceeds
            assert actual.common_proceeds_cents == common_proceeds


def test_distribution_replays_engine_paths_and_is_deterministic() -> None:
    base = _run("MILESTONE")
    first = simulate_vc_distribution(base_result=base, seed=31, draws=500)
    repeat = simulate_vc_distribution(base_result=base, seed=31, draws=500)
    assert first == repeat
    assert len(first["path_records"]) == 500
    assert len({item["engine_inputs_sha256"] for item in first["path_records"]}) > 450
    assert any(item["exit_month"] > base.assumptions.exit_month for item in first["path_records"])
    delayed = run_vc_scenario(
        assumptions=replace(
            base.assumptions,
            exit_month=66,
            monthly_net_cash_flow_cents=(
                *base.assumptions.monthly_net_cash_flow_cents,
                *([base.assumptions.monthly_net_cash_flow_cents[-1]] * 6),
            ),
        ),
        opening_cash_cents=base.opening_cash_cents,
        initial_holders=base.initial_holders,
        initial_preferences=base.initial_preferences,
        unissued_pool_shares=base.initial_unissued_pool_shares,
    )
    assert delayed.gross_xirr < base.gross_xirr
    assert first["template_weights"] == {"MILESTONE": "1"}
    assert first["receipt_sha256"] == digest(
        {key: value for key, value in first.items() if key != "receipt_sha256"}
    )


def test_xirr_dynamically_brackets_venture_return() -> None:
    flows = (
        DatedCashFlow(date(2024, 1, 1), -100_000_000),
        DatedCashFlow(date(2025, 1, 1), 3_000_000_000),
    )
    rate = xirr(flows)
    assert rate > Decimal("10")
    assert abs(npv_cents(rate, flows)) <= 1


def test_cash_exhaustion_without_bridge_fails_closed() -> None:
    assumptions = replace(
        _scenario("FINANCING_SHORTFALL"),
        events=tuple(
            replace(item, funded=False) if item.event_type == "SHORTFALL" else item
            for item in _scenario("FINANCING_SHORTFALL").events
        ),
    )
    holders, preferences = _opening()
    with pytest.raises(UnderwritingError, match="vc_cash_exhausted"):
        run_vc_scenario(
            assumptions=assumptions,
            opening_cash_cents=1_900_000_000,
            initial_holders=holders,
            initial_preferences=preferences,
            unissued_pool_shares=1_400_000,
        )
