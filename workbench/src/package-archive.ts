import {sha256} from "@noble/hashes/sha2.js";
import {bytesToHex} from "@noble/hashes/utils.js";
import type {IntakeResult} from "./intake";
import {localCaseId, replayAdmittedDeal, validateAdmittedDeal} from "./local-deal-state";
import {usesLocalWorkstation} from "./local-workspace";

export interface PackageArchiveReceipt {digest: string; caseId: string; label: string; bytes: number; archivedAt: string}
const fingerprint = (payload: string) => bytesToHex(sha256(new TextEncoder().encode(payload)));
function receipt(raw: unknown): PackageArchiveReceipt {
  const row = raw as PackageArchiveReceipt | null;
  if (!row || typeof row.digest !== "string" || !/^[a-f0-9]{64}$/.test(row.digest) || typeof row.caseId !== "string" || typeof row.label !== "string" || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || typeof row.archivedAt !== "string" || !Number.isFinite(Date.parse(row.archivedAt))) throw new Error("The workstation returned an invalid archive receipt.");
  return {digest: row.digest, caseId: row.caseId, label: row.label, bytes: row.bytes, archivedAt: row.archivedAt};
}
async function request(query = "", body?: unknown): Promise<unknown> {
  if (!usesLocalWorkstation()) throw new Error("Source archives require the local workstation.");
  const response = await fetch(`/__desk/packages${query}`, {method: body === undefined ? "GET" : "POST", headers: {"x-desk-local": "1", "Content-Type": "application/json"}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`The source archive could not be accessed (${response.status}). Your current package has not changed.`);
  return response.json();
}
export async function archiveAdmittedPackage(result: IntakeResult): Promise<PackageArchiveReceipt> {
  const valid = validateAdmittedDeal(result);
  const payload = JSON.stringify(valid);
  const bytes = new TextEncoder().encode(payload).byteLength;
  if (bytes > 16_000_000) throw new Error("This source archive exceeds the 16 MB local archive limit.");
  const digest = fingerprint(payload);
  const caseId = localCaseId(valid);
  const saved = receipt(await request("", {caseId, label: valid.deal!.company, payload, digest}));
  if (saved.digest !== digest || saved.caseId !== caseId || saved.bytes !== bytes) throw new Error("The source archive receipt does not match this package.");
  return saved;
}
export async function listArchivedPackages(caseId?: string): Promise<PackageArchiveReceipt[]> {
  const raw = await request(caseId ? `?case=${encodeURIComponent(caseId)}` : "") as {packages?: unknown[]};
  if (!Array.isArray(raw?.packages) || raw.packages.length > 100) throw new Error("The workstation returned an invalid archive list.");
  return raw.packages.map(receipt);
}
// Admission validates structure and source identity here. The caller must replay
// source parsing via the existing restore flow before activating this package.
export async function readArchivedPackage(digest: string): Promise<IntakeResult> {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid archive identity.");
  const raw = await request(`?digest=${encodeURIComponent(digest)}`) as {payload?: unknown};
  const saved = receipt(raw);
  if (typeof raw.payload !== "string" || saved.digest !== digest || fingerprint(raw.payload) !== digest || new TextEncoder().encode(raw.payload).byteLength !== saved.bytes) throw new Error("The archived source package failed its integrity check.");
  const valid = validateAdmittedDeal(JSON.parse(raw.payload));
  if (localCaseId(valid) !== saved.caseId) throw new Error("The archived source package belongs to a different deal.");
  return valid;
}

export const SOURCE_BACKUP_VERSION = "underwriting-desk.source-backup/v1" as const;
export async function validateSourceBackup(serialized: string): Promise<IntakeResult> {
  if (new TextEncoder().encode(serialized).byteLength > 13_000_000) throw new Error("Source backup exceeds the 13 MB import limit.");
  const raw: unknown = JSON.parse(serialized);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid source backup.");
  const envelope = raw as Record<string, unknown>;
  if (envelope.schemaVersion !== SOURCE_BACKUP_VERSION || typeof envelope.payload !== "string" || typeof envelope.digest !== "string" || !/^[a-f0-9]{64}$/.test(envelope.digest) || Object.keys(envelope).some(key => !["schemaVersion", "payload", "digest"].includes(key))) throw new Error("Invalid source backup format.");
  if (fingerprint(envelope.payload) !== envelope.digest) throw new Error("Source backup integrity check failed.");
  return replayAdmittedDeal(validateAdmittedDeal(JSON.parse(envelope.payload)));
}

export async function createSourceBackup(digest: string): Promise<{filename: string; content: string}> {
  const result = await replayAdmittedDeal(await readArchivedPackage(digest));
  // A source-only envelope never carries a workspace that could replace notes.
  const payload = JSON.stringify(result);
  const content = `${JSON.stringify({schemaVersion: SOURCE_BACKUP_VERSION, payload, digest: fingerprint(payload)}, null, 2)}\n`;
  await validateSourceBackup(content);
  return {filename: `${localCaseId(result)}-source-backup.json`, content};
}
