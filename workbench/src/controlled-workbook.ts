import {strFromU8, strToU8, unzipSync, zipSync} from "fflate";
import type {IntakeResult} from "./intake";

export const CONTROLLED_RESULTS_SHEET = "Underwriting Desk";

export interface WorkbookRoundTripDiff {
  state: "PASS" | "FAIL";
  sourceWorksheetsUnchanged: boolean;
  formulasBefore: number;
  formulasAfter: number;
  addedSheets: string[];
  changedParts: string[];
  detail: string;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function replaceClosing(xml: string, localName: string, insertion: string) {
  const expression = new RegExp(`</(?:[A-Za-z0-9_]+:)?${localName}>`);
  if (!expression.test(xml)) throw new Error(`Workbook package is missing ${localName}`);
  return xml.replace(expression, `${insertion}$&`);
}

function required(files: Record<string, Uint8Array>, path: string) {
  const value = files[path];
  if (!value) throw new Error(`Workbook package is missing ${path}`);
  return strFromU8(value);
}

function formulaCount(files: Record<string, Uint8Array>) {
  return Object.entries(files).filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).reduce((count, [, bytes]) => count + (strFromU8(bytes).match(/<(?:[A-Za-z0-9_]+:)?f(?:\s|>)/g)?.length ?? 0), 0);
}

function sourceWorksheetEntries(files: Record<string, Uint8Array>) {
  return Object.fromEntries(Object.entries(files).filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)));
}

function sameBytes(left: Uint8Array, right: Uint8Array | undefined) {
  return Boolean(right) && left.length === right!.length && left.every((value, index) => value === right![index]);
}

function inlineCell(reference: string, value: string) {
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function numericCell(reference: string, value: number) {
  if (!Number.isFinite(value)) throw new Error(`Controlled result ${reference} is not finite`);
  return `<c r="${reference}" t="n"><v>${value}</v></c>`;
}

function controlledSheet(result: IntakeResult) {
  if (!result.analysis || !result.deal || !result.baselineApproval) throw new Error("An approved deterministic result is required for Excel export");
  const rows: Array<[string, string, number | string]> = [
    ["2", "Company", result.deal.company],
    ["3", "Canonical evidence", result.baselineApproval.version],
    ["4", "Package SHA-256", result.baselineApproval.packageDigest],
    ["5", "LTM revenue ($)", result.analysis.ltmRevenueCents / 100],
    ["6", "Gross margin", result.analysis.grossMargin],
    ["7", "Cohort retention proxy", result.analysis.ordinaryNrr],
    ["8", "Gross multiple", result.analysis.grossMoic],
    ["9", "Annualized gross return", result.analysis.annualizedGrossReturn],
    ["10", "Screening posture", result.posture],
    ["11", "Control boundary", "Deterministic screening output only; no source formula, policy, assumption, or investment decision was overwritten."],
  ];
  const body = rows.map(([row, label, value]) => `<row r="${row}">${inlineCell(`A${row}`, label)}${typeof value === "number" ? numericCell(`B${row}`, value) : inlineCell(`B${row}`, value)}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B11"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="72" customWidth="1"/></cols><sheetData><row r="1">${inlineCell("A1", "UNDERWRITING DESK CONTROLLED RESULTS")}</row>${body}</sheetData></worksheet>`;
}

export function exportControlledWorkbook(source: ArrayBuffer, result: IntakeResult) {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(source)); } catch { throw new Error("Source workbook is not a readable XLSX package"); }
  const workbookXml = required(files, "xl/workbook.xml");
  if (new RegExp(`name=["']${CONTROLLED_RESULTS_SHEET}["']`, "i").test(workbookXml)) throw new Error(`Workbook already contains the reserved ${CONTROLLED_RESULTS_SHEET} sheet; no cells were overwritten`);
  const relationshipXml = required(files, "xl/_rels/workbook.xml.rels");
  const contentTypesXml = required(files, "[Content_Types].xml");
  const sheetNumbers = Object.keys(files).map((name) => name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1]).filter(Boolean).map(Number);
  const nextSheetNumber = Math.max(0, ...sheetNumbers) + 1;
  const sheetIds = [...workbookXml.matchAll(/sheetId=["'](\d+)["']/g)].map((match) => Number(match[1]));
  const nextSheetId = Math.max(0, ...sheetIds) + 1;
  const relationshipIds = [...relationshipXml.matchAll(/Id=["']rId(\d+)["']/g)].map((match) => Number(match[1]));
  const nextRelationshipId = `rId${Math.max(0, ...relationshipIds) + 1}`;
  const workbookInsertion = `<sheet name="${CONTROLLED_RESULTS_SHEET}" sheetId="${nextSheetId}" r:id="${nextRelationshipId}"/>`;
  const relationshipInsertion = `<Relationship Id="${nextRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${nextSheetNumber}.xml"/>`;
  const contentTypeInsertion = `<Override PartName="/xl/worksheets/sheet${nextSheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  files["xl/workbook.xml"] = strToU8(replaceClosing(workbookXml, "sheets", workbookInsertion));
  files["xl/_rels/workbook.xml.rels"] = strToU8(replaceClosing(relationshipXml, "Relationships", relationshipInsertion));
  files["[Content_Types].xml"] = strToU8(replaceClosing(contentTypesXml, "Types", contentTypeInsertion));
  files[`xl/worksheets/sheet${nextSheetNumber}.xml`] = strToU8(controlledSheet(result));
  const archive = zipSync(files, {level: 6});
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
}

export function compareControlledWorkbook(source: ArrayBuffer, candidate: ArrayBuffer): WorkbookRoundTripDiff {
  let before: Record<string, Uint8Array>; let after: Record<string, Uint8Array>;
  try { before = unzipSync(new Uint8Array(source)); after = unzipSync(new Uint8Array(candidate)); } catch { return {state: "FAIL", sourceWorksheetsUnchanged: false, formulasBefore: 0, formulasAfter: 0, addedSheets: [], changedParts: [], detail: "One workbook is not a readable XLSX package."}; }
  const beforeSheets = sourceWorksheetEntries(before);
  const afterWorkbook = required(after, "xl/workbook.xml");
  const sourceWorksheetsUnchanged = Object.entries(beforeSheets).every(([name, bytes]) => sameBytes(bytes, after[name]));
  const addedSheets = new RegExp(`name=["']${CONTROLLED_RESULTS_SHEET}["']`, "i").test(afterWorkbook) ? [CONTROLLED_RESULTS_SHEET] : [];
  const allNames = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changedParts = [...allNames].filter((name) => !before[name] || !after[name] || !sameBytes(before[name], after[name])).sort();
  const formulasBefore = formulaCount(before); const formulasAfter = formulaCount(after);
  const allowedChanges = new Set(["[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"]);
  const unexpected = changedParts.filter((name) => !allowedChanges.has(name) && !(!before[name] && /^xl\/worksheets\/sheet\d+\.xml$/.test(name)));
  const passes = sourceWorksheetsUnchanged && formulasBefore === formulasAfter && addedSheets.length === 1 && unexpected.length === 0;
  return {state: passes ? "PASS" : "FAIL", sourceWorksheetsUnchanged, formulasBefore, formulasAfter, addedSheets, changedParts, detail: passes ? "All original worksheet bytes and formulas are unchanged; one controlled results sheet was added." : `Workbook differs outside the allowed controlled surface${unexpected.length ? `: ${unexpected.join(", ")}` : "."}`};
}
