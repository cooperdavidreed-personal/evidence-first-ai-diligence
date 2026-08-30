import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

import {expect, test} from "@playwright/test";

import {captureVisualEvidence, normalizeChromiumPdf} from "./visual-evidence";


for (const memo of [
  {slug: "atlasgrid", title: /AtlasGrid Systems/},
  {slug: "helios", title: /Helios Compute Control/},
]) {
  test(`${memo.slug} IC memo renders and paginates without horizontal clipping`, async ({page}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "print proof is captured once in desktop Chromium");
    const memoPath = resolve(import.meta.dirname, `../../portfolio/${memo.slug}/ic-memo.html`);
    await page.goto(pathToFileURL(memoPath).href);
    await expect(page.getByRole("heading", {name: memo.title}).first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await captureVisualEvidence(page, `desktop-${memo.slug}-ic-memo.png`, true);
    const rawPdfPath = testInfo.outputPath(`${memo.slug}-ic-memo-letter.raw.pdf`);
    await page.pdf({
      path: rawPdfPath,
      format: "Letter",
      printBackground: true,
      margin: {top: "0.35in", right: "0.35in", bottom: "0.35in", left: "0.35in"},
    });
    normalizeChromiumPdf(rawPdfPath, `${memo.slug}-ic-memo-letter.pdf`);
  });
}
