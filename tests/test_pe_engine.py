from dataclasses import replace
from decimal import Decimal

from underwriting_lab.contracts import digest
from underwriting_lab.pe_engine import (
    PEOperatingAssumptions,
    PETransactionAssumptions,
    PEValueLever,
    build_value_creation_bridge,
    run_pe_case,
    simulate_pe_distribution,
    solve_maximum_bid,
)


def _base_operating() -> PEOperatingAssumptions:
    return PEOperatingAssumptions(
        starting_arr_cents=7_762_428_396,
        starting_ltm_revenue_cents=9_000_000_000,
        starting_normalized_ebitda_cents=2_560_129_054,
        full_cohort_nrr=Decimal("0.9996"),
        annual_new_arr_rate=Decimal("0.10"),
        gross_margin=Decimal("0.7279"),
        annual_opex_growth_rate=Decimal("0.06"),
        capex_as_revenue=Decimal("0.02"),
        working_capital_as_incremental_revenue=Decimal("0.08"),
        cash_tax_rate=Decimal("0.25"),
    )


def _downside_operating() -> PEOperatingAssumptions:
    return replace(
        _base_operating(),
        full_cohort_nrr=Decimal("0.96"),
        annual_new_arr_rate=Decimal("0.08"),
        gross_margin=Decimal("0.70"),
        annual_opex_growth_rate=Decimal("0.01"),
        capex_as_revenue=Decimal("0.025"),
        working_capital_as_incremental_revenue=Decimal("0.10"),
    )


def _transaction(entry_ev: int, *, exit_multiple: str, earnout: bool) -> PETransactionAssumptions:
    return PETransactionAssumptions(
        entry_enterprise_value_cents=entry_ev,
        funded_term_face_cents=12_000_000_000,
        term_oid_rate=Decimal("0.02"),
        transaction_fee_rate=Decimal("0.02"),
        financing_fee_rate=Decimal("0.02"),
        seller_rollover_cents=0,
        minimum_cash_cents=300_000_000,
        revolver_commitment_cents=2_000_000_000,
        annual_cash_rate=Decimal("0.09"),
        annual_pik_rate=Decimal("0"),
        annual_mandatory_amortization_rate=Decimal("0.01"),
        sweep_rate=Decimal("0.75"),
        maximum_gross_leverage=Decimal("5.25"),
        exit_multiple=Decimal(exit_multiple),
        earnout_threshold_arr_cents=8_800_000_000 if earnout else None,
        earnout_cap_cents=2_000_000_000 if earnout else 0,
    )


def test_ask_misses_and_selected_structure_clears_frozen_hurdles() -> None:
    ask = run_pe_case(
        scenario_id="ASK",
        operating=_base_operating(),
        transaction=_transaction(24_000_000_000, exit_multiple="6.5", earnout=False),
    )
    selected = run_pe_case(
        scenario_id="SELECTED",
        operating=_base_operating(),
        transaction=_transaction(21_000_000_000, exit_multiple="6.5", earnout=True),
    )
    assert ask.gross_xirr < Decimal("0.22")
    assert selected.gross_xirr >= Decimal("0.22")
    assert selected.gross_moic >= Decimal("2.00")
    assert selected.gross_xirr > ask.gross_xirr
    assert selected.earnout_cents > 0


def test_selected_downside_preserves_floor_and_monthly_boundary() -> None:
    downside = run_pe_case(
        scenario_id="DOWNSIDE",
        operating=_downside_operating(),
        transaction=_transaction(21_000_000_000, exit_multiple="5.0", earnout=True),
    )
    assert downside.gross_xirr >= Decimal("0.05")
    assert downside.gross_moic >= Decimal("1.25")
    assert downside.debt_schedule.minimum_liquidity_cents >= 300_000_000
    assert downside.debt_schedule.first_covenant_breach_month is None
    assert not downside.debt_schedule.has_payment_default
    assert downside.earnout_cents == 0
    month_18 = downside.debt_schedule.months[17]
    month_19 = downside.debt_schedule.months[18]
    assert month_18.month == 18 and month_19.month == 19
    assert not month_18.covenant_breach and not month_19.covenant_breach


