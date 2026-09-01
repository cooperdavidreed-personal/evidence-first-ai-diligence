import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {expect, test, type Page, type TestInfo} from "@playwright/test";

import {captureVisualEvidence, writeAccessibilityEvidence} from "./visual-evidence";

const workbenchDataSha256 = createHash("sha256")
  .update(readFileSync(resolve(import.meta.dirname, "../src/data/cases.json")))
  .digest("hex");

async function settleAtTop(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo(0, 0);
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
    window.scrollTo(0, 0);
  });
}

async function accessibilitySnapshot(page: Page) {
  const scan = await new AxeBuilder({page}).analyze();
  const critical = scan.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
  expect(critical).toEqual([]);
  const width = await page.evaluate(() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  const minimumVisibleTextPx = await page.evaluate(() => {
    const sizes: number[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim() || !(node.parentElement instanceof HTMLElement)) continue;
      const parent = node.parentElement;
      const style = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0) continue;
      sizes.push(Number.parseFloat(style.fontSize));
    }
    return Math.min(...sizes);
  });
  if (width.client <= 390) expect(minimumVisibleTextPx).toBeGreaterThanOrEqual(8);
  return {
    critical_or_serious_count: critical.length,
    violations: scan.violations.map((item) => ({id: item.id, impact: item.impact, nodes: item.nodes.length})),
    root_client_width: width.client,
    root_scroll_width: width.scroll,
    minimum_visible_text_px: minimumVisibleTextPx,
  };
}

test("landing explains the product and opens a sample deal", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: /Turn a crowded data room/})).toBeVisible();
  await expect(page.getByText("Do we meet the $240M ask, counter at $210M, or walk?")).toBeVisible();
  await expect(page.getByText(/\$220M ask/)).toHaveCount(0);
  await expect(page.getByRole("button", {name: /Review a sample deal/})).toBeVisible();
  await settleAtTop(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-investor-workspace-landing.png`);
  await page.getByRole("button", {name: /Review a sample deal/}).click();
  await expect(page).toHaveURL(/#\/v2\/atlasgrid\/overview$/);
  await expect(page.getByRole("heading", {name: "Do we meet the $240M ask, counter at $210M, or walk?"})).toBeVisible();
});

for (const candidate of [
  {id: "atlasgrid", name: "AtlasGrid Systems", question: "Do we meet the $240M ask, counter at $210M, or walk?"},
  {id: "helios", name: "Helios Compute Control", question: "Do we fund $25M now and reserve $15M for verified milestones?"},
]) {
  test(`${candidate.name} investor journey, source inspection, and responsive evidence`, async ({page}, testInfo: TestInfo) => {
    test.setTimeout(60_000);
    const scans: Array<Record<string, unknown>> = [];
    const caseSlug = candidate.name.toLowerCase().replaceAll(" ", "-");
    await page.goto(`/?visual=${candidate.id}-overview#/v2/${candidate.id}/overview`, {waitUntil: "networkidle"});
    await expect(page.getByRole("heading", {name: candidate.name})).toBeVisible();
    await expect(page.getByRole("heading", {name: candidate.question})).toBeVisible();
    await expect(page.getByText("SYNTHETIC — NOT INVESTMENT ADVICE", {exact: true})).toBeVisible();
    await expect(page.getByRole("navigation", {name: "Primary investment views"}).getByRole("button")).toHaveCount(4);
    await settleAtTop(page);
    scans.push({view: "Overview", ...await accessibilitySnapshot(page)});
    await captureVisualEvidence(page, `${testInfo.project.name}-${caseSlug}-overview.png`);

    const assumption = candidate.id === "atlasgrid" ? "$220M" : "30.0% annual growth";
    await expect(page.getByText(/Decision impact:/)).toBeVisible();
    await page.getByRole("button", {name: assumption}).click();
    await expect(page.getByText(candidate.id === "atlasgrid" ? /Return hurdle fails/ : /The binding loss test/)).toBeVisible();
    if (candidate.id === "helios") await expect(page.getByText(/option pool modeled as fully granted common at exit/)).toBeVisible();
    await expect(page).toHaveURL(candidate.id === "atlasgrid" ? /driver=entry_enterprise_value_cents/ : /driver=annual_revenue_growth/);

    await expect(page.getByText("Private to this browser.")).toBeVisible();
    await page.getByRole("button", {name: "Review approval"}).first().click();
    await expect(page.getByText(/This records analyst judgment only/)).toBeVisible();
    await page.getByRole("button", {name: "Cancel"}).click();
    await expect(page.getByRole("button", {name: /Estimated effect/})).toBeVisible();

    const lineage = page.getByRole("button", {name: /Inspect lineage/}).first();
    await lineage.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("Calculation and decision chain");
    await expect(page.getByRole("dialog")).toContainText("Readable source evidence");
    if (testInfo.project.name === "desktop") await captureVisualEvidence(page, `desktop-${caseSlug}-contextual-source-drawer.png`);
    await page.keyboard.press("Escape");
    await expect(lineage).toBeFocused();

    const routes = [
      ["Thesis", "thesis", /How the evidence changes the call/],
      ["Financials & Returns", "financials", /(Price, leverage, and downside|Terms, ownership, runway, and preferences)/],
      ["Risks & Diligence", "risks", /Resolve these before the next committee step/],
      ["Value Creation", "value-creation", /(Value creation reconciles|Value creation changes runway)/],
      ["Memo", "memo", /IC question/],
    ] as const;
    for (const [view, slug, heading] of routes) {
      await page.goto(`/?visual=${candidate.id}-${slug}#/v2/${candidate.id}/${slug}`, {waitUntil: "networkidle"});
      await expect(page.getByRole("heading", {name: heading}).first()).toBeVisible();
      await settleAtTop(page);
      scans.push({view, ...await accessibilitySnapshot(page)});
      await captureVisualEvidence(page, `${testInfo.project.name}-${caseSlug}-${slug}.png`);
    }

    await page.goto(`/#/v2/${candidate.id}/methodology`);
    await expect(page.getByRole("heading", {name: /What the design can—and cannot—establish/})).toBeVisible();
    scans.push({view: "Methodology", ...await accessibilitySnapshot(page)});

    writeAccessibilityEvidence(`${testInfo.project.name}-${caseSlug}-redesign.json`, {
      boundary: "Automated Axe scan found no critical or serious issue; tested root overflow is zero and mobile visible text is at least 8px. This is not comprehensive WCAG conformance or observed readability proof.",
      case: candidate.name,
      project: testInfo.project.name,
      scans,
      viewport: page.viewportSize(),
      workbench_data_sha256: workbenchDataSha256,
    });
  });
}

