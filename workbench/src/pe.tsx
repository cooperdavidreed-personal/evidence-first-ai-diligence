import {useEffect, useState} from "react";
import {ChartRegistryCaption} from "./chart-registry";
import {registeredMetric} from "./data-contract";
import type {CaseData, Metric, PECaseResult, PESensitivityCell} from "./types";
import {ValuePlanDetails} from "./value-plan";

type OpenMetric = (metric: Metric, trigger: HTMLElement) => void;
type ScenarioKey = "ask" | "selected" | "downside";

const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: Math.abs(cents) >= 100_000_000 ? "compact" : "standard",
  maximumFractionDigits: Math.abs(cents) >= 100_000_000 ? 1 : 0,
}).format(cents / 100);

const percent = (decimal: string) => `${(Number(decimal) * 100).toFixed(1)}%`;
const multiple = (decimal: string) => `${Number(decimal).toFixed(1)}x`;
const leverage = (decimal: string) => `${Number(decimal).toFixed(1)}x`;

function financeMetric(
  caseData: CaseData,
  scenario: PECaseResult,
  suffix: string,
  label: string,
  value: string,
  detail: string,
): Metric {
  const metricId = `${caseData.caseId}-${scenario.scenario_id}-${suffix}`;
  const registry = registeredMetric(caseData, metricId);
  return {
    metric_id: metricId,
    label,
    value: registry.display_value || value,
    detail: `${detail} Retained full-model scenario result.`,
    classification: registry.classification,
    lineage: registry.source_locator_ids.map((id) => id.replace(/^locator-/, "")),
    registry,
  };
}

function MetricButton({metric, openMetric}: {metric: Metric; openMetric: OpenMetric}) {
  return <button className="finance-metric" data-metric-id={metric.metric_id} onClick={(event) => openMetric(metric, event.currentTarget)}>
    <span>{metric.label}</span><strong>{metric.value}</strong><small>Inspect ↗</small>
  </button>;
}

function registryMetric(caseData: CaseData, metricId: string, detail: string): Metric {
  const registry = registeredMetric(caseData, metricId);
  return {
    metric_id: metricId,
    label: registry.label,
    value: registry.display_value,
    detail,
    classification: registry.classification,
    lineage: registry.source_locator_ids.map((id) => id.replace(/^locator-/, "")),
    registry,
  };
}

function InlineMetricButton({caseData, metricId, detail, openMetric}: {caseData: CaseData; metricId: string; detail: string; openMetric: OpenMetric}) {
  const metric = registryMetric(caseData, metricId, detail);
  return <button className="inline-finance-value" data-metric-id={metricId} aria-label={`Inspect lineage for ${metric.label}`} onClick={(event) => openMetric(metric, event.currentTarget)}>{metric.value}<small>↗</small></button>;
}

function SourcesUses({caseData, scenario, openMetric}: {caseData: CaseData; scenario: PECaseResult; openMetric: OpenMetric}) {
  const schedule = scenario.sources_and_uses;
  return <section className="finance-panel" aria-labelledby="sources-uses-title">
    <div className="panel-heading"><div><p className="kicker">Closing capitalization</p><h3 id="sources-uses-title">Sources &amp; uses</h3></div><span>Exact cents</span></div>
    <div className="sources-uses-grid">
      <table><caption>Uses</caption><tbody>{Object.keys(schedule.uses_cents).map((label) => {const metricId = `${caseData.caseId}-${scenario.scenario_id}-uses-${label}`; return <tr key={label}><th>{label.replaceAll("_", " ")}</th><td><InlineMetricButton caseData={caseData} metricId={metricId} detail="Exact integer-cent closing use from the retained sources-and-uses receipt." openMetric={openMetric} /></td></tr>;})}<tr className="total"><th>Total uses</th><td><InlineMetricButton caseData={caseData} metricId={`${caseData.caseId}-${scenario.scenario_id}-total-uses`} detail="Exact sum of all closing uses." openMetric={openMetric} /></td></tr></tbody></table>
      <table><caption>Sources</caption><tbody>{Object.keys(schedule.non_sponsor_sources_cents).map((label) => {const metricId = `${caseData.caseId}-${scenario.scenario_id}-sources-${label}`; return <tr key={label}><th>{label.replaceAll("_", " ")}</th><td><InlineMetricButton caseData={caseData} metricId={metricId} detail="Exact integer-cent non-sponsor closing source." openMetric={openMetric} /></td></tr>;})}<tr><th>Sponsor equity</th><td><InlineMetricButton caseData={caseData} metricId={`${caseData.caseId}-${scenario.scenario_id}-sources-sponsor-equity`} detail="Sponsor equity is the exact residual source required to fund closing uses." openMetric={openMetric} /></td></tr><tr className="total"><th>Total sources</th><td><InlineMetricButton caseData={caseData} metricId={`${caseData.caseId}-${scenario.scenario_id}-total-sources`} detail="Exact sum of sponsor and non-sponsor closing sources." openMetric={openMetric} /></td></tr></tbody></table>
    </div>
    <MetricButton metric={financeMetric(caseData, scenario, "sources-reconcile", "Reconciliation", schedule.total_sources_cents === schedule.total_uses_cents ? "$0 residual" : "BLOCKED", `Exact integer-cent sources equal uses. Undrawn revolver ${money(schedule.undrawn_revolver_commitment_cents)} is capacity, not a closing source.`)} openMetric={openMetric} />
  </section>;
}

