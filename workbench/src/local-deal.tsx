import {useMemo, useState} from "react";
import {dealViews, type DealView} from "./App";
import {calculateQuickScenario, processDealPackage, type IntakeResult, type QuickAnalysis} from "./intake";
import {localCaseId, localScenarioContract, localWorkspaceSeed, serializeAdmittedDealBundle} from "./local-deal-state";
import {ModelReviewPanel} from "./model-review-panel";
import type {ConnectionState} from "./model-connection";
import {ModelConnectionButton} from "./model-connection-dialog";
import type {ModelTransport} from "./model-workflow";
import {GROWTH_SCREEN_POLICY, policyThreshold} from "./policy";
import {
  AssumptionRegistry,
  DiligenceWorklist,
  EditableMemo,
  ObservationComposer,
  PolicyRegistry,
  WorkspaceTransfer,
  formatHumanDate,
  useDealWorkspace,
  type AssumptionDefinition,
  type WorkspaceUpdate,
} from "./workspace-ui";
import type {DealWorkspaceState} from "./workspace-state";

const labels: Record<DealView, string> = {overview: "Overview", financials: "Financials", diligence: "Diligence", documents: "Documents", memo: "IC Memo"};
const LOCAL_OVERRIDABLE_GATES = ["retention-nrr"];
const LOCAL_OVERRIDABLE_GATE_SET = new Set(LOCAL_OVERRIDABLE_GATES);
const LOCAL_POLICY_OVERRIDE_ROLES = {"retention-nrr": "Policy owner"};
function money(cents: number) { return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 1, notation: "compact"}).format(cents / 100); }
function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function stateLabel(state: string) { return state.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }

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

