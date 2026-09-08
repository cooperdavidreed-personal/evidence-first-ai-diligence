import {sha256} from "@noble/hashes/sha2.js";
import {bytesToHex} from "@noble/hashes/utils.js";
import type {IntakeResult} from "./intake";
import {localCaseId, replayAdmittedDeal, replayHistoricalDelivery, validateAdmittedDeal} from "./local-deal-state";
import {archiveAdmittedPackage, listArchivedPackages, readArchivedPackage} from "./package-archive";
import {usesLocalWorkstation} from "./local-workspace";

export interface SavedDeal {
  id: string; caseId: string; company: string; version: string; packageDigest: string;
  savedAt: string; storage: "browser" | "local-workstation";
}
const PREFIX = "underwriting-desk.deal-library.v1.";
const LEGACY_KEY = "underwriting-desk.admitted-deal.v1";
const fingerprint = (payload: string) => bytesToHex(sha256(new TextEncoder().encode(payload)));
function metadata(result: IntakeResult, id: string, savedAt: string, storage: SavedDeal["storage"]): SavedDeal {
  if (!result.baselineApproval) throw new Error("Approve the source baseline before saving this deal.");
  return {id, caseId: localCaseId(result), company: result.deal!.company, version: result.baselineApproval.version, packageDigest: result.baselineApproval.packageDigest, savedAt, storage};
}
function browserRecord(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid saved delivery identity.");
  const value = window.localStorage.getItem(PREFIX + id);
  if (!value) return null;
  const record = JSON.parse(value) as {payload: unknown; savedAt: unknown};
  if (typeof record.payload !== "string" || fingerprint(record.payload) !== id || typeof record.savedAt !== "string" || !Number.isFinite(Date.parse(record.savedAt))) throw new Error("Saved delivery failed its integrity check. Existing data has not been replaced.");
  const result = validateAdmittedDeal(JSON.parse(record.payload));
  return {result, detail: metadata(result, id, record.savedAt, "browser")};
}
// One immutable localStorage record is the commit boundary. There is no mutable
// index whose interrupted update can strand an earlier delivery.
export function saveDealToBrowser(result: IntakeResult): SavedDeal {
  const valid = validateAdmittedDeal(result), payload = JSON.stringify(valid), id = fingerprint(payload);
  const previous = browserRecord(id);
  if (previous) return previous.detail;
  const detail = metadata(valid, id, new Date().toISOString(), "browser");
  const serialized = JSON.stringify({payload, savedAt: detail.savedAt});
  window.localStorage.setItem(PREFIX + id, serialized);
  if (window.localStorage.getItem(PREFIX + id) !== serialized) throw new Error("Saved delivery could not be verified in browser storage.");
  return detail;
}
export function migrateLegacyDeal(): SavedDeal | null {
  const legacy = window.localStorage.getItem(LEGACY_KEY);
  if (!legacy) return null;
  // Never delete or replace the legacy source or any analyst workspace.
  return saveDealToBrowser(validateAdmittedDeal(JSON.parse(legacy)));
}
export async function listSavedDeals(): Promise<SavedDeal[]> {
  migrateLegacyDeal();
  const records = new Map<string, SavedDeal>();
  const storage = window.localStorage;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) {
      const record = browserRecord(key.slice(PREFIX.length));
      if (record) records.set(record.detail.id, record.detail);
    }
  }
  if (usesLocalWorkstation()) {
    const archived = await listArchivedPackages();
    // The archive is the durable authority; retrieve exact validated metadata,
    // rather than infer version numbers from labels or archive chronology.
    for (const entry of archived) {
      const result = await readArchivedPackage(entry.digest);
      records.set(entry.digest, metadata(result, entry.digest, entry.archivedAt, "local-workstation"));
    }
  }
  return [...records.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
}
export async function saveSavedDeal(result: IntakeResult): Promise<SavedDeal> {
  const valid = await replayAdmittedDeal(validateAdmittedDeal(result));
  // Materialize older deliveries embedded in imported or migrated lineages.
  // Validate every version before writing any new records.
  const historical = [];
  for (let index = 0; index < (valid.versionHistory?.length ?? 0); index++) historical.push(await replayHistoricalDelivery(valid, index));
  if (usesLocalWorkstation()) {
    for (const prior of historical) await archiveAdmittedPackage(prior);
    const archived = await archiveAdmittedPackage(valid);
    // Browser capacity is not a precondition for retaining a durable local copy.
    try {saveDealToBrowser(valid);} catch { /* Local archive receipt remains authoritative. */ }
    return metadata(valid, archived.digest, archived.archivedAt, "local-workstation");
  }
  migrateLegacyDeal();
  for (const prior of historical) saveDealToBrowser(prior);
  return saveDealToBrowser(valid);
}
export async function openSavedDeal(id: string): Promise<IntakeResult> {
  const record = browserRecord(id);
  const result = record?.result ?? (usesLocalWorkstation() ? await readArchivedPackage(id) : null);
  if (!result) throw new Error("This saved delivery is unavailable. Restore a source backup to recover it.");
  return replayAdmittedDeal(validateAdmittedDeal(result));
}
export async function listDealVersions(caseId: string): Promise<SavedDeal[]> {
  return (await listSavedDeals()).filter(item => item.caseId === caseId).sort((a, b) => Number(b.version.slice(1)) - Number(a.version.slice(1)) || b.savedAt.localeCompare(a.savedAt));
}
