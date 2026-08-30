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
