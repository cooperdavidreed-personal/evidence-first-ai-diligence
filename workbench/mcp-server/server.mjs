#!/usr/bin/env node
import {appendFileSync, readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {createInterface} from "node:readline";

const serverRoot = dirname(fileURLToPath(import.meta.url));
export const canonicalCasePath = resolve(serverRoot, "../src/data/cases.json");

const objectSchema = (properties, required) => ({type: "object", additionalProperties: false, properties, required});
const dealId = {type: "string", enum: ["atlasgrid", "helios"]};
const evidenceRefs = {type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: {type: "string", minLength: 1, maxLength: 120}};
export const toolDefinitions = [
  {name: "list_deals", description: "List canonical retained deals.", inputSchema: objectSchema({}, [])},
  {name: "get_decision", description: "Read the canonical analytical decision and human-approval state.", inputSchema: objectSchema({deal_id: dealId}, ["deal_id"])},
  {name: "get_decision_tests", description: "Read declared decision tests for one deal.", inputSchema: objectSchema({deal_id: dealId}, ["deal_id"])},
  {name: "list_issues", description: "List canonical diligence and hurdle issues.", inputSchema: objectSchema({deal_id: dealId}, ["deal_id"])},
  {name: "get_metric_lineage", description: "Read the retained lineage for a metric.", inputSchema: objectSchema({deal_id: dealId, metric_id: {type: "string", minLength: 1, maxLength: 160}}, ["deal_id", "metric_id"])},
  {name: "search_package", description: "Search the retained public package register by filename or artifact label.", inputSchema: objectSchema({deal_id: dealId, query: {type: "string", minLength: 1, maxLength: 120}}, ["deal_id", "query"])},
  {name: "list_analyses", description: "List retained analyses without changing the case.", inputSchema: objectSchema({deal_id: dealId}, ["deal_id"])},
  {name: "propose_observation", description: "Create an in-memory observation proposal for human review. Never changes the canonical case.", inputSchema: objectSchema({deal_id: dealId, text: {type: "string", minLength: 1, maxLength: 1200}, evidence_refs: evidenceRefs}, ["deal_id", "text", "evidence_refs"])},
  {name: "propose_diligence_request", description: "Create an in-memory diligence-request proposal for human review.", inputSchema: objectSchema({deal_id: dealId, title: {type: "string", minLength: 1, maxLength: 240}, why_it_matters: {type: "string", minLength: 1, maxLength: 1200}, proposed_owner: {type: "string", minLength: 1, maxLength: 160}, evidence_refs: evidenceRefs}, ["deal_id", "title", "why_it_matters", "proposed_owner", "evidence_refs"])},
  {name: "propose_memo_section", description: "Create an in-memory memo-language proposal for human review.", inputSchema: objectSchema({deal_id: dealId, section: {type: "string", minLength: 1, maxLength: 100}, draft_text: {type: "string", minLength: 1, maxLength: 2400}, evidence_refs: evidenceRefs}, ["deal_id", "section", "draft_text", "evidence_refs"])},
];

function loadData() {
  const data = JSON.parse(readFileSync(canonicalCasePath, "utf8"));
  if (data?.schema_version !== "underwriting.workbench-data/v2" || !Array.isArray(data.cases)) throw new Error("canonical_case_contract_invalid");
  return data;
}
function bounded(value, name, max) { if (typeof value !== "string" || value.trim().length < 1 || value.length > max) throw new Error(`${name}_invalid`); return value.trim(); }
function getCase(data, dealIdValue) { const deal = data.cases.find((item) => item.caseId === dealIdValue); if (!deal) throw new Error("deal_not_found"); return deal; }
function validateRefs(deal, refs) {
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 20 || new Set(refs).size !== refs.length) throw new Error("evidence_refs_invalid");
  const known = new Set([...deal.metricRegistry.map((item) => item.metric_id), ...deal.analyses.map((item) => item.analysis_id), ...deal.artifacts.map((item) => item.artifact_id)]);
  if (refs.some((reference) => typeof reference !== "string" || !known.has(reference))) throw new Error("evidence_reference_not_canonical");
  return [...refs];
}

