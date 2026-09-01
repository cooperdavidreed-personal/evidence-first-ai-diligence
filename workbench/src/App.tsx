import {Component, useMemo, useState, type ReactNode} from "react";
import {caseCatalog, isCaseId, loadCase, type CaseId} from "./case-data";
import {DealIntake, LocalDealShell} from "./local-deal";
import type {IntakeResult} from "./intake";
import {ModelReviewPanel} from "./model-review-panel";
import {createAdapterTransport, type ConnectionState} from "./model-connection";
import {ModelConnectionButton, ModelConnectionDialog} from "./model-connection-dialog";
import type {ModelProposal, ModelTransport} from "./model-workflow";
import {ProposalLedgerImport} from "./proposal-ledger-import";
import type {CaseData} from "./types";

export const dealViews = ["overview", "financials", "diligence", "documents", "memo"] as const;
export type DealView = (typeof dealViews)[number];
export type RouteView = DealView | "deals";
export interface RouteState { caseId: CaseId; view: RouteView }

const viewLabels: Record<DealView, string> = {
  overview: "Overview",
  financials: "Financials",
  diligence: "Diligence",
  documents: "Documents",
  memo: "IC Memo",
};
const legacyViews: Record<string, DealView> = {
  risks: "diligence", thesis: "overview", "value-creation": "financials",
  explore: "documents", sources: "documents", methodology: "diligence",
  audit: "documents", underwriting: "financials",
};

