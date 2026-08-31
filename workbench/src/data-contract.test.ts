import {describe, expect, it} from "vitest";
import rawData from "./data/cases.json";
import {assertWorkbenchData, compareDecimalStrings} from "./data-contract";

describe("workbench v2 data contract", () => {
  it("validates both exact generated cases and ten browser identities", () => {
    const candidate: unknown = rawData;
    expect(() => assertWorkbenchData(candidate)).not.toThrow();
    assertWorkbenchData(candidate);
    const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid");
    const helios = candidate.cases.find((item) => item.caseId === "helios");
    expect(atlasgrid?.renderManifest.formula_sample_metric_ids).toHaveLength(10);
    expect(helios?.renderManifest.formula_sample_metric_ids).toHaveLength(10);
    expect(helios?.vcEngine?.distribution.draws).toBe(1000);
  });

  it("fails closed when a formula output is tampered", () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid")!;
    const outputId = atlasgrid.renderManifest.formula_sample_metric_ids[0];
    const output = atlasgrid.metricRegistry.find((item) => item.metric_id === outputId)!;
    output.value = "1";
    output.display_value = "$0";
    expect(() => assertWorkbenchData(candidate)).toThrow(/formula_value_mismatch/);
  });

  it("requires the engine-authored investment question in the browser contract", () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    candidate.cases[0].dealContext.investment_question = "";
    expect(() => assertWorkbenchData(candidate)).toThrow(/deal_context_invalid/);
  });

  it("compares hurdle operands without binary-float boundary drift", () => {
    expect(compareDecimalStrings("0.3000000000000000001", "0.3")).toBe(1);
    expect(compareDecimalStrings("2.000", "2")).toBe(0);
    expect(compareDecimalStrings("-0.0001", "0")).toBe(-1);
  });

  it("recomputes dated XIRR from every retained dated cash flow", () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid")!;
    const formula = atlasgrid.formulaRegistry.find((item) => item.operation === "DATED_XIRR")!;
    const cashFlow = atlasgrid.metricRegistry.find((item) => item.metric_id === formula.operand_ids[0])!;
    cashFlow.value = String(Number(cashFlow.value) - 10_000_000);
    expect(() => assertWorkbenchData(candidate)).toThrow(/formula_value_mismatch/);
  });

  it("binds distribution quantiles to the full retained path population", () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const helios = candidate.cases.find((item) => item.caseId === "helios")!;
    const formula = helios.formulaRegistry.find((item) => item.operation === "QUANTILE_P50")!;
    const paths = formula.operand_ids.slice(2).map((id) => helios.metricRegistry.find((item) => item.metric_id === id)!);
    const largest = paths.reduce((current, item) => Number(item.value) > Number(current.value) ? item : current);
    largest.value = "-999";
    expect(() => assertWorkbenchData(candidate)).toThrow(/formula_value_mismatch/);
  });

  it("fails closed on display-only and unit-binding tampering", () => {
    const displayCandidate: unknown = structuredClone(rawData);
    assertWorkbenchData(displayCandidate);
    const displayCase = displayCandidate.cases[0];
    const displayMetric = displayCase.metricRegistry.find((item) => Boolean(item.formula_id) && item.unit === "cents")!;
    displayMetric.display_value = "$999999M";
    expect(() => assertWorkbenchData(displayCandidate)).toThrow(/metric_display_value_mismatch/);

    const unitCandidate: unknown = structuredClone(rawData);
    assertWorkbenchData(unitCandidate);
    const unitCase = unitCandidate.cases[0];
    unitCase.formulaRegistry[0].output_unit = "multiple";
    expect(() => assertWorkbenchData(unitCandidate)).toThrow(/formula_output_unit_mismatch/);
  });

  it("rejects promotion of AG-08 into the base case", () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid")!;
    const ag08 = atlasgrid.evidenceMappings?.find((item) => item.source_analysis_id === "AG-08")!;
    ag08.credit_tier = "BASE_CASE";
    expect(() => assertWorkbenchData(candidate)).toThrow(/ag08_base_case_credit_forbidden/);
  });
});
