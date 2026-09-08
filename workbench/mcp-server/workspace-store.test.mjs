import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {openReviewStore, reviewHandlers} from "./review-store.mjs";
const state = {schemaVersion: "underwriting.deal-workspace/v3", caseId: "helios", revision: 1, privateNote: "private", observations: [], assumptionReviews: {}, assumptionReviewEvents: [], issues: [], proposals: [], memoSections: [], scenarioValues: {}, policyOverrides: [], changeControl: null, updatedAt: "2026-09-07T00:00:00Z"};
test("workspace transactions reject stale windows and retain immutable history outside MCP", async () => {
  const root = mkdtempSync(join(tmpdir(), "desk-workspace-")), path = join(root, "db.sqlite");
  const first = openReviewStore(path), second = openReviewStore(path);
  try {
    assert.equal(first.workspace("helios"), null);
    first.saveWorkspace({deal_id: "helios", baseVersion: null, state});
    assert.throws(() => second.saveWorkspace({deal_id: "helios", baseVersion: null, state}), /conflict/);
    first.saveWorkspace({deal_id: "helios", baseVersion: 1, state: {...state, privateNote: "new", revision: 2}});
    assert.throws(() => second.saveWorkspace({deal_id: "helios", baseVersion: 1, state}), /conflict/);
    assert.equal(second.workspace("helios").state.privateNote, "new");
    const db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("SELECT count(*) AS count FROM workspace_revisions").get().count, 2);
      assert.equal(JSON.parse(db.prepare("SELECT state FROM workspace_revisions WHERE version=1").get().state).privateNote, "private");
      assert.throws(() => db.exec("DELETE FROM workspace_revisions"), /immutable/);
      assert.throws(() => db.exec("UPDATE workspace_revisions SET version=99"), /immutable/);
    } finally {db.close();}
    await assert.rejects(reviewHandlers(first).callTool("get_workspace", {deal_id: "helios"}), /tool_not_found/);
    assert.deepEqual(await reviewHandlers(first).callTool("list_prepared_reviews"), []);
    assert.throws(() => first.saveWorkspace({deal_id: "other", baseVersion: null, state}), /invalid/);
  } finally {first.close(); second.close(); rmSync(root, {recursive: true, force: true});}
});
