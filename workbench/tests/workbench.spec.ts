import AxeBuilder from "@axe-core/playwright";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {expect, test, type Page, type TestInfo} from "@playwright/test";
import {captureVisualEvidence, writeAccessibilityEvidence} from "./visual-evidence";

const packagePaths = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"].map((name) => resolve(import.meta.dirname, `../public/sample-package/${name}`));
const views = ["Overview", "Financials", "Diligence", "Documents", "IC Memo"] as const;

async function settleAtTop(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo(0, 0);
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    window.scrollTo(0, 0);
  });
}

async function accessibilitySnapshot(page: Page) {
  const scan = await new AxeBuilder({page}).analyze();
  const critical = scan.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
  expect(critical).toEqual([]);
  const dimensions = await page.evaluate(() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  const minimumVisibleTextPx = await page.evaluate(() => {
    const sizes: number[] = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent?.trim() || !parent) continue;
      const style = getComputedStyle(parent); const rect = parent.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0) continue;
      sizes.push(Number.parseFloat(style.fontSize));
    }
    return Math.min(...sizes);
  });
  expect(minimumVisibleTextPx).toBeGreaterThanOrEqual(dimensions.client <= 390 ? 11 : 12);
  return {critical_or_serious_count: critical.length, violations: scan.violations.map((item) => ({id: item.id, impact: item.impact, nodes: item.nodes.length})), root_client_width: dimensions.client, root_scroll_width: dimensions.scroll, minimum_visible_text_px: minimumVisibleTextPx};
}

async function visibleDefaultText(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *")].filter((element) => {
    const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
    return element.children.length === 0 && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }).map((element) => element.innerText).join("\n"));
}

async function assertPlainDefaultSurface(page: Page) {
  const text = await visibleDefaultText(page);
  expect(text).not.toMatch(/\b[0-9a-f]{64}\b/i);
  expect(text).not.toMatch(/\b(?:underwriting|atlasgrid|helios)\.[a-z0-9_-]+\/v\d\b/i);
  expect(text).not.toMatch(/(?:^|\s)data\/[a-z0-9_./-]+/i);
  expect(text).not.toMatch(/\b(?:AG|HX)-[A-Z0-9-]+\b/);
  expect(text).not.toMatch(/\b(?:log points|ITT|SMD|MC SE)\b/i);
}

async function visibleDealNavigation(page: Page) {
  return page.locator('nav[aria-label="Deal navigation"]:visible');
}

