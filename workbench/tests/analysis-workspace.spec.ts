import {expect, test} from "@playwright/test";
import {resolve} from "node:path";

test("investment matrix keeps evidence inspectable and assigns a persistent diligence question", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/documents");
  await expect(page.getByRole("table", {name: "Investment evidence matrix"})).toBeVisible();
  await expect(page.getByRole("complementary", {name: "Decision status"})).toHaveCount(0);
  await page.screenshot({path: resolve("../dist/analysis-matrix-1440.png"), fullPage: true});
  await page.setViewportSize({width: 1728, height: 1117});
  await page.screenshot({path: resolve("../dist/analysis-matrix-1728.png"), fullPage: true});
  const matrix = page.getByRole("table", {name: "Investment evidence matrix"});
  await matrix.locator("tbody").getByRole("button").nth(1).click();
  const inspector = page.getByRole("complementary", {name: "Selected evidence inspector"});
  const measure = await inspector.getByRole("heading").first().innerText();
  await inspector.getByRole("button", {name: /Trace exact source/}).click();
  await expect(page.getByRole("dialog", {name: measure})).toBeVisible();
  await page.getByRole("button", {name: "Close source trace"}).click();
  await expect(inspector.getByRole("heading", {name: measure})).toBeVisible();
  await inspector.getByRole("button", {name: "Add diligence question"}).click();
  await inspector.getByRole("textbox", {name: "Question", exact: true}).fill("Reconcile the revised retention cohort");
  await inspector.getByRole("textbox", {name: "Owner", exact: true}).fill("Commercial diligence lead");
  await inspector.getByRole("button", {name: "Assign diligence question"}).click();
  await expect(inspector.getByText("Reconcile the revised retention cohort", {exact: false})).toBeVisible();
  await page.reload();
  await page.getByRole("navigation", {name: "Deal navigation"}).getByRole("button", {name: "Review", exact: true}).click();
  await page.getByRole("button",{name:"Diligence and proposals",exact:true}).click();
  await expect(page.getByText("Reconcile the revised retention cohort", {exact: true})).toBeVisible();
});

test("connection setup explains the local boundary and provides an assistant prompt", async ({page}) => {
  await page.goto("/#/v3/helios/overview");
  await page.getByRole("button", {name: "Model settings", exact: true}).click();
  const dialog = page.getByRole("dialog", {name: "Connect your model"});
  await expect(dialog.getByRole("radio", {name: /Claude Desktop/})).toBeChecked();
  await dialog.getByText("Read the setup prompt").click();
  await expect(dialog.getByRole("textbox", {name: "Setup prompt"})).toHaveValue(/preserve|Preserve/);
  await dialog.getByText("Read the setup prompt").click();
  await page.screenshot({path: resolve("../dist/connection-guided.png"), fullPage: true});
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("financial workspace compares both transaction types and navigates by task", async ({page}) => {
  for (const deal of ["atlasgrid", "helios"]) {
    await page.goto(`/#/v3/${deal}/financials`);
    await expect(page.getByRole("table", {name: "Scenario differences"})).toBeVisible();
    await page.getByRole("navigation", {name: "Financial workspace sections"}).getByRole("button", {name: "Compare cases"}).click();
    await expect(page.getByRole("region", {name: "Canonical and comparison cases"})).toBeFocused();
    await page.screenshot({path: resolve(`../dist/financial-review-${deal}-1440.png`), fullPage: true});
    await page.getByRole("navigation", {name: "Financial workspace sections"}).getByRole("button", {name: "Sensitivities", exact: true}).click();
    await expect(page.locator(".sensitivity-workspace")).toBeFocused();
  }
});

test("deal register filters and evidence layout stays a user preference", async ({page}) => {
  await page.goto("/");
  await page.getByRole("searchbox", {name:"Find a deal"}).fill("not-a-company");
  await expect(page.getByRole("heading", {name:"No matching workspaces"})).toBeVisible();
  await page.getByRole("button", {name:"Clear deal filters"}).click();
  await page.getByRole("searchbox", {name:"Find a deal"}).fill("AtlasGrid");
  await expect(page.getByRole("button", {name:/Open Helios Compute/})).toHaveCount(0);
  await page.getByRole("button", {name:/Open AtlasGrid Systems/}).click();
  await page.getByRole("navigation",{name:"Deal navigation"}).getByRole("button",{name:"Evidence",exact:true}).click();
  await page.getByText("View options",{exact:true}).click();
  await page.getByRole("slider",{name:"Evidence panel width"}).fill("400");
  await page.getByRole("checkbox",{name:"Compact evidence rows"}).check();
  await page.getByText("View options",{exact:true}).click();
  await page.reload();
  await expect(page.locator(".analysis-workspace")).toHaveAttribute("data-density","compact");
  await expect(page.locator(".analysis-workspace")).toHaveAttribute("style",/400px/);
  await page.screenshot({path:resolve("../dist/desk-ten-evidence-1440.png"),fullPage:true});
  await page.goto("/");
  await page.screenshot({path:resolve("../dist/desk-ten-register-1440.png"),fullPage:true});
});
