import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {openReviewStore, reviewHandlers} from "./review-store.mjs";
import {handleMessage} from "./server.mjs";

function packet(value = "17 months") {
  const body = {job: "challenge_selected_evidence", deal_id: "helios", evidence: [{id: "runway", title: "Runway", displayValue: value, summary: "Cash divided by burn"}], output_contract: "underwriting-evidence-challenge/v1"};
  return {...body, request_digest_sha256: createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}
test("UI packet crosses independent SQLite connections into MCP; response is bound to the current packet", async () => {
  const dir = mkdtempSync(join(tmpdir(), "desk-review-"));
  const ui = openReviewStore(join(dir, "review.db")); const mcp = openReviewStore(join(dir, "review.db"));
  try {
    const first = packet(); ui.prepare({...first, privateNote: "must not escape"});
    const handlers = reviewHandlers(mcp);
    const context = await handleMessage({id: 1, method: "tools/call", params: {name: "get_review_context", arguments: {deal_id: "helios"}}}, handlers);
    assert.deepEqual(context.result.structuredContent, first);
    const response = {...first, model_family: "test fixture", challenges: []};
    await handlers.callTool("submit_evidence_review", response);
    assert.deepEqual(ui.response("helios", first.request_digest_sha256), response);
    const second = packet("12 months"); ui.prepare(second);
    assert.throws(() => mcp.submit(response), /stale/);
    assert.equal(ui.response("helios", second.request_digest_sha256), null);
    await assert.rejects(handlers.callTool("approve_proposal", {}), /tool_not_found/);
    const tools = await handleMessage({id: 2, method: "tools/list"}, handlers);
    assert.deepEqual(tools.result.tools.map((tool) => tool.name), ["list_prepared_reviews", "get_review_context", "submit_evidence_review", "list_investment_reviews", "read_investment_evidence", "propose_investment_work"]);
  } finally {ui.close(); mcp.close(); rmSync(dir, {recursive: true, force: true});}
});
test("invalid digests and oversized selections cannot enter the review store", () => {
  const dir = mkdtempSync(join(tmpdir(), "desk-review-")); const store = openReviewStore(join(dir, "review.db"));
  try {
    assert.throws(() => store.prepare({...packet(), request_digest_sha256: "0".repeat(64)}), /digest/);
    assert.throws(() => store.prepare({...packet(), evidence: Array(9).fill(packet().evidence[0])}), /evidence/);
  } finally {store.close(); rmSync(dir, {recursive: true, force: true});}
});
test("a basis-only change invalidates previous responses without modifying evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "desk-review-basis-")); const store = openReviewStore(join(dir, "review.db"));
  try {
    const bound = basis => {const {request_digest_sha256, ...body} = packet(); const next = {...body, review_basis_id: basis}; return {...next, request_digest_sha256: createHash("sha256").update(JSON.stringify(next)).digest("hex")};};
    const before = bound("a".repeat(64)), after = bound("b".repeat(64));
    store.prepare(before); store.submit({deal_id: before.deal_id, request_digest_sha256: before.request_digest_sha256});
    assert.equal(store.context("helios").review_basis_id, before.review_basis_id);
    store.prepare(after); assert.deepEqual(store.context("helios").evidence, before.evidence);
    assert.throws(() => store.submit({deal_id: before.deal_id, request_digest_sha256: before.request_digest_sha256}), /stale/);
    assert.equal(store.response("helios", after.request_digest_sha256), null);
    assert.throws(() => store.prepare({...after, review_basis_id: "invalid"}), /basis_invalid/);
  } finally {store.close(); rmSync(dir, {recursive:true, force:true});}
});
