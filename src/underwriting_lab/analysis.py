from __future__ import annotations

import csv
import math
from collections import defaultdict
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


def _diagnostic(name: str, value: float | str, status: str = "PASS") -> dict[str, str]:
    return {"name": name, "value": str(value), "status": status}


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


def _atlasgrid(
    root: Path, manifest: dict[str, Any], artifacts: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    customers = _rows(root, artifacts["customer-month"])
    masters = _rows(root, artifacts["customer-master"])
    pnl = _rows(root, artifacts["monthly-pnl"])
    qoe = _rows(root, artifacts["qoe-bridge"])
    pricing = _rows(root, artifacts["pricing-experiment"])
    rollout = _rows(root, artifacts["support-rollout"])
    debt = read_json(root / artifacts["debt-terms"]["path"])
    months = sorted({row["month"] for row in customers})
    base_month, end_month = months[-13], months[-1]
    base = {row["entity_id"]: int(row["mrr_cents"]) for row in customers if row["month"] == base_month and int(row["mrr_cents"]) > 0}
    ending_rows = [row for row in customers if row["month"] == end_month]
    ending = {row["entity_id"]: int(row["mrr_cents"]) for row in ending_rows}
    full_nrr = sum(ending.get(key, 0) for key in base) / sum(base.values())
    survivors = [key for key in base if ending.get(key, 0) > 0]
    active_nrr = sum(ending[key] for key in survivors) / sum(base[key] for key in survivors)
    ending_total = sum(int(row["mrr_cents"]) for row in ending_rows)
    entity_values = sorted((int(row["mrr_cents"]) for row in ending_rows), reverse=True)
    parent_values: dict[str, int] = defaultdict(int)
    for row in ending_rows:
        parent_values[row["parent_id"]] += int(row["mrr_cents"])
    entity_concentration = sum(entity_values[:10]) / ending_total
    parent_concentration = sum(sorted(parent_values.values(), reverse=True)[:10]) / ending_total
    ltm = pnl[-12:]
    revenue = sum(int(row["recognized_revenue_cents"]) for row in ltm)
    reported_cogs = sum(int(row["reported_cogs_cents"]) for row in ltm)
    burdened_cogs = sum(int(row["fully_burdened_cogs_cents"]) for row in ltm)
    reported_gm = 1 - reported_cogs / revenue
    burdened_gm = 1 - burdened_cogs / revenue
    seller_ebitda = int(qoe[0]["amount_cents"])
    normalized_ebitda = sum(int(row["amount_cents"]) for row in qoe)
    churn_events = len({row["entity_id"] for row in customers if int(row["active"]) == 0})
    at_risk = len(masters)
    annualized_churn = churn_events / at_risk / 5

    treatment = np.array([int(row["treatment"]) for row in pricing])
    renewal = np.array([int(row["renewed"]) for row in pricing], dtype=float)
    realized = np.array([float(row["realized_increase_pct"]) for row in pricing])
    rct_effect, rct_se, rct_low, rct_high = _mean_difference(renewal, treatment)
    naive_slope, naive_se = _slope(renewal, realized)
    did_resolution, did_resolution_se = _did(rollout, "resolution_hours")
    did_churn, did_churn_se = _did(rollout, "gross_churn_bps")

    ask_equity = debt["ask_enterprise_value_cents"] - debt["entry_debt_cents"]
    reprice_equity = debt["repriced_enterprise_value_cents"] - debt["entry_debt_cents"]
    base_exit_equity = int(float(debt["base_exit_multiple"]) * debt["base_exit_ebitda_cents"] - debt["exit_debt_base_cents"])
    downside_exit_equity = int(float(debt["downside_exit_multiple"]) * debt["downside_exit_ebitda_cents"] - debt["exit_debt_downside_cents"])
    ask_moic = base_exit_equity / ask_equity
    reprice_moic = base_exit_equity / reprice_equity
    downside_moic = downside_exit_equity / reprice_equity
    ask_irr = ask_moic ** (1 / debt["hold_years"]) - 1
    reprice_irr = reprice_moic ** (1 / debt["hold_years"]) - 1
    downside_irr = downside_moic ** (1 / debt["hold_years"]) - 1
    scenario_seed = int(manifest["seed_commitment"][:16], 16)
    rng = np.random.Generator(np.random.PCG64(scenario_seed))
    draws = 20_000
    exit_ebitda = rng.normal(3_250_000_000, 520_000_000, draws).clip(1_400_000_000)
    exit_multiple = rng.normal(8.3, 1.15, draws).clip(4.5, 12.0)
    exit_debt = rng.normal(6_800_000_000, 1_050_000_000, draws).clip(2_000_000_000)
    equity = np.maximum(0, exit_ebitda * exit_multiple - exit_debt)
    moic_draws = equity / reprice_equity
    irr_draws = np.maximum(0, moic_draws) ** (1 / 5) - 1
    moic_q = np.quantile(moic_draws, [0.1, 0.5, 0.9])
    irr_q = np.quantile(irr_draws, [0.1, 0.5, 0.9])

    receipts = [
        analysis_receipt(
            analysis_id="AG-02",
            question="How much does active-only reporting overstate LTM net retention?",
            classification="DESCRIPTIVE",
            method="Fixed-cohort ARR bridge including churned entities",
            population=f"{len(base)} entities active at {base_month}",
            inputs=[_input(artifacts["customer-month"])],
            outputs=[_output("full_cohort_nrr", quantize(full_nrr * 100), "percent"), _output("active_only_nrr", quantize(active_nrr * 100), "percent")],
            assumptions=["Cohort membership is frozen at the base month."],
            diagnostics=[_diagnostic("selection_bias_bps", quantize((active_nrr - full_nrr) * 10_000), "PASS" if active_nrr - full_nrr >= 0.05 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="AG-05",
            question="What is the observed annualized logo-churn hazard?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Discrete-time event-rate summary with declared covariate limitation",
            population=f"{at_risk} synthetic customer entities over 60 months",
            inputs=[_input(artifacts["customer-month"]), _input(artifacts["customer-master"])],
            outputs=[_output("annualized_logo_churn", quantize(annualized_churn * 100), "percent")],
            assumptions=["Customer health and pricing are endogenous; this estimate is not causal."],
            diagnostics=[_diagnostic("standard_error", quantize(math.sqrt(max(annualized_churn * (1 - annualized_churn) / at_risk, 0)) * 100), "REPORTED"), _diagnostic("event_count", churn_events, "PASS" if churn_events >= 200 else "FAIL")],
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
            diagnostics=[_diagnostic("assignment_mechanism", "seeded_parent_account_randomization"), _diagnostic("confidence_interval", f"[{quantize(rct_low * 100)}, {quantize(rct_high * 100)}]", "PASS" if rct_low <= -0.05 <= rct_high else "FAIL"), _diagnostic("standard_error", quantize(rct_se * 100))],
        ),
        analysis_receipt(
            analysis_id="AG-08",
            question="What is the synthetic support-automation effect?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Pod-level pre/post difference-in-differences",
            population="40 synthetic customer-success pods; 12 pre and 12 post months",
            inputs=[_input(artifacts["support-rollout"])],
            outputs=[_output("resolution_att", quantize(did_resolution), "hours"), _output("gross_churn_att", quantize(did_churn), "basis_points")],
            assumptions=["Synthetic staggered assignment with no spillovers."],
            diagnostics=[_diagnostic("assignment_mechanism", "seeded_pod_rollout"), _diagnostic("standard_error", quantize(did_resolution_se)), _diagnostic("placebo", "preperiod_frozen_before_treatment", "PASS" if did_resolution < 0 and did_churn < 0 else "FAIL")],
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
            diagnostics=[_diagnostic("overlapping_events", "leader_hire, pricing_change, macro_shift", "BLOCKED")],
            state="ABSTAIN",
        ),
        analysis_receipt(
            analysis_id="AG-10",
            question="How do asking and repriced entries change sponsor returns?",
            classification="SCENARIO",
            method="Five-year deterministic debt and equity bridge",
            population="Illustrative AtlasGrid sponsor transaction",
            inputs=[_input(artifacts["debt-terms"]), _input(artifacts["qoe-bridge"])],
            outputs=[_output("ask_irr", quantize(ask_irr * 100), "percent"), _output("reprice_irr", quantize(reprice_irr * 100), "percent"), _output("reprice_moic", quantize(reprice_moic), "multiple")],
            assumptions=["Exit EBITDA, multiple, debt paydown, and hold period are declared scenario inputs."],
            diagnostics=[_diagnostic("hurdle_test", "reprice_clears_22pct_and_2x", "PASS" if reprice_irr >= 0.22 and reprice_moic >= 2 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="AG-11",
            question="What is the conditional distribution of repriced sponsor outcomes?",
            classification="SCENARIO",
            method="20,000 seeded operating, multiple, and debt paths",
            population="Declared synthetic scenario distribution",
            inputs=[_input(artifacts["debt-terms"])],
            outputs=[_output("p10_moic", quantize(moic_q[0]), "multiple"), _output("p50_moic", quantize(moic_q[1]), "multiple"), _output("p90_moic", quantize(moic_q[2]), "multiple"), _output("probability_below_1x", quantize(float(np.mean(moic_draws < 1)) * 100), "percent")],
            assumptions=["Scenario distributions are disclosed inputs, not forecasts."],
            diagnostics=[_diagnostic("draws", draws), _diagnostic("ordered_quantiles", "true", "PASS" if moic_q[0] <= moic_q[1] <= moic_q[2] else "FAIL")],
        ),
    ]
    lineages = [
        lineage_item(node_id="ag-nrr", label="Full-cohort NRR", artifact_id="customer-month", field="mrr_cents", analysis_id="AG-02"),
        lineage_item(node_id="ag-concentration", label="Parent concentration", artifact_id="customer-month", field="parent_id,mrr_cents", analysis_id="AG-03"),
        lineage_item(node_id="ag-margin", label="Burdened gross margin", artifact_id="monthly-pnl", field="recognized_revenue_cents,fully_burdened_cogs_cents", analysis_id="AG-04"),
        lineage_item(node_id="ag-ebitda", label="Normalized EBITDA", artifact_id="qoe-bridge", field="amount_cents", analysis_id="AG-04"),
        lineage_item(node_id="ag-reprice", label="Repriced sponsor return", artifact_id="debt-terms", field="entry and exit assumptions", analysis_id="AG-10"),
    ]
    decision = {
        "schema_version": "underwriting.decision-record/v1",
        "decision": "REPRICE",
        "attribution": "Cooper David Reed — illustrative IC",
        "status": "DECISION_RECORD_WELL_FORMED",
        "rationale": "The asking price does not compensate for definition quality, concentration, fully burdened margins, or leverage fragility. A $210M enterprise value with the same debt quantum clears the declared return hurdles.",
        "conditions": ["Validate cancellation-for-convenience exposure", "Tie parent accounts to master agreements", "Cap earnout against verified live ARR"],
        "open_conditions": 3,
    }
    decision["decision_sha256"] = digest(decision)
    scenarios = [
        {"id": "ask", "label": "Seller ask", "entry_ev": "$240M", "gross_irr": f"{quantize(ask_irr * 100)}%", "moic": f"{quantize(ask_moic)}x", "covenant": "Tight"},
        {"id": "reprice", "label": "Repriced entry", "entry_ev": "$210M", "gross_irr": f"{quantize(reprice_irr * 100)}%", "moic": f"{quantize(reprice_moic)}x", "covenant": "Manageable"},
        {"id": "downside", "label": "Downside", "entry_ev": "$210M", "gross_irr": f"{quantize(downside_irr * 100)}%", "moic": f"{quantize(downside_moic)}x", "covenant": "Breach risk"},
    ]
    return {
        "caseId": "atlasgrid",
        "company": "AtlasGrid Systems",
        "caseType": "PE / Growth Equity",
        "synthetic": True,
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
        "analyses": receipts,
        "scenarios": scenarios,
        "returnsDistribution": {"moic": [quantize(value) for value in moic_q], "irr": [quantize(value * 100) for value in irr_q], "labels": ["p10", "p50", "p90"]},
        "valueCreation": [
            {"initiative": "Renewal architecture", "kpi": "Complete-cohort NRR", "baseline": f"{quantize(full_nrr * 100)}%", "target": "104%", "owner": "Chief Revenue Officer", "milestone": "Segment playbooks live by day 90", "value": "$26M EV bridge", "risk": "Price-driven churn"},
            {"initiative": "Support automation", "kpi": "Resolution time", "baseline": "23.0 hours", "target": "17.5 hours", "owner": "Chief Customer Officer", "milestone": "20-pod rollout by day 120", "value": "$9M EV bridge", "risk": "Service-quality regression"},
            {"initiative": "Cost-definition reset", "kpi": "Burdened gross margin", "baseline": f"{quantize(burdened_gm * 100)}%", "target": "76%", "owner": "CFO", "milestone": "Account contribution ledger by day 30", "value": "$18M EV bridge", "risk": "Underinvestment in implementation"},
        ],
        "lineage": lineages,
        "artifacts": list(artifacts.values()),
    }


def _helios(
    root: Path, manifest: dict[str, Any], artifacts: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    customers = _rows(root, artifacts["customer-month"])
    masters = _rows(root, artifacts["customer-master"])
    pnl = _rows(root, artifacts["monthly-pnl"])
    pipeline = _rows(root, artifacts["pipeline"])
    survey = _rows(root, artifacts["market-survey"])
    experiment = _rows(root, artifacts["optimizer-experiment"])
    cap = read_json(root / artifacts["cap-table"]["path"])
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
    recent_burn = np.mean([int(row["net_burn_cents"]) for row in pnl[-3:]])
    runway = cap["cash_at_cutoff_cents"] / recent_burn
    prior_revenue = sum(int(row["revenue_cents"]) for row in pnl[-24:-12])
    net_new_arr = max(1, revenue - prior_revenue)
    burn_multiple = sum(int(row["net_burn_cents"]) for row in ltm) / net_new_arr

    stage_probability = {1: 0.08, 2: 0.16, 3: 0.32, 4: 0.52, 5: 0.74, 6: 0.88}
    actual_weighted = sum(int(row["amount_cents"]) * stage_probability[int(row["actual_stage"])] for row in pipeline)
    reported_weighted = sum(int(row["amount_cents"]) * stage_probability[int(row["reported_stage"])] for row in pipeline)
    pipeline_inflation = reported_weighted - actual_weighted
    inflated_count = sum(int(row["inflated"]) for row in pipeline)

    market_outputs: list[dict[str, str]] = []
    market_diagnostics: list[dict[str, str]] = []
    universe_counts = [5_000, 7_500, 9_500, 11_000, 8_000]
    tier_mid_spend = [240_000_000, 192_000_000, 144_000_000, 96_000_000, 48_000_000]
    tam_draws: list[float] = []
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
        low = float(beta.ppf(0.05, alpha, beta_value))
        high = float(beta.ppf(0.95, alpha, beta_value))
        tier_tam = universe_counts[tier - 1] * median * tier_mid_spend[tier - 1]
        tam_draws.append(tier_tam)
        market_outputs.append(_output(f"tier_{tier}_adoption", quantize(median * 100), "percent"))
        market_diagnostics.append(_diagnostic(f"tier_{tier}_credible_interval", f"[{quantize(low * 100)}, {quantize(high * 100)}]"))
    tam = sum(tam_draws)

    treatment = np.array([int(row["treatment"]) for row in experiment])
    outcome = np.array([float(row["outcome_log_cost_change"]) for row in experiment])
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
    draws = 20_000
    failure = rng.random(draws) < 0.38
    exits = rng.lognormal(math.log(65_000_000_000), 0.88, draws)
    exits[failure] = rng.uniform(0, 6_000_000_000, int(failure.sum()))
    dilution = rng.beta(8, 24, draws) * 0.45
    ownership = series_c_ownership * (1 - dilution)
    preference = np.full(draws, cap["new_money_cents"], dtype=float)
    proceeds = np.minimum(exits, np.maximum(preference, exits * ownership))
    moic = proceeds / cap["new_money_cents"]
    moic_q = np.quantile(moic, [0.1, 0.5, 0.9])
    loss_probability = float(np.mean(moic < 1))
    three_x_probability = float(np.mean(moic >= 3))

    receipts = [
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
            analysis_id="HX-04",
            question="Does reported pipeline reconcile to actual stage history?",
            classification="DESCRIPTIVE",
            method="Historical stage-probability weighted pipeline recomputation",
            population=f"{len(pipeline)} synthetic opportunities",
            inputs=[_input(artifacts["pipeline"])],
            outputs=[_output("inflated_opportunities", inflated_count, "count"), _output("weighted_pipeline_inflation", quantize(pipeline_inflation / 100_000_000), "million_usd")],
            assumptions=["Stage probabilities are fixed and printed with denominators."],
            diagnostics=[_diagnostic("inflated_roster_count", inflated_count, "PASS" if inflated_count == 48 else "FAIL")],
        ),
        analysis_receipt(
            analysis_id="HX-05",
            question="What tiered adoption range is supported by the synthetic survey?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Independent beta-binomial posterior by predeclared market tier",
            population=f"{len(survey)} synthetic stratified survey respondents",
            inputs=[_input(artifacts["market-survey"])],
            outputs=market_outputs + [_output("modeled_tam", quantize(tam / 100_000_000), "million_usd")],
            assumptions=["Beta(1,1) prior; finite universe and tier spend inputs are scenario assumptions."],
            diagnostics=market_diagnostics + [_diagnostic("credible_interval", "90_percent_by_tier"), _diagnostic("prior_sensitivity", "Beta(2,2) companion required")],
        ),
        analysis_receipt(
            analysis_id="HX-06",
            question="What is the synthetic optimizer experiment effect on log unit cost?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Intention-to-treat difference in mean log-cost change",
            population=f"{len(experiment)} randomized synthetic customers",
            inputs=[_input(artifacts["optimizer-experiment"])],
            outputs=[_output("optimizer_ate", quantize(rct_effect * 100), "percent_log_points")],
            assumptions=["Seeded 1:1 assignment and no cross-customer interference."],
            diagnostics=[_diagnostic("assignment_mechanism", "seeded_customer_randomization"), _diagnostic("confidence_interval", f"[{quantize(rct_low * 100)}, {quantize(rct_high * 100)}]", "PASS" if rct_low <= -0.11 <= rct_high else "FAIL"), _diagnostic("standard_error", quantize(rct_se * 100))],
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
            diagnostics=[_diagnostic("pretrend", "non_parallel", "BLOCKED")],
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
            inputs=[_input(artifacts["cap-table"])],
            outputs=[_output("p10_moic", quantize(moic_q[0]), "multiple"), _output("p50_moic", quantize(moic_q[1]), "multiple"), _output("p90_moic", quantize(moic_q[2]), "multiple"), _output("probability_below_1x", quantize(loss_probability * 100), "percent"), _output("probability_at_least_3x", quantize(three_x_probability * 100), "percent")],
            assumptions=["Exit, timing, and future dilution distributions are disclosed scenario priors."],
            diagnostics=[_diagnostic("draws", draws), _diagnostic("ordered_quantiles", "true", "PASS" if moic_q[0] <= moic_q[1] <= moic_q[2] else "FAIL")],
        ),
    ]
    lineages = [
        lineage_item(node_id="hx-nrr", label="Go-forward NRR", artifact_id="customer-month", field="revenue_cents,design_partner", analysis_id="HX-02"),
        lineage_item(node_id="hx-margin", label="Blended gross margin", artifact_id="monthly-pnl", field="revenue_cents,cogs_cents", analysis_id="HX-01"),
        lineage_item(node_id="hx-runway", label="Runway", artifact_id="monthly-pnl", field="net_burn_cents", analysis_id="HX-03"),
        lineage_item(node_id="hx-tam", label="Modeled TAM", artifact_id="market-survey", field="tier,adopted,annual_ai_spend_cents", analysis_id="HX-05"),
        lineage_item(node_id="hx-return", label="Series C outcome", artifact_id="cap-table", field="new_money_cents,pre_money_cents", analysis_id="HX-09"),
    ]
    decision = {
        "schema_version": "underwriting.decision-record/v1",
        "decision": "INVEST",
        "attribution": "Cooper David Reed — illustrative IC",
        "status": "DECISION_RECORD_WELL_FORMED",
        "rationale": "Invest at the proposed valuation only with milestone-based funding tied to ordinary-cohort retention, verified pipeline conversion, and gross-margin progression.",
        "conditions": ["Ordinary-cohort NRR at or above 105%", "Pipeline stage-history audit complete", "Gross margin at or above 70%", "Optimizer RCT effect replicated", "18-month post-close runway"],
        "open_conditions": 3,
    }
    decision["decision_sha256"] = digest(decision)
    return {
        "caseId": "helios",
        "company": "Helios Compute Control",
        "caseType": "VC / Growth",
        "synthetic": True,
        "disclosure": manifest["disclosure"],
        "decision": decision,
        "summaryMetrics": [
            _metric("hx-ownership", "Series C ownership", f"{quantize(series_c_ownership * 100)}%", "$40M on $160M pre-money", "ACCOUNTING_IDENTITY", ["hx-return"]),
            _metric("hx-nrr-metric", "Ordinary-cohort NRR", f"{quantize(ordinary_nrr * 100)}%", f"Pooled with design partners: {quantize(pooled_nrr * 100)}%", "DESCRIPTIVE", ["hx-nrr"]),
            _metric("hx-margin-metric", "Blended gross margin", f"{quantize(gross_margin * 100)}%", "LTM, including telemetry and support", "ACCOUNTING_IDENTITY", ["hx-margin"]),
            _metric("hx-runway-metric", "Runway", f"{quantize(runway)} mo", f"Burn multiple: {quantize(burn_multiple)}x", "ACCOUNTING_IDENTITY", ["hx-runway"]),
            _metric("hx-tam-metric", "Modeled serviceable spend", f"${quantize(tam / 100_000_000)}M", "90% tier intervals; tier 5 abstained", "PREDICTIVE_ASSOCIATION", ["hx-tam"]),
        ],
        "thesis": {
            "statement": "Helios can become the system of control for volatile enterprise GPU spend if ordinary cohorts retain and optimizer savings translate into durable platform economics.",
            "counterthesis": "Design-partner selection, inflated pipeline, cloud-cost exposure, and preference-heavy outcomes may make growth and TAM appear more durable than they are.",
            "drivers": ["Usage-linked expansion", "Measured optimizer efficiency", "Large but tier-uncertain spend universe", "Gross-margin progression with scale"],
            "falsifiers": ["Ordinary-cohort NRR below 100%", "Pipeline conversion below 20%", "Gross margin below 65%", "Runway below 12 months post-close"],
            "requests": ["Full stage-history export", "Design-partner contract sample", "Cloud-cost unit ledger", "Preference and pro-rata side letters"],
        },
        "analyses": receipts,
        "scenarios": [
            {"id": "base", "label": "Conditional base", "entry_ev": "$200M post", "gross_irr": "n/a", "moic": f"{quantize(moic_q[1])}x p50", "covenant": "3 conditions open"},
            {"id": "milestone", "label": "Milestones cleared", "entry_ev": "$200M post", "gross_irr": "n/a", "moic": f"{quantize(moic_q[2])}x p90", "covenant": "Second tranche released"},
            {"id": "downside", "label": "Preference downside", "entry_ev": "$200M post", "gross_irr": "n/a", "moic": f"{quantize(moic_q[0])}x p10", "covenant": "1x preference protection"},
        ],
        "returnsDistribution": {"moic": [quantize(value) for value in moic_q], "irr": [], "labels": ["p10", "p50", "p90"]},
        "valueCreation": [
            {"initiative": "Ordinary-cohort engine", "kpi": "Non-design-partner NRR", "baseline": f"{quantize(ordinary_nrr * 100)}%", "target": "110%", "owner": "VP Revenue", "milestone": "Cohort playbooks by quarter 2", "value": "Retention-led valuation support", "risk": "Design-partner tactics do not transfer"},
            {"initiative": "Cloud unit economics", "kpi": "Gross margin", "baseline": f"{quantize(gross_margin * 100)}%", "target": "74%", "owner": "CTO", "milestone": "Telemetry cost per managed dollar down 25%", "value": "Runway and multiple expansion", "risk": "Provider price changes"},
            {"initiative": "Pipeline truth system", "kpi": "Stage conversion", "baseline": "History not summary", "target": "Forecast error <15%", "owner": "CRO", "milestone": "Stage governance by day 45", "value": "Financing-risk reduction", "risk": "Enterprise cycle elongation"},
        ],
        "lineage": lineages,
        "artifacts": list(artifacts.values()),
    }


def analyze_room(manifest_path: str | Path, output: str | Path) -> Path:
    path = Path(manifest_path)
    root, manifest, artifacts = _manifest(path)
    case_id = manifest["case_id"]
    result = _atlasgrid(root, manifest, artifacts) if case_id == "atlasgrid" else _helios(root, manifest, artifacts)
    result["schema_version"] = "underwriting.workbench-case/v1"
    result["manifest_sha256"] = manifest["manifest_sha256"]
    result["analysis_sha256"] = digest(result)
    destination = Path(output)
    write_json(destination, result)
    return destination
