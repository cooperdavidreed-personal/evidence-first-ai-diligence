import {startLocalDesk} from './mcp-server/local-server.mjs';
import {readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),home=process.env.DESK_DATA_HOME;
if(!home)throw Error('Open the Underwriting Desk application to start this workspace.');
await mkdir(home,{recursive:true,mode:0o700});
const instancePath=join(home,'desktop-instance.json');
try {
  const existing=JSON.parse(await readFile(instancePath,'utf8'));
  if(/^http:\/\/127\.0\.0\.1:\d+$/.test(existing.url)){
    const reply=await fetch(existing.url+'/__desk/desktop',{headers:{'x-desk-session':existing.token},signal:AbortSignal.timeout(1500)});
    if(reply.ok&&(await reply.json()).version){console.log(existing.url);process.exit(0);}
  }
}catch {/* A previous process may have exited without removing its descriptor. */}
function openFile(file){return new Promise((resolve,reject)=>{
  const command=process.platform==='darwin'?'open':'rundll32.exe';
  const args=process.platform==='darwin'?[file]:['url.dll,FileProtocolHandler',file];
  const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Could not open the Claude extension. Check that Claude Desktop is installed and local extensions are allowed.')));
});}
const server=await startLocalDesk({workbenchPath:root,storePath:join(home,'reviews.sqlite'),port:0,desktop:{version:'0.3.0-pilot',openExtension:()=>openFile(join(root,'Underwriting Desk.mcpb')),quit:()=>server.close()}});
const url=`http://127.0.0.1:${server.address().port}`;
await writeFile(instancePath,JSON.stringify({url,token:server.deskSessionToken,pid:process.pid}),{mode:0o600});
console.log(url);
server.once('close',async()=>{try{const current=JSON.parse(await readFile(instancePath,'utf8'));if(current.pid===process.pid)await unlink(instancePath);}catch{};});
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
