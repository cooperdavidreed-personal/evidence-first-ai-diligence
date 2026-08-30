import type {CaseData, FormulaEntry, TypedMetricRecord, WorkbenchData} from "./types";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const array = (value: unknown): value is unknown[] => Array.isArray(value);

const exactInteger = (value: string): bigint => {
  if (!/^-?[0-9]+$/.test(value)) throw new Error("formula_integer_operand_required");
  return BigInt(value);
};

function validateFormula(formula: FormulaEntry, metrics: Map<string, TypedMetricRecord>): void {
  const output = metrics.get(formula.output_metric_id);
  const operands = formula.operand_ids.map((id) => metrics.get(id));
  if (!output || operands.some((item) => !item)) throw new Error("formula_metric_orphan");
  if (formula.operation === "DATED_XIRR") {
    const dated = operands.map((item) => ({date: Date.parse(`${item!.period}T00:00:00Z`), value: Number(item!.value)}));
    if (dated.some((item) => !Number.isFinite(item.date) || !Number.isFinite(item.value)) || !dated.some((item) => item.value < 0) || !dated.some((item) => item.value > 0) || !Number.isFinite(Number(output.value))) throw new Error("formula_dated_xirr_operand_invalid");
    return;
  }
  const integerInputs = operands.every((item) => /^-?[0-9]+$/.test(item!.value)) && /^-?[0-9]+$/.test(output.value);
  if (!integerInputs) {
    const values = operands.map((item) => Number(item!.value));
    const [left, right] = values;
    let expected: number;
    if (formula.operation === "ADD") expected = left + right;
    else if (formula.operation === "SUBTRACT") expected = left - right;
    else if (formula.operation === "MULTIPLY") expected = left * right;
    else if (formula.operation === "DIVIDE") expected = left / right;
    else if (formula.operation === "MIN") expected = Math.min(...values);
    else if (formula.operation === "MAX") expected = Math.max(...values);
    else expected = values.reduce((sum, value) => sum + value, 0);
    const tolerance = Math.abs(Number(output.quantum)) / 2 + Number.EPSILON * Math.max(1, Math.abs(expected)) * 8;
    if (!Number.isFinite(expected) || Math.abs(Number(output.value) - expected) > tolerance) throw new Error(`formula_value_mismatch:${formula.formula_id}`);
    return;
  }
  const integerValues = operands.map((item) => exactInteger(item!.value));
  const [left, right] = integerValues;
  let expected: bigint;
  if (formula.operation === "ADD") expected = left + right;
  else if (formula.operation === "SUBTRACT") expected = left - right;
  else if (formula.operation === "MULTIPLY") expected = left * right;
  else if (formula.operation === "DIVIDE") {
    if (right === 0n || left % right !== 0n) throw new Error("formula_non_exact_division");
    expected = left / right;
  } else if (formula.operation === "MIN") expected = left < right ? left : right;
  else if (formula.operation === "MAX") expected = left > right ? left : right;
  else expected = integerValues.reduce((sum, value) => sum + value, 0n);
  if (exactInteger(output.value) !== expected) throw new Error(`formula_value_mismatch:${formula.formula_id}`);
}

