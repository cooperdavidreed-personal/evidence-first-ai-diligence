from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import stat
from collections import Counter
from datetime import UTC, date, datetime
from decimal import Decimal, DecimalException, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

from .canonical import canonical_json, digest_json
from .schema import SchemaBoundaryError, validate_document


MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_EXTRACT_BYTES = 2 * 1024 * 1024
MAX_CASE_BYTES = 256 * 1024 * 1024
MAX_CASE_DOCUMENT_BYTES = 16 * 1024 * 1024
MAX_SOURCES = 64
MAX_CLAIMS = 200
INJECTION_HEURISTIC_PATTERNS = (
    re.compile(
        r"\bignore (?:all |any |the )?(?:previous |prior )?instructions\b", re.I
    ),
    re.compile(r"\bsystem prompt\b", re.I),
    re.compile(r"\bexfiltrat(?:e|ion)\b", re.I),
    re.compile(r"\bcall (?:this )?tool\b", re.I),
)
ALLOWED_KINDS = {"fact", "derived", "judgment"}
ALLOWED_MATERIALITY = {"high", "medium", "low"}
TIER_RANK = {"A": 0, "B": 1, "C": 2, "D": 3}
DEFAULT_V1_POLICY = {
    "minimum_tier": {
        "fact": {"high": "B", "medium": "B", "low": "C"},
        "derived": {"high": "B", "medium": "B", "low": "C"},
    }
}


class CaseError(ValueError):
    pass


def _read_rooted(root: Path, relative: str, *, byte_limit: int) -> bytes:
    raw = Path(relative)
    if (
        raw.is_absolute()
        or not raw.parts
        or any(part in {"", ".", ".."} for part in raw.parts)
    ):
        raise CaseError("source_path_invalid")
    directory_flags = (
        os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    )
    file_flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptors: list[int] = []
    try:
        descriptors.append(os.open(root, directory_flags))
        for component in raw.parts[:-1]:
            descriptors.append(
                os.open(component, directory_flags, dir_fd=descriptors[-1])
            )
        descriptors.append(os.open(raw.parts[-1], file_flags, dir_fd=descriptors[-1]))
        details = os.fstat(descriptors[-1])
        if not stat.S_ISREG(details.st_mode):
            raise CaseError("source_regular_file_required")
        if details.st_size > byte_limit:
            raise CaseError("source_too_large")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptors[-1], min(131072, byte_limit + 1 - total))
            if not chunk:
                break
            total += len(chunk)
            if total > byte_limit:
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


def _required_exact_string(
    record: dict[str, Any], key: str, *, limit: int = 4096
) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value or len(value) > limit:
        raise CaseError(f"{key}_invalid")
    return value


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise CaseError(f"{field}_invalid") from exc


