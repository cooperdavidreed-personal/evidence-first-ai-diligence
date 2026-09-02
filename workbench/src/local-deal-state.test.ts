import {File as NodeFile} from "node:buffer";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {beforeEach, describe, expect, it} from "vitest";
import {processDealPackage} from "./intake";
import {digestChallengePayloadSync} from "./model-workflow";
import {
  installAdmittedDealBundle,
  loadAdmittedDeal,
  localCaseId,
  localWorkspaceSeed,
  persistAdmittedDeal,
  serializeAdmittedDealBundle,
  validateAdmittedDeal,
  validateAdmittedDealBundle,
} from "./local-deal-state";
import {createWorkspace, createWorkspaceIntegrityContract, loadWorkspace, validateWorkspace} from "./workspace-state";
import {localPostureCopy} from "./local-deal";

const TestFile = NodeFile as unknown as typeof File;
const packageRoot = resolve(process.cwd(), "public/sample-package");

async function admittedNorthstar() {
  const files = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"].map((name) =>
    new TestFile([readFileSync(resolve(packageRoot, name))], name),
  );
  const result = await processDealPackage(files);
  expect(result.packageState).toBe("READY");
  return result;
}

function localScenario(result: Awaited<ReturnType<typeof admittedNorthstar>>) {
  return {localGrowth: String(result.deal!.annualRevenueGrowth), localExitMultiple: String(result.deal!.exitRevenueMultiple)};
}

