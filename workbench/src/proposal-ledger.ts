import {canonicalEvidenceItem} from "./canonical-evidence";
import {digestChallengePayloadSync, digestTextSync, type ModelProposal, type ProposalKind, type SelectedEvidence} from "./model-workflow";
import type {CaseData} from "./types";

interface ImportResult {proposals: ModelProposal[]; dropped: number; reasons: string[]}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null; }

function requestEvidence(caseData: CaseData, refs: string[]): SelectedEvidence[] {
  return refs.map((id) => canonicalEvidenceItem(caseData, id)).filter((item): item is SelectedEvidence => item !== null);
}

export function importProposalLedger(source: string, caseData: CaseData): ImportResult {
  const proposals: ModelProposal[] = []; const reasons: string[] = []; const ids = new Set<string>();
  const knownRefs = new Set([...caseData.metricRegistry.map((item) => item.metric_id), ...caseData.analyses.map((item) => item.analysis_id), ...caseData.artifacts.map((item) => item.artifact_id)]);
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let item: unknown;
    try { item = JSON.parse(line); }
    catch { reasons.push(`Line ${index + 1}: invalid JSON`); continue; }
    if (!record(item)) { reasons.push(`Line ${index + 1}: proposal is not an object`); continue; }
    const proposalId = text(item.proposal_id, 160);
    if (!proposalId || ids.has(proposalId)) { reasons.push(`Line ${index + 1}: invalid or duplicate proposal id`); continue; }
    if (item.deal_id !== caseData.caseId || item.manifest_sha256 !== caseData.manifest_sha256 || item.analysis_sha256 !== caseData.analysis_sha256) { reasons.push(`Line ${index + 1}: deal or retained-package digest mismatch`); continue; }
    const sourceRequestDigestSha256 = text(item.request_digest_sha256, 64);
    if (!sourceRequestDigestSha256 || !/^[a-f0-9]{64}$/.test(sourceRequestDigestSha256)) { reasons.push(`Line ${index + 1}: request digest is missing or invalid`); continue; }
    if (!Array.isArray(item.evidence_refs) || item.evidence_refs.length < 1 || item.evidence_refs.length > 20 || item.evidence_refs.some((ref) => typeof ref !== "string" || !knownRefs.has(ref))) { reasons.push(`Line ${index + 1}: evidence reference is not canonical`); continue; }
    const evidenceRefs = [...new Set(item.evidence_refs as string[])]; let kind: ProposalKind; let title: string | null; let body: string | null; const extras: Partial<ModelProposal> = {};
    let sourcePayload: Record<string, unknown>;
    if (item.kind === "OBSERVATION") { kind = "CHALLENGE"; title = "Model observation"; body = text(item.text, 1200); sourcePayload = {kind: item.kind, deal_id: caseData.caseId, evidence_refs: evidenceRefs, text: body}; }
    else if (item.kind === "DILIGENCE_REQUEST") { kind = "DILIGENCE_GAP"; title = text(item.title, 240); body = text(item.why_it_matters, 1200); extras.proposedOwner = text(item.proposed_owner, 160) ?? undefined; sourcePayload = {kind: item.kind, deal_id: caseData.caseId, evidence_refs: evidenceRefs, title, why_it_matters: body, proposed_owner: extras.proposedOwner}; }
    else if (item.kind === "MEMO_SECTION") { kind = "MEMO_DRAFT"; const section = text(item.section, 100); title = section ? `Draft ${section}` : null; body = text(item.draft_text, 2400); extras.memoSection = section ?? undefined; sourcePayload = {kind: item.kind, deal_id: caseData.caseId, evidence_refs: evidenceRefs, section, draft_text: body}; }
    else { reasons.push(`Line ${index + 1}: unsupported proposal kind`); continue; }
    if (!title || !body) { reasons.push(`Line ${index + 1}: proposal text is invalid`); continue; }
    if (digestTextSync(JSON.stringify(sourcePayload)) !== sourceRequestDigestSha256) { reasons.push(`Line ${index + 1}: request digest does not match the ledger proposal`); continue; }
    const selectedEvidence = requestEvidence(caseData, evidenceRefs);
    proposals.push({proposalId: `ledger:${proposalId}`, kind, state: "PROPOSED", title, body, evidenceRefs, dealId: caseData.caseId, origin: "LOCAL_MCP_LEDGER", requestEvidence: selectedEvidence, requestDigestSha256: digestChallengePayloadSync(caseData.caseId, selectedEvidence), sourceRequestDigestSha256, modelFamily: "Local MCP ledger", ...extras}); ids.add(proposalId);
  }
  return {proposals, dropped: reasons.length, reasons};
}
