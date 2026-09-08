import {downloadText} from "./download";
import {useEffect, useRef, useState} from "react";
import type {ConnectionState} from "./model-connection";
import {readDeskSetup, clientConfig, clientSetupGuide, contactAssessment, setupKit, setupClients, setupPrompt, type DeskSetupStatus, type SetupClient} from "./desk-setup";

function CopyButton({value, label}: {value: string; label: string}) {
  const [notice, setNotice] = useState("");
  async function copy() {
    try {if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(value); setNotice("Copied");}
    catch {setNotice("Select and copy the text below");}
  }
  return <span><button type="button" className="primary-button" onClick={copy}>{label}</button><small role="status">{notice}</small></span>;
}
export function ModelConnectionButton({connection: _connection, onClick}: {connection: ConnectionState | null; onClick: () => void}) {
  return <button type="button" className="connection-button" onClick={()=>{if((window as unknown as {__DESK_DESKTOP__?:boolean}).__DESK_DESKTOP__)window.dispatchEvent(new Event("desk-open-setup"));else onClick();}}>Connect model</button>;
}
export function ModelConnectionDialog({current, onClose, onApply}: {current: ConnectionState | null; onClose: () => void; onApply: (connection: ConnectionState) => void}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [client, setClient] = useState<SetupClient>(current?.channel === "LOCAL_MCP" ? current.client : "claude-desktop");
  const [status, setStatus] = useState<DeskSetupStatus | null>(null);
  const [notice, setNotice] = useState("Checking the local Desk…");
  const [checking, setChecking] = useState(false);
  useEffect(() => {let active = true; readDeskSetup().then((value) => {if (active) {setStatus(value); setNotice("Local Desk detected. Your connection settings are ready.");}}).catch((error) => {if (active) setNotice(error.message);}); return () => {active = false;};}, []);
  async function check() {
    setChecking(true);
    try {const value = await readDeskSetup(); setStatus(value); setNotice(value.connection ? "Client contact recorded. Confirm the review tools are available in your model app." : "The Desk is running, but no model client has contacted this review store yet. Finish setup and restart the client.");}
    catch (error) {setNotice(error instanceof Error ? error.message : "Connection check failed");}
    finally {setChecking(false);}
  }
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

  const prompt = setupPrompt(client, status);
  const assessment = contactAssessment(status);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {if (event.currentTarget === event.target) onClose();}}>
    <section ref={dialogRef} className="connection-dialog simple-connect" role="dialog" aria-modal="true" aria-labelledby="connection-heading">
      <header className="connection-dialog-header"><div><p className="eyebrow">Use your existing subscription</p><h1 id="connection-heading">Connect your model</h1><p>Prepare evidence in the Desk. Work in your model app. Review its proposals here.</p></div><button type="button" className="dialog-close" aria-label="Close model connection" onClick={onClose}>×</button></header>
      <div className="connection-body">
        <fieldset className="setup-client-grid"><legend>1. Choose your desktop app</legend>{setupClients.map((item) => <label key={item.id} data-selected={client === item.id}><input type="radio" name="client" checked={client === item.id} onChange={() => setClient(item.id)} /><span><strong>{item.label}</strong><small>{item.note}</small></span></label>)}</fieldset>
        <section className="setup-assistance"><h2>2. Let your assistant handle setup</h2><p>Paste this prompt into a session that can work on this computer. It includes the detected paths and instructions to preserve your other settings.</p><CopyButton value={prompt} label="Copy setup prompt" /><details><summary>Read the setup prompt</summary><textarea aria-label="Setup prompt" readOnly value={prompt} rows={9} /></details></section>
        <section className="setup-check"><div><h2>3. Check the connection</h2><p role="status">{notice}</p><div className="connection-assessment"><strong>{assessment.label}</strong><p>{assessment.detail}</p></div>{status?.connection ? <p>Last contact: {status.connection.clientName} · {new Date(status.connection.initializedAt).toLocaleString()}. This is a recorded handshake, not continuous online status or authenticated model identity.</p> : null}</div><button type="button" className="secondary-button" disabled={checking} onClick={check}>{checking ? "Checking…" : "Check connection"}</button></section>
        <details className="setup-manual"><summary>Set it up manually</summary>{status ? <><ol className="setup-steps">{clientSetupGuide[client].steps.map(step => <li key={step}>{step}</li>)}</ol><pre>{clientConfig(client, status)}</pre><CopyButton value={clientConfig(client, status)} label="Copy configuration" /><button className="secondary-button" type="button" onClick={() => downloadText(`underwriting-desk-${client}-setup.txt`, setupKit(client, status))}>Download setup guide</button><p>This file contains local paths. Keep it private. It does not install or replace client settings.</p><a href={clientSetupGuide[client].help} target="_blank" rel="noreferrer">Official client instructions</a></> : <p>Extract the supplied trial ZIP and run <code>node start-desk.mjs</code> in its folder. For a source checkout, install locked dependencies, build the workbench and run <code>pnpm desk:start</code>.</p>}</details>
        <details className="setup-manual"><summary>Using Claude or ChatGPT in a web browser?</summary><p>A hosted chat may not have access to this computer. Use a supported desktop app for this local connection. Web connectors require a separate supported remote connection; this Desk does not automatically publish a server or configure a tunnel.</p><p><a href="https://learn.chatgpt.com/docs/extend/mcp" target="_blank" rel="noreferrer">ChatGPT desktop MCP instructions</a> · <a href="https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop" target="_blank" rel="noreferrer">Claude local MCP instructions</a></p></details>
      </div>
      <footer className="connection-dialog-footer"><span>No API keys. Your subscription's usage limits still apply.</span><button type="button" className="primary-button" onClick={() => {onApply({channel: "LOCAL_MCP", client, label: setupClients.find((item) => item.id === client)!.label, state: "SETUP_PREPARED"}); onClose();}}>Done</button></footer>
    </section>
  </div>;
}
