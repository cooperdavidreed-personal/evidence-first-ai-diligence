import AxeBuilder from "@axe-core/playwright";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {expect, test, type Page, type TestInfo} from "@playwright/test";
import {captureVisualEvidence, writeAccessibilityEvidence} from "./visual-evidence";

const packagePaths = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"].map((name) => resolve(import.meta.dirname, `../public/sample-package/${name}`));
const evidencePackagePaths = ["manifest.json", "deal.json", "operating_model.xlsx", "customer_arr.csv", "management_update.pdf"].map((name) => resolve(import.meta.dirname, `../public/sample-package-v2/${name}`));
const evidenceRevisionPaths = ["manifest.json", "deal.json", "operating_model.xlsx", "customer_arr.csv", "management_update.pdf"].map((name) => resolve(import.meta.dirname, `../public/sample-package-v2-revision/${name}`));
const atlasgridRevisionPath = resolve(import.meta.dirname, "../public/change-packages/atlasgrid-v2-retention-revision.json");
const views = ["Overview", "Financials", "Diligence", "Documents", "IC Memo"] as const;

async function settleAtTop(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo(0, 0);
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    window.scrollTo(0, 0);
  });
}

async function accessibilitySnapshot(page: Page) {
  const scan = await new AxeBuilder({page}).analyze();
  const critical = scan.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
  expect(critical).toEqual([]);
  const dimensions = await page.evaluate(() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  const minimumVisibleTextPx = await page.evaluate(() => {
    const sizes: number[] = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent?.trim() || !parent) continue;
      const style = getComputedStyle(parent); const rect = parent.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0) continue;
      sizes.push(Number.parseFloat(style.fontSize));
    }
    return Math.min(...sizes);
  });
  expect(minimumVisibleTextPx).toBeGreaterThanOrEqual(dimensions.client <= 390 ? 11 : 12);
  return {critical_or_serious_count: critical.length, violations: scan.violations.map((item) => ({id: item.id, impact: item.impact, nodes: item.nodes.length})), root_client_width: dimensions.client, root_scroll_width: dimensions.scroll, minimum_visible_text_px: minimumVisibleTextPx};
}

async function visibleDefaultText(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *")].filter((element) => {
    const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
    return element.children.length === 0 && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }).map((element) => element.innerText).join("\n"));
}

async function assertPlainDefaultSurface(page: Page) {
  const text = await visibleDefaultText(page);
  expect(text).not.toMatch(/\b[0-9a-f]{64}\b/i);
  expect(text).not.toMatch(/\b(?:underwriting|atlasgrid|helios)\.[a-z0-9_-]+\/v\d\b/i);
  expect(text).not.toMatch(/(?:^|\s)data\/[a-z0-9_./-]+/i);
  expect(text).not.toMatch(/\b(?:AG|HX)-[A-Z0-9-]+\b/);
  expect(text).not.toMatch(/\b(?:log points|ITT|SMD|MC SE)\b/i);
}

async function visibleDealNavigation(page: Page) {
  return page.locator('nav[aria-label="Deal navigation"]:visible');
}

async function chooseDiligenceSection(page: Page, id: "issues" | "assumptions" | "policy" | "test" | "model", label: string) {
  const mobile = page.locator(".mobile-workspace-selector select");
  if (await mobile.isVisible()) await mobile.selectOption(id);
  else await page.getByRole("button", {name: label}).click();
}

