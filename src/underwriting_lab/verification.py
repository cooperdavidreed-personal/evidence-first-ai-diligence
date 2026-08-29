from __future__ import annotations

import math
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .analysis import analyze_room
from .contracts import digest, read_json, write_json
from .generator import generate_room


RECOVERY_SEEDS = {
    "atlasgrid": (20260828, 20260830, 20260832),
    "helios": (20260829, 20260831, 20260833),
}

RECOVERY_STATES = {
    "ESTIMATED",
    "INTERVAL_CONTAINS_TRUTH",
    "ABSTENTION_CONFIRMED",
    "FAILED_RECOVERY",
}


def _receipt(case: dict[str, Any], analysis_id: str) -> dict[str, Any]:
    matches = [item for item in case["analyses"] if item["analysis_id"] == analysis_id]
    if len(matches) != 1:
        raise ValueError(f"analysis_receipt_count:{analysis_id}:{len(matches)}")
    return matches[0]


def _output(receipt: dict[str, Any], name: str) -> float:
    matches = [item["value"] for item in receipt["outputs"] if item["name"] == name]
    if len(matches) != 1:
        raise ValueError(f"analysis_output_count:{receipt.get('analysis_id')}:{name}:{len(matches)}")
    value = float(matches[0])
    if not math.isfinite(value):
        raise ValueError(f"analysis_output_non_finite:{receipt.get('analysis_id')}:{name}")
    return value


def _diagnostic(receipt: dict[str, Any], name: str) -> dict[str, Any]:
    matches = [item for item in receipt["diagnostics"] if item["name"] == name]
    if len(matches) != 1:
        raise ValueError(f"analysis_diagnostic_count:{receipt.get('analysis_id')}:{name}:{len(matches)}")
    return matches[0]


def _interval(receipt: dict[str, Any], name: str = "confidence_interval") -> tuple[float, float]:
    value = str(_diagnostic(receipt, name)["value"])
    if not value.startswith("[") or not value.endswith("]"):
        raise ValueError(f"analysis_interval_invalid:{receipt.get('analysis_id')}:{name}")
    parts = value[1:-1].split(",")
    if len(parts) != 2:
        raise ValueError(f"analysis_interval_invalid:{receipt.get('analysis_id')}:{name}")
    low, high = (float(part.strip()) for part in parts)
    if not math.isfinite(low) or not math.isfinite(high) or low > high:
        raise ValueError(f"analysis_interval_invalid:{receipt.get('analysis_id')}:{name}")
    return low, high


def _append_check(
    checks: list[dict[str, Any]],
    *,
    analysis_id: str,
    estimand: str,
    precommitted_rule: str,
    success_state: str,
    evaluate: Callable[[], tuple[Any, Any, bool]],
) -> None:
    if success_state not in RECOVERY_STATES - {"FAILED_RECOVERY"}:
        raise ValueError("recovery_success_state_invalid")
    try:
        estimate, truth, recovered = evaluate()
        check = {
            "analysis_id": analysis_id,
            "estimand": estimand,
            "estimate": estimate,
            "truth": truth,
            "precommitted_rule": precommitted_rule,
            "status": success_state if recovered else "FAILED_RECOVERY",
        }
        if not recovered:
            check["failure_reason"] = "precommitted_rule_not_satisfied"
    except (IndexError, KeyError, StopIteration, TypeError, ValueError, ZeroDivisionError) as exc:
        failure_reason = str(exc.args[0]) if isinstance(exc, KeyError) and exc.args else str(exc)
        check = {
            "analysis_id": analysis_id,
            "estimand": estimand,
            "estimate": None,
            "truth": None,
            "precommitted_rule": precommitted_rule,
            "status": "FAILED_RECOVERY",
            "failure_reason": failure_reason or exc.__class__.__name__,
        }
    checks.append(check)


