import {useMemo, useRef, useState, type DragEvent, type ReactNode} from "react";
import {BoundaryNote, DealSidebar, viewLabels, viewQuestions, type DealView} from "./App";
import {compareDecimalStrings} from "./data-contract";
import {approveBaseline, calculateQuickScenario, processDealPackage, type IntakeResult, type QuickAnalysis} from "./intake";
import {addPackageFiles, collectDroppedFiles, expandSelectionAsync, formatBytes, loadSyntheticSample, packageReadiness, removePackageFile, replacePackageFile, type PackageFile} from "./intake-package";
import {localCaseId, localScenarioContract, localWorkspaceIntegritySeed, localWorkspaceSeed, serializeAdmittedDealBundle} from "./local-deal-state";
import {LocalChangeControl} from "./local-change-control";
import {ExcelRoundTrip} from "./excel-round-trip";
import {ModelReviewPanel} from "./model-review-panel";
import type {ConnectionState} from "./model-connection";
import type {ModelTransport} from "./model-workflow";
import {GROWTH_SCREEN_POLICY, policyThreshold} from "./policy";
import {
  AssumptionRegistry,
  DiligenceWorklist,
  EditableMemo,
  ObservationComposer,
  PolicyRegistry,
  WorkspaceRecovery,
  WorkspaceTransfer,
  formatHumanDate,
  useDealWorkspace,
  type AssumptionDefinition,
  type WorkspaceUpdate,
} from "./workspace-ui";
import type {DealWorkspaceState} from "./workspace-state";

