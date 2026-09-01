import {useEffect, useState} from "react";
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
const multiple = (value: string) => `${Number(value).toFixed(1)}x`;

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

function BoundCard({caseData, metricId, detail, openMetric, label}: {caseData: CaseData; metricId: string; detail: string; openMetric: OpenMetric; label?: string}) {
  const metric = boundMetric(caseData, metricId, detail);
  const displayMetric = label ? {...metric, label} : metric;
  return <button className="finance-metric" data-metric-id={metricId} aria-label={`Inspect lineage for ${displayMetric.label} ${displayMetric.value}`} onClick={(event) => openMetric(displayMetric, event.currentTarget)}><span>{displayMetric.label}</span><strong>{displayMetric.value}</strong><small>Inspect lineage ↗</small></button>;
}

function FinancingTimeline({caseData, result, prefix, openMetric}: {caseData: CaseData; result: VCScenarioResult; prefix: string; openMetric: OpenMetric}) {
  return <section id="financing-events" className="finance-panel vc-event-panel" aria-labelledby="vc-events-title">
    <div className="panel-heading"><div><p className="kicker">Dated capital formation</p><h3 id="vc-events-title">Financing-event ledger</h3></div><span>Funded events only</span></div>
    <div className="vc-event-track">{result.financing_events.map((event) => <article key={event.event_id} data-state={event.status}><span>M{event.actual_month}</span><strong>{event.event_type.replaceAll("_", " ")}</strong><small>{event.class_id} · {event.status.replaceAll("_", " ")}</small><BoundValue caseData={caseData} metricId={`${prefix}-event-${event.event_id}-new-money`} detail={`Exact funded capital for ${event.event_id}; unfunded tranches issue no shares or preference.`} openMetric={openMetric} /></article>)}</div>
    <div className="table-wrap" tabIndex={0}><table><caption>Every event changes capitalization only when funded</caption><thead><tr><th>Event</th><th>Capital</th><th>New shares</th><th>Pool top-up</th><th>Fully diluted</th><th>Status</th></tr></thead><tbody>{result.financing_events.map((event) => {const eventPrefix = `${prefix}-event-${event.event_id}`; return <tr key={event.event_id}><th scope="row">{event.event_id}<small>{event.date}</small></th><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-new-money`} detail="Integer-cent funded cash from the retained event." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-new_shares`} detail="Whole shares issued at the exact rational price; fractional cash is APIC." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-pool_top_up_shares`} detail="Smallest integer option-pool top-up that clears the frozen target." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${eventPrefix}-fully_diluted_after`} detail="Issued shares plus the unissued option pool after the event." openMetric={openMetric} /></td><td>{event.status.replaceAll("_", " ")}</td></tr>;})}</tbody></table></div>
  </section>;
}

