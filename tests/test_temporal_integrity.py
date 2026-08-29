from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path

import pytest

from underwriting_lab.analysis import analyze_room
from underwriting_lab.contracts import CUTOFF, UnderwritingError, digest, read_json, sha256_file, write_json
from underwriting_lab.generator import generate_room
from underwriting_lab.temporal import scan_temporal_artifacts


def _outputs(case: dict, analysis_id: str) -> list[dict[str, str]]:
    return next(item for item in case["analyses"] if item["analysis_id"] == analysis_id)["outputs"]


def _rewrite_pricing(manifest_path: Path, mutate) -> None:
    manifest = read_json(manifest_path)
    root = manifest_path.parent
    artifact = next(item for item in manifest["artifacts"] if item["artifact_id"] == "pricing-experiment")
    path = root / artifact["path"]
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = reader.fieldnames or []
    mutate(rows[-1])
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    artifact["sha256"] = sha256_file(path)
    manifest.pop("manifest_sha256")
    manifest["manifest_sha256"] = digest(manifest)
    write_json(manifest_path, manifest)


def test_cutoff_and_post_cutoff_exclusion_are_fail_closed(tmp_path: Path) -> None:
    manifest_path = generate_room("atlasgrid", 20260828, tmp_path / "room")
    baseline_path = analyze_room(manifest_path, tmp_path / "baseline.json")
    baseline = read_json(baseline_path)
    assert datetime.fromisoformat(CUTOFF.replace("Z", "+00:00")) <= datetime(2026, 8, 29, tzinfo=timezone.utc)
    assert baseline["temporalScan"]["excluded_rows"] == 1
    assert baseline["temporalScan"]["status"] == "PASS_WITH_DECLARED_EXCLUSIONS"
    assert all(item["cutoff"] == CUTOFF for item in baseline["analyses"])

    _rewrite_pricing(manifest_path, lambda row: row.update({"renewed": "0", "risk_score": "-999.0"}))
    mutated = read_json(analyze_room(manifest_path, tmp_path / "mutated.json"))
    assert _outputs(mutated, "AG-06") == _outputs(baseline, "AG-06")
    assert _outputs(mutated, "AG-07") == _outputs(baseline, "AG-07")

    _rewrite_pricing(manifest_path, lambda row: row.update({"observed_at": CUTOFF, "renewed": "0"}))
    included = read_json(analyze_room(manifest_path, tmp_path / "included.json"))
    assert _outputs(included, "AG-07") != _outputs(baseline, "AG-07")


def test_temporal_scan_rejects_unregistered_date_like_field(tmp_path: Path) -> None:
    manifest_path = generate_room("atlasgrid", 88, tmp_path / "room")
    manifest = read_json(manifest_path)
    artifact = next(item for item in manifest["artifacts"] if item["artifact_id"] == "support-rollout")
    path = manifest_path.parent / artifact["path"]
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = list(reader.fieldnames or [])
    fields.append("reported_at")
    for row in rows:
        row["reported_at"] = "2026-07-01T00:00:00Z"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    with pytest.raises(UnderwritingError, match="temporal_field_unregistered"):
        scan_temporal_artifacts(manifest_path.parent, manifest)
