import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import {captureVisualEvidence} from "./visual-evidence";

const viewChecks = {
  "IC Snapshot": /What must be true/,
  "Thesis & Evidence": /Evidence → estimate → judgment → action/,
  "Econometric Lab": /What the design can—and cannot—establish/,
  "Underwriting Room": /(Price, leverage, and downside|Terms, ownership, runway, and preferences)/,
  "Value Creation": /(Every initiative earns its place|Value creation reconciles|Value creation changes runway)/,
};

async function assertBoundedAndAccessible(page: Page) {
  const scan = await new AxeBuilder({page}).analyze();
  expect(scan.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`),
  }));
  expect(width.scroll, `overflowing elements: ${width.offenders.join(", ")}`).toBeLessThanOrEqual(width.client);
}

async function assertInFirstViewport(page: Page, locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${label} has no layout box`).not.toBeNull();
  expect(viewport, `${label} has no viewport`).not.toBeNull();
  expect(box!.y, `${label} begins above the initial viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${label} falls below the initial viewport`).toBeLessThanOrEqual(viewport!.height);
}

for (const caseName of ["AtlasGrid Systems", "Helios Compute Control"]) {
  test(`${caseName} complete keyboard, interaction, visual, and accessibility flow`, async ({page}, testInfo: TestInfo) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo({top: 0, left: 0, behavior: "instant"}));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(5);
    await page.getByRole("button", {name: new RegExp(caseName)}).click();
    await expect(page.getByRole("heading", {name: caseName})).toBeVisible();
    await expect(page.getByText("SYNTHETIC — NOT INVESTMENT ADVICE")).toBeVisible();
    await expect(page.getByText("PENDING HUMAN")).toBeVisible();

    const firstViewportChecks = [
      [page.locator(".case-masthead .kicker"), "illustrative posture"],
      [page.getByText("PENDING HUMAN", {exact: true}), "human authority state"],
      [page.getByText("HOLD", {exact: true}), "workflow hold state"],
      [page.getByText("PENDING FOUNDER SIGNATURE", {exact: true}), "unsigned decision state"],
      [page.getByRole("heading", {name: caseName === "AtlasGrid Systems" ? "REPRICE" : "CONDITIONAL INVEST"}), "price or investment posture"],
      [page.getByText(caseName === "AtlasGrid Systems" ? "Cap earnout against verified live ARR" : "Ordinary-cohort NRR at or above 105%", {exact: true}), "decisive driver"],
    ] as Array<[Locator, string]>;
    if (caseName === "Helios Compute Control") {
      firstViewportChecks.push([page.getByRole("button", {name: /Milestone · Series C funded capital/}), "capital and ownership terms"]);
    } else {
      firstViewportChecks.push([page.getByRole("button", {name: /Upfront EV/}), "selected entry price"]);
      if (testInfo.project.name === "desktop") firstViewportChecks.push([page.getByRole("button", {name: /Funded term debt/}), "selected financing structure"]);
    }
    for (const [locator, label] of firstViewportChecks) await assertInFirstViewport(page, locator, label);

    const lineageTrigger = page.getByRole("button", {name: /Inspect lineage/}).first();
    await lineageTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Transformation").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(lineageTrigger).toBeFocused();

    const chartIds = new Set<string>();
    for (const [view, heading] of Object.entries(viewChecks)) {
      await page.getByRole("button", {name: new RegExp(view)}).click();
      await expect(page.getByRole("heading", {name: heading})).toBeVisible();
      if (view !== "Econometric Lab") {
        const chartContract = page.getByLabel(`${view} chart contracts`).locator("[data-chart-id]");
        await expect(chartContract).toHaveCount(1);
        chartIds.add((await chartContract.getAttribute("data-chart-id"))!);
      }
      if (view === "Econometric Lab") {
        await page.getByRole("button", {name: "Association / abstention"}).click();
        await expect(page.getByLabel("Naive versus adjusted comparison")).toBeVisible();
        await page.getByRole("button", {name: "Identified synthetic effect"}).click();
        const estimate = page.getByRole("button", {name: caseName === "AtlasGrid Systems" ? "Inspect lineage for Randomized offer ITT" : "Inspect lineage for Precommitted unadjusted randomized ITT"});
        await expect(estimate).toHaveAttribute("data-metric-id", caseName === "AtlasGrid Systems" ? "atlasgrid-ag-07-renewal_itt" : "helios-hx-06-optimizer_ate");
        await estimate.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByRole("dialog")).toContainText(caseName === "AtlasGrid Systems" ? "renewal_itt" : "optimizer_ate");
        await page.keyboard.press("Escape");
        await expect(estimate).toBeFocused();
      }
      if (view === "Thesis & Evidence") {
        await expect(page.getByRole("heading", {name: "Diligence requests and decision consequences"})).toBeVisible();
        const graph = page.getByRole("tree", {name: "Evidence to decision dependency graph"});
        if (testInfo.project.name === "desktop") {
          await expect(graph).toBeVisible();
          await expect(graph).toHaveAttribute("data-edge-count", "31");
          await expect(graph.locator(".dag-edges line")).toHaveCount(31);
          const selectedNode = graph.locator(".dag-node.decision").first();
          await selectedNode.focus();
          await page.keyboard.press("Enter");
          expect(await graph.locator(".dag-node.active").count()).toBeGreaterThan(1);
          expect(await graph.locator(".dag-node.muted").count()).toBeGreaterThan(0);
          await page.getByRole("button", {name: "Clear path"}).click();
        } else {
          await expect(graph).toBeHidden();
          const dependencyList = page.getByRole("list", {name: "Thesis dependency list"});
          await expect(dependencyList).toBeVisible();
          const initialCount = await dependencyList.getByRole("listitem").count();
          const selectedNode = dependencyList.getByRole("button").first();
          await selectedNode.focus();
          await page.keyboard.press("Enter");
          expect(await dependencyList.getByRole("listitem").count()).toBeLessThan(initialCount);
          await page.getByRole("button", {name: "Clear path"}).click();
        }
      }
      if (view === "Underwriting Room") {
        if (caseName === "AtlasGrid Systems") {
          await page.getByRole("button", {name: "Seller ask"}).click();
          await expect(page.getByRole("button", {name: /Upfront EV \$240M/})).toBeVisible();
          await page.getByRole("button", {name: "Selected"}).click();
          await page.getByRole("button", {name: "Downside"}).click();
          await page.getByRole("combobox", {name: "Driver"}).selectOption("exit_multiple");
          await page.getByRole("button", {name: "5.5x"}).click();
          await expect(page.getByRole("button", {name: /Gross IRR/}).last()).toBeVisible();
          const financeLineage = page.getByRole("button", {name: /Maximum bid/});
          await financeLineage.click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(financeLineage).toBeFocused();
        } else {
          const receipt = await page.locator(".engine-receipt code").textContent();
          await page.getByRole("button", {name: "Shortfall bridge"}).click();
          await expect(page.getByText(/Shortfall M/)).toBeVisible();
          expect(await page.locator(".engine-receipt code").textContent()).not.toBe(receipt);
          await expect(page.getByRole("heading", {name: "Exit waterfall"})).toBeVisible();
          await expect(page.getByRole("heading", {name: "Milestone test ledger"})).toBeVisible();
          await page.getByRole("combobox", {name: "Driver"}).selectOption("milestone_state");
          await page.getByRole("button", {name: "FAIL"}).click();
          const financeLineage = page.getByRole("button", {name: /Series C gross XIRR/}).first();
          await financeLineage.click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await expect(page.getByRole("dialog")).toContainText("DATED_XIRR");
          await expect(page.getByRole("dialog").locator(".formula-inspection li")).toHaveCount(2);
          await page.keyboard.press("Escape");
          await expect(financeLineage).toBeFocused();
        }
      }
      if (view === "Value Creation") {
        if (caseName === "Helios Compute Control") await expect(page.getByLabel("Prioritized value-creation initiatives")).toContainText("Formula:");
        const evidence = caseName === "AtlasGrid Systems"
          ? page.getByRole("button", {name: /Inspect lineage for Renewal architecture exit_equity_delta_cents/}).first()
          : page.getByRole("button", {name: /combined minimum cash delta cents/i}).first();
        await evidence.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(evidence).toBeFocused();
        await expect(page.getByRole("heading", {name: "Screened-out levers"})).toBeVisible();
        await expect(page.getByLabel("Prioritized value-creation initiatives")).toContainText("Implementation cost");
      }
      await assertBoundedAndAccessible(page);
      const slug = view.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
      const caseSlug = caseName.toLowerCase().replaceAll(" ", "-");
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo({top: 0, left: 0, behavior: "instant"});
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(5);
      await captureVisualEvidence(page, `${testInfo.project.name}-${caseSlug}-${slug}.png`);
    }
    expect(chartIds.size).toBe(4);
  });
}
