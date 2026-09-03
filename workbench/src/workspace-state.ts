import {digestChallengePayloadSync, validateSelectedEvidence, type ModelProposal, type SelectedEvidence} from "./model-workflow";

export const WORKSPACE_SCHEMA = "underwriting.deal-workspace/v3" as const;
export const LEGACY_WORKSPACE_SCHEMA = "underwriting.deal-workspace/v2" as const;
const MAX_TEXT = 8_000;
const MAX_ITEMS = 200;

export type AssumptionDisposition = "UNREVIEWED" | "APPROVED" | "REJECTED";
export type IssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type IssuePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface Observation {
  id: string;
  text: string;
  kind: "ANALYST_OBSERVATION" | "MANAGEMENT_MEETING_NOTE" | "EXPERT_CALL_NOTE" | "FOUNDER_BEHAVIOR_OBSERVATION" | "COMMERCIAL_REFERENCE" | "NEGOTIATION_UPDATE";
  author: string;
  createdAt: string;
  classification: "HUMAN_OBSERVATION" | "EXTERNAL_REFERENCE";
  relatedQuestion: string;
  visibility: "PRIVATE" | "SHARED";
  reviewStatus: "UNREVIEWED" | "REVIEWED" | "DISPUTED";
  thesisEffect: "SUPPORTS" | "CHALLENGES" | "CONTEXT_ONLY" | "NO_CHANGE";
}

export interface AssumptionReview {
  assumptionId: string;
  disposition: AssumptionDisposition;
  actor: string;
  rationale: string;
  reviewedAt: string;
}
export interface AssumptionReviewEvent extends AssumptionReview {
  eventId: string;
  previousDisposition: AssumptionDisposition;
}

export interface DiligenceIssueState {
  id: string;
  title: string;
  description: string;
  owner: string;
  priority: IssuePriority;
  status: IssueStatus;
  dueDate: string | null;
  decisionImpact: string;
  evidenceRefs: string[];
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoSectionState {
  sectionId: string;
  title: string;
  body: string;
  provenance: "DETERMINISTIC_ANALYSIS" | "ANALYST_JUDGMENT" | "HUMAN_ACCEPTED_MODEL_PROPOSAL";
  sourceProposalId?: string;
  sourceProvenance?: "DETERMINISTIC_ANALYSIS" | "ANALYST_JUDGMENT" | "HUMAN_ACCEPTED_MODEL_PROPOSAL";
  sourceBody?: string;
  scenarioSnapshotId?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface PolicyOverrideState {
  eventId: string;
  gateId: string;
  disposition: "OVERRIDDEN";
  actor: string;
  actorRole: string;
  rationale: string;
  recordedAt: string;
  supersedesEventId?: string;
}

export type ChangeDisposition = "PENDING" | "ACCEPTED" | "REJECTED" | "DEFERRED";
export interface ChangeDispositionEvent {
  eventId: string;
  changeId: string;
  disposition: Exclude<ChangeDisposition, "PENDING">;
  actor: string;
  rationale: string;
  recordedAt: string;
}
export interface PackageChangeImpact {
  impactId: string;
  label: string;
  before: string;
  after: string;
  consequence: string;
  rank: number;
}
export interface PackageChangeControlState {
  changeSetId: string;
  fromVersion: string;
  toVersion: string;
  packageDigestSha256: string;
  importedAt: string;
  sourcePath: string;
  sourceLocator: string;
  changeId: string;
  changeTitle: string;
  beforeValue: string;
  afterValue: string;
  deterministicReceiptSha256: string;
  decisionConsequence: string;
  affectedAssumptionIds: string[];
  affectedIssueIds: string[];
  affectedMemoSectionIds: string[];
  impacts: PackageChangeImpact[];
  dispositionEvents: ChangeDispositionEvent[];
}

export interface DealWorkspaceState {
  schemaVersion: typeof WORKSPACE_SCHEMA;
  caseId: string;
  revision: number;
  privateNote: string;
  observations: Observation[];
  assumptionReviews: Record<string, AssumptionReview>;
  assumptionReviewEvents: AssumptionReviewEvent[];
  issues: DiligenceIssueState[];
  proposals: ModelProposal[];
  memoSections: MemoSectionState[];
  scenarioValues: Record<string, string>;
  policyOverrides: PolicyOverrideState[];
  changeControl: PackageChangeControlState | null;
  updatedAt: string;
}

export interface WorkspaceSeed {
  caseId: string;
  issues: Array<Omit<DiligenceIssueState, "createdAt" | "updatedAt" | "resolvedBy">>;
  memoSections: Array<Omit<MemoSectionState, "updatedAt">>;
  scenarioValues?: Record<string, string>;
  lockedIssueIds?: string[];
  canonicalEvidence?: SelectedEvidence[];
}

export interface WorkspaceScenarioContract {
  fields: Record<string, {kind: "ENUM"; values: readonly string[]} | {kind: "NUMBER"; min: number; max: number}>;
}

export interface WorkspaceIntegrityContract {
  requiredIssues: Array<Pick<DiligenceIssueState, "id" | "title" | "description" | "decisionImpact" | "evidenceRefs">>;
  requiredMemoSections: Array<Pick<MemoSectionState, "sectionId" | "title" | "body" | "provenance" | "updatedBy">>;
  policyOverrideRoles: Record<string, string>;
  lockedIssueIds: string[];
  canonicalEvidence: Record<string, SelectedEvidence>;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, max = MAX_TEXT) {
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} is invalid or exceeds ${max} characters`);
  return value;
}

function requiredString(value: unknown, field: string, max = MAX_TEXT) {
  const validated = boundedString(value, field, max);
  if (!validated.trim()) throw new Error(`${field} cannot be blank`);
  return validated;
}

function namedHuman(value: unknown, field: string) {
  const validated = requiredString(value, field, 120);
  if (["financial model", "underwriting desk"].includes(validated.trim().toLowerCase())) throw new Error(`${field} must name a human reviewer`);
  return validated;
}

function assertUnique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`${field} identifiers must be unique`);
}

function timestamp(value: unknown, field: string) {
  const text = boundedString(value, field, 40);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp`);
  return text;
}