test("Deals is a calm product root with no critical accessibility or overflow finding", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "Deals"})).toBeVisible();
  await expect(page.getByRole("button", {name: "New deal"})).toBeVisible();
  await expect(page.getByText("Evidence → economics → action")).toHaveCount(0);
  await settleAtTop(page);
  const scan = await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-deals.png`);
  writeAccessibilityEvidence(`${testInfo.project.name}-deals.json`, {boundary: "Automated route evidence only; not comprehensive WCAG or observed usability proof.", project: testInfo.project.name, scans: [{view: "Deals", ...scan}], viewport: page.viewportSize()});
});

test("mobile deal navigation resets a previously scrolled Deals page", async ({page}, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Reproduces the reported mobile route transition");
  await page.goto("/", {waitUntil: "networkidle"});
  await page.evaluate(() => window.scrollTo(0, 180));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", {name: /Helios Compute Control/}).click();
  await expect(page.getByRole("heading", {name: "Helios Compute Control", level: 1})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("invalid saved workspace remains preserved behind a visible recovery warning", async ({page}) => {
  const key = "underwriting-desk.workspace.v3.atlasgrid";
  const rejected = "{not-valid-json";
  await page.addInitScript(({storageKey, value}) => window.localStorage.setItem(storageKey, value), {storageKey: key, value: rejected});
  await page.goto("/#/v3/atlasgrid/overview", {waitUntil: "networkidle"});
  await expect(page.getByRole("status").filter({hasText: "Saved workspace failed validation and was not loaded"})).toBeVisible();
  expect(await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).toBe(rejected);
});

test("model connection center separates governed MCP from in-desk inference", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "Model options"}).click();
  await expect(page.getByRole("dialog", {name: "Governed review, without handing over the case"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "One deal record. Replaceable models."})).toBeVisible();
  await expect(page.getByText("Validated source package and lineage")).toBeVisible();
  await expect(page.getByText("Countertheses and missing diligence")).toBeVisible();
  let scan = await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-model-connection-approach.png`, true);
  await page.getByRole("button", {name: "Continue"}).click();
  await expect(page.getByRole("heading", {name: "Keep provider credentials out of the browser"})).toBeVisible();
  await page.getByRole("button", {name: "Continue"}).click();
  await expect(page.getByRole("heading", {name: "Attempt a bounded challenge from Diligence"})).toBeVisible();
  await expect(page.getByText(/proposal is not claimed until the server returns it successfully/i)).toBeVisible();
  await expect(page.getByText(/No provider keys are collected/)).toBeVisible();
  scan = await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-model-connection-governed-review.png`, true);
  writeAccessibilityEvidence(`${testInfo.project.name}-model-connection.json`, {boundary: "Connection-wizard route evidence only; hosted inference is verified separately, and no remote MCP, credential, or comprehensive WCAG claim is made here.", project: testInfo.project.name, scans: [{view: "Governed review boundary", ...scan}], viewport: page.viewportSize()});
});

test("bounded hosted model proposal requires evidence confirmation and named human acceptance", async ({page}, testInfo: TestInfo) => {
  await page.route("**/api/challenge", async (route) => {
    const request = route.request().postDataJSON() as {deal_id: string; request_digest_sha256: string; evidence: Array<{id: string}>};
    await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({
      deal_id: request.deal_id,
      request_digest_sha256: request.request_digest_sha256,
      model_family: "acceptance-test-adapter",
      limitations: "Synthetic acceptance fixture; no external inference was run.",
      challenges: [{claim: "Expansion may depend on a narrow customer segment", evidence_refs: [request.evidence[0].id], severity: "HIGH", management_question: "Which expansion cohorts replicate outside the selected segment?"}],
      gaps: [], memo_drafts: [],
    })});
  });
  await page.goto("/#/v3/helios/diligence", {waitUntil: "networkidle"});
  await chooseDiligenceSection(page, "model", "Model review");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", {name: "Challenge evidence"}).click();
  await expect(page.getByText("Confirm selected evidence transfer")).toBeVisible();
  await page.getByRole("button", {name: "Send selected evidence"}).click();
  await expect(page.getByRole("heading", {name: "Expansion may depend on a narrow customer segment"})).toBeVisible();
  await expect(page.getByText("proposed", {exact: true})).toBeVisible();
  await page.getByRole("textbox", {name: "Human reviewer"}).fill("Avery Chen");
  await page.getByRole("button", {name: "Accept proposal"}).click();
  await expect(page.getByText(/accepted by Avery Chen/)).toBeVisible();
  await expect(page.getByText(/Response [0-9a-f]{12}/)).toBeVisible();
  await expect(page.getByText("HOLD", {exact: true}).first()).toBeVisible();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "IC Memo"}).click();
  await page.getByRole("textbox", {name: "Editor"}).fill("Avery Chen");
  await page.getByRole("button", {name: "Add with provenance"}).click();
  await expect(page.getByRole("heading", {name: /Accepted counterthesis/})).toBeVisible();
  await settleAtTop(page);
  const scan = await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-hosted-model-human-acceptance.png`, true);
  writeAccessibilityEvidence(`${testInfo.project.name}-hosted-model-human-acceptance.json`, {boundary: "Mocked same-origin transport verifies the browser approval contract only; it is not proof of live provider availability.", project: testInfo.project.name, scans: [{view: "Human-accepted model proposal", ...scan}], viewport: page.viewportSize()});
});

test("scenario, observation, issue, assumption, and memo changes persist as human work", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/financials", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "Seller ask"}).click();
  await expect(page.getByText("Unapproved what-if").first()).toBeVisible();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Overview"}).click();
  await page.getByRole("textbox", {name: "Author"}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "New observation"}).fill("Management references demand validation against signed renewals.");
  await page.getByRole("button", {name: "Add observation"}).click();
  await expect(page.getByText("Management references demand validation against signed renewals.")).toBeVisible();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Diligence"}).click();
  await page.getByRole("button", {name: "New issue"}).click();
  await page.getByRole("textbox", {name: "Issue", exact: true}).fill("Reconcile renewal references");
  await page.getByLabel("Owner").first().fill("Commercial diligence");
  await page.getByLabel("Decision impact").fill("Could remove pricing credit and reduce debt capacity.");
  await page.getByRole("button", {name: "Create issue"}).click();
  await expect(page.getByText("Reconcile renewal references")).toBeVisible();
  const createdIssue = page.locator("details.worklist-row").filter({hasText: "Reconcile renewal references"});
  await createdIssue.locator("summary").click();
  const createdOwner = createdIssue.getByRole("textbox", {name: "Owner"});
  await createdOwner.clear();
  await createdOwner.press("Tab");
  await expect(createdIssue.getByText("Owner is required; the prior assignment was retained.")).toBeVisible();
  await expect(createdOwner).toHaveValue("Commercial diligence");
  await expect(page.getByText("Reconcile renewal references")).toBeVisible();
  await chooseDiligenceSection(page, "assumptions", "Assumptions");
  await page.getByRole("textbox", {name: "Reviewer"}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "Review rationale"}).fill("Entry value remains subject to commercial diligence findings.");
  await page.getByRole("button", {name: "Reject"}).first().click();
  await expect(page.getByText("rejected", {exact: true}).first()).toBeVisible();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "IC Memo"}).click();
  await expect(page.getByRole("region", {name: "Scenario represented in this memo"})).toContainText("Unapproved what-if");
  await expect(page.getByRole("region", {name: "Scenario represented in this memo"})).toContainText("Seller ask");
  const memoEditor = page.getByRole("textbox", {name: "Editor"});
  await memoEditor.fill("Financial model");
  await expect(page.getByText("Enter a person rather than a system label.")).toBeVisible();
  await expect(page.getByRole("textbox", {name: "Recommendation and rationale memo section"})).toBeDisabled();
  await memoEditor.fill("Avery Chen");
  const recommendation = page.getByRole("textbox", {name: "Recommendation and rationale memo section"});
  await recommendation.fill("REPRICE pending signed-renewal validation and a revised fixed-value cap.");
  await expect(page.getByText("Analyst revision · calculated baseline preserved")).toBeVisible();
  await page.reload({waitUntil: "networkidle"});
  await expect(page.getByRole("textbox", {name: "Recommendation and rationale memo section"})).toHaveValue("REPRICE pending signed-renewal validation and a revised fixed-value cap.");
  await expect(page.getByText("Original source text")).toBeVisible();
});

