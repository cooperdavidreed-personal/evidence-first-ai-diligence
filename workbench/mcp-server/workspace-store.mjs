export const WORKSPACE_MAX_BYTES = 2_000_000;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
export function validateStoredWorkspace(state, deal) {
  if (!record(state) || typeof deal !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(deal) || state.caseId !== deal || state.schemaVersion !== "underwriting.deal-workspace/v3" || !Number.isSafeInteger(state.revision) || state.revision < 1) throw new Error("workspace_state_invalid");
  const arrays = ["observations", "assumptionReviewEvents", "issues", "proposals", "memoSections", "policyOverrides"];
  if (arrays.some(key => !Array.isArray(state[key]) || state[key].length > 200) || !record(state.assumptionReviews) || !record(state.scenarioValues) || Object.values(state.scenarioValues).some(value => typeof value !== "string") || typeof state.privateNote !== "string" || state.privateNote.length > 8000 || typeof state.updatedAt !== "string" || !Number.isFinite(Date.parse(state.updatedAt)) || (state.changeControl !== null && !record(state.changeControl))) throw new Error("workspace_state_invalid");
  const allowed = new Set(["schemaVersion", "caseId", "revision", "privateNote", ...arrays, "assumptionReviews", "scenarioValues", "changeControl", "updatedAt"]);
  if (Object.keys(state).some(key => !allowed.has(key))) throw new Error("workspace_state_invalid");
  const serialized = JSON.stringify(state);
  if (Buffer.byteLength(serialized) > WORKSPACE_MAX_BYTES) throw new Error("workspace_too_large");
  // Deal-specific evidence, approval, scenario and integrity contracts are checked by the UI before saving and after loading.
  return serialized;
}
export function workspaceMethods(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS workspaces (deal TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workspace_revisions (deal TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(deal,version));
    CREATE TRIGGER IF NOT EXISTS workspace_revision_no_update BEFORE UPDATE ON workspace_revisions BEGIN SELECT RAISE(ABORT,'workspace_history_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS workspace_revision_no_delete BEFORE DELETE ON workspace_revisions BEGIN SELECT RAISE(ABORT,'workspace_history_immutable'); END;`);
  return {
    workspace(deal) {
      const row = db.prepare("SELECT version,state FROM workspaces WHERE deal=?").get(deal);
      return row ? {version: row.version, state: JSON.parse(row.state)} : null;
    },
    saveWorkspace({deal_id, baseVersion, state}) {
      const serialized = validateStoredWorkspace(state, deal_id);
      if (baseVersion !== null && (!Number.isSafeInteger(baseVersion) || baseVersion < 1)) throw new Error("workspace_base_version_invalid");
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = db.prepare("SELECT version FROM workspaces WHERE deal=?").get(deal_id);
        if ((current?.version ?? null) !== baseVersion) throw new Error("workspace_conflict");
        const version = (baseVersion ?? 0) + 1;
        db.prepare("INSERT INTO workspace_revisions VALUES (?,?,?,?)").run(deal_id, version, serialized, new Date().toISOString());
        db.prepare("INSERT INTO workspaces VALUES (?,?,?) ON CONFLICT(deal) DO UPDATE SET version=excluded.version,state=excluded.state").run(deal_id, version, serialized);
        db.exec("COMMIT");
        return {version, state: JSON.parse(serialized)};
      } catch (error) {db.exec("ROLLBACK"); throw error;}
    },
  };
}
