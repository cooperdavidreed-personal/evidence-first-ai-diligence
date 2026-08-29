from __future__ import annotations

from pathlib import Path

import pytest

from underwriting_lab.contracts import UnderwritingError, digest, read_json
from underwriting_lab.experiments import atlasgrid_experiment_fixture, collapsed_pod_delta
from underwriting_lab.verification import build_estimator_coverage_ledger


def test_fixed_500_seed_coverage_policy_is_deterministic(tmp_path: Path) -> None:
    first = build_estimator_coverage_ledger(tmp_path / "first.json")
    second = build_estimator_coverage_ledger(tmp_path / "second.json")
    assert first.read_bytes() == second.read_bytes()
    ledger = read_json(first)
    assert ledger["status"] == "PASS"
    assert ledger["policy"]["simulations"] == 500
    assert ledger["policy"]["rerolls"] == 0
    assert ledger["policy"]["excluded"] == 0
    assert [item["covered"] for item in ledger["endpoints"]] == [477, 472, 471]
    assert all(item["simulations"] == item["valid"] == 500 for item in ledger["endpoints"])
    assert all(0.92 <= float(item["empirical_coverage"]) <= 0.98 for item in ledger["endpoints"])
    body = dict(ledger)
    expected = body.pop("receipt_sha256")
    assert expected == digest(body)


def test_shared_support_estimator_fails_closed_on_invalid_panels() -> None:
    _, rows = atlasgrid_experiment_fixture(123)
    missing_pre = [row for row in rows if not (row["pod_id"] == "AG-S01" and int(row["post"]) == 0)]
    with pytest.raises(UnderwritingError, match="pod_prepost_missing"):
        collapsed_pod_delta(missing_pre, "resolution_hours")
    inconsistent = [dict(row) for row in rows]
    inconsistent[0]["treated"] = 1 - int(inconsistent[0]["treated"])
    with pytest.raises(UnderwritingError, match="pod_assignment_inconsistent"):
        collapsed_pod_delta(inconsistent, "resolution_hours")
    too_few = [row for row in rows if int(row["pod_id"].removeprefix("AG-S")) <= 19]
    with pytest.raises(UnderwritingError, match="pod_cluster_count_inadequate"):
        collapsed_pod_delta(too_few, "resolution_hours")


def test_post_cutoff_sentinel_is_separate_from_eligible_fixture() -> None:
    eligible, support = atlasgrid_experiment_fixture(991)
    with_sentinel, repeated_support = atlasgrid_experiment_fixture(
        991, include_post_cutoff_sentinel=True
    )
    assert with_sentinel[:-1] == eligible
    assert with_sentinel[-1]["observed_at"] == "2026-08-30T00:00:00Z"
    assert repeated_support == support