test("memo export fails closed and downloads one reconciled scenario snapshot", async ({page}) => {
  const scenarios = [
    {button: "Seller ask", label: "Seller ask", expected: ["17.6%", "2.25x"], excluded: ["23.3%", "2.80x"]},
    {button: "Canonical selected terms", label: "Selected terms", expected: ["23.3%", "2.80x"], excluded: ["17.6%", "2.25x"]},
    {button: "Downside", label: "Downside", expected: ["6.2%", "1.35x"], excluded: ["23.3%", "2.80x"]},
  ];
  await page.goto("/#/v3/atlasgrid/financials", {waitUntil: "networkidle"});
  for (const scenario of scenarios) {
    await page.getByRole("button", {name: scenario.button, exact: true}).click();
    await (await visibleDealNavigation(page)).getByRole("button", {name: "IC Memo"}).click();
    const summary = page.getByRole("region", {name: "Scenario represented in this memo"});
    await expect(summary).toContainText(scenario.label);
    await expect(page.getByRole("button", {name: "Download IC memo"})).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("Export is blocked");
    await page.getByRole("textbox", {name: "Editor"}).fill("Avery Chen");
    await page.getByRole("button", {name: `Reconcile core sections to ${scenario.label}`}).click();
    await expect(page.getByRole("button", {name: "Download IC memo"})).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", {name: "Download IC memo"}).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const html = readFileSync(path!, "utf8");
    for (const value of scenario.expected) expect(html).toContain(value);
    for (const value of scenario.excluded) expect(html).not.toContain(value);
    expect(html).toContain(`${scenario.label} ·`);
    expect(html).toContain("IC decision pending");
    await (await visibleDealNavigation(page)).getByRole("button", {name: "Financials"}).click();
  }
});

test("every retained-case and Northstar public source opens from the running build", async ({page}) => {
  const checked = new Set<string>();
  let displayedSources = 0;
  for (const caseId of ["atlasgrid", "helios"] as const) {
    await page.goto(`/#/v3/${caseId}/documents`, {waitUntil: "networkidle"});
    const sources = page.locator(".source-list button");
    const sourceCount = await sources.count();
    displayedSources += sourceCount;
    for (let index = 0; index < sourceCount; index += 1) {
      await sources.nth(index).click();
      const link = page.locator('.document-preview a[href^="source-pack/"]');
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
      const absolute = new URL(href!, page.url()).href;
      if (checked.has(absolute)) continue;
      const response = await page.request.get(absolute);
      expect(response.status(), absolute).toBe(200);
      expect((await response.body()).byteLength, absolute).toBeGreaterThan(0);
      checked.add(absolute);
    }
  }
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "New deal"}).click();
  for (const link of await page.locator('.sample-downloads a[download]').all()) {
    const href = await link.getAttribute("href");
    const response = await page.request.get(new URL(href!, page.url()).href);
    expect(response.status()).toBe(200);
    expect((await response.body()).byteLength).toBeGreaterThan(0);
  }
  expect(checked.size).toBe(displayedSources);
  expect(displayedSources).toBeGreaterThanOrEqual(10);
});

