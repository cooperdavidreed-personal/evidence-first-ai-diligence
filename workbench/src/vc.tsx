import {useEffect, useMemo, useState} from "react";
import {ChartRegistryCaption} from "./chart-registry";
import {registeredMetric} from "./data-contract";
import type {CaseData, Metric, VCSensitivityCell, VCScenarioResult} from "./types";

type OpenMetric = (metric: Metric, trigger: HTMLElement) => void;
type ScenarioKey = "base" | "milestone" | "downside" | "financing_shortfall";

const money = (cents: number) => {
  const millions = cents / 100_000_000;
  return `${millions < 0 ? "−" : ""}$${Math.abs(millions).toLocaleString(undefined, {maximumFractionDigits: 1})}M`;
};
const percent = (value: string) => `${(Number(value) * 100).toFixed(1)}%`;
const multiple = (value: string) => `${Number(value).toFixed(2)}x`;

function boundMetric(caseData: CaseData, metricId: string, detail: string): Metric {
  const registry = registeredMetric(caseData, metricId);
  return {
    metric_id: registry.metric_id,
    label: registry.label,
    value: registry.display_value,
    detail,
    classification: registry.classification,
    lineage: registry.source_locator_ids.map((item) => item.replace(/^locator-/, "")),
    registry,
  };
}

function BoundValue({caseData, metricId, detail, openMetric}: {caseData: CaseData; metricId: string; detail: string; openMetric: OpenMetric}) {
  const metric = boundMetric(caseData, metricId, detail);
  return <button className="inline-finance-value" data-metric-id={metricId} aria-label={`Inspect lineage for ${metric.label}`} onClick={(event) => openMetric(metric, event.currentTarget)}>{metric.value}<small>↗</small></button>;
}

function BoundCard({caseData, metricId, detail, openMetric}: {caseData: CaseData; metricId: string; detail: string; openMetric: OpenMetric}) {
  const metric = boundMetric(caseData, metricId, detail);
  return <button className="finance-metric" data-metric-id={metricId} aria-label={`Inspect lineage for ${metric.label} ${metric.value}`} onClick={(event) => openMetric(metric, event.currentTarget)}><span>{metric.label}</span><strong>{metric.value}</strong><small>Inspect lineage ↗</small></button>;
}

function FinancingTimeline({caseData, result, prefix, openMetric}: {caseData: CaseData; result: VCScenarioResult; prefix: string; openMetric: OpenMetric}) {
  return <section className="finance-panel vc-event-panel" aria-labelledby="vc-events-title">
    <div className="panel-heading"><div><p className="kicker">Dated capital formation</p><h3 id="vc-events-title">Financing-event ledger</h3></div><code>{result.engine_inputs_sha256.slice(0, 12)}…</code></div>
    <div className="vc-event-track">{result.financing_events.map((event) => <article key={event.event_id} data-state={event.status}><span>M{event.actual_month}</span><strong>{event.event_type.replaceAll("_", " ")}</strong><small>{event.class_id} · {event.status.replaceAll("_", " ")}</small><BoundValue caseData={caseData} metricId={`${prefix}-event-${event.event_id}-new-money`} detail={`Exact funded capital for ${event.event_id}; unfunded tranches issue no shares or preference.`} openMetric={openMetric} /></article>)}</div>
    <div className="table-wrap" tabIndex={0}><table><caption>Every event changes capitalization only when funded</caption><thead><tr><th>Event</th><th>Capital</th><th>New shares</th><th>Pool top-up</th><th>Fully diluted</th><th>Receipt</th></tr></thead><tbody>{result.financing_events.map((event) => {const eventPrefix = `${prefix}-event-${event.event_id}`; return <tr key={event.event_id}><th scope="row">{event.event_id}<small>{event.date}</small></th><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-new-money`} detail="Integer-cent funded cash from the event receipt." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-new_shares`} detail="Whole shares issued at the exact rational price; fractional cash is APIC." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-pool_top_up_shares`} detail="Smallest integer option-pool top-up that clears the frozen target." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-fully_diluted_after`} detail="Issued shares plus the unissued option pool after the event." openMetric={openMetric} /></td><td><code>{event.event_sha256.slice(0, 9)}…</code></td></tr>;})}</tbody></table></div>
  </section>;
}

