import {test, expect, type Page} from "@playwright/test";
import {mkdirSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {strFromU8,strToU8,unzipSync,zipSync} from "fflate";
const sourceRoot=resolve(import.meta.dirname,"../public/sample-package-v2");
const names=["manifest.json","deal.json","operating_model.xlsx","customer_arr.csv","management_update.pdf"];
function savedWorkbook(){const zip=unzipSync(new Uint8Array(readFileSync(resolve(sourceRoot,"operating_model.xlsx"))));const xml=strFromU8(zip["xl/worksheets/sheet2.xml"]);let changed=false;zip["xl/worksheets/sheet2.xml"]=strToU8(xml.replace(/(<x:c\b[^>]*\br="C5"[^>]*>[\s\S]*?<x:v>)([^<]+)(<\/x:v>)/,(_all,before,value,after)=>{changed=true;return `${before}${Number(value)+18765}${after}`;}));if(!changed)throw new Error("Fixture input C5 not found");return {name:"unseen-operating-revision.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:Buffer.from(zipSync(zip))};}
const candidateWorkbook=savedWorkbook();
async function admit(page:Page){await page.goto("/");await page.getByRole("button",{name:"New deal",exact:true}).click();await page.locator(".advanced-package-intake > summary").click();await page.getByTestId("deal-package-input").setInputFiles(names.map(name=>resolve(sourceRoot,name)));await page.getByRole("button",{name:"Validate and analyze",exact:true}).click();await page.getByRole("textbox",{name:"Analyst name",exact:true}).fill("Avery Chen");await page.getByRole("textbox",{name:"Approval rationale",exact:true}).fill("Reviewed original source mapping and calculation exclusions.");await page.getByRole("button",{name:"Approve Version 1 and open workspace",exact:true}).click();await expect(page.getByRole("heading",{name:"Northstar Metrics",level:1})).toBeVisible();}
async function nav(page:Page,name:string){await page.getByRole("navigation",{name:"Deal navigation"}).getByRole("button",{name,exact:true}).click();}
async function prepare(page:Page){await nav(page,"Model");await page.getByText("Review a saved Excel model",{exact:true}).click();await page.locator("label").filter({hasText:"Compare saved workbook"}).locator("input").setInputFiles(candidateWorkbook);await page.getByRole("button",{name:"Prepare supported revision",exact:true}).click();await expect(page.getByRole("table",{name:"Revised delivery impacts"})).toBeVisible();}
async function reviewer(page:Page){await page.getByRole("textbox",{name:"Reviewer",exact:true}).fill("Avery Chen");await page.getByRole("textbox",{name:"Rationale",exact:true}).fill("Reviewed the numeric source edit and reconciled the decision consequences.");}
async function stored(page:Page){return page.evaluate(async localMode=>{const deal=JSON.parse(localStorage.getItem("underwriting-desk.admitted-deal.v1")!);const slug=deal.deal.company.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");const id=`local-${slug}-${deal.dealLineageId.slice(0,12)}`;const workspace=localMode?(await (await fetch(`/__desk/workspace?deal=${encodeURIComponent(id)}`,{headers:{"x-desk-local":"1"}})).json()).workspace?.state:JSON.parse(localStorage.getItem(`underwriting-desk.workspace.v3.${id}`)!);return {deal,workspace};},Boolean(process.env.DESK_LOCAL_STORE));}

test("workbook candidate survives navigation, rejection preserves V1, acceptance survives reload",async({page},testInfo)=>{
 const evidenceRoot=resolve(import.meta.dirname,"../../verification/desk-twelve-20260908");mkdirSync(evidenceRoot,{recursive:true});
 const shot=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(evidenceRoot,`${testInfo.project.name}-${name}.png`),fullPage:true});};
 await admit(page);const original=await stored(page);
 await prepare(page);await page.getByRole("table",{name:"Revised delivery impacts"}).getByRole("button",{name:"Gross margin",exact:true}).click();await shot("revision-review-selected-1440");
 await page.setViewportSize({width:1728,height:1117});await shot("revision-review-selected-1728");await page.setViewportSize({width:1440,height:900});
 await nav(page,"Committee");await nav(page,"Review");await reviewer(page);await expect(page.getByRole("button",{name:"Accept and promote",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Reject change",exact:true}).click();await expect.poll(async()=> (await stored(page)).workspace?.changeControl.dispositionEvents.at(-1)?.disposition).toBe("REJECTED");expect((await stored(page)).deal.baselineApproval.version).toBe("V1");
 await prepare(page);await reviewer(page);await page.getByRole("button",{name:"Accept and promote",exact:true}).click();await expect(page.locator(".basis-label")).toContainText("V2");
 await page.reload();await expect(page.locator(".basis-label")).toContainText("V2");const accepted=await stored(page);expect(accepted.deal.analysis.ltmRevenueCents).toBe(original.deal.analysis.ltmRevenueCents+1876500);expect(accepted.deal.versionHistory).toHaveLength(1);expect(accepted.workspace.changeControl.dispositionEvents.map((event:{disposition:string})=>event.disposition)).toEqual(["REJECTED","ACCEPTED"]);
 await shot("revision-v2-accepted-1440");
 await nav(page,"Committee");await expect(page.getByText("Memo review required",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Download IC memo",exact:true})).toBeDisabled();
 await page.getByRole("textbox",{name:"Editor",exact:true}).fill("Avery Chen");
 await page.getByRole("button",{name:"Reconcile core sections to V2 admitted package case",exact:true}).click();
 await expect(page.getByRole("button",{name:"Download IC memo",exact:true})).toBeEnabled();
 const reconciled=await stored(page);expect(reconciled.workspace.memoSections.every((section:{scenarioSnapshotId:string})=>section.scenarioSnapshotId.includes("V2"))).toBe(true);
 await page.reload();await expect(page.getByRole("heading",{name:"V2 admitted package case",exact:true})).toBeVisible();
 await expect(page.getByText("Memo review required",{exact:true})).toHaveCount(0);
 await shot("revision-v2-committee-reconciled-1440");await page.setViewportSize({width:1728,height:1117});await shot("revision-v2-committee-reconciled-1728");
});
