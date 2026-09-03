import {unzipSync} from "fflate";

export interface ParsedOperatingModelRow {
  sourceRow: number;
  period: string;
  revenueCents: number;
  costOfRevenueCents: number;
  operatingExpenseCents: number;
}

export interface ParsedOperatingModel {
  rows: ParsedOperatingModelRow[];
  mappings: Array<{from: string; to: string}>;
  recognizedScope: string[];
  excluded: string[];
  rejectedFields: Array<{field: string; reason: string}>;
  reconciliations: Array<{label: string; state: "TIES" | "DISCREPANCY"; detail: string}>;
  formulaCount: number;
}

export interface ParsedPdfEvidence {
  pageCount: number;
  recognizedScope: string[];
  excerpts: Array<{page: number; text: string}>;
  excluded: string[];
}

function xml(source: Uint8Array | undefined, name: string) {
  if (!source) throw new Error(`Workbook is missing ${name}`);
  const parsed = new DOMParser().parseFromString(new TextDecoder().decode(source), "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error(`Workbook XML is invalid (${name})`);
  return parsed;
}

function elements(root: ParentNode, localName: string) {
  return [...root.querySelectorAll("*")].filter((item) => item.localName === localName);
}

function firstElement(root: ParentNode, localName: string) {
  return elements(root, localName)[0] ?? null;
}

function normalizedPath(target: string) {
  const stripped = target.replace(/^\//, "");
  return stripped.startsWith("xl/") ? stripped : `xl/${stripped.replace(/^\.\.\//, "")}`;
}

function columnNumber(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) throw new Error(`Workbook cell reference ${reference} is invalid`);
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

function sharedStrings(files: Record<string, Uint8Array>) {
  const source = files["xl/sharedStrings.xml"];
  if (!source) return [];
  return elements(xml(source, "shared strings"), "si").map((item) => elements(item, "t").map((text) => text.textContent ?? "").join(""));
}

function cellValue(cell: Element, strings: string[]) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return elements(cell, "t").map((item) => item.textContent ?? "").join("");
  const raw = firstElement(cell, "v")?.textContent ?? "";
  if (type === "s") return strings[Number(raw)] ?? "";
  if (type === "str") return raw;
  if (type === "b") return raw === "1";
  if (!raw) return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function moneyToCents(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${field} must contain a non-negative numeric USD value`);
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 0.000001) throw new Error(`${field} must be precise to cents`);
  return cents;
}

function monthOrdinal(value: string) {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

export async function parseOperatingModel(bytes: ArrayBuffer, cutoff: string): Promise<ParsedOperatingModel> {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(bytes)); } catch { throw new Error("Operating model is not a readable XLSX workbook"); }
  const workbook = xml(files["xl/workbook.xml"], "workbook");
  const relationships = xml(files["xl/_rels/workbook.xml.rels"], "workbook relationships");
  const relationshipPaths = new Map(elements(relationships, "Relationship").map((item) => [item.getAttribute("Id") ?? "", normalizedPath(item.getAttribute("Target") ?? "")]));
  const sheets = elements(workbook, "sheet").map((item) => ({name: item.getAttribute("name") ?? "", path: relationshipPaths.get(item.getAttribute("r:id") ?? item.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "") ?? ""}));
  const candidates = sheets.filter((sheet) => /operating|financial|model/i.test(sheet.name));
  if (candidates.length !== 1) throw new Error("Operating model requires exactly one clearly named operating or financial model sheet");
  const selected = candidates[0];
  const worksheet = xml(files[selected.path], selected.name);
  const strings = sharedStrings(files);
  const cells = new Map<number, Map<number, {value: unknown; formula: string | null; reference: string}>>();
  let formulaCount = 0;
  for (const cell of elements(firstElement(worksheet, "sheetData") ?? worksheet, "c")) {
    const reference = cell.getAttribute("r") ?? "";
    const rowNumber = Number(reference.match(/\d+$/)?.[0]);
    const colNumber = columnNumber(reference);
    const formula = firstElement(cell, "f")?.textContent ?? null;
    if (formula) formulaCount += 1;
    if (!cells.has(rowNumber)) cells.set(rowNumber, new Map());
    cells.get(rowNumber)!.set(colNumber, {value: cellValue(cell, strings), formula, reference});
  }
  const rowLabels = new Map<number, string>();
  for (const [row, values] of cells) {
    const label = [values.get(1)?.value, values.get(2)?.value].find((value) => typeof value === "string" && value.trim());
    if (typeof label === "string") rowLabels.set(row, label.trim());
  }
  const aliases: Record<string, RegExp[]> = {
    revenue_cents: [/^net revenue(?: \(\$\))?$/i, /^revenue(?: \(\$\))?$/i],
    cost_of_revenue_cents: [/^cost of revenue(?: \(\$\))?$/i, /^cogs(?: \(\$\))?$/i],
    operating_expense_cents: [/^operating expense(?: \(\$\))?$/i, /^opex(?: \(\$\))?$/i],
  };
  const mappedRows = new Map<string, {row: number; label: string}>();
  const mappings: Array<{from: string; to: string}> = [];
  for (const [canonical, patterns] of Object.entries(aliases)) {
    const matches = [...rowLabels].filter(([, label]) => patterns.some((pattern) => pattern.test(label)));
    if (matches.length !== 1) throw new Error(`Operating model field ${canonical} is missing or ambiguous`);
    const [row, label] = matches[0];
    mappedRows.set(canonical, {row, label});
    if (label.toLowerCase() !== canonical.replaceAll("_cents", "").replaceAll("_", " ")) mappings.push({from: label, to: canonical});
  }
  const periodCells: Array<{col: number; period: string; reference: string}> = [];
  for (const [row, values] of cells) {
    for (const [col, cell] of values) if (typeof cell.value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(cell.value)) periodCells.push({col, period: cell.value, reference: cell.reference});
    if (periodCells.length >= 12) break;
  }
  const uniquePeriods = [...new Map(periodCells.map((item) => [item.period, item])).values()].sort((left, right) => left.period.localeCompare(right.period));
  if (uniquePeriods.length < 12) throw new Error("Operating model requires at least 12 recognized monthly periods in YYYY-MM format");
  const eligiblePeriods = uniquePeriods.filter((item) => item.period <= cutoff.slice(0, 7));
  const latestTwelve = eligiblePeriods.slice(-12);
  if (latestTwelve.length !== 12) throw new Error("Operating model requires twelve eligible monthly periods through the cutoff");
  for (let index = 1; index < latestTwelve.length; index += 1) if (monthOrdinal(latestTwelve[index].period) - monthOrdinal(latestTwelve[index - 1].period) !== 1) throw new Error("Operating model requires twelve contiguous eligible monthly periods");
  const rows = latestTwelve.map(({col, period}) => ({
    sourceRow: mappedRows.get("revenue_cents")!.row,
    period,
    revenueCents: moneyToCents(cells.get(mappedRows.get("revenue_cents")!.row)?.get(col)?.value, `Revenue for ${period}`),
    costOfRevenueCents: moneyToCents(cells.get(mappedRows.get("cost_of_revenue_cents")!.row)?.get(col)?.value, `Cost of revenue for ${period}`),
    operatingExpenseCents: moneyToCents(cells.get(mappedRows.get("operating_expense_cents")!.row)?.get(col)?.value, `Operating expense for ${period}`),
  }));
  const grossProfitMatch = [...rowLabels].find(([, label]) => /^gross profit(?: \(\$\))?$/i.test(label));
  let reconciliation: ParsedOperatingModel["reconciliations"][number] = {label: "Gross profit", state: "TIES", detail: "Gross profit row is not supplied; derived revenue less cost of revenue will be used."};
  if (grossProfitMatch) {
    const [row] = grossProfitMatch;
    const differences = latestTwelve.map(({col, period}) => {
      const supplied = moneyToCents(cells.get(row)?.get(col)?.value, `Gross profit for ${period}`);
      const source = rows.find((item) => item.period === period)!;
      return supplied - (source.revenueCents - source.costOfRevenueCents);
    });
    const maxDifference = Math.max(...differences.map(Math.abs));
    reconciliation = maxDifference === 0
      ? {label: "Gross profit", state: "TIES", detail: "All 12 eligible periods tie exactly to revenue less cost of revenue."}
      : {label: "Gross profit", state: "DISCREPANCY", detail: `Largest monthly discrepancy is $${(maxDifference / 100).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}.`};
  }
  const dimension = firstElement(worksheet, "dimension")?.getAttribute("ref") ?? "Used range not declared";
  return {
    rows,
    mappings,
    recognizedScope: [`${selected.name}!${dimension}`, `${latestTwelve[0].period} through ${latestTwelve.at(-1)!.period}`, "Net revenue, cost of revenue, operating expense"],
    excluded: [
      ...sheets.filter((sheet) => sheet.name !== selected.name).map((sheet) => `${sheet.name} sheet — not used in screening calculations`),
      ...uniquePeriods.filter((item) => item.period > cutoff.slice(0, 7)).map((item) => `${item.period} — after the declared cutoff`),
    ],
    rejectedFields: [...rowLabels.values()].filter((label) => /adjusted ebitda|pipeline|budget/i.test(label)).map((field) => ({field, reason: "Not part of the approved screening calculation contract"})),
    reconciliations: [reconciliation],
    formulaCount,
  };
}

export async function parsePdfEvidence(bytes: ArrayBuffer): Promise<ParsedPdfEvidence> {
  const {getDocument, GlobalWorkerOptions} = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loadingTask = getDocument({data: new Uint8Array(bytes)});
  let document;
  try { document = await loadingTask.promise; } catch { throw new Error("Management document is not a readable, unencrypted PDF"); }
  if (document.numPages < 1 || document.numPages > 50) throw new Error("Management document must contain between 1 and 50 pages");
  const excerpts: Array<{page: number; text: string}> = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
    if (pageText) excerpts.push({page: pageNumber, text: pageText.slice(0, 480)});
  }
  if (!excerpts.length) throw new Error("Management PDF contains no extractable text; scanned-image OCR is not supported in this public slice");
  return {pageCount: document.numPages, recognizedScope: [`Pages 1-${document.numPages}`, `${excerpts.length} pages with extractable text`], excerpts, excluded: ["Images, charts, signatures, and layout are preserved in source bytes but not interpreted"]};
}
