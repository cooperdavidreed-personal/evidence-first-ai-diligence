// @vitest-environment node
import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import handler, {admitRateWindow, HOSTED_MODEL_FAMILY, isClientInputError, validateBrowserBoundary, validateChallengeOutput, validateChallengeRequest} from "../api/challenge.js";
import {HOSTED_EVIDENCE_REGISTRY} from "./canonical-evidence-registry.js";

const dealId = "helios";
const evidence = [HOSTED_EVIDENCE_REGISTRY.helios.find((item) => item.id === "hx-runway-metric")!];
function request(overrides: Record<string, unknown> = {}) {
  const candidate = {job: "challenge_selected_evidence", deal_id: dealId, evidence, output_contract: "underwriting-evidence-challenge/v1", ...overrides};
  const canonical = JSON.stringify({job: candidate.job, deal_id: candidate.deal_id, evidence: candidate.evidence, output_contract: candidate.output_contract});
  return {...candidate, request_digest_sha256: createHash("sha256").update(canonical).digest("hex"), ...overrides};
}

describe("hosted synthetic evidence challenge boundary", () => {
  it("pins the public reviewer to the verified AI Gateway model slug", () => {
    expect(HOSTED_MODEL_FAMILY).toBe("anthropic/claude-fable-5.1");
  });

  it("admits a bounded, digest-bound selected-evidence request", () => {
    expect(validateChallengeRequest(request())).toMatchObject({evidence, job: "challenge_selected_evidence"});
  });

  it("rejects stale digests, excess evidence, and oversized evidence", () => {
    expect(() => validateChallengeRequest(request({request_digest_sha256: "0".repeat(64)}))).toThrow(/digest mismatch/);
    const tooMany = Array.from({length: 9}, (_, index) => ({...evidence[0], id: `metric-${index}`}));
    expect(() => validateChallengeRequest(request({evidence: tooMany}))).toThrow(/job contract/);
    const huge = [{...evidence[0], summary: "x".repeat(12_001)}];
    expect(() => validateChallengeRequest(request({evidence: huge}))).toThrow(/evidence item|too large/);
  });

  it("rejects uncited or foreign-reference model output", () => {
    const output = {challenges: [{claim: "Runway may be overstated", evidence_refs: ["foreign"], severity: "HIGH", management_question: "Which costs are committed?"}], gaps: [], memo_drafts: []};
    expect(() => validateChallengeOutput(output, new Set(["metric-runway"]))).toThrow(/evidence reference/);
  });

  it("admits only a bounded proposal envelope and preserves evidence ids", () => {
    const output = {challenges: [{claim: "Runway may be overstated", evidence_refs: ["hx-runway-metric"], severity: "HIGH", management_question: "Which costs are committed?"}], gaps: [{title: "Reconcile commitments", why_it_matters: "The runway denominator may omit contracted spend.", proposed_owner: "Finance diligence", evidence_refs: ["hx-runway-metric"]}], memo_drafts: []};
    expect(validateChallengeOutput(output, new Set(["hx-runway-metric"]))).toEqual(output);
  });

  it("rejects a digest-consistent evidence item that differs from the server registry", () => {
    const substituted = [{...evidence[0], summary: "Browser supplied replacement summary."}];
    expect(() => validateChallengeRequest(request({evidence: substituted}))).toThrow(/server registry/i);
  });

  it("requires the same browser origin and bounds repeated calls", () => {
    const sameOrigin = new Request("https://desk.example/api/challenge", {method: "POST", headers: {origin: "https://desk.example", "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.40"}});
    expect(validateBrowserBoundary(sameOrigin)).toBe("203.0.113.40");
    expect(() => validateBrowserBoundary(new Request("https://desk.example/api/challenge", {method: "POST", headers: {origin: "https://other.example"}}))).toThrow(/same-origin/i);
    for (let index = 0; index < 5; index += 1) expect(admitRateWindow("test-rate-identity", index)).toBe(true);
    expect(admitRateWindow("test-rate-identity", 5)).toBe(false);
  });

  it("rejects an oversized streamed body when content-length is absent", async () => {
    const oversized = new Request("https://desk.example/api/challenge", {method: "POST", headers: {origin: "https://desk.example", "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.99"}, body: JSON.stringify({padding: "x".repeat(12_100)})});
    expect(oversized.headers.has("content-length")).toBe(false);
    const response = await handler.fetch(oversized);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({error: "Request too large"});
  });

  it("never classifies provider wording as a client error by substring", () => {
    expect(isClientInputError(new Error("Invalid upstream provider response"))).toBe(false);
    expect(isClientInputError(new Error("Evidence digest mismatch"))).toBe(true);
    expect(isClientInputError(new SyntaxError("Unexpected token"))).toBe(true);
  });
});
