import { useEffect, useMemo, useRef, useState } from "react";
import {assertWorkbenchData} from "./data-contract";
import {ChartRegistryCaption} from "./chart-registry";
import { PESnapshotTerms, PEUnderwritingRoom, PEValueCreation } from "./pe";
import { VCSnapshotTerms, VCUnderwritingRoom, VCValueCreation } from "./vc";
import { ThesisGraphView } from "./thesis-graph";
import {ValuePlanDetails} from "./value-plan";
import type { Analysis, CaseData, Lineage, Metric, WorkbenchData } from "./types";

const rawData = (await import("./data/cases.json")).default;

const dataCandidate: unknown = rawData;
assertWorkbenchData(dataCandidate);
const data = dataCandidate;
const views = ["IC Snapshot", "Thesis & Evidence", "Econometric Lab", "Underwriting Room", "Value Creation"] as const;
type View = (typeof views)[number];
type RouteControls = {scenario?: string | null; driver?: string | null; cell?: string | null};
const viewSlugs: Record<View, string> = {"IC Snapshot": "snapshot", "Thesis & Evidence": "evidence", "Econometric Lab": "econometrics", "Underwriting Room": "underwriting", "Value Creation": "value-creation"};
const slugViews = Object.fromEntries(Object.entries(viewSlugs).map(([view, slug]) => [slug, view])) as Record<string, View>;

