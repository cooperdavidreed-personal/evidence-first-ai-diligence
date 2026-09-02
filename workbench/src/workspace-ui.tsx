import {useEffect, useMemo, useState} from "react";
import type {ModelProposal} from "./model-workflow";
import type {PolicyProfile} from "./policy";
import type {ScenarioMemoSummary} from "./financial-workspace";
import {
  createWorkspace,
  createWorkspaceIntegrityContract,
  loadWorkspaceResult,
  persistWorkspace,
  serializeWorkspace,
  touchWorkspace,
  validateWorkspace,
  type AssumptionDisposition,
  type DealWorkspaceState,
  type IssuePriority,
  type IssueStatus,
  type WorkspaceScenarioContract,
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

export function useDealWorkspace(seed: WorkspaceSeed, allowedEvidenceRefs: ReadonlySet<string>, scenarioContract: WorkspaceScenarioContract, policyOverrideRoles: Record<string, string> = EMPTY_POLICY_OVERRIDE_ROLES) {
  const fallback = useMemo(() => createWorkspace(seed), [seed]);
  const integrityContract = useMemo(() => createWorkspaceIntegrityContract(seed, policyOverrideRoles), [seed, policyOverrideRoles]);
  const initialLoad = useMemo(() => loadWorkspaceResult(seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract), [seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract]);
  const [state, setState] = useState<DealWorkspaceState>(() => initialLoad.state);
  const [loadNotice, setLoadNotice] = useState<string | null>(() => initialLoad.notice);
  const [saveNotice, setSaveNotice] = useState("Saved locally");

  useEffect(() => {const loaded = loadWorkspaceResult(seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract); setState(loaded.state); setLoadNotice(loaded.notice);}, [seed.caseId, fallback, allowedEvidenceRefs, scenarioContract, integrityContract]);
  useEffect(() => {
    setSaveNotice(persistWorkspace(state, allowedEvidenceRefs, scenarioContract, integrityContract) ? "Saved locally" : "In memory · local save unavailable");
  }, [allowedEvidenceRefs, scenarioContract, integrityContract, state]);

  const update: WorkspaceUpdate = (patch) => {
    setLoadNotice(null);
    setState((current) => {
      const next = touchWorkspace(current, typeof patch === "function" ? patch(current) : patch);
      return validateWorkspace(next, seed.caseId, allowedEvidenceRefs, scenarioContract, integrityContract);
    });
  };
  const replace = (next: DealWorkspaceState) => {
    setState(validateWorkspace(next, seed.caseId, allowedEvidenceRefs, scenarioContract, integrityContract));
    setLoadNotice(null);
    setSaveNotice("Imported and saved locally");
  };
  return {state, update, replace, storageNotice: loadNotice ?? saveNotice, integrityContract};
}

export function ObservationComposer({state, update}: {state: DealWorkspaceState; update: WorkspaceUpdate}) {
  const [draft, setDraft] = useState("");
  const [author, setAuthor] = useState("");
  const [kind, setKind] = useState<"INVESTMENT_OBSERVATION" | "MANAGEMENT_MEETING_NOTE">("INVESTMENT_OBSERVATION");
  const add = () => {
    const text = draft.trim(), namedAuthor = author.trim();
    if (!text || !namedAuthor) return;
    update({observations: [...state.observations, {id: crypto.randomUUID(), text, kind, author: namedAuthor, createdAt: new Date().toISOString()}]});
    setDraft("");
  };
  return <section className="workspace-card observation-workspace" aria-labelledby="observations-heading">
    <div className="section-heading"><div><p className="eyebrow">Human context</p><h2 id="observations-heading">Notes and observations</h2></div><span>{state.observations.length} recorded</span></div>
    <label><span>Private analyst note</span><textarea maxLength={8000} value={state.privateNote} onChange={(event) => update({privateNote: event.target.value})} placeholder="Record the unresolved judgment or contradiction that matters." /></label>
    <div className="observation-form"><label><span>Entry type</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="INVESTMENT_OBSERVATION">Investment observation</option><option value="MANAGEMENT_MEETING_NOTE">Management meeting note</option></select></label><label><span>Author</span><input value={author} maxLength={120} onChange={(event) => setAuthor(event.target.value)} placeholder="Your name" /></label></div>
    <label><span>New observation</span><textarea maxLength={8000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What did the model or source record miss?" /></label>
    <button className="secondary-button" type="button" onClick={add} disabled={!draft.trim() || !author.trim()}>Add observation</button>
    {state.observations.length ? <ol className="activity-list">{[...state.observations].reverse().map((item) => <li key={item.id}><p>{item.text}</p><small>{item.kind === "MANAGEMENT_MEETING_NOTE" ? "Meeting note" : "Investment observation"} · {item.author} · {formatHumanDate(item.createdAt)}</small></li>)}</ol> : <p className="empty-copy">No qualitative observations recorded yet.</p>}
  </section>;
}

export function AssumptionRegistry({assumptions, state, update}: {assumptions: AssumptionDefinition[]; state: DealWorkspaceState; update: WorkspaceUpdate}) {
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
        const disposition = review?.disposition ?? "UNREVIEWED";
        return <article role="listitem" key={assumption.id}><div><strong>{assumption.label}</strong><span>{assumption.basis} · {assumption.owner}</span><p>{assumption.consequence}</p>{review ? <small>{review.rationale} · {review.actor} · {formatHumanDate(review.reviewedAt)}</small> : null}</div><b>{assumption.value}</b><span className={`status status-${disposition.toLowerCase()}`}>{disposition.toLowerCase()}</span><div className="row-actions"><button type="button" onClick={() => decide(assumption.id, "APPROVED")} disabled={!actor.trim() || rationale.trim().length < 12}>Approve</button><button type="button" onClick={() => decide(assumption.id, "REJECTED")} disabled={!actor.trim() || rationale.trim().length < 12}>Reject</button></div></article>;
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

export function DiligenceWorklist({state, update, lockedIssueIds = new Set<string>()}: {state: DealWorkspaceState; update: WorkspaceUpdate; lockedIssueIds?: ReadonlySet<string>}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({title: "", owner: "", priority: "MEDIUM" as IssuePriority, dueDate: "", decisionImpact: ""});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [resolvers, setResolvers] = useState<Record<string, string>>({});
  const edit = (id: string, patch: Partial<DealWorkspaceState["issues"][number]>) => update({issues: state.issues.map((issue) => issue.id === id ? {...issue, ...patch, updatedAt: new Date().toISOString()} : issue)});
  const create = () => {
    if (!draft.title.trim() || !draft.owner.trim() || !draft.decisionImpact.trim()) return;
    const now = new Date().toISOString();
    update({issues: [...state.issues, {id: crypto.randomUUID(), title: draft.title.trim(), description: draft.decisionImpact.trim(), owner: draft.owner.trim(), priority: draft.priority, status: "OPEN", dueDate: draft.dueDate || null, decisionImpact: draft.decisionImpact.trim(), evidenceRefs: [], resolution: null, resolvedBy: null, createdAt: now, updatedAt: now}]});
    setDraft({title: "", owner: "", priority: "MEDIUM", dueDate: "", decisionImpact: ""});
    setAdding(false);
  };
  const resolve = (id: string) => {
    const resolution = resolutions[id]?.trim();
    const resolvedBy = resolvers[id]?.trim();
    if (!resolution || !resolvedBy) return;
    edit(id, {status: "RESOLVED", resolution, resolvedBy});
  };
  const unresolved = state.issues.filter((issue) => issue.status !== "RESOLVED").length;
  return <section className="workspace-card diligence-worklist" aria-labelledby="diligence-worklist-heading">
    <div className="section-heading"><div><p className="eyebrow">Diligence</p><h2 id="diligence-worklist-heading">Issue worklist</h2></div><div className="heading-actions"><span>{unresolved} unresolved</span><button type="button" className="secondary-button" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "New issue"}</button></div></div>
    {adding ? <div className="issue-create-form"><label><span>Issue</span><input maxLength={240} value={draft.title} onChange={(event) => setDraft({...draft, title: event.target.value})} /></label><label><span>Owner</span><input maxLength={120} value={draft.owner} onChange={(event) => setDraft({...draft, owner: event.target.value})} /></label><label><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({...draft, priority: event.target.value as IssuePriority})}>{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Due date</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft({...draft, dueDate: event.target.value})} /></label><label className="wide"><span>Decision impact</span><input maxLength={1200} value={draft.decisionImpact} onChange={(event) => setDraft({...draft, decisionImpact: event.target.value})} /></label><button type="button" className="primary-button" onClick={create} disabled={!draft.title.trim() || !draft.owner.trim() || !draft.decisionImpact.trim()}>Create issue</button></div> : null}
    <div className="worklist-table" aria-label="Diligence issue worklist">
      <div className="worklist-head" aria-hidden="true"><span>Issue</span><span>Priority</span><span>Owner</span><span>Status</span><span>Due</span></div>
      {state.issues.map((issue) => {const locked = lockedIssueIds.has(issue.id); return <details key={issue.id} className="worklist-row"><summary><span><strong>{issue.title}</strong><small>{issue.decisionImpact}</small></span><span className={`priority priority-${issue.priority.toLowerCase()}`}>{issue.priority.toLowerCase()}</span><span>{issue.owner}</span><span className={`status status-${issue.status.toLowerCase()}`}>{issue.status.toLowerCase().replace("_", " ")}</span><span>{issue.dueDate ? formatHumanDate(`${issue.dueDate}T12:00:00Z`) : "Not set"}</span></summary><div className="issue-detail"><p>{issue.description}</p><div className="issue-controls"><label><span>Owner</span><input maxLength={120} value={issue.owner} onChange={(event) => edit(issue.id, {owner: event.target.value})} /></label><label><span>Status</span><select value={issue.status === "RESOLVED" ? "RESOLVED" : issue.status} disabled={locked || issue.status === "RESOLVED"} onChange={(event) => edit(issue.id, {status: event.target.value as Exclude<IssueStatus, "RESOLVED">, resolution: null, resolvedBy: null})}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option>{issue.status === "RESOLVED" ? <option value="RESOLVED">Resolved</option> : null}</select></label><label><span>Priority</span><select value={issue.priority} onChange={(event) => edit(issue.id, {priority: event.target.value as IssuePriority})}>{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Due date</span><input type="date" value={issue.dueDate ?? ""} onChange={(event) => edit(issue.id, {dueDate: event.target.value || null})} /></label></div>{locked ? <p className="resolution-record"><strong>Quantitative hurdle:</strong> This issue cannot be cleared with a free-text resolution. A recorded policy exception can disposition the screen, but the evidence-quality diligence concern remains open until canonical evidence changes through an authorized workflow.</p> : issue.status === "RESOLVED" ? <p className="resolution-record"><strong>Resolution:</strong> {issue.resolution}<br /><small>Resolved by {issue.resolvedBy}</small></p> : <div className="resolution-form"><label><span>Resolver</span><input maxLength={120} value={resolvers[issue.id] ?? ""} onChange={(event) => setResolvers({...resolvers, [issue.id]: event.target.value})} placeholder="Named human resolver" /></label><label><span>Resolution record</span><textarea maxLength={2000} value={resolutions[issue.id] ?? ""} onChange={(event) => setResolutions({...resolutions, [issue.id]: event.target.value})} placeholder="What evidence or decision resolved this issue?" /></label><button type="button" onClick={() => resolve(issue.id)} disabled={!resolutions[issue.id]?.trim() || !resolvers[issue.id]?.trim()}>Resolve issue</button></div>}</div></details>;})}
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
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Portable workspace exported.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Workspace export failed."); }
  };
  const importState = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("Workspace import exceeds the 2 MB local limit.");
      const parsed = JSON.parse(await file.text()) as unknown;
      replace(validateWorkspace(parsed, state.caseId, allowedEvidenceRefs, scenarioContract, integrityContract));
      setNotice("Workspace imported and validated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workspace import failed.");
    }
  };
  return <section className="workspace-transfer" aria-label="Portable deal state"><div><strong>Portable deal state</strong><span>Browser-local, validated JSON. The private analyst note is excluded unless you opt in. Do not use for confidential information.</span></div><label><input type="checkbox" checked={includePrivateNote} onChange={(event) => setIncludePrivateNote(event.target.checked)} /> Include private analyst note in export</label><div><button type="button" onClick={exportState}>Export state</button><label className="file-button">Import state<input type="file" accept="application/json,.json" onChange={(event) => importState(event.target.files?.[0])} /></label></div>{notice ? <p role="status">{notice}</p> : null}</section>;
}