def _parse_datetime(value: str, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise CaseError(f"{field}_invalid") from exc
    if parsed.tzinfo is None:
        raise CaseError(f"{field}_timezone_required")
    return parsed.astimezone(UTC)


def _compute(calculation: dict[str, Any]) -> tuple[str, bool]:
    try:
        operation = _required_string(calculation, "operation", limit=32)
        unit = _required_string(calculation, "unit", limit=32)
        numerator = Decimal(_required_string(calculation, "numerator", limit=100))
        denominator = Decimal(_required_string(calculation, "denominator", limit=100))
        expected = Decimal(_required_string(calculation, "expected", limit=100))
        if not all(value.is_finite() for value in (numerator, denominator, expected)):
            raise CaseError("calculation_non_finite")
        if denominator == 0:
            raise CaseError("calculation_division_by_zero")
        if operation == "growth_rate":
            if unit != "percent":
                raise CaseError("calculation_unit_invalid")
            computed = ((numerator - denominator) / denominator) * Decimal("100")
        elif operation in {"gross_margin", "ratio"}:
            if unit != "percent":
                raise CaseError("calculation_unit_invalid")
            computed = (numerator / denominator) * Decimal("100")
        elif operation == "runway":
            if unit != "months":
                raise CaseError("calculation_unit_invalid")
            computed = numerator / denominator
        else:
            raise CaseError("calculation_operation_invalid")
        computed = computed.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
        expected = expected.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
    except DecimalException as exc:
        raise CaseError("calculation_decimal_invalid") from exc
    return format(computed, "f"), computed == expected


def _schema_validate(document: Any, schema_name: str) -> None:
    try:
        validate_document(document, schema_name)
    except SchemaBoundaryError as exc:
        raise CaseError(str(exc)) from exc


def migrate_case_v1_to_v2(
    case: dict[str, Any],
    root: str | Path,
    *,
    as_of_instant: str,
    published_at_instants: dict[str, str],
) -> dict[str, Any]:
    """Return a v2 case with exact byte locators; never writes source files."""
    if case.get("schema_version") != "ic-evidence-lab.case/v1":
        raise CaseError("migration_source_version_invalid")
    migrated = copy.deepcopy(case)
    migrated["schema_version"] = "ic-evidence-lab.case/v2"
    old_as_of = _parse_date(migrated["as_of"], "as_of")
    parsed_as_of = _parse_datetime(as_of_instant, "as_of_instant")
    if parsed_as_of.date() != old_as_of:
        raise CaseError("migration_as_of_date_mismatch")
    migrated["as_of"] = as_of_instant
    migrated["source_policy"] = copy.deepcopy(DEFAULT_V1_POLICY)
    base = Path(root).resolve(strict=True)
    sources: dict[str, dict[str, Any]] = {}
    source_bytes: dict[str, bytes] = {}
    for source in migrated.get("sources", []):
        source_id = _required_string(source, "source_id", limit=120)
        if source_id in sources:
            raise CaseError("migration_source_id_duplicate")
        explicit_instant = published_at_instants.get(source_id)
        if explicit_instant is None:
            raise CaseError(f"migration_published_at_required:{source_id}")
        old_published = _parse_date(source["published_at"], "published_at")
        parsed_published = _parse_datetime(
            explicit_instant, f"published_at:{source_id}"
        )
        if parsed_published.date() != old_published:
            raise CaseError(f"migration_published_date_mismatch:{source_id}")
        source["published_at"] = explicit_instant
        source["payload_kind"] = "raw_document"
        data = _read_rooted(base, source["path"], byte_limit=MAX_SOURCE_BYTES)
        if hashlib.sha256(data).hexdigest() != source["sha256"]:
            raise CaseError(f"migration_source_digest_mismatch:{source_id}")
        sources[source_id] = source
        source_bytes[source_id] = data
    if set(published_at_instants) != set(sources):
        raise CaseError("migration_published_at_mapping_mismatch")
    for claim in migrated.get("claims", []):
        for collection in ("evidence", "counterevidence"):
            for span in claim.get(collection, []):
                source = sources.get(span.get("source_id"))
                if source is None:
                    raise CaseError("migration_source_unknown")
                data = source_bytes[source["source_id"]]
                quote_bytes = span["quote"].encode("utf-8")
                start = data.find(quote_bytes)
                if start < 0 or data.find(quote_bytes, start + 1) >= 0:
                    raise CaseError("migration_quote_not_unique")
                old_locator = span.get("locator")
                span["locator"] = {
                    "scheme": "utf8-byte-offset/v1",
                    "start": start,
                    "end": start + len(quote_bytes),
                    "quote_sha256": hashlib.sha256(quote_bytes).hexdigest(),
                    "section_label": old_locator
                    if isinstance(old_locator, str) and old_locator.strip()
                    else "legacy locator",
                }
    _schema_validate(migrated, "case.schema.json")
    return migrated


def _minimum_tier(case: dict[str, Any], kind: str, materiality: str) -> str:
    if kind == "judgment":
        return "D"
    return case["source_policy"]["minimum_tier"][kind][materiality]


def _tier_satisfies(actual: str, minimum: str) -> bool:
    return TIER_RANK[actual] <= TIER_RANK[minimum]


def _verify_span(
    span: dict[str, Any],
    source_index: dict[str, tuple[dict[str, Any], bytes, str]],
) -> tuple[bool, str | None, str | None]:
    source_id = _required_string(span, "source_id", limit=120)
    source = source_index.get(source_id)
    if source is None:
        return False, None, "SOURCE_UNKNOWN"
    record, data, status = source
    if status != "PASS":
        return False, record["tier"], "SOURCE_BLOCKED"
    quote = _required_exact_string(span, "quote")
    locator = span["locator"]
    start = locator["start"]
    end = locator["end"]
    if end <= start or end > len(data):
        return False, record["tier"], "LOCATOR_OUT_OF_RANGE"
    expected = quote.encode("utf-8")
    actual = data[start:end]
    if actual != expected:
        return False, record["tier"], "QUOTE_MISMATCH"
    if hashlib.sha256(actual).hexdigest() != locator["quote_sha256"]:
        return False, record["tier"], "QUOTE_HASH_MISMATCH"
    return True, record["tier"], None


def _material_control_blockers(
    claim_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    citation_blockers = {
        "CITATION_BYTES_MISMATCH",
        "NO_CITATIONS",
        "SOURCE_CONTROL_BLOCKED",
        "CALC_CONTROL_MISMATCH",
    }
    return [
        result
        for result in claim_results
        if result["materiality"] == "high"
        and (
            (
                result["kind"] != "judgment"
                and result["citation_status"] in citation_blockers
            )
            or result["citation_status"]
            in {
                "LOCAL_EVIDENCE_AND_COUNTER_BYTES_MATCH",
                "LOCAL_COUNTER_BYTES_MATCH",
            }
        )
    ]


def run_case(case_path: str | Path) -> tuple[dict[str, Any], dict[str, Any]]:
    path = Path(case_path).resolve(strict=True)
    root = path.parent
    try:
        if path.stat().st_size > MAX_CASE_DOCUMENT_BYTES:
            raise CaseError("case_document_too_large")
        raw_case = path.read_bytes()
        if len(raw_case) > MAX_CASE_DOCUMENT_BYTES:
            raise CaseError("case_document_too_large")

        def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
            result: dict[str, Any] = {}
            for key, value in pairs:
                if key in result:
                    raise CaseError(f"duplicate_json_key:{key}")
                result[key] = value
            return result

        case = json.loads(
            raw_case.decode("utf-8"),
            object_pairs_hook=reject_duplicates,
            parse_constant=lambda value: (_ for _ in ()).throw(
                CaseError(f"nonstandard_json_constant:{value}")
            ),
        )
    except CaseError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CaseError("case_unreadable") from exc
    if (
        not isinstance(case, dict)
        or case.get("schema_version") != "ic-evidence-lab.case/v2"
    ):
        raise CaseError("case_version_unsupported")
    _schema_validate(case, "case.schema.json")
    _required_string(case, "case_id", limit=120)
    _required_string(case, "company", limit=200)
    as_of = _parse_datetime(_required_string(case, "as_of", limit=40), "as_of")
    generated_at = _parse_datetime(
        _required_string(case, "generated_at", limit=40), "generated_at"
    )
    if generated_at < as_of:
        raise CaseError("generated_before_knowledge_cutoff")

    source_results: list[dict[str, Any]] = []
    source_index: dict[str, tuple[dict[str, Any], bytes, str]] = {}
    case_bytes = 0
    for source in case["sources"]:
        source_id = _required_string(source, "source_id", limit=120)
        if source_id in source_index:
            raise CaseError("source_id_duplicate")
        published_at = _parse_datetime(
            _required_string(source, "published_at", limit=40), "published_at"
        )
        retrieved_at = _parse_datetime(
            _required_string(source, "retrieved_at", limit=40), "retrieved_at"
        )
        relative = _required_string(source, "path", limit=512)
        expected_digest = _required_string(source, "sha256", limit=64)
        byte_limit = (
            MAX_EXTRACT_BYTES
            if source["payload_kind"] == "extract"
            else MAX_SOURCE_BYTES
        )
        data = _read_rooted(root, relative, byte_limit=byte_limit)
        case_bytes += len(data)
        if case_bytes > MAX_CASE_BYTES:
            raise CaseError("case_source_bytes_exceeded")
        actual_digest = hashlib.sha256(data).hexdigest()
        text = data.decode("utf-8", errors="replace")
        blocking_findings: list[str] = []
        notes: list[str] = []
        if actual_digest != expected_digest:
            blocking_findings.append("DIGEST_MISMATCH")
        if published_at > as_of:
            blocking_findings.append("POST_CUTOFF_SOURCE")
        if retrieved_at > generated_at:
            blocking_findings.append("RETRIEVED_AFTER_GENERATION")
        if retrieved_at < published_at:
            blocking_findings.append("RETRIEVED_BEFORE_PUBLICATION")
        effective_period = source.get("effective_period")
        if effective_period:
            effective_start = (
                _parse_date(effective_period["start"], "effective_period_start")
                if effective_period.get("start")
                else None
            )
            effective_end = (
                _parse_date(effective_period["end"], "effective_period_end")
                if effective_period.get("end")
                else None
            )
            if effective_start and effective_end and effective_start > effective_end:
                blocking_findings.append("EFFECTIVE_PERIOD_INVALID")
            if effective_start and effective_start > as_of.date():
                blocking_findings.append("EFFECTIVE_PERIOD_AFTER_CUTOFF")
            if effective_end and effective_end > as_of.date():
                blocking_findings.append("EFFECTIVE_PERIOD_AFTER_CUTOFF")
        if retrieved_at > as_of:
            notes.append("RETRIEVED_AFTER_CUTOFF")
        if any(pattern.search(text) for pattern in INJECTION_HEURISTIC_PATTERNS):
            blocking_findings.append("INJECTION_HEURISTIC_MATCH")
        status = "PASS" if not blocking_findings else "BLOCKED"
        source_results.append(
            {
                "source_id": source_id,
                "status": status,
                "declared_tier": source["tier"],
                "uri": source["uri"],
                "published_at": source["published_at"],
                "retrieved_at": source["retrieved_at"],
                "expected_sha256": expected_digest,
                "sha256": actual_digest,
                "blocking_findings": sorted(blocking_findings),
                "notes": sorted(notes),
            }
        )
        source_index[source_id] = (source, data, status)

    claim_results: list[dict[str, Any]] = []
    seen_claims: set[str] = set()
    for claim in case["claims"]:
        claim_id = _required_string(claim, "claim_id", limit=120)
        if claim_id in seen_claims:
            raise CaseError("claim_id_duplicate")
        seen_claims.add(claim_id)
        statement = _required_string(claim, "statement")
        kind = claim["kind"]
        materiality = claim["materiality"]
        if kind not in ALLOWED_KINDS or materiality not in ALLOWED_MATERIALITY:
            raise CaseError("claim_classification_invalid")

        findings: list[str] = []
        verified_evidence = 0
        verified_counterevidence = 0
        evidence_tiers: list[str] = []
        counterevidence_tiers: list[str] = []
        citation_checks: list[dict[str, Any]] = []
        source_blocked = False
        for collection, counter in (
            (claim["evidence"], False),
            (claim["counterevidence"], True),
        ):
            for span in collection:
                verified, tier, finding = _verify_span(span, source_index)
                citation_checks.append(
                    {
                        "collection": "counterevidence" if counter else "evidence",
                        "source_id": span["source_id"],
                        "status": finding or "LOCAL_BYTES_MATCH",
                        "declared_tier": tier,
                        "locator": copy.deepcopy(span["locator"]),
                    }
                )
                if finding:
                    findings.append(finding)
                    source_blocked = source_blocked or finding == "SOURCE_BLOCKED"
                elif verified and counter:
                    verified_counterevidence += 1
                    if tier:
                        counterevidence_tiers.append(tier)
                elif verified:
                    verified_evidence += 1
                    if tier:
                        evidence_tiers.append(tier)

        minimum_tier = _minimum_tier(case, kind, materiality)
        if (
            verified_evidence
            and kind != "judgment"
            and not any(_tier_satisfies(tier, minimum_tier) for tier in evidence_tiers)
        ):
            findings.append("EVIDENCE_TIER_INSUFFICIENT")
        if (
            verified_counterevidence
            and kind != "judgment"
            and not any(
                _tier_satisfies(tier, minimum_tier) for tier in counterevidence_tiers
            )
        ):
            findings.append("COUNTEREVIDENCE_TIER_INSUFFICIENT")

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

        if source_blocked:
            citation_status = "SOURCE_CONTROL_BLOCKED"
        elif not calculation_ok:
            citation_status = "CALC_CONTROL_MISMATCH"
        elif findings:
            citation_status = "CITATION_BYTES_MISMATCH"
        elif verified_evidence and verified_counterevidence:
            citation_status = "LOCAL_EVIDENCE_AND_COUNTER_BYTES_MATCH"
        elif verified_counterevidence:
            citation_status = "LOCAL_COUNTER_BYTES_MATCH"
        elif verified_evidence:
            citation_status = "LOCAL_CITATION_BYTES_MATCH"
        else:
            citation_status = "NO_CITATIONS"

        adjudication = {
            "status": "PENDING_HUMAN",
            "adjudicator": None,
            "rationale": None,
        }
        claim_results.append(
            {
                "claim_id": claim_id,
                "statement": statement,
                "kind": kind,
                "materiality": materiality,
                "citation_status": citation_status,
                "semantic_assessment": {
                    "status": "NOT_RUN",
                    "model_id": None,
                    "run_receipt": None,
                },
                "adjudication": adjudication,
                "verified_evidence": verified_evidence,
                "verified_counterevidence": verified_counterevidence,
                "citation_checks": citation_checks,
                "computed": computed,
                "findings": sorted(set(findings)),
            }
        )

    material_blockers = _material_control_blockers(claim_results)
    workflow_disposition = "HOLD" if material_blockers else "READY_FOR_HUMAN_REVIEW"
    counts = dict(
        sorted(Counter(item["citation_status"] for item in claim_results).items())
    )
    limitations = [
        "Exact citation bytes and hashes do not establish semantic truth or contradiction.",
        "Semantic model assessment is NOT_RUN until human labels are approved.",
        "The injection heuristic is a quarantine signal, not a robustness claim.",
        "Calculation checks recompute declared operands but do not prove those operands were extracted from cited bytes.",
        "The workflow does not fetch URLs, make investment decisions, or provide financial advice.",
        "Materiality, source policy, adjudication, and investment implications remain human-owned.",
    ]
    packet_without_digest = {
        "schema_version": "ic-evidence-lab.packet/v2",
        "case_sha256": digest_json(case),
        "policy_sha256": digest_json(case["source_policy"]),
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
        "limitations": limitations,
    }
    packet = dict(packet_without_digest)
    packet["content_sha256"] = digest_json(packet_without_digest)
    receipt = {
        "schema_version": "ic-evidence-lab.receipt/v2",
        "case_id": case["case_id"],
        "case_sha256": packet["case_sha256"],
        "policy_sha256": packet["policy_sha256"],
        "status": "CONTROL_BLOCKED"
        if material_blockers
        else "CONTROL_READY_FOR_REVIEW",
        "workflow_disposition": workflow_disposition,
        "investment_decision": "PENDING_HUMAN",
        "citation_status_counts": counts,
        "packet_sha256": digest_json(packet),
        "limitations": limitations,
    }
    _schema_validate(packet, "packet.schema.json")
    _schema_validate(receipt, "receipt.schema.json")
    validate_output_integrity(packet, receipt)
    return packet, receipt


def validate_output_integrity(packet: dict[str, Any], receipt: dict[str, Any]) -> None:
    """Recompute cross-document invariants that JSON Schema cannot express."""
    packet_payload = {
        key: value for key, value in packet.items() if key != "content_sha256"
    }
    if packet.get("content_sha256") != digest_json(packet_payload):
        raise CaseError("packet_content_digest_mismatch")
    if receipt.get("packet_sha256") != digest_json(packet):
        raise CaseError("receipt_packet_digest_mismatch")
    for key in (
        "case_id",
        "case_sha256",
        "policy_sha256",
        "workflow_disposition",
        "investment_decision",
    ):
        if receipt.get(key) != packet.get(key):
            raise CaseError(f"receipt_packet_{key}_mismatch")
    expected_counts = dict(
        sorted(
            Counter(item["citation_status"] for item in packet["claim_results"]).items()
        )
    )
    if receipt.get("citation_status_counts") != expected_counts:
        raise CaseError("receipt_citation_counts_mismatch")
    expected_workflow = (
        "HOLD"
        if _material_control_blockers(packet["claim_results"])
        else "READY_FOR_HUMAN_REVIEW"
    )
    if packet.get("workflow_disposition") != expected_workflow:
        raise CaseError("packet_workflow_disposition_mismatch")
    expected_status = (
        "CONTROL_BLOCKED"
        if packet["workflow_disposition"] == "HOLD"
        else "CONTROL_READY_FOR_REVIEW"
    )
    if receipt.get("status") != expected_status:
        raise CaseError("receipt_control_status_mismatch")


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
        "| ID | Citation | Semantic | Adjudication | Materiality | Claim |",
        "|---|---|---|---|---|---|",
    ]
    for claim in packet["claim_results"]:
        lines.append(
            f"| {clean(claim['claim_id'])} | `{clean(claim['citation_status'])}` | "
            f"`{clean(claim['semantic_assessment']['status'])}` | "
            f"`{clean(claim['adjudication']['status'])}` | {clean(claim['materiality'])} | "
            f"{clean(claim['statement'])} |"
        )
    lines.extend(["", "## Open questions", ""])
    lines.extend(f"- {clean(question)}" for question in packet["open_questions"])
    lines.extend(["", "## Limitations", ""])
    lines.extend(f"- {clean(limitation)}" for limitation in packet["limitations"])
    lines.append("")
    return "\n".join(lines)


def write_outputs(
    case_path: str | Path, output_dir: str | Path
) -> tuple[Path, Path, Path]:
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
