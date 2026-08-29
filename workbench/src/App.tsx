import { useEffect, useMemo, useRef, useState } from "react";
import rawData from "./data/cases.json";
import type { Analysis, CaseData, Lineage, Metric, WorkbenchData } from "./types";

const data = rawData as WorkbenchData;
const views = ["IC Snapshot", "Thesis & Evidence", "Econometric Lab", "Underwriting Room", "Value Creation"] as const;
type View = (typeof views)[number];

const displayClass = (value: string) => value.toLowerCase().replaceAll("_", " ");

function EvidenceDrawer({caseData, metric, onClose}: {caseData: CaseData; metric: Metric; onClose: () => void}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    return () => {
      if (dialog && typeof dialog.close === "function") dialog.close();
      else dialog?.removeAttribute("open");
    };
  }, []);
  const nodes = metric.lineage.map((id) => caseData.lineage.find((item) => item.node_id === id)).filter(Boolean) as Lineage[];
  return (
    <dialog ref={dialogRef} className="drawer" aria-labelledby="drawer-title" onCancel={onClose}>
      <div className="drawer-head">
        <div>
          <p className="kicker">Number lineage</p>
          <h2 id="drawer-title">{metric.label}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close lineage">×</button>
      </div>
      <p className="drawer-value">{metric.value}</p>
      <p className="method-tag">{displayClass(metric.classification)}</p>
      <ol className="lineage-flow">
        {nodes.map((node) => {
          const artifact = caseData.artifacts.find((item) => item.artifact_id === node.artifact_id);
          const analysis = caseData.analyses.find((item) => item.analysis_id === node.analysis_id);
          return (
            <li key={node.node_id}>
              <span>Retained data</span>
              <strong>{artifact?.path ?? node.artifact_id}</strong>
              <small>{node.field}</small>
              <code>{artifact?.sha256.slice(0, 16)}…</code>
              <span>Transformation</span>
              <strong>{node.transformation}</strong>
              <small>Bound outputs: {node.output_names.join(", ")}</small>
              <span>Method</span>
              <strong>{analysis?.analysis_id} · {analysis?.method}</strong>
              <small>{analysis?.state} · {analysis?.cutoff}</small>
              <small>Assumptions: {analysis?.assumptions.join(" ")}</small>
              <span>Downstream impact</span>
              <strong>{node.downstream}</strong>
            </li>
          );
        })}
      </ol>
      <p className="receipt-line">Case analysis receipt <code>{caseData.analysis_sha256.slice(0, 24)}…</code></p>
    </dialog>
  );
}

function Distribution({caseData, openMetric}: {caseData: CaseData; openMetric?: (metric: Metric, trigger: HTMLElement) => void}) {
  const values = caseData.returnsDistribution.moic.map(Number);
  const maximum = Math.max(...values, 1);
  return (
    <figure className="distribution" aria-label="Return distribution">
      <figcaption>Conditional return distribution <span>Scenario inputs, not a forecast</span></figcaption>
      {values.map((value, index) => (
        <div className="distribution-row" key={caseData.returnsDistribution.labels[index]}>
          <span>{caseData.returnsDistribution.labels[index]}</span>
          <div className="bar-track"><div className="bar" style={{width: `${Math.max(3, (value / maximum) * 100)}%`}} /></div>
          {openMetric ? <button className="distribution-value" onClick={(event) => openMetric({metric_id: `${caseData.caseId}-distribution-${index}`, label: `${caseData.returnsDistribution.labels[index]} conditional MOIC`, value: `${value.toFixed(2)}x`, detail: "Seeded scenario output, not a forecast", classification: "SCENARIO", lineage: [caseData.distributionLineage]}, event.currentTarget)}>{value.toFixed(2)}x ↗</button> : <strong>{value.toFixed(2)}x</strong>}
        </div>
      ))}
    </figure>
  );
}