function parseRoute() {
  if (typeof window === "undefined") return {caseId: data.cases[0]?.caseId ?? "", view: "IC Snapshot" as View, metricId: null as string | null, controls: {} as RouteControls};
  const [path, query = ""] = window.location.hash.replace(/^#/, "").split("?");
  const match = path.match(/^\/v2\/([^/]+)\/([^/]+)$/);
  const routeCase = match && data.cases.some((item) => item.caseId === match[1]) ? match[1] : data.cases[0]?.caseId ?? "";
  const routeView = match && slugViews[match[2]] ? slugViews[match[2]] : "IC Snapshot";
  const params = new URLSearchParams(query);
  return {caseId: routeCase, view: routeView, metricId: params.get("metric"), controls: {scenario: params.get("scenario"), driver: params.get("driver"), cell: params.get("cell")}};
}

function makeRoute(caseId: string, view: View, metricId?: string | null, controls: RouteControls = {}) {
  const params = new URLSearchParams();
  if (metricId) params.set("metric", metricId);
  if (controls.scenario) params.set("scenario", controls.scenario);
  if (controls.driver) params.set("driver", controls.driver);
  if (controls.cell) params.set("cell", controls.cell);
  return `#/v2/${caseId}/${viewSlugs[view]}${params.size ? `?${params}` : ""}`;
}

type ReaderBrief = {
  posture: string;
  postureSummary: string;
  driver: {title: string; evidence: string; consequence: string; metricId: string};
  lossCase: {title: string; evidence: string; consequence: string};
  blocker: {title: string; owner: string; consequence: string};
  runway?: {title: string; evidence: string; consequence: string};
};

const asPercent = (value: string) => `${(Number(value) * 100).toFixed(2)}%`;
const asMultiple = (value: string) => `${Number(value).toFixed(2)}x`;
const asMoney = (cents: number) => `$${(cents / 100_000_000).toLocaleString(undefined, {maximumFractionDigits: 1})}M`;

function buildReaderBrief(caseData: CaseData): ReaderBrief | null {
  const request = (id: string) => caseData.thesis.requests.find((item) => typeof item !== "string" && item.request_id === id);
  const summary = (id: string) => caseData.summaryMetrics.find((item) => item.metric_id === id);
  if (caseData.caseId === "atlasgrid" && caseData.peEngine) {
    const ebitda = summary("ag-ebitda-metric")!;
    const concentration = summary("ag-conc-metric")!;
    const gate = request("AG-D04")!;
    return {
      posture: caseData.decision.decision,
      postureSummary: `Analytical posture only — ${caseData.workflowDisposition} remains in force until ${caseData.decision.open_conditions} open conditions and human approval are resolved.`,
      driver: {
        title: "Definitions reduce earnings and concentration quality",
        evidence: `${ebitda.label} is ${ebitda.value} (${ebitda.detail}); ${concentration.label.toLowerCase()} is ${concentration.value} (${concentration.detail}).`,
        consequence: `The ${asMoney(caseData.peEngine.ask.engine_inputs.transaction.entry_enterprise_value_cents as number)} seller ask produces ${asPercent(caseData.peEngine.ask.gross_xirr)} gross XIRR and misses the 22% hurdle; the selected ${asMoney(caseData.peEngine.selected.engine_inputs.transaction.entry_enterprise_value_cents as number)} structure produces ${asPercent(caseData.peEngine.selected.gross_xirr)}.`,
        metricId: ebitda.metric_id,
      },
      lossCase: {
        title: "Churn plus multiple compression breaks the return case",
        evidence: `The modeled downside exits at ${caseData.peEngine.downside.engine_inputs.transaction.exit_multiple as string}x under weaker retention and operating performance.`,
        consequence: `Gross XIRR falls to ${asPercent(caseData.peEngine.downside.gross_xirr)} and gross MOIC to ${asMultiple(caseData.peEngine.downside.gross_moic)} despite no modeled early covenant breach.`,
      },
      blocker: {
        title: gate.request,
        owner: `${gate.owner} · ${gate.materiality} · ${gate.due_state.replaceAll("_", " ").toLowerCase()}`,
        consequence: gate.decision_consequence,
      },
    };
  }
  if (caseData.caseId === "helios" && caseData.vcEngine) {
    const nrr = summary("hx-nrr-metric")!;
    const margin = summary("hx-margin-metric")!;
    const currentRunway = summary("hx-runway-metric")!;
    const fundedRunway = caseData.decision.metric_pairs?.find((item) => item.metric_id === "helios-hx-03-post_close_runway_floor");
    const gate = request("HX-D03")!;
    const firstClose = caseData.vcEngine.base.financing_events.find((item) => item.event_type === "PRIMARY");
    const milestoneTranche = caseData.vcEngine.milestone.financing_events.find((item) => item.event_type === "MILESTONE" && item.status === "FUNDED");
    return {
      posture: `CONDITIONAL ${caseData.decision.decision}`,
      postureSummary: `Analytical posture only — ${caseData.workflowDisposition} remains in force and the conditional tranche stays gated across ${caseData.decision.open_conditions} open conditions.`,
      driver: {
        title: "Retention and margin support a milestone structure—not an unconditional check",
        evidence: `${nrr.label} is ${nrr.value} (${nrr.detail}); ${margin.label.toLowerCase()} is ${margin.value}.`,
        consequence: `${asMoney(firstClose?.new_money_cents ?? 0)} closes first and ${asMoney(milestoneTranche?.new_money_cents ?? 0)} funds only after the milestone tests; the funded case produces ${asPercent(caseData.vcEngine.milestone.gross_xirr)} gross XIRR and ${asMultiple(caseData.vcEngine.milestone.gross_moic)} gross MOIC.`,
        metricId: nrr.metric_id,
      },
      lossCase: {
        title: "Down-round dilution and weaker exit economics compress the outcome",
        evidence: "The retained downside reruns financing events, dilution, cash, preferences, and dated investor cash flows.",
        consequence: `Gross XIRR falls to ${asPercent(caseData.vcEngine.downside.gross_xirr)} and gross MOIC to ${asMultiple(caseData.vcEngine.downside.gross_moic)}, below the declared 30% / 3.0x hurdles.`,
      },
      blocker: {
        title: gate.request,
        owner: `${gate.owner} · ${gate.materiality} · ${gate.due_state.replaceAll("_", " ").toLowerCase()}`,
        consequence: gate.decision_consequence,
      },
      runway: {
        title: "Runway uses three different bases",
        evidence: `${currentRunway.value} is current pre-close runway. ${fundedRunway?.observed ?? "Funded runway not available"} is the post-close funded modeled floor, right-censored at the projection ceiling.`,
        consequence: `If contingent financing does not fund, the retained shortfall case first exhausts cash in month ${caseData.vcEngine.financing_shortfall.first_cash_exhaustion_month_without_contingent_financing}.`,
      },
    };
  }
  return null;
}

const displayClass = (value: string) => value.toLowerCase().replaceAll("_", " ");

const outputDisplay = (value: string, unit: string) => {
  const labels: Record<string, string> = {
    percentage_points: "pp",
    percentage_points_per_price_point: "pp / price pp",
    price_percentage_points: "price pp",
    log_points: "log points",
    modeled_months_funded_minimum: "modeled months minimum",
  };
  if (unit === "percent") return `${value}%`;
  if (unit === "multiple") return `${value}x`;
  if (unit === "months") return `${value} mo`;
  if (unit === "million_usd") return `$${value}M`;
  if (unit === "cents") return `$${(Number(value) / 100_000_000).toLocaleString(undefined, {maximumFractionDigits: 2})}M`;
  if (unit === "modeled_months_funded_minimum") return `≥${value} modeled months`;
  if (unit === "log_points") return `${value} log points · ${((Math.exp(Number(value)) - 1) * 100).toFixed(1)}% multiplicative`;
  return labels[unit] ? `${value} ${labels[unit]}` : `${value} ${unit.replaceAll("_", " ")}`;
};

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
  const downstream = [...new Set(nodes.map((node) => node.downstream).filter(Boolean))];
  const readableLabels: Record<string, string> = {
    kind: "Source record",
    json_values: "Matched source values",
    property: "Source field",
    class_id: "Security class",
    event_id: "Financing event",
    holder_id: "Holder",
    issued_shares_after: "Issued shares after financing",
    issued_shares_before: "Issued shares before financing",
    new_shares: "New shares issued",
    cash_at_cutoff_cents: "Cash at the analysis cutoff",
    new_money_cents: "New capital",
  };
  const readableLabel = (value: string) => readableLabels[value] ?? value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
  const readablePointer = (value: string) => value
    .split("/")
    .filter(Boolean)
    .map((part) => /^\d+$/.test(part) ? `record ${Number(part) + 1}` : readableLabel(part).toLowerCase())
    .join(" → ");
  const readableValue = (value: unknown, key = ""): string => {
    if (value === null || value === undefined) return "Not reported";
    if (typeof value === "number" && key.endsWith("_cents")) return asMoney(value);
    if ((typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)))
      && /(rate|margin|ownership|discount)$/.test(key) && Math.abs(Number(value)) <= 1) return `${(Number(value) * 100).toFixed(1)}%`;
    if (typeof value === "string" && key === "property" && value.startsWith("/")) return readablePointer(value);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).replaceAll("_", " ");
    if (Array.isArray(value)) return value.map((item) => readableValue(item, key)).join(" · ");
    return Object.entries(value as Record<string, unknown>).map(([nestedKey, item]) => `${readableLabel(nestedKey)}: ${readableValue(item, nestedKey)}`).join(" · ");
  };
  const businessDownstream = metric.metric_id === "helios-MILESTONE-event-series-c-close-new-money"
    ? "Funds the initial operating runway and establishes first-close Series C ownership; it does not authorize the conditional tranche."
    : metric.metric_id === "helios-MILESTONE-event-series-c-tranche-new-money"
      ? "Adds runway, shares, and Series C preference only after every retained milestone test clears."
      : downstream.join(" ") || registered?.downstream_ids.join(", ") || "No downstream investment use is declared; treat as context only.";
  return (
    <dialog ref={dialogRef} className="drawer" aria-labelledby="drawer-title" onCancel={onClose}>
      <div className="drawer-head">
        <div>
          <p className="kicker">Number lineage</p>
          <h2 id="drawer-title">{metric.label}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close lineage">×</button>
      </div>
      <section className="lineage-summary" data-layer="summary" aria-label="Business meaning">
        <div className="lineage-value"><p className="drawer-value">{metric.value}</p><p className="method-tag">{displayClass(metric.classification)}</p></div>
        <p className="drawer-detail">{metric.detail}</p>
        <dl>
          <div><dt>Definition and period</dt><dd>{registered?.label ?? metric.label}{registered ? ` · ${registered.period}` : ""}</dd></div>
          <div><dt>What it changes</dt><dd>{businessDownstream}</dd></div>
          <div><dt>Evidence class</dt><dd>{displayClass(registered?.classification ?? metric.classification)}{registered ? ` · ${registered.state.toLowerCase()}` : ""}</dd></div>
        </dl>
      </section>
      <details className="lineage-layer" data-layer="calculation">
        <summary><span>02</span><strong>Calculation and decision chain</strong><small>Formula, operands, transformations, and downstream use</small></summary>
        <div className="lineage-layer-body">
          {formula ? <section className="formula-inspection"><span>Formula</span><strong>{formula.operation.replaceAll("_", " ")}</strong><ol>{operands.map((item) => <li key={item!.metric_id}><span>{item!.label}</span><strong>{item!.display_value}</strong><small>{item!.period} · {displayClass(item!.classification)}</small></li>)}</ol></section> : <p className="layer-empty">Direct observed or scenario value; no separate formula registry entry is required.</p>}
          <ol className="lineage-flow">{nodes.map((node) => {const analysis = caseData.analyses.find((item) => item.analysis_id === node.analysis_id); return <li key={node.node_id}><span>Source field</span><strong>{node.label}</strong><small>{node.field}</small><span>Transformation</span><strong>{node.transformation}</strong><small>{analysis?.method}</small><span>Decision use</span><strong>{node.downstream}</strong></li>;})}</ol>
        </div>
      </details>
      <details className="lineage-layer" data-layer="evidence">
        <summary><span>03</span><strong>Readable source evidence</strong><small>{locators.length} granular retained {locators.length === 1 ? "locator" : "locators"}</small></summary>
        <div className="lineage-layer-body locator-inspection">{locators.length ? locators.map((item) => <article key={item!.locator_id}><div><strong>{item!.artifact_path}</strong><small>{item!.period} · retained synthetic selection</small></div><dl className="excerpt-grid">{Object.entries(item!.retained_excerpt).map(([key, value]) => <div key={key}><dt>{readableLabel(key)}</dt><dd>{readableValue(value, key)}</dd></div>)}</dl><a href={item!.published_path} target="_blank" rel="noreferrer">Open complete committed synthetic source ↗</a></article>) : <p className="layer-empty">No granular locator is registered for this value.</p>}</div>
      </details>
      <details className="lineage-layer audit-layer" data-layer="audit">
        <summary><span>04</span><strong>Audit metadata</strong><small>Raw values, machine identifiers, selectors, and receipts</small></summary>
        <div className="lineage-layer-body">
          {registered && <dl className="method-grid registry-detail"><div><dt>Raw value / quantum</dt><dd>{registered.value} · {registered.quantum} {registered.unit}</dd></div><div><dt>Metric ID</dt><dd><code>{registered.metric_id}</code></dd></div><div><dt>Governing receipt</dt><dd><code>{registered.governing_receipt_sha256}</code></dd></div><div><dt>Downstream IDs</dt><dd>{registered.downstream_ids.join(", ") || "None"}</dd></div></dl>}
          {formula && <p className="receipt-line">Formula <code>{formula.formula_id}</code> · <code>{formula.formula_sha256}</code></p>}
          {locators.map((item) => <article className="raw-locator" key={item!.locator_id}><code>{item!.locator_kind}: {JSON.stringify(item!.selector)}</code><pre>{JSON.stringify(item!.retained_excerpt, null, 2)}</pre><code>artifact {item!.artifact_sha256}</code><code>selection {item!.selection_sha256}</code></article>)}
          <p className="receipt-line">Case analysis receipt <code>{caseData.analysis_sha256}</code></p>
        </div>
      </details>
    </dialog>
  );
}

