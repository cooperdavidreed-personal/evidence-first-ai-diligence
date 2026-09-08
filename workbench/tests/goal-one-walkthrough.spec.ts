import {test,expect} from '@playwright/test';
import {mkdirSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
test('record the working desktop review sequence',async({browser},info)=>{
 test.skip(info.project.name!=='desktop','One Chromium walkthrough recording');test.setTimeout(90000);
 const dir=resolve(import.meta.dirname,'../../verification/goal-one-20260908');mkdirSync(dir,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}},baseURL:info.project.use.baseURL??`http://127.0.0.1:${process.env.WORKBENCH_PORT??4174}`});
 const page=await context.newPage();
 try{
  await page.goto('/#/',{waitUntil:'networkidle'});await page.waitForTimeout(2500);
  await page.getByRole('region',{name:'Illustrative investment review walkthrough'}).getByRole('button',{name:'02 Economics',exact:true}).click();await page.waitForTimeout(2500);
  await page.getByRole('button',{name:'Explore an investment case',exact:true}).click();await expect(page.getByRole('heading',{name:'Reprice before advancing'})).toBeVisible();await page.waitForTimeout(3000);
  await page.getByRole('navigation',{name:'Deal navigation'}).getByRole('button',{name:'Evidence',exact:true}).click();
  await page.getByRole('table',{name:'Investment evidence matrix'}).locator('tbody').getByRole('button').nth(1).click();await page.waitForTimeout(2500);
  await page.getByRole('complementary',{name:'Selected evidence inspector'}).getByRole('button',{name:/Trace exact source/}).click();await page.waitForTimeout(3000);
  await page.getByRole('button',{name:'Close source trace',exact:true}).click();
  await page.getByRole('navigation',{name:'Deal navigation'}).getByRole('button',{name:'Review',exact:true}).click();await page.getByRole('button',{name:'Load example revision',exact:true}).click();await expect(page.getByRole('status')).toContainText('Version 2 validated');await page.waitForTimeout(3500);
  await page.getByRole('navigation',{name:'Deal navigation'}).getByRole('button',{name:'Committee',exact:true}).click();await page.waitForTimeout(3500);
 }finally{const video=page.video();await context.close();if(video)renameSync(await video.path(),resolve(dir,'goal-one-working-walkthrough.webm'));}
});
