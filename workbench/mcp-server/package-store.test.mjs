import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {attachPackageStore, PACKAGE_MAX_BYTES} from "./package-store.mjs";
const digest = value => createHash("sha256").update(value).digest("hex");
const item = (payload = JSON.stringify({company: "Atlas", source: "évidence"})) => ({caseId: "local-atlas-123", label: "Atlas", payload, digest: digest(payload)});
test("source archive keeps exact bytes, returns durable receipts and is idempotent", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = attachPackageStore(db), input = item();
    const saved = store.archivePackage(input);
    assert.equal(saved.bytes, Buffer.byteLength(input.payload));
    assert.deepEqual(store.archivePackage(input), saved);
    assert.deepEqual(attachPackageStore(db).readPackage(input.digest), {...saved, payload: input.payload});
    assert.deepEqual(store.listPackages(input.caseId), [saved]);
    assert.deepEqual(store.listPackages("other"), []);
    assert.equal(store.readPackage("a".repeat(64)), null);
  } finally { db.close(); }
});
test("archives reject changed bytes, metadata reassignment, direct edits and deletion", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = attachPackageStore(db), input = item();
    store.archivePackage(input);
    assert.throws(() => store.archivePackage({...input, payload: "{}"}), /digest_mismatch/);
    assert.throws(() => store.archivePackage({...input, caseId: "other"}), /conflict/);
    assert.throws(() => db.prepare("UPDATE package_archives SET payload='{}'").run(), /immutable/);
    assert.throws(() => db.prepare("DELETE FROM package_archives").run(), /immutable/);
    // A digest is an integrity check, not protection against an OS-level owner
    // deliberately dropping triggers. Corruption must nevertheless fail reads.
    db.exec("DROP TRIGGER package_archive_no_update; UPDATE package_archives SET payload='{}'");
    assert.throws(() => store.readPackage(input.digest), /corrupt/);
  } finally { db.close(); }
});
test("archives reject invalid JSON, non-object content, unsafe identities and oversized content", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = attachPackageStore(db);
    for (const value of ["invalid", "[]", "null"]) assert.throws(() => store.archivePackage(item(value)), /invalid_json/);
    assert.throws(() => store.archivePackage({...item(), caseId: "../escape"}), /invalid/);
    assert.throws(() => store.archivePackage(item("x".repeat(PACKAGE_MAX_BYTES + 1))), /too_large/);
    assert.equal(store.listPackages().length, 0);
  } finally { db.close(); }
});
