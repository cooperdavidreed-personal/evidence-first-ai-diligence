from __future__ import annotations

from copy import deepcopy

import pytest

from underwriting_lab.analysis import analyze_room
from underwriting_lab.contracts import UnderwritingError, digest, read_json, validate_workbench_case
from underwriting_lab.generator import generate_room


@pytest.fixture(scope="module")
def atlasgrid_v2(tmp_path_factory: pytest.TempPathFactory) -> dict:
    root = tmp_path_factory.mktemp("atlasgrid-v2-contract")
    manifest = generate_room("atlasgrid", 20260828, root)
    return read_json(analyze_room(manifest, root / "analysis.json"))


def _rebind_case(case: dict) -> None:
    case.pop("analysis_sha256", None)
    case["analysis_sha256"] = digest(case)


def test_v2_case_has_complete_metric_formula_and_locator_contract(atlasgrid_v2: dict) -> None:
    validate_workbench_case(atlasgrid_v2)
    assert len(atlasgrid_v2["renderManifest"]["formula_sample_metric_ids"]) == 10
    assert len(atlasgrid_v2["metricRegistry"]) > 1_000
    assert atlasgrid_v2["temporalScan"]["excluded_rows"] == 1
    assert [item["phase"] for item in atlasgrid_v2["ownershipCadence"]] == [
        "Pre-close", "Day 1", "Day 30", "Day 100", "Year 1"
    ]
    assert "OPEN" in atlasgrid_v2["teamAssessment"]["key_person_risk"]


def test_formula_tamper_fails_after_rebinding_outer_digests(atlasgrid_v2: dict) -> None:
    case = deepcopy(atlasgrid_v2)
    output_id = case["renderManifest"]["formula_sample_metric_ids"][0]
    metric = next(item for item in case["metricRegistry"] if item["metric_id"] == output_id)
    metric["value"] = str(int(metric["value"]) + 1)
    metric.pop("metric_sha256")
    metric["metric_sha256"] = digest(metric)
    _rebind_case(case)
    with pytest.raises(UnderwritingError, match="formula_value_mismatch"):
        validate_workbench_case(case)


def test_metric_locator_orphan_fails_closed(atlasgrid_v2: dict) -> None:
    case = deepcopy(atlasgrid_v2)
    metric = case["metricRegistry"][0]
    metric["source_locator_ids"] = ["missing-locator"]
    metric.pop("metric_sha256")
    metric["metric_sha256"] = digest(metric)
    _rebind_case(case)
    with pytest.raises(UnderwritingError, match="metric_source_locator_orphan"):
        validate_workbench_case(case)


def test_inner_distribution_path_tamper_fails_even_when_outer_digest_is_rebound(atlasgrid_v2: dict) -> None:
    case = deepcopy(atlasgrid_v2)
    distribution = case["peEngine"]["distribution"]
    distribution["path_records"][0]["ending_debt_cents"] += 1
    distribution.pop("receipt_sha256")
    distribution["receipt_sha256"] = digest(distribution)
    _rebind_case(case)
    with pytest.raises(UnderwritingError, match="pe_distribution_path_digest_mismatch"):
        validate_workbench_case(case)
