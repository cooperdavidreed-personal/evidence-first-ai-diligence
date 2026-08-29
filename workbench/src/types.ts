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
  falsifierStates?: FalsifierState[];
  analyses: Analysis[];
  scenarios: Scenario[];
  scenarioBook: {schema_version: string; case_id: string; scenarios: Scenario[]; distribution: {moic: string[]; irr: string[]; labels: string[]}; scenario_sha256: string};
  thesisGraph: ThesisGraph;
  distributionLineage: string;
  returnsDistribution: {moic: string[]; irr: string[]; labels: string[]};
  valueCreation: Initiative[];
  lineage: Lineage[];
  artifacts: Array<{artifact_id: string; path: string; schema: string; rows: number; sha256: string}>;
}

export interface WorkbenchData {
  schema_version: string;
  cases: CaseData[];
}
