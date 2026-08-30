import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import {captureVisualEvidence, writeAccessibilityEvidence} from "./visual-evidence";

const workbenchDataSha256 = createHash("sha256")
  .update(readFileSync(resolve(import.meta.dirname, "../src/data/cases.json")))
  .digest("hex");

const viewChecks = {
  "IC Snapshot": /What must be true/,
  "Thesis & Evidence": /Evidence → estimate → judgment → action/,
  "Econometric Lab": /What the design can—and cannot—establish/,
  "Underwriting Room": /(Price, leverage, and downside|Terms, ownership, runway, and preferences)/,
  "Value Creation": /(Every initiative earns its place|Value creation reconciles|Value creation changes runway)/,
};

async function assertBoundedAndAccessible(page: Page) {
  const scan = await new AxeBuilder({page}).analyze();
  expect(scan.violations).toEqual([]);
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`),
  }));
  expect(width.scroll, `overflowing elements: ${width.offenders.join(", ")}`).toBeLessThanOrEqual(width.client);
  return {
    axe_violations: scan.violations
      .map((violation) => ({id: violation.id, impact: violation.impact ?? "unknown", node_count: violation.nodes.length}))
      .sort((left, right) => left.id.localeCompare(right.id)),
    critical_or_serious_count: scan.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")).length,
    root_client_width: width.client,
    root_scroll_width: width.scroll,
  };
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

async function loadCanonicalVisualRoute(page: Page, routeCaseId: string, routeSlug: string, heading: RegExp) {
  // A hash-only navigation can retain the previous document's scroll/focus state.
  // Change the document URL as well, then explicitly settle and reset every
  // browser-owned source of vertical position before retaining visual evidence.
  await page.goto(`/?visual=${routeCaseId}-${routeSlug}#/v2/${routeCaseId}/${routeSlug}`, {waitUntil: "networkidle"});
  await expect(page.getByRole("heading", {name: heading})).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    document.body.style.setProperty("scroll-behavior", "auto", "important");
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => ({
    body: document.body.scrollTop,
    document: document.documentElement.scrollTop,
    visual: window.visualViewport?.pageTop ?? window.scrollY,
    window: window.scrollY,
  }))).toEqual({body: 0, document: 0, visual: 0, window: 0});
  await expect(page.getByText("Underwriting Intelligence Lab", {exact: true})).toBeInViewport();
  await expect(page.getByText("SYNTHETIC — NOT INVESTMENT ADVICE", {exact: true})).toBeInViewport();
  const nav = page.getByRole("navigation", {name: "Workbench views"});
  await expect(nav).toBeInViewport();
  await expect(nav.getByRole("button")).toHaveCount(5);
}

