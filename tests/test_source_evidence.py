from __future__ import annotations

import json
from pathlib import Path

import pytest

from underwriting_lab.analysis import analyze_room
from underwriting_lab.contracts import UnderwritingError, digest, read_json
from underwriting_lab.generator import generate_room
from underwriting_lab.source_evidence import verify_source_evidence

from scripts.sync_portfolio_source_rooms import verify_or_update


@pytest.mark.parametrize(
    ("case_id", "seed", "expected_pairs"),
    [("atlasgrid", 20260828, 24), ("helios", 20260829, 21)],
)
def test_every_analysis_input_has_resolvable_granular_source_evidence(
    tmp_path: Path,
    case_id: str,
    seed: int,
    expected_pairs: int,
) -> None:
    manifest = generate_room(case_id, seed, tmp_path / case_id)
    case = read_json(analyze_room(manifest, tmp_path / f"{case_id}.json"))
    expected = {
        (receipt["analysis_id"], item["artifact_id"])
        for receipt in case["analyses"]
        for item in receipt["inputs"]
    }
    observed = {
        (locator["analysis_id"], locator["artifact_id"])
        for locator in case["sourceLocators"]
    }
    assert expected == observed
    assert len(observed) == expected_pairs
    for locator in case["sourceLocators"]:
        assert locator["schema_version"] == "underwriting.source-locator/v3"
        assert digest(locator["retained_excerpt"]) == locator["excerpt_sha256"]
        assert locator["repository_path"].startswith(
            f"portfolio/{case_id}/data-room/data/"
        )
        assert locator["published_path"].startswith(f"source-pack/{case_id}/data/")
        assert not locator["published_path"].startswith("/")
        if locator["locator_kind"] == "CSV_CELLS":
            assert locator["selector"]["selected_row_count"] > 0
            assert locator["selector"]["selected_cell_count"] > 0
            assert len(locator["retained_excerpt"]["rows"]) == 3


def test_source_room_update_verify_and_tamper_detection(tmp_path: Path) -> None:
    manifest = generate_room("helios", 20260829, tmp_path / "generated")
    canonical = tmp_path / "canonical"
    mirror = tmp_path / "mirror"
    assert verify_or_update(manifest, canonical, mirror, update=True)["status"] == "PASS"
    assert verify_or_update(manifest, canonical, mirror, update=False)["status"] == "PASS"
    source = canonical / "data" / "monthly_pnl.csv"
    source.write_text(source.read_text(encoding="utf-8") + "tamper\n", encoding="utf-8")
    with pytest.raises(ValueError, match="source_room_digest_mismatch"):
        verify_or_update(manifest, canonical, mirror, update=False)


def test_source_room_rejects_truth_path(tmp_path: Path) -> None:
    manifest_path = generate_room("helios", 20260829, tmp_path / "generated")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["artifacts"].append(
        {
            "artifact_id": "truth",
            "path": "verification/truth/ground_truth.json",
            "rows": 1,
            "schema": "forbidden",
            "sha256": "0" * 64,
        }
    )
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="source_room_path_unsafe"):
        verify_or_update(
            manifest_path,
            tmp_path / "canonical",
            tmp_path / "mirror",
            update=True,
        )


def test_locator_excerpt_tampering_fails_case_validation(tmp_path: Path) -> None:
    manifest = generate_room("helios", 20260829, tmp_path / "helios")
    case = read_json(analyze_room(manifest, tmp_path / "helios.json"))
    locator = case["sourceLocators"][0]
    locator["retained_excerpt"]["tampered"] = True
    locator_body = dict(locator)
    locator_body.pop("locator_sha256")
    locator["locator_sha256"] = digest(locator_body)
    body = dict(case)
    body.pop("analysis_sha256")
    case["analysis_sha256"] = digest(body)
    from underwriting_lab.contracts import validate_workbench_case

    with pytest.raises(UnderwritingError, match="source_locator_excerpt_digest_mismatch"):
        validate_workbench_case(case)


def test_source_bound_verifier_rejects_coherently_rehashed_false_locator(tmp_path: Path) -> None:
    manifest = generate_room("helios", 20260829, tmp_path / "helios")
    source_root = manifest.parent
    case = read_json(analyze_room(manifest, tmp_path / "helios.json"))
    locator = case["sourceLocators"][0]
    locator["selector"]["selected_row_count"] += 1
    locator["retained_excerpt"]["rows"][0]["cells"] = {"fabricated": "value"}
    locator["selection_sha256"] = digest({"fabricated": True})
    locator["excerpt_sha256"] = digest(locator["retained_excerpt"])
    locator_body = dict(locator)
    locator_body.pop("locator_sha256")
    locator["locator_sha256"] = digest(locator_body)
    with pytest.raises(UnderwritingError, match="source_locator_source_binding_mismatch"):
        verify_source_evidence(case, source_root)
