import "./product-intro.css";
import {useState} from "react";
import type {CaseData} from "./types";

export function exampleComparison(data?:CaseData|null){
 const engine=data?.peEngine;
 const revised=engine?.sensitivities.one_way.find(cell=>cell.axis==="full_cohort_nrr"&&Math.abs(Number(cell.assumption_value)-.98)<.000001);
 const retention=data?.summaryMetrics.find(m=>/complete.cohort.*NRR/i.test(m.label))?.value;
 if(!engine||!revised||!retention)return null;
 const pct=(n:string|number)=>`${(Number(n)*100).toFixed(1)}%`;
 return {before:pct(engine.selected.gross_xirr),after:pct(revised.gross_xirr),multiple:`${Number(revised.gross_moic).toFixed(2)}x`,retention,revisedRetention:pct(revised.assumption_value)};
}
export function ProductPreview({data,unavailable=false}: {data?:CaseData|null;unavailable?:boolean}){
 const [step,setStep]=useState(0);const comparison=exampleComparison(data);
 return <section className="product-preview" aria-label="Illustrative investment review walkthrough">
  <header><span className="preview-company-mark">A</span><div><strong>AtlasGrid Systems</strong><small>Illustrative case · original analysis</small></div><span className="preview-live-label">Investment review</span></header>
  <div className="preview-steps" aria-label="Explore the review workflow">{["Evidence","Economics","Committee"].map((label,i)=><button key={label} type="button" aria-pressed={step===i} onClick={()=>setStep(i)}><span>0{i+1}</span>{label}</button>)}</div>
  <div className="preview-body" key={step}>
   <p className="preview-kicker">{["A new source delivery","The investment consequence","A clear next committee action"][step]}</p>
   <h3>{["A small revision. A different investment case.","Does the price still work?","Reopen diligence before advancing."][step]}</h3>
   {comparison?<div className="preview-comparison"><div><span>{step===0?"Original retention":"Original annualized return"}</span><strong>{step===0?comparison.retention:comparison.before}</strong></div><span aria-hidden="true">→</span><div><span>{step===0?"Revised retention":"Revised annualized return"}</span><strong>{step===0?comparison.revisedRetention:comparison.after}</strong></div></div>:<p role="status" className="preview-loading">{unavailable||data?"Example unavailable. Your saved workspaces remain below.":"Loading the sourced example…"}</p>}
   <p className="preview-meaning">{["Late cancellations reduce complete-cohort retention. Inspect the changed customer records before accepting the revision.","The documented model rerun falls below the 22% return screen at selected terms. Review price and downside implications.","Carry the evidence, changed economics, and open questions into the working memo. Investment approval stays with people."][step]}</p>
   <div className="preview-source"><span aria-hidden="true">↳</span><span>{["Customer records · matched cohort","Retained transaction model · revised retention","Committee draft · reconciliation required"][step]}</span></div>
  </div><footer>Source revision <span>→</span> Calculated impact <span>→</span> Human review</footer>
 </section>;
}
export function ProductIntro({data,onExplore,onNew,unavailable=false}:{data?:CaseData|null;unavailable?:boolean;onExplore:()=>void;onNew:()=>void}){
 return <section className="product-intro" aria-labelledby="product-intro-title"><div className="intro-copy"><p className="intro-overline"><span/>The investment case, connected.</p><h2 id="product-intro-title">When the evidence changes,<br/><em>know what changes next.</em></h2><p className="intro-description">From the source to the economics to the committee table. A focused workspace for reviewing what matters in a private-market investment.</p><div className="intro-actions"><button type="button" className="primary-button" onClick={onExplore}>Explore an investment case <span aria-hidden="true">↗</span></button><button type="button" className="secondary-button" onClick={onNew}>Add a deal</button></div><p className="intro-assurance">Works with Excel and your AI assistant.<br/>The evidence and decisions stay in the Desk.</p></div><ProductPreview data={data} unavailable={unavailable}/></section>;
}
