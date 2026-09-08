export interface ComparisonMeasure {label: string; selected: number; comparison: number; unit: "percent" | "money" | "multiple"; onInspect?: (trigger: HTMLElement) => void}
function value(number: number, unit: ComparisonMeasure["unit"]) {
  if (unit === "percent") return `${(number * 100).toFixed(1)}%`;
  if (unit === "multiple") return `${number.toFixed(2)}x`;
  return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1}).format(number / 100);
}
export function comparisonDifference(measure: ComparisonMeasure) {
  const difference = measure.selected - measure.comparison;
  const sign = difference > 0 ? "+" : difference < 0 ? "−" : "";
  return `${sign}${measure.unit === "percent" ? `${(Math.abs(difference) * 100).toFixed(1)} pp` : value(Math.abs(difference), measure.unit)}`;
}
export function ScenarioComparison({selectedLabel, comparisonLabel, basis, measures}: {selectedLabel: string; comparisonLabel: string; basis: string; measures: ComparisonMeasure[]}) {
  return <section className="canonical-comparison scenario-comparison-table" aria-label="Canonical and comparison cases" tabIndex={-1}>
    <header><div><p className="eyebrow">Scenario comparison</p><h3>{selectedLabel} against {comparisonLabel}</h3></div><span>{basis}</span></header>
    <table aria-label="Scenario differences"><thead><tr><th>Measure</th><th>{selectedLabel}</th><th>{comparisonLabel}</th><th>Selected less comparison</th></tr></thead><tbody>{measures.map((measure) => <tr key={measure.label}><th>{measure.onInspect ? <button type="button" className="comparison-source" onClick={event => measure.onInspect!(event.currentTarget)}>{measure.label}<span>View source ↗</span></button> : measure.label}</th><td>{value(measure.selected, measure.unit)}</td><td>{value(measure.comparison, measure.unit)}</td><td>{comparisonDifference(measure)}</td></tr>)}</tbody></table>
    <p>Differences use unrounded results; displayed values are rounded. pp means percentage points. A comparison does not establish causality or approve a transaction.</p>
  </section>;
}
