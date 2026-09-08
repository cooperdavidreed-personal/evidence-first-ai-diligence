import {describe, expect, it} from "vitest";
import {strToU8, zipSync} from "fflate";
import {compareWorkbookCells,readWorkbook} from "./workbook-diff";
function workbook(cells: string, options: {shared?: string; target?: string; sheet?: string; extra?: Record<string, string>} = {}) {
  const target = options.target ?? "worksheets/sheet1.xml";
  const files: Record<string, string> = {
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${options.sheet ?? "Model"}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="${target}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>`,
    [`xl/${target}`]: `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells}</row></sheetData></worksheet>`, ...options.extra,
  };
  if (options.shared) files["xl/sharedStrings.xml"] = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${options.shared}</sst>`;
  const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [path, strToU8(value)])));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
describe("supported workbook cell comparison", () => {
  it("inspection retains cached shared-function results without claiming expanded formulas",()=>{const b=workbook('<c r="A1"><f t="shared" si="0" ref="A1:A2">SUM(B1:C1)</f><v>3</v></c><c r="A2"><f t="shared" si="0"/><v>7</v></c>');expect(readWorkbook(b,{inspectionOnly:true}).get("Model")!.get("A2")).toMatchObject({value:"7",formula:expect.stringContaining("not expanded")});expect(compareWorkbookCells(b,b).state).toBe("UNSUPPORTED");});
  it("ignores relationship filenames, styles and shared-string representation", () => {
    const before = workbook('<c r="A1" t="s"><v>0</v></c><c r="B1"><v>100.00</v></c>', {shared: '<si><t>Revenue</t></si>'});
    const after = workbook('<c s="4" r="A1" t="inlineStr"><is><r><t>Rev</t></r><r><t>enue</t></r></is></c><c r="B1"><v>1e2</v></c><c r="C1" s="1"/>', {target: "worksheets/repacked.xml", extra: {"docProps/app.xml": "<Properties/>"}});
    expect(compareWorkbookCells(before, after)).toMatchObject({state: "COMPARED", changes: [], addedSheets: [], removedSheets: []});
  });
  it("separates numeric edits, formula edits, recalculation and additions/removals", () => {
    const before = workbook('<c r="A1"><v>10</v></c><c r="B1"><f>A1*2</f><v>20</v></c><c r="C1"><f>A1*3</f><v>30</v></c><c r="D1"><v>1</v></c>');
    const after = workbook('<c r="A1"><v>12</v></c><c r="B1"><f>A1*4</f><v>48</v></c><c r="C1"><f>A1*3</f><v>36</v></c><c r="E1"><v>2</v></c>');
    const result = compareWorkbookCells(before, after);
    expect(result.state).toBe("COMPARED");
    expect(result.changes.map(({address, kind}) => [address, kind])).toEqual([["A1", "VALUE_CHANGED"], ["B1", "FORMULA_CHANGED"], ["C1", "CACHED_VALUE_CHANGED"], ["D1", "CELL_REMOVED"], ["E1", "CELL_ADDED"]]);
  });
  it("does not lose changes beyond JavaScript integer precision", () => {
    expect(compareWorkbookCells(workbook('<c r="A1"><v>9007199254740992</v></c>'), workbook('<c r="A1"><v>9007199254740993</v></c>')).changes).toHaveLength(1);
  });
  it("records renamed sheets as removal and addition without guessing identity", () => {
    const result = compareWorkbookCells(workbook('<c r="A1"><v>1</v></c>'), workbook('<c r="A1"><v>1</v></c>', {sheet: "Revised"}));
    expect(result).toMatchObject({addedSheets: ["Revised"], removedSheets: ["Model"]});
    expect(result.changes.map(change => change.kind)).toEqual(["CELL_REMOVED", "CELL_ADDED"]);
  });
  it.each(['<c r="A1"><f t="shared" si="0">B1*2</f><v>2</v></c>', '<c r="A1"><f t="array" ref="A1:B1">B1*2</f><v>2</v></c>', '<c r="A1"><v>1</v></c><c r="A1"><v>2</v></c>', '<c r="A1" t="s"><v>99</v></c>', '<c r="XFE1"><v>1</v></c>'])("rejects unsupported or ambiguous cells: %s", cells => {
    expect(compareWorkbookCells(workbook(""), workbook(cells))).toMatchObject({state: "UNSUPPORTED", changes: []});
  });
  it("expands native Excel shared formulas while preserving absolute and mixed references", () => {
    const before = workbook('<c r="B2"><f>A1+$A1+A$1+$A$1</f><v>4</v></c><c r="C3"><f>B2+$A2+B$1+$A$1</f><v>5</v></c>');
    const after = workbook('<c r="C3"><f t="shared" si="0"/><v>6</v></c><c r="B2"><f t="shared" si="0" ref="B2:C3">A1+$A1+A$1+$A$1</f><v>4</v></c>');
    expect(compareWorkbookCells(before, after)).toMatchObject({state:"COMPARED",changes:[{address:"C3",kind:"CACHED_VALUE_CHANGED"}]});
  });
  it("does not hide a changed shared master formula", () => {
    const before = workbook('<c r="A1"><f>B1*2</f><v>2</v></c><c r="A2"><f>B2*2</f><v>4</v></c>');
    const after = workbook('<c r="A1"><f t="shared" si="0" ref="A1:A2">B1*3</f><v>3</v></c><c r="A2"><f t="shared" si="0"/><v>6</v></c>');
    expect(compareWorkbookCells(before,after).changes.map(c=>c.kind)).toEqual(["FORMULA_CHANGED","FORMULA_CHANGED"]);
  });
  it.each([
    '<c r="A2"><f t="shared" si="0"/></c>',
    '<c r="A1"><f t="shared" si="0" ref="A1:A2">B1</f></c><c r="A3"><f t="shared" si="0"/></c>',
    '<c r="A1"><f t="shared" si="0" ref="A1:A2">B1</f></c><c r="A2"><f t="shared" si="0" ref="A1:A2">B2</f></c>',
    ...['LOG10(B1)','A1B2','Sheet1!B1','SUM(B1:B2)','B1+"A1"'].map(f=>`<c r="A1"><f t="shared" si="0" ref="A1:A2">${f}</f></c><c r="A2"><f t="shared" si="0"/></c>`),
    '<c r="B2"><f t="shared" si="0" ref="A1:B2">A1</f></c><c r="A1"><f t="shared" si="0"/></c>'
  ])("rejects ambiguous or unsupported shared formulas: %s", cells => {
    expect(compareWorkbookCells(workbook(""),workbook(cells))).toMatchObject({state:"UNSUPPORTED",changes:[]});
  });
  it("rejects expanded oversized XML before parsing", () => {
    expect(compareWorkbookCells(workbook(""), workbook("", {extra: {"xl/oversized.xml": "x".repeat(8 * 1024 * 1024 + 1)}}))).toMatchObject({state: "UNSUPPORTED", changes: []});
  });
});
