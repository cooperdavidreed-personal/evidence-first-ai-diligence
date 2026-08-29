from dataclasses import replace
from datetime import date
from decimal import Decimal

from underwriting_lab.contracts import digest
from underwriting_lab.pe_engine import (
    PEOperatingAssumptions,
    PETransactionAssumptions,
    PEValueLever,
    build_pe_sensitivity_book,
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
        starting_annual_opex_cents=3_888_770_946,
        full_cohort_nrr=Decimal("0.9996"),
        annual_new_arr_rate=Decimal("0.10"),
        gross_margin=Decimal("0.7279"),
        annual_opex_growth_rate=Decimal("0.06"),
        capex_as_revenue=Decimal("0.02"),
        working_capital_as_incremental_revenue=Decimal("0.08"),
        cash_tax_rate=Decimal("0.25"),
        tax_depreciation_as_capex=Decimal("0.80"),
        preclose_lender_ebitda_cents=(213_344_088,) * 11,
        preclose_lender_ebitda_source_sha256="a" * 64,
    )


def _downside_operating() -> PEOperatingAssumptions:
    return replace(
        _base_operating(),
        full_cohort_nrr=Decimal("0.97"),
        annual_new_arr_rate=Decimal("0.08"),
        gross_margin=Decimal("0.71"),
        annual_opex_growth_rate=Decimal("0.02"),
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
        maturity_months=72,
        interest_balance_convention="BEGINNING_FUNDED_PRINCIPAL",
        paydown_priority=("REVOLVER", "TERM"),
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
    assert 15_000_000_000 <= maximum_bid <= 26_000_000_000
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


def test_earnout_threshold_partial_cap_and_close_relative_dates() -> None:
    base_transaction = _transaction(
        21_000_000_000, exit_multiple="6.5", earnout=False
    )
    baseline = run_pe_case(
        scenario_id="NO_EARNOUT",
        operating=_base_operating(),
        transaction=base_transaction,
        close_date=date(2024, 2, 29),
    )
    month_24_arr = baseline.arr_cents_by_month[23]
    below = run_pe_case(
        scenario_id="BELOW",
        operating=_base_operating(),
        transaction=replace(
            base_transaction,
            earnout_threshold_arr_cents=month_24_arr + 1,
            earnout_cap_cents=2_000_000_000,
        ),
        close_date=date(2024, 2, 29),
    )
    partial = run_pe_case(
        scenario_id="PARTIAL",
        operating=_base_operating(),
        transaction=replace(
            base_transaction,
            earnout_threshold_arr_cents=month_24_arr - 100_000_000,
            earnout_cap_cents=2_000_000_000,
        ),
        close_date=date(2024, 2, 29),
    )
    capped = run_pe_case(
        scenario_id="CAPPED",
        operating=_base_operating(),
        transaction=replace(
            base_transaction,
            earnout_threshold_arr_cents=month_24_arr * 4 // 5,
            earnout_cap_cents=2_000_000_000,
        ),
        close_date=date(2024, 2, 29),
    )
    assert below.earnout_cents == 0
    assert 0 < partial.earnout_cents < 2_000_000_000
    assert capped.earnout_cents == 2_000_000_000
    assert partial.sponsor_cash_flows[1].date == date(2026, 3, 29)
    assert partial.sponsor_cash_flows[-1].date == date(2029, 2, 28)


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
    assert len(first.path_records) == 100
    assert first.correlation_structure_sha256 == digest(first.correlation_structure)
    for record, result_sha256 in zip(first.path_records, first.path_receipt_sha256s, strict=True):
        record_body = dict(record)
        record_sha256 = record_body.pop("receipt_sha256")
        assert record_sha256 == digest(record_body)
        assert record["result_receipt_sha256"] == result_sha256
        assert all(value == 0 for value in record["reconciliation"].values())
        if record["xirr_status"] == "TOTAL_LOSS_BOUNDARY":
            assert record["gross_moic"] == "0.0000"
            assert record["gross_xirr"] == "-1"


def test_sensitivity_book_recomputes_each_cell_and_is_monotone() -> None:
    book = build_pe_sensitivity_book(
        operating=_base_operating(),
        transaction=_transaction(21_000_000_000, exit_multiple="6.5", earnout=True),
    )
    receipt = book.receipt()
    expected = receipt.pop("receipt_sha256")
    assert expected == digest(receipt)
    assert len(book.one_way) == 18
    assert len(book.entry_exit_matrix) == 9
    assert len({item.receipt()["receipt_sha256"] for item in book.one_way}) == 18

    by_axis: dict[str, list] = {}
    for item in book.one_way:
        by_axis.setdefault(item.axis, []).append(item)
        cell = item.receipt()
        cell_expected = cell.pop("receipt_sha256")
        assert cell_expected == digest(cell)
        assert item.result_receipt_sha256
        assert item.engine_inputs_sha256

    entry = by_axis["entry_enterprise_value_cents"]
    assert entry[0].gross_xirr >= entry[1].gross_xirr >= entry[2].gross_xirr
    assert entry[0].gross_moic >= entry[1].gross_moic >= entry[2].gross_moic
    exit_multiple = by_axis["exit_multiple"]
    assert exit_multiple[0].gross_xirr <= exit_multiple[1].gross_xirr <= exit_multiple[2].gross_xirr
    assert exit_multiple[0].gross_moic <= exit_multiple[1].gross_moic <= exit_multiple[2].gross_moic
    nrr = by_axis["full_cohort_nrr"]
    assert nrr[0].gross_xirr <= nrr[1].gross_xirr <= nrr[2].gross_xirr


def test_sensitivity_assumption_change_mutates_book_receipt() -> None:
    transaction = _transaction(21_000_000_000, exit_multiple="6.5", earnout=True)
    first = build_pe_sensitivity_book(
        operating=_base_operating(), transaction=transaction
    )
    changed = build_pe_sensitivity_book(
        operating=replace(_base_operating(), annual_new_arr_rate=Decimal("0.11")),
        transaction=transaction,
    )
    assert first.receipt()["receipt_sha256"] != changed.receipt()["receipt_sha256"]


def test_value_creation_bridge_reconciles_standalone_and_interaction_value() -> None:
    bridge = build_value_creation_bridge(
        operating=_base_operating(),
        transaction=_transaction(21_000_000_000, exit_multiple="6.5", earnout=True),
        levers=[
            PEValueLever(
                "renewal",
                "Renewal architecture",
                credit_classification="HUMAN_JUDGMENT",
                source_analysis_ids=("AG-07",),
                assumption_ids=("assumption:renewal-process-nrr-uplift",),
                nrr_delta=Decimal("0.015"),
                implementation_costs_by_month=((1, 75_000_000), (2, 75_000_000)),
            ),
            PEValueLever(
                "support",
                "Support automation",
                credit_classification="MIXED_CAUSAL_SYNTHETIC_AND_HUMAN_JUDGMENT",
                source_analysis_ids=("AG-08",),
                assumption_ids=("assumption:support-margin-uplift",),
                nrr_delta=Decimal("0.005"),
                gross_margin_delta=Decimal("0.010"),
                implementation_costs_by_month=((1, 100_000_000), (2, 100_000_000)),
            ),
            PEValueLever(
                "delivery",
                "Delivery cost reset",
                credit_classification="HUMAN_JUDGMENT",
                source_analysis_ids=("AG-04", "AG-09"),
                assumption_ids=("assumption:delivery-margin-uplift",),
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
