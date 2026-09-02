import {Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {caseCatalog, isCaseId, loadCase, type CaseId} from "./case-data";
import {DocumentsWorkspace} from "./documents-workspace";
import {FinancialWorkspace, scenarioMemoSummary} from "./financial-workspace";
import {canonicalEvidenceForCase, modelEvidenceForCase} from "./canonical-evidence";
import {DealIntake, LocalDealShell} from "./local-deal";
import {installAdmittedDealBundle, loadAdmittedDeal, persistAdmittedDeal, validateAdmittedDealBundle} from "./local-deal-state";
import type {IntakeResult} from "./intake";
import {LineageDrawer} from "./lineage-drawer";
import {createAdapterTransport, type ConnectionState} from "./model-connection";
import {ModelConnectionButton, ModelConnectionDialog} from "./model-connection-dialog";
import {ModelReviewPanel} from "./model-review-panel";
import {ProposalLedgerImport} from "./proposal-ledger-import";
import type {ModelTransport} from "./model-workflow";
import {ATLAS_SCREEN_POLICY, HELIOS_SCREEN_POLICY} from "./policy";
import type {CaseData, Metric} from "./types";
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
} from "./workspace-ui";
import {createWorkspaceIntegrityContract, storageKey, validateWorkspace, type WorkspaceScenarioContract, type WorkspaceSeed} from "./workspace-state";

export const dealViews = ["overview", "financials", "diligence", "documents", "memo"] as const;
export type DealView = (typeof dealViews)[number];
export type RouteView = DealView | "deals";
export interface RouteState { caseId: CaseId | "local"; view: RouteView }

const viewLabels: Record<DealView, string> = {overview: "Overview", financials: "Financials", diligence: "Diligence", documents: "Documents", memo: "IC Memo"};
const legacyViews: Record<string, DealView> = {risks: "diligence", thesis: "overview", "value-creation": "financials", explore: "documents", sources: "documents", methodology: "diligence", audit: "documents", underwriting: "financials"};

