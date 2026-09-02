import rawCatalog from "virtual:underwriting-case-index";
import {assertRuntimeCase} from "./runtime-case";
import type {CaseData} from "./types";

export type CaseId = "atlasgrid" | "helios";
export type CaseCatalogItem = Pick<CaseData, "caseId" | "company" | "caseType"> & {
  caseId: CaseId;
  investmentQuestion: string;
  owner: string;
  stage: string;
  posture: string;
  blockerCount: number;
  primaryBlocker: string;
  asOf: string;
};

function assertCatalog(value: unknown): asserts value is CaseCatalogItem[] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("case_catalog_invalid");
  const ids = value.map((item) => item && typeof item === "object" ? (item as {caseId?: unknown}).caseId : null).sort();
  if (ids.join(",") !== "atlasgrid,helios") throw new Error("case_catalog_set_invalid");
  if (value.some((item) => !item || typeof item !== "object" || typeof (item as {company?: unknown}).company !== "string" || typeof (item as {caseType?: unknown}).caseType !== "string" || typeof (item as {investmentQuestion?: unknown}).investmentQuestion !== "string" || typeof (item as {owner?: unknown}).owner !== "string" || typeof (item as {stage?: unknown}).stage !== "string" || typeof (item as {posture?: unknown}).posture !== "string" || !Number.isSafeInteger((item as {blockerCount?: unknown}).blockerCount) || typeof (item as {primaryBlocker?: unknown}).primaryBlocker !== "string" || typeof (item as {asOf?: unknown}).asOf !== "string")) throw new Error("case_catalog_item_invalid");
}

assertCatalog(rawCatalog);
export const caseCatalog = rawCatalog;

const loaders: Record<CaseId, () => Promise<{default: unknown}>> = {
  atlasgrid: () => import("virtual:underwriting-case-atlasgrid"),
  helios: () => import("virtual:underwriting-case-helios"),
};
const cache = new Map<CaseId, Promise<CaseData>>();

export function isCaseId(value: string): value is CaseId {
  return value === "atlasgrid" || value === "helios";
}

export function loadCase(caseId: CaseId): Promise<CaseData> {
  const existing = cache.get(caseId);
  if (existing) return existing;
  const pending = loaders[caseId]().then((module) => {
    const candidate = module.default;
    assertRuntimeCase(candidate);
    if (candidate.caseId !== caseId) throw new Error(`case_payload_mismatch:${caseId}`);
    return candidate;
  }).catch((error) => {
    cache.delete(caseId);
    throw error;
  });
  cache.set(caseId, pending);
  return pending;
}
