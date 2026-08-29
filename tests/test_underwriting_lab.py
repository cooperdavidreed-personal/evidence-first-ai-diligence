from __future__ import annotations

import json
from importlib import resources
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from underwriting_lab.analysis import analyze_room
from underwriting_lab.contracts import UnderwritingError, analysis_receipt, digest
from underwriting_lab.generator import generate_room


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _schema(name: str) -> dict:
    target = resources.files("underwriting_lab.schemas").joinpath(name)
    return json.loads(target.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def generated(tmp_path_factory: pytest.TempPathFactory) -> dict[str, tuple[Path, dict]]:
    root = tmp_path_factory.mktemp("underwriting")
    result: dict[str, tuple[Path, dict]] = {}
    for case_id, seed in (("atlasgrid", 20260828), ("helios", 20260829)):
        manifest = generate_room(case_id, seed, root / case_id)
        analysis_path = analyze_room(manifest, root / case_id / "analysis.json")
        result[case_id] = (manifest, _json(analysis_path))
    return result


def test_underwriting_schemas_are_valid() -> None:
    for name in (
        "dataroom-manifest.schema.json",
        "analysis-receipt.schema.json",
        "decision-record.schema.json",
        "scenario-book.schema.json",
        "thesis-graph.schema.json",
    ):
        Draft202012Validator.check_schema(_schema(name))


def test_generated_manifests_and_outputs_validate(generated: dict[str, tuple[Path, dict]]) -> None:
    manifest_validator = Draft202012Validator(_schema("dataroom-manifest.schema.json"), format_checker=Draft202012Validator.FORMAT_CHECKER)
    receipt_validator = Draft202012Validator(_schema("analysis-receipt.schema.json"), format_checker=Draft202012Validator.FORMAT_CHECKER)
    decision_validator = Draft202012Validator(_schema("decision-record.schema.json"))
    for manifest_path, analysis in generated.values():
        manifest_validator.validate(_json(manifest_path))
        decision_validator.validate(analysis["decision"])
        for receipt in analysis["analyses"]:
            receipt_validator.validate(receipt)


def test_same_seed_is_byte_deterministic_and_different_seed_changes_digest(tmp_path: Path) -> None:
    first = generate_room("helios", 77, tmp_path / "first")
    second = generate_room("helios", 77, tmp_path / "second")
    different = generate_room("helios", 78, tmp_path / "different")
    first_root, second_root = first.parent, second.parent
    first_files = sorted(path.relative_to(first_root) for path in first_root.rglob("*") if path.is_file())
    second_files = sorted(path.relative_to(second_root) for path in second_root.rglob("*") if path.is_file())
    assert first_files == second_files
    assert all((first_root / path).read_bytes() == (second_root / path).read_bytes() for path in first_files)
    assert _json(first)["manifest_sha256"] != _json(different)["manifest_sha256"]


def test_analysis_repeat_is_byte_identical(generated: dict[str, tuple[Path, dict]], tmp_path: Path) -> None:
    for case_id, (manifest, _) in generated.items():
        first = analyze_room(manifest, tmp_path / f"{case_id}-first.json")
        second = analyze_room(manifest, tmp_path / f"{case_id}-second.json")
        assert first.read_bytes() == second.read_bytes()


def test_truth_is_outside_runtime_case_and_not_serialized(generated: dict[str, tuple[Path, dict]]) -> None:
    for manifest_path, analysis in generated.values():
        assert "verification" not in manifest_path.read_text(encoding="utf-8")
        assert "ground_truth" not in manifest_path.read_text(encoding="utf-8")
        assert "master_seed" not in json.dumps(analysis, sort_keys=True)
        assert (manifest_path.parents[1] / "verification" / "truth" / "ground_truth.json").is_file()


def test_atlasgrid_contract_gates(generated: dict[str, tuple[Path, dict]]) -> None:
    _, case = generated["atlasgrid"]
    assert case["decision"]["decision"] == "REPRICE"
    metrics = {item["metric_id"]: item for item in case["summaryMetrics"]}
    assert float(metrics["ag-return"]["value"].rstrip("%")) >= 22
    assert float(metrics["ag-return"]["detail"].split("x")[0]) >= 2
    receipts = {item["analysis_id"]: item for item in case["analyses"]}
    assert receipts["AG-02"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["AG-05"]["diagnostics"][1]["status"] == "PASS"
    assert receipts["AG-07"]["diagnostics"][1]["status"] == "PASS"
    assert receipts["AG-08"]["diagnostics"][2]["status"] == "PASS"
    assert receipts["AG-09"]["state"] == "ABSTAIN"
    assert receipts["AG-10"]["diagnostics"][0]["status"] == "PASS"


def test_helios_contract_gates(generated: dict[str, tuple[Path, dict]]) -> None:
    _, case = generated["helios"]
    assert case["decision"]["decision"] == "INVEST"
    receipts = {item["analysis_id"]: item for item in case["analyses"]}
    assert receipts["HX-02"]["diagnostics"][0]["status"] == "PASS"
    assert receipts["HX-04"]["diagnostics"][0]["value"] == "48"
    assert any(item["status"] == "ABSTAIN" for item in receipts["HX-05"]["diagnostics"])
    assert receipts["HX-06"]["diagnostics"][1]["status"] == "PASS"
    assert receipts["HX-07"]["state"] == "ABSTAIN"
    assert receipts["HX-08"]["diagnostics"][0]["status"] == "PASS"


def test_every_headline_metric_has_valid_lineage(generated: dict[str, tuple[Path, dict]]) -> None:
    for _, case in generated.values():
        lineage_ids = {item["node_id"] for item in case["lineage"]}
        assert len(lineage_ids) == len(case["lineage"])
        for metric in case["summaryMetrics"]:
            assert metric["lineage"]
            assert set(metric["lineage"]).issubset(lineage_ids)


def test_decision_and_receipt_digests_are_bound(generated: dict[str, tuple[Path, dict]]) -> None:
    for _, case in generated.values():
        decision = dict(case["decision"])
        expected = decision.pop("decision_sha256")
        assert expected == digest(decision)
        for source in case["analyses"]:
            receipt = dict(source)
            expected = receipt.pop("receipt_sha256")
            assert expected == digest(receipt)


def test_classification_rules_fail_closed() -> None:
    with pytest.raises(UnderwritingError, match="predictive_uncertainty_required"):
        analysis_receipt(
            analysis_id="ZZ-01",
            question="Does an association exist in the frozen sample?",
            classification="PREDICTIVE_ASSOCIATION",
            method="OLS",
            population="synthetic sample",
            inputs=[],
            outputs=[],
            assumptions=[],
            diagnostics=[],
        )
    with pytest.raises(UnderwritingError, match="causal_assignment_required"):
        analysis_receipt(
            analysis_id="ZZ-02",
            question="What is the causal synthetic treatment effect?",
            classification="CAUSAL_SYNTHETIC_ONLY",
            method="RCT",
            population="synthetic sample",
            inputs=[],
            outputs=[],
            assumptions=[],
            diagnostics=[{"name": "confidence_interval", "value": "[0,1]", "status": "PASS"}],
        )
