import type {CaseData, FormulaEntry, TypedMetricRecord, WorkbenchData} from "./types";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const array = (value: unknown): value is unknown[] => Array.isArray(value);

const exactInteger = (value: string): bigint => {
  if (!/^-?[0-9]+$/.test(value)) throw new Error("formula_integer_operand_required");
  return BigInt(value);
};

export function compareDecimalStrings(left: string, right: string): -1 | 0 | 1 {
  const parse = (value: string) => {
    const match = value.match(/^(-?)([0-9]+)(?:\.([0-9]+))?$/);
    if (!match) throw new Error("decimal_comparison_operand_invalid");
    const fraction = match[3] ?? "";
    const magnitude = BigInt(`${match[2]}${fraction}`);
    return {coefficient: match[1] ? -magnitude : magnitude, scale: fraction.length};
  };
  const a = parse(left);
  const b = parse(right);
  const scale = Math.max(a.scale, b.scale);
  const normalizedLeft = a.coefficient * 10n ** BigInt(scale - a.scale);
  const normalizedRight = b.coefficient * 10n ** BigInt(scale - b.scale);
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}

function moveDecimalLeft(value: string, places: number): string {
  const match = value.match(/^(-?)([0-9]+)(?:\.([0-9]+))?$/);
  if (!match || places < 0) throw new Error("decimal_shift_operand_invalid");
  const digits = `${match[2]}${match[3] ?? ""}`;
  const scale = (match[3]?.length ?? 0) + places;
  const padded = digits.padStart(scale + 1, "0");
  const split = padded.length - scale;
  return `${match[1]}${padded.slice(0, split)}${scale ? `.${padded.slice(split)}` : ""}`;
}

const xnpv = (rate: number, dated: Array<{date: number; value: number}>): number => {
  if (rate <= -1) throw new Error("formula_xirr_rate_out_of_domain");
  const origin = Math.min(...dated.map((item) => item.date));
  return dated.reduce((sum, item) => sum + item.value / Math.pow(1 + rate, (item.date - origin) / 86_400_000 / 365), 0);
};

const datedXirr = (dated: Array<{date: number; value: number}>): number => {
  const ordered = [...dated].sort((left, right) => left.date - right.date);
  const signs = ordered.filter((item) => item.value !== 0).map((item) => item.value > 0 ? 1 : -1);
  const signChanges = signs.slice(1).filter((sign, index) => sign !== signs[index]).length;
  if (signChanges !== 1) throw new Error("formula_xirr_not_identified");
  let low = -0.999999;
  let high = 1;
  let lowNpv = xnpv(low, ordered);
  let highNpv = xnpv(high, ordered);
  while (lowNpv * highNpv > 0 && high < 1_000_000) {
    high = (high + 1) * 2 - 1;
    highNpv = xnpv(high, ordered);
  }
  if (lowNpv * highNpv > 0) throw new Error("formula_xirr_root_not_bracketed");
  for (let iteration = 0; iteration < 256; iteration += 1) {
    const midpoint = (low + high) / 2;
    const midpointNpv = xnpv(midpoint, ordered);
    if (Math.abs(midpointNpv) <= 1) return midpoint;
    if (lowNpv * midpointNpv <= 0) {
      high = midpoint;
    } else {
      low = midpoint;
      lowNpv = midpointNpv;
    }
  }
  throw new Error("formula_xirr_did_not_converge");
};

function validateDisplay(metric: TypedMetricRecord): void {
  const raw = Number(metric.value);
  if (!Number.isFinite(raw)) return;
  const text = metric.display_value.replace("−", "-");
  let observed: number | null = null;
  let tolerance = 0;
  if (metric.unit === "cents") {
    const match = text.match(/^(-)?\$([0-9]+(?:\.[0-9]+)?)M$|^\$0$/);
    if (!match) throw new Error(`metric_display_invalid:${metric.metric_id}`);
    observed = text === "$0" ? 0 : (match[1] ? -1 : 1) * Number(match[2]) * 100_000_000;
    const decimals = text.includes(".") ? text.split(".")[1].replace(/[^0-9].*$/, "").length : 0;
    tolerance = 100_000_000 / (2 * Math.pow(10, decimals)) + 1;
  } else if (metric.unit === "decimal_rate" || metric.unit === "percent") {
    const match = text.match(/^(-?[0-9]+(?:\.[0-9]+)?)%$/);
    if (!match) throw new Error(`metric_display_invalid:${metric.metric_id}`);
    observed = Number(match[1]) / (metric.unit === "decimal_rate" ? 100 : 1);
    const decimals = (match[1].split(".")[1] ?? "").length;
    tolerance = 1 / (2 * Math.pow(10, decimals) * (metric.unit === "decimal_rate" ? 100 : 1)) + Number.EPSILON;
  } else if (metric.unit === "multiple" || metric.unit === "turns") {
    const match = text.match(/^(-?[0-9]+(?:\.[0-9]+)?)x$/);
    if (!match) throw new Error(`metric_display_invalid:${metric.metric_id}`);
    observed = Number(match[1]);
    const decimals = (match[1].split(".")[1] ?? "").length;
    tolerance = 1 / (2 * Math.pow(10, decimals)) + Number.EPSILON;
  }
  if (observed !== null && Math.abs(observed - raw) > tolerance) throw new Error(`metric_display_value_mismatch:${metric.metric_id}`);
}

