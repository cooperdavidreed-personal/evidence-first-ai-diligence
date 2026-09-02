import type {SelectedEvidence} from "./model-workflow";
import type {CaseData} from "./types";

export function canonicalEvidenceItem(caseData: CaseData, id: string): SelectedEvidence | null {
  const summary = caseData.summaryMetrics.find((item) => item.metric_id === id);
  if (summary) {
    const record = caseData.metricRegistry.find((item) => item.metric_id === id);
    const sourceCount = record?.source_locator_ids.length ?? summary.lineage.length;
    return {id, title: summary.label, displayValue: summary.value, summary: `${summary.detail} ${sourceCount} linked source ${sourceCount === 1 ? "record" : "records"}; ${summary.classification.toLowerCase().replaceAll("_", " ")}.`};
  }
  const metric = caseData.metricRegistry.find((item) => item.metric_id === id);
  if (metric) return {id, title: metric.label, displayValue: metric.display_value, summary: `${metric.period}; ${metric.classification.toLowerCase().replaceAll("_", " ")}.`};
  const analysis = caseData.analyses.find((item) => item.analysis_id === id);
  if (analysis) return {id, title: analysis.question, displayValue: analysis.state, summary: `${analysis.population}; ${analysis.classification.toLowerCase().replaceAll("_", " ")}.`};
  const artifact = caseData.artifacts.find((item) => item.artifact_id === id);
  if (!artifact) return null;
  return {id, title: artifact.path.split("/").at(-1) ?? artifact.path, displayValue: `${artifact.rows.toLocaleString()} rows`, summary: `Retained public synthetic source; schema ${artifact.schema}.`};
}

export function modelEvidenceForCase(caseData: CaseData) {
  return caseData.summaryMetrics.slice(0, 8).map((metric) => canonicalEvidenceItem(caseData, metric.metric_id)!);
}

export function canonicalEvidenceForCase(caseData: CaseData) {
  const ids = new Set([...caseData.metricRegistry.map((item) => item.metric_id), ...caseData.analyses.map((item) => item.analysis_id), ...caseData.artifacts.map((item) => item.artifact_id)]);
  return [...ids].map((id) => canonicalEvidenceItem(caseData, id)).filter((item): item is SelectedEvidence => item !== null);
}