export function DealIntake({onCancel, onComplete}: {onCancel: () => void; onComplete: (result: IntakeResult) => void}) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [processing, setProcessing] = useState(false);
  async function validate() { setProcessing(true); try { setResult(await processDealPackage(files)); } finally { setProcessing(false); } }
  return <main className="intake-page" id="main-content">
    <button className="back-button" type="button" onClick={onCancel}>← Deals</button>
    <header className="page-heading intake-heading"><div><p className="eyebrow">New deal</p><h1>Growth SaaS Quick Package</h1><p>Create a browser-local screening workspace from the supported four-file contract.</p></div><span className="quiet-chip">Public-data boundary</span></header>
    <section className="local-processing-note" aria-label="Local processing boundary"><strong>Your selected bytes stay in this browser tab.</strong><p>Files are validated and calculated locally. A model job can send only the evidence summaries you explicitly select after confirmation. Do not use confidential information.</p></section>
    <div className="intake-layout"><section className="panel" aria-labelledby="choose-package-heading"><div className="section-heading"><div><p className="eyebrow">Step 1</p><h2 id="choose-package-heading">Choose the declared files</h2></div><span>1 MB package maximum</span></div><label className="file-picker"><span>Choose package files</span><input data-testid="deal-package-input" type="file" multiple accept=".json,.csv,.pdf,.docx,.pptx,.xlsx,.txt" onChange={(event) => {setFiles(Array.from(event.target.files ?? [])); setResult(null);}} /><strong>{files.length ? `${files.length} files selected` : "Select manifest, deal, monthly financials, and customer ARR"}</strong></label>{files.length ? <ul className="selected-files">{files.map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><span>{file.size.toLocaleString()} bytes</span></li>)}</ul> : null}<button className="primary-button validate-package" type="button" disabled={!files.length || processing} onClick={validate}>{processing ? "Validating locally…" : "Validate and analyze"}</button><details className="sample-downloads"><summary>Download the included Northstar example</summary><p>Download all four files, then select them together above.</p><div><a download href="sample-package/manifest.json">Manifest</a><a download href="sample-package/deal.json">Deal</a><a download href="sample-package/monthly_financials.csv">Monthly financials</a><a download href="sample-package/customer_arr.csv">Customer ARR</a></div></details></section><aside className="panel package-contract" aria-labelledby="package-contract-heading"><p className="eyebrow">Supported contract</p><h2 id="package-contract-heading">What the Desk admits</h2><ol><li><strong>Manifest</strong><span>Required roles, byte counts, and file digests.</span></li><li><strong>Deal terms</strong><span>Cash, financing, and package representations. Uploaded hurdles are not fund policy.</span></li><li><strong>Monthly financials</strong><span>Revenue, cost of revenue, and operating expense in integer cents.</span></li><li><strong>Customer ARR</strong><span>Opening-customer retention with an explicit measurement interval.</span></li></ol><p>Supporting files remain visible but are never silently parsed. Econometric claims require separately supported evidence.</p></aside></div>
    {result ? <section className={`panel intake-result ${result.packageState === "READY" ? "result-ready" : "result-incomplete"}`} aria-labelledby="package-result-heading" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Package result</p><h2 id="package-result-heading">{result.posture}</h2></div><span className={`status status-${result.packageState.toLowerCase()}`}>{stateLabel(result.packageState)}</span></div><p>{result.rationale}</p><div className="table-wrap" tabIndex={0} aria-label="Scrollable package validation"><table><thead><tr><th>Input</th><th>State</th><th>Validation</th><th>Rows</th></tr></thead><tbody>{result.files.map((file, index) => <tr key={`${file.name}-${index}`}><td>{file.name}</td><td><span className={`status status-${file.state.toLowerCase()}`}>{stateLabel(file.state)}</span></td><td>{file.detail}{file.mappings?.length ? <ul className="mapping-list">{file.mappings.map((mapping) => <li key={`${mapping.from}-${mapping.to}`}>{mapping.from} → {mapping.to}</li>)}</ul> : null}</td><td>{file.rows ?? "—"}</td></tr>)}</tbody></table></div>{result.errors.length ? <div className="error-summary"><strong>Resolve before a decision surface is available</strong><ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}{result.packageState === "READY" ? <button className="primary-button" type="button" onClick={() => onComplete(result)}>Open decision review</button> : null}</section> : null}
  </main>;
}

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
  return <section className="workspace-transfer" aria-label="Portable admitted deal"><div><strong>Portable admitted deal</strong><span>Replayable source files, recalculated outputs, and the shared workspace. Private analyst notes are excluded. Public synthetic demonstration only.</span></div><button type="button" onClick={exportBundle}>Export portable deal</button>{notice ? <p role="status">{notice}</p> : null}</section>;
}

function LocalDecisionTests({analysis, state}: {analysis: QuickAnalysis; state: DealWorkspaceState}) {
  const overrides = new Set(state.policyOverrides.filter((item) => LOCAL_OVERRIDABLE_GATE_SET.has(item.gateId) && item.actorRole === GROWTH_SCREEN_POLICY.ownerRole).map((item) => item.gateId));
  const unresolved = analysis.tests.filter((test) => test.blocksAdvancement && !overrides.has(test.gateId));
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">Desk-owned screening policy</p><h2>Screening gates</h2></div><span>{unresolved.length} unresolved</span></div><div className="table-wrap" tabIndex={0} aria-label="Scrollable screening gates"><table><thead><tr><th>Gate</th><th>Observed</th><th>Required</th><th>State</th></tr></thead><tbody>{analysis.tests.map((test) => {const overridden = overrides.has(test.gateId); return <tr key={test.gateId}><td>{test.label}</td><td>{test.observed}</td><td>{test.required}</td><td><span className={`status status-${overridden ? "accepted" : test.state.toLowerCase()}`}>{overridden ? "Policy exception recorded · evidence issue remains open" : stateLabel(test.state)}</span></td></tr>;})}</tbody></table></div><details className="method-disclosure"><summary>Policy ownership and review</summary><p>{analysis.policyProfile.name} · {analysis.policyProfile.owner}. Source: Desk default, outside the company package. Status: {analysis.policyProfile.status.toLowerCase()}. Last reviewed: {formatHumanDate(analysis.policyProfile.lastReviewed)}.</p><p>Thresholds embedded in the uploaded deal file are retained only as package representations. They do not grade or authorize this deal.</p></details></section>;
}

