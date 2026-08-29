from __future__ import annotations

from typing import Any

from .contracts import CUTOFF, digest


CASE_ANALYSES = {
    "atlasgrid": ("AG-01", "AG-02", "AG-03", "AG-04", "AG-05", "AG-06", "AG-07", "AG-08", "AG-09", "AG-10", "AG-11"),
    "helios": ("HX-01", "HX-02", "HX-03", "HX-04", "HX-05", "HX-06", "HX-07", "HX-08", "HX-09"),
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
        }
        spec["spec_sha256"] = digest(spec)
        specs.append(spec)
    return specs
