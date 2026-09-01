import {describe, expect, it} from "vitest";
import atlasgrid from "virtual:underwriting-case-atlasgrid";
import helios from "virtual:underwriting-case-helios";
import {assertRuntimeCase} from "./runtime-case";

describe("browser case projection", () => {
  it.each([["atlasgrid", atlasgrid], ["helios", helios]])("keeps display evidence while excluding bulk simulation paths for %s", (_name, candidate) => {
    expect(() => assertRuntimeCase(candidate)).not.toThrow();
    assertRuntimeCase(candidate);
    expect(candidate.metricRegistry.length).toBeGreaterThan(20);
    expect(candidate.metricRegistry.length).toBeLessThan(2_000);
    const distribution = (candidate.peEngine ?? candidate.vcEngine)!.distribution as unknown as Record<string, unknown>;
    expect(distribution).not.toHaveProperty("path_records");
    expect(distribution).not.toHaveProperty("path_receipt_sha256s");
    for (const metric of candidate.summaryMetrics) expect(candidate.metricRegistry.some((item) => item.metric_id === metric.metric_id)).toBe(true);
  });

  it("fails closed if a decision metric is missing", () => {
    const candidate = structuredClone(atlasgrid);
    assertRuntimeCase(candidate);
    candidate.metricRegistry = candidate.metricRegistry.filter((metric) => metric.metric_id !== candidate.decision.metric_pairs![0].metric_id);
    expect(() => assertRuntimeCase(candidate)).toThrow(/decision.metric/i);
  });
});
