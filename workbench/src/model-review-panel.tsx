import {useMemo, useState} from "react";
import type {ConnectionState} from "./model-connection";
import {reviewProposal, runEvidenceChallenge, type ModelProposal, type ModelReviewResult, type ModelTransport, type SelectedEvidence} from "./model-workflow";

export type ProposalUpdater = ModelProposal[] | ((current: ModelProposal[]) => ModelProposal[]);

function configuredTransport(): ModelTransport | undefined {
  const endpoint = import.meta.env.VITE_MODEL_REVIEW_URL as string | undefined;
  if (!endpoint) return undefined;
  return async (request) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(endpoint, {method: "POST", credentials: "omit", signal: controller.signal, headers: {"content-type": "application/json"}, body: JSON.stringify(request)});
      if (!response.ok) throw new Error(`Model review unavailable (${response.status})`);
      return response.json() as Promise<unknown>;
    } finally { window.clearTimeout(timer); }
  };
}

function proposalOriginLabel(proposal: ModelProposal) {
  if (proposal.origin === "IN_PRODUCT_RUNTIME") return "Hosted reviewer proposed";
  if (proposal.origin === "LOCAL_MCP_LEDGER") return "Local ledger proposed";
  return "Imported proposal · source unverified";
}

function proposalReceiptLabel(proposal: ModelProposal) {
  if (proposal.origin === "PORTABLE_IMPORT_UNVERIFIED") return "Portable import";
  return proposal.responseDigestSha256 ? `Response ${proposal.responseDigestSha256.slice(0, 12)}` : "Local ledger";
}

