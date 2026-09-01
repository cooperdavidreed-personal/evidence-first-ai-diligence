export interface SelectedEvidence {
  id: string;
  title: string;
  displayValue: string;
  summary: string;
}
export type ProposalState = "PROPOSED" | "ACCEPTED" | "REJECTED";
export type ProposalKind = "CHALLENGE" | "DILIGENCE_GAP" | "MEMO_DRAFT";
export interface ModelProposal {
  proposalId: string;
  kind: ProposalKind;
  state: ProposalState;
  title: string;
  body: string;
  evidenceRefs: string[];
  severity?: "HIGH" | "MEDIUM" | "LOW";
  proposedOwner?: string;
  memoSection?: string;
  humanActor?: string;
}
export interface ModelReviewResult {
  status: "UNAVAILABLE" | "PRODUCED" | "FAILED";
  message: string;
  proposals: ModelProposal[];
  droppedItems: number;
}
export type ModelTransport = (request: {job: "challenge_selected_evidence"; evidence: SelectedEvidence[]; output_contract: string}) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null; }
function refs(value: unknown, allowed: Set<string>) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12 || value.some((item) => typeof item !== "string" || !allowed.has(item))) return null;
  return [...new Set(value as string[])];
}
function proposalId(kind: ProposalKind, index: number, evidenceRefs: string[]) { return `proposal-${kind.toLowerCase()}-${index + 1}-${evidenceRefs.join("-").replace(/[^a-z0-9-]/gi, "").slice(0, 32)}`; }

export function validateSelectedEvidence(evidence: SelectedEvidence[]) {
  if (evidence.length < 1 || evidence.length > 20) throw new Error("Select between one and twenty evidence items");
  const ids = new Set<string>();
  for (const item of evidence) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(item.id) || ids.has(item.id)) throw new Error("Selected evidence identifiers must be unique and bounded");
    if (!bounded(item.title, 160) || !bounded(item.displayValue, 120) || !bounded(item.summary, 800)) throw new Error("Selected evidence text exceeds the model-review boundary");
    ids.add(item.id);
  }
}

export function validateModelOutput(raw: unknown, evidence: SelectedEvidence[]) {
  const allowed = new Set(evidence.map((item) => item.id)); const proposals: ModelProposal[] = []; let droppedItems = 0;
  if (!record(raw)) return {proposals, droppedItems: 1};
  const challenges = Array.isArray(raw.challenges) ? raw.challenges : [];
  challenges.forEach((item, index) => {
    if (!record(item)) { droppedItems += 1; return; }
    const claim = bounded(item.claim, 500), question = bounded(item.management_question, 500), evidenceRefs = refs(item.evidence_refs, allowed);
    const severity = ["HIGH", "MEDIUM", "LOW"].includes(String(item.severity)) ? item.severity as "HIGH" | "MEDIUM" | "LOW" : null;
    if (!claim || !question || !evidenceRefs || !severity) { droppedItems += 1; return; }
    proposals.push({proposalId: proposalId("CHALLENGE", index, evidenceRefs), kind: "CHALLENGE", state: "PROPOSED", title: claim, body: question, evidenceRefs, severity});
  });
  const gaps = Array.isArray(raw.gaps) ? raw.gaps : [];
  gaps.forEach((item, index) => {
    if (!record(item)) { droppedItems += 1; return; }
    const title = bounded(item.title, 240), body = bounded(item.why_it_matters, 800), proposedOwner = bounded(item.proposed_owner, 160), evidenceRefs = refs(item.evidence_refs, allowed);
    if (!title || !body || !proposedOwner || !evidenceRefs) { droppedItems += 1; return; }
    proposals.push({proposalId: proposalId("DILIGENCE_GAP", index, evidenceRefs), kind: "DILIGENCE_GAP", state: "PROPOSED", title, body, evidenceRefs, proposedOwner});
  });
  const drafts = Array.isArray(raw.memo_drafts) ? raw.memo_drafts : [];
  drafts.forEach((item, index) => {
    if (!record(item)) { droppedItems += 1; return; }
    const section = bounded(item.section, 80), body = bounded(item.draft_text, 2000), evidenceRefs = refs(item.evidence_refs, allowed);
    if (!section || !body || !evidenceRefs) { droppedItems += 1; return; }
    proposals.push({proposalId: proposalId("MEMO_DRAFT", index, evidenceRefs), kind: "MEMO_DRAFT", state: "PROPOSED", title: `Draft ${section}`, body, evidenceRefs, memoSection: section});
  });
  return {proposals, droppedItems};
}

export async function runEvidenceChallenge(evidence: SelectedEvidence[], transport?: ModelTransport): Promise<ModelReviewResult> {
  if (!transport) return {status: "UNAVAILABLE", message: "Model review unavailable — no runtime credentials configured. Deterministic analysis remains functional.", proposals: [], droppedItems: 0};
  try { validateSelectedEvidence(evidence); }
  catch (error) { return {status: "FAILED", message: error instanceof Error ? error.message : "Selected evidence is invalid", proposals: [], droppedItems: 0}; }
  try {
    const raw = await transport({job: "challenge_selected_evidence", evidence: evidence.map((item) => ({...item})), output_contract: "underwriting-evidence-challenge/v1"});
    const validated = validateModelOutput(raw, evidence);
    return {status: "PRODUCED", message: validated.proposals.length ? `${validated.proposals.length} proposals require human review.` : "The response contained no admissible evidence-linked proposals.", ...validated};
  } catch (error) {
    return {status: "FAILED", message: error instanceof Error ? error.message : "Model review failed", proposals: [], droppedItems: 0};
  }
}

export function reviewProposal(proposal: ModelProposal, decision: "ACCEPTED" | "REJECTED", humanActor: string): ModelProposal {
  if (proposal.state !== "PROPOSED") throw new Error("Only a proposed item can be reviewed");
  const actor = bounded(humanActor, 120); if (!actor) throw new Error("A human actor is required");
  return {...proposal, state: decision, humanActor: actor};
}
