export interface SelectedEvidence {
  id: string;
  title: string;
  displayValue: string;
  summary: string;
}
export type ProposalState = "PROPOSED" | "ACCEPTED" | "REJECTED";
export type ProposalKind = "CHALLENGE" | "DILIGENCE_GAP" | "MEMO_DRAFT";
export type ProposalOrigin = "IN_PRODUCT_RUNTIME" | "LOCAL_MCP_LEDGER" | "PORTABLE_IMPORT_UNVERIFIED";
export interface ModelProposal {
  proposalId: string;
  kind: ProposalKind;
  state: ProposalState;
  title: string;
  body: string;
  originalBody?: string;
  evidenceRefs: string[];
  dealId: string;
  origin: ProposalOrigin;
  requestEvidence: SelectedEvidence[];
  severity?: "HIGH" | "MEDIUM" | "LOW";
  proposedOwner?: string;
  memoSection?: string;
  humanActor?: string;
  humanEdited?: boolean;
  reviewedAt?: string;
  requestDigestSha256: string;
  sourceRequestDigestSha256?: string;
  responseDigestSha256?: string;
  modelFamily?: string;
  limitations?: string;
}
export interface ModelReviewResult {
  status: "UNAVAILABLE" | "PRODUCED" | "FAILED";
  message: string;
  proposals: ModelProposal[];
  droppedItems: number;
}
export interface ModelChallengeRequest {
  job: "challenge_selected_evidence";
  deal_id: string;
  evidence: SelectedEvidence[];
  output_contract: "underwriting-evidence-challenge/v1";
  request_digest_sha256: string;
}
export type ModelTransport = (request: ModelChallengeRequest) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null; }
function refs(value: unknown, allowed: Set<string>) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12 || value.some((item) => typeof item !== "string" || !allowed.has(item))) return null;
  return [...new Set(value as string[])];
}
function proposalId(kind: ProposalKind, index: number, evidenceRefs: string[], requestDigestSha256: string, responseDigestSha256: string) { return `proposal-${requestDigestSha256.slice(0, 10)}-${responseDigestSha256.slice(0, 10)}-${kind.toLowerCase()}-${index + 1}-${evidenceRefs.join("-").replace(/[^a-z0-9-]/gi, "").slice(0, 20)}`; }

export function canonicalChallengePayload(dealId: string, evidence: SelectedEvidence[]) {
  return JSON.stringify({job: "challenge_selected_evidence", deal_id: dealId, evidence: evidence.map(({id, title, displayValue, summary}) => ({id, title, displayValue, summary})), output_contract: "underwriting-evidence-challenge/v1"});
}

export async function digestChallengePayload(dealId: string, evidence: SelectedEvidence[]) {
  return digestChallengePayloadSync(dealId, evidence);
}

export function digestTextSync(value: string) {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

export function digestChallengePayloadSync(dealId: string, evidence: SelectedEvidence[]) {
  return digestTextSync(canonicalChallengePayload(dealId, evidence));
}

async function digestResponseEnvelope(raw: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function validateSelectedEvidence(dealId: string, evidence: SelectedEvidence[]) {
  if (typeof dealId !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(dealId)) throw new Error("The deal identifier is outside the hosted review boundary");
  if (evidence.length < 1 || evidence.length > 8) throw new Error("Select between one and eight evidence items");
  const ids = new Set<string>();
  for (const item of evidence) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(item.id) || ids.has(item.id)) throw new Error("Selected evidence identifiers must be unique and bounded");
    if (!bounded(item.title, 160) || !bounded(item.displayValue, 120) || !bounded(item.summary, 800)) throw new Error("Selected evidence text exceeds the model-review boundary");
    ids.add(item.id);
  }
  if (new TextEncoder().encode(canonicalChallengePayload(dealId, evidence)).byteLength > 12_000) throw new Error("Selected evidence exceeds the 12,000-byte model-review boundary");
}

