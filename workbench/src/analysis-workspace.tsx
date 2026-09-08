import {useWorkspaceLocation, selectWorkspaceObject} from "./workspace-navigation";
import {ReviewTable} from "./review-table";
import {EvidenceExcerpt, sourceTitle} from "./documents-workspace";
import {useMemo, useState, type CSSProperties} from "react";
import type {CaseData, Metric} from "./types";
import type {DealWorkspaceState} from "./workspace-state";
import type {WorkspaceUpdate} from "./workspace-ui";

function periodLabel(value: string | undefined) {
  if (!value) return "Retained case period";
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return `As of ${new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(value))}`;
  return value;
}
const evidenceKind: Record<string, string> = {SCENARIO: "Scenario result", ACCOUNTING_IDENTITY: "Calculated", DESCRIPTIVE: "Measured", PREDICTIVE_ASSOCIATION: "Estimate", CAUSAL_SYNTHETIC_ONLY: "Synthetic experiment", HUMAN_JUDGMENT: "Analyst judgment", NOT_IDENTIFIED: "Unresolved"};
export function AnalysisWorkspace({caseData, state, update, openMetric, relevance, interpret, onModelReview}: {caseData: CaseData; state: DealWorkspaceState; update: WorkspaceUpdate; openMetric: (metric: Metric, trigger: HTMLElement) => void; relevance: (metric: Metric) => string; onFinancials: () => void; onDiligence: () => void; onMemo: () => void; interpret: (text: string) => string; onModelReview: (metricId: string) => void}) {
  const [layout, setLayout] = useState(() => {
    try {const value = JSON.parse(localStorage.getItem("desk-evidence-layout/v1") ?? "null"); if (value && Number.isInteger(value.width) && value.width >= 260 && value.width <= 420 && typeof value.compact === "boolean") return value as {width:number; compact:boolean};} catch { /* Layout preferences must never block deal access. */ }
    return {width:300, compact:false};
  });
  function changeLayout(patch: Partial<typeof layout>) {const next = {...layout,...patch}; setLayout(next); try {localStorage.setItem("desk-evidence-layout/v1",JSON.stringify(next));} catch { /* Session preference remains usable. */ }}
  const location=useWorkspaceLocation();
  const selectedId=location.get("metric")??undefined;
  const setSelectedId=(metric:string|undefined)=>selectWorkspaceObject({metric:metric??null});
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [owner, setOwner] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = caseData.summaryMetrics.find((metric) => metric.metric_id === selectedId) ;
  const registry = caseData.metricRegistry.find((metric) => metric.metric_id === selected?.metric_id);
  const sources = caseData.sourceLocators.filter((source) => registry?.source_locator_ids.includes(source.locator_id));
  const openIssues = state.issues.filter((issue) => issue.status !== "RESOLVED");
  const rows = useMemo(() => caseData.summaryMetrics.filter((metric) => `${metric.label} ${metric.detail} ${relevance(metric)}`.toLowerCase().includes(query.toLowerCase())), [caseData, query, relevance]);
  const linkedIssues = openIssues.filter((issue) => selected && issue.evidenceRefs.includes(selected.metric_id));
  const latest = state.changeControl?.dispositionEvents.at(-1)?.disposition;
  const changed = state.changeControl && latest !== "REJECTED" ? state.changeControl : null;
  function addQuestion() {
    if (!selected || !question.trim() || !owner.trim()) return;
    const now = new Date().toISOString();
    update((current) => ({issues: [...current.issues, {id: `analyst-${crypto.randomUUID()}`, title: question.trim(), description: `Review ${selected.label} (${selected.value}) against the retained evidence.`, owner: owner.trim(), priority: "HIGH", status: "OPEN", dueDate: null, decisionImpact: relevance(selected), evidenceRefs: [selected.metric_id], resolution: null, resolvedBy: null, createdAt: now, updatedAt: now}]}));
    setNotice(`Assigned to ${owner.trim()}. The question is now in Diligence.`); setAdding(false); setQuestion("");
  }
  return <section className="analysis-workspace" data-density={layout.compact ? "compact" : "comfortable"} style={{"--inspector-width": `${layout.width}px`} as CSSProperties} aria-labelledby="investment-case-title">
    <header className="evidence-heading"><p className="eyebrow">Evidence workpaper</p><h2 id="investment-case-title">Measures and their support</h2><p>{changed?`Historical ${changed.fromVersion} records. Review ${changed.toVersion} effects in Review; these source measures have not been relabeled as revised results.`:"Select a finding to inspect the source and its definition."}</p></header>
    <div className="analysis-toolbar"><div><h3>Evidence review</h3><span>{rows.length} measures · select a row to inspect its support</span></div><label><span className="sr-only">Filter evidence review</span><input type="search" placeholder="Find a measure or question…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><details className="view-options"><summary>View options</summary><div><label>Evidence panel width<input aria-label="Evidence panel width" type="range" min="260" max="420" step="20" value={layout.width} onChange={event => changeLayout({width:Number(event.target.value)})} /></label><label><input type="checkbox" checked={layout.compact} onChange={event => changeLayout({compact:event.target.checked})} />Compact evidence rows</label><button type="button" onClick={() => changeLayout({width:300,compact:false})}>Reset view</button></div></details></div>

    <div className={`analysis-surface ${selected?"":"analysis-surface-full"}`}><div className="analysis-table-scroll"><ReviewTable label="Investment evidence matrix" rows={rows} rowKey={metric=>metric.metric_id} selectedId={selectedId} className={layout.compact?"compact":""} columns={[
      {id:"measure",label:"Measure",sortValue:metric=>metric.label,render:metric=><button className="record-link" type="button" aria-pressed={metric.metric_id===selectedId} onClick={()=>{setSelectedId(metric.metric_id);setAdding(false);setNotice("");}}>{metric.label}</button>},
      {id:"finding",label:"Source finding",render:metric=><><strong className="matrix-value">{metric.value}</strong></>},
      {id:"interpretation",label:"Investment interpretation",render:metric=>relevance(metric)},
      {id:"basis",label:"Evidence basis",sortValue:metric=>evidenceKind[metric.classification]??"Review required",render:metric=>evidenceKind[metric.classification]??"Review required"}
    ]}/>{!rows.length ? <p className="matrix-empty">No measures match. Clear the search to return to the case.</p> : null}<footer className="matrix-footer">Values describe the retained baseline. Financial scenarios and revised evidence remain separate until reviewed.</footer></div>
      {selected ? <aside className="analysis-inspector" aria-label="Selected evidence inspector"><header><button className="inspector-close" type="button" onClick={()=>setSelectedId(undefined)}>Close evidence</button><p className="eyebrow">Selected evidence</p><h3>{selected.label}</h3><strong>{selected.value}</strong><p>{selected.detail}</p></header><section><h4>What it means</h4><p>{relevance(selected)}</p></section><section><h4>Supporting records</h4>{sources.length ? sources.slice(0, 2).map((source) => <div className="inspector-source" key={source.locator_id}><strong>{sourceTitle(source.artifact_path)}</strong><span>{periodLabel(source.period)}</span><details><summary>Preview selected evidence</summary><div className="source-selection"><EvidenceExcerpt locator={source} /></div></details></div>) : <p>Inspect the calculation and its linked inputs.</p>}<button type="button" className="text-button" onClick={(event) => openMetric(selected, event.currentTarget)}>Trace exact source and calculation →</button></section><button type="button" className="matrix-model-action" onClick={() => onModelReview(selected.metric_id)}>Challenge this evidence with my model →</button><section><h4>Contradictory evidence</h4><p>{interpret(caseData.thesis.counterthesis)}</p><small>Case-level opposing argument; not independently attributed to this measure.</small></section><section><h4>Open questions</h4>{linkedIssues.length ? linkedIssues.map((issue) => <p key={issue.id}>{issue.title}<small>{issue.owner}</small></p>) : <p>No open question linked to this measure.</p>}{adding ? <div className="inspector-question"><label>Question<input maxLength={240} value={question} onChange={(event) => setQuestion(event.target.value)} /></label><label>Owner<input maxLength={120} value={owner} onChange={(event) => setOwner(event.target.value)} /></label><button type="button" className="primary-button" disabled={!question.trim() || !owner.trim()} onClick={addQuestion}>Assign diligence question</button><button type="button" onClick={() => setAdding(false)}>Cancel</button></div> : <button type="button" onClick={() => setAdding(true)}>Add diligence question</button>}<p role="status">{notice}</p></section></aside> : null}
    </div>
  </section>;
}
