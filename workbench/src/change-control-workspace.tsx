import {ReviewTable} from "./review-table";
import "./governance-review.css";
import {useState} from "react";
import {sha256} from "./intake";
import type {CaseData} from "./types";
import type {DealWorkspaceState, PackageChangeControlState} from "./workspace-state";
import type {WorkspaceUpdate} from "./workspace-ui";

type RevisionPackage = {
  schema_version: "underwriting.change-package/v1";
  case_id: "atlasgrid";
  from_version: string;
  to_version: string;
  base_retention_analysis_receipt_sha256: string;
  base_customer_month_sha256: string;
  change_id: string;
  source_path: string;
  source_locator: string;
  opening_arr_cents: number;
  prior_closing_arr_cents: number;
  revised_closing_arr_cents: number;
  reason: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRevisionPackage(raw: string, caseData: CaseData): RevisionPackage {
  const candidate: unknown = JSON.parse(raw);
  const retentionAnalysis = caseData.analyses.find((analysis) => analysis.analysis_id === "AG-02");
  const customerMonth = caseData.artifacts.find((artifact) => artifact.artifact_id === "customer-month");
  if (!record(candidate) || candidate.schema_version !== "underwriting.change-package/v1" || candidate.case_id !== "atlasgrid" || candidate.base_retention_analysis_receipt_sha256 !== retentionAnalysis?.receipt_sha256 || candidate.base_customer_month_sha256 !== customerMonth?.sha256) throw new Error("Revision package does not match the approved AtlasGrid V1 retention evidence");
  for (const field of ["from_version", "to_version", "change_id", "source_path", "source_locator", "reason"] as const) if (typeof candidate[field] !== "string" || !candidate[field] || candidate[field].length > 500) throw new Error(`Revision package field ${field} is invalid`);
  for (const field of ["opening_arr_cents", "prior_closing_arr_cents", "revised_closing_arr_cents"] as const) if (!Number.isSafeInteger(candidate[field]) || Number(candidate[field]) <= 0) throw new Error(`Revision package field ${field} is invalid`);
  if (candidate.source_path !== "data/customer_month.csv" || candidate.change_id !== "ag-retention-revision-v2") throw new Error("Revision package contains an unsupported change surface");
  return candidate as unknown as RevisionPackage;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const multiple = (value: string) => `${Number(value).toFixed(2)}x`;
const money = (cents: number) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1}).format(cents / 100);

