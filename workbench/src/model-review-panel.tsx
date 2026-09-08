import {ProposalReviewDetail, proposalHasSupportedReferences, type ProposalMemoUse} from "./proposal-review-detail";
import {useMemo, useState} from "react";
import type {ConnectionState} from "./model-connection";
import {LocalReview, localProposalIsCurrent} from "./local-review";
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

export function ModelReviewPanel({dealId, evidence, referenceLabels = {}, transport, connection, hostedEligible = true, unavailableReason, proposals: controlledProposals, onProposalsChange, initialEvidenceId, memoUses, reviewBasisId}: {dealId: string; evidence: SelectedEvidence[]; referenceLabels?: Record<string, string>; transport?: ModelTransport; connection?: ConnectionState | null; hostedEligible?: boolean; unavailableReason?: string; proposals?: ModelProposal[]; onProposalsChange?: (proposals: ProposalUpdater) => void; initialEvidenceId?: string; memoUses?: ProposalMemoUse[]; reviewBasisId?: string}) {
  const [localAvailable, setLocalAvailable] = useState(false);
  const configured = useMemo(() => configuredTransport(), []);
  const runtimeTransport = !localAvailable && hostedEligible ? transport ?? configured : undefined;
  const providerLabel = transport
    ? connection?.channel === "API_ADAPTER" ? connection.label : "Test review adapter"
    : configured ? "Server-side review adapter" : "No review provider";
  const [selected, setSelected] = useState<Set<string>>(new Set(initialEvidenceId ? [initialEvidenceId] : []));
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ModelReviewResult | null>(null);
  const [internalProposals, setInternalProposals] = useState<ModelProposal[]>([]);
  const proposals = controlledProposals ?? internalProposals;
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [reviewSearch, setReviewSearch] = useState("");
  const visibleProposals = proposals.filter((proposal) => (reviewFilter === "ALL" || proposal.state === reviewFilter) && `${proposal.title} ${proposal.body} ${proposal.humanActor ?? ""}`.toLowerCase().includes(reviewSearch.toLowerCase()));
  const [reviewer, setReviewer] = useState("");
  const [draftBodies, setDraftBodies] = useState<Record<string, string>>({});

  function updateProposals(next: ProposalUpdater) {
    if (onProposalsChange) onProposalsChange(next);
    else setInternalProposals(next);
  }

  const unavailableMessage = !hostedEligible
    ? unavailableReason ?? "Hosted review is limited to the retained synthetic cases and the included Northstar sample. This package remains available for deterministic analysis and human work."
    : connection?.channel === "LOCAL_MCP" ? `${connection.label} setup is prepared for work outside the Desk. In-desk review still requires a compatible server-side adapter.` : connection?.channel === "REMOTE_MCP" ? `${connection.label} still requires a hosted, authenticated MCP server. No live connection is claimed.` : "Model review unavailable — no runtime credentials configured. Every deterministic workflow remains functional.";

  async function run() {
    setRunning(true);
    try {
      const response = await runEvidenceChallenge(dealId, evidence.filter((item) => selected.has(item.id)), runtimeTransport, reviewBasisId);
      setResult(response); updateProposals((current) => [...current, ...response.proposals].filter((proposal, index, items) => items.findIndex((candidate) => candidate.proposalId === proposal.proposalId) === index)); setConfirming(false);
    } finally { setRunning(false); }
  }
  function decide(proposal: ModelProposal, decision: "ACCEPTED" | "REJECTED") {
    if (decision === "ACCEPTED" && (!localProposalIsCurrent(proposal, evidence, reviewBasisId) || !proposalHasSupportedReferences(proposal, evidence, referenceLabels))) return;
    updateProposals((current) => current.map((item) => item.proposalId === proposal.proposalId ? reviewProposal(item, decision, reviewer, draftBodies[item.proposalId] ?? item.body) : item));
  }

  return <section className="panel model-review" aria-labelledby="model-review-heading">
    <LocalReview reviewBasisId={reviewBasisId} initialEvidenceId={initialEvidenceId} onAvailable={setLocalAvailable} key={dealId} dealId={dealId} evidence={evidence} onCollect={(incoming) => updateProposals((current) => [...current, ...incoming].filter((item, index, items) => items.findIndex((candidate) => candidate.proposalId === item.proposalId) === index))} />
    <div className="section-heading"><div><p className="eyebrow">Governed model proposal</p><h2 id="model-review-heading">{localAvailable ? "Review returned proposals" : "Challenge selected evidence"}</h2></div><span>{runtimeTransport || localAvailable ? "Returns proposals only · a named reviewer accepts or rejects each one" : "Review provider unavailable"}</span></div>
    {localAvailable ? <p>Accept, edit, or reject each proposal. Acceptance records your judgment; it does not change financial inputs.</p> : runtimeTransport ? <p><strong>{providerLabel}.</strong> Select the exact evidence subset to send. The response cannot change metrics, assumptions, thresholds, package state, or the analytical posture.</p> : <div className="model-unavailable"><i aria-hidden="true" /><p>{unavailableMessage}</p></div>}
    {runtimeTransport ? <><fieldset className="evidence-selector"><legend>Evidence to challenge</legend>{evidence.map((item) => <label key={item.id}><input type="checkbox" checked={selected.has(item.id)} onChange={(event) => setSelected((current) => {const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next;})} /><span><strong>{item.title}</strong><small>{item.displayValue} · {item.summary}</small></span></label>)}</fieldset>{confirming ? <div className="model-confirmation" role="alert"><strong>Confirm selected evidence transfer</strong><p>Only {selected.size} selected evidence {selected.size === 1 ? "item" : "items"} will be sent to {providerLabel}. No uploaded file bytes are included.</p><div><button type="button" className="primary-button" onClick={run} disabled={running}>{running ? "Reviewing…" : "Send selected evidence"}</button><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Cancel</button></div></div> : <button type="button" className="primary-button" disabled={selected.size === 0} onClick={() => setConfirming(true)}>Challenge evidence</button>}{result ? <p className={`model-result model-result-${result.status.toLowerCase()}`} role="status">{result.message}{result.droppedItems ? ` ${result.droppedItems} uncited or invalid items were dropped.` : ""}</p> : null}</> : null}
    {proposals.length ? <div className="proposal-list"><div className="proposal-review-toolbar"><nav aria-label="Proposal review status">{["ALL", "PROPOSED", "ACCEPTED", "REJECTED"].map((filter) => <button type="button" key={filter} aria-pressed={reviewFilter === filter} onClick={() => setReviewFilter(filter)}>{filter === "ALL" ? "All" : filter === "PROPOSED" ? "Awaiting review" : filter === "ACCEPTED" ? "Accepted" : "Rejected"} · {filter === "ALL" ? proposals.length : proposals.filter((item) => item.state === filter).length}</button>)}</nav><input type="search" aria-label="Search model proposals" placeholder="Find a proposal or reviewer…" value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} /></div>{!visibleProposals.length ? <p role="status">No proposals match this view. Change the filter or clear the search.</p> : null}<label className="search-field"><span>Human reviewer</span><input value={reviewer} maxLength={120} onChange={(event) => setReviewer(event.target.value)} placeholder="Enter reviewer name" /></label>{visibleProposals.map(proposal => <ProposalReviewDetail reviewBasisId={reviewBasisId} key={proposal.proposalId} proposal={proposal} evidence={evidence} referenceLabels={referenceLabels} draft={draftBodies[proposal.proposalId] ?? proposal.body} onDraft={body => setDraftBodies(current => ({...current, [proposal.proposalId]: body}))} reviewer={reviewer} onDecide={decision => decide(proposal, decision)} memoUses={memoUses} />)}</div> : null}
  </section>;
}
