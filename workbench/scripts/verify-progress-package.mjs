// Exercise the actual extracted distribution using disposable synthetic data.
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:net';
import {unzipSync} from 'fflate';
import assert from 'node:assert/strict';
const archivePath=resolve('../dist/local-distribution/underwriting-desk-local.zip');
const archive=await readFile(archivePath),root=await mkdtemp(join(tmpdir(),'Desk packaged pilot '));
let service,model;
try {
 for(const [name,bytes] of Object.entries(unzipSync(archive))){const target=join(root,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
 const check=spawnSync(process.execPath,['start-desk.mjs','--check'],{cwd:root,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const store=join(root,'synthetic.sqlite');
 service=spawn(process.execPath,['start-desk.mjs','--no-open'],{cwd:root,env:{...process.env,DESK_PORT:String(port),DESK_LOCAL_STORE:store},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Packaged launcher readiness timeout')),10000);service.stdout.on('data',b=>{output+=b;if(output.includes('Underwriting Desk is ready')){clearTimeout(timer);resolve();}});service.once('exit',code=>{clearTimeout(timer);reject(Error(`Launcher exited ${code}`));});});
 const base=`http://127.0.0.1:${port}`,html=await(await fetch(base)).text(),token=JSON.parse(html.match(/window.__DESK_SESSION__=("[a-f0-9]+")/)[1]);
 const api=async body=>{const response=await fetch(base+'/__desk/progress',{method:'POST',headers:{'content-type':'application/json','x-desk-session':token,origin:base},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
 const bytes=Buffer.from('Synthetic retained revenue: 100');
 const state={schema:'desk.deal-progress/v1',id:'package-fixture',company:'Synthetic package check',strategy:'VC / Growth',stage:'Initial screen',question:'Is growth durable?',sourceVersion:1,updatedAt:new Date().toISOString(),sources:[{id:'source-one',name:'arbitrary-management-note.txt',kind:'text',bytes:bytes.toString('base64'),digest:createHash('sha256').update(bytes).digest('hex'),status:'accepted',replaces:null,note:'Synthetic check',excerpts:[{id:'source-one:0',locator:'Line 1',text:bytes.toString()}],mapping:null}],findings:[],issues:[],assumptions:[],events:[],outputs:{}};
 await api({action:'save',state,baseVersion:null});const release=await api({action:'release',deal:state.id,sources:['source-one']});
 model=spawn(process.execPath,['mcp-server/server.mjs','--review-store',store],{cwd:root,stdio:['pipe','pipe','pipe']});
 const lines=createInterface({input:model.stdout}),pending=new Map();let sequence=0;
 lines.on('line',line=>{const message=JSON.parse(line),entry=pending.get(message.id);if(entry){pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(Error(JSON.stringify(message.error))):entry.resolve(message.result);}});
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(Error('Packaged MCP timeout')),10000);pending.set(id,{resolve,reject,timer});model.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 await rpc('initialize',{protocolVersion:'2024-11-05',clientInfo:{name:'Synthetic package verifier',version:'1'},capabilities:{}});
 const tools=await rpc('tools/list',{});assert.ok(tools.tools.some(t=>t.name==='propose_investment_work'));
 const context=await rpc('tools/call',{name:'read_investment_evidence',arguments:{deal_id:state.id,release_digest:release.digest}});assert.match(JSON.stringify(context),/Synthetic retained revenue/);
 const proposed=await rpc('tools/call',{name:'propose_investment_work',arguments:{deal_id:state.id,release_digest:release.digest,kind:'finding',section:'Concerns',text:'Validate cohort retention.',evidence_refs:['source-one:0']}});assert.ok(!proposed.isError);
 const backup=await api({action:'backup',deal:state.id,password:'synthetic passphrase only'});
 await api({action:'delete',deal:state.id,version:1});const restored=await api({action:'restore',envelope:backup,password:'synthetic passphrase only'});assert.equal(restored.state.company,state.company);
 console.log(JSON.stringify({status:'VERIFIED_LOCAL_SYNTHETIC',node:process.version,archive:archivePath,sha256:createHash('sha256').update(archive).digest('hex'),checks:['extracted path with spaces','manifest integrity','packaged launcher','private company API','packaged MCP source retrieval and proposal','encrypted backup delete restore'],notRun:['managed Windows installation','native Claude Enterprise','practitioner trial']},null,2));
} finally {
 for(const child of [model,service])if(child&&child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await stopped;}
 await rm(root,{recursive:true,force:true});
}
