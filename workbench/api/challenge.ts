import {createHash} from "node:crypto";
import {generateText, jsonSchema, Output} from "ai";
import {assertCanonicalEvidenceSubset} from "../src/canonical-evidence-registry.js";

interface EvidenceItem {id: string; title: string; displayValue: string; summary: string}
interface ChallengeRequest {job: "challenge_selected_evidence"; deal_id: string; evidence: EvidenceItem[]; output_contract: "underwriting-evidence-challenge/v1"; request_digest_sha256: string}
type ChallengeOutput = {challenges: Array<{claim: string; evidence_refs: string[]; severity: "HIGH" | "MEDIUM" | "LOW"; management_question: string}>; gaps: Array<{title: string; why_it_matters: string; proposed_owner: string; evidence_refs: string[]}>; memo_drafts: Array<{section: string; draft_text: string; evidence_refs: string[]}>};

const outputSchema = jsonSchema<{
  challenges: Array<{claim: string; evidence_refs: string[]; severity: "HIGH" | "MEDIUM" | "LOW"; management_question: string}>;
  gaps: Array<{title: string; why_it_matters: string; proposed_owner: string; evidence_refs: string[]}>;
  memo_drafts: Array<{section: string; draft_text: string; evidence_refs: string[]}>;
}>({type: "object", additionalProperties: false, properties: {
  challenges: {type: "array", maxItems: 3, items: {type: "object", additionalProperties: false, properties: {claim: {type: "string", maxLength: 500}, evidence_refs: {type: "array", minItems: 1, maxItems: 12, items: {type: "string"}}, severity: {type: "string", enum: ["HIGH", "MEDIUM", "LOW"]}, management_question: {type: "string", maxLength: 500}}, required: ["claim", "evidence_refs", "severity", "management_question"]}},
  gaps: {type: "array", maxItems: 3, items: {type: "object", additionalProperties: false, properties: {title: {type: "string", maxLength: 240}, why_it_matters: {type: "string", maxLength: 800}, proposed_owner: {type: "string", maxLength: 160}, evidence_refs: {type: "array", minItems: 1, maxItems: 12, items: {type: "string"}}}, required: ["title", "why_it_matters", "proposed_owner", "evidence_refs"]}},
  memo_drafts: {type: "array", maxItems: 1, items: {type: "object", additionalProperties: false, properties: {section: {type: "string", maxLength: 80}, draft_text: {type: "string", maxLength: 2000}, evidence_refs: {type: "array", minItems: 1, maxItems: 12, items: {type: "string"}}}, required: ["section", "draft_text", "evidence_refs"]}},
}, required: ["challenges", "gaps", "memo_drafts"]});
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
export const HOSTED_MODEL_FAMILY = "anthropic/claude-fable-5.1";
const requestWindows = new Map<string, number[]>();

function boundedString(value: unknown, max: number) {return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;}
function canonicalPayload(dealId: string, evidence: EvidenceItem[]) {return JSON.stringify({job: "challenge_selected_evidence", deal_id: dealId, evidence, output_contract: "underwriting-evidence-challenge/v1"});}
export function validateBrowserBoundary(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== expectedOrigin || (fetchSite && fetchSite !== "same-origin")) throw new Error("Same-origin browser request required");
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "same-origin-anonymous";
}

export function admitRateWindow(identity: string, now = Date.now()) {
  const active = (requestWindows.get(identity) ?? []).filter((value) => now - value < RATE_WINDOW_MS);
  if (active.length >= RATE_LIMIT) return false;
  requestWindows.set(identity, [...active, now]);
  if (requestWindows.size > 10_000) for (const [key, values] of requestWindows) if (values.every((value) => now - value >= RATE_WINDOW_MS)) requestWindows.delete(key);
  return true;
}

const CLIENT_INPUT_ERRORS = new Set([
  "Same-origin browser request required",
  "Invalid request",
  "Invalid model job contract",
  "Invalid hosted synthetic deal",
  "Invalid evidence item",
  "Evidence digest mismatch",
  "Selected evidence is too large",
  "Selected evidence does not match the server registry",
]);
export function isClientInputError(error: unknown) {
  return error instanceof SyntaxError
    || (error instanceof Error && CLIENT_INPUT_ERRORS.has(error.message));
}
export function validateChallengeRequest(raw: unknown): ChallengeRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid request");
  const value = raw as Record<string, unknown>;
  if (value.job !== "challenge_selected_evidence" || value.output_contract !== "underwriting-evidence-challenge/v1" || !Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 8) throw new Error("Invalid model job contract");
  const dealId = boundedString(value.deal_id, 100);
  if (!dealId || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(dealId)) throw new Error("Invalid hosted synthetic deal");
  const ids = new Set<string>();
  const evidence = value.evidence.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Invalid evidence item");
    const item = candidate as Record<string, unknown>; const id = boundedString(item.id, 80); const title = boundedString(item.title, 160); const displayValue = boundedString(item.displayValue, 120); const summary = boundedString(item.summary, 800);
    if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(id) || ids.has(id) || !title || !displayValue || !summary) throw new Error("Invalid evidence item"); ids.add(id);
    return {id, title, displayValue, summary};
  });
  const digest = boundedString(value.request_digest_sha256, 64);
  assertCanonicalEvidenceSubset(dealId, evidence);
  const expected = createHash("sha256").update(canonicalPayload(dealId, evidence)).digest("hex");
  if (!digest || digest !== expected) throw new Error("Evidence digest mismatch");
  if (Buffer.byteLength(canonicalPayload(dealId, evidence), "utf8") > 12_000) throw new Error("Selected evidence is too large");
  return {job: "challenge_selected_evidence", deal_id: dealId, evidence, output_contract: "underwriting-evidence-challenge/v1", request_digest_sha256: digest};
}

