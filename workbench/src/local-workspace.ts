import type {DealWorkspaceState} from "./workspace-state";

declare global {interface Window {__DESK_LOCAL_RUNTIME__?: boolean}}
export const usesLocalWorkstation = () => typeof window !== "undefined" && window.__DESK_LOCAL_RUNTIME__ === true;
export class LocalWorkspaceConflict extends Error {constructor() {super("Another window saved a newer workspace. Your unsaved copy is available for download. Reload this page to recover.");}}
export class LocalWorkspaceRejected extends Error {
  constructor(public raw: unknown) {super("The local workstation copy failed deal validation. It was not changed. Download it for inspection and reload after recovery.");}
}
type Validate = (raw: unknown) => DealWorkspaceState;
type Snapshot = {version: number; state: unknown};
export class LocalWorkspaceSession {
  private version: number | null = null;
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private failed = false;
  private savedJson = "";
  private pending = 0;
  get hasUnsavedWork() {return this.pending > 0 || this.failed;}
  constructor(private caseId: string, private validate: Validate, private request: typeof fetch = (...args) => fetch(...args)) {}
  close() {this.stopped = true;}
  private async call(method: "GET" | "POST", payload?: unknown) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.request(`/__desk/workspace?deal=${encodeURIComponent(this.caseId)}`, {method, signal: controller.signal, headers: {"x-desk-local": "1", ...(method === "POST" ? {"Content-Type": "application/json"} : {})}, ...(payload ? {body: JSON.stringify(payload)} : {})});
      if (response.status === 409) throw new LocalWorkspaceConflict();
      if (!response.ok) throw new Error("workstation_http_failed");
      return await response.json();
    } catch (error) {
      if (error instanceof LocalWorkspaceConflict) throw error;
      throw new Error("Local workstation unavailable or request timed out. Reload this page to recover; the browser copy was not used to overwrite it.");
    } finally {clearTimeout(timeout);}
  }

  private accept(snapshot: Snapshot) {
    if (!snapshot || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1) throw new Error("Local workstation response is invalid. Reload this page to recover.");
    let state: DealWorkspaceState;
    try {state = this.validate(snapshot.state);} catch {throw new LocalWorkspaceRejected(snapshot.state);}
    this.version = snapshot.version;
    this.savedJson = JSON.stringify(state);
    return state;
  }
  async hydrate(browserCopy: DealWorkspaceState, allowMigration: boolean) {
    const response = await this.call("GET");
    if (this.stopped) throw new Error("Workspace changed while loading");
    if (response.workspace) return this.accept(response.workspace);
    if (!allowMigration) throw new Error("The browser workspace needs recovery before a new local workstation copy can be created.");
    const state = this.validate(browserCopy);
    try {return this.accept(await this.call("POST", {deal_id: this.caseId, baseVersion: null, state}));}
    catch (error) {
      // Two initial windows may discover an empty store together. Read the winner; never replace it.
      if (error instanceof LocalWorkspaceConflict) return this.accept((await this.call("GET")).workspace);
      throw error;
    }
  }
  save(next: DealWorkspaceState): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("Workspace session closed"));
    const state = this.validate(next);
    this.pending += 1;
    const task = this.queue.then(async () => {
      if (this.failed) throw new Error("Workspace has an unresolved save failure. Reload before accepting more changes.");
      if (this.version === null) throw new Error("Workspace has not loaded");
      if (this.savedJson === JSON.stringify(state)) return;
      try {this.accept(await this.call("POST", {deal_id: this.caseId, baseVersion: this.version, state}));}
      catch (error) {this.failed = true; throw error;}
    });
    const settled = task.finally(() => {this.pending -= 1;});
    this.queue = settled.catch(() => {});
    return settled;
  }
}
