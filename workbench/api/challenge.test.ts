// @vitest-environment node
import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import handler, {admitRateWindow, validateBrowserBoundary, validateChallengeOutput, validateChallengeRequest} from "./challenge.js";

const evidence = [{id: "metric-runway", title: "Runway", displayValue: "19.1 months", summary: "Cash divided by average signed net burn."}];
function request(overrides: Record<string, unknown> = {}) {
  const canonical = JSON.stringify({job: "challenge_selected_evidence", evidence, output_contract: "underwriting-evidence-challenge/v1"});
  return {job: "challenge_selected_evidence", evidence, output_contract: "underwriting-evidence-challenge/v1", request_digest_sha256: createHash("sha256").update(canonical).digest("hex"), ...overrides};
}

describe("hosted synthetic evidence challenge boundary", () => {
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
    const output = {challenges: [{claim: "Runway may be overstated", evidence_refs: ["metric-runway"], severity: "HIGH", management_question: "Which costs are committed?"}], gaps: [{title: "Reconcile commitments", why_it_matters: "The runway denominator may omit contracted spend.", proposed_owner: "Finance diligence", evidence_refs: ["metric-runway"]}], memo_drafts: []};
    expect(validateChallengeOutput(output, new Set(["metric-runway"]))).toEqual(output);
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
});
