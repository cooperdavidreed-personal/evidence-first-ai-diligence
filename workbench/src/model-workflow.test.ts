import {describe, expect, it, vi} from "vitest";
import rawData from "./data/cases.json";
import {reviewProposal, runEvidenceChallenge, type ModelChallengeRequest, type SelectedEvidence} from "./model-workflow";

const evidence: SelectedEvidence[] = [{id: "metric-runway", title: "Runway", displayValue: "17.3 months", summary: "Declared cash divided by recent burn."}];

describe("controlled evidence challenge", () => {
  it("is honestly unavailable without a configured transport", async () => {
    const result = await runEvidenceChallenge(evidence);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.proposals).toEqual([]);
    expect(result.message).toMatch(/no runtime credentials configured/);
  });

  it("produces only structured evidence-linked proposals", async () => {
    const transport = vi.fn(async (request: ModelChallengeRequest) => ({
      request_digest_sha256: request.request_digest_sha256,
      challenges: [{claim: "Runway depends on a short burn window", evidence_refs: ["metric-runway"], severity: "HIGH", management_question: "Which committed costs are absent?"}],
      gaps: [{title: "Reconcile committed spend", why_it_matters: "Runway may be overstated.", proposed_owner: "Finance diligence", evidence_refs: ["metric-runway"]}],
      memo_drafts: [{section: "downside", draft_text: "Runway remains the gating risk.", evidence_refs: ["metric-runway"]}],
    }));
    const result = await runEvidenceChallenge(evidence, transport);
    expect(result.status).toBe("PRODUCED");
    expect(result.proposals).toHaveLength(3);
    expect(result.proposals.every((proposal) => proposal.state === "PROPOSED")).toBe(true);
    expect(result.proposals.every((proposal) => proposal.evidenceRefs[0] === "metric-runway")).toBe(true);
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({job: "challenge_selected_evidence", output_contract: "underwriting-evidence-challenge/v1"}));
  });

  it("drops uncited and unknown-reference items and reports the count", async () => {
    const result = await runEvidenceChallenge(evidence, async (request) => ({
      request_digest_sha256: request.request_digest_sha256,
      challenges: [{claim: "Uncited", evidence_refs: [], severity: "LOW", management_question: "Why?"}, {claim: "Unknown", evidence_refs: ["not-selected"], severity: "HIGH", management_question: "Why?"}],
      gaps: [], memo_drafts: [],
    }));
    expect(result.status).toBe("PRODUCED");
    expect(result.proposals).toEqual([]);
    expect(result.droppedItems).toBe(2);
  });

  it("does not mutate the canonical analytical case", async () => {
    const before = JSON.stringify(rawData);
    const result = await runEvidenceChallenge(evidence, async (request) => ({request_digest_sha256: request.request_digest_sha256, challenges: [{claim: "Challenge", evidence_refs: ["metric-runway"], severity: "MEDIUM", management_question: "Test it"}], gaps: [], memo_drafts: []}));
    const reviewed = reviewProposal(result.proposals[0], "ACCEPTED", "Test analyst");
    expect(reviewed.state).toBe("ACCEPTED");
    expect(reviewed.humanActor).toBe("Test analyst");
    expect(JSON.stringify(rawData)).toBe(before);
  });

  it("fails before transport when evidence exceeds the selected-evidence contract", async () => {
    const transport = vi.fn();
    const result = await runEvidenceChallenge([], transport);
    expect(result.status).toBe("FAILED");
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a response that omits the exact request digest", async () => {
    const result = await runEvidenceChallenge(evidence, async () => ({challenges: [{claim: "Unbound", evidence_refs: ["metric-runway"], severity: "HIGH", management_question: "Why?"}], gaps: [], memo_drafts: []}));
    expect(result.proposals).toEqual([]);
    expect(result.droppedItems).toBe(1);
  });
});
