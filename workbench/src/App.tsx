import { useEffect, useMemo, useRef, useState } from "react";
import rawData from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";
import { PEUnderwritingRoom, PEValueCreation } from "./pe";
import { ThesisGraphView } from "./thesis-graph";
import type { Analysis, CaseData, Lineage, Metric, WorkbenchData } from "./types";

const dataCandidate: unknown = rawData;
assertWorkbenchData(dataCandidate);
const data = dataCandidate;
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
  const registered = metric.registry ?? caseData.metricRegistry.find((item) => item.metric_id === metric.metric_id);
  const formula = registered?.formula_id ? caseData.formulaRegistry.find((item) => item.formula_id === registered.formula_id) : undefined;
  const operands = formula?.operand_ids.map((id) => caseData.metricRegistry.find((item) => item.metric_id === id)).filter(Boolean) ?? [];
  const locators = registered?.source_locator_ids.map((id) => caseData.sourceLocators.find((item) => item.locator_id === id)).filter(Boolean) ?? [];
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
      <p className="drawer-detail">{metric.detail}</p>
      {registered && <dl className="method-grid registry-detail"><div><dt>Exact value / quantum</dt><dd>{registered.value} · {registered.quantum} {registered.unit}</dd></div><div><dt>Period / state</dt><dd>{registered.period} · {registered.state}</dd></div><div><dt>Governing receipt</dt><dd><code>{registered.governing_receipt_sha256}</code></dd></div><div><dt>Downstream</dt><dd>{registered.downstream_ids.join(", ") || "No downstream binding"}</dd></div></dl>}
      {formula && <section className="formula-inspection"><span>Formula</span><strong>{formula.formula_id} · {formula.operation}</strong><ol>{operands.map((item) => <li key={item!.metric_id}><code>{item!.metric_id}</code> = {item!.value} {item!.unit}</li>)}</ol></section>}
      {locators.length > 0 && <section className="locator-inspection"><span>Precise source locators</span>{locators.map((item) => <article key={item!.locator_id}><strong>{item!.artifact_path}</strong><code>{item!.locator_kind}: {item!.selector}</code><small>{item!.period} · {item!.retained_excerpt}</small><code>{item!.artifact_sha256}</code></article>)}</section>}
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
          {openMetric ? <button className="distribution-value" aria-label={`Inspect lineage for ${caseData.returnsDistribution.labels[index]} conditional MOIC`} onClick={(event) => openMetric({metric_id: `${caseData.caseId}-distribution-${index}`, label: `${caseData.returnsDistribution.labels[index]} conditional MOIC`, value: `${value.toFixed(2)}x`, detail: "Seeded scenario output, not a forecast", classification: "SCENARIO", lineage: [caseData.distributionLineage]}, event.currentTarget)}>{value.toFixed(2)}x ↗</button> : <strong>{value.toFixed(2)}x</strong>}
        </div>
      ))}
    </figure>
  );
}

