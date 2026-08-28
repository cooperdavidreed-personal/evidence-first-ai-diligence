from __future__ import annotations

from pathlib import Path

from ic_evidence_lab.benchmark import run_benchmark


ROOT = Path(__file__).parents[1]


def test_all_24_declared_benchmark_outcomes_match() -> None:
    result = run_benchmark(ROOT)
    assert result["status"] == "PASS"
    assert result["total"] == 24
    assert result["matched"] == 24
    assert result["failed"] == 0


def test_benchmark_results_are_deterministic() -> None:
    assert run_benchmark(ROOT) == run_benchmark(ROOT)
