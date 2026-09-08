import {prepareWorkbookRevision} from "./supported-revision";
import {ExcelChangeReview} from "./excel-change-review";
import {compareWorkbookCells, type WorkbookSemanticDiff} from "./workbook-diff";
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

export function ExcelRoundTrip({result, onPrepareRevision}: {result: IntakeResult; onPrepareRevision?: (candidate: IntakeResult) => void}) {
  const source = workbookPayload(result);
  const [diff, setDiff] = useState<WorkbookRoundTripDiff | null>(null);
  const [semantic, setSemantic] = useState<WorkbookSemanticDiff | null>(null);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [savedWorkbook, setSavedWorkbook] = useState<File | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (file.size > 8 * 1024 * 1024) {setNotice("Workbook exceeds the 8 MB review limit."); setDiff(null); return;}
    try { setDiff(compareControlledWorkbook(original(), await file.arrayBuffer())); }
    catch (error) { setDiff({state: "FAIL", sourceWorksheetsUnchanged: false, formulasBefore: 0, formulasAfter: 0, addedSheets: [], changedParts: [], detail: error instanceof Error ? error.message : "Workbook comparison failed."}); }
  }
  async function compareSaved(file: File | undefined) {
    if (!file) return;
    setSavedWorkbook(null);
    if (file.size > 8 * 1024 * 1024) {setSemantic({state: "UNSUPPORTED", changes: [], addedSheets: [], removedSheets: [], detail: "Workbook exceeds the 8 MB cell-review limit."}); return;}
    setBusy(true); setSemantic(null); setCandidateName(file.name); setReviewVersion(value => value + 1);
    try {const compared = compareWorkbookCells(original(), await file.arrayBuffer()); setSemantic(compared); if(compared.state === "COMPARED") setSavedWorkbook(file);}
    catch (error) {setSemantic({state:"UNSUPPORTED", changes:[], addedSheets:[], removedSheets:[], detail:error instanceof Error ? error.message : "The selected file could not be read."});}
    finally {setBusy(false);}
  }
  async function prepare() {
    if(!savedWorkbook || !onPrepareRevision) return;
    setBusy(true); setNotice("");
    try {const revision = await prepareWorkbookRevision(result, savedWorkbook); onPrepareRevision(revision); setNotice("Saved workbook validated as a source-package candidate. Review its consequences in Changes; the approved source is unchanged.");}
    catch(error) {setNotice(error instanceof Error ? error.message : "Saved workbook could not enter source review.");}
    finally {setBusy(false);}
  }
  return <section className="excel-round-trip" aria-label="Controlled Excel round trip">
    <div><p className="eyebrow">Excel control boundary</p><h2>Export results without rewriting the source model</h2><p>The Desk adds one governed results sheet to a copy. Re-import the copy to verify original worksheet bytes, formulas, and allowed package changes.</p></div>
    <div className="excel-actions"><button type="button" onClick={download}>Export controlled Excel results</button><label className="file-button">Re-import controlled workbook<input data-testid="controlled-workbook-input" type="file" accept=".xlsx" onChange={(event) => void inspect(event.target.files?.[0])} /></label></div>
    {notice ? <p role="status">{notice}</p> : null}
    {diff ? <div className={`workbook-diff workbook-diff-${diff.state.toLowerCase()}`} role="status"><header><strong>{diff.state}</strong><span>{diff.detail}</span></header><dl><div><dt>Original worksheet bytes</dt><dd>{diff.sourceWorksheetsUnchanged ? "Unchanged" : "Changed"}</dd></div><div><dt>Formula count</dt><dd>{diff.formulasBefore} before · {diff.formulasAfter} after</dd></div><div><dt>Controlled sheet</dt><dd>{diff.addedSheets.join(", ") || "Missing"}</dd></div><div><dt>Changed package parts</dt><dd>{diff.changedParts.join(" · ") || "None"}</dd></div></dl></div> : null}
    <div className="excel-cell-review"><h3>Review changes after an Excel save</h3><p>Compare cell content with the approved source workbook. Formula edits, input edits, and cached recalculations are shown separately. This does not approve the workbook or recalculate its formulas.</p><label className="file-button">Compare saved workbook<input type="file" accept=".xlsx" disabled={busy} onChange={(event) => {void compareSaved(event.target.files?.[0]); event.target.value = "";}} /></label>
    {busy ? <p role="status">Reading workbook cells…</p> : null}{semantic ? <ExcelChangeReview key={reviewVersion} diff={semantic} sourceName={workbook.name} candidateName={candidateName} /> : null}{onPrepareRevision && savedWorkbook ? <div className="excel-admission"><p>Supported admission accepts numeric input edits in the existing operating template. Formula-driven mapped inputs, formula edits, changed labels, periods or sheet structure require a complete separately reviewed package. Existing formula caches are retained as supplied evidence, not recalculated or verified by the Desk.</p><button type="button" disabled={busy} onClick={()=>void prepare()}>Prepare supported revision</button></div> : null}</div>
  </section>;
}
