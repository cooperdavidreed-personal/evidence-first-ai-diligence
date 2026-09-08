import {digestTextSync} from "./model-workflow";
import "./committee-review.css";
import {ReviewTable} from "./review-table";
import {committeeExportBlock, createCommitteeSnapshot} from "./committee-snapshot";
import "./review-workflow.css";
import {LocalWorkspaceSession, LocalWorkspaceRejected, usesLocalWorkstation} from "./local-workspace";
import {useEffect, useMemo, useRef, useState} from "react";
import type {ModelProposal} from "./model-workflow";
import type {PolicyProfile} from "./policy";
import type {ScenarioMemoSummary} from "./financial-workspace";
import {
  createWorkspace,
  createWorkspaceIntegrityContract,
  loadWorkspaceResult,
  persistWorkspace,
  sanitizePortableWorkspaceImport,
  serializeWorkspace,
  touchWorkspace,
  validateWorkspace,
  type AssumptionDisposition,
  type DealWorkspaceState,
  type IssuePriority,
  type IssueStatus,
  type WorkspaceScenarioContract,
  type WorkspaceRecoveryPreview,
  type WorkspaceSeed,
} from "./workspace-state";

export interface AssumptionDefinition {
  id: string;
  label: string;
  value: string;
  owner: string;
  basis: string;
  consequence: string;
  status: string;
}

type WorkspacePatch = Partial<Omit<DealWorkspaceState, "schemaVersion" | "caseId" | "revision" | "updatedAt">>;
export type WorkspaceUpdate = (patch: WorkspacePatch | ((current: DealWorkspaceState) => WorkspacePatch)) => void;
const EMPTY_POLICY_OVERRIDE_ROLES: Record<string, string> = {};

export function formatHumanDate(value: string | null | undefined) {
  if (!value) return "Not reviewed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}).format(date);
}

export function useDealWorkspace(seed: WorkspaceSeed, allowedEvidenceRefs: ReadonlySet<string>, scenarioContract: WorkspaceScenarioContract, policyOverrideRoles: Record<string, string> = EMPTY_POLICY_OVERRIDE_ROLES, integritySeed: WorkspaceSeed = seed) {
  const fallback = useMemo(() => createWorkspace(seed), [seed]);
  const integrityContract = useMemo(() => createWorkspaceIntegrityContract(integritySeed, policyOverrideRoles), [integritySeed, policyOverrideRoles]);
  const initialLoad = useMemo(() => loadWorkspaceResult(seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract), [seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract]);
  const [state, setState] = useState<DealWorkspaceState>(() => initialLoad.state);
  const [loadNotice, setLoadNotice] = useState<string | null>(() => initialLoad.notice);
  const [recovery, setRecovery] = useState<WorkspaceRecoveryPreview | null>(() => initialLoad.recovery);
  const localMode = usesLocalWorkstation();
  const [saveNotice, setSaveNotice] = useState(localMode ? "Loading local workstation · editing paused" : "Saved locally");
  const session = useRef<LocalWorkspaceSession | null>(null);
  const ready = useRef(!localMode);
  const [hydrated, setHydrated] = useState(!localMode);
  const savedState = useRef<DealWorkspaceState | null>(null);

  useEffect(() => {
    const loaded = loadWorkspaceResult(seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract);
    setState(loaded.state); setLoadNotice(loaded.notice); setRecovery(loaded.recovery);
    ready.current = !localMode; setHydrated(!localMode);
    if (!localMode) return;
    setLoadNotice(null); setSaveNotice("Loading local workstation · editing paused");
    const current = new LocalWorkspaceSession(seed.caseId, raw => validateWorkspace(raw, seed.caseId, allowedEvidenceRefs, scenarioContract, integrityContract));
    session.current = current;
    let active = true;
    current.hydrate(loaded.state, !loaded.notice).then(next => {
      if (!active) return;
      savedState.current = next; setState(next); setRecovery(null); setLoadNotice(null);
      ready.current = true; setHydrated(true); setSaveNotice("Saved to local workstation");
    }).catch(error => {
      if (!active) return;
      const raw = JSON.stringify(error instanceof LocalWorkspaceRejected ? error.raw : loaded.state);
      setRecovery({storageKey: "local-workstation-recovery", raw, bytes: new TextEncoder().encode(raw).byteLength, declaredSchema: loaded.state.schemaVersion});
      setLoadNotice(error instanceof Error ? error.message : "Local workstation unavailable. Reload this page to recover.");
    });
    return () => {active = false; ready.current = false; current.close(); if (session.current === current) session.current = null;};
  }, [seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract, localMode]);
  useEffect(() => {
    if (loadNotice || !ready.current || !hydrated) return;
    if (!localMode) {
      setSaveNotice(persistWorkspace(state, allowedEvidenceRefs, scenarioContract, integrityContract) ? "Saved locally" : "In memory · local save unavailable"); return;
    }
    if (savedState.current === state) return;
    savedState.current = state;
    const current = session.current;
    if (!current) return;
    setSaveNotice("Saving to local workstation…");
    current.save(state).then(() => {
      if (session.current === current && ready.current && savedState.current === state) setSaveNotice("Saved to local workstation");
    }).catch(error => {
      if (session.current !== current) return;
      ready.current = false; setHydrated(false);
      const raw = JSON.stringify(savedState.current ?? state);
      setRecovery({storageKey: "local-workstation-recovery", raw, bytes: new TextEncoder().encode(raw).byteLength, declaredSchema: state.schemaVersion});
      setLoadNotice(error instanceof Error ? error.message : "Local workstation save failed. Reload this page to recover.");
    });
  }, [allowedEvidenceRefs, scenarioContract, integrityContract, loadNotice, state, hydrated, localMode]);

  useEffect(() => {
    if (!localMode) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!session.current?.hasUnsavedWork) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [localMode]);

  const update: WorkspaceUpdate = (patch) => {
    if (recovery || !ready.current) return;
    setLoadNotice(null);
    setState((current) => {
      const next = touchWorkspace(current, typeof patch === "function" ? patch(current) : patch);
      return validateWorkspace(next, seed.caseId, allowedEvidenceRefs, scenarioContract, integrityContract);
    });
  };
  // Await a validated durable save before a source promotion unmounts this workspace.
  const saveNow = async (patch: WorkspacePatch) => {
    if (recovery || !ready.current || !hydrated) throw new Error("Workspace is not ready to save. Resolve recovery before accepting evidence.");
    const next=validateWorkspace(touchWorkspace(state,patch),seed.caseId,allowedEvidenceRefs,scenarioContract,integrityContract);
    if (!localMode) {
      if (!persistWorkspace(next,allowedEvidenceRefs,scenarioContract,integrityContract)) throw new Error("Workspace save failed; no source promotion was selected.");
      setState(next);setSaveNotice("Saved locally");return;
    }
    const current=session.current;
    if (!current) throw new Error("Workspace session unavailable.");
    savedState.current=next;setState(next);setHydrated(false);setSaveNotice("Saving to local workstation…");
    try {await current.save(next);setHydrated(true);setSaveNotice("Saved to local workstation");}
    catch(error) {
      ready.current=false;setHydrated(false);
      const raw=JSON.stringify(next);
      setRecovery({storageKey:"local-workstation-recovery",raw,bytes:new TextEncoder().encode(raw).byteLength,declaredSchema:next.schemaVersion});
      setLoadNotice(error instanceof Error?error.message:"Save failed; resolve recovery before promotion.");
      throw error;
    }
  };
  const replace = (next: DealWorkspaceState) => {
    if (localMode && (!ready.current || recovery)) return;
    setState(validateWorkspace(next, seed.caseId, allowedEvidenceRefs, scenarioContract, integrityContract));
    setLoadNotice(null); setRecovery(null);
    setSaveNotice(localMode ? "Saving to local workstation…" : "Imported and saved locally");
  };
  const discardRejectedState = () => {
    if (localMode) {window.location.reload(); return;}
    if (recovery) window.localStorage?.removeItem(recovery.storageKey);
    setState(fallback); setRecovery(null); setLoadNotice(null);
    setSaveNotice("Fresh workspace created locally");
  };
  return {state, update, saveNow, replace, storageNotice: loadNotice ?? saveNotice, recovery, discardRejectedState, integrityContract, editingPaused: !hydrated};
}

