import {EVIDENCE_REQUIRED_FILES, processDealPackage, REQUIRED_FILES, type IntakeResult, type SourcePayload} from "./intake";
import {assertRegisteredPolicyProfile} from "./policy";
import {createWorkspaceIntegrityContract, sanitizePortableWorkspaceImport, storageKey, validateWorkspace, type DealWorkspaceState, type WorkspaceScenarioContract, type WorkspaceSeed} from "./workspace-state";

export const ADMITTED_DEAL_BUNDLE_VERSION = "underwriting.admitted-deal-bundle/v1" as const;
const LOCAL_DEAL_KEY = "underwriting-desk.admitted-deal.v1";
const MAX_BUNDLE_BYTES = 13_000_000;

export interface AdmittedDealBundle {
  schemaVersion: typeof ADMITTED_DEAL_BUNDLE_VERSION;
  admittedDeal: IntakeResult;
  workspace: DealWorkspaceState;
  exportedAt: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function localCaseId(result: IntakeResult) {
  if (!result.deal) throw new Error("Admitted deal is missing its deal terms");
  const slug = result.deal.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deal";
  const manifestDigest = result.files.find((file) => file.name === "manifest.json" && file.sha256)?.sha256;
  const contentDigest = manifestDigest ?? result.files.filter((file) => file.sha256).sort((left, right) => left.name.localeCompare(right.name)).map((file) => file.sha256).join("");
  if (!contentDigest || !/^[a-f0-9]{64}/.test(contentDigest)) throw new Error("Admitted deal is missing its package identity");
  return `local-${slug}-${contentDigest.slice(0, 12)}`;
}

export function localScenarioContract(): WorkspaceScenarioContract {
  return {fields: {
    localGrowth: {kind: "NUMBER", min: -.99, max: 5},
    localExitMultiple: {kind: "NUMBER", min: .01, max: 100},
  }};
}

function compactMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 1, notation: "compact"}).format(cents / 100);
}

function compactPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function localWorkspaceSeed(result: IntakeResult): WorkspaceSeed {
  if (!result.deal || !result.analysis) throw new Error("A complete admitted deal is required to create its workspace contract");
  const {deal, analysis} = result;
  const snapshotId = `local:${deal.annualRevenueGrowth}:${deal.exitRevenueMultiple}:${analysis.annualizedGrossReturn}:${analysis.grossMoic}`;
  return {
    caseId: localCaseId(result),
    lockedIssueIds: analysis.tests.filter((test) => test.blocksAdvancement).map((test) => test.gateId),
    canonicalEvidence: analysis.metrics.map((metric) => ({id: metric.id, title: metric.label, displayValue: metric.display, summary: metric.meaning})),
    scenarioValues: {localGrowth: String(deal.annualRevenueGrowth), localExitMultiple: String(deal.exitRevenueMultiple)},
    issues: analysis.tests.filter((test) => test.blocksAdvancement).map((test) => ({
      id: test.gateId,
      title: test.label,
      description: test.explanation,
      owner: test.owner,
      priority: test.state === "BLOCKED" || test.state === "CONCERN" ? "HIGH" as const : "MEDIUM" as const,
      status: "OPEN" as const,
      dueDate: null,
      decisionImpact: test.explanation,
      evidenceRefs: ({
        "retention-nrr": ["ordinary-nrr"],
        "gross-margin-quality": ["gross-margin"],
        "burn-runway-quality": ["runway"],
        "customer-concentration": [],
        "cohort-completeness": ["ordinary-nrr"],
        "financing-ownership": ["ownership"],
        "data-sufficiency": ["ltm-revenue", "gross-margin", "ordinary-nrr"],
        "assumption-provenance": ["gross-moic", "annualized-return"],
      } as Record<string, string[]>)[test.gateId] ?? [],
      resolution: null,
    })),
    memoSections: [
      {sectionId: "screening", title: "Screening posture and rationale", body: result.rationale, provenance: "DETERMINISTIC_ANALYSIS", scenarioSnapshotId: snapshotId, updatedBy: "Underwriting Desk"},
      {sectionId: "economics", title: "Economics", body: `LTM revenue ${compactMoney(analysis.ltmRevenueCents)} · gross margin ${compactPercent(analysis.grossMargin)} · ${analysis.cohortElapsedMonths}-month cohort retention proxy ${compactPercent(analysis.ordinaryNrr)} · gross multiple ${analysis.grossMoic.toFixed(2)}x. The retention ratio is not annual NRR.`, provenance: "DETERMINISTIC_ANALYSIS", scenarioSnapshotId: snapshotId, updatedBy: "Underwriting Desk"},
      {sectionId: "diligence", title: "Required diligence", body: "Validate retention interval and cohort quality, cost classification, customer concentration, committed costs, cap table and assumption provenance before any IC advancement.", provenance: "ANALYST_JUDGMENT", scenarioSnapshotId: snapshotId, updatedBy: "Deal team"},
    ],
  };
}