function Distribution({caseData, openMetric}: {caseData: CaseData; openMetric?: (metric: Metric, trigger: HTMLElement) => void}) {
  const values = caseData.returnsDistribution.moic.map(Number);
  const maximum = Math.max(...values, 1);
  return (
    <figure className="distribution" aria-label="Return distribution">
      <figcaption>Conditional return distribution <span>Scenario inputs, not a forecast</span></figcaption>
      {caseData.vcEngine?.distribution.template_weights ? <p className="distribution-priors" aria-label="Scenario state prior weights">State priors · {Object.entries(caseData.vcEngine.distribution.template_weights).map(([key, value]) => `${key.replaceAll("_", " ").toLowerCase()} ${(Number(value) * 100).toFixed(0)}%`).join(" · ")}</p> : null}
      {values.map((value, index) => (
        <div className="distribution-row" key={caseData.returnsDistribution.labels[index]}>
          <span>{caseData.returnsDistribution.labels[index]}</span>
          <div className="bar-track"><div className="bar" style={{width: `${Math.max(3, (value / maximum) * 100)}%`}} /></div>
          {openMetric ? <button className="distribution-value" data-metric-id={caseData.caseId === "helios" ? `helios-distribution-moic-${index}` : `${caseData.caseId}-distribution-${index}`} aria-label={`Inspect lineage for ${caseData.returnsDistribution.labels[index]} conditional MOIC`} onClick={(event) => openMetric({metric_id: caseData.caseId === "helios" ? `helios-distribution-moic-${index}` : `${caseData.caseId}-distribution-${index}`, label: `${caseData.returnsDistribution.labels[index]} conditional MOIC`, value: `${value.toFixed(2)}x`, detail: "Seeded scenario output, not a forecast", classification: "SCENARIO", lineage: [caseData.distributionLineage]}, event.currentTarget)}>{value.toFixed(2)}x ↗</button> : <strong>{value.toFixed(2)}x</strong>}
        </div>
      ))}
    </figure>
  );
}

