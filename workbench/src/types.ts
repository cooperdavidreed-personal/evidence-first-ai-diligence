export type Classification =
  | "ACCOUNTING_IDENTITY"
  | "DESCRIPTIVE"
  | "PREDICTIVE_ASSOCIATION"
  | "CAUSAL_SYNTHETIC_ONLY"
  | "SCENARIO"
  | "NOT_IDENTIFIED"
  | "HUMAN_JUDGMENT";

export interface Diagnostic {
  name: string;
  value: string;
  status: string;
  role?: string;
}

export interface Analysis {
  analysis_id: string;
  question: string;
  classification: Classification;
  method: string;
  population: string;
  cutoff: string;
  inputs: Array<{artifact_id: string; sha256: string}>;
  outputs: Array<{name: string; value: string; unit: string}>;
  assumptions: string[];
  diagnostics: Diagnostic[];
  state: string;
  receipt_sha256: string;
}

export interface Metric {
  metric_id: string;
  label: string;
  value: string;
  detail: string;
  classification: Classification;
  lineage: string[];
  registry?: TypedMetricRecord;
}

export interface SourceLocator {
  locator_id: string;
  artifact_id: string;
  artifact_path: string;
  artifact_sha256: string;
  locator_kind: "CSV_COLUMN_SET" | "JSON_FIELDS" | "TEXT_RANGE";
  selector: string;
  period: string;
  analysis_id: string;
  retained_excerpt: string;
  locator_sha256: string;
}

export interface FormulaEntry {
  formula_id: string;
  operation: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MIN" | "MAX";
  operand_ids: string[];
  output_metric_id: string;
  output_unit: string;
  formula_sha256: string;
}

export interface TypedMetricRecord {
  metric_id: string;
  label: string;
  value: string;
  display_value: string;
  unit: string;
  quantum: string;
  currency: string | null;
  period: string;
  classification: Classification;
  source_locator_ids: string[];
  formula_id: string | null;
  operand_ids: string[];
  assumption_ids: string[];
  downstream_ids: string[];
  governing_receipt_sha256: string;
  state: "CURRENT" | "STALE";
  metric_sha256: string;
}

export interface Lineage {
  node_id: string;
  label: string;
  artifact_id: string;
  field: string;
  analysis_id: string;
  output_names: string[];
  transformation: string;
  downstream: string;
}

export interface Scenario {
  id: string;
  label: string;
  entry_ev: string;
  gross_irr: string;
  moic: string;
  covenant: string;
  lineage: string[];
}

export interface FalsifierState {
  label: string;
  status: "CLEAR" | "OPEN" | "TRIGGERED";
  observed: string;
}

export interface Initiative {
  initiative: string;
  kpi: string;
  baseline: string;
  target: string;
  owner: string;
  milestone: string;
  value: string;
  risk: string;
  lineage: string[];
  credit_classification?: string;
}

export interface SourcesAndUses {
  uses_cents: Record<string, number>;
  non_sponsor_sources_cents: Record<string, number>;
  sponsor_equity_cents: number;
  undrawn_revolver_commitment_cents: number;
  total_uses_cents: number;
  total_sources_cents: number;
  receipt_sha256: string;
}

export interface DebtMonth {
  month: number;
  beginning_cash_cents: number;
  beginning_term_cents: number;
  beginning_revolver_cents: number;
  cash_interest_cents: number;
  cash_taxes_cents: number;
  mandatory_amortization_cents: number;
  revolver_draw_cents: number;
  optional_sweep_cents: number;
  ending_cash_cents: number;
  ending_term_cents: number;
  ending_revolver_cents: number;
  trailing_lender_ebitda_cents: number;
  gross_leverage: string;
  covenant_headroom: string;
  covenant_breach: boolean;
  payment_default: boolean;
}

export interface PECaseResult {
  scenario_id: string;
  engine_inputs_sha256: string;
  engine_inputs: {
    close_date: string;
    operating: Record<string, unknown>;
    transaction: Record<string, unknown>;
  };
  sources_and_uses: SourcesAndUses;
  debt_schedule: {
    months: DebtMonth[];
    ending_debt_cents: number;
    minimum_liquidity_cents: number;
    first_covenant_breach_month: number | null;
    has_payment_default: boolean;
    reconciliation: Record<string, number>;
    receipt_sha256: string;
  };
  sponsor_cash_flows: Array<{date: string; amount_cents: number}>;
  exit_enterprise_value_cents: number;
  exit_equity_value_cents: number;
  earnout_cents: number;
  gross_moic: string;
  gross_xirr: string;
  receipt_sha256: string;
}

export interface PESensitivityCell {
  cell_id: string;
  axis: string;
  assumption_value: string;
  assumption_label: string;
  engine_inputs_sha256: string;
  result_receipt_sha256: string;
  gross_moic: string;
  gross_xirr: string;
  ending_debt_cents: number;
  minimum_covenant_headroom: string;
  first_covenant_breach_month: number | null;
  receipt_sha256: string;
}

