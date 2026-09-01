import {createHash} from "node:crypto";
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
  const workbenchData = readFileSync(resolve(repositoryRoot, "workbench/src/data/cases.json"));
  writeFileSync(path, `${JSON.stringify({
    ...value,
    workbench_data_sha256: createHash("sha256").update(workbenchData).digest("hex"),
  }, null, 2)}\n`, "utf8");
}

export async function captureVisualEvidence(page: Page, fileName: string, fullPage = false): Promise<void> {
  const isCanonicalWorkbenchRoute = fileName.endsWith(".png")
    && !fileName.includes("-landing")
    && !fileName.includes("-deals")
    && !fileName.includes("-package-")
    && !fileName.includes("-lineage-drawer")
    && !fileName.includes("-contextual-source-drawer")
    && !fileName.includes("-selected-thesis-path")
    && !fileName.includes("-ic-snapshot")
    && !fileName.includes("-underwriting-packet")
    && !fileName.includes("-technical-appendix");
  if (isCanonicalWorkbenchRoute) {
    const state = await page.evaluate(() => {
      const visible = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
      });
      const brand = visible(".deal-topbar")?.getBoundingClientRect();
      const navElement = visible('nav[aria-label="Deal navigation"]');
      const nav = navElement?.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        visualTop: window.visualViewport?.pageTop ?? window.scrollY,
        brandTop: brand?.top ?? -1,
        brandBottom: brand?.bottom ?? Number.POSITIVE_INFINITY,
        navTop: nav?.top ?? -1,
        navBottom: nav?.bottom ?? Number.POSITIVE_INFINITY,
        navControls: navElement?.querySelectorAll("button").length ?? 0,
        viewportHeight: window.innerHeight,
      };
    });
    const inFrame = (top: number, bottom: number) => top >= 0 && bottom <= state.viewportHeight;
    if (state.scrollY !== 0 || state.visualTop !== 0 || !inFrame(state.brandTop, state.brandBottom)
      || !inFrame(state.navTop, state.navBottom) || state.navControls !== 5) {
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