function validateFormula(formula: FormulaEntry, metrics: Map<string, TypedMetricRecord>): void {
  const output = metrics.get(formula.output_metric_id);
  const operands = formula.operand_ids.map((id) => metrics.get(id));
  if (!output || operands.some((item) => !item)) throw new Error("formula_metric_orphan");
  if (output.formula_id !== formula.formula_id || output.operand_ids.join("\0") !== formula.operand_ids.join("\0")) throw new Error(`formula_output_binding_mismatch:${formula.formula_id}`);
  if (output.unit !== formula.output_unit) throw new Error(`formula_output_unit_mismatch:${formula.formula_id}`);
  const operandUnits = operands.map((item) => item!.unit);
  const sameUnitOperations = new Set(["ADD", "SUBTRACT", "MIN", "MAX", "SUM", "SUM_POSITIVE", "ABS_SUM_NEGATIVE"]);
  let unitsValid = false;
  if (sameUnitOperations.has(formula.operation)) unitsValid = operandUnits.length > 0 && operandUnits.every((unit) => unit === output.unit);
  else if (formula.operation === "MULTIPLY") unitsValid = output.unit === "cents" && operandUnits.join(",") === "cents,multiple";
  else if (formula.operation === "DIVIDE") unitsValid = output.unit === "multiple" && operandUnits.join(",") === "cents,cents" || output.unit === "decimal_rate" && operandUnits.join(",") === "shares,shares";
  else if (formula.operation === "DATED_XIRR") unitsValid = output.unit === "decimal_rate" && operandUnits.every((unit) => unit === "cents");
  else if (formula.operation.startsWith("QUANTILE_P")) unitsValid = operandUnits.length >= 3 && operandUnits[0] === "count" && operandUnits[1] === "rank_index" && operandUnits.slice(2).every((unit) => unit === output.unit);
  else if (formula.operation === "PROBABILITY_BELOW_ONE_PERCENT") unitsValid = output.unit === "percent" && operandUnits.every((unit) => unit === "multiple");
  if (!unitsValid) throw new Error(`formula_dimensional_mismatch:${formula.formula_id}`);
  if (formula.operation === "DATED_XIRR") {
    const dated = operands.map((item) => ({date: Date.parse(`${item!.period}T00:00:00Z`), value: Number(item!.value)}));
    if (dated.some((item) => !Number.isFinite(item.date) || !Number.isFinite(item.value)) || !dated.some((item) => item.value < 0) || !dated.some((item) => item.value > 0) || !Number.isFinite(Number(output.value))) throw new Error("formula_dated_xirr_operand_invalid");
    const expected = datedXirr(dated);
    const tolerance = Math.max(Math.abs(Number(output.quantum)) / 2, 1e-12);
    if (Math.abs(Number(output.value) - expected) > tolerance) throw new Error(`formula_value_mismatch:${formula.formula_id}`);
    return;
  }
  if (formula.operation.startsWith("QUANTILE_P")) {
    const probability = formula.operation === "QUANTILE_P10" ? 0.10 : formula.operation === "QUANTILE_P50" ? 0.50 : 0.90;
    const [drawCount, observedIndex, ...pathValues] = operands.map((item) => Number(item!.value));
    if (drawCount !== pathValues.length || drawCount < 1 || pathValues.some((value) => !Number.isFinite(value))) throw new Error(`formula_quantile_path_count_mismatch:${formula.formula_id}`);
    const index = Math.round((drawCount - 1) * probability);
    if (observedIndex !== index) throw new Error(`formula_quantile_rank_mismatch:${formula.formula_id}`);
    const expected = [...pathValues].sort((left, right) => left - right)[index];
    const tolerance = Math.abs(Number(output.quantum)) / 2 + Number.EPSILON * Math.max(1, Math.abs(expected)) * 8;
    if (!Number.isFinite(expected) || Math.abs(Number(output.value) - expected) > tolerance) throw new Error(`formula_value_mismatch:${formula.formula_id}`);
    return;
  }
  if (formula.operation === "PROBABILITY_BELOW_ONE_PERCENT") {
    const values = operands.map((item) => Number(item!.value));
    if (!values.length || values.some((value) => !Number.isFinite(value))) throw new Error(`formula_probability_operands_invalid:${formula.formula_id}`);
    const expected = values.filter((value) => value < 1).length / values.length * 100;
    const tolerance = Math.abs(Number(output.quantum)) / 2 + Number.EPSILON * Math.max(1, Math.abs(expected)) * 8;
    if (Math.abs(Number(output.value) - expected) > tolerance) throw new Error(`formula_value_mismatch:${formula.formula_id}`);
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
    else if (formula.operation === "SUM_POSITIVE") expected = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    else if (formula.operation === "ABS_SUM_NEGATIVE") expected = -values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
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
  } else if (formula.operation === "MIN") expected = integerValues.reduce((minimum, value) => value < minimum ? value : minimum);
  else if (formula.operation === "MAX") expected = integerValues.reduce((maximum, value) => value > maximum ? value : maximum);
  else if (formula.operation === "SUM_POSITIVE") expected = integerValues.filter((value) => value > 0n).reduce((sum, value) => sum + value, 0n);
  else if (formula.operation === "ABS_SUM_NEGATIVE") expected = -integerValues.filter((value) => value < 0n).reduce((sum, value) => sum + value, 0n);
  else expected = integerValues.reduce((sum, value) => sum + value, 0n);
  if (exactInteger(output.value) !== expected) throw new Error(`formula_value_mismatch:${formula.formula_id}`);
}