def _atlasgrid_checks(case: dict[str, Any], truth: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    def churn_recovery() -> tuple[float, Any, bool]:
        receipt = _receipt(case, "AG-05")
        estimate = _output(receipt, "annualized_logo_churn")
        event_count = _diagnostic(receipt, "event_count")
        exposure = _diagnostic(receipt, "active_month_exposure")
        diagnostics_valid = event_count["status"] == "PASS" and exposure["status"] == "PASS"
        if "annualized_churn_target_pct" in truth:
            target = float(truth["annualized_churn_target_pct"])
            return estimate, target, diagnostics_valid and abs(estimate - target) <= 1.5
        return estimate, "finite_estimate_with_positive_event_and_exposure_denominators", diagnostics_valid and 0 < estimate < 100

    _append_check(
        checks,
        analysis_id="AG-05",
        estimand="annualized_logo_churn_percent",
        precommitted_rule="absolute_error_lte_1_5_percentage_points_when_truth_target_declared; otherwise finite estimate with valid denominators",
        success_state="ESTIMATED",
        evaluate=churn_recovery,
    )

    def naive_adjusted_separation() -> tuple[float, str, bool]:
        naive = _receipt(case, "AG-06")
        adjusted = _receipt(case, "AG-07")
        difference = abs(_output(naive, "naive_realized_price_slope") - _output(adjusted, "renewal_itt"))
        naive_se = float(_diagnostic(naive, "standard_error")["value"])
        return difference, "absolute_naive_adjusted_gap_gt_3x_naive_standard_error", math.isfinite(naive_se) and naive_se > 0 and difference > 3 * naive_se

    _append_check(
        checks,
        analysis_id="AG-06",
        estimand="naive_adjusted_pricing_effect_gap_percentage_points",
        precommitted_rule="absolute_naive_adjusted_gap_gt_3x_naive_standard_error",
        success_state="ESTIMATED",
        evaluate=naive_adjusted_separation,
    )

    def pricing_interval() -> tuple[float, float, bool]:
        receipt = _receipt(case, "AG-07")
        estimate = _output(receipt, "renewal_itt")
        planted_truth = float(truth["price_rct_ate"]) * 100
        low, high = _interval(receipt)
        return estimate, planted_truth, estimate * planted_truth > 0 and low <= planted_truth <= high

    _append_check(
        checks,
        analysis_id="AG-07",
        estimand="renewal_offer_itt_percentage_points",
        precommitted_rule="estimate_sign_matches_truth_and_truth_inside_95pct_interval",
        success_state="INTERVAL_CONTAINS_TRUTH",
        evaluate=pricing_interval,
    )

    for estimand, output_name, truth_name, interval_name in (
        ("support_resolution_att_hours", "resolution_att", "support_resolution_att_hours", "resolution_95pct_interval"),
        ("support_churn_att_basis_points", "gross_churn_att", "support_churn_att_bps", "gross_churn_95pct_interval"),
    ):

        def support_interval(
            output_name: str = output_name,
            truth_name: str = truth_name,
            interval_name: str = interval_name,
        ) -> tuple[float, float, bool]:
            receipt = _receipt(case, "AG-08")
            estimate = _output(receipt, output_name)
            planted_truth = float(truth[truth_name])
            low, high = _interval(receipt, interval_name)
            return estimate, planted_truth, estimate * planted_truth > 0 and low <= planted_truth <= high

        _append_check(
            checks,
            analysis_id="AG-08",
            estimand=estimand,
            precommitted_rule="estimate_sign_matches_truth_and_truth_inside_95pct_interval",
            success_state="INTERVAL_CONTAINS_TRUTH",
            evaluate=support_interval,
        )

    def confounded_event_abstention() -> tuple[str, str, bool]:
        receipt = _receipt(case, "AG-09")
        blocked = _diagnostic(receipt, "overlapping_events")["status"] == "BLOCKED"
        return str(receipt["state"]), "ABSTAIN", receipt["state"] == "ABSTAIN" and not receipt["outputs"] and blocked

    _append_check(
        checks,
        analysis_id="AG-09",
        estimand="leadership_change_causal_effect",
        precommitted_rule="abstain_when_overlapping_events_block_identification",
        success_state="ABSTENTION_CONFIRMED",
        evaluate=confounded_event_abstention,
    )
    return checks


def _helios_checks(case: dict[str, Any], truth: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    def pipeline_recovery() -> tuple[int, int, bool]:
        raw_estimate = _output(_receipt(case, "HX-04"), "inflated_opportunities")
        estimate = int(raw_estimate)
        if estimate != raw_estimate:
            raise ValueError("inflated_opportunity_count_not_integer")
        planted_truth = int(truth["pipeline_inflated_count"])
        return estimate, planted_truth, estimate == planted_truth

    _append_check(
        checks,
        analysis_id="HX-04",
        estimand="inflated_pipeline_opportunity_count",
        precommitted_rule="exact_count_equals_verification_truth",
        success_state="ESTIMATED",
        evaluate=pipeline_recovery,
    )

    def pipeline_residual_recovery() -> tuple[int, int, bool]:
        raw_estimate = _output(_receipt(case, "HX-04"), "weighted_pipeline_inflation_cents")
        estimate = int(raw_estimate)
        if estimate != raw_estimate:
            raise ValueError("weighted_pipeline_inflation_not_integer_cents")
        planted_truth = int(truth["pipeline_weighted_inflation_cents"])
        return estimate, planted_truth, estimate == planted_truth

    _append_check(
        checks,
        analysis_id="HX-04",
        estimand="weighted_pipeline_inflation_cents",
        precommitted_rule="exact_weighted_residual_equals_verification_truth_cents",
        success_state="ESTIMATED",
        evaluate=pipeline_residual_recovery,
    )

    for tier in range(1, 5):

        def adoption_interval(tier: int = tier) -> tuple[float, float, bool]:
            receipt = _receipt(case, "HX-05")
            estimate = _output(receipt, f"tier_{tier}_adoption")
            planted_truth = float(truth["market_adoption_rates"][tier - 1]) * 100
            low, high = _interval(receipt, f"tier_{tier}_credible_interval")
            return estimate, planted_truth, low <= planted_truth <= high

        _append_check(
            checks,
            analysis_id="HX-05",
            estimand=f"tier_{tier}_adoption_percent",
            precommitted_rule="truth_inside_90pct_credible_interval",
            success_state="INTERVAL_CONTAINS_TRUTH",
            evaluate=adoption_interval,
        )

    def thin_tier_abstention() -> tuple[str, str, bool]:
        receipt = _receipt(case, "HX-05")
        outputs = [item for item in receipt["outputs"] if item["name"] == "tier_5"]
        if len(outputs) != 1:
            raise ValueError(f"analysis_output_count:HX-05:tier_5:{len(outputs)}")
        output = outputs[0]
        diagnostic = _diagnostic(receipt, "tier_5_sample")
        return str(output["value"]), "ABSTAIN", output["value"] == "ABSTAIN" and diagnostic["status"] == "ABSTAIN"

    _append_check(
        checks,
        analysis_id="HX-05",
        estimand="tier_5_adoption_percent",
        precommitted_rule="abstain_for_declared_thin_sample",
        success_state="ABSTENTION_CONFIRMED",
        evaluate=thin_tier_abstention,
    )

    def optimizer_interval() -> tuple[float, float, bool]:
        receipt = _receipt(case, "HX-06")
        estimate = _output(receipt, "optimizer_ate")
        planted_truth = float(truth["optimizer_ate_log_cost"]) * 100
        low, high = _interval(receipt)
        return estimate, planted_truth, estimate * planted_truth > 0 and low <= planted_truth <= high

    _append_check(
        checks,
        analysis_id="HX-06",
        estimand="optimizer_ate_percent_log_points",
        precommitted_rule="estimate_sign_matches_truth_and_truth_inside_95pct_interval",
        success_state="INTERVAL_CONTAINS_TRUTH",
        evaluate=optimizer_interval,
    )

    def adoption_effect_abstention() -> tuple[str, str, bool]:
        receipt = _receipt(case, "HX-07")
        blocked = _diagnostic(receipt, "pretrend")["status"] == "BLOCKED"
        return str(receipt["state"]), "ABSTAIN", receipt["state"] == "ABSTAIN" and not receipt["outputs"] and blocked

    _append_check(
        checks,
        analysis_id="HX-07",
        estimand="adoption_total_gpu_spend_growth_effect",
        precommitted_rule="abstain_when_nonparallel_pretrend_blocks_identification",
        success_state="ABSTENTION_CONFIRMED",
        evaluate=adoption_effect_abstention,
    )
    return checks


def evaluate_recovery(case_id: str, case: dict[str, Any], truth: dict[str, Any]) -> list[dict[str, Any]]:
    if case_id == "atlasgrid":
        return _atlasgrid_checks(case, truth)
    if case_id == "helios":
        return _helios_checks(case, truth)
    raise ValueError("recovery_case_id_invalid")


def _run(case_id: str, seed: int, root: Path) -> dict[str, Any]:
    manifest_path = generate_room(case_id, seed, root)
    analysis_path = analyze_room(manifest_path, root / "analysis.json")
    case = read_json(analysis_path)
    truth = read_json(root / "verification" / "truth" / "ground_truth.json")
    return {
        "case_id": case_id,
        "seed": seed,
        "manifest_sha256": case["manifest_sha256"],
        "checks": evaluate_recovery(case_id, case, truth),
    }


def build_recovery_ledger(output: str | Path) -> Path:
    runs: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="underwriting-recovery-") as temporary:
        root = Path(temporary)
        for case_id, seeds in RECOVERY_SEEDS.items():
            for seed in seeds:
                runs.append(_run(case_id, seed, root / f"{case_id}-{seed}"))
    checks = [check for run in runs for check in run["checks"]]
    failed = sum(check["status"] == "FAILED_RECOVERY" for check in checks)
    state_counts = {state: sum(check["status"] == state for check in checks) for state in sorted(RECOVERY_STATES)}
    ledger: dict[str, Any] = {
        "schema_version": "underwriting.recovery-ledger/v2",
        "purpose": "Seeded synthetic estimator recovery; not real-world investment accuracy.",
        "state_definitions": {
            "ESTIMATED": "The declared estimate or deterministic distortion-recovery rule was produced and satisfied.",
            "INTERVAL_CONTAINS_TRUTH": "The precommitted interval contains the planted synthetic parameter.",
            "ABSTENTION_CONFIRMED": "The runtime analysis abstained at a precommitted non-identification boundary.",
            "FAILED_RECOVERY": "Required evidence was missing or malformed, or the precommitted rule failed.",
        },
        "runs": runs,
        "summary": {
            "runs": len(runs),
            "checks": len(checks),
            "passed": len(checks) - failed,
            "failed": failed,
            "state_counts": state_counts,
            "status": "PASS" if failed == 0 else "FAIL",
        },
    }
    ledger["ledger_sha256"] = digest(ledger)
    destination = Path(output)
    write_json(destination, ledger)
    return destination
