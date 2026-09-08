import {useEffect, useRef, useState} from "react";
import {digestChallengePayloadSync, runEvidenceChallenge, validateSelectedEvidence, type ModelProposal, type SelectedEvidence} from "./model-workflow";

async function request(query = "", body?: unknown) {
  const response = await fetch(`/__desk/review${query}`, {method: body ? "POST" : "GET", headers: {"x-desk-local": "1", "content-type": "application/json"}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000)});
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Local review is unavailable. Start the Desk with DESK_LOCAL_STORE configured.");
  return response.json();
}

export function localProposalIsCurrent(proposal: ModelProposal, evidence: SelectedEvidence[], reviewBasisId?: string) {
  if (reviewBasisId !== undefined && proposal.reviewBasisId !== reviewBasisId) return false;
  return proposal.requestEvidence.every((item) => {
    const current = evidence.find((candidate) => candidate.id === item.id);
    return current && current.title === item.title && current.displayValue === item.displayValue && current.summary === item.summary;
  });
}

export function LocalReview({dealId, evidence, onCollect, onAvailable, initialEvidenceId, reviewBasisId}: {dealId: string; evidence: SelectedEvidence[]; onCollect: (proposals: ModelProposal[]) => void; onAvailable: (available: boolean) => void; initialEvidenceId?: string; reviewBasisId?: string}) {
  const [available, setAvailable] = useState(false);
  const [selected, setSelected] = useState<string[]>(initialEvidenceId ? [initialEvidenceId] : []);
  const [prepared, setPrepared] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {let active = true; request().then((value) => {if (active) {setAvailable(value.available === true); onAvailable(value.available === true);}}).catch(() => {}); return () => {active = false;};}, [onAvailable]);
  useEffect(() => {setSelected(initialEvidenceId ? [initialEvidenceId] : []); setPrepared(null); setNotice("");}, [dealId, initialEvidenceId]);
  const subset = evidence.filter((item) => selected.includes(item.id));
  const digest = digestChallengePayloadSync(dealId, subset, reviewBasisId);
  const latestDigest = useRef(digest); latestDigest.current = digest;
  const stale = prepared !== null && prepared !== digest;
  async function act(collect: boolean) {
    setBusy(true);
    try {
      validateSelectedEvidence(dealId, subset);
      if (!collect) {
        await request("", {job: "challenge_selected_evidence", deal_id: dealId, evidence: subset, output_contract: "underwriting-evidence-challenge/v1", request_digest_sha256: digest, ...(reviewBasisId ? {review_basis_id: reviewBasisId} : {})});
        setPrepared(digest); setNotice("Evidence prepared locally. Ask your connected model to read this review and submit its proposals, then collect them here.");
      } else {
        const result = await request(`?deal=${encodeURIComponent(dealId)}&digest=${digest}`);
        if (!result.response) {setNotice("No response yet. Submit the review from your connected model, then collect again."); return;}
        const review = await runEvidenceChallenge(dealId, subset, async () => result.response, reviewBasisId);
        if (latestDigest.current !== digest) throw new Error("The review basis changed while collecting. Prepare the current basis again.");
        onCollect(review.proposals.map((proposal) => ({...proposal, origin: "LOCAL_MCP_REVIEW", limitations: "Received through the local MCP review store. Model identity is self-reported; only the selected evidence snapshot was shared."})));
        setNotice(`${review.message}${review.droppedItems ? ` ${review.droppedItems} invalid items were excluded.` : ""}`);
      }
    } catch (error) {setNotice(error instanceof Error ? error.message : "Local review failed");}
    finally {setBusy(false);}
  }
  if (!available) return null;
  return <section className="local-review-desk" aria-labelledby="local-review-title">
    <header><div><p className="eyebrow">Your model subscription · local MCP</p><h3 id="local-review-title">Prepare an evidence review</h3><p>Select up to eight figures for challenge. Only the selected text is shared; proposals return here for your decision.</p></div><span>{subset.length} / 8 selected</span></header>
    <div className="local-review-layout"><fieldset><legend>Evidence available to the model</legend>{evidence.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 8} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{item.title}</strong><small>{item.summary}</small></span><b>{item.displayValue}</b></label>)}</fieldset>
    <aside><h4>Review handoff</h4><ol><li>Prepare the selected evidence.</li><li>In your MCP client, ask: “Read the prepared review for {dealId}, challenge the investment case, and submit evidence-linked proposals.”</li><li>Collect and review the response below.</li></ol><button type="button" className="primary-button" disabled={busy || subset.length === 0} onClick={() => act(false)}>Prepare selected evidence</button><button type="button" disabled={busy || !prepared || stale} onClick={() => act(true)}>Collect model proposals</button>{stale ? <p role="status">The selected evidence or underwriting basis changed. Prepare the evidence again.</p> : null}<p role="status">{notice}</p><small>This is an explicit evidence snapshot. Private notes, full workbooks, and the complete deal state remain outside this handoff.</small></aside></div>
  </section>;
}
