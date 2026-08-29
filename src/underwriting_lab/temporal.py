from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Any

from .contracts import CUTOFF, UnderwritingError, digest, read_json


TEMPORAL_FIELDS: dict[str, dict[str, str]] = {
    "atlasgrid.customer-master/v1": {"start_month": "EVIDENCE_MONTH", "contract_term_months": "DURATION"},
    "atlasgrid.customer-month/v1": {"month": "EVIDENCE_MONTH"},
    "atlasgrid.billing-ledger/v1": {"month": "EVIDENCE_MONTH"},
    "atlasgrid.monthly-pnl/v1": {"month": "EVIDENCE_MONTH"},
    "atlasgrid.forecast/v1": {"year": "PROJECTED_RELATIVE"},
    "atlasgrid.pricing-experiment/v2": {"observed_at": "EVIDENCE_INSTANT"},
    "atlasgrid.support-rollout/v1": {"period": "RELATIVE_PERIOD"},
    "atlasgrid.debt-schedule/v1": {"year": "PROJECTED_RELATIVE"},
    "helios.customer-master/v1": {"cohort_index": "RELATIVE_PERIOD", "start_period": "RELATIVE_PERIOD"},
    "helios.customer-month/v1": {"month": "EVIDENCE_MONTH", "cohort_index": "RELATIVE_PERIOD"},
    "helios.monthly-pnl/v1": {"month": "EVIDENCE_MONTH"},
    "helios.stage-history/v1": {"observation_index": "RELATIVE_PERIOD"},
}


def _candidate_field(name: str) -> bool:
    lower = name.lower()
    return lower in {"month", "year", "period", "observed_at", "start_month", "start_period", "cohort_index", "observation_index", "contract_term_months"} or lower.endswith("_date") or lower.endswith("_at")


def scan_temporal_artifacts(root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    cutoff = datetime.fromisoformat(CUTOFF.replace("Z", "+00:00"))
    cutoff_month = CUTOFF[:7]
    fields_scanned: list[dict[str, str]] = []
    excluded_locators: list[str] = []
    included_rows = 0
    max_eligible = ""
    for artifact in manifest["artifacts"]:
        path = root / artifact["path"]
        if path.suffix == ".csv":
            with path.open(encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                rows = list(reader)
                headers = reader.fieldnames or []
            declared = TEMPORAL_FIELDS.get(artifact["schema"], {})
            candidates = {field for field in headers if _candidate_field(field)}
            missing = candidates - declared.keys()
            if missing:
                raise UnderwritingError(f"temporal_field_unregistered:{artifact['artifact_id']}:{','.join(sorted(missing))}")
            for field, classification in declared.items():
                if field not in headers:
                    raise UnderwritingError(f"temporal_field_missing:{artifact['artifact_id']}:{field}")
                fields_scanned.append({"artifact_id": artifact["artifact_id"], "field": field, "classification": classification})
                if classification not in {"EVIDENCE_MONTH", "EVIDENCE_INSTANT"}:
                    continue
                for index, row in enumerate(rows, start=2):
                    value = row[field]
                    eligible = value <= cutoff_month if classification == "EVIDENCE_MONTH" else datetime.fromisoformat(value.replace("Z", "+00:00")) <= cutoff
                    if eligible:
                        included_rows += 1
                        max_eligible = max(max_eligible, value)
                    else:
                        excluded_locators.append(f"{artifact['artifact_id']}:{index}:{field}:{value}")
        elif path.suffix == ".json":
            document = read_json(path)
            if isinstance(document, dict):
                unexpected = [key for key in document if _candidate_field(key)]
                if unexpected:
                    raise UnderwritingError(f"temporal_json_field_unregistered:{artifact['artifact_id']}:{','.join(sorted(unexpected))}")
    body: dict[str, Any] = {
        "schema_version": "underwriting.temporal-scan-receipt/v1",
        "cutoff": CUTOFF,
        "fields_scanned": fields_scanned,
        "included_rows": included_rows,
        "excluded_rows": len(excluded_locators),
        "excluded_locators": excluded_locators,
        "max_eligible_instant": max_eligible or CUTOFF,
        "status": "PASS_WITH_DECLARED_EXCLUSIONS" if excluded_locators else "PASS",
    }
    body["receipt_sha256"] = digest(body)
    return body
