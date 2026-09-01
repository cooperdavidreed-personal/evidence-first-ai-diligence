import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

import {expect, test} from "@playwright/test";

import {captureVisualEvidence, normalizeChromiumPdf} from "./visual-evidence";


for (const memo of [
  {slug: "atlasgrid", title: /AtlasGrid Systems/},
  {slug: "helios", title: /Helios Compute Control/},
]) {
  for (const artifact of [
    {source: "ic-snapshot", output: "ic-snapshot", capture: true, maxPages: 1},
    {source: "underwriting-packet", output: "underwriting-packet", capture: true, maxPages: 4},
    {source: "technical-appendix", output: "technical-appendix", capture: false, maxPages: undefined},
  ]) {
    test(`${memo.slug} ${artifact.output} renders and paginates without horizontal clipping`, async ({page}, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "print proof is captured once in desktop Chromium");
      const memoPath = resolve(import.meta.dirname, `../../portfolio/${memo.slug}/${artifact.source}.html`);
      await page.goto(pathToFileURL(memoPath).href);
      await expect(page.getByRole("heading", {name: memo.title}).first()).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
      });
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      if (artifact.source === "ic-snapshot") {
        await expect(page.locator("[data-decision-brief]")).toBeVisible();
        await expect(page.locator("[data-visual]")).toHaveCount(2);
        await expect(page.getByText("Decision requested", {exact: true})).toBeVisible();
        await expect(page.getByText("Human IC approval required.", {exact: false})).toBeVisible();
        const printBounds = await page.locator("[data-decision-brief]").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {left: rect.left, right: rect.right, width: rect.width, height: rect.height};
        });
        expect(printBounds.left).toBeGreaterThanOrEqual(0);
        expect(printBounds.right).toBeLessThanOrEqual(dimensions.clientWidth);
        expect(printBounds.width).toBeGreaterThan(650);
        expect(printBounds.height).toBeGreaterThan(850);
      }
      if (artifact.capture) await captureVisualEvidence(page, `desktop-${memo.slug}-${artifact.output}.png`, true);
      const rawPdfPath = testInfo.outputPath(`${memo.slug}-${artifact.output}-letter.raw.pdf`);
      await page.pdf({
        path: rawPdfPath,
        format: "Letter",
        printBackground: true,
        tagged: true,
        outline: true,
        margin: {top: "0.35in", right: "0.35in", bottom: "0.35in", left: "0.35in"},
      });
      const normalizedPdfPath = normalizeChromiumPdf(rawPdfPath, `${memo.slug}-${artifact.output}-letter.pdf`);
      if (artifact.maxPages !== undefined) {
        const pdfInfo = execFileSync("pdfinfo", [normalizedPdfPath], {encoding: "utf8"});
        const pageMatch = pdfInfo.match(/^Pages:\s+(\d+)$/m);
        expect(pageMatch, "pdfinfo must report a page count").not.toBeNull();
        expect(Number(pageMatch?.[1])).toBeLessThanOrEqual(artifact.maxPages);
      }
    });
  }
}
