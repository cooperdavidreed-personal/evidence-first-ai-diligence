from __future__ import annotations

from typing import Literal, NotRequired, TypedDict


ClaimKind = Literal["fact", "derived", "judgment"]
CitationStatus = Literal[
    "LOCAL_CITATION_BYTES_MATCH",
    "LOCAL_EVIDENCE_AND_COUNTER_BYTES_MATCH",
    "LOCAL_COUNTER_BYTES_MATCH",
    "CITATION_BYTES_MISMATCH",
    "NO_CITATIONS",
    "SOURCE_CONTROL_BLOCKED",
    "CALC_CONTROL_MISMATCH",
]
AdjudicationStatus = Literal["PENDING_HUMAN"]


class EffectivePeriod(TypedDict, total=False):
    start: str
    end: str


class SourceRecord(TypedDict):
    source_id: str
    uri: str
    source_type: str
    payload_kind: Literal["raw_document", "extract"]
    tier: Literal["A", "B", "C", "D"]
    published_at: str
    retrieved_at: str
    path: str
    sha256: str
    effective_period: NotRequired[EffectivePeriod]
    accession_no: NotRequired[str]


class ByteLocator(TypedDict):
    scheme: Literal["utf8-byte-offset/v1"]
    start: int
    end: int
    quote_sha256: str
    section_label: str


class EvidenceSpan(TypedDict):
    source_id: str
    quote: str
    locator: ByteLocator


class Calculation(TypedDict):
    operation: Literal["growth_rate", "gross_margin", "ratio", "runway"]
    numerator: str
    denominator: str
    expected: str
    unit: Literal["percent", "months"]


class Adjudication(TypedDict):
    status: AdjudicationStatus
    adjudicator: str | None
    rationale: str | None


class ClaimRecord(TypedDict):
    claim_id: str
    statement: str
    kind: ClaimKind
    materiality: Literal["high", "medium", "low"]
    evidence: list[EvidenceSpan]
    counterevidence: list[EvidenceSpan]
    calculation: NotRequired[Calculation]


class DiligenceCase(TypedDict):
    schema_version: Literal["ic-evidence-lab.case/v2"]
    case_id: str
    company: str
    as_of: str
    generated_at: str
    source_policy: dict[str, object]
    sources: list[SourceRecord]
    claims: list[ClaimRecord]
    open_questions: list[str]
