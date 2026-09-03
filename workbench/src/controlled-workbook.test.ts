import {File as NodeFile} from "node:buffer";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {approveBaseline, processDealPackage} from "./intake";
import {compareControlledWorkbook, exportControlledWorkbook} from "./controlled-workbook";

const TestFile = NodeFile as unknown as typeof File;
const root = resolve(process.cwd(), "public/sample-package-v2");

async function approvedPackage() {
  const legacyRoot = resolve(process.cwd(), "public/sample-package");
  const names = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"];
  const result = await processDealPackage(names.map((name) => new TestFile([readFileSync(resolve(legacyRoot, name))], name, {type: name.endsWith(".json") ? "application/json" : "text/csv"})));
  if (result.packageState !== "READY") throw new Error(`Fixture admission failed: ${result.errors.join(" | ")}`);
  return approveBaseline(result, "Workbook control reviewer", "The declared sheet, mappings, formula exclusions, and reconciliations are suitable for this controlled export test.");
}

describe("controlled Excel round trip", () => {
  it("adds one controlled sheet while preserving every original worksheet byte and formula", async () => {
    const result = await approvedPackage();
    const source = readFileSync(resolve(root, "operating_model.xlsx"));
    const sourceBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
    const exported = exportControlledWorkbook(sourceBuffer, result);
    const diff = compareControlledWorkbook(sourceBuffer, exported);
    expect(diff).toMatchObject({state: "PASS", sourceWorksheetsUnchanged: true, addedSheets: ["Underwriting Desk"]});
    expect(diff.formulasBefore).toBeGreaterThan(0);
    expect(diff.formulasAfter).toBe(diff.formulasBefore);
    expect(() => exportControlledWorkbook(exported, result)).toThrow(/reserved Underwriting Desk sheet/);
  });

  it("fails closed on an unrelated workbook", async () => {
    const source = readFileSync(resolve(root, "operating_model.xlsx"));
    const bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
    expect(compareControlledWorkbook(bytes, new TextEncoder().encode("not an xlsx").buffer as ArrayBuffer).state).toBe("FAIL");
  });
});
