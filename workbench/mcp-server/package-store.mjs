import {createHash} from "node:crypto";

export const PACKAGE_MAX_BYTES = 16_000_000;
const hash = payload => createHash("sha256").update(payload, "utf8").digest("hex");
const validDigest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validCase = value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/.test(value);

// This is an immutable byte archive, not a substitute for the application's
// package admission and deterministic replay validation.
export function attachPackageStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS package_archives (
    digest TEXT PRIMARY KEY, case_id TEXT NOT NULL, label TEXT NOT NULL,
    bytes INTEGER NOT NULL, archived_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS package_archive_no_update BEFORE UPDATE ON package_archives BEGIN SELECT RAISE(ABORT,'package_archive_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS package_archive_no_delete BEFORE DELETE ON package_archives BEGIN SELECT RAISE(ABORT,'package_archive_immutable'); END;`);
  const metadata = "digest,case_id AS caseId,label,bytes,archived_at AS archivedAt";
  return {
    archivePackage({caseId, label, payload, digest}) {
      if (!validCase(caseId) || typeof label !== "string" || !label.trim() || label.length > 200 || /[\u0000-\u001f\u007f]/.test(label) || typeof payload !== "string" || !validDigest(digest)) throw new Error("package_archive_invalid");
      const bytes = Buffer.byteLength(payload, "utf8");
      if (bytes > PACKAGE_MAX_BYTES) throw new Error("package_archive_too_large");
      if (hash(payload) !== digest) throw new Error("package_archive_digest_mismatch");
      let parsed;
      try { parsed = JSON.parse(payload); } catch { throw new Error("package_archive_invalid_json"); }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("package_archive_invalid_json");
      const prior = db.prepare(`SELECT ${metadata},payload FROM package_archives WHERE digest=?`).get(digest);
      if (prior) {
        if (prior.payload !== payload || prior.caseId !== caseId || prior.label !== label) throw new Error("package_archive_conflict");
        const {payload: _payload, ...receipt} = prior;
        return {...receipt};
      }
      const archivedAt = new Date().toISOString();
      db.prepare("INSERT INTO package_archives VALUES (?,?,?,?,?,?)").run(digest, caseId, label, bytes, archivedAt, payload);
      return {digest, caseId, label, bytes, archivedAt};
    },
    listPackages(caseId) {
      if (caseId !== undefined && !validCase(caseId)) throw new Error("package_archive_case_invalid");
      return db.prepare(`SELECT ${metadata} FROM package_archives ${caseId === undefined ? "" : "WHERE case_id=?"} ORDER BY archived_at DESC,digest DESC LIMIT 100`).all(...(caseId === undefined ? [] : [caseId])).map(row => ({...row}));
    },
    readPackage(digest) {
      if (!validDigest(digest)) throw new Error("package_archive_digest_invalid");
      const row = db.prepare(`SELECT ${metadata},payload FROM package_archives WHERE digest=?`).get(digest);
      if (!row) return null;
      if (hash(row.payload) !== row.digest || Buffer.byteLength(row.payload, "utf8") !== row.bytes) throw new Error("package_archive_corrupt");
      return {...row};
    },
  };
}