const LOCAL_OVERRIDABLE_GATES = ["retention-nrr"];
const LOCAL_OVERRIDABLE_GATE_SET = new Set(LOCAL_OVERRIDABLE_GATES);
const LOCAL_POLICY_OVERRIDE_ROLES = {"retention-nrr": "Policy owner"};
function money(cents: number) { return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 1, notation: "compact"}).format(cents / 100); }
function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function stateLabel(state: string) { return state.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
const dealQuestion = "What must be true for this package to advance beyond screening?";

export function localPostureCopy(posture: IntakeResult["posture"]) {
  return posture === "HOLD"
    ? {heading: "HOLD", headline: "Hold; the deterministic return screens miss", detail: "Return screens miss; no IC advancement", icState: "HOLD — deterministic return screens miss"}
    : posture === "NO CALL — PACKAGE INCOMPLETE"
      ? {heading: "NO CALL", headline: "No call; the package is incomplete", detail: "Return conclusions are suppressed", icState: "No call until the package is complete"}
      : {heading: "FURTHER DILIGENCE", headline: "Screening complete; further diligence required before IC", detail: "Screening complete; no IC advancement", icState: "Further diligence required"};
}

function normalizedLocalScenario(result: IntakeResult, state: DealWorkspaceState) {
  const deal = result.deal!, analysis = result.analysis!;
  const parsedGrowth = Number(state.scenarioValues.localGrowth ?? deal.annualRevenueGrowth);
  const parsedMultiple = Number(state.scenarioValues.localExitMultiple ?? deal.exitRevenueMultiple);
  const growth = Number.isFinite(parsedGrowth) && parsedGrowth >= -.99 && parsedGrowth <= 5 ? parsedGrowth : deal.annualRevenueGrowth;
  const multipleValue = Number.isFinite(parsedMultiple) && parsedMultiple >= .01 && parsedMultiple <= 100 ? parsedMultiple : deal.exitRevenueMultiple;
  return {growth, multipleValue, changed: growth !== deal.annualRevenueGrowth || multipleValue !== deal.exitRevenueMultiple, output: calculateQuickScenario(analysis, deal, {annualRevenueGrowth: growth, exitRevenueMultiple: multipleValue})};
}

function boundedScenarioInput(value: string, fallback: number, min: number, max: number) {
  if (!value.trim()) return String(fallback);
  const parsed = Number(value);
  return String(Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback);
}

function boundedPercentScenarioInput(value: string, fallback: number) {
  if (!value.trim()) return String(fallback);
  const parsed = Number(value) / 100;
  return String(Number.isFinite(parsed) ? Math.min(5, Math.max(-.99, parsed)) : fallback);
}

/* ------------------------------------------------------------------ */
/* New deal · package intake                                            */
/* ------------------------------------------------------------------ */

export function DealIntake({onCancel, onComplete}: {onCancel: () => void; onComplete: (result: IntakeResult) => void}) {
  const [files, setFiles] = useState<PackageFile[]>([]);
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [approvalRationale, setApprovalRationale] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const pickerRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const readiness = useMemo(() => packageReadiness(files), [files]);

  async function admit(selection: File[], origin: string) {
    if (!selection.length) return;
    const expanded = await expandSelectionAsync(selection);
    setFiles((current) => {
      const next = addPackageFiles(current, expanded.files);
      const parts: string[] = [];
      if (next.added.length) parts.push(`Added ${next.added.join(", ")}`);
      if (next.replaced.length) parts.push(`replaced ${next.replaced.join(", ")}`);
      if (expanded.archives.length) parts.push(`expanded ${expanded.archives.join(", ")}`);
      if (expanded.skipped.length) parts.push(`could not read ${expanded.skipped.join(", ")}`);
      setNotice(parts.length ? `${parts.join("; ")} from ${origin}.` : `Nothing new was added from ${origin}.`);
      return next.files;
    });
    setResult(null); setApprovalError("");
  }
  async function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault(); setDragging(false);
    await admit(await collectDroppedFiles(event.dataTransfer), "the dropped selection");
  }
  async function loadSample() {
    setLoadingSample(true);
    try { await admit(await loadSyntheticSample(), "the included Northstar sample"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The sample package could not be loaded."); }
    finally { setLoadingSample(false); }
  }
  function remove(key: string) {
    setFiles((current) => removePackageFile(current, key)); setResult(null); setApprovalError(""); setNotice("");
  }
  function replace(key: string, file?: File) {
    if (!file) return;
    setFiles((current) => replacePackageFile(current, key, file)); setResult(null); setApprovalError(""); setNotice(`Replaced with ${file.name}.`);
  }
  async function validate() {
    if (!readiness.ready) return;
    setProcessing(true);
    try { setResult(await processDealPackage(files.map((item) => item.file))); } finally { setProcessing(false); }
  }
  function approveAndOpen() {
    if (!result) return;
    try { setApprovalError(""); onComplete(approveBaseline(result, reviewer, approvalRationale)); }
    catch (error) { setApprovalError(error instanceof Error ? error.message : "Version 1 approval failed"); }
  }
  const missingList = readiness.checklist.filter((item) => item.state === "missing");
  const resultCopy = result ? localPostureCopy(result.posture) : null;
  return <main className="intake-page" id="main-content">
    <button className="back-button" type="button" onClick={onCancel}>← Deals</button>
    <header className="page-heading intake-heading"><div><p className="eyebrow">New deal</p><h1>Screen a company package</h1><p>Add the complete package once. The Desk validates every file against the package declaration, recalculates the screening record deterministically, and asks a named analyst to approve Version 1 before the workspace opens.</p></div><span className="quiet-chip">Public-data boundary</span></header>
    <section className="local-processing-note" aria-label="Local processing boundary"><strong>Your selected bytes stay in this browser tab.</strong><p>Files are validated and calculated locally. A model job can send only the evidence summaries you explicitly select after confirmation. Do not use confidential information.</p></section>
    <div className="intake-layout">
      <section className="panel intake-step" aria-labelledby="choose-package-heading">
        <div className="section-heading"><div><p className="eyebrow">Step 1</p><h2 id="choose-package-heading">Add the package</h2></div><span>8 MB package maximum</span></div>
        <label className="file-picker" data-dragging={dragging || undefined} onDragOver={(event) => {event.preventDefault(); setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={(event) => void onDrop(event)}>
          <span>Drop the complete package here, or choose files</span>
          <input ref={pickerRef} data-testid="deal-package-input" type="file" multiple accept=".json,.csv,.pdf,.xlsx,.zip" onChange={(event) => {void admit(Array.from(event.target.files ?? []), "the file picker"); event.target.value = "";}} />
          <strong>{files.length ? `${files.length} ${files.length === 1 ? "file" : "files"} in the package. Add more files, a folder, or a ZIP at any time; earlier selections are kept.` : "Five files: package declaration, deal terms, operating model, customer data, and management update. Files, a folder, or a ZIP archive."}</strong>
          <small>Multiple selections add to the package. Choosing a file that is already listed replaces it.</small>
        </label>
        <div className="picker-actions">
          <button type="button" className="secondary-button" onClick={() => pickerRef.current?.click()}>Add files</button>
          <button type="button" className="secondary-button" onClick={() => folderRef.current?.click()}>Add a folder</button>
          <input ref={folderRef} className="sr-only" type="file" multiple aria-label="Add a folder" {...{webkitdirectory: "", directory: ""} as Record<string, string>} onChange={(event) => {void admit(Array.from(event.target.files ?? []), "the selected folder"); event.target.value = "";}} />
          <button type="button" className="secondary-button" data-testid="load-sample-package" disabled={loadingSample} onClick={() => void loadSample()}>{loadingSample ? "Loading sample…" : "Load the complete synthetic sample"}</button>
          {files.length ? <button type="button" className="ghost-button" onClick={() => {setFiles([]); setResult(null); setNotice("Package cleared.");}}>Clear package</button> : null}
          {notice ? <span className="quiet-note" role="status">{notice}</span> : null}
        </div>
        <ul className="package-files" aria-label="Package checklist">
          {readiness.checklist.map((item) => <li key={item.requirement.role} data-state={item.state}><i aria-hidden="true" /><div><strong>{item.requirement.label}</strong><small>{item.state === "missing" ? `${item.requirement.hint} is required` : item.state === "optional" ? "Not needed for a CSV quick package" : item.requirement.description}</small></div><span className="file-name">{item.file?.name ?? item.requirement.hint}</span><span className="file-size">{item.file ? formatBytes(item.file.file.size) : "—"}</span><span className="file-actions">{item.file ? <><label>Replace<input type="file" className="sr-only" aria-label={`Replace ${item.file.name}`} accept=".json,.csv,.pdf,.xlsx" onChange={(event) => {replace(item.file!.key, event.target.files?.[0]); event.target.value = "";}} /></label><button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.file!.key)}>Remove</button></> : null}</span></li>)}
          {readiness.unrecognized.map((item) => <li key={item.key} data-state="extra"><i aria-hidden="true" /><div><strong>Not part of the package contract</strong><small>Listed for the record; not analyzed.</small></div><span className="file-name">{item.name}</span><span className="file-size">{formatBytes(item.file.size)}</span><span className="file-actions"><button type="button" aria-label={`Remove ${item.name}`} onClick={() => remove(item.key)}>Remove</button></span></li>)}
        </ul>
        <div className="package-summary" data-state={readiness.ready ? "ready" : "blocked"} aria-live="polite"><p>{readiness.summary}</p><button className="primary-button validate-package" type="button" disabled={!readiness.ready || processing} onClick={() => void validate()}>{processing ? "Validating locally…" : "Validate and analyze"}</button></div>
        {missingList.length && files.length ? <ul className="sr-only" aria-label="Missing requirements">{missingList.map((item) => <li key={item.requirement.role}>{item.requirement.hint} is required</li>)}</ul> : null}
        <details className="sample-downloads"><summary>Download the included Northstar evidence package as separate files</summary><p>Use these to test the picker, folder, and ZIP paths yourself.</p><div><a download href="sample-package-v2/manifest.json">Package declaration</a><a download href="sample-package-v2/deal.json">Deal terms</a><a download href="sample-package-v2/operating_model.xlsx">Operating model</a><a download href="sample-package-v2/customer_arr.csv">Customer data</a><a download href="sample-package-v2/management_update.pdf">Management update</a></div></details>
      </section>
      <aside className="panel package-contract" aria-labelledby="package-contract-heading"><p className="eyebrow">What happens to each file</p><h2 id="package-contract-heading">Validated, then recalculated</h2><ol><li><strong>Fingerprints checked</strong><span>Every file's byte count and digest must match the package declaration. A changed file fails closed.</span></li><li><strong>Operating model read in place</strong><span>Recognized sheet, periods, mapped rows, and formulas are retained. Nothing in the workbook is rewritten.</span></li><li><strong>Customers measured on a fixed cohort</strong><span>Opening-customer retention over an explicit interval; it is never presented as annual NRR.</span></li><li><strong>Management narrative kept separate</strong><span>Page-level text is retained as a representation, not a verified fact.</span></li><li><strong>Named human approval</strong><span>A named analyst approves the recognized mappings and exclusions. Package thresholds never become fund policy.</span></li></ol><p>The original workbook and PDF bytes remain attached to the portable deal so every version can be reopened exactly.</p></aside>
    </div>
    {result ? <section className={`panel intake-result ${result.packageState === "READY" ? "result-ready" : "result-incomplete"}`} aria-labelledby="package-result-heading" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Package result</p><h2 id="package-result-heading">{result.posture}</h2><p className="section-intro" style={{margin: "2px 0 0"}}>{resultCopy?.headline}</p></div><span className={`status status-${result.packageState.toLowerCase()}`}>{stateLabel(result.packageState)}</span></div><p>{result.rationale}</p><div className="table-wrap" tabIndex={0} aria-label="Scrollable package validation"><table><thead><tr><th>Input</th><th>State</th><th>Recognition and review</th><th>Rows / pages</th></tr></thead><tbody>{result.files.map((file, index) => <tr key={`${file.name}-${index}`}><td>{file.name}</td><td><span className={`status status-${file.state.toLowerCase()}`}>{stateLabel(file.state)}</span></td><td>{file.detail}{file.recognizedScope?.length ? <div className="intake-detail"><strong>Recognized</strong><ul>{file.recognizedScope.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{file.mappings?.length ? <div className="intake-detail"><strong>Mappings to confirm</strong><ul className="mapping-list">{file.mappings.map((mapping) => <li key={`${mapping.from}-${mapping.to}`}>{mapping.from} → {mapping.to}</li>)}</ul></div> : null}{file.reconciliations?.length ? <div className="intake-detail"><strong>Reconciliations</strong><ul>{file.reconciliations.map((item) => <li key={item.label}>{item.label}: {stateLabel(item.state)} — {item.detail}</li>)}</ul></div> : null}{file.exclusions?.length ? <details><summary>Excluded from calculations · {file.exclusions.length}</summary><ul>{file.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}{file.rejectedFields?.length ? <details><summary>Rejected fields · {file.rejectedFields.length}</summary><ul>{file.rejectedFields.map((item) => <li key={item.field}>{item.field} — {item.reason}</li>)}</ul></details> : null}</td><td>{file.rows ?? "—"}{file.formulaCount ? <small>{file.formulaCount} preserved formulas</small> : null}</td></tr>)}</tbody></table></div>{result.errors.length ? <div className="error-summary"><strong>Resolve before a decision surface is available</strong><ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}{result.packageState === "READY" ? <section className="baseline-approval" aria-label="Approve Version 1 baseline"><div><p className="eyebrow">Step 2</p><h3>Approve recognized evidence as Version 1</h3><p>This approves the mappings and exclusions—not the company’s claims, package assumptions, or an investment decision.</p></div><label><span>Analyst name</span><input value={reviewer} maxLength={120} onChange={(event) => setReviewer(event.target.value)} placeholder="Named human analyst" /></label><label><span>Approval rationale</span><textarea value={approvalRationale} maxLength={1200} onChange={(event) => setApprovalRationale(event.target.value)} placeholder="Why are the recognized ranges, mappings, exclusions, and discrepancies acceptable for screening?" /></label><button className="primary-button" type="button" disabled={reviewer.trim().length < 2 || approvalRationale.trim().length < 20} onClick={approveAndOpen}>Approve Version 1 and open workspace</button>{approvalError ? <p className="error-summary" role="alert">{approvalError}</p> : null}</section> : null}</section> : null}
  </main>;
}

/* ------------------------------------------------------------------ */
/* Admitted local deal                                                  */
/* ------------------------------------------------------------------ */

function LocalBundleTransfer({result, state}: {result: IntakeResult; state: DealWorkspaceState}) {
  const [notice, setNotice] = useState("");
  const exportBundle = () => {
    try {
      const url = URL.createObjectURL(new Blob([serializeAdmittedDealBundle(result, state)], {type: "application/json"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${localCaseId(result)}-portable-deal.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Portable deal and workspace exported.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Portable deal export failed."); }
  };
  return <section className="workspace-transfer" aria-label="Portable admitted deal"><div><strong>Portable admitted deal</strong><span>Replayable source files, recalculated outputs, and the shared workspace. Private analyst notes are excluded. Public synthetic demonstration only.</span></div><span /><div><button type="button" onClick={exportBundle}>Export portable deal</button></div>{notice ? <p role="status">{notice}</p> : null}</section>;
}

function localOverrides(state: DealWorkspaceState) {
  return new Set(state.policyOverrides.filter((item) => LOCAL_OVERRIDABLE_GATE_SET.has(item.gateId) && item.actorRole === GROWTH_SCREEN_POLICY.ownerRole).map((item) => item.gateId));
}

function LocalDecisionTests({analysis, state}: {analysis: QuickAnalysis; state: DealWorkspaceState}) {
  const overrides = localOverrides(state);
  const unresolved = analysis.tests.filter((test) => test.blocksAdvancement && !overrides.has(test.gateId));
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">What changes the recommendation</p><h2>Screening gates against the Desk-owned policy</h2></div><span>{unresolved.length} unresolved</span></div><div className="table-wrap" tabIndex={0} aria-label="Scrollable screening gates"><table className="screens-table"><thead><tr><th>Gate</th><th className="num">Observed</th><th className="num">Required</th><th>State</th></tr></thead><tbody>{analysis.tests.map((test) => {const overridden = overrides.has(test.gateId); return <tr key={test.gateId}><th>{test.label}<small style={{display: "block", fontWeight: 400, color: "var(--muted)"}}>{test.explanation}</small></th><td className="num">{test.observed}</td><td className="num">{test.required}</td><td><span className={`status status-${overridden ? "accepted" : test.state.toLowerCase()}`}>{overridden ? "Policy exception recorded · evidence issue remains open" : stateLabel(test.state)}</span></td></tr>;})}</tbody></table></div><details className="method-disclosure"><summary>Policy ownership and review</summary><p>{analysis.policyProfile.name} · {analysis.policyProfile.owner}. Source: Desk default, outside the company package. Status: {analysis.policyProfile.status.toLowerCase()}. Last reviewed: {formatHumanDate(analysis.policyProfile.lastReviewed)}.</p><p>Thresholds embedded in the uploaded deal file are retained only as package representations. They do not grade or authorize this deal.</p></details></section>;
}

function LocalOverview({result, state, update, onNavigate, versionControl}: {result: IntakeResult; state: DealWorkspaceState; update: WorkspaceUpdate; onNavigate: (view: DealView) => void; versionControl?: ReactNode}) {
  const analysis = result.analysis!, deal = result.deal!;
  const posture = localPostureCopy(result.posture);
  const [selectedMetric, setSelectedMetric] = useState(analysis.metrics[0]?.id ?? "");
  const activeMetric = analysis.metrics.find((metric) => metric.id === selectedMetric);
  const overrides = localOverrides(state);
  const failed = analysis.tests.filter((test) => test.blocksAdvancement && !overrides.has(test.gateId));
  const cleared = analysis.tests.filter((test) => !test.blocksAdvancement);
  const open = state.issues.filter((issue) => issue.status !== "RESOLVED");
  const {output: canonical} = normalizedLocalScenario(result, {...state, scenarioValues: {}});
  const approvedAssumptions = ["local-growth", "local-exit-multiple", "local-financing"].filter((id) => state.assumptionReviews[id]?.disposition === "APPROVED").length;
  const memoStale = state.memoSections.filter((section) => section.scenarioSnapshotId !== localScenarioMemoSummary(result, state).snapshotId).length;
  return <div className="view-stack">
    <section className="current-view" aria-labelledby="current-view-heading">
      <div>
        <p className="eyebrow">Current view · {result.baselineApproval?.version ?? "unapproved"} evidence</p>
        <h2 id="current-view-heading">{posture.headline}</h2>
        <p className="view-lead">{result.rationale}</p>
        <ol className="reasoned-list">
          <li><span>Supporting evidence</span><div><ul>{analysis.metrics.slice(0, 3).map((metric) => <li key={metric.id}>{metric.label} of <b>{metric.display}</b> — {metric.meaning} <button type="button" className="text-button" onClick={() => setSelectedMetric(metric.id)}>Trace</button></li>)}</ul></div></li>
          <li><span>Concerns</span><div><ul><li>{percent(analysis.ordinaryNrr)} cohort retention proxy over {analysis.cohortElapsedMonths} months; this is not annual NRR and is compared directionally with the 95% annual screen.</li>{failed.slice(0, 2).map((test) => <li key={test.gateId}>{test.label}: {test.explanation}</li>)}</ul></div></li>
          <li><span>Decision-changing variables</span><div>Annual revenue growth ({percent(deal.annualRevenueGrowth)} in the package) and exit revenue multiple ({deal.exitRevenueMultiple.toFixed(1)}x) set terminal revenue and exit equity. <button type="button" className="text-button" onClick={() => onNavigate("financials")}>Test scenarios</button></div></li>
          <li><span>Remaining work</span><div>{failed.length} screening {failed.length === 1 ? "gate" : "gates"} unresolved and {open.length} open diligence {open.length === 1 ? "item" : "items"}. <button type="button" className="text-button" onClick={() => onNavigate("diligence")}>Open worklist</button></div></li>
          <li><span>Next committee step</span><div><strong>{posture.icState}</strong>. Clearing an illustrative return screen does not make the package IC-ready; a named human records any advancement.</div></li>
        </ol>
      </div>
      <div>
        <p className="eyebrow">Company and transaction</p>
        <dl className="fact-table">
          <div><dt>Company</dt><dd>{deal.company}</dd></div>
          <div><dt>Proposed round</dt><dd className="num">{money(deal.investmentCents)} at {money(deal.preMoneyCents)} pre-money · {percent(analysis.postMoneyOwnership)} post-money</dd></div>
          <div><dt>Hold</dt><dd className="num">{deal.years} years</dd></div>
          <div><dt>LTM revenue</dt><dd className="num">{money(analysis.ltmRevenueCents)}</dd></div>
          <div><dt>Cash and runway</dt><dd className="num">{money(deal.cashCents)} · {analysis.runwayMonths === null ? "no net burn" : `${analysis.runwayMonths.toFixed(1)} months`}</dd></div>
          <div><dt>Analyst owner</dt><dd>{deal.analystOwner}</dd></div>
          <div><dt>Evidence cutoff</dt><dd className="num">{formatHumanDate(`${deal.cutoff}T12:00:00Z`)}</dd></div>
        </dl>
      </div>
    </section>
    <section className="overview-metrics" aria-label="Headline measures">{analysis.metrics.slice(0, 5).map((metric) => <button type="button" aria-pressed={metric.id === selectedMetric} key={metric.id} onClick={() => setSelectedMetric(metric.id)}><span>{metric.label}</span><strong>{metric.display}</strong><small>{metric.meaning}</small><em>Inspect sources</em></button>)}</section>
    {activeMetric ? <section className="workspace-card local-lineage" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Calculation trace</p><h2>{activeMetric.label}</h2></div><strong className="num">{activeMetric.display}</strong></div><p>{activeMetric.meaning}</p><dl><div><dt>Source files</dt><dd>{activeMetric.sourceFiles.join(" · ")}</dd></div><div><dt>Boundary</dt><dd>{activeMetric.limitation}</dd></div></dl></section> : null}
    <section className="workspace-card" aria-labelledby="local-returns-heading"><div className="section-heading"><div><p className="eyebrow">Base case</p><h2 id="local-returns-heading">Package return case</h2></div><span>Debt-neutral quick package</span></div><div className="table-wrap" tabIndex={0} aria-label="Scrollable returns table"><table className="returns-table"><thead><tr><th>Scenario</th><th className="num">Growth</th><th className="num">Exit multiple</th><th className="num">Terminal revenue</th><th className="num">Exit equity</th><th className="num">Gross multiple</th><th className="num">Annualized return</th></tr></thead><tbody><tr data-current="true"><th>Package case<small>Unreviewed management assumptions</small></th><td className="num">{percent(deal.annualRevenueGrowth)}</td><td className="num">{deal.exitRevenueMultiple.toFixed(1)}x</td><td className="num">{money(canonical.terminalRevenueCents)}</td><td className="num">{money(canonical.exitEquityCents)}</td><td className="num">{canonical.grossMoic.toFixed(2)}x</td><td className="num">{percent(canonical.annualizedGrossReturn)}</td></tr></tbody></table></div><p className="section-intro" style={{marginTop: 10, marginBottom: 0}}>Downside and upside cases are tested in Financials with bounded growth and exit inputs; they never overwrite the admitted package case.</p></section>
    <LocalDecisionTests analysis={analysis} state={state} />
    {versionControl}
    <section className="workspace-card" aria-labelledby="local-readiness-heading"><div className="section-heading"><div><p className="eyebrow">Ready for the next IC step?</p><h2 id="local-readiness-heading">{failed.length || open.length || memoStale ? "Not ready: screening gates and diligence remain" : "Ready for named human IC review"}</h2></div><span>Committee decision is recorded by people, not by the Desk</span></div><ul className="readiness-list"><li data-state={failed.length ? "blocked" : "done"}><div><strong>Screening gates</strong><small>{cleared.length} clear · {failed.length} unresolved</small></div></li><li data-state={analysis.policyProfile.status === "APPROVED" ? "done" : "open"}><div><strong>Fund policy reviewed</strong><small>{analysis.policyProfile.name} is {analysis.policyProfile.status.toLowerCase()}</small></div></li><li data-state={approvedAssumptions === 3 ? "done" : "open"}><div><strong>Material assumptions approved</strong><small>{approvedAssumptions} of 3 approved by a named reviewer</small></div></li><li data-state={open.length ? "open" : "done"}><div><strong>Diligence worklist</strong><small>{open.length} open {open.length === 1 ? "item" : "items"}</small></div></li><li data-state={result.baselineApproval ? "done" : "blocked"}><div><strong>Evidence version</strong><small>{result.baselineApproval ? `${result.baselineApproval.version} approved by ${result.baselineApproval.actor}` : "Unapproved"}</small></div></li><li data-state={memoStale ? "blocked" : "done"}><div><strong>IC memo bound to scenario</strong><small>{memoStale ? `${memoStale} ${memoStale === 1 ? "section" : "sections"} prepared against another scenario` : "Every section matches the working scenario"}</small></div></li></ul></section>
    <ObservationComposer state={state} update={update} />
  </div>;
}

function LocalFinancials({result, state, update}: {result: IntakeResult; state: DealWorkspaceState; update: WorkspaceUpdate}) {
  const analysis = result.analysis!, deal = result.deal!;
  const {growth, multipleValue: multiple, changed, output: working} = normalizedLocalScenario(result, state);
  const canonical = calculateQuickScenario(analysis, deal, {annualRevenueGrowth: deal.annualRevenueGrowth, exitRevenueMultiple: deal.exitRevenueMultiple});
  const moicPolicy = policyThreshold(analysis.policyProfile, "gross_moic");
  const returnPolicy = policyThreshold(analysis.policyProfile, "annualized_return");
  const clears = (observed: number, threshold: typeof moicPolicy) => {
    const comparison = compareDecimalStrings(observed.toFixed(12), threshold.value.toFixed(12));
    return threshold.operator === ">=" ? comparison >= 0 : comparison <= 0;
  };
  const returnsClear = clears(working.grossMoic, moicPolicy) && clears(working.annualizedGrossReturn, returnPolicy);
  const growthSteps = [Math.max(-.99, deal.annualRevenueGrowth - .1), deal.annualRevenueGrowth, Math.min(5, deal.annualRevenueGrowth + .1)];
  const multipleSteps = [Math.max(.01, deal.exitRevenueMultiple - 1), deal.exitRevenueMultiple, Math.min(100, deal.exitRevenueMultiple + 1)];
  const bridgeMax = Math.max(working.terminalRevenueCents, working.exitEquityCents, 1);
  return <div className="finance-workspace">
    <section className="scenario-command"><div><p className="eyebrow">Working scenario</p><h2>Test the return case</h2><p>The admitted package case remains unchanged. These bounded inputs create an unapproved what-if and rerun the same deterministic arithmetic.</p></div><div className="scenario-controls"><label><span>Annual revenue growth (%)</span><input aria-label="Annual revenue growth (%)" type="number" min="-99" max="500" step="1" value={Number((growth * 100).toFixed(2))} onChange={(event) => update({scenarioValues: {...state.scenarioValues, localGrowth: boundedPercentScenarioInput(event.target.value, deal.annualRevenueGrowth)}})} /></label><label><span>Exit revenue multiple</span><input aria-label="Exit revenue multiple" type="number" min="0.01" max="100" step="0.25" value={multiple} onChange={(event) => update({scenarioValues: {...state.scenarioValues, localExitMultiple: boundedScenarioInput(event.target.value, deal.exitRevenueMultiple, .01, 100)}})} /></label><button type="button" className="secondary-button" disabled={!changed} onClick={() => update({scenarioValues: {...state.scenarioValues, localGrowth: String(deal.annualRevenueGrowth), localExitMultiple: String(deal.exitRevenueMultiple)}})}>Reset to package</button></div></section>
    <section className="canonical-comparison"><article data-state="canonical"><span>Admitted package case · unreviewed</span><h3>{percent(deal.annualRevenueGrowth)} growth · {deal.exitRevenueMultiple.toFixed(1)}x exit</h3><strong>{canonical.grossMoic.toFixed(2)}x · {percent(canonical.annualizedGrossReturn)}</strong><small>{money(canonical.exitEquityCents)} exit equity value</small></article><article data-state={changed ? "what-if" : "canonical"}><span>{changed ? "Unapproved what-if" : "Working case matches package"}</span><h3>{percent(growth)} growth · {multiple.toFixed(1)}x exit</h3><strong>{working.grossMoic.toFixed(2)}x · {percent(working.annualizedGrossReturn)}</strong><small>{money(working.exitEquityCents)} exit equity value</small></article></section>
    <section className="finance-kpi-grid"><article className="finance-kpi"><span>Terminal revenue</span><strong>{money(working.terminalRevenueCents)}</strong><small>LTM revenue compounded for {deal.years} years</small></article><article className="finance-kpi"><span>Exit equity value</span><strong>{money(working.exitEquityCents)}</strong><small>Terminal revenue × exit multiple; debt-neutral</small></article><article className="finance-kpi"><span>Gross multiple</span><strong>{working.grossMoic.toFixed(2)}x</strong><small>Against the {moicPolicy.displayValue} Desk screen</small></article><article className="finance-kpi"><span>Annualized gross return</span><strong>{percent(working.annualizedGrossReturn)}</strong><small>Against the {returnPolicy.displayValue} Desk screen</small></article></section>
    <section className="finance-section"><div className="section-heading"><div><p className="eyebrow">Decision consequence</p><h2>{returnsClear ? "Illustrative return screens clear" : "Illustrative return screens miss"}</h2></div><span>{changed ? "Unapproved what-if" : "Package case"}</span></div><div className="decision-consequence"><p>Retention remains a material concern at {percent(analysis.ordinaryNrr)} across an {analysis.cohortElapsedMonths}-month interval. Clearing return screens does not make the package IC-ready; the screening gates and diligence worklist still govern advancement.</p></div><div className="value-bridge" role="group" aria-label="Exit value bridge"><div className="value-bridge-row"><span>LTM revenue<small>Admitted operating model</small></span><span className="bar" aria-hidden="true"><i style={{left: 0, width: `${analysis.ltmRevenueCents / bridgeMax * 100}%`}} /></span><span className="num">{money(analysis.ltmRevenueCents)}</span><span /></div><div className="value-bridge-row"><span>Terminal revenue<small>{percent(growth)} growth for {deal.years} years</small></span><span className="bar" aria-hidden="true"><i style={{left: 0, width: `${working.terminalRevenueCents / bridgeMax * 100}%`}} /></span><span className="num">{money(working.terminalRevenueCents)}</span><span className="num"><small>× {multiple.toFixed(1)}x</small></span></div><div className="value-bridge-row" data-kind="total"><span>Exit equity value<small>Investor share {percent(analysis.postMoneyOwnership)}</small></span><span className="bar" aria-hidden="true"><i style={{left: 0, width: `${working.exitEquityCents / bridgeMax * 100}%`}} /></span><span className="num">{money(working.exitEquityCents)}</span><span className="num"><small>{working.grossMoic.toFixed(2)}x</small></span></div></div></section>
    <section className="finance-section"><div className="section-heading"><div><p className="eyebrow">Sensitivity</p><h2>Growth × exit multiple</h2></div><span>Select a cell to load it as the working case</span></div><div className="heatmap-wrap"><table className="sensitivity-heatmap"><thead><tr><th>Growth / exit</th>{multipleSteps.map((item) => <th key={item}>{item.toFixed(1)}x</th>)}</tr></thead><tbody>{growthSteps.map((growthValue) => <tr key={growthValue}><th>{percent(growthValue)}</th>{multipleSteps.map((multipleValue) => {const cell = calculateQuickScenario(analysis, deal, {annualRevenueGrowth: growthValue, exitRevenueMultiple: multipleValue}); return <td key={multipleValue} data-selected={growthValue === growth && multipleValue === multiple || undefined} data-state={clears(cell.grossMoic, moicPolicy) && clears(cell.annualizedGrossReturn, returnPolicy) ? "clears" : "misses"}><button type="button" onClick={() => update({scenarioValues: {...state.scenarioValues, localGrowth: String(growthValue), localExitMultiple: String(multipleValue)}})}><strong>{cell.grossMoic.toFixed(2)}x</strong><small>{percent(cell.annualizedGrossReturn)}</small></button></td>;})}</tr>)}</tbody></table></div></section>
  </div>;
}

function LocalDiligence({result, state, update, modelTransport, connection}: {result: IntakeResult; state: DealWorkspaceState; update: WorkspaceUpdate; modelTransport?: ModelTransport; connection: ConnectionState | null}) {
  const analysis = result.analysis!, deal = result.deal!;
  const dealId = localCaseId(result);
  const hostedEligible = dealId === "local-northstar-metrics-00a75b14db10";
  const [section, setSection] = useState<"issues" | "assumptions" | "policy" | "model">("issues");
  const assumptions: AssumptionDefinition[] = [
    {id: "local-growth", label: "Annual revenue growth", value: percent(deal.annualRevenueGrowth), owner: deal.analystOwner, basis: "Package representation", consequence: "Changes terminal revenue and return outputs.", status: "Unreviewed"},
    {id: "local-exit-multiple", label: "Exit revenue multiple", value: `${deal.exitRevenueMultiple.toFixed(1)}x`, owner: deal.analystOwner, basis: "Package representation", consequence: "Changes exit equity value and return outputs.", status: "Unreviewed"},
    {id: "local-financing", label: "Financing and ownership", value: `${money(deal.investmentCents)} at ${money(deal.preMoneyCents)} pre-money`, owner: deal.analystOwner, basis: "Proposed deal term", consequence: "Sets simple post-money ownership; preferences and dilution are not modeled.", status: "Unreviewed"},
  ];
  const tabs = [{id: "issues", label: `Issues · ${state.issues.filter((issue) => issue.status !== "RESOLVED").length}`}, {id: "assumptions", label: "Assumptions"}, {id: "policy", label: "Policy"}, {id: "model", label: "Model review"}] as const;
  const lockedIssueIds = new Set(localWorkspaceSeed(result).lockedIssueIds ?? []);
  const latestChange = state.changeControl?.dispositionEvents.at(-1)?.disposition;
  const staleAssumptionIds = state.changeControl && latestChange !== "REJECTED" ? state.changeControl.affectedAssumptionIds : [];
  return <div className="view-stack"><nav className="workspace-tabs" aria-label="Diligence workspace">{tabs.map((tab) => <button type="button" key={tab.id} aria-pressed={section === tab.id} onClick={() => setSection(tab.id)}>{tab.label}</button>)}</nav>{section === "issues" ? <DiligenceWorklist state={state} update={update} lockedIssueIds={lockedIssueIds} /> : null}{section === "assumptions" ? <AssumptionRegistry assumptions={assumptions} state={state} update={update} staleAssumptionIds={staleAssumptionIds} staleSince={state.changeControl?.importedAt} /> : null}{section === "policy" ? <PolicyRegistry profile={analysis.policyProfile} state={state} update={update} blockingGates={analysis.tests.filter((test) => test.blocksAdvancement).map((test) => ({gateId: test.gateId, label: test.label}))} overridableGateIds={LOCAL_OVERRIDABLE_GATES} /> : null}{section === "model" ? <ModelReviewPanel dealId={dealId} connection={connection} transport={modelTransport} hostedEligible={hostedEligible} unavailableReason="Hosted review is enabled for the included Northstar sample only. Other admitted packages keep deterministic analysis and human workflow, but no model control is presented as functional." proposals={state.proposals} onProposalsChange={(next) => update((current) => ({proposals: typeof next === "function" ? next(current.proposals) : next}))} evidence={analysis.metrics.map((metric) => ({id: metric.id, title: metric.label, displayValue: metric.display, summary: metric.meaning}))} /> : null}</div>;
}

function SourceAttachments({result}: {result: IntakeResult}) {
  const versions = [
    ...(result.versionHistory ?? []).map((archive) => ({version: archive.approval.version, payloads: archive.sourcePayloads})),
    {version: result.baselineApproval?.version ?? "Current", payloads: result.sourcePayloads ?? []},
  ];
  const downloadable = versions.flatMap(({version, payloads}) => payloads.filter((payload) => "encoding" in payload && payload.encoding === "BASE64").map((payload) => ({version, payload})));
  if (!downloadable.length) return null;
  function download(item: typeof downloadable[number]) {
    const {payload} = item;
    if (!("encoding" in payload)) return;
    const bytes = Uint8Array.from(atob(payload.content), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: payload.mediaType}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.version}-${payload.name}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="source-attachments" aria-label="Original source attachments"><div><span>Original evidence</span><strong>Source bytes preserved</strong><small>Download the exact workbook or PDF for every accepted evidence version.</small></div>{downloadable.map((item) => <button type="button" key={`${item.version}-${item.payload.name}`} onClick={() => download(item)}>{item.version} · {item.payload.name}</button>)}</section>;
}

function LocalDocuments({result}: {result: IntakeResult}) {
  const analysis = result.analysis!; const [query, setQuery] = useState(""); const keyFor = (preview: QuickAnalysis["sourcePreviews"][number]) => `${preview.sourceFile}:${preview.title}:${preview.period}`; const initialPreview = analysis.sourcePreviews.find((preview) => preview.sourceFile === "customer_arr.csv") ?? analysis.sourcePreviews[0]; const [selected, setSelected] = useState(initialPreview ? keyFor(initialPreview) : "");
  const previews = analysis.sourcePreviews.filter((preview) => JSON.stringify(preview).toLowerCase().includes(query.trim().toLowerCase()));
  const active = previews.find((preview) => keyFor(preview) === selected) ?? previews[0];
  return <div className="documents-workspace"><section className="document-register"><div className="section-heading"><div><p className="eyebrow">Admitted package</p><h2>Sources and evidence</h2></div><span>{result.files.filter((file) => file.state === "READY").length} ready</span></div><label className="search-field"><span>Search source excerpts</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search periods, customers, pages…" /></label><div className="source-list">{previews.map((preview) => <button type="button" aria-pressed={keyFor(preview) === keyFor(active)} className={keyFor(preview) === keyFor(active) ? "active" : ""} key={keyFor(preview)} onClick={() => setSelected(keyFor(preview))}><span><strong>{preview.title}</strong><small>{preview.sourceFile} · {preview.period}</small></span><em>{stateLabel(preview.classification)}</em></button>)}</div></section><section className="document-preview">{active ? <><header><div><p className="eyebrow">Evidence preview</p><h2>{active.title}</h2><p>{active.sourceFile} · {active.period}</p></div><span className="status status-recognized">{stateLabel(active.classification)}</span></header><div className="excerpt-list"><article><dl>{active.excerpt.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></article>{active.rows?.length ? <div className="source-row-table" tabIndex={0} aria-label="Exact admitted source rows"><table><caption>{active.rows.length} exact admitted source rows</caption><thead><tr><th>Source row</th>{active.rows[0].cells.map((cell) => <th key={cell.label}>{cell.label}</th>)}</tr></thead><tbody>{active.rows.map((row) => <tr key={row.dataRow}><th>{row.dataRow}</th>{row.cells.map((cell) => <td key={cell.label}>{cell.value}</td>)}</tr>)}</tbody></table></div> : null}</div><aside className="linked-calculations"><h3>Outputs using this source</h3>{analysis.metrics.filter((metric) => metric.sourceFiles.includes(active.sourceFile)).map((metric) => <div className="linked-output" key={metric.id}><span>{metric.label}</span><strong>{metric.display}</strong><small>{metric.meaning}</small></div>)}</aside><details className="technical-record"><summary>Validation receipt</summary><dl>{result.files.filter((file) => file.name === active.sourceFile).map((file) => <div key={file.name}><dt>{file.name}</dt><dd><code>{file.sha256 ?? file.detail}</code></dd></div>)}</dl></details></> : <p className="empty-copy">No source matches the search.</p>}</section></div>;
}

function localScenarioMemoSummary(result: IntakeResult, state: DealWorkspaceState) {
  const {growth, multipleValue, changed, output} = normalizedLocalScenario(result, state);
  const evidenceVersion = result.baselineApproval?.version ?? "Unapproved evidence";
  const evidenceDigest = result.baselineApproval?.packageDigest ?? "unapproved";
  const label = changed ? `${percent(growth)} growth · ${multipleValue.toFixed(1)}x exit` : `${evidenceVersion} admitted package case`;
  const returnLine = `${percent(output.annualizedGrossReturn)} annualized gross return · ${output.grossMoic.toFixed(2)}x gross multiple`;
  return {state: changed ? "Unapproved what-if" as const : "Canonical case" as const, label, returnLine, detail: `${evidenceVersion} evidence · ${percent(result.analysis!.ordinaryNrr)} cohort retention proxy · ${money(output.terminalRevenueCents)} terminal revenue · ${money(output.exitEquityCents)} exit equity value. The working scenario does not overwrite the admitted package case.`, snapshotId: `local:${evidenceVersion}:${evidenceDigest}:${growth}:${multipleValue}:${result.analysis!.ordinaryNrr}:${output.annualizedGrossReturn}:${output.grossMoic}`, sectionBodies: {
    screening: `${result.posture}. ${evidenceVersion} evidence records a ${percent(result.analysis!.ordinaryNrr)} cohort retention proxy. ${label} produces ${returnLine}. Advancement still requires fund-owned policy, completed diligence, and human IC review.`,
    economics: `${label}: ${returnLine}, ${money(output.terminalRevenueCents)} terminal revenue, and ${money(output.exitEquityCents)} exit equity value. Evidence version: ${evidenceVersion}.`,
    diligence: "Validate retention interval and cohort quality, cost classification, customer concentration, committed costs, cap table, financing terms, and assumption provenance before any IC advancement.",
  }};
}

function LocalDecisionRail({result, state, view}: {result: IntakeResult; state: DealWorkspaceState; view: DealView}) {
  const analysis = result.analysis!;
  const posture = localPostureCopy(result.posture);
  const overrides = localOverrides(state);
  const failedGates = analysis.tests.filter((test) => test.blocksAdvancement && !overrides.has(test.gateId));
  const concernGates = failedGates.filter((test) => test.state === "CONCERN" || test.gateId === "retention-nrr");
  const concernGateIds = new Set(concernGates.map((test) => test.gateId));
  const evidenceGaps = failedGates.filter((test) => !concernGateIds.has(test.gateId));
  const openIssues = state.issues.filter((issue) => issue.status !== "RESOLVED");
  const {changed, output} = normalizedLocalScenario(result, state);
  const nextAction = openIssues.length
    ? `Advance ${openIssues.length} open diligence ${openIssues.length === 1 ? "issue" : "issues"}; ${failedGates.length} screening ${failedGates.length === 1 ? "gate still lacks" : "gates still lack"} a policy disposition.`
    : failedGates.length
      ? "Disposition unresolved screening gates with evidence or a recorded policy-owner exception."
      : "Document the policy-owner exception and complete human IC review.";
  const memo = localScenarioMemoSummary(result, state);
  const viewNote: Partial<Record<DealView, ReactNode>> = {
    financials: <section><span>Scenario consequence</span><strong>{percent(output.annualizedGrossReturn)} annualized gross return · {output.grossMoic.toFixed(2)}x</strong><p>{changed ? "Unapproved what-if. The admitted package case is unchanged." : "Package case. Bounded inputs create a what-if without touching the admitted record."}</p></section>,
    documents: <section><span>Evidence lineage</span><strong>{result.files.filter((file) => file.state === "READY").length} validated sources · {analysis.metrics.length} calculations</strong><p>Every figure names its source file, rows, and boundary.</p></section>,
    memo: <section><span>Memo state</span><strong>{memo.state} · {memo.label}</strong><p>Export is available only when every section matches the working scenario.</p></section>,
  };
  return <aside className="decision-rail" aria-label="Decision status" tabIndex={0}>
    <header><span>Current posture</span><h2 data-posture={result.posture === "HOLD" ? "HOLD" : "SCREENING"}>{result.posture}</h2><strong>{posture.headline}</strong><p>{posture.detail}</p></header>
    <dl><div><dt>View</dt><dd>{viewLabels[view]}</dd></div><div><dt>Scenario</dt><dd>{changed ? "Unapproved what-if" : "Package case"}</dd></div><div><dt>Unresolved screening gates</dt><dd>{failedGates.length}</dd></div><div><dt>Investment concerns</dt><dd>{concernGates.length}</dd></div><div><dt>Evidence or policy gaps</dt><dd>{evidenceGaps.length}</dd></div><div><dt>Open diligence issues</dt><dd>{openIssues.length}</dd></div><div><dt>Policy</dt><dd>Draft · not reviewed</dd></div></dl>
    {viewNote[view] ?? null}
    <section><span>Primary concern</span><strong>{concernGates[0]?.label ?? failedGates[0]?.label ?? "No unresolved screening gate"}</strong><p>{concernGates[0]?.explanation ?? failedGates[0]?.explanation ?? "Any exception remains visible and requires human IC review."}</p></section>
    <section><span>Next action</span><strong>{nextAction}</strong></section>
    <footer>IC decision pending</footer>
    <BoundaryNote synthetic={false} />
  </aside>;
}

function BaselineApprovalRecord({result}: {result: IntakeResult}) {
  const approval = result.baselineApproval;
  if (!approval) return null;
  return <section className="baseline-record" aria-label="Evidence version approval">
    <div><span>Canonical evidence</span><strong>{approval.version} approved</strong><small>{approval.actor} · {formatHumanDate(approval.approvedAt)}</small></div>
    <p>{approval.rationale}</p>
    <small>Approval covers recognized mappings and exclusions only. Company claims, assumptions, policy, and the investment decision remain separately governed.</small>
  </section>;
}

export function LocalDealShell({result, view, onNavigate, onDeals, onConnect, onPromote, connection, modelTransport, persistenceNotice = ""}: {result: IntakeResult; view: DealView; onNavigate: (view: DealView) => void; onDeals: () => void; onConnect: () => void; onPromote?: (result: IntakeResult) => void; connection: ConnectionState | null; modelTransport?: ModelTransport; persistenceNotice?: string}) {
  const deal = result.deal!;
  const seed = useMemo(() => localWorkspaceSeed(result), [result]);
  const integritySeed = useMemo(() => localWorkspaceIntegritySeed(result), [result]);
  const allowedEvidenceRefs = useMemo(() => new Set(result.analysis!.metrics.map((item) => item.id)), [result]);
  const scenarioContract = useMemo(() => localScenarioContract(), []);
  const {state, update, replace, storageNotice, recovery, discardRejectedState, integrityContract} = useDealWorkspace(seed, allowedEvidenceRefs, scenarioContract, LOCAL_POLICY_OVERRIDE_ROLES, integritySeed);
  const storageAlert = storageNotice === "Saved locally" ? "" : storageNotice;
  const content = view === "overview"
    ? <LocalOverview result={result} state={state} update={update} onNavigate={onNavigate} versionControl={<><BaselineApprovalRecord result={result} />{onPromote ? <LocalChangeControl result={result} state={state} update={update} onPromote={onPromote} /> : null}</>} />
    : view === "financials"
      ? <LocalFinancials result={result} state={state} update={update} />
      : view === "diligence"
        ? <LocalDiligence result={result} state={state} update={update} modelTransport={modelTransport} connection={connection} />
        : view === "documents"
          ? <><ExcelRoundTrip result={result} /><SourceAttachments result={result} /><LocalDocuments result={result} /></>
          : <><EditableMemo state={state} update={update} title={deal.company} subtitle={dealQuestion} scenarioSummary={localScenarioMemoSummary(result, state)} /><LocalBundleTransfer result={result} state={state} /><WorkspaceTransfer state={state} replace={replace} allowedEvidenceRefs={allowedEvidenceRefs} scenarioContract={scenarioContract} integrityContract={integrityContract} /></>;
  return <div className="product-shell">
    <DealSidebar company={deal.company} caseId="local" onDeals={onDeals} onNavigate={onNavigate} view={view} onConnect={onConnect} storageNotice={storageNotice} attention={Boolean(persistenceNotice || storageAlert)} footNote="Public synthetic workspace" />
    <div className="shell-main"><header className="deal-topbar"><div className="topbar-company"><strong>{viewLabels[view]}</strong><small>{viewQuestions[view]}</small></div><div className="topbar-meta"><span><b>Growth</b></span><span>Screening</span><span>As of {formatHumanDate(`${deal.cutoff}T12:00:00Z`)}</span><span className={`posture posture-${result.posture === "HOLD" ? "hold" : "screening"}`}>{result.posture === "HOLD" ? "HOLD" : "Screening"}</span></div><button className="topbar-model" type="button" onClick={onConnect}>Model settings</button></header><div className="workspace-layout"><main className="deal-main" id="main-content">{persistenceNotice ? <p className="persistence-warning" role="status">{persistenceNotice} Export the portable deal from IC Memo before leaving this session.</p> : null}{storageAlert ? <p className="persistence-warning" role="status">{storageAlert}</p> : null}{recovery ? <WorkspaceRecovery recovery={recovery} onStartFresh={discardRejectedState} /> : null}<header className="deal-heading"><div><p className="eyebrow">Growth · {deal.analystOwner}</p><h1>{deal.company}</h1><p>Admitted company package · {result.baselineApproval ? `${result.baselineApproval.version} approved by ${result.baselineApproval.actor}` : "evidence not yet approved"}</p></div><p className="ic-question"><span>Investment question</span>{dealQuestion}</p></header>{content}</main><LocalDecisionRail result={result} state={state} view={view} /></div></div>
  </div>;
}
