import {useEffect, useMemo, useRef, useState} from "react";
import {clientCapabilities, localMcpCommand, localMcpConfig, type ClientCapability, type ConnectionState, type LocalModelClient} from "./model-connection";

type RouteChoice = "LOCAL_MCP" | "IN_DESK";
const localCapabilities = clientCapabilities.filter((item): item is Extract<ClientCapability, {route: "LOCAL_MCP"}> => item.route === "LOCAL_MCP");

function CopyButton({value, label}: {value: string; label: string}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
  }
  return <button type="button" className="copy-button" onClick={copy}>{copied ? "Copied" : label}</button>;
}

export function ModelConnectionButton({connection, onClick}: {connection: ConnectionState | null; onClick: () => void}) {
  const label = !connection ? "Model options" : connection.state === "CONTRACT_VERIFIED" ? "Review adapter verified" : connection.state === "SETUP_PREPARED" ? `${connection.label} setup` : "Connector requirement";
  return <button type="button" className="connection-button" aria-label={label} onClick={onClick}><span className={`connection-dot ${connection?.state === "CONTRACT_VERIFIED" ? "connected" : ""}`} aria-hidden="true" /><span className="connection-label">{label}</span></button>;
}

export function ModelConnectionDialog({current: _current, onClose, onApply}: {current: ConnectionState | null; onClose: () => void; onApply: (connection: ConnectionState) => void}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState(1);
  const [route, setRoute] = useState<RouteChoice>("IN_DESK");
  const [client, setClient] = useState<LocalModelClient>("claude-code");
  const [workbenchPath, setWorkbenchPath] = useState("/absolute/path/to/evidence-first-ai-diligence/workbench");
  const [ledgerPath, setLedgerPath] = useState("/tmp/underwriting-desk-proposals.jsonl");
  const capability = localCapabilities.find((item) => item.id === client)!;
  const setup = useMemo(() => {
    if (capability.route !== "LOCAL_MCP") return null;
    try { return {command: localMcpCommand(capability.id, workbenchPath, ledgerPath), config: localMcpConfig(workbenchPath, ledgerPath)}; }
    catch { return null; }
  }, [capability, ledgerPath, workbenchPath]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>('[aria-label="Close model connection"]')?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  function saveExternal() {
    onApply({channel: "LOCAL_MCP", client: capability.id, label: capability.label, state: "SETUP_PREPARED"});
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {if (event.currentTarget === event.target) onClose();}}>
    <section ref={dialogRef} className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-heading">
      <header className="connection-dialog-header"><div><p className="eyebrow">Model options · Step {step} of 3</p><h1 id="connection-heading">Governed review, without handing over the case</h1></div><button type="button" className="dialog-close" aria-label="Close model connection" onClick={onClose}>×</button></header>
      <div className="connection-steps" aria-label="Connection progress"><span className={step >= 1 ? "active" : ""}>Approach</span><span className={step >= 2 ? "active" : ""}>Client</span><span className={step >= 3 ? "active" : ""}>Configure</span></div>

      {step === 1 ? <div className="connection-body" tabIndex={0} aria-label="Connection options">
        <section className="ownership-contract" aria-labelledby="ownership-heading"><p className="eyebrow">The reason this is not another chat window</p><h2 id="ownership-heading">One deal record. Replaceable models.</h2><div><article><h3>The Desk owns</h3><ul><li>Validated source package and lineage</li><li>Deterministic finance and policy tests</li><li>Approved assumptions and committee output</li></ul></article><article><h3>The model contributes</h3><ul><li>Countertheses and missing diligence</li><li>Questions tied to selected evidence</li><li>Draft language that waits for review</li></ul></article></div></section>
        <fieldset className="route-options"><legend>Choose a review route</legend><label className={route === "IN_DESK" ? "selected" : ""}><input type="radio" name="route" checked={route === "IN_DESK"} onChange={() => setRoute("IN_DESK")} /><span><strong>Built-in evidence challenge</strong><small>Use the bounded Desk workflow when the hosted reviewer is available. Only evidence you select is sent after confirmation.</small></span></label><label className={route === "LOCAL_MCP" ? "selected" : ""}><input type="radio" name="route" checked={route === "LOCAL_MCP"} onChange={() => setRoute("LOCAL_MCP")} /><span><strong>Advanced local MCP</strong><small>Use the included approval-gated tools from Claude Code or Codex on your own machine.</small></span></label></fieldset>
      </div> : null}

      {step === 2 ? <div className="connection-body" tabIndex={0} aria-label="Connection boundary">
        {route === "LOCAL_MCP" ? <fieldset className="client-options"><legend>Choose the local model workspace</legend>{localCapabilities.map((item) => <label key={item.id} className={client === item.id ? "selected" : ""}><input type="radio" name="client" checked={client === item.id} onChange={() => setClient(item.id)} /><span><strong>{item.label}</strong><small>{item.environment}</small><small>{item.note}</small></span><em>Advanced local setup</em></label>)}</fieldset> : <section className="adapter-explanation"><p className="eyebrow">Built-in review</p><h2>Keep provider credentials out of the browser</h2><p>Open a deal, choose Diligence, then Model review. The public deployment uses a server-side review route and never asks for your Claude, OpenAI, or xAI key.</p><dl><div><dt>Sent</dt><dd>Only evidence summaries you select, after a confirmation screen.</dd></div><div><dt>Never sent</dt><dd>Uploaded file bytes, unselected evidence, approvals, or provider credentials.</dd></div></dl></section>}
      </div> : null}

      {step === 3 ? <div className="connection-body" tabIndex={0} aria-label="Connection verification">
        {route === "IN_DESK" ? <section className="configuration-panel"><p className="eyebrow">Availability checked when used</p><h2>Attempt a bounded challenge from Diligence</h2><p>The deterministic and human workflows remain available if the hosted reviewer is temporarily unavailable. A proposal is not claimed until the server returns it successfully.</p><ol className="setup-sequence"><li><strong>Select evidence</strong><span>Choose only the metrics the reviewer may see.</span></li><li><strong>Confirm the transfer</strong><span>The confirmation lists how many evidence summaries will be sent. Uploaded files remain in the browser.</span></li><li><strong>Review the proposal</strong><span>A successful response begins as proposed and cites the selected evidence.</span></li><li><strong>Make the human decision</strong><span>A named reviewer must accept, reject, or edit before language can enter the memo.</span></li></ol><p className="boundary-copy"><strong>Cannot change:</strong> finance mechanics, assumptions, thresholds, issues, recommendations, or approvals.</p></section> : <section className="configuration-panel"><p className="eyebrow">{capability.label} · Local MCP</p><h2>Connect the included approval-gated server</h2><ol className="setup-sequence"><li><strong>Clone the public repository</strong><span>Node.js 20 or newer is required. The server reads only the two retained illustrative cases.</span><div className="code-box"><code>git clone https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence.git</code><CopyButton value="git clone https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence.git" label="Copy command" /></div></li><li><strong>Enter the absolute workbench folder</strong><label className="endpoint-field"><span>Workbench folder</span><input value={workbenchPath} onChange={(event) => setWorkbenchPath(event.target.value)} spellCheck={false} /></label><label className="endpoint-field"><span>Local proposal ledger</span><input value={ledgerPath} onChange={(event) => setLedgerPath(event.target.value)} spellCheck={false} /></label><span>The ledger is an operator-enabled local handoff file. It is not canonical deal state.</span></li><li><strong>Run the client command</strong>{setup ? <div className="code-box"><code>{setup.command}</code><CopyButton value={setup.command} label="Copy command" /></div> : <p className="connection-error" role="alert">Enter valid absolute paths without quotes or shell-control characters.</p>}</li><li><strong>Bring proposals into the decision workflow</strong><span>Ask the model to use a proposal tool, then open a retained deal’s Diligence view and import the local JSONL ledger for named human review.</span></li></ol><details className="method-disclosure"><summary>View generic MCP JSON</summary>{setup ? <div className="code-box"><pre>{setup.config}</pre><CopyButton value={setup.config} label="Copy JSON" /></div> : null}</details><div className="permission-ledger"><div><span>7</span><p><strong>Read tools</strong>Deals, decisions, tests, issues, lineage, package search, and analyses.</p></div><div><span>3</span><p><strong>Proposal tools</strong>Observations, diligence requests, and memo sections.</p></div></div><p className="boundary-copy"><strong>Cannot change:</strong> finance mechanics, assumptions, thresholds, recommendations, approvals, or retained package state.</p></section>}
      </div> : null}

      <footer className="connection-dialog-footer"><button type="button" className="secondary-button" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</button><div><span>No provider keys are collected by this page.</span>{step < 3 ? <button type="button" className="primary-button" onClick={() => setStep(step + 1)}>Continue</button> : route === "LOCAL_MCP" ? <button type="button" className="primary-button" disabled={!setup} onClick={saveExternal}>Save setup plan</button> : <button type="button" className="primary-button" onClick={onClose}>Done</button>}</div></footer>
    </section>
  </div>;
}