function DebtCovenant({caseData, scenario, openMetric}: {caseData: CaseData; scenario: PECaseResult; openMetric: OpenMetric}) {
  const months = scenario.debt_schedule.months;
  const maximumDebt = Math.max(...months.map((item) => item.ending_term_cents + item.ending_revolver_cents), 1);
  const annual = months.filter((item) => item.month === 1 || item.month % 12 === 0);
  const minimumHeadroom = months.reduce((minimum, item) => Math.min(minimum, Number(item.covenant_headroom)), Number.POSITIVE_INFINITY);
  return <section id="debt-covenant" className="finance-panel debt-panel" aria-labelledby="debt-title">
    <div className="panel-heading"><div><p className="kicker">Cash-generated deleveraging</p><h3 id="debt-title">Debt &amp; covenant tape</h3></div><span>{scenario.debt_schedule.first_covenant_breach_month ? `Breach M${scenario.debt_schedule.first_covenant_breach_month}` : "No modeled breach"}</span></div>
    <div className="debt-tape" aria-label="Sixty month ending debt profile">{months.map((item) => <span key={item.month} className={item.covenant_breach ? "breach" : ""} style={{height: `${Math.max(4, ((item.ending_term_cents + item.ending_revolver_cents) / maximumDebt) * 100)}%`}} title={`Month ${item.month}: ${money(item.ending_term_cents + item.ending_revolver_cents)}`} />)}</div>
    <div className="finance-metric-grid">
      <MetricButton metric={financeMetric(caseData, scenario, "exit-debt", "Exit debt", money(scenario.debt_schedule.ending_debt_cents), "Generated by the monthly cash, interest, amortization, revolver, and sweep schedule.")} openMetric={openMetric} />
      <MetricButton metric={financeMetric(caseData, scenario, "min-liquidity", "Minimum liquidity", money(scenario.debt_schedule.minimum_liquidity_cents), "Minimum ending cash across all 60 modeled months.")} openMetric={openMetric} />
      <MetricButton metric={financeMetric(caseData, scenario, "min-headroom", "Minimum headroom", leverage(String(minimumHeadroom)), "Minimum covenant ceiling less recomputed gross leverage across all months.")} openMetric={openMetric} />
    </div>
    <details><summary>Open annual debt workpaper</summary><div className="table-wrap" tabIndex={0}><table><thead><tr><th>Month</th><th>Cash</th><th>Term debt</th><th>Revolver</th><th>Interest</th><th>Sweep</th><th>Gross leverage</th><th>Headroom</th></tr></thead><tbody>{annual.map((item) => {const id = `${caseData.caseId}-${scenario.scenario_id}-month-${String(item.month).padStart(2, "0")}`; const cell = (suffix: string) => <InlineMetricButton caseData={caseData} metricId={`${id}-${suffix}`} detail={`Month ${item.month} exact debt-schedule output.`} openMetric={openMetric} />; return <tr key={item.month}><th scope="row">{item.month}</th><td>{cell("ending_cash_cents")}</td><td>{cell("ending_term_cents")}</td><td>{cell("ending_revolver_cents")}</td><td>{cell("cash_interest_cents")}</td><td>{cell("optional_sweep_cents")}</td><td>{cell("gross_leverage")}</td><td>{cell("covenant_headroom")}</td></tr>;})}</tbody></table></div></details>
  </section>;
}