function Snapshot({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
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
          <div className="condition-line"><span>{caseData.investmentAdjudication.replaceAll("_", " ")}</span><span>{caseData.workflowDisposition}</span><span>{caseData.decision.status.replaceAll("_", " ")}</span>{caseData.decision.signature_status && <span>{caseData.decision.signature_status.replaceAll("_", " ")}</span>}</div>
          {caseData.decision.as_of && <p className="decision-cutoff">Decision cutoff {caseData.decision.as_of}</p>}
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
      <section className="snapshot-criteria"><article><p className="kicker">Decisive drivers</p><ul>{caseData.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ul></article><article><p className="kicker">Falsifiers</p><ul className="falsifier-list">{falsifiers.map((item) => <li key={item.label}><span>{item.label}<small>{item.observed}</small></span><strong data-status={item.status}>{item.status}</strong></li>)}</ul></article></section>
      <Distribution caseData={caseData} openMetric={openMetric} />
    </div>
  );
}

function ThesisEvidence({caseData}: {caseData: CaseData}) {
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
  return (
    <div className="view-stack">
      <section className="thesis-header"><p className="kicker">Falsifiable thesis</p><h2>{caseData.thesis.statement}</h2><p>{caseData.thesis.counterthesis}</p></section>
      <section className="thesis-grid">
        <article><h3>Value drivers</h3><ol>{caseData.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ol></article>
        <article className="falsifiers"><h3>Kill criteria</h3><ol className="falsifier-list">{falsifiers.map((item) => <li key={item.label}><span>{item.label}<small>{item.observed}</small></span><strong data-status={item.status}>{item.status}</strong></li>)}</ol></article>
        <article><h3>Next diligence requests</h3><ol>{caseData.thesis.requests.map((item) => <li key={item}>{item}</li>)}</ol></article>
      </section>
      <section aria-labelledby="graph-title"><div className="section-heading"><p className="kicker">Machine-readable thesis graph</p><h2 id="graph-title">Evidence → estimate → judgment → action</h2></div><ThesisGraphView graph={caseData.thesisGraph} /><p className="graph-receipt">{caseData.thesisGraph.nodes.length} nodes · {caseData.thesisGraph.edges.length} typed relationships · graph <code>{caseData.thesisGraph.graph_sha256.slice(0, 16)}…</code></p></section>
      {caseData.evidenceMappings && <section aria-labelledby="mapping-title"><div className="section-heading"><p className="kicker">Evidence-to-economics discipline</p><h2 id="mapping-title">What receives model credit—and what does not</h2></div><div className="table-wrap" tabIndex={0}><table><thead><tr><th>Evidence</th><th>Observed</th><th>Mapped target</th><th>Credit class</th><th>Model credit</th><th>Decision response</th></tr></thead><tbody>{caseData.evidenceMappings.map((item) => <tr key={item.mapping_id}><td>{item.source_analysis_id}<small className="cell-receipt">{item.source_receipt_sha256.slice(0, 10)}…</small></td><td>{item.observed_value}</td><td>{item.target_assumption_or_condition}</td><td>{displayClass(item.credit_classification)}</td><td>{item.model_credit}</td><td>{item.decision_response}</td></tr>)}</tbody></table></div></section>}
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
    ? {naive: "Observational offer-scale association", naiveValue: caseData.analyses.find((item) => item.analysis_id === "AG-06")?.outputs.find((item) => item.name === "implied_offer_scale_association")?.value ?? "n/a", adjusted: "Randomized offer ITT", adjustedValue: caseData.analyses.find((item) => item.analysis_id === "AG-07")?.outputs[0]?.value ?? "n/a", unit: "percentage points · same offer scale"}
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

function LegacyUnderwritingRoom({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const [scenarioId, setScenarioId] = useState(caseData.scenarios[0].id);
  useEffect(() => {setScenarioId(caseData.scenarios[0].id);}, [caseData]);
  const scenario = caseData.scenarios.find((item) => item.id === scenarioId) ?? caseData.scenarios[0];
  const scenarioMetric = (item: CaseData["scenarios"][number], field: "entry_ev" | "gross_irr" | "moic" | "covenant", label: string): Metric => ({
    metric_id: `${caseData.caseId}-${item.id}-${field}`,
    label: `${item.label} ${label}`,
    value: item[field],
    detail: field === "covenant"
      ? `Receipt-linked qualitative constraint label for the named ${item.label} scenario.`
      : `Receipt-bound ${label.toLowerCase()} for the named ${item.label} scenario.`,
    classification: "SCENARIO",
    lineage: item.lineage?.length ? item.lineage : [caseData.distributionLineage],
  });
  return (
    <div className="view-stack">
      <section className="underwriting-head"><div><p className="kicker">Scenario book</p><h2>Price, structure, and downside</h2></div><div className="scenario-tabs">{caseData.scenarios.map((item) => <button key={item.id} aria-pressed={item.id === scenarioId} onClick={() => setScenarioId(item.id)}>{item.label}</button>)}</div></section>
      <section className="scenario-focus">
        <button onClick={(event) => openMetric(scenarioMetric(scenario, "entry_ev", "entry value"), event.currentTarget)} aria-label={`Inspect lineage for ${scenario.label} entry value`}><span>Entry</span><strong>{scenario.entry_ev}</strong><small>Inspect ↗</small></button>
        <button onClick={(event) => openMetric(scenarioMetric(scenario, "gross_irr", "gross IRR"), event.currentTarget)} aria-label={`Inspect lineage for ${scenario.label} gross IRR`}><span>Gross IRR</span><strong>{scenario.gross_irr}</strong><small>Inspect ↗</small></button>
        <button onClick={(event) => openMetric(scenarioMetric(scenario, "moic", "MOIC"), event.currentTarget)} aria-label={`Inspect lineage for ${scenario.label} MOIC`}><span>MOIC</span><strong>{scenario.moic}</strong><small>Inspect ↗</small></button>
        <button onClick={(event) => openMetric(scenarioMetric(scenario, "covenant", "binding constraint"), event.currentTarget)} aria-label={`Inspect lineage for ${scenario.label} binding constraint`}><span>Constraint</span><strong>{scenario.covenant}</strong><small>Inspect ↗</small></button>
      </section>
      <aside className="epistemic-note"><strong>VC sensitivity pending v2 engine</strong><span>No display-only approximation is permitted. Helios controls appear only after financing, ownership, and waterfall cells are fully recomputed and receipt-bound.</span></aside>
      <Distribution caseData={caseData} openMetric={openMetric} />
      <section className="table-wrap" tabIndex={0} aria-label="Scrollable scenario table"><table><caption>Named scenarios and binding constraints · select any value for lineage</caption><thead><tr><th>Case</th><th>Entry</th><th>Gross IRR</th><th>MOIC</th><th>Constraint</th></tr></thead><tbody>{caseData.scenarios.map((item) => <tr key={item.id}><th scope="row">{item.label}</th><td><button className="table-lineage" aria-label={`Inspect lineage for ${item.label} entry value`} onClick={(event) => openMetric(scenarioMetric(item, "entry_ev", "entry value"), event.currentTarget)}>{item.entry_ev} ↗</button></td><td><button className="table-lineage" aria-label={`Inspect lineage for ${item.label} gross IRR`} onClick={(event) => openMetric(scenarioMetric(item, "gross_irr", "gross IRR"), event.currentTarget)}>{item.gross_irr} ↗</button></td><td><button className="table-lineage" aria-label={`Inspect lineage for ${item.label} MOIC`} onClick={(event) => openMetric(scenarioMetric(item, "moic", "MOIC"), event.currentTarget)}>{item.moic} ↗</button></td><td><button className="table-lineage" aria-label={`Inspect lineage for ${item.label} binding constraint`} onClick={(event) => openMetric(scenarioMetric(item, "covenant", "binding constraint"), event.currentTarget)}>{item.covenant} ↗</button></td></tr>)}</tbody></table></section>
    </div>
  );
}

function UnderwritingRoom({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  return caseData.peEngine
    ? <PEUnderwritingRoom caseData={caseData} openMetric={openMetric} />
    : <LegacyUnderwritingRoom caseData={caseData} openMetric={openMetric} />;
}

function ValueCreation({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  if (caseData.valueCreationBridge) return <PEValueCreation caseData={caseData} openMetric={openMetric} />;
  return (
    <div className="view-stack">
      <section className="value-head"><p className="kicker">Underwriting to ownership</p><h2>Every initiative earns its place in the value bridge</h2><p>Baselines come from the frozen room. Targets are illustrative human assumptions with named owners, milestones, and failure modes.</p></section>
      <section className="initiative-list">{caseData.valueCreation.map((item, index) => <article key={item.initiative}><span className="initiative-number">0{index + 1}</span><div className="initiative-title"><h3>{item.initiative}</h3><p>{item.owner}</p><button className="text-link" onClick={(event) => openMetric({metric_id: `${caseData.caseId}-initiative-${index}`, label: `${item.initiative} baseline`, value: item.baseline, detail: `Evidence-bound baseline. Target ${item.target} is an illustrative HUMAN_JUDGMENT assumption; ${item.value}.`, classification: "DESCRIPTIVE", lineage: item.lineage}, event.currentTarget)}>Inspect baseline evidence ↗</button></div><dl><div><dt>KPI</dt><dd>{item.kpi}</dd></div><div><dt>Baseline → target</dt><dd>{item.baseline} → <span className="human-assumption">{item.target} · human assumption</span></dd></div><div><dt>Milestone</dt><dd>{item.milestone}</dd></div><div><dt>Value bridge</dt><dd>{item.value}</dd></div><div><dt>Principal risk</dt><dd>{item.risk}</dd></div></dl></article>)}</section>
    </div>
  );
}

export default function App() {
  const [caseId, setCaseId] = useState(data.cases[0]?.caseId ?? "");
  const [view, setView] = useState<View>("IC Snapshot");
  const [drawerMetric, setDrawerMetric] = useState<Metric | null>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const initializedRef = useRef(false);
  const caseData = useMemo(() => data.cases.find((item) => item.caseId === caseId) ?? data.cases[0], [caseId]);
  const openRegisteredMetric = (metric: Metric, trigger: HTMLElement) => {
    const registry = caseData.metricRegistry.find((item) => item.metric_id === metric.metric_id);
    setDrawerTrigger(trigger);
    setDrawerMetric(registry ? {...metric, value: registry.display_value, classification: registry.classification, registry} : metric);
  };
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (typeof workspaceRef.current?.scrollIntoView === "function") {
      workspaceRef.current.scrollIntoView({block: "start"});
    }
    workspaceRef.current?.focus({preventScroll: true});
  }, [view, caseId]);
  if (!caseData) return <main>Workbench data unavailable.</main>;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to analysis</a>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">UIL</span><div><strong>Underwriting Intelligence Lab</strong><small>Evidence → economics → action</small></div></div>
        <div className="case-switch" aria-label="Select investment case">{data.cases.map((item) => <button key={item.caseId} aria-pressed={item.caseId === caseId} onClick={() => {setCaseId(item.caseId); setView("IC Snapshot");}}><span>{item.caseType}</span>{item.company}</button>)}</div>
        <div className="local-state"><span className="status-dot" />Local synthetic build · founder review pending</div>
      </header>
      <div className="case-masthead">
        <div><p className="kicker">{caseData.caseType} · illustrative case</p><h1>{caseData.company}</h1></div>
        <p className="synthetic-banner">{caseData.disclosure}</p>
      </div>
      <nav className="view-nav" aria-label="Workbench views">{views.map((item, index) => <button key={item} aria-current={view === item ? "page" : undefined} onClick={() => setView(item)}><span>0{index + 1}</span>{item}</button>)}</nav>
      <main id="workspace" tabIndex={-1} ref={workspaceRef}>
        {view === "IC Snapshot" && <Snapshot caseData={caseData} openMetric={openRegisteredMetric} />}
        {view === "Thesis & Evidence" && <ThesisEvidence caseData={caseData} />}
        {view === "Econometric Lab" && <EconometricLab caseData={caseData} />}
        {view === "Underwriting Room" && <UnderwritingRoom caseData={caseData} openMetric={openRegisteredMetric} />}
        {view === "Value Creation" && <ValueCreation caseData={caseData} openMetric={openRegisteredMetric} />}
      </main>
      <footer><span>Local synthetic reference implementation</span><span>Manifest <code>{caseData.manifest_sha256.slice(0, 16)}…</code></span><span>No runtime model, network, or investment authority</span></footer>
      {drawerMetric && <EvidenceDrawer caseData={caseData} metric={drawerMetric} onClose={() => {setDrawerMetric(null); requestAnimationFrame(() => drawerTrigger?.focus());}} />}
    </div>
  );
}
