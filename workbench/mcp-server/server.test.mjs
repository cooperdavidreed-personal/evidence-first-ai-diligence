import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
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
