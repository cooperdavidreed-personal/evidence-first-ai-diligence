from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

from .canonical import canonical_json, digest_json


MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_SOURCES = 12
MAX_CLAIMS = 40
INJECTION_PATTERNS = (
    re.compile(r"\bignore (?:all|any|the|previous|prior) instructions\b", re.I),
    re.compile(r"\bsystem prompt\b", re.I),
    re.compile(r"\bexfiltrat(?:e|ion)\b", re.I),
    re.compile(r"\bcall (?:this )?tool\b", re.I),
)
ALLOWED_KINDS = {"fact", "derived", "judgment"}
ALLOWED_MATERIALITY = {"high", "medium", "low"}


class CaseError(ValueError):
    pass


def _read_rooted(root: Path, relative: str) -> bytes:
    raw = Path(relative)
    if raw.is_absolute() or not raw.parts or any(part in {"", ".", ".."} for part in raw.parts):
        raise CaseError("source_path_invalid")
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    file_flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptors: list[int] = []
    try:
        descriptors.append(os.open(root, directory_flags))
        for component in raw.parts[:-1]:
            descriptors.append(os.open(component, directory_flags, dir_fd=descriptors[-1]))
        descriptors.append(os.open(raw.parts[-1], file_flags, dir_fd=descriptors[-1]))
        details = os.fstat(descriptors[-1])
        if not stat.S_ISREG(details.st_mode):
            raise CaseError("source_regular_file_required")
        if details.st_size > MAX_SOURCE_BYTES:
            raise CaseError("source_too_large")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptors[-1], min(131072, MAX_SOURCE_BYTES + 1 - total))
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_SOURCE_BYTES:
                raise CaseError("source_too_large")
            chunks.append(chunk)
        return b"".join(chunks)
    except OSError as exc:
        raise CaseError("source_unavailable") from exc
    finally:
        for descriptor in reversed(descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass


def _required_string(record: dict[str, Any], key: str, *, limit: int = 4096) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise CaseError(f"{key}_invalid")
    return value.strip()


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise CaseError(f"{field}_invalid") from exc


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def _compute(calculation: dict[str, Any]) -> tuple[str, bool]:
    operation = _required_string(calculation, "operation", limit=32)
    try:
        numerator = Decimal(_required_string(calculation, "numerator", limit=100))
        denominator = Decimal(_required_string(calculation, "denominator", limit=100))
        expected = Decimal(_required_string(calculation, "expected", limit=100))
    except InvalidOperation as exc:
        raise CaseError("calculation_decimal_invalid") from exc
    if denominator == 0:
        raise CaseError("calculation_division_by_zero")
    if operation == "growth_rate":
        computed = ((numerator - denominator) / denominator) * Decimal("100")
    elif operation in {"gross_margin", "ratio"}:
        computed = (numerator / denominator) * Decimal("100")
    elif operation == "runway":
        computed = numerator / denominator
    else:
        raise CaseError("calculation_operation_invalid")
    computed = computed.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
    return format(computed, "f"), computed == expected.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)


def _validate_case(case: Any) -> dict[str, Any]:
    if not isinstance(case, dict) or case.get("schema_version") != "ic-evidence-lab.case/v1":
        raise CaseError("case_schema_invalid")
    _required_string(case, "case_id", limit=120)
    _required_string(case, "company", limit=200)
    _parse_date(_required_string(case, "as_of", limit=10), "as_of")
    _required_string(case, "generated_at", limit=40)
    sources = case.get("sources")
    claims = case.get("claims")
    questions = case.get("open_questions")
    if not isinstance(sources, list) or not sources or len(sources) > MAX_SOURCES:
        raise CaseError("sources_invalid")
    if not isinstance(claims, list) or not claims or len(claims) > MAX_CLAIMS:
        raise CaseError("claims_invalid")
    if not isinstance(questions, list) or any(not isinstance(q, str) or not q.strip() for q in questions):
        raise CaseError("open_questions_invalid")
    return case