export function ModelReviewPanel({dealId, evidence, referenceLabels = {}, transport, connection, proposals: controlledProposals, onProposalsChange}: {dealId: string; evidence: SelectedEvidence[]; referenceLabels?: Record<string, string>; transport?: ModelTransport; connection?: ConnectionState | null; proposals?: ModelProposal[]; onProposalsChange?: (proposals: ProposalUpdater) => void}) {
  const configured = useMemo(() => configuredTransport(), []);
  const runtimeTransport = transport ?? configured;
  const providerLabel = transport
    ? connection?.channel === "API_ADAPTER" ? connection.label : "Test review adapter"
    : configured ? "Server-side review adapter" : "No review provider";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ModelReviewResult | null>(null);
  const [internalProposals, setInternalProposals] = useState<ModelProposal[]>([]);
  const proposals = controlledProposals ?? internalProposals;
  const [reviewer, setReviewer] = useState("");
  const [draftBodies, setDraftBodies] = useState<Record<string, string>>({});

  function updateProposals(next: ProposalUpdater) {
    if (onProposalsChange) onProposalsChange(next);
    else setInternalProposals(next);
  }

  const unavailableMessage = connection?.channel === "LOCAL_MCP" ? `${connection.label} setup is prepared for work outside the Desk. In-desk review still requires a compatible server-side adapter.` : connection?.channel === "REMOTE_MCP" ? `${connection.label} still requires a hosted, authenticated MCP server. No live connection is claimed.` : "Model review unavailable — no runtime credentials configured. Every deterministic workflow remains functional.";

  async function run() {
    setRunning(true);
    try {
      const response = await runEvidenceChallenge(dealId, evidence.filter((item) => selected.has(item.id)), runtimeTransport);
      setResult(response); updateProposals((current) => [...current, ...response.proposals].filter((proposal, index, items) => items.findIndex((candidate) => candidate.proposalId === proposal.proposalId) === index)); setConfirming(false);
    } finally { setRunning(false); }
  }
  function decide(proposal: ModelProposal, decision: "ACCEPTED" | "REJECTED") {
    updateProposals((current) => current.map((item) => item.proposalId === proposal.proposalId ? reviewProposal(item, decision, reviewer, draftBodies[item.proposalId] ?? item.body) : item));
  }

  return <section className="panel model-review" aria-labelledby="model-review-heading">
    <div className="section-heading"><div><p className="eyebrow">Controlled model job</p><h2 id="model-review-heading">Challenge selected evidence</h2></div><span>{runtimeTransport ? "Proposal only" : "Inference unavailable"}</span></div>
    <p>{runtimeTransport ? <><strong>{providerLabel}.</strong> Select the exact evidence subset to send. The response cannot change metrics, assumptions, thresholds, package state, or the analytical posture.</> : unavailableMessage}</p>
    {runtimeTransport ? <><fieldset className="evidence-selector"><legend>Evidence to challenge</legend>{evidence.map((item) => <label key={item.id}><input type="checkbox" checked={selected.has(item.id)} onChange={(event) => setSelected((current) => {const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next;})} /><span><strong>{item.title}</strong><small>{item.displayValue} · {item.summary}</small></span></label>)}</fieldset>{confirming ? <div className="model-confirmation" role="alert"><strong>Confirm selected evidence transfer</strong><p>Only {selected.size} selected evidence {selected.size === 1 ? "item" : "items"} will be sent to {providerLabel}. No uploaded file bytes are included.</p><div><button type="button" className="primary-button" onClick={run} disabled={running}>{running ? "Reviewing…" : "Send selected evidence"}</button><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Cancel</button></div></div> : <button type="button" className="primary-button" disabled={selected.size === 0} onClick={() => setConfirming(true)}>Challenge evidence</button>}{result ? <p className={`model-result model-result-${result.status.toLowerCase()}`} role="status">{result.message}{result.droppedItems ? ` ${result.droppedItems} uncited or invalid items were dropped.` : ""}</p> : null}</> : null}
    {proposals.length ? <div className="proposal-list"><label className="search-field"><span>Human reviewer</span><input value={reviewer} maxLength={120} onChange={(event) => setReviewer(event.target.value)} placeholder="Enter reviewer name" /></label>{proposals.map((proposal) => <article key={proposal.proposalId}><div><span className="source-tag">{proposalOriginLabel(proposal)}</span><span className={`status status-${proposal.state.toLowerCase()}`}>{proposal.state.toLowerCase()}</span></div><h3>{proposal.title}</h3>{proposal.state === "PROPOSED" ? <label className="proposal-editor"><span>Review or edit proposal</span><textarea aria-label={`Edit ${proposal.title}`} maxLength={2000} value={draftBodies[proposal.proposalId] ?? proposal.body} onChange={(event) => setDraftBodies((current) => ({...current, [proposal.proposalId]: event.target.value}))} /></label> : <><p>{proposal.body}</p>{proposal.humanEdited && proposal.originalBody ? <details className="proposal-diff"><summary>Compare human-reviewed text to model draft</summary><div><section><span>Original model draft</span><p>{proposal.originalBody}</p></section><section><span>Human-reviewed text</span><p>{proposal.body}</p></section></div></details> : null}</>}<small>Cites: {proposal.evidenceRefs.map((id) => referenceLabels[id] ?? evidence.find((item) => item.id === id)?.title ?? `Unrecognized reference: ${id}`).join(", ")} · {proposal.modelFamily ? `${proposal.modelFamily} · ` : ""}Request {proposal.requestDigestSha256.slice(0, 12)} · {proposalReceiptLabel(proposal)}</small>{proposal.limitations ? <small>{proposal.limitations}</small> : null}{proposal.state === "PROPOSED" ? <footer><button type="button" disabled={!reviewer.trim() || !(draftBodies[proposal.proposalId] ?? proposal.body).trim()} onClick={() => decide(proposal, "ACCEPTED")}>Accept proposal</button><button type="button" disabled={!reviewer.trim()} onClick={() => decide(proposal, "REJECTED")}>Reject</button></footer> : <footer>{proposal.humanEdited ? "Edited and " : ""}{proposal.state.toLowerCase()} by {proposal.humanActor}{proposal.reviewedAt ? ` · ${new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric"}).format(new Date(proposal.reviewedAt))}` : ""}</footer>}</article>)}</div> : null}
  </section>;
}
