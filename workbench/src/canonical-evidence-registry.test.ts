// @vitest-environment node
import {File as NodeFile} from "node:buffer";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import rawData from "./data/cases.json";
import {canonicalEvidenceForCase, modelEvidenceForCase} from "./canonical-evidence";
import {processDealPackage} from "./intake";
import {localCaseId} from "./local-deal-state";
import type {CaseData} from "./types";
import {HOSTED_EVIDENCE_REGISTRY} from "./canonical-evidence-registry.js";

const TestFile = NodeFile as unknown as typeof File;

describe("server-owned hosted evidence registry", () => {
  it("matches the exact model-visible subset of both retained cases", () => {
    for (const candidate of rawData.cases as unknown as CaseData[]) {
      expect(HOSTED_EVIDENCE_REGISTRY[candidate.caseId]).toEqual(modelEvidenceForCase(candidate));
      const canonical = new Map(canonicalEvidenceForCase(candidate).map((item) => [item.id, item]));
      for (const item of HOSTED_EVIDENCE_REGISTRY[candidate.caseId]) expect(canonical.get(item.id)).toEqual(item);
    }
  });

  it("matches the replayed public Northstar package rather than browser-supplied labels", async () => {
    const root = resolve(process.cwd(), "public/sample-package");
    const files = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"].map((name) => {
      const bytes = readFileSync(resolve(root, name));
      return new TestFile([bytes], name);
    });
    const result = await processDealPackage(files);
    expect(result.packageState).toBe("READY");
    expect(HOSTED_EVIDENCE_REGISTRY[localCaseId(result)]).toEqual(result.analysis!.metrics.map((metric) => ({id: metric.id, title: metric.label, displayValue: metric.display, summary: metric.meaning})));
  });
});