function ExitBridge({caseData, scenario, openMetric}: {caseData: CaseData; scenario: PECaseResult; openMetric: OpenMetric}) {
  const finalCash = scenario.debt_schedule.months.at(-1)?.ending_cash_cents ?? 0;
  return <section className="finance-panel" aria-labelledby="exit-bridge-title">
    <div className="panel-heading"><div><p className="kicker">Enterprise to sponsor return</p><h3 id="exit-bridge-title">Exit bridge</h3></div><span>Month 60</span></div>
    <div className="exit-equation">
      <span><small>Exit EV</small><InlineMetricButton caseData={caseData} metricId={`${caseData.caseId}-${scenario.scenario_id}-exit-ev`} detail="Exit enterprise value equals exit lender EBITDA times the selected exit multiple." openMetric={openMetric} /></span><b>−</b>
      <span><small>Debt</small><InlineMetricButton caseData={caseData} metricId={`${caseData.caseId}-${scenario.scenario_id}-exit-debt`} detail="Month-60 term debt plus revolver from the exact debt schedule." openMetric={openMetric} /></span><b>+</b>
      <span><small>Cash</small><InlineMetricButton caseData={caseData} metricId={`${caseData.caseId}-${scenario.scenario_id}-exit-cash`} detail="Month-60 ending cash from the exact debt schedule." openMetric={openMetric} /></span><b>=</b>
      <span className="result"><small>Exit equity</small><InlineMetricButton caseData={caseData} metricId={`${caseData.caseId}-${scenario.scenario_id}-exit-equity`} detail="Exit enterprise value less debt plus cash, floored at zero." openMetric={openMetric} /></span>
    </div>
    <div className="finance-metric-grid">
      <MetricButton metric={financeMetric(caseData, scenario, "gross-irr", "Gross IRR", percent(scenario.gross_xirr), "Dated sponsor cash flows, including any contingent earnout payment.")} openMetric={openMetric} />
      <MetricButton metric={financeMetric(caseData, scenario, "gross-moic", "Gross MOIC", multiple(scenario.gross_moic), "Sponsor proceeds divided by all dated invested capital.")} openMetric={openMetric} />
      <MetricButton metric={financeMetric(caseData, scenario, "earnout", "Earnout paid", money(scenario.earnout_cents), "Month-24 verified live ARR determines the month-25 contingent sponsor outflow.")} openMetric={openMetric} />
    </div>
  </section>;
}