function CashRunway({caseData, result, prefix, openMetric}: {caseData: CaseData; result: VCScenarioResult; prefix: string; openMetric: OpenMetric}) {
  const maximum = Math.max(...result.cash_by_month.map((item) => item.ending_cash_cents), 1);
  const annual = result.cash_by_month.filter((item) => item.month === 1 || item.month % 12 === 0);
  return <section className="finance-panel vc-cash-panel" aria-labelledby="vc-cash-title">
    <div className="panel-heading"><div><p className="kicker">Signed monthly cash schedule</p><h3 id="vc-cash-title">Runway and financing need</h3></div><span>{result.first_cash_exhaustion_month_without_contingent_financing ? `Shortfall M${result.first_cash_exhaustion_month_without_contingent_financing}` : "Funded through exit"}</span></div>
    <div className="debt-tape vc-cash-tape" aria-label="Sixty month ending cash profile">{result.cash_by_month.map((item) => <span key={item.month} className={item.first_exhaustion_without_contingent ? "breach" : ""} style={{height: `${Math.max(3, item.ending_cash_cents / maximum * 100)}%`}} title={`Month ${item.month}: ${money(item.ending_cash_cents)}`} />)}</div>
    <div className="finance-metric-grid"><BoundCard caseData={caseData} metricId={`${prefix}-minimum-cash`} detail="Minimum exact ending cash across the monthly schedule." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-ownership`} detail="Series C fully diluted ownership after every funded event and pool refresh." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-unissued-pool`} detail="Unissued pool remains in the financing denominator but receives zero exit proceeds." openMetric={openMetric} /></div>
    <details><summary>Open annual cash workpaper</summary><div className="table-wrap" tabIndex={0}><table><thead><tr><th>Month</th><th>Beginning cash</th><th>Financing</th><th>Operating cash flow</th><th>Ending cash</th></tr></thead><tbody>{annual.map((row) => {const monthPrefix = `${prefix}-month-${String(row.month).padStart(2, "0")}`; return <tr key={row.month}><th scope="row">{row.month}</th><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-beginning_cash_cents`} detail="Prior-month ending cash, or cutoff cash in month one." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-financing_cash_cents`} detail="Only funded event cash posted at month opening." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-operating_net_cash_flow_cents`} detail="Signed monthly operating free cash flow assumption." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-ending_cash_cents`} detail="Beginning cash plus financing cash plus signed operating cash flow." openMetric={openMetric} /></td></tr>;})}</tbody></table></div></details>
  </section>;
}

function CapTableAndWaterfall({caseData, result, prefix, openMetric}: {caseData: CaseData; result: VCScenarioResult; prefix: string; openMetric: OpenMetric}) {
  return <div className="finance-layout">
    <section className="finance-panel" aria-labelledby="vc-cap-title"><div className="panel-heading"><div><p className="kicker">Holder-by-holder dilution</p><h3 id="vc-cap-title">Post-event cap table</h3></div><code>{result.receipt_sha256.slice(0, 12)}…</code></div><table><thead><tr><th>Holder</th><th>Class</th><th>Issued shares</th></tr></thead><tbody>{result.holders.map((holder) => <tr key={holder.holder_id}><th scope="row">{holder.holder_id}</th><td>{holder.class_id}</td><td><BoundValue caseData={caseData} metricId={`${prefix}-holder-${holder.holder_id}-shares`} detail="Integer issued shares after every financing event in this scenario." openMetric={openMetric} /></td></tr>)}</tbody></table></section>
    <section className="finance-panel" aria-labelledby="vc-waterfall-title"><div className="panel-heading"><div><p className="kicker">Exact preference election</p><h3 id="vc-waterfall-title">Exit waterfall</h3></div><code>{result.waterfall.receipt_sha256.slice(0, 12)}…</code></div><table><thead><tr><th>Class</th><th>Election</th><th>Proceeds</th></tr></thead><tbody>{Object.entries(result.waterfall.class_proceeds_cents).map(([classId]) => <tr key={classId}><th scope="row">{classId}</th><td>{result.waterfall.conversion_profile[classId] ? "CONVERT" : "PREFERENCE"}</td><td><BoundValue caseData={caseData} metricId={`${prefix}-waterfall-${classId.toLowerCase()}-proceeds`} detail="Exact-cent class proceeds after independent conversion elections, seniority, participation, and cap." openMetric={openMetric} /></td></tr>)}<tr><th scope="row">COMMON</th><td>Residual</td><td><BoundValue caseData={caseData} metricId={`${prefix}-waterfall-common`} detail="Issued common residual; the unissued option pool receives zero proceeds." openMetric={openMetric} /></td></tr></tbody></table></section>
  </div>;
}

