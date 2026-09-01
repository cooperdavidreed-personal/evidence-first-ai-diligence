import {File as NodeFile} from "node:buffer";
import {describe, expect, it, vi} from "vitest";
import {PACKAGE_VERSION, processDealPackage, sha256} from "./intake";

const deal = JSON.stringify({
  package_version: PACKAGE_VERSION, company: "Northstar Metrics", cutoff: "2026-06-30", cash_cents: 450000000,
  proposed_financing: {investment_cents: 2500000000, pre_money_cents: 5000000000},
  return_assumptions: {years: 5, annual_revenue_growth: "0.25", exit_revenue_multiple: "5.0"},
  thresholds: {minimum_gross_moic: "2.5", minimum_annualized_return: "0.20", minimum_runway_months: "12"},
  analyst_owner: "Portfolio underwriting team",
});
const monthly = `period,revenue_cents,cost_of_revenue_cents,operating_expense_cents
2025-06,100000000,30000000,104000000
2025-07,105000000,31500000,105000000
2025-08,110000000,33000000,107000000
2025-09,115000000,34500000,109000000
2025-10,120000000,36000000,111000000
2025-11,125000000,37500000,114000000
2025-12,130000000,39000000,117000000
2026-01,135000000,40500000,120000000
2026-02,140000000,42000000,123000000
2026-03,145000000,43500000,126000000
2026-04,150000000,45000000,129000000
2026-05,155000000,46500000,132000000
2026-06,160000000,48000000,135000000`;
const customers = `customer_id,period,arr_cents
customer-a,2025-07,300000000
customer-b,2025-07,250000000
customer-c,2025-07,150000000
customer-a,2026-06,360000000
customer-b,2026-06,225000000
customer-c,2026-06,0
customer-d,2026-06,200000000`;
const TestFile = NodeFile as unknown as typeof File;

async function packageFiles(overrides: {deal?: string; monthly?: string; customers?: string; extra?: File} = {}) {
  const contents = {
    "deal.json": overrides.deal ?? deal,
    "monthly_financials.csv": overrides.monthly ?? monthly,
    "customer_arr.csv": overrides.customers ?? customers,
  };
  const roles: Record<keyof typeof contents, string> = {"deal.json": "deal", "monthly_financials.csv": "monthly_financials", "customer_arr.csv": "customer_arr"};
  const files = await Promise.all(Object.entries(contents).map(async ([name, content]) => {
    const file = new TestFile([content], name, {type: name.endsWith(".json") ? "application/json" : "text/csv"});
    return {file, declaration: {name, role: roles[name as keyof typeof contents], required: true, bytes: file.size, sha256: await sha256(await file.arrayBuffer())}};
  }));
  const manifest = new TestFile([JSON.stringify({package_version: PACKAGE_VERSION, files: files.map((item) => item.declaration)})], "manifest.json", {type: "application/json"});
  return [manifest, ...files.map((item) => item.file), ...(overrides.extra ? [overrides.extra] : [])];
}

