import {afterEach, describe, expect, it, vi} from "vitest";
import {sha256} from "@noble/hashes/sha2.js";
import {bytesToHex} from "@noble/hashes/utils.js";
import {listArchivedPackages, readArchivedPackage} from "./package-archive";
const runtime = vi.hoisted(() => ({enabled: false}));
vi.mock("./local-workspace", () => ({usesLocalWorkstation: () => runtime.enabled}));
const hash = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));
afterEach(() => {vi.unstubAllGlobals(); runtime.enabled = false;});
describe("source archive client boundary", () => {
  it("never probes local endpoints from the public demonstration", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(listArchivedPackages()).rejects.toThrow(/local workstation/);
    expect(request).not.toHaveBeenCalled();
  });
  it("uses the local origin header and rejects malformed receipts", async () => {
    runtime.enabled = true;
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({packages: [{digest: "bad"}]})));
    vi.stubGlobal("fetch", request);
    await expect(listArchivedPackages("local-atlas")).rejects.toThrow(/invalid archive receipt/);
    expect(request.mock.calls[0][0]).toBe("/__desk/packages?case=local-atlas");
    expect(request.mock.calls[0][1].headers["x-desk-local"]).toBe("1");
  });
  it("rejects modified package bytes before attempting admission", async () => {
    runtime.enabled = true;
    const digest = hash('{"original":true}');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({digest, caseId: "local-atlas", label: "Atlas", bytes: 2, archivedAt: new Date().toISOString(), payload: "{}"}))));
    await expect(readArchivedPackage(digest)).rejects.toThrow(/integrity check/);
  });
  it("does not treat unavailable server storage as an empty archive", async () => {
    runtime.enabled = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", {status: 503})));
    await expect(listArchivedPackages()).rejects.toThrow(/503/);
  });
});

import {File as NodeFile} from "node:buffer";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {approveBaseline, processDealPackage} from "./intake";
import {createSourceBackup, validateSourceBackup, SOURCE_BACKUP_VERSION} from "./package-archive";
import {localCaseId} from "./local-deal-state";

it("creates an Import deal-compatible backup with replayed sources and no invented analyst work", async () => {
  runtime.enabled = true;
  const files = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"].map(name => new NodeFile([readFileSync(resolve(process.cwd(), "public/sample-package", name))], name) as unknown as File);
  const admitted = approveBaseline(await processDealPackage(files), "Avery Chen", "Reviewed source mappings", "2026-09-01T11:55:00.000Z");
  const payload = JSON.stringify(admitted), digest = hash(payload);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({digest, caseId: localCaseId(admitted), label: admitted.deal!.company, bytes: new TextEncoder().encode(payload).byteLength, archivedAt: new Date().toISOString(), payload}))));
  const backup = await createSourceBackup(digest);
  const restored = await validateSourceBackup(backup.content);
  expect(backup.filename).toMatch(/source-backup.json$/);
  expect(restored.sourcePayloads).toEqual(admitted.sourcePayloads);
  expect(restored.analysis?.grossMoic).toBe(admitted.analysis?.grossMoic);
  const envelope = JSON.parse(backup.content);
  expect(envelope.schemaVersion).toBe(SOURCE_BACKUP_VERSION);
  expect(envelope.workspace).toBeUndefined();
  expect(Object.keys(envelope).sort()).toEqual(["digest", "payload", "schemaVersion"]);
  await expect(validateSourceBackup(JSON.stringify({...envelope, payload: "{}"}))).rejects.toThrow(/integrity/);
  await expect(validateSourceBackup(JSON.stringify({...envelope, workspace: {privateNote: "replace"}}))).rejects.toThrow(/format/);
});

it("rejects oversized source backups before parsing", async () => {
  await expect(validateSourceBackup(" ".repeat(13_000_001))).rejects.toThrow(/13 MB/);
});
