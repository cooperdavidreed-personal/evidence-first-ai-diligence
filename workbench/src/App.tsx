import { useEffect, useMemo, useRef, useState } from "react";
import {registeredMetric} from "./data-contract";
import {caseCatalog, isCaseId, loadCase, type CaseId} from "./case-data";
import {ChartRegistryCaption} from "./chart-registry";
import { PESnapshotTerms, PEUnderwritingRoom, PEValueCreation } from "./pe";
import { VCSnapshotTerms, VCUnderwritingRoom, VCValueCreation } from "./vc";
import { ThesisGraphView } from "./thesis-graph";
import {ValuePlanDetails} from "./value-plan";
import type { Analysis, CaseData, Lineage, Metric } from "./types";
const views = ["Landing", "Overview", "Thesis", "Financials & Returns", "Risks & Diligence", "Value Creation", "Memo", "Explore the deal", "Sources", "Methodology", "Audit details"] as const;
type View = (typeof views)[number];
const primaryViews: View[] = ["Overview", "Thesis", "Financials & Returns", "Risks & Diligence", "Value Creation", "Memo"];
const utilityViews: View[] = ["Explore the deal", "Sources", "Methodology", "Audit details"];
type RouteControls = {scenario?: string | null; driver?: string | null; cell?: string | null; section?: string | null};
export type WorkbenchRoute = {caseId: CaseId; view: View; metricId: string | null; controls: RouteControls};
const viewSlugs: Record<View, string> = {"Landing": "start", "Overview": "overview", "Thesis": "thesis", "Financials & Returns": "financials", "Risks & Diligence": "risks", "Value Creation": "value-creation", "Memo": "memo", "Explore the deal": "explore", "Sources": "sources", "Methodology": "methodology", "Audit details": "audit"};
const slugViews = Object.fromEntries(Object.entries(viewSlugs).map(([view, slug]) => [slug, view])) as Record<string, View>;
const legacyViews: Record<string, View> = {snapshot: "Overview", evidence: "Thesis", econometrics: "Methodology", underwriting: "Financials & Returns"};