export function validateModelOutput(raw: unknown, dealId: string, evidence: SelectedEvidence[], requestDigestSha256: string, responseDigestSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(requestDigestSha256) || !/^[a-f0-9]{64}$/.test(responseDigestSha256)) throw new Error("Model proposal digest is invalid");
  const allowed = new Set(evidence.map((item) => item.id)); const proposals: ModelProposal[] = []; let droppedItems = 0;
  if (!record(raw)) return {proposals, droppedItems: 1};
  if (raw.deal_id !== dealId || raw.request_digest_sha256 !== requestDigestSha256) return {proposals, droppedItems: 1};
  const modelFamily = bounded(raw.model_family, 120) ?? undefined;
  const limitations = bounded(raw.limitations, 500) ?? undefined;
  const challenges = Array.isArray(raw.challenges) ? raw.challenges : [];
  challenges.forEach((item, index) => {
    if (!record(item)) { droppedItems += 1; return; }
    const claim = bounded(item.claim, 500), question = bounded(item.management_question, 500), evidenceRefs = refs(item.evidence_refs, allowed);
    const severity = ["HIGH", "MEDIUM", "LOW"].includes(String(item.severity)) ? item.severity as "HIGH" | "MEDIUM" | "LOW" : null;
    if (!claim || !question || !evidenceRefs || !severity) { droppedItems += 1; return; }
    proposals.push({proposalId: proposalId("CHALLENGE", index, evidenceRefs, requestDigestSha256, responseDigestSha256), kind: "CHALLENGE", state: "PROPOSED", title: claim, body: question, evidenceRefs, dealId, origin: "IN_PRODUCT_RUNTIME", requestEvidence: evidence.map((item) => ({...item})), severity, requestDigestSha256, responseDigestSha256, modelFamily, limitations});
  });
  const gaps = Array.isArray(raw.gaps) ? raw.gaps : [];
  gaps.forEach((item, index) => {
    if (!record(item)) { droppedItems += 1; return; }
    const title = bounded(item.title, 240), body = bounded(item.why_it_matters, 800), proposedOwner = bounded(item.proposed_owner, 160), evidenceRefs = refs(item.evidence_refs, allowed);
    if (!title || !body || !proposedOwner || !evidenceRefs) { droppedItems += 1; return; }
    proposals.push({proposalId: proposalId("DILIGENCE_GAP", index, evidenceRefs, requestDigestSha256, responseDigestSha256), kind: "DILIGENCE_GAP", state: "PROPOSED", title, body, evidenceRefs, dealId, origin: "IN_PRODUCT_RUNTIME", requestEvidence: evidence.map((item) => ({...item})), proposedOwner, requestDigestSha256, responseDigestSha256, modelFamily, limitations});
  });
  const drafts = Array.isArray(raw.memo_drafts) ? raw.memo_drafts : [];
  drafts.forEach((item, index) => {
    if (!record(item)) { droppedItems += 1; return; }
    const section = bounded(item.section, 80), body = bounded(item.draft_text, 2000), evidenceRefs = refs(item.evidence_refs, allowed);
    if (!section || !body || !evidenceRefs) { droppedItems += 1; return; }
    proposals.push({proposalId: proposalId("MEMO_DRAFT", index, evidenceRefs, requestDigestSha256, responseDigestSha256), kind: "MEMO_DRAFT", state: "PROPOSED", title: `Draft ${section}`, body, evidenceRefs, dealId, origin: "IN_PRODUCT_RUNTIME", requestEvidence: evidence.map((item) => ({...item})), memoSection: section, requestDigestSha256, responseDigestSha256, modelFamily, limitations});
  });
  return {proposals, droppedItems};
}

export async function runEvidenceChallenge(dealId: string, evidence: SelectedEvidence[], transport?: ModelTransport): Promise<ModelReviewResult> {
  if (!transport) return {status: "UNAVAILABLE", message: "Model review unavailable — no runtime credentials configured. Deterministic analysis remains functional.", proposals: [], droppedItems: 0};
  try { validateSelectedEvidence(dealId, evidence); }
  catch (error) { return {status: "FAILED", message: error instanceof Error ? error.message : "Selected evidence is invalid", proposals: [], droppedItems: 0}; }
  try {
    const requestDigestSha256 = await digestChallengePayload(dealId, evidence);
    const raw = await transport({job: "challenge_selected_evidence", deal_id: dealId, evidence: evidence.map((item) => ({...item})), output_contract: "underwriting-evidence-challenge/v1", request_digest_sha256: requestDigestSha256});
    const responseDigestSha256 = await digestResponseEnvelope(raw);
    const validated = validateModelOutput(raw, dealId, evidence, requestDigestSha256, responseDigestSha256);
    return {status: "PRODUCED", message: validated.proposals.length ? `${validated.proposals.length} proposals require human review.` : "The response contained no admissible evidence-linked proposals.", ...validated};
  } catch (error) {
    return {status: "FAILED", message: error instanceof Error ? error.message : "Model review failed", proposals: [], droppedItems: 0};
  }
}

export function reviewProposal(proposal: ModelProposal, decision: "ACCEPTED" | "REJECTED", humanActor: string, editedBody?: string): ModelProposal {
  if (proposal.state !== "PROPOSED") throw new Error("Only a proposed item can be reviewed");
  const actor = bounded(humanActor, 120); if (!actor) throw new Error("A human actor is required");
  const nextBody = editedBody === undefined ? proposal.body : bounded(editedBody, 2000);
  if (!nextBody) throw new Error("Edited proposal text is required");
  const humanEdited = nextBody !== proposal.body;
  return {...proposal, body: nextBody, originalBody: humanEdited ? proposal.originalBody ?? proposal.body : proposal.originalBody, state: decision, humanActor: actor, humanEdited, reviewedAt: new Date().toISOString()};
}
import {sha256} from "@noble/hashes/sha2.js";
import {bytesToHex} from "@noble/hashes/utils.js";
