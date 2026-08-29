from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

from ic_evidence_lab.canonical import canonical_json


CONTRACT_VERSION = "underwriting-econometrics/v1"
CUTOFF = "2026-08-31T23:59:59Z"
CLASSIFICATIONS = {
    "ACCOUNTING_IDENTITY",
    "DESCRIPTIVE",
    "PREDICTIVE_ASSOCIATION",
    "CAUSAL_SYNTHETIC_ONLY",
    "SCENARIO",
    "NOT_IDENTIFIED",
    "HUMAN_JUDGMENT",
}
RUNTIME_STATES = {"REPORTED", "DIAGNOSTIC_BLOCKED", "ABSTAIN", "NOT_APPLICABLE"}


class UnderwritingError(ValueError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def digest(document: Any) -> str:
    return sha256_bytes(canonical_json(document))


def quantize(value: float | Decimal, places: str = "0.01") -> str:
    return format(Decimal(str(value)).quantize(Decimal(places), rounding=ROUND_HALF_EVEN), "f")


def write_json(path: Path, document: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_json(document) + b"\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def analysis_receipt(
    *,
    analysis_id: str,
    question: str,
    classification: str,
    method: str,
    population: str,
    inputs: list[dict[str, str]],
    outputs: list[dict[str, str]],
    assumptions: list[str],
    diagnostics: list[dict[str, str]],
    state: str = "REPORTED",
) -> dict[str, Any]:
    if classification not in CLASSIFICATIONS:
        raise UnderwritingError("analysis_classification_invalid")
    if state not in RUNTIME_STATES:
        raise UnderwritingError("analysis_state_invalid")
    if classification == "PREDICTIVE_ASSOCIATION" and not any(
        item["name"] in {"standard_error", "confidence_interval", "credible_interval"}
        for item in diagnostics
    ):
        raise UnderwritingError("predictive_uncertainty_required")
    if classification == "CAUSAL_SYNTHETIC_ONLY" and not any(
        item["name"] == "assignment_mechanism" for item in diagnostics
    ):
        raise UnderwritingError("causal_assignment_required")
    body: dict[str, Any] = {
        "schema_version": "underwriting.analysis-receipt/v1",
        "analysis_id": analysis_id,
        "question": question,
        "classification": classification,
        "method": method,
        "population": population,
        "cutoff": CUTOFF,
        "inputs": inputs,
        "outputs": outputs,
        "assumptions": assumptions,
        "diagnostics": diagnostics,
        "state": state,
    }
    body["receipt_sha256"] = digest(body)
    return body


def lineage_item(
    *,
    node_id: str,
    label: str,
    artifact_id: str,
    field: str,
    analysis_id: str,
    output_names: list[str],
    transformation: str,
    downstream: str,
) -> dict[str, Any]:
    return {
        "node_id": node_id,
        "label": label,
        "artifact_id": artifact_id,
        "field": field,
        "analysis_id": analysis_id,
        "output_names": output_names,
        "transformation": transformation,
        "downstream": downstream,
    }


def validate_workbench_case(case: dict[str, Any]) -> None:
    body = dict(case)
    expected = body.pop("analysis_sha256", None)
    if expected != digest(body):
        raise UnderwritingError("analysis_digest_mismatch")
    artifacts = {item["artifact_id"]: item for item in case["artifacts"]}
    analyses = {item["analysis_id"]: item for item in case["analyses"]}
    if len(artifacts) != len(case["artifacts"]) or len(analyses) != len(case["analyses"]):
        raise UnderwritingError("workbench_identifier_duplicate")
    decision = dict(case["decision"])
    decision_digest = decision.pop("decision_sha256", None)
    if decision_digest != digest(decision):
        raise UnderwritingError("decision_digest_mismatch")
    for receipt in case["analyses"]:
        receipt_body = dict(receipt)
        receipt_digest = receipt_body.pop("receipt_sha256", None)
        if receipt_digest != digest(receipt_body):
            raise UnderwritingError("analysis_receipt_digest_mismatch")
    scenario = dict(case["scenarioBook"])
    scenario_digest = scenario.pop("scenario_sha256", None)
    if scenario_digest != digest(scenario):
        raise UnderwritingError("scenario_digest_mismatch")
    graph = dict(case["thesisGraph"])
    graph_digest = graph.pop("graph_sha256", None)
    if graph_digest != digest(graph):
        raise UnderwritingError("thesis_graph_digest_mismatch")
    graph_nodes = {node["node_id"] for node in case["thesisGraph"]["nodes"]}
    if len(graph_nodes) != len(case["thesisGraph"]["nodes"]):
        raise UnderwritingError("thesis_graph_node_duplicate")
    if any(edge["from"] not in graph_nodes or edge["to"] not in graph_nodes for edge in case["thesisGraph"]["edges"]):
        raise UnderwritingError("thesis_graph_edge_orphan")
    graph_adjacency: dict[str, set[str]] = {node_id: set() for node_id in graph_nodes}
    for edge in case["thesisGraph"]["edges"]:
        graph_adjacency[edge["from"]].add(edge["to"])
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node_id: str) -> None:
        if node_id in visiting:
            raise UnderwritingError("thesis_graph_cycle")
        if node_id in visited:
            return
        visiting.add(node_id)
        for next_id in graph_adjacency[node_id]:
            visit(next_id)
        visiting.remove(node_id)
        visited.add(node_id)

    for graph_node_id in graph_nodes:
        visit(graph_node_id)
    lineage = {item["node_id"]: item for item in case["lineage"]}
    if len(lineage) != len(case["lineage"]):
        raise UnderwritingError("lineage_node_duplicate")
    for item in lineage.values():
        if item["artifact_id"] not in artifacts or item["analysis_id"] not in analyses:
            raise UnderwritingError("lineage_reference_orphan")
        receipt = analyses[item["analysis_id"]]
        input_ids = {source["artifact_id"] for source in receipt["inputs"]}
        output_names = {output["name"] for output in receipt["outputs"]}
        if item["artifact_id"] not in input_ids or not set(item["output_names"]).issubset(output_names):
            raise UnderwritingError("lineage_operand_unbound")
        if not item["transformation"] or not item["downstream"]:
            raise UnderwritingError("lineage_explanation_missing")
    for metric in case["summaryMetrics"]:
        if not metric["lineage"] or not set(metric["lineage"]).issubset(lineage):
            raise UnderwritingError("headline_lineage_invalid")
    for scenario_item in case["scenarioBook"]["scenarios"]:
        if not scenario_item["lineage"] or not set(scenario_item["lineage"]).issubset(lineage):
            raise UnderwritingError("scenario_lineage_invalid")
    if case["distributionLineage"] not in lineage:
        raise UnderwritingError("distribution_lineage_invalid")