function stringArray(value: unknown, field: string, maxItems = 32) {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > 120)) throw new Error(`${field} is invalid`);
  return value as string[];
}

export function storageKey(caseId: string) {
  return `underwriting-desk.workspace.v3.${caseId}`;
}

export function legacyStorageKey(caseId: string) {
  return `underwriting-desk.workspace.v2.${caseId}`;
}

export function createWorkspace(seed: WorkspaceSeed, now = new Date().toISOString()): DealWorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA,
    caseId: seed.caseId,
    revision: 1,
    privateNote: "",
    observations: [],
    assumptionReviews: {},
    assumptionReviewEvents: [],
    issues: seed.issues.map((issue) => ({...issue, resolvedBy: issue.status === "RESOLVED" ? "Underwriting Desk" : null, createdAt: now, updatedAt: now})),
    proposals: [],
    memoSections: seed.memoSections.map((section) => ({...section, updatedAt: now})),
    scenarioValues: {...seed.scenarioValues},
    policyOverrides: [],
    changeControl: null,
    updatedAt: now,
  };
}

export function createWorkspaceIntegrityContract(seed: WorkspaceSeed, policyOverrideRoles: Record<string, string> = {}): WorkspaceIntegrityContract {
  return {
    requiredIssues: seed.issues.map(({id, title, description, decisionImpact, evidenceRefs}) => ({id, title, description, decisionImpact, evidenceRefs: [...evidenceRefs]})),
    requiredMemoSections: seed.memoSections.map(({sectionId, title, body, provenance, updatedBy}) => ({sectionId, title, body, provenance, updatedBy})),
    policyOverrideRoles: {...policyOverrideRoles},
    lockedIssueIds: [...(seed.lockedIssueIds ?? [])],
    canonicalEvidence: Object.fromEntries((seed.canonicalEvidence ?? []).map((item) => [item.id, {...item}])),
  };
}

export function touchWorkspace(state: DealWorkspaceState, patch: Partial<Omit<DealWorkspaceState, "schemaVersion" | "caseId" | "revision" | "updatedAt">>, now = new Date().toISOString()): DealWorkspaceState {
  return {...state, ...patch, revision: state.revision + 1, updatedAt: now};
}