function localIntegrityContract(result: IntakeResult) {
  return createWorkspaceIntegrityContract(localWorkspaceSeed(result), {"retention-nrr": "Policy owner"});
}

export function validateAdmittedDeal(raw: unknown): IntakeResult {
  const size = new TextEncoder().encode(JSON.stringify(raw)).byteLength;
  if (size > 12_000_000 || !record(raw) || raw.processedLocally !== true || raw.packageState !== "READY" || !record(raw.deal) || !record(raw.analysis) || !Array.isArray(raw.files) || !Array.isArray(raw.errors)) throw new Error("Admitted deal bundle is invalid");
  if (typeof raw.posture !== "string" || !["SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED", "HOLD"].includes(raw.posture)) throw new Error("Admitted deal posture is invalid");
  const deal = raw.deal;
  if (typeof deal.company !== "string" || !deal.company.trim() || deal.company.length > 200 || typeof deal.analystOwner !== "string" || !deal.analystOwner.trim() || deal.analystOwner.length > 200) throw new Error("Admitted deal identity is invalid");
  const numericDealFields = ["cashCents", "investmentCents", "preMoneyCents", "years", "annualRevenueGrowth", "exitRevenueMultiple"];
  if (numericDealFields.some((field) => typeof deal[field] !== "number" || !Number.isFinite(deal[field]))) throw new Error("Admitted deal terms are invalid");
  const analysis = raw.analysis;
  const numericAnalysisFields = ["ltmRevenueCents", "grossMargin", "ordinaryNrr", "cohortElapsedMonths", "recentNetBurnCents", "postMoneyOwnership", "terminalRevenueCents", "exitEquityCents", "grossMoic", "annualizedGrossReturn"];
  if (numericAnalysisFields.some((field) => typeof analysis[field] !== "number" || !Number.isFinite(analysis[field])) || (analysis.runwayMonths !== null && (typeof analysis.runwayMonths !== "number" || !Number.isFinite(analysis.runwayMonths)))) throw new Error("Admitted analysis is invalid");
  if (!Array.isArray(analysis.metrics) || !Array.isArray(analysis.tests) || !Array.isArray(analysis.sourcePreviews) || !record(analysis.policyProfile)) throw new Error("Admitted analysis contract is incomplete");
  assertRegisteredPolicyProfile(analysis.policyProfile as never);
  for (const file of raw.files) {
    if (!record(file) || typeof file.name !== "string" || file.name.length > 240 || typeof file.state !== "string") throw new Error("Admitted source receipt is invalid");
    if (file.sha256 !== undefined && (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256))) throw new Error("Admitted source digest is invalid");
  }
  if (!Array.isArray(raw.sourcePayloads) || raw.sourcePayloads.length < REQUIRED_FILES.length) throw new Error("Admitted deal is missing its replayable source package");
  const sourceNames = new Set<string>();
  for (const [index, payload] of raw.sourcePayloads.entries()) {
    const legacy = record(payload) && typeof payload.text === "string";
    const current = record(payload) && typeof payload.name === "string" && typeof payload.mediaType === "string" && ["UTF8", "BASE64"].includes(String(payload.encoding)) && typeof payload.content === "string";
    if ((!legacy && !current) || sourceNames.has(String(payload.name)) || new TextEncoder().encode(JSON.stringify(payload)).byteLength > 7_000_000) throw new Error(`Admitted source payload ${index} is invalid`);
    sourceNames.add(String(payload.name));
  }
  const hasLegacyPackage = REQUIRED_FILES.every((name) => sourceNames.has(name));
  const hasEvidencePackage = EVIDENCE_REQUIRED_FILES.every((name) => sourceNames.has(name));
  if (!hasLegacyPackage && !hasEvidencePackage) throw new Error("Admitted source package is incomplete");
  if (raw.baselineApproval !== null && raw.baselineApproval !== undefined) {
    const approval = raw.baselineApproval;
    if (!record(approval) || approval.version !== "V1" || typeof approval.actor !== "string" || approval.actor.trim().length < 2 || typeof approval.rationale !== "string" || approval.rationale.trim().length < 20 || typeof approval.approvedAt !== "string" || Number.isNaN(Date.parse(approval.approvedAt)) || typeof approval.packageDigest !== "string" || !/^[a-f0-9]{64}$/.test(approval.packageDigest)) throw new Error("Version 1 approval record is invalid");
    const manifestDigest = raw.files.find((file) => record(file) && file.name === "manifest.json")?.sha256;
    if (manifestDigest !== approval.packageDigest) throw new Error("Version 1 approval does not match the admitted package");
  }
  localCaseId(raw as unknown as IntakeResult);
  return structuredClone(raw) as unknown as IntakeResult;
}

