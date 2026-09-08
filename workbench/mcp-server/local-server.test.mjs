import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {request} from "node:http";
import {createHash} from "node:crypto";
import {startLocalDesk} from "./local-server.mjs";
import {openReviewStore, reviewHandlers} from "./review-store.mjs";
import {handleMessage} from "./server.mjs";

async function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "desk-server-"));
  mkdirSync(join(root, "dist")); writeFileSync(join(root, "dist/index.html"), "<h1>Desk fixture</h1>");
  writeFileSync(join(root, "secret.txt"), "secret"); symlinkSync(join(root, "secret.txt"), join(root, "dist/escape.txt"));
  writeFileSync(join(root, "dist/app.js.map"), "private sourcemap");
  writeFileSync(join(root, "dist/worker.mjs"), "export const ready=true;");
  const storePath = join(root, "reviews.sqlite");
  const server = await startLocalDesk({workbenchPath: root, storePath, port: 0});
  const port = server.address().port;
  const call = (path, {headers = {}, method = "GET", body} = {}) => new Promise((resolve, reject) => {
    const req = request({hostname: "127.0.0.1", port, path, method, headers}, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString()}));
    }); req.on("error", reject); req.end(body);
  });
  try {await run({call, storePath, root, port});}
  finally {await new Promise(resolve => server.close(resolve)); rmSync(root, {recursive: true, force: true});}
}
test("standalone serves only built assets, rejects traversal and foreign review origins", async () => fixture(async ({call, port}) => {
  assert.match((await call("/")).body, /Desk fixture/);
  assert.match((await call("/worker.mjs")).headers["content-type"], /text\/javascript/);
  for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/escape.txt", "/app.js.map", "/.env"]) assert.equal((await call(path)).status, 403, path);
  assert.equal((await call("/missing.js")).status, 404);
  assert.equal((await call("/", {headers: {Host: "evil.example:1234"}})).status, 403);
  assert.equal((await call("/__desk/review?setup=1")).status, 403);
  assert.equal((await call("/__desk/review?setup=1", {headers: {"x-desk-local": "1", Origin: "https://evil.example"}})).status, 403);
  assert.equal((await call("/__desk/review?setup=1", {headers: {"x-desk-local": "1", Origin: `http://127.0.0.1:${port}`}})).status, 200);
}));
test("standalone packet and MCP initialize/response are visible through independent connections", async () => fixture(async ({call, storePath, root}) => {
  const headers = {"x-desk-local": "1"};
  let status = JSON.parse((await call("/__desk/review?setup=1", {headers})).body);
  assert.deepEqual(status, {available: true, workbenchPath: root, storePath, nodePath: process.execPath, connection: null});
  const mcp = openReviewStore(storePath);
  try {
    const handlers = reviewHandlers(mcp);
    await handleMessage({id: 1, method: "initialize", params: {clientInfo: {name: "Fixture host"}}}, handlers);
    status = JSON.parse((await call("/__desk/review?setup=1", {headers})).body);
    assert.equal(status.connection.clientName, "Fixture host"); assert.equal(status.connection.identityVerified, false);
    assert.ok(Date.parse(status.connection.initializedAt) <= Date.now());
    const packet = {job: "challenge_selected_evidence", deal_id: "helios", evidence: [{id: "runway", title: "Runway", displayValue: "17 months", summary: "Cash divided by burn"}], output_contract: "underwriting-evidence-challenge/v1"};
    packet.request_digest_sha256 = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
    assert.equal((await call("/__desk/review", {method: "POST", headers, body: JSON.stringify(packet)})).status, 200);
    assert.deepEqual(await handlers.callTool("get_review_context", {deal_id: "helios"}), packet);
    const response = {deal_id: "helios", request_digest_sha256: packet.request_digest_sha256, model_family: "fixture", challenges: []};
    await handlers.callTool("submit_evidence_review", response);
    assert.deepEqual(JSON.parse((await call(`/__desk/review?deal=helios&digest=${packet.request_digest_sha256}`, {headers})).body), {response});
    assert.equal((await call("/__desk/review", {method: "POST", headers, body: "x".repeat(16001)})).status, 400);
  } finally {mcp.close();}
}));

test("workspace HTTP route protects origin, commits durably, and rejects stale revisions", async () => fixture(async ({call, storePath}) => {
  const headers = {"x-desk-local": "1"};
  const state = {schemaVersion: "underwriting.deal-workspace/v3", caseId: "helios", revision: 1, privateNote: "private", observations: [], assumptionReviews: {}, assumptionReviewEvents: [], issues: [], proposals: [], memoSections: [], scenarioValues: {}, policyOverrides: [], changeControl: null, updatedAt: "2026-09-07T00:00:00Z"};
  assert.equal((await call("/__desk/workspace?deal=helios")).status, 403);
  assert.deepEqual(JSON.parse((await call("/__desk/workspace?deal=helios", {headers})).body), {available: true, workspace: null});
  const body = JSON.stringify({deal_id: "helios", baseVersion: null, state});
  assert.equal((await call("/__desk/workspace", {headers: {...headers, Origin: "https://foreign.example"}, method: "POST", body})).status, 403);
  assert.equal((await call("/__desk/workspace", {headers, method: "POST", body})).status, 200);
  assert.equal((await call("/__desk/workspace", {headers, method: "POST", body})).status, 409);
  const reopened = openReviewStore(storePath);
  try {assert.equal(reopened.workspace("helios").state.privateNote, "private");} finally {reopened.close();}
}));

test("source archive HTTP route enforces local origin and verifies persisted bytes", async () => fixture(async ({call}) => {
  const payload = JSON.stringify({source: "synthetic archive fixture"});
  const digest = createHash("sha256").update(payload).digest("hex");
  const body = JSON.stringify({caseId: "local-fixture", label: "Fixture", payload, digest});
  const headers = {"x-desk-local": "1"};
  assert.equal((await call("/__desk/packages", {method:"POST", body})).status, 403);
  assert.equal((await call("/__desk/packages", {method:"POST", headers:{...headers, Origin:"https://foreign.example"}, body})).status, 403);
  assert.equal((await call("/__desk/packages", {method:"POST", headers, body})).status, 200);
  assert.equal(JSON.parse((await call(`/__desk/packages?digest=${digest}`, {headers})).body).payload, payload);
  assert.equal(JSON.parse((await call("/__desk/packages?case=local-fixture", {headers})).body).packages.length, 1);
  assert.equal((await call("/__desk/packages", {method:"POST", headers, body:JSON.stringify({caseId:"local-fixture", label:"Fixture", payload:payload+" ", digest})})).status, 400);
}));
