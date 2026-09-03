import {useState} from "react";
import {compareControlledWorkbook, exportControlledWorkbook, type WorkbookRoundTripDiff} from "./controlled-workbook";
import type {IntakeResult, SourcePayload} from "./intake";

function workbookPayload(result: IntakeResult) {
  return result.sourcePayloads?.find((payload): payload is SourcePayload => payload.name.endsWith(".xlsx") && "encoding" in payload && payload.encoding === "BASE64");
}

function decode(content: string) {
  const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function ExcelRoundTrip({result}: {result: IntakeResult}) {
  const source = workbookPayload(result);
  const [diff, setDiff] = useState<WorkbookRoundTripDiff | null>(null);
  const [notice, setNotice] = useState("");
  if (!source || source.encoding !== "BASE64" || !result.baselineApproval) return null;
  const workbook = source;
  const approval = result.baselineApproval;
  const original = () => decode(workbook.content);
  function download() {
    try {
      const bytes = exportControlledWorkbook(original(), result);
      const url = URL.createObjectURL(new Blob([bytes], {type: workbook.mediaType}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${result.deal?.company.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${approval.version.toLowerCase()}-controlled-results.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Controlled workbook exported. Original source sheets and formulas were not edited.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Controlled workbook export failed."); }
  }
  async function inspect(file: File | undefined) {
    if (!file) return;
    try { setDiff(compareControlledWorkbook(original(), await file.arrayBuffer())); }
    catch (error) { setDiff({state: "FAIL", sourceWorksheetsUnchanged: false, formulasBefore: 0, formulasAfter: 0, addedSheets: [], changedParts: [], detail: error instanceof Error ? error.message : "Workbook comparison failed."}); }
  }
  return <section className="excel-round-trip" aria-label="Controlled Excel round trip">
    <div><p className="eyebrow">Excel control boundary</p><h2>Export results without rewriting the source model</h2><p>The Desk adds one governed results sheet to a copy. Re-import the copy to verify original worksheet bytes, formulas, and allowed package changes.</p></div>
    <div className="excel-actions"><button type="button" onClick={download}>Export controlled Excel results</button><label className="file-button">Re-import controlled workbook<input data-testid="controlled-workbook-input" type="file" accept=".xlsx" onChange={(event) => void inspect(event.target.files?.[0])} /></label></div>
    {notice ? <p role="status">{notice}</p> : null}
    {diff ? <div className={`workbook-diff workbook-diff-${diff.state.toLowerCase()}`} role="status"><header><strong>{diff.state}</strong><span>{diff.detail}</span></header><dl><div><dt>Original worksheet bytes</dt><dd>{diff.sourceWorksheetsUnchanged ? "Unchanged" : "Changed"}</dd></div><div><dt>Formula count</dt><dd>{diff.formulasBefore} before · {diff.formulasAfter} after</dd></div><div><dt>Controlled sheet</dt><dd>{diff.addedSheets.join(", ") || "Missing"}</dd></div><div><dt>Changed package parts</dt><dd>{diff.changedParts.join(" · ") || "None"}</dd></div></dl></div> : null}
  </section>;
}
