from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from .analysis import analyze_room
from .contracts import digest, read_json, write_json
from .generator import generate_room


RECOVERY_SEEDS = {
    "atlasgrid": (20260828, 20260830, 20260832),
    "helios": (20260829, 20260831, 20260833),
}


def _receipt(case: dict[str, Any], analysis_id: str) -> dict[str, Any]:
    return next(item for item in case["analyses"] if item["analysis_id"] == analysis_id)


def _output(receipt: dict[str, Any], name: str) -> float:
    return float(next(item["value"] for item in receipt["outputs"] if item["name"] == name))


def _interval(receipt: dict[str, Any]) -> tuple[float, float]:
    value = next(item["value"] for item in receipt["diagnostics"] if item["name"] == "confidence_interval")
    low, high = value.strip("[]").split(",")
    return float(low), float(high)


def _run(case_id: str, seed: int, root: Path) -> dict[str, Any]:
    manifest_path = generate_room(case_id, seed, root)
    analysis_path = analyze_room(manifest_path, root / "analysis.json")
    case = read_json(analysis_path)
    truth = read_json(root / "verification" / "truth" / "ground_truth.json")
    if case_id == "atlasgrid":
        price = _receipt(case, "AG-07")
        support = _receipt(case, "AG-08")
        price_low, price_high = _interval(price)
        price_truth = float(truth["price_rct_ate"]) * 100
        resolution_truth = float(truth["support_resolution_att_hours"])
        churn_truth = float(truth["support_churn_att_bps"])
        return {
            "case_id": case_id,
            "seed": seed,
            "manifest_sha256": case["manifest_sha256"],
            "checks": [
                {
                    "estimand": "renewal_offer_itt_percentage_points",
                    "estimate": _output(price, "renewal_itt"),
                    "truth": price_truth,
                    "precommitted_rule": "truth_inside_95pct_interval",
                    "status": "PASS" if price_low <= price_truth <= price_high else "FAIL",
                },
                {
                    "estimand": "support_resolution_att_hours",
                    "estimate": _output(support, "resolution_att"),
                    "truth": resolution_truth,
                    "precommitted_rule": "absolute_error_lte_1_5_hours",
                    "status": "PASS" if abs(_output(support, "resolution_att") - resolution_truth) <= 1.5 else "FAIL",
                },
                {
                    "estimand": "support_churn_att_basis_points",
                    "estimate": _output(support, "gross_churn_att"),
                    "truth": churn_truth,
                    "precommitted_rule": "absolute_error_lte_8_basis_points",
                    "status": "PASS" if abs(_output(support, "gross_churn_att") - churn_truth) <= 8 else "FAIL",
                },
            ],
        }
    optimizer = _receipt(case, "HX-06")
    low, high = _interval(optimizer)
    optimizer_truth = float(truth["optimizer_ate_log_cost"]) * 100
    return {
        "case_id": case_id,
        "seed": seed,
        "manifest_sha256": case["manifest_sha256"],
        "checks": [
            {
                "estimand": "optimizer_ate_percent_log_points",
                "estimate": _output(optimizer, "optimizer_ate"),
                "truth": optimizer_truth,
                "precommitted_rule": "truth_inside_95pct_interval",
                "status": "PASS" if low <= optimizer_truth <= high else "FAIL",
            },
            {
                "estimand": "design_partner_selection_direction",
                "estimate": _output(_receipt(case, "HX-02"), "pooled_nrr")
                - _output(_receipt(case, "HX-02"), "ordinary_nrr"),
                "truth": "positive",
                "precommitted_rule": "pooled_nrr_gt_ordinary_nrr",
                "status": "PASS"
                if _output(_receipt(case, "HX-02"), "pooled_nrr")
                > _output(_receipt(case, "HX-02"), "ordinary_nrr")
                else "FAIL",
            },
        ],
    }


def build_recovery_ledger(output: str | Path) -> Path:
    runs: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="underwriting-recovery-") as temporary:
        root = Path(temporary)
        for case_id, seeds in RECOVERY_SEEDS.items():
            for seed in seeds:
                runs.append(_run(case_id, seed, root / f"{case_id}-{seed}"))
    checks = [check for run in runs for check in run["checks"]]
    passed = sum(check["status"] == "PASS" for check in checks)
    ledger: dict[str, Any] = {
        "schema_version": "underwriting.recovery-ledger/v1",
        "purpose": "Seeded synthetic estimator recovery; not real-world investment accuracy.",
        "runs": runs,
        "summary": {
            "runs": len(runs),
            "checks": len(checks),
            "passed": passed,
            "failed": len(checks) - passed,
            "status": "PASS" if passed == len(checks) else "FAIL",
        },
    }
    ledger["ledger_sha256"] = digest(ledger)
    destination = Path(output)
    write_json(destination, ledger)
    return destination
