import type {CaseData, Metric} from "./types";
import type {DealWorkspaceState} from "./workspace-state";
import {selectReviewBasis} from "./review-basis";
import {ReviewTable} from "./review-table";

export function InvestmentBrief({caseData,state,interpret,onReview,onModel,onCommittee,onEvidence}: {
  caseData:CaseData;state:DealWorkspaceState;interpret:(text:string)=>string;
  onReview:()=>void;onModel:()=>void;onCommittee:()=>void;onEvidence:(metric:Metric)=>void;
}) {
  const basis=selectReviewBasis(caseData,state);
  const open=state.issues.filter(issue=>issue.status!=="RESOLVED");
  const change=basis.activeRevision?state.changeControl:null;
  const headline=basis.activeRevision ? "Review the revised investment case" : basis.posture==="HOLD" ? "Hold pending the investment conditions" : "Reprice before advancing";
  return <section className="investment-workpaper" aria-labelledby="brief-heading">
    <header className="brief-position"><div><p className="eyebrow">Current view · {basis.sourceVersion} · {basis.scenarioLabel}</p><h2 id="brief-heading">{headline}</h2><p className="brief-rationale">{interpret(change?.decisionConsequence??caseData.decision.rationale)}</p></div><button type="button" className="primary-button" onClick={change?onReview:onCommittee}>{change?"Review evidence changes":"Prepare committee update"}</button></header>
    <div className="brief-economics" aria-label="Current analysis basis"><div><span>Annualized gross return</span><strong>{basis.results?`${(basis.results.grossReturn*100).toFixed(1)}%`:"Unavailable"}</strong></div><div><span>Gross multiple</span><strong>{basis.results?`${basis.results.grossMultiple.toFixed(2)}x`:"Unavailable"}</strong></div><div><span>Evidence review</span><strong>{basis.activeRevision?basis.disposition.toLowerCase():"Baseline"}</strong></div><button type="button" className="text-button" onClick={onModel}>Compare scenarios →</button></div>
    {basis.reconciliationBlockedReason?<p className="basis-notice" role="status">{basis.reconciliationBlockedReason}</p>:null}
    <div className="brief-argument"><section><h3>Why it could work</h3><p>{interpret(caseData.thesis.statement)}</p></section><section><h3>The opposing case</h3><p>{interpret(caseData.thesis.counterthesis)}</p></section></div>
    {change?<section className="brief-evidence"><div className="section-heading"><h3>Changes to review</h3><button type="button" className="text-button" onClick={onReview}>Open review →</button></div><ReviewTable label="Decision-changing evidence" rows={change.impacts} rowKey={r=>r.impactId} columns={[{id:"finding",label:"Finding",render:r=>r.label},{id:"before",label:change.fromVersion,numeric:true,render:r=>r.before},{id:"after",label:change.toVersion,numeric:true,render:r=>r.after},{id:"meaning",label:"Investment consequence",render:r=>r.consequence}]}/></section>:<section className="brief-evidence"><h3>Evidence that matters</h3><ReviewTable label="Investment drivers" rows={caseData.summaryMetrics.filter(metric=>metric.classification!=="SCENARIO").slice(0,3)} rowKey={r=>r.metric_id} columns={[{id:"finding",label:"Finding",render:r=><button type="button" className="record-link" onClick={()=>onEvidence(r)}>{r.label}</button>},{id:"value",label:"Evidence value",numeric:true,render:r=>r.value},{id:"meaning",label:"Basis",render:r=>r.detail}]}/></section>}
    <div className="brief-argument brief-conditions"><section><h3>What must be true</h3><ul>{caseData.decision.conditions.slice(0,3).map(condition=><li key={condition}>{interpret(condition)}</li>)}</ul><details><summary>All decision conditions</summary><ul>{caseData.decision.conditions.map(condition=><li key={condition}>{interpret(condition)}</li>)}</ul></details></section><section><h3>Next diligence action</h3><strong>{open[0]?.title??"Complete named committee review"}</strong><p>{open[0]?.decisionImpact??"The analytical screen is not an investment authorization."}</p><button type="button" className="text-button" onClick={onReview}>{open.length} open items · Review work →</button></section></div>
    <footer className="workpaper-footnote">{basis.sourceVersion} · {basis.scenarioLabel} · Investment committee decision pending</footer>
  </section>;
}