function LocalOverview({result, state, update}: {result: IntakeResult; state: DealWorkspaceState; update: WorkspaceUpdate}) {
  const analysis = result.analysis!;
  const [selectedMetric, setSelectedMetric] = useState(analysis.metrics[0]?.id ?? "");
  const activeMetric = analysis.metrics.find((metric) => metric.id === selectedMetric);
  return <div className="view-stack"><section className="decision-brief"><div><p className="eyebrow">Provisional analytical posture</p><h2>{result.posture}</h2><p>{result.rationale}</p></div><dl><div><dt>IC state</dt><dd>Further diligence required</dd></div><div><dt>Primary concern</dt><dd>{percent(analysis.ordinaryNrr)} cohort retention proxy</dd></div><div><dt>Cohort interval</dt><dd>{analysis.cohortElapsedMonths} months · not annual NRR</dd></div></dl></section><section className="overview-metrics">{analysis.metrics.slice(0, 5).map((metric) => <button type="button" aria-pressed={metric.id === selectedMetric} key={metric.id} onClick={() => setSelectedMetric(metric.id)}><span>{metric.label}</span><strong>{metric.display}</strong><small>Inspect sources</small></button>)}</section>{activeMetric ? <section className="workspace-card local-lineage" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Calculation trace</p><h2>{activeMetric.label}</h2></div><strong>{activeMetric.display}</strong></div><p>{activeMetric.meaning}</p><dl><div><dt>Source files</dt><dd>{activeMetric.sourceFiles.join(" · ")}</dd></div><div><dt>Boundary</dt><dd>{activeMetric.limitation}</dd></div></dl></section> : null}<LocalDecisionTests analysis={analysis} state={state} /><ObservationComposer state={state} update={update} /></div>;
}

