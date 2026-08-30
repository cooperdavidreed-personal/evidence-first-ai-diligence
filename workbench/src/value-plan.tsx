import type {CaseData, Metric} from "./types";

type OpenMetric = (metric: Metric, trigger: HTMLElement) => void;

export function ValuePlanDetails({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  return <>
    <section className="initiative-list" aria-label="Prioritized value-creation initiatives">{caseData.valueCreation.map((item, index) => {const priority = item.priority ?? index + 1; return <article key={item.initiative}>
      <span className="initiative-number">{String(priority).padStart(2, "0")}</span>
      <div className="initiative-title"><h3>{item.initiative}</h3><p>{item.owner}</p><small>{item.credit_classification?.replaceAll("_", " ")}</small><button className="text-link" onClick={(event) => openMetric({metric_id: `${caseData.caseId}-initiative-${priority}-baseline`, label: `${item.initiative} baseline`, value: item.baseline, detail: `Evidence-bound baseline. Target ${item.target} is an illustrative HUMAN_JUDGMENT assumption; ${item.value}.`, classification: "DESCRIPTIVE", lineage: item.lineage}, event.currentTarget)}>Inspect baseline evidence ↗</button></div>
      <dl><div><dt>KPI</dt><dd>{item.kpi}</dd></div><div><dt>Baseline → target</dt><dd>{item.baseline} → <span className="human-assumption">{item.target} · human assumption</span></dd></div><div><dt>Priority / timing</dt><dd>P{priority} · {item.timing ?? "Not declared"}</dd></div><div><dt>Dependency</dt><dd>{item.dependency ?? "Not declared"}</dd></div><div><dt>Implementation cost</dt><dd>{item.implementation_cost ?? "Not declared"}</dd></div><div><dt>Milestone</dt><dd>{item.milestone}</dd></div><div><dt>Stop rule</dt><dd>{item.stop_rule ?? item.risk}</dd></div><div><dt>Modeled consequence</dt><dd>{item.value}</dd></div><div><dt>Principal risk</dt><dd>{item.risk}</dd></div></dl>
    </article>;})}</section>
    <section className="screened-levers" aria-labelledby={`${caseData.caseId}-screened-title`}><div className="section-heading"><p className="kicker">Capital-allocation discipline</p><h2 id={`${caseData.caseId}-screened-title`}>Screened-out levers</h2></div><div className="screened-grid">{(caseData.screenedOutLevers ?? []).map((item) => <article key={item.lever}><span>{item.evidence_state.replaceAll("_", " ")}</span><h3>{item.lever}</h3><dl><div><dt>Why screened out</dt><dd>{item.reason_screened_out}</dd></div><div><dt>Reconsider only when</dt><dd>{item.reconsideration_trigger}</dd></div></dl></article>)}</div></section>
  </>;
}
