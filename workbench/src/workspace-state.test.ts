import {describe, expect, it} from "vitest";
import {digestChallengePayloadSync} from "./model-workflow";
import {createWorkspace, createWorkspaceIntegrityContract, serializeWorkspace, touchWorkspace, validateWorkspace} from "./workspace-state";

const seed = {
  caseId: "atlasgrid",
  issues: [{id: "issue-1", title: "Validate churn", description: "Reconcile parent cohorts.", owner: "Commercial diligence", priority: "HIGH" as const, status: "OPEN" as const, dueDate: null, decisionImpact: "Changes leverage capacity.", evidenceRefs: ["AG-01"], resolution: null}],
  memoSections: [{sectionId: "recommendation", title: "Recommendation", body: "Reprice.", provenance: "DETERMINISTIC_ANALYSIS" as const, updatedBy: "Financial model"}],
  canonicalEvidence: [{id: "AG-01", title: "Retention", displayValue: "99.9%", summary: "Complete cohort retention."}],
};

describe("portable deal workspace", () => {
  it("creates, versions, serializes, and validates a workspace", () => {
    const initial = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    const next = touchWorkspace(initial, {privateNote: "Management explanation needs support."}, "2026-09-01T01:00:00.000Z");
    const restored = validateWorkspace(JSON.parse(serializeWorkspace(next, true)) as unknown, "atlasgrid");
    expect(restored.revision).toBe(2);
    expect(restored.privateNote).toMatch(/needs support/);
    expect(restored.issues[0].status).toBe("OPEN");
  });

  it("rejects cross-deal imports", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    expect(() => validateWorkspace(state, "helios")).toThrow(/different deal/i);
  });

  it("rejects a resolved issue without a resolution record", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    state.issues[0] = {...state.issues[0], status: "RESOLVED", resolution: null};
    expect(() => validateWorkspace(state)).toThrow(/resolution record/i);
  });

  it("rejects duplicate records and inconsistent assumption history", () => {
    const duplicate = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    duplicate.issues.push({...duplicate.issues[0]});
    expect(() => validateWorkspace(duplicate)).toThrow(/identifiers must be unique/i);

    const inconsistent = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    inconsistent.assumptionReviews["growth"] = {assumptionId: "growth", disposition: "APPROVED", actor: "Avery Chen", rationale: "Supported by the approved operating plan.", reviewedAt: "2026-09-01T01:00:00.000Z"};
    inconsistent.assumptionReviewEvents = [{...inconsistent.assumptionReviews.growth, eventId: "event-1", previousDisposition: "REJECTED"}];
    expect(() => validateWorkspace(inconsistent)).toThrow(/history.*inconsistent/i);
  });

  it("requires accepted proposal provenance for model-authored memo sections", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    state.memoSections.push({sectionId: "proposal-orphan", title: "Counterthesis", body: "Validate churn definitions.", provenance: "HUMAN_ACCEPTED_MODEL_PROPOSAL", sourceProposalId: "missing-proposal", updatedBy: "Avery Chen", updatedAt: "2026-09-01T01:00:00.000Z"});
    expect(() => validateWorkspace(state)).toThrow(/accepted model proposal/i);
  });

  it("rejects a claimed human edit that does not preserve the distinct model draft", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    const requestEvidence = seed.canonicalEvidence;
    state.proposals.push({proposalId: "proposal-1", kind: "CHALLENGE", state: "ACCEPTED", title: "Challenge retention", body: "Reconcile the denominator.", evidenceRefs: ["AG-01"], requestEvidence, requestDigestSha256: digestChallengePayloadSync(requestEvidence), humanActor: "Avery Chen", humanEdited: true, reviewedAt: "2026-09-01T01:00:00.000Z"});
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]))).toThrow(/preserve a distinct original model draft/i);
    state.proposals[0].originalBody = state.proposals[0].body;
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]))).toThrow(/preserve a distinct original model draft/i);
    state.proposals[0].originalBody = "Which cohort definitions are incomplete?";
    expect(validateWorkspace(state, "atlasgrid", new Set(["AG-01"])).proposals[0].originalBody).toBe("Which cohort definitions are incomplete?");
  });

  it("requires a newly accepted model memo section to preserve the accepted proposal text", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    const requestEvidence = seed.canonicalEvidence;
    state.proposals.push({proposalId: "proposal-1", kind: "MEMO_DRAFT", state: "ACCEPTED", title: "Draft downside", body: "Validate renewal evidence.", evidenceRefs: ["AG-01"], requestEvidence, requestDigestSha256: digestChallengePayloadSync(requestEvidence), humanActor: "Avery Chen", reviewedAt: "2026-09-01T01:00:00.000Z"});
    state.memoSections.push({sectionId: "proposal-1", title: "Draft downside", body: "A different model-authored conclusion.", provenance: "HUMAN_ACCEPTED_MODEL_PROPOSAL", sourceProposalId: "proposal-1", updatedBy: "Avery Chen", updatedAt: "2026-09-01T01:00:00.000Z"});
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]))).toThrow(/does not preserve its accepted proposal text/i);
  });

  it("rejects digest-consistent evidence metadata that differs from the canonical registry", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    const requestEvidence = [{...seed.canonicalEvidence[0], title: "Misleading substituted title"}];
    state.proposals.push({proposalId: "proposal-1", kind: "CHALLENGE", state: "PROPOSED", title: "Challenge retention", body: "Reconcile the cohort denominator.", evidenceRefs: ["AG-01"], requestEvidence, requestDigestSha256: digestChallengePayloadSync(requestEvidence)});
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]), undefined, createWorkspaceIntegrityContract(seed))).toThrow(/does not match the canonical registry/i);
  });

  it("preserves an accepted proposal when a named analyst later revises memo language", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    const requestEvidence = [{id: "AG-01", title: "Retention", displayValue: "99.9%", summary: "Complete cohort retention."}];
    state.proposals.push({proposalId: "proposal-1", kind: "MEMO_DRAFT", state: "ACCEPTED", title: "Draft downside", body: "Validate renewal evidence.", evidenceRefs: ["AG-01"], requestEvidence, requestDigestSha256: digestChallengePayloadSync(requestEvidence), humanActor: "Avery Chen", reviewedAt: "2026-09-01T01:00:00.000Z"});
    state.memoSections.push({sectionId: "proposal-1", title: "Draft downside", body: "The analyst narrowed the diligence request.", provenance: "ANALYST_JUDGMENT", sourceProposalId: "proposal-1", sourceProvenance: "HUMAN_ACCEPTED_MODEL_PROPOSAL", sourceBody: "Validate renewal evidence.", updatedBy: "Morgan Lee", updatedAt: "2026-09-01T02:00:00.000Z"});
    expect(validateWorkspace(state, "atlasgrid", new Set(["AG-01"])).memoSections.at(-1)?.sourceBody).toBe("Validate renewal evidence.");
    state.memoSections.at(-1)!.sourceBody = "Forged source text.";
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]))).toThrow(/invalid edited-model provenance/i);
  });

  it("rejects portable proposals and issues with non-canonical evidence references", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    const requestEvidence = [{id: "AG-01", title: "Retention", displayValue: "99.9%", summary: "Complete cohort retention."}];
    state.proposals.push({proposalId: "proposal-1", kind: "MEMO_DRAFT", state: "ACCEPTED", title: "Draft downside", body: "Validate renewal evidence.", evidenceRefs: ["fabricated-metric"], requestEvidence, requestDigestSha256: digestChallengePayloadSync(requestEvidence), humanActor: "Avery Chen", reviewedAt: "2026-09-01T01:00:00.000Z"});
    state.memoSections.push({sectionId: "proposal-1", title: "Draft downside", body: "Validate renewal evidence.", provenance: "HUMAN_ACCEPTED_MODEL_PROPOSAL", sourceProposalId: "proposal-1", updatedBy: "Avery Chen", updatedAt: "2026-09-01T01:00:00.000Z"});
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]))).toThrow(/outside its selected request subset/i);
    state.proposals[0].evidenceRefs = ["AG-01"];
    expect(validateWorkspace(state, "atlasgrid", new Set(["AG-01"])).proposals[0].evidenceRefs).toEqual(["AG-01"]);
    state.issues[0].evidenceRefs = ["helios-only-metric"];
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]))).toThrow(/non-canonical evidence reference/i);
  });

  it("rejects a same-case citation swapped outside its selected evidence subset", () => {
    const state = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    const requestEvidence = [{id: "AG-01", title: "Retention", displayValue: "99.9%", summary: "Complete cohort retention."}];
    state.proposals.push({proposalId: "proposal-1", kind: "CHALLENGE", state: "PROPOSED", title: "Challenge retention", body: "Reconcile the denominator.", evidenceRefs: ["AG-02"], requestEvidence, requestDigestSha256: digestChallengePayloadSync(requestEvidence)});
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01", "AG-02"]))).toThrow(/outside its selected request subset/i);
    state.proposals[0].evidenceRefs = ["AG-01"];
    state.proposals[0].requestEvidence[0].summary = "Tampered summary";
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01", "AG-02"]))).toThrow(/digest does not match/i);
  });

  it("rejects unknown or invalid scenario fields under a deal contract", () => {
    const contract = {fields: {peScenario: {kind: "ENUM" as const, values: ["selected", "ask"]}}};
    const state = createWorkspace({...seed, scenarioValues: {peScenario: "selected"}}, "2026-09-01T00:00:00.000Z");
    expect(validateWorkspace(state, "atlasgrid", new Set(["AG-01"]), contract).scenarioValues.peScenario).toBe("selected");
    state.scenarioValues.peScenario = "tampered";
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]), contract)).toThrow(/outside the deal contract/i);
    state.scenarioValues = {peScenario: "selected", injected: "1"};
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]), contract)).toThrow(/keys do not match/i);
  });

  it("binds portable issues and calculated memo sections to the canonical seed", () => {
    const contract = createWorkspaceIntegrityContract(seed);
    const missingIssue = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    missingIssue.issues = [];
    expect(() => validateWorkspace(missingIssue, "atlasgrid", new Set(["AG-01"]), undefined, contract)).toThrow(/cannot be deleted/i);

    const forgedMemo = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    forgedMemo.memoSections[0].body = "Ready to invest.";
    expect(() => validateWorkspace(forgedMemo, "atlasgrid", new Set(["AG-01"]), undefined, contract)).toThrow(/cannot impersonate/i);

    const namedRevision = createWorkspace(seed, "2026-09-01T00:00:00.000Z");
    namedRevision.memoSections[0] = {...namedRevision.memoSections[0], body: "Analyst disagrees with the calculated baseline.", provenance: "ANALYST_JUDGMENT", sourceProvenance: "DETERMINISTIC_ANALYSIS", sourceBody: "Reprice.", updatedBy: "Avery Chen"};
    expect(validateWorkspace(namedRevision, "atlasgrid", new Set(["AG-01"]), undefined, contract).memoSections[0].provenance).toBe("ANALYST_JUDGMENT");
  });

  it("does not let a quantitative hurdle disappear through a free-text issue resolution", () => {
    const lockedSeed = {...seed, lockedIssueIds: ["issue-1"]};
    const contract = createWorkspaceIntegrityContract(lockedSeed);
    const state = createWorkspace(lockedSeed, "2026-09-01T00:00:00.000Z");
    state.issues[0] = {...state.issues[0], status: "RESOLVED", resolution: "Waived in the issue log.", resolvedBy: "Avery Chen"};
    expect(() => validateWorkspace(state, "atlasgrid", new Set(["AG-01"]), undefined, contract)).toThrow(/quantitative hurdle.*cannot be resolved/i);
  });
});