test("portable state export downloads and imports its validated scenario ownership", async ({page}) => {
  await page.goto("/#/v3/helios/memo", {waitUntil: "networkidle"});
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", {name: "Export state"}).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(readFileSync(path!, "utf8"));
  expect(exported.caseId).toBe("helios");
  expect(exported.memoSections.every((section: {scenarioSnapshotId?: string}) => Boolean(section.scenarioSnapshotId))).toBe(true);
  await page.locator('.workspace-transfer input[type="file"]').setInputFiles({name: "helios-underwriting-workspace.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported))});
  await expect(page.getByText(/Workspace imported and validated/)).toBeVisible();
  await expect(page.getByText("All memo sections are bound to Milestone funded.")).toBeVisible();
});

test("Version 2 evidence propagates through returns, stale state, diligence, and human disposition", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/overview", {waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "What changed?"})).toBeVisible();
  const tamperedRevision = JSON.parse(readFileSync(atlasgridRevisionPath, "utf8"));
  tamperedRevision.base_customer_month_sha256 = "0".repeat(64);
  await page.locator('.change-control input[type="file"]').setInputFiles({name: "atlasgrid-v2-tampered.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(tamperedRevision))});
  await expect(page.getByRole("status")).toContainText("does not match the approved AtlasGrid V1 retention evidence");
  await page.locator('.change-control input[type="file"]').setInputFiles(atlasgridRevisionPath);
  await expect(page.getByRole("status")).toContainText("Version 2 validated");
  const change = page.locator(".change-control");
  await expect(change).toContainText("99.9%");
  await expect(change).toContainText("98.0%");
  await expect(change).toContainText("23.3%");
  await expect(change).toContainText("18.4%");
  await expect(change).toContainText("2.80x");
  await expect(change).toContainText("2.32x");
  await expect(change).toContainText("$16.4M");
  await expect(change).toContainText("$30.5M");
  await expect(change).toContainText("Memo sections stale");
  await expect(change).toContainText("Reopen diligence");
  await expect(change).toContainText("Pending");
  await page.getByPlaceholder("Named human reviewer").fill("Avery Chen");
  await page.getByPlaceholder(/Why should the revised evidence/).fill("Accept the corrected cancellation schedule and reopen commercial diligence.");
  await page.getByRole("button", {name: "Accept change"}).click();
  await expect(change).toContainText("accepted");
  await expect(change).toContainText("Avery Chen");
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Diligence"}).click();
  await expect(page.getByText("Reconcile the V2 cancellation schedule")).toBeVisible();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "IC Memo"}).click();
  await expect(page.getByRole("button", {name: "Download IC memo"})).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("prepared against another scenario");
  await expect(page.getByRole("region", {name: "Scenario represented in this memo"})).toContainText("Accepted revision");
  await expect(page.getByRole("region", {name: "Scenario represented in this memo"})).toContainText("18.4%");
  await page.getByRole("textbox", {name: "Editor"}).fill("Avery Chen");
  await page.getByRole("button", {name: "Reconcile core sections to AtlasGrid V2 retention revision"}).click();
  await expect(page.getByRole("button", {name: "Download IC memo"})).toBeEnabled();
  const [memoDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", {name: "Download IC memo"}).click(),
  ]);
  const memoPath = await memoDownload.path();
  expect(memoPath).toBeTruthy();
  const revisedMemo = readFileSync(memoPath!, "utf8");
  expect(revisedMemo).toContain("18.4%");
  expect(revisedMemo).toContain("2.32x");
  expect(revisedMemo).toContain("REOPEN DILIGENCE");
  expect(revisedMemo).not.toContain("23.3%");
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Financials"}).click();
  const revisedScreen = page.getByRole("region", {name: "Buyout decision screen"});
  await expect(revisedScreen).toContainText("REOPEN DILIGENCE");
  await expect(revisedScreen).toContainText("18.4%");
  await expect(revisedScreen).not.toContainText("23.3%");
  await page.reload({waitUntil: "networkidle"});
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Overview"}).click();
  await expect(page.locator(".change-control")).toContainText("1 disposition event");
  await expect(page.locator(".change-control")).toContainText("accepted");
});

test("decision rail keeps canonical conditions separate from worklist resolutions", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/diligence", {waitUntil: "networkidle"});
  const issue = page.locator("details.worklist-row").filter({hasText: "Validate cancellation rights"});
  await issue.locator("summary").click();
  await issue.getByRole("textbox", {name: "Resolver"}).fill("Avery Chen");
  await issue.getByRole("textbox", {name: "Resolution record"}).fill("Signed cancellation schedule reconciled to the modeled live-ARR population.");
  await issue.getByRole("button", {name: "Resolve issue"}).click();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Overview"}).click();
  const rail = page.getByRole("complementary", {name: "Decision status"});
  await expect(rail).toContainText("Canonical conditions5");
  await expect(rail).toContainText("Worklist open4");
  await expect(rail).toContainText("Validate cancellation rights");
});

test("Helios policy sensitivity is an unapproved what-if and follows the memo", async ({page}) => {
  await page.goto("/#/v3/helios/financials", {waitUntil: "networkidle"});
  const policy = page.getByLabel("Maximum acceptable loss probability");
  const canonical = await policy.inputValue();
  const alternate = await policy.locator("option").evaluateAll((options, selected) => options.map((option) => (option as HTMLOptionElement).value).find((value) => value !== selected), canonical);
  expect(alternate).toBeTruthy();
  await policy.selectOption(String(alternate));
  await expect(policy).toHaveValue(String(alternate));
  await expect(page.getByRole("heading", {name: "What must be true to avoid a capital-loss outcome?"})).toBeVisible();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "IC Memo"}).click();
  const summary = page.getByRole("region", {name: "Scenario represented in this memo"});
  await expect(summary).toContainText("Unapproved what-if");
  await expect(summary).toContainText("selected 20.0% loss-case probability");
  await expect(summary).toContainText("Every severe-loss path loses");
  await expect(summary).toContainText("replay checks the scenario generator rather than estimating the probability");
  await expect(summary).toContainText("8.0% Desk maximum");
});

