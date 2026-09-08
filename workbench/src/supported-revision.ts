import {unzipSync, strFromU8} from "fflate";
import {processDealPackage, sha256, type IntakeResult, type SourcePayload} from "./intake";
import {replayAdmittedDeal, validateAdmittedDeal} from "./local-deal-state";
import {compareWorkbookCells} from "./workbook-diff";
import type {PackageChangeControlState} from "./workspace-state";
const digest = (result: IntakeResult) => result.files.find(file => file.name === "manifest.json")?.sha256 ?? "";
function sourceIdentity(result: IntakeResult) {return JSON.stringify(result.files.filter(file => file.name !== "manifest.json" && file.sha256).map(file => [file.name, file.sha256]).sort());}
export async function compareSupportedRevision(current: IntakeResult, candidate: IntakeResult): Promise<PackageChangeControlState> {
  if (!current.baselineApproval) throw new Error("Approve the current source baseline first.");
  const revision = await replayAdmittedDeal(validateAdmittedDeal(candidate));
  if (revision.deal!.company !== current.deal!.company) throw new Error("Revision package belongs to a different company.");
  if (sourceIdentity(current) === sourceIdentity(revision)) throw new Error("Revision has unchanged source content; repackaging the manifest is not a new delivery.");
  const before = current.analysis!, after = revision.analysis!;
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  const money = (value: number) => new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits:2}).format(value / 100);
  const measures = [
    ["ltmRevenueCents", "LTM revenue", money], ["grossMargin", "Gross margin", pct], ["ordinaryNrr", "Cohort retention proxy", pct],
    ["cohortElapsedMonths", "Retention measurement interval", (v:number)=>`${v} months`], ["recentNetBurnCents", "Recent monthly net burn", money], ["postMoneyOwnership", "Post-money ownership", pct],
    ["terminalRevenueCents", "Terminal revenue", money], ["exitEquityCents", "Exit equity value", money],
    ["grossMoic", "Gross multiple", (v:number) => `${v.toFixed(4)}x`], ["annualizedGrossReturn", "Annualized gross return", pct],
  ] as const;
  const impacts: PackageChangeControlState["impacts"] = measures.filter(([key]) => before[key] !== after[key]).map(([key,label,format],index) => ({impactId:key,label,before:format(before[key]),after:format(after[key]),rank:index+1,consequence:"Changed by the supported deterministic rerun; this does not approve an investment conclusion."}));
  if (before.runwayMonths !== after.runwayMonths) impacts.push({impactId:"runwayMonths",label:"Runway",before:before.runwayMonths === null ? "Not applicable" : `${before.runwayMonths.toFixed(2)} months`,after:after.runwayMonths === null ? "Not applicable" : `${after.runwayMonths.toFixed(2)} months`,rank:impacts.length+1,consequence:"Changed cash or recent burn changes the deterministic runway measure."});
  const changedTests = after.tests.filter(test => {const old = before.tests.find(item => item.gateId === test.gateId); return !old || old.state !== test.state || old.blocksAdvancement !== test.blocksAdvancement || old.observed !== test.observed;});
  const screeningChanged = current.posture !== revision.posture || changedTests.some(test => before.tests.find(item => item.gateId === test.gateId)?.state !== test.state);
  const assumptions: string[] = [];
  if (current.deal!.annualRevenueGrowth !== revision.deal!.annualRevenueGrowth) assumptions.push("local-growth");
  if (current.deal!.exitRevenueMultiple !== revision.deal!.exitRevenueMultiple) assumptions.push("local-exit-multiple");
  if (["investmentCents", "preMoneyCents"].some(key => current.deal![key as "investmentCents"] !== revision.deal![key as "investmentCents"])) assumptions.push("local-financing");
  const sourceChanges = revision.files.filter(file => file.sha256 && file.name !== "manifest.json" && current.files.find(old => old.name === file.name)?.sha256 !== file.sha256).map(file => file.name);
  const conclusion = screeningChanged ? "Screening status changed" : impacts.length ? "Financial measures changed; screening status unchanged" : "Source changed; no calculated financial impact";
  const packageDigestSha256 = digest(revision), fromVersion = current.baselineApproval.version;
  const receipt = await sha256(new TextEncoder().encode(JSON.stringify({from:digest(current),to:packageDigestSha256,impacts,changedTests:changedTests.map(test=>test.gateId)})).buffer);
  return {changeSetId:`local-${packageDigestSha256.slice(0,12)}`,fromVersion,toVersion:`V${Number(fromVersion.slice(1))+1}`,packageDigestSha256,importedAt:new Date().toISOString(),sourcePath:"Supported source package",sourceLocator:sourceChanges.join(" · "),changeId:`local-evidence-${packageDigestSha256.slice(0,12)}`,changeTitle:conclusion,beforeValue:impacts[0]?.before ?? "Approved source",afterValue:impacts[0]?.after ?? "Revised source",deterministicReceiptSha256:receipt,decisionConsequence:`${conclusion}. ${revision.posture}. ${after.tests.filter(test=>test.blocksAdvancement).length} gates remain unresolved. No materiality threshold or investment approval is inferred.`,affectedAssumptionIds:assumptions,affectedIssueIds:changedTests.map(test=>test.gateId),affectedMemoSectionIds:[...(screeningChanged?["screening"]:[]),...(impacts.length?["economics"]:[]),...(changedTests.length || sourceChanges.includes("management_update.pdf")?["diligence"]:[])],impacts,dispositionEvents:[]};
}
function bytes(payload: SourcePayload | {name: string; text: string}): Uint8Array {
  return "text" in payload ? new TextEncoder().encode(payload.text) : payload.encoding === "BASE64" ? Uint8Array.from(atob(payload.content), char=>char.charCodeAt(0)) : new TextEncoder().encode(payload.content);
}
function sourceFile(name:string, content:Uint8Array, mediaType = "text/plain"):File {return {name,size:content.byteLength,type:mediaType,arrayBuffer:async()=>content.buffer.slice(content.byteOffset,content.byteOffset+content.byteLength) as ArrayBuffer,text:async()=>new TextDecoder().decode(content)} as File;}
function requireLiteralMappedInputs(buffer:ArrayBuffer) {
  const zip=unzipSync(new Uint8Array(buffer));
  const shared = zip["xl/sharedStrings.xml"] ? Array.from(new DOMParser().parseFromString(strFromU8(zip["xl/sharedStrings.xml"]), "application/xml").getElementsByTagNameNS("*", "si")).map(item=>item.textContent??"") : [];
  for(const [name,content] of Object.entries(zip)) {
    if(!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    const doc=new DOMParser().parseFromString(strFromU8(content),"application/xml");
    for(const row of Array.from(doc.getElementsByTagNameNS("*","row"))) {
      const cells=Array.from(row.getElementsByTagNameNS("*","c"));
      const labels=cells.slice(0,2).map(cell=>cell.getAttribute("t")==="s" ? shared[Number(cell.getElementsByTagNameNS("*","v")[0]?.textContent)]??"" : cell.textContent??"");
      if(labels.some(label=>/^(?:net revenue|revenue|cost of revenue|cogs|operating expense|opex)(?: \(\$\))?$/i.test(label.trim())) && cells.some(cell=>cell.getElementsByTagNameNS("*","f").length)) throw new Error("Mapped operating inputs must be literal values for saved-workbook admission. Formula-driven mapped inputs require a complete independently reviewed source package.");
    }
  }
}
export async function prepareWorkbookRevision(current:IntakeResult,file:File):Promise<IntakeResult> {
  if(file.size>5*1024*1024) throw new Error("Saved workbook exceeds the supported 5 MB source-file limit.");
  const payload=current.sourcePayloads?.find(source=>source.name==="operating_model.xlsx");
  if(!payload || !current.baselineApproval) throw new Error("This deal has no approved supported operating workbook.");
  const original=bytes(payload), candidate=await file.arrayBuffer();
  const diff=compareWorkbookCells(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength) as ArrayBuffer,candidate);
  if(diff.state!=="COMPARED" || diff.addedSheets.length || diff.removedSheets.length) throw new Error("Saved-workbook admission requires the existing sheets and supported workbook structure.");
  if(diff.changes.some(change=>change.kind!=="CACHED_VALUE_CHANGED" && !(change.kind==="VALUE_CHANGED" && change.before?.formula===null && change.after?.formula===null && change.before.type==="number" && change.after.type==="number"))) throw new Error("Only numeric input edits and unchanged-formula cached results can enter this supported revision path. Formula, label, period and structure edits require a complete source package.");
  requireLiteralMappedInputs(candidate);
  const sources=new Map(current.sourcePayloads!.map(source=>[source.name,bytes(source)]));
  sources.set("operating_model.xlsx",new Uint8Array(candidate));
  const manifest=JSON.parse(new TextDecoder().decode(sources.get("manifest.json")!));
  for(const declaration of manifest.files) {const content=sources.get(declaration.name);if(!content) throw new Error("Declared source is missing.");declaration.bytes=content.byteLength;declaration.sha256=await sha256(content.buffer.slice(content.byteOffset,content.byteOffset+content.byteLength) as ArrayBuffer);}
  sources.set("manifest.json",new TextEncoder().encode(JSON.stringify(manifest)));
  const revision=await processDealPackage([...sources].map(([name,content])=>sourceFile(name,content,(current.sourcePayloads!.find(source=>source.name===name) as SourcePayload)?.mediaType ?? "text/plain")),current.analysis!.policyProfile);
  if(revision.packageState!=="READY") throw new Error(revision.errors[0]??"Saved workbook failed supported source admission.");
  await compareSupportedRevision(current,revision);
  return revision;
}
