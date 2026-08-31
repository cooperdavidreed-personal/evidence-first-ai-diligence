import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import type {Plugin} from "vite";

const INDEX_ID = "virtual:underwriting-case-index";
const CASE_IDS = ["atlasgrid", "helios"] as const;
const virtualIds = new Set([INDEX_ID, ...CASE_IDS.map((id) => `virtual:underwriting-case-${id}`)]);
const dataPath = fileURLToPath(new URL("./src/data/cases.json", import.meta.url));

type RawCase = {caseId?: unknown; company?: unknown; caseType?: unknown; dealContext?: {investment_question?: unknown}};
type RawDocument = {schema_version?: unknown; cases?: unknown};

function readCases(): Array<RawCase & Record<string, unknown>> {
  const document: RawDocument = JSON.parse(readFileSync(dataPath, "utf8"));
  if (document.schema_version !== "underwriting.workbench-data/v2" || !Array.isArray(document.cases)) {
    throw new Error("virtual_case_document_invalid");
  }
  const cases = document.cases as Array<RawCase & Record<string, unknown>>;
  const ids = cases.map((item) => item.caseId).sort();
  if (ids.join(",") !== CASE_IDS.join(",") || cases.some((item) => typeof item.company !== "string" || typeof item.caseType !== "string" || typeof item.dealContext?.investment_question !== "string")) {
    throw new Error("virtual_case_catalog_invalid");
  }
  return cases;
}

export function underwritingCaseDataPlugin(): Plugin {
  return {
    name: "underwriting-case-data",
    buildStart() {
      this.addWatchFile(dataPath);
      readCases();
    },
    resolveId(source) {
      return virtualIds.has(source) ? `\0${source}` : null;
    },
    load(id) {
      const sourceId = id.startsWith("\0") ? id.slice(1) : id;
      if (!virtualIds.has(sourceId)) return null;
      const cases = readCases();
      if (sourceId === INDEX_ID) {
        const catalog = cases.map(({caseId, company, caseType, dealContext}) => ({caseId, company, caseType, investmentQuestion: dealContext!.investment_question}));
        return `export default ${JSON.stringify(catalog)};`;
      }
      const caseId = sourceId.replace("virtual:underwriting-case-", "");
      const selected = cases.find((item) => item.caseId === caseId);
      if (!selected) throw new Error(`virtual_case_missing:${caseId}`);
      return `export default ${JSON.stringify(selected)};`;
    },
  };
}
