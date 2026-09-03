import {useState} from "react";
import {processDealPackage, promoteEvidenceVersion, sha256, type IntakeResult} from "./intake";
import type {DealWorkspaceState, PackageChangeControlState} from "./workspace-state";
import type {WorkspaceUpdate} from "./workspace-ui";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const multiple = (value: number) => `${value.toFixed(2)}x`;
const money = (cents: number) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1}).format(cents / 100);

function manifestDigest(result: IntakeResult) {
  const digest = result.files.find((file) => file.name === "manifest.json")?.sha256;
  if (!digest) throw new Error("Revision manifest identity is missing");
  return digest;
}

export function LocalChangeControl({result, state, update, onPromote}: {result: IntakeResult; state: DealWorkspaceState; update: WorkspaceUpdate; onPromote: (result: IntakeResult) => void}) {
  const [candidate, setCandidate] = useState<IntakeResult | null>(null);
  const [notice, setNotice] = useState("");
  const [actor, setActor] = useState("");
  const [rationale, setRationale] = useState("");
  const control = state.changeControl;
  const currentVersion = result.baselineApproval?.version ?? "V1";

  async function importRevision(files: File[]) {
    if (!files.length) return;
    try {
      const revision = await processDealPackage(files, result.analysis!.policyProfile);
      if (revision.packageState !== "READY" || !revision.analysis || !revision.deal) throw new Error(revision.errors[0] ?? "Revision package is incomplete");
      if (revision.deal.company !== result.deal!.company) throw new Error("Revision package belongs to a different company");
      const packageDigestSha256 = manifestDigest(revision);
      if (packageDigestSha256 === result.baselineApproval?.packageDigest) throw new Error("Revision package is byte-identical to the canonical evidence");
      const before = result.analysis!; const after = revision.analysis;
      const rawReceipt = JSON.stringify({from: result.baselineApproval?.packageDigest, to: packageDigestSha256, before: {revenue: before.ltmRevenueCents, margin: before.grossMargin, nrr: before.ordinaryNrr, moic: before.grossMoic, annualized: before.annualizedGrossReturn}, after: {revenue: after.ltmRevenueCents, margin: after.grossMargin, nrr: after.ordinaryNrr, moic: after.grossMoic, annualized: after.annualizedGrossReturn}});
      const deterministicReceiptSha256 = await sha256(new TextEncoder().encode(rawReceipt).buffer);
      const changedTests = after.tests.filter((test) => test.blocksAdvancement).map((test) => test.label);
      const next: PackageChangeControlState = {
        changeSetId: `local-${packageDigestSha256.slice(0, 12)}`,
        fromVersion: currentVersion,
        toVersion: `V${Number(currentVersion.slice(1) || "1") + 1}`,
        packageDigestSha256,
        importedAt: new Date().toISOString(),
        sourcePath: "Declared Version 2 package",
        sourceLocator: "operating_model.xlsx + customer_arr.csv + management_update.pdf + deal.json",
        changeId: `local-evidence-${packageDigestSha256.slice(0, 12)}`,
        changeTitle: "Revised evidence changes the screening record",
        beforeValue: percent(before.ordinaryNrr),
        afterValue: percent(after.ordinaryNrr),
        deterministicReceiptSha256,
        decisionConsequence: `${revision.posture}. ${changedTests.length} screening or diligence gates remain unresolved after the deterministic rerun.`,
        affectedAssumptionIds: ["local-growth", "local-exit-multiple", "local-financing"],
        affectedIssueIds: ["local-version-change"],
        affectedMemoSectionIds: ["screening", "economics", "diligence"],
        impacts: [
          {impactId: "retention", label: "Cohort retention proxy", before: percent(before.ordinaryNrr), after: percent(after.ordinaryNrr), consequence: "The revised customer delivery changes the fixed-cohort outcome and its screening concern.", rank: 1},
          {impactId: "revenue", label: "LTM revenue", before: money(before.ltmRevenueCents), after: money(after.ltmRevenueCents), consequence: "The deterministic revenue base is recalculated from the revised operating-model evidence.", rank: 2},
          {impactId: "gross-margin", label: "Gross margin", before: percent(before.grossMargin), after: percent(after.grossMargin), consequence: "Reported margin remains subject to cost-classification diligence.", rank: 3},
          {impactId: "gross-moic", label: "Gross multiple", before: multiple(before.grossMoic), after: multiple(after.grossMoic), consequence: "Returns are rerun from revised canonical inputs; assumptions remain separately unapproved.", rank: 4},
          {impactId: "annualized-return", label: "Annualized gross return", before: percent(before.annualizedGrossReturn), after: percent(after.annualizedGrossReturn), consequence: "The return screen updates mechanically and does not itself authorize advancement.", rank: 5},
        ],
        dispositionEvents: [],
      };
      const now = new Date().toISOString();
      const issue = {id: "local-version-change", title: "Disposition the Version 2 evidence delivery", description: "Confirm the revised mappings, exclusions, discrepancies, and decision consequences before changing the canonical evidence.", owner: result.deal!.analystOwner, priority: "CRITICAL" as const, status: "OPEN" as const, dueDate: null, decisionImpact: next.decisionConsequence, evidenceRefs: ["ordinary-nrr"], resolution: null, resolvedBy: null, createdAt: now, updatedAt: now};
      setCandidate(revision);
      update({changeControl: next, issues: [...state.issues.filter((item) => item.id !== issue.id), issue], memoSections: state.memoSections.map((section) => next.affectedMemoSectionIds.includes(section.sectionId) ? {...section, scenarioSnapshotId: `stale:${next.changeSetId}`} : section)});
      setNotice("Version 2 validated. Five decision impacts are ready for a named human disposition; Version 1 remains canonical.");
    } catch (error) { setCandidate(null); setNotice(error instanceof Error ? error.message : "Revision package could not be admitted"); }
  }

  function disposition(value: "ACCEPTED" | "REJECTED" | "DEFERRED") {
    if (!control || !actor.trim() || rationale.trim().length < 20) return;
    const event = {eventId: crypto.randomUUID(), changeId: control.changeId, disposition: value, actor: actor.trim(), rationale: rationale.trim(), recordedAt: new Date().toISOString()} as const;
    update({changeControl: {...control, dispositionEvents: [...control.dispositionEvents, event]}});
    if (value === "ACCEPTED") {
      if (!candidate) { setNotice("The validated Version 2 bytes are not available in this session. Re-import the package before acceptance."); return; }
      const promoted = promoteEvidenceVersion(result, candidate, actor, rationale, event.recordedAt);
      onPromote(promoted);
      setCandidate(null);
      setNotice(`${promoted.baselineApproval!.version} is now canonical. ${control.fromVersion} source bytes remain preserved in evidence history.`);
    } else setNotice(`${value === "REJECTED" ? "Rejected" : "Deferred"} by ${actor.trim()}. ${control.fromVersion} remains canonical and all revised evidence remains non-canonical.`);
    setRationale("");
  }

  const latest = control?.dispositionEvents.at(-1);
  return <section className="change-control local-change-control" aria-labelledby="local-change-control-heading">
    <header><div><p className="eyebrow">Evidence change control</p><h2 id="local-change-control-heading">Compare a revised delivery</h2><p>Validate Version 2 against the approved Version 1 evidence, then disposition the recalculated impact without letting the package approve itself.</p></div><label className="file-button">Upload Version 2<input data-testid="local-revision-input" type="file" multiple accept=".json,.csv,.pdf,.xlsx" onChange={(event) => void importRevision(Array.from(event.target.files ?? []))} /></label></header>
    {!control ? <div className="change-empty"><div><strong>{currentVersion}</strong><span>Canonical evidence · current</span></div><p>Use the included revised Northstar package to test source-to-decision propagation.</p><details><summary>Download five revision files</summary><a href="sample-package-v2-revision/manifest.json" download>Manifest</a> · <a href="sample-package-v2-revision/deal.json" download>Deal</a> · <a href="sample-package-v2-revision/operating_model.xlsx" download>Operating model</a> · <a href="sample-package-v2-revision/customer_arr.csv" download>Customer ARR</a> · <a href="sample-package-v2-revision/management_update.pdf" download>Management update</a></details></div> : <>
      <div className="version-strip"><div><span>Canonical</span><strong>{control.fromVersion}</strong><small>Preserved</small></div><div><span>Candidate</span><strong>{control.toVersion}</strong><small>{candidate ? "Validated in this session" : "Re-import to accept"}</small></div><div data-state="blocked"><span>Decision consequence</span><strong>{candidate?.posture ?? "Revision awaiting disposition"}</strong><small>{control.affectedMemoSectionIds.length} memo sections stale</small></div></div>
      <div className="change-impact-table"><div className="change-impact-head"><span>Priority</span><span>Changed measure</span><span>Before</span><span>After</span><span>Decision meaning</span></div>{control.impacts.map((impact) => <article key={impact.impactId}><span>{impact.rank}</span><strong>{impact.label}</strong><span>{impact.before}</span><span>{impact.after}</span><p>{impact.consequence}</p></article>)}</div>
      <section className="change-disposition"><div><span>Human disposition</span><strong>{latest?.disposition.toLowerCase() ?? "Pending"}</strong><small>{latest ? `${latest.actor} · ${latest.rationale}` : `${control.fromVersion} remains canonical until a named human accepts the change.`}</small></div><label><span>Reviewer</span><input value={actor} maxLength={120} onChange={(event) => setActor(event.target.value)} placeholder="Named human reviewer" /></label><label><span>Rationale</span><textarea value={rationale} maxLength={1200} onChange={(event) => setRationale(event.target.value)} placeholder="Why should Version 2 replace, not replace, or wait?" /></label><div><button type="button" disabled={!candidate || !actor.trim() || rationale.trim().length < 20} onClick={() => disposition("ACCEPTED")}>Accept and promote</button><button type="button" disabled={!actor.trim() || rationale.trim().length < 20} onClick={() => disposition("REJECTED")}>Reject change</button><button type="button" disabled={!actor.trim() || rationale.trim().length < 20} onClick={() => disposition("DEFERRED")}>Defer</button></div></section>
    </>}
    {notice ? <p className="change-notice" role="status">{notice}</p> : null}
  </section>;
}