export function WorkspaceRecovery({recovery, onStartFresh}: {recovery: WorkspaceRecoveryPreview; onStartFresh: () => void}) {
  const workstation = recovery.storageKey.startsWith("local-workstation");
  const download = () => {
    const url = URL.createObjectURL(new Blob([recovery.raw], {type: "application/json"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "underwriting-desk-rejected-workspace.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="workspace-recovery" aria-labelledby="workspace-recovery-heading"><div><p className="eyebrow">Recovery preview</p><h2 id="workspace-recovery-heading">The saved workspace was not changed</h2><p>The Desk rejected {recovery.bytes.toLocaleString()} bytes declared as <strong>{recovery.declaredSchema}</strong>. {workstation ? "Download this copy before reloading. The local workstation record has not been replaced." : "Download the original state for inspection, or start a clean workspace from the unchanged canonical case."}</p></div><div><button type="button" onClick={download}>Download rejected state</button><button type="button" className="secondary-button" onClick={onStartFresh}>{workstation ? "Reload workstation" : "Start fresh"}</button></div></section>;
}

export function ObservationComposer({state, update}: {state: DealWorkspaceState; update: WorkspaceUpdate}) {
  const [draft, setDraft] = useState("");
  const [author, setAuthor] = useState("");
  const [kind, setKind] = useState<DealWorkspaceState["observations"][number]["kind"]>("ANALYST_OBSERVATION");
  const [relatedQuestion, setRelatedQuestion] = useState("General investment thesis");
  const [visibility, setVisibility] = useState<DealWorkspaceState["observations"][number]["visibility"]>("PRIVATE");
  const [reviewStatus, setReviewStatus] = useState<DealWorkspaceState["observations"][number]["reviewStatus"]>("UNREVIEWED");
  const [thesisEffect, setThesisEffect] = useState<DealWorkspaceState["observations"][number]["thesisEffect"]>("CONTEXT_ONLY");
  const add = () => {
    const text = draft.trim(), namedAuthor = author.trim(), question = relatedQuestion.trim();
    if (!text || !namedAuthor || !question) return;
    update({observations: [...state.observations, {id: crypto.randomUUID(), text, kind, author: namedAuthor, createdAt: new Date().toISOString(), classification: kind === "COMMERCIAL_REFERENCE" ? "EXTERNAL_REFERENCE" : "HUMAN_OBSERVATION", relatedQuestion: question, visibility, reviewStatus, thesisEffect}]});
    setDraft("");
  };
  return <section className="workspace-card observation-workspace" aria-labelledby="observations-heading">
    <div className="section-heading"><div><p className="eyebrow">Named human judgment</p><h2 id="observations-heading">Analyst notes &amp; observations</h2></div><span>{state.observations.length} recorded · kept outside the calculated record</span></div>
    <label><span>Private analyst note<small>Excluded from exports unless you opt in</small></span><textarea aria-label="Private analyst note" maxLength={8000} value={state.privateNote} onChange={(event) => update({privateNote: event.target.value})} placeholder="Record the unresolved judgment or contradiction that matters." /></label>
    <div className="observation-form"><label><span>Entry type</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="ANALYST_OBSERVATION">Analyst observation</option><option value="MANAGEMENT_MEETING_NOTE">Management meeting note</option><option value="EXPERT_CALL_NOTE">Expert call note</option><option value="FOUNDER_BEHAVIOR_OBSERVATION">Founder or CEO observation</option><option value="COMMERCIAL_REFERENCE">Commercial reference</option><option value="NEGOTIATION_UPDATE">Negotiation update</option></select></label><label><span>Author</span><input value={author} maxLength={120} onChange={(event) => setAuthor(event.target.value)} placeholder="Your name" /></label><label><span>Related question or issue</span><input value={relatedQuestion} maxLength={400} onChange={(event) => setRelatedQuestion(event.target.value)} /></label><label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="PRIVATE">Private</option><option value="SHARED">Shared</option></select></label><label><span>Review status</span><select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as typeof reviewStatus)}><option value="UNREVIEWED">Unreviewed</option><option value="REVIEWED">Reviewed</option><option value="DISPUTED">Disputed</option></select></label><label><span>Effect on thesis</span><select value={thesisEffect} onChange={(event) => setThesisEffect(event.target.value as typeof thesisEffect)}><option value="CONTEXT_ONLY">Context only</option><option value="SUPPORTS">Supports</option><option value="CHALLENGES">Challenges</option><option value="NO_CHANGE">No change</option></select></label></div>
    <label><span>New observation<small>Attributed, dated, and never merged into a calculation</small></span><textarea aria-label="New observation" maxLength={8000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What did the source record or the analysis miss?" /></label>
    <button className="secondary-button" type="button" onClick={add} disabled={!draft.trim() || !author.trim() || !relatedQuestion.trim()}>Add observation</button>
    {state.observations.length ? <ol className="activity-list">{[...state.observations].reverse().map((item) => <li key={item.id}><p>{item.text}</p><small>{item.kind.toLowerCase().replaceAll("_", " ")} · {item.author} · {formatHumanDate(item.createdAt)}</small><small>{item.relatedQuestion} · {item.visibility.toLowerCase()} · {item.reviewStatus.toLowerCase()} · {item.thesisEffect.toLowerCase().replaceAll("_", " ")}</small></li>)}</ol> : <p className="empty-copy">No qualitative observations recorded yet.</p>}
  </section>;
}

export function AssumptionRegistry({assumptions, state, update, staleAssumptionIds = [], staleSince}: {assumptions: AssumptionDefinition[]; state: DealWorkspaceState; update: WorkspaceUpdate; staleAssumptionIds?: string[]; staleSince?: string}) {
  const [actor, setActor] = useState("");
  const [rationale, setRationale] = useState("");
  const decide = (assumptionId: string, disposition: Exclude<AssumptionDisposition, "UNREVIEWED">) => {
    if (!actor.trim() || rationale.trim().length < 12) return;
    const previousDisposition = state.assumptionReviews[assumptionId]?.disposition ?? "UNREVIEWED";
    const review = {assumptionId, disposition, actor: actor.trim(), rationale: rationale.trim(), reviewedAt: new Date().toISOString()};
    update({assumptionReviews: {...state.assumptionReviews, [assumptionId]: review}, assumptionReviewEvents: [...state.assumptionReviewEvents, {...review, eventId: crypto.randomUUID(), previousDisposition}]});
    setRationale("");
  };
  return <section className="workspace-card assumption-registry" aria-labelledby="assumption-registry-heading">
    <div className="section-heading"><div><p className="eyebrow">Approval registry</p><h2 id="assumption-registry-heading">Material assumptions</h2></div><span>Human disposition only</span></div>
    <p className="section-intro">Approval records judgment about an input. It does not alter the canonical case or authorize an investment.</p>
    <div className="reviewer-fields"><label><span>Reviewer</span><input value={actor} maxLength={120} onChange={(event) => setActor(event.target.value)} placeholder="Named reviewer" /></label><label><span>Review rationale</span><input value={rationale} maxLength={1200} onChange={(event) => setRationale(event.target.value)} placeholder="Why accept or reject this assumption?" /></label></div>
    <div className="registry-table" role="list" aria-label="Material assumption registry">
      {assumptions.map((assumption) => {
        const review = state.assumptionReviews[assumption.id];
        const stale = staleAssumptionIds.includes(assumption.id) && (!review || !staleSince || new Date(review.reviewedAt).getTime() < new Date(staleSince).getTime());
        const disposition = stale ? "STALE" : review?.disposition ?? "UNREVIEWED";
        return <article role="listitem" key={assumption.id} data-stale={stale || undefined}><div><strong>{assumption.label}</strong><span>{assumption.basis} · {assumption.owner}</span><p>{assumption.consequence}</p>{stale ? <small>Reapproval required because the revised package changed a decision input.</small> : review ? <small>{review.rationale} · {review.actor} · {formatHumanDate(review.reviewedAt)}</small> : null}</div><b>{assumption.value}</b><span className={`status status-${disposition.toLowerCase()}`}>{stale ? "stale · reapproval required" : disposition.toLowerCase()}</span><div className="row-actions"><button type="button" onClick={() => decide(assumption.id, "APPROVED")} disabled={!actor.trim() || rationale.trim().length < 12}>Approve</button><button type="button" onClick={() => decide(assumption.id, "REJECTED")} disabled={!actor.trim() || rationale.trim().length < 12}>Reject</button></div></article>;
      })}
    </div>
  </section>;
}

export function PolicyRegistry({profile, state, update, blockingGates = [], overridableGateIds = []}: {profile: PolicyProfile; state: DealWorkspaceState; update: WorkspaceUpdate; blockingGates?: Array<{gateId: string; label: string}>; overridableGateIds?: string[]}) {
  const overridable = blockingGates.filter((gate) => overridableGateIds.includes(gate.gateId));
  const [gateId, setGateId] = useState(overridable[0]?.gateId ?? "");
  const [actor, setActor] = useState("");
  const [rationale, setRationale] = useState("");
  useEffect(() => {
    if (!overridable.some((gate) => gate.gateId === gateId)) setGateId(overridable[0]?.gateId ?? "");
  }, [overridable, gateId]);
  const recordOverride = () => {
    if (!overridable.some((gate) => gate.gateId === gateId) || !actor.trim() || rationale.trim().length < 20) return;
    const previous = state.policyOverrides.filter((item) => item.gateId === gateId).at(-1);
    update({policyOverrides: [...state.policyOverrides, {eventId: crypto.randomUUID(), gateId, disposition: "OVERRIDDEN", actor: actor.trim(), actorRole: profile.ownerRole, rationale: rationale.trim(), recordedAt: new Date().toISOString(), supersedesEventId: previous?.eventId}]});
    setRationale("");
  };
  return <section className="workspace-card policy-registry" aria-labelledby="policy-registry-heading">
    <div className="section-heading"><div><p className="eyebrow">Fund-owned policy</p><h2 id="policy-registry-heading">Screening policy</h2></div><span>{profile.status.toLowerCase()} · {formatHumanDate(profile.lastReviewed)}</span></div>
    <p className="section-intro">{profile.name} is owned by {profile.owner}. It is stored by the Desk, outside the company package. Package-requested hurdles never grade the deal.</p>
    <div className="registry-table" role="list" aria-label="Policy threshold registry">{profile.thresholds.map((threshold) => <article role="listitem" key={threshold.thresholdId}><div><strong>{threshold.label}</strong><span>{threshold.owner} · {threshold.ownerRole}</span><p>{threshold.rationale}</p></div><b>{threshold.operator} {threshold.displayValue.replace(" maximum", "")}</b><span className={`status status-${threshold.status.toLowerCase()}`}>{threshold.status.toLowerCase()}</span><small>{threshold.source === "DESK_DEFAULT_UNREVIEWED" ? "Desk default · not reviewed" : threshold.source}<br />Last review: {formatHumanDate(threshold.lastReviewed)}</small></article>)}</div>
    {overridable.length ? <details className="policy-override"><summary>Record a policy-owner override</summary><p>Only a gate explicitly designated as policy-overridable can receive an exception. Missing evidence and diligence-quality gates remain blocking. The record does not rewrite the observed result or canonical calculation.</p><p><strong>Public-demo boundary:</strong> names and roles are self-declared in this browser. No identity or delegated authority is authenticated.</p><div className="reviewer-fields"><label><span>Overridable policy gate</span><select value={gateId} onChange={(event) => setGateId(event.target.value)}>{overridable.map((gate) => <option key={gate.gateId} value={gate.gateId}>{gate.label}</option>)}</select></label><label><span>Authorized {profile.ownerRole.toLowerCase()}</span><input value={actor} maxLength={120} onChange={(event) => setActor(event.target.value)} placeholder="Named policy owner" /></label><label className="wide"><span>Override rationale</span><input value={rationale} maxLength={2000} onChange={(event) => setRationale(event.target.value)} placeholder="Why is this exception appropriate despite the observed gate?" /></label></div><button type="button" className="secondary-button" onClick={recordOverride} disabled={!gateId || !actor.trim() || rationale.trim().length < 20}>Record override</button></details> : <p className="section-intro">No unresolved gate in this profile is designated for exception. Missing evidence and diligence-quality gates must be resolved with evidence.</p>}
    {state.policyOverrides.length ? <div className="policy-override-ledger"><h3>Immutable exception history</h3>{[...state.policyOverrides].reverse().map((item) => <article key={item.eventId}><strong>{blockingGates.find((gate) => gate.gateId === item.gateId)?.label ?? item.gateId}</strong><p>{item.rationale}</p><small>{item.actor} · {item.actorRole} · {formatHumanDate(item.recordedAt)}{item.supersedesEventId ? " · supersedes prior record" : ""}</small></article>)}</div> : null}
  </section>;
}

export function DiligenceWorklist({state, update, lockedIssueIds = new Set<string>(), stages, evidenceOptions = [], selectedIssueId, onSelectIssue, onInspectEvidence}: {state: DealWorkspaceState; update: WorkspaceUpdate; lockedIssueIds?: ReadonlySet<string>; stages?: ReadonlyMap<string, string>; evidenceOptions?: Array<{id: string; label: string}>; selectedIssueId?: string | null; onSelectIssue?: (id: string | null) => void; onInspectEvidence?: (id: string) => void}) {
  const [queue, setQueue] = useState("all");
  const [search, setSearch] = useState("");
  const [internalSelectedIssue, setInternalSelectedIssue] = useState<string | null>(null);
  const selectedIssue = selectedIssueId === undefined ? internalSelectedIssue : selectedIssueId;
  const setSelectedIssue = (id: string | null) => {setInternalSelectedIssue(id); onSelectIssue?.(id);};
  useEffect(() => {if (selectedIssueId) {setQueue("all"); setSearch("");}}, [selectedIssueId]);
  const [draftEvidence, setDraftEvidence] = useState<string[]>([]);
  const [resolutionEvidence, setResolutionEvidence] = useState<Record<string, string[]>>({});
  const evidencePicker = (label: string, selected: string[], change: (refs: string[]) => void) => evidenceOptions.length ? <label className="issue-evidence-picker"><span>{label}</span><select aria-label={label} multiple size={Math.min(5, evidenceOptions.length)} value={selected} onChange={event => change(Array.from(event.target.selectedOptions, option => option.value))}>{evidenceOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><small>Select relevant sources; use Command or Control to select more than one.</small></label> : <p className="evidence-empty">No selectable evidence is available for this case.</p>;

  const isBlocking = (issue: DealWorkspaceState["issues"][number]) => issue.status !== "RESOLVED" && (lockedIssueIds.has(issue.id) || issue.priority === "CRITICAL");
  const visibleIssues = state.issues.filter(issue => {
    const matchesQueue = queue === "all" || (queue === "unresolved" && issue.status !== "RESOLVED") || (queue === "blocking" && isBlocking(issue)) || (queue === "assigned" && issue.status !== "RESOLVED" && Boolean(issue.owner.trim())) || (queue === "resolved" && issue.status === "RESOLVED");
    return matchesQueue && `${issue.title} ${issue.description} ${issue.owner} ${issue.priority} ${issue.decisionImpact}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({title: "", owner: "", priority: "MEDIUM" as IssuePriority, dueDate: "", decisionImpact: ""});
  const [ownerDrafts, setOwnerDrafts] = useState<Record<string, string>>({});
  const [ownerNotice, setOwnerNotice] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [resolvers, setResolvers] = useState<Record<string, string>>({});
  const [resolutionNotice, setResolutionNotice] = useState<Record<string, string>>({});
  const edit = (id: string, patch: Partial<DealWorkspaceState["issues"][number]>) => update({issues: state.issues.map((issue) => issue.id === id ? {...issue, ...patch, updatedAt: new Date().toISOString()} : issue)});
  const commitOwner = (id: string, canonicalOwner: string) => {
    const owner = (ownerDrafts[id] ?? canonicalOwner).trim();
    if (!owner) {
      setOwnerDrafts((current) => ({...current, [id]: canonicalOwner}));
      setOwnerNotice((current) => ({...current, [id]: "Owner is required; the prior assignment was retained."}));
      return;
    }
    if (owner !== canonicalOwner) edit(id, {owner});
    setOwnerDrafts((current) => ({...current, [id]: owner}));
    setOwnerNotice((current) => ({...current, [id]: ""}));
  };
  const create = () => {
    if (!draft.title.trim() || !draft.owner.trim() || !draft.decisionImpact.trim()) return;
    const now = new Date().toISOString();
    update({issues: [...state.issues, {id: crypto.randomUUID(), title: draft.title.trim(), description: draft.decisionImpact.trim(), owner: draft.owner.trim(), priority: draft.priority, status: "OPEN", dueDate: draft.dueDate || null, decisionImpact: draft.decisionImpact.trim(), evidenceRefs: draftEvidence.filter(id => evidenceOptions.some(option => option.id === id)), resolution: null, resolvedBy: null, createdAt: now, updatedAt: now}]});
    setDraft({title: "", owner: "", priority: "MEDIUM", dueDate: "", decisionImpact: ""});
    setDraftEvidence([]);
    setAdding(false);
  };
  const resolve = (id: string) => {
    const resolution = resolutions[id]?.trim();
    const resolvedBy = resolvers[id]?.trim();
    if (!resolution || !resolvedBy) return;
    if (lockedIssueIds.has(id)) return;
    const citations = (resolutionEvidence[id] ?? []).map(ref => evidenceOptions.find(option => option.id === ref)).filter((option): option is {id: string; label: string} => Boolean(option));
    const record = citations.length ? `${resolution}\n\nResolution evidence: ${citations.map(option => `[${option.id}] ${option.label}`).join("; ")}` : resolution;
    if (record.length > 2000) {setResolutionNotice(current => ({...current, [id]: "Shorten the resolution or select fewer sources; the combined record exceeds 2,000 characters."})); return;}
    edit(id, {status: "RESOLVED", resolution: record, resolvedBy});
  };
  const unresolved = state.issues.filter((issue) => issue.status !== "RESOLVED").length;
  return <section className="workspace-card diligence-worklist" aria-labelledby="diligence-worklist-heading">
    <div className="section-heading"><div><p className="eyebrow">Assigned diligence</p><h2 id="diligence-worklist-heading">Issue worklist</h2></div><div className="heading-actions"><span>{unresolved} unresolved · {state.issues.length - unresolved} resolved</span><button type="button" className="secondary-button" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "New issue"}</button></div></div>
    {adding ? <div className="issue-create-form"><label><span>Issue</span><input maxLength={240} value={draft.title} onChange={(event) => setDraft({...draft, title: event.target.value})} /></label><label><span>Owner</span><input maxLength={120} value={draft.owner} onChange={(event) => setDraft({...draft, owner: event.target.value})} /></label><label><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({...draft, priority: event.target.value as IssuePriority})}>{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Due date</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft({...draft, dueDate: event.target.value})} /></label><label className="wide"><span>Decision impact</span><input maxLength={1200} value={draft.decisionImpact} onChange={(event) => setDraft({...draft, decisionImpact: event.target.value})} /></label>{evidencePicker("Issue evidence", draftEvidence, setDraftEvidence)}<button type="button" className="primary-button" onClick={create} disabled={!draft.title.trim() || !draft.owner.trim() || !draft.decisionImpact.trim()}>Create issue</button></div> : null}
    <div className="diligence-queue-toolbar"><label><span>Queue</span><select value={queue} onChange={event => {setQueue(event.target.value); setSelectedIssue(null);}}><option value="all">All issues</option><option value="unresolved">Unresolved</option><option value="blocking">Blocking concerns</option><option value="assigned">Assigned and open</option><option value="resolved">Resolved</option></select></label><label><span>Search issues or owners</span><input type="search" value={search} onChange={event => {setSearch(event.target.value); setSelectedIssue(null);}} placeholder="Issue, owner, priority, or consequence" /></label><p role="status">{visibleIssues.length} of {state.issues.length} issues</p></div>
    {queue === "blocking" ? <p className="queue-definition">Blocking concerns are unresolved critical issues or locked quantitative hurdles. This filter does not change the investment decision.</p> : null}
    <ReviewTable label="Diligence review queue" rows={visibleIssues} rowKey={issue => issue.id} selectedId={selectedIssue ?? undefined} emptyMessage="No issues match this queue and search." columns={[
      {id: "issue", label: "Issue", sortValue: issue => issue.title, render: issue => <button type="button" className="queue-issue-link" aria-expanded={selectedIssue === issue.id} onClick={() => setSelectedIssue(selectedIssue === issue.id ? null : issue.id)}>{issue.title}</button>},
      {id: "priority", label: "Priority", sortValue: issue => ({CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3}[issue.priority]), render: issue => issue.priority.toLowerCase()},
      {id: "owner", label: "Owner", sortValue: issue => issue.owner, render: issue => <>{issue.owner}{stages?.get(issue.id) ? <small className="stage-note">{stages.get(issue.id)}</small> : null}</>},
      {id: "status", label: "Status", sortValue: issue => issue.status, render: issue => issue.status.toLowerCase().replace("_", " ")},
      {id: "due", label: "Due", sortValue: issue => issue.dueDate ?? "9999-12-31", render: issue => issue.dueDate ? formatHumanDate(`${issue.dueDate}T12:00:00Z`) : "Not set"},
      {id: "impact", label: "Decision impact", render: issue => issue.decisionImpact},
    ]} />
    <div className="worklist-table queue-resolution-details" aria-label="Diligence issue worklist">
      {visibleIssues.filter(issue => issue.id === selectedIssue).map((issue) => {const locked = lockedIssueIds.has(issue.id); const noticeId = `issue-owner-${issue.id}-notice`; return <details open key={issue.id} className="worklist-row"><summary><span><strong>{issue.title}</strong><small>{issue.decisionImpact}</small></span><span className={`priority priority-${issue.priority.toLowerCase()}`}>{issue.priority.toLowerCase()}</span><span>{issue.owner}{stages?.get(issue.id) ? <small className="stage-note">{stages.get(issue.id)}</small> : null}</span><span className={`status status-${issue.status.toLowerCase()}`}>{issue.status.toLowerCase().replace("_", " ")}</span><span>{issue.dueDate ? formatHumanDate(`${issue.dueDate}T12:00:00Z`) : "Not set"}</span><span className="worklist-action">Review</span></summary><div className="issue-detail"><p>{issue.description}</p><div className="issue-source-links" aria-label="Linked issue evidence">{Array.from(new Set([...issue.evidenceRefs, ...evidenceOptions.filter(option => issue.resolution?.includes(`[${option.id}]`)).map(option => option.id)])).map(ref => onInspectEvidence ? <button type="button" key={ref} onClick={() => onInspectEvidence(ref)}>{evidenceOptions.find(option => option.id === ref)?.label ?? ref}</button> : <span key={ref}>{evidenceOptions.find(option => option.id === ref)?.label ?? ref}</span>)}</div><div className="issue-controls"><label><span>Owner</span><input maxLength={120} value={ownerDrafts[issue.id] ?? issue.owner} aria-describedby={ownerNotice[issue.id] ? noticeId : undefined} onChange={(event) => {setOwnerDrafts((current) => ({...current, [issue.id]: event.target.value})); setOwnerNotice((current) => ({...current, [issue.id]: ""}));}} onBlur={() => commitOwner(issue.id, issue.owner)} />{ownerNotice[issue.id] ? <small id={noticeId} role="status">{ownerNotice[issue.id]}</small> : null}</label><label><span>Status</span><select value={issue.status === "RESOLVED" ? "RESOLVED" : issue.status} disabled={locked || issue.status === "RESOLVED"} onChange={(event) => edit(issue.id, {status: event.target.value as Exclude<IssueStatus, "RESOLVED">, resolution: null, resolvedBy: null})}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option>{issue.status === "RESOLVED" ? <option value="RESOLVED">Resolved</option> : null}</select></label><label><span>Priority</span><select value={issue.priority} onChange={(event) => edit(issue.id, {priority: event.target.value as IssuePriority})}>{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Due date</span><input type="date" value={issue.dueDate ?? ""} onChange={(event) => edit(issue.id, {dueDate: event.target.value || null})} /></label></div>{locked ? <p className="resolution-record"><strong>Quantitative hurdle:</strong> This issue cannot be cleared with a free-text resolution. A recorded policy exception can disposition the screen, but the evidence-quality diligence concern remains open until canonical evidence changes through an authorized workflow.</p> : issue.status === "RESOLVED" ? <p className="resolution-record"><strong>Resolution:</strong> {issue.resolution}<br /><small>Resolved by {issue.resolvedBy}</small></p> : <div className="resolution-form"><label><span>Resolver</span><input maxLength={120} value={resolvers[issue.id] ?? ""} onChange={(event) => setResolvers({...resolvers, [issue.id]: event.target.value})} placeholder="Named human resolver" /></label><label><span>Resolution record</span><textarea maxLength={2000} value={resolutions[issue.id] ?? ""} onChange={(event) => setResolutions({...resolutions, [issue.id]: event.target.value})} placeholder="What evidence or decision resolved this issue?" /></label>{evidencePicker("Resolution evidence", resolutionEvidence[issue.id] ?? [], refs => setResolutionEvidence(current => ({...current, [issue.id]: refs})))}<button type="button" onClick={() => resolve(issue.id)} disabled={!resolutions[issue.id]?.trim() || !resolvers[issue.id]?.trim()}>Resolve issue</button>{resolutionNotice[issue.id] ? <p role="alert">{resolutionNotice[issue.id]}</p> : null}</div>}</div></details>;})}
    </div>
  </section>;
}

export function WorkspaceTransfer({state, replace, allowedEvidenceRefs, scenarioContract, integrityContract}: {state: DealWorkspaceState; replace: (state: DealWorkspaceState) => void; allowedEvidenceRefs: ReadonlySet<string>; scenarioContract: WorkspaceScenarioContract; integrityContract: import("./workspace-state").WorkspaceIntegrityContract}) {
  const [notice, setNotice] = useState("");
  const [includePrivateNote, setIncludePrivateNote] = useState(false);
  const exportState = () => {
    try {
      const url = URL.createObjectURL(new Blob([serializeWorkspace(state, includePrivateNote, allowedEvidenceRefs, scenarioContract, integrityContract)], {type: "application/json"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${state.caseId}-underwriting-workspace.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Portable workspace exported.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Workspace export failed."); }
  };
  const importState = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("Workspace import exceeds the 2 MB local limit.");
      const parsed = JSON.parse(await file.text()) as unknown;
      replace(sanitizePortableWorkspaceImport(parsed, state.caseId, allowedEvidenceRefs, scenarioContract, integrityContract));
      setNotice("Workspace imported and validated. Proposal text and human decisions were preserved, but external model identity was not authenticated and imported policy exceptions were not applied.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workspace import failed.");
    }
  };
  return <section className="workspace-transfer" aria-label="Portable deal state"><div><strong>Portable deal state</strong><span>Browser-local, validated JSON. The private analyst note is excluded unless you opt in. Do not use for confidential information.</span></div><label><input type="checkbox" checked={includePrivateNote} onChange={(event) => setIncludePrivateNote(event.target.checked)} /> Include private analyst note in export</label><div><button type="button" onClick={exportState}>Export state</button><label className="file-button">Import state<input type="file" accept="application/json,.json" onChange={(event) => importState(event.target.files?.[0])} /></label></div>{notice ? <p role="status">{notice}</p> : null}</section>;
}

function htmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function memoDownloadHtml(title: string, subtitle: string, scenarioSummary: ScenarioMemoSummary, sections: DealWorkspaceState["memoSections"]) {
  const sectionHtml = sections.map((section) => `<section><h2>${htmlEscape(section.title)}</h2><p>${htmlEscape(section.body)}</p><small>${htmlEscape(section.updatedBy)} · ${htmlEscape(formatHumanDate(section.updatedAt))}</small></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${htmlEscape(title)} — IC memo</title><style>body{font:15px/1.55 Arial,sans-serif;color:#17202a;max-width:820px;margin:48px auto;padding:0 32px}header{border-bottom:2px solid #17202a;padding-bottom:24px}h1{font-size:30px;margin:8px 0}h2{font-size:18px;margin:0 0 8px}section{border-top:1px solid #ccd2d8;padding:22px 0}p{white-space:pre-wrap}small{color:#5d6873}.scenario{background:#f3f5f7;padding:18px;margin:24px 0}.disclosure{margin-top:36px;color:#5d6873;font-size:12px}</style></head><body><header><small>Investment committee working draft</small><h1>${htmlEscape(title)}</h1><p>${htmlEscape(subtitle)}</p></header><div class="scenario"><strong>${htmlEscape(scenarioSummary.label)} · ${htmlEscape(scenarioSummary.state)}</strong><p>${htmlEscape(scenarioSummary.returnLine)}</p><small>${htmlEscape(scenarioSummary.detail)}</small></div>${sectionHtml}<p class="disclosure">Synthetic public demonstration. Not investment advice. IC decision pending.</p></body></html>`;
}

export function EditableMemo({state, update, title, subtitle, scenarioSummary}: {state: DealWorkspaceState; update: WorkspaceUpdate; title: string; subtitle: string; scenarioSummary: ScenarioMemoSummary}) {
  const [editor, setEditor] = useState("");
  const [memoMode, setMemoMode] = useState<"preview" | "edit">("preview");
  const [exportNotice, setExportNotice] = useState("");
  const namedHumanEditor = Boolean(editor.trim()) && !["financial model", "underwriting desk"].includes(editor.trim().toLowerCase());
  const setSection = (sectionId: string, body: string) => {
    if (!namedHumanEditor || scenarioSummary.reconciliationBlockedReason) return;
    update({memoSections: state.memoSections.map((section) => section.sectionId === sectionId ? {...section, body, provenance: section.provenance === "DETERMINISTIC_ANALYSIS" || section.provenance === "HUMAN_ACCEPTED_MODEL_PROPOSAL" ? "ANALYST_JUDGMENT" : section.provenance, sourceProvenance: section.sourceProvenance ?? section.provenance, sourceBody: section.sourceBody ?? section.body, scenarioSnapshotId: scenarioSummary.snapshotId, updatedBy: editor.trim(), updatedAt: new Date().toISOString()} : section)});
  };
  const acceptedDrafts = state.proposals.filter((proposal) => proposal.state === "ACCEPTED" && !state.memoSections.some((section) => section.sourceProposalId === proposal.proposalId));
  const proposalMatchesCurrentBasis = (proposal: ModelProposal) => proposal.reviewBasisId === digestTextSync(scenarioSummary.snapshotId);
  const addProposal = (proposal: ModelProposal) => {
    if (!proposalMatchesCurrentBasis(proposal)) return;
    if (!namedHumanEditor || scenarioSummary.reconciliationBlockedReason) return;
    const title = proposal.kind === "CHALLENGE" ? `Accepted counterthesis — ${proposal.title}` : proposal.kind === "DILIGENCE_GAP" ? `Accepted diligence gap — ${proposal.title}` : proposal.memoSection || proposal.title;
    update({memoSections: [...state.memoSections, {sectionId: `proposal-${proposal.proposalId}`, title, body: proposal.body, provenance: "HUMAN_ACCEPTED_MODEL_PROPOSAL", sourceProposalId: proposal.proposalId, scenarioSnapshotId: scenarioSummary.snapshotId, updatedBy: editor.trim(), updatedAt: new Date().toISOString()}]});
  };
  const staleSections = state.memoSections.filter((section) => section.scenarioSnapshotId !== scenarioSummary.snapshotId);
  const reconcileCoreSections = () => {
    if (!namedHumanEditor || scenarioSummary.reconciliationBlockedReason) return;
    const now = new Date().toISOString();
    update({memoSections: state.memoSections.map((section) => {
      const generated = scenarioSummary.sectionBodies[section.sectionId as keyof typeof scenarioSummary.sectionBodies];
      if (!generated) return section;
      return {...section, body: generated, provenance: section.provenance === "DETERMINISTIC_ANALYSIS" ? "ANALYST_JUDGMENT" as const : section.provenance, sourceProvenance: section.sourceProvenance ?? section.provenance, sourceBody: section.sourceBody ?? section.body, scenarioSnapshotId: scenarioSummary.snapshotId, updatedBy: editor.trim(), updatedAt: now};
    })});
    setExportNotice(`Core memo sections reconciled to ${scenarioSummary.label}. Review any remaining stale sections before export.`);
  };
  const exportBlocked = committeeExportBlock(state, scenarioSummary);
  const exportReady = !exportBlocked;
  const downloadMemo = () => {
    if (!exportReady) { setExportNotice(exportBlocked ?? "Export is not available."); return; }
    try {
      setExportNotice("Preparing scenario-bound memo…");
      const url = URL.createObjectURL(new Blob([memoDownloadHtml(title, subtitle, scenarioSummary, state.memoSections)], {type: "text/html;charset=utf-8"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${state.caseId}-${scenarioSummary.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-ic-memo.html`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice(`Downloaded ${scenarioSummary.label} IC memo.`);
    } catch (error) { setExportNotice(error instanceof Error ? error.message : "Memo export failed."); }
  };
  const downloadSnapshot = () => {
    try {
      const snapshot = createCommitteeSnapshot(state, scenarioSummary, title, subtitle);
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], {type: "application/json"}));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${state.caseId}-committee-revision-${state.revision}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice(`Frozen committee packet downloaded for workspace revision ${state.revision}. IC decision remains pending.`);
    } catch (error) {setExportNotice(error instanceof Error ? error.message : "Committee packet export failed.");}
  };
  const provenanceLabel = (section: DealWorkspaceState["memoSections"][number]) => {
    if (section.provenance === "DETERMINISTIC_ANALYSIS") return "Calculated baseline";
    if (section.provenance === "ANALYST_JUDGMENT") {
      if (section.sourceProvenance === "DETERMINISTIC_ANALYSIS") return "Analyst revision · calculated baseline preserved";
      if (section.sourceProvenance === "HUMAN_ACCEPTED_MODEL_PROPOSAL") return "Analyst revision · accepted proposal preserved";
      return "Analyst judgment";
    }
    const source = state.proposals.find((proposal) => proposal.proposalId === section.sourceProposalId);
    return source?.origin === "PORTABLE_IMPORT_UNVERIFIED" ? "Accepted imported proposal · source identity unverified" : "Accepted model proposal";
  };
  const importedProposalCaveat = (section: DealWorkspaceState["memoSections"][number]) => state.proposals.find((proposal) => proposal.proposalId === section.sourceProposalId)?.origin === "PORTABLE_IMPORT_UNVERIFIED"
    ? "Portable import note: the proposal text and recorded human disposition were preserved, but the original model and provider identity are not authenticated."
    : null;
    return <div className={`memo-workspace committee-review committee-${memoMode}`}><section className="memo-editor"><div className="committee-toolbar"><div><strong>Committee review</strong><span>{exportReady ? "Current scenario · decision pending" : "Review required before export"}</span></div><div role="group" aria-label="Memo view"><button type="button" aria-pressed={memoMode === "preview"} onClick={() => setMemoMode("preview")}>Preview memo</button><button type="button" aria-pressed={memoMode === "edit"} onClick={() => setMemoMode("edit")}>Edit memo</button></div></div><header><div><span>Investment committee working draft</span><h2>{title}</h2><p>{subtitle}</p></div><label><span>Editor</span><input value={editor} maxLength={120} aria-describedby={!namedHumanEditor && editor.trim() ? "memo-editor-notice" : undefined} onChange={(event) => setEditor(event.target.value)} placeholder="Named editor required to revise" />{!namedHumanEditor && editor.trim() ? <small id="memo-editor-notice" role="status">Enter a person rather than a system label.</small> : null}</label></header><section className="memo-scenario-summary" aria-label="Scenario represented in this memo"><div><span>{scenarioSummary.state === "Canonical case" ? "Selected case" : scenarioSummary.state}</span><h3>{scenarioSummary.label}</h3></div><strong>{scenarioSummary.returnLine}</strong><p>{scenarioSummary.detail.replaceAll("canonical case","approved case")}</p></section>{staleSections.length ? <section className="memo-reconciliation" role="alert"><div><strong>Memo review required</strong><p>{scenarioSummary.reconciliationBlockedReason ?? `${staleSections.length} ${staleSections.length === 1 ? "section was" : "sections were"} prepared against another scenario. Export is blocked until a named editor reconciles them.`}</p></div><button type="button" onClick={reconcileCoreSections} disabled={!namedHumanEditor || Boolean(scenarioSummary.reconciliationBlockedReason)}>Reconcile core sections to {scenarioSummary.label}</button></section> : exportBlocked ? <p className="memo-reconciliation" role="alert">{exportBlocked}</p> : <p className="memo-ready" role="status">All memo sections are bound to {scenarioSummary.label}.</p>}{state.memoSections.map((section) => {const caveat = importedProposalCaveat(section); const stale = section.scenarioSnapshotId !== scenarioSummary.snapshotId; return <article key={section.sectionId} data-stale={stale || undefined}><div className="memo-section-heading"><div><h3>{section.title}</h3><small>{provenanceLabel(section)}{stale ? " · review required" : " · current scenario"}</small></div><span>{section.updatedBy} · {formatHumanDate(section.updatedAt)}</span></div>{caveat ? <p className="proposal-import-caveat">{caveat}</p> : null}<textarea hidden={memoMode !== "edit"} className="memo-screen-editor" maxLength={8000} disabled={!namedHumanEditor || Boolean(scenarioSummary.reconciliationBlockedReason)} aria-label={`${section.title} memo section`} value={section.body} onChange={(event) => setSection(section.sectionId, event.target.value)} /><p className="memo-preview-body" hidden={memoMode !== "preview"}>{section.body}</p><p className="memo-print-body">{caveat ? `${caveat} ` : ""}{section.body}</p>{section.sourceBody ? <details><summary>Compare with original basis</summary><div className="committee-text-comparison"><section><h4>Original basis</h4><p>{section.sourceBody}</p></section><section><h4>Current text</h4><p>{section.body}</p></section></div></details> : null}</article>;})}{acceptedDrafts.length ? <aside className="accepted-drafts"><h3>Accepted proposals ready for the memo</h3>{acceptedDrafts.map((proposal) => <div key={proposal.proposalId}><p>{proposal.body}</p><button type="button" onClick={() => addProposal(proposal)} disabled={!namedHumanEditor || Boolean(scenarioSummary.reconciliationBlockedReason) || !proposalMatchesCurrentBasis(proposal)}>Add with provenance</button>{!proposalMatchesCurrentBasis(proposal) ? <p>Earlier acceptance retained. Request a new model review for the current source and scenario before adding this text.</p> : null}</div>)}</aside> : null}<footer>Working draft · IC decision pending · Illustrative public data</footer></section><div className="memo-actions"><section className="committee-basis"><h3>Current basis</h3><dl><dt>Scenario</dt><dd>{scenarioSummary.label}</dd><dt>Workspace</dt><dd>Revision {state.revision}</dd><dt>Unresolved diligence</dt><dd>{state.issues.filter(issue => issue.status !== "RESOLVED").length}</dd><dt>Committee action</dt><dd>Human decision pending</dd></dl><p>Export readiness confirms scenario alignment, not investment approval or completed diligence.</p></section><button className="primary-button" type="button" onClick={downloadMemo} disabled={!exportReady}>Download IC memo</button><button type="button" onClick={() => window.print()} disabled={!exportReady}>Print or save PDF</button><button type="button" onClick={downloadSnapshot} disabled={!exportReady}>Download frozen committee packet</button><p className="committee-version">Workspace revision {state.revision} · snapshot preserves current memo, scenario, diligence, and recorded reviews. IC decision remains pending.</p>{exportBlocked ? <p role="alert">{exportBlocked}</p> : null}{exportNotice ? <p role="status">{exportNotice}</p> : <p>Export is available only when every section matches the selected scenario.</p>}<ul className="memo-checks" aria-label="Export readiness"><li data-state={namedHumanEditor ? "done" : "open"}>Named editor {namedHumanEditor ? "entered" : "required to revise"}</li><li data-state={staleSections.length ? "blocked" : "done"}>{staleSections.length ? `${staleSections.length} ${staleSections.length === 1 ? "section" : "sections"} not bound to ${scenarioSummary.label}` : `All sections bound to ${scenarioSummary.label}`}</li><li data-state={acceptedDrafts.length ? "open" : "done"}>{acceptedDrafts.length ? `${acceptedDrafts.length} accepted ${acceptedDrafts.length === 1 ? "proposal" : "proposals"} not yet placed` : "No accepted proposals waiting"}</li><li data-state="open">IC decision recorded by people, not by the Desk</li></ul></div></div>;
}