function LocalFinancials({result, state, update}: {result: IntakeResult; state: DealWorkspaceState; update: WorkspaceUpdate}) {
  const analysis = result.analysis!, deal = result.deal!;
  const {growth, multipleValue: multiple, changed, output: working} = normalizedLocalScenario(result, state);
  const canonical = calculateQuickScenario(analysis, deal, {annualRevenueGrowth: deal.annualRevenueGrowth, exitRevenueMultiple: deal.exitRevenueMultiple});
  const moicPolicy = policyThreshold(analysis.policyProfile, "gross_moic");
  const returnPolicy = policyThreshold(analysis.policyProfile, "annualized_return");
  const clears = (observed: number, threshold: typeof moicPolicy) => threshold.operator === ">=" ? observed >= threshold.value : observed <= threshold.value;
  const returnsClear = clears(working.grossMoic, moicPolicy) && clears(working.annualizedGrossReturn, returnPolicy);
  const growthSteps = [Math.max(-.99, deal.annualRevenueGrowth - .1), deal.annualRevenueGrowth, Math.min(5, deal.annualRevenueGrowth + .1)];
  const multipleSteps = [Math.max(.01, deal.exitRevenueMultiple - 1), deal.exitRevenueMultiple, Math.min(100, deal.exitRevenueMultiple + 1)];
  return <div className="finance-workspace"><section className="scenario-command"><div><p className="eyebrow">Working scenario</p><h2>Test the return case</h2><p>The admitted package case remains unchanged. These bounded inputs create an unapproved what-if and rerun deterministic arithmetic.</p></div><div className="scenario-controls"><label><span>Annual revenue growth (%)</span><input aria-label="Annual revenue growth (%)" type="number" min="-99" max="500" step="1" value={Number((growth * 100).toFixed(2))} onChange={(event) => update({scenarioValues: {...state.scenarioValues, localGrowth: boundedPercentScenarioInput(event.target.value, deal.annualRevenueGrowth)}})} /></label><label><span>Exit revenue multiple</span><input aria-label="Exit revenue multiple" type="number" min="0.01" max="100" step="0.25" value={multiple} onChange={(event) => update({scenarioValues: {...state.scenarioValues, localExitMultiple: boundedScenarioInput(event.target.value, deal.exitRevenueMultiple, .01, 100)}})} /></label><button type="button" className="secondary-button" disabled={!changed} onClick={() => update({scenarioValues: {...state.scenarioValues, localGrowth: String(deal.annualRevenueGrowth), localExitMultiple: String(deal.exitRevenueMultiple)}})}>Reset</button></div></section><section className="canonical-comparison"><article><span>Admitted package case · unreviewed</span><h3>{percent(deal.annualRevenueGrowth)} growth · {deal.exitRevenueMultiple.toFixed(1)}x exit</h3><strong>{canonical.grossMoic.toFixed(2)}x · {percent(canonical.annualizedGrossReturn)}</strong></article><article data-state={changed ? "what-if" : "canonical"}><span>{changed ? "Unapproved what-if" : "Working case matches package"}</span><h3>{percent(growth)} growth · {multiple.toFixed(1)}x exit</h3><strong>{working.grossMoic.toFixed(2)}x · {percent(working.annualizedGrossReturn)}</strong></article></section><section className="finance-kpi-grid"><article className="finance-kpi"><span>Terminal revenue</span><strong>{money(working.terminalRevenueCents)}</strong><small>Deterministic scenario</small></article><article className="finance-kpi"><span>Exit equity value</span><strong>{money(working.exitEquityCents)}</strong><small>Debt-neutral Quick Package</small></article><article className="finance-kpi"><span>Gross multiple</span><strong>{working.grossMoic.toFixed(2)}x</strong><small>{moicPolicy.displayValue} Desk screen</small></article><article className="finance-kpi"><span>Annualized gross return</span><strong>{percent(working.annualizedGrossReturn)}</strong><small>{returnPolicy.displayValue} Desk screen</small></article></section><section className="finance-section"><div className="section-heading"><div><p className="eyebrow">Decision consequence</p><h2>{returnsClear ? "Illustrative return screens clear" : "Illustrative return screens miss"}</h2></div><span>{changed ? "Unapproved what-if" : "Package case"}</span></div><p>Retention remains a material concern at {percent(analysis.ordinaryNrr)} across an {analysis.cohortElapsedMonths}-month interval. Clearing return screens does not make the package IC-ready.</p></section><section className="finance-section"><div className="section-heading"><div><p className="eyebrow">Sensitivity</p><h2>Growth × exit multiple</h2></div><span>Click a cell to load the working case</span></div><div className="heatmap-wrap"><table className="sensitivity-heatmap"><thead><tr><th>Growth / exit</th>{multipleSteps.map((item) => <th key={item}>{item.toFixed(1)}x</th>)}</tr></thead><tbody>{growthSteps.map((growthValue) => <tr key={growthValue}><th>{percent(growthValue)}</th>{multipleSteps.map((multipleValue) => {const cell = calculateQuickScenario(analysis, deal, {annualRevenueGrowth: growthValue, exitRevenueMultiple: multipleValue}); return <td key={multipleValue} data-state={clears(cell.grossMoic, moicPolicy) && clears(cell.annualizedGrossReturn, returnPolicy) ? "clears" : "misses"}><button type="button" onClick={() => update({scenarioValues: {...state.scenarioValues, localGrowth: String(growthValue), localExitMultiple: String(multipleValue)}})}><strong>{cell.grossMoic.toFixed(2)}x</strong><small>{percent(cell.annualizedGrossReturn)}</small></button></td>;})}</tr>)}</tbody></table></div></section></div>;
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
  return <div className="view-stack"><label className="mobile-workspace-selector"><span>Diligence workspace</span><select value={section} onChange={(event) => setSection(event.target.value as typeof section)}>{tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}</select></label><nav className="workspace-tabs" aria-label="Diligence workspace">{tabs.map((tab) => <button type="button" key={tab.id} aria-pressed={section === tab.id} onClick={() => setSection(tab.id)}>{tab.label}</button>)}</nav>{section === "issues" ? <DiligenceWorklist state={state} update={update} lockedIssueIds={lockedIssueIds} /> : null}{section === "assumptions" ? <AssumptionRegistry assumptions={assumptions} state={state} update={update} /> : null}{section === "policy" ? <PolicyRegistry profile={analysis.policyProfile} state={state} update={update} blockingGates={analysis.tests.filter((test) => test.blocksAdvancement).map((test) => ({gateId: test.gateId, label: test.label}))} overridableGateIds={LOCAL_OVERRIDABLE_GATES} /> : null}{section === "model" ? <ModelReviewPanel dealId={dealId} connection={connection} transport={modelTransport} hostedEligible={hostedEligible} unavailableReason="Hosted review is enabled for the included Northstar sample only. Other admitted packages keep deterministic analysis and human workflow, but no model control is presented as functional." proposals={state.proposals} onProposalsChange={(next) => update((current) => ({proposals: typeof next === "function" ? next(current.proposals) : next}))} evidence={analysis.metrics.map((metric) => ({id: metric.id, title: metric.label, displayValue: metric.display, summary: metric.meaning}))} /> : null}</div>;
}