def test_maximum_bid_is_solved_with_terms_and_operations_fixed() -> None:
    transaction = _transaction(21_000_000_000, exit_multiple="6.5", earnout=True)
    maximum_bid = solve_maximum_bid(
        operating=_base_operating(),
        transaction=transaction,
        minimum_irr=Decimal("0.22"),
        minimum_moic=Decimal("2.00"),
        low_cents=15_000_000_000,
        high_cents=26_000_000_000,
    )
    assert 21_600_000_000 <= maximum_bid <= 21_700_000_000
    at_limit = run_pe_case(
        scenario_id="MAX_BID",
        operating=_base_operating(),
        transaction=replace(transaction, entry_enterprise_value_cents=maximum_bid),
    )
    above_limit = run_pe_case(
        scenario_id="ABOVE_MAX_BID",
        operating=_base_operating(),
        transaction=replace(transaction, entry_enterprise_value_cents=maximum_bid + 1),
    )
    assert at_limit.gross_xirr >= Decimal("0.22") and at_limit.gross_moic >= Decimal("2")
    assert above_limit.gross_xirr < Decimal("0.22") or above_limit.gross_moic < Decimal("2")


def test_pe_receipt_is_bound_and_evidence_input_changes_propagate() -> None:
    first = run_pe_case(
        scenario_id="BASE",
        operating=_base_operating(),
        transaction=_transaction(21_000_000_000, exit_multiple="6.5", earnout=True),
    )
    changed = run_pe_case(
        scenario_id="BASE",
        operating=replace(_base_operating(), full_cohort_nrr=Decimal("0.98")),
        transaction=_transaction(21_000_000_000, exit_multiple="6.5", earnout=True),
    )
    receipt = first.receipt()
    expected = receipt.pop("receipt_sha256")
    assert expected == digest(receipt)
    assert changed.engine_inputs_sha256 != first.engine_inputs_sha256
    assert changed.exit_enterprise_value_cents != first.exit_enterprise_value_cents
    assert changed.gross_xirr != first.gross_xirr


def test_distribution_recomputes_complete_paths_with_declared_correlation() -> None:
    transaction = _transaction(21_000_000_000, exit_multiple="6.5", earnout=True)
    first = simulate_pe_distribution(
        operating=_base_operating(), transaction=transaction, seed=41, draws=100
    )
    repeat = simulate_pe_distribution(
        operating=_base_operating(), transaction=transaction, seed=41, draws=100
    )
    changed = simulate_pe_distribution(
        operating=_base_operating(), transaction=transaction, seed=42, draws=100
    )
    assert first.receipt() == repeat.receipt()
    assert first.receipt() != changed.receipt()
    assert list(first.moic_quantiles) == sorted(first.moic_quantiles)
    assert list(first.xirr_quantiles) == sorted(first.xirr_quantiles)
    assert len(first.path_receipt_sha256s) == 100
    assert len(set(first.path_receipt_sha256s)) == 100


def test_value_creation_bridge_reconciles_standalone_and_interaction_value() -> None:
    bridge = build_value_creation_bridge(
        operating=_base_operating(),
        transaction=_transaction(21_000_000_000, exit_multiple="6.5", earnout=True),
        levers=[
            PEValueLever(
                "renewal",
                "Renewal architecture",
                nrr_delta=Decimal("0.015"),
                implementation_costs_by_month=((1, 75_000_000), (2, 75_000_000)),
            ),
            PEValueLever(
                "support",
                "Support automation",
                nrr_delta=Decimal("0.005"),
                gross_margin_delta=Decimal("0.010"),
                implementation_costs_by_month=((1, 100_000_000), (2, 100_000_000)),
            ),
            PEValueLever(
                "delivery",
                "Delivery cost reset",
                gross_margin_delta=Decimal("0.015"),
                implementation_costs_by_month=((3, 125_000_000), (4, 125_000_000)),
            ),
        ],
    )
    assert len(bridge.standalone) == 3
    assert bridge.combined_exit_equity_delta_cents == (
        bridge.sum_standalone_exit_equity_delta_cents + bridge.interaction_residual_cents
    )
    assert bridge.combined_exit_equity_delta_cents > 0
    assert bridge.combined_gross_xirr_delta > 0
    receipt = bridge.receipt()
    expected = receipt.pop("receipt_sha256")
    assert expected == digest(receipt)
