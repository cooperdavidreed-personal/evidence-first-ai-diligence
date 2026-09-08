import {expect, test} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";

test("component standard supports keyboard sorting and a recoverable empty filter", async ({page}) => {
  await page.goto("/#/design-system");
  const table = page.getByRole("table", {name: "Component example records"});
  const sort = table.getByRole("button", {name: "Sort by Illustrative value"});
  await sort.focus();
  await page.keyboard.press("Enter");
  await expect(table.locator("thead th").last()).toHaveAttribute("aria-sort", "ascending");
  await expect(table.locator("tbody tr").first()).toContainText("Debt terms");
  await page.getByRole("searchbox", {name: "Find record"}).fill("missing");
  await expect(table).toContainText("No records match this view.");
  await page.getByRole("button", {name: "Reset filters"}).click();
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await page.screenshot({path: resolve(`../dist/${test.info().project.name}-design-system.png`), fullPage: true});
});

test("financial work area survives reload without replacing the selected scenario", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/financials");
  await page.getByRole("button", {name: "Seller ask", exact: true}).click();
  await page.getByRole("navigation", {name: "Financial workspace sections"}).getByRole("button", {name: "Capital and cash"}).click();
  await expect(page).toHaveURL(/financials\/capital$/);
  await expect(page.locator(".capital-area").first()).toBeVisible();
  await expect(page.locator(".sensitivity-workspace")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", {name: "Capital and cash", exact: true})).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", {name: "Buyout decision screen"})).toContainText("17.6%");
});

test("committee record downloads reconciled contents with a reproducible checksum", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/memo");
  await page.getByRole("button", {name: "Edit memo", exact:true}).click();
  await page.getByRole("textbox", {name: "Editor"}).fill("Committee verification analyst");
  const reconcile = page.getByRole("button", {name: /Reconcile core sections to/});
  if (await reconcile.count()) await reconcile.click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", {name: "Download frozen committee packet"}).click();
  const downloaded = await pending;
  const payload = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(payload.contents.decisionStatus).toBe("IC_DECISION_PENDING");
  expect(payload.contents.memoSections.length).toBeGreaterThan(0);
  expect(payload.contents.memoSections.every((section: {scenarioSnapshotId: string}) => section.scenarioSnapshotId === payload.contents.scenarioSnapshotId)).toBe(true);
  expect(payload.contentSha256).toBe(createHash("sha256").update(JSON.stringify(payload.contents)).digest("hex"));
  expect(payload.contents).not.toHaveProperty("privateNote");
});