export function parseRoute(): RouteState {
  const parts = window.location.hash.replace(/^#\//, "").split("/");
  const caseId = parts[1] ?? "";
  if (parts.length < 3 || !isCaseId(caseId)) return {caseId: "atlasgrid", view: "deals"};
  const requested = parts[2] ?? "overview";
  const view = dealViews.includes(requested as DealView) ? requested as DealView : legacyViews[requested] ?? "overview";
  return {caseId, view};
}

function routePath(caseId: string, view: DealView) { return `#/v3/${caseId}/${view}`; }
function friendlyFileName(path: string) {
  const name = path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? path;
  return name.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {CLEARS: "Clears", MISSES: "Misses", FAILED: "Failed", OPEN: "Open"};
  return labels[status] ?? status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
function plainObserved(value: string) { return value.replace(/\s*\(MC SE[^)]*\)/i, ""); }
function requiredAnalysis(caseData: CaseData, analysisId: string) {
  const analysis = caseData.analyses.find((item) => item.analysis_id === analysisId);
  if (!analysis) throw new Error(`Required retained analysis ${analysisId} is missing`);
  return analysis;
}
function analysisOutput(caseData: CaseData, analysisId: string, outputName: string) {
  const output = requiredAnalysis(caseData, analysisId).outputs.find((item) => item.name === outputName);
  if (!output) throw new Error(`Required retained output ${analysisId}.${outputName} is missing`);
  return output.value;
}
function analysisDiagnostic(caseData: CaseData, analysisId: string, diagnosticName: string) {
  const diagnostic = requiredAnalysis(caseData, analysisId).diagnostics.find((item) => item.name === diagnosticName);
  if (!diagnostic) throw new Error(`Required retained diagnostic ${analysisId}.${diagnosticName} is missing`);
  return diagnostic.value;
}
function numericAnalysisValue(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Required retained numeric value ${label} is invalid`);
  return parsed;
}

class RetainedEvidenceBoundary extends Component<{children: ReactNode; onReset: () => void}, {error: Error | null}> {
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: Error) { return {error}; }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel error-summary retained-evidence-error" role="alert" aria-labelledby="retained-evidence-error-heading">
        <p className="eyebrow">Evidence boundary</p>
        <h2 id="retained-evidence-error-heading">Analysis unavailable</h2>
        <p>The retained package is incomplete for this view, so no analytical conclusion is shown.</p>
        <button className="secondary-button" type="button" onClick={this.props.onReset}>Return to Deals</button>
        <details className="method-disclosure"><summary>View technical reason</summary><p>{this.state.error.message}</p></details>
      </section>
    );
  }
}

function DealList({onOpen, onNew, onConnect, connection, localDeal, onOpenLocal}: {onOpen: (caseId: CaseId) => void; onNew: () => void; onConnect: () => void; connection: ConnectionState | null; localDeal: IntakeResult | null; onOpenLocal: () => void}) {
  return (
    <main className="deals-page" id="main-content">
      <div className="page-heading">
        <div><p className="eyebrow">Private markets</p><h1>Deals</h1><p>Review a retained case or create a browser-local deal from the supported package.</p></div>
        <div className="page-actions"><ModelConnectionButton connection={connection} onClick={onConnect} /><button className="primary-button" type="button" data-testid="new-deal-button" onClick={onNew}>New deal</button></div>
      </div>
      <section aria-labelledby="active-deals-heading">
        <div className="section-heading"><h2 id="active-deals-heading">Active reviews</h2><span>{caseCatalog.length + (localDeal ? 1 : 0)} deals</span></div>
        <div className="deal-grid">
          {localDeal ? <article className="deal-card"><div className="deal-card-topline"><span className="quiet-chip">Browser local</span><span>Growth SaaS</span></div><h3>{localDeal.deal?.company}</h3><p>{localDeal.posture} · refresh clears this deal.</p><button type="button" className="text-button" onClick={onOpenLocal}>Open deal <span aria-hidden="true">→</span></button></article> : null}
          {caseCatalog.map((item) => (
            <article className="deal-card" key={item.caseId}>
              <div className="deal-card-topline"><span className="quiet-chip">Illustrative data</span><span>{item.caseType}</span></div>
              <h3>{item.company}</h3><p>{item.investmentQuestion}</p>
              <button type="button" className="text-button" onClick={() => onOpen(item.caseId)}>Open deal <span aria-hidden="true">→</span></button>
            </article>
          ))}
        </div>
      </section>
      <section className="intake-empty-state" aria-labelledby="supported-package-heading">
        <div><p className="eyebrow">Supported intake</p><h2 id="supported-package-heading">Growth SaaS Quick Package</h2></div>
        <p>Four declared files. Browser-local validation. No arbitrary data-room claim.</p>
      </section>
    </main>
  );
}

function DecisionTests({caseData}: {caseData: CaseData}) {
  const tests = caseData.decision.metric_pairs ?? [];
  const heliosStress = caseData.caseId === "helios" ? {
    lossShare: numericAnalysisValue(analysisOutput(caseData, "HX-09", "probability_below_1x"), "HX-09.probability_below_1x"),
    precision: numericAnalysisValue(analysisDiagnostic(caseData, "HX-09", "loss_probability_monte_carlo_se_pp"), "HX-09.loss_probability_monte_carlo_se_pp"),
  } : null;
  return (
    <section className="panel" aria-labelledby="decision-tests-heading">
      <div className="section-heading"><div><p className="eyebrow">Declared policy</p><h2 id="decision-tests-heading">Decision tests</h2></div><span>{tests.filter((test) => test.status === "MISSES").length} misses</span></div>
      <div className="table-wrap" tabIndex={0} aria-label="Scrollable decision tests"><table><thead><tr><th>Test</th><th>Observed</th><th>Required</th><th>Result</th></tr></thead><tbody>
        {tests.map((test, index) => <tr key={`${test.metric}-${index}`}><td>{test.metric.replace("Gross XIRR", "Annualized gross return")}</td><td>{plainObserved(test.observed)}</td><td>{test.threshold}</td><td><span className={`status status-${test.status.toLowerCase()}`}>{statusLabel(test.status)}</span></td></tr>)}
      </tbody></table></div>
      {heliosStress ? <details className="method-disclosure"><summary>View simulation precision</summary><p>The modeled loss share is {heliosStress.lossShare.toFixed(1)}%. Its simulation-noise estimate is ±{heliosStress.precision.toFixed(2)} percentage points. This is a declared synthetic stress result, not a forecast.</p></details> : null}
    </section>
  );
}

function Overview({caseData}: {caseData: CaseData}) {
  const blocker = caseData.decision.issue_summary.issues.find((issue) => issue.blocks_advancement);
  const decisive = caseData.summaryMetrics[0];
  const signatureLabel = caseData.decision.signature_status === "PENDING_FOUNDER_SIGNATURE" ? "Pending founder signature" : caseData.decision.signature_status === "SIGNED" ? "Signed" : "Not requested";
  return (
    <div className="view-stack">
      <section className="decision-panel" aria-labelledby="decision-heading">
        <div className="decision-copy"><p className="eyebrow">Analytical posture</p><h2 id="decision-heading">{caseData.decision.decision}</h2><p>{caseData.decision.rationale}</p></div>
        <div className="approval-state"><span>IC approval</span><strong>{signatureLabel}</strong><span>{caseData.decision.open_conditions} open conditions</span></div>
      </section>
      <section className="first-read-grid" aria-label="First read">
        <article><p className="eyebrow">Decisive evidence</p><h3>{decisive?.value ?? "—"}</h3><p><strong>{decisive?.label}</strong> · {decisive?.detail}</p></article>
        <article><p className="eyebrow">What breaks the case</p><h3>{blocker?.title ?? "No blocking issue"}</h3><p>{blocker?.consequence ?? "No declared blocker."}</p></article>
        <article><p className="eyebrow">Next action</p><h3>{caseData.decision.path_to_yes[0] ?? "Complete diligence"}</h3><p>{caseData.decision.conditions[0]}</p></article>
      </section>
      <DecisionTests caseData={caseData} />
      <section className="panel terms-panel" aria-labelledby="terms-heading"><div><p className="eyebrow">Structure</p><h2 id="terms-heading">Terms under review</h2></div><ul>{(caseData.decision.terms ?? []).map((term) => <li key={term}>{term}</li>)}</ul></section>
      <details className="panel disclosure-panel"><summary>Company in one minute</summary><dl className="description-grid"><div><dt>Product</dt><dd>{caseData.dealContext.product}</dd></div><div><dt>Customer</dt><dd>{caseData.dealContext.customer}</dd></div><div><dt>Market</dt><dd>{caseData.dealContext.market}</dd></div><div><dt>Go to market</dt><dd>{caseData.dealContext.go_to_market}</dd></div></dl></details>
    </div>
  );
}

function Financials({caseData}: {caseData: CaseData}) {
  return (
    <div className="view-stack">
      <section className="metric-grid" aria-label="Key financial measures">{caseData.summaryMetrics.map((metric) => <article className="metric-card" key={metric.metric_id} data-metric-id={metric.metric_id}><span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.detail}</p></article>)}</section>
      <section className="panel" aria-labelledby="scenario-heading"><div className="section-heading"><div><p className="eyebrow">Deterministic mechanics</p><h2 id="scenario-heading">Scenario comparison</h2></div></div><div className="table-wrap" tabIndex={0} aria-label="Scrollable scenario comparison"><table><thead><tr><th>Scenario</th><th>Structure</th><th>Annualized gross return</th><th>Gross multiple</th><th>Financing note</th></tr></thead><tbody>{caseData.scenarios.map((scenario) => <tr key={scenario.id}><td>{scenario.label}</td><td>{scenario.entry_ev}</td><td>{scenario.gross_irr}</td><td>{scenario.moic}</td><td>{scenario.covenant}</td></tr>)}</tbody></table></div></section>
      <section className="panel" aria-labelledby="assumptions-heading"><div className="section-heading"><div><p className="eyebrow">Boundary</p><h2 id="assumptions-heading">What the numbers can support</h2></div></div><p>Accounting uses retained integer-cent records. Scenario returns apply declared financing and exit assumptions. They are analytical outputs, not forecasts or approvals.</p><details className="method-disclosure"><summary>View calculation boundary</summary><p>The retained Python engine remains canonical for the full evidence packet, debt, dilution, preferences, stress paths, and lineage.</p></details></section>
    </div>
  );
}

function Diligence({caseData, modelTransport, connection, proposals, onProposalsChange}: {caseData: CaseData; modelTransport?: ModelTransport; connection: ConnectionState | null; proposals: ModelProposal[]; onProposalsChange: (proposals: ModelProposal[]) => void}) {
  const issues = caseData.decision.issue_summary.issues;
  const evidenceResult = caseData.caseId === "helios" ? (() => {
    const analysis = requiredAnalysis(caseData, "HX-06");
    const effect = numericAnalysisValue(analysisOutput(caseData, "HX-06", "optimizer_ate"), "HX-06.optimizer_ate");
    return {
      effectPercent: Math.abs(Math.expm1(effect)) * 100,
      comparison: effect < 0 ? `${(Math.abs(Math.expm1(effect)) * 100).toFixed(1)}% less compute per workload` : effect > 0 ? `${(Math.abs(Math.expm1(effect)) * 100).toFixed(1)}% more compute per workload` : "no measurable difference in compute per workload",
      resultVerb: effect < 0 ? "reduced" : effect > 0 ? "increased" : "did not change",
      evidenceLabel: effect < 0 ? "Zero base-case credit" : effect > 0 ? "Adverse signal" : "No measured effect",
      decisionUse: effect < 0 ? "Candidate savings rate for the value plan; no base-case credit until replicated against production provider invoices." : effect > 0 ? "Adverse unit-cost signal; no savings credit until the test is replicated against production provider invoices." : "No unit-cost savings signal and no base-case credit.",
      population: analysis.population,
      estimate: effect.toFixed(4),
      interval: analysisDiagnostic(caseData, "HX-06", "unadjusted_confidence_interval"),
      companion: numericAnalysisValue(analysisOutput(caseData, "HX-06", "optimizer_baseline_adjusted_companion"), "HX-06.optimizer_baseline_adjusted_companion").toFixed(4),
    };
  })() : (() => {
    const analysis = requiredAnalysis(caseData, "AG-07");
    const effect = numericAnalysisValue(analysisOutput(caseData, "AG-07", "renewal_itt"), "AG-07.renewal_itt");
    return {
      effectPoints: Math.abs(effect),
      comparison: effect < 0 ? `${Math.abs(effect).toFixed(1)} percentage points less often` : effect > 0 ? `${Math.abs(effect).toFixed(1)} percentage points more often` : "at the same observed rate",
      resultVerb: effect < 0 ? "reduced" : effect > 0 ? "increased" : "did not change",
      evidenceLabel: effect < 0 ? "Downside evidence" : effect > 0 ? "Upside signal" : "No measured effect",
      decisionUse: effect < 0 ? "No pricing upside credit in the selected structure." : effect > 0 ? "Potential pricing upside; no base-case credit without replication." : "No pricing credit from this test.",
      population: analysis.population,
    };
  })();
  return (
    <div className="view-stack">
      <section className="panel" aria-labelledby="issues-heading"><div className="section-heading"><div><p className="eyebrow">Worklist</p><h2 id="issues-heading">{issues.filter((issue) => issue.blocks_advancement).length} issues block the next step</h2></div><span>Human-owned</span></div><div className="issue-list">{issues.map((issue) => <article key={issue.issue_id}><div><span className={`status status-${issue.state.toLowerCase()}`}>{statusLabel(issue.state)}</span><span>{issue.materiality.toLowerCase()}</span></div><h3>{issue.title}</h3><p>{issue.consequence}</p><footer><span>Owner</span><strong>{issue.owner}</strong></footer></article>)}</div></section>
      {"effectPercent" in evidenceResult ? (
        <section className="panel evidence-result" aria-labelledby="optimizer-heading"><div className="section-heading"><div><p className="eyebrow">Evidence test</p><h2 id="optimizer-heading">Optimizer test {evidenceResult.resultVerb} unit compute cost</h2></div><span>{evidenceResult.evidenceLabel}</span></div><p className="result-lead">Customers randomly given the optimizer showed <strong>{evidenceResult.comparison}</strong> than customers without it.</p><dl className="result-context"><div><dt>Population</dt><dd>{evidenceResult.population} across the declared test window.</dd></div><div><dt>Decision use</dt><dd>{evidenceResult.decisionUse}</dd></div><div><dt>Limitation</dt><dd>A planted effect in illustrative data. It says nothing about real customers or future margin.</dd></div></dl><details className="method-disclosure"><summary>View method</summary><p>Estimated change: {evidenceResult.estimate} log points; 95% interval {evidenceResult.interval}; baseline-adjusted precision companion {evidenceResult.companion}.</p></details></section>
      ) : (
        <section className="panel evidence-result" aria-labelledby="renewal-heading"><div className="section-heading"><div><p className="eyebrow">Evidence test</p><h2 id="renewal-heading">Higher renewal offers {evidenceResult.resultVerb} renewal</h2></div><span>{evidenceResult.evidenceLabel}</span></div><p className="result-lead">Accounts randomly offered the higher renewal price renewed <strong>{evidenceResult.comparison}</strong> than the comparison group.</p><dl className="result-context"><div><dt>Population</dt><dd>{evidenceResult.population}.</dd></div><div><dt>Decision use</dt><dd>{evidenceResult.decisionUse}</dd></div><div><dt>Limitation</dt><dd>A planted effect in synthetic data, not evidence about a real company.</dd></div></dl></section>
      )}
      <ProposalLedgerImport caseData={caseData} onImport={(imported) => onProposalsChange([...proposals, ...imported].filter((proposal, index, items) => items.findIndex((candidate) => candidate.proposalId === proposal.proposalId) === index))} />
      <ModelReviewPanel connection={connection} transport={modelTransport} proposals={proposals} onProposalsChange={onProposalsChange} evidence={caseData.summaryMetrics.map((metric) => ({id: metric.metric_id, title: metric.label, displayValue: metric.value, summary: metric.detail}))} />
    </div>
  );
}

function Documents({caseData}: {caseData: CaseData}) {
  const [query, setQuery] = useState("");
  const artifacts = useMemo(() => caseData.artifacts.filter((artifact) => friendlyFileName(artifact.path).toLowerCase().includes(query.toLowerCase())), [caseData, query]);
  return (
    <div className="view-stack"><section className="panel" aria-labelledby="package-heading"><div className="section-heading"><div><p className="eyebrow">Retained package</p><h2 id="package-heading">Document register</h2></div><span>{caseData.artifacts.length} recognized</span></div><label className="search-field"><span>Search documents</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try customers or financing" /></label><div className="document-list">{artifacts.map((artifact) => <article key={artifact.artifact_id}><div><h3>{friendlyFileName(artifact.path)}</h3><p>{artifact.rows.toLocaleString()} retained rows</p></div><span className="status status-clears">Recognized</span><details className="technical-record"><summary>Reproduction detail</summary><dl><div><dt>Source path</dt><dd><code>{artifact.path}</code></dd></div><div><dt>Format contract</dt><dd><code>{artifact.schema}</code></dd></div><div><dt>File digest</dt><dd><code>{artifact.sha256}</code></dd></div></dl></details></article>)}</div></section><div className="local-data-note"><strong>Illustrative records only.</strong> The public slice contains no confidential deal data and makes no enterprise-security claim.</div></div>
  );
}

function Memo({caseData, proposals}: {caseData: CaseData; proposals: ModelProposal[]}) {
  const blocker = caseData.decision.issue_summary.issues.find((issue) => issue.blocks_advancement);
  const acceptedDrafts = proposals.filter((proposal) => proposal.kind === "MEMO_DRAFT" && proposal.state === "ACCEPTED");
  const reviewed = proposals.filter((proposal) => proposal.state !== "PROPOSED");
  return (
    <div className="memo-page"><section className="memo-sheet" aria-labelledby="memo-heading"><header><div><span>Investment committee draft</span><h2 id="memo-heading">{caseData.company}</h2><p>{caseData.dealContext.investment_question}</p></div><span className="quiet-chip">Illustrative data</span></header><article><span className="source-tag">Engine</span><h3>Recommendation and why</h3><p>{caseData.decision.rationale}</p></article><article><span className="source-tag">Engine</span><h3>Economics</h3><p>{caseData.summaryMetrics.slice(0, 3).map((metric) => `${metric.label}: ${metric.value}`).join(" · ")}.</p></article><article><span className="source-tag">Engine</span><h3>Downside</h3><p>{blocker?.consequence ?? "No declared blocking issue."}</p></article><article><span className="source-tag">Analyst</span><h3>Conditions and path to reconsideration</h3><ul>{caseData.decision.path_to_yes.map((item) => <li key={item}>{item}</li>)}</ul></article>{acceptedDrafts.map((proposal) => <article key={proposal.proposalId}><span className="source-tag">Model proposed · accepted by {proposal.humanActor}</span><h3>{proposal.title}</h3><p>{proposal.body}</p><small>Evidence: {proposal.evidenceRefs.join(", ")}</small></article>)}{reviewed.length ? <article><span className="source-tag">Human review ledger</span><h3>Model proposal disposition</h3><ul>{reviewed.map((proposal) => <li key={proposal.proposalId}>{proposal.title} — {proposal.state.toLowerCase()} by {proposal.humanActor}</li>)}</ul></article> : null}<footer>Draft only · Requires investment committee approval · Illustrative data, not investment advice</footer></section><div className="memo-actions"><button className="primary-button" type="button" onClick={() => window.print()}>Print IC memo</button><p>Model-proposed language is never inserted without human acceptance.</p></div></div>
  );
}

function DealShell({caseData, view, onNavigate, onChooseDeal, onDeals, onConnect, connection, modelTransport, proposals, onProposalsChange}: {caseData: CaseData; view: DealView; onNavigate: (view: DealView) => void; onChooseDeal: (caseId: CaseId) => void; onDeals: () => void; onConnect: () => void; connection: ConnectionState | null; modelTransport?: ModelTransport; proposals: ModelProposal[]; onProposalsChange: (proposals: ModelProposal[]) => void}) {
  return (
    <div className="product-shell"><aside className="sidebar"><button type="button" className="wordmark" onClick={onDeals} aria-label="Underwriting Desk deals"><span>UD</span><strong>Underwriting Desk</strong></button><nav aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => onNavigate(item)}>{viewLabels[item]}</button>)}</nav><div className="sidebar-foot"><span className="quiet-chip">Illustrative data</span><p>Methods and lineage remain available on request.</p></div></aside><div className="shell-main"><header className="deal-topbar"><button type="button" className="mobile-wordmark" onClick={onDeals}>Underwriting Desk</button><label><span>Deal</span><select aria-label="Deal" value={caseData.caseId} onChange={(event) => onChooseDeal(event.target.value as CaseId)}>{caseCatalog.map((item) => <option value={item.caseId} key={item.caseId}>{item.company}</option>)}</select></label><div className="topbar-meta"><span>{caseData.caseType}</span><span>{caseData.decision.as_of ?? caseData.temporalScan.cutoff.slice(0, 10)}</span></div><ModelConnectionButton connection={connection} onClick={onConnect} /></header><nav className="mobile-nav" aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => onNavigate(item)}>{viewLabels[item]}</button>)}</nav><main id="main-content" className="deal-main"><header className="deal-heading"><div><p className="eyebrow">{viewLabels[view]}</p><h1>{caseData.company}</h1><p>{caseData.dealContext.company_one_liner}</p></div><p className="ic-question"><span>IC question</span>{caseData.dealContext.investment_question}</p></header><RetainedEvidenceBoundary key={`${caseData.caseId}:${view}`} onReset={onDeals}>{view === "overview" ? <Overview caseData={caseData} /> : null}{view === "financials" ? <Financials caseData={caseData} /> : null}{view === "diligence" ? <Diligence caseData={caseData} modelTransport={modelTransport} connection={connection} proposals={proposals} onProposalsChange={onProposalsChange} /> : null}{view === "documents" ? <Documents caseData={caseData} /> : null}{view === "memo" ? <Memo caseData={caseData} proposals={proposals} /> : null}</RetainedEvidenceBoundary></main></div></div>
  );
}

export default function App({initialCase, initialRoute, loadCaseFn = loadCase}: {initialCase: CaseData; initialRoute: RouteState; loadCaseFn?: (caseId: CaseId) => Promise<CaseData>}) {
  const [caseData, setCaseData] = useState(initialCase);
  const [view, setView] = useState<RouteView>(initialRoute.view);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [localDeal, setLocalDeal] = useState<IntakeResult | null>(null);
  const [activeLocal, setActiveLocal] = useState(false);
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [proposalsByDeal, setProposalsByDeal] = useState<Record<string, ModelProposal[]>>({});
  const modelTransport = useMemo(() => connection?.channel === "API_ADAPTER" ? createAdapterTransport(connection.endpoint) : undefined, [connection]);
  const connectionDialog = connectionOpen ? <ModelConnectionDialog current={connection} onClose={() => setConnectionOpen(false)} onApply={(next) => {setConnection(next); setConnectionOpen(false);}} /> : null;
  function navigate(next: DealView) { window.history.pushState(null, "", routePath(caseData.caseId, next)); setView(next); window.scrollTo(0, 0); }
  async function chooseDeal(caseId: CaseId) {
    setLoading(true);
    setLoadError(false);
    try { const next = await loadCaseFn(caseId); setCaseData(next); setActiveLocal(false); const destination = view === "deals" ? "overview" : view; window.history.pushState(null, "", routePath(caseId, destination)); setView(destination); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }
  if (loading) return <div className="loading-state" role="status">Opening deal…</div>;
  if (loadError) return <main className="loading-state load-error" role="alert"><div><p className="eyebrow">Deal workspace</p><h1>Deal unavailable</h1><p>The selected deal could not be opened. No data, assumption, or investment decision was changed.</p><button className="secondary-button" type="button" onClick={() => {setLoadError(false); setView("deals"); window.history.pushState(null, "", "#/");}}>Return to Deals</button></div></main>;
  if (intakeOpen) return <DealIntake onCancel={() => setIntakeOpen(false)} onComplete={(result) => {setLocalDeal(result); setIntakeOpen(false); setActiveLocal(true); setView("overview"); window.history.pushState(null, "", "#/v3/local/overview");}} />;
  if (view === "deals") return <><DealList onOpen={chooseDeal} onNew={() => setIntakeOpen(true)} onConnect={() => setConnectionOpen(true)} connection={connection} localDeal={localDeal} onOpenLocal={() => {setActiveLocal(true); setView("overview"); window.history.pushState(null, "", "#/v3/local/overview");}} />{connectionDialog}</>;
  if (activeLocal && localDeal) return <><LocalDealShell result={localDeal} view={view} onNavigate={(next) => {setView(next); window.history.pushState(null, "", `#/v3/local/${next}`); window.scrollTo(0, 0);}} onDeals={() => {setActiveLocal(false); setView("deals"); window.history.pushState(null, "", "#/");}} onConnect={() => setConnectionOpen(true)} connection={connection} modelTransport={modelTransport} proposals={proposalsByDeal.local ?? []} onProposalsChange={(proposals) => setProposalsByDeal((current) => ({...current, local: proposals}))} />{connectionDialog}</>;
  return <><DealShell caseData={caseData} view={view} onNavigate={navigate} onChooseDeal={chooseDeal} onDeals={() => {window.history.pushState(null, "", "#/"); setView("deals");}} onConnect={() => setConnectionOpen(true)} connection={connection} modelTransport={modelTransport} proposals={proposalsByDeal[caseData.caseId] ?? []} onProposalsChange={(proposals) => setProposalsByDeal((current) => ({...current, [caseData.caseId]: proposals}))} />{connectionDialog}</>;
}
