import {readFileSync, readdirSync, statSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {extname, join, relative, resolve, sep} from "node:path";
import type {Plugin} from "vite";

const INDEX_ID = "virtual:underwriting-case-index";
const CASE_IDS = ["atlasgrid", "helios"] as const;
const virtualIds = new Set([INDEX_ID, ...CASE_IDS.map((id) => `virtual:underwriting-case-${id}`)]);
const dataPath = fileURLToPath(new URL("./src/data/cases.json", import.meta.url));
const portfolioPath = fileURLToPath(new URL("../portfolio", import.meta.url));

function sourcePackFiles(caseId: typeof CASE_IDS[number]) {
  const root = join(portfolioPath, caseId, "data-room");
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files.map((path) => ({
    path,
    publishedPath: `source-pack/${caseId}/${relative(root, path).split(sep).join("/")}`,
  }));
}

function sourcePackMiddleware(request: {url?: string}, response: {statusCode: number; setHeader(name: string, value: string): void; end(value?: Buffer | string): void}, next: () => void) {
  const match = request.url?.split("?")[0].match(/^\/source-pack\/(atlasgrid|helios)\/(.+)$/);
  if (!match) return next();
  const caseId = match[1] as typeof CASE_IDS[number];
  const root = resolve(portfolioPath, caseId, "data-room");
  const path = resolve(root, decodeURIComponent(match[2]));
  if (!path.startsWith(`${root}${sep}`) || !statSafe(path)) { response.statusCode = 404; response.end("Not found"); return; }
  const mime: Record<string, string> = {".csv": "text/csv; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8"};
  response.statusCode = 200;
  response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
  response.end(readFileSync(path));
}

function statSafe(path: string) {
  try { return statSync(path).isFile(); }
  catch { return false; }
}

type RawCase = {caseId?: unknown; company?: unknown; caseType?: unknown; dealContext?: {investment_question?: unknown}};
type RawDocument = {schema_version?: unknown; cases?: unknown};
type LooseCase = RawCase & Record<string, any>;

function readCases(): LooseCase[] {
  const document: RawDocument = JSON.parse(readFileSync(dataPath, "utf8"));
  if (document.schema_version !== "underwriting.workbench-data/v2" || !Array.isArray(document.cases)) {
    throw new Error("virtual_case_document_invalid");
  }
  const cases = document.cases as Array<RawCase & Record<string, unknown>>;
  const ids = cases.map((item) => item.caseId).sort();
  if (ids.join(",") !== CASE_IDS.join(",") || cases.some((item) => typeof item.company !== "string" || typeof item.caseType !== "string" || typeof item.dealContext?.investment_question !== "string")) {
    throw new Error("virtual_case_catalog_invalid");
  }
  return cases as LooseCase[];
}

function compactCaseForRuntime(source: LooseCase): LooseCase {
  const metricIds = new Set<string>();
  source.summaryMetrics.forEach((item: {metric_id: string}) => metricIds.add(item.metric_id));
  source.decision.metric_pairs.forEach((item: {metric_id: string}) => metricIds.add(item.metric_id));
  source.decision.issue_summary.issues.forEach((issue: {evidence_metric_ids: string[]}) => issue.evidence_metric_ids.forEach((id) => metricIds.add(id)));
  if (source.peEngine) {
    for (const key of ["ask", "selected", "downside"]) {
      const scenario = source.peEngine[key];
      for (const suffix of ["gross-irr", "gross-moic", "exit-debt", "min-liquidity"]) metricIds.add(`${source.caseId}-${scenario.scenario_id}-${suffix}`);
    }
    for (const cell of [...source.peEngine.sensitivities.one_way, ...source.peEngine.sensitivities.entry_exit_matrix]) {
      metricIds.add(`${source.caseId}-${cell.cell_id}-irr`);
      metricIds.add(`${source.caseId}-${cell.cell_id}-moic`);
    }
    source.returnsDistribution.moic.forEach((_value: string, index: number) => metricIds.add(`${source.caseId}-distribution-${index}`));
  }
  if (source.vcEngine) {
    for (const key of ["base", "milestone", "downside", "financing_shortfall"]) {
      const scenario = source.vcEngine[key];
      for (const suffix of ["gross-xirr", "gross-moic", "ownership", "minimum-cash"]) metricIds.add(`helios-${scenario.scenario_id}-${suffix}`);
    }
    for (const cell of source.vcEngine.sensitivities.cells) {
      metricIds.add(`helios-${cell.cell_id}-gross-xirr`);
      metricIds.add(`helios-${cell.cell_id}-gross-moic`);
    }
    source.returnsDistribution.moic.forEach((_value: string, index: number) => metricIds.add(`helios-distribution-moic-${index}`));
  }
  source.analyses.forEach((analysis: {analysis_id: string}) => {
    const representative = source.metricRegistry.find((metric: {metric_id: string; display_value: string}) => metric.metric_id.includes(analysis.analysis_id) && metric.display_value);
    if (representative) metricIds.add(representative.metric_id);
  });

  const rendered = new Set<string>(source.renderManifest.metric_ids);
  for (const artifact of source.artifacts as Array<{artifact_id: string}>) {
    const locatorIds = new Set<string>(source.sourceLocators.filter((item: {artifact_id: string}) => item.artifact_id === artifact.artifact_id).map((item: {locator_id: string}) => item.locator_id));
    source.metricRegistry
      .filter((metric: {source_locator_ids: string[]}) => metric.source_locator_ids.some((id) => locatorIds.has(id)))
      .sort((left: {metric_id: string; formula_id?: string}, right: {metric_id: string; formula_id?: string}) => Number(rendered.has(right.metric_id)) - Number(rendered.has(left.metric_id)) || Number(Boolean(right.formula_id)) - Number(Boolean(left.formula_id)) || left.metric_id.localeCompare(right.metric_id))
      .slice(0, 6)
      .forEach((metric: {metric_id: string}) => metricIds.add(metric.metric_id));
  }

  const formulasById = new Map<string, {formula_id: string; operand_ids: string[]}>(source.formulaRegistry.map((formula: {formula_id: string; operand_ids: string[]}) => [formula.formula_id, formula]));
  const selectedFormulaIds = new Set<string>();
  let previousMetricCount = -1;
  while (previousMetricCount !== metricIds.size) {
    previousMetricCount = metricIds.size;
    for (const metric of source.metricRegistry as Array<{metric_id: string; formula_id?: string}>) {
      if (!metricIds.has(metric.metric_id) || !metric.formula_id) continue;
      selectedFormulaIds.add(metric.formula_id);
      const formula = formulasById.get(metric.formula_id);
      if (formula) formula.operand_ids.forEach((id) => metricIds.add(id));
    }
  }

  const distributionWithoutPaths = (distribution: Record<string, unknown>) => {
    const {path_records: _pathRecords, path_receipt_sha256s: _pathReceipts, ...summary} = distribution;
    return summary;
  };
  const peEngine = source.peEngine ? {...source.peEngine, distribution: distributionWithoutPaths(source.peEngine.distribution)} : undefined;
  const vcEngine = source.vcEngine ? {...source.vcEngine, distribution: distributionWithoutPaths(source.vcEngine.distribution)} : undefined;
  return {
    ...source,
    metricRegistry: source.metricRegistry.filter((metric: {metric_id: string}) => metricIds.has(metric.metric_id)),
    formulaRegistry: source.formulaRegistry.filter((formula: {formula_id: string}) => selectedFormulaIds.has(formula.formula_id)),
    renderManifest: {
      ...source.renderManifest,
      metric_ids: source.renderManifest.metric_ids.filter((id: string) => metricIds.has(id)),
      investment_metric_ids: source.renderManifest.investment_metric_ids.filter((id: string) => metricIds.has(id)),
      formula_sample_metric_ids: source.renderManifest.formula_sample_metric_ids.filter((id: string) => metricIds.has(id)),
    },
    peEngine,
    vcEngine,
  };
}

export function underwritingCaseDataPlugin(): Plugin {
  return {
    name: "underwriting-case-data",
    buildStart() {
      this.addWatchFile(dataPath);
      for (const caseId of CASE_IDS) for (const file of sourcePackFiles(caseId)) this.addWatchFile(file.path);
      readCases();
    },
    generateBundle() {
      for (const caseId of CASE_IDS) {
        for (const file of sourcePackFiles(caseId)) {
          this.emitFile({type: "asset", fileName: file.publishedPath, source: readFileSync(file.path)});
        }
      }
    },
    configureServer(server) {
      server.middlewares.use(sourcePackMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(sourcePackMiddleware);
    },
    resolveId(source) {
      return virtualIds.has(source) ? `\0${source}` : null;
    },
    load(id) {
      const sourceId = id.startsWith("\0") ? id.slice(1) : id;
      if (!virtualIds.has(sourceId)) return null;
      const cases = readCases();
      if (sourceId === INDEX_ID) {
        const catalog = cases.map(({caseId, company, caseType, dealContext, decision}) => {
          const blockers = decision.issue_summary.issues.filter((issue: {blocks_advancement: boolean}) => issue.blocks_advancement);
          return {
            caseId,
            company,
            caseType,
            investmentQuestion: dealContext!.investment_question,
            owner: caseId === "atlasgrid" ? "Buyout team" : "Growth team",
            stage: decision.decision === "HOLD" ? "Diligence" : "Pre-IC",
            posture: decision.decision,
            blockerCount: blockers.length,
            primaryBlocker: blockers[0]?.title ?? "No unresolved canonical issue",
            asOf: decision.as_of,
          };
        });
        return `export default ${JSON.stringify(catalog)};`;
      }
      const caseId = sourceId.replace("virtual:underwriting-case-", "");
      const selected = cases.find((item) => item.caseId === caseId);
      if (!selected) throw new Error(`virtual_case_missing:${caseId}`);
      const runtimeCase = compactCaseForRuntime(selected);
      return `export default ${JSON.stringify(runtimeCase)};`;
    },
  };
}
