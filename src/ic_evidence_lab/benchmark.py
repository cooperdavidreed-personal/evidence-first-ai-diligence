from __future__ import annotations

import copy
import hashlib
import json
import shutil
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

from .canonical import canonical_json, digest_json
from .pipeline import CaseError, run_case


def _find(records: list[dict[str, Any]], key: str, value: str) -> dict[str, Any]:
    for record in records:
        if record.get(key) == value:
            return record
    raise ValueError(f"benchmark target not found: {key}={value}")


def _mutate(case: dict[str, Any], root: Path, mutation: dict[str, Any]) -> None:
    kind = mutation["type"]
    if kind == "none":
        return
    if kind.startswith("claim_") or kind.startswith("calc_") or kind in {
        "remove_counterevidence", "counter_source_unknown"
    }:
        claim = _find(case["claims"], "claim_id", mutation["claim_id"])
        if kind == "claim_quote":
            claim["evidence"][0]["quote"] = mutation["value"]
        elif kind == "calc_unit":
            claim["calculation"]["unit"] = mutation["value"]
        elif kind == "calc_expected":
            claim["calculation"]["expected"] = mutation["value"]
        elif kind == "calc_denominator":
            claim["calculation"]["denominator"] = mutation["value"]
        elif kind == "remove_counterevidence":
            claim["counterevidence"] = []
        elif kind == "counter_source_unknown":
            claim["counterevidence"][0]["source_id"] = "UNKNOWN"
        return
    source = _find(case["sources"], "source_id", mutation["source_id"])
    if kind == "source_digest":
        source["sha256"] = mutation["value"]
    elif kind == "source_date":
        source["published_at"] = mutation["value"]
    elif kind == "source_content":
        data = mutation["value"].encode("utf-8")
        (root / source["path"]).write_bytes(data)
        source["sha256"] = hashlib.sha256(data).hexdigest()
    else:
        raise ValueError(f"unsupported benchmark mutation: {kind}")


def _actual(packet: dict[str, Any], target: str) -> str:
    kind, _, identifier = target.partition(":")
    if kind == "claim":
        return _find(packet["claim_results"], "claim_id", identifier)["state"]
    if kind == "source":
        return _find(packet["source_results"], "source_id", identifier)["status"]
    raise ValueError(f"unsupported benchmark target: {target}")


def run_benchmark(repo: str | Path) -> dict[str, Any]:
    root = Path(repo).resolve(strict=True)
    manifest = json.loads((root / "benchmark/manifest.json").read_text(encoding="utf-8"))
    results: list[dict[str, str]] = []
    for definition in manifest["cases"]:
        with tempfile.TemporaryDirectory(prefix="ic-evidence-bench-") as temporary:
            case_root = Path(temporary)
            shutil.copytree(root / "examples/vectorforge/sources", case_root / "sources")
            base_path = root / f"examples/vectorforge/case-{definition['base']}.json"
            case = copy.deepcopy(json.loads(base_path.read_text(encoding="utf-8")))
            _mutate(case, case_root, definition["mutation"])
            case_path = case_root / "case.json"
            case_path.write_bytes(canonical_json(case) + b"\n")
            try:
                packet, _ = run_case(case_path)
                actual = "NO_ERROR" if definition["target"] == "error" else _actual(packet, definition["target"])
            except CaseError:
                actual = "FAIL"
            matched = actual == definition["expected"]
            results.append({
                "id": definition["id"],
                "family": definition["family"],
                "expected": definition["expected"],
                "actual": actual,
                "result": "PASS" if matched else "FAIL",
            })
    counts = Counter(result["result"] for result in results)
    output_without_digest = {
        "schema_version": "ic-evidence-lab.benchmark-results/v1",
        "manifest_sha256": digest_json(manifest),
        "total": len(results),
        "matched": counts["PASS"],
        "failed": counts["FAIL"],
        "status": "PASS" if counts["FAIL"] == 0 and len(results) == manifest["case_count"] else "FAIL",
        "results": results,
        "limitations": manifest["limitations"],
    }
    output = dict(output_without_digest)
    output["content_sha256"] = digest_json(output_without_digest)
    return output
