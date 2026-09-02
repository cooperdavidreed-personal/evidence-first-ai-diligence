import {chromium} from "@playwright/test";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required`);
  return process.argv[index + 1];
};

const output = resolve(valueAfter("--out"));
const framesDirectory = resolve(valueAfter("--frames-dir"));
const storyboardPath = resolve(valueAfter("--storyboard"));
const baseUrl = new URL(valueAfter("--base-url"));
if (baseUrl.protocol !== "https:" || baseUrl.hostname !== "underwriting-desk-delta.vercel.app") {
  throw new Error("demo base URL must be the canonical HTTPS deployment");
}
const storyboard = JSON.parse(await readFile(storyboardPath, "utf8"));
const targetSeconds = Number(storyboard.target_duration_seconds);
if (!Number.isFinite(targetSeconds) || targetSeconds < 75 || targetSeconds > 90) throw new Error("storyboard target duration must be between 75 and 90 seconds");

const WIDTH = 1920;
const HEIGHT = 1080;
const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
const packageFiles = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"].map((name) => resolve("public/sample-package", name));

const receipt = {
  schema_version: "underwriting.demo-capture-receipt/v2",
  capture: "REAL_PUBLIC_WORKBENCH_INTERACTIONS",
  base_url: baseUrl.href,
  resolution: `${WIDTH}x${HEIGHT}`,
  target_duration_seconds: targetSeconds,
  required_test_ids: storyboard.required_test_ids,
  observed_claims: [],
  frames: [],
};

let browser;
let context;
try {
  await mkdir(dirname(output), {recursive: true});
  await mkdir(framesDirectory, {recursive: true});
  browser = await chromium.launch({headless: true});
  context = await browser.newContext({
    viewport: {width: WIDTH, height: HEIGHT},
    recordVideo: {dir: dirname(output), size: {width: WIDTH, height: HEIGHT}},
    reducedMotion: "reduce",
    // Capture-only instrumentation adds a visible focus ring and disables
    // motion. Bypass CSP inside this isolated browser context; the deployed
    // application's production headers remain unchanged and are verified
    // separately.
    bypassCSP: true,
  });
  const page = await context.newPage();
  await page.goto(baseUrl.href, {waitUntil: "networkidle"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "networkidle"});
  await page.addStyleTag({content: `
    html { scroll-behavior: auto !important; }
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
    [data-demo-focus="true"] { outline: 4px solid #24527a !important; outline-offset: 4px !important; }
  `});

  const startedAt = Date.now();
  const until = async (seconds) => pause(Math.max(0, seconds * 1000 - (Date.now() - startedAt)));
  const sceneAt = (id) => {
    const scene = storyboard.scenes.find((candidate) => candidate.id === id);
    if (!scene) throw new Error(`storyboard scene missing: ${id}`);
    return scene;
  };
  const visibleText = async (text, scene) => {
    const locator = page.getByText(text, {exact: false}).filter({visible: true}).first();
    await locator.waitFor({state: "visible", timeout: 30_000});
    receipt.observed_claims.push({scene, text, url: page.url()});
    return locator;
  };
  const center = async (locator) => {
    await locator.evaluate((element) => element.scrollIntoView({block: "center", inline: "nearest"}));
    await pause(180);
  };
  const emphasize = async (locator) => {
    await locator.evaluate((element) => element.setAttribute("data-demo-focus", "true"));
  };
  const clearEmphasis = async () => page.locator("[data-demo-focus=true]").evaluateAll((elements) => elements.forEach((element) => element.removeAttribute("data-demo-focus")));
  const shot = async (index, name, scene) => {
    const filename = `${String(index).padStart(2, "0")}-${name}.png`;
    await page.screenshot({path: resolve(framesDirectory, filename), fullPage: false});
    receipt.frames.push({filename, scene, url: page.url(), elapsed_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(3))});
  };
  const dealNavigation = () => page.locator('nav[aria-label="Deal navigation"]:visible');

  const intake = sceneAt("deal-intake");
  await page.getByRole("heading", {name: "Deals"}).waitFor();
  await shot(0, "deals", intake.id);
  await until(2);
  await page.getByRole("button", {name: "New deal"}).click();
  await page.getByTestId("deal-package-input").setInputFiles(packageFiles);
  await shot(1, "intake", intake.id);
  await until(7);
  await page.getByRole("button", {name: "Validate and analyze"}).click();
  await visibleText("SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED", intake.id);
  await shot(2, "screening", intake.id);
  await until(intake.end);

  const screening = sceneAt("screening");
  await page.getByRole("button", {name: "Open decision review"}).click();
  await page.getByRole("heading", {name: "Northstar Metrics", level: 1}).waitFor();
  const retention = await visibleText("83.6%", screening.id);
  await center(retention);
  await emphasize(retention);
  await until(screening.end);
  await clearEmphasis();

  const evidence = sceneAt("evidence");
  await dealNavigation().getByRole("button", {name: "Documents"}).click();
  // The admitted Northstar room intentionally opens on its customer ARR
  // evidence by default. Assert the exact retained-row preview directly; the
  // source-list button's accessible name is the analytical preview title, not
  // the raw filename.
  const sourceRows = page.locator('.source-row-table[aria-label="Exact admitted source rows"]');
  await sourceRows.waitFor({state: "visible", timeout: 30_000});
  await center(sourceRows);
  await shot(3, "evidence", evidence.id);
  await until(evidence.end);

  const scenario = sceneAt("scenario");
  await dealNavigation().getByRole("button", {name: "Financials"}).click();
  const growth = page.getByRole("spinbutton", {name: "Annual revenue growth (%)"});
  await growth.fill("35");
  await visibleText("Unapproved what-if", scenario.id);
  await shot(4, "scenario", scenario.id);
  await until(scenario.end);

  const judgment = sceneAt("judgment");
  await dealNavigation().getByRole("button", {name: "Overview"}).click();
  await page.getByRole("textbox", {name: "Author"}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "New observation"}).fill("Renewal references require signed-customer validation before IC advancement.");
  await page.getByRole("button", {name: "Add observation"}).click();
  const observation = await visibleText("Renewal references require signed-customer validation", judgment.id);
  await center(observation);
  await shot(5, "observation", judgment.id);
  await until(judgment.end);

  const model = sceneAt("model-proposal");
  await dealNavigation().getByRole("button", {name: "Diligence"}).click();
  await page.getByRole("button", {name: "Model review"}).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", {name: "Challenge evidence"}).click();
  await visibleText("Confirm selected evidence transfer", model.id);
  await page.getByRole("button", {name: "Send selected evidence"}).click();
  const proposal = page.locator(".proposal-list article").first();
  await proposal.waitFor({state: "visible", timeout: 60_000});
  await visibleText("proposed", model.id);
  await center(proposal);
  await shot(6, "proposed", model.id);
  await until(model.end);

  const disposition = sceneAt("human-disposition");
  await page.getByRole("textbox", {name: "Human reviewer"}).fill("Avery Chen");
  await proposal.getByRole("button", {name: "Accept proposal"}).click();
  await visibleText("accepted by Avery Chen", disposition.id);
  await shot(7, "accepted", disposition.id);
  await until(disposition.end);

  const memo = sceneAt("memo");
  await dealNavigation().getByRole("button", {name: "IC Memo"}).click();
  await page.getByRole("textbox", {name: "Editor"}).fill("Avery Chen");
  const addButton = page.getByRole("button", {name: "Add with provenance"});
  if (await addButton.count()) await addButton.first().click();
  const memoFooter = page.locator(".memo-editor footer");
  await memoFooter.waitFor({state: "attached", timeout: 30_000});
  const memoFooterText = (await memoFooter.textContent())?.trim() ?? "";
  if (!memoFooterText.includes("IC decision pending")) throw new Error("IC memo pending-decision boundary is missing");
  receipt.observed_claims.push({scene: memo.id, text: "IC decision pending", url: page.url()});
  await center(memoFooter);
  await shot(8, "memo", memo.id);
  await until(memo.end);

  receipt.actual_capture_seconds = Number(((Date.now() - startedAt) / 1000).toFixed(3));
  await writeFile(resolve(dirname(framesDirectory), "capture-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  const video = page.video();
  await page.close();
  await context.close();
  context = undefined;
  await video.saveAs(output);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
