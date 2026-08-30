from __future__ import annotations

import csv
import json
import shutil
from copy import deepcopy
from pathlib import Path

import pytest

from underwriting_lab.analysis import analyze_room
from underwriting_lab.generator import generate_room
from underwriting_lab.verification import RECOVERY_STATES, evaluate_recovery


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def verification_cases(tmp_path_factory: pytest.TempPathFactory) -> dict[str, tuple[dict, dict, Path]]:
    root = tmp_path_factory.mktemp("recovery-verification")
    cases: dict[str, tuple[dict, dict, Path]] = {}
    for case_id, seed in (("atlasgrid", 20260828), ("helios", 20260829)):
        case_root = root / case_id
        manifest_path = generate_room(case_id, seed, case_root)
        analysis_path = analyze_room(manifest_path, case_root / "analysis.json")
        truth_path = case_root / "verification" / "truth" / "ground_truth.json"
        cases[case_id] = (_json(analysis_path), _json(truth_path), case_root)
    return cases


def test_recovery_evaluator_uses_only_typed_recovery_states(
    verification_cases: dict[str, tuple[dict, dict, Path]],
) -> None:
    for case_id, (case, truth, _) in verification_cases.items():
        checks = evaluate_recovery(case_id, case, truth)
        assert checks
        assert {check["status"] for check in checks}.issubset(RECOVERY_STATES)
        assert all(check["status"] != "FAILED_RECOVERY" for check in checks)


def test_recovery_evaluator_fails_closed_on_missing_interval(
    verification_cases: dict[str, tuple[dict, dict, Path]],
) -> None:
    case, truth, _ = verification_cases["atlasgrid"]
    tampered = deepcopy(case)
    receipt = next(item for item in tampered["analyses"] if item["analysis_id"] == "AG-07")
    receipt["diagnostics"] = [item for item in receipt["diagnostics"] if item["name"] != "confidence_interval"]
    checks = evaluate_recovery("atlasgrid", tampered, truth)
    pricing = next(item for item in checks if item["analysis_id"] == "AG-07")
    assert pricing["status"] == "FAILED_RECOVERY"
    assert "analysis_diagnostic_count:AG-07:confidence_interval:0" in pricing["failure_reason"]


def test_recovery_evaluator_fails_closed_on_missing_truth_parameter(
    verification_cases: dict[str, tuple[dict, dict, Path]],
) -> None:
    case, truth, _ = verification_cases["helios"]
    tampered_truth = deepcopy(truth)
    tampered_truth.pop("optimizer_ate_log_cost")
    checks = evaluate_recovery("helios", case, tampered_truth)
    optimizer = next(item for item in checks if item["analysis_id"] == "HX-06")
    assert optimizer["status"] == "FAILED_RECOVERY"
    assert optimizer["failure_reason"] == "optimizer_ate_log_cost"


def test_recovery_evaluator_fails_closed_on_wrong_effect_sign(
    verification_cases: dict[str, tuple[dict, dict, Path]],
) -> None:
    case, truth, _ = verification_cases["atlasgrid"]
    tampered = deepcopy(case)
    receipt = next(item for item in tampered["analyses"] if item["analysis_id"] == "AG-07")
    next(item for item in receipt["outputs"] if item["name"] == "renewal_itt")["value"] = "5.00"
    check = next(item for item in evaluate_recovery("atlasgrid", tampered, truth) if item["analysis_id"] == "AG-07")
    assert check["status"] == "FAILED_RECOVERY"


def test_pipeline_weighted_residual_must_match_truth_cents(
    verification_cases: dict[str, tuple[dict, dict, Path]],
) -> None:
    case, truth, _ = verification_cases["helios"]
    tampered = deepcopy(case)
    receipt = next(item for item in tampered["analyses"] if item["analysis_id"] == "HX-04")
    next(item for item in receipt["outputs"] if item["name"] == "weighted_pipeline_inflation_cents")["value"] = "1"
    check = next(
        item
        for item in evaluate_recovery("helios", tampered, truth)
        if item["analysis_id"] == "HX-04" and item["estimand"] == "weighted_pipeline_inflation_cents"
    )
    assert check["status"] == "FAILED_RECOVERY"


def test_runtime_analysis_has_no_verification_truth_dependency() -> None:
    source = (Path(__file__).parents[1] / "src" / "underwriting_lab" / "analysis.py").read_text(encoding="utf-8")
    forbidden = {
        "ground_truth",
        "price_rct_ate",
        "support_resolution_att_hours",
        "support_churn_att_bps",
        "optimizer_ate_log_cost",
        "pipeline_inflated_count",
        "market_adoption_rates",
    }
    assert all(token not in source for token in forbidden)
    assert "from .verification" not in source
    assert "verification/truth" not in source

    cli_source = (Path(__file__).parents[1] / "src" / "underwriting_lab" / "cli.py").read_text(encoding="utf-8")
    prefix = cli_source.split('if args.command == "verify-estimator-coverage":', maxsplit=1)[0]
    assert "from .verification" not in prefix


def test_analysis_is_byte_identical_after_truth_tree_is_removed(tmp_path: Path) -> None:
    room = tmp_path / "truth-isolation"
    manifest = generate_room("helios", 20260829, room)
    first_path = analyze_room(manifest, tmp_path / "with-truth.json")
    first = first_path.read_bytes()
    shutil.rmtree(room / "verification" / "truth")
    second_path = analyze_room(manifest, tmp_path / "without-truth.json")
    assert second_path.read_bytes() == first


def test_runtime_pipeline_omits_planted_answer_columns(
    verification_cases: dict[str, tuple[dict, dict, Path]],
) -> None:
    _, _, root = verification_cases["helios"]
    with (root / "case" / "data" / "pipeline.csv").open(newline="", encoding="utf-8") as handle:
        columns = set(next(csv.DictReader(handle)).keys())
    assert columns.isdisjoint({"actual_stage", "inflated"})