export function EditableMemo({state, update, title, subtitle, scenarioSummary}: {state: DealWorkspaceState; update: WorkspaceUpdate; title: string; subtitle: string; scenarioSummary: ScenarioMemoSummary}) {
  const [editor, setEditor] = useState("");
  const setSection = (sectionId: string, body: string) => {
    if (!editor.trim()) return;
    update({memoSections: state.memoSections.map((section) => section.sectionId === sectionId ? {...section, body, provenance: section.provenance === "DETERMINISTIC_ANALYSIS" || section.provenance === "HUMAN_ACCEPTED_MODEL_PROPOSAL" ? "ANALYST_JUDGMENT" : section.provenance, sourceProvenance: section.sourceProvenance ?? section.provenance, sourceBody: section.sourceBody ?? section.body, updatedBy: editor.trim(), updatedAt: new Date().toISOString()} : section)});
  };
  const acceptedDrafts = state.proposals.filter((proposal) => proposal.state === "ACCEPTED" && !state.memoSections.some((section) => section.sourceProposalId === proposal.proposalId));
  const addProposal = (proposal: ModelProposal) => {
    if (!editor.trim()) return;
    const title = proposal.kind === "CHALLENGE" ? `Accepted counterthesis — ${proposal.title}` : proposal.kind === "DILIGENCE_GAP" ? `Accepted diligence gap — ${proposal.title}` : proposal.memoSection || proposal.title;
    update({memoSections: [...state.memoSections, {sectionId: `proposal-${proposal.proposalId}`, title, body: proposal.body, provenance: "HUMAN_ACCEPTED_MODEL_PROPOSAL", sourceProposalId: proposal.proposalId, updatedBy: editor.trim(), updatedAt: new Date().toISOString()}]});
  };
  return <div className="memo-workspace"><section className="memo-editor"><header><div><span>Investment committee working draft</span><h2>{title}</h2><p>{subtitle}</p></div><label><span>Editor</span><input value={editor} maxLength={120} onChange={(event) => setEditor(event.target.value)} placeholder="Named editor required to revise" /></label></header><section className="memo-scenario-summary" aria-label="Scenario represented in this memo"><div><span>{scenarioSummary.state}</span><h3>{scenarioSummary.label}</h3></div><strong>{scenarioSummary.returnLine}</strong><p>{scenarioSummary.detail}</p></section>{state.memoSections.map((section) => <article key={section.sectionId}><div className="memo-section-heading"><div><h3>{section.title}</h3><small>{section.provenance === "DETERMINISTIC_ANALYSIS" ? "Calculated baseline" : section.provenance === "ANALYST_JUDGMENT" ? section.sourceProvenance === "DETERMINISTIC_ANALYSIS" ? "Analyst revision · calculated baseline preserved" : section.sourceProvenance === "HUMAN_ACCEPTED_MODEL_PROPOSAL" ? "Analyst revision · accepted proposal preserved" : "Analyst judgment" : "Accepted model proposal"}</small></div><span>{section.updatedBy} · {formatHumanDate(section.updatedAt)}</span></div><textarea className="memo-screen-editor" maxLength={8000} disabled={!editor.trim()} aria-label={`${section.title} memo section`} value={section.body} onChange={(event) => setSection(section.sectionId, event.target.value)} /><p className="memo-print-body">{section.body}</p>{section.sourceBody ? <details><summary>Original source text</summary><p>{section.sourceBody}</p></details> : null}</article>)}{acceptedDrafts.length ? <aside className="accepted-drafts"><h3>Accepted proposals ready for the memo</h3>{acceptedDrafts.map((proposal) => <div key={proposal.proposalId}><p>{proposal.body}</p><button type="button" onClick={() => addProposal(proposal)} disabled={!editor.trim()}>Add with provenance</button></div>)}</aside> : null}<footer>Working draft · IC decision pending · Illustrative public data</footer></section><div className="memo-actions"><button className="primary-button" type="button" onClick={() => window.print()}>Export IC memo</button><p>Model language enters only after named human acceptance and a named editor adds it.</p></div></div>;
}
