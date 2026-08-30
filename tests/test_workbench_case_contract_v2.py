from __future__ import annotations

import json
from pathlib import Path

import pytest

from underwriting_lab.analysis import analyze_room
from underwriting_lab.contracts import UnderwritingError, digest, validate_workbench_case
from underwriting_lab.generator import generate_room


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def cases(tmp_path_factory: pytest.TempPathFactory) -> dict[str, dict]:
    root = tmp_path_factory.mktemp("v2-editorial-contract")
    results: dict[str, dict] = {}
    for case_id, seed in (("atlasgrid", 20260828), ("helios", 20260829)):
        manifest = generate_room(case_id, seed, root / case_id)
        output = analyze_room(manifest, root / f"{case_id}.json")
        results[case_id] = _read(output)
    return results


def _clone(document: dict) -> dict:
    return json.loads(json.dumps(document))


def _rebind(case: dict) -> None:
    case.pop("analysis_sha256", None)
    case["analysis_sha256"] = digest(case)


def test_v2_editorial_collections_are_typed_and_prioritized(cases: dict[str, dict]) -> None:
    for case in cases.values():
        validate_workbench_case(case)
        assert 3 <= len(case["valueCreation"]) <= 5
        assert [item["priority"] for item in case["valueCreation"]] == list(
            range(1, len(case["valueCreation"]) + 1)
        )
        assert len({item["request_id"] for item in case["thesis"]["requests"]}) == len(
            case["thesis"]["requests"]
        )
        assert len({item["chart_id"] for item in case["chartRegistry"]}) == len(
            case["chartRegistry"]
        )
        assert len({item["lever"] for item in case["screenedOutLevers"]}) == len(
            case["screenedOutLevers"]
        )


def test_every_analysis_output_has_stable_metric_and_lineage(cases: dict[str, dict]) -> None:
    for case in cases.values():
        metrics = {item["metric_id"]: item for item in case["metricRegistry"]}
        for receipt in case["analyses"]:
            for output in receipt["outputs"]:
                metric_id = (
                    f"{case['caseId']}-{receipt['analysis_id'].lower()}-{output['name']}"
                )
                metric = metrics[metric_id]
                assert metric["value"] == output["value"]
                assert metric["governing_receipt_sha256"] == receipt["receipt_sha256"]
                inputs = {(item["artifact_id"], item["sha256"]) for item in receipt["inputs"]}
                expected_locators = {
                    item["locator_id"]
                    for item in case["sourceLocators"]
                    if item["analysis_id"] == receipt["analysis_id"]
                    and (item["artifact_id"], item["artifact_sha256"]) in inputs
                }
                assert expected_locators
                assert set(metric["source_locator_ids"]) == expected_locators


@pytest.mark.parametrize(
    ("collection", "identifier", "error"),
    (
        ("chartRegistry", "chart_id", "chart_registry_duplicate"),
        ("screenedOutLevers", "lever", "screened_out_lever_duplicate"),
    ),
)
def test_editorial_identifier_duplicates_fail_closed(
    cases: dict[str, dict], collection: str, identifier: str, error: str
) -> None:
    case = _clone(cases["helios"])
    case[collection][1][identifier] = case[collection][0][identifier]
    _rebind(case)
    with pytest.raises(UnderwritingError, match=error):
        validate_workbench_case(case)


def test_diligence_request_duplicates_fail_closed(cases: dict[str, dict]) -> None:
    case = _clone(cases["helios"])
    case["thesis"]["requests"][1]["request_id"] = case["thesis"]["requests"][0][
        "request_id"
    ]
    _rebind(case)
    with pytest.raises(UnderwritingError, match="diligence_request_duplicate"):
        validate_workbench_case(case)


def test_value_creation_priorities_fail_closed(cases: dict[str, dict]) -> None:
    case = _clone(cases["helios"])
    case["valueCreation"][1]["priority"] = 1
    _rebind(case)
    with pytest.raises(UnderwritingError, match="value_creation_priorities_invalid"):
        validate_workbench_case(case)


def test_missing_analysis_output_metric_fails_closed(cases: dict[str, dict]) -> None:
    case = _clone(cases["helios"])
    missing_id = "helios-hx-05-tier_5"
    case["metricRegistry"] = [
        item for item in case["metricRegistry"] if item["metric_id"] != missing_id
    ]
    _rebind(case)
    with pytest.raises(UnderwritingError, match=f"analysis_output_metric_missing:{missing_id}"):
        validate_workbench_case(case)
