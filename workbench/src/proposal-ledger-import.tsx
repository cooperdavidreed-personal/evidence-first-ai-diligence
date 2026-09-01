import {useState} from "react";
import {importProposalLedger} from "./proposal-ledger";
import type {ModelProposal} from "./model-workflow";
import type {CaseData} from "./types";

export function ProposalLedgerImport({caseData, onImport}: {caseData: CaseData; onImport: (proposals: ModelProposal[]) => void}) {
  const [message, setMessage] = useState(""); const [error, setError] = useState(false);
  async function choose(file?: File) {
    if (!file) return;
    if (file.size > 1_000_000) {setError(true); setMessage("Proposal ledger exceeds the 1 MB local import limit."); return;}
    const result = importProposalLedger(await file.text(), caseData);
    if (result.proposals.length) onImport(result.proposals);
    setError(result.proposals.length === 0);
    setMessage(`${result.proposals.length} proposal${result.proposals.length === 1 ? "" : "s"} ready for human review.${result.dropped ? ` ${result.dropped} line${result.dropped === 1 ? " was" : "s were"} rejected.` : ""}`);
  }
  return <section className="panel ledger-import" aria-labelledby="proposal-ledger-heading"><div className="section-heading"><div><p className="eyebrow">Model handoff</p><h2 id="proposal-ledger-heading">Import proposal ledger</h2></div><span>Retained cases only</span></div><p>Bring locally generated MCP proposals into this deal. Deal digests and evidence references must match; imported items always return to <strong>Proposed</strong>.</p><label className="ledger-picker"><span>Choose JSONL ledger</span><input type="file" accept=".jsonl,.txt,application/json" onChange={(event) => void choose(event.target.files?.[0])} /><small>Local read only · 1 MB maximum · no upload</small></label>{message ? <p className={error ? "connection-error" : "ledger-result"} role="status">{message}</p> : null}</section>;
}