export interface PEEngine {
  ask: PECaseResult;
  selected: PECaseResult;
  downside: PECaseResult;
  maximum_bid_cents: number;
  distribution: {
    seed: number;
    draws: number;
    moic_quantiles: string[];
    xirr_quantiles: string[];
    probability_below_one: string;
    probability_covenant_breach: string;
    probability_payment_default: string;
    base_engine_inputs: Record<string, unknown>;
    correlation_structure: Record<string, unknown>;
    correlation_structure_sha256: string;
    path_receipt_sha256s: string[];
    path_records: Array<Record<string, unknown>>;
    receipt_sha256: string;
  };
  sensitivities: {
    axis_order: string[];
    one_way: PESensitivityCell[];
    entry_exit_matrix: PESensitivityCell[];
    receipt_sha256: string;
  };
}

export interface PEValueCreationBridge {
  base_receipt_sha256: string;
  standalone: Array<{
    lever_id: string;
    label: string;
    exit_ebitda_delta_cents: number;
    exit_debt_delta_cents: number;
    exit_equity_delta_cents: number;
    gross_xirr_delta: string;
    gross_moic_delta: string;
    implementation_cost_cents: number;
    credit_classification: string;
    source_analysis_ids: string[];
    assumption_ids: string[];
    result_receipt_sha256: string;
  }>;
  combined_exit_equity_delta_cents: number;
  sum_standalone_exit_equity_delta_cents: number;
  interaction_residual_cents: number;
  combined_gross_xirr_delta: string;
  combined_gross_moic_delta: string;
  receipt_sha256: string;
}

export interface EvidenceMapping {
  mapping_id: string;
  source_analysis_id: string;
  source_receipt_sha256: string;
  observed_value: string;
  target_assumption_or_condition: string;
  credit_classification: string;
  model_credit: string;
  decision_response: string;
  mapping_sha256: string;
}

export interface ThesisNode {
  node_id: string;
  kind: "EVIDENCE" | "ASSUMPTION" | "ESTIMATE" | "FALSIFIER" | "SCENARIO" | "DECISION" | "INITIATIVE";
  label: string;
  status: string;
  references: string[];
}

export interface ThesisGraph {
  schema_version: string;
  case_id: string;
  nodes: ThesisNode[];
  edges: Array<{from: string; to: string; relationship: string}>;
  graph_sha256: string;
}

export interface CaseData {
  schema_version: "underwriting.workbench-case/v2";
  caseId: string;
  company: string;
  caseType: string;
  synthetic: boolean;
  disclosure: string;
  manifest_sha256: string;
  analysis_sha256: string;
  investmentAdjudication: "PENDING_HUMAN";
  workflowDisposition: "HOLD";
  decision: {
    decision: "REPRICE" | "INVEST" | "PASS";
    attribution: string;
    status: string;
    rationale: string;
    conditions: string[];
    open_conditions: number;
    signature_status?: string;
    as_of?: string;
    terms?: string[];
    metric_pairs?: Array<{
      metric: string;
      threshold: string;
      observed: string;
      status: string;
    }>;
    verification_sources?: string[];
    failure_consequences?: string[];
    decision_sha256: string;
  };
  summaryMetrics: Metric[];
  thesis: {
    statement: string;
    counterthesis: string;
    drivers: string[];
    falsifiers: string[];
    requests: string[];
  };
  teamAssessment: {
    strengths: string[];
    unproven: string[];
    key_person_risk: string;
    required_hires: string[];
  };
  ownershipCadence: Array<{
    phase: "Pre-close" | "Day 1" | "Day 30" | "Day 100" | "Year 1";
    timing: string;
    owner: string;
    milestone: string;
    kpi: string;
    stop_rule: string;
  }>;
  falsifierStates?: FalsifierState[];
  analyses: Analysis[];
  scenarios: Scenario[];
  scenarioBook: {schema_version: string; case_id: string; scenarios: Scenario[]; distribution: {moic: string[]; irr: string[]; labels: string[]}; scenario_sha256: string};
  thesisGraph: ThesisGraph;
  distributionLineage: string;
  returnsDistribution: {moic: string[]; irr: string[]; labels: string[]};
  valueCreation: Initiative[];
  valueCreationBridge?: PEValueCreationBridge;
  peEngine?: PEEngine;
  evidenceMappings?: EvidenceMapping[];
  sourceLocators: SourceLocator[];
  formulaRegistry: FormulaEntry[];
  metricRegistry: TypedMetricRecord[];
  renderManifest: {
    schema_version: "underwriting.render-manifest/v2";
    metric_ids: string[];
    formula_sample_metric_ids: string[];
  };
  temporalScan: {
    schema_version: string;
    cutoff: string;
    fields_scanned: Array<{artifact_id: string; field: string; classification: string}>;
    included_rows: number;
    excluded_rows: number;
    excluded_locators: string[];
    max_eligible_instant: string;
    status: string;
    receipt_sha256: string;
  };
  lineage: Lineage[];
  artifacts: Array<{artifact_id: string; path: string; schema: string; rows: number; sha256: string}>;
}

export interface WorkbenchData {
  schema_version: "underwriting.workbench-data/v2";
  cases: CaseData[];
}
