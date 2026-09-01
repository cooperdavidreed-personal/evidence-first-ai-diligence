import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {canonicalCasePath, createToolHandlers, handleMessage, toolDefinitions} from "./server.mjs";

function digest() { return createHash("sha256").update(readFileSync(canonicalCasePath)).digest("hex"); }

test("MCP exposes the exact read and proposal-only tool surface", () => {
  assert.deepEqual(toolDefinitions.map((tool) => tool.name), ["list_deals", "get_decision", "get_decision_tests", "list_issues", "get_metric_lineage", "search_package", "list_analyses", "propose_observation", "propose_diligence_request", "propose_memo_section"]);
  assert.equal(toolDefinitions.some((tool) => /set|approve|mutate|write_case/.test(tool.name)), false);
});

test("read tools return canonical decisions and declared tests", async () => {
  const handlers = createToolHandlers();
  const deals = await handlers.callTool("list_deals"); assert.equal(deals.length, 2);
  const decision = await handlers.callTool("get_decision", {deal_id: "atlasgrid"}); assert.equal(decision.decision, "REPRICE"); assert.equal(decision.approval_state, "PENDING_HUMAN");
  const tests = await handlers.callTool("get_decision_tests", {deal_id: "helios"}); assert.ok(tests.tests.some((item) => item.status === "MISSES"));
});

test("proposal tools return PROPOSED and never change canonical case bytes", async () => {
  const before = digest(); const handlers = createToolHandlers();
  const proposal = await handlers.callTool("propose_observation", {deal_id: "atlasgrid", text: "Reconcile the price bridge.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]});
  assert.equal(proposal.status, "PROPOSED"); assert.equal(proposal.approval_state, "PROPOSED"); assert.equal(handlers.proposals.length, 1); assert.equal(digest(), before);
});

test("unknown evidence and forbidden tools fail closed", async () => {
  const handlers = createToolHandlers();
  await assert.rejects(() => handlers.callTool("propose_memo_section", {deal_id: "helios", section: "downside", draft_text: "Draft", evidence_refs: ["unknown"]}), /evidence_reference_not_canonical/);
  await assert.rejects(() => handlers.callTool("set_decision", {deal_id: "helios", decision: "INVEST"}), /tool_not_found/);
});

test("unknown notifications are silent while unknown requests fail", async () => {
  const handlers = createToolHandlers();
  assert.equal(await handleMessage({jsonrpc: "2.0", method: "notifications/cancelled"}, handlers), null);
  assert.deepEqual(await handleMessage({jsonrpc: "2.0", id: 7, method: "unsupported/request"}, handlers), {jsonrpc: "2.0", id: 7, error: {code: -32000, message: "method_not_found"}});
});

test("id-less tools/call notifications are dropped without proposal side effects", async () => {
  const before = digest(); const handlers = createToolHandlers();
  const response = await handleMessage({jsonrpc: "2.0", method: "tools/call", params: {name: "propose_observation", arguments: {deal_id: "atlasgrid", text: "Confirm pricing bridge.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]}}}, handlers);
  assert.equal(response, null);
  assert.equal(handlers.proposals.length, 0);
  assert.equal(digest(), before);
});

test("proposal ledger is opt-in and binds successful proposals to retained digests", async () => {
  const before = digest(); const temp = mkdtempSync(join(tmpdir(), "underwriting-ledger-")); const ledger = join(temp, "proposals.jsonl");
  try {
    const withoutLedger = createToolHandlers();
    await withoutLedger.callTool("propose_observation", {deal_id: "atlasgrid", text: "Reconcile pricing.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]});
    assert.equal(existsSync(ledger), false);
    const handlers = createToolHandlers({proposalLedgerPath: ledger});
    await handlers.callTool("propose_observation", {deal_id: "atlasgrid", text: "Reconcile pricing.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]});
    await handlers.callTool("propose_diligence_request", {deal_id: "atlasgrid", title: "Confirm add-backs", why_it_matters: "Returns depend on normalized EBITDA.", proposed_owner: "QoE", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]});
    await handlers.callTool("propose_memo_section", {deal_id: "atlasgrid", section: "Downside", draft_text: "Covenant risk remains gating.", evidence_refs: ["AG-10"]});
    const lines = readFileSync(ledger, "utf8").trim().split("\n").map(JSON.parse);
    const cases = JSON.parse(readFileSync(canonicalCasePath, "utf8")); const deal = cases.cases.find((item) => item.caseId === "atlasgrid");
    assert.equal(lines.length, 3);
    for (const item of lines) { assert.equal(item.status, "PROPOSED"); assert.equal(item.approval_state, "PROPOSED"); assert.equal(item.deal_id, "atlasgrid"); assert.equal(item.manifest_sha256, deal.manifest_sha256); assert.equal(item.analysis_sha256, deal.analysis_sha256); }
    assert.equal(statSync(ledger).mode & 0o777, 0o600);
    assert.equal(digest(), before);
  } finally { rmSync(temp, {recursive: true, force: true}); }
});

test("proposal ledger tightens a pre-existing file to operator-only permissions", async () => {
  const temp = mkdtempSync(join(tmpdir(), "underwriting-ledger-mode-")); const ledger = join(temp, "proposals.jsonl");
  try {
    writeFileSync(ledger, "", {mode: 0o644});
    const handlers = createToolHandlers({proposalLedgerPath: ledger});
    await handlers.callTool("propose_observation", {deal_id: "atlasgrid", text: "Reconcile pricing.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]});
    assert.equal(statSync(ledger).mode & 0o777, 0o600);
  } finally { rmSync(temp, {recursive: true, force: true}); }
});

test("invalid and id-less proposal calls never append to the operator ledger", async () => {
  const before = digest(); const temp = mkdtempSync(join(tmpdir(), "underwriting-ledger-")); const ledger = join(temp, "proposals.jsonl"); const handlers = createToolHandlers({proposalLedgerPath: ledger});
  try {
    await assert.rejects(() => handlers.callTool("propose_observation", {deal_id: "atlasgrid", text: "Invalid.", evidence_refs: ["unknown"]}), /evidence_reference_not_canonical/);
    await handleMessage({jsonrpc: "2.0", method: "tools/call", params: {name: "propose_observation", arguments: {deal_id: "atlasgrid", text: "Invisible.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]}}}, handlers);
    assert.equal(existsSync(ledger), false); assert.equal(handlers.proposals.length, 0); assert.equal(digest(), before);
  } finally { rmSync(temp, {recursive: true, force: true}); }
});