export function parseRoute(): WorkbenchRoute {
  const fallback = caseCatalog[0].caseId;
  if (typeof window === "undefined") return {caseId: fallback, view: "Landing", metricId: null, controls: {}};
  const [path, query = ""] = window.location.hash.replace(/^#/, "").split("?");
  const match = path.match(/^\/v2\/([^/]+)\/([^/]+)$/);
  const routeCase = match && isCaseId(match[1]) ? match[1] : fallback;
  const routeView = match ? (slugViews[match[2]] ?? legacyViews[match[2]] ?? "Overview") : "Landing";
  const params = new URLSearchParams(query);
  return {caseId: routeCase, view: routeView, metricId: params.get("metric"), controls: {scenario: params.get("scenario"), driver: params.get("driver"), cell: params.get("cell"), section: params.get("section")}};
}

function makeRoute(caseId: string, view: View, metricId?: string | null, controls: RouteControls = {}) {
  const params = new URLSearchParams();
  if (metricId) params.set("metric", metricId);
  if (controls.scenario) params.set("scenario", controls.scenario);
  if (controls.driver) params.set("driver", controls.driver);
  if (controls.cell) params.set("cell", controls.cell);
  if (controls.section) params.set("section", controls.section);
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
const displayDate = (value: string) => new Intl.DateTimeFormat("en-US", {year: "numeric", month: "long", day: "numeric", timeZone: "UTC"}).format(new Date(value));
const registeredDisplay = (caseData: CaseData, metricId: string) => {
  const metric = caseData.metricRegistry.find((item) => item.metric_id === metricId);
  if (!metric) throw new Error(`reader_metric_unregistered:${metricId}`);
  return metric.display_value;
};

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
        consequence: `The ${asMoney(caseData.peEngine.ask.engine_inputs.transaction.entry_enterprise_value_cents as number)} seller ask produces ${registeredDisplay(caseData, "atlasgrid-ASK-gross-irr")} gross XIRR and misses the 22% hurdle; the selected ${asMoney(caseData.peEngine.selected.engine_inputs.transaction.entry_enterprise_value_cents as number)} structure produces ${registeredDisplay(caseData, "atlasgrid-SELECTED-gross-irr")}.`,
        metricId: ebitda.metric_id,
      },
      lossCase: {
        title: "Churn plus multiple compression breaks the return case",
        evidence: `The modeled downside exits at ${caseData.peEngine.downside.engine_inputs.transaction.exit_multiple as string}x under weaker retention and operating performance.`,
        consequence: `Gross XIRR falls to ${registeredDisplay(caseData, "atlasgrid-DOWNSIDE-gross-irr")} and gross MOIC to ${registeredDisplay(caseData, "atlasgrid-DOWNSIDE-gross-moic")}—a hurdle failure, not a capital-loss case. Separate seeded paths show ${registeredDisplay(caseData, "atlasgrid-ag-11-probability_below_1x")} probability below 1.0x.`,
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
    const pipeline = caseData.analyses.find((item) => item.analysis_id === "HX-04")!;
    const inflatedOpportunities = pipeline.outputs.find((item) => item.name === "inflated_opportunities")?.value ?? "not reported";
    const weightedInflation = pipeline.outputs.find((item) => item.name === "weighted_pipeline_inflation")?.value ?? "not reported";
    const fundedRunway = caseData.decision.metric_pairs?.find((item) => item.metric_id === "helios-hx-03-post_close_runway_floor");
    const unitCostGate = request("HX-D03")!;
    const pipelineGate = request("HX-D01")!;
    const termsGate = request("HX-D04")!;
    const firstClose = caseData.vcEngine.base.financing_events.find((item) => item.event_type === "PRIMARY");
    const milestoneTranche = caseData.vcEngine.milestone.financing_events.find((item) => item.event_type === "MILESTONE" && item.status === "FUNDED");
    return {
      posture: caseData.decision.decision.replaceAll("_", " "),
      postureSummary: `Analytical posture only — ${caseData.workflowDisposition} remains in force and the conditional tranche stays gated across ${caseData.decision.open_conditions} open conditions.`,
      driver: {
        title: "Retention and margin support a milestone structure—not immediate funding",
        evidence: `${nrr.label} is ${nrr.value} (${nrr.detail}); ${margin.label.toLowerCase()} is ${margin.value}. Stage history flags ${inflatedOpportunities} inflated opportunities / $${weightedInflation}M weighted inflation.`,
        consequence: `${asMoney(firstClose?.new_money_cents ?? 0)} is the proposed initial close and ${asMoney(milestoneTranche?.new_money_cents ?? 0)} funds only after the milestone tests and human approval; the funded case produces ${registeredDisplay(caseData, "helios-MILESTONE-gross-xirr")} gross XIRR and ${registeredDisplay(caseData, "helios-MILESTONE-gross-moic")} gross MOIC.`,
        metricId: nrr.metric_id,
      },
      lossCase: {
        title: "Down-round dilution and weaker exit economics compress the outcome",
        evidence: "The retained downside reruns financing events, dilution, cash, preferences, and dated investor cash flows.",
        consequence: `Gross XIRR falls to ${registeredDisplay(caseData, "helios-DOWNSIDE-gross-xirr")} and gross MOIC to ${registeredDisplay(caseData, "helios-DOWNSIDE-gross-moic")}, below the declared 30% / 3.0x hurdles—not below invested capital. Separate seeded paths show ${registeredDisplay(caseData, "helios-hx-09-probability_below_1x")} probability below 1.0x.`,
      },
      blocker: {
        title: "Pipeline, unit costs, and executed terms",
        owner: `${pipelineGate.owner} · ${unitCostGate.owner} · ${termsGate.owner}`,
        consequence: "Withhold the $15M tranche until pipeline history and provider unit costs reconcile; do not fund the $25M first close until ownership and every waterfall scenario reconcile to executed terms.",
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
  const isInvestmentMetric = registered ? caseData.renderManifest.investment_metric_ids.includes(registered.metric_id) : false;
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
          {formula ? <section className="formula-inspection"><span>Calculation</span><strong>{formula.operation.replaceAll("_", " ")}</strong><ol>{operands.map((item) => <li key={item!.metric_id}><span>{item!.label}</span><strong>{item!.display_value}</strong><small>{item!.period} · {displayClass(item!.classification)}</small></li>)}</ol></section> : <p className="layer-empty">{isInvestmentMetric ? "CALCULATION CONTRACT ERROR — this investment output cannot render without formula operands." : "Direct observation or declared assumption; the source evidence and period are shown below."}</p>}
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
  const distributionMetrics = caseData.returnsDistribution.moic.map((_, index) => registeredMetric(caseData, caseData.caseId === "helios" ? `helios-distribution-moic-${index}` : `${caseData.caseId}-distribution-${index}`));
  const values = distributionMetrics.map((item) => Number(item.value));
  const maximum = Math.max(...values, 1);
  return (
    <figure className="distribution" aria-label="Return distribution">
      <figcaption>Conditional return distribution <span>Scenario inputs, not a forecast</span></figcaption>
      {caseData.vcEngine?.distribution.template_weights ? <p className="distribution-priors" aria-label="Scenario state prior weights">State priors · {Object.entries(caseData.vcEngine.distribution.template_weights).map(([key, value]) => `${key.replaceAll("_", " ").toLowerCase()} ${(Number(value) * 100).toFixed(0)}%`).join(" · ")}</p> : null}
      {values.map((value, index) => (
        <div className="distribution-row" key={caseData.returnsDistribution.labels[index]}>
          <span>{caseData.returnsDistribution.labels[index]}</span>
          <div className="bar-track"><div className="bar" style={{width: `${Math.max(3, (value / maximum) * 100)}%`}} /></div>
          {openMetric ? <button className="distribution-value" data-metric-id={distributionMetrics[index].metric_id} aria-label={`Inspect lineage for ${caseData.returnsDistribution.labels[index]} conditional MOIC`} onClick={(event) => openMetric({metric_id: distributionMetrics[index].metric_id, label: `${caseData.returnsDistribution.labels[index]} conditional MOIC`, value: distributionMetrics[index].display_value, detail: "Seeded scenario output, not a forecast", classification: "SCENARIO", lineage: [caseData.distributionLineage], registry: distributionMetrics[index]}, event.currentTarget)}>{distributionMetrics[index].display_value} ↗</button> : <strong>{distributionMetrics[index].display_value}</strong>}
        </div>
      ))}
    </figure>
  );
}

function HurdleLedger({caseData, openMetric}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const pairs = caseData.decision.metric_pairs ?? [];
  if (!pairs.length) return null;
  const displayPairs = pairs.map((pair) => ({...pair, observed: registeredDisplay(caseData, pair.metric_id)}));
  const displayPairName = (pair: typeof displayPairs[number]) => pair.metric_id.includes("-ASK-") ? `Seller-ask ${pair.metric}` : pair.metric_id.includes("MAX_BID_DOWNSIDE") ? `Max-bid downside ${pair.metric}` : pair.metric;
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
    <div className="hurdle-ledger-rows">{displayPairs.map((pair) => {const metric = metricFor(pair); return <button key={pair.metric_id} data-metric-id={pair.metric_id} onClick={(event) => openMetric(metric, event.currentTarget)} aria-label={`Inspect decision test for ${displayPairName(pair)}`}><span>{displayPairName(pair)}</span><strong>{pair.observed}</strong><small>{pair.designation === "BINDING" ? "Required" : "Context"} · Test {pair.threshold}</small><em data-status={pair.status}>{pair.status}</em><b>Inspect ↗</b></button>;})}</div>
    {caseData.peEngine ? <aside className="solver-floor"><strong>Maximum-bid downside floor</strong><span>At least 5% gross IRR · 1.25x gross MOIC · $3M liquidity · no payment default · no covenant breach. Solved maximum upfront bid: {asMoney(caseData.peEngine.maximum_bid_cents)}; one additional cent must fail at least one constraint.</span></aside> : null}
    {caseData.decision.failure_consequences?.length ? <footer><strong>If any required test or gate fails</strong><span>{caseData.decision.failure_consequences.join(" · ")}</span></footer> : null}
  </section>;
}

function conditionStates(caseData: CaseData) {
  return caseData.decision.condition_states.map((item) => ({
    condition: item.text,
    state: item.state,
  }));
}

function ConditionLedger({caseData}: {caseData: CaseData}) {
  const conditions = conditionStates(caseData);
  const unresolved = conditions.filter((item) => item.state !== "CLEARS_QUANTITATIVELY").length;
  return <section className="condition-ledger" aria-labelledby="condition-ledger-title">
    <div><p className="kicker">Advancement conditions</p><h2 id="condition-ledger-title">{unresolved} unresolved · {conditions.length} required</h2><p>Quantitative clearance is distinct from diligence resolution and human approval.</p></div>
    <ol>{conditions.map((item) => <li key={item.condition}><span>{item.condition}</span><strong data-status={item.state}>{item.state.replaceAll("_", " ")}</strong></li>)}</ol>
    <footer><span>Human adjudication</span><strong data-status="PENDING_HUMAN">PENDING HUMAN</strong></footer>
  </section>;
}

function Snapshot({caseData, openMetric, onNavigate}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void; onNavigate: (view: View, section?: string) => void}) {
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
  const readerBrief = buildReaderBrief(caseData);
  const driverMetric = readerBrief ? caseData.summaryMetrics.find((metric) => metric.metric_id === readerBrief.driver.metricId) : undefined;
  return (
    <div className="view-stack">
      <section className={`decision-strip ${caseData.vcEngine ? "vc-decision-strip" : ""}`} aria-labelledby="decision-title">
        <div className="decision-call">
          <p className="kicker">Analytical posture · not approved</p>
          <h2 id="decision-title">{readerBrief?.posture ?? caseData.decision.decision.replaceAll("_", " ")}</h2>
          <p>{readerBrief?.postureSummary ?? caseData.decision.attribution}</p>
          <small className="decision-attribution">Proposed by {caseData.decision.attribution} · unsigned</small>
        </div>
        <div className="decision-rationale">
          <div className="authority-head"><p className="kicker">Advancement gate</p><strong>NOT CLEARED</strong></div>
          <div className="authority-grid" aria-label="Authority and workflow state">
            <div><span>Workflow</span><strong>{caseData.workflowDisposition}</strong><small>Case may not advance</small></div>
            <div><span>Human authority</span><strong>{caseData.investmentAdjudication.replaceAll("_", " ")}</strong><small>No investment approval</small></div>
            <div><span>Decision record</span><strong>{caseData.decision.signature_status?.replaceAll("_", " ") ?? caseData.decision.status.replaceAll("_", " ")}</strong><small>{caseData.decision.conditions.length} required conditions</small></div>
          </div>
          {caseData.decision.as_of && <p className="decision-cutoff" data-cutoff-iso={caseData.decision.as_of}>Decision cutoff {displayDate(caseData.decision.as_of)}</p>}
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
          <article className="loss-card"><span>02 · How the deal misses its hurdle</span><h3>{readerBrief.lossCase.title}</h3><p>{readerBrief.lossCase.evidence}</p><strong>{readerBrief.lossCase.consequence}</strong></article>
          <article className="blocker-card"><span>03 · Blocking gate</span><h3>{readerBrief.blocker.title}</h3><p>{readerBrief.blocker.owner}</p><strong>{readerBrief.blocker.consequence}</strong><button onClick={() => onNavigate("Risks & Diligence", "diligence")}>Open diligence register →</button></article>
          {readerBrief.runway && <article className="runway-card"><span>04 · Timing basis</span><h3>{readerBrief.runway.title}</h3><p>{readerBrief.runway.evidence}</p><strong>{readerBrief.runway.consequence}</strong><button onClick={() => onNavigate("Financials & Returns", "cash")}>Open cash schedule →</button></article>}
        </div>
      </section>}
      <ConditionLedger caseData={caseData} />
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
type DealRoomItem = {id: string; kind: Exclude<DealRoomKind, "ALL">; title: string; detail: string; meta: string; href?: string; metric?: Metric; targetView?: View; targetSection?: string};

function DealRoomIndex({caseData, openMetric, onNavigate}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void; onNavigate: (view: View, section: string) => void}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DealRoomKind>("ALL");
  const items = useMemo<DealRoomItem[]>(() => {
    const sources = caseData.artifacts.map((artifact) => ({id: `source-${artifact.artifact_id}`, kind: "SOURCE" as const, title: artifact.path, detail: `${artifact.schema} · ${artifact.rows.toLocaleString()} retained rows`, meta: "Synthetic source · content addressed", href: caseData.sourceLocators.find((item) => item.artifact_id === artifact.artifact_id)?.published_path}));
    const findings = caseData.summaryMetrics.map((metric) => ({id: `finding-${metric.metric_id}`, kind: "FINDING" as const, title: metric.label, detail: `${metric.value} · ${metric.detail}`, meta: `${displayClass(metric.classification)} · decision-facing`, metric}));
    const analyses = caseData.analyses.map((analysis) => ({id: `analysis-${analysis.analysis_id}`, kind: "ANALYSIS" as const, title: `${analysis.analysis_id} · ${analysis.question}`, detail: analysis.method, meta: `${displayClass(analysis.classification)} · ${analysis.state} · ${analysis.cutoff}`, targetView: "Methodology" as View, targetSection: `analysis-${analysis.analysis_id}`}));
    const requests = caseData.thesis.requests.map((item) => ({id: `request-${item.request_id}`, kind: "REQUEST" as const, title: `${item.request_id} · ${item.request}`, detail: item.decision_consequence, meta: `${item.owner} · ${item.materiality} · ${item.due_state.replaceAll("_", " ")}`, targetView: "Risks & Diligence" as View, targetSection: `request-${item.request_id}`}));
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
    <div className="deal-room-results" aria-label="Deal room search results">{filtered.map((item) => <article key={item.id} data-kind={item.kind}><div><span>{item.kind}</span><small>{item.meta}</small></div><h3>{item.title}</h3><p>{item.detail}</p>{item.metric ? <button onClick={(event) => openMetric(item.metric!, event.currentTarget)}>Inspect finding evidence ↗</button> : item.href ? <a href={item.href} target="_blank" rel="noreferrer">Open complete source ↗</a> : item.targetView && item.targetSection ? <button onClick={() => onNavigate(item.targetView!, item.targetSection!)}>Open {item.kind.toLowerCase()} ↗</button> : null}</article>)}</div>
  </section>;
}

function ThesisEvidence({caseData, openMetric, onNavigate}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void; onNavigate: (view: View, section: string) => void}) {
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
  const diligenceRequests = caseData.thesis.requests.map((item, index) => typeof item === "string" ? {request_id: `${caseData.caseId}-legacy-${index}`, request: item, owner: "Not assigned", due_state: "OPEN", materiality: "HIGH" as const, decision_consequence: "Retain HOLD until adjudicated."} : item);
  return (
    <div className="view-stack">
      <section className="thesis-header"><p className="kicker">Falsifiable thesis</p><h2>{caseData.thesis.statement}</h2><p>{caseData.thesis.counterthesis}</p></section>
      <DealRoomIndex caseData={caseData} openMetric={openMetric} onNavigate={onNavigate} />
      <section className="thesis-grid">
        <article><h3>Value drivers</h3><ol>{caseData.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ol></article>
        <article className="falsifiers"><h3>Kill criteria</h3><ol className="falsifier-list">{falsifiers.map((item) => <li key={item.label}><span>{item.label}<small>{item.observed}</small></span><strong data-status={item.status}>{item.status}</strong></li>)}</ol></article>
        <article><h3>Next diligence requests</h3><ol>{diligenceRequests.map((item) => <li key={item.request_id}>{item.request}</li>)}</ol></article>
      </section>
      <section id="diligence" aria-labelledby="diligence-title"><div className="section-heading"><p className="kicker">Open-gate register</p><h2 id="diligence-title" tabIndex={-1}>Diligence requests and decision consequences</h2></div><div className="diligence-register">{diligenceRequests.map((item) => <article id={`request-${item.request_id}`} tabIndex={-1} key={item.request_id} data-materiality={item.materiality}><div><span>{item.request_id}</span><strong>{item.materiality}</strong></div><h3>{item.request}</h3><dl><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Due state</dt><dd>{item.due_state.replaceAll("_", " ")}</dd></div><div><dt>If unresolved</dt><dd>{item.decision_consequence}</dd></div></dl></article>)}</div></section>
      <section aria-labelledby="team-title"><div className="section-heading"><p className="kicker">Role-specific judgment · synthetic room only</p><h2 id="team-title">Team capability, gaps, and required capacity</h2></div><div className="team-assessment"><article><h3>Observable strengths</h3><ul>{caseData.teamAssessment.strengths.map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>Unproven capabilities</h3><ul>{caseData.teamAssessment.unproven.map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>Key-person risk</h3><p>{caseData.teamAssessment.key_person_risk}</p></article><article><h3>Required hires / capacity</h3><ul>{caseData.teamAssessment.required_hires.map((item) => <li key={item}>{item}</li>)}</ul></article></div></section>
      <section aria-labelledby="graph-title"><div className="section-heading"><p className="kicker">Decision dependency map</p><h2 id="graph-title">Evidence → estimate → judgment → action</h2></div><ChartRegistryCaption caseData={caseData} location="Thesis & Evidence" /><ThesisGraphView graph={caseData.thesisGraph} /><p className="graph-receipt">{caseData.thesisGraph.nodes.length} nodes · {caseData.thesisGraph.edges.length} typed relationships · complete branching register retained</p></section>
      {caseData.evidenceMappings && <section aria-labelledby="mapping-title"><div className="section-heading"><p className="kicker">Evidence-to-economics discipline</p><h2 id="mapping-title">What receives model credit—and what does not</h2></div><div className="table-wrap" tabIndex={0}><table><thead><tr><th>Evidence</th><th>Observed</th><th>Mapped target</th><th>Credit class</th><th>Model credit</th><th>Decision response</th></tr></thead><tbody>{caseData.evidenceMappings.map((item) => <tr key={item.mapping_id}><td>{item.source_analysis_id}</td><td>{item.observed_value}</td><td>{item.target_assumption_or_condition}</td><td>{displayClass(item.credit_classification)}</td><td>{item.model_credit}</td><td>{item.decision_response}</td></tr>)}</tbody></table></div></section>}
      <section aria-labelledby="evidence-title">
        <div className="section-heading"><p className="kicker">Content-addressed room</p><h2 id="evidence-title">Evidence register</h2></div>
        <div className="table-wrap" tabIndex={0} aria-label="Scrollable evidence register"><table><thead><tr><th>Artifact</th><th>Contract</th><th>Rows</th><th>Use</th></tr></thead><tbody>
          {caseData.artifacts.map((artifact) => <tr key={artifact.artifact_id}><td>{artifact.path}</td><td>{artifact.schema}</td><td>{artifact.rows.toLocaleString()}</td><td>Retained synthetic source</td></tr>)}
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
  if (mapping) {
    const label = {
      BASE_CASE: "BASE-CASE CREDIT · BOUNDED",
      VALUE_CREATION_BRIDGE: "VALUE-CREATION BRIDGE ONLY",
      SCENARIO_ONLY: "SCENARIO ONLY",
      ZERO: "ZERO CREDIT",
    }[mapping.credit_tier];
    return {label, target: mapping.target_assumption_or_condition, consequence: `${mapping.model_credit}. ${mapping.decision_response}.`};
  }
  return {label: "UNBOUND — HOLD", target: "No engine-authored treatment", consequence: "The interface cannot infer investment treatment. Keep the analysis out of the investment model until the engine supplies a mapping."};
}

function AnalysisDetail({caseData, analysis, openMetric}: {caseData: CaseData; analysis: Analysis; openMetric: (metric: Metric, trigger: HTMLElement) => void}) {
  const credit = analysisCredit(caseData, analysis);
  return (
    <article className="analysis-detail" id={`analysis-${analysis.analysis_id}`} tabIndex={-1}>
      <div className="analysis-title"><div><p className="kicker">{analysis.analysis_id}</p><h3>{analysis.question}</h3></div><span className={`state ${analysis.state.toLowerCase()}`}>{analysis.state}</span></div>
      <dl className="method-grid"><div><dt>Estimand / outputs</dt><dd className="analysis-output-list">{analysis.outputs.length ? analysis.outputs.map((output) => {const metric = analysisOutputMetric(caseData, analysis, output); return <button key={output.name} data-metric-id={metric.metric_id} onClick={(event) => openMetric(metric, event.currentTarget)} aria-label={`Inspect lineage for ${metric.label}`}><span>{output.name.replaceAll("_", " ")}</span><strong>{metric.value}</strong><small>Inspect ↗</small></button>;}) : "No estimate — abstention retained"}</dd></div><div><dt>Method</dt><dd>{analysis.method}</dd></div><div><dt>Population</dt><dd>{analysis.population}</dd></div><div><dt>Classification / cutoff</dt><dd>{displayClass(analysis.classification)} · {analysis.cutoff}</dd></div></dl>
      <section className="analysis-credit" data-credit={credit.label.replaceAll(" ", "_")}><div><span>Investment model treatment</span><strong>{credit.label}</strong></div><dl><div><dt>Affected assumption / condition</dt><dd>{credit.target}</dd></div><div><dt>Economic or decision consequence</dt><dd>{credit.consequence}</dd></div></dl></section>
      <div className="diagnostics"><h4>Diagnostics</h4>{analysis.diagnostics.map((diagnostic) => <div key={diagnostic.name}><span>{diagnostic.name.replaceAll("_", " ")}</span><strong>{diagnostic.value}</strong><em data-status={diagnostic.status}>{diagnostic.status}</em></div>)}</div>
      <p className="assumption">{analysis.assumptions.join(" ")}</p>
    </article>
  );
}

function EconometricLab({caseData, openMetric, section}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void; section?: string | null}) {
  const identified = caseData.analyses.filter((item) => item.classification === "CAUSAL_SYNTHETIC_ONLY");
  const associative = caseData.analyses.filter((item) => item.classification === "PREDICTIVE_ASSOCIATION" || item.classification === "NOT_IDENTIFIED");
  const [mode, setMode] = useState<"identified" | "naive" | "all">("identified");
  useEffect(() => {if (section?.startsWith("analysis-")) setMode("all");}, [section, caseData.caseId]);
  const visible = mode === "identified" ? identified : mode === "naive" ? associative : caseData.analyses;
  const paired = caseData.caseId === "atlasgrid"
    ? {naive: "Observational offer-scale association", naiveAnalysis: "AG-06", naiveOutput: "implied_offer_scale_association", adjusted: "Randomized offer ITT", adjustedAnalysis: "AG-07", adjustedOutput: "renewal_itt", unit: "percentage points · same offer scale", naiveNote: "selection exposed", adjustedNote: "design-aligned comparison"}
    : {naive: "Precommitted unadjusted randomized ITT", naiveAnalysis: "HX-06", naiveOutput: "optimizer_ate", adjusted: "Baseline-adjusted precision companion", adjustedAnalysis: "HX-06", adjustedOutput: "optimizer_baseline_adjusted_companion", unit: "log points · same randomized population", naiveNote: "approximately the log change in unit cost; primary recovery and economic mapping", adjustedNote: "companion only; receives no separate credit"};
  const pairMetric = (analysisId: string, outputName: string) => {const analysis = caseData.analyses.find((item) => item.analysis_id === analysisId); const output = analysis?.outputs.find((item) => item.name === outputName); return analysis && output ? analysisOutputMetric(caseData, analysis, output) : null;};
  const naiveMetric = pairMetric(paired.naiveAnalysis, paired.naiveOutput);
  const adjustedMetric = pairMetric(paired.adjustedAnalysis, paired.adjustedOutput);
  return (
    <div className="view-stack">
      <section className="econ-intro"><div><p className="kicker">Identification before inference</p><h2>What the design can—and cannot—establish</h2></div><div className="segmented" aria-label="Analysis comparison"><button aria-pressed={mode === "naive"} onClick={() => setMode("naive")}>Association / abstention</button><button aria-pressed={mode === "identified"} onClick={() => setMode("identified")}>Identified synthetic effect</button><button aria-pressed={mode === "all"} onClick={() => setMode("all")}>All analyses</button></div></section>
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

function investmentQuestion(caseData: CaseData) {
  return caseData.dealContext.investment_question;
}

function Landing({onOpen}: {onOpen: (caseId: CaseId) => void}) {
  return <div className="landing-page">
    <section className="landing-hero" aria-labelledby="landing-title">
      <p className="kicker">Underwriting Intelligence Lab</p>
      <h1 id="landing-title">Turn a crowded data room into a decision an investment committee can challenge.</h1>
      <p>Two synthetic deals connect source evidence, operating analysis, return mechanics, downside cases, and action—without asking a model to approve an investment.</p>
      <button className="primary-action" onClick={() => onOpen("atlasgrid")}>Review a sample deal <span>→</span></button>
      <small>Synthetic cases · local analysis · no runtime model or investment authority</small>
    </section>
    <section className="landing-cases" aria-labelledby="sample-cases-title">
      <div className="section-heading"><p className="kicker">Choose a workflow</p><h2 id="sample-cases-title">Start with the investment question</h2></div>
      <div className="case-card-grid">
        {caseCatalog.map((item) => <button key={item.caseId} onClick={() => onOpen(item.caseId)}><span>{item.caseType === "PE / Growth Equity" ? "Private equity · vertical SaaS" : "Growth equity · AI infrastructure"}</span><strong>{item.company}</strong><p>{item.investmentQuestion}</p><em>Open {item.caseId === "atlasgrid" ? "buyout" : "growth"} underwriting →</em></button>)}
      </div>
    </section>
    <section className="workflow-preview" aria-label="Underwriting workflow"><span>01 Evidence</span><b>→</b><span>02 Economics</span><b>→</b><span>03 Downside</span><b>→</b><span>04 Decision</span><b>→</b><span>05 Ownership plan</span></section>
  </div>;
}

function DealContext({caseData}: {caseData: CaseData}) {
  const context = caseData.dealContext;
  return <section className="deal-context" aria-labelledby="deal-context-title">
    <div className="deal-context-lead"><p className="kicker">Company in one minute</p><h2 id="deal-context-title">{context.company_one_liner}</h2><p>{context.product}</p></div>
    <dl>
      <div><dt>Customer</dt><dd>{context.customer}</dd></div>
      <div><dt>Market</dt><dd>{context.market}</dd></div>
      <div><dt>Go to market</dt><dd>{context.go_to_market}</dd></div>
      <div><dt>Team</dt><dd>{context.team}</dd></div>
      <div><dt>Competition</dt><dd>{context.competition.join(" · ")}</dd></div>
      <div><dt>Process</dt><dd>{context.process}</dd></div>
    </dl>
  </section>;
}

type CanonicalCell = {cell_id: string; assumption_label: string; gross_xirr: string; gross_moic: string};

type DecisionMetricPair = NonNullable<CaseData["decision"]["metric_pairs"]>[number];
const thresholdClears = (observed: number, pair: DecisionMetricPair) => {
  const threshold = Number(pair.threshold_value);
  if (pair.operator === ">=") return observed >= threshold;
  if (pair.operator === "<=") return observed <= threshold;
  if (pair.operator === ">") return observed > threshold;
  if (pair.operator === "<") return observed < threshold;
  return observed === threshold;
};

function AssumptionLab({caseData, routeState, onRouteState}: {caseData: CaseData; routeState: RouteControls; onRouteState: (state: RouteControls) => void}) {
  const axis = caseData.peEngine ? "entry_enterprise_value_cents" : "exit_value";
  const cells: CanonicalCell[] = caseData.peEngine
    ? caseData.peEngine.sensitivities.one_way.filter((item) => item.axis === axis)
    : caseData.vcEngine!.sensitivities.cells.filter((item) => item.axis === axis);
  const selected = cells.find((item) => item.cell_id === routeState.cell) ?? cells[Math.floor(cells.length / 2)];
  if (!selected) return null;
  const irrMetricId = caseData.peEngine ? "atlasgrid-SELECTED-gross-irr" : "helios-MILESTONE-gross-xirr";
  const moicMetricId = caseData.peEngine ? "atlasgrid-SELECTED-gross-moic" : "helios-MILESTONE-gross-moic";
  const irrPair = caseData.decision.metric_pairs?.find((item) => item.metric_id === irrMetricId);
  const moicPair = caseData.decision.metric_pairs?.find((item) => item.metric_id === moicMetricId);
  if (!irrPair || !moicPair) throw new Error("canonical_assumption_hurdle_missing");
  const clears = thresholdClears(Number(selected.gross_xirr), irrPair) && thresholdClears(Number(selected.gross_moic), moicPair);
  const label = caseData.peEngine ? "Entry enterprise value" : "Exit equity value";
  const peCell = caseData.peEngine ? selected as CanonicalCell & {sponsor_cash_flows: Array<{amount_cents: number}>; minimum_covenant_headroom: string; receipt_sha256: string} : null;
  const vcCell = caseData.vcEngine ? selected as CanonicalCell & {target_ownership: string; minimum_cash_cents: number; receipt_sha256: string} : null;
  const strategyConsequence = peCell
    ? `Sponsor equity at close ${asMoney(Math.abs(peCell.sponsor_cash_flows[0].amount_cents))} · minimum covenant headroom ${Number(peCell.minimum_covenant_headroom).toFixed(2)}x.`
    : `Series C ownership ${asPercent(vcCell!.target_ownership)} · minimum modeled cash ${asMoney(vcCell!.minimum_cash_cents)}.`;
  const receipt = peCell?.receipt_sha256 ?? vcCell!.receipt_sha256;
  return <section className="assumption-lab" aria-labelledby="assumption-title">
    <div><p className="kicker">Test the decisive assumption</p><h2 id="assumption-title">{label}</h2><p>Each choice reruns the canonical engine cell. This is not a display-only calculator.</p></div>
    <div className="assumption-options" role="group" aria-label={label}>{cells.map((cell) => <button key={cell.cell_id} aria-pressed={cell.cell_id === selected.cell_id} onClick={() => onRouteState({driver: axis, cell: cell.cell_id})}>{cell.assumption_label}</button>)}</div>
    <dl className="assumption-result">
      <div><dt>Gross IRR</dt><dd>{asPercent(selected.gross_xirr)}</dd></div>
      <div><dt>Gross MOIC</dt><dd>{asMultiple(selected.gross_moic)}</dd></div>
      <div><dt>Return test</dt><dd data-status={clears ? "CLEARS" : "MISSES"}>{clears ? "Clears" : "Misses"}<small>{irrPair.threshold} IRR · {moicPair.threshold} MOIC</small></dd></div>
    </dl>
    <p className="assumption-consequence"><strong>{clears ? "Return hurdle clears." : "Return hurdle fails."}</strong> {caseData.peEngine ? (clears ? "Price alone does not resolve the three open diligence gates." : "Do not advance at this price.") : (clears ? "Loss probability and two diligence gates still prevent advancement." : "The return case does not support investment at this exit outcome.")}</p>
    <p className="assumption-detail">{strategyConsequence} <strong>Recommendation impact:</strong> {clears ? `${caseData.decision.decision.replaceAll("_", " ")} remains analytical only; workflow stays ${caseData.workflowDisposition}.` : "Do not advance on these economics."} <code>{receipt.slice(0, 12)}…</code></p>
  </section>;
}

function ThesisView({caseData}: {caseData: CaseData}) {
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
  return <div className="view-stack">
    <section className="thesis-header"><p className="kicker">Investment thesis</p><h2>{caseData.thesis.statement}</h2><p><strong>Counterthesis.</strong> {caseData.thesis.counterthesis}</p></section>
    <section className="thesis-grid investor-thesis-grid"><article><h3>What must drive value</h3><ol>{caseData.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ol></article><article className="falsifiers"><h3>What would break the thesis</h3><ol className="falsifier-list">{falsifiers.map((item) => <li key={item.label}><span>{item.label}<small>{item.observed}</small></span><strong data-status={item.status}>{item.status}</strong></li>)}</ol></article></section>
    <section aria-labelledby="thesis-map-title"><div className="section-heading"><p className="kicker">Decision map</p><h2 id="thesis-map-title">How the evidence changes the call</h2></div><ThesisGraphView graph={caseData.thesisGraph} /></section>
  </div>;
}

function RisksDiligence({caseData}: {caseData: CaseData}) {
  const requests = caseData.thesis.requests;
  const falsifiers = caseData.falsifierStates ?? caseData.thesis.falsifiers.map((label) => ({label, status: "OPEN" as const, observed: "Not evaluated"}));
  return <div className="view-stack">
    <section className="risk-header"><p className="kicker">Risks & diligence</p><h2>{caseData.decision.open_conditions} issues still change whether this deal advances.</h2><p>The analytical recommendation remains separate from human approval. Open requests below retain an owner and a decision consequence.</p></section>
    <ConditionLedger caseData={caseData} />
    <section id="diligence" aria-labelledby="diligence-title"><div className="section-heading"><p className="kicker">Priority worklist</p><h2 id="diligence-title" tabIndex={-1}>Resolve these before the next committee step</h2></div><div className="diligence-register">{requests.map((item) => <article id={`request-${item.request_id}`} tabIndex={-1} key={item.request_id} data-materiality={item.materiality}><div><span>{item.request_id}</span><strong>{item.materiality}</strong></div><h3>{item.request}</h3><dl><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Status</dt><dd>{item.due_state.replaceAll("_", " ")}</dd></div><div><dt>If unresolved</dt><dd>{item.decision_consequence}</dd></div></dl></article>)}</div></section>
    <section className="two-column"><article><p className="kicker">Kill criteria</p><ul className="falsifier-list">{falsifiers.map((item) => <li key={item.label}><span>{item.label}<small>{item.observed}</small></span><strong data-status={item.status}>{item.status}</strong></li>)}</ul></article><article><p className="kicker">Management assessment</p><h3>{caseData.teamAssessment.key_person_risk}</h3><p><strong>Unproven:</strong> {caseData.teamAssessment.unproven.join(" ")}</p><p><strong>Required capacity:</strong> {caseData.teamAssessment.required_hires.join(" ")}</p></article></section>
  </div>;
}

function SourcesView({caseData, openMetric, onNavigate}: {caseData: CaseData; openMetric: (metric: Metric, trigger: HTMLElement) => void; onNavigate: (view: View, section: string) => void}) {
  return <div className="view-stack"><section className="utility-intro"><p className="kicker">Sources</p><h2>Trace the conclusion back to the retained synthetic room.</h2><p>{caseData.dealContext.evidence_boundary}</p></section><DealRoomIndex caseData={caseData} openMetric={openMetric} onNavigate={onNavigate} /></div>;
}

function MemoView({caseData, onNavigate}: {caseData: CaseData; onNavigate: (view: View) => void}) {
  const reader = buildReaderBrief(caseData);
  return <article className="memo-page" aria-labelledby="memo-title">
    <header><p className="kicker">Illustrative investment committee memo</p><h1 id="memo-title">{caseData.company}</h1><p>{caseData.dealContext.company_one_liner}</p><button onClick={() => window.print()}>Print one-page memo</button></header>
    <section className="memo-call"><div><span>Recommendation</span><strong>{caseData.decision.decision.replaceAll("_", " ")}</strong></div><div><span>Authority</span><strong>Analytical recommendation only</strong></div><div><span>Open conditions</span><strong>{caseData.decision.open_conditions}</strong></div></section>
    <section><h2>IC question</h2><p className="memo-question">{investmentQuestion(caseData)}</p><p>{caseData.decision.rationale}</p></section>
    <section className="memo-columns"><div><h2>Why</h2><p>{reader?.driver.evidence}</p><p><strong>Consequence:</strong> {reader?.driver.consequence}</p></div><div><h2>Downside</h2><p>{reader?.lossCase.evidence}</p><p><strong>Consequence:</strong> {reader?.lossCase.consequence}</p></div></section>
    <section><h2>Required next step</h2><p>{reader?.blocker.consequence}</p><button className="text-action" onClick={() => onNavigate("Risks & Diligence")}>Open diligence worklist →</button></section>
    <footer>{caseData.disclosure} · Analysis cutoff {caseData.decision.as_of ? displayDate(caseData.decision.as_of) : "retained in case record"}</footer>
  </article>;
}

function OverviewDecision({caseData}: {caseData: CaseData}) {
  const isPe = Boolean(caseData.peEngine);
  const irrMetric = isPe ? "atlasgrid-SELECTED-gross-irr" : "helios-MILESTONE-gross-xirr";
  const moicMetric = isPe ? "atlasgrid-SELECTED-gross-moic" : "helios-MILESTONE-gross-moic";
  const terms = caseData.peEngine
    ? `${asMoney(caseData.peEngine.selected.engine_inputs.transaction.entry_enterprise_value_cents as number)} selected enterprise value`
    : "$25M initial close · $15M milestone-gated tranche";
  return <aside className="overview-decision" aria-label="Current analytical recommendation">
    <div><span>Analytical recommendation</span><strong>{caseData.decision.decision.replaceAll("_", " ")}</strong><small>Not approved · {caseData.decision.open_conditions} open conditions</small></div>
    <dl><div><dt>Selected terms</dt><dd>{terms}</dd></div><div><dt>Gross return</dt><dd>{registeredDisplay(caseData, irrMetric)} · {registeredDisplay(caseData, moicMetric)}</dd></div></dl>
  </aside>;
}

function AuditView({caseData}: {caseData: CaseData}) {
  return <div className="view-stack"><section className="utility-intro"><p className="kicker">Audit details</p><h2>Technical receipts stay available without crowding the investment case.</h2><p>Use this layer to reproduce the case and verify content identity. These identifiers do not make or approve an investment decision.</p></section><section className="audit-grid"><article><span>Data-room manifest</span><code>{caseData.manifest_sha256}</code></article><article><span>Analysis</span><code>{caseData.analysis_sha256}</code></article><article><span>Decision record</span><code>{caseData.decision.decision_sha256}</code></article><article><span>Thesis graph</span><code>{caseData.thesisGraph.graph_sha256}</code></article></section><section><div className="section-heading"><p className="kicker">Boundary</p><h2>What this candidate proves</h2></div><p>{caseData.dealContext.evidence_boundary}</p><p>No live data room, external URL, investment approval, or real-world performance claim is established.</p></section></div>;
}

export default function App({initialCase, initialRoute}: {initialCase: CaseData; initialRoute: WorkbenchRoute}) {
  const [caseId, setCaseId] = useState(initialRoute.caseId);
  const [view, setView] = useState<View>(initialRoute.view);
  const [routeMetricId, setRouteMetricId] = useState<string | null>(initialRoute.metricId);
  const [routeControls, setRouteControls] = useState<RouteControls>(initialRoute.controls);
  const [drawerMetric, setDrawerMetric] = useState<Metric | null>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [caseLoadState, setCaseLoadState] = useState<"READY" | "LOADING" | "ERROR">("READY");
  const workspaceRef = useRef<HTMLElement>(null);
  const initializedRef = useRef(false);
  const navigationSequence = useRef(0);
  const caseDataRef = useRef(initialCase);
  const [caseData, setCaseData] = useState(initialCase);
  const commitRoute = (route: WorkbenchRoute) => {
    setCaseId(route.caseId);
    setView(route.view);
    setRouteMetricId(route.metricId);
    setRouteControls(route.controls);
  };
  const navigate = (nextCaseId: string, nextView: View, metricId: string | null = null, controls: RouteControls = {}, replace = false) => {
    if (!isCaseId(nextCaseId)) return;
    const route: WorkbenchRoute = {caseId: nextCaseId, view: nextView, metricId, controls};
    const hash = makeRoute(nextCaseId, nextView, metricId, controls);
    const apply = (nextCase: CaseData) => {
      if (typeof window !== "undefined" && window.location.hash !== hash) window.history[replace ? "replaceState" : "pushState"](null, "", hash);
      caseDataRef.current = nextCase;
      setCaseData(nextCase);
      commitRoute(route);
      setCaseLoadState("READY");
    };
    const sequence = ++navigationSequence.current;
    if (nextCaseId === caseDataRef.current.caseId) {
      apply(caseDataRef.current);
      return;
    }
    setCaseLoadState("LOADING");
    void loadCase(nextCaseId).then((nextCase) => {
      if (sequence === navigationSequence.current) apply(nextCase);
    }).catch(() => {
      if (sequence === navigationSequence.current) setCaseLoadState("ERROR");
    });
  };
  const openRegisteredMetric = (metric: Metric, trigger: HTMLElement) => {
    const registry = caseData.metricRegistry.find((item) => item.metric_id === metric.metric_id);
    setDrawerTrigger(trigger);
    setDrawerMetric(registry ? {...metric, classification: registry.classification, registry} : metric);
    navigate(caseData.caseId, view, metric.metric_id, routeControls);
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const canonicalInitialHash = makeRoute(initialRoute.caseId, initialRoute.view, initialRoute.metricId, initialRoute.controls);
    if (window.location.hash !== canonicalInitialHash) navigate(initialRoute.caseId, initialRoute.view, initialRoute.metricId, initialRoute.controls, true);
    const syncFromLocation = () => {
      const route = parseRoute();
      const canonicalHash = makeRoute(route.caseId, route.view, route.metricId, route.controls);
      if (window.location.hash !== canonicalHash) window.history.replaceState(null, "", canonicalHash);
      const sequence = ++navigationSequence.current;
      if (route.caseId === caseDataRef.current.caseId) {
        commitRoute(route);
        setCaseLoadState("READY");
        return;
      }
      setCaseLoadState("LOADING");
      void loadCase(route.caseId).then((nextCase) => {
        if (sequence !== navigationSequence.current) return;
        caseDataRef.current = nextCase;
        setCaseData(nextCase);
        commitRoute(route);
        setCaseLoadState("READY");
      }).catch(() => {
        if (sequence === navigationSequence.current) setCaseLoadState("ERROR");
      });
    };
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {window.removeEventListener("popstate", syncFromLocation); window.removeEventListener("hashchange", syncFromLocation);};
  }, []);
  useEffect(() => {
    if (!caseData) return;
    const normalized: RouteControls = {...routeControls};
    let changed = false;
    const remove = (key: keyof RouteControls) => {if (normalized[key]) {delete normalized[key]; changed = true;}};
    if (view !== "Financials & Returns" && view !== "Overview") {
      remove("scenario"); remove("driver"); remove("cell");
    } else if (caseData.peEngine) {
      if (normalized.scenario && !["ask", "selected", "downside"].includes(normalized.scenario)) remove("scenario");
      const book = caseData.peEngine.sensitivities;
      if (normalized.driver && !book.axis_order.includes(normalized.driver)) {remove("driver"); remove("cell");}
      if (normalized.cell) {
        const validCells = book.one_way.filter((item) => !normalized.driver || item.axis === normalized.driver).map((item) => item.cell_id);
        if (!validCells.includes(normalized.cell)) remove("cell");
      }
    } else if (caseData.vcEngine) {
      if (normalized.scenario && !["base", "milestone", "downside", "financing_shortfall"].includes(normalized.scenario)) remove("scenario");
      const book = caseData.vcEngine.sensitivities;
      if (normalized.driver && !book.axis_order.includes(normalized.driver as typeof book.axis_order[number])) {remove("driver"); remove("cell");}
      if (normalized.cell) {
        const validCells = book.cells.filter((item) => !normalized.driver || item.axis === normalized.driver).map((item) => item.cell_id);
        if (!validCells.includes(normalized.cell)) remove("cell");
      }
    }
    if (normalized.section) {
      const validSection = normalized.section === "diligence" && view === "Risks & Diligence"
        || normalized.section === "cash" && view === "Financials & Returns" && Boolean(caseData.vcEngine)
        || normalized.section.startsWith("analysis-") && view === "Methodology" && caseData.analyses.some((item) => `analysis-${item.analysis_id}` === normalized.section)
        || normalized.section.startsWith("request-") && view === "Risks & Diligence" && caseData.thesis.requests.some((item) => `request-${item.request_id}` === normalized.section);
      if (!validSection) remove("section");
    }
    if (changed) navigate(caseData.caseId, view, routeMetricId, normalized, true);
  }, [caseData, view, routeControls.scenario, routeControls.driver, routeControls.cell, routeControls.section, routeMetricId]);
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
  useEffect(() => {
    if (!routeControls.section) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(routeControls.section!);
      const focusTarget = target?.querySelector<HTMLElement>("h1, h2, h3") ?? target;
      if (typeof target?.scrollIntoView === "function") target.scrollIntoView({block: "start"});
      focusTarget?.focus({preventScroll: true});
    });
  }, [view, caseId, routeControls.section]);
  return (
    <div className="app-shell" aria-busy={caseLoadState === "LOADING"}>
      <a className="skip-link" href="#workspace">Skip to analysis</a>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">UIL</span><div><strong>Underwriting Intelligence Lab</strong><small>Evidence → economics → action</small></div></div>
        <div className="case-switch" aria-label="Select investment case">{caseCatalog.map((item) => <button key={item.caseId} aria-pressed={view !== "Landing" && item.caseId === caseId} disabled={caseLoadState === "LOADING"} onClick={() => navigate(item.caseId, view === "Landing" ? "Overview" : view)}><span>{item.caseType}</span>{item.company}</button>)}</div>
        <div className="local-state"><span className="status-dot" />Local synthetic build · founder review pending</div>
      </header>
      {caseLoadState === "ERROR" && <p className="case-load-error" role="alert">Case data unavailable. The prior validated case remains open.</p>}
      {view !== "Landing" && <section className="case-masthead" aria-labelledby="case-title">
        <div><p className="kicker">{caseData.caseType} · illustrative case</p><h1 id="case-title">{caseData.company}</h1></div>
        <p className="synthetic-banner">{caseData.disclosure}</p>
      </section>}
      {view !== "Landing" && <><nav className="view-nav" aria-label="Primary investment views">{primaryViews.map((item, index) => <button key={item} aria-current={view === item ? "page" : undefined} onClick={() => navigate(caseId, item)}><span>0{index + 1}</span>{item}</button>)}</nav><nav className="utility-nav" aria-label="Supporting analysis views">{utilityViews.map((item) => <button key={item} aria-current={view === item ? "page" : undefined} onClick={() => navigate(caseId, item)}>{item}</button>)}</nav></>}
      <main id="workspace" tabIndex={-1} ref={workspaceRef}>
        {view === "Landing" && <Landing onOpen={(nextCase) => navigate(nextCase, "Overview")} />}
        {view === "Overview" && <div className="view-stack"><section className="investment-question"><p className="kicker">Investment committee question</p><h2>{investmentQuestion(caseData)}</h2><p>{caseData.decision.rationale}</p><OverviewDecision caseData={caseData} /></section><DealContext caseData={caseData} /><AssumptionLab caseData={caseData} routeState={routeControls} onRouteState={(next) => navigate(caseId, view, null, {...routeControls, ...next})} /><Snapshot caseData={caseData} openMetric={openRegisteredMetric} onNavigate={(nextView, section) => navigate(caseId, nextView, null, {section})} /></div>}
        {view === "Thesis" && <ThesisView caseData={caseData} />}
        {view === "Financials & Returns" && <UnderwritingRoom caseData={caseData} openMetric={openRegisteredMetric} routeState={routeControls} onRouteState={(next) => navigate(caseId, view, null, {...routeControls, ...next})} />}
        {view === "Risks & Diligence" && <RisksDiligence caseData={caseData} />}
        {view === "Value Creation" && (caseData.vcEngine ? <div className="view-stack"><ChartRegistryCaption caseData={caseData} location="Value Creation" /><ValueCreation caseData={caseData} openMetric={openRegisteredMetric} /><ValuePlanDetails caseData={caseData} openMetric={openRegisteredMetric} /></div> : <ValueCreation caseData={caseData} openMetric={openRegisteredMetric} />)}
        {view === "Memo" && <MemoView caseData={caseData} onNavigate={(nextView) => navigate(caseId, nextView)} />}
        {view === "Explore the deal" && <DealRoomIndex caseData={caseData} openMetric={openRegisteredMetric} onNavigate={(nextView, section) => navigate(caseId, nextView, null, {section})} />}
        {view === "Sources" && <SourcesView caseData={caseData} openMetric={openRegisteredMetric} onNavigate={(nextView, section) => navigate(caseId, nextView, null, {section})} />}
        {view === "Methodology" && <EconometricLab caseData={caseData} openMetric={openRegisteredMetric} section={routeControls.section} />}
        {view === "Audit details" && <AuditView caseData={caseData} />}
      </main>
      <footer><span>Local synthetic reference implementation</span><span>Audit identifiers available inside number lineage</span><span>No runtime model, network, or investment authority</span></footer>
      {drawerMetric && <EvidenceDrawer caseData={caseData} metric={drawerMetric} onClose={() => {navigate(caseId, view, null, routeControls, true); setDrawerMetric(null); requestAnimationFrame(() => drawerTrigger?.focus());}} />}
    </div>
  );
}
