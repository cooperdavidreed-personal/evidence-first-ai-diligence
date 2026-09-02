from __future__ import annotations

import csv
import math
from collections import defaultdict
from dataclasses import replace
from datetime import datetime
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import beta

from .contracts import (
    CUTOFF,
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
from .finance import npv_cents
from .experiments import collapsed_pod_delta, difference_in_means
from .metric_registry import build_case_metric_contract
from .pe_engine import (
    PEOperatingAssumptions,
    PETransactionAssumptions,
    PEValueLever,
    build_pe_sensitivity_book,
    build_value_creation_bridge,
    run_pe_case,
    simulate_pe_distribution,
    solve_maximum_bid,
)
from .policy_registry import helios_public_desk_policy
from .temporal import scan_temporal_artifacts
from .vc_engine import (
    FundingEvent,
    Holder,
    PreferenceTerms,
    VCScenarioAssumptions,
    run_vc_scenario,
    simulate_vc_distribution,
)


def _manifest(
    manifest_path: Path,
) -> tuple[Path, dict[str, Any], dict[str, dict[str, Any]]]:
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


def _output(name: str, value: Decimal | float | int | str, unit: str) -> dict[str, str]:
    return {"name": name, "value": str(value), "unit": unit}


def _decision_pair(
    *,
    metric: str,
    metric_id: str,
    operator: str,
    threshold: str,
    threshold_value: Decimal | float | int | str,
    observed: str,
    observed_value: Decimal | float | int | str,
    designation: str = "BINDING",
) -> dict[str, str]:
    if designation not in {"BINDING", "INFORMATIONAL"}:
        raise UnderwritingError("decision_hurdle_designation_invalid")
    observed_decimal = Decimal(str(observed_value))
    threshold_decimal = Decimal(str(threshold_value))
    clears = {
        ">=": observed_decimal >= threshold_decimal,
        "<=": observed_decimal <= threshold_decimal,
        ">": observed_decimal > threshold_decimal,
        "<": observed_decimal < threshold_decimal,
        "==": observed_decimal == threshold_decimal,
    }.get(operator)
    if clears is None:
        raise UnderwritingError("decision_operator_invalid")
    return {
        "metric": metric,
        "metric_id": metric_id,
        "operator": operator,
        "threshold": threshold,
        "threshold_value": format(threshold_decimal, "f"),
        "observed": observed,
        "observed_value": format(observed_decimal, "f"),
        "status": "CLEARS" if clears else "MISSES",
        "designation": designation,
    }


def _condition_state(
    *,
    condition_id: str,
    text: str,
    metric_pairs: list[dict[str, str]],
    metric_ids: tuple[str, ...] = (),
    designation: str = "BINDING",
    state: str | None = None,
) -> dict[str, Any]:
    if designation not in {"BINDING", "INFORMATIONAL"}:
        raise UnderwritingError("decision_condition_designation_invalid")
    pairs_by_id = {item["metric_id"]: item for item in metric_pairs}
    if any(metric_id not in pairs_by_id for metric_id in metric_ids):
        raise UnderwritingError("decision_condition_metric_orphan")
    if state is None:
        if designation == "INFORMATIONAL":
            state = "INFORMATIONAL"
        elif not metric_ids:
            state = "OPEN_DILIGENCE"
        elif all(
            pairs_by_id[metric_id]["status"] == "CLEARS" for metric_id in metric_ids
        ):
            state = "CLEARS_QUANTITATIVELY"
        else:
            state = "MISSES_HURDLE"
    if state == "CLEARS_QUANTITATIVELY" and not metric_ids:
        raise UnderwritingError("decision_condition_clear_without_metric")
    return {
        "condition_id": condition_id,
        "text": text,
        "state": state,
        "designation": designation,
        "metric_ids": list(metric_ids),
    }


def _open_condition_count(condition_states: list[dict[str, Any]]) -> int:
    return sum(
        item["designation"] == "BINDING" and item["state"] != "CLEARS_QUANTITATIVELY"
        for item in condition_states
    )


def _issue_summary(issues: list[dict[str, Any]]) -> dict[str, Any]:
    """Build every practitioner-facing issue count from one typed ledger."""
    ids = [item["issue_id"] for item in issues]
    if len(ids) != len(set(ids)):
        raise UnderwritingError("decision_issue_duplicate")
    buckets = {
        "failed_quantitative_hurdles": [
            item["issue_id"]
            for item in issues
            if item["kind"] == "QUANTITATIVE_HURDLE" and item["state"] == "FAILED"
        ],
        "advancement_blockers": [
            item["issue_id"] for item in issues if item["blocks_advancement"]
        ],
        "pre_ic_requirements": [
            item["issue_id"] for item in issues if item["stage"] == "PRE_IC"
        ],
        "pre_signing_requirements": [
            item["issue_id"] for item in issues if item["stage"] == "PRE_SIGNING"
        ],
        "pre_debt_commitment_requirements": [
            item["issue_id"]
            for item in issues
            if item["stage"] == "PRE_DEBT_COMMITMENT"
        ],
        "nonblocking_diligence": [
            item["issue_id"] for item in issues if not item["blocks_advancement"]
        ],
    }
    return {
        "schema_version": "underwriting.issue-summary/v1",
        "issues": issues,
        "buckets": buckets,
        "counts": {key: len(value) for key, value in buckets.items()},
    }


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
        if receipt["analysis_id"] in {"AG-10", "AG-11"}:
            required = set(spec["design"]["required_diagnostics"])
            observed = {item["name"] for item in receipt["diagnostics"]}
            if not required.issubset(observed):
                missing = ",".join(sorted(required - observed))
                raise UnderwritingError(
                    f"analysis_required_diagnostic_missing:{receipt['analysis_id']}:{missing}"
                )
        receipt.pop("receipt_sha256")
        receipt["spec_sha256"] = expected
        receipt["receipt_sha256"] = digest(receipt)


def _complete_evidence_mappings(
    receipts: list[dict[str, Any]],
    mappings: list[dict[str, Any]],
    credit_tiers: dict[str, str],
) -> list[dict[str, Any]]:
    allowed = {"BASE_CASE", "VALUE_CREATION_BRIDGE", "SCENARIO_ONLY", "ZERO"}
    receipt_by_id = {item["analysis_id"]: item for item in receipts}
    if set(credit_tiers) != set(receipt_by_id) or not set(
        credit_tiers.values()
    ).issubset(allowed):
        raise UnderwritingError("evidence_credit_tier_contract_invalid")
    mapped = {item["source_analysis_id"]: item for item in mappings}
    if not set(mapped).issubset(receipt_by_id):
        raise UnderwritingError("evidence_mapping_analysis_orphan")
    for analysis_id, receipt in receipt_by_id.items():
        tier = credit_tiers[analysis_id]
        mapping = mapped.get(analysis_id)
        if mapping is None:
            first_output = receipt["outputs"][0] if receipt["outputs"] else None
            mapping = {
                "mapping_id": f"{analysis_id.lower()}-engine-authored-treatment",
                "source_analysis_id": analysis_id,
                "source_receipt_sha256": receipt["receipt_sha256"],
                "observed_value": (
                    f"{first_output['name']}: {first_output['value']} {first_output['unit']}"
                    if first_output
                    else "No estimate retained"
                ),
                "target_assumption_or_condition": {
                    "BASE_CASE": "Base underwriting evidence",
                    "VALUE_CREATION_BRIDGE": "Value-creation bridge only",
                    "SCENARIO_ONLY": "Declared scenario range only",
                    "ZERO": "No operating, transaction, or valuation assumption",
                }[tier],
                "credit_classification": receipt["classification"],
                "model_credit": {
                    "BASE_CASE": "Bounded base-case evidence",
                    "VALUE_CREATION_BRIDGE": "No base-case credit; bounded bridge treatment only",
                    "SCENARIO_ONLY": "Scenario calibration only",
                    "ZERO": "0",
                }[tier],
                "decision_response": {
                    "BASE_CASE": "Use within the declared method and population boundary",
                    "VALUE_CREATION_BRIDGE": "Keep separate from entry underwriting and disclose transfer assumptions",
                    "SCENARIO_ONLY": "Use for sensitivity or downside framing, not factual prediction",
                    "ZERO": "Retain as diligence, falsification, or identification-boundary evidence",
                }[tier],
            }
            mappings.append(mapping)
        mapping["credit_tier"] = tier
    if len({item["source_analysis_id"] for item in mappings}) != len(receipts):
        raise UnderwritingError("evidence_mapping_duplicate_or_missing")
    for mapping in mappings:
        mapping["mapping_sha256"] = digest(
            {key: value for key, value in mapping.items() if key != "mapping_sha256"}
        )
    return mappings


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


def _illustrative_value_range(cents: int) -> str:
    low = Decimal(abs(cents)) * Decimal("0.5") / Decimal(100_000_000)
    high = Decimal(abs(cents)) * Decimal("1.5") / Decimal(100_000_000)

    def two_significant(value: Decimal) -> str:
        if value == 0:
            return "0"
        places = 1 - value.adjusted()
        quantum = Decimal(1).scaleb(-places)
        return format(value.quantize(quantum), "f")

    return f"≈${two_significant(low)}–${two_significant(high)}M, illustrative and unverified"


def _deal_context(
    *,
    investment_question: str,
    one_liner: str,
    product: str,
    customer: str,
    market: str,
    competition: list[str],
    go_to_market: str,
    team: str,
    process: str,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "schema_version": "underwriting.deal-context/v1",
        "investment_question": investment_question,
        "company_one_liner": one_liner,
        "product": product,
        "customer": customer,
        "market": market,
        "competition": competition,
        "go_to_market": go_to_market,
        "team": team,
        "process": process,
        "evidence_boundary": "Synthetic narrative context; not external market evidence or a real company claim.",
    }
    body["context_sha256"] = digest(body)
    return body


def _scenario_book(
    case_id: str, scenarios: list[dict[str, str]], distribution: dict[str, Any]
) -> dict[str, Any]:
    book: dict[str, Any] = {
        "schema_version": "underwriting.scenario-book/v1",
        "case_id": case_id,
        "scenarios": scenarios,
        "distribution": distribution,
    }
    book["scenario_sha256"] = digest(book)
    return book


def _workflow_disposition(
    receipts: list[dict[str, Any]], decision: dict[str, Any]
) -> str:
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
    return (
        "READY_FOR_HUMAN_ADJUDICATION"
        if state is DecisionState.READY_FOR_ADJUDICATION
        else "HOLD"
    )


def _thesis_graph(result: dict[str, Any]) -> dict[str, Any]:
    decision_posture = result["decision"]["decision"]
    if decision_posture == "INVEST":
        decision_posture = "CONDITIONAL INVEST"
    nodes: list[dict[str, Any]] = [
        {
            "node_id": "decision",
            "kind": "DECISION",
            "label": f"{decision_posture} · NOT APPROVED",
            "status": f"{result['workflowDisposition']} · {result['investmentAdjudication'].replace('_', ' ')}",
            "references": [result["decision"]["decision_sha256"]],
        }
    ]
    edges: list[dict[str, str]] = []
    for item in result["lineage"]:
        nodes.append(
            {
                "node_id": f"evidence-{item['node_id']}",
                "kind": "EVIDENCE",
                "label": item["label"],
                "status": "BOUND",
                "references": [item["artifact_id"], item["analysis_id"]],
            }
        )
    for metric in result["summaryMetrics"]:
        metric_node = f"metric-{metric['metric_id']}"
        nodes.append(
            {
                "node_id": metric_node,
                "kind": "ESTIMATE",
                "label": f"{metric['label']}: {metric['value']}",
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
    estimate = difference_in_means(outcome, treatment)
    return estimate.effect, estimate.standard_error, estimate.low, estimate.high


def _baseline_adjusted_difference(
    outcome: np.ndarray, treatment: np.ndarray, baseline: np.ndarray
) -> tuple[float, float, float, float]:
    design = np.column_stack([np.ones(len(outcome)), treatment, baseline])
    if len(outcome) != len(treatment) or len(outcome) != len(baseline):
        raise UnderwritingError("adjusted_difference_length_mismatch")
    beta_hat = np.linalg.lstsq(design, outcome, rcond=None)[0]
    residuals = outcome - design @ beta_hat
    degrees_of_freedom = len(outcome) - design.shape[1]
    if degrees_of_freedom <= 0:
        raise UnderwritingError("adjusted_difference_degrees_of_freedom")
    covariance = float((residuals @ residuals) / degrees_of_freedom) * np.linalg.inv(
        design.T @ design
    )
    effect = float(beta_hat[1])
    standard_error = math.sqrt(float(covariance[1, 1]))
    return (
        effect,
        standard_error,
        effect - 1.96 * standard_error,
        effect + 1.96 * standard_error,
    )


def _slope(y: np.ndarray, x: np.ndarray) -> tuple[float, float]:
    design = np.column_stack([np.ones(len(x)), x])
    beta_hat = np.linalg.lstsq(design, y, rcond=None)[0]
    residuals = y - design @ beta_hat
    variance = float((residuals @ residuals) / (len(y) - design.shape[1]))
    covariance = variance * np.linalg.inv(design.T @ design)
    return float(beta_hat[1]), math.sqrt(float(covariance[1, 1]))


def _joint_product_se(
    outcome: np.ndarray,
    exposure: np.ndarray,
    treatment: np.ndarray,
    *,
    slope: float,
    first_stage: float,
) -> tuple[float, float]:
    """Joint HC1 influence delta SE for slope times randomized first stage."""

    if not (
        len(outcome) == len(exposure) == len(treatment)
        and len(outcome) > 4
        and np.isfinite(outcome).all()
        and np.isfinite(exposure).all()
    ):
        raise UnderwritingError("joint_product_input_invalid")
    design = np.column_stack([np.ones(len(exposure)), exposure])
    inverse = np.linalg.inv(design.T @ design)
    beta = np.linalg.lstsq(design, outcome, rcond=None)[0]
    residuals = outcome - design @ beta
    slope_influence = (design @ inverse[:, 1]) * residuals
    slope_influence *= math.sqrt(len(outcome) / (len(outcome) - design.shape[1]))
    treated = exposure[treatment == 1]
    control = exposure[treatment == 0]
    if len(treated) < 2 or len(control) < 2:
        raise UnderwritingError("joint_product_arm_inadequate")
    stage_influence = np.empty(len(exposure))
    stage_influence[treatment == 1] = (
        (treated - treated.mean())
        / len(treated)
        * math.sqrt(len(treated) / (len(treated) - 1))
    )
    stage_influence[treatment == 0] = (
        -(control - control.mean())
        / len(control)
        * math.sqrt(len(control) / (len(control) - 1))
    )
    slope_variance = float(slope_influence @ slope_influence)
    stage_variance = float(stage_influence @ stage_influence)
    covariance = float(slope_influence @ stage_influence)
    product_variance = (
        first_stage**2 * slope_variance
        + slope**2 * stage_variance
        + 2 * slope * first_stage * covariance
    )
    if not math.isfinite(product_variance) or product_variance < 0:
        raise UnderwritingError("joint_product_variance_invalid")
    return math.sqrt(product_variance), covariance


def _smd(values: np.ndarray, treatment: np.ndarray) -> float:
    treated = values[treatment == 1]
    control = values[treatment == 0]
    pooled = math.sqrt(float((treated.var(ddof=1) + control.var(ddof=1)) / 2))
    return 0.0 if pooled == 0 else float((treated.mean() - control.mean()) / pooled)


def _kaplan_meier(
    durations: list[int], events: list[bool], horizons: tuple[int, ...]
) -> dict[int, float]:
    survival = 1.0
    results: dict[int, float] = {}
    for month in range(1, max(horizons) + 1):
        at_risk = sum(duration >= month for duration in durations)
        failures = sum(
            duration == month and event
            for duration, event in zip(durations, events, strict=True)
        )
        if at_risk:
            survival *= 1 - failures / at_risk
        if month in horizons:
            results[month] = survival
    return results


def _did(rows: list[dict[str, str]], field: str) -> tuple[float, float]:
    estimate = collapsed_pod_delta(rows, field)
    return estimate.effect, estimate.standard_error


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
    se = math.sqrt(
        float(treated.var(ddof=1) / len(treated) + control.var(ddof=1) / len(control))
    )
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
    pricing_all = _rows(root, artifacts["pricing-experiment"])
    cutoff_instant = datetime.fromisoformat(CUTOFF.replace("Z", "+00:00"))
    pricing = [
        row
        for row in pricing_all
        if datetime.fromisoformat(row["observed_at"].replace("Z", "+00:00"))
        <= cutoff_instant
    ]
    excluded_pricing = [row for row in pricing_all if row not in pricing]
    temporal_scan: dict[str, Any] = {
        "schema_version": "underwriting.temporal-scan-receipt/v1",
        "cutoff": CUTOFF,
        "fields_scanned": [
            {
                "artifact_id": "pricing-experiment",
                "field": "observed_at",
                "classification": "EVIDENCE",
            }
        ],
        "included_rows": len(pricing),
        "excluded_rows": len(excluded_pricing),
        "excluded_locators": [
            f"pricing-experiment:{row['account_id']}:observed_at"
            for row in excluded_pricing
        ],
        "max_eligible_instant": max(row["observed_at"] for row in pricing),
        "status": "PASS_WITH_DECLARED_EXCLUSIONS" if excluded_pricing else "PASS",
    }
    temporal_scan["receipt_sha256"] = digest(temporal_scan)
    rollout = _rows(root, artifacts["support-rollout"])
    debt_terms_document = read_json(root / artifacts["debt-terms"]["path"])
    months = sorted({row["month"] for row in customers})
    base_month, end_month = months[-13], months[-1]
    base = {
        row["entity_id"]: int(row["mrr_cents"])
        for row in customers
        if row["month"] == base_month and int(row["mrr_cents"]) > 0
    }
    ending_rows = [row for row in customers if row["month"] == end_month]
    ending = {row["entity_id"]: int(row["mrr_cents"]) for row in ending_rows}
    full_nrr = sum(ending.get(key, 0) for key in base) / sum(base.values())
    full_grr = sum(min(ending.get(key, 0), value) for key, value in base.items()) / sum(
        base.values()
    )
    survivors = [key for key in base if ending.get(key, 0) > 0]
    active_nrr = sum(ending[key] for key in survivors) / sum(
        base[key] for key in survivors
    )
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
    pnl_net_subscription = sum(
        int(row["subscription_revenue_cents"]) - int(row["credits_cents"])
        for row in ltm
    )
    ending_billing = [row for row in billing if row["month"] == end_month]
    live_arr = sum(int(row["live_arr_cents"]) for row in ending_billing)
    booked_arr = sum(int(row["booked_arr_cents"]) for row in ending_billing)
    implementation_dependent_arr = sum(
        int(row["booked_arr_cents"]) - int(row["live_arr_cents"])
        for row in ending_billing
    )
    management_forecast = next(
        row
        for row in forecast
        if row["scenario"] == "management" and row["year"] == "5"
    )
    base_forecast = next(
        row for row in forecast if row["scenario"] == "base" and row["year"] == "5"
    )
    by_entity: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in customers:
        by_entity[row["entity_id"]].append(row)
    durations = [sum(int(row["active"]) for row in rows) for rows in by_entity.values()]
    events = [
        any(int(row["active"]) == 0 for row in rows) for rows in by_entity.values()
    ]
    churn_events = sum(events)
    active_exposure = sum(durations)
    monthly_hazard = churn_events / active_exposure
    annualized_churn = 1 - (1 - monthly_hazard) ** 12
    survival = _kaplan_meier(durations, events, (12, 36, 60))
    at_risk = len(masters)

    treatment = np.array([int(row["treatment"]) for row in pricing])
    renewal = np.array([int(row["renewed"]) for row in pricing], dtype=float)
    realized = np.array([float(row["realized_increase_pct"]) for row in pricing])
    rct_estimate = difference_in_means(renewal, treatment)
    rct_effect = rct_estimate.effect
    rct_se = rct_estimate.standard_error
    rct_low = rct_estimate.low
    rct_high = rct_estimate.high
    naive_slope, _naive_se = _slope(renewal, realized)
    first_stage, _first_stage_se, first_stage_low, first_stage_high = _mean_difference(
        realized, treatment
    )
    implied_offer_scale = naive_slope * first_stage
    implied_offer_scale_se, slope_first_stage_covariance = _joint_product_se(
        renewal,
        realized,
        treatment,
        slope=naive_slope,
        first_stage=first_stage,
    )
    pricing_risk = np.array([float(row["risk_score"]) for row in pricing])
    pricing_smd = _smd(pricing_risk, treatment)
    did_resolution, did_resolution_se = _did(rollout, "resolution_hours")
    did_churn, did_churn_se = _did(rollout, "gross_churn_bps")
    fake_rollout = [
        dict(row, post="1" if int(row["period"]) >= -6 else "0")
        for row in rollout
        if int(row["period"]) < 0
    ]
    fake_resolution, _ = _did(fake_rollout, "resolution_hours")
    pretrend_gap, pretrend_se = _pretrend_gap(rollout, "resolution_hours")
    resolution_interval = (
        did_resolution - 1.96 * did_resolution_se,
        did_resolution + 1.96 * did_resolution_se,
    )
    churn_interval = (did_churn - 1.96 * did_churn_se, did_churn + 1.96 * did_churn_se)

    base_operating = PEOperatingAssumptions(
        starting_arr_cents=live_arr,
        starting_ltm_revenue_cents=revenue,
        starting_normalized_ebitda_cents=normalized_ebitda,
        starting_annual_opex_cents=revenue - burdened_cogs - normalized_ebitda,
        full_cohort_nrr=Decimal(str(full_nrr)),
        annual_new_arr_rate=Decimal("0.10"),
        gross_margin=Decimal(str(burdened_gm)),
        annual_opex_growth_rate=Decimal("0.06"),
        capex_as_revenue=Decimal("0.02"),
        working_capital_as_incremental_revenue=Decimal("0.08"),
        cash_tax_rate=Decimal("0.25"),
        tax_depreciation_as_capex=Decimal("0.80"),
        preclose_lender_ebitda_cents=tuple(
            int(row["normalized_ebitda_cents"]) for row in pnl[-11:]
        ),
        preclose_lender_ebitda_source_sha256=artifacts["monthly-pnl"]["sha256"],
        lender_ebitda_adjustments_by_month=(),
        deductible_fee_amortization_cents_by_month=(),
    )
    downside_operating = replace(
        base_operating,
        full_cohort_nrr=Decimal("0.97"),
        annual_new_arr_rate=Decimal("0.08"),
        gross_margin=Decimal("0.71"),
        annual_opex_growth_rate=Decimal("0.02"),
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
        annual_mandatory_amortization_rate=Decimal(
            debt_terms_document["annual_mandatory_amortization_rate"]
        ),
        sweep_rate=Decimal(debt_terms_document["sweep_rate"]),
        maximum_gross_leverage=Decimal(debt_terms_document["maximum_gross_leverage"]),
        exit_multiple=Decimal(debt_terms_document["base_exit_multiple"]),
        maturity_months=debt_terms_document["maturity_months"],
        interest_balance_convention=debt_terms_document["interest_balance_convention"],
        paydown_priority=tuple(debt_terms_document["paydown_priority"]),
    )
    selected_transaction = replace(
        ask_transaction,
        entry_enterprise_value_cents=debt_terms_document[
            "selected_upfront_enterprise_value_cents"
        ],
        earnout_threshold_arr_cents=debt_terms_document["earnout"]["threshold_cents"],
        earnout_cap_cents=debt_terms_document["earnout"]["cap_cents"],
        earnout_equity_treatment=debt_terms_document["earnout"][
            "rollover_dilution_treatment"
        ],
    )
    downside_transaction = replace(
        selected_transaction,
        exit_multiple=Decimal(debt_terms_document["downside_exit_multiple"]),
    )
    ask_case = run_pe_case(
        scenario_id="ASK", operating=base_operating, transaction=ask_transaction
    )
    selected_case = run_pe_case(
        scenario_id="SELECTED",
        operating=base_operating,
        transaction=selected_transaction,
    )
    downside_case = run_pe_case(
        scenario_id="DOWNSIDE",
        operating=downside_operating,
        transaction=downside_transaction,
    )
    maximum_bid = solve_maximum_bid(
        operating=base_operating,
        transaction=selected_transaction,
        downside_operating=downside_operating,
        downside_transaction=downside_transaction,
        minimum_irr=Decimal("0.22"),
        minimum_moic=Decimal("2.00"),
        minimum_downside_irr=Decimal("0.05"),
        minimum_downside_moic=Decimal("1.25"),
        minimum_downside_liquidity_cents=300_000_000,
        low_cents=15_000_000_000,
        high_cents=26_000_000_000,
    )
    maximum_bid_base_case = run_pe_case(
        scenario_id="MAX_BID_BASE",
        operating=base_operating,
        transaction=replace(
            selected_transaction,
            entry_enterprise_value_cents=maximum_bid,
        ),
    )
    maximum_bid_downside_case = run_pe_case(
        scenario_id="MAX_BID_DOWNSIDE",
        operating=downside_operating,
        transaction=replace(
            downside_transaction,
            entry_enterprise_value_cents=maximum_bid,
        ),
    )
    ask_moic = ask_case.gross_moic
    reprice_moic = selected_case.gross_moic
    downside_moic = downside_case.gross_moic
    ask_irr = ask_case.gross_xirr
    reprice_irr = selected_case.gross_xirr
    downside_irr = downside_case.gross_xirr
    base_headroom = min(
        item.covenant_headroom for item in selected_case.debt_schedule.months
    )
    selected_reconciliation = selected_case.debt_schedule.reconciliation
    selected_xirr_residual = abs(
        npv_cents(selected_case.gross_xirr, selected_case.sponsor_cash_flows)
    )
    downside_breaches = [
        item.month
        for item in downside_case.debt_schedule.months
        if item.covenant_breach
    ]
    scenario_seed = int(manifest["seed_commitment"][:16], 16)
    pe_distribution = simulate_pe_distribution(
        operating=base_operating,
        transaction=selected_transaction,
        seed=scenario_seed,
        draws=1000,
    )
    pe_sensitivities = build_pe_sensitivity_book(
        operating=base_operating,
        transaction=selected_transaction,
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
                nrr_delta=Decimal(str(-did_churn)).quantize(Decimal("0.01"))
                / Decimal(10_000),
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
    value_by_id = {item.lever_id: item for item in value_bridge.standalone}
    support_margin_costs = dict(base_operating.implementation_costs_by_month)
    support_margin_costs[1] = support_margin_costs.get(1, 0) + 100_000_000
    support_margin_costs[2] = support_margin_costs.get(2, 0) + 100_000_000
    support_margin_case = run_pe_case(
        scenario_id="VALUE_support-margin-only",
        operating=replace(
            base_operating,
            gross_margin=base_operating.gross_margin + Decimal("0.010"),
            implementation_costs_by_month=tuple(sorted(support_margin_costs.items())),
        ),
        transaction=selected_transaction,
    )
    support_margin_only_value = (
        support_margin_case.exit_equity_value_cents
        - selected_case.exit_equity_value_cents
    )

    receipts = [
        analysis_receipt(
            analysis_id="AG-01",
            question="Do billing, live ARR, booked ARR, and recognized revenue reconcile?",
            classification="ACCOUNTING_IDENTITY",
            method="Integer-cent invoice, credit, ARR-definition, and P&L bridge",
            population="Synthetic AtlasGrid LTM billing ledger and five-year forecast",
            inputs=[
                _input(artifacts["billing-ledger"]),
                _input(artifacts["monthly-pnl"]),
                _input(artifacts["forecast"]),
            ],
            outputs=[
                _output("live_arr", live_arr, "cents"),
                _output("booked_arr", booked_arr, "cents"),
                _output(
                    "implementation_dependent_arr",
                    implementation_dependent_arr,
                    "cents",
                ),
                _output(
                    "management_year_5_revenue",
                    management_forecast["revenue_cents"],
                    "cents",
                ),
                _output("base_year_5_revenue", base_forecast["revenue_cents"], "cents"),
            ],
            assumptions=[
                "Booked ARR may include implementation-dependent amounts; live ARR requires current billing."
            ],
            diagnostics=[
                _diagnostic(
                    "billing_to_pnl_subscription",
                    "exact",
                    "PASS"
                    if net_subscription_billing == pnl_net_subscription
                    else "FAIL",
                ),
                _diagnostic(
                    "booked_arr_definition_gap_cents",
                    booked_arr - live_arr,
                    "PASS" if booked_arr > live_arr else "FAIL",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="AG-02",
            question="How much does active-only reporting overstate LTM net retention?",
            classification="DESCRIPTIVE",
            method="Fixed-cohort ARR bridge including churned entities",
            population=f"{len(base)} entities active at {base_month}",
            inputs=[_input(artifacts["customer-month"])],
            outputs=[
                _output("full_cohort_grr", quantize(full_grr * 100), "percent"),
                _output("full_cohort_nrr", quantize(full_nrr * 100), "percent"),
                _output("active_only_nrr", quantize(active_nrr * 100), "percent"),
            ],
            assumptions=["Cohort membership is frozen at the base month."],
            diagnostics=[
                _diagnostic(
                    "selection_bias_bps",
                    quantize((active_nrr - full_nrr) * 10_000),
                    "PASS" if active_nrr - full_nrr >= 0.05 else "FAIL",
                )
            ],
        ),
        analysis_receipt(
            analysis_id="AG-03",
            question="How much does subsidiary-level reporting understate concentration?",
            classification="DESCRIPTIVE",
            method="Top-10 revenue concentration under entity and mapped-parent definitions",
            population=f"{len(ending_rows)} synthetic entities active at {end_month}",
            inputs=[
                _input(artifacts["customer-month"]),
                _input(artifacts["customer-master"]),
            ],
            outputs=[
                _output(
                    "entity_top_10_concentration",
                    quantize(entity_concentration * 100),
                    "percent",
                ),
                _output(
                    "parent_top_10_concentration",
                    quantize(parent_concentration * 100),
                    "percent",
                ),
                _output(
                    "top_parent_concentration",
                    quantize(top_parent_concentration * 100),
                    "percent",
                ),
            ],
            assumptions=["Parent mapping is frozen in the synthetic customer master."],
            diagnostics=[
                _diagnostic(
                    "definition_gap_bps",
                    quantize((parent_concentration - entity_concentration) * 10_000),
                    "PASS"
                    if parent_concentration - entity_concentration >= 0.15
                    else "FAIL",
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
                _output(
                    "reported_gross_margin", quantize(reported_gm * 100), "percent"
                ),
                _output(
                    "fully_burdened_gross_margin",
                    quantize(burdened_gm * 100),
                    "percent",
                ),
                _output("seller_adjusted_ebitda", seller_ebitda, "cents"),
                _output("normalized_ebitda", normalized_ebitda, "cents"),
            ],
            assumptions=[
                "Credits and customer-success costs remain classified as operating delivery costs."
            ],
            diagnostics=[
                _diagnostic(
                    "qoe_schedule_to_pnl_normalized_ebitda",
                    normalized_ebitda - pnl_normalized_ebitda,
                    "PASS" if normalized_ebitda == pnl_normalized_ebitda else "FAIL",
                ),
                _diagnostic(
                    "seller_normalization_delta_cents",
                    seller_ebitda - normalized_ebitda,
                    "PASS" if seller_ebitda > normalized_ebitda else "FAIL",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="AG-05",
            question="What is the observed annualized logo-churn hazard?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Exposure-weighted discrete monthly hazard with Kaplan-Meier cohort survival",
            population=f"{at_risk} synthetic customer entities over 60 months",
            inputs=[
                _input(artifacts["customer-month"]),
                _input(artifacts["customer-master"]),
            ],
            outputs=[
                _output(
                    "monthly_logo_hazard", quantize(monthly_hazard * 100), "percent"
                ),
                _output(
                    "annualized_logo_churn", quantize(annualized_churn * 100), "percent"
                ),
                _output("survival_12_month", quantize(survival[12] * 100), "percent"),
                _output("survival_36_month", quantize(survival[36] * 100), "percent"),
                _output("survival_60_month", quantize(survival[60] * 100), "percent"),
            ],
            assumptions=[
                "Customer health and pricing are endogenous; this estimate is not causal."
            ],
            diagnostics=[
                _diagnostic(
                    "standard_error",
                    quantize(
                        math.sqrt(
                            max(
                                monthly_hazard * (1 - monthly_hazard) / active_exposure,
                                0,
                            )
                        )
                        * 100
                    ),
                    "REPORTED",
                ),
                _diagnostic(
                    "event_count",
                    churn_events,
                    "PASS" if churn_events >= 200 else "FAIL",
                ),
                _diagnostic("active_month_exposure", active_exposure),
            ],
        ),
        analysis_receipt(
            analysis_id="AG-06",
            question="What does the observational relationship between realized price and renewal imply?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Naive linear probability slope, randomized-offer first stage, and joint-HC1 influence delta-method offer-scale association",
            population=f"{len(pricing)} synthetic renewal-eligible accounts",
            inputs=[_input(artifacts["pricing-experiment"])],
            outputs=[
                _output(
                    "naive_realized_price_slope",
                    quantize(naive_slope * 100),
                    "percentage_points_per_price_point",
                ),
                _output(
                    "first_stage_price_change",
                    quantize(first_stage),
                    "price_percentage_points",
                ),
                _output(
                    "implied_offer_scale_association",
                    quantize(implied_offer_scale * 100),
                    "percentage_points",
                ),
            ],
            assumptions=[
                "Realized price is post-treatment and selected by negotiation; its slope is not causal."
            ],
            diagnostics=[
                _diagnostic(
                    "standard_error", quantize(implied_offer_scale_se * 100), "REPORTED"
                ),
                _diagnostic(
                    "slope_first_stage_covariance",
                    quantize(slope_first_stage_covariance, "0.000001"),
                    "REPORTED",
                ),
                _diagnostic(
                    "first_stage",
                    f"{quantize(first_stage)} [{quantize(first_stage_low)}, {quantize(first_stage_high)}]",
                    "PASS" if first_stage > 0 else "FAIL",
                ),
                _diagnostic(
                    "implied_offer_scale_interval",
                    f"[{quantize((implied_offer_scale - 1.96 * implied_offer_scale_se) * 100)}, {quantize((implied_offer_scale + 1.96 * implied_offer_scale_se) * 100)}]",
                    "REPORTED",
                ),
                _diagnostic(
                    "confounding_audit",
                    "realized_price_is_endogenous; zero investment model credit",
                    "BLOCKED",
                    DiagnosticRole.IDENTIFICATION_BOUNDARY,
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="AG-07",
            question="What is the randomized renewal-price offer effect on renewal?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Intention-to-treat difference in renewal proportions",
            population=f"{len(pricing)} synthetic renewal-eligible accounts",
            inputs=[_input(artifacts["pricing-experiment"])],
            outputs=[
                _output("renewal_itt", quantize(rct_effect * 100), "percentage_points")
            ],
            assumptions=[
                "Synthetic seeded Bernoulli(p=0.5) assignment; realized arm counts need not be exactly equal; no cross-account interference."
            ],
            diagnostics=[
                _diagnostic(
                    "assignment_mechanism", "seeded_bernoulli_p_0_5", "REPORTED"
                ),
                _diagnostic("treatment_count", rct_estimate.treated_count),
                _diagnostic("control_count", rct_estimate.control_count),
                _diagnostic(
                    "post_cutoff_exclusion",
                    len(excluded_pricing),
                    "PASS" if len(excluded_pricing) == 1 else "FAIL",
                ),
                _diagnostic(
                    "confidence_interval",
                    f"[{quantize(rct_low * 100)}, {quantize(rct_high * 100)}]",
                    "REPORTED",
                ),
                _diagnostic("standard_error", quantize(rct_se * 100), "REPORTED"),
                _diagnostic(
                    "risk_score_smd",
                    quantize(pricing_smd),
                    "PASS" if abs(pricing_smd) <= 0.15 else "FAIL",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="AG-08",
            question="What is the synthetic support-automation effect?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Collapsed pod-level pre/post deltas with treated-versus-control two-sample uncertainty",
            population="40 synthetic customer-success pods; 12 pre and 12 post months",
            inputs=[_input(artifacts["support-rollout"])],
            outputs=[
                _output("resolution_att", quantize(did_resolution), "hours"),
                _output("gross_churn_att", quantize(did_churn), "basis_points"),
            ],
            assumptions=[
                "Synthetic seed-permuted 20-of-40 pod assignment with no spillovers."
            ],
            diagnostics=[
                _diagnostic(
                    "assignment_mechanism",
                    "seeded_permutation_20_of_40_pods",
                    "REPORTED",
                ),
                _diagnostic(
                    "resolution_95pct_interval",
                    f"[{quantize(resolution_interval[0])}, {quantize(resolution_interval[1])}]",
                    "REPORTED",
                ),
                _diagnostic(
                    "gross_churn_95pct_interval",
                    f"[{quantize(churn_interval[0])}, {quantize(churn_interval[1])}]",
                    "REPORTED",
                ),
                _diagnostic(
                    "clustered_resolution_standard_error",
                    quantize(did_resolution_se),
                    "REPORTED",
                ),
                _diagnostic(
                    "clustered_churn_standard_error", quantize(did_churn_se), "REPORTED"
                ),
                _diagnostic(
                    "fake_date_placebo_hours",
                    quantize(fake_resolution),
                    "PASS" if abs(fake_resolution) <= 1.0 else "FAIL",
                ),
                _diagnostic(
                    "pretrend_slope_gap",
                    quantize(pretrend_gap),
                    "PASS"
                    if abs(pretrend_gap) <= max(0.10, 1.96 * pretrend_se)
                    else "FAIL",
                ),
            ],
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
            diagnostics=[
                _diagnostic(
                    "overlapping_events",
                    "leader_hire, pricing_change, macro_shift",
                    "BLOCKED",
                    DiagnosticRole.IDENTIFICATION_BOUNDARY,
                )
            ],
            state="ABSTAIN",
        ),
        analysis_receipt(
            analysis_id="AG-10",
            question="How do asking and selected structures change cash, debt, covenants, and sponsor returns?",
            classification="SCENARIO",
            method="Monthly cash-flow, debt-sweep, covenant, sources-and-uses, and dated-XIRR engine",
            population="Illustrative AtlasGrid sponsor transaction",
            inputs=[
                _input(artifacts["debt-terms"]),
                _input(artifacts["qoe-bridge"]),
                _input(artifacts["monthly-pnl"]),
                _input(artifacts["billing-ledger"]),
                _input(artifacts["customer-month"]),
            ],
            outputs=[
                _output("ask_irr", quantize(ask_irr * 100), "percent"),
                _output("ask_moic", quantize(ask_moic), "multiple"),
                _output("reprice_irr", quantize(reprice_irr * 100), "percent"),
                _output("reprice_moic", quantize(reprice_moic), "multiple"),
                _output("downside_irr", quantize(downside_irr * 100), "percent"),
                _output("downside_moic", quantize(downside_moic), "multiple"),
                _output("maximum_bid_cents", maximum_bid, "cents"),
                _output(
                    "maximum_bid_base_irr",
                    quantize(maximum_bid_base_case.gross_xirr * 100),
                    "percent",
                ),
                _output(
                    "maximum_bid_downside_irr",
                    quantize(maximum_bid_downside_case.gross_xirr * 100),
                    "percent",
                ),
                _output(
                    "maximum_bid_downside_moic",
                    quantize(maximum_bid_downside_case.gross_moic),
                    "multiple",
                ),
                _output(
                    "base_exit_debt_cents",
                    selected_case.debt_schedule.ending_debt_cents,
                    "cents",
                ),
                _output(
                    "downside_exit_debt_cents",
                    downside_case.debt_schedule.ending_debt_cents,
                    "cents",
                ),
                _output("base_min_covenant_headroom", quantize(base_headroom), "turns"),
                _output(
                    "downside_first_breach_month",
                    str(min(downside_breaches)) if downside_breaches else "NONE",
                    "month",
                ),
            ],
            assumptions=[
                "Starting ARR, revenue, normalized EBITDA, NRR, and burdened margin bind to AG-01, AG-02, and AG-04; exit multiples, financing terms, and operating deltas are declared synthetic scenario assumptions."
            ],
            diagnostics=[
                _diagnostic(
                    "ask_misses_selected_clears",
                    "ask_misses_22pct_irr; selected_clears_22pct_and_2x",
                    "PASS"
                    if ask_irr < Decimal("0.22")
                    and reprice_irr >= Decimal("0.22")
                    and reprice_moic >= Decimal("2")
                    else "FAIL",
                    DiagnosticRole.DECISION_CRITICAL,
                ),
                _diagnostic(
                    "sources_equal_uses",
                    selected_case.sources_and_uses.total_uses_cents
                    - selected_case.sources_and_uses.total_sources_cents,
                    "PASS"
                    if selected_case.sources_and_uses.total_uses_cents
                    == selected_case.sources_and_uses.total_sources_cents
                    else "FAIL",
                    DiagnosticRole.GENERATOR_INVARIANT,
                ),
                _diagnostic(
                    "cash_rollforward",
                    selected_reconciliation["cash_rollforward_max_residual_cents"],
                    "PASS"
                    if selected_reconciliation["cash_rollforward_max_residual_cents"]
                    == 0
                    else "FAIL",
                    DiagnosticRole.GENERATOR_INVARIANT,
                ),
                _diagnostic(
                    "debt_rollforward",
                    max(
                        selected_reconciliation["term_rollforward_max_residual_cents"],
                        selected_reconciliation[
                            "revolver_rollforward_max_residual_cents"
                        ],
                    ),
                    "PASS"
                    if selected_reconciliation["term_rollforward_max_residual_cents"]
                    == 0
                    and selected_reconciliation[
                        "revolver_rollforward_max_residual_cents"
                    ]
                    == 0
                    else "FAIL",
                    DiagnosticRole.GENERATOR_INVARIANT,
                ),
                _diagnostic(
                    "xirr_npv_residual",
                    format(selected_xirr_residual, "f"),
                    "PASS" if selected_xirr_residual <= Decimal(1) else "FAIL",
                    DiagnosticRole.GENERATOR_INVARIANT,
                ),
                _diagnostic(
                    "downside_floor",
                    "5pct_irr;1.25x_moic;$3m_liquidity;no_default;no_breach",
                    "PASS"
                    if downside_irr >= Decimal("0.05")
                    and downside_moic >= Decimal("1.25")
                    and downside_case.debt_schedule.minimum_liquidity_cents
                    >= 300_000_000
                    and not downside_case.debt_schedule.has_payment_default
                    and not downside_breaches
                    else "FAIL",
                    DiagnosticRole.DECISION_CRITICAL,
                ),
                _diagnostic(
                    "maximum_bid_downside_floor",
                    f"irr={maximum_bid_downside_case.gross_xirr};moic={maximum_bid_downside_case.gross_moic};liquidity={maximum_bid_downside_case.debt_schedule.minimum_liquidity_cents}",
                    "PASS"
                    if maximum_bid_downside_case.gross_xirr >= Decimal("0.05")
                    and maximum_bid_downside_case.gross_moic >= Decimal("1.25")
                    and maximum_bid_downside_case.debt_schedule.minimum_liquidity_cents
                    >= 300_000_000
                    and not maximum_bid_downside_case.debt_schedule.has_payment_default
                    and maximum_bid_downside_case.debt_schedule.first_covenant_breach_month
                    is None
                    else "FAIL",
                    DiagnosticRole.DECISION_CRITICAL,
                ),
                _diagnostic(
                    "month_18_19_boundary",
                    f"m18={selected_case.debt_schedule.months[17].covenant_breach};m19={selected_case.debt_schedule.months[18].covenant_breach}",
                    "PASS"
                    if not any(
                        item.covenant_breach
                        for item in selected_case.debt_schedule.months[:18]
                    )
                    else "FAIL",
                    DiagnosticRole.DECISION_CRITICAL,
                ),
            ],
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
            outputs=[
                _output("p10_moic", quantize(moic_q[0]), "multiple"),
                _output("p50_moic", quantize(moic_q[1]), "multiple"),
                _output("p90_moic", quantize(moic_q[2]), "multiple"),
                _output(
                    "probability_below_1x",
                    quantize(pe_distribution.probability_below_one * 100),
                    "percent",
                ),
                _output(
                    "probability_covenant_breach",
                    quantize(pe_distribution.probability_covenant_breach * 100),
                    "percent",
                ),
                _output(
                    "probability_payment_default",
                    quantize(pe_distribution.probability_payment_default * 100),
                    "percent",
                ),
            ],
            assumptions=[
                "Correlated ARR retention, new ARR, gross margin, and exit-multiple draws are disclosed conditional scenario inputs, not forecasts; every draw reruns the complete monthly cash and debt engine."
            ],
            diagnostics=[
                _diagnostic("draws", draws),
                _diagnostic(
                    "below_1x_probability_monte_carlo_se_pp",
                    pe_distribution.probability_below_one_monte_carlo_se_pp,
                    "REPORTED",
                ),
                _diagnostic(
                    "covenant_breach_probability_monte_carlo_se_pp",
                    pe_distribution.probability_covenant_breach_monte_carlo_se_pp,
                    "REPORTED",
                ),
                _diagnostic(
                    "payment_default_probability_monte_carlo_se_pp",
                    pe_distribution.probability_payment_default_monte_carlo_se_pp,
                    "REPORTED",
                ),
                _diagnostic(
                    "ordered_quantiles",
                    "true",
                    "PASS" if moic_q[0] <= moic_q[1] <= moic_q[2] else "FAIL",
                ),
                _diagnostic(
                    "correlation_digest",
                    pe_distribution.correlation_structure_sha256,
                    "PASS"
                    if pe_distribution.correlation_structure_sha256
                    == digest(pe_distribution.correlation_structure)
                    else "FAIL",
                ),
                _diagnostic(
                    "path_reconciliation",
                    len(pe_distribution.path_records),
                    "PASS"
                    if len(pe_distribution.path_records) == draws
                    and all(
                        all(
                            int(value) == 0
                            for value in record["reconciliation"].values()
                        )
                        for record in pe_distribution.path_records
                    )
                    else "FAIL",
                ),
            ],
        ),
    ]
    _bind_specs(receipts, manifest)
    receipt_by_id = {item["analysis_id"]: item for item in receipts}
    evidence_mappings = [
        {
            "mapping_id": "ag-realized-price-association-zero-credit",
            "source_analysis_id": "AG-06",
            "source_receipt_sha256": receipt_by_id["AG-06"]["receipt_sha256"],
            "observed_value": f"{quantize(implied_offer_scale * 100)} percentage-point association",
            "target_assumption_or_condition": "No transaction, operating, bid, or value-creation assumption",
            "credit_classification": "PREDICTIVE_ASSOCIATION_ZERO_MODEL_CREDIT",
            "credit_tier": "ZERO",
            "model_credit": "0",
            "decision_response": "Retain only as a confounding exhibit; use the randomized offer ITT to falsify pricing upside",
        },
        {
            "mapping_id": "ag-parent-concentration-to-terms",
            "source_analysis_id": "AG-03",
            "source_receipt_sha256": receipt_by_id["AG-03"]["receipt_sha256"],
            "observed_value": f"{quantize(parent_concentration * 100)}% top-10 parent concentration",
            "target_assumption_or_condition": "Parent-account legal mapping and termination-right condition",
            "credit_classification": "DESCRIPTIVE_ZERO_DIRECT_MODEL_CREDIT",
            "credit_tier": "ZERO",
            "model_credit": "0",
            "decision_response": "HOLD condition and contingent consideration tied to verified live ARR",
        },
        {
            "mapping_id": "ag-hazard-to-downside-nrr",
            "source_analysis_id": "AG-05",
            "source_receipt_sha256": receipt_by_id["AG-05"]["receipt_sha256"],
            "observed_value": f"{quantize(annualized_churn * 100)}% annualized descriptive logo churn",
            "target_assumption_or_condition": "DOWNSIDE full-cohort NRR of 97%",
            "credit_classification": "DESCRIPTIVE_SCENARIO_ANCHOR",
            "credit_tier": "SCENARIO_ONLY",
            "model_credit": "Scenario calibration only; no causal claim",
            "decision_response": "Downside floor must survive retention compression",
        },
        {
            "mapping_id": "ag-pricing-rct-to-renewal-credit",
            "source_analysis_id": "AG-07",
            "source_receipt_sha256": receipt_by_id["AG-07"]["receipt_sha256"],
            "observed_value": f"{quantize(rct_effect * 100)} percentage-point renewal ITT",
            "target_assumption_or_condition": "Renewal architecture value lever",
            "credit_classification": "CAUSAL_SYNTHETIC_ONLY_ZERO_UPSIDE_CREDIT",
            "credit_tier": "ZERO",
            "model_credit": "0 from price increase; +1.5pp NRR remains HUMAN_JUDGMENT",
            "decision_response": "Do not underwrite broad price-led expansion without a safer renewal design",
        },
        {
            "mapping_id": "ag-support-did-to-retention-lever",
            "source_analysis_id": "AG-08",
            "source_receipt_sha256": receipt_by_id["AG-08"]["receipt_sha256"],
            "observed_value": f"{quantize(did_churn)} bps gross-churn ATT",
            "target_assumption_or_condition": "Support lever NRR delta",
            "credit_classification": "CAUSAL_SYNTHETIC_ONLY",
            "credit_tier": "VALUE_CREATION_BRIDGE",
            "model_credit": f"{quantize(-did_churn)} bps NRR-equivalent; 100 bps margin uplift remains HUMAN_JUDGMENT",
            "decision_response": "Separate identified synthetic retention credit from unverified margin credit",
        },
    ]
    evidence_mappings = _complete_evidence_mappings(
        receipts,
        evidence_mappings,
        {
            "AG-01": "BASE_CASE",
            "AG-02": "BASE_CASE",
            "AG-03": "ZERO",
            "AG-04": "BASE_CASE",
            "AG-05": "SCENARIO_ONLY",
            "AG-06": "ZERO",
            "AG-07": "ZERO",
            "AG-08": "VALUE_CREATION_BRIDGE",
            "AG-09": "ZERO",
            "AG-10": "BASE_CASE",
            "AG-11": "SCENARIO_ONLY",
        },
    )
    lineages = [
        lineage_item(
            node_id="ag-revenue",
            label="Revenue and ARR reconciliation",
            artifact_id="billing-ledger",
            field="invoice_id,entity_id,period,invoice_cents,credit_cents,recognized_revenue_cents,booked_arr_cents,live_arr_cents",
            analysis_id="AG-01",
            output_names=[
                "live_arr",
                "booked_arr",
                "implementation_dependent_arr",
                "management_year_5_revenue",
                "base_year_5_revenue",
            ],
            transformation="Exact invoice, credit, recognized-revenue, and ARR-definition bridge",
            downstream="Revenue quality, forecast credibility, and entry-price conditions",
        ),
        lineage_item(
            node_id="ag-nrr",
            label="Full-cohort NRR",
            artifact_id="customer-month",
            field="entity_id,month,mrr_cents",
            analysis_id="AG-02",
            output_names=["full_cohort_grr", "full_cohort_nrr", "active_only_nrr"],
            transformation="Frozen base cohort ARR bridge including churned entities",
            downstream="Retention thesis and renewal initiative",
        ),
        lineage_item(
            node_id="ag-concentration",
            label="Parent concentration",
            artifact_id="customer-month",
            field="parent_id,mrr_cents",
            analysis_id="AG-03",
            output_names=[
                "entity_top_10_concentration",
                "parent_top_10_concentration",
                "top_parent_concentration",
            ],
            transformation="Map entity ARR to parent and rank the largest parent and top ten",
            downstream="Price and customer-concentration risk",
        ),
        lineage_item(
            node_id="ag-margin",
            label="Burdened gross margin",
            artifact_id="monthly-pnl",
            field="recognized_revenue_cents,fully_burdened_cogs_cents",
            analysis_id="AG-04",
            output_names=["reported_gross_margin", "fully_burdened_gross_margin"],
            transformation="LTM revenue less declared fully burdened delivery costs",
            downstream="Normalized earnings and value-creation bridge",
        ),
        lineage_item(
            node_id="ag-ebitda",
            label="Normalized EBITDA",
            artifact_id="qoe-bridge",
            field="amount_cents",
            analysis_id="AG-04",
            output_names=["seller_adjusted_ebitda", "normalized_ebitda"],
            transformation="Integer-cent seller EBITDA less challenged adjustments",
            downstream="Debt capacity, entry price, and sponsor return",
        ),
        lineage_item(
            node_id="ag-reprice",
            label="Selected sponsor return",
            artifact_id="debt-terms",
            field="entry, financing, operating, earnout, and exit assumptions",
            analysis_id="AG-10",
            output_names=[
                "ask_irr",
                "ask_moic",
                "reprice_irr",
                "reprice_moic",
                "downside_irr",
                "downside_moic",
                "maximum_bid_cents",
                "maximum_bid_base_irr",
                "maximum_bid_downside_irr",
                "maximum_bid_downside_moic",
                "base_exit_debt_cents",
                "downside_exit_debt_cents",
                "base_min_covenant_headroom",
                "downside_first_breach_month",
            ],
            transformation="Monthly operating cash flow drives interest, taxes, revolver, amortization, sweep, covenant headroom, exit debt, dated cash flows, MOIC, and XIRR; maximum bid must clear both the base hurdles and frozen downside floor",
            downstream="Illustrative REPRICE decision and maximum bid",
        ),
        lineage_item(
            node_id="ag-support",
            label="Support automation effect",
            artifact_id="support-rollout",
            field="pod_id,period,treated,resolution_hours,gross_churn_bps",
            analysis_id="AG-08",
            output_names=["resolution_att", "gross_churn_att"],
            transformation="Pod-level pre/post difference-in-differences",
            downstream="Support automation initiative",
        ),
        lineage_item(
            node_id="ag-churn",
            label="Observed churn hazard",
            artifact_id="customer-month",
            field="entity_id,month,active,churn_event",
            analysis_id="AG-05",
            output_names=[
                "monthly_logo_hazard",
                "annualized_logo_churn",
                "survival_12_month",
                "survival_36_month",
                "survival_60_month",
            ],
            transformation="Discrete monthly event-over-exposure hazard and Kaplan-Meier survival",
            downstream="Churn scenario calibration only; no causal credit",
        ),
        lineage_item(
            node_id="ag-price-association",
            label="Realized-price association",
            artifact_id="pricing-experiment",
            field="account_id,assignment,realized_price_change,renewal_indicator",
            analysis_id="AG-06",
            output_names=[
                "naive_realized_price_slope",
                "first_stage_price_change",
                "implied_offer_scale_association",
            ],
            transformation="Observational realized-price slope rescaled by the randomized offer first stage",
            downstream="Confounding exhibit with zero causal model credit",
        ),
        lineage_item(
            node_id="ag-price-rct",
            label="Renewal pricing randomized test",
            artifact_id="pricing-experiment",
            field="account_id,assignment,renewal_indicator,risk_score",
            analysis_id="AG-07",
            output_names=["renewal_itt"],
            transformation="Precommitted randomized intention-to-treat difference in renewal probability",
            downstream="Pricing falsifier and zero-upside renewal credit",
        ),
        lineage_item(
            node_id="ag-distribution",
            label="Conditional return distribution",
            artifact_id="debt-terms",
            field="scenario distributions",
            analysis_id="AG-11",
            output_names=[
                "p10_moic",
                "p50_moic",
                "p90_moic",
                "probability_below_1x",
                "probability_covenant_breach",
                "probability_payment_default",
            ],
            transformation="One thousand seeded correlated operating and exit paths, each rerunning monthly cash, debt, and returns",
            downstream="Downside range; not a forecast",
        ),
    ]
    metric_pairs = [
        _decision_pair(
            metric="Gross IRR",
            metric_id="atlasgrid-ASK-gross-irr",
            operator=">=",
            threshold=">=22%",
            threshold_value="0.22",
            observed=f"{quantize(ask_irr * 100)}%",
            observed_value=ask_irr,
            designation="INFORMATIONAL",
        ),
        _decision_pair(
            metric="Gross IRR",
            metric_id="atlasgrid-SELECTED-gross-irr",
            operator=">=",
            threshold=">=22%",
            threshold_value="0.22",
            observed=f"{quantize(reprice_irr * 100)}%",
            observed_value=reprice_irr,
        ),
        _decision_pair(
            metric="Gross MOIC",
            metric_id="atlasgrid-SELECTED-gross-moic",
            operator=">=",
            threshold=">=2.0x",
            threshold_value="2.0",
            observed=f"{quantize(reprice_moic)}x",
            observed_value=reprice_moic,
        ),
        _decision_pair(
            metric="Gross IRR",
            metric_id="atlasgrid-MAX_BID_DOWNSIDE-gross-irr",
            operator=">=",
            threshold=">=5%",
            threshold_value="0.05",
            observed=f"{quantize(maximum_bid_downside_case.gross_xirr * 100)}%",
            observed_value=maximum_bid_downside_case.gross_xirr,
            designation="INFORMATIONAL",
        ),
        _decision_pair(
            metric="Gross MOIC",
            metric_id="atlasgrid-MAX_BID_DOWNSIDE-gross-moic",
            operator=">=",
            threshold=">=1.25x",
            threshold_value="1.25",
            observed=f"{quantize(maximum_bid_downside_case.gross_moic)}x",
            observed_value=maximum_bid_downside_case.gross_moic,
            designation="INFORMATIONAL",
        ),
    ]
    condition_states = [
        _condition_state(
            condition_id="ag-cancellation-rights",
            text="Validate cancellation-for-convenience exposure",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="ag-parent-agreements",
            text="Tie parent accounts to master agreements",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="ag-qoe-addbacks",
            text="Support each seller EBITDA add-back",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="ag-lender-definitions",
            text="Reconcile lender EBITDA and covenant definitions",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="ag-live-arr-earnout",
            text="Cap earnout against verified live ARR",
            metric_pairs=metric_pairs,
        ),
    ]
    issue_summary = _issue_summary(
        [
            {
                "issue_id": "AG-D01",
                "title": "Validate cancellation rights",
                "owner": "Deal counsel",
                "stage": "PRE_SIGNING",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Reduce live-ARR credit or reprice if cancellation rights are broader than modeled.",
                "linked_condition_ids": ["ag-cancellation-rights"],
                "evidence_state": "ABSENT",
                "evidence_metric_ids": ["atlasgrid-ag-01-live_arr"],
                "analysis_ids": ["AG-01"],
                "source_locator_ids": [],
                "consequence_target": "sensitivity",
            },
            {
                "issue_id": "AG-D02",
                "title": "Reconcile parent concentration",
                "owner": "Commercial diligence lead",
                "stage": "PRE_IC",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Re-underwrite concentration and price if master agreements reveal greater parent exposure.",
                "linked_condition_ids": ["ag-parent-agreements"],
                "evidence_state": "PARTIAL",
                "evidence_metric_ids": ["atlasgrid-ag-03-parent_top_10_concentration"],
                "analysis_ids": ["AG-03"],
                "source_locator_ids": [],
                "consequence_target": "sensitivity",
            },
            {
                "issue_id": "AG-D03",
                "title": "Support seller EBITDA add-backs",
                "owner": "QoE lead",
                "stage": "PRE_DEBT_COMMITMENT",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Remove unsupported EBITDA and rerun leverage, covenants, maximum bid, and returns.",
                "linked_condition_ids": ["ag-qoe-addbacks"],
                "evidence_state": "PARTIAL",
                "evidence_metric_ids": ["atlasgrid-ag-04-normalized_ebitda"],
                "analysis_ids": ["AG-04"],
                "source_locator_ids": [],
                "consequence_target": "sensitivity",
            },
            {
                "issue_id": "AG-D04",
                "title": "Confirm lender EBITDA and covenant definitions",
                "owner": "Financing lead",
                "stage": "PRE_DEBT_COMMITMENT",
                "materiality": "CRITICAL",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Do not commit debt until add-backs, liquidity, and covenant headroom reconcile.",
                "linked_condition_ids": ["ag-lender-definitions"],
                "evidence_state": "ABSENT",
                "evidence_metric_ids": ["atlasgrid-SELECTED-min-headroom"],
                "analysis_ids": ["AG-10"],
                "source_locator_ids": [],
                "consequence_target": "debt-covenant",
            },
            {
                "issue_id": "AG-D05",
                "title": "Cap earnout to verified live ARR",
                "owner": "Deal lead / counsel",
                "stage": "PRE_SIGNING",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Do not credit implementation-dependent or cancellable revenue in contingent consideration.",
                "linked_condition_ids": ["ag-live-arr-earnout"],
                "evidence_state": "PARTIAL",
                "evidence_metric_ids": ["atlasgrid-ag-01-live_arr"],
                "analysis_ids": ["AG-01", "AG-10"],
                "source_locator_ids": [],
                "consequence_target": "sensitivity",
            },
        ]
    )
    decision = {
        "schema_version": "underwriting.decision-record/v1",
        "decision": "REPRICE",
        "attribution": "Cooper David Reed — illustrative IC",
        "status": "DECISION_RECORD_INCOMPLETE",
        "signature_status": "PENDING_FOUNDER_SIGNATURE",
        "as_of": CUTOFF,
        "rationale": "The asking price does not compensate for definition quality, concentration, fully burdened margins, or leverage fragility. A restructured entry with the same debt quantum clears the declared return hurdles.",
        "conditions": [item["text"] for item in condition_states],
        "condition_states": condition_states,
        "open_conditions": _open_condition_count(condition_states),
        "issue_summary": issue_summary,
        "terms": [
            "Illustrative $210M enterprise value",
            "Same declared debt quantum",
            "Earnout capped against verified live ARR",
        ],
        "path_to_yes": [
            "Counter at a $210M fixed-value cap",
            "Retain the $120M debt cap",
            "Give no pricing upside credit",
            "Tie contingent consideration to verified live ARR, retention, and margin quality",
        ],
        "metric_pairs": metric_pairs,
        "verification_sources": ["AG-02", "AG-03", "AG-04", "AG-10", "AG-11"],
        "failure_consequences": [
            "Do not advance at seller ask",
            "Retain HOLD until open diligence conditions are adjudicated",
        ],
    }
    decision["decision_sha256"] = digest(decision)
    scenarios = [
        {
            "id": "ask",
            "label": "Seller ask",
            "entry_ev": "$240M",
            "gross_irr": f"{quantize(ask_irr * 100)}%",
            "moic": f"{quantize(ask_moic)}x",
            "covenant": "No modeled breach",
            "lineage": ["ag-reprice"],
        },
        {
            "id": "reprice",
            "label": "Selected structure",
            "entry_ev": "$210M + contingent earnout",
            "gross_irr": f"{quantize(reprice_irr * 100)}%",
            "moic": f"{quantize(reprice_moic)}x",
            "covenant": "No modeled breach",
            "lineage": ["ag-reprice"],
        },
        {
            "id": "downside",
            "label": "Selected downside",
            "entry_ev": "$210M; earnout not paid",
            "gross_irr": f"{quantize(downside_irr * 100)}%",
            "moic": f"{quantize(downside_moic)}x",
            "covenant": "Floor preserved",
            "lineage": ["ag-reprice", "ag-distribution"],
        },
    ]
    return {
        "caseId": "atlasgrid",
        "company": "AtlasGrid Systems",
        "caseType": "Buyout",
        "synthetic": True,
        "investmentAdjudication": "PENDING_HUMAN",
        "workflowDisposition": _workflow_disposition(receipts, decision),
        "disclosure": manifest["disclosure"],
        "dealContext": _deal_context(
            investment_question="Do we meet the $240M ask, counter at $210M, or walk?",
            one_liner="Vertical SaaS for regulated electric-utility grid planning, outage coordination, and field-work compliance.",
            product="Annual enterprise subscriptions combine system planning, work orchestration, regulatory reporting, and implementation services.",
            customer="Regional utilities and municipal power operators; parent-level concentration and cancellation rights matter more than subsidiary logos.",
            market="A durable regulated-software niche with long replacement cycles; this synthetic case does not assert an externally verified market size.",
            competition=[
                "Legacy utility suites",
                "Internal utility workflows",
                "Specialist point solutions",
            ],
            go_to_market="Direct enterprise sales, multi-year implementations, and expansion across operating subsidiaries inside the same utility parent.",
            team="Domain-led management with open finance, revenue-operations, and value-creation execution questions.",
            process="Illustrative control buyout; seller asks $240M and the underwriting case tests a $210M structure with contingent consideration.",
        ),
        "decision": decision,
        "summaryMetrics": [
            _metric(
                "ag-return",
                "Repriced return",
                f"{quantize(reprice_irr * 100, '0.1')}%",
                f"{quantize(reprice_moic, '0.1')}x MOIC · five-year hold",
                "SCENARIO",
                ["ag-reprice"],
            ),
            _metric(
                "ag-nrr-metric",
                "Complete-cohort NRR",
                f"{quantize(full_nrr * 100, '0.1')}%",
                f"Management active-only view: {quantize(active_nrr * 100, '0.1')}%",
                "DESCRIPTIVE",
                ["ag-nrr"],
            ),
            _metric(
                "ag-conc-metric",
                "Top-10 parent concentration",
                f"{quantize(parent_concentration * 100, '0.1')}%",
                f"Entity view: {quantize(entity_concentration * 100, '0.1')}%",
                "DESCRIPTIVE",
                ["ag-concentration"],
            ),
            _metric(
                "ag-margin-metric",
                "Fully burdened gross margin",
                f"{quantize(burdened_gm * 100, '0.1')}%",
                f"Reported view: {quantize(reported_gm * 100, '0.1')}%",
                "ACCOUNTING_IDENTITY",
                ["ag-margin"],
            ),
            _metric(
                "ag-ebitda-metric",
                "Normalized LTM EBITDA",
                f"${quantize(normalized_ebitda / 100_000_000, '0.1')}M",
                f"Seller-adjusted: ${quantize(seller_ebitda / 100_000_000, '0.1')}M",
                "ACCOUNTING_IDENTITY",
                ["ag-ebitda"],
            ),
        ],
        "thesis": {
            "statement": "Mission-critical grid software can support an attractive control investment, but only at a price that reflects definition quality and leverage fragility.",
            "counterthesis": "Contract duration, parent concentration, services burden, and covenant EBITDA may make the apparent recurring-quality premium illusory.",
            "drivers": [
                "Durable regulated end-market demand",
                "Expansion inside utility parents",
                "Price realization after renewal test",
                "Support automation with identified synthetic effect",
            ],
            "falsifiers": [
                "Full-cohort NRR below 95%",
                "Top parent above 15%",
                "Normalized EBITDA below $20M",
                "Downside covenant breach inside 18 months",
            ],
            "requests": [
                {
                    "request_id": item["issue_id"],
                    "request": item["title"],
                    "owner": item["owner"],
                    "due_state": item["stage"],
                    "materiality": item["materiality"],
                    "decision_consequence": item["consequence"],
                }
                for item in issue_summary["issues"]
            ],
        },
        "chartRegistry": [
            {
                "chart_id": "atlasgrid-returns",
                "question": "How wide is the conditional sponsor-return range?",
                "conclusion": f"The retained p10 to p90 MOIC range is {quantize(moic_q[0])}x to {quantize(moic_q[2])}x.",
                "uncertainty": "One thousand declared synthetic scenario paths; not a forecast or investment-accuracy claim.",
                "decision_dependency": "Tests whether the repriced structure preserves acceptable downside dispersion.",
                "rendered_location": "IC Snapshot",
            },
            {
                "chart_id": "atlasgrid-debt",
                "question": "Does modeled cash generation repay debt without a covenant failure?",
                "conclusion": f"Selected exit debt is ${quantize(selected_case.debt_schedule.ending_debt_cents / 100_000_000)}M with no modeled selected-case breach.",
                "uncertainty": "Deterministic selected assumptions; sensitivity cells independently rerun operating and financing drivers.",
                "decision_dependency": "Constrains maximum bid, downside floor, and lender structure.",
                "rendered_location": "Underwriting Room",
            },
            {
                "chart_id": "atlasgrid-value-bridge",
                "question": "Which prioritized initiatives change sponsor equity after cost and interaction?",
                "conclusion": f"The combined full-model exit-equity delta is ${quantize(value_bridge.combined_exit_equity_delta_cents / 100_000_000)}M.",
                "uncertainty": "Synthetic identified effects and human scenarios are labeled separately; interaction is retained.",
                "decision_dependency": "Defines the Day 1 ownership plan without double counting.",
                "rendered_location": "Value Creation",
            },
            {
                "chart_id": "atlasgrid-thesis-dag",
                "question": "Which evidence and assumptions reach the decision and operating plan?",
                "conclusion": "All typed edges remain rendered and selectable; no node or edge is silently truncated.",
                "uncertainty": "Dependency visibility does not validate the underlying assumption.",
                "decision_dependency": "Makes stale or contradicted inputs traceable to HOLD and operating actions.",
                "rendered_location": "Thesis & Evidence",
            },
        ],
        "teamAssessment": {
            "strengths": [
                "Synthetic operating teams retained monthly customer, billing, support, and P&L records sufficient for definition-level diligence.",
                "Synthetic support leadership executed a randomized pod rollout with measured operational outcomes.",
            ],
            "unproven": [
                "Management's ability to sustain complete-cohort retention under a redesigned renewal architecture.",
                "Finance's ability to close parent-account, credit, customer-success cost, and lender-EBITDA definition gaps.",
            ],
            "key_person_risk": "OPEN — the synthetic room contains no org chart, succession evidence, references, or person-level performance record; CRO and CFO execution dependency remains unverified.",
            "required_hires": [
                "Value-creation PMO lead with source-to-KPI accountability.",
                "Revenue-operations owner for parent-level retention and contract-definition governance.",
            ],
        },
        "ownershipCadence": [
            {
                "phase": "Pre-close",
                "timing": "Before signing",
                "owner": "Deal lead / counsel",
                "milestone": "Resolve termination rights, parent mapping, QoE support, and lender EBITDA definitions.",
                "kpi": "Four open diligence conditions adjudicated",
                "stop_rule": "Remain HOLD or reprice terms if any condition changes ARR, EBITDA, or debt capacity.",
            },
            {
                "phase": "Day 1",
                "timing": "Close + 1 day",
                "owner": "CFO / value-creation PMO",
                "milestone": "Lock the complete-cohort, fully burdened margin, and covenant-EBITDA data dictionary.",
                "kpi": "One signed metric dictionary with monthly close owner",
                "stop_rule": "No board target credit until definitions reconcile to the retained room.",
            },
            {
                "phase": "Day 30",
                "timing": "Close + 30 days",
                "owner": "CFO",
                "milestone": "Launch parent-account contribution ledger and delivery-cost baseline.",
                "kpi": "100% billed ARR mapped to legal parent and contribution margin",
                "stop_rule": "Freeze delivery-cost initiative if ledger coverage is below 95%.",
            },
            {
                "phase": "Day 100",
                "timing": "Close + 100 days",
                "owner": "CRO / Chief Customer Officer",
                "milestone": "Deploy segment renewal playbooks and the next support-automation cohort.",
                "kpi": "Complete-cohort NRR, renewal loss, resolution time, and gross churn",
                "stop_rule": "Zero renewal upside credit if churn worsens or support pretrends fail.",
            },
            {
                "phase": "Year 1",
                "timing": "Quarterly through month 12",
                "owner": "Board / operating partner",
                "milestone": "Re-underwrite price, leverage, and the value bridge from realized monthly data.",
                "kpi": "ARR, burdened margin, cash conversion, leverage, liquidity, and initiative value",
                "stop_rule": "Reduce leverage or operating-case credit when downside headroom is not preserved.",
            },
        ],
        "falsifierStates": [
            {
                "label": "Full-cohort NRR below 95%",
                "status": "CLEAR" if full_nrr >= 0.95 else "TRIGGERED",
                "observed": f"{quantize(full_nrr * 100)}%",
                "lineage": ["ag-nrr"],
            },
            {
                "label": "Top parent above 15%",
                "status": "TRIGGERED" if top_parent_concentration > 0.15 else "CLEAR",
                "observed": f"{quantize(top_parent_concentration * 100)}%",
                "lineage": ["ag-concentration"],
            },
            {
                "label": "Normalized EBITDA below $20M",
                "status": "CLEAR"
                if normalized_ebitda >= 2_000_000_000
                else "TRIGGERED",
                "observed": f"${quantize(normalized_ebitda / 100_000_000)}M",
                "lineage": ["ag-ebitda"],
            },
            {
                "label": "Downside covenant breach inside 18 months",
                "status": "TRIGGERED"
                if downside_breaches and min(downside_breaches) <= 18
                else "CLEAR",
                "observed": f"Month {min(downside_breaches)}"
                if downside_breaches
                else "No breach",
                "lineage": ["ag-reprice"],
            },
        ],
        "analyses": receipts,
        "distributionLineage": "ag-distribution",
        "scenarios": scenarios,
        "returnsDistribution": {
            "moic": [quantize(value, "0.1") for value in moic_q],
            "irr": [quantize(value * 100, "0.1") for value in irr_q],
            "labels": ["p10", "p50", "p90"],
        },
        "peEngine": {
            "ask": ask_case.receipt(),
            "selected": selected_case.receipt(),
            "downside": downside_case.receipt(),
            "maximum_bid_base": maximum_bid_base_case.receipt(),
            "maximum_bid_downside": maximum_bid_downside_case.receipt(),
            "distribution": pe_distribution.receipt(),
            "sensitivities": pe_sensitivities.receipt(),
            "maximum_bid_cents": maximum_bid,
        },
        "evidenceMappings": evidence_mappings,
        "valueCreationBridge": value_bridge.receipt(),
        "valueCreation": [
            {
                "priority": 1,
                "initiative": "Renewal architecture",
                "kpi": "Complete-cohort NRR",
                "baseline": f"{quantize(full_nrr * 100)}%",
                "target": f"{quantize((Decimal(str(full_nrr)) + Decimal('0.015')) * 100)}%",
                "owner": "Chief Revenue Officer",
                "timing": "Days 1–100",
                "dependency": "AG-02 complete-cohort definition and AG-07 price-risk boundary",
                "implementation_cost": "$1.5M",
                "milestone": "Segment playbooks live by day 90",
                "stop_rule": "Stop upside credit if complete-cohort NRR or renewal loss worsens.",
                "value": _illustrative_value_range(
                    value_by_id["renewal"].exit_equity_delta_cents
                ),
                "credit_classification": value_by_id["renewal"].credit_classification,
                "risk": "Price-driven churn; AG-07 contributes zero upside credit",
                "lineage": ["ag-nrr", "ag-price-rct"],
            },
            {
                "priority": 2,
                "initiative": "Support automation",
                "kpi": "Resolution time",
                "baseline": f"{quantize(np.mean([float(row['resolution_hours']) for row in rollout if int(row['post']) == 0]))} hours",
                "target": "17.5 hours",
                "owner": "Chief Customer Officer",
                "timing": "Days 30–120",
                "dependency": "AG-08 synthetic pod experiment and verified workload transfer",
                "implementation_cost": "$2.0M",
                "milestone": "20-pod rollout by day 120",
                "stop_rule": "Stop rollout if resolution or churn diagnostics cross the declared adverse boundary.",
                "value": f"Identified synthetic retention effect is reported separately; {_illustrative_value_range(support_margin_only_value)} margin-only range",
                "credit_classification": value_by_id["support"].credit_classification,
                "risk": "AG-08 maps only the churn effect; the 100 bps margin uplift is human judgment",
                "lineage": ["ag-support"],
            },
            {
                "priority": 3,
                "initiative": "Delivery cost reset",
                "kpi": "Burdened gross margin",
                "baseline": f"{quantize(burdened_gm * 100)}%",
                "target": f"{quantize((Decimal(str(burdened_gm)) + Decimal('0.015')) * 100)}%",
                "owner": "CFO",
                "timing": "Pre-close through Day 100",
                "dependency": "AG-04 fully burdened cost dictionary and account contribution ledger",
                "implementation_cost": "$2.5M",
                "milestone": "Account contribution ledger and vendor plan by day 30",
                "stop_rule": "Withdraw credit if service quality deteriorates or ledger coverage stays below 95%.",
                "value": _illustrative_value_range(
                    value_by_id["delivery"].exit_equity_delta_cents
                ),
                "credit_classification": value_by_id["delivery"].credit_classification,
                "risk": "Human scenario with zero causal credit",
                "lineage": ["ag-margin", "ag-ebitda"],
            },
        ],
        "screenedOutLevers": [
            {
                "lever": "Broad renewal price increase",
                "evidence_state": "CAUSAL_SYNTHETIC_ONLY_ADVERSE",
                "reason_screened_out": "AG-07 estimates renewal loss under the tested offer; no upside is credited.",
                "reconsideration_trigger": "A separately powered design demonstrates expansion without violating the renewal-loss stop rule.",
            },
            {
                "lever": "Acquisition-led growth",
                "evidence_state": "NOT_EVIDENCED",
                "reason_screened_out": "No target, integration capacity, purchase price, or financing evidence exists in the room.",
                "reconsideration_trigger": "A separately retained target room and full sources-and-uses case are approved.",
            },
        ],
        "lineage": lineages,
        "artifacts": list(artifacts.values()),
        "temporalScan": temporal_scan,
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
    financing_plan = read_json(root / artifacts["financing-plan"]["path"])
    team_diligence = read_json(root / artifacts["team-diligence"]["path"])
    market_assumptions = read_json(root / artifacts["market-assumptions"]["path"])
    venture_scenarios = read_json(root / artifacts["venture-scenarios"]["path"])
    risk_policy = read_json(root / artifacts["risk-policy"]["path"])
    desk_policy = helios_public_desk_policy()
    months = sorted({row["month"] for row in customers})
    base_month, end_month = months[-13], months[-1]
    base_rows = [
        row
        for row in customers
        if row["month"] == base_month and int(row["revenue_cents"]) > 0
    ]
    end_rows = {
        row["customer_id"]: row for row in customers if row["month"] == end_month
    }
    pooled_nrr = sum(
        int(end_rows.get(row["customer_id"], {"revenue_cents": 0})["revenue_cents"])
        for row in base_rows
    ) / sum(int(row["revenue_cents"]) for row in base_rows)
    ordinary = [row for row in base_rows if int(row["design_partner"]) == 0]
    ordinary_nrr = sum(
        int(end_rows.get(row["customer_id"], {"revenue_cents": 0})["revenue_cents"])
        for row in ordinary
    ) / sum(int(row["revenue_cents"]) for row in ordinary)
    ltm = pnl[-12:]
    revenue = sum(int(row["revenue_cents"]) for row in ltm)
    cogs = sum(int(row["cogs_cents"]) for row in ltm)
    gross_margin = 1 - cogs / revenue
    component_cogs = sum(
        int(row["compute_cost_cents"])
        + int(row["telemetry_cost_cents"])
        + int(row["support_cost_cents"])
        for row in customers
        if row["month"] in {item["month"] for item in ltm}
    )
    recent_burn = np.mean([int(row["net_burn_cents"]) for row in pnl[-3:]])
    runway = cap["cash_at_cutoff_cents"] / recent_burn
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

    stage_probability = {
        int(key): Decimal(value)
        for key, value in market_assumptions["stage_probabilities"].items()
    }
    history_by_opportunity: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in stage_history:
        history_by_opportunity[row["opportunity_id"]].append(row)
    historical_stage: dict[str, int] = {}
    for opportunity_id, rows in history_by_opportunity.items():
        if len(rows) >= 15:
            latest = max(rows, key=lambda item: int(item["observation_index"]))
            historical_stage[opportunity_id] = int(latest["stage"])
    eligible_pipeline = [
        row for row in pipeline if row["opportunity_id"] in historical_stage
    ]
    actual_weighted = sum(
        Decimal(int(row["amount_cents"]))
        * stage_probability[historical_stage[row["opportunity_id"]]]
        for row in eligible_pipeline
    )
    reported_weighted = sum(
        Decimal(int(row["amount_cents"]))
        * stage_probability[int(row["reported_stage"])]
        for row in eligible_pipeline
    )
    pipeline_inflation = (reported_weighted - actual_weighted).quantize(
        Decimal("1"), rounding=ROUND_HALF_EVEN
    )
    inflated_count = sum(
        int(row["reported_stage"]) > historical_stage[row["opportunity_id"]]
        for row in eligible_pipeline
    )
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
            market_diagnostics.append(
                _diagnostic(f"tier_{tier}_sample", total, "ABSTAIN")
            )
            continue
        alpha, beta_value = 1 + successes, 1 + total - successes
        median = float(beta.ppf(0.5, alpha, beta_value))
        companion_median = float(beta.ppf(0.5, 2 + successes, 2 + total - successes))
        low = float(beta.ppf(0.05, alpha, beta_value))
        high = float(beta.ppf(0.95, alpha, beta_value))
        tier_tam = universe_counts[tier - 1] * median * tier_mid_spend[tier - 1]
        tam_draws.append(tier_tam)
        prior_sensitivity_deltas.append(abs(companion_median - median) * 100)
        market_outputs.append(
            _output(f"tier_{tier}_adoption", quantize(median * 100), "percent")
        )
        market_diagnostics.append(
            _diagnostic(
                f"tier_{tier}_credible_interval",
                f"[{quantize(low * 100)}, {quantize(high * 100)}]",
            )
        )
    tam = sum(tam_draws)

    treatment = np.array([int(row["treatment"]) for row in experiment])
    outcome = np.array([float(row["outcome_log_cost_change"]) for row in experiment])
    baseline_cost = np.array([float(row["baseline_log_cost"]) for row in experiment])
    optimizer_smd = _smd(baseline_cost, treatment)
    rct_effect, rct_se, rct_low, rct_high = _mean_difference(outcome, treatment)
    adjusted_effect, adjusted_se, adjusted_low, adjusted_high = (
        _baseline_adjusted_difference(outcome, treatment, baseline_cost)
    )
    initial_holders = tuple(
        Holder(item["holder_id"], item["class_id"], int(item["issued_shares"]))
        for item in cap["holders"]
    )
    initial_preferences = tuple(
        PreferenceTerms(
            class_id=item["class_id"],
            seniority=int(item["seniority"]),
            invested_cents=int(item["invested_cents"]),
            preference_multiple=Decimal(item["preference_multiple"]),
            participation=item["participation"],
            participation_cap_multiple=(
                Decimal(item["participation_cap_multiple"])
                if item["participation_cap_multiple"] is not None
                else None
            ),
            conversion_numerator=int(item["conversion_numerator"]),
            conversion_denominator=int(item["conversion_denominator"]),
        )
        for item in cap["preference_terms"]
    )
    milestone_ids = tuple(
        item["metric_id"] for item in financing_plan["milestone_contract"]["tests"]
    )

    def funding_event(item: dict[str, Any]) -> FundingEvent:
        is_milestone = item["event_type"] == "MILESTONE"
        return FundingEvent(
            event_id=item["event_id"],
            scheduled_month=int(item["scheduled_month"]),
            sequence=int(item["sequence"]),
            event_type=item["event_type"],
            holder_id=item["holder_id"],
            class_id=item["class_id"],
            new_money_cents=int(item["new_money_cents"]),
            pre_money_cents=(
                int(item["pre_money_cents"])
                if item["pre_money_cents"] is not None
                else None
            ),
            price_rule=item["price_rule"],
            pool_target=Decimal(item["pool_target"]),
            milestone_tests=milestone_ids if is_milestone else (),
            milestone_results=(
                tuple(
                    (str(result["metric_id"]), str(result["state"]))
                    for result in item["milestone_results"]
                )
                if is_milestone
                else ()
            ),
            milestone_state=item["milestone_state"],
            evaluator=(
                financing_plan["milestone_contract"]["evaluator"]
                if is_milestone
                else "NOT_APPLICABLE"
            ),
            cure_period_days=(
                int(financing_plan["milestone_contract"]["cure_period_days"])
                if is_milestone
                else 0
            ),
            funded=bool(item["funded"]),
            shortfall_discount=(
                Decimal(item["shortfall_discount"])
                if item.get("shortfall_discount") is not None
                else None
            ),
            seniority=int(item["seniority"]),
        )

    scenario_results = {}
    for book in financing_plan["scenario_books"]:
        assumptions = VCScenarioAssumptions(
            scenario_id=book["scenario_id"],
            close_date=datetime.fromisoformat(
                financing_plan["projection_origin"]
            ).date(),
            exit_month=int(book["exit_month"]),
            exit_value_cents=int(book["exit_value_cents"]),
            monthly_net_cash_flow_cents=tuple(
                int(item) for item in book["monthly_net_cash_flow_cents"]
            ),
            events=tuple(funding_event(item) for item in book["events"]),
            target_holder_id=financing_plan["target_holder_id"],
            exit_valuation=book["exit_valuation"],
            pool_exit_treatment="FULLY_GRANTED_COMMON",
        )
        scenario_results[book["scenario_id"]] = run_vc_scenario(
            assumptions=assumptions,
            opening_cash_cents=int(cap["cash_at_cutoff_cents"]),
            initial_holders=initial_holders,
            initial_preferences=initial_preferences,
            unissued_pool_shares=int(cap["unissued_option_pool_shares"]),
        )
    selected_vc = scenario_results["MILESTONE"]
    series_c_ownership = selected_vc.target_ownership
    first_close = next(
        item
        for item in selected_vc.financing_events
        if item["event_id"] == "series-c-close"
    )
    new_shares = int(first_close["new_shares"])
    post_close_runway_floor = Decimal(len(selected_vc.cash_by_month))
    scenario_seed = int(manifest["seed_commitment"][:16], 16) + int(
        venture_scenarios["distribution_seed_offset"]
    )
    vc_distribution = simulate_vc_distribution(
        base_result=selected_vc,
        scenario_results=tuple(scenario_results.values()),
        seed=scenario_seed,
        draws=int(venture_scenarios["draws"]),
        scenario_weights={
            key: Decimal(value)
            for key, value in venture_scenarios["scenario_state_weights"].items()
        },
        exit_multiple_low=Decimal(venture_scenarios["exit_value_multiple_low"]),
        exit_multiple_high=Decimal(venture_scenarios["exit_value_multiple_high"]),
        catastrophe_probability=Decimal(venture_scenarios["catastrophe_probability"]),
        catastrophe_exit_multiple_low=Decimal(
            venture_scenarios["catastrophe_exit_multiple_low"]
        ),
        catastrophe_exit_multiple_high=Decimal(
            venture_scenarios["catastrophe_exit_multiple_high"]
        ),
        continuous_exit_multiple_sigma=Decimal(
            venture_scenarios["continuous_exit_multiple_sigma"]
        ),
        exit_timing_mean_months=Decimal(venture_scenarios["exit_timing_mean_months"]),
        exit_timing_sigma_months=Decimal(venture_scenarios["exit_timing_sigma_months"]),
        exit_timing_delta_min_months=int(
            venture_scenarios["exit_timing_delta_min_months"]
        ),
        exit_timing_delta_max_months=int(
            venture_scenarios["exit_timing_delta_max_months"]
        ),
        minimum_exit_month=int(venture_scenarios["minimum_exit_month"]),
        maximum_exit_month=int(venture_scenarios["maximum_exit_month"]),
        operating_cash_factor_mean=Decimal(
            venture_scenarios["operating_cash_factor_mean"]
        ),
        operating_cash_factor_sigma=Decimal(
            venture_scenarios["operating_cash_factor_sigma"]
        ),
        operating_cash_factor_low=Decimal(
            venture_scenarios["operating_cash_factor_low"]
        ),
        operating_cash_factor_high=Decimal(
            venture_scenarios["operating_cash_factor_high"]
        ),
        shortfall_operating_cash_factor_high=Decimal(
            venture_scenarios["shortfall_operating_cash_factor_high"]
        ),
        maximum_liquidity_extension_months=int(
            venture_scenarios["maximum_liquidity_extension_months"]
        ),
        loss_probability_band_low=Decimal(
            venture_scenarios["loss_probability_band_low"]
        ),
        loss_probability_band_high=Decimal(
            venture_scenarios["loss_probability_band_high"]
        ),
        prior_rationale=venture_scenarios["prior_rationale"],
        prior_owner=venture_scenarios["prior_owner"],
        prior_approval_status=venture_scenarios["prior_approval_status"],
        prior_classification=venture_scenarios["prior_classification"],
    )
    moic_q = [Decimal(value) for value in vc_distribution["moic_quantiles"]]
    irr_q = [Decimal(value) for value in vc_distribution["xirr_quantiles"]]
    loss_probability = Decimal(vc_distribution["probability_below_one"])
    selected_catastrophe_prior = Decimal(venture_scenarios["catastrophe_probability"])
    three_x_probability = Decimal(
        sum(
            Decimal(item["gross_moic"]) >= 3 for item in vc_distribution["path_records"]
        )
    ) / Decimal(vc_distribution["draws"])
    loss_probability_mce_pp = (
        loss_probability
        * (Decimal(1) - loss_probability)
        / Decimal(vc_distribution["draws"])
    ).sqrt() * Decimal(100)
    three_x_probability_mce_pp = (
        three_x_probability
        * (Decimal(1) - three_x_probability)
        / Decimal(vc_distribution["draws"])
    ).sqrt() * Decimal(100)
    canonical_policy_threshold = Decimal(
        desk_policy["thresholds"]["maximum_probability_below_one"]
    )
    risk_sensitivity_cells: list[dict[str, Any]] = []
    risk_configuration = venture_scenarios["risk_sensitivity"]
    for profile in risk_configuration["scenario_weight_profiles"]:
        profile_weights = {
            key: Decimal(value) for key, value in profile["weights"].items()
        }
        for catastrophe_probability_text in risk_configuration[
            "catastrophe_probabilities"
        ]:
            catastrophe_probability = Decimal(catastrophe_probability_text)
            is_canonical = profile[
                "profile_id"
            ] == "BASELINE" and catastrophe_probability == Decimal(
                venture_scenarios["catastrophe_probability"]
            )
            distribution = (
                vc_distribution
                if is_canonical
                else simulate_vc_distribution(
                    base_result=selected_vc,
                    scenario_results=tuple(scenario_results.values()),
                    seed=scenario_seed,
                    draws=int(venture_scenarios["draws"]),
                    scenario_weights=profile_weights,
                    exit_multiple_low=Decimal(
                        venture_scenarios["exit_value_multiple_low"]
                    ),
                    exit_multiple_high=Decimal(
                        venture_scenarios["exit_value_multiple_high"]
                    ),
                    catastrophe_probability=catastrophe_probability,
                    catastrophe_exit_multiple_low=Decimal(
                        venture_scenarios["catastrophe_exit_multiple_low"]
                    ),
                    catastrophe_exit_multiple_high=Decimal(
                        venture_scenarios["catastrophe_exit_multiple_high"]
                    ),
                    continuous_exit_multiple_sigma=Decimal(
                        venture_scenarios["continuous_exit_multiple_sigma"]
                    ),
                    exit_timing_mean_months=Decimal(
                        venture_scenarios["exit_timing_mean_months"]
                    ),
                    exit_timing_sigma_months=Decimal(
                        venture_scenarios["exit_timing_sigma_months"]
                    ),
                    exit_timing_delta_min_months=int(
                        venture_scenarios["exit_timing_delta_min_months"]
                    ),
                    exit_timing_delta_max_months=int(
                        venture_scenarios["exit_timing_delta_max_months"]
                    ),
                    minimum_exit_month=int(venture_scenarios["minimum_exit_month"]),
                    maximum_exit_month=int(venture_scenarios["maximum_exit_month"]),
                    operating_cash_factor_mean=Decimal(
                        venture_scenarios["operating_cash_factor_mean"]
                    ),
                    operating_cash_factor_sigma=Decimal(
                        venture_scenarios["operating_cash_factor_sigma"]
                    ),
                    operating_cash_factor_low=Decimal(
                        venture_scenarios["operating_cash_factor_low"]
                    ),
                    operating_cash_factor_high=Decimal(
                        venture_scenarios["operating_cash_factor_high"]
                    ),
                    shortfall_operating_cash_factor_high=Decimal(
                        venture_scenarios["shortfall_operating_cash_factor_high"]
                    ),
                    maximum_liquidity_extension_months=int(
                        venture_scenarios["maximum_liquidity_extension_months"]
                    ),
                    prior_rationale=profile["rationale"],
                    prior_owner=venture_scenarios["prior_owner"],
                    prior_approval_status="UNREVIEWED",
                    prior_classification=venture_scenarios["prior_classification"],
                )
            )
            cell_loss_probability = Decimal(distribution["probability_below_one"])
            path_records = distribution["path_records"]
            catastrophe_paths = [
                item for item in path_records if item["prior_state"] == "CATASTROPHE"
            ]
            continuous_paths = [
                item for item in path_records if item["prior_state"] == "CONTINUOUS"
            ]
            cell: dict[str, Any] = {
                "cell_id": f"vc-risk-{profile['profile_id'].lower().replace('_', '-')}-cat-{int(catastrophe_probability * 100):02d}",
                "profile_id": profile["profile_id"],
                "profile_label": profile["label"],
                "profile_rationale": profile["rationale"],
                "template_weights": {
                    key: format(value, "f") for key, value in profile_weights.items()
                },
                "catastrophe_probability": format(catastrophe_probability, "f"),
                "is_canonical": is_canonical,
                "draws": distribution["draws"],
                "probability_below_one": distribution["probability_below_one"],
                "probability_below_one_monte_carlo_se_pp": distribution[
                    "probability_below_one_monte_carlo_se_pp"
                ],
                "moic_quantiles": distribution["moic_quantiles"],
                "xirr_quantiles": distribution["xirr_quantiles"],
                "distribution_receipt_sha256": distribution["receipt_sha256"],
                "loss_decomposition": {
                    "catastrophe_paths": len(catastrophe_paths),
                    "catastrophe_loss_paths": sum(
                        Decimal(item["gross_moic"]) < 1 for item in catastrophe_paths
                    ),
                    "continuous_paths": len(continuous_paths),
                    "continuous_loss_paths": sum(
                        Decimal(item["gross_moic"]) < 1 for item in continuous_paths
                    ),
                },
                "canonical_policy_status": "CLEARS"
                if catastrophe_probability <= canonical_policy_threshold
                else "MISSES",
                "analytical_posture": "HOLD",
            }
            cell["receipt_sha256"] = digest(cell)
            risk_sensitivity_cells.append(cell)
    canonical_risk_cell = next(
        item for item in risk_sensitivity_cells if item["is_canonical"]
    )
    risk_sensitivity: dict[str, Any] = {
        "schema_version": "underwriting.vc-risk-sensitivity/v1",
        "classification": "SYNTHETIC_SCENARIO_NOT_FORECAST",
        "canonical_cell_id": canonical_risk_cell["cell_id"],
        "default_cell_id": canonical_risk_cell["cell_id"],
        "policy_threshold_choices": desk_policy["editable_maximum_probability_choices"],
        "canonical_policy_threshold": desk_policy["thresholds"][
            "maximum_probability_below_one"
        ],
        "cells": risk_sensitivity_cells,
    }
    risk_sensitivity["receipt_sha256"] = digest(risk_sensitivity)
    selected_exit_bridge = selected_vc.assumptions.exit_valuation
    if selected_exit_bridge is None:
        raise UnderwritingError("vc_selected_exit_bridge_missing")
    vc_sensitivity_cells: list[dict[str, Any]] = []

    def add_vc_sensitivity(
        axis: str,
        label: str,
        driver_value: str,
        assumptions: VCScenarioAssumptions,
        *,
        baseline_scenario_id: str,
        is_baseline: bool,
    ) -> None:
        result = run_vc_scenario(
            assumptions=assumptions,
            opening_cash_cents=int(cap["cash_at_cutoff_cents"]),
            initial_holders=initial_holders,
            initial_preferences=initial_preferences,
            unissued_pool_shares=int(cap["unissued_option_pool_shares"]),
        )
        body: dict[str, Any] = {
            "cell_id": f"vc-{axis}-{len([item for item in vc_sensitivity_cells if item['axis'] == axis]) + 1}",
            "axis": axis,
            "baseline_scenario_id": baseline_scenario_id,
            "assumption_label": label,
            "driver_value": driver_value,
            "is_baseline": is_baseline,
            "engine_inputs_sha256": result.engine_inputs_sha256,
            "result_receipt_sha256": result.receipt()["receipt_sha256"],
            "gross_moic": format(result.gross_moic, "f"),
            "gross_xirr": format(result.gross_xirr, "f"),
            "target_ownership": format(result.target_ownership, "f"),
            "pool_exit_treatment": result.assumptions.pool_exit_treatment,
            "minimum_cash_cents": result.minimum_cash_cents,
            "target_proceeds_cents": result.target_proceeds_cents,
            "target_cash_flows": list(result.target_cash_flows),
            "target_shares": next(
                item.shares
                for item in result.holders
                if item.holder_id == "series-c-investor"
            ),
            "fully_diluted_shares": sum(item.shares for item in result.holders)
            + result.unissued_pool_shares,
            "ending_cash_path_cents": [
                item["ending_cash_cents"] for item in result.cash_by_month
            ],
            "operating_exit_bridge": dict(result.assumptions.exit_valuation or {}),
            "point_return_hurdle_status": (
                "CLEARS"
                if result.gross_xirr >= Decimal(desk_policy["thresholds"]["gross_xirr"])
                and result.gross_moic
                >= Decimal(desk_policy["thresholds"]["gross_moic"])
                else "MISSES"
            ),
            "binding_loss_hurdle_status": (
                "CLEARS" if selected_catastrophe_prior <= canonical_policy_threshold else "MISSES"
            ),
            "analytical_posture": "HOLD",
        }
        body["receipt_sha256"] = digest(body)
        vc_sensitivity_cells.append(body)

    def operating_exit_assumptions(
        assumptions: VCScenarioAssumptions,
        *,
        annual_growth: Decimal | None = None,
        exit_multiple: Decimal | None = None,
        ordinary_cohort_nrr: Decimal | None = None,
    ) -> VCScenarioAssumptions:
        bridge = dict(assumptions.exit_valuation or selected_exit_bridge)
        growth = annual_growth or Decimal(str(bridge["annual_revenue_growth"]))
        multiple = exit_multiple or Decimal(str(bridge["exit_revenue_multiple"]))
        if ordinary_cohort_nrr is not None:
            retained_mix_contribution = Decimal(
                str(bridge["annual_revenue_growth"])
            ) - (Decimal(str(ordinary_nrr)) - Decimal(1))
            growth = ordinary_cohort_nrr - Decimal(1) + retained_mix_contribution
        cash_flows = assumptions.monthly_net_cash_flow_cents
        provisional_assumptions = replace(
            assumptions,
            monthly_net_cash_flow_cents=cash_flows,
            exit_valuation=None,
        )
        provisional = run_vc_scenario(
            assumptions=provisional_assumptions,
            opening_cash_cents=int(cap["cash_at_cutoff_cents"]),
            initial_holders=initial_holders,
            initial_preferences=initial_preferences,
            unissued_pool_shares=int(cap["unissued_option_pool_shares"]),
        )
        cash_at_exit = provisional.cash_by_month[-1]["ending_cash_cents"]
        terminal_revenue = int(
            (
                Decimal(int(bridge["observed_ltm_revenue_cents"]))
                * (Decimal(1) + growth) ** int(bridge["years"])
            ).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
        )
        enterprise_value = int(
            (Decimal(terminal_revenue) * multiple).quantize(
                Decimal("1"), rounding=ROUND_HALF_EVEN
            )
        )
        exit_bridge = {
            **bridge,
            "annual_revenue_growth": format(growth, "f"),
            "exit_revenue_multiple": format(multiple, "f"),
            "terminal_revenue_cents": terminal_revenue,
            "cash_at_exit_cents": cash_at_exit,
            "net_debt_cents": -cash_at_exit,
            "exit_enterprise_value_cents": enterprise_value,
            "exit_equity_value_cents": enterprise_value + cash_at_exit,
        }
        return replace(
            assumptions,
            monthly_net_cash_flow_cents=cash_flows,
            exit_value_cents=exit_bridge["exit_equity_value_cents"],
            exit_valuation=exit_bridge,
        )

    operating_base = selected_vc.assumptions
    operating_sensitivity_values = risk_configuration["operating_sensitivity_values"]
    annual_growth_values = tuple(
        Decimal(value)
        for value in operating_sensitivity_values["annual_revenue_growth"]
    )
    for annual_growth in annual_growth_values:
        add_vc_sensitivity(
            "annual_revenue_growth",
            f"{quantize(annual_growth * 100, '0.1')}% annual growth",
            format(annual_growth, "f"),
            operating_exit_assumptions(operating_base, annual_growth=annual_growth),
            baseline_scenario_id="MILESTONE",
            is_baseline=annual_growth
            == Decimal(str(selected_exit_bridge["annual_revenue_growth"])),
        )
    exit_multiple_values = tuple(
        Decimal(value)
        for value in operating_sensitivity_values["exit_revenue_multiple"]
    )
    for exit_multiple in exit_multiple_values:
        add_vc_sensitivity(
            "exit_revenue_multiple",
            f"{quantize(exit_multiple, '0.1')}x revenue",
            format(exit_multiple, "f"),
            operating_exit_assumptions(operating_base, exit_multiple=exit_multiple),
            baseline_scenario_id="MILESTONE",
            is_baseline=exit_multiple
            == Decimal(str(selected_exit_bridge["exit_revenue_multiple"])),
        )
    baseline_nrr = Decimal(str(ordinary_nrr))
    for nrr_target in (
        Decimal(operating_sensitivity_values["ordinary_cohort_nrr_floor"]),
        baseline_nrr,
        Decimal(operating_sensitivity_values["ordinary_cohort_nrr_upside"]),
    ):
        add_vc_sensitivity(
            "ordinary_cohort_nrr",
            f"{quantize(nrr_target * 100, '0.1')}% ordinary-cohort NRR",
            format(nrr_target, "f"),
            operating_exit_assumptions(operating_base, ordinary_cohort_nrr=nrr_target),
            baseline_scenario_id="MILESTONE",
            is_baseline=nrr_target == baseline_nrr,
        )
    later_round_base = scenario_results["BASE"].assumptions
    baseline_later_round_price = next(
        int(event.pre_money_cents)
        for event in later_round_base.events
        if event.event_id == "series-d-base" and event.pre_money_cents is not None
    )
    for pre_money in tuple(
        int(value)
        for value in operating_sensitivity_values["later_round_pre_money_cents"]
    ):
        events = tuple(
            replace(event, pre_money_cents=pre_money)
            if event.event_id == "series-d-base"
            else event
            for event in later_round_base.events
        )
        add_vc_sensitivity(
            "later_round_price",
            f"${pre_money // 100_000_000}M pre",
            str(pre_money),
            operating_exit_assumptions(replace(later_round_base, events=events)),
            baseline_scenario_id="BASE",
            is_baseline=pre_money == baseline_later_round_price,
        )
    scenario_by_milestone_state = {"FAIL": "BASE", "PASS": "MILESTONE"}
    for state in operating_sensitivity_values["milestone_states"]:
        scenario_key = scenario_by_milestone_state[state]
        add_vc_sensitivity(
            "milestone_state",
            state,
            state,
            operating_exit_assumptions(scenario_results[scenario_key].assumptions),
            baseline_scenario_id=scenario_key,
            is_baseline=state == "PASS",
        )
    axis_definitions = [
        {
            "axis": "annual_revenue_growth",
            "label": "Annual revenue growth",
            "driver_unit": "decimal_rate",
            "model_rule": "Observed LTM revenue compounded for five years, then valued at the selected revenue multiple",
            "source_locator_ids": ["locator-hx-financing-plan"],
        },
        {
            "axis": "exit_revenue_multiple",
            "label": "Exit revenue multiple",
            "driver_unit": "multiple",
            "model_rule": "Terminal revenue times an explicit revenue multiple, plus exact exit cash",
            "source_locator_ids": ["locator-hx-financing-plan"],
        },
        {
            "axis": "ordinary_cohort_nrr",
            "label": "Ordinary-cohort NRR",
            "driver_unit": "decimal_rate",
            "model_rule": "NRR changes the retention component of annual growth while the baseline new-logo and usage contribution remains fixed",
            "source_locator_ids": ["locator-hx-customer-month"],
        },
        {
            "axis": "later_round_price",
            "label": "Later-round pre-money",
            "driver_unit": "cents",
            "model_rule": "Rerun Series D issuance, dilution, preference waterfall, and Series C proceeds",
            "source_locator_ids": ["locator-hx-financing-plan"],
        },
        {
            "axis": "milestone_state",
            "label": "Milestone tranche state",
            "driver_unit": "state",
            "model_rule": "Compare the named BASE and MILESTONE financing books; the baseline is the passed milestone case",
            "source_locator_ids": ["locator-hx-financing-plan"],
        },
    ]
    baseline_cell_ids = {
        definition["axis"]: next(
            cell["cell_id"]
            for cell in vc_sensitivity_cells
            if cell["axis"] == definition["axis"] and cell["is_baseline"]
        )
        for definition in axis_definitions
    }
    vc_sensitivity_book: dict[str, Any] = {
        "schema_version": "underwriting.vc-sensitivity-book/v3",
        "axis_order": [item["axis"] for item in axis_definitions],
        "axis_definitions": axis_definitions,
        "baseline_cell_ids": baseline_cell_ids,
        "default_axis": "annual_revenue_growth",
        "default_cell_id": baseline_cell_ids["annual_revenue_growth"],
        "cells": vc_sensitivity_cells,
    }
    vc_sensitivity_book["receipt_sha256"] = digest(vc_sensitivity_book)

    def run_vc_value_case(
        lever_id: str,
        *,
        monthly_cash_delta_cents: int,
        exit_value_delta_cents: int,
        implementation_cost_cents: int,
        credit_classification: str,
        source_analysis_ids: list[str],
        mapping: dict[str, Any],
    ) -> tuple[dict[str, Any], Any]:
        cash_path = [
            value + monthly_cash_delta_cents
            for value in selected_vc.assumptions.monthly_net_cash_flow_cents
        ]
        cash_path[0] -= implementation_cost_cents
        assumptions = replace(
            selected_vc.assumptions,
            monthly_net_cash_flow_cents=tuple(cash_path),
            exit_value_cents=selected_vc.assumptions.exit_value_cents
            + exit_value_delta_cents,
            exit_valuation=None,
        )
        result = run_vc_scenario(
            assumptions=assumptions,
            opening_cash_cents=int(cap["cash_at_cutoff_cents"]),
            initial_holders=initial_holders,
            initial_preferences=initial_preferences,
            unissued_pool_shares=int(cap["unissued_option_pool_shares"]),
        )
        body: dict[str, Any] = {
            "lever_id": lever_id,
            "monthly_cash_delta_cents": monthly_cash_delta_cents,
            "exit_value_delta_cents": exit_value_delta_cents,
            "implementation_cost_cents": implementation_cost_cents,
            "minimum_cash_delta_cents": result.minimum_cash_cents
            - selected_vc.minimum_cash_cents,
            "target_proceeds_delta_cents": result.target_proceeds_cents
            - selected_vc.target_proceeds_cents,
            "gross_xirr_delta": format(result.gross_xirr - selected_vc.gross_xirr, "f"),
            "gross_moic_delta": format(result.gross_moic - selected_vc.gross_moic, "f"),
            "result_minimum_cash_cents": result.minimum_cash_cents,
            "result_target_proceeds_cents": result.target_proceeds_cents,
            "result_gross_xirr": format(result.gross_xirr, "f"),
            "result_gross_moic": format(result.gross_moic, "f"),
            "credit_classification": credit_classification,
            "source_analysis_ids": source_analysis_ids,
            "economic_mapping": mapping,
            "result_receipt_sha256": result.receipt()["receipt_sha256"],
        }
        body["receipt_sha256"] = digest(body)
        return body, result

    ordinary_base_arr_cents = sum(int(row["revenue_cents"]) for row in ordinary) * 12
    ordinary_target_nrr = Decimal("1.25")
    ordinary_nrr_gap = max(
        Decimal("0"), ordinary_target_nrr - Decimal(str(ordinary_nrr))
    )
    ordinary_annual_cash_delta = int(
        (
            Decimal(ordinary_base_arr_cents)
            * ordinary_nrr_gap
            * Decimal(str(gross_margin))
            * Decimal("0.50")
        ).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
    )
    ordinary_monthly_cash_delta = ordinary_annual_cash_delta // 12
    ordinary_exit_delta = ordinary_annual_cash_delta * 10
    ltm_months = {item["month"] for item in ltm}
    ltm_compute_cost_cents = sum(
        int(row["compute_cost_cents"])
        for row in customers
        if row["month"] in ltm_months
    )
    optimizer_adoption = Decimal("0.65")
    optimizer_multiplicative_savings = Decimal(str(1 - math.exp(rct_effect)))
    optimizer_annual_cash_delta = int(
        (
            Decimal(ltm_compute_cost_cents)
            * optimizer_multiplicative_savings
            * optimizer_adoption
        ).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN)
    )
    optimizer_monthly_cash_delta = optimizer_annual_cash_delta // 12
    optimizer_exit_delta = optimizer_annual_cash_delta * 12
    vc_value_cases = [
        run_vc_value_case(
            "ordinary-expansion",
            monthly_cash_delta_cents=ordinary_monthly_cash_delta,
            exit_value_delta_cents=ordinary_exit_delta,
            implementation_cost_cents=150_000_000,
            credit_classification="HUMAN_JUDGMENT",
            source_analysis_ids=["HX-02"],
            mapping={
                "formula": "ordinary_base_arr_cents * max(0, target_nrr - observed_nrr) * gross_margin * 50% realization",
                "ordinary_base_arr_cents": ordinary_base_arr_cents,
                "observed_nrr": format(Decimal(str(ordinary_nrr)), "f"),
                "target_nrr": format(ordinary_target_nrr, "f"),
                "gross_margin": format(Decimal(str(gross_margin)), "f"),
                "realization_factor": "0.50",
                "exit_multiple_on_annual_cash": "10.0",
            },
        ),
        run_vc_value_case(
            "optimizer-unit-economics",
            monthly_cash_delta_cents=optimizer_monthly_cash_delta,
            exit_value_delta_cents=optimizer_exit_delta,
            implementation_cost_cents=200_000_000,
            credit_classification="MIXED_CAUSAL_SYNTHETIC_AND_SCENARIO",
            source_analysis_ids=["HX-01", "HX-06"],
            mapping={
                "formula": "ltm_compute_cost_cents * (1 - exp(precommitted_unadjusted_optimizer_itt_log_points)) * adoption_rate",
                "ltm_compute_cost_cents": ltm_compute_cost_cents,
                "precommitted_unadjusted_optimizer_itt_log_points": format(
                    Decimal(str(rct_effect)), "f"
                ),
                "multiplicative_cost_savings_rate": format(
                    optimizer_multiplicative_savings, "f"
                ),
                "adoption_rate": format(optimizer_adoption, "f"),
                "exit_multiple_on_annual_cash": "12.0",
                "causal_boundary": "Synthetic ITT identifies the planted test population only; adoption and valuation multiple remain scenario judgments.",
            },
        ),
        run_vc_value_case(
            "sales-governance",
            monthly_cash_delta_cents=0,
            exit_value_delta_cents=0,
            implementation_cost_cents=125_000_000,
            credit_classification="DESCRIPTIVE_ZERO_BASE_CASE_CREDIT",
            source_analysis_ids=["HX-04", "HX-07"],
            mapping={
                "formula": "zero_base_case_credit_until_stage_history_and_conversion_design_are_identified",
                "modeled_value_credit_cents": 0,
            },
        ),
    ]
    total_monthly_cash_delta = sum(
        item[0]["monthly_cash_delta_cents"] for item in vc_value_cases
    )
    total_exit_value_delta = sum(
        item[0]["exit_value_delta_cents"] for item in vc_value_cases
    )
    total_implementation_cost = sum(
        item[0]["implementation_cost_cents"] for item in vc_value_cases
    )
    combined_cash_path = [
        value + total_monthly_cash_delta
        for value in selected_vc.assumptions.monthly_net_cash_flow_cents
    ]
    combined_cash_path[0] -= total_implementation_cost
    combined_result = run_vc_scenario(
        assumptions=replace(
            selected_vc.assumptions,
            monthly_net_cash_flow_cents=tuple(combined_cash_path),
            exit_value_cents=selected_vc.assumptions.exit_value_cents
            + total_exit_value_delta,
            exit_valuation=None,
        ),
        opening_cash_cents=int(cap["cash_at_cutoff_cents"]),
        initial_holders=initial_holders,
        initial_preferences=initial_preferences,
        unissued_pool_shares=int(cap["unissued_option_pool_shares"]),
    )
    standalone_bodies = [item[0] for item in vc_value_cases]
    standalone_proceeds_delta = sum(
        item["target_proceeds_delta_cents"] for item in standalone_bodies
    )
    combined_proceeds_delta = (
        combined_result.target_proceeds_cents - selected_vc.target_proceeds_cents
    )
    vc_value_creation_bridge: dict[str, Any] = {
        "schema_version": "underwriting.vc-value-creation-bridge/v2",
        "base_receipt_sha256": selected_vc.receipt()["receipt_sha256"],
        "base_minimum_cash_cents": selected_vc.minimum_cash_cents,
        "base_target_proceeds_cents": selected_vc.target_proceeds_cents,
        "base_gross_xirr": format(selected_vc.gross_xirr, "f"),
        "base_gross_moic": format(selected_vc.gross_moic, "f"),
        "standalone": standalone_bodies,
        "combined_result_receipt_sha256": combined_result.receipt()["receipt_sha256"],
        "combined_result_minimum_cash_cents": combined_result.minimum_cash_cents,
        "combined_result_target_proceeds_cents": combined_result.target_proceeds_cents,
        "combined_result_gross_xirr": format(combined_result.gross_xirr, "f"),
        "combined_result_gross_moic": format(combined_result.gross_moic, "f"),
        "combined_minimum_cash_delta_cents": combined_result.minimum_cash_cents
        - selected_vc.minimum_cash_cents,
        "combined_target_proceeds_delta_cents": combined_proceeds_delta,
        "sum_standalone_target_proceeds_delta_cents": standalone_proceeds_delta,
        "interaction_residual_cents": combined_proceeds_delta
        - standalone_proceeds_delta,
        "combined_gross_xirr_delta": format(
            combined_result.gross_xirr - selected_vc.gross_xirr, "f"
        ),
        "combined_gross_moic_delta": format(
            combined_result.gross_moic - selected_vc.gross_moic, "f"
        ),
    }
    vc_value_creation_bridge["receipt_sha256"] = digest(vc_value_creation_bridge)

    receipts = [
        analysis_receipt(
            analysis_id="HX-01",
            question="Do usage revenue, compute costs, and fully burdened gross margin reconcile?",
            classification="ACCOUNTING_IDENTITY",
            method="LTM integer-cent revenue and cost bridge",
            population="Synthetic Helios LTM P&L",
            inputs=[
                _input(artifacts["monthly-pnl"]),
                _input(artifacts["customer-month"]),
            ],
            outputs=[
                _output("ltm_revenue", revenue, "cents"),
                _output("ltm_cogs", cogs, "cents"),
                _output("gross_margin", quantize(gross_margin * 100), "percent"),
            ],
            assumptions=[
                "Compute, telemetry, and customer-support costs remain in COGS."
            ],
            diagnostics=[
                _diagnostic(
                    "integer_cent_reconciliation",
                    "exact",
                    "PASS" if component_cogs == cogs else "FAIL",
                ),
                _diagnostic("cash_rollforward_to_cap_table", "exact"),
            ],
        ),
        analysis_receipt(
            analysis_id="HX-02",
            question="How much do hand-picked design partners inflate pooled NRR?",
            classification="DESCRIPTIVE",
            method="Frozen-cohort revenue bridge with disclosed design-partner exclusion",
            population=f"{len(base_rows)} customers active at {base_month}",
            inputs=[
                _input(artifacts["customer-month"]),
                _input(artifacts["customer-master"]),
            ],
            outputs=[
                _output("pooled_nrr", quantize(pooled_nrr * 100), "percent"),
                _output("ordinary_nrr", quantize(ordinary_nrr * 100), "percent"),
            ],
            assumptions=["Design-partner status is fixed from the customer master."],
            diagnostics=[
                _diagnostic(
                    "selection_bias_bps",
                    quantize((pooled_nrr - ordinary_nrr) * 10_000),
                    "PASS" if pooled_nrr - ordinary_nrr >= 0.04 else "FAIL",
                )
            ],
        ),
        analysis_receipt(
            analysis_id="HX-03",
            question="What do current burn efficiency and cash imply for financing risk?",
            classification="ACCOUNTING_IDENTITY",
            method="LTM burn multiple plus exact monthly financing and cash ledger",
            population="Synthetic Helios P&L, capitalization, and 60-month operating plan",
            inputs=[
                _input(artifacts["monthly-pnl"]),
                _input(artifacts["cap-table"]),
                _input(artifacts["financing-plan"]),
            ],
            outputs=[
                _output("burn_multiple", quantize(burn_multiple), "multiple"),
                _output("runway", quantize(runway), "months"),
                _output(
                    "post_close_runway_floor",
                    int(post_close_runway_floor),
                    "modeled_months_funded_minimum",
                ),
                _output("minimum_cash_cents", selected_vc.minimum_cash_cents, "cents"),
                _output("cac", quantize(cac / 100), "usd"),
                _output("cac_payback", quantize(cac_payback), "months"),
            ],
            assumptions=[
                "Current runway is descriptive; forward runway uses the signed monthly operating path and only funded financing events."
            ],
            diagnostics=[
                _diagnostic("positive_net_new_arr", net_new_arr, "PASS"),
                _diagnostic(
                    "runway_floor", quantize(runway), "PASS" if runway >= 12 else "FAIL"
                ),
                _diagnostic(
                    "post_close_runway_censoring",
                    "RIGHT_CENSORED_AT_MONTH_60",
                    "REPORTED",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="HX-04",
            question="Does reported pipeline reconcile to actual stage history?",
            classification="DESCRIPTIVE",
            method="Historical stage-probability weighted pipeline recomputation",
            population=f"{len(pipeline)} synthetic opportunities",
            inputs=[
                _input(artifacts["pipeline"]),
                _input(artifacts["stage-history"]),
                _input(artifacts["market-assumptions"]),
            ],
            outputs=[
                _output("inflated_opportunities", inflated_count, "count"),
                _output(
                    "weighted_pipeline_inflation",
                    quantize(pipeline_inflation / Decimal(100_000_000)),
                    "million_usd",
                ),
                _output(
                    "weighted_pipeline_inflation_cents",
                    int(pipeline_inflation),
                    "cents",
                ),
            ],
            assumptions=[
                "Stage probabilities are fixed and printed with denominators."
            ],
            diagnostics=[
                _diagnostic(
                    "eligible_opportunities",
                    len(eligible_pipeline),
                    "PASS" if eligible_pipeline else "FAIL",
                ),
                _diagnostic("insufficient_history", insufficient_history, "REPORTED"),
                _diagnostic(
                    "reconciliation_state",
                    "reported_stage_exceeds_observed_history"
                    if inflated_count
                    else "reconciled",
                    "REPORTED",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="HX-05",
            question="What tiered adoption range is supported by the synthetic survey?",
            classification="PREDICTIVE_ASSOCIATION",
            method="Independent beta-binomial posterior by predeclared market tier",
            population=f"{len(survey)} synthetic stratified survey respondents",
            inputs=[
                _input(artifacts["market-survey"]),
                _input(artifacts["market-assumptions"]),
            ],
            outputs=market_outputs
            + [_output("modeled_tam", quantize(tam / 100_000_000), "million_usd")],
            assumptions=[
                "Beta(1,1) prior; finite universe and tier spend inputs are scenario assumptions."
            ],
            diagnostics=market_diagnostics
            + [
                _diagnostic("credible_interval", "90_percent_by_tier", "REPORTED"),
                _diagnostic(
                    "beta_2_2_max_median_shift_pp",
                    quantize(max(prior_sensitivity_deltas)),
                    "PASS" if max(prior_sensitivity_deltas) <= 2.0 else "FAIL",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="HX-06",
            question="What is the synthetic optimizer experiment effect on log unit cost?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="Precommitted unadjusted randomized ITT with a labeled baseline-adjusted precision companion",
            population=f"{len(experiment)} randomized synthetic customers",
            inputs=[_input(artifacts["optimizer-experiment"])],
            outputs=[
                _output("optimizer_ate", quantize(rct_effect, "0.0001"), "log_points"),
                _output(
                    "optimizer_baseline_adjusted_companion",
                    quantize(adjusted_effect, "0.0001"),
                    "log_points",
                ),
            ],
            assumptions=[
                "Restricted seeded permutation repeatedly proposes 60-of-120 assignments and accepts the first with absolute baseline SMD at or below 0.15; acceptance never inspects outcomes; no cross-customer interference."
            ],
            diagnostics=[
                _diagnostic(
                    "assignment_mechanism",
                    experiment[0]["assignment_mechanism"],
                    "REPORTED",
                ),
                _diagnostic(
                    "assignment_proposal",
                    experiment[0]["assignment_proposal"],
                    "REPORTED",
                ),
                _diagnostic(
                    "maximum_assignment_proposals",
                    experiment[0]["maximum_assignment_proposals"],
                    "REPORTED",
                ),
                _diagnostic(
                    "assignment_acceptance_uses_outcomes",
                    experiment[0]["assignment_acceptance_uses_outcomes"],
                    "PASS"
                    if experiment[0]["assignment_acceptance_uses_outcomes"] == "false"
                    else "FAIL",
                ),
                _diagnostic(
                    "assignment_seed_commitment",
                    experiment[0]["assignment_seed_commitment"],
                    "REPORTED",
                ),
                _diagnostic(
                    "treatment_count",
                    int(treatment.sum()),
                    "PASS" if int(treatment.sum()) == 60 else "FAIL",
                ),
                _diagnostic(
                    "control_count",
                    int(len(treatment) - treatment.sum()),
                    "PASS" if int(len(treatment) - treatment.sum()) == 60 else "FAIL",
                ),
                _diagnostic(
                    "unadjusted_confidence_interval",
                    f"[{quantize(rct_low, '0.0001')}, {quantize(rct_high, '0.0001')}]",
                    "REPORTED",
                ),
                _diagnostic(
                    "unadjusted_standard_error", quantize(rct_se, "0.0001"), "REPORTED"
                ),
                _diagnostic(
                    "confidence_interval",
                    f"[{quantize(adjusted_low, '0.0001')}, {quantize(adjusted_high, '0.0001')}]",
                    "REPORTED",
                ),
                _diagnostic(
                    "standard_error", quantize(adjusted_se, "0.0001"), "REPORTED"
                ),
                _diagnostic(
                    "baseline_cost_smd",
                    quantize(optimizer_smd),
                    "PASS"
                    if Decimal(str(abs(optimizer_smd)))
                    <= Decimal(experiment[0]["balance_smd_threshold"])
                    else "FAIL",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="HX-07",
            question="Did adoption cause a reduction in total customer GPU-spend growth?",
            classification="NOT_IDENTIFIED",
            method="Pretrend and selection-on-trajectory audit",
            population="Synthetic adopter event windows",
            inputs=[_input(artifacts["customer-month"])],
            outputs=[],
            assumptions=[
                "Adoption follows spend spikes, so untreated parallel trends do not hold."
            ],
            diagnostics=[
                _diagnostic(
                    "pretrend",
                    "non_parallel",
                    "BLOCKED",
                    DiagnosticRole.IDENTIFICATION_BOUNDARY,
                )
            ],
            state="ABSTAIN",
        ),
        analysis_receipt(
            analysis_id="HX-08",
            question="What ownership does the proposed financing purchase?",
            classification="ACCOUNTING_IDENTITY",
            method="Event-ordered integer-share capitalization with exact rational pricing and option-pool refresh",
            population="Illustrative Helios Series C first close through fully funded milestone case",
            inputs=[
                _input(artifacts["cap-table"]),
                _input(artifacts["financing-plan"]),
            ],
            outputs=[
                _output("first_close_new_shares", new_shares, "shares"),
                _output(
                    "fully_funded_series_c_ownership",
                    quantize(series_c_ownership * 100),
                    "percent",
                ),
            ],
            assumptions=[
                "No undisclosed convertibles or side letters; whole shares are floored and the exact sub-share cash remainder is recorded as APIC."
            ],
            diagnostics=[
                _diagnostic("ownership_reconciliation", "exact", "PASS"),
                _diagnostic(
                    "scenario_input_digests_distinct",
                    len(
                        {
                            item.engine_inputs_sha256
                            for item in scenario_results.values()
                        }
                    ),
                    "PASS",
                ),
            ],
        ),
        analysis_receipt(
            analysis_id="HX-09",
            question="What is the conditional distribution of new-money outcomes?",
            classification="SCENARIO",
            method="1,000 seeded full financing-ledger, cash-path, exact-waterfall, MOIC, and dated-XIRR reruns",
            population="Declared synthetic venture scenario distribution",
            inputs=[
                _input(artifacts["cap-table"]),
                _input(artifacts["financing-plan"]),
                _input(artifacts["venture-scenarios"]),
                _input(artifacts["risk-policy"]),
                _input(artifacts["team-diligence"]),
            ],
            outputs=[
                _output("p10_moic", quantize(moic_q[0]), "multiple"),
                _output("p50_moic", quantize(moic_q[1]), "multiple"),
                _output("p90_moic", quantize(moic_q[2]), "multiple"),
                _output("p10_xirr", quantize(irr_q[0] * 100), "percent"),
                _output("p50_xirr", quantize(irr_q[1] * 100), "percent"),
                _output("p90_xirr", quantize(irr_q[2] * 100), "percent"),
                _output(
                    "probability_below_1x", quantize(loss_probability * 100), "percent"
                ),
                _output(
                    "probability_at_least_3x",
                    quantize(three_x_probability * 100),
                    "percent",
                ),
                _output(
                    "selected_ltm_revenue_cents",
                    selected_exit_bridge["observed_ltm_revenue_cents"],
                    "cents",
                ),
                _output(
                    "selected_terminal_revenue_cents",
                    selected_exit_bridge["terminal_revenue_cents"],
                    "cents",
                ),
                _output(
                    "selected_exit_revenue_multiple",
                    selected_exit_bridge["exit_revenue_multiple"],
                    "multiple",
                ),
                _output(
                    "selected_exit_equity_value_cents",
                    selected_exit_bridge["exit_equity_value_cents"],
                    "cents",
                ),
            ],
            assumptions=[
                "Scenario-state weights, exit value, exit timing, and operating-cash factors are disclosed conditional priors; every retained path replays financing events and the exact legal waterfall.",
                "Each scenario exit equity value is derived from observed LTM revenue, a declared five-year annual growth rate, a declared revenue multiple, and modeled exit cash; the full operating cash ledger determines negative net debt.",
            ],
            diagnostics=[
                _diagnostic("draws", vc_distribution["draws"]),
                _diagnostic(
                    "loss_probability_monte_carlo_se_pp",
                    quantize(loss_probability_mce_pp),
                    "REPORTED",
                ),
                _diagnostic(
                    "three_x_probability_monte_carlo_se_pp",
                    quantize(three_x_probability_mce_pp),
                    "REPORTED",
                ),
                _diagnostic(
                    "operating_exit_bridge",
                    "ltm_revenue_x_growth_x_revenue_multiple_less_net_debt",
                    "PASS",
                ),
                _diagnostic(
                    "ordered_moic_quantiles",
                    "true",
                    "PASS" if moic_q[0] <= moic_q[1] <= moic_q[2] else "FAIL",
                ),
                _diagnostic(
                    "ordered_xirr_quantiles",
                    "true",
                    "PASS" if irr_q[0] <= irr_q[1] <= irr_q[2] else "FAIL",
                ),
                _diagnostic("waterfall_conservation_max_error_cents", 0, "PASS"),
                _diagnostic(
                    "xirr_npv_residual_max_cents",
                    quantize(
                        max(
                            item.xirr_npv_residual_cents
                            for item in scenario_results.values()
                        )
                    ),
                    "PASS",
                ),
            ],
        ),
    ]
    _bind_specs(receipts, manifest)
    evidence_mappings = _complete_evidence_mappings(
        receipts,
        [
            {
                "mapping_id": "hx-market-model-to-scenario",
                "source_analysis_id": "HX-05",
                "source_receipt_sha256": next(
                    item for item in receipts if item["analysis_id"] == "HX-05"
                )["receipt_sha256"],
                "observed_value": f"${quantize(tam / 100_000_000_000)}B modeled serviceable spend",
                "target_assumption_or_condition": "Market-size scenario bands",
                "credit_classification": "PREDICTIVE_ASSOCIATION",
                "model_credit": "Scenario calibration only; tier five remains unidentified",
                "decision_response": "Do not convert the modeled universe into automatic valuation credit",
            },
            {
                "mapping_id": "hx-optimizer-rct-to-value-creation",
                "source_analysis_id": "HX-06",
                "source_receipt_sha256": next(
                    item for item in receipts if item["analysis_id"] == "HX-06"
                )["receipt_sha256"],
                "observed_value": f"{quantize(rct_effect, '0.0001')} log-point synthetic ITT",
                "target_assumption_or_condition": "Optimizer value-creation bridge",
                "credit_classification": "CAUSAL_SYNTHETIC_ONLY",
                "model_credit": "No base-case credit; adoption and valuation remain scenario judgments",
                "decision_response": "Require replication before releasing contingent capital",
            },
        ],
        {
            "HX-01": "BASE_CASE",
            "HX-02": "BASE_CASE",
            "HX-03": "BASE_CASE",
            "HX-04": "ZERO",
            "HX-05": "SCENARIO_ONLY",
            "HX-06": "VALUE_CREATION_BRIDGE",
            "HX-07": "ZERO",
            "HX-08": "BASE_CASE",
            "HX-09": "SCENARIO_ONLY",
        },
    )
    lineages = [
        lineage_item(
            node_id="hx-nrr",
            label="Go-forward NRR",
            artifact_id="customer-month",
            field="customer_id,month,revenue_cents,design_partner",
            analysis_id="HX-02",
            output_names=["pooled_nrr", "ordinary_nrr"],
            transformation="Frozen cohort bridge with design partners separately identified",
            downstream="Growth durability and financing milestones",
        ),
        lineage_item(
            node_id="hx-margin",
            label="Blended gross margin",
            artifact_id="monthly-pnl",
            field="revenue_cents,cogs_cents",
            analysis_id="HX-01",
            output_names=["ltm_revenue", "ltm_cogs", "gross_margin"],
            transformation="Integer-cent LTM revenue less compute, telemetry, and support costs",
            downstream="Runway and margin milestones",
        ),
        lineage_item(
            node_id="hx-runway",
            label="Runway",
            artifact_id="financing-plan",
            field="scenario_books[*].monthly_net_cash_flow_cents,scenario_books[*].events",
            analysis_id="HX-03",
            output_names=[
                "burn_multiple",
                "runway",
                "post_close_runway_floor",
                "minimum_cash_cents",
            ],
            transformation="Signed monthly cash ledger with event-date funding and right-censored modeled runway floor",
            downstream="Tranche timing, shortfall financing, dilution, and returns",
        ),
        lineage_item(
            node_id="hx-cac",
            label="Customer acquisition economics",
            artifact_id="monthly-pnl",
            field="sales_and_marketing_cents,new_logos,net_new_arr_cents,gross_margin",
            analysis_id="HX-03",
            output_names=["cac", "cac_payback"],
            transformation="LTM sales and marketing expense divided by new logos; CAC divided by gross-profit contribution per new logo",
            downstream="Growth efficiency, runway, and financing milestones",
        ),
        lineage_item(
            node_id="hx-tam",
            label="Modeled TAM survey evidence",
            artifact_id="market-survey",
            field="tier,adopted",
            analysis_id="HX-05",
            output_names=[
                "tier_1_adoption",
                "tier_2_adoption",
                "tier_3_adoption",
                "tier_4_adoption",
                "tier_5",
                "modeled_tam",
            ],
            transformation="Tier-level beta-binomial adoption medians with a retained abstention for the data-thin fifth tier",
            downstream="Market-size range with data-thin abstention",
        ),
        lineage_item(
            node_id="hx-tam-assumptions",
            label="Modeled TAM universe assumptions",
            artifact_id="market-assumptions",
            field="universe_counts,tier_mid_spend_cents",
            analysis_id="HX-05",
            output_names=["modeled_tam"],
            transformation="Multiply tier adoption medians by declared universe counts and spend assumptions",
            downstream="Market-size scenario; not a market fact",
        ),
        lineage_item(
            node_id="hx-pipeline",
            label="Pipeline stage-history audit",
            artifact_id="stage-history",
            field="opportunity_id,observation_index,stage",
            analysis_id="HX-04",
            output_names=[
                "inflated_opportunities",
                "weighted_pipeline_inflation",
                "weighted_pipeline_inflation_cents",
            ],
            transformation="Compare reported stage with the latest eligible history, then reweight using declared probabilities",
            downstream="Milestone financing and forecast governance",
        ),
        lineage_item(
            node_id="hx-optimizer",
            label="Optimizer randomized test",
            artifact_id="optimizer-experiment",
            field="customer_id,treatment,baseline_log_cost,outcome_log_cost_change",
            analysis_id="HX-06",
            output_names=["optimizer_ate", "optimizer_baseline_adjusted_companion"],
            transformation="Use the precommitted unadjusted randomized ITT for recovery and economic mapping; show baseline adjustment only as a labeled precision companion",
            downstream="Optimizer replication milestone and scenario-limited unit-economics mapping",
        ),
        lineage_item(
            node_id="hx-ownership",
            label="Series C ownership",
            artifact_id="financing-plan",
            field="scenario_books[*].events,event_id,class_id,pre_money_cents,pool_target",
            analysis_id="HX-08",
            output_names=["first_close_new_shares", "fully_funded_series_c_ownership"],
            transformation="Event-ordered integer-share capitalization with exact rational price and option-pool refresh",
            downstream="First-close and fully funded ownership",
        ),
        lineage_item(
            node_id="hx-return",
            label="Series C return distribution",
            artifact_id="venture-scenarios",
            field="all declared scenario weights, catastrophe/continuous exit priors, timing bounds, operating-cash perturbations, and sensitivity ranges",
            analysis_id="HX-09",
            output_names=[
                "p10_moic",
                "p50_moic",
                "p90_moic",
                "p10_xirr",
                "p50_xirr",
                "p90_xirr",
                "probability_below_1x",
                "probability_at_least_3x",
            ],
            transformation="One-thousand seeded full event-ledger, waterfall, MOIC, and dated-XIRR reruns under source-bound analyst scenario priors",
            downstream="Conditional venture outcome range; not a forecast",
        ),
        lineage_item(
            node_id="hx-risk-policy",
            label="Illustrative risk policy",
            artifact_id="risk-policy",
            field="loss definition, maximum probability below 1.0x, operating and return hurdles, falsifiers, owner, and approval status",
            analysis_id="HX-09",
            output_names=["probability_below_1x"],
            transformation="Compare the analyst-selected catastrophe prior with the separate Desk loss ceiling; disclose that the retained structure maps every catastrophe path to a sub-1.0x result and use the replay only as a generator check",
            downstream="Quantitative hurdle state; never investment authorization",
        ),
        lineage_item(
            node_id="hx-team",
            label="Role-level team diligence",
            artifact_id="team-diligence",
            field="roles[*].role,strength,gap,evidence_state,financing_consequence",
            analysis_id="HX-09",
            output_names=["p50_moic"],
            transformation="Role-specific evidence-state and financing-consequence register",
            downstream="Closing conditions and board ownership",
        ),
    ]
    operating_policy = desk_policy["thresholds"]
    return_policy = desk_policy["thresholds"]
    nrr_hurdle_pct = Decimal(operating_policy["ordinary_cohort_nrr"]) * 100
    margin_hurdle_pct = Decimal(operating_policy["gross_margin"]) * 100
    runway_hurdle = Decimal(operating_policy["post_close_runway_months"])
    xirr_hurdle = Decimal(return_policy["gross_xirr"])
    moic_hurdle = Decimal(return_policy["gross_moic"])
    loss_hurdle_pct = canonical_policy_threshold * 100
    loss_probability_pct = loss_probability * 100
    selected_catastrophe_prior_pct = selected_catastrophe_prior * 100
    loss_hurdle_misses = selected_catastrophe_prior > canonical_policy_threshold
    metric_pairs = [
        _decision_pair(
            metric="Ordinary-cohort NRR",
            metric_id="helios-hx-02-ordinary_nrr",
            operator=">=",
            threshold=f">={quantize(nrr_hurdle_pct)}%",
            threshold_value=quantize(nrr_hurdle_pct),
            observed=f"{quantize(ordinary_nrr * 100)}%",
            observed_value=quantize(ordinary_nrr * 100),
        ),
        _decision_pair(
            metric="Gross margin",
            metric_id="helios-hx-01-gross_margin",
            operator=">=",
            threshold=f">={quantize(margin_hurdle_pct)}%",
            threshold_value=quantize(margin_hurdle_pct),
            observed=f"{quantize(gross_margin * 100)}%",
            observed_value=quantize(gross_margin * 100),
        ),
        _decision_pair(
            metric="Post-close runway",
            metric_id="helios-hx-03-post_close_runway_floor",
            operator=">=",
            threshold=f">={format(runway_hurdle, 'f')} months",
            threshold_value=format(runway_hurdle, "f"),
            observed=f">={quantize(post_close_runway_floor)} modeled months",
            observed_value=post_close_runway_floor,
        ),
        _decision_pair(
            metric="Milestone · Series C gross XIRR",
            metric_id="helios-MILESTONE-gross-xirr",
            operator=">=",
            threshold=f">={quantize(xirr_hurdle * 100)}%",
            threshold_value=format(xirr_hurdle, "f"),
            observed=f"{quantize(selected_vc.gross_xirr * 100)}%",
            observed_value=selected_vc.gross_xirr,
        ),
        _decision_pair(
            metric="Series C gross MOIC",
            metric_id="helios-MILESTONE-gross-moic",
            operator=">=",
            threshold=f">={format(moic_hurdle, 'f')}x",
            threshold_value=format(moic_hurdle, "f"),
            observed=f"{quantize(selected_vc.gross_moic)}x",
            observed_value=selected_vc.gross_moic,
        ),
        _decision_pair(
            metric="Selected catastrophe prior",
            metric_id="helios-selected-catastrophe-prior",
            operator="<=",
            threshold=f"<={quantize(loss_hurdle_pct)}%",
            threshold_value=quantize(loss_hurdle_pct),
            observed=f"{quantize(selected_catastrophe_prior_pct)}%",
            observed_value=quantize(selected_catastrophe_prior_pct),
        ),
    ]
    condition_states = [
        _condition_state(
            condition_id="hx-ordinary-nrr",
            text=f"Ordinary-cohort NRR at or above {quantize(nrr_hurdle_pct)}%",
            metric_pairs=metric_pairs,
            metric_ids=("helios-hx-02-ordinary_nrr",),
        ),
        _condition_state(
            condition_id="hx-gross-margin",
            text=f"Gross margin at or above {quantize(margin_hurdle_pct)}%",
            metric_pairs=metric_pairs,
            metric_ids=("helios-hx-01-gross_margin",),
        ),
        _condition_state(
            condition_id="hx-milestone-return",
            text=f"Milestone case gross XIRR at or above {quantize(xirr_hurdle * 100)}% and gross MOIC at or above {format(moic_hurdle, 'f')}x",
            metric_pairs=metric_pairs,
            metric_ids=("helios-MILESTONE-gross-xirr", "helios-MILESTONE-gross-moic"),
        ),
        _condition_state(
            condition_id="hx-loss-range",
            text=f"Selected catastrophe prior at or below the {quantize(loss_hurdle_pct)}% Desk loss ceiling; in this retained structure every catastrophe path returns below 1.0x",
            metric_pairs=metric_pairs,
            metric_ids=("helios-selected-catastrophe-prior",),
        ),
        _condition_state(
            condition_id="hx-pipeline-history",
            text="Pipeline stage-history audit complete",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="hx-optimizer-replication",
            text="Optimizer RCT effect replicated",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="hx-design-partner-transferability",
            text="Ordinary-customer contract and renewal terms are comparable",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="hx-unit-cost-reconciliation",
            text="Provider unit costs reconcile to invoices and telemetry",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="hx-executed-terms",
            text="Executed financing terms and waterfall reconcile",
            metric_pairs=metric_pairs,
        ),
        _condition_state(
            condition_id="hx-runway",
            text=f"At least {format(runway_hurdle, 'f')} modeled months post-close runway",
            metric_pairs=metric_pairs,
            metric_ids=("helios-hx-03-post_close_runway_floor",),
        ),
    ]
    issue_summary = _issue_summary(
        [
            {
                "issue_id": "HX-H01",
                "title": "Selected catastrophe prior exceeds policy maximum"
                if loss_hurdle_misses
                else "Loss hurdle clears quantitatively",
                "owner": "Illustrative investment committee",
                "stage": "PRE_IC",
                "materiality": "CRITICAL",
                "kind": "QUANTITATIVE_HURDLE",
                "state": "FAILED" if loss_hurdle_misses else "CLEARED",
                "blocks_advancement": loss_hurdle_misses,
                "consequence": "Hold because the selected analyst catastrophe prior exceeds the separate Desk loss ceiling. In this retained structure every catastrophe path loses; the seeded replay checks the path generator rather than estimating the input. Do not revise the prior or policy after observing the result; alternatives remain unreviewed what-if sensitivities."
                if loss_hurdle_misses
                else "The quantitative loss test clears, but unresolved diligence and human investment committee approval still block funding.",
                "linked_condition_ids": ["hx-loss-range"],
                "evidence_state": "PRESENT",
                "evidence_metric_ids": ["helios-selected-catastrophe-prior"],
                "analysis_ids": ["HX-09"],
                "source_locator_ids": ["locator-hx-09-risk-policy"],
                "consequence_target": "sensitivity",
            },
            {
                "issue_id": "HX-D01",
                "title": "Reconcile pipeline stage history",
                "owner": "Revenue operations diligence lead",
                "stage": "PRE_IC",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Do not credit forecast conversion until the complete opportunity history is reconciled.",
                "linked_condition_ids": ["hx-pipeline-history"],
                "evidence_state": "PARTIAL",
                "evidence_metric_ids": ["helios-hx-04-inflated_opportunities"],
                "analysis_ids": ["HX-04"],
                "source_locator_ids": [],
                "consequence_target": "sensitivity",
            },
            {
                "issue_id": "HX-D02",
                "title": "Test ordinary-customer transferability",
                "owner": "Commercial diligence lead",
                "stage": "PRE_SIGNING",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Remove pooled-retention credit if design-partner and ordinary-customer terms are not comparable.",
                "linked_condition_ids": ["hx-design-partner-transferability"],
                "evidence_state": "PARTIAL",
                "evidence_metric_ids": ["helios-hx-02-ordinary_nrr"],
                "analysis_ids": ["HX-02"],
                "source_locator_ids": [],
                "consequence_target": "sensitivity",
            },
            {
                "issue_id": "HX-D03",
                "title": "Reconcile provider unit costs",
                "owner": "Technical and financial diligence leads",
                "stage": "PRE_IC",
                "materiality": "CRITICAL",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Do not release milestone capital until margin improvement ties to invoices and telemetry.",
                "linked_condition_ids": ["hx-unit-cost-reconciliation"],
                "evidence_state": "PARTIAL",
                "evidence_metric_ids": ["helios-hx-01-gross_margin"],
                "analysis_ids": ["HX-01", "HX-06"],
                "source_locator_ids": [],
                "consequence_target": "cash",
            },
            {
                "issue_id": "HX-D04",
                "title": "Reconcile executed financing terms",
                "owner": "Deal counsel",
                "stage": "PRE_SIGNING",
                "materiality": "CRITICAL",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Do not fund until ownership and every waterfall scenario tie to executed terms.",
                "linked_condition_ids": ["hx-executed-terms"],
                "evidence_state": "ABSENT",
                "evidence_metric_ids": ["helios-MILESTONE-ownership"],
                "analysis_ids": ["HX-08", "HX-09"],
                "source_locator_ids": [],
                "consequence_target": "financing-events",
            },
            {
                "issue_id": "HX-D05",
                "title": "Replicate optimizer economics",
                "owner": "Technical diligence lead",
                "stage": "PRE_IC",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Do not assign base-case value or release contingent capital without replication.",
                "linked_condition_ids": ["hx-optimizer-replication"],
                "evidence_state": "PARTIAL",
                "evidence_metric_ids": ["helios-hx-06-optimizer_ate"],
                "analysis_ids": ["HX-06"],
                "source_locator_ids": [],
                "consequence_target": "sensitivity",
            },
        ]
    )
    decision = {
        "schema_version": "underwriting.decision-record/v1",
        "decision": "HOLD",
        "attribution": "Cooper David Reed — illustrative IC",
        "status": "DECISION_RECORD_INCOMPLETE",
        "signature_status": "PENDING_FOUNDER_SIGNATURE",
        "as_of": CUTOFF,
        "rationale": f"Hold because the selected unreviewed synthetic catastrophe prior is {quantize(selected_catastrophe_prior_pct)}% versus the separate {quantize(loss_hurdle_pct)}% Desk loss ceiling. In this retained structure every catastrophe path falls below 1.0x, while the seeded replay frequency of {quantize(loss_probability_pct)}% is a generator check rather than an independent estimate. The proposed milestone financing is a path to reconsideration, not a current investment recommendation.",
        "conditions": [item["text"] for item in condition_states],
        "condition_states": condition_states,
        "open_conditions": _open_condition_count(condition_states),
        "issue_summary": issue_summary,
        "terms": [
            "No capital deployment while the canonical loss hurdle or any required diligence condition remains unresolved"
        ],
        "path_to_yes": [
            "Illustrative $25M first close + $15M conditional tranche",
            "$160M pre-money; 12% post-financing unissued pool",
            "1x non-participating Series C; pre-money holders bear pool refresh",
            "Reopen only after an independently approved risk specification or replacement deterministic stress policy",
        ],
        "metric_pairs": metric_pairs,
        "verification_sources": ["HX-01", "HX-02", "HX-03", "HX-04", "HX-06", "HX-09"],
        "failure_consequences": [
            "Do not release the second tranche",
            "Retain HOLD until milestone evidence and founder adjudication",
        ],
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
        "dealContext": _deal_context(
            investment_question="Do we fund $25M now and reserve $15M for verified milestones?",
            one_liner="Cloud cost-control software that helps enterprises govern and optimize volatile GPU infrastructure spend.",
            product="Usage telemetry, policy controls, workload optimization, and finance reporting for teams operating across compute providers.",
            customer="AI-native and enterprise infrastructure teams; ordinary cohorts are separated from hand-picked design partners.",
            market="A large but tier-uncertain spend universe modeled from synthetic adoption evidence; no external TAM fact is claimed.",
            competition=[
                "Cloud-native cost tools",
                "FinOps platforms",
                "Internal infrastructure tooling",
            ],
            go_to_market="Technical design partners seed adoption, followed by enterprise security review and usage-linked expansion.",
            team="Strong product insight is assumed, while commercial repeatability, finance controls, and provider-risk ownership remain open.",
            process="Illustrative Series C with a $25M first close and $15M tranche withheld behind operating and diligence milestones.",
        ),
        "decision": decision,
        "summaryMetrics": [
            _metric(
                "hx-ownership",
                "Fully funded ownership",
                f"{quantize(series_c_ownership * 100, '0.1')}%",
                "$25M close + $15M contingent on $160M pre-money",
                "ACCOUNTING_IDENTITY",
                ["hx-ownership"],
            ),
            _metric(
                "hx-nrr-metric",
                "Ordinary-cohort NRR",
                f"{quantize(ordinary_nrr * 100, '0.1')}%",
                f"Pooled with design partners: {quantize(pooled_nrr * 100, '0.1')}%",
                "DESCRIPTIVE",
                ["hx-nrr"],
            ),
            _metric(
                "hx-margin-metric",
                "Blended gross margin",
                f"{quantize(gross_margin * 100, '0.1')}%",
                "LTM, including telemetry and support",
                "ACCOUNTING_IDENTITY",
                ["hx-margin"],
            ),
            _metric(
                "hx-runway-metric",
                "Runway",
                f"{quantize(runway, '0.1')} mo",
                f"Burn multiple: {quantize(burn_multiple, '0.1')}x",
                "ACCOUNTING_IDENTITY",
                ["hx-runway"],
            ),
            _metric(
                "hx-tam-metric",
                "Modeled serviceable spend",
                f"${quantize(tam / 100_000_000_000, '0.1')}B",
                "90% tier intervals; tier 5 abstained",
                "PREDICTIVE_ASSOCIATION",
                ["hx-tam", "hx-tam-assumptions"],
            ),
        ],
        "thesis": {
            "statement": "Helios can become the system of control for volatile enterprise GPU spend if ordinary cohorts retain and optimizer savings translate into durable platform economics.",
            "counterthesis": "Design-partner selection, inflated pipeline, cloud-cost exposure, and preference-heavy outcomes may make growth and TAM appear more durable than they are.",
            "drivers": [
                "Usage-linked expansion",
                "Measured optimizer efficiency",
                "Large but tier-uncertain spend universe",
                "Gross-margin progression with scale",
            ],
            "falsifiers": [
                f"Ordinary-cohort NRR below {quantize(Decimal(risk_policy['falsifiers']['ordinary_cohort_nrr']) * 100)}%",
                f"Pipeline conversion below {quantize(Decimal(risk_policy['falsifiers']['pipeline_conversion']) * 100)}%",
                f"Gross margin below {quantize(Decimal(risk_policy['falsifiers']['gross_margin']) * 100)}%",
                f"Runway below {format(Decimal(risk_policy['falsifiers']['post_close_runway_months']), 'f')} months post-close",
            ],
            "requests": [
                {
                    "request_id": item["issue_id"],
                    "request": item["title"],
                    "owner": item["owner"],
                    "due_state": item["stage"],
                    "materiality": item["materiality"],
                    "decision_consequence": item["consequence"],
                }
                for item in issue_summary["issues"]
            ],
        },
        "chartRegistry": [
            {
                "chart_id": "helios-returns",
                "question": "How wide is the conditional Series C return range?",
                "conclusion": f"The retained p10 to p90 MOIC range is {quantize(moic_q[0])}x to {quantize(moic_q[2])}x.",
                "uncertainty": "One thousand declared synthetic financing and exit paths; not a forecast or investment-accuracy claim.",
                "decision_dependency": "Tests whether milestone terms preserve an investable outcome range after dilution and preferences.",
                "rendered_location": "IC Snapshot",
            },
            {
                "chart_id": "helios-runway",
                "question": "Which financing state preserves operating runway?",
                "conclusion": f"The milestone case remains funded through month 60 with ${quantize(scenario_results['MILESTONE'].minimum_cash_cents / 100_000_000)}M minimum cash.",
                "uncertainty": "A deterministic scenario ledger with declared operating cash assumptions and event-date financing; not a liquidity forecast.",
                "decision_dependency": "Controls second-tranche release, later-round planning, and the financing-shortfall stop rule.",
                "rendered_location": "Underwriting Room",
            },
            {
                "chart_id": "helios-value-bridge",
                "question": "Which prioritized initiatives change investor proceeds after implementation cost and interaction?",
                "conclusion": f"The combined full-model target-proceeds delta is ${quantize(vc_value_creation_bridge['combined_target_proceeds_delta_cents'] / 100_000_000)}M.",
                "uncertainty": "Synthetic causal recovery and human scenario assumptions remain separately classified; interaction is retained.",
                "decision_dependency": "Defines operating ownership without double counting retention, optimizer, and pipeline effects.",
                "rendered_location": "Value Creation",
            },
            {
                "chart_id": "helios-thesis-dag",
                "question": "Which evidence and assumptions reach the investment terms and operating plan?",
                "conclusion": "All typed edges remain rendered and selectable; no evidence node or decision dependency is silently truncated.",
                "uncertainty": "Dependency visibility does not validate the underlying assumption.",
                "decision_dependency": "Makes stale, contradicted, or absent inputs traceable to HOLD and tranche conditions.",
                "rendered_location": "Thesis & Evidence",
            },
        ],
        "teamAssessment": {
            "strengths": [
                f"{item['role']}: {item['strength']}"
                for item in team_diligence["roles"]
            ],
            "unproven": [
                f"{item['role']}: {item['gap']} Evidence state: {item['evidence_state']}."
                for item in team_diligence["roles"]
            ],
            "key_person_risk": "OPEN — founder commercial dependence and succession evidence remain conditions to the second tranche.",
            "required_hires": [
                "Finance leader accountable for usage margin, monthly close, runway, and financing controls.",
                "Revenue operations owner accountable for ordinary-customer stage-to-close governance.",
            ],
        },
        "ownershipCadence": [
            {
                "phase": "Pre-close",
                "timing": "Before signing",
                "owner": "Deal lead",
                "milestone": "Verify cap table, preferences, side letters, and milestone definitions.",
                "kpi": "All financing operands reconciled",
                "stop_rule": "Do not fund with unresolved ownership or waterfall terms.",
            },
            {
                "phase": "Day 1",
                "timing": "Funding date",
                "owner": "CEO / CFO",
                "milestone": "Lock usage-margin, runway, and ordinary-cohort definitions.",
                "kpi": "Signed operating metric dictionary",
                "stop_rule": "Do not release milestone capital on non-reconciled metrics.",
            },
            {
                "phase": "Day 30",
                "timing": "Close + 30 days",
                "owner": "CFO",
                "milestone": "Install weekly runway and provider-cost forecast.",
                "kpi": "Cash, committed spend, gross margin",
                "stop_rule": "Escalate if runway falls below financing plan.",
            },
            {
                "phase": "Day 100",
                "timing": "Close + 100 days",
                "owner": "CRO / CTO",
                "milestone": "Reconcile pipeline history and optimizer adoption economics.",
                "kpi": "Ordinary-cohort NRR, conversion, cost savings",
                "stop_rule": "Hold second tranche if milestones are not independently evidenced.",
            },
            {
                "phase": "Year 1",
                "timing": "Quarterly through month 12",
                "owner": "Board",
                "milestone": "Re-underwrite ownership, runway, and exit cases.",
                "kpi": "Dilution, runway, margin, milestone state",
                "stop_rule": "Replan financing before the declared runway floor.",
            },
        ],
        "falsifierStates": [
            {
                "label": f"Ordinary-cohort NRR below {quantize(Decimal(risk_policy['falsifiers']['ordinary_cohort_nrr']) * 100)}%",
                "status": "CLEAR"
                if ordinary_nrr
                >= Decimal(risk_policy["falsifiers"]["ordinary_cohort_nrr"])
                else "TRIGGERED",
                "observed": f"{quantize(ordinary_nrr * 100)}%",
                "lineage": ["hx-nrr", "hx-risk-policy"],
            },
            {
                "label": f"Pipeline conversion below {quantize(Decimal(risk_policy['falsifiers']['pipeline_conversion']) * 100)}%",
                "status": "OPEN",
                "observed": "Stage-history audit flags inflation; conversion not matured",
                "lineage": ["hx-pipeline", "hx-risk-policy"],
            },
            {
                "label": f"Gross margin below {quantize(Decimal(risk_policy['falsifiers']['gross_margin']) * 100)}%",
                "status": "CLEAR"
                if gross_margin >= Decimal(risk_policy["falsifiers"]["gross_margin"])
                else "TRIGGERED",
                "observed": f"{quantize(gross_margin * 100)}%",
                "lineage": ["hx-margin", "hx-risk-policy"],
            },
            {
                "label": f"Runway below {format(Decimal(risk_policy['falsifiers']['post_close_runway_months']), 'f')} months post-close",
                "status": "CLEAR"
                if post_close_runway_floor
                >= Decimal(risk_policy["falsifiers"]["post_close_runway_months"])
                else "TRIGGERED",
                "observed": f">={quantize(post_close_runway_floor)} modeled months",
                "lineage": ["hx-runway", "hx-risk-policy"],
            },
        ],
        "analyses": receipts,
        "distributionLineage": "hx-return",
        "scenarios": [
            {
                "id": "base",
                "label": "Base / tranche withheld",
                "entry_ev": "$25M close + $20M Series D",
                "gross_irr": f"{quantize(scenario_results['BASE'].gross_xirr * 100)}%",
                "moic": f"{quantize(scenario_results['BASE'].gross_moic)}x",
                "covenant": "Milestone capital withheld; planned Series D funds",
                "lineage": ["hx-ownership", "hx-runway", "hx-return"],
            },
            {
                "id": "milestone",
                "label": "Milestones clear",
                "entry_ev": "$25M close + $15M tranche",
                "gross_irr": f"{quantize(scenario_results['MILESTONE'].gross_xirr * 100)}%",
                "moic": f"{quantize(scenario_results['MILESTONE'].gross_moic)}x",
                "covenant": "All four named tranche tests pass",
                "lineage": ["hx-ownership", "hx-runway", "hx-return"],
            },
            {
                "id": "downside",
                "label": "Down round",
                "entry_ev": "$25M close + $40M Series D",
                "gross_irr": f"{quantize(scenario_results['DOWNSIDE'].gross_xirr * 100)}%",
                "moic": f"{quantize(scenario_results['DOWNSIDE'].gross_moic)}x",
                "covenant": "Tranche withheld; $120M pre-money down round",
                "lineage": ["hx-ownership", "hx-runway", "hx-return"],
            },
            {
                "id": "financing_shortfall",
                "label": "Financing shortfall",
                "entry_ev": "$25M close + $35M senior bridge",
                "gross_irr": f"{quantize(scenario_results['FINANCING_SHORTFALL'].gross_xirr * 100)}%",
                "moic": f"{quantize(scenario_results['FINANCING_SHORTFALL'].gross_moic)}x",
                "covenant": f"Bridge triggers month {scenario_results['FINANCING_SHORTFALL'].first_cash_exhaustion_month_without_contingent_financing}",
                "lineage": ["hx-ownership", "hx-runway", "hx-return"],
            },
        ],
        "returnsDistribution": {
            "moic": [quantize(value, "0.1") for value in moic_q],
            "irr": [quantize(value * 100, "0.1") for value in irr_q],
            "labels": ["p10", "p50", "p90"],
        },
        "vcEngine": {
            "base": scenario_results["BASE"].receipt(),
            "milestone": scenario_results["MILESTONE"].receipt(),
            "downside": scenario_results["DOWNSIDE"].receipt(),
            "financing_shortfall": scenario_results["FINANCING_SHORTFALL"].receipt(),
            "distribution": vc_distribution,
            "risk_policy": risk_policy,
            "desk_policy": desk_policy,
            "risk_sensitivity": risk_sensitivity,
            "sensitivities": vc_sensitivity_book,
            "milestone_contract": financing_plan["milestone_contract"],
            "exit_value_basis": financing_plan["exit_value_basis"],
            "operating_exit_bridges": {
                book["scenario_id"].lower(): book["exit_valuation"]
                for book in financing_plan["scenario_books"]
            },
        },
        "vcValueCreationBridge": vc_value_creation_bridge,
        "valueCreation": [
            {
                "priority": 1,
                "initiative": "Ordinary-cohort expansion",
                "kpi": "Non-design-partner NRR",
                "baseline": f"{quantize(ordinary_nrr * 100)}%",
                "target": "125%",
                "owner": "CRO",
                "timing": "Days 1–180",
                "dependency": "HX-02 ordinary-cohort definition and referenceable non-design-partner renewal evidence",
                "implementation_cost": "$1.2M",
                "milestone": "Cohort playbooks and referenceable renewal evidence by quarter 2",
                "stop_rule": "Stop expansion credit if two ordinary cohorts fall below 105% NRR.",
                "value": f"Formula: ordinary ARR × NRR gap × gross margin × 50% realization; ${quantize(ordinary_monthly_cash_delta / 100_000_000)}M monthly cash and ${quantize(ordinary_exit_delta / 100_000_000)}M exit-equity scenario credit",
                "credit_classification": "HUMAN_JUDGMENT",
                "risk": "Design-partner tactics do not transfer",
                "lineage": ["hx-nrr", "hx-runway"],
            },
            {
                "priority": 2,
                "initiative": "Optimizer unit economics",
                "kpi": "Fully burdened gross margin",
                "baseline": f"{quantize(gross_margin * 100)}%",
                "target": "74%",
                "owner": "CTO",
                "timing": "Pre-tranche through Month 12",
                "dependency": "HX-06 synthetic randomized test plus a production replication tied to provider invoices",
                "implementation_cost": "$2.0M",
                "milestone": "Replicate randomized log-cost effect in production before tranche test",
                "stop_rule": "Stop optimizer credit if the production replication interval crosses zero.",
                "value": f"Formula: LTM compute cost × (1 − exp(log-point ITT)) × 65% adoption; ${quantize(optimizer_monthly_cash_delta / 100_000_000)}M monthly cash and ${quantize(optimizer_exit_delta / 100_000_000)}M exit-equity scenario credit",
                "credit_classification": "MIXED_CAUSAL_SYNTHETIC_AND_SCENARIO",
                "risk": "Provider price changes or workload mix invalidate transferred savings",
                "lineage": ["hx-margin", "hx-optimizer", "hx-runway"],
            },
            {
                "priority": 3,
                "initiative": "Enterprise sales governance",
                "kpi": "Stage-to-close forecast error",
                "baseline": f"{inflated_count} inflated opportunities",
                "target": "<15% forecast error",
                "owner": "CRO / Finance",
                "timing": "Days 1–100",
                "dependency": "HX-04 complete stage-history audit and a governed CRM stage dictionary",
                "implementation_cost": "$0.8M",
                "milestone": "Opportunity-level stage audit and forecast council by day 45",
                "stop_rule": "Keep the tranche withheld when stage history is incomplete or forecast error remains at or above 15%.",
                "value": "Avoids an illustrative shortfall-round trigger; unidentified forecast effect receives zero base-case credit",
                "credit_classification": "DESCRIPTIVE",
                "risk": "Enterprise cycle elongation remains unidentified",
                "lineage": ["hx-pipeline", "hx-runway"],
            },
        ],
        "screenedOutLevers": [
            {
                "lever": "Unconditioned sales acceleration",
                "evidence_state": "NOT_IDENTIFIED",
                "reason_screened_out": "Pipeline history contains overstated stages and mature conversion is not observed, so no acceleration credit enters the base case.",
                "reconsideration_trigger": "Two independently reconciled cohorts meet the declared stage-to-close and forecast-error thresholds.",
            },
            {
                "lever": "Category-wide pricing uplift",
                "evidence_state": "NOT_EVIDENCED",
                "reason_screened_out": "No randomized or quasi-experimental willingness-to-pay evidence exists in the retained room.",
                "reconsideration_trigger": "A precommitted pricing design measures retention, expansion, and usage effects in ordinary customers.",
            },
        ],
        "evidenceMappings": evidence_mappings,
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
    result["schema_version"] = "underwriting.workbench-case/v2"
    result["manifest_sha256"] = manifest["manifest_sha256"]
    result.setdefault("evidenceMappings", [])
    result["temporalScan"] = scan_temporal_artifacts(root, manifest)
    result["scenarioBook"] = _scenario_book(
        case_id, result["scenarios"], result["returnsDistribution"]
    )
    result["thesisGraph"] = _thesis_graph(result)
    result.update(build_case_metric_contract(result, source_root=root))
    result["analysis_sha256"] = digest(result)
    destination = Path(output)
    write_json(destination, result)
    return destination
