import {test, expect, type Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";

const root = resolve(import.meta.dirname, "../public/sample-package");
function filesFor(growth = "0.25") {
  const files = new Map(["deal.json", "monthly_financials.csv", "customer_arr.csv"].map(name => [name, readFileSync(resolve(root, name))]));
  const deal = JSON.parse(files.get("deal.json")!.toString()); deal.return_assumptions.annual_revenue_growth = growth;
  files.set("deal.json", Buffer.from(JSON.stringify(deal)));
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  for (const row of manifest.files) {row.bytes = files.get(row.name)!.length; row.sha256 = createHash("sha256").update(files.get(row.name)!).digest("hex");}
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  files.set("manifest.json", manifestBytes);
  return {digest: createHash("sha256").update(manifestBytes).digest("hex"), files: [...files].map(([name, buffer]) => ({name, mimeType: name.endsWith("csv") ? "text/csv" : "application/json", buffer}))};
}
async function admit(page: Page, files: ReturnType<typeof filesFor>["files"]) {
  await page.getByRole("button", {name: "New deal", exact: true}).click();await page.locator(".advanced-package-intake > summary").click();
  await page.getByTestId("deal-package-input").setInputFiles(files);
  await page.getByRole("button", {name: "Validate and analyze", exact: true}).click();
  await page.getByRole("textbox", {name: "Analyst name", exact: true}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "Approval rationale", exact: true}).fill("Reviewed the source mappings and reconciled the package for screening.");
  await page.getByRole("button", {name: "Approve Version 1 and open workspace", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Northstar Metrics", level: 1})).toBeVisible();
}

test("saved incomplete intake resumes exact bytes after reload without approval", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: "New deal", exact: true}).click();await page.locator(".advanced-package-intake > summary").click();
  const files = filesFor().files.filter(file => ["manifest.json", "deal.json"].includes(file.name));
  await page.getByTestId("deal-package-input").setInputFiles(files);
  await page.getByRole("button", {name: "Save intake draft", exact: true}).click();
  await expect(page.getByText(/Intake draft saved in this browser/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", {name: "New deal", exact: true}).click();await page.locator(".advanced-package-intake > summary").click();
  await page.getByRole("button", {name: "Resume saved draft", exact: true}).click();
  await expect(page.getByRole("button", {name: "Remove deal.json", exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: "Remove manifest.json", exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: "Validate and analyze", exact: true})).toBeDisabled();
  await expect(page.getByRole("button", {name: "Approve Version 1 and open workspace", exact: true})).toHaveCount(0);
  const retained = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {const req = indexedDB.open("underwriting-desk-intake", 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);});
    const result = await new Promise<{files: {name: string; bytes: ArrayBuffer}[]}>((resolve, reject) => {const req = db.transaction("drafts").objectStore("drafts").get("current"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);});
    db.close(); return result.files.map(file => ({name: file.name, bytes: [...new Uint8Array(file.bytes)]}));
  });
  expect(retained).toEqual(files.map(file => ({name: file.name, bytes: [...file.buffer]})));
  await page.getByRole("button", {name: "Discard saved draft", exact: true}).click();
  await expect(page.getByRole("button", {name: "Resume saved draft", exact: true})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Remove deal.json", exact: true})).toBeVisible();
});

test("two same-company source packages reopen independently after reload", async ({page}) => {
  await page.goto("/");
  const first = filesFor("0.25"), second = filesFor("0.30");
  await admit(page, first.files);
  await page.getByRole("button", {name: "Underwriting Desk deals", exact: true}).click();
  await admit(page, second.files);
  await page.reload();
  await expect(page.getByRole("heading", {name: "Northstar Metrics", level: 1})).toBeVisible();
  await page.getByRole("button", {name: "Underwriting Desk deals", exact: true}).click();
  await page.getByText("Saved deliveries and source history", {exact: true}).click();
  const library = page.getByRole("region", {name: "Saved deal library"});
  await expect(library.getByRole("button", {name: "Open saved Northstar Metrics", exact: true})).toHaveCount(2);
  for (const source of [first, second, first]) {
    const row = library.getByRole("row").filter({hasText: source.digest});
    await row.getByRole("button", {name: "Open saved Northstar Metrics", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Northstar Metrics", level: 1})).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("underwriting-desk.admitted-deal.v1")!).baselineApproval.packageDigest)).toBe(source.digest);
    await page.getByRole("button", {name: "Underwriting Desk deals", exact: true}).click();
    await page.getByText("Saved deliveries and source history", {exact: true}).click();
    await expect(library.getByRole("button", {name: "Open saved Northstar Metrics", exact: true})).toHaveCount(2);
  }
});