test("print export uses complete memo text instead of a clipped textarea", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/memo", {waitUntil: "networkidle"});
  await page.getByRole("textbox", {name: "Editor"}).fill("Avery Chen");
  const sentinel = `PRINT-END-${"complete-memo-".repeat(240)}`;
  await page.getByRole("textbox", {name: "Recommendation and rationale memo section"}).fill(sentinel);
  await page.emulateMedia({media: "print"});
  await expect(page.getByRole("textbox", {name: "Recommendation and rationale memo section"})).toBeHidden();
  await expect(page.locator(".memo-print-body").filter({hasText: "PRINT-END-"})).toBeVisible();
  await expect(page.locator(".memo-print-body").filter({hasText: "PRINT-END-"})).toContainText(sentinel.slice(-80));
});

test("portable state rejects a fabricated accepted-proposal citation", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/memo", {waitUntil: "networkidle"});
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem("underwriting-desk.workspace.v3.atlasgrid")!));
  const requestEvidence = [{id: "fabricated-metric", title: "Fabricated", displayValue: "1.0x", summary: "Fabricated evidence."}];
  const requestDigestSha256 = await page.evaluate(async (evidence) => { const payload = JSON.stringify({job: "challenge_selected_evidence", deal_id: "atlasgrid", evidence, output_contract: "underwriting-evidence-challenge/v1"}); const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }, requestEvidence);
  raw.proposals.push({proposalId: "proposal-tampered", kind: "MEMO_DRAFT", state: "ACCEPTED", title: "Draft conclusion", body: "Fabricated evidence claim.", evidenceRefs: ["fabricated-metric"], dealId: "atlasgrid", origin: "PORTABLE_IMPORT_UNVERIFIED", requestEvidence, requestDigestSha256, humanActor: "Avery Chen", reviewedAt: "2026-09-01T12:00:00.000Z"});
  raw.memoSections.push({sectionId: "proposal-tampered", title: "Draft conclusion", body: "Fabricated evidence claim.", provenance: "HUMAN_ACCEPTED_MODEL_PROPOSAL", sourceProposalId: "proposal-tampered", updatedBy: "Avery Chen", updatedAt: "2026-09-01T12:00:00.000Z"});
  await page.locator('.workspace-transfer input[type="file"]').setInputFiles({name: "tampered-workspace.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(raw))});
  await expect(page.getByRole("status").filter({hasText: "canonical registry"})).toBeVisible();
  await expect(page.getByText("Fabricated evidence claim.")).toHaveCount(0);
});

test("lineage closes back to its exact opener and defers calculation detail", async ({page}) => {
  await page.goto("/#/v3/atlasgrid/financials", {waitUntil: "networkidle"});
  const opener = page.getByRole("button", {name: /Annualized gross return/}).first();
  await opener.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".formula-block")).toHaveCount(0);
  await drawer.getByText(/Calculation and methodology/i).click();
  await expect(drawer.locator(".formula-block")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("mobile controls expose every diligence tab, heatmap edge, and source-cell label", async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile discoverability assertion");
  await page.goto("/#/v3/helios/diligence", {waitUntil: "networkidle"});
  const mobileNavGeometry = await page.locator('.mobile-nav:visible').evaluate((nav) => {
    const boundary = nav.getBoundingClientRect();
    return [...nav.querySelectorAll("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return {label: button.textContent?.trim(), left: rect.left, right: rect.right, boundaryLeft: boundary.left, boundaryRight: boundary.right};
    });
  });
  expect(mobileNavGeometry.map((item) => item.label)).toEqual([...views]);
  for (const item of mobileNavGeometry) {
    expect(item.left).toBeGreaterThanOrEqual(item.boundaryLeft - .5);
    expect(item.right).toBeLessThanOrEqual(item.boundaryRight + .5);
  }
  await page.locator(".mobile-workspace-selector select").selectOption("model");
  await expect(page.getByRole("heading", {name: "Challenge selected evidence"})).toBeVisible();
  await expect(page.getByText(/Server-side review adapter/)).toBeVisible();
  await page.getByRole("combobox", {name: "Deal"}).selectOption("atlasgrid");
  await expect(page.getByRole("heading", {name: "AtlasGrid Systems"})).toBeVisible();
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Financials"}).click();
  await expect(page.getByRole("columnheader", {name: "7.5x"})).toBeVisible();
  await expect(page.getByRole("table", {name: "Entry value × exit multiple"}).getByRole("cell")).toHaveCount(9);
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Documents"}).click();
  await page.getByRole("searchbox", {name: "Search filenames and retained evidence"}).fill("customer");
  await page.locator(".source-list button").first().click();
  const labeledCells = page.locator('.source-row-table [data-label]');
  expect(await labeledCells.count()).toBeGreaterThan(2);
  await expect(labeledCells.first()).toBeVisible();
});

