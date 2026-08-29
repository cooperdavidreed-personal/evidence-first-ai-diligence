from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
from typing import Any

import numpy as np

from .contracts import CONTRACT_VERSION, UnderwritingError


@dataclass(frozen=True)
class Estimate:
    effect: float
    standard_error: float
    low: float
    high: float
    treated_count: int
    control_count: int


def _stream_rng(master_seed: int, stream: str) -> np.random.Generator:
    material = f"{master_seed}:{CONTRACT_VERSION}:{stream}".encode()
    seed = int.from_bytes(hashlib.sha256(material).digest()[:16], "big")
    return np.random.Generator(np.random.PCG64(seed))


def atlasgrid_experiment_fixture(
    master_seed: int, *, include_post_cutoff_sentinel: bool = False
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rng = _stream_rng(master_seed, "atlasgrid/experiments")
    pricing_rows: list[dict[str, Any]] = []
    for idx in range(800):
        treatment = int(rng.random() < 0.5)
        risk = float(rng.normal(0, 1))
        realized = max(0.0, 8.0 * treatment - 1.8 * risk + rng.normal(0, 0.9))
        renewal_probability = 0.93 - 0.05 * treatment - 0.035 * max(risk, 0)
        renewed = int(rng.random() < renewal_probability)
        pricing_rows.append(
            {
                "account_id": f"AG-R{idx + 1:04d}",
                "observed_at": "2026-07-15T00:00:00Z",
                "treatment": treatment,
                "risk_score": f"{risk:.6f}",
                "realized_increase_pct": f"{realized:.6f}",
                "renewed": renewed,
            }
        )
    if include_post_cutoff_sentinel:
        pricing_rows.append(
            {
                "account_id": "AG-R-POST-CUTOFF",
                "observed_at": "2026-08-30T00:00:00Z",
                "treatment": 1,
                "risk_score": "9.999999",
                "realized_increase_pct": "99.999999",
                "renewed": 1,
            }
        )

    pod_rows: list[dict[str, Any]] = []
    treated_pods = set(int(item) for item in rng.permutation(40)[:20])
    for pod in range(40):
        treated = int(pod in treated_pods)
        pod_effect = float(rng.normal(0, 1.2))
        for month in range(24):
            post = int(month >= 12)
            resolution = 23.0 + pod_effect - 4.8 * treated * post + 0.05 * month + rng.normal(0, 0.7)
            churn_bps = 92 + pod_effect * 2 - 16 * treated * post + rng.normal(0, 5)
            pod_rows.append(
                {
                    "pod_id": f"AG-S{pod + 1:02d}",
                    "period": month - 12,
                    "treated": treated,
                    "post": post,
                    "resolution_hours": f"{resolution:.6f}",
                    "gross_churn_bps": f"{churn_bps:.6f}",
                }
            )
    return pricing_rows, pod_rows


def helios_optimizer_fixture(master_seed: int) -> list[dict[str, Any]]:
    """Return the exact precommitted 60/60 synthetic optimizer experiment."""
    rng = _stream_rng(master_seed, "helios/experiments")
    baselines = rng.normal(0, 0.17, 120)
    noises = rng.normal(0, 0.08, 120)
    treated_customers: set[int] | None = None
    for _ in range(1_000):
        candidate = set(int(item) for item in rng.permutation(120)[:60])
        treated_values = np.array([baselines[idx] for idx in candidate])
        control_values = np.array(
            [baselines[idx] for idx in range(120) if idx not in candidate]
        )
        pooled_sd = math.sqrt(
            (treated_values.var(ddof=1) + control_values.var(ddof=1)) / 2
        )
        balance_smd = (treated_values.mean() - control_values.mean()) / pooled_sd
        if abs(balance_smd) <= 0.15:
            treated_customers = candidate
            break
    if treated_customers is None:
        raise UnderwritingError("optimizer_assignment_balance_not_found")
    return [
        {
            "customer_id": f"HX-X{idx + 1:03d}",
            "treatment": int(idx in treated_customers),
            "baseline_log_cost": f"{float(baselines[idx]):.6f}",
            "outcome_log_cost_change": f"{-0.11 * int(idx in treated_customers) + float(noises[idx]):.6f}",
        }
        for idx in range(120)
    ]


def difference_in_means(outcome: np.ndarray, treatment: np.ndarray) -> Estimate:
    if len(outcome) != len(treatment) or len(outcome) < 4 or not np.isfinite(outcome).all():
        raise UnderwritingError("mean_difference_input_invalid")
    if not set(np.unique(treatment)).issubset({0, 1}):
        raise UnderwritingError("mean_difference_treatment_invalid")
    treated = outcome[treatment == 1]
    control = outcome[treatment == 0]
    if len(treated) < 2 or len(control) < 2:
        raise UnderwritingError("mean_difference_arm_inadequate")
    effect = float(treated.mean() - control.mean())
    se = math.sqrt(float(treated.var(ddof=1) / len(treated) + control.var(ddof=1) / len(control)))
    return Estimate(effect, se, effect - 1.96 * se, effect + 1.96 * se, len(treated), len(control))


def collapsed_pod_delta(rows: list[dict[str, Any]], field: str) -> Estimate:
    by_pod: dict[str, dict[str, list[float]]] = {}
    assignment: dict[str, int] = {}
    for row in rows:
        pod = str(row["pod_id"])
        treated = int(row["treated"])
        if pod in assignment and assignment[pod] != treated:
            raise UnderwritingError("pod_assignment_inconsistent")
        assignment[pod] = treated
        bucket = by_pod.setdefault(pod, {"pre": [], "post": []})
        value = float(row[field])
        if not math.isfinite(value):
            raise UnderwritingError("pod_outcome_non_finite")
        bucket["post" if int(row["post"]) else "pre"].append(value)
    if len(by_pod) < 20:
        raise UnderwritingError("pod_cluster_count_inadequate")
    deltas: list[float] = []
    treatments: list[int] = []
    for pod, values in sorted(by_pod.items()):
        if not values["pre"] or not values["post"]:
            raise UnderwritingError("pod_prepost_missing")
        deltas.append(float(np.mean(values["post"]) - np.mean(values["pre"])))
        treatments.append(assignment[pod])
    estimate = difference_in_means(np.array(deltas), np.array(treatments))
    if estimate.treated_count < 10 or estimate.control_count < 10:
        raise UnderwritingError("pod_arm_count_inadequate")
    return estimate