function SensitivityBook({caseData, openMetric, routeState, onRouteState}: {caseData: CaseData; openMetric: OpenMetric; routeState?: {driver?: string | null; cell?: string | null}; onRouteState?: (state: {driver?: string; cell?: string}) => void}) {
  const book = caseData.peEngine?.sensitivities;
  if (!book) return null;
  const defaultAxis = book.axis_order[0];
  const axis = routeState?.driver && book.axis_order.includes(routeState.driver) ? routeState.driver : defaultAxis;
  const cells = book.one_way.filter((item) => item.axis === axis);
  const defaultCell = cells[1]?.cell_id ?? cells[0]?.cell_id ?? "";
  const selectedId = routeState?.cell && cells.some((item) => item.cell_id === routeState.cell) ? routeState.cell : defaultCell;
  const selected = cells.find((item) => item.cell_id === selectedId) ?? cells[0];
  const axisLabels: Record<string, string> = {entry_enterprise_value_cents: "Entry EV", full_cohort_nrr: "Full-cohort NRR", gross_margin: "Gross margin", annual_cash_rate: "Cash interest", funded_term_face_cents: "Funded debt", exit_multiple: "Exit multiple"};
  const cellMetric = (cell: PESensitivityCell, suffix: string, label: string, value: string): Metric => {const registry = registeredMetric(caseData, `${caseData.caseId}-${cell.cell_id}-${suffix}`); return {metric_id: registry.metric_id, label, value: registry.display_value || value, detail: "Independent full-model sensitivity rerun with formula-bound operands.", classification: registry.classification, lineage: registry.source_locator_ids.map((id) => id.replace(/^locator-/, "")), registry};};
  return <section id="sensitivity" className="finance-panel sensitivity-book" aria-labelledby="sensitivity-title">
    <div className="panel-heading"><div><p className="kicker">Full-model recomputation</p><h3 id="sensitivity-title">Sensitivity book</h3></div><button type="button" className="text-action" onClick={() => {const nextAxis = book.axis_order[0]; const nextCells = book.one_way.filter((item) => item.axis === nextAxis); onRouteState?.({driver: nextAxis, cell: nextCells[1]?.cell_id ?? nextCells[0]?.cell_id});}}>Reset</button></div>
    <div className="sensitivity-controls"><label htmlFor="axis">Driver</label><select id="axis" value={axis} onChange={(event) => {const nextAxis = event.target.value; const nextCells = book.one_way.filter((item) => item.axis === nextAxis); const nextCell = nextCells[1]?.cell_id ?? nextCells[0]?.cell_id; onRouteState?.({driver: nextAxis, cell: nextCell});}}>{book.axis_order.map((item) => <option key={item} value={item}>{axisLabels[item] ?? item}</option>)}</select><div className="scenario-tabs">{cells.map((item) => <button key={item.cell_id} aria-pressed={item.cell_id === selected?.cell_id} onClick={() => onRouteState?.({driver: axis, cell: item.cell_id})}>{item.assumption_label}</button>)}</div></div>
    {selected && <div className="finance-metric-grid sensitivity-result">
      <MetricButton metric={cellMetric(selected, "irr", "Gross IRR", percent(selected.gross_xirr))} openMetric={openMetric} />
      <MetricButton metric={cellMetric(selected, "moic", "Gross MOIC", multiple(selected.gross_moic))} openMetric={openMetric} />
      <MetricButton metric={cellMetric(selected, "debt", "Exit debt", money(selected.ending_debt_cents))} openMetric={openMetric} />
      <MetricButton metric={cellMetric(selected, "headroom", "Min. headroom", leverage(selected.minimum_covenant_headroom))} openMetric={openMetric} />
    </div>}
    <div className="table-wrap matrix-wrap" tabIndex={0}><table><caption>Entry EV × exit multiple · formula-bound gross IRR / MOIC</caption><thead><tr><th>Entry / exit</th><th>5.5x</th><th>6.5x</th><th>7.5x</th></tr></thead><tbody>{["$200M", "$210M", "$220M"].map((entry) => <tr key={entry}><th scope="row">{entry}</th>{["5.5x", "6.5x", "7.5x"].map((exit) => {const cell = book.entry_exit_matrix.find((item) => item.assumption_label === `${entry} / ${exit}`); return <td key={exit}>{cell ? <div className="matrix-cell"><button onClick={(event) => openMetric(cellMetric(cell, "irr", `${entry} / ${exit} gross IRR`, percent(cell.gross_xirr)), event.currentTarget)}>{percent(cell.gross_xirr)}</button><button onClick={(event) => openMetric(cellMetric(cell, "moic", `${entry} / ${exit} gross MOIC`, multiple(cell.gross_moic)), event.currentTarget)}><small>{multiple(cell.gross_moic)}</small></button></div> : "—"}</td>;})}</tr>)}</tbody></table></div>
  </section>;
}

