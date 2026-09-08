import {File as NodeFile} from "node:buffer";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {approveBaseline, processDealPackage, promoteEvidenceVersion} from "./intake";
import {localCaseId, persistAdmittedDeal} from "./local-deal-state";
import {listDealVersions, listSavedDeals, migrateLegacyDeal, openSavedDeal, saveSavedDeal} from "./deal-library";
const runtime = vi.hoisted(() => ({local: false}));
vi.mock("./local-workspace", () => ({usesLocalWorkstation: () => runtime.local}));
const legacy = "underwriting-desk.admitted-deal.v1";
async function packageResult(growth = "0.25") {
  const folder = resolve(process.cwd(), "public/sample-package");
  const names = ["deal.json", "monthly_financials.csv", "customer_arr.csv"];
  const bytes = new Map(names.map(name => [name, readFileSync(resolve(folder, name))]));
  const deal = JSON.parse(bytes.get("deal.json")!.toString()); deal.return_assumptions.annual_revenue_growth = growth;
  bytes.set("deal.json", Buffer.from(JSON.stringify(deal)));
  const manifest = JSON.parse(readFileSync(resolve(folder, "manifest.json"), "utf8"));
  for (const file of manifest.files) {file.bytes = bytes.get(file.name)!.length; file.sha256 = createHash("sha256").update(bytes.get(file.name)!).digest("hex");}
  bytes.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
  return processDealPackage([...bytes].map(([name, content]) => new NodeFile([content], name) as unknown as File));
}
const approved = async (growth?: string) => approveBaseline(await packageResult(growth), "Avery Chen", "Reviewed source mappings and calculation scope.");
beforeEach(() => {
  runtime.local = false;
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {get length() {return values.size;}, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}, removeItem: (key: string) => {values.delete(key);}, clear: () => values.clear()});
});
describe("saved deal library", () => {
  it("retains distinct same-company packages and their independent workspaces", async () => {
    const first = await approved(), second = await approved("0.30");
    const a = await saveSavedDeal(first), b = await saveSavedDeal(second);
    expect(a.caseId).not.toBe(b.caseId);
    localStorage.setItem(`underwriting-desk.workspace.v3.${a.caseId}`, "analyst A");
    localStorage.setItem(`underwriting-desk.workspace.v3.${b.caseId}`, "analyst B");
    expect(await listSavedDeals()).toHaveLength(2);
    expect((await openSavedDeal(a.id)).analysis?.grossMoic).toBe(first.analysis?.grossMoic);
    expect((await openSavedDeal(b.id)).analysis?.grossMoic).toBe(second.analysis?.grossMoic);
    expect(localStorage.getItem(`underwriting-desk.workspace.v3.${a.caseId}`)).toBe("analyst A");
    expect(localStorage.getItem(`underwriting-desk.workspace.v3.${b.caseId}`)).toBe("analyst B");
  });
  it("retains successive versions under one stable lineage without overwriting V1", async () => {
    const v1 = await approved();
    const v2 = promoteEvidenceVersion(v1, await packageResult("0.30"), "Avery Chen", "Reconciled the management revision with the source package.");
    expect(persistAdmittedDeal(v1)).toBe(true);
    expect(persistAdmittedDeal(v2)).toBe(true);
    const versions = await listDealVersions(localCaseId(v1));
    expect(versions.map(item => item.version)).toEqual(["V2", "V1"]);
    expect((await openSavedDeal(versions[1].id)).baselineApproval?.version).toBe("V1");
    expect((await openSavedDeal(versions[0].id)).baselineApproval?.version).toBe("V2");
  });
  it("materializes embedded historical deliveries when importing V2 without prior library records", async () => {
    const v1 = await approved();
    const v2 = promoteEvidenceVersion(v1, await packageResult("0.30"), "Avery Chen", "Reconciled management revision and source scope.");
    await saveSavedDeal(v2);
    const versions = await listDealVersions(localCaseId(v1));
    expect(versions.map(item => item.version)).toEqual(["V2", "V1"]);
    expect((await openSavedDeal(versions[1].id)).analysis).toEqual(v1.analysis);
  });
  it("uses the local archive across browser record loss without resetting analyst state", async () => {
    runtime.local = true;
    const archives = new Map<string, unknown>();
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === "POST") {
        const body = JSON.parse(String(options.body));
        const saved = {...body, bytes: new TextEncoder().encode(body.payload).byteLength, archivedAt: "2026-09-07T12:00:00Z"};
        archives.set(body.digest, saved); return new Response(JSON.stringify(saved));
      }
      const digest = new URL(url, "http://localhost").searchParams.get("digest");
      return new Response(JSON.stringify(digest ? archives.get(digest) : {packages: [...archives.values()]}));
    }));
    const original = await approved(), saved = await saveSavedDeal(original);
    expect(saved.storage).toBe("local-workstation");
    localStorage.clear(); localStorage.setItem("analyst-notes", "durable-workspace-is-separate");
    expect((await listSavedDeals())[0].id).toBe(saved.id);
    expect((await openSavedDeal(saved.id)).sourcePayloads).toEqual(original.sourcePayloads);
    expect(localStorage.getItem("analyst-notes")).toBe("durable-workspace-is-separate");
  });
  it("migrates a legacy slot idempotently without deleting it or resetting notes", async () => {
    const original = JSON.stringify(await approved());
    localStorage.setItem(legacy, original); localStorage.setItem("analyst-notes", "keep");
    expect(migrateLegacyDeal()?.company).toBe("Northstar Metrics");
    migrateLegacyDeal(); expect(await listSavedDeals()).toHaveLength(1);
    expect(localStorage.getItem(legacy)).toBe(original); expect(localStorage.getItem("analyst-notes")).toBe("keep");
  });
  it("keeps the selected legacy delivery when browser quota rejects a new library entry", async () => {
    const first = await approved(); expect(persistAdmittedDeal(first)).toBe(true);
    const previous = localStorage.getItem(legacy);
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key.startsWith("underwriting-desk.deal-library.v1.")) throw new Error("quota exceeded");
      write(key, value);
    });
    expect(persistAdmittedDeal(await approved("0.30"))).toBe(false);
    expect(localStorage.getItem(legacy)).toBe(previous);
    expect((await listSavedDeals()).length).toBe(1);
  });
  it("fails closed for corrupted records and leaves the legacy current slot intact", async () => {
    const source = await approved(); const saved = await saveSavedDeal(source);
    localStorage.setItem(legacy, JSON.stringify(source));
    localStorage.setItem(`underwriting-desk.deal-library.v1.${saved.id}`, JSON.stringify({payload: "{}", savedAt: new Date().toISOString()}));
    await expect(openSavedDeal(saved.id)).rejects.toThrow(/integrity/);
    expect(persistAdmittedDeal(source)).toBe(false);
    expect(JSON.parse(localStorage.getItem(legacy)!).baselineApproval.version).toBe("V1");
  });
});
