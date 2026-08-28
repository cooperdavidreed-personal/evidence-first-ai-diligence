from __future__ import annotations

from typing import Literal, NotRequired, TypedDict


ClaimKind = Literal["fact", "derived", "judgment"]
ClaimState = Literal["SUPPORTED", "CONTRADICTED", "UNVERIFIED", "BLOCKED", "HUMAN_REVIEW"]
Decision = Literal["ADVANCE_DILIGENCE", "HOLD", "DECLINE_FURTHER_DILIGENCE"]


class SourceRecord(TypedDict):
    source_id: str
    uri: str
    source_type: str
    tier: Literal["A", "B", "C", "D"]
    published_at: str
    retrieved_at: str
    path: str
    sha256: str


class EvidenceSpan(TypedDict):
    source_id: str
    quote: str
    locator: str


class Calculation(TypedDict):
    operation: Literal["growth_rate", "gross_margin", "ratio", "runway"]
    numerator: str
    denominator: str
    expected: str
    unit: str


class ClaimRecord(TypedDict):
    claim_id: str
    statement: str
    kind: ClaimKind
    materiality: Literal["high", "medium", "low"]
    evidence: list[EvidenceSpan]
    counterevidence: list[EvidenceSpan]
    calculation: NotRequired[Calculation]


class DiligenceCase(TypedDict):
    schema_version: Literal["ic-evidence-lab.case/v1"]
    case_id: str
    company: str
    as_of: str
    generated_at: str
    sources: list[SourceRecord]
    claims: list[ClaimRecord]
    open_questions: list[str]
