import {ReviewTable} from "./review-table";
import {compareSupportedRevision} from "./supported-revision";
import {useEffect, useRef, useState} from "react";
import {processDealPackage, promoteEvidenceVersion, type IntakeResult} from "./intake";
import type {DealWorkspaceState, PackageChangeControlState} from "./workspace-state";
import type {WorkspaceUpdate} from "./workspace-ui";

export function LocalChangeControl({result, state, update, onPromote, candidateRevision, onCandidateConsumed, onCandidateStaged, onCandidateDiscarded}: {candidateRevision?: IntakeResult | null; onCandidateConsumed?: () => void; onCandidateStaged?: (candidate: IntakeResult) => void; onCandidateDiscarded?: () => void; result: IntakeResult; state: DealWorkspaceState; update: WorkspaceUpdate; onPromote: (result: IntakeResult, acceptedControl: PackageChangeControlState) => void | Promise<void>}) {
  const staged = useRef<IntakeResult | null>(null);
  const [candidate, setCandidate] = useState<IntakeResult | null>(null);
  const [selectedImpact, setSelectedImpact] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [actor, setActor] = useState("");
  const [rationale, setRationale] = useState("");
  const control = state.changeControl;
  const currentVersion = result.baselineApproval?.version ?? "V1";

  const canLoadExample = result.deal?.company === "Northstar Metrics" && result.baselineApproval?.packageDigest === "138bf7fa507174de136ad4c47035483918747afdfb7ae47102b9110674d7e78e" && ["operating_model.xlsx", "customer_arr.csv", "management_update.pdf", "deal.json"].every(name=>result.files.some(file=>file.name===name && file.sha256));
  async function loadExample() {
    if (!canLoadExample || saving) return;
    setSaving(true);
    try {
      const files = await Promise.all(["manifest.json", "deal.json", "operating_model.xlsx", "customer_arr.csv", "management_update.pdf"].map(async name=>{
        const response = await fetch(new URL(`sample-package-v2-revision/${name}`, window.location.href), {signal:AbortSignal.timeout(10000)});
        if(!response.ok) throw new Error("The included revision could not be loaded. Upload its files instead.");
        const bytes = await response.arrayBuffer(); if(bytes.byteLength > 5*1024*1024) throw new Error("Example source exceeds the supported size limit.");
        return new File([bytes],name,{type:response.headers.get("content-type")??"application/octet-stream"});
      }));
      await importRevision(files);
    } catch(error) {setNotice(error instanceof Error ? error.message : "Example revision unavailable.");}
    finally {setSaving(false);}
  }

  async function importRevision(files: File[]) {
    if (!files.length) return;
    try {
      const revision = await processDealPackage(files, result.analysis!.policyProfile);
      await stage(revision);
    } catch (error) { setCandidate(null); setNotice(error instanceof Error ? error.message : "Revision package could not be admitted"); }
  }

  async function stage(revision: IntakeResult) {
    // Mark manual imports before notifying the parent. Its prop echo must not
    // start a second validation against a captured, older disposition state.
    staged.current = revision;
    try {
      const next = await compareSupportedRevision(result, revision);
      if (control?.packageDigestSha256 === next.packageDigestSha256 && control.fromVersion === currentVersion && control.dispositionEvents.at(-1)?.disposition !== "ACCEPTED") {setCandidate(revision); onCandidateStaged?.(revision); if(control.dispositionEvents.at(-1)?.disposition === "REJECTED") {update({issues:state.issues.map(issue=>issue.id === "local-version-change" ? {...issue,status:"OPEN",resolution:null,resolvedBy:null,updatedAt:new Date().toISOString()} : issue)});setNotice("Previously rejected; available for reconsideration. The prior rejection remains recorded until a new human disposition.");} return;}
      const now = new Date().toISOString();
      const issue = {id: "local-version-change", title: `Disposition the ${next.toVersion} evidence delivery`, description: "Confirm the revised mappings, exclusions, discrepancies, and decision consequences before changing the canonical evidence.", owner: result.deal!.analystOwner, priority: "CRITICAL" as const, status: "OPEN" as const, dueDate: null, decisionImpact: next.decisionConsequence, evidenceRefs: [], resolution: null, resolvedBy: null, createdAt: now, updatedAt: now};
      setCandidate(revision); onCandidateStaged?.(revision); setSelectedImpact(next.impacts[0]?.impactId ?? null);
      update({changeControl: next, issues: [...state.issues.filter((item) => item.id !== issue.id), issue]});
      setNotice(`${next.toVersion} validated. ${next.impacts.length} calculated measures changed. ${currentVersion} remains canonical until human acceptance.`);
    } catch (error) { if(staged.current === revision) staged.current = null; setCandidate(null); setNotice(error instanceof Error ? error.message : "Revision package could not be admitted"); }
  }

  useEffect(() => {if(candidateRevision && staged.current !== candidateRevision) {staged.current = candidateRevision; void stage(candidateRevision).finally(()=>onCandidateConsumed?.());}}, [candidateRevision]);

  async function disposition(value: "ACCEPTED" | "REJECTED" | "DEFERRED") {
    if (saving || !control || control.dispositionEvents.at(-1)?.disposition === "ACCEPTED" || actor.trim().length < 2 || rationale.trim().length < 20) return;
    const event = {eventId: crypto.randomUUID(), changeId: control.changeId, disposition: value, actor: actor.trim(), rationale: rationale.trim(), recordedAt: new Date().toISOString()} as const;
    if (value === "ACCEPTED") {
      if (!candidate || candidate.files.find(file=>file.name === "manifest.json")?.sha256 !== control.packageDigestSha256 || result.baselineApproval?.version !== control.fromVersion) {setNotice("The validated candidate bytes are missing or stale. Re-import the delivery before acceptance."); return;}
      try {
        const promoted = promoteEvidenceVersion(result, candidate, actor, rationale, event.recordedAt);
        setSaving(true);
        await onPromote(promoted, {...control, dispositionEvents: [...control.dispositionEvents, event]});
        onCandidateDiscarded?.();
        setCandidate(null);
        setNotice(`${promoted.baselineApproval!.version} is now canonical. ${control.fromVersion} source bytes remain preserved in evidence history.`);
      } catch(error) {setNotice(error instanceof Error ? error.message : "Promotion failed; no acceptance recorded."); return;} finally {setSaving(false);}
    } else {
      update({changeControl: {...control, dispositionEvents: [...control.dispositionEvents, event]}});
      if(value === "REJECTED") {setCandidate(null); onCandidateDiscarded?.(); update({issues: state.issues.map(issue=>issue.id === "local-version-change" ? {...issue,status:"RESOLVED",resolution:rationale.trim(),resolvedBy:actor.trim(),updatedAt:event.recordedAt} : issue)});}
      setNotice(`${value === "REJECTED" ? "Rejected" : "Deferred"} by ${actor.trim()}. ${control.fromVersion} remains canonical.`);
    }
    setRationale("");
  }

  const latest = control?.dispositionEvents.at(-1);
  const inspected = control?.impacts.find(impact=>impact.impactId===selectedImpact) ?? control?.impacts[0];
  return <section className="change-control local-change-control" aria-labelledby="local-change-control-heading">
    <header><div><p className="eyebrow">Evidence review</p><h2 id="local-change-control-heading">Compare a revised delivery</h2><p>Compare the new delivery with the approved source. Review the changed numbers before accepting it.</p></div>{canLoadExample ? <button type="button" className="primary-button" disabled={saving} onClick={()=>void loadExample()}>Load example revision</button> : null}<label className="file-button">Upload revised package<input data-testid="local-revision-input" type="file" multiple accept=".json,.csv,.pdf,.xlsx" onChange={(event) => {const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void importRevision(files);}} /></label></header>
    {!control ? <div className="change-empty"><div><strong>{currentVersion}</strong><span>Approved evidence · current</span></div><p>Upload a supported package for this company. Its manifest, sources and deterministic results are validated before comparison.</p><details><summary>Download five revision files</summary><a href="sample-package-v2-revision/manifest.json" download>Manifest</a> · <a href="sample-package-v2-revision/deal.json" download>Deal</a> · <a href="sample-package-v2-revision/operating_model.xlsx" download>Operating model</a> · <a href="sample-package-v2-revision/customer_arr.csv" download>Customer ARR</a> · <a href="sample-package-v2-revision/management_update.pdf" download>Management update</a></details></div> : <>
      <div className="version-strip"><div><span>{latest?.disposition === "ACCEPTED" ? "Prior approved source" : "Approved source"}</span><strong>{control.fromVersion}</strong><small>Preserved</small></div><div><span>{latest?.disposition === "ACCEPTED" ? "Accepted source" : "Candidate"}</span><strong>{control.toVersion}</strong><small>{latest?.disposition === "ACCEPTED" ? "Human acceptance recorded" : candidate ? latest?.disposition === "REJECTED" ? "Previously rejected; available for reconsideration" : "Validated in this session" : "Re-import to accept"}</small></div><div data-state="blocked"><span>Decision consequence</span><strong>{candidate?.posture ?? (latest?.disposition === "ACCEPTED" ? result.posture : "Revision awaiting disposition")}</strong><small>{control.affectedMemoSectionIds.length} memo section dependencies</small></div></div>
      <div className="review-workbench-grid"><ReviewTable label="Revised delivery impacts" rows={control.impacts} rowKey={impact=>impact.impactId} selectedId={inspected?.impactId} emptyMessage="No calculated financial measures changed. The source revision still requires human disposition." columns={[
        {id:"measure",label:"Changed measure",sortValue:impact=>impact.label,render:impact=><button className="record-link" type="button" onClick={()=>setSelectedImpact(impact.impactId)}>{impact.label}</button>},
        {id:"before",label:"Approved source",numeric:true,render:impact=>impact.before},
        {id:"after",label:"Revised source",numeric:true,render:impact=>impact.after}
      ]}/><aside className="review-inspector" aria-label="Selected revision impact"><p className="eyebrow">Source consequence</p><h3>{inspected?.label ?? "No numerical change"}</h3><p>{inspected?.consequence ?? control.changeTitle}</p><dl><dt>Changed sources</dt><dd>{control.sourceLocator}</dd><dt>Screening implication</dt><dd>{control.decisionConsequence}</dd><dt>Assumptions requiring review</dt><dd>{control.affectedAssumptionIds.map(id=>({"local-growth":"Revenue growth","local-exit-multiple":"Exit multiple","local-financing":"Financing terms"}[id] ?? "Declared assumption")).join(", ") || "No declared deal assumptions changed"}</dd><dt>Memo dependencies</dt><dd>{control.affectedMemoSectionIds.map(id=>({screening:"Screening view",economics:"Economics",diligence:"Required diligence"}[id] ?? "Memo section")).join(", ") || "No calculated memo dependencies changed"}</dd></dl></aside></div>
      <section className="change-disposition"><div><span>Review decision</span><strong>{latest?.disposition.toLowerCase() ?? "Pending"}</strong><small>{latest ? `${latest.actor} · ${latest.rationale}` : `${control.fromVersion} remains canonical until a named human accepts the change.`}</small></div><label><span>Reviewer</span><input value={actor} maxLength={120} onChange={(event) => setActor(event.target.value)} placeholder="Named human reviewer" /></label><label><span>Rationale</span><textarea value={rationale} maxLength={1200} onChange={(event) => setRationale(event.target.value)} placeholder="Explain why this source revision should be accepted, rejected or deferred." /></label><div><button type="button" disabled={saving || !candidate || actor.trim().length < 2 || rationale.trim().length < 20} onClick={() => disposition("ACCEPTED")}>Accept and promote</button><button type="button" disabled={saving || latest?.disposition === "ACCEPTED" || actor.trim().length < 2 || rationale.trim().length < 20} onClick={() => disposition("REJECTED")}>Reject change</button><button type="button" disabled={saving || latest?.disposition === "ACCEPTED" || actor.trim().length < 2 || rationale.trim().length < 20} onClick={() => disposition("DEFERRED")}>Defer</button></div></section>
    </>}
    {notice ? <p className="change-notice" role="status">{notice}</p> : null}
  </section>;
}
