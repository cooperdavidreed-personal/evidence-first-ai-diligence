import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const viewChecks = {
  "IC Snapshot": /What must be true/,
  "Thesis & Evidence": /Evidence → estimate → judgment → action/,
  "Econometric Lab": /What the design can—and cannot—establish/,
  "Underwriting Room": /Price, structure, and downside/,
  "Value Creation": /Every initiative earns its place in the value bridge/,
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
      if (view === "Underwriting Room") {
        for (const scenario of await page.locator(".scenario-tabs button").all()) await scenario.click();
        await page.getByLabel("Proportional stress:").fill("-10");
        await expect(page.locator("output")).toContainText("illustrative stressed MOIC");
      }
      if (view === "Value Creation") {
        const evidence = page.getByRole("button", {name: "Inspect evidence ↗"}).first();
        await evidence.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(evidence).toBeFocused();
      }
      await assertBoundedAndAccessible(page);
      const slug = view.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
      const caseSlug = caseName.toLowerCase().replaceAll(" ", "-");
      await page.screenshot({path: `../dist/visual-evidence/${testInfo.project.name}-${caseSlug}-${slug}.png`, fullPage: true});
    }
  });
}