function SensitivityBook({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  const book = caseData.vcEngine!.sensitivities;
  const [axis, setAxis] = useState(book.axis_order[0]);
  const cells = useMemo(() => book.cells.filter((item) => item.axis === axis), [book, axis]);
  const [selectedId, setSelectedId] = useState(cells[1]?.cell_id ?? cells[0]?.cell_id ?? "");
  useEffect(() => setSelectedId(cells[1]?.cell_id ?? cells[0]?.cell_id ?? ""), [axis, cells]);
  const selected = cells.find((item) => item.cell_id === selectedId) ?? cells[0];
  const labels: Record<VCSensitivityCell["axis"], string> = {exit_value: "Exit value", exit_date: "Exit date", later_round_price: "Later-round price", milestone_state: "Milestone state"};
  const card = (suffix: string, detail: string) => <BoundCard caseData={caseData} metricId={`helios-${selected.cell_id}-${suffix}`} detail={`${detail} Full engine rerun ${selected.result_receipt_sha256}.`} openMetric={openMetric} />;
  return <section className="finance-panel sensitivity-book" aria-labelledby="vc-sensitivity-title"><div className="panel-heading"><div><p className="kicker">Full-model recomputation</p><h3 id="vc-sensitivity-title">VC sensitivity book</h3></div><code>{book.receipt_sha256.slice(0, 12)}…</code></div><div className="sensitivity-controls"><label htmlFor="vc-axis">Driver</label><select id="vc-axis" value={axis} onChange={(event) => setAxis(event.target.value as VCSensitivityCell["axis"])}>{book.axis_order.map((item) => <option value={item} key={item}>{labels[item]}</option>)}</select><div className="scenario-tabs">{cells.map((item) => <button key={item.cell_id} aria-pressed={item.cell_id === selected.cell_id} onClick={() => setSelectedId(item.cell_id)}>{item.assumption_label}</button>)}</div></div><div className="finance-metric-grid sensitivity-result">{card("gross-xirr", "Dated gross-to-investor XIRR.")}{card("gross-moic", "Gross proceeds divided by funded capital.")}{card("ownership", "Fully diluted Series C ownership.")}{card("minimum-cash", "Minimum monthly ending cash.")}</div></section>;
}

export function VCUnderwritingRoom({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  const engine = caseData.vcEngine;
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("milestone");
  useEffect(() => setScenarioKey("milestone"), [caseData.caseId]);
  if (!engine) return null;
  const result = engine[scenarioKey];
  const exitBridge = engine.operating_exit_bridges[scenarioKey];
  const prefix = `helios-${result.scenario_id}`;
  const labels: Record<ScenarioKey, string> = {base: "Base", milestone: "Milestones clear", downside: "Down round", financing_shortfall: "Shortfall bridge"};
  return <div className="view-stack pe-room vc-room">
    <section className="underwriting-head"><div><p className="kicker">Venture financing · exact event ledger</p><h2>Terms, ownership, runway, and preferences</h2><p>Every tab and sensitivity is a retained Python-engine rerun. Unfunded tranches contribute no cash, shares, preference, or investor outflow.</p></div><div className="scenario-tabs">{(Object.keys(labels) as ScenarioKey[]).map((item) => <button key={item} aria-pressed={item === scenarioKey} onClick={() => setScenarioKey(item)}>{labels[item]}</button>)}</div></section>
    <ChartRegistryCaption caseData={caseData} location="Underwriting Room" />
    <section className="terms-ribbon"><BoundCard caseData={caseData} metricId={`${prefix}-target-invested`} detail="Total Series C cash actually funded in the selected scenario." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-ownership`} detail="Series C fully diluted ownership after event-by-event dilution." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-gross-xirr`} detail="Irregular-date gross-to-investor XIRR; not MOIC CAGR." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-gross-moic`} detail="Exact exit proceeds divided by funded Series C cash." openMetric={openMetric} /></section>
    <aside className="engine-receipt"><span>Selected engine receipt</span><code>{result.receipt_sha256}</code><strong>{engine.exit_value_basis.replaceAll("_", " ")}</strong></aside>
    <section className="finance-panel" aria-labelledby="vc-exit-bridge-title"><div className="panel-heading"><div><p className="kicker">Operating case → terminal value</p><h3 id="vc-exit-bridge-title">Five-year exit valuation bridge</h3></div><span>Scenario · not a forecast</span></div><div className="finance-metric-grid"><article><span>Observed LTM revenue</span><strong>{money(exitBridge.observed_ltm_revenue_cents)}</strong><small>Committed monthly P&amp;L</small></article><article><span>Annual growth / hold</span><strong>{percent(exitBridge.annual_revenue_growth)} · {exitBridge.years}y</strong><small>Declared scenario assumption</small></article><article><span>Terminal revenue / multiple</span><strong>{money(exitBridge.terminal_revenue_cents)} · {multiple(exitBridge.exit_revenue_multiple)}</strong><small>Revenue × (1 + growth)<sup>{exitBridge.years}</sup></small></article><article><span>Exit equity value</span><strong>{money(exitBridge.exit_equity_value_cents)}</strong><small>Enterprise value less {money(exitBridge.net_debt_cents)} net debt</small></article></div><p className="assumption">This bridge supplies the exact equity-value operand consumed by the preference waterfall and investor-return engine.</p></section>
    <FinancingTimeline caseData={caseData} result={result} prefix={prefix} openMetric={openMetric} />
    <CashRunway caseData={caseData} result={result} prefix={prefix} openMetric={openMetric} />
    <CapTableAndWaterfall caseData={caseData} result={result} prefix={prefix} openMetric={openMetric} />
    <section className="finance-panel milestone-ledger" aria-labelledby="milestone-title"><div className="panel-heading"><div><p className="kicker">Executable second tranche</p><h3 id="milestone-title">Milestone test ledger</h3></div><span>M{engine.milestone_contract.test_month} · {engine.milestone_contract.cure_period_days}-day cure</span></div><div className="milestone-grid">{engine.milestone_contract.tests.map((item) => <article key={item.metric_id}><strong>{item.metric_id}</strong><span>{item.operator} {item.threshold}</span><small>{item.period}</small></article>)}</div><p>{engine.milestone_contract.release_rule.replaceAll("_", " ")} · evaluator {engine.milestone_contract.evaluator.replaceAll("_", " ")} · failure: {engine.milestone_contract.failure_consequence.replaceAll("_", " ")}</p></section>
    <SensitivityBook caseData={caseData} openMetric={openMetric} />
  </div>;
}

export function VCSnapshotTerms({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  if (!caseData.vcEngine) return null;
  return <section className="terms-ribbon vc-snapshot-terms" aria-label="Executable venture terms and returns"><BoundCard caseData={caseData} metricId="helios-MILESTONE-target-invested" detail="$25M first close plus the funded $15M milestone tranche in the selected case." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-MILESTONE-ownership" detail="Fully funded Series C ownership after the pre-money option-pool refresh." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-BASE-gross-xirr" detail="Base case with the milestone tranche withheld and a planned Series D." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-DOWNSIDE-gross-xirr" detail="Down-round case gross-to-investor dated XIRR." openMetric={openMetric} /></section>;
}

export function VCValueCreation({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  const selected = caseData.vcEngine?.milestone;
  const bridge = caseData.vcValueCreationBridge;
  if (!selected || !bridge) return null;
  return <div className="view-stack"><section className="value-head"><p className="kicker">Board-owned operating plan</p><h2>Value creation changes runway, dilution, and investor return</h2><p>Each lever is a complete cash, financing, waterfall, and return rerun. Identified synthetic effects are narrowly credited; unidentified effects receive zero base-case credit.</p></section><section className="terms-ribbon"><BoundCard caseData={caseData} metricId="helios-value-combined_minimum_cash_delta_cents" detail="Combined full-model change in minimum cash after all implementation costs." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-value-combined_target_proceeds_delta_cents" detail="Combined change in Series C exact waterfall proceeds." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-value-combined-gross-xirr-delta" detail="Combined change in dated gross XIRR." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-value-interaction_residual_cents" detail="Combined target-proceeds delta less the sum of standalone deltas." openMetric={openMetric} /></section><section className="value-waterfall vc-value-waterfall" aria-labelledby="vc-value-title"><div className="panel-heading"><div><p className="kicker">Standalone effects + interaction</p><h3 id="vc-value-title">Investor-proceeds bridge</h3></div><code>{bridge.receipt_sha256.slice(0, 12)}…</code></div>{bridge.standalone.map((lever, index) => {const narrative = caseData.valueCreation[index]; const prefix = `helios-value-${lever.lever_id}`; return <article key={lever.lever_id}><div><span>{narrative.initiative}</span><small>{lever.credit_classification.replaceAll("_", " ")}</small></div><div className="waterfall-track"><span style={{width: `${Math.max(2, Math.min(100, Math.abs(lever.target_proceeds_delta_cents) / Math.max(1, Math.abs(bridge.combined_target_proceeds_delta_cents)) * 100))}%`}} /></div><BoundValue caseData={caseData} metricId={`${prefix}-target_proceeds_delta_cents`} detail="Standalone change in Series C exact waterfall proceeds." openMetric={openMetric} /><dl><div><dt>Minimum cash</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-minimum_cash_delta_cents`} detail="Standalone change in minimum cash after implementation cost." openMetric={openMetric} /></dd></div><div><dt>Gross XIRR</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-gross-xirr-delta`} detail="Standalone dated-XIRR impact." openMetric={openMetric} /></dd></div><div><dt>Gross MOIC</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-gross-moic-delta`} detail="Standalone MOIC impact." openMetric={openMetric} /></dd></div><div><dt>Cost</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-implementation_cost_cents`} detail="Month-one implementation cash cost." openMetric={openMetric} /></dd></div></dl></article>;})}<article className="interaction"><div><span>Interaction residual</span><small>Explicit double-count control</small></div><div className="waterfall-track"><span style={{width: `${Math.max(2, Math.min(100, Math.abs(bridge.interaction_residual_cents) / Math.max(1, Math.abs(bridge.combined_target_proceeds_delta_cents)) * 100))}%`}} /></div><BoundValue caseData={caseData} metricId="helios-value-interaction_residual_cents" detail="Combined proceeds effect less the sum of standalone proceeds effects." openMetric={openMetric} /></article></section><section className="initiative-list">{caseData.valueCreation.map((item, index) => <article key={item.initiative}><span className="initiative-number">0{index + 1}</span><div className="initiative-title"><h3>{item.initiative}</h3><p>{item.owner}</p><small>{item.credit_classification?.replaceAll("_", " ")}</small></div><dl><div><dt>KPI</dt><dd>{item.kpi}</dd></div><div><dt>Baseline → target</dt><dd>{item.baseline} → <span className="human-assumption">{item.target} · human assumption</span></dd></div><div><dt>Milestone / stop</dt><dd>{item.milestone}</dd></div><div><dt>Modeled consequence</dt><dd>{item.value}</dd></div><div><dt>Principal risk</dt><dd>{item.risk}</dd></div></dl></article>)}</section><section aria-labelledby="vc-cadence-title"><div className="section-heading"><p className="kicker">Pre-close to board control</p><h2 id="vc-cadence-title">Ownership cadence</h2></div><div className="ownership-cadence">{caseData.ownershipCadence.map((item) => <article key={item.phase}><span>{item.phase}</span><small>{item.timing}</small><h3>{item.milestone}</h3><dl><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Board KPI</dt><dd>{item.kpi}</dd></div><div><dt>Stop rule</dt><dd>{item.stop_rule}</dd></div></dl></article>)}</div></section></div>;
}