for (const caseName of ["AtlasGrid Systems", "Helios Compute Control"]) {
  test(`${caseName} complete keyboard, interaction, visual, and accessibility flow`, async ({page}, testInfo: TestInfo) => {
    const accessibilityScans: Array<Record<string, unknown>> = [];
    const evidenceCaseSlug = caseName.toLowerCase().replaceAll(" ", "-");
    const routeCaseId = caseName === "AtlasGrid Systems" ? "atlasgrid" : "helios";
    await page.goto(`/#/v2/${routeCaseId}/snapshot`);
    await expect(page.getByText("Underwriting Intelligence Lab", {exact: true})).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
      document.body.style.setProperty("scroll-behavior", "auto", "important");
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    });
    await expect(page.getByRole("heading", {name: caseName})).toBeVisible();
    await expect(page.getByText("SYNTHETIC — NOT INVESTMENT ADVICE")).toBeVisible();
    await expect(page.getByText("PENDING HUMAN")).toBeVisible();

    const firstViewportChecks = [
      [page.getByText("PENDING HUMAN", {exact: true}), "human authority state"],
      [page.getByText("HOLD", {exact: true}), "workflow hold state"],
      [page.getByText("PENDING FOUNDER SIGNATURE", {exact: true}), "unsigned decision state"],
      [page.getByRole("heading", {name: caseName === "AtlasGrid Systems" ? "REPRICE" : "CONDITIONAL INVEST"}), "analytical posture"],
    ] as Array<[Locator, string]>;
    if (caseName === "Helios Compute Control" && testInfo.project.name === "desktop") {
      firstViewportChecks.push([page.getByRole("button", {name: /Inspect lineage for First close · Series C cash \$25M/}), "first-close capital"]);
      firstViewportChecks.push([page.getByRole("button", {name: /Inspect lineage for Conditional tranche · Series C cash \$15M/}), "conditional tranche capital"]);
      firstViewportChecks.push([page.getByRole("button", {name: /Milestone · Series C fully diluted ownership/}), "fully diluted ownership"]);
      firstViewportChecks.push([page.getByRole("button", {name: /^Inspect lineage for Milestone.*gross XIRR/i}), "selected milestone gross return"]);
      firstViewportChecks.push([page.getByRole("button", {name: /Downside.*gross XIRR/i}), "downside gross return"]);
      firstViewportChecks.push([page.getByRole("heading", {name: /Retention and margin support a milestone structure/}), "decisive evidence"]);
      firstViewportChecks.push([page.getByRole("heading", {name: /Down-round dilution and weaker exit economics/}), "loss case"]);
      firstViewportChecks.push([page.getByRole("heading", {name: /Provider-level compute, telemetry, and support unit-cost ledger/}), "blocking gate"]);
      firstViewportChecks.push([page.getByRole("heading", {name: "Runway uses three different bases"}), "runway timing basis"]);
    } else if (caseName === "AtlasGrid Systems" && testInfo.project.name === "desktop") {
      firstViewportChecks.push([page.getByRole("button", {name: /Upfront EV/}), "selected entry price"]);
      firstViewportChecks.push([page.getByRole("button", {name: /Funded term debt/}), "selected financing structure"]);
      firstViewportChecks.push([page.getByRole("button", {name: /Earnout threshold \/ cap/}), "contingent consideration"]);
      firstViewportChecks.push([page.getByRole("button", {name: /Gross IRR/}).first(), "selected gross return"]);
      firstViewportChecks.push([page.getByRole("heading", {name: "Definitions reduce earnings and concentration quality"}), "decisive evidence"]);
      firstViewportChecks.push([page.getByRole("heading", {name: "Churn plus multiple compression breaks the return case"}), "loss case"]);
      firstViewportChecks.push([page.getByRole("heading", {name: "Lender definition of covenant EBITDA"}), "blocking gate"]);
    }
    for (const [locator, label] of firstViewportChecks) await assertInFirstViewport(page, locator, label);

    const lineageTrigger = page.getByRole("button", {name: /Inspect lineage/}).first();
    await lineageTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Business meaning")).toBeVisible();
    await expect(page.getByRole("dialog").locator(".lineage-summary").getByText(/^[a-f0-9]{64}$/)).toHaveCount(0);
    await page.getByRole("dialog").getByText("Readable source evidence", {exact: true}).click();
    const sourceLink = page.getByRole("link", {name: "Open complete committed synthetic source ↗"}).first();
    await expect(sourceLink).toBeVisible();
    await expect(page.getByRole("dialog").locator(".excerpt-grid").first()).toBeVisible();
    const readableExcerpt = await page.getByRole("dialog").locator(".excerpt-grid dd").allTextContents();
    expect(readableExcerpt.every((value) => !value.trim().startsWith("{") && !value.trim().startsWith("["))).toBe(true);
    const sourceResponse = await page.request.get(await sourceLink.evaluate((element) => (element as HTMLAnchorElement).href));
    expect(sourceResponse.status()).toBe(200);
    if (testInfo.project.name === "desktop") {
      await captureVisualEvidence(page, `desktop-${evidenceCaseSlug}-lineage-drawer.png`);
    }
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
          expect(await graph.locator(".dag-edges line").count()).toBeLessThanOrEqual(3);
          // Retain the complete compact spotlight chain, including its evidence
          // origin, rather than centering only the selected decision node.
          await graph.evaluate((element) => element.scrollIntoView({block: "start", inline: "nearest"}));
          await expect(selectedNode).toBeInViewport();
          await captureVisualEvidence(page, `desktop-${evidenceCaseSlug}-selected-thesis-path.png`);
          const decisionId = await selectedNode.getAttribute("data-node-id");
          await page.keyboard.press("ArrowLeft");
          await expect.poll(async () => graph.locator(".dag-node:focus").getAttribute("data-node-id")).not.toBe(decisionId);
          const upstream = graph.locator(".dag-node:focus");
          const upstreamId = await upstream.getAttribute("data-node-id");
          await expect(upstream).toHaveAttribute("aria-selected", "true");
          await page.keyboard.press("ArrowRight");
          await expect.poll(async () => graph.locator(".dag-node:focus").getAttribute("data-node-id")).not.toBe(upstreamId);
          await expect(graph.locator(".dag-node:focus")).toHaveAttribute("aria-selected", "true");
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
          await page.getByRole("dialog").getByText("Calculation and decision chain", {exact: true}).click();
          await expect(page.getByRole("dialog")).toContainText("DATED XIRR");
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
      accessibilityScans.push({view, ...await assertBoundedAndAccessible(page)});
      const slug = view.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
      const caseSlug = caseName.toLowerCase().replaceAll(" ", "-");
      const routeSlug = {"IC Snapshot": "snapshot", "Thesis & Evidence": "evidence", "Econometric Lab": "econometrics", "Underwriting Room": "underwriting", "Value Creation": "value-creation"}[view];
      await loadCanonicalVisualRoute(page, routeCaseId, routeSlug!, heading);
      await captureVisualEvidence(page, `${testInfo.project.name}-${caseSlug}-${slug}.png`);
    }
    expect(chartIds.size).toBe(4);
    writeAccessibilityEvidence(`${testInfo.project.name}-${evidenceCaseSlug}.json`, {
      boundary: "Automated Axe scan found no rule violations and tested root overflow is zero; this is not comprehensive WCAG conformance.",
      case: caseName,
      project: testInfo.project.name,
      scans: accessibilityScans,
      viewport: page.viewportSize(),
      workbench_data_sha256: workbenchDataSha256,
    });
  });
}

