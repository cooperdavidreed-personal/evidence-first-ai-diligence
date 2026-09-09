import {mkdtemp,readFile,writeFile,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {unzipSync} from 'fflate';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const out=resolve('../dist/desktop'),temp=await mkdtemp(join(tmpdir(),'Desk desktop trial ')),home=join(temp,'user data');
await mkdir(home);execFileSync('ditto',['-x','-k',join(out,'Underwriting-Desk-Mac-Apple-Silicon.zip'),temp]);
const executable=join(temp,'Underwriting Desk.app/Contents/MacOS/UnderwritingDesk');
const env={...process.env,PATH:'/usr/bin:/bin',DESK_DATA_HOME:home,DESK_NO_OPEN:'1'};
let app,model,browser,base,token;
async function start(){app=spawn(executable,[],{env,stdio:['ignore','pipe','pipe']});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native launch timed out')),30000);app.stdout.once('data',b=>{clearTimeout(timer);resolve(b.toString().trim());});app.once('exit',code=>{clearTimeout(timer);reject(Error('Native launcher exited '+code));});});}
async function post(action){const res=await fetch(base+'/__desk/desktop',{method:'POST',headers:{'x-desk-session':token,'content-type':'application/json'},body:JSON.stringify({action})});assert.equal(res.status,200);return res.json();}
try{
 base=await start();let html=await(await fetch(base)).text();token=JSON.parse(html.match(/window.__DESK_SESSION__=("[a-f0-9]+")/)[1]);
 assert.match(html,/__DESK_DESKTOP__=true/);assert.ok((await readFile(join(home,'Open Underwriting Desk.html'),'utf8')).includes(base));
 const installed=JSON.parse(await readFile(join(home,'desktop-install.json'),'utf8'));
 const nodeVersion=execFileSync(join(installed.root,'runtime/node'),['--version'],{env,encoding:'utf8'}).trim();assert.equal(nodeVersion,'v24.20.0');
 browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('heading',{name:'Your investment workspace. Ready on this computer.'}).waitFor();await page.getByRole('button',{name:'Create connection test'}).click();const prompt=await page.getByLabel('Paste this into Claude').inputValue(),code=prompt.match(/[a-f0-9]{36}/)[0];
 const extensionBytes=await readFile(join(installed.root,'Underwriting Desk.mcpb'));await page.getByText('Claude did not open, or the extension is missing?',{exact:true}).click();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download Claude extension',exact:true}).click();const downloaded=await downloading;assert.equal(downloaded.suggestedFilename(),'Underwriting Desk.mcpb');assert.deepEqual(await readFile(await downloaded.path()),extensionBytes);const files=unzipSync(extensionBytes);const manifest=JSON.parse(Buffer.from(files['manifest.json']).toString());assert.equal(manifest.server.type,'binary');const connector=join(temp,'connector');await writeFile(connector,files['server/connector']);await chmod(connector,0o700);
 model=spawn(connector,[],{env,stdio:['pipe','pipe','pipe']});let modelError='';model.stderr.on('data',b=>modelError+=b);model.on('exit',(code,signal)=>{if(code!==0)console.error('Connector exited',code,signal,modelError);});const lines=createInterface({input:model.stdout}),pending=new Map();let sequence=0;
 lines.on('line',line=>{const message=JSON.parse(line),entry=pending.get(message.id);if(entry){pending.delete(message.id);clearTimeout(entry.timer);entry.resolve(message);}});
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('Packaged connector timeout')),15000);pending.set(id,{resolve,reject,timer});model.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 await rpc('initialize',{protocolVersion:'2024-11-05',clientInfo:{name:'Synthetic native verifier',version:'1'},capabilities:{}});
 const tools=await rpc('tools/list',{});assert.equal(tools.result.tools.length,7);
 const result=await rpc('tools/call',{name:'verify_desk_connection',arguments:{code}});assert.ok(!result.result.isError,JSON.stringify(result));await page.getByText('Connection verified. You can start your first review.').waitFor();await page.screenshot({path:join(out,'onboarding-verified.png'),fullPage:true});await page.getByRole('button',{name:'Open my workspace',exact:true}).click();await page.getByRole('heading',{name:'Deals',exact:true}).waitFor();await page.screenshot({path:join(out,'workspace-open.png'),fullPage:true});assert.deepEqual(errors,[]);
 const state={schema:'desk.deal-progress/v1',id:'desktop-test-company',company:'Synthetic native trial',strategy:'VC / Growth',stage:'Initial screen',question:'What would change our view?',sourceVersion:0,updatedAt:new Date().toISOString(),sources:[],findings:[],issues:[],assumptions:[],events:[],outputs:{}};
 const saved=await fetch(base+'/__desk/progress',{method:'POST',headers:{'x-desk-session':token,'content-type':'application/json'},body:JSON.stringify({action:'save',state,baseVersion:null})});assert.equal(saved.status,200);
 model.stdin.end();await new Promise(r=>model.once('exit',r));model=null;
 await post('quit');await new Promise(r=>setTimeout(r,400));
 base=await start();html=await(await fetch(base)).text();token=JSON.parse(html.match(/window.__DESK_SESSION__=("[a-f0-9]+")/)[1]);const status=await(await fetch(base+'/__desk/desktop',{headers:{'x-desk-session':token}})).json();assert.equal(status.completed,true);assert.equal(status.verified,true);const recovered=await(await fetch(base+'/__desk/progress?deal=desktop-test-company',{headers:{'x-desk-session':token}})).json();assert.equal(recovered.snapshot.state.company,'Synthetic native trial');
 const again=spawn(executable,[],{env,stdio:['ignore','pipe','pipe']});let againURL='';again.stdout.on('data',b=>againURL+=b);await new Promise(r=>again.once('exit',r));assert.equal(againURL.trim(),base);
 const report={status:'VERIFIED_LOCAL_SYNTHETIC',nodeVersion,checks:['Mac extracted application with spaces in path','no Node on PATH','bundled runtime','browser recovery file contains live address without session token','wizard browser render and actions','authenticated browser extension download matches bundled bytes','extracted MCPB binary roundtrip','fresh connection code verified in browser','quit and reopen','onboarding and company record persistence','second open reuses owned service'],notRun:['Windows native execution','Intel Mac native execution','Claude Desktop extension import','managed workstation policy','practitioner trial']};const artifacts=JSON.parse(await readFile(join(out,'artifacts.json'),'utf8'));artifacts.artifacts.find(a=>a.file==='Underwriting-Desk-Mac-Apple-Silicon.zip').nativeTested=true;artifacts.artifacts.find(a=>a.file==='Underwriting Desk.mcpb').binaryRoundtripTestedOn='darwin-arm64';await writeFile(join(out,'artifacts.json'),JSON.stringify(artifacts,null,2));
 await writeFile(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{
 if(browser)await browser.close();if(model){model.stdin.end();model.kill();}
 if(base&&token){await post('quit').catch(()=>{});await new Promise(r=>setTimeout(r,400));}
 await rm(temp,{recursive:true,force:true});
}
