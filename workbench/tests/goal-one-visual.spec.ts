import {test, expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";
const phase=process.env.GOAL_ONE_PHASE??"after";
const output=resolve(import.meta.dirname,"../../verification/goal-one-20260908",phase);
test("desktop composition across entry and workspaces",async({page},info)=>{
 test.setTimeout(90000);mkdirSync(output,{recursive:true});
 for(const width of [1280,1440,1728]){
  await page.setViewportSize({width,height:900});
  for(const view of ["home","overview","changes","financials","documents","memo"]){
   await page.goto(view==="home"?"/#/":`/#/v3/atlasgrid/${view}`,{waitUntil:"networkidle"});
   await expect(page.getByRole("main")).toBeVisible();
   if(phase!=="before")expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.screenshot({path:resolve(output,`${info.project.name}-${width}-${view}.png`),fullPage:true,animations:"disabled"});
  }
 }
});
test("two direction comparison",async({page},info)=>{
 mkdirSync(output,{recursive:true});await page.setViewportSize({width:1440,height:900});await page.goto('/#/design-directions',{waitUntil:'networkidle'});
 for(const direction of ['A · Editorial atelier','B · Precision terminal']){
  await page.getByRole('button',{name:direction,exact:true}).click();
  for(const view of ['Entry','Review']){await page.getByRole('button',{name:view,exact:true}).click();await page.screenshot({path:resolve(output,`${info.project.name}-${direction[0]}-${view}.png`),fullPage:true,animations:"disabled"});}
 }
});

test("entry walkthrough, focused navigation, and reduced motion",async({page},info)=>{
 await page.emulateMedia({reducedMotion:"reduce"});await page.goto('/#/',{waitUntil:'networkidle'});
 const preview=page.getByRole('region',{name:'Illustrative investment review walkthrough'});
 await expect(preview.getByText('99.9%',{exact:true})).toBeVisible();
 await preview.getByRole('button',{name:'02 Economics',exact:true}).click();
 await expect(preview.getByText('18.4%',{exact:true})).toBeVisible();
 await preview.getByRole('button',{name:'03 Committee',exact:true}).click();
 await expect(preview.getByRole('heading',{name:'Reopen diligence before advancing.'})).toBeVisible();
 await expect(preview.locator('.preview-body')).toHaveCSS('animation-name','none');
 await page.getByRole('button',{name:'Go to workspaces ↓',exact:true}).click();
 await expect(preview).toHaveCount(0);
 await page.getByRole('searchbox',{name:'Find a deal',exact:true}).fill('No such deal');
 await expect(page.getByRole('heading',{name:'No matching workspaces'})).toBeVisible();
 await page.screenshot({path:resolve(output,`${info.project.name}-empty-register.png`),fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Clear deal filters'}).click();
 await page.getByRole('button',{name:'Show introduction',exact:true}).click();
 const open=page.getByRole('button',{name:'Explore an investment case',exact:true});await open.focus();
 await expect(open).toBeFocused();await page.screenshot({path:resolve(output,`${info.project.name}-keyboard-focus.png`),fullPage:true,animations:'disabled'});
 await open.press('Enter');await expect(page.getByRole('navigation',{name:'Deal navigation'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Reprice before advancing'})).toBeVisible();
});

test("case loading failure has a recoverable designed state",async({page},info)=>{
 await page.route(/underwriting-case-atlasgrid/,route=>route.abort());
 await page.goto('/#/v3/atlasgrid/overview');
 await expect(page.getByRole('heading',{name:'This workspace could not be opened'})).toBeVisible();
 await page.screenshot({path:resolve(output,`${info.project.name}-loading-error.png`),fullPage:true,animations:'disabled'});
 await page.unroute(/underwriting-case-atlasgrid/);await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('heading',{name:'AtlasGrid Systems',exact:true})).toBeVisible();
});