export function validateWorkspace(raw: unknown, expectedCaseId?: string, allowedEvidenceRefs?: ReadonlySet<string>, scenarioContract?: WorkspaceScenarioContract, integrityContract?: WorkspaceIntegrityContract): DealWorkspaceState {
  if (!record(raw) || raw.schemaVersion !== WORKSPACE_SCHEMA) throw new Error("Workspace file version is unsupported");
  const caseId = boundedString(raw.caseId, "caseId", 80);
  if (!caseId || (expectedCaseId && caseId !== expectedCaseId)) throw new Error("Workspace file belongs to a different deal");
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1) throw new Error("Workspace revision is invalid");
  const privateNote = boundedString(raw.privateNote, "privateNote");
  if (!Array.isArray(raw.observations) || raw.observations.length > MAX_ITEMS) throw new Error("Workspace observations are invalid");
  const observations = raw.observations.map((item, index): Observation => {
    const kinds: Observation["kind"][] = ["ANALYST_OBSERVATION", "MANAGEMENT_MEETING_NOTE", "EXPERT_CALL_NOTE", "FOUNDER_BEHAVIOR_OBSERVATION", "COMMERCIAL_REFERENCE", "NEGOTIATION_UPDATE"];
    if (!record(item) || !kinds.includes(item.kind as Observation["kind"])) throw new Error(`observations[${index}] is invalid`);
    if (!["HUMAN_OBSERVATION", "EXTERNAL_REFERENCE"].includes(String(item.classification)) || !["PRIVATE", "SHARED"].includes(String(item.visibility)) || !["UNREVIEWED", "REVIEWED", "DISPUTED"].includes(String(item.reviewStatus)) || !["SUPPORTS", "CHALLENGES", "CONTEXT_ONLY", "NO_CHANGE"].includes(String(item.thesisEffect))) throw new Error(`observations[${index}] review metadata is invalid`);
    return {id: requiredString(item.id, `observations[${index}].id`, 120), text: requiredString(item.text, `observations[${index}].text`), kind: item.kind as Observation["kind"], author: requiredString(item.author, `observations[${index}].author`, 120), createdAt: timestamp(item.createdAt, `observations[${index}].createdAt`), classification: item.classification as Observation["classification"], relatedQuestion: requiredString(item.relatedQuestion, `observations[${index}].relatedQuestion`, 400), visibility: item.visibility as Observation["visibility"], reviewStatus: item.reviewStatus as Observation["reviewStatus"], thesisEffect: item.thesisEffect as Observation["thesisEffect"]};
  });
  assertUnique(observations.map((item) => item.id), "Observation");
  if (!record(raw.assumptionReviews) || Object.keys(raw.assumptionReviews).length > MAX_ITEMS) throw new Error("Workspace assumption reviews are invalid");
  const assumptionReviews = Object.fromEntries(Object.entries(raw.assumptionReviews).map(([id, value]): [string, AssumptionReview] => {
    if (!record(value) || !["UNREVIEWED", "APPROVED", "REJECTED"].includes(String(value.disposition))) throw new Error(`assumption review ${id} is invalid`);
    const assumptionId = requiredString(value.assumptionId, `assumption review ${id}.assumptionId`, 120);
    if (id !== assumptionId) throw new Error(`assumption review ${id} key does not match its assumption identifier`);
    return [id, {assumptionId, disposition: value.disposition as AssumptionDisposition, actor: requiredString(value.actor, `assumption review ${id}.actor`, 120), rationale: requiredString(value.rationale, `assumption review ${id}.rationale`, 1200), reviewedAt: timestamp(value.reviewedAt, `assumption review ${id}.reviewedAt`)}];
  }));
  const rawReviewEvents = raw.assumptionReviewEvents === undefined ? Object.values(assumptionReviews).map((review, index) => ({...review, eventId: `migrated-${index + 1}`, previousDisposition: "UNREVIEWED"})) : raw.assumptionReviewEvents;
  if (!Array.isArray(rawReviewEvents) || rawReviewEvents.length > MAX_ITEMS) throw new Error("Workspace assumption review history is invalid");
  const assumptionReviewEvents = rawReviewEvents.map((item, index): AssumptionReviewEvent => {
    if (!record(item) || !["UNREVIEWED", "APPROVED", "REJECTED"].includes(String(item.disposition)) || !["UNREVIEWED", "APPROVED", "REJECTED"].includes(String(item.previousDisposition))) throw new Error(`assumptionReviewEvents[${index}] is invalid`);
    return {eventId: requiredString(item.eventId, `assumptionReviewEvents[${index}].eventId`, 120), assumptionId: requiredString(item.assumptionId, `assumptionReviewEvents[${index}].assumptionId`, 120), disposition: item.disposition as AssumptionDisposition, previousDisposition: item.previousDisposition as AssumptionDisposition, actor: requiredString(item.actor, `assumptionReviewEvents[${index}].actor`, 120), rationale: requiredString(item.rationale, `assumptionReviewEvents[${index}].rationale`, 1200), reviewedAt: timestamp(item.reviewedAt, `assumptionReviewEvents[${index}].reviewedAt`)};
  });
  assertUnique(assumptionReviewEvents.map((item) => item.eventId), "Assumption review event");
  const reviewChain = new Map<string, AssumptionDisposition>();
  for (const event of assumptionReviewEvents) {
    const previous = reviewChain.get(event.assumptionId) ?? "UNREVIEWED";
    if (event.previousDisposition !== previous) throw new Error(`Assumption review history for ${event.assumptionId} is inconsistent`);
    reviewChain.set(event.assumptionId, event.disposition);
  }
  for (const [id, review] of Object.entries(assumptionReviews)) if (reviewChain.get(id) !== review.disposition) throw new Error(`Current assumption review for ${id} does not match its event history`);
  for (const id of reviewChain.keys()) if (!assumptionReviews[id]) throw new Error(`Assumption review history for ${id} has no current review`);
  if (!Array.isArray(raw.issues) || raw.issues.length > MAX_ITEMS) throw new Error("Workspace issues are invalid");
  const issues = raw.issues.map((item, index): DiligenceIssueState => {
    if (!record(item) || !["OPEN", "IN_PROGRESS", "RESOLVED"].includes(String(item.status)) || !["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(String(item.priority))) throw new Error(`issues[${index}] is invalid`);
    const dueDate = item.dueDate === null ? null : boundedString(item.dueDate, `issues[${index}].dueDate`, 10);
    const resolution = item.resolution === null ? null : requiredString(item.resolution, `issues[${index}].resolution`, 2000);
    const resolvedBy = item.resolvedBy === null || item.resolvedBy === undefined ? null : requiredString(item.resolvedBy, `issues[${index}].resolvedBy`, 120);
    if (item.status === "RESOLVED" && (!resolution || !resolvedBy)) throw new Error(`issues[${index}] requires a named resolution record`);
    if (item.status !== "RESOLVED" && (resolution || resolvedBy)) throw new Error(`issues[${index}] cannot retain a resolution while unresolved`);
    return {id: requiredString(item.id, `issues[${index}].id`, 120), title: requiredString(item.title, `issues[${index}].title`, 240), description: requiredString(item.description, `issues[${index}].description`, 2000), owner: requiredString(item.owner, `issues[${index}].owner`, 120), priority: item.priority as IssuePriority, status: item.status as IssueStatus, dueDate, decisionImpact: requiredString(item.decisionImpact, `issues[${index}].decisionImpact`, 1200), evidenceRefs: stringArray(item.evidenceRefs, `issues[${index}].evidenceRefs`), resolution, resolvedBy, createdAt: timestamp(item.createdAt, `issues[${index}].createdAt`), updatedAt: timestamp(item.updatedAt, `issues[${index}].updatedAt`)};
  });
  assertUnique(issues.map((item) => item.id), "Diligence issue");
  if (integrityContract) {
    const issueById = new Map(issues.map((item) => [item.id, item]));
    for (const required of integrityContract.requiredIssues) {
      const actual = issueById.get(required.id);
      if (!actual) throw new Error(`Canonical diligence issue ${required.id} cannot be deleted`);
      if (actual.title !== required.title || actual.description !== required.description || actual.decisionImpact !== required.decisionImpact || JSON.stringify(actual.evidenceRefs) !== JSON.stringify(required.evidenceRefs)) throw new Error(`Canonical diligence issue ${required.id} has immutable source fields`);
    }
    for (const issueId of integrityContract.lockedIssueIds) {
      const actual = issueById.get(issueId);
      if (!actual || actual.status === "RESOLVED" || actual.resolution || actual.resolvedBy) throw new Error(`Quantitative hurdle ${issueId} cannot be resolved through the diligence issue log`);
    }
  }
  if (!Array.isArray(raw.proposals) || raw.proposals.length > MAX_ITEMS) throw new Error("Workspace proposals are invalid");
  const proposals = raw.proposals.map((item, index): ModelProposal => {
    if (!record(item) || !["CHALLENGE", "DILIGENCE_GAP", "MEMO_DRAFT"].includes(String(item.kind)) || !["PROPOSED", "ACCEPTED", "REJECTED"].includes(String(item.state))) throw new Error(`proposals[${index}] is invalid`);
    const state = item.state as ModelProposal["state"];
    const humanActor = item.humanActor === undefined ? undefined : namedHuman(item.humanActor, `proposals[${index}].humanActor`);
    const reviewedAt = item.reviewedAt === undefined ? undefined : timestamp(item.reviewedAt, `proposals[${index}].reviewedAt`);
    if (state !== "PROPOSED" && (!humanActor?.trim() || !reviewedAt)) throw new Error(`proposals[${index}] requires a named, timestamped human disposition`);
    const requestDigestSha256 = boundedString(item.requestDigestSha256, `proposals[${index}].requestDigestSha256`, 64);
    if (!/^[a-f0-9]{64}$/.test(requestDigestSha256)) throw new Error(`proposals[${index}] request digest is invalid`);
    if (!Array.isArray(item.requestEvidence)) throw new Error(`proposals[${index}] is missing its selected-evidence request envelope`);
    const requestEvidence = item.requestEvidence.map((candidate, evidenceIndex): SelectedEvidence => {
      if (!record(candidate)) throw new Error(`proposals[${index}].requestEvidence[${evidenceIndex}] is invalid`);
      return {id: requiredString(candidate.id, `proposals[${index}].requestEvidence[${evidenceIndex}].id`, 80), title: requiredString(candidate.title, `proposals[${index}].requestEvidence[${evidenceIndex}].title`, 160), displayValue: requiredString(candidate.displayValue, `proposals[${index}].requestEvidence[${evidenceIndex}].displayValue`, 120), summary: requiredString(candidate.summary, `proposals[${index}].requestEvidence[${evidenceIndex}].summary`, 800)};
    });
    const dealId = requiredString(item.dealId, `proposals[${index}].dealId`, 100);
    if (dealId !== caseId) throw new Error(`proposals[${index}] belongs to a different deal`);
    const origin = ["IN_PRODUCT_RUNTIME", "LOCAL_MCP_LEDGER", "PORTABLE_IMPORT_UNVERIFIED"].includes(String(item.origin)) ? item.origin as ModelProposal["origin"] : (() => {throw new Error(`proposals[${index}] origin is invalid`);})();
    try { validateSelectedEvidence(dealId, requestEvidence); }
    catch { throw new Error(`proposals[${index}] selected-evidence request envelope is invalid`); }
    if (integrityContract && Object.keys(integrityContract.canonicalEvidence).length) {
      for (const selected of requestEvidence) {
        const canonical = integrityContract.canonicalEvidence[selected.id];
        if (!canonical || JSON.stringify(selected) !== JSON.stringify(canonical)) throw new Error(`proposals[${index}] selected-evidence content does not match the canonical registry`);
      }
    }
    if (digestChallengePayloadSync(dealId, requestEvidence) !== requestDigestSha256) throw new Error(`proposals[${index}] selected-evidence request digest does not match its envelope`);
    const requestedIds = new Set(requestEvidence.map((candidate) => candidate.id));
    const evidenceRefs = stringArray(item.evidenceRefs, `proposals[${index}].evidenceRefs`, 20);
    if (evidenceRefs.some((ref) => !requestedIds.has(ref))) throw new Error(`proposals[${index}] cites evidence outside its selected request subset`);
    const responseDigestSha256 = item.responseDigestSha256 === undefined ? undefined : boundedString(item.responseDigestSha256, `proposals[${index}].responseDigestSha256`, 64);
    if (responseDigestSha256 !== undefined && !/^[a-f0-9]{64}$/.test(responseDigestSha256)) throw new Error(`proposals[${index}] response digest is invalid`);
    const severity = item.severity === undefined ? undefined : ["HIGH", "MEDIUM", "LOW"].includes(String(item.severity)) ? item.severity as ModelProposal["severity"] : (() => {throw new Error(`proposals[${index}] severity is invalid`);})();
    const sourceRequestDigestSha256 = item.sourceRequestDigestSha256 === undefined ? undefined : boundedString(item.sourceRequestDigestSha256, `proposals[${index}].sourceRequestDigestSha256`, 64);
    if (sourceRequestDigestSha256 !== undefined && !/^[a-f0-9]{64}$/.test(sourceRequestDigestSha256)) throw new Error(`proposals[${index}] source request digest is invalid`);
    const body = boundedString(item.body, `proposals[${index}].body`, 2000);
    const originalBody = item.originalBody === undefined ? undefined : boundedString(item.originalBody, `proposals[${index}].originalBody`, 2000);
    const humanEdited = item.humanEdited === undefined ? undefined : Boolean(item.humanEdited);
    if (humanEdited && (!originalBody || originalBody === body)) throw new Error(`proposals[${index}] must preserve a distinct original model draft when human-edited`);
    if (!humanEdited && originalBody !== undefined) throw new Error(`proposals[${index}] cannot claim an original draft without a human edit`);
    if (state === "PROPOSED" && (humanEdited !== undefined || originalBody !== undefined)) throw new Error(`proposals[${index}] cannot claim human editing before review`);
    const modelFamily = item.modelFamily === undefined ? undefined : boundedString(item.modelFamily, `proposals[${index}].modelFamily`, 120);
    if (origin === "IN_PRODUCT_RUNTIME" && (!responseDigestSha256 || !modelFamily)) throw new Error(`proposals[${index}] hosted runtime origin requires its response receipt`);
    if (origin === "LOCAL_MCP_LEDGER" && (!sourceRequestDigestSha256 || modelFamily !== "Local MCP ledger")) throw new Error(`proposals[${index}] local ledger origin requires its source receipt`);
    if (origin === "PORTABLE_IMPORT_UNVERIFIED" && modelFamily !== undefined) throw new Error(`proposals[${index}] portable import cannot claim a model family`);
    return {proposalId: boundedString(item.proposalId, `proposals[${index}].proposalId`, 160), kind: item.kind as ModelProposal["kind"], state, title: boundedString(item.title, `proposals[${index}].title`, 500), body, originalBody, evidenceRefs, dealId, origin, requestEvidence, requestDigestSha256, sourceRequestDigestSha256, responseDigestSha256, severity, proposedOwner: item.proposedOwner === undefined ? undefined : boundedString(item.proposedOwner, `proposals[${index}].proposedOwner`, 160), memoSection: item.memoSection === undefined ? undefined : boundedString(item.memoSection, `proposals[${index}].memoSection`, 100), humanActor, humanEdited, reviewedAt, modelFamily, limitations: item.limitations === undefined ? undefined : boundedString(item.limitations, `proposals[${index}].limitations`, 500)};
  });
  assertUnique(proposals.map((item) => item.proposalId), "Model proposal");
  if (allowedEvidenceRefs) {
    const unknownIssueRef = issues.flatMap((item) => item.evidenceRefs).find((ref) => !allowedEvidenceRefs.has(ref));
    if (unknownIssueRef) throw new Error(`Diligence issue contains non-canonical evidence reference: ${unknownIssueRef}`);
    const unknownProposalRef = proposals.flatMap((item) => item.evidenceRefs).find((ref) => !allowedEvidenceRefs.has(ref));
    if (unknownProposalRef) throw new Error(`Model proposal contains non-canonical evidence reference: ${unknownProposalRef}`);
  }
  if (!Array.isArray(raw.memoSections) || raw.memoSections.length > 32) throw new Error("Workspace memo sections are invalid");
  const memoSections = raw.memoSections.map((item, index): MemoSectionState => {
    if (!record(item) || !["DETERMINISTIC_ANALYSIS", "ANALYST_JUDGMENT", "HUMAN_ACCEPTED_MODEL_PROPOSAL"].includes(String(item.provenance))) throw new Error(`memoSections[${index}] is invalid`);
    const sourceProvenance = item.sourceProvenance === undefined ? undefined : ["DETERMINISTIC_ANALYSIS", "ANALYST_JUDGMENT", "HUMAN_ACCEPTED_MODEL_PROPOSAL"].includes(String(item.sourceProvenance)) ? item.sourceProvenance as MemoSectionState["provenance"] : (() => {throw new Error(`memoSections[${index}].sourceProvenance is invalid`);})();
    const updatedBy = boundedString(item.updatedBy, `memoSections[${index}].updatedBy`, 120);
    if (item.provenance !== "DETERMINISTIC_ANALYSIS" && ["financial model", "underwriting desk"].includes(updatedBy.trim().toLowerCase())) throw new Error(`memoSections[${index}].updatedBy must name a human reviewer`);
    return {sectionId: boundedString(item.sectionId, `memoSections[${index}].sectionId`, 120), title: boundedString(item.title, `memoSections[${index}].title`, 200), body: boundedString(item.body, `memoSections[${index}].body`), provenance: item.provenance as MemoSectionState["provenance"], sourceProposalId: item.sourceProposalId === undefined ? undefined : boundedString(item.sourceProposalId, `memoSections[${index}].sourceProposalId`, 160), sourceProvenance, sourceBody: item.sourceBody === undefined ? undefined : boundedString(item.sourceBody, `memoSections[${index}].sourceBody`), scenarioSnapshotId: item.scenarioSnapshotId === undefined ? undefined : boundedString(item.scenarioSnapshotId, `memoSections[${index}].scenarioSnapshotId`, 240), updatedBy, updatedAt: timestamp(item.updatedAt, `memoSections[${index}].updatedAt`)};
  });
  assertUnique(memoSections.map((item) => item.sectionId), "Memo section");
  if (integrityContract) {
    const requiredById = new Map(integrityContract.requiredMemoSections.map((item) => [item.sectionId, item]));
    const actualById = new Map(memoSections.map((item) => [item.sectionId, item]));
    for (const required of integrityContract.requiredMemoSections) {
      const actual = actualById.get(required.sectionId);
      if (!actual) throw new Error(`Canonical memo section ${required.sectionId} cannot be deleted`);
      if (actual.title !== required.title) throw new Error(`Canonical memo section ${required.sectionId} title is immutable`);
      if (required.provenance === "DETERMINISTIC_ANALYSIS") {
        const untouched = actual.provenance === "DETERMINISTIC_ANALYSIS" && actual.body === required.body && actual.updatedBy === required.updatedBy && actual.sourceProvenance === undefined && actual.sourceBody === undefined;
        const namedHumanRevision = actual.provenance === "ANALYST_JUDGMENT" && actual.sourceProvenance === "DETERMINISTIC_ANALYSIS" && actual.sourceBody === required.body && actual.updatedBy !== required.updatedBy;
        if (!untouched && !namedHumanRevision) throw new Error(`Memo section ${required.sectionId} cannot impersonate or rewrite deterministic analysis`);
      } else if (actual.provenance === "DETERMINISTIC_ANALYSIS") {
        throw new Error(`Memo section ${required.sectionId} cannot be elevated to deterministic analysis`);
      }
    }
    for (const section of memoSections) {
      if (!requiredById.has(section.sectionId) && section.provenance === "DETERMINISTIC_ANALYSIS") throw new Error(`Additional memo section ${section.sectionId} cannot claim deterministic analysis`);
    }
  }
  const proposalById = new Map(proposals.map((item) => [item.proposalId, item]));
  const proposalMemoRefs: string[] = [];
  for (const section of memoSections) {
    if (section.provenance === "HUMAN_ACCEPTED_MODEL_PROPOSAL") {
      const sourceProposal = section.sourceProposalId ? proposalById.get(section.sourceProposalId) : undefined;
      if (!sourceProposal || sourceProposal.state !== "ACCEPTED") throw new Error(`Memo section ${section.sectionId} does not reference an accepted model proposal`);
      if (section.body !== sourceProposal.body || section.sourceProvenance !== undefined || section.sourceBody !== undefined) throw new Error(`Memo section ${section.sectionId} does not preserve its accepted proposal text`);
      proposalMemoRefs.push(sourceProposal.proposalId);
    } else if (section.sourceProposalId) {
      const sourceProposal = proposalById.get(section.sourceProposalId);
      const validHumanRevision = section.provenance === "ANALYST_JUDGMENT" && section.sourceProvenance === "HUMAN_ACCEPTED_MODEL_PROPOSAL" && section.sourceBody === sourceProposal?.body && sourceProposal?.state === "ACCEPTED";
      if (!validHumanRevision) throw new Error(`Memo section ${section.sectionId} has invalid edited-model provenance`);
      proposalMemoRefs.push(section.sourceProposalId);
    }
  }
  assertUnique(proposalMemoRefs, "Memo source proposal");
  if (!record(raw.scenarioValues) || Object.keys(raw.scenarioValues).length > 64 || Object.values(raw.scenarioValues).some((item) => typeof item !== "string" || item.length > 120)) throw new Error("Workspace scenario values are invalid");
  if (scenarioContract) {
    const actualKeys = Object.keys(raw.scenarioValues).sort();
    const allowedKeys = Object.keys(scenarioContract.fields).sort();
    if (actualKeys.length !== allowedKeys.length || actualKeys.some((key, index) => key !== allowedKeys[index])) throw new Error("Workspace scenario keys do not match the deal contract");
    for (const [key, field] of Object.entries(scenarioContract.fields)) {
      const value = raw.scenarioValues[key] as string;
      if (field.kind === "ENUM" ? !field.values.includes(value) : !Number.isFinite(Number(value)) || Number(value) < field.min || Number(value) > field.max) throw new Error(`Workspace scenario value for ${key} is outside the deal contract`);
    }
  }
  if (!Array.isArray(raw.policyOverrides) || raw.policyOverrides.length > 32) throw new Error("Workspace policy overrides are invalid");
  const policyOverrides = raw.policyOverrides.map((item, index): PolicyOverrideState => {
    if (!record(item) || item.disposition !== "OVERRIDDEN") throw new Error(`policyOverrides[${index}] is invalid`);
    return {eventId: item.eventId === undefined ? `migrated-policy-${index + 1}` : requiredString(item.eventId, `policyOverrides[${index}].eventId`, 120), gateId: requiredString(item.gateId, `policyOverrides[${index}].gateId`, 120), disposition: "OVERRIDDEN", actor: requiredString(item.actor, `policyOverrides[${index}].actor`, 120), actorRole: requiredString(item.actorRole, `policyOverrides[${index}].actorRole`, 120), rationale: requiredString(item.rationale, `policyOverrides[${index}].rationale`, 2000), recordedAt: timestamp(item.recordedAt, `policyOverrides[${index}].recordedAt`), supersedesEventId: item.supersedesEventId === undefined ? undefined : requiredString(item.supersedesEventId, `policyOverrides[${index}].supersedesEventId`, 120)};
  });
  assertUnique(policyOverrides.map((item) => item.eventId), "Policy override event");
  const priorEvents = new Set<string>();
  for (const event of policyOverrides) {
    if (event.supersedesEventId && !priorEvents.has(event.supersedesEventId)) throw new Error(`Policy override ${event.eventId} supersedes an unknown or later event`);
    const priorForGate = [...policyOverrides].slice(0, policyOverrides.indexOf(event)).filter((item) => item.gateId === event.gateId).at(-1);
    if (priorForGate && event.supersedesEventId !== priorForGate.eventId) throw new Error(`Policy override history for ${event.gateId} is inconsistent`);
    if (!priorForGate && event.supersedesEventId) throw new Error(`First policy override for ${event.gateId} cannot supersede another event`);
    priorEvents.add(event.eventId);
  }
  if (integrityContract) {
    for (const event of policyOverrides) {
      const requiredRole = integrityContract.policyOverrideRoles[event.gateId];
      if (!requiredRole) throw new Error(`Policy gate ${event.gateId} is not eligible for an imported override`);
      if (event.actorRole !== requiredRole) throw new Error(`Policy override for ${event.gateId} requires the ${requiredRole} role`);
    }
  }
  const rawChangeControl = raw.changeControl === undefined ? null : raw.changeControl;
  let changeControl: PackageChangeControlState | null = null;
  if (rawChangeControl !== null) {
    if (!record(rawChangeControl) || !Array.isArray(rawChangeControl.impacts) || rawChangeControl.impacts.length < 1 || rawChangeControl.impacts.length > 20 || !Array.isArray(rawChangeControl.dispositionEvents) || rawChangeControl.dispositionEvents.length > 50) throw new Error("Workspace change-control record is invalid");
    const changeId = requiredString(rawChangeControl.changeId, "changeControl.changeId", 120);
    const impacts = rawChangeControl.impacts.map((item, index): PackageChangeImpact => {
      if (!record(item) || !Number.isSafeInteger(item.rank) || Number(item.rank) < 1) throw new Error(`changeControl.impacts[${index}] is invalid`);
      return {impactId: requiredString(item.impactId, `changeControl.impacts[${index}].impactId`, 120), label: requiredString(item.label, `changeControl.impacts[${index}].label`, 200), before: requiredString(item.before, `changeControl.impacts[${index}].before`, 120), after: requiredString(item.after, `changeControl.impacts[${index}].after`, 120), consequence: requiredString(item.consequence, `changeControl.impacts[${index}].consequence`, 1200), rank: Number(item.rank)};
    });
    assertUnique(impacts.map((item) => item.impactId), "Change impact");
    const dispositionEvents = rawChangeControl.dispositionEvents.map((item, index): ChangeDispositionEvent => {
      if (!record(item) || !["ACCEPTED", "REJECTED", "DEFERRED"].includes(String(item.disposition))) throw new Error(`changeControl.dispositionEvents[${index}] is invalid`);
      if (requiredString(item.changeId, `changeControl.dispositionEvents[${index}].changeId`, 120) !== changeId) throw new Error("Change disposition belongs to a different change");
      return {eventId: requiredString(item.eventId, `changeControl.dispositionEvents[${index}].eventId`, 120), changeId, disposition: item.disposition as ChangeDispositionEvent["disposition"], actor: namedHuman(item.actor, `changeControl.dispositionEvents[${index}].actor`), rationale: requiredString(item.rationale, `changeControl.dispositionEvents[${index}].rationale`, 1200), recordedAt: timestamp(item.recordedAt, `changeControl.dispositionEvents[${index}].recordedAt`)};
    });
    assertUnique(dispositionEvents.map((item) => item.eventId), "Change disposition event");
    const digest = requiredString(rawChangeControl.packageDigestSha256, "changeControl.packageDigestSha256", 64);
    const receipt = requiredString(rawChangeControl.deterministicReceiptSha256, "changeControl.deterministicReceiptSha256", 64);
    if (!/^[a-f0-9]{64}$/.test(digest) || !/^[a-f0-9]{64}$/.test(receipt)) throw new Error("Change-control receipt is invalid");
    changeControl = {changeSetId: requiredString(rawChangeControl.changeSetId, "changeControl.changeSetId", 120), fromVersion: requiredString(rawChangeControl.fromVersion, "changeControl.fromVersion", 80), toVersion: requiredString(rawChangeControl.toVersion, "changeControl.toVersion", 80), packageDigestSha256: digest, importedAt: timestamp(rawChangeControl.importedAt, "changeControl.importedAt"), sourcePath: requiredString(rawChangeControl.sourcePath, "changeControl.sourcePath", 240), sourceLocator: requiredString(rawChangeControl.sourceLocator, "changeControl.sourceLocator", 240), changeId, changeTitle: requiredString(rawChangeControl.changeTitle, "changeControl.changeTitle", 240), beforeValue: requiredString(rawChangeControl.beforeValue, "changeControl.beforeValue", 120), afterValue: requiredString(rawChangeControl.afterValue, "changeControl.afterValue", 120), deterministicReceiptSha256: receipt, decisionConsequence: requiredString(rawChangeControl.decisionConsequence, "changeControl.decisionConsequence", 1200), affectedAssumptionIds: stringArray(rawChangeControl.affectedAssumptionIds, "changeControl.affectedAssumptionIds", 20), affectedIssueIds: stringArray(rawChangeControl.affectedIssueIds, "changeControl.affectedIssueIds", 20), affectedMemoSectionIds: stringArray(rawChangeControl.affectedMemoSectionIds, "changeControl.affectedMemoSectionIds", 20), impacts, dispositionEvents};
  }
  return {schemaVersion: WORKSPACE_SCHEMA, caseId, revision: Number(raw.revision), privateNote, observations, assumptionReviews, assumptionReviewEvents, issues, proposals, memoSections, scenarioValues: raw.scenarioValues as Record<string, string>, policyOverrides, changeControl, updatedAt: timestamp(raw.updatedAt, "updatedAt")};
}

export function migrateWorkspaceCandidate(raw: unknown): unknown {
  if (!record(raw) || raw.schemaVersion !== LEGACY_WORKSPACE_SCHEMA) return raw;
  const observations = Array.isArray(raw.observations) ? raw.observations.map((item) => {
    if (!record(item)) return item;
    const kind = item.kind === "INVESTMENT_OBSERVATION" ? "ANALYST_OBSERVATION" : item.kind;
    return {
      ...item,
      kind,
      classification: kind === "COMMERCIAL_REFERENCE" ? "EXTERNAL_REFERENCE" : "HUMAN_OBSERVATION",
      relatedQuestion: "General investment thesis",
      visibility: "PRIVATE",
      reviewStatus: "UNREVIEWED",
      thesisEffect: "CONTEXT_ONLY",
    };
  }) : raw.observations;
  return {...raw, schemaVersion: WORKSPACE_SCHEMA, observations};
}

export function sanitizePortableWorkspaceImport(raw: unknown, expectedCaseId: string, allowedEvidenceRefs?: ReadonlySet<string>, scenarioContract?: WorkspaceScenarioContract, integrityContract?: WorkspaceIntegrityContract) {
  const validated = validateWorkspace(migrateWorkspaceCandidate(raw), expectedCaseId, allowedEvidenceRefs, scenarioContract, integrityContract);
  const proposals = validated.proposals.map((proposal): ModelProposal => ({
    ...proposal,
    origin: "PORTABLE_IMPORT_UNVERIFIED",
    modelFamily: undefined,
    limitations: "Imported portable state preserves the proposal and named human disposition, but does not authenticate the original model or provider.",
  }));
  // A portable file can preserve work product, but it cannot authenticate the
  // model provider or a policy owner's authority. Policy exceptions therefore
  // require a fresh, named action in the receiving browser.
  return validateWorkspace({...validated, proposals, policyOverrides: []}, expectedCaseId, allowedEvidenceRefs, scenarioContract, integrityContract);
}

export function loadWorkspaceResult(caseId: string, fallback: DealWorkspaceState, allowedEvidenceRefs?: ReadonlySet<string>, scenarioContract?: WorkspaceScenarioContract, integrityContract?: WorkspaceIntegrityContract) {
  let rejectedRaw: string | null = null;
  let rejectedKey = storageKey(caseId);
  try {
    const current = window.localStorage?.getItem(storageKey(caseId));
    if (current) {
      rejectedRaw = current;
      return {state: validateWorkspace(JSON.parse(current) as unknown, caseId, allowedEvidenceRefs, scenarioContract, integrityContract), notice: null as string | null, recovery: null as WorkspaceRecoveryPreview | null};
    }
    const legacy = window.localStorage?.getItem(legacyStorageKey(caseId));
    if (!legacy) return {state: fallback, notice: null as string | null, recovery: null as WorkspaceRecoveryPreview | null};
    rejectedRaw = legacy;
    rejectedKey = legacyStorageKey(caseId);
    const migrated = validateWorkspace(migrateWorkspaceCandidate(JSON.parse(legacy) as unknown), caseId, allowedEvidenceRefs, scenarioContract, integrityContract);
    window.localStorage?.setItem(storageKey(caseId), JSON.stringify(migrated));
    return {state: migrated, notice: null as string | null, recovery: null as WorkspaceRecoveryPreview | null};
  } catch {
    return {state: fallback, notice: "Saved workspace failed validation and was not loaded. Review or download the rejected state before starting fresh.", recovery: rejectedRaw ? recoveryPreview(rejectedKey, rejectedRaw) : null};
  }
}

export interface WorkspaceRecoveryPreview {
  storageKey: string;
  bytes: number;
  declaredSchema: string;
  raw: string;
}

function recoveryPreview(key: string, raw: string): WorkspaceRecoveryPreview {
  let declaredSchema = "Unreadable JSON";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (record(parsed) && typeof parsed.schemaVersion === "string") declaredSchema = parsed.schemaVersion;
  } catch {
    // The raw bytes remain downloadable even when JSON parsing fails.
  }
  return {storageKey: key, bytes: new TextEncoder().encode(raw).byteLength, declaredSchema, raw};
}