function Snapshot({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  return (
    <div className="view-stack">
      <section className="decision-strip" aria-labelledby="decision-title">
        <div className="decision-call">
          <p className="kicker">Illustrative IC decision</p>
          <h2 id="decision-title">{caseData.decision.decision}</h2>
          <p>{caseData.decision.attribution}</p>
        </div>
        <div className="decision-rationale">
          <p>{caseData.decision.rationale}</p>
          <div className="condition-line"><span>{caseData.investmentAdjudication.replaceAll("_", " ")}</span><span>{caseData.workflowDisposition}</span><span>{caseData.decision.status.replaceAll("_", " ")}</span></div>
          <ul className="condition-list">{caseData.decision.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
        </div>
      </section>
      <section aria-labelledby="metrics-title">
        <div className="section-heading"><p className="kicker">Decision economics</p><h2 id="metrics-title">What must be true</h2></div>
        <div className="metric-ledger">
          {caseData.summaryMetrics.map((metric, index) => (
            <button key={metric.metric_id} className="metric-row" onClick={(event) => openMetric(metric, event.currentTarget)} aria-label={`Inspect lineage for ${metric.label}`}>
              <span className="metric-index">0{index + 1}</span>
              <span className="metric-label">{metric.label}<small>{displayClass(metric.classification)}</small></span>
              <strong>{metric.value}</strong>
              <span className="metric-detail">{metric.detail}</span>
              <span className="inspect">Inspect ↗</span>
            </button>
          ))}
        </div>
      </section>
      <section className="two-column thesis-preview">
        <article><p className="kicker">Thesis</p><h2>{caseData.thesis.statement}</h2></article>
        <article className="counter"><p className="kicker">Counterthesis</p><p>{caseData.thesis.counterthesis}</p></article>
      </section>
      <section className="snapshot-criteria"><article><p className="kicker">Decisive drivers</p><ul>{caseData.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ul></article><article><p className="kicker">Falsifiers</p><ul>{caseData.thesis.falsifiers.map((item) => <li key={item}>{item}</li>)}</ul></article></section>
      <Distribution caseData={caseData} openMetric={openMetric} />
    </div>
  );
}

function ThesisEvidence({caseData}: {caseData: CaseData}) {
  const graphColumns = [
    {title: "Evidence + assumptions", kinds: ["EVIDENCE", "ASSUMPTION"]},
    {title: "Estimates + scenarios", kinds: ["ESTIMATE", "SCENARIO", "FALSIFIER"]},
    {title: "Decision + action", kinds: ["DECISION", "INITIATIVE"]},
  ];
  return (
    <div className="view-stack">
      <section className="thesis-header"><p className="kicker">Falsifiable thesis</p><h2>{caseData.thesis.statement}</h2><p>{caseData.thesis.counterthesis}</p></section>
      <section className="thesis-grid">
        <article><h3>Value drivers</h3><ol>{caseData.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ol></article>
        <article className="falsifiers"><h3>Kill criteria</h3><ol>{caseData.thesis.falsifiers.map((item) => <li key={item}>{item}</li>)}</ol></article>
        <article><h3>Next diligence requests</h3><ol>{caseData.thesis.requests.map((item) => <li key={item}>{item}</li>)}</ol></article>
      </section>
      <section aria-labelledby="graph-title"><div className="section-heading"><p className="kicker">Machine-readable thesis graph</p><h2 id="graph-title">Evidence → estimate → judgment → action</h2></div><div className="thesis-graph">{graphColumns.map((column) => <article key={column.title}><h3>{column.title}</h3>{caseData.thesisGraph.nodes.filter((node) => column.kinds.includes(node.kind)).slice(0, 10).map((node) => <div className={`graph-node ${node.kind.toLowerCase()}`} key={node.node_id}><span>{node.kind}</span><strong>{node.label}</strong><small>{node.status}</small></div>)}</article>)}</div><p className="graph-receipt">{caseData.thesisGraph.edges.length} typed relationships · graph <code>{caseData.thesisGraph.graph_sha256.slice(0, 16)}…</code></p></section>
      <section aria-labelledby="evidence-title">
        <div className="section-heading"><p className="kicker">Content-addressed room</p><h2 id="evidence-title">Evidence register</h2></div>
        <div className="table-wrap" tabIndex={0} aria-label="Scrollable evidence register"><table><thead><tr><th>Artifact</th><th>Contract</th><th>Rows</th><th>Digest</th></tr></thead><tbody>
          {caseData.artifacts.map((artifact) => <tr key={artifact.artifact_id}><td>{artifact.path}</td><td>{artifact.schema}</td><td>{artifact.rows.toLocaleString()}</td><td><code>{artifact.sha256.slice(0, 12)}…</code></td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  );
}

function AnalysisDetail({analysis}: {analysis: Analysis}) {
  return (
    <article className="analysis-detail">
      <div className="analysis-title"><div><p className="kicker">{analysis.analysis_id}</p><h3>{analysis.question}</h3></div><span className={`state ${analysis.state.toLowerCase()}`}>{analysis.state}</span></div>
      <dl className="method-grid"><div><dt>Estimand / outputs</dt><dd>{analysis.outputs.length ? analysis.outputs.map((item) => `${item.name}: ${item.value} ${item.unit}`).join(" · ") : "No estimate — abstention retained"}</dd></div><div><dt>Method</dt><dd>{analysis.method}</dd></div><div><dt>Population</dt><dd>{analysis.population}</dd></div><div><dt>Classification / cutoff</dt><dd>{displayClass(analysis.classification)} · {analysis.cutoff}</dd></div></dl>
      <div className="diagnostics"><h4>Diagnostics</h4>{analysis.diagnostics.map((diagnostic) => <div key={diagnostic.name}><span>{diagnostic.name.replaceAll("_", " ")}</span><strong>{diagnostic.value}</strong><em data-status={diagnostic.status}>{diagnostic.status}</em></div>)}</div>
      <p className="assumption">{analysis.assumptions.join(" ")}</p>
    </article>
  );
}

function EconometricLab({caseData}: {caseData: CaseData}) {
  const identified = caseData.analyses.filter((item) => item.classification === "CAUSAL_SYNTHETIC_ONLY");
  const associative = caseData.analyses.filter((item) => item.classification === "PREDICTIVE_ASSOCIATION" || item.classification === "NOT_IDENTIFIED");
  const [mode, setMode] = useState<"identified" | "naive">("identified");
  const visible = mode === "identified" ? identified : associative;
  const paired = caseData.caseId === "atlasgrid"
    ? {naive: "Realized-price slope", naiveValue: caseData.analyses.find((item) => item.analysis_id === "AG-06")?.outputs[0]?.value ?? "n/a", adjusted: "Randomized offer ITT", adjustedValue: caseData.analyses.find((item) => item.analysis_id === "AG-07")?.outputs[0]?.value ?? "n/a", unit: "percentage points"}
    : {naive: "Pooled NRR", naiveValue: caseData.analyses.find((item) => item.analysis_id === "HX-02")?.outputs[0]?.value ?? "n/a", adjusted: "Ordinary-cohort NRR", adjustedValue: caseData.analyses.find((item) => item.analysis_id === "HX-02")?.outputs[1]?.value ?? "n/a", unit: "percent"};
  return (
    <div className="view-stack">
      <section className="econ-intro"><div><p className="kicker">Identification before inference</p><h2>What the design can—and cannot—establish</h2></div><div className="segmented" aria-label="Analysis comparison"><button aria-pressed={mode === "naive"} onClick={() => setMode("naive")}>Association / abstention</button><button aria-pressed={mode === "identified"} onClick={() => setMode("identified")}>Identified synthetic effect</button></div></section>
      <aside className="epistemic-note"><strong>Synthetic causal boundary</strong><span>Identified effects recover a planted assignment mechanism. They are not real-company causal claims.</span></aside>
      <section className="paired-estimate" aria-label="Naive versus adjusted comparison"><article><span>{paired.naive}</span><strong>{paired.naiveValue}</strong><small>{paired.unit} · selection exposed</small></article><div aria-hidden="true">→</div><article><span>{paired.adjusted}</span><strong>{paired.adjustedValue}</strong><small>{paired.unit} · design-aligned comparison</small></article></section>
      <section className="analysis-list">{visible.length ? visible.map((analysis) => <AnalysisDetail key={analysis.analysis_id} analysis={analysis} />) : <p>No analysis in this class.</p>}</section>
      <section className="classification-key"><h3>Method classes</h3>{["ACCOUNTING_IDENTITY", "DESCRIPTIVE", "PREDICTIVE_ASSOCIATION", "CAUSAL_SYNTHETIC_ONLY", "SCENARIO", "NOT_IDENTIFIED"].map((item) => <span key={item}>{displayClass(item)}</span>)}</section>
    </div>
  );
}

function UnderwritingRoom({caseData}: {caseData: CaseData}) {
  const [scenarioId, setScenarioId] = useState(caseData.scenarios[0].id);
  const [sensitivity, setSensitivity] = useState(0);
  useEffect(() => {setScenarioId(caseData.scenarios[0].id); setSensitivity(0);}, [caseData]);
  const scenario = caseData.scenarios.find((item) => item.id === scenarioId) ?? caseData.scenarios[0];
  const parsedMoic = Number.parseFloat(scenario.moic);
  const sensitized = Number.isFinite(parsedMoic) ? parsedMoic * (1 + sensitivity / 100) : null;
  return (
    <div className="view-stack">
      <section className="underwriting-head"><div><p className="kicker">Scenario book</p><h2>Price, structure, and downside</h2></div><div className="scenario-tabs">{caseData.scenarios.map((item) => <button key={item.id} aria-pressed={item.id === scenarioId} onClick={() => setScenarioId(item.id)}>{item.label}</button>)}</div></section>
      <section className="scenario-focus">
        <div><span>Entry</span><strong>{scenario.entry_ev}</strong></div><div><span>Gross IRR</span><strong>{scenario.gross_irr}</strong></div><div><span>MOIC</span><strong>{scenario.moic}</strong></div><div><span>Constraint</span><strong>{scenario.covenant}</strong></div>
      </section>
      <section className="sensitivity-panel">
        <div><p className="kicker">One-factor sensitivity</p><h3>Proportional exit-value stress</h3><p>This transparent approximation scales scenario MOIC only. It does not recompute debt, preferences, dilution, covenants, or the retained receipt.</p></div>
        <div className="slider-block"><label htmlFor="sensitivity">Proportional stress: <strong>{sensitivity > 0 ? "+" : ""}{sensitivity}%</strong></label><input id="sensitivity" type="range" min="-20" max="20" step="5" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} /><output htmlFor="sensitivity" aria-live="polite">{sensitized === null ? "not applicable" : `${sensitized.toFixed(2)}x illustrative stressed MOIC`}</output></div>
      </section>
      <Distribution caseData={caseData} />
      <section className="table-wrap" tabIndex={0} aria-label="Scrollable scenario table"><table><caption>Named scenarios and binding constraints</caption><thead><tr><th>Case</th><th>Entry</th><th>Gross IRR</th><th>MOIC</th><th>Constraint</th></tr></thead><tbody>{caseData.scenarios.map((item) => <tr key={item.id}><td>{item.label}</td><td>{item.entry_ev}</td><td>{item.gross_irr}</td><td>{item.moic}</td><td>{item.covenant}</td></tr>)}</tbody></table></section>
    </div>
  );
}

function ValueCreation({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  return (
    <div className="view-stack">
      <section className="value-head"><p className="kicker">Underwriting to ownership</p><h2>Every initiative earns its place in the value bridge</h2><p>Baselines come from the frozen room. Targets are illustrative human assumptions with named owners, milestones, and failure modes.</p></section>
      <section className="initiative-list">{caseData.valueCreation.map((item, index) => <article key={item.initiative}><span className="initiative-number">0{index + 1}</span><div className="initiative-title"><h3>{item.initiative}</h3><p>{item.owner}</p><button className="text-link" onClick={(event) => openMetric({metric_id: `${caseData.caseId}-initiative-${index}`, label: `${item.initiative} baseline`, value: item.baseline, detail: `${item.target} target · ${item.value}`, classification: "HUMAN_JUDGMENT", lineage: item.lineage}, event.currentTarget)}>Inspect evidence ↗</button></div><dl><div><dt>KPI</dt><dd>{item.kpi}</dd></div><div><dt>Baseline → target</dt><dd>{item.baseline} → {item.target}</dd></div><div><dt>Milestone</dt><dd>{item.milestone}</dd></div><div><dt>Value bridge</dt><dd>{item.value}</dd></div><div><dt>Principal risk</dt><dd>{item.risk}</dd></div></dl></article>)}</section>
    </div>
  );
}

export default function App() {
  const [caseId, setCaseId] = useState(data.cases[0]?.caseId ?? "");
  const [view, setView] = useState<View>("IC Snapshot");
  const [drawerMetric, setDrawerMetric] = useState<Metric | null>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const caseData = useMemo(() => data.cases.find((item) => item.caseId === caseId) ?? data.cases[0], [caseId]);
  if (!caseData) return <main>Workbench data unavailable.</main>;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to analysis</a>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">UIL</span><div><strong>Underwriting Intelligence Lab</strong><small>Evidence → economics → action</small></div></div>
        <div className="case-switch" aria-label="Select investment case">{data.cases.map((item) => <button key={item.caseId} aria-pressed={item.caseId === caseId} onClick={() => {setCaseId(item.caseId); setView("IC Snapshot");}}><span>{item.caseType}</span>{item.company}</button>)}</div>
        <div className="local-state"><span className="status-dot" />Local candidate · verification pending</div>
      </header>
      <div className="case-masthead">
        <div><p className="kicker">{caseData.caseType} · illustrative case</p><h1>{caseData.company}</h1></div>
        <p className="synthetic-banner">{caseData.disclosure}</p>
      </div>
      <nav className="view-nav" aria-label="Workbench views">{views.map((item, index) => <button key={item} aria-current={view === item ? "page" : undefined} onClick={() => setView(item)}><span>0{index + 1}</span>{item}</button>)}</nav>
      <main id="workspace" tabIndex={-1}>
        {view === "IC Snapshot" && <Snapshot caseData={caseData} openMetric={(metric, trigger) => {setDrawerTrigger(trigger); setDrawerMetric(metric);}} />}
        {view === "Thesis & Evidence" && <ThesisEvidence caseData={caseData} />}
        {view === "Econometric Lab" && <EconometricLab caseData={caseData} />}
        {view === "Underwriting Room" && <UnderwritingRoom caseData={caseData} />}
        {view === "Value Creation" && <ValueCreation caseData={caseData} openMetric={(metric, trigger) => {setDrawerTrigger(trigger); setDrawerMetric(metric);}} />}
      </main>
      <footer><span>Local synthetic reference implementation</span><span>Manifest <code>{caseData.manifest_sha256.slice(0, 16)}…</code></span><span>No runtime model, network, or investment authority</span></footer>
      {drawerMetric && <EvidenceDrawer caseData={caseData} metric={drawerMetric} onClose={() => {setDrawerMetric(null); requestAnimationFrame(() => drawerTrigger?.focus());}} />}
    </div>
  );
}
