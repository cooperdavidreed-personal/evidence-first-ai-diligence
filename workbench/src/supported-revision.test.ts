import {File as NodeFile} from "node:buffer";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {approveBaseline, processDealPackage} from "./intake";
import {compareSupportedRevision, prepareWorkbookRevision} from "./supported-revision";
import {strFromU8, strToU8, unzipSync, zipSync} from "fflate";
vi.mock("./source-parsers", async (original) => ({...await original<typeof import("./source-parsers")>(), parsePdfEvidence: async () => ({pageCount:1, recognizedScope:["Unit-test PDF fixture"], excerpts:[{page:1,text:"Synthetic management representation"}], excluded:[]})}));
async function revision(change?: "customer" | "revenue" | "immaterial") {
  const path=resolve(process.cwd(),"public/sample-package");
  const files=new Map(["deal.json","monthly_financials.csv","customer_arr.csv"].map(name=>[name,readFileSync(resolve(path,name))]));
  if(change==="immaterial") files.set("deal.json",Buffer.from(JSON.stringify(JSON.parse(files.get("deal.json")!.toString()),null,4)));
  if(change==="customer") {const lines=files.get("customer_arr.csv")!.toString().trimEnd().split("\n");const values=lines[lines.length-2].split(",");values[values.length-1]=String(Number(values.at(-1))+1234567);lines[lines.length-2]=values.join(",");files.set("customer_arr.csv",Buffer.from(lines.join("\n")+"\n"));}
  if(change==="revenue") {const lines=files.get("monthly_financials.csv")!.toString().trimEnd().split("\n");const values=lines[lines.length-1].split(",");values[1]=String(Number(values[1])+2345678);lines[lines.length-1]=values.join(",");files.set("monthly_financials.csv",Buffer.from(lines.join("\n")+"\n"));}
  const manifest=JSON.parse(readFileSync(resolve(path,"manifest.json"),"utf8"));
  for(const declaration of manifest.files){const content=files.get(declaration.name)!;declaration.bytes=content.length;declaration.sha256=createHash("sha256").update(content).digest("hex");}
  files.set("manifest.json",Buffer.from(JSON.stringify(manifest)));
  return processDealPackage([...files].map(([name,buffer])=>new NodeFile([buffer],name) as unknown as File));
}
const approved=async()=>approveBaseline(await revision(),"Avery Chen","Reviewed package mappings and calculation boundaries.");
describe("unseen supported source revisions",()=>{
 it("propagates a previously unseen customer revision without falsely staling deal assumptions",async()=>{
  const control=await compareSupportedRevision(await approved(),await revision("customer"));
  expect(control.impacts.some(impact=>impact.impactId==="ordinaryNrr")).toBe(true);
  expect(control.affectedAssumptionIds).toEqual([]);
  expect(control.sourceLocator).toBe("customer_arr.csv");
  expect(control.impacts.some(impact=>impact.impactId==="ltmRevenueCents")).toBe(false);
 });
 it("propagates a previously unseen revenue revision through economics and returns",async()=>{
  const control=await compareSupportedRevision(await approved(),await revision("revenue"));
  expect(control.impacts.map(impact=>impact.impactId)).toEqual(expect.arrayContaining(["ltmRevenueCents","grossMargin","grossMoic","annualizedGrossReturn"]));
  expect(control.affectedMemoSectionIds).toContain("economics");
  expect(control.affectedAssumptionIds).toEqual([]);
 });
 it("labels a formatting-only source revision with no calculated impact and no stale memo sections",async()=>{
  const control=await compareSupportedRevision(await approved(),await revision("immaterial"));
  expect(control.changeTitle).toBe("Source changed; no calculated financial impact");
  expect(control.impacts).toEqual([]);expect(control.affectedMemoSectionIds).toEqual([]);expect(control.affectedIssueIds).toEqual([]);
 });
 it("rejects unchanged content and altered calculated results",async()=>{
  const current=await approved(); await expect(compareSupportedRevision(current,await revision())).rejects.toThrow(/unchanged source/);
  const forged=await revision("customer");forged.analysis!.grossMoic+=1;
  await expect(compareSupportedRevision(current,forged)).rejects.toThrow(/do not match/);
 });
});
async function workbookPackage(){const dir=resolve(process.cwd(),"public/sample-package-v2");const names=["manifest.json","deal.json","operating_model.xlsx","customer_arr.csv","management_update.pdf"];return approveBaseline(await processDealPackage(names.map(name=>new NodeFile([readFileSync(resolve(dir,name))],name) as unknown as File)),"Avery Chen","Reviewed operating model mapping and exclusions.");}
it("admits unseen numeric workbook input with regenerated manifest and preserves unrelated source bytes",async()=>{
 const current=await workbookPackage();const zip=unzipSync(new Uint8Array(readFileSync(resolve(process.cwd(),"public/sample-package-v2/operating_model.xlsx"))));
 const text=strFromU8(zip["xl/worksheets/sheet2.xml"]);const doc=new DOMParser().parseFromString(text,"application/xml");const row=Array.from(doc.getElementsByTagNameNS("*","row")).find(row=>/Net revenue/i.test(row.textContent??""))!;const cell=Array.from(row.getElementsByTagNameNS("*","c")).find(cell=>cell.getAttribute("r")?.startsWith("C"))!;const value=cell.getElementsByTagNameNS("*","v")[0];value.textContent=String(Number(value.textContent)+12345);zip["xl/worksheets/sheet2.xml"]=strToU8(new XMLSerializer().serializeToString(doc));
 const candidate=await prepareWorkbookRevision(current,new NodeFile([zipSync(zip)],"analyst-saved.xlsx") as unknown as File);
 expect(candidate.analysis!.ltmRevenueCents).not.toBe(current.analysis!.ltmRevenueCents);
 expect(candidate.baselineApproval).toBeNull();
 expect(candidate.sourcePayloads!.find(file=>file.name==="customer_arr.csv")).toEqual(current.sourcePayloads!.find(file=>file.name==="customer_arr.csv"));
});
it("rejects formula edits in saved workbook admission",async()=>{
 const current=await workbookPackage();const zip=unzipSync(new Uint8Array(readFileSync(resolve(process.cwd(),"public/sample-package-v2/operating_model.xlsx"))));
 const doc=new DOMParser().parseFromString(strFromU8(zip["xl/worksheets/sheet2.xml"]),"application/xml");doc.getElementsByTagNameNS("*","f")[0].textContent="1+1";zip["xl/worksheets/sheet2.xml"]=strToU8(new XMLSerializer().serializeToString(doc));
 await expect(prepareWorkbookRevision(current,new NodeFile([zipSync(zip)],"formula-edit.xlsx") as unknown as File)).rejects.toThrow(/Formula|formula/);
});
