import {useState} from "react";
import {dealViews, type DealView} from "./App";
import {processDealPackage, type IntakeResult, type QuickAnalysis} from "./intake";

const labels: Record<DealView, string> = {overview: "Overview", financials: "Financials", diligence: "Diligence", documents: "Documents", memo: "IC Memo"};
function money(cents: number) { return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 1, notation: "compact"}).format(cents / 100); }
function stateLabel(state: string) { return state.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }

export function DealIntake({onCancel, onComplete}: {onCancel: () => void; onComplete: (result: IntakeResult) => void}) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [processing, setProcessing] = useState(false);

  async function validate() {
    setProcessing(true);
    try { setResult(await processDealPackage(files)); }
    finally { setProcessing(false); }
  }

  return (
    <main className="intake-page" id="main-content">
      <button className="back-button" type="button" onClick={onCancel}>← Deals</button>
      <header className="page-heading intake-heading">
        <div><p className="eyebrow">New deal</p><h1>Growth SaaS Quick Package</h1><p>Create one in-memory deal from the supported four-file contract.</p></div>
        <span className="quiet-chip">Browser local</span>
      </header>
      <section className="local-processing-note" aria-label="Local processing boundary">
        <strong>Your selected bytes stay in this browser tab.</strong>
        <p>No file or file content is persisted, uploaded, or sent to the optional model route. Refresh clears the deal.</p>
      </section>
      <div className="intake-layout">
        <section className="panel" aria-labelledby="choose-package-heading">
          <div className="section-heading"><div><p className="eyebrow">Step 1</p><h2 id="choose-package-heading">Choose the declared files</h2></div><span>12 MB maximum</span></div>
          <label className="file-picker">
            <span>Choose package files</span>
            <input data-testid="deal-package-input" type="file" multiple accept=".json,.csv,.pdf,.docx,.pptx,.xlsx,.txt" onChange={(event) => {setFiles(Array.from(event.target.files ?? [])); setResult(null);}} />
            <strong>{files.length ? `${files.length} files selected` : "Select manifest, deal, monthly financials, and customer ARR"}</strong>
          </label>
          {files.length ? <ul className="selected-files">{files.map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><span>{file.size.toLocaleString()} bytes</span></li>)}</ul> : null}
          <button className="primary-button validate-package" type="button" disabled={!files.length || processing} onClick={validate}>{processing ? "Validating locally…" : "Validate and analyze"}</button>
          <details className="sample-downloads"><summary>Download the included example</summary><p>Download all four files, then select them together above.</p><div><a download href="sample-package/manifest.json">Manifest</a><a download href="sample-package/deal.json">Deal</a><a download href="sample-package/monthly_financials.csv">Monthly financials</a><a download href="sample-package/customer_arr.csv">Customer ARR</a></div></details>
        </section>
        <aside className="panel package-contract" aria-labelledby="package-contract-heading">
          <p className="eyebrow">Supported contract</p><h2 id="package-contract-heading">What this slice reads</h2>
          <ol><li><strong>Manifest</strong><span>Roles, required state, byte counts, and file digests.</span></li><li><strong>Deal</strong><span>Cash, financing, scenario assumptions, thresholds, and owner.</span></li><li><strong>Monthly financials</strong><span>Revenue, cost of revenue, and operating expense in integer cents.</span></li><li><strong>Customer ARR</strong><span>Fixed-cohort retention in integer cents.</span></li></ol>
          <p>Supporting files are listed but never silently parsed. The full Python engine remains the route for debt, preferences, dilution, econometrics, and complete lineage.</p>
        </aside>
      </div>
      {result ? (
        <section className={`panel intake-result ${result.packageState === "READY" ? "result-ready" : "result-incomplete"}`} aria-labelledby="package-result-heading" aria-live="polite">
          <div className="section-heading"><div><p className="eyebrow">Package result</p><h2 id="package-result-heading">{result.posture}</h2></div><span className={`status status-${result.packageState.toLowerCase()}`}>{stateLabel(result.packageState)}</span></div>
          <p>{result.rationale}</p>
          <div className="table-wrap"><table><thead><tr><th>Input</th><th>State</th><th>Validation</th><th>Rows</th></tr></thead><tbody>{result.files.map((file, index) => <tr key={`${file.name}-${index}`}><td>{file.name}</td><td><span className={`status status-${file.state.toLowerCase()}`}>{stateLabel(file.state)}</span></td><td>{file.detail}{file.mappings?.length ? <ul className="mapping-list">{file.mappings.map((mapping) => <li key={`${mapping.from}-${mapping.to}`}>{mapping.from} → {mapping.to}</li>)}</ul> : null}</td><td>{file.rows ?? "—"}</td></tr>)}</tbody></table></div>
          {result.errors.length ? <div className="error-summary"><strong>Resolve before a decision surface is available</strong><ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
          {result.packageState === "READY" ? <button className="primary-button" type="button" onClick={() => onComplete(result)}>Open decision review</button> : null}
        </section>
      ) : null}
    </main>
  );
}