test("local MCP proposal reaches named human review, memo acceptance, and local persistence", async ({page}, testInfo: TestInfo) => {
  const temporary = mkdtempSync(resolve(tmpdir(), "underwriting-mcp-flow-")); const ledger = resolve(temporary, "proposals.jsonl");
  try {
    const server = resolve(import.meta.dirname, "../mcp-server/server.mjs");
    const request = {jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "propose_memo_section", arguments: {deal_id: "atlasgrid", section: "Downside follow-up", draft_text: "Reconcile the downside covenant bridge before the next committee review.", evidence_refs: ["atlasgrid-SELECTED-gross-irr"]}}};
    const run = spawnSync(process.execPath, [server, "--proposal-ledger", ledger], {encoding: "utf8", input: `${JSON.stringify(request)}\n`});
    expect(run.status).toBe(0); expect(run.stdout).toContain('"status":"PROPOSED"');
    await page.goto("/#/v3/atlasgrid/diligence", {waitUntil: "networkidle"});
    await chooseDiligenceSection(page, "model", "Model review");
    await page.getByText("Advanced local model handoff").click();
    await page.getByLabel(/Choose JSONL ledger/).setInputFiles(ledger);
    await expect(page.getByText(/1 proposal ready for human review/)).toBeVisible();
    await page.getByRole("textbox", {name: "Human reviewer"}).fill("Avery Chen");
    await page.getByRole("button", {name: "Accept proposal"}).click();
    await (await visibleDealNavigation(page)).getByRole("button", {name: "IC Memo"}).click();
    await expect(page.getByRole("heading", {name: "Accepted proposals ready for the memo"})).toBeVisible();
    await page.getByRole("textbox", {name: "Editor"}).fill("Avery Chen");
    await page.getByRole("button", {name: "Add with provenance"}).click();
    await expect(page.getByRole("heading", {name: "Downside follow-up"})).toBeVisible();
    await expect(page.getByText("Accepted model proposal")).toBeVisible();
    await expect(page.getByRole("textbox", {name: "Downside follow-up memo section"})).toHaveValue(/Reconcile the downside covenant bridge/);
    await settleAtTop(page);
    const scan = await accessibilitySnapshot(page);
    await captureVisualEvidence(page, `${testInfo.project.name}-mcp-human-review-memo.png`, true);
    writeAccessibilityEvidence(`${testInfo.project.name}-mcp-human-review.json`, {boundary: "Local synthetic MCP-ledger roundtrip and browser-local persistence only; no hosted connector, provider inference, confidential-data security, or comprehensive WCAG claim.", project: testInfo.project.name, scans: [{view: "Accepted model proposal in IC memo", ...scan}], viewport: page.viewportSize()});
    await page.reload({waitUntil: "networkidle"});
    await expect(page.getByRole("heading", {name: "Downside follow-up"})).toBeVisible();
  } finally { rmSync(temporary, {recursive: true, force: true}); }
});

for (const candidate of [
  {id: "atlasgrid", company: "AtlasGrid Systems", posture: "REPRICE"},
  {id: "helios", company: "Helios Compute Control", posture: "HOLD"},
]) {
  test(`${candidate.company} five-destination investor journey`, async ({page}, testInfo: TestInfo) => {
    test.setTimeout(60_000);
    const scans: Array<Record<string, unknown>> = [];
    await page.goto(`/#/v3/${candidate.id}/overview`, {waitUntil: "networkidle"});
    await expect(page.getByRole("heading", {name: candidate.company})).toBeVisible();
    await expect((await visibleDealNavigation(page)).getByRole("button")).toHaveCount(5);
    await expect(page.getByRole("heading", {name: candidate.posture, exact: true})).toHaveCount(1);
    for (const view of views) {
      const navigation = await visibleDealNavigation(page);
      await navigation.getByRole("button", {name: view}).click();
      await expect(navigation.getByRole("button", {name: view})).toHaveAttribute("aria-current", "page");
      await settleAtTop(page);
      await assertPlainDefaultSurface(page);
      scans.push({view, ...await accessibilitySnapshot(page)});
      await captureVisualEvidence(page, `${testInfo.project.name}-${candidate.id}-${view.toLowerCase().replace(" ", "-")}.png`);
    }
    if (candidate.id === "helios") {
      await (await visibleDealNavigation(page)).getByRole("button", {name: "Diligence"}).click();
      await chooseDiligenceSection(page, "test", "Assumption test");
      await expect(page.getByText(/8.7% less compute per workload/)).toBeVisible();
      await expect(page.getByText("Method and uncertainty").locator(".." )).not.toHaveAttribute("open");
      await chooseDiligenceSection(page, "model", "Model review");
      await expect(page.getByText(/Select the exact evidence subset to send/)).toBeVisible();
      await expect(page.getByRole("button", {name: "Challenge evidence"})).toBeDisabled();
    }
    writeAccessibilityEvidence(`${testInfo.project.name}-${candidate.id}-product.json`, {boundary: "No critical or serious Axe finding and no root overflow on the five tested default surfaces; not comprehensive WCAG or practitioner evidence.", case: candidate.company, project: testInfo.project.name, scans, viewport: page.viewportSize()});
  });
}

