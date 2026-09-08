import {ReviewTable} from "./review-table";
import {useState} from "react";
import {downloadText} from "./download";
import type {WorkbookSemanticDiff} from "./workbook-diff";

export function ExcelChangeReview({diff, sourceName, candidateName}: {diff: WorkbookSemanticDiff; sourceName: string; candidateName: string}) {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const changes = diff.changes.filter(change => (filter === "ALL" || change.kind === filter) && `${change.sheet} ${change.address} ${change.before?.formula ?? ""} ${change.after?.formula ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  function exportReview() {
    downloadText("underwriting-desk-excel-cell-review.json", JSON.stringify({format: "underwriting-desk.excel-cell-review/v1", sourceName, candidateName, reviewedAt: new Date().toISOString(), humanApproved: false, boundary: "Stored cell comparison only. No formula evaluation, workbook equivalence or source promotion. Filenames are labels, not verified identities.", comparison: diff}, null, 2), "application/json");
  }
  return <div className="excel-change-review">
    <p role="status">{diff.state === "UNSUPPORTED" ? "Comparison unavailable" : `${diff.changes.length} cell changes`} · {diff.detail}</p>
    {diff.addedSheets.length ? <p>Added sheets: {diff.addedSheets.join(", ")}</p> : null}
    {diff.removedSheets.length ? <p>Removed sheets: {diff.removedSheets.join(", ")}</p> : null}
    {diff.state === "COMPARED" ? <><div className="review-table-toolbar"><label>Change type<select aria-label="Excel change type" value={filter} onChange={event => {setFilter(event.target.value); setLimit(100);}}><option value="ALL">All changes</option>{["FORMULA_CHANGED", "VALUE_CHANGED", "CACHED_VALUE_CHANGED", "CELL_ADDED", "CELL_REMOVED"].map(kind => <option key={kind} value={kind}>{kind.toLowerCase().replaceAll("_", " ")} ({diff.changes.filter(change => change.kind === kind).length})</option>)}</select></label><label>Find cell or formula<input type="search" value={query} onChange={event => {setQuery(event.target.value); setLimit(100);}} /></label><button type="button" className="secondary-button" onClick={exportReview}>Download full cell review</button></div>
    {changes.length ? <ReviewTable label="Excel cell changes" rows={changes.slice(0,limit)} rowKey={change=>`${change.sheet}:${change.address}`} columns={[
      {id:"cell",label:"Sheet / cell",sortValue:change=>`${change.sheet} ${change.address}`,render:change=><>{change.sheet} · {change.address}</>},
      {id:"kind",label:"Change",sortValue:change=>change.kind,render:change=>change.kind.toLowerCase().replaceAll("_"," ")},
      {id:"before",label:"Before",render:change=>change.before?.formula?`=${change.before.formula}`:change.before?.value??"—"},
      {id:"after",label:"After",render:change=><>{change.after?.formula?`=${change.after.formula}`:change.after?.value??"—"}{change.kind==="CACHED_VALUE_CHANGED"?<small>Cached result: {change.before?.value} → {change.after?.value}</small>:null}</>}
    ]}/> : <p>No cell changes match this view.</p>}
    <footer><span>Showing {Math.min(limit, changes.length)} of {changes.length} matching changes</span>{changes.length > limit ? <button type="button" onClick={() => setLimit(value => value + 100)}>Show 100 more changes</button> : null}</footer></> : null}
  </div>;
}
