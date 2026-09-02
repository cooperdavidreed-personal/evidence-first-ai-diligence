import {describe, expect, it} from "vitest";
import rawData from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";
import {digestTextSync} from "./model-workflow";
import {importProposalLedger} from "./proposal-ledger";

const candidate: unknown = rawData; assertWorkbenchData(candidate);
const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid")!;
const canonicalRef = atlasgrid.metricRegistry[0].metric_id;
function line(overrides: Record<string, unknown> = {}) {
  const record = {proposal_id: "proposal-1", status: "ACCEPTED", approval_state: "ACCEPTED", kind: "MEMO_SECTION", deal_id: atlasgrid.caseId, manifest_sha256: atlasgrid.manifest_sha256, analysis_sha256: atlasgrid.analysis_sha256, section: "Downside", draft_text: "Reconcile the downside case before committee review.", evidence_refs: [canonicalRef], ...overrides} as Record<string, unknown>;
  const payload = record.kind === "OBSERVATION"
    ? {kind: record.kind, deal_id: record.deal_id, evidence_refs: record.evidence_refs, text: record.text}
    : record.kind === "DILIGENCE_REQUEST"
      ? {kind: record.kind, deal_id: record.deal_id, evidence_refs: record.evidence_refs, title: record.title, why_it_matters: record.why_it_matters, proposed_owner: record.proposed_owner}
      : {kind: record.kind, deal_id: record.deal_id, evidence_refs: record.evidence_refs, section: record.section, draft_text: record.draft_text};
  if (!("request_digest_sha256" in record)) record.request_digest_sha256 = digestTextSync(JSON.stringify(payload));
  return JSON.stringify(record);
}

describe("MCP proposal ledger import", () => {
  it("imports a matching proposal as PROPOSED regardless of incoming state", () => {
    const result = importProposalLedger(line(), atlasgrid);
    expect(result.dropped).toBe(0);
    expect(result.proposals).toEqual([expect.objectContaining({proposalId: "ledger:proposal-1", kind: "MEMO_DRAFT", state: "PROPOSED", title: "Draft Downside", evidenceRefs: [canonicalRef]})]);
  });

  it("rejects deal, digest, and evidence mismatches", () => {
    const result = importProposalLedger([line({proposal_id: "wrong-deal", deal_id: "helios"}), line({proposal_id: "wrong-digest", manifest_sha256: "0".repeat(64)}), line({proposal_id: "wrong-ref", evidence_refs: ["unknown"]}), line({proposal_id: "tampered-request", request_digest_sha256: "1".repeat(64)})].join("\n"), atlasgrid);
    expect(result.proposals).toEqual([]); expect(result.dropped).toBe(4);
  });

  it("rejects a ledger proposal broader than the eight-item human-review boundary", () => {
    const refs = atlasgrid.metricRegistry.slice(0, 9).map((item) => item.metric_id);
    const result = importProposalLedger(line({proposal_id: "too-broad", evidence_refs: refs}), atlasgrid);
    expect(result.proposals).toEqual([]);
    expect(result.reasons[0]).toMatch(/eight-item review boundary/i);
  });

  it("continues after malformed lines and never mutates canonical case data", () => {
    const before = JSON.stringify(atlasgrid);
    const result = importProposalLedger(`not-json\n${line({proposal_id: "valid-after-error", kind: "OBSERVATION", text: "Recheck concentration."})}`, atlasgrid);
    expect(result.proposals).toHaveLength(1); expect(result.dropped).toBe(1);
    expect(result.proposals[0]).toEqual(expect.objectContaining({kind: "CHALLENGE", state: "PROPOSED"}));
    expect(JSON.stringify(atlasgrid)).toBe(before);
  });
});
