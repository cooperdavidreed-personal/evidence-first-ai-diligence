import {describe, expect, it} from "vitest";
import rawData from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";

describe("workbench v2 data contract", () => {
  it("validates both exact generated cases and ten browser identities", () => {
    const candidate: unknown = rawData;
    expect(() => assertWorkbenchData(candidate)).not.toThrow();
    assertWorkbenchData(candidate);
    const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid");
    expect(atlasgrid?.renderManifest.formula_sample_metric_ids).toHaveLength(10);
  });

  it("fails closed when a formula output is tampered", () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid")!;
    const outputId = atlasgrid.renderManifest.formula_sample_metric_ids[0];
    atlasgrid.metricRegistry.find((item) => item.metric_id === outputId)!.value = "1";
    expect(() => assertWorkbenchData(candidate)).toThrow(/formula_value_mismatch/);
  });
});
