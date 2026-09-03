import {File as NodeFile} from "node:buffer";
import {describe, expect, it, vi} from "vitest";
import {approveBaseline, PACKAGE_VERSION, processDealPackage, sha256} from "./intake";
import {GROWTH_SCREEN_POLICY} from "./policy";

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
    expect(result.posture).toBe("SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED");
    expect(result.analysis?.ltmRevenueCents).toBe(1_590_000_000);
    expect(result.analysis?.grossMargin.toFixed(12)).toBe("0.700000000000");
    expect(result.analysis?.ordinaryNrr.toFixed(12)).toBe("0.835714285714");
    expect(result.analysis?.postMoneyOwnership.toFixed(12)).toBe("0.333333333333");
    expect(result.analysis?.recentNetBurnCents).toBe(23_500_000);
    expect(result.analysis?.runwayMonths?.toFixed(12)).toBe("19.148936170213");
    expect(result.analysis?.cohortElapsedMonths).toBe(11);
    expect(result.analysis?.terminalRevenueCents).toBe(4_852_294_922);
    expect(result.analysis?.exitEquityCents).toBe(24_261_474_610);
    expect(result.analysis?.grossMoic.toFixed(12)).toBe("3.234863281200");
    expect(result.analysis?.annualizedGrossReturn.toFixed(12)).toBe("0.264652439362");
    expect(Object.fromEntries(result.analysis!.metrics.map((metric) => [metric.id, metric.display]))).toMatchObject({"ltm-revenue": "$15.9M", "gross-margin": "70.0%", "ordinary-nrr": "83.6%", runway: "19.1 mo", ownership: "33.3%", "gross-moic": "3.23x", "annualized-return": "26.5%"});
    expect(result.analysis?.tests.find((test) => test.gateId === "retention-nrr")).toMatchObject({observed: "83.6% across 11 months", required: "95.0% across 12 months", state: "BLOCKED", blocksAdvancement: true, source: "DESK_DEFAULT_UNREVIEWED"});
    expect(result.analysis?.tests.find((test) => test.gateId === "cohort-completeness")).toMatchObject({state: "BLOCKED", blocksAdvancement: true});
    expect(result.analysis?.tests.find((test) => test.gateId === "burn-runway-quality")).toMatchObject({state: "UNREVIEWED", blocksAdvancement: true});
    expect(result.analysis?.policyProfile.profileId).toBe(GROWTH_SCREEN_POLICY.profileId);
    expect(result.analysis?.policyProfile.source).toBe("DESK_DEFAULT_UNREVIEWED");
    expect(result.rationale).toMatch(/^7 policy or diligence gates remain unresolved/);
    expect(result.processedLocally).toBe(true);
  });

  it("admits a cash-generative package without inventing an infinite runway", async () => {
    const cashGenerativeMonthly = monthly.split("\n").map((line, index) => {
      if (index === 0) return line;
      const cells = line.split(",");
      cells[3] = String(Number(cells[1]) - Number(cells[2]) - 1_000_000);
      return cells.join(",");
    }).join("\n");
    const result = await processDealPackage(await packageFiles({monthly: cashGenerativeMonthly}));
    expect(result.packageState).toBe("READY");
    expect(result.analysis?.recentNetBurnCents).toBe(-1_000_000);
    expect(result.analysis?.runwayMonths).toBeNull();
    expect(result.analysis?.tests.find((test) => test.gateId === "runway-numeric")).toMatchObject({observed: "Cash generative", state: "CLEARS", blocksAdvancement: false});
    expect(result.errors).toEqual([]);
  });

  it("fails closed when a required file is missing and exposes no returns", async () => {
    const files = await packageFiles();
    const result = await processDealPackage(files.filter((file) => file.name !== "customer_arr.csv"));
    expect(result.packageState).toBe("INCOMPLETE");
    expect(result.posture).toBe("NO CALL — PACKAGE INCOMPLETE");
    expect(result.analysis).toBeNull();
    expect(result.files.find((file) => file.name === "customer_arr.csv")?.state).toBe("MISSING");
  });

  it("does not let package-authored thresholds grade or authorize the deal", async () => {
    const holdDeal = deal.replace('"minimum_gross_moic":"2.5"', '"minimum_gross_moic":"4.0"');
    const result = await processDealPackage(await packageFiles({deal: holdDeal}));
    expect(result.packageState).toBe("READY");
    expect(result.posture).toBe("SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED");
    expect(result.analysis).not.toBeNull();
    expect(result.deal?.packageRequestedThresholds.minimumGrossMoic).toBe(4);
    expect(result.analysis?.tests.find((test) => test.gateId === "returns-moic")?.required).toBe("3.00x");
    expect(result.analysis?.tests.find((test) => test.gateId === "retention-nrr")?.state).toBe("BLOCKED");
    expect(result.rationale).toMatch(/cannot authorize advancement/i);
  });

  it("produces identical policy results for permissive and impossible package-requested thresholds", async () => {
    const permissive = deal.replace('"minimum_gross_moic":"2.5","minimum_annualized_return":"0.20","minimum_runway_months":"12"', '"minimum_gross_moic":"0","minimum_annualized_return":"-0.99","minimum_runway_months":"0"');
    const impossible = deal.replace('"minimum_gross_moic":"2.5","minimum_annualized_return":"0.20","minimum_runway_months":"12"', '"minimum_gross_moic":"100","minimum_annualized_return":"10","minimum_runway_months":"120"');
    const low = await processDealPackage(await packageFiles({deal: permissive}));
    const high = await processDealPackage(await packageFiles({deal: impossible}));
    expect(low.deal?.packageRequestedThresholds.minimumGrossMoic).toBe(0);
    expect(high.deal?.packageRequestedThresholds.minimumGrossMoic).toBe(100);
    expect(low.analysis?.tests).toEqual(high.analysis?.tests);
    expect(low.posture).toBe(high.posture);
    expect(low.rationale).toBe(high.rationale);
  });

  it("never lets a favorable sub-annual retention proxy clear an annual NRR screen", async () => {
    const shortCohort = `customer_id,period,arr_cents
customer-a,2026-03,100000000
customer-a,2026-06,96000000`;
    const result = await processDealPackage(await packageFiles({customers: shortCohort}));
    expect(result.packageState).toBe("READY");
    expect(result.analysis?.ordinaryNrr).toBe(0.96);
    expect(result.analysis?.tests.find((test) => test.gateId === "retention-nrr")).toMatchObject({observed: "96.0% across 3 months", state: "BLOCKED", blocksAdvancement: true});
    expect(result.analysis?.tests.find((test) => test.gateId === "retention-nrr")?.explanation).toMatch(/cannot clear an annual NRR screen/i);
  });

  it("uses HOLD when a complete package misses deterministic return screens", async () => {
    const weakReturnDeal = deal.replace('"annual_revenue_growth":"0.25","exit_revenue_multiple":"5.0"', '"annual_revenue_growth":"0.00","exit_revenue_multiple":"1.0"');
    const result = await processDealPackage(await packageFiles({deal: weakReturnDeal}));
    expect(result.packageState).toBe("READY");
    expect(result.posture).toBe("HOLD");
    expect(result.rationale).toMatch(/deterministic return screens miss/i);
    expect(result.analysis?.tests.find((test) => test.gateId === "returns-moic")?.state).toBe("CONCERN");
  });

  it("rejects a caller-created policy profile that is not in the Desk registry", async () => {
    await expect(processDealPackage(await packageFiles(), {...GROWTH_SCREEN_POLICY, profileId: "ad-hoc-easy-policy"})).rejects.toThrow(/not admitted by the Desk registry/);
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

  it("requires a named human and rationale before creating Version 1", async () => {
    const result = await processDealPackage(await packageFiles());
    expect(() => approveBaseline(result, "", "Reviewed mappings and exclusions.")).toThrow(/named human analyst/i);
    expect(() => approveBaseline(result, "Avery Chen", "Too short")).toThrow(/Explain why/i);
    const approved = approveBaseline(result, "Avery Chen", "Reviewed the declared mappings, exclusions, and package boundaries for screening.", "2026-09-01T12:00:00.000Z");
    expect(approved.baselineApproval).toMatchObject({version: "V1", actor: "Avery Chen", approvedAt: "2026-09-01T12:00:00.000Z", packageDigest: expect.stringMatching(/^[a-f0-9]{64}$/)});
    expect(result.baselineApproval).toBeNull();
  });
});
