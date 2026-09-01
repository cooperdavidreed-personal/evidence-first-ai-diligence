import {useEffect, useMemo, useRef, useState} from "react";
import {clientCapabilities, localMcpCommand, localMcpConfig, probeAdapter, type ConnectionState, type ExternalModelClient} from "./model-connection";

type RouteChoice = "EXTERNAL" | "IN_DESK";

function CopyButton({value, label}: {value: string; label: string}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
  }
  return <button type="button" className="copy-button" onClick={copy}>{copied ? "Copied" : label}</button>;
}

export function ModelConnectionButton({connection, onClick}: {connection: ConnectionState | null; onClick: () => void}) {
  const label = !connection ? "Connect model" : connection.state === "CONTRACT_VERIFIED" ? "Adapter contract verified" : connection.state === "SETUP_PREPARED" ? `${connection.label} setup` : "Connector requirement";
  return <button type="button" className="connection-button" onClick={onClick}><span className={`connection-dot ${connection?.state === "CONTRACT_VERIFIED" ? "connected" : ""}`} aria-hidden="true" />{label}</button>;
}

export function ModelConnectionDialog({current, onClose, onApply, fetcher = fetch}: {current: ConnectionState | null; onClose: () => void; onApply: (connection: ConnectionState) => void; fetcher?: typeof fetch}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState(1);
  const [route, setRoute] = useState<RouteChoice>("EXTERNAL");
  const [client, setClient] = useState<ExternalModelClient>("claude-code");
  const [workbenchPath, setWorkbenchPath] = useState("/absolute/path/to/evidence-first-ai-diligence/workbench");
  const [ledgerPath, setLedgerPath] = useState("/tmp/underwriting-desk-proposals.jsonl");
  const [endpoint, setEndpoint] = useState(current?.channel === "API_ADAPTER" ? current.endpoint : "");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const capability = clientCapabilities.find((item) => item.id === client)!;
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

  async function testAdapter() {
    setChecking(true); setCheckError("");
    try {
      const verifiedEndpoint = await probeAdapter(endpoint, fetcher);
      onApply({channel: "API_ADAPTER", client: "in-desk", label: "In-desk review", endpoint: verifiedEndpoint, state: "CONTRACT_VERIFIED"});
    } catch (error) { setCheckError(error instanceof Error ? error.message : "Connection check failed"); }
    finally { setChecking(false); }
  }

  function saveExternal() {
    if (capability.route === "LOCAL_MCP") onApply({channel: "LOCAL_MCP", client: capability.id, label: capability.label, state: "SETUP_PREPARED"});
    else onApply({channel: "REMOTE_MCP", client: capability.id, label: capability.label, state: "HOSTED_SERVER_REQUIRED"});
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {if (event.currentTarget === event.target) onClose();}}>
    <section ref={dialogRef} className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-heading">
      <header className="connection-dialog-header"><div><p className="eyebrow">Model connection · Step {step} of 3</p><h1 id="connection-heading">Use your model without giving it the books</h1></div><button type="button" className="dialog-close" aria-label="Close model connection" onClick={onClose}>×</button></header>
      <div className="connection-steps" aria-label="Connection progress"><span className={step >= 1 ? "active" : ""}>Approach</span><span className={step >= 2 ? "active" : ""}>Client</span><span className={step >= 3 ? "active" : ""}>Configure</span></div>

      {step === 1 ? <div className="connection-body">
        <section className="ownership-contract" aria-labelledby="ownership-heading"><p className="eyebrow">The reason this is not another chat window</p><h2 id="ownership-heading">One deal record. Replaceable models.</h2><div><article><h3>The Desk owns</h3><ul><li>Validated source package and lineage</li><li>Deterministic finance and policy tests</li><li>Approved assumptions and committee output</li></ul></article><article><h3>The model contributes</h3><ul><li>Countertheses and missing diligence</li><li>Questions tied to selected evidence</li><li>Draft language that waits for review</li></ul></article></div></section>
        <fieldset className="route-options"><legend>Where do you want to work?</legend><label className={route === "EXTERNAL" ? "selected" : ""}><input type="radio" name="route" checked={route === "EXTERNAL"} onChange={() => setRoute("EXTERNAL")} /><span><strong>In Claude, Codex, ChatGPT, or Grok</strong><small>The model calls governed Desk tools through MCP. Best when you want to stay in the model workspace.</small></span></label><label className={route === "IN_DESK" ? "selected" : ""}><input type="radio" name="route" checked={route === "IN_DESK"} onChange={() => setRoute("IN_DESK")} /><span><strong>Inside the Underwriting Desk</strong><small>The Desk sends only evidence you select to a server-side adapter after confirmation.</small></span></label></fieldset>
      </div> : null}

      {step === 2 ? <div className="connection-body">
        {route === "EXTERNAL" ? <fieldset className="client-options"><legend>Choose the model workspace</legend>{clientCapabilities.map((item) => <label key={item.id} className={client === item.id ? "selected" : ""}><input type="radio" name="client" checked={client === item.id} onChange={() => setClient(item.id)} /><span><strong>{item.label}</strong><small>{item.environment}</small><small>{item.note}</small></span><em>{item.availability === "AVAILABLE_NOW" ? "Local setup" : "Hosted server required"}</em></label>)}</fieldset> : <section className="adapter-explanation"><p className="eyebrow">Server-side adapter</p><h2>Keep provider credentials out of the browser</h2><p>Enter the HTTPS endpoint supplied by your workspace operator. The Desk tests the endpoint contract, stores the URL only for this browser session, and never asks for a Claude, OpenAI, or xAI key.</p><dl><div><dt>Sent</dt><dd>Only evidence summaries you select, after a confirmation screen.</dd></div><div><dt>Never sent</dt><dd>Uploaded file bytes, unselected evidence, approvals, or provider credentials.</dd></div></dl></section>}
      </div> : null}

      {step === 3 ? <div className="connection-body">
        {route === "IN_DESK" ? <section className="configuration-panel"><p className="eyebrow">In-desk review</p><h2>Verify the adapter contract</h2><label className="endpoint-field"><span>Adapter endpoint</span><input type="url" value={endpoint} onChange={(event) => {setEndpoint(event.target.value); setCheckError("");}} placeholder="https://model-gateway.example.com/review" autoComplete="off" /></label><p className="field-help">This is not a provider API URL and must not contain a token. Local development may use http://localhost.</p>{checkError ? <p className="connection-error" role="alert">{checkError}</p> : null}<button type="button" className="primary-button" disabled={checking || !endpoint.trim()} onClick={testAdapter}>{checking ? "Checking contract…" : "Verify adapter contract"}</button></section> : capability.route === "LOCAL_MCP" ? <section className="configuration-panel"><p className="eyebrow">{capability.label} · Local MCP</p><h2>Connect the included approval-gated server</h2><ol className="setup-sequence"><li><strong>Clone the public repository</strong><span>Node.js 20 or newer is required. The server reads only the two retained illustrative cases.</span><div className="code-box"><code>git clone https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence.git</code><CopyButton value="git clone https://github.com/cooperdavidreed-personal/evidence-first-ai-diligence.git" label="Copy command" /></div></li><li><strong>Enter the absolute workbench folder</strong><label className="endpoint-field"><span>Workbench folder</span><input value={workbenchPath} onChange={(event) => setWorkbenchPath(event.target.value)} spellCheck={false} /></label><label className="endpoint-field"><span>Local proposal ledger</span><input value={ledgerPath} onChange={(event) => setLedgerPath(event.target.value)} spellCheck={false} /></label><span>The ledger is an operator-enabled local handoff file. It is not canonical deal state.</span></li><li><strong>Run the client command</strong>{setup ? <div className="code-box"><code>{setup.command}</code><CopyButton value={setup.command} label="Copy command" /></div> : <p className="connection-error" role="alert">Enter valid absolute paths without quotes or shell-control characters.</p>}</li><li><strong>Bring proposals into the decision workflow</strong><span>Ask the model to use a proposal tool, then open a retained deal’s Diligence view and import the local JSONL ledger for named human review.</span></li></ol><details className="method-disclosure"><summary>View generic MCP JSON</summary>{setup ? <div className="code-box"><pre>{setup.config}</pre><CopyButton value={setup.config} label="Copy JSON" /></div> : null}</details><div className="permission-ledger"><div><span>7</span><p><strong>Read tools</strong>Deals, decisions, tests, issues, lineage, package search, and analyses.</p></div><div><span>3</span><p><strong>Proposal tools</strong>Observations, diligence requests, and memo sections.</p></div></div><p className="boundary-copy"><strong>Cannot change:</strong> finance mechanics, assumptions, thresholds, recommendations, approvals, or retained package state.</p></section> : <section className="configuration-panel hosted-required"><p className="eyebrow">{capability.label} · Remote MCP</p><h2>A hosted connector is required</h2><p>The public demo includes a local stdio MCP server, not a remotely reachable authenticated server. {capability.label} cannot connect to it directly from the web.</p><ol><li>Deploy the same narrow tool contract over HTTPS.</li><li>Add authentication and tenant isolation.</li><li>Register the endpoint inside {capability.label} and review its tool permissions.</li></ol><p><strong>Current state:</strong> Not implemented in this public slice. Saving this records the requirement; it does not claim a live connection.</p></section>}
      </div> : null}

      <footer className="connection-dialog-footer"><button type="button" className="secondary-button" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</button><div><span>No provider keys are collected by this page.</span>{step < 3 ? <button type="button" className="primary-button" onClick={() => setStep(step + 1)}>Continue</button> : route === "EXTERNAL" ? <button type="button" className="primary-button" disabled={capability.route === "LOCAL_MCP" && !setup} onClick={saveExternal}>{capability.route === "LOCAL_MCP" ? "Save setup plan" : "Record requirement"}</button> : null}</div></footer>
    </section>
  </div>;
}