function LocalDocuments({result}: {result: IntakeResult}) {
  const analysis = result.analysis!; const [query, setQuery] = useState(""); const keyFor = (preview: QuickAnalysis["sourcePreviews"][number]) => `${preview.sourceFile}:${preview.title}:${preview.period}`; const initialPreview = analysis.sourcePreviews.find((preview) => preview.sourceFile === "customer_arr.csv") ?? analysis.sourcePreviews[0]; const [selected, setSelected] = useState(initialPreview ? keyFor(initialPreview) : "");
  const previews = analysis.sourcePreviews.filter((preview) => JSON.stringify(preview).toLowerCase().includes(query.trim().toLowerCase()));
  const active = previews.find((preview) => keyFor(preview) === selected) ?? previews[0];
  return <div className="documents-workspace"><section className="document-register"><div className="section-heading"><div><p className="eyebrow">Local package</p><h2>Sources and evidence</h2></div><span>{result.files.filter((file) => file.state === "READY").length} ready</span></div><label className="search-field"><span>Search source excerpts</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="source-list">{previews.map((preview) => <button type="button" aria-pressed={keyFor(preview) === keyFor(active)} className={keyFor(preview) === keyFor(active) ? "active" : ""} key={keyFor(preview)} onClick={() => setSelected(keyFor(preview))}><strong>{preview.title}</strong><small>{preview.sourceFile} · {preview.period}</small><em>{stateLabel(preview.classification)}</em></button>)}</div></section><section className="document-preview">{active ? <><header><div><p className="eyebrow">Evidence preview</p><h2>{active.title}</h2><p>{active.sourceFile} · {active.period}</p></div><span className="status status-recognized">{stateLabel(active.classification)}</span></header><div className="excerpt-list"><article><dl>{active.excerpt.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></article>{active.rows?.length ? <div className="source-row-table" tabIndex={0} aria-label="Exact admitted source rows"><table><caption>{active.rows.length} exact admitted source rows</caption><thead><tr><th>Source row</th>{active.rows[0].cells.map((cell) => <th key={cell.label}>{cell.label}</th>)}</tr></thead><tbody>{active.rows.map((row) => <tr key={row.dataRow}><th>{row.dataRow}</th>{row.cells.map((cell) => <td key={cell.label}>{cell.value}</td>)}</tr>)}</tbody></table></div> : null}</div><aside className="linked-calculations"><h3>Outputs using this source</h3>{analysis.metrics.filter((metric) => metric.sourceFiles.includes(active.sourceFile)).map((metric) => <div className="linked-output" key={metric.id}><span>{metric.label}</span><strong>{metric.display}</strong><small>{metric.meaning}</small></div>)}</aside><details className="technical-record"><summary>Validation receipt</summary><dl>{result.files.filter((file) => file.name === active.sourceFile).map((file) => <div key={file.name}><dt>{file.name}</dt><dd>{file.sha256 ?? file.detail}</dd></div>)}</dl></details></> : <p>No source matches the search.</p>}</section></div>;
}

function localScenarioMemoSummary(result: IntakeResult, state: DealWorkspaceState) {
  const {growth, multipleValue, changed, output} = normalizedLocalScenario(result, state);
  return {state: changed ? "Unapproved what-if" as const : "Canonical case" as const, label: changed ? `${percent(growth)} growth · ${multipleValue.toFixed(1)}x exit` : "Admitted package case", returnLine: `${percent(output.annualizedGrossReturn)} annualized gross return · ${output.grossMoic.toFixed(2)}x gross multiple`, detail: `${money(output.terminalRevenueCents)} terminal revenue · ${money(output.exitEquityCents)} exit equity value. The working scenario does not overwrite the admitted package case.`};
}

function LocalDecisionRail({result, state, view}: {result: IntakeResult; state: DealWorkspaceState; view: DealView}) {
  const analysis = result.analysis!;
  const overrides = new Set(state.policyOverrides.filter((item) => LOCAL_OVERRIDABLE_GATE_SET.has(item.gateId) && item.actorRole === GROWTH_SCREEN_POLICY.ownerRole).map((item) => item.gateId));
  const failedGates = analysis.tests.filter((test) => test.blocksAdvancement && !overrides.has(test.gateId));
  const concernGates = failedGates.filter((test) => test.state === "CONCERN");
  const evidenceGaps = failedGates.filter((test) => test.state !== "CONCERN");
  const openIssues = state.issues.filter((issue) => issue.status !== "RESOLVED");
  const {changed} = normalizedLocalScenario(result, state);
  const nextAction = openIssues.length
    ? `Advance ${openIssues.length} open diligence ${openIssues.length === 1 ? "issue" : "issues"}; ${failedGates.length} screening ${failedGates.length === 1 ? "gate still lacks" : "gates still lack"} a policy disposition.`
    : failedGates.length
      ? "Disposition unresolved screening gates with evidence or a recorded policy-owner exception."
      : "Document the policy-owner exception and complete human IC review.";
  return <aside className="decision-rail" aria-label="Decision status" tabIndex={0}><header><span>Current posture</span><strong>FURTHER DILIGENCE</strong><p>Screening complete; no IC advancement</p></header><dl><div><dt>View</dt><dd>{labels[view]}</dd></div><div><dt>Scenario</dt><dd>{changed ? "Unapproved what-if" : "Package case"}</dd></div><div><dt>Unresolved screening gates</dt><dd>{failedGates.length}</dd></div><div><dt>Investment concerns</dt><dd>{concernGates.length}</dd></div><div><dt>Evidence or policy gaps</dt><dd>{evidenceGaps.length}</dd></div><div><dt>Open diligence issues</dt><dd>{openIssues.length}</dd></div><div><dt>Policy</dt><dd>Draft · not reviewed</dd></div></dl><section><span>Primary concern</span><strong>{concernGates[0]?.label ?? failedGates[0]?.label ?? "No unresolved screening gate"}</strong><p>{concernGates[0]?.explanation ?? failedGates[0]?.explanation ?? "Any exception remains visible and requires human IC review."}</p></section><section><span>Next action</span><strong>{nextAction}</strong></section><footer>IC decision pending</footer></aside>;
}

export function LocalDealShell({result, view, onNavigate, onDeals, onConnect, connection, modelTransport, persistenceNotice = ""}: {result: IntakeResult; view: DealView; onNavigate: (view: DealView) => void; onDeals: () => void; onConnect: () => void; connection: ConnectionState | null; modelTransport?: ModelTransport; persistenceNotice?: string}) {
  const deal = result.deal!;
  const seed = useMemo(() => localWorkspaceSeed(result), [result]);
  const allowedEvidenceRefs = useMemo(() => new Set(result.analysis!.metrics.map((item) => item.id)), [result]);
  const scenarioContract = useMemo(() => localScenarioContract(), []);
  const {state, update, replace, storageNotice, integrityContract} = useDealWorkspace(seed, allowedEvidenceRefs, scenarioContract, LOCAL_POLICY_OVERRIDE_ROLES);
  const storageAlert = storageNotice === "Saved locally" ? "" : storageNotice;
  const content = view === "overview"
    ? <LocalOverview result={result} state={state} update={update} />
    : view === "financials"
      ? <LocalFinancials result={result} state={state} update={update} />
      : view === "diligence"
        ? <LocalDiligence result={result} state={state} update={update} modelTransport={modelTransport} connection={connection} />
        : view === "documents"
          ? <LocalDocuments result={result} />
          : <><EditableMemo state={state} update={update} title={deal.company} subtitle="What must be true for this package to advance beyond screening?" scenarioSummary={localScenarioMemoSummary(result, state)} /><LocalBundleTransfer result={result} state={state} /><WorkspaceTransfer state={state} replace={replace} allowedEvidenceRefs={allowedEvidenceRefs} scenarioContract={scenarioContract} integrityContract={integrityContract} /></>;
  return <div className="product-shell">
    <aside className="sidebar"><button type="button" className="wordmark" onClick={onDeals}><span>U</span><strong>Underwriting Desk</strong></button><nav aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={item === view ? "active" : ""} aria-current={item === view ? "page" : undefined} onClick={() => onNavigate(item)}>{labels[item]}</button>)}</nav><div className="sidebar-foot"><button type="button" onClick={onConnect}>Model settings</button><span>{persistenceNotice || storageAlert ? "Workspace attention required" : storageNotice}</span><small>Public synthetic workspace</small></div></aside>
    <div className="shell-main"><header className="deal-topbar"><button type="button" className="mobile-wordmark" onClick={onDeals}>Underwriting Desk</button><strong>{deal.company}</strong><div className="topbar-meta"><span>Growth SaaS Quick Package</span><span>As of {formatHumanDate(`${deal.cutoff}T12:00:00Z`)}</span></div><ModelConnectionButton connection={connection} onClick={onConnect} /></header><nav className="mobile-nav" aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={item === view ? "active" : ""} aria-current={item === view ? "page" : undefined} onClick={() => onNavigate(item)}>{labels[item]}</button>)}</nav><div className="workspace-layout"><main className="deal-main" id="main-content">{persistenceNotice ? <p className="persistence-warning" role="status">{persistenceNotice} Export the portable deal from IC Memo before leaving this session.</p> : null}{storageAlert ? <p className="persistence-warning" role="status">{storageAlert}</p> : null}<header className="deal-heading"><div><p className="eyebrow">{labels[view]}</p><h1>{deal.company}</h1><p>Supported public package · analyst owner: {deal.analystOwner}</p></div><p className="ic-question"><span>Investment question</span>What must be true for this package to advance beyond screening?</p></header>{content}<footer className="deal-boundary">Public demonstration · Do not upload confidential information · Not investment advice</footer></main><LocalDecisionRail result={result} state={state} view={view} /></div></div>
  </div>;
}