test("ordinary multi-file intake produces a governed local deal that survives refresh", async ({page}, testInfo: TestInfo) => {
  test.setTimeout(60_000);
  const externalRequests: string[] = [];
  page.on("request", (request) => { const url = new URL(request.url()); if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(request.url()); });
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "New deal"}).click();
  await expect(page.getByText(/bytes stay in this browser tab/)).toBeVisible();
  await page.getByTestId("deal-package-input").setInputFiles(packagePaths);
  await page.getByRole("button", {name: "Validate and analyze"}).click();
  await expect(page.getByRole("heading", {name: "SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED"})).toBeVisible();
  await expect(page.getByText(/cannot authorize advancement/i)).toBeVisible();
  await expect(page.getByText("Hash mismatch")).toHaveCount(0);
  const approveButton = page.getByRole("button", {name: "Approve Version 1 and open workspace"});
  await expect(approveButton).toBeDisabled();
  await page.getByRole("textbox", {name: "Analyst name"}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "Approval rationale"}).fill("Reviewed the declared mappings, exclusions, source boundaries, and reconciliation results for screening.");
  await expect(approveButton).toBeEnabled();
  await captureVisualEvidence(page, `${testInfo.project.name}-northstar-package-ready.png`, true);
  await approveButton.click();
  await expect(page.getByRole("heading", {name: "Northstar Metrics", level: 1})).toBeVisible();
  await expect((await visibleDealNavigation(page)).getByRole("button")).toHaveCount(5);
  await expect(page.getByRole("heading", {name: "SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED", exact: true})).toHaveCount(1);
  const decisionRail = page.getByRole("complementary", {name: "Decision status"});
  await expect(decisionRail).toContainText("Unresolved screening gates");
  await expect(decisionRail).toContainText("Investment concerns");
  await expect(decisionRail).toContainText("Evidence or policy gaps");
  await expect(decisionRail).toContainText("Open diligence issues");
  const retentionGate = page.getByRole("row").filter({hasText: "Minimum ordinary-cohort NRR"});
  await expect(retentionGate).toContainText("83.6%");
  await expect(retentionGate).toContainText("95.0%");
  await expect(retentionGate).toContainText("Blocked");
  const scans: Array<Record<string, unknown>> = [];
  for (const view of views) {
    await (await visibleDealNavigation(page)).getByRole("button", {name: view}).click();
    await settleAtTop(page); await assertPlainDefaultSurface(page);
    scans.push({view, ...await accessibilitySnapshot(page)});
    await captureVisualEvidence(page, `${testInfo.project.name}-northstar-${view.toLowerCase().replace(" ", "-")}.png`);
  }
  expect(externalRequests).toEqual([]);
  writeAccessibilityEvidence(`${testInfo.project.name}-northstar-intake.json`, {boundary: "Ordinary browser file selection through all five local-deal views; uploaded bytes were not observed leaving localhost. Automated evidence only.", project: testInfo.project.name, scans, viewport: page.viewportSize()});
  await page.reload({waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "Northstar Metrics", level: 1})).toBeVisible();
  await expect(page.getByRole("textbox", {name: "Economics memo section"})).toHaveValue(/11-month cohort retention proxy 83.6%/);
});

test("missing required input fails closed before return conclusions", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "New deal"}).click();
  await page.getByTestId("deal-package-input").setInputFiles(packagePaths.filter((path) => !path.endsWith("customer_arr.csv")));
  await page.getByRole("button", {name: "Validate and analyze"}).click();
  await expect(page.getByRole("heading", {name: "NO CALL — PACKAGE INCOMPLETE"})).toBeVisible();
  await expect(page.getByText("customer_arr.csv is required").first()).toBeVisible();
  await expect(page.getByRole("button", {name: "Approve Version 1 and open workspace"})).toHaveCount(0);
  await expect(page.getByText(/Gross multiple/)).toHaveCount(0);
  await captureVisualEvidence(page, `${testInfo.project.name}-northstar-package-incomplete.png`, true);
});

