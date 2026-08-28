from __future__ import annotations

from pathlib import Path

from ic_evidence_lab.benchmark import run_regression_suite


ROOT = Path(__file__).parents[1]


def test_all_24_declared_regression_outcomes_match() -> None:
    result = run_regression_suite(ROOT)
    assert result["status"] == "PASS"
    assert result["total"] == 24
    assert result["matched"] == 24
    assert result["failed"] == 0


def test_regression_results_are_deterministic() -> None:
    assert run_regression_suite(ROOT) == run_regression_suite(ROOT)
