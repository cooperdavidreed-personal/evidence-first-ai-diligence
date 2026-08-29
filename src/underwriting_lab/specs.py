from __future__ import annotations

from typing import Any

from .contracts import CUTOFF, digest


CASE_ANALYSES = {
    "atlasgrid": ("AG-01", "AG-02", "AG-03", "AG-04", "AG-05", "AG-06", "AG-07", "AG-08", "AG-09", "AG-10", "AG-11"),
    "helios": ("HX-01", "HX-02", "HX-03", "HX-04", "HX-05", "HX-06", "HX-07", "HX-08", "HX-09"),
}

METHOD_FAMILIES = {
    "AG-01": "integer-cent accounting bridge", "AG-02": "fixed-cohort retention bridge", "AG-03": "mapped-parent concentration", "AG-04": "QoE normalization", "AG-05": "discrete hazard and Kaplan-Meier", "AG-06": "observational linear probability model", "AG-07": "randomized intention-to-treat", "AG-08": "pod-clustered difference-in-differences", "AG-09": "identification abstention", "AG-10": "deterministic sponsor return bridge", "AG-11": "seeded scenario simulation",
    "HX-01": "integer-cent usage economics bridge", "HX-02": "fixed-cohort selection audit", "HX-03": "cash runway and burn bridge", "HX-04": "stage-history reconstruction", "HX-05": "tiered beta-binomial model", "HX-06": "randomized intention-to-treat", "HX-07": "identification abstention", "HX-08": "integer-share ownership bridge", "HX-09": "class-aware preference waterfall simulation",
}

RECOVERY_RULES = {
    "AG-05": "annualized churn within 150 basis points of planted target",
    "AG-06": "naive and randomized estimates diverge by more than three naive standard errors",
    "AG-07": "precommitted 95 percent interval contains planted price effect",
    "AG-08": "both precommitted 95 percent intervals contain planted effects and diagnostics pass",
    "AG-09": "analysis abstains",
    "HX-04": "eligible stage-history inflation count matches planted identifiers",
    "HX-05": "tier 1 through 4 intervals contain planted adoption rates and tier 5 abstains",
    "HX-06": "precommitted 95 percent interval contains planted optimizer effect",
    "HX-07": "analysis abstains",
}


def analysis_specs(case_id: str) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for analysis_id in CASE_ANALYSES[case_id]:
        spec: dict[str, Any] = {
            "schema_version": "underwriting.analysis-spec/v1",
            "analysis_id": analysis_id,
            "cutoff": CUTOFF,
            "tolerance_policy": "frozen_in_econometrics_contract",
            "state_policy": "diagnostic_failure_blocks_adjudication",
            "estimand": f"Precommitted output contract for {analysis_id}",
            "method_family": METHOD_FAMILIES[analysis_id],
            "recovery_rule": RECOVERY_RULES.get(analysis_id, "deterministic reconciliation or declared diagnostic state"),
        }
        spec["spec_sha256"] = digest(spec)
        specs.append(spec)
    return specs
