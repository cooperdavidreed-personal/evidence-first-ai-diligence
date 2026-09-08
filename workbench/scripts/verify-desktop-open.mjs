// Exercise macOS Launch Services with a disposable data directory.
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const out=resolve('../dist/desktop'),home=await mkdtemp(join(tmpdir(),'Desk launchservices '));let instance;
try{
 execFileSync('open',['-n',join(out,'Mac-Apple-Silicon/Underwriting Desk.app'),'--env','DESK_DATA_HOME='+home,'--env','PATH=/usr/bin:/bin','--env','DESK_NO_OPEN=1']);
 for(let i=0;i<100;i++){try{instance=JSON.parse(await readFile(join(home,'desktop-instance.json'),'utf8'));break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(instance,'Application did not start through Launch Services');const response=await fetch(instance.url+'/__desk/desktop',{headers:{'x-desk-session':instance.token}});assert.equal(response.status,200);assert.equal((await response.json()).completed,false);
 await writeFile(join(out,'launchservices-verification.json'),JSON.stringify({status:'VERIFIED_LOCAL_SYNTHETIC',checks:['macOS .app launch through Launch Services','isolated data home','no Node on PATH','authenticated local service'],notRun:['download quarantine approval','managed device permission','automatic browser opening']},null,2));console.log('Mac application opens through Launch Services.');
}finally{if(instance){await fetch(instance.url+'/__desk/desktop',{method:'POST',headers:{'x-desk-session':instance.token,'content-type':'application/json'},body:JSON.stringify({action:'quit'})});await new Promise(r=>setTimeout(r,400));}await rm(home,{recursive:true,force:true});}