export function loadWorkspace(caseId: string, fallback: DealWorkspaceState, allowedEvidenceRefs?: ReadonlySet<string>, scenarioContract?: WorkspaceScenarioContract, integrityContract?: WorkspaceIntegrityContract) {
  return loadWorkspaceResult(caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract).state;
}

export function persistWorkspace(state: DealWorkspaceState, allowedEvidenceRefs?: ReadonlySet<string>, scenarioContract?: WorkspaceScenarioContract, integrityContract?: WorkspaceIntegrityContract) {
  try {
    if (!window.localStorage) return false;
    window.localStorage.setItem(storageKey(state.caseId), JSON.stringify(validateWorkspace(state, state.caseId, allowedEvidenceRefs, scenarioContract, integrityContract)));
    return true;
  } catch {
    // The public demonstration remains usable in memory when browser storage is unavailable.
    return false;
  }
}

export function serializeWorkspace(state: DealWorkspaceState, includePrivateNote = false, allowedEvidenceRefs?: ReadonlySet<string>, scenarioContract?: WorkspaceScenarioContract, integrityContract?: WorkspaceIntegrityContract) {
  const validated = validateWorkspace(state, state.caseId, allowedEvidenceRefs, scenarioContract, integrityContract);
  return `${JSON.stringify(includePrivateNote ? validated : {...validated, privateNote: ""}, null, 2)}\n`;
}