function HurdleLedger({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const pairs = caseData.decision.metric_pairs ?? [];
  if (!pairs.length) return null;
  const metricFor = (pair: NonNullable<CaseData["decision"]["metric_pairs"]>[number]): Metric => {
    const registry = caseData.metricRegistry.find((item) => item.metric_id === pair.metric_id);
    const analysisIds = new Set(registry?.source_locator_ids
      .map((id) => caseData.sourceLocators.find((item) => item.locator_id === id)?.analysis_id)
      .filter(Boolean));
    return {
      metric_id: pair.metric_id,
      label: pair.metric,
      value: pair.observed,
      detail: `Observed ${pair.observed} versus the predeclared ${pair.threshold} threshold. ${pair.status} is a quantitative test state, not investment approval.`,
      classification: registry?.classification ?? "SCENARIO",
      lineage: caseData.lineage.filter((item) => analysisIds.has(item.analysis_id)).map((item) => item.node_id),
      registry,
    };
  };
  return <section className="hurdle-ledger" aria-labelledby="hurdle-ledger-title">
    <div className="hurdle-ledger-head"><div><p className="kicker">Predeclared decision tests</p><h2 id="hurdle-ledger-title">The numbers can clear while the deal remains on hold</h2></div><p>Each threshold is machine-tested against the retained scenario. Clearance does not resolve diligence gates, authorize a tranche, or substitute for a signed human decision.</p></div>
    <div className="hurdle-ledger-rows">{pairs.map((pair) => {const metric = metricFor(pair); return <button key={pair.metric_id} data-metric-id={pair.metric_id} onClick={(event) => openMetric(metric, event.currentTarget)} aria-label={`Inspect decision test for ${pair.metric}`}><span>{pair.metric}</span><strong>{pair.observed}</strong><small>Test {pair.threshold}</small><em data-status={pair.status}>{pair.status}</em><b>Inspect ↗</b></button>;})}</div>
    {caseData.decision.failure_consequences?.length ? <footer><strong>If any required test or gate fails</strong><span>{caseData.decision.failure_consequences.join(" · ")}</span></footer> : null}
  </section>;
}

function Snapshot({caseData, openMetric, onNavigate}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void; onNavigate: (view: View) => void}) {
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
  const readerBrief = buildReaderBrief(caseData);
  const driverMetric = readerBrief ? caseData.summaryMetrics.find((metric) => metric.metric_id === readerBrief.driver.metricId) : undefined;
  return (
    <div className="view-stack">
      <section className={`decision-strip ${caseData.vcEngine ? "vc-decision-strip" : ""}`} aria-labelledby="decision-title">
        <div className="decision-call">
          <p className="kicker">Analytical posture · not approved</p>
          <h2 id="decision-title">{readerBrief?.posture ?? (caseData.vcEngine ? "CONDITIONAL INVEST" : caseData.decision.decision)}</h2>
          <p>{readerBrief?.postureSummary ?? caseData.decision.attribution}</p>
          <small className="decision-attribution">Proposed by {caseData.decision.attribution} · unsigned</small>
        </div>
        <div className="decision-rationale">
          <div className="authority-head"><p className="kicker">Advancement gate</p><strong>NOT CLEARED</strong></div>
          <div className="authority-grid" aria-label="Authority and workflow state">
            <div><span>Workflow</span><strong>{caseData.workflowDisposition}</strong><small>Case may not advance</small></div>
            <div><span>Human authority</span><strong>{caseData.investmentAdjudication.replaceAll("_", " ")}</strong><small>No investment approval</small></div>
            <div><span>Decision record</span><strong>{caseData.decision.signature_status?.replaceAll("_", " ") ?? caseData.decision.status.replaceAll("_", " ")}</strong><small>{caseData.decision.open_conditions} open conditions</small></div>
          </div>
          {caseData.decision.as_of && <p className="decision-cutoff">Decision cutoff {caseData.decision.as_of}</p>}
        </div>
        <div className="snapshot-term-row">
          {caseData.peEngine && <PESnapshotTerms caseData={caseData} openMetric={openMetric} />}
          {caseData.vcEngine && <VCSnapshotTerms caseData={caseData} openMetric={openMetric} />}
        </div>
      </section>
      {readerBrief && <section className="first-read" aria-labelledby="first-read-title">
        <div className="first-read-heading"><p className="kicker">60-second IC read</p><h2 id="first-read-title">Why the posture is not yet a decision</h2></div>
        <div className={`first-read-grid ${readerBrief.runway ? "four-up" : ""}`}>
          <article className="driver-card"><span>01 · Decisive evidence</span><h3>{readerBrief.driver.title}</h3><p>{readerBrief.driver.evidence}</p><strong>{readerBrief.driver.consequence}</strong>{driverMetric && <button onClick={(event) => openMetric(driverMetric, event.currentTarget)}>Inspect decisive evidence ↗</button>}</article>
          <article className="loss-card"><span>02 · How the deal loses money</span><h3>{readerBrief.lossCase.title}</h3><p>{readerBrief.lossCase.evidence}</p><strong>{readerBrief.lossCase.consequence}</strong></article>
          <article className="blocker-card"><span>03 · Blocking gate</span><h3>{readerBrief.blocker.title}</h3><p>{readerBrief.blocker.owner}</p><strong>{readerBrief.blocker.consequence}</strong><button onClick={() => onNavigate("Thesis & Evidence")}>Open diligence register →</button></article>
          {readerBrief.runway && <article className="runway-card"><span>04 · Timing basis</span><h3>{readerBrief.runway.title}</h3><p>{readerBrief.runway.evidence}</p><strong>{readerBrief.runway.consequence}</strong><button onClick={() => onNavigate("Underwriting Room")}>Open cash schedule →</button></article>}
        </div>
      </section>}
      <HurdleLedger caseData={caseData} openMetric={openMetric} />
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
      <ChartRegistryCaption caseData={caseData} location="IC Snapshot" />
      <Distribution caseData={caseData} openMetric={openMetric} />
    </div>
  );
}