function validateCase(candidate: unknown): asserts candidate is CaseData {
  if (!record(candidate) || candidate.schema_version !== "underwriting.workbench-case/v2") throw new Error("workbench_case_version_invalid");
  for (const key of ["metricRegistry", "formulaRegistry", "sourceLocators", "lineage", "artifacts", "analyses"] as const) {
    if (!array(candidate[key])) throw new Error(`workbench_case_array_missing:${key}`);
  }
  if (!record(candidate.teamAssessment) || !array(candidate.teamAssessment.strengths) || !array(candidate.teamAssessment.unproven) || !array(candidate.teamAssessment.required_hires) || typeof candidate.teamAssessment.key_person_risk !== "string") throw new Error("team_assessment_invalid");
  if (!record(candidate.thesis) || !array(candidate.thesis.requests) || candidate.thesis.requests.some((item) => !record(item) || ["request_id", "request", "owner", "due_state", "materiality", "decision_consequence"].some((key) => typeof item[key] !== "string" || !item[key]))) throw new Error("diligence_request_invalid");
  if (!array(candidate.chartRegistry) || candidate.chartRegistry.length !== 4) throw new Error("chart_registry_requires_four");
  const charts = candidate.chartRegistry as Array<Record<string, unknown>>;
  const chartIds = new Set(charts.map((item) => item.chart_id));
  const chartLocations = charts.map((item) => item.rendered_location).sort().join(",");
  if (chartIds.size !== 4 || chartLocations !== "IC Snapshot,Thesis & Evidence,Underwriting Room,Value Creation" || charts.some((item) => ["chart_id", "question", "conclusion", "uncertainty", "decision_dependency", "rendered_location"].some((key) => typeof item[key] !== "string" || !item[key]))) throw new Error("chart_registry_invalid");
  if (!array(candidate.valueCreation) || candidate.valueCreation.length === 0 || candidate.valueCreation.some((item) => !record(item) || typeof item.priority !== "number" || ["initiative", "kpi", "baseline", "target", "owner", "timing", "dependency", "implementation_cost", "milestone", "stop_rule", "value", "risk"].some((key) => typeof item[key] !== "string" || !item[key]))) throw new Error("value_creation_plan_invalid");
  const priorities = (candidate.valueCreation as Array<{priority: number}>).map((item) => item.priority);
  if (new Set(priorities).size !== priorities.length || priorities.some((item, index) => item !== index + 1)) throw new Error("value_creation_priority_invalid");
  if (!array(candidate.screenedOutLevers) || candidate.screenedOutLevers.length === 0 || candidate.screenedOutLevers.some((item) => !record(item) || ["lever", "evidence_state", "reason_screened_out", "reconsideration_trigger"].some((key) => typeof item[key] !== "string" || !item[key]))) throw new Error("screened_out_lever_invalid");
  if (!array(candidate.ownershipCadence) || candidate.ownershipCadence.length !== 5) throw new Error("ownership_cadence_invalid");
  const cadence = candidate.ownershipCadence as Array<Record<string, unknown>>;
  if (cadence.map((item) => item.phase).join(",") !== "Pre-close,Day 1,Day 30,Day 100,Year 1" || cadence.some((item) => ["timing", "owner", "milestone", "kpi", "stop_rule"].some((key) => typeof item[key] !== "string" || !item[key]))) throw new Error("ownership_cadence_sequence_invalid");
  if (!record(candidate.renderManifest) || candidate.renderManifest.schema_version !== "underwriting.render-manifest/v2") throw new Error("render_manifest_invalid");
  const metricRegistry = candidate.metricRegistry as TypedMetricRecord[];
  const formulaRegistry = candidate.formulaRegistry as FormulaEntry[];
  const sourceLocators = candidate.sourceLocators as Array<{locator_id: string}>;
  const metrics = new Map(metricRegistry.map((item) => [item.metric_id, item]));
  if (metrics.size !== metricRegistry.length) throw new Error("metric_registry_duplicate");
  const locators = new Set(sourceLocators.map((item) => item.locator_id));
  for (const metric of metricRegistry) {
    if (!metric.metric_id || !metric.display_value || !metric.governing_receipt_sha256 || metric.state !== "CURRENT") throw new Error("metric_record_invalid");
    if (metric.source_locator_ids.some((id) => !locators.has(id))) throw new Error("metric_locator_orphan");
  }
  const formulas = new Map(formulaRegistry.map((item) => [item.formula_id, item]));
  if (formulas.size !== formulaRegistry.length) throw new Error("formula_registry_duplicate");
  for (const formula of formulas.values()) validateFormula(formula, metrics);
  const rendered = candidate.renderManifest.metric_ids as string[];
  if (rendered.some((id) => !metrics.has(id))) throw new Error("render_manifest_metric_orphan");
  const sample = candidate.renderManifest.formula_sample_metric_ids as string[];
  if (["atlasgrid", "helios"].includes(String(candidate.caseId)) && sample.length !== 10) throw new Error("formula_sample_requires_ten");
  for (const id of sample) {
    const metric = metrics.get(id);
    if (!metric?.formula_id || !formulas.has(metric.formula_id)) throw new Error("formula_sample_invalid");
  }
}

export function assertWorkbenchData(value: unknown): asserts value is WorkbenchData {
  if (!record(value) || value.schema_version !== "underwriting.workbench-data/v2" || !array(value.cases) || value.cases.length !== 2) throw new Error("workbench_data_invalid");
  const cases = value.cases as unknown[];
  for (const candidate of cases) validateCase(candidate);
  const ids = (cases as CaseData[]).map((item) => item.caseId).sort();
  if (ids.join(",") !== "atlasgrid,helios") throw new Error("workbench_case_set_invalid");
}

export function registeredMetric(caseData: CaseData, metricId: string): TypedMetricRecord {
  const metric = caseData.metricRegistry.find((item) => item.metric_id === metricId);
  if (!metric) throw new Error(`render_metric_unregistered:${metricId}`);
  return metric;
}