def run_case(case_path: str | Path) -> tuple[dict[str, Any], dict[str, Any]]:
    path = Path(case_path).resolve(strict=True)
    root = path.parent
    try:
        case = _validate_case(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CaseError("case_unreadable") from exc
    as_of = _parse_date(case["as_of"], "as_of")

    source_results: list[dict[str, Any]] = []
    source_index: dict[str, tuple[dict[str, Any], str, str]] = {}
    for source in case["sources"]:
        if not isinstance(source, dict):
            raise CaseError("source_record_invalid")
        source_id = _required_string(source, "source_id", limit=120)
        if source_id in source_index:
            raise CaseError("source_id_duplicate")
        published_at = _parse_date(_required_string(source, "published_at", limit=10), "published_at")
        _required_string(source, "retrieved_at", limit=40)
        _required_string(source, "uri", limit=2048)
        if source.get("tier") not in {"A", "B", "C", "D"}:
            raise CaseError("source_tier_invalid")
        relative = _required_string(source, "path", limit=512)
        expected_digest = _required_string(source, "sha256", limit=64)
        data = _read_rooted(root, relative)
        actual_digest = hashlib.sha256(data).hexdigest()
        text = data.decode("utf-8", errors="replace")
        findings: list[str] = []
        if not re.fullmatch(r"[0-9a-f]{64}", expected_digest) or actual_digest != expected_digest:
            findings.append("DIGEST_MISMATCH")
        if published_at > as_of:
            findings.append("POST_CUTOFF_SOURCE")
        if any(pattern.search(text) for pattern in INJECTION_PATTERNS):
            findings.append("PROMPT_INJECTION_PATTERN")
        status = "PASS" if not findings else "BLOCKED"
        source_results.append({
            "source_id": source_id,
            "status": status,
            "sha256": actual_digest,
            "findings": findings,
        })
        source_index[source_id] = (source, text, status)

    claim_results: list[dict[str, Any]] = []
    seen_claims: set[str] = set()
    for claim in case["claims"]:
        if not isinstance(claim, dict):
            raise CaseError("claim_record_invalid")
        claim_id = _required_string(claim, "claim_id", limit=120)
        if claim_id in seen_claims:
            raise CaseError("claim_id_duplicate")
        seen_claims.add(claim_id)
        statement = _required_string(claim, "statement")
        kind = claim.get("kind")
        materiality = claim.get("materiality")
        evidence = claim.get("evidence")
        counterevidence = claim.get("counterevidence")
        if kind not in ALLOWED_KINDS or materiality not in ALLOWED_MATERIALITY:
            raise CaseError("claim_classification_invalid")
        if not isinstance(evidence, list) or not isinstance(counterevidence, list):
            raise CaseError("claim_evidence_invalid")

        findings: list[str] = []
        verified_evidence = 0
        verified_counterevidence = 0
        for spans, counter in ((evidence, False), (counterevidence, True)):
            for span in spans:
                if not isinstance(span, dict):
                    findings.append("EVIDENCE_SPAN_INVALID")
                    continue
                source_id = _required_string(span, "source_id", limit=120)
                quote = _required_string(span, "quote")
                _required_string(span, "locator", limit=300)
                source = source_index.get(source_id)
                if source is None:
                    findings.append("SOURCE_UNKNOWN")
                elif source[2] != "PASS":
                    findings.append("SOURCE_BLOCKED")
                elif _normalize(quote) not in _normalize(source[1]):
                    findings.append("QUOTE_NOT_CONTAINED")
                elif counter:
                    verified_counterevidence += 1
                else:
                    verified_evidence += 1

        computed: str | None = None
        calculation_ok = True
        if kind == "derived":
            calculation = claim.get("calculation")
            if not isinstance(calculation, dict):
                findings.append("CALCULATION_REQUIRED")
                calculation_ok = False
            else:
                try:
                    computed, calculation_ok = _compute(calculation)
                except CaseError as exc:
                    findings.append(str(exc).upper())
                    calculation_ok = False
                if not calculation_ok:
                    findings.append("CALCULATION_MISMATCH")

        if "SOURCE_BLOCKED" in findings:
            state = "BLOCKED"
        elif kind == "judgment":
            state = "HUMAN_REVIEW"
        elif verified_counterevidence:
            state = "CONTRADICTED"
        elif verified_evidence and calculation_ok and not findings:
            state = "SUPPORTED"
        else:
            state = "UNVERIFIED"
        claim_results.append({
            "claim_id": claim_id,
            "statement": statement,
            "kind": kind,
            "materiality": materiality,
            "state": state,
            "verified_evidence": verified_evidence,
            "verified_counterevidence": verified_counterevidence,
            "computed": computed,
            "findings": sorted(set(findings)),
        })

    blocking_states = {"BLOCKED", "CONTRADICTED", "UNVERIFIED"}
    material_blockers = [
        result for result in claim_results
        if result["materiality"] == "high" and result["state"] in blocking_states
    ]
    workflow_disposition = "HOLD" if material_blockers else "READY_FOR_HUMAN_REVIEW"
    counts = dict(sorted(Counter(item["state"] for item in claim_results).items()))
    packet_without_digest = {
        "schema_version": "ic-evidence-lab.packet/v1",
        "case_id": case["case_id"],
        "company": case["company"],
        "as_of": case["as_of"],
        "generated_at": case["generated_at"],
        "workflow_disposition": workflow_disposition,
        "investment_decision": "PENDING_HUMAN",
        "decision_owner": "HUMAN",
        "source_results": source_results,
        "claim_results": claim_results,
        "open_questions": case["open_questions"],
        "limitations": [
            "Literal evidence containment does not establish semantic truth.",
            "The workflow does not fetch URLs, make investment decisions, or provide financial advice.",
            "Judgment claims require named human review.",
        ],
    }
    packet = dict(packet_without_digest)
    packet["content_sha256"] = digest_json(packet_without_digest)
    receipt = {
        "schema_version": "ic-evidence-lab.receipt/v1",
        "case_id": case["case_id"],
        "status": "BLOCKED" if material_blockers else "PASS",
        "workflow_disposition": workflow_disposition,
        "investment_decision": "PENDING_HUMAN",
        "claim_state_counts": counts,
        "packet_sha256": digest_json(packet),
        "limitations": packet["limitations"],
    }
    return packet, receipt


def render_packet_markdown(packet: dict[str, Any]) -> str:
    def clean(value: object) -> str:
        return str(value).replace("|", "\\|").replace("\n", " ")

    lines = [
        f"# Evidence packet: {clean(packet['company'])}",
        "",
        f"- As of: `{clean(packet['as_of'])}`",
        f"- Workflow disposition: `{clean(packet['workflow_disposition'])}`",
        f"- Investment decision: `{clean(packet['investment_decision'])}`",
        f"- Decision owner: `{clean(packet['decision_owner'])}`",
        f"- Packet content SHA-256: `{clean(packet['content_sha256'])}`",
        "",
        "## Claim ledger",
        "",
        "| ID | State | Materiality | Claim |",
        "|---|---|---|---|",
    ]
    for claim in packet["claim_results"]:
        lines.append(
            f"| {clean(claim['claim_id'])} | `{clean(claim['state'])}` | "
            f"{clean(claim['materiality'])} | {clean(claim['statement'])} |"
        )
    lines.extend(["", "## Open questions", ""])
    lines.extend(f"- {clean(question)}" for question in packet["open_questions"])
    lines.extend(["", "## Limitations", ""])
    lines.extend(f"- {clean(limitation)}" for limitation in packet["limitations"])
    lines.append("")
    return "\n".join(lines)


def write_outputs(case_path: str | Path, output_dir: str | Path) -> tuple[Path, Path, Path]:
    packet, receipt = run_case(case_path)
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    packet_path = destination / "packet.json"
    receipt_path = destination / "receipt.json"
    memo_path = destination / "memo.md"
    packet_path.write_bytes(canonical_json(packet) + b"\n")
    receipt_path.write_bytes(canonical_json(receipt) + b"\n")
    memo_path.write_text(render_packet_markdown(packet), encoding="utf-8")
    return packet_path, receipt_path, memo_path