type DealRoomKind = "ALL" | "SOURCE" | "FINDING" | "ANALYSIS" | "REQUEST";
type DealRoomItem = {id: string; kind: Exclude<DealRoomKind, "ALL">; title: string; detail: string; meta: string; href?: string; metric?: Metric};

function DealRoomIndex({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DealRoomKind>("ALL");
  const items = useMemo<DealRoomItem[]>(() => {
    const sources = caseData.artifacts.map((artifact) => ({id: `source-${artifact.artifact_id}`, kind: "SOURCE" as const, title: artifact.path, detail: `${artifact.schema} · ${artifact.rows.toLocaleString()} retained rows`, meta: "Synthetic source · content addressed", href: caseData.sourceLocators.find((item) => item.artifact_id === artifact.artifact_id)?.published_path}));
    const findings = caseData.summaryMetrics.map((metric) => ({id: `finding-${metric.metric_id}`, kind: "FINDING" as const, title: metric.label, detail: `${metric.value} · ${metric.detail}`, meta: `${displayClass(metric.classification)} · decision-facing`, metric}));
    const analyses = caseData.analyses.map((analysis) => ({id: `analysis-${analysis.analysis_id}`, kind: "ANALYSIS" as const, title: `${analysis.analysis_id} · ${analysis.question}`, detail: analysis.method, meta: `${displayClass(analysis.classification)} · ${analysis.state} · ${analysis.cutoff}`}));
    const requests = caseData.thesis.requests.map((item) => ({id: `request-${item.request_id}`, kind: "REQUEST" as const, title: item.request, detail: item.decision_consequence, meta: `${item.owner} · ${item.materiality} · ${item.due_state.replaceAll("_", " ")}`}));
    return [...sources, ...findings, ...analyses, ...requests];
  }, [caseData]);
  const filtered = items.filter((item) => {
    if (kind !== "ALL" && item.kind !== kind) return false;
    const haystack = `${item.kind} ${item.title} ${item.detail} ${item.meta}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  return <section className="deal-room" aria-labelledby="deal-room-title">
    <div className="deal-room-head"><div><p className="kicker">Navigable deal room</p><h2 id="deal-room-title">Find the fact, owner, analysis, or open gate</h2><p>Search the retained synthetic room by business meaning. Machine receipts stay one layer deeper.</p></div><dl><div><dt>Sources</dt><dd>{caseData.artifacts.length}</dd></div><div><dt>Analyses</dt><dd>{caseData.analyses.length}</dd></div><div><dt>Open requests</dt><dd>{caseData.thesis.requests.length}</dd></div></dl></div>
    <div className="deal-room-controls"><label><span>Search room</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try covenant, pipeline, margin, owner…" /></label><div className="deal-room-filters" aria-label="Filter deal room by record type">{(["ALL", "SOURCE", "FINDING", "ANALYSIS", "REQUEST"] as DealRoomKind[]).map((item) => <button key={item} aria-pressed={kind === item} onClick={() => setKind(item)}>{item.toLowerCase()}</button>)}</div></div>
    <p className="deal-room-count" role="status">{filtered.length} of {items.length} records</p>
    <div className="deal-room-results" aria-label="Deal room search results">{filtered.map((item) => <article key={item.id} data-kind={item.kind}><div><span>{item.kind}</span><small>{item.meta}</small></div><h3>{item.title}</h3><p>{item.detail}</p>{item.metric ? <button onClick={(event) => openMetric(item.metric!, event.currentTarget)}>Inspect finding evidence ↗</button> : item.href ? <a href={item.href} target="_blank" rel="noreferrer">Open complete source ↗</a> : null}</article>)}</div>
  </section>;
}

function ThesisEvidence({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
  const diligenceRequests = caseData.thesis.requests.map((item, index) => typeof item === "string" ? {request_id: `${caseData.caseId}-legacy-${index}`, request: item, owner: "Not assigned", due_state: "OPEN", materiality: "HIGH" as const, decision_consequence: "Retain HOLD until adjudicated."} : item);
  return (
    <div className="view-stack">
      <section className="thesis-header"><p className="kicker">Falsifiable thesis</p><h2>{caseData.thesis.statement}</h2><p>{caseData.thesis.counterthesis}</p></section>
      <DealRoomIndex caseData={caseData} openMetric={openMetric} />
      <section className="thesis-grid">
        <article><h3>Value drivers</h3><ol>{caseData.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ol></article>
        <article className="falsifiers"><h3>Kill criteria</h3><ol className="falsifier-list">{falsifiers.map((item) => <li key={item.label}><span>{item.label}<small>{item.observed}</small></span><strong data-status={item.status}>{item.status}</strong></li>)}</ol></article>
        <article><h3>Next diligence requests</h3><ol>{diligenceRequests.map((item) => <li key={item.request_id}>{item.request}</li>)}</ol></article>
      </section>
      <section aria-labelledby="diligence-title"><div className="section-heading"><p className="kicker">Open-gate register</p><h2 id="diligence-title">Diligence requests and decision consequences</h2></div><div className="diligence-register">{diligenceRequests.map((item) => <article key={item.request_id} data-materiality={item.materiality}><div><span>{item.request_id}</span><strong>{item.materiality}</strong></div><h3>{item.request}</h3><dl><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Due state</dt><dd>{item.due_state.replaceAll("_", " ")}</dd></div><div><dt>If unresolved</dt><dd>{item.decision_consequence}</dd></div></dl></article>)}</div></section>
      <section aria-labelledby="team-title"><div className="section-heading"><p className="kicker">Role-specific judgment · synthetic room only</p><h2 id="team-title">Team capability, gaps, and required capacity</h2></div><div className="team-assessment"><article><h3>Observable strengths</h3><ul>{caseData.teamAssessment.strengths.map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>Unproven capabilities</h3><ul>{caseData.teamAssessment.unproven.map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>Key-person risk</h3><p>{caseData.teamAssessment.key_person_risk}</p></article><article><h3>Required hires / capacity</h3><ul>{caseData.teamAssessment.required_hires.map((item) => <li key={item}>{item}</li>)}</ul></article></div></section>
      <section aria-labelledby="graph-title"><div className="section-heading"><p className="kicker">Machine-readable thesis graph</p><h2 id="graph-title">Evidence → estimate → judgment → action</h2></div><ChartRegistryCaption caseData={caseData} location="Thesis & Evidence" /><ThesisGraphView graph={caseData.thesisGraph} /><p className="graph-receipt">{caseData.thesisGraph.nodes.length} nodes · {caseData.thesisGraph.edges.length} typed relationships · graph <code>{caseData.thesisGraph.graph_sha256.slice(0, 16)}…</code></p></section>
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

function analysisOutputMetric(caseData: CaseData, analysis: Analysis, output: Analysis["outputs"][number]): Metric {
  const metricId = `${caseData.caseId}-${analysis.analysis_id.toLowerCase()}-${output.name}`;
  const registry = caseData.metricRegistry.find((item) => item.metric_id === metricId);
  return {metric_id: metricId, label: `${analysis.analysis_id} · ${output.name.replaceAll("_", " ")}`, value: outputDisplay(output.value, output.unit), detail: `${analysis.question} Population: ${analysis.population}.`, classification: registry?.classification ?? analysis.classification, lineage: caseData.lineage.filter((item) => item.analysis_id === analysis.analysis_id && item.output_names.includes(output.name)).map((item) => item.node_id), registry};
}

function analysisCredit(caseData: CaseData, analysis: Analysis) {
  const mapping = caseData.evidenceMappings?.find((item) => item.source_analysis_id === analysis.analysis_id);
  const downstream = caseData.lineage.filter((item) => item.analysis_id === analysis.analysis_id).map((item) => item.downstream).join(" ");
  if (mapping) {
    const label = mapping.credit_classification.includes("ZERO") ? "ZERO CREDIT" : mapping.credit_classification.includes("SCENARIO") ? "SCENARIO ONLY" : "BASE-CASE CREDIT · BOUNDED";
    return {label, target: mapping.target_assumption_or_condition, consequence: `${mapping.model_credit}. ${mapping.decision_response}.`};
  }
  if (analysis.classification === "CAUSAL_SYNTHETIC_ONLY") return {label: "SCENARIO ONLY", target: downstream || "No downstream use registered", consequence: "Credit is limited to the tested synthetic population; adoption, transferability, and valuation remain scenario judgments."};
  return {label: "ZERO CREDIT", target: downstream || "No operating or transaction assumption", consequence: "No base-case causal credit is permitted; retain the result as an association, falsifier, or abstention only."};
}

function AnalysisDetail({caseData, analysis, openMetric}: {caseData: CaseData; analysis: Analysis; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const credit = analysisCredit(caseData, analysis);
  return (
    <article className="analysis-detail">
      <div className="analysis-title"><div><p className="kicker">{analysis.analysis_id}</p><h3>{analysis.question}</h3></div><span className={`state ${analysis.state.toLowerCase()}`}>{analysis.state}</span></div>
      <dl className="method-grid"><div><dt>Estimand / outputs</dt><dd className="analysis-output-list">{analysis.outputs.length ? analysis.outputs.map((output) => {const metric = analysisOutputMetric(caseData, analysis, output); return <button key={output.name} data-metric-id={metric.metric_id} onClick={(event) => openMetric(metric, event.currentTarget)} aria-label={`Inspect lineage for ${metric.label}`}><span>{output.name.replaceAll("_", " ")}</span><strong>{metric.value}</strong><small>Inspect ↗</small></button>;}) : "No estimate — abstention retained"}</dd></div><div><dt>Method</dt><dd>{analysis.method}</dd></div><div><dt>Population</dt><dd>{analysis.population}</dd></div><div><dt>Classification / cutoff</dt><dd>{displayClass(analysis.classification)} · {analysis.cutoff}</dd></div></dl>
      <section className="analysis-credit" data-credit={credit.label.replaceAll(" ", "_")}><div><span>Investment model treatment</span><strong>{credit.label}</strong></div><dl><div><dt>Affected assumption / condition</dt><dd>{credit.target}</dd></div><div><dt>Economic or decision consequence</dt><dd>{credit.consequence}</dd></div></dl></section>
      <div className="diagnostics"><h4>Diagnostics</h4>{analysis.diagnostics.map((diagnostic) => <div key={diagnostic.name}><span>{diagnostic.name.replaceAll("_", " ")}</span><strong>{diagnostic.value}</strong><em data-status={diagnostic.status}>{diagnostic.status}</em></div>)}</div>
      <p className="assumption">{analysis.assumptions.join(" ")}</p>
    </article>
  );
}

function EconometricLab({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const identified = caseData.analyses.filter((item) => item.classification === "CAUSAL_SYNTHETIC_ONLY");
  const associative = caseData.analyses.filter((item) => item.classification === "PREDICTIVE_ASSOCIATION" || item.classification === "NOT_IDENTIFIED");
  const [mode, setMode] = useState<"identified" | "naive">("identified");
  const visible = mode === "identified" ? identified : associative;
  const paired = caseData.caseId === "atlasgrid"
    ? {naive: "Observational offer-scale association", naiveAnalysis: "AG-06", naiveOutput: "implied_offer_scale_association", adjusted: "Randomized offer ITT", adjustedAnalysis: "AG-07", adjustedOutput: "renewal_itt", unit: "percentage points · same offer scale", naiveNote: "selection exposed", adjustedNote: "design-aligned comparison"}
    : {naive: "Precommitted unadjusted randomized ITT", naiveAnalysis: "HX-06", naiveOutput: "optimizer_ate", adjusted: "Baseline-adjusted precision companion", adjustedAnalysis: "HX-06", adjustedOutput: "optimizer_baseline_adjusted_companion", unit: "log points · same randomized population", naiveNote: "approximately the log change in unit cost; primary recovery and economic mapping", adjustedNote: "companion only; receives no separate credit"};
  const pairMetric = (analysisId: string, outputName: string) => {const analysis = caseData.analyses.find((item) => item.analysis_id === analysisId); const output = analysis?.outputs.find((item) => item.name === outputName); return analysis && output ? analysisOutputMetric(caseData, analysis, output) : null;};
  const naiveMetric = pairMetric(paired.naiveAnalysis, paired.naiveOutput);
  const adjustedMetric = pairMetric(paired.adjustedAnalysis, paired.adjustedOutput);
  return (
    <div className="view-stack">
      <section className="econ-intro"><div><p className="kicker">Identification before inference</p><h2>What the design can—and cannot—establish</h2></div><div className="segmented" aria-label="Analysis comparison"><button aria-pressed={mode === "naive"} onClick={() => setMode("naive")}>Association / abstention</button><button aria-pressed={mode === "identified"} onClick={() => setMode("identified")}>Identified synthetic effect</button></div></section>
      <aside className="epistemic-note"><strong>Synthetic causal boundary</strong><span>Identified effects recover a planted assignment mechanism. They are not real-company causal claims.</span></aside>
      <section className="paired-estimate" aria-label="Naive versus adjusted comparison"><article><span>{paired.naive}</span>{naiveMetric ? <button data-metric-id={naiveMetric.metric_id} onClick={(event) => openMetric(naiveMetric, event.currentTarget)} aria-label={`Inspect lineage for ${paired.naive}`}><strong>{naiveMetric.value}</strong><em>Inspect ↗</em></button> : <strong>n/a</strong>}<small>{paired.unit} · {paired.naiveNote}</small></article><div aria-hidden="true">→</div><article><span>{paired.adjusted}</span>{adjustedMetric ? <button data-metric-id={adjustedMetric.metric_id} onClick={(event) => openMetric(adjustedMetric, event.currentTarget)} aria-label={`Inspect lineage for ${paired.adjusted}`}><strong>{adjustedMetric.value}</strong><em>Inspect ↗</em></button> : <strong>n/a</strong>}<small>{paired.unit} · {paired.adjustedNote}</small></article></section>
      <section className="analysis-list">{visible.length ? visible.map((analysis) => <AnalysisDetail key={analysis.analysis_id} caseData={caseData} analysis={analysis} openMetric={openMetric} />) : <p>No analysis in this class.</p>}</section>
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

function UnderwritingRoom({caseData, openMetric, routeState, onRouteState}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void; routeState: RouteControls; onRouteState: (state: RouteControls) => void}) {
  if (caseData.peEngine) return <PEUnderwritingRoom caseData={caseData} openMetric={openMetric} routeState={routeState} onRouteState={onRouteState} />;
  if (caseData.vcEngine) return <VCUnderwritingRoom caseData={caseData} openMetric={openMetric} routeState={routeState} onRouteState={onRouteState} />;
  return <LegacyUnderwritingRoom caseData={caseData} openMetric={openMetric} />;
}

function ValueCreation({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  if (caseData.valueCreationBridge) return <PEValueCreation caseData={caseData} openMetric={openMetric} />;
  if (caseData.vcEngine) return <VCValueCreation caseData={caseData} openMetric={openMetric} />;
  return (
    <div className="view-stack">
      <section className="value-head"><p className="kicker">Underwriting to ownership</p><h2>Every initiative earns its place in the value bridge</h2><p>Baselines come from the frozen room. Targets are illustrative human assumptions with named owners, milestones, and failure modes.</p></section>
      <ValuePlanDetails caseData={caseData} openMetric={openMetric} />
      <section aria-labelledby="cadence-title"><div className="section-heading"><p className="kicker">Pre-close to board control</p><h2 id="cadence-title">Ownership cadence</h2></div><div className="ownership-cadence">{caseData.ownershipCadence.map((item) => <article key={item.phase}><span>{item.phase}</span><small>{item.timing}</small><h3>{item.milestone}</h3><dl><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Board KPI</dt><dd>{item.kpi}</dd></div><div><dt>Stop rule</dt><dd>{item.stop_rule}</dd></div></dl></article>)}</div></section>
    </div>
  );
}

export default function App() {
  const initialRoute = useMemo(parseRoute, []);
  const [caseId, setCaseId] = useState(initialRoute.caseId);
  const [view, setView] = useState<View>(initialRoute.view);
  const [routeMetricId, setRouteMetricId] = useState<string | null>(initialRoute.metricId);
  const [routeControls, setRouteControls] = useState<RouteControls>(initialRoute.controls);
  const [drawerMetric, setDrawerMetric] = useState<Metric | null>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const initializedRef = useRef(false);
  const caseData = useMemo(() => data.cases.find((item) => item.caseId === caseId) ?? data.cases[0], [caseId]);
  const navigate = (nextCaseId: string, nextView: View, metricId: string | null = null, controls: RouteControls = {}, replace = false) => {
    const hash = makeRoute(nextCaseId, nextView, metricId, controls);
    if (typeof window !== "undefined" && window.location.hash !== hash) {
      window.history[replace ? "replaceState" : "pushState"](null, "", hash);
    }
    setCaseId(nextCaseId);
    setView(nextView);
    setRouteMetricId(metricId);
    setRouteControls(controls);
  };
  const openRegisteredMetric = (metric: Metric, trigger: HTMLElement) => {
    const registry = caseData.metricRegistry.find((item) => item.metric_id === metric.metric_id);
    setDrawerTrigger(trigger);
    setDrawerMetric(registry ? {...metric, classification: registry.classification, registry} : metric);
    navigate(caseData.caseId, view, metric.metric_id, routeControls);
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.startsWith("#/v2/")) navigate(initialRoute.caseId, initialRoute.view, initialRoute.metricId, initialRoute.controls, true);
    const syncFromLocation = () => {
      const route = parseRoute();
      setCaseId(route.caseId);
      setView(route.view);
      setRouteMetricId(route.metricId);
      setRouteControls(route.controls);
    };
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {window.removeEventListener("popstate", syncFromLocation); window.removeEventListener("hashchange", syncFromLocation);};
  }, []);
  useEffect(() => {
    if (!caseData || !routeMetricId) {
      if (!routeMetricId) setDrawerMetric(null);
      return;
    }
    const summary = caseData.summaryMetrics.find((item) => item.metric_id === routeMetricId);
    const registered = caseData.metricRegistry.find((item) => item.metric_id === routeMetricId);
    if (!registered && !summary) {
      navigate(caseData.caseId, view, null, routeControls, true);
      return;
    }
    if (!drawerMetric || drawerMetric.metric_id !== routeMetricId) {
      setDrawerMetric(summary ?? {metric_id: registered!.metric_id, label: registered!.label, value: registered!.display_value, detail: `Registered ${registered!.period} investment workpaper value.`, classification: registered!.classification, lineage: caseData.lineage.filter((item) => item.output_names.some((name) => registered!.metric_id.includes(name))).map((item) => item.node_id), registry: registered});
    }
  }, [caseData, routeMetricId, view]);
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
        <div className="case-switch" aria-label="Select investment case">{data.cases.map((item) => <button key={item.caseId} aria-pressed={item.caseId === caseId} onClick={() => navigate(item.caseId, view)}><span>{item.caseType}</span>{item.company}</button>)}</div>
        <div className="local-state"><span className="status-dot" />Local synthetic build · founder review pending</div>
      </header>
      <section className="case-masthead" aria-labelledby="case-title">
        <div><p className="kicker">{caseData.caseType} · illustrative case</p><h1 id="case-title">{caseData.company}</h1></div>
        <p className="synthetic-banner">{caseData.disclosure}</p>
      </section>
      <nav className="view-nav" aria-label="Workbench views">{views.map((item, index) => <button key={item} aria-current={view === item ? "page" : undefined} onClick={() => navigate(caseId, item)}><span>0{index + 1}</span>{item}</button>)}</nav>
      <main id="workspace" tabIndex={-1} ref={workspaceRef}>
        {view === "IC Snapshot" && <Snapshot caseData={caseData} openMetric={openRegisteredMetric} onNavigate={(nextView) => navigate(caseId, nextView)} />}
        {view === "Thesis & Evidence" && <ThesisEvidence caseData={caseData} openMetric={openRegisteredMetric} />}
        {view === "Econometric Lab" && <EconometricLab caseData={caseData} openMetric={openRegisteredMetric} />}
        {view === "Underwriting Room" && <UnderwritingRoom caseData={caseData} openMetric={openRegisteredMetric} routeState={routeControls} onRouteState={(next) => navigate(caseId, view, null, {...routeControls, ...next})} />}
        {view === "Value Creation" && (caseData.vcEngine ? <div className="view-stack"><ChartRegistryCaption caseData={caseData} location="Value Creation" /><ValueCreation caseData={caseData} openMetric={openRegisteredMetric} /><ValuePlanDetails caseData={caseData} openMetric={openRegisteredMetric} /></div> : <ValueCreation caseData={caseData} openMetric={openRegisteredMetric} />)}
      </main>
      <footer><span>Local synthetic reference implementation</span><span>Manifest <code>{caseData.manifest_sha256.slice(0, 16)}…</code></span><span>No runtime model, network, or investment authority</span></footer>
      {drawerMetric && <EvidenceDrawer caseData={caseData} metric={drawerMetric} onClose={() => {navigate(caseId, view, null, routeControls); setDrawerMetric(null); requestAnimationFrame(() => drawerTrigger?.focus());}} />}
    </div>
  );
}