async function replayAdmittedDeal(result: IntakeResult) {
  const files = result.sourcePayloads!.map((payload) => {
    const legacyText = "text" in payload ? payload.text : null;
    const current = payload as SourcePayload;
    const bytes = legacyText !== null
      ? new TextEncoder().encode(legacyText)
      : current.encoding === "BASE64"
        ? Uint8Array.from(atob(current.content), (character) => character.charCodeAt(0))
        : new TextEncoder().encode(current.content);
    const sourceText = legacyText ?? (current.encoding === "UTF8" ? current.content : "");
    return {name: payload.name, type: "mediaType" in payload ? payload.mediaType : "text/plain", size: bytes.byteLength, text: async () => sourceText, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)} as File;
  });
  const replayed = await processDealPackage(files);
  if (replayed.packageState !== "READY") throw new Error(`Portable deal source package does not replay to a complete result: ${replayed.errors.join("; ")}`);
  for (const key of ["posture", "rationale", "files", "deal", "analysis"] as const) {
    if (JSON.stringify(replayed[key]) !== JSON.stringify(result[key])) throw new Error(`Portable deal calculations do not match the replayed source package (${key})`);
  }
  return result;
}

export function persistAdmittedDeal(result: IntakeResult) {
  try {
    const validated = validateAdmittedDeal(result);
    if (!validated.baselineApproval) throw new Error("A named analyst must approve Version 1 before persistence");
    if (!window.localStorage) return false;
    const serialized = JSON.stringify(validated);
    window.localStorage.setItem(LOCAL_DEAL_KEY, serialized);
    const retained = window.localStorage.getItem(LOCAL_DEAL_KEY);
    if (retained !== serialized) throw new Error("Browser storage readback failed");
    validateAdmittedDeal(JSON.parse(retained) as unknown);
    return true;
  } catch { return false; }
}

export async function loadAdmittedDeal() {
  try {
    const value = window.localStorage?.getItem(LOCAL_DEAL_KEY);
    if (!value) return null;
    return await replayAdmittedDeal(validateAdmittedDeal(JSON.parse(value) as unknown));
  } catch { return null; }
}

