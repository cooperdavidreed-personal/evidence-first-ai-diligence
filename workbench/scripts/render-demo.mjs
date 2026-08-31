import {chromium} from "@playwright/test";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {dirname, resolve} from "node:path";

const outIndex = process.argv.indexOf("--out");
if (outIndex < 0 || !process.argv[outIndex + 1]) throw new Error("--out is required");
const output = resolve(process.argv[outIndex + 1]);
await mkdir(dirname(output), {recursive: true});
const port = 4186;
const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {cwd: resolve("."), stdio: "ignore"});

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

let browser;
let context;
try {
  await waitForServer();
  browser = await chromium.launch({headless: true});
  context = await browser.newContext({
    viewport: {width: 1440, height: 900},
    recordVideo: {dir: dirname(output), size: {width: 1440, height: 900}},
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/#/v2/atlasgrid/snapshot`, {waitUntil: "networkidle"});
  await page.addStyleTag({content: `
    html { scroll-behavior: smooth !important; }
    #demo-cue { position: fixed; z-index: 9999; left: 28px; right: 28px; bottom: 24px; display: grid; grid-template-columns: 190px 1fr; gap: 20px; align-items: center; padding: 15px 18px; border: 1px solid #20262b; background: rgba(251,249,244,.96); box-shadow: 0 12px 36px rgba(32,38,43,.18); color: #20262b; pointer-events: none; }
    #demo-cue strong { color: #234fa4; font: 750 11px/1.3 SFMono-Regular, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; }
    #demo-cue span { font: 500 20px/1.3 Georgia, serif; }
  `});
  await page.evaluate(() => {
    const cue = document.createElement("aside");
    cue.id = "demo-cue";
    cue.innerHTML = "<strong></strong><span></span>";
    document.body.append(cue);
  });
  const cue = async (label, text) => {
    await page.evaluate(({label, text}) => {
      const element = document.querySelector("#demo-cue");
      element.querySelector("strong").textContent = label;
      element.querySelector("span").textContent = text;
    }, {label, text});
  };
  const bringIntoView = async (locator) => {
    await locator.evaluate((element) => element.scrollIntoView({block: "center", behavior: "smooth"}));
    await pause(900);
  };

  const demoStart = Date.now();
  const until = async (seconds) => pause(Math.max(0, seconds * 1000 - (Date.now() - demoStart)));

  await cue("01 · DECISION FIRST", "AtlasGrid is a REPRICE posture, not an approval: workflow HOLD, human authority pending, and the decision record unsigned.");
  await until(10);
  await bringIntoView(page.getByRole("heading", {name: "Why the posture is not yet a decision"}));
  await cue("02 · THE IC READ", "The first read states the decisive evidence, the loss mechanism, and the exact diligence gate before exposing model detail.");
  await until(23);
  await bringIntoView(page.getByRole("heading", {name: "The numbers can clear while the deal remains on hold"}));
  await cue("03 · HURDLES ≠ AUTHORITY", "Predeclared return tests clear in the selected structure. Unresolved evidence still prevents advancement.");
  await until(35);
  await page.getByRole("button", {name: "Inspect decision test for Gross IRR"}).click();
  await cue("04 · NUMBER TO SOURCE", "A displayed return opens with business meaning first; formulas, operands, retained evidence, and audit hashes remain progressively inspectable.");
  await until(40);
  await page.getByRole("dialog").getByText("Calculation and decision chain", {exact: true}).click();
  await until(44);
  await page.getByRole("dialog").getByText("Readable source evidence", {exact: true}).click();
  await cue("04 · NUMBER TO SOURCE", "The reviewer can inspect the committed synthetic source selection without reading raw JSON or trusting an unexplained AI answer.");
  await until(50);
  await page.keyboard.press("Escape");

  await page.getByRole("button", {name: /Thesis & Evidence/}).click();
  await page.getByRole("searchbox", {name: "Search room"}).fill("covenant");
  await cue("05 · NAVIGABLE ROOM", "Search finds source files, findings, analyses, owners, and open gates by business meaning. The evidence room is not a document dump.");
  await until(62);
  await page.getByRole("button", {name: /Econometric Lab/}).click();
  await page.getByRole("button", {name: "Association / abstention"}).click();
  await cue("06 · ECONOMETRIC CONSEQUENCE", "Associations and failed identification receive ZERO CREDIT. The interface states the affected assumption and investment consequence.");
  await until(69);
  await page.getByRole("button", {name: "Identified synthetic effect"}).click();
  await cue("06 · ECONOMETRIC CONSEQUENCE", "Synthetic randomized effects remain bounded to the tested population; adoption and valuation stay explicit judgment calls.");
  await until(78);

  await page.getByRole("button", {name: /Underwriting Room/}).click();
  await page.getByRole("button", {name: "Seller ask"}).click();
  await cue("07 · RECOMPUTED SCENARIOS", "At the $240M seller ask, returns miss the declared hurdle. Scenario controls select retained, receipt-bound model results.");
  await until(84);
  await page.getByRole("button", {name: "Selected"}).click();
  await cue("07 · RECOMPUTED SCENARIOS", "At the selected $210M structure, 23.3% gross IRR clears the quantitative hurdle while investment authority remains on hold.");
  await until(89);
  await page.getByRole("button", {name: "Downside"}).click();
  await cue("07 · RECOMPUTED SCENARIOS", "The downside falls to 6.2% gross IRR and 1.35x gross MOIC, exposing churn and multiple-compression risk rather than hiding it in a memo footnote.");
  await until(96);
  await page.getByRole("combobox", {name: "Driver"}).selectOption("exit_multiple");
  await page.getByRole("button", {name: "5.5x"}).click();
  await cue("08 · SENSITIVITY STATE", "The chosen scenario, driver, and cell live in the URL, so a reviewer can share and restore the exact analytical state.");
  await until(107);

  await page.getByRole("button", {name: /Helios Compute Control/}).click();
  await page.getByRole("heading", {name: "Helios Compute Control"}).waitFor({state: "visible"});
  await page.getByRole("button", {name: /IC Snapshot/}).click();
  await cue("09 · ONE SYSTEM, TWO ASSET CLASSES", "Helios reuses the same evidence, judgment, scenario, and receipt contracts for a milestone-financed AI infrastructure investment.");
  await until(119);
  await bringIntoView(page.getByRole("heading", {name: "Runway uses three different bases"}));
  await cue("10 · TERMS AND TIME", "$25M closes first; $15M is conditional. Current runway, funded runway, and the no-tranche exhaustion path are not conflated.");
  await until(132);
  await page.getByRole("button", {name: /Underwriting Room/}).click();
  await page.getByRole("button", {name: /Shortfall bridge/}).click();
  await cue("11 · EVENT-BASED VENTURE MODEL", "Withheld financing reruns capitalization, runway, preferences, dated cash flows, ownership, and returns—rather than changing a display label.");
  await until(137);
  await page.getByRole("combobox", {name: "Driver"}).selectOption("milestone_state");
  await page.getByRole("button", {name: "FAIL"}).click();
  await cue("11 · EVENT-BASED VENTURE MODEL", "A failed milestone is an investable consequence: the tranche is withheld and the cash and ownership path changes.");
  await until(143);
  await page.getByRole("button", {name: /Value Creation/}).click();
  await cue("12 · UNDERWRITING TO OWNERSHIP", "Each initiative names a baseline, target, owner, timing, implementation cost, stop rule, evidence class, and modeled value bridge.");
  await until(151);

  const video = page.video();
  await page.close();
  await context.close();
  await video.saveAs(output);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  server.kill("SIGTERM");
}