function LocalDecisionTests({analysis}: {analysis: QuickAnalysis}) {
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">Declared policy</p><h2>Decision tests</h2></div><span>{analysis.tests.filter((test) => test.status === "MISSES").length} misses</span></div><div className="table-wrap"><table><thead><tr><th>Test</th><th>Observed</th><th>Required</th><th>Result</th></tr></thead><tbody>{analysis.tests.map((test) => <tr key={test.label}><td>{test.label}</td><td>{test.observed}</td><td>{test.required}</td><td><span className={`status status-${test.status.toLowerCase()}`}>{stateLabel(test.status)}</span></td></tr>)}</tbody></table></div></section>;
}

function LocalOverview({result}: {result: IntakeResult}) {
  const analysis = result.analysis!;
  return <div className="view-stack"><section className="decision-panel"><div className="decision-copy"><p className="eyebrow">Analytical posture</p><h2>{result.posture}</h2><p>{result.rationale}</p></div><div className="approval-state"><span>IC approval</span><strong>Not requested</strong><span>Quick Package only</span></div></section><section className="first-read-grid"><article><p className="eyebrow">Return scenario</p><h3>{analysis.grossMoic.toFixed(2)}x</h3><p>Gross multiple · {`${(analysis.annualizedGrossReturn * 100).toFixed(1)}%`} annualized</p></article><article><p className="eyebrow">Operating quality</p><h3>{(analysis.ordinaryNrr * 100).toFixed(1)}% NRR</h3><p>Fixed ordinary cohort from uploaded customer ARR.</p></article><article><p className="eyebrow">Financing risk</p><h3>{analysis.runwayMonths === null ? "Cash generative" : `${analysis.runwayMonths.toFixed(1)} months`}</h3><p>Cash divided by recent positive net burn.</p></article></section><LocalDecisionTests analysis={analysis} /><aside className="local-data-note"><strong>Analytical posture only.</strong> This is not an investment recommendation, approval, or full-fidelity underwriting result.</aside></div>;
}

function LocalFinancials({result}: {result: IntakeResult}) {
  const analysis = result.analysis!;
  return <div className="view-stack"><section className="metric-grid">{analysis.metrics.map((metric) => <article className="metric-card" key={metric.id}><span>{metric.label}</span><strong>{metric.display}</strong><p>{metric.meaning}</p></article>)}</section><section className="panel"><div className="section-heading"><div><p className="eyebrow">Declared scenario</p><h2>Exit and ownership bridge</h2></div></div><div className="table-wrap"><table><tbody><tr><th>LTM revenue</th><td>{money(analysis.ltmRevenueCents)}</td></tr><tr><th>Terminal revenue scenario</th><td>{money(analysis.terminalRevenueCents)}</td></tr><tr><th>Exit equity scenario</th><td>{money(analysis.exitEquityCents)}</td></tr><tr><th>Post-money ownership</th><td>{(analysis.postMoneyOwnership * 100).toFixed(1)}%</td></tr><tr><th>Gross multiple</th><td>{analysis.grossMoic.toFixed(2)}x</td></tr><tr><th>Annualized gross return</th><td>{(analysis.annualizedGrossReturn * 100).toFixed(1)}%</td></tr></tbody></table></div><details className="method-disclosure"><summary>View calculation limits</summary><p>No debt, preferences, option-pool refresh, later-round dilution, fees, taxes, econometrics, or stochastic paths are modeled in the Quick Package.</p></details></section></div>;
}

function LocalDiligence({result}: {result: IntakeResult}) {
  const analysis = result.analysis!; const misses = analysis.tests.filter((test) => test.status === "MISSES");
  return <div className="view-stack"><section className="panel"><div className="section-heading"><div><p className="eyebrow">Package worklist</p><h2>{misses.length ? `${misses.length} declared tests need attention` : "No declared threshold miss"}</h2></div><span>Quick Package</span></div>{misses.length ? <div className="issue-list">{misses.map((test) => <article key={test.label}><div><span className="status status-misses">Misses</span><span>blocking</span></div><h3>{test.label}</h3><p>{test.observed}; required {test.required.toLowerCase()}.</p><footer><span>Owner</span><strong>{result.deal!.analystOwner}</strong></footer></article>)}</div> : <p>All three declared thresholds clear. Document quality, customer contracts, revenue recognition, and financing terms still require full diligence.</p>}</section><section className="panel proposal-tray"><div className="section-heading"><div><p className="eyebrow">Review tray</p><h2>Model proposals</h2></div><span>0 proposed</span></div><p>Model review is unavailable. Deterministic package analysis remains functional.</p></section></div>;
}

