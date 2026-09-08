import {sha256} from "@noble/hashes/sha2.js";
import {bytesToHex} from "@noble/hashes/utils.js";
export const INTAKE_DRAFT_MAX_BYTES = 8_000_000;
export interface IntakeDraft {files: File[]; savedAt: string}
interface StoredDraft {schemaVersion: "underwriting.intake-draft/v1"; savedAt: string; files: {name: string; type: string; lastModified: number; relativePath: string; bytes: ArrayBuffer; digest: string}[]}
export interface DraftPersistence {read(): Promise<unknown>; write(value: unknown): Promise<void>; clear(): Promise<void>}
const fingerprint = (bytes: ArrayBuffer) => bytesToHex(sha256(new Uint8Array(bytes)));
function decode(raw: unknown): IntakeDraft {
  const stored = raw as StoredDraft;
  if (!stored || stored.schemaVersion !== "underwriting.intake-draft/v1" || !Array.isArray(stored.files) || !stored.files.length || stored.files.length > 100 || typeof stored.savedAt !== "string" || !Number.isFinite(Date.parse(stored.savedAt))) throw new Error("The saved intake draft is invalid. Discard it or choose the source files again.");
  let total = 0;
  const names = new Set<string>();
  const files = stored.files.map(item => {
    if (typeof item.name !== "string" || !item.name || item.name.length > 240 || typeof item.type !== "string" || item.type.length > 160 || typeof item.relativePath !== "string" || item.relativePath.length > 1000 || !Number.isSafeInteger(item.lastModified) || Object.prototype.toString.call(item.bytes) !== "[object ArrayBuffer]" || typeof item.digest !== "string") throw new Error("The saved intake draft has an invalid file.");
    total += item.bytes.byteLength;
    if (total > INTAKE_DRAFT_MAX_BYTES || fingerprint(item.bytes) !== item.digest) throw new Error("The saved intake draft failed its size or integrity check.");
    const key = item.relativePath || item.name;
    if (names.has(key)) throw new Error("The saved intake draft contains duplicate file identities.");
    names.add(key);
    const file = new File([item.bytes], item.name, {type: item.type, lastModified: item.lastModified});
    if (item.relativePath) Object.defineProperty(file, "webkitRelativePath", {value: item.relativePath});
    return file;
  });
  return {files, savedAt: stored.savedAt};
}
export function createIntakeDraftStore(storage: DraftPersistence) {
  return {
    async save(files: File[]): Promise<IntakeDraft> {
      if (!files.length || files.length > 100 || files.reduce((sum, file) => sum + file.size, 0) > INTAKE_DRAFT_MAX_BYTES) throw new Error("Save between 1 and 100 files, totaling no more than 8 MB, as an intake draft.");
      const stored: StoredDraft = {schemaVersion: "underwriting.intake-draft/v1", savedAt: new Date().toISOString(), files: []};
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        stored.files.push({name: file.name, type: file.type, lastModified: file.lastModified, relativePath: file.webkitRelativePath || "", bytes, digest: fingerprint(bytes)});
      }
      decode(stored); // Reject incomplete/corrupt snapshots before replacing a draft.
      await storage.write(stored);
      return decode(stored);
    },
    async load(): Promise<IntakeDraft | null> {const raw = await storage.read(); return raw === undefined || raw === null ? null : decode(raw);},
    async discard() {await storage.clear();},
  };
}
function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {reject(new Error("Draft storage is unavailable in this browser. Keep this tab open or retain the original files.")); return;}
    const open = indexedDB.open("underwriting-desk-intake", 1);
    open.onupgradeneeded = () => {open.result.createObjectStore("drafts");};
    open.onerror = () => reject(new Error("Could not open local intake draft storage."));
    open.onblocked = () => reject(new Error("Close older Desk tabs and retry draft storage."));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("drafts", mode);
      const request = operation(tx.objectStore("drafts"));
      tx.oncomplete = () => {db.close(); resolve(request.result);};
      tx.onabort = () => {db.close(); reject(new Error("The intake draft could not be saved or read. Existing files are unchanged."));};
      tx.onerror = () => { /* onabort reports the final failed transaction. */ };
    };
  });
}
const store = createIntakeDraftStore({
  read: () => transaction("readonly", value => value.get("current")),
  write: async value => {await transaction("readwrite", store => store.put(value, "current"));},
  clear: async () => {await transaction("readwrite", store => store.delete("current"));},
});
export const saveIntakeDraft = store.save;
export const loadIntakeDraft = store.load;
export const discardIntakeDraft = store.discard;