describe("Growth SaaS Quick Package", () => {
  it("hashes, maps, and computes the supported package deterministically", async () => {
    const result = await processDealPackage(await packageFiles());
    expect(result.packageState).toBe("READY");
    expect(result.posture).toBe("READY FOR IC REVIEW");
    expect(result.analysis?.ltmRevenueCents).toBe(1_590_000_000);
    expect(result.analysis?.grossMargin).toBeCloseTo(0.7, 8);
    expect(result.analysis?.ordinaryNrr).toBeCloseTo(585 / 700, 8);
    expect(result.analysis?.postMoneyOwnership).toBeCloseTo(1 / 3, 8);
    expect(result.analysis?.grossMoic).toBeGreaterThan(3.2);
    expect(result.analysis?.exitEquityCents).toBe(Math.round(result.analysis!.terminalRevenueCents * 5));
    expect(result.analysis?.tests.every((test) => test.status === "CLEARS")).toBe(true);
    expect(result.processedLocally).toBe(true);
  });

  it("fails closed when a required file is missing and exposes no returns", async () => {
    const files = await packageFiles();
    const result = await processDealPackage(files.filter((file) => file.name !== "customer_arr.csv"));
    expect(result.packageState).toBe("INCOMPLETE");
    expect(result.posture).toBe("NO CALL — PACKAGE INCOMPLETE");
    expect(result.analysis).toBeNull();
    expect(result.files.find((file) => file.name === "customer_arr.csv")?.state).toBe("MISSING");
  });

  it("stops on a manifest digest mismatch", async () => {
    const files = await packageFiles();
    const replacement = new TestFile([`${monthly}\n2026-07,1,1,1`], "monthly_financials.csv", {type: "text/csv"});
    const result = await processDealPackage(files.map((file) => file.name === replacement.name ? replacement : file));
    expect(result.packageState).toBe("INCOMPLETE");
    expect(result.files.find((file) => file.name === replacement.name)?.state).toBe("INVALID");
    expect(result.errors.join(" ")).toMatch(/digest|Byte count/);
  });

  it("rejects malformed cents after a valid manifest match", async () => {
    const result = await processDealPackage(await packageFiles({monthly: monthly.replace("160000000,48000000", "160000000.5,48000000")}));
    expect(result.packageState).toBe("INCOMPLETE");
    expect(result.posture).toBe("NO CALL — PACKAGE INCOMPLETE");
    expect(result.errors.join(" ")).toMatch(/integer cents/);
    expect(result.analysis).toBeNull();
  });

  it("attributes invalid deal assumptions to deal.json", async () => {
    const invalidDeal = deal.replace('"annual_revenue_growth":"0.25"', '"annual_revenue_growth":"9.0"');
    const result = await processDealPackage(await packageFiles({deal: invalidDeal}));
    expect(result.packageState).toBe("INCOMPLETE");
    expect(result.files.find((file) => file.name === "deal.json")?.state).toBe("INVALID");
    expect(result.files.find((file) => file.name === "monthly_financials.csv")?.state).toBe("RECOGNIZED");
  });

  it("rejects thresholds beyond the declared 12-place precision", async () => {
    const invalidDeal = deal.replace('"minimum_gross_moic":"2.5"', '"minimum_gross_moic":"2.5000000000001"');
    const result = await processDealPackage(await packageFiles({deal: invalidDeal}));
    expect(result.packageState).toBe("INCOMPLETE");
    expect(result.files.find((file) => file.name === "deal.json")?.state).toBe("INVALID");
    expect(result.errors.join(" ")).toMatch(/12 decimal places/);
  });

  it("rejects duplicate financial periods", async () => {
    const duplicate = `${monthly}\n2026-06,160000000,48000000,135000000`;
    const result = await processDealPackage(await packageFiles({monthly: duplicate}));
    expect(result.packageState).toBe("INCOMPLETE");
    expect(result.errors.join(" ")).toMatch(/duplicate period 2026-06/);
  });

  it("records explicit supported alias mapping", async () => {
    const aliased = monthly.replace("period,revenue_cents,cost_of_revenue_cents,operating_expense_cents", "month,revenue,cogs_cents,opex_cents");
    const result = await processDealPackage(await packageFiles({monthly: aliased}));
    expect(result.packageState).toBe("READY");
    const status = result.files.find((file) => file.name === "monthly_financials.csv");
    expect(status?.mappings).toHaveLength(4);
    expect(status?.detail).toMatch(/explicit alias mapping required/);
  });

  it("lists an unsupported supporting file without parsing or blocking the package", async () => {
    const result = await processDealPackage(await packageFiles({extra: new TestFile(["fictional"], "supporting-deck.pdf", {type: "application/pdf"})}));
    expect(result.packageState).toBe("READY");
    expect(result.files.find((file) => file.name === "supporting-deck.pdf")?.state).toBe("UNSUPPORTED");
  });

  it("does not call a network transport", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await processDealPackage(await packageFiles());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