function LocalDocuments({result}: {result: IntakeResult}) {
  return <div className="view-stack"><section className="panel"><div className="section-heading"><div><p className="eyebrow">Local package</p><h2>Package status</h2></div><span>In memory only</span></div><div className="document-list">{result.files.map((file, index) => <article key={`${file.name}-${index}`}><div><h3>{file.name.replaceAll("_", " ").replace(/\.[^.]+$/, "")}</h3><p>{file.detail}</p>{file.mappings?.length ? <ul className="mapping-list">{file.mappings.map((mapping) => <li key={`${mapping.from}-${mapping.to}`}>{mapping.from} → {mapping.to}</li>)}</ul> : null}</div><span className={`status status-${file.state.toLowerCase()}`}>{stateLabel(file.state)}</span></article>)}</div></section><aside className="local-data-note"><strong>No persistence.</strong> Refreshing this tab clears the selected file objects and computed deal.</aside></div>;
}

function LocalMemo({result}: {result: IntakeResult}) {
  const analysis = result.analysis!;
  return <div className="memo-page"><section className="memo-sheet"><header><div><span>Investment committee draft</span><h2>{result.deal!.company}</h2><p>Does the supported package clear its declared return and runway thresholds?</p></div><span className="quiet-chip">Browser-local</span></header><article><span className="source-tag">Engine</span><h3>Analytical posture</h3><p>{result.rationale}</p></article><article><span className="source-tag">Engine</span><h3>Economics</h3><p>LTM revenue {money(analysis.ltmRevenueCents)} · gross margin {(analysis.grossMargin * 100).toFixed(1)}% · ordinary-cohort NRR {(analysis.ordinaryNrr * 100).toFixed(1)}% · gross multiple {analysis.grossMoic.toFixed(2)}x.</p></article><article><span className="source-tag">Analyst</span><h3>Required follow-up</h3><p>Run the full retained underwriting engine and complete document, commercial, legal, financing, and accounting diligence before any committee approval.</p></article><footer>Draft only · Quick Package · Not investment advice · No model-authored recommendation</footer></section><div className="memo-actions"><button className="primary-button" type="button" onClick={() => window.print()}>Print IC memo</button></div></div>;
}

export function LocalDealShell({result, view, onNavigate, onDeals}: {result: IntakeResult; view: DealView; onNavigate: (view: DealView) => void; onDeals: () => void}) {
  const deal = result.deal!;
  return <div className="product-shell"><aside className="sidebar"><button type="button" className="wordmark" onClick={onDeals}><span>UD</span><strong>Underwriting Desk</strong></button><nav aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={item === view ? "active" : ""} aria-current={item === view ? "page" : undefined} onClick={() => onNavigate(item)}>{labels[item]}</button>)}</nav><div className="sidebar-foot"><span className="quiet-chip">Browser local</span><p>Refresh clears this deal.</p></div></aside><div className="shell-main"><header className="deal-topbar"><button type="button" className="mobile-wordmark" onClick={onDeals}>Underwriting Desk</button><strong>{deal.company}</strong><div className="topbar-meta"><span>Growth SaaS Quick Package</span><span>{deal.cutoff}</span></div></header><nav className="mobile-nav" aria-label="Deal navigation">{dealViews.map((item) => <button key={item} type="button" className={item === view ? "active" : ""} aria-current={item === view ? "page" : undefined} onClick={() => onNavigate(item)}>{labels[item]}</button>)}</nav><main className="deal-main" id="main-content"><header className="deal-heading"><div><p className="eyebrow">{labels[view]}</p><h1>{deal.company}</h1><p>Browser-local supported package · analyst owner: {deal.analystOwner}</p></div><p className="ic-question"><span>IC question</span>Does the package clear its declared return and runway thresholds?</p></header>{view === "overview" ? <LocalOverview result={result} /> : null}{view === "financials" ? <LocalFinancials result={result} /> : null}{view === "diligence" ? <LocalDiligence result={result} /> : null}{view === "documents" ? <LocalDocuments result={result} /> : null}{view === "memo" ? <LocalMemo result={result} /> : null}</main></div></div>;
}
