from __future__ import annotations

import json
from importlib import resources

import pytest
from jsonschema import Draft202012Validator

from underwriting_lab.contracts import UnderwritingError, analysis_receipt, digest, validate_workbench_case


def _schema(name: str) -> dict:
    target = resources.files("underwriting_lab.schemas").joinpath(name)
    return json.loads(target.read_text(encoding="utf-8"))


def _decision() -> dict:
    decision = {
        "schema_version": "underwriting.decision-record/v1",
        "decision": "REPRICE",
        "attribution": "Cooper David Reed — illustrative IC",
        "status": "DECISION_RECORD_INCOMPLETE",
        "signature_status": "PENDING_FOUNDER_SIGNATURE",
        "as_of": "2026-08-31T23:59:59Z",
        "rationale": "Illustrative economics require repricing and verification before any human adjudication.",
        "terms": ["Entry enterprise value no greater than $210M"],
        "path_to_yes": ["Reprice and complete diligence before review"],
        "metric_pairs": [
            {
                "metric": "Gross IRR",
                "metric_id": "atlasgrid-REPRICE-gross-irr",
                "operator": ">=",
                "threshold": ">=22%",
                "threshold_value": "0.22",
                "observed": "24.0%",
                "observed_value": "0.24",
                "status": "CLEARS",
                "designation": "BINDING",
            }
        ],
        "conditions": ["Founder review remains open"],
        "condition_states": [{
            "condition_id": "founder-review",
            "text": "Founder review remains open",
            "state": "OPEN_DILIGENCE",
            "designation": "BINDING",
            "metric_ids": [],
        }],
        "open_conditions": 1,
        "issue_summary": {
            "schema_version": "underwriting.issue-summary/v1",
            "issues": [{
                "issue_id": "founder-review",
                "title": "Complete investment review",
                "owner": "Deal lead",
                "stage": "PRE_IC",
                "materiality": "HIGH",
                "kind": "DILIGENCE",
                "state": "OPEN",
                "blocks_advancement": True,
                "consequence": "Do not advance the illustrative transaction.",
                "linked_condition_ids": ["founder-review"],
                "evidence_state": "PRESENT",
                "evidence_metric_ids": ["atlasgrid-REPRICE-gross-irr"],
                "analysis_ids": ["AG-10"],
                "source_locator_ids": ["locator-source"],
                "consequence_target": "sensitivity",
            }],
            "buckets": {
                "failed_quantitative_hurdles": [],
                "advancement_blockers": ["founder-review"],
                "pre_ic_requirements": ["founder-review"],
                "pre_signing_requirements": [],
                "pre_debt_commitment_requirements": [],
                "nonblocking_diligence": [],
            },
            "counts": {
                "failed_quantitative_hurdles": 0,
                "advancement_blockers": 1,
                "pre_ic_requirements": 1,
                "pre_signing_requirements": 0,
                "pre_debt_commitment_requirements": 0,
                "nonblocking_diligence": 0,
            },
        },
        "verification_sources": ["AG-10 analysis receipt"],
        "failure_consequences": ["Do not advance the illustrative transaction"],
    }
    decision["decision_sha256"] = digest(decision)
    return decision


def _bound_case() -> dict:
    receipt = analysis_receipt(
        analysis_id="AG-10",
        question="What is the illustrative scenario outcome?",
        classification="SCENARIO",
        method="Deterministic bridge",
        population="Synthetic case",
        inputs=[{"artifact_id": "source", "sha256": "0" * 64}],
        outputs=[{"name": "gross_irr", "value": "24.0", "unit": "percent"}],
        assumptions=["Illustrative inputs only."],
        diagnostics=[],
    )
    graph = {
        "schema_version": "underwriting.thesis-graph/v1",
        "case_id": "atlasgrid",
        "nodes": [
            {"node_id": "estimate", "kind": "ESTIMATE", "label": "Gross IRR", "status": "REPORTED", "references": ["AG-10"]},
            {"node_id": "decision", "kind": "DECISION", "label": "REPRICE", "status": "DECISION_RECORD_INCOMPLETE", "references": []},
        ],
        "edges": [{"from": "estimate", "to": "decision", "relationship": "INFORMS"}],
    }
    graph["graph_sha256"] = digest(graph)
    scenario_book = {
        "schema_version": "underwriting.scenario-book/v1",
        "case_id": "atlasgrid",
        "scenarios": [
            {
                "id": scenario_id,
                "label": scenario_id.title(),
                "entry_ev": "$210M",
                "gross_irr": "24.0%",
                "moic": "2.1x",
                "covenant": "Illustrative",
                "lineage": ["return-lineage"],
            }
            for scenario_id in ("base", "upside", "downside")
        ],
        "distribution": {"labels": ["p10", "p50", "p90"], "moic": ["1.0", "2.1", "3.0"], "irr": ["0", "24", "40"]},
    }
    scenario_book["scenario_sha256"] = digest(scenario_book)
    case = {
        "decision": _decision(),
        "artifacts": [{"artifact_id": "source"}],
        "analyses": [receipt],
        "thesisGraph": graph,
        "scenarioBook": scenario_book,
        "lineage": [
            {
                "node_id": "return-lineage",
                "artifact_id": "source",
                "analysis_id": "AG-10",
                "output_names": ["gross_irr"],
                "transformation": "Declared scenario bridge",
                "downstream": "Illustrative decision",
            }
        ],
        "summaryMetrics": [{"lineage": ["return-lineage"]}],
        "distributionLineage": "return-lineage",
    }
    case["analysis_sha256"] = digest(case)
    return case


def _rebind(case: dict) -> None:
    case.pop("analysis_sha256", None)
    case["analysis_sha256"] = digest(case)


def test_decision_schema_requires_complete_audit_fields() -> None:
    validator = Draft202012Validator(
        _schema("decision-record.schema.json"),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )
    validator.validate(_decision())
    incomplete = _decision()
    incomplete.pop("signature_status")
    errors = list(validator.iter_errors(incomplete))
    assert any(error.validator == "required" for error in errors)


def test_scenario_schema_requires_lineage() -> None:
    validator = Draft202012Validator(_schema("scenario-book.schema.json"))
    scenario_book = _bound_case()["scenarioBook"]
    validator.validate(scenario_book)
    scenario_book["scenarios"][0].pop("lineage")
    errors = list(validator.iter_errors(scenario_book))
    assert any(error.validator == "required" for error in errors)


def test_workbench_contract_rejects_scenario_orphan_lineage() -> None:
    case = _bound_case()
    case["scenarioBook"]["scenarios"][0]["lineage"] = ["missing"]
    scenario = dict(case["scenarioBook"])
    scenario.pop("scenario_sha256")
    case["scenarioBook"]["scenario_sha256"] = digest(scenario)
    _rebind(case)
    with pytest.raises(UnderwritingError, match="scenario_lineage_invalid"):
        validate_workbench_case(case)


def test_workbench_contract_rejects_thesis_graph_cycle() -> None:
    case = _bound_case()
    case["thesisGraph"]["edges"].append(
        {"from": "decision", "to": "estimate", "relationship": "CONDITIONS"}
    )
    graph = dict(case["thesisGraph"])
    graph.pop("graph_sha256")
    case["thesisGraph"]["graph_sha256"] = digest(graph)
    _rebind(case)
    with pytest.raises(UnderwritingError, match="thesis_graph_cycle"):
        validate_workbench_case(case)
