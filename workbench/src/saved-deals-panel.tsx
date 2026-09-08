import {useEffect,useState} from "react";
import {listSavedDeals,openSavedDeal,type SavedDeal} from "./deal-library";
import type {IntakeResult} from "./intake";
import {ReviewTable} from "./review-table";
export function SavedDealsPanel({onOpen}:{onOpen:(result:IntakeResult)=>void}) {
 const [rows,setRows]=useState<SavedDeal[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[query,setQuery]=useState(""),[history,setHistory]=useState(false);
 async function refresh(){setBusy(true);setError("");try{setRows(await listSavedDeals());}catch(error){setError(error instanceof Error?error.message:"Saved deals unavailable");}finally{setBusy(false);}}
 useEffect(()=>{void refresh();},[]);
 async function open(id:string){setBusy(true);setError("");try{onOpen(await openSavedDeal(id));}catch(error){setError(error instanceof Error?error.message:"Saved delivery could not be opened");}finally{setBusy(false);}}
 const seen=new Set<string>();const visible=rows.filter(row=>{if(!history&&seen.has(row.caseId))return false;seen.add(row.caseId);return `${row.company} ${row.version}`.toLowerCase().includes(query.toLowerCase().trim());});
 return <section className="saved-deals-register" aria-label="Saved deal library"><div className="section-heading"><div><p className="eyebrow">Your work</p><h2>Saved deals and source versions</h2></div><span>Analyst work is retained separately for each deal</span></div><div className="review-table-toolbar"><label>Find saved deal<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/>Show all source versions</label><button type="button" disabled={busy} onClick={refresh}>{busy?"Working…":"Refresh saved deals"}</button></div>{error?<p role="alert">{error} Existing records have not been removed.</p>:null}<ReviewTable label="Saved deals and source versions" rows={visible} rowKey={row=>row.id} emptyMessage={busy?"Loading saved deliveries…":error?"Saved deliveries could not be loaded. Retry with Refresh saved deals.":"No saved deals match. Admit a package or import a source backup."} columns={[
 {id:"company",label:"Company",sortValue:r=>r.company,render:r=><button className="record-link" type="button" disabled={busy} onClick={()=>void open(r.id)}>Open saved {r.company}</button>},
 {id:"version",label:"Source version",sortValue:r=>Number(r.version.replace(/\D/g,"")),render:r=>r.version},
 {id:"saved",label:"Saved",sortValue:r=>r.savedAt,render:r=>new Date(r.savedAt).toLocaleString()},
 {id:"storage",label:"Storage",render:r=>r.storage==="browser"?"This browser":"Local workstation"},
 {id:"identity",label:"Source identity",render:r=><details><summary>Package detail</summary><code>{r.packageDigest}</code><p>Opening an older source preserves existing analyst records; incompatible records require recovery review.</p></details>}
 ]}/></section>;
}
