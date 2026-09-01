import {useMemo, useState} from "react";
import type {ConnectionState} from "./model-connection";
import {reviewProposal, runEvidenceChallenge, type ModelProposal, type ModelReviewResult, type ModelTransport, type SelectedEvidence} from "./model-workflow";

function configuredTransport(): ModelTransport | undefined {
  const endpoint = import.meta.env.VITE_MODEL_REVIEW_URL as string | undefined;
  if (!endpoint) return undefined;
  return async (request) => {
    const response = await fetch(endpoint, {method: "POST", credentials: "omit", headers: {"content-type": "application/json"}, body: JSON.stringify(request)});
    if (!response.ok) throw new Error(`Model review unavailable (${response.status})`);
    return response.json() as Promise<unknown>;
  };
}

export function ModelReviewPanel({evidence, transport, connection, proposals: controlledProposals, onProposalsChange}: {evidence: SelectedEvidence[]; transport?: ModelTransport; connection?: ConnectionState | null; proposals?: ModelProposal[]; onProposalsChange?: (proposals: ModelProposal[]) => void}) {
  const runtimeTransport = useMemo(() => transport ?? configuredTransport(), [transport]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ModelReviewResult | null>(null);
  const [internalProposals, setInternalProposals] = useState<ModelProposal[]>([]);
  const proposals = controlledProposals ?? internalProposals;
  const [reviewer, setReviewer] = useState("");

  function updateProposals(next: ModelProposal[]) {
    if (onProposalsChange) onProposalsChange(next);
    else setInternalProposals(next);
  }

  const unavailableMessage = connection?.channel === "LOCAL_MCP" ? `${connection.label} setup is prepared for work outside the Desk. In-desk review still requires a compatible server-side adapter.` : connection?.channel === "REMOTE_MCP" ? `${connection.label} still requires a hosted, authenticated MCP server. No live connection is claimed.` : "Model review unavailable — no runtime credentials configured. Every deterministic workflow remains functional.";

  async function run() {
    setRunning(true);
    try {
      const response = await runEvidenceChallenge(evidence.filter((item) => selected.has(item.id)), runtimeTransport);
      const merged = [...proposals, ...response.proposals].filter((proposal, index, items) => items.findIndex((candidate) => candidate.proposalId === proposal.proposalId) === index);
      setResult(response); updateProposals(merged); setConfirming(false);
    } finally { setRunning(false); }
  }
  function decide(proposal: ModelProposal, decision: "ACCEPTED" | "REJECTED") {
    updateProposals(proposals.map((item) => item.proposalId === proposal.proposalId ? reviewProposal(item, decision, reviewer) : item));
  }

  return <section className="panel model-review" aria-labelledby="model-review-heading">
    <div className="section-heading"><div><p className="eyebrow">Controlled model job</p><h2 id="model-review-heading">Challenge selected evidence</h2></div><span>{runtimeTransport ? "Proposal only" : "Inference unavailable"}</span></div>
    <p>{runtimeTransport ? "Select the exact evidence subset to send. The response cannot change metrics, assumptions, thresholds, package state, or the analytical posture." : unavailableMessage}</p>
    {runtimeTransport ? <><fieldset className="evidence-selector"><legend>Evidence to challenge</legend>{evidence.map((item) => <label key={item.id}><input type="checkbox" checked={selected.has(item.id)} onChange={(event) => setSelected((current) => {const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next;})} /><span><strong>{item.title}</strong><small>{item.displayValue} · {item.summary}</small></span></label>)}</fieldset>{confirming ? <div className="model-confirmation" role="alert"><strong>Confirm selected evidence transfer</strong><p>Only {selected.size} selected evidence {selected.size === 1 ? "item" : "items"} will be sent to the configured inference endpoint. No uploaded file bytes are included.</p><div><button type="button" className="primary-button" onClick={run} disabled={running}>{running ? "Reviewing…" : "Send selected evidence"}</button><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Cancel</button></div></div> : <button type="button" className="primary-button" disabled={selected.size === 0} onClick={() => setConfirming(true)}>Challenge evidence</button>}{result ? <p className={`model-result model-result-${result.status.toLowerCase()}`} role="status">{result.message}{result.droppedItems ? ` ${result.droppedItems} uncited or invalid items were dropped.` : ""}</p> : null}</> : null}
    {proposals.length ? <div className="proposal-list"><label className="search-field"><span>Human reviewer</span><input value={reviewer} maxLength={120} onChange={(event) => setReviewer(event.target.value)} placeholder="Enter reviewer name" /></label>{proposals.map((proposal) => <article key={proposal.proposalId}><div><span className="source-tag">Model proposed</span><span className={`status status-${proposal.state.toLowerCase()}`}>{proposal.state.toLowerCase()}</span></div><h3>{proposal.title}</h3><p>{proposal.body}</p><small>Cites: {proposal.evidenceRefs.map((id) => evidence.find((item) => item.id === id)?.title ?? id).join(", ")}</small>{proposal.state === "PROPOSED" ? <footer><button type="button" disabled={!reviewer.trim()} onClick={() => decide(proposal, "ACCEPTED")}>Accept proposal</button><button type="button" disabled={!reviewer.trim()} onClick={() => decide(proposal, "REJECTED")}>Reject</button></footer> : <footer>Reviewed by {proposal.humanActor}</footer>}</article>)}</div> : null}
  </section>;
}