test("Deals is a calm product root with no critical accessibility or overflow finding", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "Deals"})).toBeVisible();
  await expect(page.getByRole("button", {name: "New deal"})).toBeVisible();
  await expect(page.getByText("Evidence → economics → action")).toHaveCount(0);
  await settleAtTop(page);
  const scan = await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-deals.png`);
  writeAccessibilityEvidence(`${testInfo.project.name}-deals.json`, {boundary: "Automated route evidence only; not comprehensive WCAG or observed usability proof.", project: testInfo.project.name, scans: [{view: "Deals", ...scan}], viewport: page.viewportSize()});
});

test("model connection center separates governed MCP from in-desk inference", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "Connect model"}).click();
  await expect(page.getByRole("dialog", {name: "Use your model without giving it the books"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "One deal record. Replaceable models."})).toBeVisible();
  await expect(page.getByText("Validated source package and lineage")).toBeVisible();
  await expect(page.getByText("Countertheses and missing diligence")).toBeVisible();
  let scan = await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-model-connection-approach.png`, true);
  await page.getByRole("button", {name: "Continue"}).click();
  await page.getByRole("radio", {name: /ChatGPT/}).click();
  await page.getByRole("button", {name: "Continue"}).click();
  await expect(page.getByRole("heading", {name: "A hosted connector is required"})).toBeVisible();
  await expect(page.getByText(/not a remotely reachable authenticated server/)).toBeVisible();
  await expect(page.getByText(/No provider keys are collected/)).toBeVisible();
  scan = await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-model-connection-hosted-boundary.png`, true);
  writeAccessibilityEvidence(`${testInfo.project.name}-model-connection.json`, {boundary: "Connection-wizard route evidence only; no live provider, remote MCP, credential, or comprehensive WCAG claim.", project: testInfo.project.name, scans: [{view: "Hosted connector boundary", ...scan}], viewport: page.viewportSize()});
});

test("local MCP proposal reaches named human review and the IC memo without persistence", async ({page}, testInfo: TestInfo) => {
  const temporary = mkdtempSync(resolve(tmpdir(), "underwriting-mcp-flow-")); const ledger = resolve(temporary, "proposals.jsonl");
  try {
    const server = resolve(import.meta.dirname, "../mcp-server/server.mjs");
    const request = {jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "propose_memo_section", arguments: {deal_id: "atlasgrid", section: "Downside follow-up", draft_text: "Reconcile the downside covenant bridge before the next committee review.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]}}};
    const run = spawnSync(process.execPath, [server, "--proposal-ledger", ledger], {encoding: "utf8", input: `${JSON.stringify(request)}\n`});
    expect(run.status).toBe(0); expect(run.stdout).toContain('"status":"PROPOSED"');
    await page.goto("/#/v3/atlasgrid/diligence", {waitUntil: "networkidle"});
    await page.getByLabel(/Choose JSONL ledger/).setInputFiles(ledger);
    await expect(page.getByText(/1 proposal ready for human review/)).toBeVisible();
    await page.getByRole("textbox", {name: "Human reviewer"}).fill("Avery Chen");
    await page.getByRole("button", {name: "Accept proposal"}).click();
    await (await visibleDealNavigation(page)).getByRole("button", {name: "IC Memo"}).click();
    await expect(page.getByText("Model proposed · accepted by Avery Chen")).toBeVisible();
    await expect(page.getByText(/Reconcile the downside covenant bridge/)).toBeVisible();
    await expect(page.getByText("Evidence: Gross IRR")).toBeVisible();
    await expect(page.getByText(/atlasgrid-SELECTED-gross-irr/)).toHaveCount(0);
    await expect(page.getByRole("heading", {name: "Model proposal disposition"})).toBeVisible();
    const scan = await accessibilitySnapshot(page);
    await captureVisualEvidence(page, `${testInfo.project.name}-mcp-human-review-memo.png`, true);
    writeAccessibilityEvidence(`${testInfo.project.name}-mcp-human-review.json`, {boundary: "Local synthetic MCP-ledger roundtrip only; no hosted connector, provider inference, persistence, security, or comprehensive WCAG claim.", project: testInfo.project.name, scans: [{view: "Accepted model proposal in IC memo", ...scan}], viewport: page.viewportSize()});
    await page.reload({waitUntil: "networkidle"});
    await expect(page.getByText(/Model proposed · accepted by/)).toHaveCount(0);
  } finally { rmSync(temporary, {recursive: true, force: true}); }
});

for (const candidate of [
  {id: "atlasgrid", company: "AtlasGrid Systems", posture: "REPRICE"},
  {id: "helios", company: "Helios Compute Control", posture: "HOLD"},
]) {
  test(`${candidate.company} five-destination investor journey`, async ({page}, testInfo: TestInfo) => {
    test.setTimeout(60_000);
    const scans: Array<Record<string, unknown>> = [];
    await page.goto(`/#/v3/${candidate.id}/overview`, {waitUntil: "networkidle"});
    await expect(page.getByRole("heading", {name: candidate.company})).toBeVisible();
    await expect((await visibleDealNavigation(page)).getByRole("button")).toHaveCount(5);
    await expect(page.getByRole("heading", {name: candidate.posture, exact: true})).toHaveCount(1);
    for (const view of views) {
      const navigation = await visibleDealNavigation(page);
      await navigation.getByRole("button", {name: view}).click();
      await expect(navigation.getByRole("button", {name: view})).toHaveAttribute("aria-current", "page");
      await settleAtTop(page);
      await assertPlainDefaultSurface(page);
      scans.push({view, ...await accessibilitySnapshot(page)});
      await captureVisualEvidence(page, `${testInfo.project.name}-${candidate.id}-${view.toLowerCase().replace(" ", "-")}.png`);
    }
    if (candidate.id === "helios") {
      await (await visibleDealNavigation(page)).getByRole("button", {name: "Diligence"}).click();
      await expect(page.getByText(/8.7% less compute per workload/)).toBeVisible();
      await expect(page.getByText("View method").locator(".." )).not.toHaveAttribute("open");
      await expect(page.getByText(/no runtime credentials configured/)).toBeVisible();
    }
    writeAccessibilityEvidence(`${testInfo.project.name}-${candidate.id}-product.json`, {boundary: "No critical or serious Axe finding and no root overflow on the five tested default surfaces; not comprehensive WCAG or practitioner evidence.", case: candidate.company, project: testInfo.project.name, scans, viewport: page.viewportSize()});
  });
}

