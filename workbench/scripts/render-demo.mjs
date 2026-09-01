import {chromium} from "@playwright/test";
import {mkdir, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {spawn} from "node:child_process";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required`);
  return process.argv[index + 1];
};

const output = resolve(valueAfter("--out"));
const framesDirectory = resolve(valueAfter("--frames-dir"));
const storyboardPath = resolve(valueAfter("--storyboard"));
const storyboard = JSON.parse(await (await import("node:fs/promises")).readFile(storyboardPath, "utf8"));
const targetSeconds = Number(storyboard.target_duration_seconds);
if (!Number.isFinite(targetSeconds) || targetSeconds < 75 || targetSeconds > 90) {
  throw new Error("storyboard target duration must be between 75 and 90 seconds");
}

const WIDTH = 1920;
const HEIGHT = 1080;
const port = 4186;
const server = spawn(
  "pnpm",
  ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {cwd: resolve("."), stdio: "ignore"},
);

const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) return;
    } catch {}
    await pause(250);
  }
  throw new Error("Vite demo server did not become ready");
}

const receipt = {
  schema_version: "underwriting.demo-capture-receipt/v1",
  capture: "REAL_LOCAL_WORKBENCH_INTERACTIONS",
  resolution: `${WIDTH}x${HEIGHT}`,
  target_duration_seconds: targetSeconds,
  required_test_ids: storyboard.required_test_ids,
  observed_claims: [],
  frames: [],
};

let browser;
let context;
try {
  await waitForServer();
  await mkdir(dirname(output), {recursive: true});
  await mkdir(framesDirectory, {recursive: true});
  browser = await chromium.launch({headless: true});
  context = await browser.newContext({
    viewport: {width: WIDTH, height: HEIGHT},
    recordVideo: {dir: dirname(output), size: {width: WIDTH, height: HEIGHT}},
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: "networkidle"});
  await page.addStyleTag({content: `
    html { scroll-behavior: auto !important; }
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
    [data-demo-focus="true"] { outline: 4px solid #234fa4 !important; outline-offset: 4px !important; }
  `});

  const startedAt = Date.now();
  const until = async (seconds) => pause(Math.max(0, seconds * 1000 - (Date.now() - startedAt)));
  const sceneAt = (id) => {
    const scene = storyboard.scenes.find((candidate) => candidate.id === id);
    if (!scene) throw new Error(`storyboard scene missing: ${id}`);
    return scene;
  };
  const assertVisibleText = async (text, scene) => {
    const locator = page.getByText(text, {exact: false}).first();
    await locator.waitFor({state: "visible", timeout: 10_000});
    receipt.observed_claims.push({scene, text, url: page.url()});
    return locator;
  };
  const requireTestId = async (testId) => {
    const locator = page.getByTestId(testId);
    await locator.waitFor({state: "visible", timeout: 10_000});
    return locator;
  };
  const center = async (locator) => {
    await locator.evaluate((element) => element.scrollIntoView({block: "center", inline: "nearest"}));
    await pause(250);
  };
  const emphasize = async (locator) => {
    await locator.evaluate((element) => element.setAttribute("data-demo-focus", "true"));
    await pause(180);
  };
  const clearEmphasis = async () => {
    await page.locator("[data-demo-focus=true]").evaluateAll((elements) => {
      for (const element of elements) element.removeAttribute("data-demo-focus");
    });
  };
  const shot = async (index, name, scene) => {
    const filename = `${String(index).padStart(2, "0")}-${name}.png`;
    await page.screenshot({path: resolve(framesDirectory, filename), fullPage: false});
    receipt.frames.push({filename, scene, url: page.url(), elapsed_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(3))});
  };

  const landing = sceneAt("landing-boundary");
  await assertVisibleText("Turn a crowded data room into a decision", landing.id);
  await assertVisibleText("Synthetic cases", landing.id);
  await shot(0, "landing", landing.id);
  await until(landing.end);

  const atlasDecision = sceneAt("atlasgrid-decision");
  await page.getByRole("button", {name: "Review a sample deal →"}).click();
  await page.getByRole("heading", {name: "AtlasGrid Systems"}).waitFor({state: "visible"});
  await assertVisibleText("REPRICE", atlasDecision.id);
  await assertVisibleText("$210M recommended cap", atlasDecision.id);
  await assertVisibleText("5 issues block advancement", atlasDecision.id);
  await shot(1, "atlasgrid-decision", atlasDecision.id);
  await until(atlasDecision.end);

  const atlasReturns = sceneAt("atlasgrid-returns");
  await page.getByRole("button", {name: /02 Financials/}).click();
  await page.getByRole("heading", {name: "Price, leverage, and downside"}).waitFor({state: "visible"});
  await page.getByRole("button", {name: "Seller ask"}).click();
  await assertVisibleText("17.6%", atlasReturns.id);
  await shot(2, "atlasgrid-seller-ask", atlasReturns.id);
  await until(atlasReturns.start + 6);
  await page.getByRole("button", {name: "Selected"}).click();
  await assertVisibleText("23.3%", atlasReturns.id);
  await assertVisibleText("REPRICE", atlasReturns.id);
  await shot(3, "atlasgrid-selected", atlasReturns.id);
  await until(atlasReturns.end);

  const lineage = sceneAt("atlasgrid-lineage");
  const grossIrr = page.getByRole("button", {name: /Gross IRR 23\.3%/}).first();
  await center(grossIrr);
  await grossIrr.click();
  await page.getByRole("dialog").waitFor({state: "visible"});
  await assertVisibleText("Calculation and decision chain", lineage.id);
  await assertVisibleText("Readable source evidence", lineage.id);
  await shot(4, "atlasgrid-lineage", lineage.id);
  await until(lineage.end);
  await page.keyboard.press("Escape");

  const atlasMemo = sceneAt("atlasgrid-packet");
  await page.getByRole("button", {name: /04 Memo/}).click();
  await page.getByRole("heading", {name: "AtlasGrid Systems"}).last().waitFor({state: "visible"});
  const atlasPacket = page.getByRole("link", {name: "Open underwriting packet"});
  await center(atlasPacket);
  await assertVisibleText("Requires investment committee approval", atlasMemo.id);
  await shot(5, "atlasgrid-memo", atlasMemo.id);
  await emphasize(atlasPacket);
  await until(atlasMemo.start + 5);
  await shot(6, "atlasgrid-packet-export", atlasMemo.id);
  await clearEmphasis();
  await until(atlasMemo.end);

  const heliosDecision = sceneAt("helios-decision");
  await page.getByRole("button", {name: "VC / Growth Helios Compute Control"}).click();
  await page.getByRole("heading", {name: "Helios Compute Control"}).waitFor({state: "visible"});
  await page.getByRole("button", {name: /01 Overview/}).click();
  await assertVisibleText("HOLD", heliosDecision.id);
  await assertVisibleText("20.00%", heliosDecision.id);
  await assertVisibleText("illustrative 10.00% policy maximum", heliosDecision.id);
  await shot(7, "helios-hold", heliosDecision.id);
  await until(heliosDecision.end);

  const heliosControls = sceneAt("helios-controls");
  const controlsRegion = await requireTestId("helios-working-assumptions");
  await center(controlsRegion);
  await shot(8, "helios-assumptions-before", heliosControls.id);
  const growth = await requireTestId("helios-assumption-growth");
  await growth.fill("30");
  await shot(9, "helios-growth-edited", heliosControls.id);
  const lossMaximum = await requireTestId("helios-policy-loss-maximum");
  await lossMaximum.fill("8");
  await (await requireTestId("helios-recalculate-working-case")).click();
  const workingStatus = await requireTestId("helios-working-case-status");
  await assertVisibleText("HOLD", heliosControls.id);
  await center(workingStatus);
  const changeRecord = await requireTestId("helios-working-change-record");
  await center(changeRecord);
  await assertVisibleText("48.0%", heliosControls.id);
  await assertVisibleText("30.0%", heliosControls.id);
  await assertVisibleText("10.0%", heliosControls.id);
  await assertVisibleText("8.0%", heliosControls.id);
  await shot(10, "helios-recomputed-hold", heliosControls.id);
  await until(heliosControls.end);

  const close = sceneAt("decision-close");
  await page.getByRole("button", {name: /04 Memo/}).click();
  await page.getByRole("heading", {name: "Helios Compute Control"}).last().waitFor({state: "visible"});
  const heliosPacket = page.getByRole("link", {name: "Open underwriting packet"});
  await center(heliosPacket);
  await emphasize(heliosPacket);
  await assertVisibleText("HOLD", close.id);
  await assertVisibleText("SYNTHETIC", close.id);
  await shot(11, "helios-memo-close", close.id);
  await clearEmphasis();
  await until(close.end);

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
  server.kill("SIGTERM");
}
