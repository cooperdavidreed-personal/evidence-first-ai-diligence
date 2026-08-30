import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import type {Page} from "@playwright/test";


const repositoryRoot = resolve(import.meta.dirname, "../..");
const updateBaselines = process.env.UPDATE_VISUAL_BASELINES === "1";

export function visualEvidencePath(fileName: string): string {
  const root = updateBaselines ? "dist/visual-evidence" : "dist/visual-candidates";
  const path = resolve(repositoryRoot, root, fileName);
  mkdirSync(dirname(path), {recursive: true});
  return path;
}

export function writeAccessibilityEvidence(fileName: string, value: object): void {
  const root = updateBaselines
    ? "verification/accessibility-evidence"
    : "dist/accessibility-candidates";
  const path = resolve(repositoryRoot, root, fileName);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function captureVisualEvidence(page: Page, fileName: string, fullPage = false): Promise<void> {
  const isCanonicalWorkbenchRoute = fileName.endsWith(".png")
    && !fileName.includes("-lineage-drawer")
    && !fileName.includes("-selected-thesis-path")
    && !fileName.includes("-ic-memo");
  if (isCanonicalWorkbenchRoute) {
    const state = await page.evaluate(() => {
      const brand = document.querySelector(".topbar")?.getBoundingClientRect();
      const disclosure = document.querySelector(".synthetic-banner")?.getBoundingClientRect();
      const nav = document.querySelector(".view-nav")?.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        visualTop: window.visualViewport?.pageTop ?? window.scrollY,
        brandTop: brand?.top ?? -1,
        brandBottom: brand?.bottom ?? Number.POSITIVE_INFINITY,
        disclosureTop: disclosure?.top ?? -1,
        disclosureBottom: disclosure?.bottom ?? Number.POSITIVE_INFINITY,
        disclosureText: document.querySelector(".synthetic-banner")?.textContent?.trim() ?? "",
        navTop: nav?.top ?? -1,
        navBottom: nav?.bottom ?? Number.POSITIVE_INFINITY,
        navControls: document.querySelectorAll(".view-nav button").length,
        viewportHeight: window.innerHeight,
      };
    });
    const inFrame = (top: number, bottom: number) => top >= 0 && bottom <= state.viewportHeight;
    if (state.scrollY !== 0 || state.visualTop !== 0 || !inFrame(state.brandTop, state.brandBottom)
      || !inFrame(state.disclosureTop, state.disclosureBottom) || !inFrame(state.navTop, state.navBottom)
      || state.disclosureText !== "SYNTHETIC — NOT INVESTMENT ADVICE" || state.navControls !== 5) {
      throw new Error(`canonical_visual_precondition_failed:${fileName}:${JSON.stringify(state)}`);
    }
  }
  await page.screenshot({
    path: visualEvidencePath(fileName),
    fullPage,
    animations: "disabled",
  });
}

export function normalizeChromiumPdf(rawPath: string, fileName: string): string {
  const fixedTimestamp = "D:20260829000000+00'00'";
  const source = readFileSync(rawPath).toString("latin1");
  const normalized = source
    .replace(/D:\d{14}\+00'00'/g, fixedTimestamp);
  if (normalized === source || normalized.length !== source.length) {
    throw new Error("pdf_metadata_normalization_failed");
  }
  const outputPath = updateBaselines
    ? resolve(repositoryRoot, "output/pdf", fileName)
    : visualEvidencePath(fileName);
  mkdirSync(dirname(outputPath), {recursive: true});
  writeFileSync(outputPath, Buffer.from(normalized, "latin1"));
  return outputPath;
}
