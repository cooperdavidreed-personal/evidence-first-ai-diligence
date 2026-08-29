import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

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

for (const caseName of ["AtlasGrid Systems", "Helios Compute Control"]) {
  test(`${caseName} complete keyboard, interaction, visual, and accessibility flow`, async ({page}, testInfo: TestInfo) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo({top: 0, left: 0, behavior: "instant"}));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(4);
    await page.getByRole("button", {name: new RegExp(caseName)}).click();
    await expect(page.getByRole("heading", {name: caseName})).toBeVisible();
    await expect(page.getByText("SYNTHETIC — NOT INVESTMENT ADVICE")).toBeVisible();
    await expect(page.getByText("PENDING HUMAN")).toBeVisible();

    const lineageTrigger = page.getByRole("button", {name: /Inspect lineage/}).first();
    await lineageTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Transformation").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(lineageTrigger).toBeFocused();

    for (const [view, heading] of Object.entries(viewChecks)) {
      await page.getByRole("button", {name: new RegExp(view)}).click();
      await expect(page.getByRole("heading", {name: heading})).toBeVisible();
      if (view === "Econometric Lab") {
        await page.getByRole("button", {name: "Association / abstention"}).click();
        await expect(page.getByLabel("Naive versus adjusted comparison")).toBeVisible();
        await page.getByRole("button", {name: "Identified synthetic effect"}).click();
      }
      if (view === "Thesis & Evidence") {
        const graph = page.getByRole("tree", {name: "Evidence to decision dependency graph"});
        if (testInfo.project.name === "desktop") {
          await expect(graph).toBeVisible();
          const selectedNode = graph.locator(".dag-node.evidence").first();
          await selectedNode.click();
          expect(await graph.locator(".dag-node.active").count()).toBeGreaterThan(1);
          expect(await graph.locator(".dag-node.muted").count()).toBeGreaterThan(0);
          await page.getByRole("button", {name: "Clear path"}).click();
        } else {
          await expect(graph).toBeHidden();
          const dependencyList = page.getByRole("list", {name: "Thesis dependency list"});
          await expect(dependencyList).toBeVisible();
          const initialCount = await dependencyList.getByRole("listitem").count();
          await dependencyList.getByRole("button").first().click();
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
        if (caseName === "Helios Compute Control") await expect(page.locator(".initiative-list")).toContainText("Formula:");
        const evidence = caseName === "AtlasGrid Systems"
          ? page.getByRole("button", {name: /Inspect lineage for Renewal architecture exit_equity_delta_cents/}).first()
          : page.getByRole("button", {name: /combined minimum cash delta cents/i}).first();
        await evidence.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(evidence).toBeFocused();
      }
      await assertBoundedAndAccessible(page);
      const slug = view.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
      const caseSlug = caseName.toLowerCase().replaceAll(" ", "-");
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo({top: 0, left: 0, behavior: "instant"});
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(4);
      await page.screenshot({path: `../dist/visual-evidence/${testInfo.project.name}-${caseSlug}-${slug}.png`, fullPage: false, animations: "disabled"});
    }
  });
}