export function createToolHandlers({proposalLedgerPath} = {}) {
  const data = loadData(); const proposals = [];
  function proposed(kind, deal, payload, refs) {
    const proposal = {proposal_id: randomUUID(), status: "PROPOSED", approval_state: "PROPOSED", kind, deal_id: deal.caseId, manifest_sha256: deal.manifest_sha256, analysis_sha256: deal.analysis_sha256, evidence_refs: validateRefs(deal, refs), ...payload};
    if (proposalLedgerPath) appendFileSync(proposalLedgerPath, `${JSON.stringify(proposal)}\n`, {encoding: "utf8", mode: 0o600});
    proposals.push(proposal); return proposal;
  }
  async function callTool(name, args = {}) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("arguments_invalid");
    if (name === "list_deals") return data.cases.map((deal) => ({deal_id: deal.caseId, company: deal.company, case_type: deal.caseType, analytical_posture: deal.decision.decision, approval_state: deal.investmentAdjudication}));
    const deal = getCase(data, args.deal_id);
    if (name === "get_decision") return {deal_id: deal.caseId, company: deal.company, decision: deal.decision.decision, rationale: deal.decision.rationale, conditions: deal.decision.conditions, approval_state: deal.investmentAdjudication, workflow_disposition: deal.workflowDisposition};
    if (name === "get_decision_tests") return {deal_id: deal.caseId, tests: deal.decision.metric_pairs ?? []};
    if (name === "list_issues") return {deal_id: deal.caseId, issues: deal.decision.issue_summary.issues.map(({issue_id, title, owner, stage, materiality, state, blocks_advancement, consequence}) => ({issue_id, title, owner, stage, materiality, state, blocks_advancement, consequence}))};
    if (name === "get_metric_lineage") {
      const metricId = bounded(args.metric_id, "metric_id", 160); const metric = deal.metricRegistry.find((item) => item.metric_id === metricId); if (!metric) throw new Error("metric_not_found");
      const formula = metric.formula_id ? deal.formulaRegistry.find((item) => item.formula_id === metric.formula_id) ?? null : null;
      return {deal_id: deal.caseId, metric, formula, source_locators: deal.sourceLocators.filter((item) => metric.source_locator_ids.includes(item.locator_id))};
    }
    if (name === "search_package") { const query = bounded(args.query, "query", 120).toLowerCase(); return {deal_id: deal.caseId, results: deal.artifacts.filter((item) => `${item.artifact_id} ${item.path}`.toLowerCase().includes(query)).map(({artifact_id, path, rows, schema}) => ({artifact_id, path, rows, schema}))}; }
    if (name === "list_analyses") return {deal_id: deal.caseId, analyses: deal.analyses.map(({analysis_id, question, population, classification, state, outputs}) => ({analysis_id, question, population, classification, state, outputs}))};
    if (name === "propose_observation") return proposed("OBSERVATION", deal, {text: bounded(args.text, "text", 1200)}, args.evidence_refs);
    if (name === "propose_diligence_request") return proposed("DILIGENCE_REQUEST", deal, {title: bounded(args.title, "title", 240), why_it_matters: bounded(args.why_it_matters, "why_it_matters", 1200), proposed_owner: bounded(args.proposed_owner, "proposed_owner", 160)}, args.evidence_refs);
    if (name === "propose_memo_section") return proposed("MEMO_SECTION", deal, {section: bounded(args.section, "section", 100), draft_text: bounded(args.draft_text, "draft_text", 2400)}, args.evidence_refs);
    throw new Error("tool_not_found");
  }
  return {callTool, proposals};
}

function result(id, value) { return {jsonrpc: "2.0", id, result: value}; }
function error(id, message) { return {jsonrpc: "2.0", id, error: {code: -32000, message}}; }
export async function handleMessage(message, handlers) {
  if (message.method === "initialize") return result(message.id, {protocolVersion: message.params?.protocolVersion ?? "2025-06-18", capabilities: {tools: {listChanged: false}}, serverInfo: {name: "underwriting-desk-local", version: "1.0.0"}});
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return result(message.id, {tools: toolDefinitions});
  if (message.method === "tools/call") {
    const notification = !Object.prototype.hasOwnProperty.call(message, "id");
    if (notification) return null;
    try {
      const value = await handlers.callTool(message.params?.name, message.params?.arguments ?? {});
      return result(message.id, {content: [{type: "text", text: JSON.stringify(value)}], structuredContent: value});
    } catch (caught) {
      return error(message.id, caught instanceof Error ? caught.message : "tool_call_failed");
    }
  }
  if (!Object.prototype.hasOwnProperty.call(message, "id")) return null;
  return error(message.id, "method_not_found");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ledgerFlag = process.argv.indexOf("--proposal-ledger");
  if (ledgerFlag >= 0 && !process.argv[ledgerFlag + 1]) throw new Error("proposal_ledger_path_required");
  const handlers = createToolHandlers({proposalLedgerPath: ledgerFlag >= 0 ? resolve(process.argv[ledgerFlag + 1]) : undefined}); const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let response; try { response = await handleMessage(JSON.parse(line), handlers); } catch (caught) { response = error(null, caught instanceof Error ? caught.message : "invalid_request"); }
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
}
