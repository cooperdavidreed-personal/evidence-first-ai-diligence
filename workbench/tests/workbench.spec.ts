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
  return {
    critical_or_serious_count: critical.length,
    violations: scan.violations.map((item) => ({id: item.id, impact: item.impact, nodes: item.nodes.length})),
    root_client_width: width.client,
    root_scroll_width: width.scroll,
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
    await expect(page.getByRole("navigation", {name: "Primary investment views"}).getByRole("button")).toHaveCount(6);
    await settleAtTop(page);
    scans.push({view: "Overview", ...await accessibilitySnapshot(page)});
    await captureVisualEvidence(page, `${testInfo.project.name}-${caseSlug}-overview.png`);

    const assumption = candidate.id === "atlasgrid" ? "$220M" : "$400M";
    await expect(page.getByText(/Recommendation impact:/)).toBeVisible();
    await page.getByRole("button", {name: assumption}).click();
    await expect(page.getByText(/Return hurdle fails/)).toBeVisible();
    await expect(page).toHaveURL(candidate.id === "atlasgrid" ? /driver=entry_enterprise_value_cents/ : /driver=exit_value/);

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
      boundary: "Automated Axe scan found no critical or serious issue and tested root overflow is zero; this is not comprehensive WCAG conformance.",
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
