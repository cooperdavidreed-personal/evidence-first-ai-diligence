import {Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {caseCatalog, isCaseId, loadCase, type CaseId} from "./case-data";
import {DocumentsWorkspace} from "./documents-workspace";
import {ChangeControlWorkspace} from "./change-control-workspace";
import {FinancialWorkspace, scenarioMemoSummary} from "./financial-workspace";
import {canonicalEvidenceForCase, modelEvidenceForCase} from "./canonical-evidence";
import {DealIntake, LocalDealShell} from "./local-deal";
import {installAdmittedDealBundle, loadAdmittedDeal, persistAdmittedDeal, validateAdmittedDealBundle} from "./local-deal-state";
import type {IntakeResult} from "./intake";
import {LineageDrawer} from "./lineage-drawer";
import {createAdapterTransport, type ConnectionState} from "./model-connection";
import {ModelConnectionButton, ModelConnectionDialog} from "./model-connection-dialog";
import {ModelReviewPanel} from "./model-review-panel";
import {PublicRecordCase} from "./public-record-case";
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
  WorkspaceRecovery,
  WorkspaceTransfer,
  formatHumanDate,
  useDealWorkspace,
  type AssumptionDefinition,
} from "./workspace-ui";
import {createWorkspaceIntegrityContract, storageKey, validateWorkspace, type DealWorkspaceState, type WorkspaceScenarioContract, type WorkspaceSeed} from "./workspace-state";

export const dealViews = ["overview", "financials", "diligence", "documents", "memo"] as const;
export type DealView = (typeof dealViews)[number];
export type RouteView = DealView | "deals" | "public-record";
export interface RouteState { caseId: CaseId | "local" | "public-record"; view: RouteView }

export const viewLabels: Record<DealView, string> = {overview: "Overview", financials: "Financials", diligence: "Diligence", documents: "Documents", memo: "IC Memo"};
export const viewQuestions: Record<DealView, string> = {overview: "What is the current view, and why?", financials: "What are the returns, and what drives them?", diligence: "What remains, and who owns it?", documents: "What evidence supports each number?", memo: "Is this ready for the next IC step?"};
const legacyViews: Record<string, DealView> = {risks: "diligence", thesis: "overview", "value-creation": "financials", explore: "documents", sources: "documents", methodology: "diligence", audit: "documents", underwriting: "financials"};

