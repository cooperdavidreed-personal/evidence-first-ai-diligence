import {strFromU8, unzipSync} from "fflate";

/** Cell content comparison, not an Excel calculation engine or a workbook equivalence check. */
export interface WorkbookCell {
  type: "number" | "text" | "boolean" | "error" | "date" | "blank";
  value: string;
  formula: string | null;
}
export interface WorkbookCellChange {
  sheet: string;
  address: string;
  kind: "FORMULA_CHANGED" | "VALUE_CHANGED" | "CACHED_VALUE_CHANGED" | "CELL_ADDED" | "CELL_REMOVED";
  before: WorkbookCell | null;
  after: WorkbookCell | null;
}
export interface WorkbookSemanticDiff {
  state: "COMPARED" | "UNSUPPORTED";
  changes: WorkbookCellChange[];
  addedSheets: string[];
  removedSheets: string[];
  detail: string;
}
const MAX_ARCHIVE = 8 * 1024 * 1024;
const MAX_EXPANDED = 32 * 1024 * 1024;
const MAX_PART = 8 * 1024 * 1024;
const MAX_CELLS = 100_000;
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function fail(message: string): never { throw new Error(message); }
function children(element: Element, name: string) { return Array.from(element.children).filter(child => child.localName === name); }
function one(element: Element, name: string) {
  const matches = children(element, name);
  if (matches.length > 1) fail(`Duplicate ${name} element`);
  return matches[0];
}
function text(element: Element | undefined) { return element?.textContent ?? ""; }
function xml(bytes: Uint8Array | undefined, name: string) {
  if (!bytes) fail(`Missing workbook part: ${name}`);
  const source = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail("XML declarations with entities are unsupported");
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) fail(`Invalid XML: ${name}`);
  return doc.documentElement;
}
function numeric(value: string) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) fail("Invalid numeric cell");
  // Normalize decimal spelling without losing precision through JavaScript Number.
  const [coefficient, exponentText = "0"] = value.toLowerCase().split("e");
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) fail("Numeric exponent exceeds supported range");
  const negative = coefficient.startsWith("-");
  const unsigned = coefficient.replace(/^[+-]/, "");
  const [integer, fraction = ""] = unsigned.split(".");
  let digits = (integer + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  let power = exponent - fraction.length;
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); power++; }
  const point = digits.length + power;
  const magnitude = power >= 0 && point <= 30 ? digits + "0".repeat(power)
    : point > 0 && point < digits.length ? `${digits.slice(0, point)}.${digits.slice(point)}`
    : point <= 0 && point >= -20 ? `0.${"0".repeat(-point)}${digits}`
    : `${digits}e${power}`;
  return `${negative ? "-" : ""}${magnitude}`;
}
function richText(element: Element) {
  if (children(element, "rPh").length || children(element, "phoneticPr").length) fail("Phonetic strings are unsupported");
  return Array.from(element.children).map(child => {
    if (child.localName === "t") return text(child);
    if (child.localName === "r") return text(one(child, "t"));
    return fail("Unsupported string structure");
  }).join("");
}
// Excel may compact repeated ordinary formulas into a master plus shared followers.
// Translate a deliberately bounded grammar; never guess at names, strings or sheet references.
function point(address: string) {
  const m = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(address);
  if (!m) return fail("Invalid shared formula address");
  const col = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0), row = Number(m[2]);
  if (col > 16384 || row > 1048576) fail("Shared formula address exceeds worksheet bounds");
  return {col, row};
}
function columnName(col: number) {
  let name = "";
  while (col > 0) {col--; name = String.fromCharCode(65 + col % 26) + name; col = Math.floor(col / 26);}
  return name;
}
function translateShared(formula: string, from: string, to: string) {
  const start = point(from), end = point(to);
  const tokens = formula.match(/\$?[A-Z]{1,3}\$?[1-9]\d*|(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?|[+*/^%():,=<>-]|\s+/g);
  if (!tokens || tokens.join("") !== formula) fail("Shared formulas support arithmetic A1 references only; names, functions and sheet references are unsupported");
  let operand = true, depth = 0;
  for (const token of tokens.filter(token => token.trim())) {
    if (token === "(") {if (!operand) fail("Unsupported shared formula function or name"); depth++;}
    else if (token === ")") {if (operand || depth-- <= 0) fail("Invalid shared formula expression");}
    else if (token === "%") {if (operand) fail("Invalid shared formula expression");}
    else if (/^[+*/^:-]$/.test(token)) {if (operand && token !== "+" && token !== "-") fail("Invalid shared formula expression"); operand = true;}
    else {if (!operand || /^[,=<>]$/.test(token)) fail("Unsupported shared formula expression"); operand = false;}
  }
  if (operand || depth) fail("Invalid shared formula expression");
  return tokens.map(token => {
    const m = /^(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)$/.exec(token);
    if (!m) return token;
    const original = point(m[2] + m[4]);
    const col = original.col + (m[1] ? 0 : end.col - start.col), row = original.row + (m[3] ? 0 : end.row - start.row);
    if (col < 1 || col > 16384 || row < 1 || row > 1048576) fail("Shared formula translation exceeds worksheet bounds");
    return `${m[1]}${columnName(col)}${m[3]}${row}`;
  }).join("");
}
function sharedFormulaResolver(data: Element) {
  const masters = new Map<string, {address: string; formula: string; first: ReturnType<typeof point>; last: ReturnType<typeof point>}>();
  for (const row of children(data, "row")) for (const cell of children(row, "c")) {
    const f = one(cell, "f");
    if (f?.getAttribute("t") !== "shared") continue;
    const si = f.getAttribute("si") ?? "";
    if (!/^\d+$/.test(si) || Array.from(f.attributes).some(attr => !["t", "si", "ref"].includes(attr.name))) fail("Invalid shared formula attributes");
    if (!text(f)) {if (f.hasAttribute("ref")) fail("Shared formula follower cannot define a range"); continue;}
    const range = (f.getAttribute("ref") ?? "").split(":");
    if (masters.has(si) || range.length > 2 || !range[0]) fail("Missing or ambiguous shared formula master");
    const first = point(range[0]), last = point(range[1] ?? range[0]);
    if (first.col > last.col || first.row > last.row) fail("Invalid shared formula range");
    masters.set(si, {address: cell.getAttribute("r") ?? "", formula: text(f), first, last});
  }
  return (f: Element, address: string) => {
    const master = masters.get(f.getAttribute("si") ?? "");
    if (!master) return fail("Unresolved shared formula master");
    for (const location of [point(address), point(master.address)]) if (location.col < master.first.col || location.col > master.last.col || location.row < master.first.row || location.row > master.last.row) fail("Shared formula cell lies outside declared range");
    return translateShared(master.formula, master.address, address);
  };
}
export function readWorkbook(buffer: ArrayBuffer, options: {inspectionOnly?: boolean} = {}) {
  if (buffer.byteLength > MAX_ARCHIVE) fail("Workbook exceeds the 8 MB archive limit");
  let total = 0; let parts = 0;
  const partNames = new Set<string>();
  const files = unzipSync(new Uint8Array(buffer), {filter: file => {
    if (partNames.has(file.name)) fail("Duplicate ZIP part names are unsupported");
    partNames.add(file.name);
    total += file.originalSize; parts++;
    if (parts > 512 || file.originalSize > MAX_PART || total > MAX_EXPANDED) fail("Workbook exceeds expanded package limits");
    return true;
  }});
  if (Object.keys(files).some(name => /vbaProject/i.test(name) || (!options.inspectionOnly && /externalLinks\//i.test(name)))) fail("Macro and external-link workbooks are unsupported");
  const workbook = xml(files["xl/workbook.xml"], "xl/workbook.xml");
  if (workbook.namespaceURI !== NS) fail("Only transitional XLSX worksheets are supported");
  const rels = xml(files["xl/_rels/workbook.xml.rels"], "workbook relationships");
  const relationships = new Map<string, string>();
  for (const rel of children(rels, "Relationship")) {
    const id = rel.getAttribute("Id") ?? "";
    if (!id || relationships.has(id)) fail("Ambiguous workbook relationship");
    const target = rel.getAttribute("Target") ?? "";
    if (rel.getAttribute("TargetMode") === "External") fail("External workbook relationships are unsupported");
    relationships.set(id, target);
  }
  const shared = files["xl/sharedStrings.xml"] ? children(xml(files["xl/sharedStrings.xml"], "shared strings"), "si").map(richText) : [];
  const sheets = new Map<string, Map<string, WorkbookCell>>();
  const paths = new Set<string>();
  let count = 0;
  const sheetList = one(workbook, "sheets");
  if (!sheetList) fail("Workbook has no sheet list");
  for (const sheet of children(sheetList, "sheet")) {
    const name = sheet.getAttribute("name");
    if (!name || sheets.has(name)) fail("Missing or duplicate sheet name");
    const id = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = id ? relationships.get(id) : undefined;
    if (!target || target.includes("..") || target.includes("\\")) fail("Unsupported worksheet target");
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    if (paths.has(path)) fail("Multiple sheets reference the same worksheet");
    paths.add(path);
    const root = xml(files[path], path);
    if (root.localName !== "worksheet" || root.namespaceURI !== NS) fail("Non-worksheet sheets are unsupported");
    const data = one(root, "sheetData");
    if (!data) fail("Worksheet has no cell data");
    const resolveShared = sharedFormulaResolver(data);
    const cells = new Map<string, WorkbookCell>();
    const seen = new Set<string>();
    for (const row of children(data, "row")) for (const cell of children(row, "c")) {
      if (++count > MAX_CELLS) fail("Workbook exceeds 100,000 cells");
      const address = cell.getAttribute("r") ?? "";
      const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(address);
      if (!match || Number(match[2]) > 1_048_576 || [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) > 16384 || seen.has(address)) fail("Invalid or duplicate cell address");
      seen.add(address);
      const f = one(cell, "f");
      if (!options.inspectionOnly && f && f.getAttribute("t") !== "shared" && (Array.from(f.attributes).some(attr => attr.name !== "t" || attr.value !== "normal") || !text(f))) fail("Array, data-table and unsupported attributed formulas are unsupported");
      let formula: string | null = null;
      if (f) {if (f.getAttribute("t") === "shared") {try {formula=resolveShared(f,address);} catch(error) {if(!options.inspectionOnly)throw error;formula=`Shared formula ${f.getAttribute("si")}: ${text(f)||"see shared master in original workbook"}; relative formula not expanded`;}} else formula=text(f)||"Attributed formula: inspect original workbook; cached result only";}
      const raw = text(one(cell, "v"));
      const type = cell.getAttribute("t") ?? "n";
      let value: string = raw; let valueType: WorkbookCell["type"];
      if (type === "s") {
        if (!/^\d+$/.test(raw) || shared[Number(raw)] === undefined) fail("Unresolved shared string");
        value = shared[Number(raw)]; valueType = "text";
      } else if (type === "inlineStr") {
        const inline = one(cell, "is"); if (!inline) fail("Missing inline string");
        value = richText(inline); valueType = "text";
      } else if (type === "str") valueType = "text";
      else if (type === "b") { if (raw !== "0" && raw !== "1") fail("Invalid boolean cell"); valueType = "boolean"; }
      else if (type === "e") valueType = "error";
      else if (type === "d") valueType = "date";
      else if (type === "n") { valueType = raw === "" ? "blank" : "number"; value = raw === "" ? "" : numeric(raw); }
      else fail(`Unsupported cell type: ${type}`);
      if (valueType !== "blank" || formula) cells.set(address, {type: valueType, value, formula});
    }
    sheets.set(name, cells);
  }
  return sheets;
}

/** Compares stored cell content only. Does not calculate formulas, resolve names, or compare formatting/charts/validation. */
export function compareWorkbookCells(source: ArrayBuffer, candidate: ArrayBuffer): WorkbookSemanticDiff {
  try {
    const before = readWorkbook(source); const after = readWorkbook(candidate);
    const addedSheets = [...after.keys()].filter(name => !before.has(name));
    const removedSheets = [...before.keys()].filter(name => !after.has(name));
    const changes: WorkbookCellChange[] = [];
    for (const sheet of new Set([...before.keys(), ...after.keys()])) {
      const left = before.get(sheet) ?? new Map<string, WorkbookCell>();
      const right = after.get(sheet) ?? new Map<string, WorkbookCell>();
      for (const address of new Set([...left.keys(), ...right.keys()])) {
        const a = left.get(address) ?? null; const b = right.get(address) ?? null;
        let kind: WorkbookCellChange["kind"] | null = null;
        if (!a) kind = "CELL_ADDED";
        else if (!b) kind = "CELL_REMOVED";
        else if (a.formula !== b.formula) kind = "FORMULA_CHANGED";
        else if (a.type !== b.type || a.value !== b.value) kind = a.formula ? "CACHED_VALUE_CHANGED" : "VALUE_CHANGED";
        if (kind) changes.push({sheet, address, kind, before: a, after: b});
      }
    }
    return {state: "COMPARED", changes, addedSheets, removedSheets, detail: "Compared stored cell values and ordinary formulas (including bounded shared A1 formulas) by sheet name and address. Cached changes may reflect recalculation; no formulas were evaluated. Formatting, named definitions, charts and other workbook features are outside this comparison."};
  } catch (error) {
    return {state: "UNSUPPORTED", changes: [], addedSheets: [], removedSheets: [], detail: error instanceof Error ? error.message : "Unreadable XLSX package"};
  }
}