test("legacy routes and deal-room deep links migrate deterministically", async ({page}) => {
  await page.goto("/#/v2/helios/evidence");
  await expect(page).toHaveURL(/#\/v2\/helios\/thesis$/);
  await page.getByRole("button", {name: "Explore the deal"}).click();
  const search = page.getByRole("searchbox", {name: "Search room"});
  await search.fill("HX-05");
  await page.getByRole("button", {name: /Open analysis/}).click();
  await expect(page).toHaveURL(/#\/v2\/helios\/methodology\?section=analysis-HX-05$/);
  await expect(page.locator("#analysis-HX-05")).toBeVisible();
  await page.goto("/#/v2/atlasgrid/underwriting?scenario=ask&driver=exit_multiple&cell=exit_multiple%3A5.5");
  await expect(page).toHaveURL(/#\/v2\/atlasgrid\/financials\?scenario=ask&driver=exit_multiple&cell=exit_multiple%3A5.5$/);
  await expect(page.getByRole("button", {name: "Seller ask"})).toHaveAttribute("aria-pressed", "true");
});

test("each deep link loads only its selected case chunk until switch", async ({page}) => {
  const requests: string[] = [];
  page.on("response", (response) => {if (response.url().includes("underwriting-case-")) requests.push(response.url());});
  await page.goto("/#/v2/helios/overview", {waitUntil: "networkidle"});
  expect(requests.some((url) => url.includes("helios"))).toBe(true);
  expect(requests.some((url) => url.includes("atlasgrid"))).toBe(false);
  await page.getByRole("button", {name: "PE / Growth Equity AtlasGrid Systems"}).click();
  await expect(page.getByRole("heading", {name: "AtlasGrid Systems"})).toBeVisible();
  expect(requests.filter((url) => url.includes("atlasgrid"))).toHaveLength(1);
});

test("Helios working assumptions recompute a retained case and preserve HOLD", async ({page}) => {
  await page.goto("/#/v2/helios/overview", {waitUntil: "networkidle"});
  await page.getByTestId("helios-assumption-growth").fill("30");
  await page.getByTestId("helios-policy-loss-maximum").fill("8");
  await page.getByTestId("helios-recalculate-working-case").click();
  await expect(page.getByTestId("helios-working-change-record")).toContainText("Growth 48.0% → 30.0%");
  await expect(page.getByTestId("helios-working-change-record")).toContainText("Loss ceiling 10.0% → 8.0%");
  await expect(page.getByTestId("helios-working-case-status")).toContainText("HOLD");
});