export function ChangeControlWorkspace({caseData, state, update}: {caseData: CaseData; state: DealWorkspaceState; update: WorkspaceUpdate}) {
  const [notice, setNotice] = useState("");
  const [actor, setActor] = useState("");
  const [rationale, setRationale] = useState("");
  if (!caseData.peEngine) return null;
  const control = state.changeControl;
  const importRevision = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error("Revision package exceeds the 100 KB demonstration limit");
      const raw = await file.text();
      const revision = parseRevisionPackage(raw, caseData);
      const beforeNrr = revision.prior_closing_arr_cents / revision.opening_arr_cents;
      const afterNrr = revision.revised_closing_arr_cents / revision.opening_arr_cents;
      if (Math.abs(beforeNrr - .9987) > .000001 || Math.abs(afterNrr - .98) > .000001) throw new Error("Revision package does not reconcile to the precommitted retention bridge");
      const rerun = caseData.peEngine!.sensitivities.one_way.find((cell) => cell.axis === "full_cohort_nrr" && Math.abs(Number(cell.assumption_value) - afterNrr) < .000001);
      if (!rerun) throw new Error("No retained full-model rerun matches the revised retention result");
      const packageDigestSha256 = await sha256(new TextEncoder().encode(raw).buffer);
      const next: PackageChangeControlState = {
        changeSetId: `atlasgrid-v1-v2-${packageDigestSha256.slice(0, 12)}`,
        fromVersion: revision.from_version,
        toVersion: revision.to_version,
        packageDigestSha256,
        importedAt: new Date().toISOString(),
        sourcePath: revision.source_path,
        sourceLocator: revision.source_locator,
        changeId: revision.change_id,
        changeTitle: "Late cancellations reduce complete-cohort retention",
        beforeValue: percent(beforeNrr),
        afterValue: percent(afterNrr),
        deterministicReceiptSha256: rerun.result_receipt_sha256,
        decisionConsequence: "REOPEN DILIGENCE — selected terms fall below the 22.0% annualized-return screen.",
        affectedAssumptionIds: ["entry-value", "pricing-credit"],
        affectedIssueIds: ["change-ag-retention-v2"],
        affectedMemoSectionIds: ["recommendation", "economics", "downside"],
        impacts: [
          {impactId: "nrr", label: "Complete-cohort NRR", before: percent(beforeNrr), after: percent(afterNrr), consequence: "The revised cancellation schedule lowers the measured cohort outcome.", rank: 1},
          {impactId: "irr", label: "Selected-terms annualized return", before: percent(Number(caseData.peEngine!.selected.gross_xirr)), after: percent(Number(rerun.gross_xirr)), consequence: "The retained full-model rerun now misses the declared 22.0% screen.", rank: 2},
          {impactId: "moic", label: "Selected-terms gross multiple", before: multiple(caseData.peEngine!.selected.gross_moic), after: multiple(rerun.gross_moic), consequence: "The return cushion narrows even though the multiple remains above 2.0x.", rank: 3},
          {impactId: "exit-debt", label: "Exit debt", before: money(caseData.peEngine!.selected.debt_schedule.ending_debt_cents), after: money(rerun.ending_debt_cents), consequence: "Lower retention leaves materially more debt outstanding at exit.", rank: 4},
        ],
        dispositionEvents: control?.changeSetId === `atlasgrid-v1-v2-${packageDigestSha256.slice(0, 12)}` ? control.dispositionEvents : [],
      };
      const now = new Date().toISOString();
      const revisedIssue = {id: "change-ag-retention-v2", title: "Reconcile the V2 cancellation schedule", description: revision.reason, owner: "Commercial diligence lead", priority: "CRITICAL" as const, status: "OPEN" as const, dueDate: null, decisionImpact: next.decisionConsequence, evidenceRefs: ["ag-nrr-metric"], resolution: null, resolvedBy: null, createdAt: now, updatedAt: now};
      update({
        changeControl: next,
        issues: [...state.issues.filter((issue) => issue.id !== revisedIssue.id), revisedIssue],
        memoSections: state.memoSections.map((section) => next.affectedMemoSectionIds.includes(section.sectionId) ? {...section, scenarioSnapshotId: `stale:${next.changeSetId}`} : section),
      });
      setNotice("Version 2 validated. Four deterministic impacts are ready for human disposition; affected memo sections are stale and diligence has reopened.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Revision package could not be admitted"); }
  };
  const disposition = (value: "ACCEPTED" | "REJECTED" | "DEFERRED") => {
    if (!control || !actor.trim() || rationale.trim().length < 12) return;
    update({changeControl: {...control, dispositionEvents: [...control.dispositionEvents, {eventId: crypto.randomUUID(), changeId: control.changeId, disposition: value, actor: actor.trim(), rationale: rationale.trim(), recordedAt: new Date().toISOString()}]}});
    setRationale("");
    setNotice(`${value === "ACCEPTED" ? "Accepted" : value === "REJECTED" ? "Rejected" : "Deferred"} by ${actor.trim()}. The event was recorded without silently resolving diligence or rewriting the memo.`);
  };
  const latest = control?.dispositionEvents.at(-1);
  return <section className="change-control" aria-labelledby="change-control-heading">
    <header><div><p className="eyebrow">Review since last committee</p><h2 id="change-control-heading">What changed?</h2><p>Compare a revised data-room delivery with the approved analysis version before conclusions move.</p></div><label className="file-button">Review new evidence<input type="file" accept="application/json,.json" onChange={(event) => importRevision(event.target.files?.[0])} /></label></header>
    {!control ? <div className="change-empty"><div><strong>Version 1</strong><span>Approved analysis · current</span></div><p>Explore a documented retention revision. For your own files, use a supported company package.</p><button type="button" onClick={async()=>{try{const response=await fetch("change-packages/atlasgrid-v2-retention-revision.json");if(!response.ok)throw new Error("Example revision unavailable");await importRevision(new File([await response.text()],"atlasgrid-v2-retention-revision.json",{type:"application/json"}));}catch(error){setNotice(error instanceof Error?error.message:"Could not load example revision");}}}>Load example revision</button><a download href="change-packages/atlasgrid-v2-retention-revision.json">Download example revision</a></div> : <>
      <div className="version-strip"><div><span>Before</span><strong>{control.fromVersion}</strong><small>Preserved</small></div><div><span>Revised package</span><strong>{control.toVersion}</strong><small>{formatDate(control.importedAt)}</small></div><div data-state="blocked"><span>Decision consequence</span><strong>Reopen diligence</strong><small>Selected terms miss the return screen</small></div></div>
      <section className="governance-change-evidence" aria-label="Evidence and financial consequence"><h3>{control.changeTitle}</h3><p>{control.decisionConsequence}</p><ReviewTable label="Evidence change and deterministic financial consequences" rows={[...control.impacts].sort((a,b) => a.rank-b.rank)} rowKey={impact => impact.impactId} columns={[
        {id: "measure", label: "Measure", render: impact => <strong>{impact.label}</strong>},
        {id: "before", label: "Before", numeric: true, render: impact => impact.before},
        {id: "after", label: "After", numeric: true, render: impact => <strong>{impact.after}</strong>},
        {id: "meaning", label: "Investment consequence", render: impact => impact.consequence},
      ]} /><details className="governance-source"><summary>Inspect changed source and calculation basis</summary><dl><dt>Source</dt><dd>{control.sourcePath}</dd><dt>Location</dt><dd>{control.sourceLocator}</dd><dt>Calculation</dt><dd>Matched retained full debt-and-return model rerun. A human disposition does not rerun or rewrite transaction mechanics.</dd></dl><a href={`#/v3/${caseData.caseId}/documents`}>Open source workspace</a></details></section>
      <section className="governance-downstream" aria-label="Downstream review required"><div><h3>Work that must be reconciled</h3><p>Recording a disposition does not clear these items. Their current workspace records determine what remains open.</p></div><div className="governance-downstream-grid">
        <section><h4>Assumptions requiring review</h4><ul>{control.affectedAssumptionIds.map(id => {
          const review = state.assumptionReviews[id];
          const stale = !review || new Date(review.reviewedAt).getTime() < new Date(control.importedAt).getTime();
          return <li key={id}><strong>{id === "entry-value" ? "Entry enterprise value" : id === "pricing-credit" ? "Pricing credit" : id.replaceAll("-", " ")}</strong><span>{stale ? "Reapproval required" : `${review.disposition.toLowerCase()} by ${review.actor}`}</span></li>;
        })}</ul><a href={`#/v3/${caseData.caseId}/diligence?tab=assumptions`}>Review assumptions</a></section>
        <section><h4>Diligence reopened</h4><ul>{control.affectedIssueIds.map(id => {
          const issue = state.issues.find(item => item.id === id);
          return <li key={id}><strong>{issue?.title ?? "Diligence record unavailable"}</strong><span>{issue ? `${issue.status.toLowerCase().replaceAll("_", " ")} · ${issue.owner}` : "Locate or restore the affected issue"}</span></li>;
        })}</ul><a href={`#/v3/${caseData.caseId}/diligence?tab=issues&issue=${encodeURIComponent(control.affectedIssueIds[0]??"")}`}>Open diligence work</a></section>
        <section><h4>{state.memoSections.some(section => control.affectedMemoSectionIds.includes(section.sectionId) && section.scenarioSnapshotId?.startsWith("stale:")) ? "Memo sections stale" : "Affected memo sections"}</h4><ul>{control.affectedMemoSectionIds.map(id => {
          const section = state.memoSections.find(item => item.sectionId === id);
          return <li key={id}><strong>{section?.title ?? id}</strong><span>{!section ? "Section unavailable" : section.scenarioSnapshotId?.startsWith("stale:") ? "Reconciliation required" : "Review current scenario alignment in IC memo"}</span></li>;
        })}</ul><a href={`#/v3/${caseData.caseId}/memo`}>Reconcile IC memo</a></section>
      </div></section>
      <section className="change-disposition"><div><span>Review decision</span><strong>{latest?.disposition.toLowerCase() ?? "Pending"}</strong>{latest ? <small>{latest.actor} · {formatDate(latest.recordedAt)} · {latest.rationale}</small> : <small>No model or calculation can approve this change.</small>}</div><label><span>Reviewer</span><input value={actor} maxLength={120} onChange={(event) => setActor(event.target.value)} placeholder="Named human reviewer" /></label><label><span>Rationale</span><textarea value={rationale} maxLength={1200} onChange={(event) => setRationale(event.target.value)} placeholder="Why should the revised evidence be accepted, rejected, or deferred?" /></label><div><button type="button" disabled={!actor.trim() || rationale.trim().length < 12} onClick={() => disposition("ACCEPTED")}>Accept change</button><button type="button" disabled={!actor.trim() || rationale.trim().length < 12} onClick={() => disposition("REJECTED")}>Reject change</button><button type="button" disabled={!actor.trim() || rationale.trim().length < 12} onClick={() => disposition("DEFERRED")}>Defer</button></div></section>
      {control.dispositionEvents.length ? <details className="governance-history"><summary>Review history · {control.dispositionEvents.length}</summary><ol>{[...control.dispositionEvents].reverse().map(event => <li key={event.eventId}><strong>{event.disposition.toLowerCase()} · {event.actor}</strong><span>{formatDate(event.recordedAt)}</span><p>{event.rationale}</p></li>)}</ol></details> : null}
      <details className="technical-record"><summary>Version and calculation receipts</summary><dl><div><dt>Package</dt><dd><code>{control.packageDigestSha256}</code></dd></div><div><dt>Deterministic rerun</dt><dd><code>{control.deterministicReceiptSha256}</code></dd></div><div><dt>Version history</dt><dd>{control.fromVersion} → {control.toVersion}; {control.dispositionEvents.length} disposition {control.dispositionEvents.length === 1 ? "event" : "events"}</dd></div></dl></details>
    </>}
    {notice ? <p role="status" className="change-notice">{notice}</p> : null}
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(value));
}