describe("portable admitted deal state", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {configurable: true, value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    }});
  });

  it("round-trips the admitted package and its governed workspace", async () => {
    const result = await admittedNorthstar();
    const caseId = localCaseId(result);
    const workspace = createWorkspace(localWorkspaceSeed(result), "2026-09-01T12:00:00.000Z");

    const bundle = await validateAdmittedDealBundle(serializeAdmittedDealBundle(result, workspace));
    expect(bundle.admittedDeal.analysis?.ordinaryNrr.toFixed(3)).toBe("0.836");
    expect(bundle.workspace.caseId).toMatch(/^local-northstar-metrics-[a-f0-9]{12}$/);
    installAdmittedDealBundle(bundle);
    expect((await loadAdmittedDeal())?.deal?.company).toBe("Northstar Metrics");
    expect(loadWorkspace(caseId, workspace).issues[0].owner).toBeTruthy();
  });

  it("binds local overview and rail copy to the deterministic posture", () => {
    expect(localPostureCopy("HOLD")).toEqual({
      heading: "HOLD",
      detail: "Return screens miss; no IC advancement",
      icState: "HOLD — deterministic return screens miss",
    });
    expect(localPostureCopy("SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED")).toEqual({
      heading: "FURTHER DILIGENCE",
      detail: "Screening complete; no IC advancement",
      icState: "Further diligence required",
    });
  });

  it("rejects incomplete results, cross-deal workspaces, and oversized bundles", async () => {
    const result = await admittedNorthstar();
    expect(() => validateAdmittedDeal({...result, packageState: "INCOMPLETE"})).toThrow(/invalid/i);
    const wrongWorkspace = createWorkspace({caseId: "wrong-case", issues: [], memoSections: [], scenarioValues: localScenario(result)}, "2026-09-01T12:00:00.000Z");
    expect(() => serializeAdmittedDealBundle(result, wrongWorkspace)).toThrow(/different deal/i);
    await expect(validateAdmittedDealBundle(`${" ".repeat(13_000_001)}{}`)).rejects.toThrow(/13 MB/i);
  });

  it("does not reuse workspace identity when the same company has different admitted bytes", async () => {
    const result = await admittedNorthstar();
    const changed = structuredClone(result);
    const customerSource = changed.files.find((file) => file.name === "customer_arr.csv")!;
    customerSource.sha256 = `${customerSource.sha256!.slice(0, -1)}${customerSource.sha256!.endsWith("0") ? "1" : "0"}`;
    changed.files.find((file) => file.name === "manifest.json")!.sha256 = undefined;
    expect(localCaseId(changed)).not.toBe(localCaseId(result));
  });

  it("recomputes imported economics and rejects edited calculated outputs", async () => {
    const result = await admittedNorthstar();
    const workspace = createWorkspace(localWorkspaceSeed(result), "2026-09-01T12:00:00.000Z");
    const raw = JSON.parse(serializeAdmittedDealBundle(result, workspace));
    raw.admittedDeal.analysis.grossMoic = 99;
    await expect(validateAdmittedDealBundle(JSON.stringify(raw))).rejects.toThrow(/calculations do not match/i);
  });

  it("replays browser-local admitted economics before restoring the deal", async () => {
    const result = await admittedNorthstar();
    persistAdmittedDeal(result);
    const stored = JSON.parse(window.localStorage.getItem("underwriting-desk.admitted-deal.v1")!);
    stored.analysis.grossMoic = 99;
    window.localStorage.setItem("underwriting-desk.admitted-deal.v1", JSON.stringify(stored));
    await expect(loadAdmittedDeal()).resolves.toBeNull();
  });

  it("rejects portable deletion or rewriting of canonical diligence and analysis", async () => {
    const result = await admittedNorthstar();
    const workspace = createWorkspace(localWorkspaceSeed(result), "2026-09-01T12:00:00.000Z");
    const deletedIssue = JSON.parse(serializeAdmittedDealBundle(result, workspace));
    deletedIssue.workspace.issues = deletedIssue.workspace.issues.slice(1);
    await expect(validateAdmittedDealBundle(JSON.stringify(deletedIssue))).rejects.toThrow(/canonical diligence issue.*cannot be deleted/i);

    const forgedMemo = JSON.parse(serializeAdmittedDealBundle(result, workspace));
    forgedMemo.workspace.memoSections[0].body = "The model says this deal is ready.";
    await expect(validateAdmittedDealBundle(JSON.stringify(forgedMemo))).rejects.toThrow(/cannot impersonate or rewrite deterministic analysis/i);
  });

  it("requires the registered policy-owner role for a portable Northstar override", async () => {
    const result = await admittedNorthstar();
    const workspace = createWorkspace(localWorkspaceSeed(result), "2026-09-01T12:00:00.000Z");
    workspace.policyOverrides.push({eventId: "override-1", gateId: "retention-nrr", disposition: "OVERRIDDEN", actor: "Avery Chen", actorRole: "Policy owner", rationale: "Recorded exception while retaining the observed 83.6% 11-month retention-proxy concern.", recordedAt: "2026-09-01T13:00:00.000Z"});
    expect(() => serializeAdmittedDealBundle(result, workspace)).not.toThrow();
    workspace.policyOverrides[0].actorRole = "Analyst";
    expect(() => serializeAdmittedDealBundle(result, workspace)).toThrow(/requires the Policy owner role/i);
    workspace.policyOverrides[0] = {...workspace.policyOverrides[0], actorRole: "Policy owner", gateId: "data-sufficiency"};
    expect(() => serializeAdmittedDealBundle(result, workspace)).toThrow(/not eligible/i);
  });

  it("locks every blocking Northstar screening issue against free-text resolution", async () => {
    const result = await admittedNorthstar();
    const seed = localWorkspaceSeed(result);
    expect(seed.lockedIssueIds).toEqual(result.analysis!.tests.filter((test) => test.blocksAdvancement).map((test) => test.gateId));
    const workspace = createWorkspace(seed, "2026-09-01T12:00:00.000Z");
    const retention = workspace.issues.find((issue) => issue.id === "retention-nrr")!;
    retention.status = "RESOLVED";
    retention.resolution = "Analyst says it is acceptable.";
    retention.resolvedBy = "Analyst";
    expect(() => validateWorkspace(workspace, localCaseId(result), new Set(result.analysis!.metrics.map((item) => item.id)), {fields: {localGrowth: {kind: "NUMBER", min: -.99, max: 5}, localExitMultiple: {kind: "NUMBER", min: .01, max: 100}}}, createWorkspaceIntegrityContract(seed, {"retention-nrr": "Policy owner"}))).toThrow(/cannot be resolved through the diligence issue log/i);
  });

  it("retains exact admitted rows for Northstar source inspection", async () => {
    const result = await admittedNorthstar();
    const monthly = result.analysis!.sourcePreviews.find((preview) => preview.sourceFile === "monthly_financials.csv")!;
    const cohort = result.analysis!.sourcePreviews.find((preview) => preview.sourceFile === "customer_arr.csv")!;
    expect(monthly.rows).toHaveLength(12);
    expect(monthly.rows?.[0]).toMatchObject({dataRow: expect.any(Number), cells: expect.arrayContaining([{label: "Period", value: expect.any(String)}])});
    expect(cohort.rows?.length).toBeGreaterThan(1);
    expect(cohort.rows?.[0].cells.map((cell) => cell.label)).toEqual(["Customer", "Period", "ARR"]);
  });

  it("rejects retained-case or fabricated evidence references in a local portable deal", async () => {
    const result = await admittedNorthstar();
    const workspace = createWorkspace(localWorkspaceSeed(result), "2026-09-01T12:00:00.000Z");
    const dealId = localCaseId(result);
    const requestEvidence = [{id: result.analysis!.metrics[0].id, title: result.analysis!.metrics[0].label, displayValue: result.analysis!.metrics[0].display, summary: result.analysis!.metrics[0].meaning}];
    workspace.proposals.push({proposalId: "proposal-1", kind: "CHALLENGE", state: "PROPOSED", title: "Challenge retention", body: "Reconcile the cohort denominator.", evidenceRefs: ["atlasgrid-SELECTED-gross-irr"], dealId, origin: "PORTABLE_IMPORT_UNVERIFIED", requestEvidence, requestDigestSha256: digestChallengePayloadSync(dealId, requestEvidence)});
    expect(() => serializeAdmittedDealBundle(result, workspace)).toThrow(/outside its selected request subset/i);
    workspace.proposals[0].evidenceRefs = [result.analysis!.metrics[0].id];
    expect(() => serializeAdmittedDealBundle(result, workspace)).not.toThrow();
  });

  it("rejects out-of-contract scenario values in a portable local deal", async () => {
    const result = await admittedNorthstar();
    const workspace = createWorkspace(localWorkspaceSeed(result), "2026-09-01T12:00:00.000Z");
    workspace.scenarioValues.localGrowth = "999";
    expect(() => serializeAdmittedDealBundle(result, workspace)).toThrow(/outside the deal contract/i);
    workspace.scenarioValues = {...localScenario(result), extraScenario: "1"};
    expect(() => serializeAdmittedDealBundle(result, workspace)).toThrow(/keys do not match/i);
  });
});
