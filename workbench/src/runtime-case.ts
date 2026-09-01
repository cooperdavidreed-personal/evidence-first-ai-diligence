import type {CaseData, FormulaEntry, TypedMetricRecord} from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertRuntimeCase(candidate: unknown): asserts candidate is CaseData {
  if (!record(candidate) || candidate.schema_version !== "underwriting.workbench-case/v2" || !["atlasgrid", "helios"].includes(String(candidate.caseId))) throw new Error("runtime_case_identity_invalid");
  for (const key of ["metricRegistry", "formulaRegistry", "sourceLocators", "artifacts", "analyses", "summaryMetrics"] as const) {
    if (!Array.isArray(candidate[key])) throw new Error(`runtime_case_array_missing:${key}`);
  }
  if (!record(candidate.decision) || !record(candidate.decision.issue_summary) || !Array.isArray(candidate.decision.metric_pairs) || !Array.isArray(candidate.decision.issue_summary.issues) || !record(candidate.renderManifest)) throw new Error("runtime_case_decision_invalid");

  const metrics = candidate.metricRegistry as unknown as TypedMetricRecord[];
  const metricMap = new Map(metrics.map((metric) => [metric.metric_id, metric]));
  if (metricMap.size !== metrics.length || metrics.some((metric) => !metric.metric_id || !metric.display_value || metric.state !== "CURRENT")) throw new Error("runtime_metric_registry_invalid");
  for (const summary of candidate.summaryMetrics as Array<{metric_id: string; value: string}>) {
    if (metricMap.get(summary.metric_id)?.display_value !== summary.value) throw new Error("runtime_summary_metric_invalid");
  }
  for (const pair of candidate.decision.metric_pairs as Array<{metric_id: string}>) {
    if (!metricMap.has(pair.metric_id)) throw new Error("runtime_decision_metric_missing");
  }
  for (const issue of candidate.decision.issue_summary.issues as Array<{evidence_metric_ids: string[]}>) {
    if (!Array.isArray(issue.evidence_metric_ids) || issue.evidence_metric_ids.some((id) => !metricMap.has(id))) throw new Error("runtime_issue_metric_missing");
  }

  const locators = new Set((candidate.sourceLocators as Array<{locator_id: string}>).map((item) => item.locator_id));
  if (metrics.some((metric) => metric.source_locator_ids.some((id) => !locators.has(id)))) throw new Error("runtime_metric_locator_missing");
  const formulas = candidate.formulaRegistry as unknown as FormulaEntry[];
  const formulaIds = new Set(formulas.map((formula) => formula.formula_id));
  if (formulaIds.size !== formulas.length || metrics.some((metric) => metric.formula_id && !formulaIds.has(metric.formula_id))) throw new Error("runtime_formula_missing");
  for (const formula of formulas) {
    if (!metricMap.has(formula.output_metric_id)) throw new Error("runtime_formula_output_missing");
    if (formula.operand_ids.some((id) => !metricMap.has(id))) throw new Error("runtime_formula_operand_missing");
  }

  const engine = record(candidate.peEngine) ? candidate.peEngine : candidate.vcEngine;
  if (!record(engine) || !record(engine.distribution) || "path_records" in engine.distribution || "path_receipt_sha256s" in engine.distribution) throw new Error("runtime_bulk_simulation_data_present");
}