export function parseRoute(): RouteState {
  const parts = window.location.hash.replace(/^#\//, "").split("/");
  const caseId = parts[1] ?? "";
  const requested = parts[2] ?? "overview";
  if (caseId === "local" && parts.length >= 3) return {caseId: "local", view: dealViews.includes(requested as DealView) ? requested as DealView : "overview"};
  if (parts.length < 3 || !isCaseId(caseId)) return {caseId: "atlasgrid", view: "deals"};
  return {caseId, view: dealViews.includes(requested as DealView) ? requested as DealView : legacyViews[requested] ?? "overview"};
}

function routePath(caseId: string, view: DealView) { return `#/v3/${caseId}/${view}`; }
function statusLabel(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function money(cents: number) { return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1}).format(cents / 100); }
function percent(value: string | number) { return `${(Number(value) * 100).toFixed(1)}%`; }
function sentence(value: string) { return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`; }

class RetainedEvidenceBoundary extends Component<{children: ReactNode; onReset: () => void}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) { return {error}; }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="panel error-summary" role="alert"><p className="eyebrow">Evidence boundary</p><h2>Analysis unavailable</h2><p>The retained package is incomplete for this view, so no analytical conclusion is shown.</p><button className="secondary-button" type="button" onClick={this.props.onReset}>Return to Deals</button><details><summary>Technical reason</summary><p>{this.state.error.message}</p></details></section>;
  }
}

interface DealIndexSummary {openIssues: number; lastActivity: string; working: boolean; nextAction: string}

function DealList({onOpen, onNew, onConnect, connection, localDeal, onOpenLocal, onImportLocal, importNotice, loadCaseFn}: {onOpen: (caseId: CaseId) => void; onNew: () => void; onConnect: () => void; connection: ConnectionState | null; localDeal: IntakeResult | null; onOpenLocal: () => void; onImportLocal: (file?: File) => void; importNotice: string; loadCaseFn: (caseId: CaseId) => Promise<CaseData>}) {
  const [summaries, setSummaries] = useState<Partial<Record<CaseId, DealIndexSummary>>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.all(caseCatalog.map(async (deal) => {
      const data = await loadCaseFn(deal.caseId);
      const seed = workspaceSeed(data);
      const allowed = new Set([...data.metricRegistry.map((item) => item.metric_id), ...data.analyses.map((item) => item.analysis_id), ...data.artifacts.map((item) => item.artifact_id)]);
      const raw = window.localStorage?.getItem(storageKey(data.caseId));
      const state = raw ? validateWorkspace(JSON.parse(raw) as unknown, data.caseId, allowed, scenarioContractFor(data), createWorkspaceIntegrityContract(seed)) : null;
      const issues = state?.issues ?? seed.issues;
      const openIssues = issues.filter((issue) => issue.status !== "RESOLVED");
      const working = state ? (data.peEngine ? state.scenarioValues.peScenario !== "selected" : state.scenarioValues.vcScenario !== "milestone" || state.scenarioValues.vcRiskCell !== data.vcEngine!.risk_sensitivity.canonical_cell_id || state.scenarioValues.vcLossPolicy !== data.vcEngine!.risk_sensitivity.canonical_policy_threshold) : false;
      return [deal.caseId, {openIssues: openIssues.length, lastActivity: state?.updatedAt ?? deal.asOf, working, nextAction: openIssues.length ? `${data.decision.decision === "HOLD" ? "Maintain HOLD; address" : "Address"}: ${openIssues[0].title}` : "Complete named human IC review"}] as const;
    })).then((entries) => {if (!cancelled) setSummaries(Object.fromEntries(entries));}).catch(() => {if (!cancelled) setSummaries({});});
    return () => {cancelled = true;};
  }, [loadCaseFn]);
  const dealButton = (deal: typeof caseCatalog[number]) => {
    const summary = summaries[deal.caseId];
    const blockers = summary?.openIssues ?? deal.blockerCount;
    const next = summary?.nextAction ?? `${deal.posture === "HOLD" ? "Maintain HOLD; address" : "Address"}: ${deal.primaryBlocker}`;
    return <button type="button" className="deal-row" key={deal.caseId} aria-label={`Open ${deal.company} — ${deal.posture}; ${blockers} open issues; next: ${next}`} onClick={() => onOpen(deal.caseId)}><span><strong>{deal.company}</strong><small>{deal.investmentQuestion}</small></span><span>{deal.caseType}</span><span>{deal.owner}</span><span>{summary?.working ? "What-if open" : deal.stage}</span><span className={`posture posture-${deal.posture.toLowerCase()}`}>{deal.posture}</span><span>{blockers}</span><span>{formatHumanDate(summary?.lastActivity ?? deal.asOf)}</span><span>{next}</span></button>;
  };
  return <main className="deals-page" id="main-content">
    <header className="deals-header"><div><div className="brand-lockup"><span>U</span><strong>Underwriting Desk</strong></div><p>Evidence-linked underwriting where deterministic finance, policy and human judgment remain separate.</p></div><div><ModelConnectionButton connection={connection} onClick={onConnect} /><label className="file-button">Import deal<input type="file" accept="application/json,.json" onChange={(event) => onImportLocal(event.target.files?.[0])} /></label><button className="primary-button" type="button" data-testid="new-deal-button" onClick={onNew}>New deal</button></div></header>
    {importNotice ? <p className="import-notice" role="status">{importNotice}</p> : null}
    <section className="deal-index" aria-labelledby="active-deals-heading"><div className="section-heading"><div><p className="eyebrow">Decision workspaces</p><h1 id="active-deals-heading">Deals</h1></div><span>{caseCatalog.length} retained synthetic cases{localDeal ? " · 1 admitted local case" : ""}</span></div><div className="deal-table" aria-label="Deal decision workspaces"><div className="deal-table-head" aria-hidden="true"><span>Company</span><span>Strategy</span><span>Owner</span><span>Stage</span><span>Posture</span><span>Open issues</span><span>Last activity</span><span>Next action</span></div>{localDeal ? <button type="button" className="deal-row" aria-label={`Open ${localDeal.deal?.company} — screening; ${localDeal.analysis?.tests.filter((test) => test.blocksAdvancement).length ?? "unknown"} blockers`} onClick={onOpenLocal}><span><strong>{localDeal.deal?.company}</strong><small>Supported Quick Package</small></span><span>Growth</span><span>{localDeal.deal?.analystOwner}</span><span>Screening</span><span className="posture posture-screening">Screening</span><span>{localDeal.analysis?.tests.filter((test) => test.blocksAdvancement).length ?? "—"}</span><span>{formatHumanDate(`${localDeal.deal?.cutoff}T12:00:00Z`)}</span><span>{localDeal.posture}</span></button> : null}{caseCatalog.map(dealButton)}</div></section>
    <section className="intake-callout"><div><p className="eyebrow">Test with your own package</p><h2>Growth SaaS Quick Package</h2><p>Upload four declared files. Validation and calculations stay in the browser. Uploaded thresholds never become fund policy.</p></div><button className="secondary-button" type="button" onClick={onNew}>Open intake</button></section>
    <footer className="public-boundary">Public demonstration with fictional companies and synthetic records. Not investment advice. Do not upload confidential information.</footer>
  </main>;
}

function assumptionsFor(caseData: CaseData): AssumptionDefinition[] {
  if (caseData.peEngine) {
    const transaction = caseData.peEngine.selected.engine_inputs.transaction;
    return [
      {id: "entry-value", label: "Entry enterprise value", value: money(Number(transaction.entry_enterprise_value_cents)), owner: "Deal team", basis: "Analyst scenario", consequence: "Changes sponsor equity, leverage and gross returns.", status: "Unreviewed"},
      {id: "funded-debt", label: "Funded term debt", value: money(Number(transaction.funded_term_face_cents)), owner: "Financing team", basis: "Proposed term", consequence: "Changes interest burden, covenant headroom and equity contribution.", status: "Unreviewed"},
      {id: "exit-multiple", label: "Exit EBITDA multiple", value: `${Number(transaction.exit_multiple).toFixed(1)}x`, owner: "Deal team", basis: "Analyst scenario", consequence: "Changes terminal enterprise value and sponsor proceeds.", status: "Unreviewed"},
      {id: "pricing-credit", label: "Pricing upside", value: "No base-case credit", owner: "Commercial diligence", basis: "Empirical-test judgment", consequence: "The synthetic renewal test is negative; the selected case gives pricing no upside credit.", status: "Unreviewed"},
    ];
  }
  const engine = caseData.vcEngine!;
  const bridge = engine.operating_exit_bridges.milestone;
  return [
    {id: "growth", label: "Annual revenue growth", value: percent(bridge.annual_revenue_growth), owner: "Management representation", basis: "Financing-plan scenario", consequence: "Changes terminal revenue and the operating exit bridge.", status: "UNREVIEWED"},
    {id: "exit-multiple", label: "Exit revenue multiple", value: `${Number(bridge.exit_revenue_multiple).toFixed(1)}x`, owner: "Management representation", basis: "Financing-plan scenario", consequence: "Changes enterprise value and investor proceeds.", status: "UNREVIEWED"},
    {id: "catastrophe-prior", label: "Catastrophe-state prior", value: percent(engine.distribution.priors.catastrophe_probability), owner: engine.distribution.priors.owner, basis: "Synthetic analyst input", consequence: "Directly determines the loss-policy screen in this retained structure; the seeded replay is a generator check, not an independent estimate.", status: engine.distribution.priors.approval_status},
    {id: "loss-ceiling", label: "Maximum probability below 1.0x", value: percent(HELIOS_SCREEN_POLICY.thresholds.find((item) => item.metric === "probability_below_one")!.value), owner: HELIOS_SCREEN_POLICY.owner, basis: "Desk-owned draft policy", consequence: "Screens the selected catastrophe prior because every catastrophe path loses in this retained structure. A sensitivity edit never rewrites the canonical policy.", status: HELIOS_SCREEN_POLICY.status},
  ];
}

function workspaceSeed(caseData: CaseData): WorkspaceSeed {
  const issues = caseData.decision.issue_summary.issues.map((issue) => ({id: issue.issue_id, title: issue.title, description: issue.consequence, owner: issue.owner, priority: issue.materiality, status: issue.state === "CLEARED" ? "RESOLVED" as const : "OPEN" as const, dueDate: null, decisionImpact: issue.consequence, evidenceRefs: [...issue.evidence_metric_ids, ...issue.analysis_ids], resolution: issue.state === "CLEARED" ? "Cleared in the retained canonical case." : null}));
  const blocker = caseData.decision.issue_summary.issues.find((issue) => issue.blocks_advancement);
  return {caseId: caseData.caseId, issues, lockedIssueIds: caseData.decision.issue_summary.issues.filter((issue) => issue.kind === "QUANTITATIVE_HURDLE").map((issue) => issue.issue_id), canonicalEvidence: canonicalEvidenceForCase(caseData), memoSections: [
    {sectionId: "recommendation", title: "Recommendation and rationale", body: caseData.decision.rationale, provenance: "DETERMINISTIC_ANALYSIS", updatedBy: "Financial model"},
    {sectionId: "economics", title: "Economics", body: caseData.summaryMetrics.slice(0, 4).map((metric) => `${metric.label}: ${metric.value}`).join(" · "), provenance: "DETERMINISTIC_ANALYSIS", updatedBy: "Financial model"},
    {sectionId: "downside", title: "Downside and what must be true", body: [blocker?.consequence ?? "No declared blocking issue.", ...caseData.decision.path_to_yes].map(sentence).join(" "), provenance: "ANALYST_JUDGMENT", updatedBy: "Deal team"},
  ], scenarioValues: caseData.peEngine ? {peScenario: "selected", peCompare: "downside", peAxis: caseData.peEngine.sensitivities.axis_order[0], peCell: caseData.peEngine.sensitivities.one_way.filter((item) => item.axis === caseData.peEngine!.sensitivities.axis_order[0])[1]?.cell_id ?? ""} : {vcScenario: "milestone", vcCompare: "downside", vcAxis: caseData.vcEngine!.sensitivities.default_axis, vcCell: caseData.vcEngine!.sensitivities.default_cell_id, vcRiskCell: caseData.vcEngine!.risk_sensitivity.canonical_cell_id, vcLossPolicy: caseData.vcEngine!.risk_sensitivity.canonical_policy_threshold}};
}

function scenarioContractFor(caseData: CaseData): WorkspaceScenarioContract {
  if (caseData.peEngine) return {fields: {
    peScenario: {kind: "ENUM", values: ["ask", "selected", "downside"]},
    peCompare: {kind: "ENUM", values: ["ask", "selected", "downside"]},
    peAxis: {kind: "ENUM", values: caseData.peEngine.sensitivities.axis_order},
    peCell: {kind: "ENUM", values: caseData.peEngine.sensitivities.one_way.map((item) => item.cell_id)},
  }};
  return {fields: {
    vcScenario: {kind: "ENUM", values: ["base", "milestone", "downside", "financing_shortfall"]},
    vcCompare: {kind: "ENUM", values: ["base", "milestone", "downside", "financing_shortfall"]},
    vcAxis: {kind: "ENUM", values: caseData.vcEngine!.sensitivities.axis_order},
    vcCell: {kind: "ENUM", values: caseData.vcEngine!.sensitivities.cells.map((item) => item.cell_id)},
    vcRiskCell: {kind: "ENUM", values: caseData.vcEngine!.risk_sensitivity.cells.map((item) => item.cell_id)},
    vcLossPolicy: {kind: "ENUM", values: caseData.vcEngine!.risk_sensitivity.policy_threshold_choices},
  }};
}

function MetricStrip({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  return <section className="overview-metrics" aria-label="Headline financial measures">{caseData.summaryMetrics.slice(0, 5).map((metric) => <button type="button" key={metric.metric_id} onClick={(event) => openMetric(metric, event.currentTarget)}><span>{metric.label}</span><strong>{metric.value}</strong><small>Trace source</small></button>)}</section>;
}

function Overview({caseData, state, update, openMetric}: {caseData: CaseData; state: ReturnType<typeof useDealWorkspace>["state"]; update: ReturnType<typeof useDealWorkspace>["update"]; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const blocker = state.issues.find((issue) => issue.status !== "RESOLVED");
  const decisive = caseData.summaryMetrics[0];
  return <div className="view-stack"><section className="decision-brief"><div><p className="eyebrow">Provisional analytical posture</p><h2>{caseData.decision.decision}</h2><p>{caseData.decision.rationale}</p></div><dl><div><dt>Price or terms</dt><dd>{caseData.decision.terms?.[0] ?? "Terms remain subject to diligence"}</dd></div><div><dt>Primary blocker</dt><dd>{blocker?.title ?? "No unresolved issue"}</dd></div><div><dt>Next committee action</dt><dd>{caseData.decision.path_to_yes[0]}</dd></div></dl></section><MetricStrip caseData={caseData} openMetric={openMetric} /><section className="what-must-be-true"><div><p className="eyebrow">Decision logic</p><h2>What must be true</h2></div><div>{caseData.decision.conditions.slice(0, 4).map((condition, index) => <article key={condition}><span>{String(index + 1).padStart(2, "0")}</span><p>{condition}</p></article>)}</div></section><section className="driver-grid"><article><p className="eyebrow">Decisive evidence</p><h3>{decisive.label}</h3><strong>{decisive.value}</strong><p>{decisive.detail}</p><button type="button" onClick={(event) => openMetric(decisive, event.currentTarget)}>Inspect evidence</button></article><article><p className="eyebrow">Counterthesis</p><h3>Why the current call may be wrong</h3><p>{caseData.thesis.counterthesis}</p></article><article><p className="eyebrow">Downside</p><h3>{blocker?.title}</h3><p>{blocker?.decisionImpact}</p></article></section><ObservationComposer state={state} update={update} /></div>;
}

function EconometricTest({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const analysisId = caseData.caseId === "helios" ? "HX-06" : "AG-07";
  const analysis = caseData.analyses.find((item) => item.analysis_id === analysisId)!;
  const primaryOutput = analysis.outputs[0];
  const registry = caseData.metricRegistry.find((metric) => metric.metric_id.startsWith(`${caseData.caseId}-${analysisId.toLowerCase()}-`) && metric.display_value);
  const estimate = Number(primaryOutput?.value ?? 0);
  const effect = primaryOutput?.unit === "log_points" ? Math.expm1(estimate) : estimate / 100;
  const measuredDirection = Math.abs(effect) < 0.00005 ? "neutral" : effect < 0 ? "negative" : "positive";
  const decisionSignal = measuredDirection === "neutral" ? "neutral" : caseData.caseId === "helios" ? measuredDirection === "negative" ? "favorable" : "adverse" : measuredDirection === "negative" ? "adverse" : "favorable";
  const heliosHeading = measuredDirection === "negative" ? "Optimizer test reduced unit compute cost" : measuredDirection === "positive" ? "Optimizer test increased unit compute cost" : "Optimizer test did not change unit compute cost";
  const heliosFinding = measuredDirection === "negative" ? `${Math.abs(effect * 100).toFixed(1)}% less compute per workload in the planted randomized test.` : measuredDirection === "positive" ? `${Math.abs(effect * 100).toFixed(1)}% more compute per workload in the planted randomized test.` : "The planted randomized test found no measurable difference in compute per workload.";
  const atlasHeading = measuredDirection === "negative" ? "Higher renewal pricing reduced conversion" : measuredDirection === "positive" ? "Higher renewal pricing increased conversion" : "Higher renewal pricing did not change conversion";
  const atlasFinding = measuredDirection === "negative" ? `${Math.abs(estimate).toFixed(1)} percentage points lower renewal conversion at the higher offer in the planted randomized test.` : measuredDirection === "positive" ? `${Math.abs(estimate).toFixed(1)} percentage points higher renewal conversion at the higher offer in the planted randomized test.` : "The planted randomized pricing test found no measurable difference in renewal conversion.";
  const finding = caseData.caseId === "helios" ? heliosFinding : atlasFinding;
  const pointEstimate = measuredDirection === "neutral"
    ? "No detected change"
    : caseData.caseId === "helios"
      ? `${Math.abs(effect * 100).toFixed(1)}% estimated ${measuredDirection === "negative" ? "reduction" : "increase"}`
      : `${Math.abs(estimate).toFixed(1)}-point estimated ${measuredDirection === "negative" ? "reduction" : "increase"}`;
  const intervalDiagnostic = caseData.caseId === "helios" ? "unadjusted_confidence_interval" : "confidence_interval";
  const standardErrorDiagnostic = caseData.caseId === "helios" ? "unadjusted_standard_error" : "standard_error";
  const confidenceInterval = analysis.diagnostics.find((item) => item.name === intervalDiagnostic)?.value.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  const scaledInterval = confidenceInterval?.length === 2 ? confidenceInterval.map((value) => caseData.caseId === "helios" ? Math.expm1(value) * 100 : value).sort((a, b) => a - b) : null;
  const intervalText = scaledInterval
    ? scaledInterval[1] < 0
      ? caseData.caseId === "helios" ? `${Math.abs(scaledInterval[1]).toFixed(1)}% to ${Math.abs(scaledInterval[0]).toFixed(1)}% lower unit compute cost in this planted sample` : `${Math.abs(scaledInterval[1]).toFixed(1)} to ${Math.abs(scaledInterval[0]).toFixed(1)} percentage points lower renewal conversion in this planted sample`
      : scaledInterval[0] > 0
        ? caseData.caseId === "helios" ? `${scaledInterval[0].toFixed(1)}% to ${scaledInterval[1].toFixed(1)}% higher unit compute cost in this planted sample` : `${scaledInterval[0].toFixed(1)} to ${scaledInterval[1].toFixed(1)} percentage points higher renewal conversion in this planted sample`
        : caseData.caseId === "helios" ? `${Math.abs(scaledInterval[0]).toFixed(1)}% lower to ${scaledInterval[1].toFixed(1)}% higher unit compute cost in this planted sample` : `${Math.abs(scaledInterval[0]).toFixed(1)} points lower to ${scaledInterval[1].toFixed(1)} points higher renewal conversion in this planted sample`
    : "Interval unavailable";
  const standardError = Number(analysis.diagnostics.find((item) => item.name === standardErrorDiagnostic)?.value);
  const uncertaintyText = Number.isFinite(standardError)
    ? caseData.caseId === "helios" ? `${standardError.toFixed(4)} log points (roughly ${(standardError * 100).toFixed(1)}%)` : `${standardError.toFixed(1)} percentage points`
    : "Not reported";
  const consequence = caseData.caseId === "helios" ? "No base-case savings credit until the result replicates against production provider invoices." : "No pricing upside credit in the selected buyout structure.";
  const metric = registry ? {metric_id: registry.metric_id, label: caseData.caseId === "helios" ? "Optimizer test effect" : "Renewal-pricing test effect", value: registry.display_value, detail: finding, classification: registry.classification, lineage: registry.source_locator_ids, registry} as Metric : caseData.summaryMetrics[0];
  return <section className="workspace-card empirical-test" aria-labelledby="empirical-test-heading"><div className="section-heading"><div><p className="eyebrow">Assumption test</p><h2 id="empirical-test-heading">{caseData.caseId === "helios" ? heliosHeading : atlasHeading}</h2></div><span>{decisionSignal === "favorable" ? "Supports the assumption" : decisionSignal === "adverse" ? "Adverse signal" : "No measured effect"}</span></div><div className="empirical-summary"><article><span>What it found</span><p>{finding}</p></article><article><span>How it changes underwriting</span><p>{consequence}</p></article><article><span>What it does not establish</span><p>A planted effect in fictional records does not establish a real-company effect, forecast or investment outcome.</p></article></div><button type="button" className="secondary-button" onClick={(event) => openMetric(metric, event.currentTarget)}>Inspect evidence and calculation</button><details><summary>Method and uncertainty</summary><dl><div><dt>Business question</dt><dd>{analysis.question}</dd></div><div><dt>Population</dt><dd>{analysis.population}</dd></div><div><dt>Method</dt><dd>{analysis.method}</dd></div><div><dt>Point estimate</dt><dd>{pointEstimate}</dd></div><div><dt>95% interval</dt><dd>{intervalText}</dd></div><div><dt>Typical estimation uncertainty</dt><dd>{uncertaintyText}</dd></div><div><dt>Technical diagnostics</dt><dd><details><summary>Show retained diagnostics</summary><p>{analysis.diagnostics.map((item) => `${item.name.replaceAll("_", " ")}: ${item.value}`).join(" · ")}</p></details></dd></div></dl></details></section>;
}

function DecisionRail({caseData, view, state}: {caseData: CaseData; view: DealView; state: ReturnType<typeof useDealWorkspace>["state"]}) {
  const unresolved = state.issues.filter((issue) => issue.status !== "RESOLVED");
  const policy = caseData.caseId === "helios" ? HELIOS_SCREEN_POLICY : ATLAS_SCREEN_POLICY;
  const working = caseData.peEngine
    ? (state.scenarioValues.peScenario ?? "selected") !== "selected"
    : (state.scenarioValues.vcScenario ?? "milestone") !== "milestone"
      || (state.scenarioValues.vcRiskCell ?? caseData.vcEngine!.risk_sensitivity.canonical_cell_id) !== caseData.vcEngine!.risk_sensitivity.canonical_cell_id
      || (state.scenarioValues.vcLossPolicy ?? caseData.vcEngine!.risk_sensitivity.canonical_policy_threshold) !== caseData.vcEngine!.risk_sensitivity.canonical_policy_threshold;
  const isHold = caseData.decision.decision === "HOLD";
  const requiredAction = isHold
    ? "Maintain HOLD while the binding screen and open diligence remain unresolved."
    : caseData.decision.path_to_yes[0];
  return <aside className="decision-rail" aria-label="Decision status" tabIndex={0}><header><span>Current posture</span><strong>{caseData.decision.decision}</strong><p>Analytical posture · IC decision pending</p></header><dl><div><dt>View</dt><dd>{viewLabels[view]}</dd></div><div><dt>Scenario</dt><dd>{working ? "Unapproved what-if" : "Canonical case"}</dd></div><div><dt>Open blockers</dt><dd>{unresolved.length}</dd></div><div><dt>Policy state</dt><dd>{policy.status.toLowerCase()} · {policy.lastReviewed ?? "not reviewed"}</dd></div></dl><section><span>Primary blocker</span><strong>{unresolved[0]?.title ?? "No unresolved issue"}</strong><p>{unresolved[0]?.decisionImpact ?? "All recorded issues are resolved."}</p></section><section><span>{isHold ? "Required next action" : "Next committee action"}</span><strong>{requiredAction}</strong></section>{isHold ? <section><span>Path to reconsideration</span><strong>{caseData.decision.path_to_yes[0]}</strong><p>Illustrative terms only; not authority to fund or advance.</p></section> : null}<footer>IC decision pending</footer></aside>;
}

function Diligence({caseData, state, update, modelTransport, connection, openMetric}: {caseData: CaseData; state: ReturnType<typeof useDealWorkspace>["state"]; update: ReturnType<typeof useDealWorkspace>["update"]; modelTransport?: ModelTransport; connection: ConnectionState | null; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const [section, setSection] = useState<"issues" | "assumptions" | "policy" | "test" | "model">("issues");
  const referenceLabels = Object.fromEntries([...caseData.metricRegistry.map((metric) => [metric.metric_id, metric.label]), ...caseData.analyses.map((analysis) => [analysis.analysis_id, analysis.question]), ...caseData.artifacts.map((artifact) => [artifact.artifact_id, artifact.path.split("/").at(-1) ?? artifact.path])]);
  const evidence = modelEvidenceForCase(caseData);
  const profile = caseData.caseId === "helios" ? HELIOS_SCREEN_POLICY : ATLAS_SCREEN_POLICY;
  const tabs = [{id: "issues", label: `Issues · ${state.issues.filter((issue) => issue.status !== "RESOLVED").length}`}, {id: "assumptions", label: "Assumptions"}, {id: "policy", label: "Policy"}, {id: "test", label: "Assumption test"}, {id: "model", label: "Model review"}] as const;
  const content = section === "issues"
    ? <DiligenceWorklist state={state} update={update} lockedIssueIds={new Set(workspaceSeed(caseData).lockedIssueIds ?? [])} />
    : section === "assumptions"
      ? <AssumptionRegistry assumptions={assumptionsFor(caseData)} state={state} update={update} />
      : section === "policy"
        ? <PolicyRegistry profile={profile} state={state} update={update} blockingGates={state.issues.filter((issue) => issue.status !== "RESOLVED").map((issue) => ({gateId: issue.id, label: issue.title}))} />
        : section === "test"
          ? <EconometricTest caseData={caseData} openMetric={openMetric} />
          : <><ModelReviewPanel dealId={caseData.caseId} connection={connection} transport={modelTransport} proposals={state.proposals} onProposalsChange={(next) => update((current) => ({proposals: typeof next === "function" ? next(current.proposals) : next}))} evidence={evidence} referenceLabels={referenceLabels} /><details className="advanced-handoff"><summary>Advanced local model handoff</summary><ProposalLedgerImport caseData={caseData} onImport={(proposals) => update((current) => ({proposals: [...current.proposals, ...proposals].filter((proposal, index, items) => items.findIndex((candidate) => candidate.proposalId === proposal.proposalId) === index)}))} /></details></>;
  return <div className="view-stack">
    <label className="mobile-workspace-selector"><span>Diligence workspace</span><select value={section} onChange={(event) => setSection(event.target.value as typeof section)}>{tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}</select></label>
    <nav className="workspace-tabs" aria-label="Diligence workspace">{tabs.map((tab) => <button type="button" key={tab.id} aria-pressed={section === tab.id} onClick={() => setSection(tab.id)}>{tab.label}</button>)}</nav>
    {content}
  </div>;
}

function DealShell({caseData, view, onNavigate, onChooseDeal, onDeals, onConnect, connection, modelTransport}: {caseData: CaseData; view: DealView; onNavigate: (view: DealView) => void; onChooseDeal: (caseId: CaseId) => void; onDeals: () => void; onConnect: () => void; connection: ConnectionState | null; modelTransport?: ModelTransport}) {
  const seed = useMemo(() => workspaceSeed(caseData), [caseData]);
  const allowedEvidenceRefs = useMemo(() => new Set([...caseData.metricRegistry.map((item) => item.metric_id), ...caseData.analyses.map((item) => item.analysis_id), ...caseData.artifacts.map((item) => item.artifact_id)]), [caseData]);
  const scenarioContract = useMemo(() => scenarioContractFor(caseData), [caseData]);
  const {state, update, replace, storageNotice, integrityContract} = useDealWorkspace(seed, allowedEvidenceRefs, scenarioContract);
  const storageAlert = storageNotice === "Saved locally" ? "" : storageNotice;
  const [lineage, setLineage] = useState<{metric: Metric; trigger: HTMLElement} | null>(null);
  const openLineage = (metric: Metric, trigger: HTMLElement) => setLineage({metric, trigger});
  const closeLineage = () => {
    const trigger = lineage?.trigger;
    setLineage(null);
    window.requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  };
  const content = view === "overview"
    ? <Overview caseData={caseData} state={state} update={update} openMetric={openLineage} />
    : view === "financials"
      ? <FinancialWorkspace caseData={caseData} state={state} update={update} openMetric={openLineage} />
      : view === "diligence"
        ? <Diligence caseData={caseData} state={state} update={update} modelTransport={modelTransport} connection={connection} openMetric={openLineage} />
        : view === "documents"
          ? <DocumentsWorkspace caseData={caseData} openMetric={openLineage} />
          : <><EditableMemo state={state} update={update} title={caseData.company} subtitle={caseData.dealContext.investment_question} scenarioSummary={scenarioMemoSummary(caseData, state)} /><WorkspaceTransfer state={state} replace={replace} allowedEvidenceRefs={allowedEvidenceRefs} scenarioContract={scenarioContract} integrityContract={integrityContract} /></>;
  return <div className="product-shell">
    <aside className="sidebar"><button type="button" className="wordmark" onClick={onDeals} aria-label="Underwriting Desk deals"><span>U</span><strong>Underwriting Desk</strong></button><nav aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => onNavigate(item)}>{viewLabels[item]}</button>)}</nav><div className="sidebar-foot"><button type="button" onClick={onConnect}>Model settings</button><span>{storageAlert ? "Workspace attention required" : storageNotice}</span></div></aside>
    <div className="shell-main"><header className="deal-topbar"><button type="button" className="mobile-wordmark" onClick={onDeals}>Underwriting Desk</button><label><span>Deal</span><select aria-label="Deal" value={caseData.caseId} onChange={(event) => onChooseDeal(event.target.value as CaseId)}>{caseCatalog.map((item) => <option value={item.caseId} key={item.caseId}>{item.company}</option>)}</select></label><div className="topbar-meta"><span>{caseData.caseType}</span><span>As of {formatHumanDate(caseData.decision.as_of ?? `${caseData.temporalScan.cutoff.slice(0, 10)}T12:00:00Z`)}</span></div><button className="topbar-model" type="button" onClick={onConnect}>Model settings</button></header>
      <nav className="mobile-nav" aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => onNavigate(item)}>{viewLabels[item]}</button>)}</nav>
      <div className="workspace-layout"><main id="main-content" className="deal-main">{storageAlert ? <p className="persistence-warning" role="status">{storageAlert}</p> : null}<header className="deal-heading"><div><p className="eyebrow">{viewLabels[view]}</p><h1>{caseData.company}</h1><p>{caseData.dealContext.company_one_liner}</p></div><p className="ic-question"><span>Investment question</span>{caseData.dealContext.investment_question}</p></header><RetainedEvidenceBoundary key={`${caseData.caseId}:${view}`} onReset={onDeals}>{content}</RetainedEvidenceBoundary><footer className="deal-boundary">Fictional company and synthetic records · Not investment advice · Browser-local workspace is not suitable for confidential information</footer></main><DecisionRail caseData={caseData} view={view} state={state} /></div>
    </div>
    {lineage ? <LineageDrawer caseData={caseData} metric={lineage.metric} onClose={closeLineage} /> : null}
  </div>;
}

export default function App({initialCase, initialRoute, loadCaseFn = loadCase}: {initialCase: CaseData; initialRoute: RouteState; loadCaseFn?: (caseId: CaseId) => Promise<CaseData>}) {
  const [caseData, setCaseData] = useState(initialCase);
  const initialLocalRoute = useRef(initialRoute.caseId === "local").current;
  const [localDeal, setLocalDeal] = useState<IntakeResult | null>(null);
  const [view, setView] = useState<RouteView>(initialRoute.view);
  const [loading, setLoading] = useState(initialLocalRoute);
  const [loadError, setLoadError] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [activeLocal, setActiveLocal] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [localPersistenceNotice, setLocalPersistenceNotice] = useState("");
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const modelTransport = useMemo(() => connection?.channel === "API_ADAPTER" ? createAdapterTransport(connection.endpoint) : undefined, [connection]);
  const connectionDialog = connectionOpen ? <ModelConnectionDialog current={connection} onClose={() => setConnectionOpen(false)} onApply={(next) => {setConnection(next); setConnectionOpen(false);}} /> : null;

  const requestSequence = useRef(0);
  const routeFocusReady = useRef(false);
  const openRetainedDeal = useCallback(async (caseId: CaseId, destination: DealView, historyMode: "push" | "replace" = "push") => {
    const sequence = ++requestSequence.current;
    setLoading(true); setLoadError(false);
    try {
      const next = caseData.caseId === caseId ? caseData : await loadCaseFn(caseId);
      if (sequence !== requestSequence.current) return;
      setCaseData(next); setActiveLocal(false); setView(destination);
      window.history[historyMode === "push" ? "pushState" : "replaceState"](null, "", routePath(caseId, destination));
      window.scrollTo(0, 0);
    } catch { if (sequence === requestSequence.current) setLoadError(true); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [caseData, loadCaseFn]);
  useEffect(() => {
    let cancelled = false;
    void loadAdmittedDeal().then((restored) => {
      if (cancelled) return;
      setLocalDeal(restored);
      if (!initialLocalRoute) return;
      if (restored) {
        setActiveLocal(true);
        setView(initialRoute.view);
        window.scrollTo(0, 0);
      } else {
        setImportNotice("The local deal failed source replay or is unavailable in this browser. Import its portable deal file or run intake again.");
        setActiveLocal(false);
        setView("deals");
        window.history.replaceState(null, "", "#/");
        window.scrollTo(0, 0);
      }
    }).finally(() => {if (!cancelled && initialLocalRoute) setLoading(false);});
    return () => {cancelled = true;};
  }, [initialLocalRoute, initialRoute.view]);
  useEffect(() => {
    const sync = () => {
      const route = parseRoute();
      if (route.view === "deals") {setActiveLocal(false); setView("deals"); window.scrollTo(0, 0); return;}
      if (route.caseId === "local") {
        setLoading(true);
        void loadAdmittedDeal().then((restored) => {
          if (restored) {setLocalDeal(restored); setActiveLocal(true); setView(route.view); window.scrollTo(0, 0);}
          else {setImportNotice("The local deal failed source replay or is unavailable in this browser. Import its portable deal file or run intake again."); setActiveLocal(false); setView("deals"); window.history.replaceState(null, "", "#/"); window.scrollTo(0, 0);}
        }).finally(() => setLoading(false));
        return;
      }
      void openRetainedDeal(route.caseId, route.view, "replace");
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [openRetainedDeal]);
  useEffect(() => {
    if (!routeFocusReady.current) { routeFocusReady.current = true; return; }
    const frame = window.requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>("#main-content");
      if (!main) return;
      main.tabIndex = -1;
      main.focus({preventScroll: true});
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, caseData.caseId, activeLocal, intakeOpen]);
  function navigate(next: DealView) {window.history.pushState(null, "", routePath(caseData.caseId, next)); setView(next); window.scrollTo(0, 0);}
  function returnToDeals() {window.history.pushState(null, "", "#/" ); setLoadError(false); setActiveLocal(false); setView("deals"); window.scrollTo(0, 0);}

  if (loading) return <div className="loading-state" role="status">Opening deal…</div>;
  if (loadError) return <main className="loading-state load-error" role="alert"><div><p className="eyebrow">Deal workspace</p><h1>Deal unavailable</h1><p>The selected deal could not be opened. No data, assumption or decision was changed.</p><button className="secondary-button" type="button" onClick={returnToDeals}>Return to Deals</button></div></main>;
  const importLocal = async (file?: File) => {if (!file) return; try {if (file.size > 13_000_000) throw new Error("Portable deal bundle exceeds the 13 MB public-slice limit"); const bundle = await validateAdmittedDealBundle(await file.text()); const persisted = installAdmittedDealBundle(bundle); setLocalDeal(bundle.admittedDeal); setImportNotice(persisted ? "Portable deal replayed, recalculated and imported locally." : "Portable deal replayed and recalculated; browser storage is unavailable, so this session remains in memory."); setLocalPersistenceNotice(persisted ? "" : "Session-only deal — browser persistence failed."); setActiveLocal(true); setView("overview"); window.history.pushState(null, "", "#/v3/local/overview"); window.scrollTo(0, 0);} catch (error) {setImportNotice(error instanceof Error ? error.message : "Portable deal import failed.");}};
  if (intakeOpen) return <DealIntake onCancel={() => setIntakeOpen(false)} onComplete={(result) => {const persisted = persistAdmittedDeal(result); setLocalPersistenceNotice(persisted ? "" : "Session-only deal — browser persistence failed."); setLocalDeal(result); setIntakeOpen(false); setActiveLocal(true); setView("overview"); window.history.pushState(null, "", "#/v3/local/overview"); window.scrollTo(0, 0);}} />;
  if (view === "deals") return <><DealList onOpen={(caseId) => void openRetainedDeal(caseId, "overview")} onNew={() => setIntakeOpen(true)} onConnect={() => setConnectionOpen(true)} connection={connection} localDeal={localDeal} onOpenLocal={() => {setActiveLocal(true); setView("overview"); window.history.pushState(null, "", "#/v3/local/overview"); window.scrollTo(0, 0);}} onImportLocal={(file) => void importLocal(file)} importNotice={importNotice} loadCaseFn={loadCaseFn} />{connectionDialog}</>;
  if (activeLocal && localDeal) return <><LocalDealShell result={localDeal} view={view} onNavigate={(next) => {setView(next); window.history.pushState(null, "", `#/v3/local/${next}`); window.scrollTo(0, 0);}} onDeals={returnToDeals} onConnect={() => setConnectionOpen(true)} connection={connection} modelTransport={modelTransport} persistenceNotice={localPersistenceNotice} />{connectionDialog}</>;
  return <><DealShell key={caseData.caseId} caseData={caseData} view={view as DealView} onNavigate={navigate} onChooseDeal={(caseId) => void openRetainedDeal(caseId, view as DealView)} onDeals={returnToDeals} onConnect={() => setConnectionOpen(true)} connection={connection} modelTransport={modelTransport} />{connectionDialog}</>;
}