export function PEUnderwritingRoom({caseData, openMetric, routeState, onRouteState}: {caseData: CaseData; openMetric: OpenMetric; routeState?: {scenario?: string | null; compare?: string | null; driver?: string | null; cell?: string | null}; onRouteState?: (state: {scenario?: string; compare?: string; driver?: string; cell?: string}) => void}) {
  const engine = caseData.peEngine;
  const validScenario = routeState?.scenario && ["ask", "selected", "downside"].includes(routeState.scenario) ? routeState.scenario as ScenarioKey : "selected";
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>(validScenario);
  useEffect(() => setScenarioKey(validScenario), [caseData.caseId, validScenario]);
  if (!engine) return null;
  const scenario = engine[scenarioKey];
  const labels: Record<ScenarioKey, string> = {ask: "Seller ask", selected: "Selected", downside: "Downside"};
  const compareKey = routeState?.compare && ["ask", "selected", "downside"].includes(routeState.compare) ? routeState.compare as ScenarioKey : "downside";
  const comparison = engine[compareKey];
  const transaction = scenario.engine_inputs.transaction;
  const earnoutThreshold = Number(transaction.earnout_threshold_arr_cents ?? 0);
  const earnoutCap = Number(transaction.earnout_cap_cents ?? 0);
  return <div className="view-stack pe-room">
    <section className="underwriting-head"><div><p className="kicker">Cash-flow underwriting · {labels[scenarioKey]} basis</p><h2>Price, leverage, and downside</h2><p>Every selected state is a retained full-model result. Dated cash flows, debt, covenants, exit proceeds, MOIC, and XIRR reconcile before display.</p></div><div><div className="scenario-tabs">{(["ask", "selected", "downside"] as ScenarioKey[]).map((item) => <button key={item} aria-pressed={item === scenarioKey} onClick={() => {setScenarioKey(item); onRouteState?.({scenario: item});}}>{labels[item]}</button>)}</div><label className="compare-control">Compare with <select value={compareKey} onChange={(event) => onRouteState?.({compare: event.target.value})}>{(["ask", "selected", "downside"] as ScenarioKey[]).map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></label></div></section>
    <section className="scenario-comparison" aria-label="Side-by-side scenario comparison"><article><span>Selected · {labels[scenarioKey]}</span><strong>{percent(scenario.gross_xirr)} / {multiple(scenario.gross_moic)}</strong><small>{money(scenario.debt_schedule.ending_debt_cents)} exit debt</small></article><article><span>Comparison · {labels[compareKey]}</span><strong>{percent(comparison.gross_xirr)} / {multiple(comparison.gross_moic)}</strong><small>{money(comparison.debt_schedule.ending_debt_cents)} exit debt</small></article></section>
    <ChartRegistryCaption caseData={caseData} location="Underwriting Room" conclusion={`${labels[scenarioKey]} exits with ${money(scenario.debt_schedule.ending_debt_cents)} debt and ${scenario.debt_schedule.first_covenant_breach_month ? `first breaches in month ${scenario.debt_schedule.first_covenant_breach_month}` : "has no modeled covenant breach"}.`} />
    <section className="terms-ribbon">
      <MetricButton metric={financeMetric(caseData, scenario, "entry", "Upfront EV", money(scenario.sources_and_uses.uses_cents.cash_enterprise_value), "Cash enterprise value in the selected sources-and-uses schedule.")} openMetric={openMetric} />
      <MetricButton metric={financeMetric(caseData, scenario, "max-bid", "Maximum bid", money(engine.maximum_bid_cents), "One-cent boundary solving the frozen 22% IRR and 2.0x MOIC hurdles with other selected terms fixed.")} openMetric={openMetric} />
      <MetricButton metric={financeMetric(caseData, scenario, "earnout-terms", "Earnout threshold / cap", `${money(earnoutThreshold)} / ${money(earnoutCap)}`, "Verified live ARR at month 24; funded as additional sponsor equity at month 25.")} openMetric={openMetric} />
      <MetricButton metric={financeMetric(caseData, scenario, "debt-funded", "Funded term debt", money(Number(transaction.funded_term_face_cents ?? 0)), "Funded face amount; net OID proceeds appear in sources.")} openMetric={openMetric} />
    </section>
    <div className="finance-layout"><SourcesUses caseData={caseData} scenario={scenario} openMetric={openMetric} /><ExitBridge caseData={caseData} scenario={scenario} openMetric={openMetric} /></div>
    <DebtCovenant caseData={caseData} scenario={scenario} openMetric={openMetric} />
    <aside className="epistemic-note"><strong>Sensitivity basis: selected operating and financing case</strong><span>Sensitivity cells are independent full-model reruns and do not inherit the scenario tab above.</span></aside><SensitivityBook caseData={caseData} openMetric={openMetric} routeState={routeState} onRouteState={onRouteState} />
  </div>;
}

export function PESnapshotTerms({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  const selected = caseData.peEngine?.selected;
  const downside = caseData.peEngine?.downside;
  if (!selected || !downside) return null;
  return <section className="terms-ribbon vc-snapshot-terms" aria-label="Proposed modeled buyout terms and returns">
    <MetricButton metric={financeMetric(caseData, selected, "entry", "Upfront EV", money(selected.sources_and_uses.uses_cents.cash_enterprise_value), "Selected cash enterprise value before the contingent earnout.")} openMetric={openMetric} />
    <MetricButton metric={financeMetric(caseData, selected, "debt-funded", "Funded term debt", "", "Funded term debt at close; undrawn revolver is excluded from sources.")} openMetric={openMetric} />
    <MetricButton metric={financeMetric(caseData, selected, "earnout-terms", "Earnout threshold / cap", "", "Month-24 verified live ARR threshold and maximum contingent payment.")} openMetric={openMetric} />
    <MetricButton metric={financeMetric(caseData, selected, "gross-irr", "Gross IRR", percent(selected.gross_xirr), "Dated gross-to-sponsor XIRR under the selected structure.")} openMetric={openMetric} />
    <MetricButton metric={financeMetric(caseData, downside, "gross-irr", "Downside gross IRR", percent(downside.gross_xirr), "Dated downside gross-to-sponsor XIRR under the retained churn and multiple-compression case.")} openMetric={openMetric} />
  </section>;
}

export function PEValueCreation({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  const bridge = caseData.valueCreationBridge;
  if (!bridge) return null;
  const maximum = Math.max(...bridge.standalone.map((item) => Math.abs(item.exit_equity_delta_cents)), Math.abs(bridge.interaction_residual_cents), 1);
  return <div className="view-stack">
    <section className="value-head"><p className="kicker">Diligence to Day 1</p><h2>Value creation reconciles into sponsor equity</h2><p>Each lever is a full operating, debt, and return recomputation. Synthetic causal evidence and human assumptions are labeled separately.</p></section>
    <ChartRegistryCaption caseData={caseData} location="Value Creation" />
    <section className="value-waterfall" aria-labelledby="value-waterfall-title">
      <div className="panel-heading"><div><p className="kicker">Standalone effects + interaction</p><h3 id="value-waterfall-title">Exit-equity value bridge</h3></div><span>Double-count controlled</span></div>
      {bridge.standalone.map((item) => {
        const prefix = `atlasgrid-value-${item.lever_id}`;
        return <article key={item.lever_id}><div><span>{item.label}</span><small>{item.credit_classification.replaceAll("_", " ")}</small></div><div className="waterfall-track"><span style={{width: `${Math.max(2, Math.abs(item.exit_equity_delta_cents) / maximum * 100)}%`}} /></div><InlineMetricButton caseData={caseData} metricId={`${prefix}-exit_equity_delta_cents`} detail="Standalone full-model exit-equity delta before the interaction residual." openMetric={openMetric} /><dl><div><dt>Exit EBITDA</dt><dd><InlineMetricButton caseData={caseData} metricId={`${prefix}-exit_ebitda_delta_cents`} detail="Standalone exit EBITDA change after implementation cost." openMetric={openMetric} /></dd></div><div><dt>Exit debt</dt><dd><InlineMetricButton caseData={caseData} metricId={`${prefix}-exit_debt_delta_cents`} detail="Standalone change in month-60 debt." openMetric={openMetric} /></dd></div><div><dt>IRR</dt><dd><InlineMetricButton caseData={caseData} metricId={`${prefix}-gross_xirr_delta`} detail="Standalone change in gross sponsor XIRR." openMetric={openMetric} /></dd></div><div><dt>Cost</dt><dd><InlineMetricButton caseData={caseData} metricId={`${prefix}-implementation_cost_cents`} detail="Modeled cash implementation cost." openMetric={openMetric} /></dd></div></dl></article>;
      })}
      <article className="interaction"><div><span>Interaction residual</span><small>Explicit double-count control</small></div><div className="waterfall-track"><span style={{width: `${Math.max(2, Math.abs(bridge.interaction_residual_cents) / maximum * 100)}%`}} /></div><InlineMetricButton caseData={caseData} metricId="atlasgrid-value-interaction" detail="Combined full-model result less the sum of standalone exit-equity deltas." openMetric={openMetric} /></article>
      <footer><span>Combined exit-equity impact</span><InlineMetricButton caseData={caseData} metricId="atlasgrid-value-combined" detail={`Combined full-model result less base; standalone sum ${money(bridge.sum_standalone_exit_equity_delta_cents)} with interaction ${money(bridge.interaction_residual_cents)} shown separately.`} openMetric={openMetric} /></footer>
    </section>
    <ValuePlanDetails caseData={caseData} openMetric={openMetric} />
    <section aria-labelledby="pe-cadence-title"><div className="section-heading"><p className="kicker">Pre-close to board control</p><h2 id="pe-cadence-title">Ownership cadence</h2></div><div className="ownership-cadence">{caseData.ownershipCadence.map((item) => <article key={item.phase}><span>{item.phase}</span><small>{item.timing}</small><h3>{item.milestone}</h3><dl><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Board KPI</dt><dd>{item.kpi}</dd></div><div><dt>Stop rule</dt><dd>{item.stop_rule}</dd></div></dl></article>)}</div></section>
  </div>;
}
