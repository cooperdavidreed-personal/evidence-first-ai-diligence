import {useEffect, useMemo, useState} from "react";
import type {CaseData} from "./types";

type AssumptionStatus = "UNREVIEWED" | "APPROVED" | "REJECTED";
type Assumption = {id: string; label: string; value: string; basis: string; consequence: string};
type Observation = {id: string; text: string; createdAt: string};
type WorkspaceState = {note: string; observations: Observation[]; decisions: Record<string, AssumptionStatus>};

const emptyState = (): WorkspaceState => ({note: "", observations: [], decisions: {}});
const money = (cents: number) => `$${(cents / 100_000_000).toLocaleString(undefined, {maximumFractionDigits: 1})}M`;

function assumptionsFor(caseData: CaseData): Assumption[] {
  if (caseData.peEngine) {
    const transaction = caseData.peEngine.selected.engine_inputs.transaction;
    return [
      {id: "entry-value", label: "Entry enterprise value cap", value: money(transaction.entry_enterprise_value_cents as number), basis: "Analyst scenario assumption", consequence: "Changes sponsor equity, debt paydown capacity, and gross returns."},
      {id: "funded-debt", label: "Funded term debt", value: money(transaction.funded_term_face_cents as number), basis: "Proposed financing assumption", consequence: "Changes interest burden, covenant headroom, and equity contribution."},
      {id: "exit-multiple", label: "Exit EBITDA multiple", value: `${Number(transaction.exit_multiple).toFixed(1)}x`, basis: "Analyst scenario assumption", consequence: "Changes exit enterprise value and sponsor proceeds."},
      {id: "pricing-credit", label: "Pricing upside in selected case", value: "No credit", basis: "Empirical-test judgment", consequence: "The randomized offer test is negative; selected underwriting gives pricing no upside credit."},
    ];
  }
  if (caseData.vcEngine) {
    const primary = caseData.vcEngine.milestone.financing_events.find((item) => item.event_type === "PRIMARY");
    const tranche = caseData.vcEngine.milestone.financing_events.find((item) => item.event_type === "MILESTONE");
    const bridge = caseData.vcEngine.operating_exit_bridges.milestone;
    return [
      {id: "initial-close", label: "Initial financing close", value: money(primary?.new_money_cents ?? 0), basis: "Proposed financing term", consequence: "Changes ownership, runway, and preference proceeds."},
      {id: "milestone-tranche", label: "Conditional milestone tranche", value: money(tranche?.new_money_cents ?? 0), basis: "Proposed financing term", consequence: "Funds only after the retained milestone tests and human approval."},
      {id: "revenue-growth", label: "Annual revenue growth", value: `${(Number(bridge.annual_revenue_growth) * 100).toFixed(1)}%`, basis: "Analyst scenario assumption", consequence: "Changes terminal revenue and the operating exit bridge."},
      {id: "exit-multiple", label: "Exit revenue multiple", value: `${Number(bridge.exit_revenue_multiple).toFixed(1)}x`, basis: "Analyst scenario assumption", consequence: "Changes enterprise value and investor return outcomes."},
    ];
  }
  return [];
}

export function DecisionWorkspace({caseData}: {caseData: CaseData}) {
  const storageKey = `uil.workspace.v1.${caseData.caseId}`;
  const assumptions = useMemo(() => assumptionsFor(caseData), [caseData]);
  const [state, setState] = useState<WorkspaceState>(emptyState);
  const [draftObservation, setDraftObservation] = useState("");
  const [pending, setPending] = useState<{id: string; status: Exclude<AssumptionStatus, "UNREVIEWED">} | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const retained = window.localStorage.getItem(storageKey);
      setState(retained ? JSON.parse(retained) as WorkspaceState : emptyState());
    } catch {
      setState(emptyState());
    }
    setPending(null);
    setSaved(false);
  }, [storageKey]);

  const persist = (next: WorkspaceState) => {
    setState(next);
    try {
      window.localStorage?.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The workbench still supports an in-memory session when browser storage is disabled.
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  const confirmAssumption = () => {
    if (!pending) return;
    persist({...state, decisions: {...state.decisions, [pending.id]: pending.status}});
    setPending(null);
  };
  const addObservation = () => {
    const text = draftObservation.trim();
    if (!text) return;
    const next = {...state, observations: [...state.observations, {id: crypto.randomUUID(), text, createdAt: new Date().toISOString()}]};
    persist(next);
    setDraftObservation("");
  };
  const exportWorkspace = () => {
    const payload = {schema_version: "underwriting.local-workspace/v1", case_id: caseData.caseId, exported_at: new Date().toISOString(), ...state};
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], {type: "application/json"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${caseData.caseId}-analyst-workspace.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className="decision-workspace" aria-labelledby="decision-workspace-title">
    <header>
      <div><p className="kicker">Human judgment workspace</p><h2 id="decision-workspace-title">Record judgment without rewriting the model</h2></div>
      <p><strong>Private to this browser.</strong> Notes are stored locally and are not uploaded, encrypted, shared, or included in the synthetic case record.</p>
    </header>
    <div className="workspace-grid">
      <article className="notes-panel">
        <div><span>Private analyst note</span><small>{saved ? "Saved in this browser" : "Local draft"}</small></div>
        <textarea aria-label="Private analyst note" value={state.note} onChange={(event) => setState({...state, note: event.target.value})} placeholder="Record the judgment, contradiction, or follow-up that matters…" />
        <button onClick={() => persist(state)}>Save private note</button>
        <div className="observation-entry"><label htmlFor="human-observation">Human investment observation</label><textarea id="human-observation" value={draftObservation} onChange={(event) => setDraftObservation(event.target.value)} placeholder="Example: Management's churn explanation conflicts with the parent-account cohort view." /><button onClick={addObservation} disabled={!draftObservation.trim()}>Add observation</button></div>
        {state.observations.length > 0 && <ol className="observation-list">{state.observations.map((item) => <li key={item.id}><p>{item.text}</p><small>Human observation · {new Date(item.createdAt).toLocaleString()}</small></li>)}</ol>}
      </article>
      <article className="approval-registry">
        <div><span>Material assumption registry</span><small>Explicit analyst review</small></div>
        <p>Approval records judgment about a declared input. It does not alter the deterministic engine or authorize an investment.</p>
        <ul>{assumptions.map((assumption) => {
          const status = state.decisions[assumption.id] ?? "UNREVIEWED";
          const isPending = pending?.id === assumption.id;
          return <li key={assumption.id}>
            <div className="assumption-row"><div><strong>{assumption.label}</strong><span>{assumption.basis}</span></div><b>{assumption.value}</b><em data-status={status}>{status.toLowerCase()}</em></div>
            <p>{assumption.consequence}</p>
            {!isPending ? <div className="assumption-actions"><button onClick={() => setPending({id: assumption.id, status: "APPROVED"})}>Review approval</button><button onClick={() => setPending({id: assumption.id, status: "REJECTED"})}>Review rejection</button></div> : <div className="approval-confirm" role="group" aria-label={`Confirm ${pending.status.toLowerCase()} for ${assumption.label}`}><p>Confirm <strong>{pending.status.toLowerCase()}</strong> for “{assumption.label}”? This records analyst judgment only.</p><button onClick={confirmAssumption}>Confirm {pending.status.toLowerCase()}</button><button onClick={() => setPending(null)}>Cancel</button></div>}
          </li>;
        })}</ul>
        <button className="export-workspace" onClick={exportWorkspace}>Export local judgment record</button>
      </article>
    </div>
  </section>;
}