test("ordinary multi-file intake produces a third in-memory deal and clears on refresh", async ({page}, testInfo: TestInfo) => {
  test.setTimeout(60_000);
  const externalRequests: string[] = [];
  page.on("request", (request) => { const url = new URL(request.url()); if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(request.url()); });
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "New deal"}).click();
  await expect(page.getByText(/bytes stay in this browser tab/)).toBeVisible();
  await page.getByTestId("deal-package-input").setInputFiles(packagePaths);
  await page.getByRole("button", {name: "Validate and analyze"}).click();
  await expect(page.getByRole("heading", {name: "READY FOR IC REVIEW"})).toBeVisible();
  await expect(page.getByText(/analytical posture, not an investment recommendation/)).toBeVisible();
  await expect(page.getByText("Hash mismatch")).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Open decision review"})).toBeVisible();
  await captureVisualEvidence(page, `${testInfo.project.name}-northstar-package-ready.png`, true);
  await page.getByRole("button", {name: "Open decision review"}).click();
  await expect(page.getByRole("heading", {name: "Northstar Metrics"})).toBeVisible();
  await expect((await visibleDealNavigation(page)).getByRole("button")).toHaveCount(5);
  await expect(page.getByRole("heading", {name: "READY FOR IC REVIEW", exact: true})).toHaveCount(1);
  const scans: Array<Record<string, unknown>> = [];
  for (const view of views) {
    await (await visibleDealNavigation(page)).getByRole("button", {name: view}).click();
    await settleAtTop(page); await assertPlainDefaultSurface(page);
    scans.push({view, ...await accessibilitySnapshot(page)});
    await captureVisualEvidence(page, `${testInfo.project.name}-northstar-${view.toLowerCase().replace(" ", "-")}.png`);
  }
  expect(externalRequests).toEqual([]);
  writeAccessibilityEvidence(`${testInfo.project.name}-northstar-intake.json`, {boundary: "Ordinary browser file selection through all five local-deal views; uploaded bytes were not observed leaving localhost. Automated evidence only.", project: testInfo.project.name, scans, viewport: page.viewportSize()});
  await page.reload({waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "Deals"})).toBeVisible();
  await expect(page.getByText("Northstar Metrics")).toHaveCount(0);
});

test("missing required input fails closed before return conclusions", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "New deal"}).click();
  await page.getByTestId("deal-package-input").setInputFiles(packagePaths.filter((path) => !path.endsWith("customer_arr.csv")));
  await page.getByRole("button", {name: "Validate and analyze"}).click();
  await expect(page.getByRole("heading", {name: "NO CALL — PACKAGE INCOMPLETE"})).toBeVisible();
  await expect(page.getByText("customer_arr.csv is required").first()).toBeVisible();
  await expect(page.getByRole("button", {name: "Open decision review"})).toHaveCount(0);
  await expect(page.getByText(/Gross multiple/)).toHaveCount(0);
  await captureVisualEvidence(page, `${testInfo.project.name}-northstar-package-incomplete.png`, true);
});

test("deep links still load only the selected retained case chunk", async ({page}) => {
  const requests: string[] = []; page.on("response", (response) => { if (response.url().includes("underwriting-case-")) requests.push(response.url()); });
  await page.goto("/#/v3/helios/overview", {waitUntil: "networkidle"});
  expect(requests.some((url) => url.includes("helios"))).toBe(true);
  expect(requests.some((url) => url.includes("atlasgrid"))).toBe(false);
  await page.getByRole("combobox", {name: "Deal"}).selectOption("atlasgrid");
  await expect(page.getByRole("heading", {name: "AtlasGrid Systems"})).toBeVisible();
  expect(requests.filter((url) => url.includes("atlasgrid"))).toHaveLength(1);
});