export function serializeAdmittedDealBundle(result: IntakeResult, workspace: DealWorkspaceState, includePrivateNote = false) {
  const admittedDeal = validateAdmittedDeal(result);
  if (!admittedDeal.baselineApproval) throw new Error("A named analyst must approve Version 1 before export");
  const allowedEvidenceRefs = new Set(admittedDeal.analysis!.metrics.map((item) => item.id));
  const validatedWorkspace = validateWorkspace(workspace, localCaseId(admittedDeal), allowedEvidenceRefs, localScenarioContract(), localIntegrityContract(admittedDeal));
  const portableWorkspace = includePrivateNote ? validatedWorkspace : {...validatedWorkspace, privateNote: ""};
  return `${JSON.stringify({schemaVersion: ADMITTED_DEAL_BUNDLE_VERSION, admittedDeal, workspace: portableWorkspace, exportedAt: new Date().toISOString()}, null, 2)}\n`;
}

export async function validateAdmittedDealBundle(source: string): Promise<AdmittedDealBundle> {
  if (new TextEncoder().encode(source).byteLength > MAX_BUNDLE_BYTES) throw new Error("Portable deal bundle exceeds the 13 MB public-slice limit");
  const raw: unknown = JSON.parse(source);
  if (!record(raw) || raw.schemaVersion !== ADMITTED_DEAL_BUNDLE_VERSION || typeof raw.exportedAt !== "string" || Number.isNaN(Date.parse(raw.exportedAt))) throw new Error("Portable deal bundle version is unsupported");
  const admittedDeal = await replayAdmittedDeal(validateAdmittedDeal(raw.admittedDeal));
  const workspace = sanitizePortableWorkspaceImport(raw.workspace, localCaseId(admittedDeal), new Set(admittedDeal.analysis!.metrics.map((item) => item.id)), localScenarioContract(), localIntegrityContract(admittedDeal));
  return {schemaVersion: ADMITTED_DEAL_BUNDLE_VERSION, admittedDeal, workspace, exportedAt: raw.exportedAt};
}

export function installAdmittedDealBundle(bundle: AdmittedDealBundle) {
  const admittedDeal = validateAdmittedDeal(bundle.admittedDeal);
  const allowedEvidenceRefs = new Set(admittedDeal.analysis!.metrics.map((item) => item.id));
  const workspace = validateWorkspace(bundle.workspace, localCaseId(admittedDeal), allowedEvidenceRefs, localScenarioContract(), localIntegrityContract(admittedDeal));
  const storage = window.localStorage;
  if (!storage) return false;
  const workspaceStorageKey = storageKey(workspace.caseId);
  const previousDeal = storage.getItem(LOCAL_DEAL_KEY);
  const previousWorkspace = storage.getItem(workspaceStorageKey);
  try {
    storage.setItem(LOCAL_DEAL_KEY, JSON.stringify(admittedDeal));
    storage.setItem(workspaceStorageKey, JSON.stringify(workspace));
    const retainedDeal = storage.getItem(LOCAL_DEAL_KEY);
    const retainedWorkspace = storage.getItem(workspaceStorageKey);
    if (!retainedDeal || !retainedWorkspace) throw new Error("Browser storage readback failed");
    validateAdmittedDeal(JSON.parse(retainedDeal) as unknown);
    validateWorkspace(JSON.parse(retainedWorkspace) as unknown, workspace.caseId, allowedEvidenceRefs, localScenarioContract(), localIntegrityContract(admittedDeal));
    return true;
  } catch {
    if (previousDeal === null) storage.removeItem(LOCAL_DEAL_KEY); else storage.setItem(LOCAL_DEAL_KEY, previousDeal);
    if (previousWorkspace === null) storage.removeItem(workspaceStorageKey); else storage.setItem(workspaceStorageKey, previousWorkspace);
    return false;
  }
}