function CashRunway({caseData, result, prefix, openMetric}: {caseData: CaseData; result: VCScenarioResult; prefix: string; openMetric: OpenMetric}) {
  const maximum = Math.max(...result.cash_by_month.map((item) => item.ending_cash_cents), 1);
  const annual = result.cash_by_month.filter((item) => item.month === 1 || item.month % 12 === 0);
  return <section id="cash" className="finance-panel vc-cash-panel" aria-labelledby="cash">
    <div className="panel-heading"><div><p className="kicker">Signed monthly cash schedule</p><h3 id="cash" tabIndex={-1}>Runway and financing need</h3></div><span>{result.first_cash_exhaustion_month_without_contingent_financing ? `Shortfall M${result.first_cash_exhaustion_month_without_contingent_financing}` : "Funded through exit"}</span></div>
    <div className="debt-tape vc-cash-tape" aria-label="Sixty month ending cash profile">{result.cash_by_month.map((item) => <span key={item.month} className={item.first_exhaustion_without_contingent ? "breach" : ""} style={{height: `${Math.max(3, item.ending_cash_cents / maximum * 100)}%`}} title={`Month ${item.month}: ${money(item.ending_cash_cents)}`} />)}</div>
    <div className="finance-metric-grid"><BoundCard caseData={caseData} metricId={`${prefix}-minimum-cash`} detail="Minimum exact ending cash across the monthly schedule." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-ownership`} detail="Series C fully diluted ownership after every funded event and pool refresh." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-unissued-pool`} detail={result.pool_exit_treatment === "FULLY_GRANTED_COMMON" ? "Unissued pool remains in the financing denominator and is treated as fully granted common at exit." : "Unissued pool is cancelled before exit and receives no proceeds."} openMetric={openMetric} /></div>
    <details><summary>Open annual cash workpaper</summary><div className="table-wrap" tabIndex={0}><table><thead><tr><th>Month</th><th>Beginning cash</th><th>Financing</th><th>Operating cash flow</th><th>Ending cash</th></tr></thead><tbody>{annual.map((row) => {const monthPrefix = `${prefix}-month-${String(row.month).padStart(2, "0")}`; return <tr key={row.month}><th scope="row">{row.month}</th><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-beginning_cash_cents`} detail="Prior-month ending cash, or cutoff cash in month one." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-financing_cash_cents`} detail="Only funded event cash posted at month opening." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-operating_net_cash_flow_cents`} detail="Signed monthly operating free cash flow assumption." openMetric={openMetric} /></td><td><BoundValue caseData={caseData} metricId={`${monthPrefix}-ending_cash_cents`} detail="Beginning cash plus financing cash plus signed operating cash flow." openMetric={openMetric} /></td></tr>;})}</tbody></table></div></details>
  </section>;
}

function CapTableAndWaterfall({caseData, result, prefix, openMetric}: {caseData: CaseData; result: VCScenarioResult; prefix: string; openMetric: OpenMetric}) {
  return <div className="finance-layout">
    <section className="finance-panel" aria-labelledby="vc-cap-title"><div className="panel-heading"><div><p className="kicker">Holder-by-holder dilution</p><h3 id="vc-cap-title">Post-event cap table</h3></div><span>Fully diluted</span></div><table><thead><tr><th>Holder</th><th>Class</th><th>Issued shares</th></tr></thead><tbody>{result.holders.map((holder) => <tr key={holder.holder_id}><th scope="row">{holder.holder_id}</th><td>{holder.class_id}</td><td><BoundValue caseData={caseData} metricId={`${prefix}-holder-${holder.holder_id}-shares`} detail="Integer issued shares after every financing event in this scenario." openMetric={openMetric} /></td></tr>)}</tbody></table></section>
    <section className="finance-panel" aria-labelledby="vc-waterfall-title"><div className="panel-heading"><div><p className="kicker">Exact preference election</p><h3 id="vc-waterfall-title">Exit waterfall</h3></div><span>Conversion election</span></div><table><thead><tr><th>Class</th><th>Election</th><th>Proceeds</th></tr></thead><tbody>{Object.entries(result.waterfall.class_proceeds_cents).map(([classId]) => <tr key={classId}><th scope="row">{classId}</th><td>{result.waterfall.conversion_profile[classId] ? "CONVERT" : "PREFERENCE"}</td><td><BoundValue caseData={caseData} metricId={`${prefix}-waterfall-${classId.toLowerCase()}-proceeds`} detail="Exact-cent class proceeds after independent conversion elections, seniority, participation, and cap." openMetric={openMetric} /></td></tr>)}<tr><th scope="row">COMMON</th><td>Residual</td><td><BoundValue caseData={caseData} metricId={`${prefix}-waterfall-common`} detail={result.pool_exit_treatment === "FULLY_GRANTED_COMMON" ? "Issued common plus the fully granted option pool share pro rata in residual proceeds." : "Issued common receives the residual after the unissued option pool is cancelled."} openMetric={openMetric} /></td></tr></tbody></table></section>
  </div>;
}

function SensitivityBook({caseData, openMetric, routeState, onRouteState}: {caseData: CaseData; openMetric: OpenMetric; routeState?: {driver?: string | null; cell?: string | null}; onRouteState?: (state: {driver?: string; cell?: string}) => void}) {
  const book = caseData.vcEngine!.sensitivities;
  const axis = routeState?.driver && book.axis_order.includes(routeState.driver as VCSensitivityCell["axis"]) ? routeState.driver as VCSensitivityCell["axis"] : book.default_axis;
  const cells = book.cells.filter((item) => item.axis === axis);
  const baselineId = book.baseline_cell_ids[axis];
  const selectedId = routeState?.cell && cells.some((item) => item.cell_id === routeState.cell) ? routeState.cell : baselineId;
  const selected = cells.find((item) => item.cell_id === selectedId) ?? cells.find((item) => item.is_baseline) ?? cells[0];
  const definition = book.axis_definitions.find((item) => item.axis === axis)!;
  const labels = Object.fromEntries(book.axis_definitions.map((item) => [item.axis, item.label])) as Record<VCSensitivityCell["axis"], string>;
  const card = (suffix: string, detail: string) => <BoundCard caseData={caseData} metricId={`helios-${selected.cell_id}-${suffix}`} detail={`${detail} Independent full-model rerun with formula-bound operands.`} openMetric={openMetric} />;
  const policy = caseData.vcEngine!.risk_policy;
  const lossRate = caseData.vcEngine!.distribution.probability_below_one;
  const lossStatus = Number(lossRate) <= Number(policy.maximum_probability_below_one) ? "clears" : "misses";
  return <section className="finance-panel sensitivity-book" aria-labelledby="vc-sensitivity-title"><div className="panel-heading"><div><p className="kicker">Operating-driver underwriting</p><h3 id="vc-sensitivity-title">VC sensitivity book</h3></div><button type="button" className="text-action" onClick={() => onRouteState?.({driver: book.default_axis, cell: book.default_cell_id})}>Reset</button></div><p className="assumption"><strong>{definition.label}:</strong> {definition.model_rule}. Baseline: {selected.baseline_scenario_id === "MILESTONE" ? "milestone path-to-yes case" : "base case with later financing"}. Every result remains <strong>HOLD</strong>; the canonical synthetic loss frequency of {percent(lossRate)} {lossStatus} the illustrative {percent(policy.maximum_probability_below_one)} ceiling.</p><div className="sensitivity-controls"><label htmlFor="vc-axis">Driver</label><select id="vc-axis" value={axis} onChange={(event) => {const nextAxis = event.target.value as VCSensitivityCell["axis"]; onRouteState?.({driver: nextAxis, cell: book.baseline_cell_ids[nextAxis]});}}>{book.axis_order.map((item) => <option value={item} key={item}>{labels[item]}</option>)}</select><div className="scenario-tabs">{cells.map((item) => <button key={item.cell_id} aria-pressed={item.cell_id === selected.cell_id} onClick={() => onRouteState?.({driver: axis, cell: item.cell_id})}>{item.assumption_label}{item.is_baseline ? " · baseline" : ""}</button>)}</div></div><div className="finance-metric-grid sensitivity-result">{card("terminal-revenue", "Terminal revenue derived from the selected operating driver.")}{card("exit-revenue-multiple", "Explicit revenue multiple applied to terminal revenue.")}{card("exit-equity-value", "Enterprise value plus exact modeled exit cash.")}{card("ownership", "Fully diluted Series C ownership.")}{card("gross-xirr", "Point-return test: dated gross-to-investor XIRR.")}{card("gross-moic", "Point-return test: gross proceeds divided by funded capital.")}</div><p className="decision-note"><strong>Binding posture: HOLD.</strong> A point-return or selected risk test clearing does not close the open diligence gates or authorize funding.</p></section>;
}

export function VCRiskAssumptionLab({caseData}: {caseData: CaseData}) {
  const engine = caseData.vcEngine!;
  const book = engine.risk_sensitivity;
  const canonical = book.cells.find((item) => item.cell_id === book.canonical_cell_id)!;
  const growthCells = engine.sensitivities.cells.filter((item) => item.axis === "annual_revenue_growth");
  const canonicalGrowth = Number(engine.operating_exit_bridges.milestone.annual_revenue_growth) * 100;
  const profileIds = [...new Set(book.cells.map((item) => item.profile_id))];
  const catastropheProbabilities = [...new Set(book.cells.map((item) => item.catastrophe_probability))];
  const [profileId, setProfileId] = useState(canonical.profile_id);
  const [catastropheProbability, setCatastropheProbability] = useState(canonical.catastrophe_probability);
  const [draftGrowth, setDraftGrowth] = useState(canonicalGrowth.toFixed(1));
  const [draftPolicy, setDraftPolicy] = useState((Number(book.canonical_policy_threshold) * 100).toFixed(1));
  const [appliedGrowth, setAppliedGrowth] = useState(canonicalGrowth);
  const [appliedPolicy, setAppliedPolicy] = useState(Number(book.canonical_policy_threshold) * 100);
  const [reviewStatus, setReviewStatus] = useState<"UNREVIEWED" | "APPROVED" | "REJECTED">("UNREVIEWED");
  const [hasApplied, setHasApplied] = useState(false);
  useEffect(() => {
    setProfileId(canonical.profile_id);
    setCatastropheProbability(canonical.catastrophe_probability);
    setDraftGrowth(canonicalGrowth.toFixed(1));
    setDraftPolicy((Number(book.canonical_policy_threshold) * 100).toFixed(1));
    setAppliedGrowth(canonicalGrowth);
    setAppliedPolicy(Number(book.canonical_policy_threshold) * 100);
    setReviewStatus("UNREVIEWED");
    setHasApplied(false);
  }, [canonical.cell_id, book.canonical_policy_threshold, canonicalGrowth]);
  const selected = book.cells.find((item) => item.profile_id === profileId && item.catastrophe_probability === catastropheProbability) ?? canonical;
  const workingGrowthCell = growthCells.find((item) => Math.abs(Number(item.driver_value) * 100 - appliedGrowth) < 0.001) ?? growthCells.find((item) => item.is_baseline)!;
  const supportedGrowth = growthCells.some((item) => Math.abs(Number(item.driver_value) * 100 - Number(draftGrowth)) < 0.001);
  const validPolicy = Number.isFinite(Number(draftPolicy)) && Number(draftPolicy) >= 0 && Number(draftPolicy) <= 100;
  const clears = Number(selected.probability_below_one) * 100 <= appliedPolicy;
  const change = (update: () => void) => {
    update();
    setReviewStatus("UNREVIEWED");
  };
  const reset = () => {
    setProfileId(canonical.profile_id);
    setCatastropheProbability(canonical.catastrophe_probability);
    setDraftGrowth(canonicalGrowth.toFixed(1));
    setDraftPolicy((Number(book.canonical_policy_threshold) * 100).toFixed(1));
    setAppliedGrowth(canonicalGrowth);
    setAppliedPolicy(Number(book.canonical_policy_threshold) * 100);
    setReviewStatus("UNREVIEWED");
    setHasApplied(false);
  };
  const recalculate = () => {
    if (!supportedGrowth || !validPolicy) return;
    setAppliedGrowth(Number(draftGrowth));
    setAppliedPolicy(Number(draftPolicy));
    setReviewStatus("UNREVIEWED");
    setHasApplied(true);
  };
  return <section className="risk-assumption-lab" aria-labelledby="risk-assumption-title" data-testid="helios-working-assumptions">
    <div className="panel-heading">
      <div><p className="kicker">Editable local what-if</p><h2 id="risk-assumption-title">Challenge the loss prior and policy</h2></div>
      <button type="button" className="text-action" onClick={reset} data-testid="helios-risk-reset">Reset canonical</button>
    </div>
    <p>These controls select retained deterministic simulations; they never regenerate math in the browser or overwrite the signed canonical case. All inputs are synthetic analyst assumptions, not a firm policy or market forecast.</p>
    <div className="risk-assumption-controls">
      <label>Annual revenue growth (%)<input type="number" min="0" max="200" step="0.1" value={draftGrowth} onChange={(event) => change(() => setDraftGrowth(event.target.value))} aria-invalid={!supportedGrowth} aria-describedby="helios-growth-help" data-testid="helios-assumption-growth" /><small id="helios-growth-help">Retained deterministic cases: {growthCells.map((item) => `${(Number(item.driver_value) * 100).toFixed(1)}%`).join(", ")}</small></label>
      <label>Scenario mix<select value={profileId} onChange={(event) => change(() => setProfileId(event.target.value))} data-testid="helios-risk-profile">{profileIds.map((id) => {const cell = book.cells.find((item) => item.profile_id === id)!; return <option key={id} value={id}>{cell.profile_label}</option>;})}</select></label>
      <label>Catastrophe prior<select value={catastropheProbability} onChange={(event) => change(() => setCatastropheProbability(event.target.value))} data-testid="helios-catastrophe-prior">{catastropheProbabilities.map((value) => <option key={value} value={value}>{percent(value)}</option>)}</select></label>
      <label>Maximum probability below 1.0x (%)<input type="number" min="0" max="100" step="0.1" value={draftPolicy} onChange={(event) => change(() => setDraftPolicy(event.target.value))} aria-invalid={!validPolicy} data-testid="helios-policy-loss-maximum" /></label>
    </div>
    {(!supportedGrowth || !validPolicy) && <p role="alert">{!supportedGrowth ? "Choose a retained growth case shown above; unsupported values are not interpolated." : "Loss ceiling must be between 0% and 100%."}</p>}
    <button type="button" onClick={recalculate} disabled={!supportedGrowth || !validPolicy} data-testid="helios-recalculate-working-case">Recalculate working case</button>
    <div className="risk-assumption-result" data-testid="helios-risk-result">
      <article><span>Selected loss frequency</span><strong>{percent(selected.probability_below_one)}</strong><small>MC SE {selected.probability_below_one_monte_carlo_se_pp} pp · {selected.draws.toLocaleString()} paths</small></article>
      <article><span>Loss decomposition</span><strong>{selected.loss_decomposition.catastrophe_loss_paths} catastrophe / {selected.loss_decomposition.continuous_loss_paths} continuous</strong><small>loss paths below 1.0x gross MOIC</small></article>
      <article><span>Selected policy test</span><strong data-status={clears ? "CLEARS" : "MISSES"}>{clears ? "Clears" : "Misses"}</strong><small>{percent(selected.probability_below_one)} vs {appliedPolicy.toFixed(1)}% maximum</small></article>
      <article><span>Working return</span><strong>{percent(workingGrowthCell.gross_xirr)} / {multiple(workingGrowthCell.gross_moic)}</strong><small>{percent(workingGrowthCell.target_ownership)} ownership · {money(workingGrowthCell.minimum_cash_cents)} minimum cash</small></article>
    </div>
    <p className="risk-rationale"><strong>{selected.profile_label}.</strong> {selected.profile_rationale}</p>
    <dl className="risk-state-weights" aria-label="Selected synthetic scenario-state weights">{Object.entries(selected.template_weights).map(([state, weight]) => <div key={state}><dt>{state.replaceAll("_", " ").toLowerCase()}</dt><dd>{percent(weight)}</dd></div>)}</dl>
    <p className="risk-rationale"><strong>Source classification:</strong> {engine.distribution.priors.input_classification.replaceAll("_", " ").toLowerCase()}. These weights are transparent synthetic analyst judgments; they are not empirically calibrated default rates.</p>
    <div className="risk-review" data-testid="helios-risk-review"><span>Local review state: <strong>{reviewStatus.toLowerCase()}</strong></span><button type="button" onClick={() => setReviewStatus("APPROVED")}>Record approval</button><button type="button" onClick={() => setReviewStatus("REJECTED")}>Record rejection</button></div>
    <div className="working-change-record" data-testid="helios-working-change-record"><strong>Working-case change record</strong><span>Growth {canonicalGrowth.toFixed(1)}% → {appliedGrowth.toFixed(1)}%</span><span>Loss ceiling {(Number(book.canonical_policy_threshold) * 100).toFixed(1)}% → {appliedPolicy.toFixed(1)}%</span><small>{hasApplied ? `Recomputed from retained case ${workingGrowthCell.cell_id}; preference, dilution, runway, and returns receipt ${workingGrowthCell.result_receipt_sha256.slice(0, 12)}…` : "Canonical baseline retained; no local change applied."}</small></div>
    <p className="decision-note" data-testid="helios-working-case-status"><strong>HOLD.</strong> {clears ? "The selected synthetic risk test clears, but unresolved diligence and pending investment-committee approval still block funding." : "The selected synthetic risk test exceeds the selected loss ceiling."} This local what-if does not change the canonical decision or receipt.</p>
    <details><summary>Canonical assumptions and governance</summary><dl><div><dt>Canonical prior</dt><dd>{canonical.profile_label} · {percent(canonical.catastrophe_probability)} catastrophe probability</dd></div><div><dt>Canonical policy</dt><dd>{percent(book.canonical_policy_threshold)} maximum probability below 1.0x</dd></div><div><dt>Policy owner / state</dt><dd>{engine.risk_policy.owner} · {engine.risk_policy.approval_status.toLowerCase()}</dd></div><div><dt>Simulation owner / state</dt><dd>{engine.distribution.priors.owner} · {engine.distribution.priors.approval_status.toLowerCase()}</dd></div></dl><p>{engine.risk_policy.rationale}</p></details>
  </section>;
}

export function VCUnderwritingRoom({caseData, openMetric, routeState, onRouteState}: {caseData: CaseData; openMetric: OpenMetric; routeState?: {scenario?: string | null; compare?: string | null; driver?: string | null; cell?: string | null}; onRouteState?: (state: {scenario?: string; compare?: string; driver?: string; cell?: string}) => void}) {
  const engine = caseData.vcEngine;
  const validScenario = routeState?.scenario && ["base", "milestone", "downside", "financing_shortfall"].includes(routeState.scenario) ? routeState.scenario as ScenarioKey : "base";
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>(validScenario);
  useEffect(() => setScenarioKey(validScenario), [caseData.caseId, validScenario]);
  if (!engine) return null;
  const result = engine[scenarioKey];
  const compareKey = routeState?.compare && ["base", "milestone", "downside", "financing_shortfall"].includes(routeState.compare) ? routeState.compare as ScenarioKey : "downside";
  const comparison = engine[compareKey];
  const exitBridge = engine.operating_exit_bridges[scenarioKey];
  const prefix = `helios-${result.scenario_id}`;
  const labels: Record<ScenarioKey, string> = {base: "Tranche withheld · Series D", milestone: "Tranche released · no Series D", downside: "Down round · tranche withheld", financing_shortfall: "Shortfall bridge · tranche withheld"};
  return <div className="view-stack pe-room vc-room">
    <section className="underwriting-head"><div><p className="kicker">Venture financing · exact event ledger</p><h2>Terms, ownership, runway, and preferences</h2><p>Every scenario and sensitivity is a retained full-model rerun. Unfunded tranches contribute no cash, shares, preference, or investor outflow.</p></div><div><div className="scenario-tabs">{(Object.keys(labels) as ScenarioKey[]).map((item) => <button key={item} aria-pressed={item === scenarioKey} onClick={() => {setScenarioKey(item); onRouteState?.({scenario: item});}}>{labels[item]}</button>)}</div><label className="compare-control">Compare with <select value={compareKey} onChange={(event) => onRouteState?.({compare: event.target.value})}>{(Object.keys(labels) as ScenarioKey[]).map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></label></div></section>
    <section className="scenario-comparison" aria-label="Side-by-side scenario comparison"><article><span>Selected · {labels[scenarioKey]}</span><strong>{percent(result.gross_xirr)} / {multiple(result.gross_moic)}</strong><small>{percent(result.target_ownership)} ownership · {money(result.minimum_cash_cents)} minimum cash</small></article><article><span>Comparison · {labels[compareKey]}</span><strong>{percent(comparison.gross_xirr)} / {multiple(comparison.gross_moic)}</strong><small>{percent(comparison.target_ownership)} ownership · {money(comparison.minimum_cash_cents)} minimum cash</small></article><p><strong>Binding decision: HOLD.</strong> Comparing attractive point-return cases does not override the canonical risk test, open diligence, or human approval boundary.</p></section>
    <ChartRegistryCaption caseData={caseData} location="Underwriting Room" conclusion={`${labels[scenarioKey]} retains ${money(result.minimum_cash_cents)} minimum cash and funds ${money(result.target_invested_cents)} of Series C capital.`} />
    <section className="terms-ribbon"><BoundCard caseData={caseData} metricId={`${prefix}-target-invested`} detail="Total Series C cash actually funded in the selected scenario." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-ownership`} detail="Series C fully diluted ownership after event-by-event dilution." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-gross-xirr`} detail="Irregular-date gross-to-investor XIRR; not MOIC CAGR." openMetric={openMetric} /><BoundCard caseData={caseData} metricId={`${prefix}-gross-moic`} detail="Exact exit proceeds divided by funded Series C cash." openMetric={openMetric} /></section>
    <aside className="engine-receipt"><span>Selected scenario</span><strong>{labels[scenarioKey]}</strong><small>Full audit detail remains available in the Evidence layer.</small></aside>
    <section className="finance-panel" aria-labelledby="vc-exit-bridge-title"><div className="panel-heading"><div><p className="kicker">Operating case → terminal value</p><h3 id="vc-exit-bridge-title">Five-year exit valuation bridge</h3></div><span>Scenario · not a forecast</span></div><div className="finance-metric-grid exit-bridge-grid"><article><span>Observed LTM revenue</span><strong><BoundValue caseData={caseData} metricId={`${prefix}-bridge-observed-ltm-revenue`} detail="Observed LTM revenue from the committed monthly P&L." openMetric={openMetric} /></strong><small>Committed monthly P&amp;L</small></article><article><span>Annual growth / hold</span><strong><BoundValue caseData={caseData} metricId={`${prefix}-bridge-annual-growth`} detail="Declared annual revenue-growth scenario assumption." openMetric={openMetric} /> · <BoundValue caseData={caseData} metricId={`${prefix}-bridge-hold-years`} detail="Declared scenario hold period." openMetric={openMetric} /></strong><small>Declared scenario assumptions</small></article><article><span>Terminal revenue / multiple</span><strong><BoundValue caseData={caseData} metricId={`${prefix}-bridge-terminal-revenue`} detail="Observed LTM revenue compounded by the declared annual growth path." openMetric={openMetric} /> · <BoundValue caseData={caseData} metricId={`${prefix}-bridge-exit-multiple`} detail="Declared exit revenue-multiple assumption." openMetric={openMetric} /></strong><small>Revenue × (1 + growth)<sup>{exitBridge.years}</sup></small></article><article><span>Exit equity value</span><strong><BoundValue caseData={caseData} metricId={`${prefix}-bridge-exit-equity`} detail="Formula-bound exit enterprise value plus modeled operating cash." openMetric={openMetric} /></strong><small><BoundValue caseData={caseData} metricId={`${prefix}-bridge-exit-enterprise-value`} detail="Formula-bound terminal revenue times exit revenue multiple." openMetric={openMetric} /> EV + <BoundValue caseData={caseData} metricId={`${prefix}-bridge-exit-cash`} detail="Month-60 ending cash from the signed operating and financing ledger." openMetric={openMetric} /></small></article></div><p className="assumption">This bridge supplies the exact equity-value operand consumed by the preference waterfall and investor-return engine. Operating cash is included explicitly as negative net debt.</p></section>
    <FinancingTimeline caseData={caseData} result={result} prefix={prefix} openMetric={openMetric} />
    <CashRunway caseData={caseData} result={result} prefix={prefix} openMetric={openMetric} />
    <CapTableAndWaterfall caseData={caseData} result={result} prefix={prefix} openMetric={openMetric} />
    <section className="finance-panel milestone-ledger" aria-labelledby="milestone-title"><div className="panel-heading"><div><p className="kicker">Modeled tranche-release tests</p><h3 id="milestone-title">Milestone test ledger</h3></div><span>M{engine.milestone_contract.test_month} · {engine.milestone_contract.cure_period_days}-day cure</span></div><div className="milestone-grid">{engine.milestone_contract.tests.map((item) => <article key={item.metric_id}><strong>{item.metric_id}</strong><span>{item.operator} {item.threshold}</span><small>{item.period}</small></article>)}</div><p>{engine.milestone_contract.release_rule.replaceAll("_", " ")} · evaluator {engine.milestone_contract.evaluator.replaceAll("_", " ")} · failure: {engine.milestone_contract.failure_consequence.replaceAll("_", " ")}</p></section>
    <SensitivityBook caseData={caseData} openMetric={openMetric} routeState={routeState} onRouteState={onRouteState} />
  </div>;
}

export function VCSnapshotTerms({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  if (!caseData.vcEngine) return null;
  return <section className="terms-ribbon vc-snapshot-terms" aria-label="Proposed modeled venture terms and returns"><BoundCard caseData={caseData} metricId="helios-MILESTONE-event-series-c-close-new-money" label="First close · Series C cash" detail="Initial close subject to pre-signing gates; this modeled capital is not authorized while workflow disposition is HOLD." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-MILESTONE-event-series-c-tranche-new-money" label="Conditional tranche · Series C cash" detail="Second-tranche capital modeled only after the retained milestone tests clear and human authority is granted." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-MILESTONE-ownership" detail="Fully funded Series C ownership after the pre-money option-pool refresh." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-MILESTONE-gross-xirr" detail="Selected milestone case gross-to-investor dated XIRR on the same $40M funded structure." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-DOWNSIDE-gross-xirr" detail="Down-round case gross-to-investor dated XIRR." openMetric={openMetric} /></section>;
}

export function VCValueCreation({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  const selected = caseData.vcEngine?.milestone;
  const bridge = caseData.vcValueCreationBridge;
  if (!selected || !bridge) return null;
  return <div className="view-stack"><section className="value-head"><p className="kicker">Board-owned operating plan</p><h2>Value creation changes runway, dilution, and investor return</h2><p>Each lever is a complete cash, financing, waterfall, and return rerun. Identified synthetic effects are narrowly credited; unidentified effects receive zero base-case credit.</p></section><section className="terms-ribbon"><BoundCard caseData={caseData} metricId="helios-value-combined_minimum_cash_delta_cents" detail="Combined full-model change in minimum cash after all implementation costs." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-value-combined_target_proceeds_delta_cents" detail="Combined change in Series C exact waterfall proceeds." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-value-combined-gross-xirr-delta" detail="Combined change in dated gross XIRR." openMetric={openMetric} /><BoundCard caseData={caseData} metricId="helios-value-interaction_residual_cents" detail="Combined target-proceeds delta less the sum of standalone deltas." openMetric={openMetric} /></section><section className="value-waterfall vc-value-waterfall" aria-labelledby="vc-value-title"><div className="panel-heading"><div><p className="kicker">Standalone effects + interaction</p><h3 id="vc-value-title">Investor-proceeds bridge</h3></div><code>{bridge.receipt_sha256.slice(0, 12)}…</code></div>{bridge.standalone.map((lever, index) => {const narrative = caseData.valueCreation[index]; const prefix = `helios-value-${lever.lever_id}`; return <article key={lever.lever_id}><div><span>{narrative.initiative}</span><small>{lever.credit_classification.replaceAll("_", " ")}</small></div><div className="waterfall-track"><span style={{width: `${Math.max(2, Math.min(100, Math.abs(lever.target_proceeds_delta_cents) / Math.max(1, Math.abs(bridge.combined_target_proceeds_delta_cents)) * 100))}%`}} /></div><BoundValue caseData={caseData} metricId={`${prefix}-target_proceeds_delta_cents`} detail="Standalone change in Series C exact waterfall proceeds." openMetric={openMetric} /><dl><div><dt>Minimum cash</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-minimum_cash_delta_cents`} detail="Standalone change in minimum cash after implementation cost." openMetric={openMetric} /></dd></div><div><dt>Gross XIRR</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-gross-xirr-delta`} detail="Standalone dated-XIRR impact." openMetric={openMetric} /></dd></div><div><dt>Gross MOIC</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-gross-moic-delta`} detail="Standalone MOIC impact." openMetric={openMetric} /></dd></div><div><dt>Cost</dt><dd><BoundValue caseData={caseData} metricId={`${prefix}-implementation_cost_cents`} detail="Month-one implementation cash cost." openMetric={openMetric} /></dd></div></dl></article>;})}<article className="interaction"><div><span>Interaction residual</span><small>Explicit double-count control</small></div><div className="waterfall-track"><span style={{width: `${Math.max(2, Math.min(100, Math.abs(bridge.interaction_residual_cents) / Math.max(1, Math.abs(bridge.combined_target_proceeds_delta_cents)) * 100))}%`}} /></div><BoundValue caseData={caseData} metricId="helios-value-interaction_residual_cents" detail="Combined proceeds effect less the sum of standalone proceeds effects." openMetric={openMetric} /></article></section><section className="initiative-list">{caseData.valueCreation.map((item, index) => <article key={item.initiative}><span className="initiative-number">0{index + 1}</span><div className="initiative-title"><h3>{item.initiative}</h3><p>{item.owner}</p><small>{item.credit_classification?.replaceAll("_", " ")}</small></div><dl><div><dt>KPI</dt><dd>{item.kpi}</dd></div><div><dt>Baseline → target</dt><dd>{item.baseline} → <span className="human-assumption">{item.target} · human assumption</span></dd></div><div><dt>Milestone / stop</dt><dd>{item.milestone}</dd></div><div><dt>Modeled consequence</dt><dd>{item.value}</dd></div><div><dt>Principal risk</dt><dd>{item.risk}</dd></div></dl></article>)}</section><section aria-labelledby="vc-cadence-title"><div className="section-heading"><p className="kicker">Pre-close to board control</p><h2 id="vc-cadence-title">Ownership cadence</h2></div><div className="ownership-cadence">{caseData.ownershipCadence.map((item) => <article key={item.phase}><span>{item.phase}</span><small>{item.timing}</small><h3>{item.milestone}</h3><dl><div><dt>Owner</dt><dd>{item.owner}</dd></div><div><dt>Board KPI</dt><dd>{item.kpi}</dd></div><div><dt>Stop rule</dt><dd>{item.stop_rule}</dd></div></dl></article>)}</div></section></div>;
}
