from __future__ import annotations

from pathlib import Path

import pytest

from underwriting_lab.contracts import UnderwritingError, digest, read_json
from underwriting_lab.experiments import (
    atlasgrid_experiment_fixture,
    collapsed_pod_delta,
    helios_optimizer_fixture,
)
from underwriting_lab.verification import (
    build_estimator_coverage_ledger,
    build_helios_estimator_coverage_ledger,
)


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


def test_fixed_500_seed_helios_coverage_policy_is_deterministic(tmp_path: Path) -> None:
    first = build_helios_estimator_coverage_ledger(tmp_path / "helios-first.json")
    second = build_helios_estimator_coverage_ledger(tmp_path / "helios-second.json")
    assert first.read_bytes() == second.read_bytes()
    ledger = read_json(first)
    endpoint = ledger["endpoints"][0]
    assert ledger["status"] == endpoint["status"] == "PASS"
    assert ledger["policy"]["simulations"] == 500
    assert ledger["policy"]["rerolls"] == ledger["policy"]["excluded"] == 0
    assert endpoint["simulations"] == endpoint["valid"] == 500
    assert endpoint["covered"] == 476
    assert 0.92 <= float(endpoint["empirical_coverage"]) <= 0.98
    body = dict(ledger)
    expected = body.pop("receipt_sha256")
    assert expected == digest(body)


def test_helios_optimizer_fixture_is_balanced_and_preserves_plant() -> None:
    rows = helios_optimizer_fixture(20260829)
    assert len(rows) == 120
    assert sum(int(row["treatment"]) for row in rows) == 60


def test_seed_permutations_kill_first_n_assignment_mutant() -> None:
    _, atlas_first = atlasgrid_experiment_fixture(20260828)
    _, atlas_second = atlasgrid_experiment_fixture(20260830)
    def atlas_ids(rows: list[dict[str, object]]) -> set[object]:
        return {row["pod_id"] for row in rows if int(row["treated"]) == 1}
    assert atlas_ids(atlas_first) != atlas_ids(atlas_second)
    assert atlas_ids(atlas_first) != {f"AG-S{index:02d}" for index in range(1, 21)}

    helios_first = helios_optimizer_fixture(20260829)
    helios_second = helios_optimizer_fixture(20260831)
    def helios_ids(rows: list[dict[str, object]]) -> set[object]:
        return {row["customer_id"] for row in rows if int(row["treatment"]) == 1}
    assert helios_ids(helios_first) != helios_ids(helios_second)
    assert helios_ids(helios_first) != {f"HX-X{index:03d}" for index in range(1, 61)}


def test_post_cutoff_sentinel_is_separate_from_eligible_fixture() -> None:
    eligible, support = atlasgrid_experiment_fixture(991)
    with_sentinel, repeated_support = atlasgrid_experiment_fixture(
        991, include_post_cutoff_sentinel=True
    )
    assert with_sentinel[:-1] == eligible
    assert with_sentinel[-1]["observed_at"] == "2026-08-30T00:00:00Z"
    assert repeated_support == support