test("mixed Excel CSV PDF package is parsed, reviewed, approved, and replayable", async ({page}, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop admission proof");
  test.setTimeout(60_000);
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "New deal"}).click();
  await page.getByTestId("deal-package-input").setInputFiles(evidencePackagePaths);
  await page.getByRole("button", {name: "Validate and analyze"}).click();
  await expect(page.getByRole("heading", {name: "SCREENING COMPLETE — FURTHER DILIGENCE REQUIRED"})).toBeVisible();
  const modelRow = page.getByRole("row").filter({hasText: "operating_model.xlsx"});
  await expect(modelRow).toContainText("Operating Model!");
  await expect(modelRow).toContainText("preserved formulas");
  await expect(modelRow).toContainText("2026-07 — after the declared cutoff");
  await expect(modelRow).toContainText("Gross profit: Ties");
  const pdfRow = page.getByRole("row").filter({hasText: "management_update.pdf"});
  await expect(pdfRow).toContainText("1 pages recognized");
  await expect(pdfRow).toContainText("Pages 1-1");
  const approveButton = page.getByRole("button", {name: "Approve Version 1 and open workspace"});
  await expect(approveButton).toBeDisabled();
  await page.getByRole("textbox", {name: "Analyst name"}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "Approval rationale"}).fill("Confirmed the mapped operating rows, future-period exclusion, rejected add-back, and PDF classification.");
  await approveButton.click();
  await expect(page.getByRole("heading", {name: "Northstar Metrics", level: 1})).toBeVisible();
  await expect(page.getByRole("region", {name: "Evidence version approval"})).toContainText("Avery Chen");
  await expect(page.getByRole("region", {name: "Evidence version approval"})).toContainText("mappings and exclusions only");
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Documents"}).click();
  await expect(page.getByText("Management update")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name: "Export controlled Excel results"}).click();
  const download = await downloadPromise;
  const controlledWorkbook = testInfo.outputPath("northstar-v1-controlled-results.xlsx");
  await download.saveAs(controlledWorkbook);
  await page.getByTestId("controlled-workbook-input").setInputFiles(controlledWorkbook);
  const roundTrip = page.getByRole("region", {name: "Controlled Excel round trip"});
  await expect(roundTrip).toContainText("PASS");
  await expect(roundTrip).toContainText("Original worksheet bytes");
  await expect(roundTrip).toContainText("Unchanged");
  await expect(roundTrip).toContainText("28 before · 28 after");
  await expect(roundTrip).toContainText("Underwriting Desk");
  await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-mixed-package-documents.png`, true);
  await page.reload({waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "Northstar Metrics", level: 1})).toBeVisible();
});

test("local Version 2 changes propagate and require explicit accept reject or defer", async ({page}, testInfo: TestInfo) => {
  await page.goto("/", {waitUntil: "networkidle"});
  await page.getByRole("button", {name: "New deal"}).click();
  await page.getByTestId("deal-package-input").setInputFiles(evidencePackagePaths);
  await page.getByRole("button", {name: "Validate and analyze"}).click();
  await page.getByRole("textbox", {name: "Analyst name"}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "Approval rationale"}).fill("Confirmed the mappings, exclusions, formula preservation, and source classifications for Version 1.");
  await page.getByRole("button", {name: "Approve Version 1 and open workspace"}).click();
  await expect(page.getByRole("region", {name: "Evidence version approval"})).toContainText("V1 approved");
  await page.getByTestId("local-revision-input").setInputFiles(evidenceRevisionPaths);
  await expect(page.getByRole("status")).toContainText("Version 2 validated");
  const changeControl = page.getByRole("region", {name: "Compare a revised delivery"});
  await expect(changeControl).toContainText("83.6%");
  await expect(changeControl).toContainText("78.6%");
  await expect(changeControl).toContainText("3 memo sections stale");
  await captureVisualEvidence(page, `${testInfo.project.name}-local-version-2-change-control.png`, true);
  await accessibilitySnapshot(page);
  await page.getByRole("textbox", {name: "Reviewer"}).fill("Avery Chen");
  await page.getByRole("textbox", {name: "Rationale"}).fill("Rejecting this delivery until management reconciles the revised customer rows.");
  await page.getByRole("button", {name: "Reject change"}).click();
  await expect(page.getByRole("status")).toContainText("V1 remains canonical");
  await expect(page.getByRole("region", {name: "Evidence version approval"})).toContainText("V1 approved");
  await page.getByRole("textbox", {name: "Rationale"}).fill("Deferring the revision while the commercial diligence owner verifies the cancellation schedule.");
  await page.getByRole("button", {name: "Defer"}).click();
  await expect(page.getByRole("status")).toContainText("V1 remains canonical");
  await page.getByRole("textbox", {name: "Rationale"}).fill("Accepting the revised customer evidence after confirming the changed cohort rows and downstream screening impact.");
  await page.getByRole("button", {name: "Accept and promote"}).click();
  await expect(page.getByRole("region", {name: "Evidence version approval"})).toContainText("V2 approved");
  await (await visibleDealNavigation(page)).getByRole("button", {name: "Documents"}).click();
  const sources = page.getByRole("region", {name: "Original source attachments"});
  await expect(sources).toContainText("V1 · operating_model.xlsx");
  await expect(sources).toContainText("V2 · operating_model.xlsx");
  await page.reload({waitUntil: "networkidle"});
  await expect(page.getByRole("region", {name: "Original source attachments"})).toContainText("V1 · management_update.pdf");
});

test("deep links still load only the selected retained case chunk", async ({page}) => {
  const requests: string[] = []; page.on("response", (response) => { if (response.url().includes("underwriting-case-")) requests.push(response.url()); });
  await page.goto("/#/v3/helios/overview", {waitUntil: "networkidle"});
  expect(requests.some((url) => url.includes("helios"))).toBe(true);
  expect(requests.some((url) => url.includes("atlasgrid"))).toBe(false);
  await page.getByRole("combobox", {name: "Deal"}).selectOption("atlasgrid");
  await expect(page.getByRole("heading", {name: "AtlasGrid Systems"})).toBeVisible();
  expect(requests.filter((url) => url.includes("atlasgrid"))).toHaveLength(1);
});

test("public-record retrospective enforces the historical cutoff without hindsight", async ({page}, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop public-record proof");
  await page.goto("/#/public-record/snowflake", {waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "Snowflake pre-IPO screen"})).toBeVisible();
  await expect(page.getByText("September 14, 2020 · 11:59 PM UTC")).toBeVisible();
  await expect(page.getByText("2 filings admitted · 2 later filings excluded")).toBeVisible();
  const ledger = page.locator(".filing-ledger");
  await expect(ledger).toContainText("Final prospectus");
  await expect(ledger).toContainText("Contains the final $120 offer price; prohibited hindsight");
  await expect(page.getByText("NO CALL")).toBeVisible();
  await expect(page.getByText(/does not support a complete ownership, dilution, downside or return model/)).toBeVisible();
  await accessibilitySnapshot(page);
  await captureVisualEvidence(page, `${testInfo.project.name}-snowflake-public-record-package-cutoff.png`);
  await page.reload({waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: "Snowflake pre-IPO screen"})).toBeVisible();
});