export function assertWorkbenchCase(candidate: unknown): asserts candidate is CaseData {
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
  if (!record(candidate.dealContext)) throw new Error("deal_context_invalid");
  const dealContext = candidate.dealContext;
  if (dealContext.schema_version !== "underwriting.deal-context/v1" || !array(dealContext.competition) || dealContext.competition.length < 3 || ["investment_question", "company_one_liner", "product", "customer", "market", "go_to_market", "team", "process", "evidence_boundary", "context_sha256"].some((key) => typeof dealContext[key] !== "string" || !dealContext[key])) throw new Error("deal_context_invalid");
  const cadence = candidate.ownershipCadence as Array<Record<string, unknown>>;
  if (cadence.map((item) => item.phase).join(",") !== "Pre-close,Day 1,Day 30,Day 100,Year 1" || cadence.some((item) => ["timing", "owner", "milestone", "kpi", "stop_rule"].some((key) => typeof item[key] !== "string" || !item[key]))) throw new Error("ownership_cadence_sequence_invalid");
  if (!record(candidate.renderManifest) || candidate.renderManifest.schema_version !== "underwriting.render-manifest/v2") throw new Error("render_manifest_invalid");
  const metricRegistry = candidate.metricRegistry as TypedMetricRecord[];
  const formulaRegistry = candidate.formulaRegistry as FormulaEntry[];
  const sourceLocators = candidate.sourceLocators as Array<{
    locator_id: string;
    schema_version: string;
    repository_path: string;
    published_path: string;
    selection_sha256: string;
    excerpt_sha256: string;
  }>;
  const metrics = new Map(metricRegistry.map((item) => [item.metric_id, item]));
  if (metrics.size !== metricRegistry.length) throw new Error("metric_registry_duplicate");
  if (!array(candidate.summaryMetrics) || candidate.summaryMetrics.some((item) => !record(item) || typeof item.metric_id !== "string" || metrics.get(item.metric_id)?.display_value !== item.value)) throw new Error("summary_metric_display_mismatch");
  if (!record(candidate.returnsDistribution) || !array(candidate.returnsDistribution.moic)) throw new Error("returns_distribution_invalid");
  const distributionPrefix = candidate.caseId === "atlasgrid" ? "atlasgrid-distribution-" : "helios-distribution-moic-";
  for (const [index, visibleValue] of candidate.returnsDistribution.moic.entries()) {
    if (Number(metrics.get(`${distributionPrefix}${index}`)?.display_value.replace(/x$/, "")) !== Number(visibleValue)) throw new Error("returns_distribution_metric_mismatch");
  }
  if (!record(candidate.decision) || !array(candidate.decision.metric_pairs)) throw new Error("decision_metric_pairs_missing");
  for (const pair of candidate.decision.metric_pairs) {
    if (!record(pair) || typeof pair.metric !== "string" || typeof pair.metric_id !== "string" || typeof pair.observed_value !== "string" || typeof pair.operator !== "string" || typeof pair.threshold !== "string" || typeof pair.threshold_value !== "string" || typeof pair.status !== "string" || !["BINDING", "INFORMATIONAL"].includes(String(pair.designation))) throw new Error("decision_metric_pair_invalid");
    const metric = metrics.get(pair.metric_id);
    if (!metric || metric.value !== pair.observed_value) throw new Error("decision_metric_binding_invalid");
    if (pair.metric !== metric.label) throw new Error("decision_metric_label_mismatch");
    const observed = pair.observed_value;
    const threshold = pair.threshold_value;
    const thresholdMatch = pair.threshold.match(/^(>=|<=|>|<|==)(-?[0-9]+(?:\.[0-9]+)?)(%|x| months)$/);
    const suffix = metric.unit === "decimal_rate" || metric.unit === "percent" ? "%" : metric.unit === "multiple" ? "x" : metric.unit === "modeled_months_funded_minimum" ? " months" : null;
    if (!thresholdMatch || thresholdMatch[1] !== pair.operator || suffix !== thresholdMatch[3]) throw new Error("decision_metric_threshold_display_mismatch");
    const visibleThreshold = metric.unit === "decimal_rate" ? moveDecimalLeft(thresholdMatch[2], 2) : thresholdMatch[2];
    if (compareDecimalStrings(visibleThreshold, threshold) !== 0) throw new Error("decision_metric_threshold_value_mismatch");
    const comparison = compareDecimalStrings(observed, threshold);
    const clears = pair.operator === ">=" ? comparison >= 0 : pair.operator === "<=" ? comparison <= 0 : pair.operator === ">" ? comparison > 0 : pair.operator === "<" ? comparison < 0 : pair.operator === "==" ? comparison === 0 : null;
    if (clears === null || pair.status !== (clears ? "CLEARS" : "MISSES")) throw new Error("decision_metric_status_invalid");
  }
  if (!array(candidate.decision.condition_states) || !array(candidate.decision.conditions)) throw new Error("decision_condition_states_missing");
  const pairs = new Map((candidate.decision.metric_pairs as Array<Record<string, unknown>>).map((pair) => [String(pair.metric_id), pair]));
  const conditions = candidate.decision.condition_states as Array<Record<string, unknown>>;
  if ((candidate.decision.conditions as unknown[]).join("|") !== conditions.map((item) => item.text).join("|")) throw new Error("decision_condition_text_mismatch");
  const openConditions = conditions.filter((item) => item.designation === "BINDING" && item.state !== "CLEARS_QUANTITATIVELY").length;
  if (candidate.decision.open_conditions !== openConditions) throw new Error("decision_open_condition_count_mismatch");
  for (const condition of conditions) {
    if (!array(condition.metric_ids) || !["BINDING", "INFORMATIONAL"].includes(String(condition.designation))) throw new Error("decision_condition_invalid");
    const linked = condition.metric_ids.map((id) => pairs.get(String(id)));
    if (linked.some((item) => !item)) throw new Error("decision_condition_metric_orphan");
    if (condition.state === "CLEARS_QUANTITATIVELY" && (linked.length === 0 || linked.some((item) => item?.status !== "CLEARS"))) throw new Error("decision_condition_false_clear");
    if (condition.state === "MISSES_HURDLE" && (linked.length === 0 || linked.every((item) => item?.status === "CLEARS"))) throw new Error("decision_condition_false_miss");
  }
  if (!array(candidate.evidenceMappings) || !array(candidate.analyses)) throw new Error("evidence_mapping_missing");
  const mappings = candidate.evidenceMappings as Array<Record<string, unknown>>;
  const analysisIds = new Set((candidate.analyses as Array<Record<string, unknown>>).map((item) => String(item.analysis_id)));
  if (mappings.length !== analysisIds.size || new Set(mappings.map((item) => String(item.source_analysis_id))).size !== analysisIds.size || mappings.some((item) => !analysisIds.has(String(item.source_analysis_id)) || !["BASE_CASE", "VALUE_CREATION_BRIDGE", "SCENARIO_ONLY", "ZERO"].includes(String(item.credit_tier)))) throw new Error("evidence_mapping_coverage_invalid");
  if (candidate.caseId === "atlasgrid" && mappings.find((item) => item.source_analysis_id === "AG-08")?.credit_tier !== "VALUE_CREATION_BRIDGE") throw new Error("ag08_base_case_credit_forbidden");
  if (candidate.caseId === "helios") {
    if (!record(candidate.vcEngine) || !record(candidate.vcEngine.sensitivities) || !array(candidate.vcEngine.sensitivities.cells)) throw new Error("vc_engine_contract_invalid");
    for (const key of ["base", "milestone", "downside", "financing_shortfall"]) {
      const scenario = candidate.vcEngine[key];
      if (!record(scenario) || scenario.pool_exit_treatment !== "FULLY_GRANTED_COMMON") throw new Error("vc_primary_pool_exit_treatment_invalid");
    }
    const sensitivityCells = candidate.vcEngine.sensitivities.cells as Array<Record<string, unknown>>;
    if (sensitivityCells.some((item) => item.axis === "exit_value" && item.pool_exit_treatment !== "FULLY_GRANTED_COMMON")) throw new Error("vc_exit_value_pool_exit_treatment_invalid");
    const poolTreatments = new Set(sensitivityCells.filter((item) => item.axis === "pool_exit_treatment").map((item) => item.pool_exit_treatment));
    if (poolTreatments.size !== 2 || !poolTreatments.has("FULLY_GRANTED_COMMON") || !poolTreatments.has("UNISSUED_CANCELLED")) throw new Error("vc_pool_exit_treatment_sensitivity_invalid");
  }
  const locators = new Set(sourceLocators.map((item) => item.locator_id));
  if (sourceLocators.some((item) => item.schema_version !== "underwriting.source-locator/v3" || !item.repository_path.startsWith(`portfolio/${candidate.caseId}/data-room/data/`) || !item.published_path.startsWith(`source-pack/${candidate.caseId}/data/`) || item.published_path.startsWith("/") || !/^[0-9a-f]{64}$/.test(item.selection_sha256) || !/^[0-9a-f]{64}$/.test(item.excerpt_sha256))) throw new Error("source_locator_v3_invalid");
  for (const metric of metricRegistry) {
    if (!metric.metric_id || !metric.display_value || !metric.governing_receipt_sha256 || metric.state !== "CURRENT") throw new Error("metric_record_invalid");
    if (metric.source_locator_ids.some((id) => !locators.has(id))) throw new Error("metric_locator_orphan");
    if (metric.formula_id) validateDisplay(metric);
  }
  const formulas = new Map(formulaRegistry.map((item) => [item.formula_id, item]));
  if (formulas.size !== formulaRegistry.length) throw new Error("formula_registry_duplicate");
  for (const formula of formulas.values()) validateFormula(formula, metrics);
  const rendered = candidate.renderManifest.metric_ids as string[];
  if (rendered.some((id) => !metrics.has(id))) throw new Error("render_manifest_metric_orphan");
  const investment = candidate.renderManifest.investment_metric_ids as string[];
  if (!array(investment) || investment.some((id) => !rendered.includes(id))) throw new Error("investment_metric_not_rendered");
  for (const id of investment) {
    const metric = metrics.get(id);
    if (!metric?.formula_id || metric.operand_ids.length === 0 || !formulas.has(metric.formula_id)) throw new Error("investment_metric_calculation_open");
  }
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
  for (const candidate of cases) assertWorkbenchCase(candidate);
  const ids = (cases as CaseData[]).map((item) => item.caseId).sort();
  if (ids.join(",") !== "atlasgrid,helios") throw new Error("workbench_case_set_invalid");
}

export function registeredMetric(caseData: CaseData, metricId: string): TypedMetricRecord {
  const metric = caseData.metricRegistry.find((item) => item.metric_id === metricId);
  if (!metric) throw new Error(`render_metric_unregistered:${metricId}`);
  return metric;
}
