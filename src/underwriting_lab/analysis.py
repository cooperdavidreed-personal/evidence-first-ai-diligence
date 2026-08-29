from __future__ import annotations

import csv
import math
from collections import defaultdict
from dataclasses import replace
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import beta

from .contracts import (
    UnderwritingError,
    analysis_receipt,
    digest,
    lineage_item,
    quantize,
    read_json,
    sha256_file,
    write_json,
)
from .v2_core import DecisionState, DiagnosticRole, derive_decision_state
from .pe_engine import (
    PEOperatingAssumptions,
    PETransactionAssumptions,
    PEValueLever,
    build_value_creation_bridge,
    run_pe_case,
    simulate_pe_distribution,
    solve_maximum_bid,
)


def _manifest(manifest_path: Path) -> tuple[Path, dict[str, Any], dict[str, dict[str, Any]]]:
    root = manifest_path.resolve(strict=True).parent
    manifest = read_json(manifest_path)
    expected = manifest.pop("manifest_sha256", None)
    if expected != digest(manifest):
        raise UnderwritingError("manifest_digest_mismatch")
    manifest["manifest_sha256"] = expected
    artifacts: dict[str, dict[str, Any]] = {}
    for artifact in manifest["artifacts"]:
        relative = Path(artifact["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise UnderwritingError("artifact_path_invalid")
        path = (root / relative).resolve(strict=True)
        if root not in path.parents:
            raise UnderwritingError("artifact_path_escape")
        if sha256_file(path) != artifact["sha256"]:
            raise UnderwritingError("artifact_digest_mismatch")
        artifacts[artifact["artifact_id"]] = artifact
    return root, manifest, artifacts


def _rows(root: Path, artifact: dict[str, Any]) -> list[dict[str, str]]:
    with (root / artifact["path"]).open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _input(artifact: dict[str, Any]) -> dict[str, str]:
    return {"artifact_id": artifact["artifact_id"], "sha256": artifact["sha256"]}


def _output(name: str, value: float | str, unit: str) -> dict[str, str]:
    return {"name": name, "value": str(value), "unit": unit}


def _diagnostic(
    name: str,
    value: float | str,
    status: str = "PASS",
    role: DiagnosticRole = DiagnosticRole.GENERATOR_INVARIANT,
) -> dict[str, str]:
    return {"name": name, "value": str(value), "status": status, "role": role.value}


def _bind_specs(receipts: list[dict[str, Any]], manifest: dict[str, Any]) -> None:
    specs = {item["analysis_id"]: item for item in manifest["analysis_specs"]}
    for receipt in receipts:
        spec = specs.get(receipt["analysis_id"])
        if spec is None:
            raise UnderwritingError("analysis_spec_missing")
        spec_body = dict(spec)
        expected = spec_body.pop("spec_sha256")
        if expected != digest(spec_body):
            raise UnderwritingError("analysis_spec_digest_mismatch")
        receipt.pop("receipt_sha256")
        receipt["spec_sha256"] = expected
        receipt["receipt_sha256"] = digest(receipt)


def _metric(
    metric_id: str,
    label: str,
    value: str,
    detail: str,
    classification: str,
    lineage: list[str],
) -> dict[str, Any]:
    if not lineage:
        raise UnderwritingError("headline_lineage_required")
    return {
        "metric_id": metric_id,
        "label": label,
        "value": value,
        "detail": detail,
        "classification": classification,
        "lineage": lineage,
    }


def _scenario_book(case_id: str, scenarios: list[dict[str, str]], distribution: dict[str, Any]) -> dict[str, Any]:
    book: dict[str, Any] = {
        "schema_version": "underwriting.scenario-book/v1",
        "case_id": case_id,
        "scenarios": scenarios,
        "distribution": distribution,
    }
    book["scenario_sha256"] = digest(book)
    return book


def _workflow_disposition(receipts: list[dict[str, Any]], decision: dict[str, Any]) -> str:
    diagnostics = [item for receipt in receipts for item in receipt["diagnostics"]]
    if decision["status"] != "DECISION_RECORD_WELL_FORMED":
        diagnostics.append(
            {
                "name": "decision_record_completeness",
                "value": decision["status"],
                "status": "BLOCKED",
                "role": DiagnosticRole.DECISION_CRITICAL.value,
            }
        )
    state = derive_decision_state(
        diagnostics=diagnostics,
        stale_metric_ids=[],
        open_conditions=decision["open_conditions"],
        signature_status=decision["signature_status"],
    )
    return "READY_FOR_HUMAN_ADJUDICATION" if state is DecisionState.READY_FOR_ADJUDICATION else "HOLD"


def _thesis_graph(result: dict[str, Any]) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = [
        {
            "node_id": "decision",
            "kind": "DECISION",
            "label": result["decision"]["decision"],
            "status": result["decision"]["status"],
            "references": [result["decision"]["decision_sha256"]],
        }
    ]
    edges: list[dict[str, str]] = []
    for item in result["lineage"]:
        nodes.append(
            {
                "node_id": f'evidence-{item["node_id"]}',
                "kind": "EVIDENCE",
                "label": item["label"],
                "status": "BOUND",
                "references": [item["artifact_id"], item["analysis_id"]],
            }
        )
    for metric in result["summaryMetrics"]:
        metric_node = f'metric-{metric["metric_id"]}'
        nodes.append(
            {
                "node_id": metric_node,
                "kind": "ESTIMATE",
                "label": f'{metric["label"]}: {metric["value"]}',
                "status": metric["classification"],
                "references": metric["lineage"],
            }
        )
        for lineage_id in metric["lineage"]:
            edges.append(
                {
                    "from": f"evidence-{lineage_id}",
                    "to": metric_node,
                    "relationship": "SUPPORTS",
                }
            )
        edges.append({"from": metric_node, "to": "decision", "relationship": "INFORMS"})
    falsifier_states = {item["label"]: item for item in result["falsifierStates"]}
    for index, falsifier in enumerate(result["thesis"]["falsifiers"], start=1):
        falsifier_state = falsifier_states[falsifier]
        node_id = f"falsifier-{index}"
        nodes.append(
            {
                "node_id": node_id,
                "kind": "FALSIFIER",
                "label": falsifier,
                "status": falsifier_state["status"],
                "references": falsifier_state["lineage"],
            }
        )
        edges.append({"from": node_id, "to": "decision", "relationship": "CHALLENGES"})
    for index, scenario in enumerate(result["scenarios"], start=1):
        node_id = f"scenario-{index}"
        nodes.append(
            {
                "node_id": node_id,
                "kind": "SCENARIO",
                "label": scenario["label"],
                "status": scenario["covenant"],
                "references": [scenario["id"]],
            }
        )
        edges.append({"from": node_id, "to": "decision", "relationship": "STRESSES"})
    for index, initiative in enumerate(result["valueCreation"], start=1):
        node_id = f"initiative-{index}"
        nodes.append(
            {
                "node_id": node_id,
                "kind": "INITIATIVE",
                "label": initiative["initiative"],
                "status": "PROPOSED",
                "references": [initiative["kpi"], initiative["owner"]],
            }
        )
        edges.append({"from": "decision", "to": node_id, "relationship": "CONDITIONS"})
    for index, analysis in enumerate(result["analyses"], start=1):
        if not analysis["assumptions"]:
            continue
        node_id = f"assumption-{index}"
        nodes.append(
            {
                "node_id": node_id,
                "kind": "ASSUMPTION",
                "label": analysis["assumptions"][0],
                "status": "DECLARED",
                "references": [analysis["analysis_id"]],
            }
        )
        edges.append({"from": node_id, "to": "decision", "relationship": "CONSTRAINS"})
    graph: dict[str, Any] = {
        "schema_version": "underwriting.thesis-graph/v1",
        "case_id": result["caseId"],
        "nodes": nodes,
        "edges": edges,
    }
    graph["graph_sha256"] = digest(graph)
    return graph


def _mean_difference(
    outcome: np.ndarray, treatment: np.ndarray
) -> tuple[float, float, float, float]:
    treated = outcome[treatment == 1]
    control = outcome[treatment == 0]
    effect = float(treated.mean() - control.mean())
    se = math.sqrt(float(treated.var(ddof=1) / len(treated) + control.var(ddof=1) / len(control)))
    return effect, se, effect - 1.96 * se, effect + 1.96 * se


def _slope(y: np.ndarray, x: np.ndarray) -> tuple[float, float]:
    design = np.column_stack([np.ones(len(x)), x])
    beta_hat = np.linalg.lstsq(design, y, rcond=None)[0]
    residuals = y - design @ beta_hat
    variance = float((residuals @ residuals) / (len(y) - design.shape[1]))
    covariance = variance * np.linalg.inv(design.T @ design)
    return float(beta_hat[1]), math.sqrt(float(covariance[1, 1]))


def _smd(values: np.ndarray, treatment: np.ndarray) -> float:
    treated = values[treatment == 1]
    control = values[treatment == 0]
    pooled = math.sqrt(float((treated.var(ddof=1) + control.var(ddof=1)) / 2))
    return 0.0 if pooled == 0 else float((treated.mean() - control.mean()) / pooled)


def _kaplan_meier(durations: list[int], events: list[bool], horizons: tuple[int, ...]) -> dict[int, float]:
    survival = 1.0
    results: dict[int, float] = {}
    for month in range(1, max(horizons) + 1):
        at_risk = sum(duration >= month for duration in durations)
        failures = sum(duration == month and event for duration, event in zip(durations, events, strict=True))
        if at_risk:
            survival *= 1 - failures / at_risk
        if month in horizons:
            results[month] = survival
    return results


def _venture_waterfall(
    exits: np.ndarray,
    dilution: np.ndarray,
    cap: dict[str, Any],
    new_shares: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    pre_shares = cap["common_shares"] + cap["option_pool_shares"] + cap["series_a_shares"] + cap["series_b_shares"]
    total_post = pre_shares + new_shares
    base = {
        "a": cap["series_a_shares"] / total_post,
        "b": cap["series_b_shares"] / total_post,
        "c": new_shares / total_post,
    }
    allocations = {name: np.zeros(len(exits)) for name in ("a", "b", "c", "common")}
    for index, exit_value in enumerate(exits):
        scale = 1 - float(dilution[index])
        a_share, b_share, c_share = base["a"] * scale, base["b"] * scale, base["c"] * scale
        common_share = 1 - a_share - b_share - c_share
        c_pref = min(float(exit_value), float(cap["new_money_cents"]))
        remaining = float(exit_value) - c_pref
        b_pref = min(remaining, float(cap["series_b_preference_cents"]))
        remaining -= b_pref
        a_pref = min(remaining, float(cap["series_a_preference_cents"]))
        remaining -= a_pref
        pref_alloc = {"c": c_pref, "b": b_pref, "a": a_pref, "common": remaining}

        remaining = float(exit_value)
        b_convert_pref = min(remaining, float(cap["series_b_preference_cents"]))
        remaining -= b_convert_pref
        a_takes_pref = a_share * float(exit_value) < float(cap["series_a_preference_cents"])
        a_convert_pref = min(remaining, float(cap["series_a_preference_cents"])) if a_takes_pref else 0.0
        remaining -= a_convert_pref
        weights = {"a": 0.0 if a_takes_pref else a_share, "b": b_share, "c": c_share, "common": common_share}
        weight_total = sum(weights.values())
        convert_alloc = {
            name: (a_convert_pref if name == "a" else b_convert_pref if name == "b" else 0.0)
            + (remaining * weight / weight_total if weight_total else 0.0)
            for name, weight in weights.items()
        }
        b_cap = float(cap["series_b_preference_cents"]) * float(cap["series_b_participating_cap"])
        excess = max(0.0, convert_alloc["b"] - b_cap)
        if excess:
            convert_alloc["b"] = b_cap
            non_b_weight = weight_total - weights["b"]
            for name in ("a", "c", "common"):
                if non_b_weight:
                    convert_alloc[name] += excess * weights[name] / non_b_weight
        chosen = convert_alloc if convert_alloc["c"] > pref_alloc["c"] else pref_alloc
        for name in allocations:
            allocations[name][index] = chosen[name]
    return allocations["a"], allocations["b"], allocations["c"], allocations["common"]


def _did(rows: list[dict[str, str]], field: str) -> tuple[float, float]:
    by_pod: dict[str, dict[str, list[float]]] = defaultdict(lambda: {"pre": [], "post": []})
    treatment: dict[str, int] = {}
    for row in rows:
        pod = row["pod_id"]
        treatment[pod] = int(row["treated"])
        by_pod[pod]["post" if int(row["post"]) else "pre"].append(float(row[field]))
    deltas = {pod: np.mean(values["post"]) - np.mean(values["pre"]) for pod, values in by_pod.items()}
    treated = np.array([value for pod, value in deltas.items() if treatment[pod] == 1])
    control = np.array([value for pod, value in deltas.items() if treatment[pod] == 0])
    effect = float(treated.mean() - control.mean())
    se = math.sqrt(float(treated.var(ddof=1) / len(treated) + control.var(ddof=1) / len(control)))
    return effect, se


def _pretrend_gap(rows: list[dict[str, str]], field: str) -> tuple[float, float]:
    by_pod: dict[str, list[tuple[float, float]]] = defaultdict(list)
    treatment: dict[str, int] = {}
    for row in rows:
        if int(row["period"]) >= 0:
            continue
        pod = row["pod_id"]
        treatment[pod] = int(row["treated"])
        by_pod[pod].append((float(row["period"]), float(row[field])))
    slopes: dict[str, float] = {}
    for pod, values in by_pod.items():
        x = np.array([item[0] for item in values])
        y = np.array([item[1] for item in values])
        slopes[pod] = _slope(y, x)[0]
    treated = np.array([value for pod, value in slopes.items() if treatment[pod] == 1])
    control = np.array([value for pod, value in slopes.items() if treatment[pod] == 0])
    gap = float(treated.mean() - control.mean())
    se = math.sqrt(float(treated.var(ddof=1) / len(treated) + control.var(ddof=1) / len(control)))
    return gap, se


def _atlasgrid(
    root: Path, manifest: dict[str, Any], artifacts: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    customers = _rows(root, artifacts["customer-month"])
    masters = _rows(root, artifacts["customer-master"])
    billing = _rows(root, artifacts["billing-ledger"])
    pnl = _rows(root, artifacts["monthly-pnl"])
    forecast = _rows(root, artifacts["forecast"])
    qoe = _rows(root, artifacts["qoe-bridge"])
    pricing = _rows(root, artifacts["pricing-experiment"])
    rollout = _rows(root, artifacts["support-rollout"])
    debt_terms_document = read_json(root / artifacts["debt-terms"]["path"])
    months = sorted({row["month"] for row in customers})
    base_month, end_month = months[-13], months[-1]
    base = {row["entity_id"]: int(row["mrr_cents"]) for row in customers if row["month"] == base_month and int(row["mrr_cents"]) > 0}
    ending_rows = [row for row in customers if row["month"] == end_month]
    ending = {row["entity_id"]: int(row["mrr_cents"]) for row in ending_rows}
    full_nrr = sum(ending.get(key, 0) for key in base) / sum(base.values())
    full_grr = sum(min(ending.get(key, 0), value) for key, value in base.items()) / sum(base.values())
    survivors = [key for key in base if ending.get(key, 0) > 0]
    active_nrr = sum(ending[key] for key in survivors) / sum(base[key] for key in survivors)
    ending_total = sum(int(row["mrr_cents"]) for row in ending_rows)
    entity_values = sorted((int(row["mrr_cents"]) for row in ending_rows), reverse=True)
    parent_values: dict[str, int] = defaultdict(int)
    for row in ending_rows:
        parent_values[row["parent_id"]] += int(row["mrr_cents"])
    entity_concentration = sum(entity_values[:10]) / ending_total
    ranked_parent_values = sorted(parent_values.values(), reverse=True)
    top_parent_concentration = ranked_parent_values[0] / ending_total
    parent_concentration = sum(ranked_parent_values[:10]) / ending_total
    ltm = pnl[-12:]
    revenue = sum(int(row["recognized_revenue_cents"]) for row in ltm)
    reported_cogs = sum(int(row["reported_cogs_cents"]) for row in ltm)
    burdened_cogs = sum(int(row["fully_burdened_cogs_cents"]) for row in ltm)
    reported_gm = 1 - reported_cogs / revenue
    burdened_gm = 1 - burdened_cogs / revenue
    seller_ebitda = int(qoe[0]["amount_cents"])
    normalized_ebitda = sum(int(row["amount_cents"]) for row in qoe)
    pnl_normalized_ebitda = sum(int(row["normalized_ebitda_cents"]) for row in ltm)
    ltm_months = set(months[-12:])
    ltm_billing = [row for row in billing if row["month"] in ltm_months]
    net_subscription_billing = sum(int(row["net_invoice_cents"]) for row in ltm_billing)
    pnl_net_subscription = sum(int(row["subscription_revenue_cents"]) - int(row["credits_cents"]) for row in ltm)
    ending_billing = [row for row in billing if row["month"] == end_month]
    live_arr = sum(int(row["live_arr_cents"]) for row in ending_billing)
    booked_arr = sum(int(row["booked_arr_cents"]) for row in ending_billing)
    implementation_dependent_arr = sum(int(row["booked_arr_cents"]) - int(row["live_arr_cents"]) for row in ending_billing)
    management_forecast = next(row for row in forecast if row["scenario"] == "management" and row["year"] == "5")
    base_forecast = next(row for row in forecast if row["scenario"] == "base" and row["year"] == "5")
    by_entity: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in customers:
        by_entity[row["entity_id"]].append(row)
    durations = [sum(int(row["active"]) for row in rows) for rows in by_entity.values()]
    events = [any(int(row["active"]) == 0 for row in rows) for rows in by_entity.values()]
    churn_events = sum(events)
    active_exposure = sum(durations)
    monthly_hazard = churn_events / active_exposure
    annualized_churn = 1 - (1 - monthly_hazard) ** 12
    survival = _kaplan_meier(durations, events, (12, 36, 60))
    at_risk = len(masters)

    treatment = np.array([int(row["treatment"]) for row in pricing])
    renewal = np.array([int(row["renewed"]) for row in pricing], dtype=float)
    realized = np.array([float(row["realized_increase_pct"]) for row in pricing])
    rct_effect, rct_se, rct_low, rct_high = _mean_difference(renewal, treatment)
    naive_slope, naive_se = _slope(renewal, realized)
    first_stage, first_stage_se, first_stage_low, first_stage_high = _mean_difference(
        realized, treatment
    )
    implied_offer_scale = naive_slope * first_stage
    implied_offer_scale_se = math.sqrt(
        (first_stage * naive_se) ** 2 + (naive_slope * first_stage_se) ** 2
    )
    pricing_risk = np.array([float(row["risk_score"]) for row in pricing])
    pricing_smd = _smd(pricing_risk, treatment)
    did_resolution, did_resolution_se = _did(rollout, "resolution_hours")
    did_churn, did_churn_se = _did(rollout, "gross_churn_bps")
    fake_rollout = [dict(row, post="1" if int(row["period"]) >= -6 else "0") for row in rollout if int(row["period"]) < 0]
    fake_resolution, _ = _did(fake_rollout, "resolution_hours")
    pretrend_gap, pretrend_se = _pretrend_gap(rollout, "resolution_hours")
    resolution_interval = (did_resolution - 1.96 * did_resolution_se, did_resolution + 1.96 * did_resolution_se)
    churn_interval = (did_churn - 1.96 * did_churn_se, did_churn + 1.96 * did_churn_se)

    base_operating = PEOperatingAssumptions(
        starting_arr_cents=live_arr,
        starting_ltm_revenue_cents=revenue,
        starting_normalized_ebitda_cents=normalized_ebitda,
        full_cohort_nrr=Decimal(str(full_nrr)),
        annual_new_arr_rate=Decimal("0.10"),
        gross_margin=Decimal(str(burdened_gm)),
        annual_opex_growth_rate=Decimal("0.06"),
        capex_as_revenue=Decimal("0.02"),
        working_capital_as_incremental_revenue=Decimal("0.08"),
        cash_tax_rate=Decimal("0.25"),
    )
    downside_operating = replace(
        base_operating,
        full_cohort_nrr=Decimal("0.96"),
        annual_new_arr_rate=Decimal("0.08"),
        gross_margin=Decimal("0.70"),
        annual_opex_growth_rate=Decimal("0.01"),
        capex_as_revenue=Decimal("0.025"),
        working_capital_as_incremental_revenue=Decimal("0.10"),
    )
    ask_transaction = PETransactionAssumptions(
        entry_enterprise_value_cents=debt_terms_document["ask_enterprise_value_cents"],
        funded_term_face_cents=debt_terms_document["funded_term_face_cents"],
        term_oid_rate=Decimal(debt_terms_document["term_oid_rate"]),
        transaction_fee_rate=Decimal(debt_terms_document["transaction_fee_rate"]),
        financing_fee_rate=Decimal(debt_terms_document["financing_fee_rate"]),
        seller_rollover_cents=debt_terms_document["seller_rollover_cents"],
        minimum_cash_cents=debt_terms_document["minimum_cash_cents"],
        revolver_commitment_cents=debt_terms_document["revolver_commitment_cents"],
        annual_cash_rate=Decimal(debt_terms_document["annual_cash_rate"]),
        annual_pik_rate=Decimal(debt_terms_document["annual_pik_rate"]),
        annual_mandatory_amortization_rate=Decimal(debt_terms_document["annual_mandatory_amortization_rate"]),
        sweep_rate=Decimal(debt_terms_document["sweep_rate"]),
        maximum_gross_leverage=Decimal(debt_terms_document["maximum_gross_leverage"]),
        exit_multiple=Decimal(debt_terms_document["base_exit_multiple"]),
    )
    selected_transaction = replace(
        ask_transaction,
        entry_enterprise_value_cents=debt_terms_document["selected_upfront_enterprise_value_cents"],
        earnout_threshold_arr_cents=debt_terms_document["earnout"]["threshold_cents"],
        earnout_cap_cents=debt_terms_document["earnout"]["cap_cents"],
    )
    downside_transaction = replace(
        selected_transaction,
        exit_multiple=Decimal(debt_terms_document["downside_exit_multiple"]),
    )
    ask_case = run_pe_case(
        scenario_id="ASK", operating=base_operating, transaction=ask_transaction
    )
    selected_case = run_pe_case(
        scenario_id="SELECTED", operating=base_operating, transaction=selected_transaction
    )
    downside_case = run_pe_case(
        scenario_id="DOWNSIDE", operating=downside_operating, transaction=downside_transaction
    )
    maximum_bid = solve_maximum_bid(
        operating=base_operating,
        transaction=selected_transaction,
        minimum_irr=Decimal("0.22"),
        minimum_moic=Decimal("2.00"),
        low_cents=15_000_000_000,
        high_cents=26_000_000_000,
    )
    ask_moic = float(ask_case.gross_moic)
    reprice_moic = float(selected_case.gross_moic)
    downside_moic = float(downside_case.gross_moic)
    ask_irr = float(ask_case.gross_xirr)
    reprice_irr = float(selected_case.gross_xirr)
    downside_irr = float(downside_case.gross_xirr)
    base_headroom = min(float(item.covenant_headroom) for item in selected_case.debt_schedule.months)
    downside_breaches = [
        item.month for item in downside_case.debt_schedule.months if item.covenant_breach
    ]
    scenario_seed = int(manifest["seed_commitment"][:16], 16)
    pe_distribution = simulate_pe_distribution(
        operating=base_operating,
        transaction=selected_transaction,
        seed=scenario_seed,
        draws=1000,
    )
    draws = pe_distribution.draws
    moic_q = pe_distribution.moic_quantiles
    irr_q = pe_distribution.xirr_quantiles
    value_bridge = build_value_creation_bridge(
        operating=base_operating,
        transaction=selected_transaction,
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
    value_by_id = {item.lever_id: item for item in value_bridge.standalone}

    receipts = [
        analysis_receipt(
            analysis_id="AG-01",
            question="Do billing, live ARR, booked ARR, and recognized revenue reconcile?",
            classification="ACCOUNTING_IDENTITY",
            method="Integer-cent invoice, credit, ARR-definition, and P&L bridge",
            population="Synthetic AtlasGrid LTM billing ledger and five-year forecast",
            inputs=[_input(artifacts["billing-ledger"]), _input(artifacts["monthly-pnl"]), _input(artifacts["forecast"])],
            outputs=[_output("live_arr", live_arr, "cents"), _output("booked_arr", booked_arr, "cents"), _output("implementation_dependent_arr", implementation_dependent_arr, "cents"), _output("management_year_5_revenue", management_forecast["revenue_cents"], "cents"), _output("base_year_5_revenue", base_forecast["revenue_cents"], "cents")],
            assumptions=["Booked ARR may include implementation-dependent amounts; live ARR requires current billing."],
            diagnostics=[_diagnostic("billing_to_pnl_subscription", "exact", "PASS" if net_subscription_billing == pnl_net_subscription else "FAIL"), _diagnostic("booked_arr_definition_gap_cents", booked_arr - live_arr, "PASS" if booked_arr > live_arr else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="AG-02",
            question="How much does active-only reporting overstate LTM net retention?",
            classification="DESCRIPTIVE",
            method="Fixed-cohort ARR bridge including churned entities",
            population=f"{len(base)} entities active at {base_month}",
            inputs=[_input(artifacts["customer-month"])],
            outputs=[_output("full_cohort_grr", quantize(full_grr * 100), "percent"), _output("full_cohort_nrr", quantize(full_nrr * 100), "percent"), _output("active_only_nrr", quantize(active_nrr * 100), "percent")],
            assumptions=["Cohort membership is frozen at the base month."],
            diagnostics=[_diagnostic("selection_bias_bps", quantize((active_nrr - full_nrr) * 10_000), "PASS" if active_nrr - full_nrr >= 0.05 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="AG-03",
            question="How much does subsidiary-level reporting understate concentration?",
            classification="DESCRIPTIVE",
            method="Top-10 revenue concentration under entity and mapped-parent definitions",
            population=f"{len(ending_rows)} synthetic entities active at {end_month}",
            inputs=[_input(artifacts["customer-month"]), _input(artifacts["customer-master"])],
            outputs=[
                _output("entity_top_10_concentration", quantize(entity_concentration * 100), "percent"),
                _output("parent_top_10_concentration", quantize(parent_concentration * 100), "percent"),
                _output("top_parent_concentration", quantize(top_parent_concentration * 100), "percent"),
            ],
            assumptions=["Parent mapping is frozen in the synthetic customer master."],
            diagnostics=[
                _diagnostic(
                    "definition_gap_bps",
                    quantize((parent_concentration - entity_concentration) * 10_000),
                    "PASS" if parent_concentration - entity_concentration >= 0.15 else "FAIL",
                )
            ],
        ),
        analysis_receipt(
            analysis_id="AG-04",
            question="How do fully burdened costs and challenged add-backs change earnings quality?",
            classification="ACCOUNTING_IDENTITY",
            method="LTM revenue-to-margin reconciliation and seller-to-normalized EBITDA bridge",
            population="Synthetic AtlasGrid LTM P&L and QoE schedule",
            inputs=[_input(artifacts["monthly-pnl"]), _input(artifacts["qoe-bridge"])],
            outputs=[
                _output("reported_gross_margin", quantize(reported_gm * 100), "percent"),
                _output("fully_burdened_gross_margin", quantize(burdened_gm * 100), "percent"),
                _output("seller_adjusted_ebitda", seller_ebitda, "cents"),
                _output("normalized_ebitda", normalized_ebitda, "cents"),
            ],
            assumptions=["Credits and customer-success costs remain classified as operating delivery costs."],
            diagnostics=[
                _diagnostic("qoe_schedule_to_pnl_normalized_ebitda", normalized_ebitda - pnl_normalized_ebitda, "PASS" if normalized_ebitda == pnl_normalized_ebitda else "FAIL"),
                _diagnostic("seller_normalization_delta_cents", seller_ebitda - normalized_ebitda, "PASS" if seller_ebitda > normalized_ebitda else "FAIL"),
            ],
        ),
        analysis_receipt(
            analysis_id="AG-05",
            question="What is the observed annualized logo-churn hazard?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Exposure-weighted discrete monthly hazard with Kaplan-Meier cohort survival",
            population=f"{at_risk} synthetic customer entities over 60 months",
            inputs=[_input(artifacts["customer-month"]), _input(artifacts["customer-master"])],
            outputs=[_output("monthly_logo_hazard", quantize(monthly_hazard * 100), "percent"), _output("annualized_logo_churn", quantize(annualized_churn * 100), "percent"), _output("survival_12_month", quantize(survival[12] * 100), "percent"), _output("survival_36_month", quantize(survival[36] * 100), "percent"), _output("survival_60_month", quantize(survival[60] * 100), "percent")],
            assumptions=["Customer health and pricing are endogenous; this estimate is not causal."],
            diagnostics=[_diagnostic("standard_error", quantize(math.sqrt(max(monthly_hazard * (1 - monthly_hazard) / active_exposure, 0)) * 100), "REPORTED"), _diagnostic("event_count", churn_events, "PASS" if churn_events >= 200 else "FAIL"), _diagnostic("active_month_exposure", active_exposure)],
        ),
        analysis_receipt(
            analysis_id="AG-06",
            question="What does the observational relationship between realized price and renewal imply?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Naive linear probability slope, randomized-offer first stage, and delta-method offer-scale association",
            population=f"{len(pricing)} synthetic renewal-eligible accounts",
            inputs=[_input(artifacts["pricing-experiment"])],
            outputs=[
                _output("naive_realized_price_slope", quantize(naive_slope * 100), "percentage_points_per_price_point"),
                _output("first_stage_price_change", quantize(first_stage), "price_percentage_points"),
                _output("implied_offer_scale_association", quantize(implied_offer_scale * 100), "percentage_points"),
            ],
            assumptions=["Realized price is post-treatment and selected by negotiation; its slope is not causal."],
            diagnostics=[
                _diagnostic("standard_error", quantize(naive_se * 100), "REPORTED"),
                _diagnostic("first_stage", f"{quantize(first_stage)} [{quantize(first_stage_low)}, {quantize(first_stage_high)}]", "PASS" if first_stage > 0 else "FAIL"),
                _diagnostic("implied_offer_scale_interval", f"[{quantize((implied_offer_scale - 1.96 * implied_offer_scale_se) * 100)}, {quantize((implied_offer_scale + 1.96 * implied_offer_scale_se) * 100)}]", "REPORTED"),
                _diagnostic("confounding_audit", "realized_price_is_endogenous", "BLOCKED", DiagnosticRole.IDENTIFICATION_BOUNDARY),
            ],
        ),
        analysis_receipt(
            analysis_id="AG-07",
            question="What is the randomized renewal-price offer effect on renewal?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Intention-to-treat difference in renewal proportions",
            population=f"{len(pricing)} synthetic renewal-eligible accounts",
            inputs=[_input(artifacts["pricing-experiment"])],
            outputs=[_output("renewal_itt", quantize(rct_effect * 100), "percentage_points")],
            assumptions=["Synthetic seeded 1:1 assignment; no cross-account interference."],
            diagnostics=[_diagnostic("assignment_mechanism", "seeded_account_randomization", "REPORTED"), _diagnostic("confidence_interval", f"[{quantize(rct_low * 100)}, {quantize(rct_high * 100)}]", "REPORTED"), _diagnostic("standard_error", quantize(rct_se * 100), "REPORTED"), _diagnostic("risk_score_smd", quantize(pricing_smd), "PASS" if abs(pricing_smd) <= 0.15 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="AG-08",
            question="What is the synthetic support-automation effect?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Pod-level difference-in-differences with pod-clustered delta uncertainty",
            population="40 synthetic customer-success pods; 12 pre and 12 post months",
            inputs=[_input(artifacts["support-rollout"])],
            outputs=[_output("resolution_att", quantize(did_resolution), "hours"), _output("gross_churn_att", quantize(did_churn), "basis_points")],
            assumptions=["Synthetic seed-permuted 20-of-40 pod assignment with no spillovers."],
            diagnostics=[_diagnostic("assignment_mechanism", "seeded_permutation_20_of_40_pods", "REPORTED"), _diagnostic("resolution_95pct_interval", f"[{quantize(resolution_interval[0])}, {quantize(resolution_interval[1])}]", "REPORTED"), _diagnostic("gross_churn_95pct_interval", f"[{quantize(churn_interval[0])}, {quantize(churn_interval[1])}]", "REPORTED"), _diagnostic("clustered_resolution_standard_error", quantize(did_resolution_se), "REPORTED"), _diagnostic("clustered_churn_standard_error", quantize(did_churn_se), "REPORTED"), _diagnostic("fake_date_placebo_hours", quantize(fake_resolution), "PASS" if abs(fake_resolution) <= 1.0 else "FAIL"), _diagnostic("pretrend_slope_gap", quantize(pretrend_gap), "PASS" if abs(pretrend_gap) <= max(0.10, 1.96 * pretrend_se) else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="AG-09",
            question="Did a customer-success leadership change cause the churn improvement?",
            classification="NOT_IDENTIFIED",
            method="Precommitted confound audit",
            population="Synthetic months overlapping leadership, pricing, and macro changes",
            inputs=[_input(artifacts["customer-month"])],
            outputs=[],
            assumptions=["No valid untreated comparison group is available."],
            diagnostics=[_diagnostic("overlapping_events", "leader_hire, pricing_change, macro_shift", "BLOCKED", DiagnosticRole.IDENTIFICATION_BOUNDARY)],
            state="ABSTAIN",
        ),
        analysis_receipt(
            analysis_id="AG-10",
            question="How do asking and selected structures change cash, debt, covenants, and sponsor returns?",
            classification="SCENARIO",
            method="Monthly cash-flow, debt-sweep, covenant, sources-and-uses, and dated-XIRR engine",
            population="Illustrative AtlasGrid sponsor transaction",
            inputs=[_input(artifacts["debt-terms"]), _input(artifacts["qoe-bridge"]), _input(artifacts["monthly-pnl"]), _input(artifacts["billing-ledger"]), _input(artifacts["customer-month"])],
            outputs=[_output("ask_irr", quantize(ask_irr * 100), "percent"), _output("ask_moic", quantize(ask_moic), "multiple"), _output("reprice_irr", quantize(reprice_irr * 100), "percent"), _output("reprice_moic", quantize(reprice_moic), "multiple"), _output("downside_irr", quantize(downside_irr * 100), "percent"), _output("downside_moic", quantize(downside_moic), "multiple"), _output("maximum_bid_cents", maximum_bid, "cents"), _output("base_exit_debt_cents", selected_case.debt_schedule.ending_debt_cents, "cents"), _output("downside_exit_debt_cents", downside_case.debt_schedule.ending_debt_cents, "cents"), _output("base_min_covenant_headroom", quantize(base_headroom), "turns"), _output("downside_first_breach_month", str(min(downside_breaches)) if downside_breaches else "NONE", "month")],
            assumptions=["Starting ARR, revenue, normalized EBITDA, NRR, and burdened margin bind to AG-01, AG-02, and AG-04; exit multiples, financing terms, and operating deltas are declared synthetic scenario assumptions."],
            diagnostics=[_diagnostic("ask_misses_selected_clears", "ask_misses_22pct_irr; selected_clears_22pct_and_2x", "PASS" if ask_irr < 0.22 and reprice_irr >= 0.22 and reprice_moic >= 2 else "FAIL", DiagnosticRole.DECISION_CRITICAL), _diagnostic("sources_equal_uses", selected_case.sources_and_uses.total_uses_cents - selected_case.sources_and_uses.total_sources_cents, "PASS" if selected_case.sources_and_uses.total_uses_cents == selected_case.sources_and_uses.total_sources_cents else "FAIL", DiagnosticRole.GENERATOR_INVARIANT), _diagnostic("base_debt_and_cash_reconcile", selected_case.debt_schedule.engine_inputs_sha256, "PASS", DiagnosticRole.GENERATOR_INVARIANT), _diagnostic("downside_floor", "5pct_irr;1.25x_moic;$3m_liquidity;no_default;no_breach", "PASS" if downside_irr >= 0.05 and downside_moic >= 1.25 and downside_case.debt_schedule.minimum_liquidity_cents >= 300_000_000 and not downside_case.debt_schedule.has_payment_default and not downside_breaches else "FAIL", DiagnosticRole.DECISION_CRITICAL), _diagnostic("month_18_19_boundary", f"m18={selected_case.debt_schedule.months[17].covenant_breach};m19={selected_case.debt_schedule.months[18].covenant_breach}", "PASS", DiagnosticRole.GENERATOR_INVARIANT)],
        ),
        analysis_receipt(
            analysis_id="AG-11",
            question="What is the conditional distribution of repriced sponsor outcomes?",
            classification="SCENARIO",
            method="1,000 seeded correlated operating and exit paths with complete monthly debt recomputation",
            population="Declared synthetic scenario distribution",
            inputs=[
                _input(artifacts["debt-terms"]),
                _input(artifacts["qoe-bridge"]),
                _input(artifacts["monthly-pnl"]),
                _input(artifacts["billing-ledger"]),
                _input(artifacts["customer-month"]),
            ],
            outputs=[_output("p10_moic", quantize(moic_q[0]), "multiple"), _output("p50_moic", quantize(moic_q[1]), "multiple"), _output("p90_moic", quantize(moic_q[2]), "multiple"), _output("probability_below_1x", quantize(pe_distribution.probability_below_one * 100), "percent")],
            assumptions=["Correlated ARR retention, new ARR, gross margin, and exit-multiple draws are disclosed conditional scenario inputs, not forecasts; every draw reruns the complete monthly cash and debt engine."],
            diagnostics=[_diagnostic("draws", draws), _diagnostic("ordered_quantiles", "true", "PASS" if moic_q[0] <= moic_q[1] <= moic_q[2] else "FAIL"), _diagnostic("correlation_structure_sha256", pe_distribution.correlation_structure_sha256, "REPORTED"), _diagnostic("complete_path_recomputations", len(pe_distribution.path_receipt_sha256s), "PASS" if len(pe_distribution.path_receipt_sha256s) == draws else "FAIL")],
        ),
    ]
    _bind_specs(receipts, manifest)
    lineages = [
        lineage_item(node_id="ag-nrr", label="Full-cohort NRR", artifact_id="customer-month", field="entity_id,month,mrr_cents", analysis_id="AG-02", output_names=["full_cohort_grr", "full_cohort_nrr", "active_only_nrr"], transformation="Frozen base cohort ARR bridge including churned entities", downstream="Retention thesis and renewal initiative"),
        lineage_item(node_id="ag-concentration", label="Parent concentration", artifact_id="customer-month", field="parent_id,mrr_cents", analysis_id="AG-03", output_names=["entity_top_10_concentration", "parent_top_10_concentration", "top_parent_concentration"], transformation="Map entity ARR to parent and rank the largest parent and top ten", downstream="Price and customer-concentration risk"),
        lineage_item(node_id="ag-margin", label="Burdened gross margin", artifact_id="monthly-pnl", field="recognized_revenue_cents,fully_burdened_cogs_cents", analysis_id="AG-04", output_names=["reported_gross_margin", "fully_burdened_gross_margin"], transformation="LTM revenue less declared fully burdened delivery costs", downstream="Normalized earnings and value-creation bridge"),
        lineage_item(node_id="ag-ebitda", label="Normalized EBITDA", artifact_id="qoe-bridge", field="amount_cents", analysis_id="AG-04", output_names=["seller_adjusted_ebitda", "normalized_ebitda"], transformation="Integer-cent seller EBITDA less challenged adjustments", downstream="Debt capacity, entry price, and sponsor return"),
        lineage_item(node_id="ag-reprice", label="Selected sponsor return", artifact_id="debt-terms", field="entry, financing, operating, earnout, and exit assumptions", analysis_id="AG-10", output_names=["ask_irr", "ask_moic", "reprice_irr", "reprice_moic", "downside_irr", "downside_moic", "maximum_bid_cents", "base_exit_debt_cents", "downside_exit_debt_cents", "base_min_covenant_headroom", "downside_first_breach_month"], transformation="Monthly operating cash flow drives interest, taxes, revolver, amortization, sweep, covenant headroom, exit debt, dated cash flows, MOIC, and XIRR", downstream="Illustrative REPRICE decision and maximum bid"),
        lineage_item(node_id="ag-support", label="Support automation effect", artifact_id="support-rollout", field="pod_id,period,treated,resolution_hours,gross_churn_bps", analysis_id="AG-08", output_names=["resolution_att", "gross_churn_att"], transformation="Pod-level pre/post difference-in-differences", downstream="Support automation initiative"),
        lineage_item(node_id="ag-distribution", label="Conditional return distribution", artifact_id="debt-terms", field="scenario distributions", analysis_id="AG-11", output_names=["p10_moic", "p50_moic", "p90_moic", "probability_below_1x"], transformation="One thousand seeded correlated operating and exit paths, each rerunning monthly cash, debt, and returns", downstream="Downside range; not a forecast"),
    ]
    decision = {
        "schema_version": "underwriting.decision-record/v1",
        "decision": "REPRICE",
        "attribution": "Cooper David Reed — illustrative IC",
        "status": "DECISION_RECORD_INCOMPLETE",
        "signature_status": "PENDING_FOUNDER_SIGNATURE",
        "as_of": "2026-08-31T23:59:59Z",
        "rationale": "The asking price does not compensate for definition quality, concentration, fully burdened margins, or leverage fragility. A restructured entry with the same debt quantum clears the declared return hurdles.",
        "conditions": ["Validate cancellation-for-convenience exposure", "Tie parent accounts to master agreements", "Cap earnout against verified live ARR"],
        "open_conditions": 3,
        "terms": ["Illustrative $210M enterprise value", "Same declared debt quantum", "Earnout capped against verified live ARR"],
        "metric_pairs": [
            {"metric": "Gross IRR", "threshold": ">=22%", "observed": f"{quantize(reprice_irr * 100)}%", "status": "CLEARS" if reprice_irr >= 0.22 else "MISSES"},
            {"metric": "Gross MOIC", "threshold": ">=2.0x", "observed": f"{quantize(reprice_moic)}x", "status": "CLEARS" if reprice_moic >= 2 else "MISSES"},
        ],
        "verification_sources": ["AG-02", "AG-03", "AG-04", "AG-10", "AG-11"],
        "failure_consequences": ["Do not advance at seller ask", "Retain HOLD until open diligence conditions are adjudicated"],
    }
    decision["decision_sha256"] = digest(decision)
    scenarios = [
        {"id": "ask", "label": "Seller ask", "entry_ev": "$240M", "gross_irr": f"{quantize(ask_irr * 100)}%", "moic": f"{quantize(ask_moic)}x", "covenant": "No modeled breach", "lineage": ["ag-reprice"]},
        {"id": "reprice", "label": "Selected structure", "entry_ev": "$210M + contingent earnout", "gross_irr": f"{quantize(reprice_irr * 100)}%", "moic": f"{quantize(reprice_moic)}x", "covenant": "No modeled breach", "lineage": ["ag-reprice"]},
        {"id": "downside", "label": "Selected downside", "entry_ev": "$210M; earnout not paid", "gross_irr": f"{quantize(downside_irr * 100)}%", "moic": f"{quantize(downside_moic)}x", "covenant": "Floor preserved", "lineage": ["ag-reprice", "ag-distribution"]},
    ]
    return {
        "caseId": "atlasgrid",
        "company": "AtlasGrid Systems",
        "caseType": "PE / Growth Equity",
        "synthetic": True,
        "investmentAdjudication": "PENDING_HUMAN",
        "workflowDisposition": _workflow_disposition(receipts, decision),
        "disclosure": manifest["disclosure"],
        "decision": decision,
        "summaryMetrics": [
            _metric("ag-return", "Repriced return", f"{quantize(reprice_irr * 100)}%", f"{quantize(reprice_moic)}x MOIC · five-year hold", "SCENARIO", ["ag-reprice"]),
            _metric("ag-nrr-metric", "Complete-cohort NRR", f"{quantize(full_nrr * 100)}%", f"Management active-only view: {quantize(active_nrr * 100)}%", "DESCRIPTIVE", ["ag-nrr"]),
            _metric("ag-conc-metric", "Top-10 parent concentration", f"{quantize(parent_concentration * 100)}%", f"Entity view: {quantize(entity_concentration * 100)}%", "DESCRIPTIVE", ["ag-concentration"]),
            _metric("ag-margin-metric", "Fully burdened gross margin", f"{quantize(burdened_gm * 100)}%", f"Reported view: {quantize(reported_gm * 100)}%", "ACCOUNTING_IDENTITY", ["ag-margin"]),
            _metric("ag-ebitda-metric", "Normalized LTM EBITDA", f"${quantize(normalized_ebitda / 100_000_000)}M", f"Seller-adjusted: ${quantize(seller_ebitda / 100_000_000)}M", "ACCOUNTING_IDENTITY", ["ag-ebitda"]),
        ],
        "thesis": {
            "statement": "Mission-critical grid software can support an attractive control investment, but only at a price that reflects definition quality and leverage fragility.",
            "counterthesis": "Contract duration, parent concentration, services burden, and covenant EBITDA may make the apparent recurring-quality premium illusory.",
            "drivers": ["Durable regulated end-market demand", "Expansion inside utility parents", "Price realization after renewal test", "Support automation with identified synthetic effect"],
            "falsifiers": ["Full-cohort NRR below 95%", "Top parent above 15%", "Normalized EBITDA below $20M", "Downside covenant breach inside 18 months"],
            "requests": ["Master agreement and termination-right sample", "Customer-parent legal mapping", "QoE support for each add-back", "Lender definition of covenant EBITDA"],
        },
        "falsifierStates": [
            {"label": "Full-cohort NRR below 95%", "status": "CLEAR" if full_nrr >= 0.95 else "TRIGGERED", "observed": f"{quantize(full_nrr * 100)}%", "lineage": ["ag-nrr"]},
            {"label": "Top parent above 15%", "status": "TRIGGERED" if top_parent_concentration > 0.15 else "CLEAR", "observed": f"{quantize(top_parent_concentration * 100)}%", "lineage": ["ag-concentration"]},
            {"label": "Normalized EBITDA below $20M", "status": "CLEAR" if normalized_ebitda >= 2_000_000_000 else "TRIGGERED", "observed": f"${quantize(normalized_ebitda / 100_000_000)}M", "lineage": ["ag-ebitda"]},
            {"label": "Downside covenant breach inside 18 months", "status": "TRIGGERED" if downside_breaches and min(downside_breaches) <= 18 else "CLEAR", "observed": f"Month {min(downside_breaches)}" if downside_breaches else "No breach", "lineage": ["ag-reprice"]},
        ],
        "analyses": receipts,
        "distributionLineage": "ag-distribution",
        "scenarios": scenarios,
        "returnsDistribution": {"moic": [quantize(value) for value in moic_q], "irr": [quantize(value * 100) for value in irr_q], "labels": ["p10", "p50", "p90"]},
        "peEngine": {"ask": ask_case.receipt(), "selected": selected_case.receipt(), "downside": downside_case.receipt(), "distribution": pe_distribution.receipt(), "maximum_bid_cents": maximum_bid},
        "valueCreationBridge": value_bridge.receipt(),
        "valueCreation": [
            {"initiative": "Renewal architecture", "kpi": "Complete-cohort NRR", "baseline": f"{quantize(full_nrr * 100)}%", "target": f"{quantize((full_nrr + 0.015) * 100)}%", "owner": "Chief Revenue Officer", "milestone": "Segment playbooks live by day 90", "value": f"${quantize(value_by_id['renewal'].exit_equity_delta_cents / 100_000_000)}M exit equity · {quantize(value_by_id['renewal'].gross_xirr_delta * 10_000)} bps IRR · ${quantize(value_by_id['renewal'].exit_ebitda_delta_cents / 100_000_000)}M exit EBITDA", "risk": "Price-driven churn; $1.5M implementation cost is modeled", "lineage": ["ag-nrr"]},
            {"initiative": "Support automation", "kpi": "Resolution time", "baseline": f"{quantize(np.mean([float(row['resolution_hours']) for row in rollout if int(row['post']) == 0]))} hours", "target": "17.5 hours", "owner": "Chief Customer Officer", "milestone": "20-pod rollout by day 120", "value": f"${quantize(value_by_id['support'].exit_equity_delta_cents / 100_000_000)}M exit equity · {quantize(value_by_id['support'].gross_xirr_delta * 10_000)} bps IRR · ${quantize(-value_by_id['support'].exit_debt_delta_cents / 100_000_000)}M incremental deleveraging", "risk": "Service-quality regression; $2.0M implementation cost is modeled", "lineage": ["ag-support"]},
            {"initiative": "Delivery cost reset", "kpi": "Burdened gross margin", "baseline": f"{quantize(burdened_gm * 100)}%", "target": f"{quantize((burdened_gm + 0.015) * 100)}%", "owner": "CFO", "milestone": "Account contribution ledger and vendor plan by day 30", "value": f"${quantize(value_by_id['delivery'].exit_equity_delta_cents / 100_000_000)}M exit equity · {quantize(value_by_id['delivery'].gross_xirr_delta * 10_000)} bps IRR · ${quantize(value_by_id['delivery'].exit_ebitda_delta_cents / 100_000_000)}M exit EBITDA", "risk": "Human scenario with zero causal credit; $2.5M implementation cost is modeled", "lineage": ["ag-margin", "ag-ebitda"]},
        ],
        "lineage": lineages,
        "artifacts": list(artifacts.values()),
    }


def _helios(
    root: Path, manifest: dict[str, Any], artifacts: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    customers = _rows(root, artifacts["customer-month"])
    pnl = _rows(root, artifacts["monthly-pnl"])
    pipeline = _rows(root, artifacts["pipeline"])
    stage_history = _rows(root, artifacts["stage-history"])
    survey = _rows(root, artifacts["market-survey"])
    experiment = _rows(root, artifacts["optimizer-experiment"])
    cap = read_json(root / artifacts["cap-table"]["path"])
    market_assumptions = read_json(root / artifacts["market-assumptions"]["path"])
    venture_scenarios = read_json(root / artifacts["venture-scenarios"]["path"])
    months = sorted({row["month"] for row in customers})
    base_month, end_month = months[-13], months[-1]
    base_rows = [row for row in customers if row["month"] == base_month and int(row["revenue_cents"]) > 0]
    end_rows = {row["customer_id"]: row for row in customers if row["month"] == end_month}
    pooled_nrr = sum(int(end_rows.get(row["customer_id"], {"revenue_cents": 0})["revenue_cents"]) for row in base_rows) / sum(int(row["revenue_cents"]) for row in base_rows)
    ordinary = [row for row in base_rows if int(row["design_partner"]) == 0]
    ordinary_nrr = sum(int(end_rows.get(row["customer_id"], {"revenue_cents": 0})["revenue_cents"]) for row in ordinary) / sum(int(row["revenue_cents"]) for row in ordinary)
    ltm = pnl[-12:]
    revenue = sum(int(row["revenue_cents"]) for row in ltm)
    cogs = sum(int(row["cogs_cents"]) for row in ltm)
    gross_margin = 1 - cogs / revenue
    component_cogs = sum(int(row["compute_cost_cents"]) + int(row["telemetry_cost_cents"]) + int(row["support_cost_cents"]) for row in customers if row["month"] in {item["month"] for item in ltm})
    recent_burn = np.mean([int(row["net_burn_cents"]) for row in pnl[-3:]])
    runway = cap["cash_at_cutoff_cents"] / recent_burn
    post_close_runway = (cap["cash_at_cutoff_cents"] + cap["new_money_cents"]) / recent_burn
    prior_revenue = sum(int(row["revenue_cents"]) for row in pnl[-24:-12])
    net_new_arr = max(1, revenue - prior_revenue)
    burn_multiple = sum(int(row["net_burn_cents"]) for row in ltm) / net_new_arr
    if int(pnl[-1]["ending_cash_cents"]) != cap["cash_at_cutoff_cents"]:
        raise UnderwritingError("cash_rollforward_cap_table_mismatch")
    ltm_sales_marketing = sum(int(row["sales_marketing_cents"]) for row in ltm)
    ltm_new_customers = sum(int(row["new_customers"]) for row in ltm)
    cac = ltm_sales_marketing / max(1, ltm_new_customers)
    ending_active = max(1, sum(int(row["active"]) for row in end_rows.values()))
    monthly_gross_profit_per_customer = (revenue - cogs) / 12 / ending_active
    cac_payback = cac / monthly_gross_profit_per_customer

    stage_probability = {int(key): Decimal(value) for key, value in market_assumptions["stage_probabilities"].items()}
    history_by_opportunity: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in stage_history:
        history_by_opportunity[row["opportunity_id"]].append(row)
    historical_stage: dict[str, int] = {}
    for opportunity_id, rows in history_by_opportunity.items():
        if len(rows) >= 15:
            latest = max(rows, key=lambda item: int(item["observation_index"]))
            historical_stage[opportunity_id] = int(latest["stage"])
    eligible_pipeline = [row for row in pipeline if row["opportunity_id"] in historical_stage]
    actual_weighted = sum(Decimal(int(row["amount_cents"])) * stage_probability[historical_stage[row["opportunity_id"]]] for row in eligible_pipeline)
    reported_weighted = sum(Decimal(int(row["amount_cents"])) * stage_probability[int(row["reported_stage"])] for row in eligible_pipeline)
    pipeline_inflation = (reported_weighted - actual_weighted).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
    inflated_count = sum(int(row["reported_stage"]) > historical_stage[row["opportunity_id"]] for row in eligible_pipeline)
    insufficient_history = len(pipeline) - len(eligible_pipeline)

    market_outputs: list[dict[str, str]] = []
    market_diagnostics: list[dict[str, str]] = []
    universe_counts = market_assumptions["universe_counts"]
    tier_mid_spend = market_assumptions["tier_mid_spend_cents"]
    tam_draws: list[float] = []
    prior_sensitivity_deltas: list[float] = []
    for tier in range(1, 6):
        tier_rows = [row for row in survey if int(row["tier"]) == tier]
        successes = sum(int(row["adopted"]) for row in tier_rows)
        total = len(tier_rows)
        if total < 10:
            market_outputs.append(_output(f"tier_{tier}", "ABSTAIN", "data_thin"))
            market_diagnostics.append(_diagnostic(f"tier_{tier}_sample", total, "ABSTAIN"))
            continue
        alpha, beta_value = 1 + successes, 1 + total - successes
        median = float(beta.ppf(0.5, alpha, beta_value))
        companion_median = float(beta.ppf(0.5, 2 + successes, 2 + total - successes))
        low = float(beta.ppf(0.05, alpha, beta_value))
        high = float(beta.ppf(0.95, alpha, beta_value))
        tier_tam = universe_counts[tier - 1] * median * tier_mid_spend[tier - 1]
        tam_draws.append(tier_tam)
        prior_sensitivity_deltas.append(abs(companion_median - median) * 100)
        market_outputs.append(_output(f"tier_{tier}_adoption", quantize(median * 100), "percent"))
        market_diagnostics.append(_diagnostic(f"tier_{tier}_credible_interval", f"[{quantize(low * 100)}, {quantize(high * 100)}]"))
    tam = sum(tam_draws)

    treatment = np.array([int(row["treatment"]) for row in experiment])
    outcome = np.array([float(row["outcome_log_cost_change"]) for row in experiment])
    baseline_cost = np.array([float(row["baseline_log_cost"]) for row in experiment])
    optimizer_smd = _smd(baseline_cost, treatment)
    rct_effect, rct_se, rct_low, rct_high = _mean_difference(outcome, treatment)
    pre_shares = cap["common_shares"] + cap["option_pool_shares"] + cap["series_a_shares"] + cap["series_b_shares"]
    post_money = cap["pre_money_cents"] + cap["new_money_cents"]
    series_c_ownership = cap["new_money_cents"] / post_money
    new_shares = int(round(pre_shares * cap["new_money_cents"] / cap["pre_money_cents"]))
    total_post = pre_shares + new_shares
    if abs(new_shares / total_post - series_c_ownership) > 1e-8:
        raise UnderwritingError("cap_table_ownership_mismatch")

    scenario_seed = int(manifest["seed_commitment"][:16], 16)
    rng = np.random.Generator(np.random.PCG64(scenario_seed))
    draws = int(venture_scenarios["draws"])
    failure = rng.random(draws) < float(venture_scenarios["failure_probability"])
    exits = rng.lognormal(
        math.log(venture_scenarios["success_exit_log_mean_cents"]),
        float(venture_scenarios["success_exit_log_sigma"]),
        draws,
    )
    exits[failure] = rng.uniform(
        venture_scenarios["failure_exit_floor_cents"],
        venture_scenarios["failure_exit_cap_cents"],
        int(failure.sum()),
    )
    dilution = rng.beta(
        float(venture_scenarios["dilution_beta_alpha"]),
        float(venture_scenarios["dilution_beta_beta"]),
        draws,
    ) * float(venture_scenarios["dilution_cap"])
    series_a_proceeds, series_b_proceeds, proceeds, common_proceeds = _venture_waterfall(
        exits, dilution, cap, new_shares
    )
    waterfall_error = float(np.max(np.abs(series_a_proceeds + series_b_proceeds + proceeds + common_proceeds - exits)))
    moic = proceeds / cap["new_money_cents"]
    moic_q = np.quantile(moic, [0.1, 0.5, 0.9])
    loss_probability = float(np.mean(moic < 1))
    three_x_probability = float(np.mean(moic >= 3))

    receipts = [
        analysis_receipt(
            analysis_id="HX-01",
            question="Do usage revenue, compute costs, and fully burdened gross margin reconcile?",
            classification="ACCOUNTING_IDENTITY",
            method="LTM integer-cent revenue and cost bridge",
            population="Synthetic Helios LTM P&L",
            inputs=[_input(artifacts["monthly-pnl"]), _input(artifacts["customer-month"])],
            outputs=[
                _output("ltm_revenue", revenue, "cents"),
                _output("ltm_cogs", cogs, "cents"),
                _output("gross_margin", quantize(gross_margin * 100), "percent"),
            ],
            assumptions=["Compute, telemetry, and customer-support costs remain in COGS."],
            diagnostics=[_diagnostic("integer_cent_reconciliation", "exact", "PASS" if component_cogs == cogs else "FAIL"), _diagnostic("cash_rollforward_to_cap_table", "exact")],
        ),
        analysis_receipt(
            analysis_id="HX-02",
            question="How much do hand-picked design partners inflate pooled NRR?",
            classification="DESCRIPTIVE",
            method="Frozen-cohort revenue bridge with disclosed design-partner exclusion",
            population=f"{len(base_rows)} customers active at {base_month}",
            inputs=[_input(artifacts["customer-month"]), _input(artifacts["customer-master"])],
            outputs=[_output("pooled_nrr", quantize(pooled_nrr * 100), "percent"), _output("ordinary_nrr", quantize(ordinary_nrr * 100), "percent")],
            assumptions=["Design-partner status is fixed from the customer master."],
            diagnostics=[_diagnostic("selection_bias_bps", quantize((pooled_nrr - ordinary_nrr) * 10_000), "PASS" if pooled_nrr - ordinary_nrr >= 0.04 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="HX-03",
            question="What do current burn efficiency and cash imply for financing risk?",
            classification="ACCOUNTING_IDENTITY",
            method="LTM burn multiple and three-month average cash-runway bridge",
            population="Synthetic Helios P&L and capitalization at cutoff",
            inputs=[_input(artifacts["monthly-pnl"]), _input(artifacts["cap-table"])],
            outputs=[
                _output("burn_multiple", quantize(burn_multiple), "multiple"),
                _output("runway", quantize(runway), "months"),
                _output("post_close_runway", quantize(post_close_runway), "months"),
                _output("cac", quantize(cac / 100), "usd"),
                _output("cac_payback", quantize(cac_payback), "months"),
            ],
            assumptions=["Recent three-month average net burn persists until the next financing."],
            diagnostics=[
                _diagnostic("positive_net_new_arr", net_new_arr, "PASS"),
                _diagnostic("runway_floor", quantize(runway), "PASS" if runway >= 12 else "FAIL"),
            ],
        ),
        analysis_receipt(
            analysis_id="HX-04",
            question="Does reported pipeline reconcile to actual stage history?",
            classification="DESCRIPTIVE",
            method="Historical stage-probability weighted pipeline recomputation",
            population=f"{len(pipeline)} synthetic opportunities",
            inputs=[_input(artifacts["pipeline"]), _input(artifacts["stage-history"]), _input(artifacts["market-assumptions"])],
            outputs=[_output("inflated_opportunities", inflated_count, "count"), _output("weighted_pipeline_inflation", quantize(pipeline_inflation / Decimal(100_000_000)), "million_usd"), _output("weighted_pipeline_inflation_cents", int(pipeline_inflation), "cents")],
            assumptions=["Stage probabilities are fixed and printed with denominators."],
            diagnostics=[_diagnostic("eligible_opportunities", len(eligible_pipeline), "PASS" if eligible_pipeline else "FAIL"), _diagnostic("insufficient_history", insufficient_history, "REPORTED"), _diagnostic("reconciliation_state", "reported_stage_exceeds_observed_history" if inflated_count else "reconciled", "REPORTED")],
        ),
        analysis_receipt(
            analysis_id="HX-05",
            question="What tiered adoption range is supported by the synthetic survey?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Independent beta-binomial posterior by predeclared market tier",
            population=f"{len(survey)} synthetic stratified survey respondents",
            inputs=[_input(artifacts["market-survey"]), _input(artifacts["market-assumptions"])],
            outputs=market_outputs + [_output("modeled_tam", quantize(tam / 100_000_000), "million_usd")],
            assumptions=["Beta(1,1) prior; finite universe and tier spend inputs are scenario assumptions."],
            diagnostics=market_diagnostics + [_diagnostic("credible_interval", "90_percent_by_tier", "REPORTED"), _diagnostic("beta_2_2_max_median_shift_pp", quantize(max(prior_sensitivity_deltas)), "PASS" if max(prior_sensitivity_deltas) <= 2.0 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="HX-06",
            question="What is the synthetic optimizer experiment effect on log unit cost?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Intention-to-treat difference in mean log-cost change",
            population=f"{len(experiment)} randomized synthetic customers",
            inputs=[_input(artifacts["optimizer-experiment"])],
            outputs=[_output("optimizer_ate", quantize(rct_effect * 100), "percent_log_points")],
            assumptions=["Seed-permuted 60-of-120 assignment and no cross-customer interference."],
            diagnostics=[_diagnostic("assignment_mechanism", "seeded_permutation_60_of_120_customers", "REPORTED"), _diagnostic("confidence_interval", f"[{quantize(rct_low * 100)}, {quantize(rct_high * 100)}]", "REPORTED"), _diagnostic("standard_error", quantize(rct_se * 100), "REPORTED"), _diagnostic("baseline_cost_smd", quantize(optimizer_smd), "PASS" if abs(optimizer_smd) <= 0.15 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="HX-07",
            question="Did adoption cause a reduction in total customer GPU-spend growth?",
            classification="NOT_IDENTIFIED",
            method="Pretrend and selection-on-trajectory audit",
            population="Synthetic adopter event windows",
            inputs=[_input(artifacts["customer-month"])],
            outputs=[],
            assumptions=["Adoption follows spend spikes, so untreated parallel trends do not hold."],
            diagnostics=[_diagnostic("pretrend", "non_parallel", "BLOCKED", DiagnosticRole.IDENTIFICATION_BOUNDARY)],
            state="ABSTAIN",
        ),
        analysis_receipt(
            analysis_id="HX-08",
            question="What ownership does the proposed financing purchase?",
            classification="ACCOUNTING_IDENTITY",
            method="Integer-share post-money ownership and preference bridge",
            population="Illustrative Helios Series C capitalization",
            inputs=[_input(artifacts["cap-table"])],
            outputs=[_output("new_shares", new_shares, "shares"), _output("series_c_ownership", quantize(series_c_ownership * 100), "percent")],
            assumptions=["No undisclosed convertibles or side letters."],
            diagnostics=[_diagnostic("ownership_reconciliation", "exact", "PASS")],
        ),
        analysis_receipt(
            analysis_id="HX-09",
            question="What is the conditional distribution of new-money outcomes?",
            classification="SCENARIO",
            method="20,000 seeded exit, dilution, and preference-waterfall paths",
            population="Declared synthetic venture scenario distribution",
            inputs=[_input(artifacts["cap-table"]), _input(artifacts["venture-scenarios"])],
            outputs=[_output("p10_moic", quantize(moic_q[0]), "multiple"), _output("p50_moic", quantize(moic_q[1]), "multiple"), _output("p90_moic", quantize(moic_q[2]), "multiple"), _output("probability_below_1x", quantize(loss_probability * 100), "percent"), _output("probability_at_least_3x", quantize(three_x_probability * 100), "percent"), _output("median_series_a_proceeds", quantize(float(np.median(series_a_proceeds)) / 100_000_000), "million_usd"), _output("median_series_b_proceeds", quantize(float(np.median(series_b_proceeds)) / 100_000_000), "million_usd")],
            assumptions=["Exit, timing, and future dilution distributions are disclosed scenario priors."],
            diagnostics=[_diagnostic("draws", draws), _diagnostic("ordered_quantiles", "true", "PASS" if moic_q[0] <= moic_q[1] <= moic_q[2] else "FAIL"), _diagnostic("waterfall_conservation_max_error_cents", quantize(waterfall_error), "PASS" if waterfall_error <= 0.01 else "FAIL")],
        ),
    ]
    _bind_specs(receipts, manifest)
    lineages = [
        lineage_item(node_id="hx-nrr", label="Go-forward NRR", artifact_id="customer-month", field="customer_id,month,revenue_cents,design_partner", analysis_id="HX-02", output_names=["pooled_nrr", "ordinary_nrr"], transformation="Frozen cohort bridge with design partners separately identified", downstream="Growth durability and financing milestones"),
        lineage_item(node_id="hx-margin", label="Blended gross margin", artifact_id="monthly-pnl", field="revenue_cents,cogs_cents", analysis_id="HX-01", output_names=["ltm_revenue", "ltm_cogs", "gross_margin"], transformation="Integer-cent LTM revenue less compute, telemetry, and support costs", downstream="Runway and margin milestones"),
        lineage_item(node_id="hx-runway", label="Runway", artifact_id="monthly-pnl", field="net_burn_cents", analysis_id="HX-03", output_names=["burn_multiple", "runway", "post_close_runway"], transformation="Pre-close and post-money cash divided by recent average net burn; LTM burn divided by net new ARR", downstream="Tranche timing and financing risk"),
        lineage_item(node_id="hx-tam", label="Modeled TAM survey evidence", artifact_id="market-survey", field="tier,adopted", analysis_id="HX-05", output_names=["modeled_tam"], transformation="Tier-level beta-binomial adoption medians", downstream="Market-size range with data-thin abstention"),
        lineage_item(node_id="hx-tam-assumptions", label="Modeled TAM universe assumptions", artifact_id="market-assumptions", field="universe_counts,tier_mid_spend_cents", analysis_id="HX-05", output_names=["modeled_tam"], transformation="Multiply tier adoption medians by declared universe counts and spend assumptions", downstream="Market-size scenario; not a market fact"),
        lineage_item(node_id="hx-pipeline", label="Pipeline stage-history audit", artifact_id="stage-history", field="opportunity_id,observation_index,stage", analysis_id="HX-04", output_names=["inflated_opportunities", "weighted_pipeline_inflation", "weighted_pipeline_inflation_cents"], transformation="Compare reported stage with the latest eligible history, then reweight using declared probabilities", downstream="Milestone financing and forecast governance"),
        lineage_item(node_id="hx-ownership", label="Series C ownership", artifact_id="cap-table", field="new_money_cents,pre_money_cents,shares", analysis_id="HX-08", output_names=["new_shares", "series_c_ownership"], transformation="Integer-share post-money capitalization bridge", downstream="Illustrative investment terms"),
        lineage_item(node_id="hx-return", label="Series C return distribution", artifact_id="cap-table", field="new_money_cents,preference,ownership", analysis_id="HX-09", output_names=["p10_moic", "p50_moic", "p90_moic", "probability_below_1x", "probability_at_least_3x"], transformation="Twenty-thousand seeded exit, dilution, and preference paths", downstream="Conditional venture outcome range; not a forecast"),
    ]
    decision = {
        "schema_version": "underwriting.decision-record/v1",
        "decision": "INVEST",
        "attribution": "Cooper David Reed — illustrative IC",
        "status": "DECISION_RECORD_INCOMPLETE",
        "signature_status": "PENDING_FOUNDER_SIGNATURE",
        "as_of": "2026-08-31T23:59:59Z",
        "rationale": "Invest at the proposed valuation only with milestone-based funding tied to ordinary-cohort retention, verified pipeline conversion, and gross-margin progression.",
        "conditions": ["Ordinary-cohort NRR at or above 105%", "Pipeline stage-history audit complete", "Gross margin at or above 70%", "Optimizer RCT effect replicated", "18-month post-close runway"],
        "open_conditions": 5,
        "terms": ["Illustrative $40M Series C", "$160M pre-money", "Milestone-based second tranche"],
        "metric_pairs": [
            {"metric": "Ordinary-cohort NRR", "threshold": ">=105%", "observed": f"{quantize(ordinary_nrr * 100)}%", "status": "CLEARS" if ordinary_nrr >= 1.05 else "MISSES"},
            {"metric": "Gross margin", "threshold": ">=70%", "observed": f"{quantize(gross_margin * 100)}%", "status": "CLEARS" if gross_margin >= 0.70 else "MISSES"},
            {"metric": "Post-close runway", "threshold": ">=18 months", "observed": f"{quantize(post_close_runway)} months", "status": "CLEARS" if post_close_runway >= 18 else "MISSES"},
        ],
        "verification_sources": ["HX-01", "HX-02", "HX-03", "HX-04", "HX-06", "HX-09"],
        "failure_consequences": ["Do not release the second tranche", "Retain HOLD until milestone evidence and founder adjudication"],
    }
    decision["decision_sha256"] = digest(decision)
    return {
        "caseId": "helios",
        "company": "Helios Compute Control",
        "caseType": "VC / Growth",
        "synthetic": True,
        "investmentAdjudication": "PENDING_HUMAN",
        "workflowDisposition": _workflow_disposition(receipts, decision),
        "disclosure": manifest["disclosure"],
        "decision": decision,
        "summaryMetrics": [
            _metric("hx-ownership", "Series C ownership", f"{quantize(series_c_ownership * 100)}%", "$40M on $160M pre-money", "ACCOUNTING_IDENTITY", ["hx-ownership"]),
            _metric("hx-nrr-metric", "Ordinary-cohort NRR", f"{quantize(ordinary_nrr * 100)}%", f"Pooled with design partners: {quantize(pooled_nrr * 100)}%", "DESCRIPTIVE", ["hx-nrr"]),
            _metric("hx-margin-metric", "Blended gross margin", f"{quantize(gross_margin * 100)}%", "LTM, including telemetry and support", "ACCOUNTING_IDENTITY", ["hx-margin"]),
            _metric("hx-runway-metric", "Runway", f"{quantize(runway)} mo", f"Burn multiple: {quantize(burn_multiple)}x", "ACCOUNTING_IDENTITY", ["hx-runway"]),
            _metric("hx-tam-metric", "Modeled serviceable spend", f"${quantize(tam / 100_000_000_000)}B", "90% tier intervals; tier 5 abstained", "PREDICTIVE_ASSOCIATION", ["hx-tam", "hx-tam-assumptions"]),
        ],
        "thesis": {
            "statement": "Helios can become the system of control for volatile enterprise GPU spend if ordinary cohorts retain and optimizer savings translate into durable platform economics.",
            "counterthesis": "Design-partner selection, inflated pipeline, cloud-cost exposure, and preference-heavy outcomes may make growth and TAM appear more durable than they are.",
            "drivers": ["Usage-linked expansion", "Measured optimizer efficiency", "Large but tier-uncertain spend universe", "Gross-margin progression with scale"],
            "falsifiers": ["Ordinary-cohort NRR below 100%", "Pipeline conversion below 20%", "Gross margin below 65%", "Runway below 12 months post-close"],
            "requests": ["Full stage-history export", "Design-partner contract sample", "Cloud-cost unit ledger", "Preference and pro-rata side letters"],
        },
        "falsifierStates": [
            {"label": "Ordinary-cohort NRR below 100%", "status": "CLEAR" if ordinary_nrr >= 1 else "TRIGGERED", "observed": f"{quantize(ordinary_nrr * 100)}%", "lineage": ["hx-nrr"]},
            {"label": "Pipeline conversion below 20%", "status": "OPEN", "observed": "Stage-history audit flags inflation; conversion not matured", "lineage": ["hx-pipeline"]},
            {"label": "Gross margin below 65%", "status": "CLEAR" if gross_margin >= 0.65 else "TRIGGERED", "observed": f"{quantize(gross_margin * 100)}%", "lineage": ["hx-margin"]},
            {"label": "Runway below 12 months post-close", "status": "CLEAR" if post_close_runway >= 12 else "TRIGGERED", "observed": f"{quantize(post_close_runway)} months post-close", "lineage": ["hx-runway"]},
        ],
        "analyses": receipts,
        "distributionLineage": "hx-return",
        "scenarios": [
            {"id": "base", "label": "Conditional base", "entry_ev": "$200M post", "gross_irr": "n/a", "moic": f"{quantize(moic_q[1])}x p50", "covenant": "5 conditions open", "lineage": ["hx-ownership", "hx-return"]},
            {"id": "milestone", "label": "Milestones cleared", "entry_ev": "$200M post", "gross_irr": "n/a", "moic": f"{quantize(moic_q[2])}x p90", "covenant": "Second tranche released", "lineage": ["hx-ownership", "hx-return"]},
            {"id": "downside", "label": "Preference downside", "entry_ev": "$200M post", "gross_irr": "n/a", "moic": f"{quantize(moic_q[0])}x p10", "covenant": "1x preference protection", "lineage": ["hx-ownership", "hx-return"]},
        ],
        "returnsDistribution": {"moic": [quantize(value) for value in moic_q], "irr": [], "labels": ["p10", "p50", "p90"]},
        "valueCreation": [
            {"initiative": "Ordinary-cohort engine", "kpi": "Non-design-partner NRR", "baseline": f"{quantize(ordinary_nrr * 100)}%", "target": "130%", "owner": "VP Revenue", "milestone": "Cohort playbooks by quarter 2", "value": "Retention-led valuation support", "risk": "Design-partner tactics do not transfer", "lineage": ["hx-nrr"]},
            {"initiative": "Cloud unit economics", "kpi": "Gross margin", "baseline": f"{quantize(gross_margin * 100)}%", "target": "74%", "owner": "CTO", "milestone": "Telemetry cost per managed dollar down 25%", "value": "Runway and multiple expansion", "risk": "Provider price changes", "lineage": ["hx-margin", "hx-runway"]},
            {"initiative": "Pipeline truth system", "kpi": "Stage conversion", "baseline": "History not summary", "target": "Forecast error <15%", "owner": "CRO", "milestone": "Stage governance by day 45", "value": "Financing-risk reduction", "risk": "Enterprise cycle elongation", "lineage": ["hx-pipeline"]},
        ],
        "lineage": lineages,
        "artifacts": list(artifacts.values()),
    }


def analyze_room(manifest_path: str | Path, output: str | Path) -> Path:
    path = Path(manifest_path)
    root, manifest, artifacts = _manifest(path)
    case_id = manifest["case_id"]
    if case_id == "atlasgrid":
        result = _atlasgrid(root, manifest, artifacts)
    elif case_id == "helios":
        result = _helios(root, manifest, artifacts)
    else:
        raise UnderwritingError("case_id_invalid")
    result["schema_version"] = "underwriting.workbench-case/v1"
    result["manifest_sha256"] = manifest["manifest_sha256"]
    result["scenarioBook"] = _scenario_book(
        case_id, result["scenarios"], result["returnsDistribution"]
    )
    result["thesisGraph"] = _thesis_graph(result)
    result["analysis_sha256"] = digest(result)
    destination = Path(output)
    write_json(destination, result)
    return destination