function string(value: unknown, max: number) {return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;}
export function validateChallengeOutput(raw: unknown, allowedEvidenceIds: Set<string>): ChallengeOutput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Generated proposal envelope is invalid");
  const value = raw as Record<string, unknown>;
  const refs = (candidate: unknown) => {
    if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > 12 || candidate.some((item) => typeof item !== "string" || !allowedEvidenceIds.has(item))) throw new Error("Generated proposal contains an invalid evidence reference");
    return [...new Set(candidate as string[])];
  };
  const challenges = Array.isArray(value.challenges) && value.challenges.length <= 3 ? value.challenges.map((candidate) => {if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Generated challenge is invalid"); const item = candidate as Record<string, unknown>; const claim = string(item.claim, 500), management_question = string(item.management_question, 500), severity = item.severity; if (!claim || !management_question || !["HIGH", "MEDIUM", "LOW"].includes(String(severity))) throw new Error("Generated challenge is invalid"); return {claim, management_question, severity: severity as "HIGH" | "MEDIUM" | "LOW", evidence_refs: refs(item.evidence_refs)};}) : (() => {throw new Error("Generated challenges are invalid");})();
  const gaps = Array.isArray(value.gaps) && value.gaps.length <= 3 ? value.gaps.map((candidate) => {if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Generated gap is invalid"); const item = candidate as Record<string, unknown>; const title = string(item.title, 240), why_it_matters = string(item.why_it_matters, 800), proposed_owner = string(item.proposed_owner, 160); if (!title || !why_it_matters || !proposed_owner) throw new Error("Generated gap is invalid"); return {title, why_it_matters, proposed_owner, evidence_refs: refs(item.evidence_refs)};}) : (() => {throw new Error("Generated gaps are invalid");})();
  const memo_drafts = Array.isArray(value.memo_drafts) && value.memo_drafts.length <= 1 ? value.memo_drafts.map((candidate) => {if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Generated memo draft is invalid"); const item = candidate as Record<string, unknown>; const section = string(item.section, 80), draft_text = string(item.draft_text, 2000); if (!section || !draft_text) throw new Error("Generated memo draft is invalid"); return {section, draft_text, evidence_refs: refs(item.evidence_refs)};}) : (() => {throw new Error("Generated memo drafts are invalid");})();
  return {challenges, gaps, memo_drafts};
}

function promptFor(request: ChallengeRequest) {
  return `You are a skeptical investment-committee reviewer. Analyze only the selected synthetic evidence below. Produce bounded countertheses, diligence gaps, and at most one draft memo paragraph. Every item must cite one or more exact evidence ids. Do not calculate new financial outputs, change assumptions or policy, make an investment recommendation, or imply confidential-data readiness.\n\n${JSON.stringify(request.evidence)}`;
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return Response.json({error: "Method not allowed"}, {status: 405, headers: {allow: "POST"}});
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 12_000) return Response.json({error: "Request too large"}, {status: 413});
    try {
      const identity = validateBrowserBoundary(request);
      if (!admitRateWindow(identity)) return Response.json({error: "Review limit reached; try again later"}, {status: 429, headers: {"cache-control": "no-store", "retry-after": "600"}});
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 12_000) return Response.json({error: "Request too large"}, {status: 413, headers: {"cache-control": "no-store"}});
      const parsed = validateChallengeRequest(JSON.parse(rawBody));
      const modelFamily = HOSTED_MODEL_FAMILY;
      const {output} = await generateText({model: modelFamily, output: Output.object({schema: outputSchema}), prompt: promptFor(parsed), maxOutputTokens: 1500, providerOptions: {gateway: {user: `public-synthetic-${parsed.request_digest_sha256.slice(0, 16)}`, tags: ["feature:evidence-challenge", "scope:public-synthetic"]}}});
      const validated = validateChallengeOutput(output, new Set(parsed.evidence.map((item) => item.id)));
      return Response.json({...validated, deal_id: parsed.deal_id, model_family: modelFamily, request_digest_sha256: parsed.request_digest_sha256, limitations: "Advisory review of selected synthetic evidence only; no calculation, policy, assumption, issue or recommendation was changed."}, {headers: {"cache-control": "no-store", "content-security-policy": "default-src 'none'", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff"}});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model review failed";
      const status = isClientInputError(error) ? 400 : 503;
      if (status === 503) console.error("hosted model review failed", {name: error instanceof Error ? error.name : "unknown", message});
      return Response.json({error: status === 400 ? "Invalid synthetic review request" : "Model review temporarily unavailable"}, {status, headers: {"cache-control": "no-store"}});
    }
  },
};
