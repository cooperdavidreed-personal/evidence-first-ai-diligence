from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

from ic_evidence_lab.canonical import canonical_json


CONTRACT_VERSION = "underwriting-econometrics/v1"
CUTOFF = "2026-08-31T23:59:59Z"
CLASSIFICATIONS = {
    "ACCOUNTING_IDENTITY",
    "DESCRIPTIVE",
    "PREDICTIVE_ASSOCIATION",
    "CAUSAL_SYNTHETIC_ONLY",
    "SCENARIO",
    "NOT_IDENTIFIED",
    "HUMAN_JUDGMENT",
}
RUNTIME_STATES = {"REPORTED", "DIAGNOSTIC_BLOCKED", "ABSTAIN", "NOT_APPLICABLE"}


class UnderwritingError(ValueError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def digest(document: Any) -> str:
    return sha256_bytes(canonical_json(document))


def quantize(value: float | Decimal, places: str = "0.01") -> str:
    return format(Decimal(str(value)).quantize(Decimal(places), rounding=ROUND_HALF_EVEN), "f")


def write_json(path: Path, document: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_json(document) + b"\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def analysis_receipt(
    *,
    analysis_id: str,
    question: str,
    classification: str,
    method: str,
    population: str,
    inputs: list[dict[str, str]],
    outputs: list[dict[str, str]],
    assumptions: list[str],
    diagnostics: list[dict[str, str]],
    state: str = "REPORTED",
) -> dict[str, Any]:
    if classification not in CLASSIFICATIONS:
        raise UnderwritingError("analysis_classification_invalid")
    if state not in RUNTIME_STATES:
        raise UnderwritingError("analysis_state_invalid")
    if classification == "PREDICTIVE_ASSOCIATION" and not any(
        item["name"] in {"standard_error", "confidence_interval", "credible_interval"}
        for item in diagnostics
    ):
        raise UnderwritingError("predictive_uncertainty_required")
    if classification == "CAUSAL_SYNTHETIC_ONLY" and not any(
        item["name"] == "assignment_mechanism" for item in diagnostics
    ):
        raise UnderwritingError("causal_assignment_required")
    body: dict[str, Any] = {
        "schema_version": "underwriting.analysis-receipt/v1",
        "analysis_id": analysis_id,
        "question": question,
        "classification": classification,
        "method": method,
        "population": population,
        "cutoff": CUTOFF,
        "inputs": inputs,
        "outputs": outputs,
        "assumptions": assumptions,
        "diagnostics": diagnostics,
        "state": state,
    }
    body["receipt_sha256"] = digest(body)
    return body


def lineage_item(
    *, node_id: str, label: str, artifact_id: str, field: str, analysis_id: str
) -> dict[str, str]:
    return {
        "node_id": node_id,
        "label": label,
        "artifact_id": artifact_id,
        "field": field,
        "analysis_id": analysis_id,
    }