test("stable deep links restore case, room, search, metric focus, and browser history", async ({page}) => {
  await page.goto("/#/v2/helios/evidence");
  await expect(page.getByRole("heading", {name: "Helios Compute Control"})).toBeVisible();
  await expect(page.getByRole("button", {name: /Thesis & Evidence/})).toHaveAttribute("aria-current", "page");
  const search = page.getByRole("searchbox", {name: "Search room"});
  await search.fill("ordinary-cohort NRR");
  await expect(page.getByRole("status")).toContainText("1 of");
  await page.getByLabel("Deal room search results").getByRole("button", {name: "Inspect finding evidence ↗"}).click();
  await expect(page).toHaveURL(/#\/v2\/helios\/evidence\?metric=hx-nrr-metric$/);
  await expect(page.getByRole("dialog", {name: "Ordinary-cohort NRR"})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/v2\/helios\/evidence$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", {name: "Helios Compute Control"})).toBeVisible();
  await expect(page.getByRole("button", {name: /Thesis & Evidence/})).toHaveAttribute("aria-current", "page");
  await page.goto("/#/v2/atlasgrid/underwriting?scenario=ask&driver=exit_multiple&cell=exit_multiple%3A5.5");
  await expect(page.getByRole("button", {name: "Seller ask"})).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", {name: "Driver"})).toHaveValue("exit_multiple");
  await expect(page.getByRole("button", {name: "5.5x"})).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {name: "Selected"}).click();
  await expect(page).toHaveURL(/scenario=selected/);
  await expect(page).toHaveURL(/driver=exit_multiple/);
  await expect(page).toHaveURL(/cell=exit_multiple%3A5.5/);
});