export function parseRoute(): RouteState {
  const parts = window.location.hash.replace(/^#\//, "").split("/");
  if (parts[0] === "public-record" && parts[1] === "snowflake") return {caseId: "public-record", view: "public-record"};
  const caseId = parts[1] ?? "";
  const requested = parts[2] ?? "overview";
  if (caseId === "local" && parts.length >= 3) return {caseId: "local", view: dealViews.includes(requested as DealView) ? requested as DealView : "overview"};
  if (parts.length < 3 || !isCaseId(caseId)) return {caseId: "atlasgrid", view: "deals"};
  return {caseId, view: dealViews.includes(requested as DealView) ? requested as DealView : legacyViews[requested] ?? "overview"};
}

function routePath(caseId: string, view: DealView) { return `#/v3/${caseId}/${view}`; }
function money(cents: number) { return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1}).format(cents / 100); }
function percent(value: string | number) { return `${(Number(value) * 100).toFixed(1)}%`; }
function sentence(value: string) { return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`; }
function multiple(value: string | number) { return `${Number(value).toFixed(2)}x`; }
export function investorLanguage(value: string) {
  return value
    .replace(/catastrophe[- ]state prior/gi, "severe-loss probability assumption")
    .replace(/catastrophe prior/gi, "severe-loss assumption")
    .replace(/catastrophe path/gi, "severe-loss path")
    .replace(/seeded replay frequency/gi, "illustrative scenario result")
    .replace(/generator check/gi, "scenario-mechanics check")
    .replace(/Desk loss ceiling/gi, "working maximum loss probability")
    .replace(/path generator/gi, "scenario mechanics");
}
const postureHeadline: Record<string, string> = {
  REPRICE: "Reprice rather than meet the ask",
  HOLD: "Hold; do not deploy capital on the current record",
  "REOPEN DILIGENCE": "Reopen diligence on the revised evidence",
  CONDITIONAL_INVEST: "Invest, subject to named conditions",
  INVEST: "Invest on the selected terms",
  PASS: "Pass on the opportunity",
};
const stageLabel: Record<string, string> = {PRE_IC: "Before IC", PRE_SIGNING: "Before signing", PRE_DEBT_COMMITMENT: "Before debt commitment", POST_CLOSE: "After close"};

/** The single persistent disclosure for a deal workspace. */
export function BoundaryNote({synthetic = true}: {synthetic?: boolean}) {
  return <p className="rail-boundary">{synthetic ? "Fictional company and synthetic records." : "Public demonstration."} Not investment advice. Browser-local workspace; not for confidential information.</p>;
}

export function NavIcon({view}: {view: DealView}) { return <i aria-hidden="true" data-icon={view} />; }

class RetainedEvidenceBoundary extends Component<{children: ReactNode; onReset: () => void}, {error: Error | null}> {
  state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) { return {error}; }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="panel error-summary" role="alert"><p className="eyebrow">Evidence boundary</p><h2>Analysis unavailable</h2><p>The retained package is incomplete for this view, so no analytical conclusion is shown.</p><button className="secondary-button" type="button" onClick={this.props.onReset}>Return to Deals</button><details><summary>Technical reason</summary><p>{this.state.error.message}</p></details></section>;
  }
}

interface DealIndexSummary {openIssues: number; lastActivity: string; working: boolean; nextAction: string}

function DealList({onOpen, onNew, onConnect, connection, localDeal, onOpenLocal, onOpenPublicRecord, onImportLocal, importNotice, loadCaseFn}: {onOpen: (caseId: CaseId) => void; onNew: () => void; onConnect: () => void; connection: ConnectionState | null; localDeal: IntakeResult | null; onOpenLocal: () => void; onOpenPublicRecord: () => void; onImportLocal: (file?: File) => void; importNotice: string; loadCaseFn: (caseId: CaseId) => Promise<CaseData>}) {
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
    return <button type="button" className="deal-row" key={deal.caseId} aria-label={`Open ${deal.company} — ${deal.posture}; ${blockers} open issues; next: ${next}`} onClick={() => onOpen(deal.caseId)}><span><strong>{deal.company}</strong><small>{deal.investmentQuestion}</small></span><span>{deal.caseType}</span><span>{deal.owner}</span><span>{summary?.working ? "What-if open" : deal.stage}</span><span className={`posture posture-${deal.posture.toLowerCase()}`}>{deal.posture}</span><span className="num">{blockers}</span><span>{formatHumanDate(summary?.lastActivity ?? deal.asOf)}</span><span>{next}</span></button>;
  };
  return <main className="deals-page" id="main-content">
    <header className="deals-header"><div><div className="brand-lockup"><span>U</span><strong>Underwriting Desk</strong></div><p>Deterministic finance, source-linked evidence, fund policy, and named human decisions, kept separate.</p></div><div><ModelConnectionButton connection={connection} onClick={onConnect} /><label className="file-button">Import deal<input type="file" accept="application/json,.json" onChange={(event) => onImportLocal(event.target.files?.[0])} /></label><button className="primary-button" type="button" data-testid="new-deal-button" onClick={onNew}>New deal</button></div></header>
    {importNotice ? <p className="import-notice" role="status">{importNotice}</p> : null}
    <section className="deal-index" aria-labelledby="active-deals-heading"><div className="section-heading"><div><p className="eyebrow">Decision workspaces</p><h1 id="active-deals-heading">Deals</h1></div><span>{caseCatalog.length} retained synthetic cases{localDeal ? " · 1 admitted local case" : ""}</span></div><div className="deal-table" aria-label="Deal decision workspaces"><div className="deal-table-head" aria-hidden="true"><span>Company</span><span>Strategy</span><span>Owner</span><span>Stage</span><span>Posture</span><span>Open issues</span><span>Last activity</span><span>Next action</span></div>{localDeal ? <button type="button" className="deal-row" aria-label={`Open ${localDeal.deal?.company} — ${localDeal.posture}; ${localDeal.analysis?.tests.filter((test) => test.blocksAdvancement).length ?? "unknown"} blockers`} onClick={onOpenLocal}><span><strong>{localDeal.deal?.company}</strong><small>Admitted company package · {localDeal.baselineApproval?.version ?? "unapproved"}</small></span><span>Growth</span><span>{localDeal.deal?.analystOwner}</span><span>Screening</span><span className={`posture posture-${localDeal.posture === "HOLD" ? "hold" : "screening"}`}>{localDeal.posture === "HOLD" ? "HOLD" : "Screening"}</span><span className="num">{localDeal.analysis?.tests.filter((test) => test.blocksAdvancement).length ?? "—"}</span><span>{formatHumanDate(`${localDeal.deal?.cutoff}T12:00:00Z`)}</span><span>{localDeal.posture === "HOLD" ? "Return screens miss; resolve before IC" : "Complete further diligence before IC"}</span></button> : null}{caseCatalog.map(dealButton)}</div></section>
    <div className="deals-secondary">
      <section className="deal-index public-record-index" aria-labelledby="public-record-heading"><div className="section-heading"><div><p className="eyebrow">Historical cutoff proof</p><h2 id="public-record-heading">Public-record retrospective</h2></div><span>Real company · SEC filings only</span></div><div className="deal-table"><div className="deal-table-head" aria-hidden="true"><span>Company</span><span>Posture</span><span>Evidence cutoff</span><span>Next action</span></div><button type="button" className="deal-row" onClick={onOpenPublicRecord}><span><strong>Snowflake pre-IPO screen</strong><small>Only filings available through September 14, 2020 are admitted</small></span><span className="posture posture-no-call">NO CALL</span><span>Sep 14, 2020</span><span>Inspect the cutoff and excluded hindsight</span></button></div></section>
      <section className="intake-callout" aria-labelledby="intake-callout-heading"><p className="eyebrow">Bring your own package</p><h2 id="intake-callout-heading">Screen a company package</h2><p>Drop the operating model, customer data, management update, deal terms, and package declaration. Every byte is validated and calculated in this browser; nothing is sent anywhere.</p><ul><li>Uploaded thresholds never become fund policy.</li><li>Every number keeps its source rows and formulas.</li><li>A named analyst approves Version 1 before the workspace opens.</li></ul><button className="secondary-button" type="button" onClick={onNew}>Open intake</button></section>
    </div>
    <section className="desk-principles" aria-label="How the Desk works"><article><strong>Deterministic math</strong><p>Returns, debt, and waterfalls are retained calculations with a formula and inputs behind every figure.</p></article><article><strong>Versioned deal state</strong><p>Evidence versions, scenarios, approvals, and memo sections are recorded; nothing overwrites the canonical case silently.</p></article><article><strong>Owned policy and assumptions</strong><p>Fund thresholds and analyst assumptions carry a named owner, a review state, and an exception history.</p></article><article><strong>Governed model proposals</strong><p>A model may challenge evidence or draft a section. It cannot change a number, a threshold, or the recommendation.</p></article></section>
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
    {id: "catastrophe-prior", label: "Severe-loss probability assumption", value: percent(engine.distribution.priors.catastrophe_probability), owner: engine.distribution.priors.owner, basis: "Synthetic analyst input", consequence: "Sets the assumed probability of returning less than invested capital. The illustrative replay checks scenario mechanics; it does not estimate this probability.", status: engine.distribution.priors.approval_status},
  ];
}

function workspaceSeed(caseData: CaseData): WorkspaceSeed {
  const issues = caseData.decision.issue_summary.issues.map((issue) => ({id: issue.issue_id, title: investorLanguage(issue.title), description: investorLanguage(issue.consequence), owner: issue.owner, priority: issue.materiality, status: issue.state === "CLEARED" ? "RESOLVED" as const : "OPEN" as const, dueDate: null, decisionImpact: investorLanguage(issue.consequence), evidenceRefs: [...issue.evidence_metric_ids, ...issue.analysis_ids], resolution: issue.state === "CLEARED" ? "Cleared in the retained canonical case." : null}));
  const scenarioValues: Record<string, string> = caseData.peEngine ? {peScenario: "selected", peCompare: "downside", peAxis: caseData.peEngine.sensitivities.axis_order[0], peCell: caseData.peEngine.sensitivities.one_way.filter((item) => item.axis === caseData.peEngine!.sensitivities.axis_order[0])[1]?.cell_id ?? ""} : {vcScenario: "milestone", vcCompare: "downside", vcAxis: caseData.vcEngine!.sensitivities.default_axis, vcCell: caseData.vcEngine!.sensitivities.default_cell_id, vcRiskCell: caseData.vcEngine!.risk_sensitivity.canonical_cell_id, vcLossPolicy: caseData.vcEngine!.risk_sensitivity.canonical_policy_threshold};
  const memo = scenarioMemoSummary(caseData, {scenarioValues});
  return {caseId: caseData.caseId, issues, lockedIssueIds: caseData.decision.issue_summary.issues.filter((issue) => issue.kind === "QUANTITATIVE_HURDLE").map((issue) => issue.issue_id), canonicalEvidence: canonicalEvidenceForCase(caseData), memoSections: [
    {sectionId: "recommendation", title: "Recommendation and rationale", body: memo.sectionBodies.recommendation, provenance: "DETERMINISTIC_ANALYSIS", scenarioSnapshotId: memo.snapshotId, updatedBy: "Financial model"},
    {sectionId: "economics", title: "Economics", body: memo.sectionBodies.economics, provenance: "DETERMINISTIC_ANALYSIS", scenarioSnapshotId: memo.snapshotId, updatedBy: "Financial model"},
    {sectionId: "downside", title: "Downside and what must be true", body: memo.sectionBodies.downside, provenance: "ANALYST_JUDGMENT", scenarioSnapshotId: memo.snapshotId, updatedBy: "Deal team"},
  ], scenarioValues};
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

/** Plain-language decision relevance for each headline measure. */
function metricRelevance(caseData: CaseData, metric: Metric) {
  const label = metric.label.toLowerCase();
  if (/return/.test(label)) return caseData.peEngine ? "Against the 22.0% declared return screen at selected terms." : "Point return before the loss-probability screen.";
  if (/nrr|retention/.test(label)) return "Fixed-cohort view, not the management active-only view.";
  if (/concentration/.test(label)) return "Parent-level exposure; entity view understates it.";
  if (/margin/.test(label)) return "Includes implementation and support burden.";
  if (/ebitda/.test(label)) return "Before unsupported seller add-backs.";
  if (/ownership/.test(label)) return "Fully funded, after the contingent tranche.";
  if (/runway/.test(label)) return "Months of cash before contingent financing.";
  if (/spend|market/.test(label)) return "Modeled range; not an externally verified market size.";
  return metric.detail;
}

function MetricStrip({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  return <section className="overview-metrics" aria-label="Headline financial measures">{caseData.summaryMetrics.slice(0, 5).map((metric) => <button type="button" key={metric.metric_id} onClick={(event) => openMetric(metric, event.currentTarget)}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metricRelevance(caseData, metric)}</small><em>Trace source</em></button>)}</section>;
}

function screenContext(metricId: string) {
  const value = metricId.toUpperCase();
  if (value.includes("MAX_BID_DOWNSIDE")) return "Max-bid downside";
  if (value.includes("SELECTED")) return value.includes("PRIOR") ? "Selected risk case" : "Selected terms";
  if (value.includes("ASK")) return "Seller ask";
  if (value.includes("MILESTONE")) return "Milestone case";
  return "Canonical case";
}

function DecisionScreenTable({caseData, compact = false}: {caseData: CaseData; compact?: boolean}) {
  const rows = caseData.decision.metric_pairs ?? [];
  if (!rows.length) return null;
  const table = <div className="table-wrap" tabIndex={0} aria-label="Scrollable investment screens"><table className="screens-table"><thead><tr><th>Case</th><th>Measure</th><th className="num">Observed</th><th className="num">Required</th><th>State</th></tr></thead><tbody>{rows.map((row) => <tr key={row.metric_id}><td>{screenContext(row.metric_id)}</td><th>{investorLanguage(row.metric)}{row.designation === "INFORMATIONAL" ? <small> · informational</small> : null}</th><td className="num">{row.observed}</td><td className="num">{row.threshold}</td><td><span className={`screen-state screen-${row.status.toLowerCase()}`}>{row.status.toLowerCase().replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div>;
  if (compact) return table;
  return <section className="decision-screen-table" aria-labelledby="decision-screens-heading"><div className="section-heading"><div><p className="eyebrow">Investment screens</p><h2 id="decision-screens-heading">Observed performance against the working policy</h2></div><span>Policy requires human approval</span></div>{table}</section>;
}

interface DriverSwing {label: string; low: string; high: string; range: number; lowLabel: string; highLabel: string}

function driverSwings(caseData: CaseData): DriverSwing[] {
  const axisLabels: Record<string, string> = {entry_enterprise_value_cents: "Entry enterprise value", full_cohort_nrr: "Complete-cohort NRR", gross_margin: "Gross margin", annual_cash_rate: "Cash interest rate", funded_term_face_cents: "Funded debt", exit_multiple: "Exit multiple"};
  if (caseData.peEngine) {
    return caseData.peEngine.sensitivities.axis_order.map((axis) => {
      const cells = caseData.peEngine!.sensitivities.one_way.filter((item) => item.axis === axis).map((item) => ({label: item.assumption_label, irr: Number(item.gross_xirr)})).sort((a, b) => a.irr - b.irr);
      const low = cells[0], high = cells.at(-1)!;
      return {label: axisLabels[axis] ?? axis, low: percent(low.irr), high: percent(high.irr), range: high.irr - low.irr, lowLabel: low.label, highLabel: high.label};
    }).sort((a, b) => b.range - a.range);
  }
  const engine = caseData.vcEngine!;
  return engine.sensitivities.axis_definitions.map((definition) => {
    const cells = engine.sensitivities.cells.filter((item) => item.axis === definition.axis).map((item) => ({label: item.assumption_label, irr: Number(item.gross_xirr)})).sort((a, b) => a.irr - b.irr);
    const low = cells[0], high = cells.at(-1)!;
    return {label: definition.label, low: percent(low.irr), high: percent(high.irr), range: high.irr - low.irr, lowLabel: low.label, highLabel: high.label};
  }).sort((a, b) => b.range - a.range);
}

function DriverList({caseData, onOpenFinancials}: {caseData: CaseData; onOpenFinancials: () => void}) {
  const swings = driverSwings(caseData);
  const maximum = Math.max(...swings.map((item) => item.range), 0.0001);
  return <section className="workspace-card" aria-labelledby="drivers-heading"><div className="section-heading"><div><p className="eyebrow">Which assumptions drive the result</p><h2 id="drivers-heading">Return swing across retained sensitivities</h2></div><button type="button" className="text-button" onClick={onOpenFinancials}>Open Financials</button></div><ul className="driver-list">{swings.map((item) => <li key={item.label}><div><strong>{item.label}</strong><small>{item.lowLabel} → {item.highLabel}</small></div><div className="swing" aria-hidden="true"><i style={{width: `${Math.max(3, item.range / maximum * 100)}%`}} /></div><span className="num">{item.low} – {item.high}</span></li>)}</ul></section>;
}

function conditionState(caseData: CaseData, text: string) {
  return caseData.decision.condition_states.find((item) => item.text === text)?.state ?? "OPEN_DILIGENCE";
}

function WhatMustBeTrue({caseData}: {caseData: CaseData}) {
  const stateLabel: Record<string, string> = {CLEARS_QUANTITATIVELY: "clears", MISSES_HURDLE: "misses", OPEN_DILIGENCE: "open", INFORMATIONAL: "informational"};
  return <section className="workspace-card what-must-be-true" aria-labelledby="what-must-be-true-heading"><div className="section-heading"><div><p className="eyebrow">What changes the recommendation</p><h2 id="what-must-be-true-heading">What must be true</h2></div><span>{caseData.decision.conditions.length} binding conditions</span></div><ol>{caseData.decision.conditions.map((condition) => {const state = conditionState(caseData, condition); return <li key={condition}><span>{investorLanguage(condition)}</span><span className={`screen-state screen-${state.toLowerCase()}`}>{stateLabel[state] ?? state.toLowerCase()}</span></li>;})}</ol></section>;
}

function RemainingWork({state, onOpenDiligence}: {state: DealWorkspaceState; onOpenDiligence: () => void}) {
  const open = state.issues.filter((issue) => issue.status !== "RESOLVED");
  return <section className="workspace-card remaining-work" aria-labelledby="remaining-work-heading"><div className="section-heading"><div><p className="eyebrow">What diligence remains</p><h2 id="remaining-work-heading">{open.length} open {open.length === 1 ? "item" : "items"} on the worklist</h2></div><button type="button" className="text-button" onClick={onOpenDiligence}>Open Diligence</button></div>{open.length ? <ul>{open.slice(0, 5).map((issue) => <li key={issue.id}><div><strong>{issue.title}</strong><small>{issue.decisionImpact}</small></div><span className="owner">{issue.owner}</span><span className={`priority priority-${issue.priority.toLowerCase()}`}>{issue.priority.toLowerCase()}</span></li>)}</ul> : <p className="empty-copy">Every worklist item is resolved. The canonical conditions still require human IC review.</p>}</section>;
}

function ReturnsTable({caseData, state}: {caseData: CaseData; state: DealWorkspaceState}) {
  if (caseData.peEngine) {
    const engine = caseData.peEngine;
    const current = (["ask", "selected", "downside"] as const).includes(state.scenarioValues.peScenario as "ask") ? state.scenarioValues.peScenario : "selected";
    const hurdle = Number((caseData.decision.metric_pairs ?? []).find((item) => item.metric_id === "atlasgrid-SELECTED-gross-irr")?.threshold_value ?? "0.22");
    const rows = [
      {key: "selected", label: "Selected terms", role: "Base case · illustrative $210M", result: engine.selected},
      {key: "downside", label: "Downside", role: "Retained downside", result: engine.downside},
      {key: "ask", label: "Seller ask", role: "Upside for the seller · $240M", result: engine.ask},
    ];
    return <section className="workspace-card" aria-labelledby="returns-heading"><div className="section-heading"><div><p className="eyebrow">Base, downside and upside</p><h2 id="returns-heading">Returns across retained scenarios</h2></div><span>{percent(hurdle)} declared return screen</span></div><div className="table-wrap" tabIndex={0} aria-label="Scrollable returns table"><table className="returns-table"><thead><tr><th>Scenario</th><th className="num">Annualized return</th><th className="num">Gross multiple</th><th className="num">Exit debt</th><th className="num">Minimum liquidity</th><th>Covenant</th><th>Screen</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} data-current={row.key === current || undefined}><th>{row.label}<small>{row.role}</small></th><td className="num">{percent(row.result.gross_xirr)}</td><td className="num">{multiple(row.result.gross_moic)}</td><td className="num">{money(row.result.debt_schedule.ending_debt_cents)}</td><td className="num">{money(row.result.debt_schedule.minimum_liquidity_cents)}</td><td>{row.result.debt_schedule.first_covenant_breach_month ? `Breach in month ${row.result.debt_schedule.first_covenant_breach_month}` : "No modeled breach"}</td><td><span className={`screen-state screen-${Number(row.result.gross_xirr) >= hurdle ? "clears" : "misses"}`}>{Number(row.result.gross_xirr) >= hurdle ? "clears" : "misses"}</span></td></tr>)}</tbody></table></div></section>;
  }
  const engine = caseData.vcEngine!;
  const keys = ["milestone", "base", "downside", "financing_shortfall"] as const;
  const labels = {milestone: ["Milestone funded", "Base case · both tranches"], base: ["Tranche withheld", "Second tranche not released"], downside: ["Down round", "Retained downside"], financing_shortfall: ["Financing shortfall", "No contingent financing"]} as const;
  const current = keys.includes(state.scenarioValues.vcScenario as typeof keys[number]) ? state.scenarioValues.vcScenario : "milestone";
  const hurdle = 0.25;
  return <section className="workspace-card" aria-labelledby="returns-heading"><div className="section-heading"><div><p className="eyebrow">Base, downside and upside</p><h2 id="returns-heading">Returns across retained financing scenarios</h2></div><span>Point return screen only; the loss screen is evaluated separately</span></div><div className="table-wrap" tabIndex={0} aria-label="Scrollable returns table"><table className="returns-table"><thead><tr><th>Scenario</th><th className="num">Annualized return</th><th className="num">Gross multiple</th><th className="num">Ownership</th><th className="num">Minimum cash</th><th>Runway</th><th>Screen</th></tr></thead><tbody>{keys.map((key) => {const result = engine[key]; return <tr key={key} data-current={key === current || undefined}><th>{labels[key][0]}<small>{labels[key][1]}</small></th><td className="num">{percent(result.gross_xirr)}</td><td className="num">{multiple(result.gross_moic)}</td><td className="num">{percent(result.target_ownership)}</td><td className="num">{money(result.minimum_cash_cents)}</td><td>{result.first_cash_exhaustion_month_without_contingent_financing ? `Cash out in month ${result.first_cash_exhaustion_month_without_contingent_financing} without contingent financing` : "Funded through exit"}</td><td><span className={`screen-state screen-${Number(result.gross_xirr) >= hurdle ? "clears" : "misses"}`}>{Number(result.gross_xirr) >= hurdle ? "clears" : "misses"}</span></td></tr>;})}</tbody></table></div></section>;
}

function Readiness({caseData, state}: {caseData: CaseData; state: DealWorkspaceState}) {
  const pairs = (caseData.decision.metric_pairs ?? []).filter((item) => item.designation === "BINDING");
  const misses = pairs.filter((item) => /MISS/.test(item.status));
  const policy = caseData.caseId === "helios" ? HELIOS_SCREEN_POLICY : ATLAS_SCREEN_POLICY;
  const assumptions = assumptionsFor(caseData);
  const approved = assumptions.filter((item) => state.assumptionReviews[item.id]?.disposition === "APPROVED").length;
  const open = state.issues.filter((issue) => issue.status !== "RESOLVED").length;
  const memo = scenarioMemoSummary(caseData, state);
  const stale = state.memoSections.filter((section) => section.scenarioSnapshotId !== memo.snapshotId).length;
  const change = state.changeControl;
  const disposition = change?.dispositionEvents.at(-1)?.disposition;
  const items = [
    {label: "Binding return screens", state: misses.length ? "blocked" : "done", detail: misses.length ? `${misses.length} of ${pairs.length} binding screens miss` : `${pairs.length} binding screens clear at selected terms`},
    {label: "Fund policy reviewed", state: policy.status === "APPROVED" ? "done" : "open", detail: `${policy.name} is ${policy.status.toLowerCase()} · ${policy.lastReviewed ? formatHumanDate(policy.lastReviewed) : "not yet reviewed"}`},
    {label: "Material assumptions approved", state: approved === assumptions.length ? "done" : "open", detail: `${approved} of ${assumptions.length} approved by a named reviewer`},
    {label: "Diligence worklist", state: open ? "open" : "done", detail: open ? `${open} open ${open === 1 ? "item" : "items"} with named owners` : "All items resolved"},
    {label: "Evidence version", state: change ? disposition === "ACCEPTED" || disposition === "REJECTED" ? "done" : "blocked" : "done", detail: change ? `${change.toVersion} ${disposition ? disposition.toLowerCase() : "awaiting disposition"}` : "Version 1 is the approved evidence state"},
    {label: "IC memo bound to scenario", state: stale ? "blocked" : "done", detail: stale ? `${stale} ${stale === 1 ? "section" : "sections"} prepared against another scenario` : `Every section matches ${memo.label}`},
  ];
  return <section className="workspace-card" aria-labelledby="readiness-heading"><div className="section-heading"><div><p className="eyebrow">Ready for the next IC step?</p><h2 id="readiness-heading">{items.some((item) => item.state === "blocked") ? "Not ready: blocked items remain" : items.some((item) => item.state === "open") ? "Not ready: open items remain" : "Ready for named human IC review"}</h2></div><span>Committee decision is recorded by people, not by the Desk</span></div><ul className="readiness-list">{items.map((item) => <li key={item.label} data-state={item.state}><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ul></section>;
}

function Overview({caseData, state, update, openMetric, onNavigate}: {caseData: CaseData; state: DealWorkspaceState; update: ReturnType<typeof useDealWorkspace>["update"]; openMetric: (metric: Metric, trigger: HTMLElement) => void; onNavigate: (view: DealView) => void}) {
  const open = state.issues.filter((issue) => issue.status !== "RESOLVED");
  const blocker = open[0];
  const changeDisposition = state.changeControl?.dispositionEvents.at(-1)?.disposition;
  const activeChange = state.changeControl && changeDisposition !== "REJECTED" ? state.changeControl : null;
  const posture = activeChange ? "REOPEN DILIGENCE" : caseData.decision.decision;
  const nextAction = activeChange && !changeDisposition ? "A named reviewer dispositions the revised evidence before any conclusion moves." : posture === "HOLD" ? `Maintain HOLD; resolve ${blocker?.title.toLowerCase() ?? "the binding screen and open diligence"}.` : caseData.decision.path_to_yes[0];
  const supporting = caseData.summaryMetrics.slice(0, 3);
  const swings = driverSwings(caseData).slice(0, 3);
  const clearing = (caseData.decision.metric_pairs ?? []).filter((item) => item.designation === "BINDING" && /CLEAR/.test(item.status));
  const missing = (caseData.decision.metric_pairs ?? []).filter((item) => /MISS/.test(item.status));
  const context = caseData.dealContext;
  return <div className="view-stack">
    <section className="current-view" aria-labelledby="current-view-heading">
      <div>
        <p className="eyebrow">Current view · {activeChange ? "revised evidence" : "canonical case"}</p>
        <h2 id="current-view-heading">{postureHeadline[posture] ?? posture}</h2>
        <p className="view-lead">{investorLanguage(activeChange ? activeChange.decisionConsequence : caseData.decision.rationale)}</p>
        <ol className="reasoned-list">
          <li><span>Supporting evidence</span><div><ul>{supporting.map((metric) => <li key={metric.metric_id}>{metric.label} of <b>{metric.value}</b> — {metricRelevance(caseData, metric)} <button type="button" className="text-button" onClick={(event) => openMetric(metric, event.currentTarget)}>Trace</button></li>)}</ul></div></li>
          <li><span>Concerns</span><div><ul><li>{caseData.thesis.counterthesis}</li>{blocker ? <li>{blocker.title}: {blocker.decisionImpact}</li> : null}{missing.length ? <li>{missing.map((item) => `${screenContext(item.metric_id)} ${investorLanguage(item.metric)} of ${item.observed} misses the ${item.threshold} screen`).join("; ")}.</li> : null}</ul></div></li>
          <li><span>Decision-changing variables</span><div>{swings.map((item, index) => <span key={item.label}>{index ? "; " : ""}{item.label} ({item.low} to {item.high} across {item.lowLabel} → {item.highLabel})</span>)}. <button type="button" className="text-button" onClick={() => onNavigate("financials")}>Test scenarios</button></div></li>
          <li><span>Remaining work</span><div>{open.length ? <>{open.length} open diligence {open.length === 1 ? "item" : "items"}: {open.slice(0, 3).map((issue) => issue.title).join("; ")}{open.length > 3 ? "; and more" : ""}. </> : "No open diligence items. "}<button type="button" className="text-button" onClick={() => onNavigate("diligence")}>Open worklist</button></div></li>
          <li><span>Next committee step</span><div>{sentence(nextAction)} Committee decision pending; {clearing.length ? `${clearing.length} binding screens clear at selected terms` : "no binding screen clears"}.</div></li>
        </ol>
      </div>
      <div>
        <p className="eyebrow">Company and transaction</p>
        <dl className="fact-table">
          <div><dt>Strategy</dt><dd>{caseData.caseType}</dd></div>
          <div><dt>Transaction</dt><dd>{context.process}</dd></div>
          <div><dt>Terms tested</dt><dd>{(caseData.decision.terms ?? ["Terms remain subject to diligence"]).join(" · ")}</dd></div>
          <div><dt>Customers</dt><dd>{context.customer}</dd></div>
          <div><dt>Evidence as of</dt><dd className="num">{formatHumanDate(caseData.decision.as_of ?? `${caseData.temporalScan.cutoff.slice(0, 10)}T12:00:00Z`)}</dd></div>
        </dl>
        <details className="fact-more"><summary>Product, market and team</summary><dl className="fact-table"><div><dt>Product</dt><dd>{context.product}</dd></div><div><dt>Market</dt><dd>{context.market}</dd></div><div><dt>Team</dt><dd>{context.team}</dd></div><div><dt>Go to market</dt><dd>{context.go_to_market}</dd></div></dl></details>
      </div>
    </section>
    <MetricStrip caseData={caseData} openMetric={openMetric} />
    <div className="evidence-split">
      <section aria-labelledby="supports-heading"><p className="eyebrow">What supports the thesis</p><h2 id="supports-heading">{caseData.thesis.statement}</h2><ul>{caseData.thesis.drivers.map((driver) => <li key={driver}><div>{investorLanguage(driver)}<small>Thesis driver</small></div></li>)}{clearing.slice(0, 3).map((item) => <li key={item.metric_id}><div>{screenContext(item.metric_id)} {investorLanguage(item.metric)} of {item.observed} clears the {item.threshold} screen</div></li>)}</ul></section>
      <section aria-labelledby="contradicts-heading" data-tone="contra"><p className="eyebrow">What contradicts it</p><h2 id="contradicts-heading">{caseData.thesis.counterthesis}</h2><ul>{caseData.thesis.falsifiers.map((falsifier) => <li key={falsifier}><div>{investorLanguage(falsifier)}<small>Falsifier: would overturn the thesis if observed</small></div></li>)}{missing.map((item) => <li key={item.metric_id}><div>{screenContext(item.metric_id)} {investorLanguage(item.metric)} of {item.observed} misses the {item.threshold} screen</div></li>)}</ul></section>
    </div>
    <ReturnsTable caseData={caseData} state={state} />
    <div className="two-up">
      <DriverList caseData={caseData} onOpenFinancials={() => onNavigate("financials")} />
      <section className="workspace-card" aria-labelledby="screens-heading"><div className="section-heading"><div><p className="eyebrow">What changes the recommendation</p><h2 id="screens-heading">Investment screens against the working policy</h2></div><span>Policy requires human approval</span></div><DecisionScreenTable caseData={caseData} compact /></section>
    </div>
    <WhatMustBeTrue caseData={caseData} />
    {caseData.caseId === "atlasgrid" ? <ChangeControlWorkspace caseData={caseData} state={state} update={update} /> : null}
    <RemainingWork state={state} onOpenDiligence={() => onNavigate("diligence")} />
    <Readiness caseData={caseData} state={state} />
    <ObservationComposer state={state} update={update} />
  </div>;
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

function DecisionRail({caseData, view, state}: {caseData: CaseData; view: DealView; state: DealWorkspaceState}) {
  const unresolved = state.issues.filter((issue) => issue.status !== "RESOLVED");
  const canonicalBlockers = caseData.decision.issue_summary.issues.filter((issue) => issue.blocks_advancement);
  const canonicalPrimary = canonicalBlockers[0];
  const policy = caseData.caseId === "helios" ? HELIOS_SCREEN_POLICY : ATLAS_SCREEN_POLICY;
  const working = caseData.peEngine
    ? (state.scenarioValues.peScenario ?? "selected") !== "selected"
    : (state.scenarioValues.vcScenario ?? "milestone") !== "milestone"
      || (state.scenarioValues.vcRiskCell ?? caseData.vcEngine!.risk_sensitivity.canonical_cell_id) !== caseData.vcEngine!.risk_sensitivity.canonical_cell_id
      || (state.scenarioValues.vcLossPolicy ?? caseData.vcEngine!.risk_sensitivity.canonical_policy_threshold) !== caseData.vcEngine!.risk_sensitivity.canonical_policy_threshold;
  const change = state.changeControl;
  const changeDisposition = change?.dispositionEvents.at(-1)?.disposition;
  const activeChange = change && changeDisposition !== "REJECTED" ? change : null;
  const isHold = caseData.decision.decision === "HOLD";
  const selectedHeliosRisk = caseData.vcEngine?.risk_sensitivity.cells.find((cell) => cell.cell_id === (state.scenarioValues.vcRiskCell ?? caseData.vcEngine!.risk_sensitivity.canonical_cell_id));
  const selectedHeliosPolicy = Number(state.scenarioValues.vcLossPolicy ?? caseData.vcEngine?.risk_sensitivity.canonical_policy_threshold ?? 0);
  const heliosLossScreenMisses = Boolean(selectedHeliosRisk) && Number(selectedHeliosRisk!.catastrophe_probability) > selectedHeliosPolicy;
  const primaryCondition = caseData.vcEngine && !activeChange
    ? heliosLossScreenMisses
      ? {title: "Assumed severe-loss probability exceeds the selected policy ceiling", consequence: `${percent(selectedHeliosRisk!.catastrophe_probability)} assumed severe-loss probability is above the ${percent(selectedHeliosPolicy)} selected ceiling. The scenario remains an unapproved analyst case.`}
      : {title: "Loss policy and supporting diligence remain unapproved", consequence: `${percent(selectedHeliosRisk!.catastrophe_probability)} assumed severe-loss probability is within the ${percent(selectedHeliosPolicy)} selected ceiling, but that does not authorize advancement while the policy and open diligence remain unreviewed.`}
    : {title: activeChange?.changeTitle ?? canonicalPrimary?.title ?? "No canonical blocking condition", consequence: activeChange?.decisionConsequence ?? canonicalPrimary?.consequence ?? "The canonical decision record contains no blocking condition."};
  const requiredAction = activeChange
    ? !changeDisposition
      ? "A named reviewer must accept, reject, or defer the revised evidence."
      : changeDisposition === "ACCEPTED"
        ? "Reapprove stale assumptions, complete reopened diligence, and reconcile the IC memo."
        : changeDisposition === "REJECTED"
          ? "Preserve Version 1 and document why the revised source was rejected."
          : "Resolve the deferred evidence question before advancing the analysis."
    : isHold
    ? "Maintain HOLD while the binding screen and open diligence remain unresolved."
    : caseData.decision.path_to_yes[0];
  const posture = activeChange ? "REOPEN DILIGENCE" : caseData.decision.decision;
  const memo = scenarioMemoSummary(caseData, state);
  const viewNote: Record<DealView, ReactNode> = {
    overview: null,
    financials: <section><span>Scenario consequence</span><strong>{memo.returnLine}</strong><p>{working ? "Unapproved what-if. The canonical case and the recommendation are unchanged until a named reviewer acts." : "Canonical case. Change a scenario to see the return consequence without touching the books."}</p></section>,
    diligence: <section><span>Ownership</span><strong>{unresolved.length} open {unresolved.length === 1 ? "item" : "items"} · {new Set(unresolved.map((issue) => issue.owner)).size} named {new Set(unresolved.map((issue) => issue.owner)).size === 1 ? "owner" : "owners"}</strong><p>Quantitative hurdles clear only through evidence or a recorded policy-owner exception.</p></section>,
    documents: <section><span>Evidence lineage</span><strong>{caseData.artifacts.length} sources · {caseData.metricRegistry.length} registered figures</strong><p>Every displayed figure links to retained rows, fields, or excerpts and a formula with its inputs.</p></section>,
    memo: <section><span>Memo state</span><strong>{memo.state} · {memo.label}</strong><p>{memo.reconciliationBlockedReason ?? "Export is available only when every section matches the selected scenario."}</p></section>,
  };
  return <aside className="decision-rail" aria-label="Decision status" tabIndex={0}>
    <header><span>Current posture</span><h2 data-posture={posture}>{posture}</h2><strong>{postureHeadline[posture] ?? posture}</strong><p>{activeChange ? "Revised evidence changed the selected-case screen" : "Analytical posture · committee decision pending"}</p></header>
    <dl><div><dt>View</dt><dd>{viewLabels[view]}</dd></div><div><dt>Scenario</dt><dd>{activeChange ? `${activeChange.toVersion} · ${changeDisposition?.toLowerCase() ?? "pending"}` : working ? "Unapproved what-if" : "Canonical case"}</dd></div><div><dt>Canonical conditions</dt><dd>{canonicalBlockers.length}</dd></div><div><dt>Worklist open</dt><dd>{unresolved.length}</dd></div><div><dt>Policy state</dt><dd>{policy.status.toLowerCase()} · {policy.lastReviewed ?? "not reviewed"}</dd></div></dl>
    {viewNote[view]}
    <section><span>Primary decision condition</span><strong>{primaryCondition.title}</strong><p>{primaryCondition.consequence}</p></section>
    <section><span>{isHold || activeChange ? "Required next action" : "Next committee action"}</span><strong>{requiredAction}</strong></section>
    {isHold && !activeChange ? <section><span>Path to reconsideration</span><strong>{caseData.decision.path_to_yes[0]}</strong><p>Illustrative terms only; not authority to fund or advance.</p></section> : null}
    <footer>IC decision pending</footer>
    <BoundaryNote />
  </aside>;
}

function Diligence({caseData, state, update, modelTransport, connection, openMetric}: {caseData: CaseData; state: DealWorkspaceState; update: ReturnType<typeof useDealWorkspace>["update"]; modelTransport?: ModelTransport; connection: ConnectionState | null; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const [section, setSection] = useState<"issues" | "assumptions" | "policy" | "test" | "model">("issues");
  const referenceLabels = Object.fromEntries([...caseData.metricRegistry.map((metric) => [metric.metric_id, metric.label]), ...caseData.analyses.map((analysis) => [analysis.analysis_id, analysis.question]), ...caseData.artifacts.map((artifact) => [artifact.artifact_id, artifact.path.split("/").at(-1) ?? artifact.path])]);
  const evidence = modelEvidenceForCase(caseData);
  const profile = caseData.caseId === "helios" ? HELIOS_SCREEN_POLICY : ATLAS_SCREEN_POLICY;
  const tabs = [{id: "issues", label: `Issues · ${state.issues.filter((issue) => issue.status !== "RESOLVED").length}`}, {id: "assumptions", label: "Assumptions"}, {id: "policy", label: "Policy"}, {id: "test", label: "Assumption test"}, {id: "model", label: "Model review"}] as const;
  const stages = new Map<string, string>(caseData.decision.issue_summary.issues.map((issue) => [issue.issue_id, stageLabel[issue.stage] ?? issue.stage]));
  const content = section === "issues"
    ? <DiligenceWorklist state={state} update={update} lockedIssueIds={new Set(workspaceSeed(caseData).lockedIssueIds ?? [])} stages={stages} />
    : section === "assumptions"
      ? <AssumptionRegistry assumptions={assumptionsFor(caseData)} state={state} update={update} staleAssumptionIds={state.changeControl?.affectedAssumptionIds} staleSince={state.changeControl?.importedAt} />
      : section === "policy"
        ? <><DecisionScreenTable caseData={caseData} /><PolicyRegistry profile={profile} state={state} update={update} blockingGates={state.issues.filter((issue) => issue.status !== "RESOLVED").map((issue) => ({gateId: issue.id, label: issue.title}))} /></>
        : section === "test"
          ? <EconometricTest caseData={caseData} openMetric={openMetric} />
          : <><ModelReviewPanel dealId={caseData.caseId} connection={connection} transport={modelTransport} proposals={state.proposals} onProposalsChange={(next) => update((current) => ({proposals: typeof next === "function" ? next(current.proposals) : next}))} evidence={evidence} referenceLabels={referenceLabels} /><details className="advanced-handoff"><summary>Advanced local model handoff</summary><ProposalLedgerImport caseData={caseData} onImport={(proposals) => update((current) => ({proposals: [...current.proposals, ...proposals].filter((proposal, index, items) => items.findIndex((candidate) => candidate.proposalId === proposal.proposalId) === index)}))} /></details></>;
  return <div className="view-stack">
    <nav className="workspace-tabs" aria-label="Diligence workspace">{tabs.map((tab) => <button type="button" key={tab.id} aria-pressed={section === tab.id} onClick={() => setSection(tab.id)}>{tab.label}</button>)}</nav>
    {content}
  </div>;
}

export function DealSidebar({company, caseId, onDeals, onNavigate, view, onConnect, storageNotice, attention, switcher, footNote}: {company: string; caseId: string; onDeals: () => void; onNavigate: (view: DealView) => void; view: DealView; onConnect: () => void; storageNotice: string; attention: boolean; switcher?: ReactNode; footNote?: string}) {
  return <aside className="sidebar"><button type="button" className="wordmark" onClick={onDeals} aria-label="Underwriting Desk deals"><span>U</span><strong>Underwriting Desk</strong></button><div className="sidebar-deal"><span>Deal</span>{switcher ?? <strong>{company}</strong>}<small>{caseId === "local" ? "Admitted company package" : "Retained synthetic case"}</small></div><nav aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => onNavigate(item)}><NavIcon view={item} />{viewLabels[item]}</button>)}</nav><div className="sidebar-questions"><span>Each view answers</span><ol>{dealViews.map((item) => <li key={item}>{viewQuestions[item]}</li>)}</ol></div><div className="sidebar-foot"><button type="button" onClick={onConnect}>Model settings</button><span data-attention={attention || undefined}>{attention ? "Workspace attention required" : storageNotice}</span>{footNote ? <small>{footNote}</small> : null}</div></aside>;
}

function DealShell({caseData, view, onNavigate, onChooseDeal, onDeals, onConnect, connection, modelTransport}: {caseData: CaseData; view: DealView; onNavigate: (view: DealView) => void; onChooseDeal: (caseId: CaseId) => void; onDeals: () => void; onConnect: () => void; connection: ConnectionState | null; modelTransport?: ModelTransport}) {
  const seed = useMemo(() => workspaceSeed(caseData), [caseData]);
  const allowedEvidenceRefs = useMemo(() => new Set([...caseData.metricRegistry.map((item) => item.metric_id), ...caseData.analyses.map((item) => item.analysis_id), ...caseData.artifacts.map((item) => item.artifact_id)]), [caseData]);
  const scenarioContract = useMemo(() => scenarioContractFor(caseData), [caseData]);
  const {state, update, replace, storageNotice, recovery, discardRejectedState, integrityContract} = useDealWorkspace(seed, allowedEvidenceRefs, scenarioContract);
  const storageAlert = storageNotice === "Saved locally" ? "" : storageNotice;
  const [lineage, setLineage] = useState<{metric: Metric; trigger: HTMLElement} | null>(null);
  const openLineage = (metric: Metric, trigger: HTMLElement) => setLineage({metric, trigger});
  const closeLineage = () => {
    const trigger = lineage?.trigger;
    setLineage(null);
    window.requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  };
  const catalogEntry = caseCatalog.find((item) => item.caseId === caseData.caseId);
  const content = view === "overview"
    ? <Overview caseData={caseData} state={state} update={update} openMetric={openLineage} onNavigate={onNavigate} />
    : view === "financials"
      ? <FinancialWorkspace caseData={caseData} state={state} update={update} openMetric={openLineage} />
      : view === "diligence"
        ? <Diligence caseData={caseData} state={state} update={update} modelTransport={modelTransport} connection={connection} openMetric={openLineage} />
        : view === "documents"
          ? <DocumentsWorkspace caseData={caseData} openMetric={openLineage} />
          : <><EditableMemo state={state} update={update} title={caseData.company} subtitle={caseData.dealContext.investment_question} scenarioSummary={scenarioMemoSummary(caseData, state)} /><WorkspaceTransfer state={state} replace={replace} allowedEvidenceRefs={allowedEvidenceRefs} scenarioContract={scenarioContract} integrityContract={integrityContract} /></>;
  const switcher = <select aria-label="Deal" value={caseData.caseId} onChange={(event) => onChooseDeal(event.target.value as CaseId)}>{caseCatalog.map((item) => <option value={item.caseId} key={item.caseId}>{item.company}</option>)}</select>;
  return <div className="product-shell">
    <DealSidebar company={caseData.company} caseId={caseData.caseId} onDeals={onDeals} onNavigate={onNavigate} view={view} onConnect={onConnect} storageNotice={storageNotice} attention={Boolean(storageAlert)} switcher={switcher} />
    <div className="shell-main">
      <header className="deal-topbar"><div className="topbar-company"><strong>{viewLabels[view]}</strong><small>{viewQuestions[view]}</small></div><div className="topbar-meta"><span><b>{caseData.caseType}</b></span><span>{catalogEntry?.stage ?? "Underwriting"}</span><span>As of {formatHumanDate(caseData.decision.as_of ?? `${caseData.temporalScan.cutoff.slice(0, 10)}T12:00:00Z`)}</span><span className={`posture posture-${caseData.decision.decision.toLowerCase()}`}>{caseData.decision.decision}</span></div><button className="topbar-model" type="button" onClick={onConnect}>Model settings</button></header>
      <div className="workspace-layout"><main id="main-content" className="deal-main">{storageAlert ? <p className="persistence-warning" role="status">{storageAlert}</p> : null}{recovery ? <WorkspaceRecovery recovery={recovery} onStartFresh={discardRejectedState} /> : null}<header className="deal-heading"><div><p className="eyebrow">{caseData.caseType} · {catalogEntry?.owner ?? "Deal team"}</p><h1>{caseData.company}</h1><p>{caseData.dealContext.company_one_liner}</p></div><p className="ic-question"><span>Investment question</span>{caseData.dealContext.investment_question}</p></header><RetainedEvidenceBoundary key={`${caseData.caseId}:${view}`} onReset={onDeals}>{content}</RetainedEvidenceBoundary></main><DecisionRail caseData={caseData} view={view} state={state} /></div>
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
      if (route.view === "public-record") {setActiveLocal(false); setView("public-record"); window.scrollTo(0, 0); return;}
      if (route.caseId === "local") {
        setLoading(true);
        void loadAdmittedDeal().then((restored) => {
          if (restored) {setLocalDeal(restored); setActiveLocal(true); setView(route.view); window.scrollTo(0, 0);}
          else {setImportNotice("The local deal failed source replay or is unavailable in this browser. Import its portable deal file or run intake again."); setActiveLocal(false); setView("deals"); window.history.replaceState(null, "", "#/"); window.scrollTo(0, 0);}
        }).finally(() => setLoading(false));
        return;
      }
      void openRetainedDeal(route.caseId as CaseId, route.view as DealView, "replace");
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
  if (view === "deals") return <><DealList onOpen={(caseId) => void openRetainedDeal(caseId, "overview")} onNew={() => setIntakeOpen(true)} onConnect={() => setConnectionOpen(true)} connection={connection} localDeal={localDeal} onOpenLocal={() => {setActiveLocal(true); setView("overview"); window.history.pushState(null, "", "#/v3/local/overview"); window.scrollTo(0, 0);}} onOpenPublicRecord={() => {setActiveLocal(false); setView("public-record"); window.history.pushState(null, "", "#/public-record/snowflake"); window.scrollTo(0, 0);}} onImportLocal={(file) => void importLocal(file)} importNotice={importNotice} loadCaseFn={loadCaseFn} />{connectionDialog}</>;
  if (view === "public-record") return <PublicRecordCase onDeals={returnToDeals} />;
  if (activeLocal && localDeal) return <><LocalDealShell result={localDeal} view={view} onNavigate={(next) => {setView(next); window.history.pushState(null, "", `#/v3/local/${next}`); window.scrollTo(0, 0);}} onDeals={returnToDeals} onConnect={() => setConnectionOpen(true)} onPromote={(promoted) => {const persisted = persistAdmittedDeal(promoted); setLocalPersistenceNotice(persisted ? "" : "Version promoted for this session; browser persistence failed."); setLocalDeal(promoted);}} connection={connection} modelTransport={modelTransport} persistenceNotice={localPersistenceNotice} />{connectionDialog}</>;
  return <><DealShell key={caseData.caseId} caseData={caseData} view={view as DealView} onNavigate={navigate} onChooseDeal={(caseId) => void openRetainedDeal(caseId, view as DealView)} onDeals={returnToDeals} onConnect={() => setConnectionOpen(true)} connection={connection} modelTransport={modelTransport} />{connectionDialog}</>;
}
