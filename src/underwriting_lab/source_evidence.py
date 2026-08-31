from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Any

from ic_evidence_lab.canonical import canonical_json

from .contracts import UnderwritingError, digest, sha256_file


def _selection_digest(value: object) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def _csv_locator(path: Path, declared_rows: int) -> tuple[str, dict[str, Any], object, str]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = list(reader.fieldnames or [])
        rows = list(reader)
    if not columns or len(rows) != declared_rows:
        raise UnderwritingError(f"source_csv_shape_mismatch:{path.name}")
    indexes = sorted({0, len(rows) // 2, len(rows) - 1})
    selected_rows = [
        {"data_row": index + 2, "cells": rows[index]}
        for index in indexes
    ]
    selected = {"columns": columns, "rows": selected_rows}
    excerpt = {
        "kind": "CSV_ROWS",
        "rows": selected_rows,
    }
    selector = {
        "columns": columns,
        "data_rows": [index + 2 for index in indexes],
        "header_row": 1,
        "selected_cell_count": len(indexes) * len(columns),
        "selected_row_count": len(indexes),
    }
    return "CSV_CELLS", selector, excerpt, _selection_digest(selected)


def _json_locator(path: Path) -> tuple[str, dict[str, Any], object, str]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(value, dict):
        keys = sorted(value)[:3]
        pointers = [f"/{key.replace('~', '~0').replace('/', '~1')}" for key in keys]
        values = {pointer: value[key] for pointer, key in zip(pointers, keys, strict=True)}
    elif isinstance(value, list) and value:
        indexes = sorted({0, len(value) // 2, len(value) - 1})
        pointers = [f"/{index}" for index in indexes]
        values = {pointer: value[index] for pointer, index in zip(pointers, indexes, strict=True)}
    else:
        pointers = [""]
        values = {"": value}
    selector = {"json_pointers": pointers}
    excerpt = {"kind": "JSON_VALUES", "values": values}
    return "JSON_POINTERS", selector, excerpt, _selection_digest(values)


def _text_locator(path: Path) -> tuple[str, dict[str, Any], object, str]:
    value = path.read_text(encoding="utf-8")
    lines = value.splitlines()
    selected_lines = lines[: min(20, len(lines))]
    selected_text = "\n".join(selected_lines)
    selector = {
        "byte_end_exclusive": len(selected_text.encode("utf-8")),
        "byte_start": 0,
        "line_end": len(selected_lines),
        "line_start": 1,
    }
    excerpt = {"kind": "TEXT_SPAN", "text": selected_text}
    return "TEXT_SPAN", selector, excerpt, _selection_digest(selected_text)


def compile_source_evidence(
    case: dict[str, Any], source_root: Path
) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    """Compile one resolvable locator for every analysis-to-artifact input pair."""

    artifacts = {item["artifact_id"]: item for item in case["artifacts"]}
    locators: list[dict[str, Any]] = []
    by_analysis: dict[str, list[str]] = {}
    case_id = case["caseId"]
    for receipt in case["analyses"]:
        analysis_id = receipt["analysis_id"]
        analysis_locators: list[str] = []
        for input_item in receipt["inputs"]:
            artifact = artifacts.get(input_item["artifact_id"])
            if artifact is None or input_item["sha256"] != artifact["sha256"]:
                raise UnderwritingError("source_input_artifact_mismatch")
            relative = Path(artifact["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise UnderwritingError("source_artifact_path_invalid")
            path = (source_root / relative).resolve(strict=True)
            if source_root.resolve() not in path.parents:
                raise UnderwritingError("source_artifact_path_escape")
            if sha256_file(path) != artifact["sha256"]:
                raise UnderwritingError("source_artifact_digest_mismatch")
            if path.suffix == ".csv":
                kind, selector, excerpt, selection_sha256 = _csv_locator(
                    path, artifact["rows"]
                )
            elif path.suffix == ".json":
                kind, selector, excerpt, selection_sha256 = _json_locator(path)
            else:
                kind, selector, excerpt, selection_sha256 = _text_locator(path)
            locator_id = f"locator-{analysis_id.lower()}-{artifact['artifact_id']}"
            excerpt_sha256 = _selection_digest(excerpt)
            body: dict[str, Any] = {
                "schema_version": "underwriting.source-locator/v3",
                "locator_id": locator_id,
                "artifact_id": artifact["artifact_id"],
                "artifact_path": artifact["path"],
                "repository_path": (
                    f"portfolio/{case_id}/data-room/{artifact['path']}"
                ),
                # Deployment-base relative so GitHub Pages project sites retain
                # their repository subpath instead of jumping to origin root.
                "published_path": f"source-pack/{case_id}/{artifact['path']}",
                "artifact_sha256": artifact["sha256"],
                "locator_kind": kind,
                "selector": selector,
                "evidence_role": "ANALYSIS_INPUT",
                "period": receipt["cutoff"],
                "analysis_id": analysis_id,
                "selection_sha256": selection_sha256,
                "retained_excerpt": excerpt,
                "excerpt_sha256": excerpt_sha256,
            }
            body["locator_sha256"] = digest(body)
            locators.append(body)
            analysis_locators.append(locator_id)
        by_analysis[analysis_id] = analysis_locators
    if len(locators) != len(
        {
            (receipt["analysis_id"], item["artifact_id"])
            for receipt in case["analyses"]
            for item in receipt["inputs"]
        }
    ):
        raise UnderwritingError("source_locator_input_closure_mismatch")
    return locators, by_analysis


def verify_source_evidence(case: dict[str, Any], source_root: Path) -> None:
    """Recompute locator selectors, excerpts, and digests from source bytes.

    Hash-consistent locator JSON is not sufficient evidence: a consumer must
    prove that its selector actually resolves to the committed artifact bytes.
    """

    expected, _ = compile_source_evidence(case, source_root)
    observed = case.get("sourceLocators")
    if not isinstance(observed, list):
        raise UnderwritingError("source_locator_registry_missing")
    expected_by_id = {item["locator_id"]: item for item in expected}
    observed_by_id = {item.get("locator_id"): item for item in observed if isinstance(item, dict)}
    if len(expected_by_id) != len(expected) or set(observed_by_id) != set(expected_by_id):
        raise UnderwritingError("source_locator_registry_mismatch")
    for locator_id, expected_locator in expected_by_id.items():
        if observed_by_id[locator_id] != expected_locator:
            raise UnderwritingError(f"source_locator_source_binding_mismatch:{locator_id}")
