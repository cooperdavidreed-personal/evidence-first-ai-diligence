import {mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {pathToFileURL} from "node:url";

import {expect, test} from "@playwright/test";


test("Helios IC memo renders and paginates without horizontal clipping", async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "print proof is captured once in desktop Chromium");
  const memoPath = resolve(import.meta.dirname, "../../portfolio/helios/ic-memo.html");
  await page.goto(pathToFileURL(memoPath).href);
  await expect(page.getByRole("heading", {name: /Helios Compute Control/}).first()).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await page.screenshot({
    path: "../dist/visual-evidence/desktop-helios-ic-memo.png",
    fullPage: true,
    animations: "disabled",
  });
  const pdfPath = resolve(import.meta.dirname, "../../output/pdf/helios-ic-memo-letter.pdf");
  mkdirSync(dirname(pdfPath), {recursive: true});
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    printBackground: true,
    margin: {top: "0.35in", right: "0.35in", bottom: "0.35in", left: "0.35in"},
  });
});
