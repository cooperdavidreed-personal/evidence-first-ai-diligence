import type {CaseData, ChartContract} from "./types";

export function ChartRegistryCaption({caseData, location, conclusion}: {caseData: CaseData; location: ChartContract["rendered_location"]; conclusion?: string}) {
  const contracts = (caseData.chartRegistry ?? []).filter((item) => item.rendered_location === location);
  if (!contracts.length) return null;
  return <div className="chart-contracts" aria-label={`${location} chart contracts`}>
    {contracts.map((contract) => <aside className="chart-contract" data-chart-id={contract.chart_id} key={contract.chart_id} aria-label={`Chart contract ${contract.chart_id}`}>
      <div className="chart-contract-question"><span>Decision question</span><strong>{contract.question}</strong></div>
      <dl><div><dt>Point-of-view conclusion</dt><dd>{conclusion ?? contract.conclusion}</dd></div><div><dt>Uncertainty</dt><dd>{contract.uncertainty}</dd></div><div><dt>Decision dependency</dt><dd>{contract.decision_dependency}</dd></div></dl>
    </aside>)}
  </div>;
}
