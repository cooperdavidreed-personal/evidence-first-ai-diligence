#!/usr/bin/env node
import {readFile,writeFile,mkdir,readdir,copyFile,chmod} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync} from 'fflate';
import {runtimeFiles} from './package-local.mjs';
const wb=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(wb,'../dist/desktop'),cache=join(out,'cache'),go=join(wb,'desktop');
const version='24.20.0',hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(cache,{recursive:true});
async function download(name){const path=join(cache,name);try{return await readFile(path);}catch{const res=await fetch('https://nodejs.org/dist/v'+version+'/'+name);if(!res.ok)throw Error('Node download failed: '+res.status);const bytes=Buffer.from(await res.arrayBuffer());await writeFile(path,bytes);return bytes;}}
const sums=(await download('SHASUMS256.txt')).toString();
async function runtime(platform,arch){const prefix='node-v'+version+'-'+platform+'-'+arch,name=prefix+(platform==='win'?'.zip':'.tar.gz'),archive=await download(name),expected=sums.split('\n').find(l=>l.endsWith('  '+name))?.split(' ')[0];if(hash(archive)!==expected)throw Error('Official Node checksum mismatch: '+name);if(platform==='win'){const files=unzipSync(archive);return {node:files[prefix+'/node.exe'],license:files[prefix+'/LICENSE']};}execFileSync('tar',['-xzf',join(cache,name),'-C',cache,prefix+'/bin/node',prefix+'/LICENSE']);return {node:await readFile(join(cache,prefix,'bin/node')),license:await readFile(join(cache,prefix,'LICENSE'))};}
function build(pkg,target,os,arch,gui=false){execFileSync(process.env.GO_BINARY||'go',['build','-trimpath','-ldflags','-s -w'+(gui?' -H windowsgui':''),'-o',target,pkg],{cwd:go,env:{...process.env,GOOS:os,GOARCH:arch,CGO_ENABLED:'0'},stdio:'inherit'});}
for(const [os,arch] of [['darwin','arm64'],['darwin','amd64'],['windows','amd64']])build('./cmd/connector',join(cache,'connector-'+os+'-'+arch+(os==='windows'?'.exe':'')),os,arch);
execFileSync('lipo',['-create',join(cache,'connector-darwin-arm64'),join(cache,'connector-darwin-amd64'),'-output',join(cache,'connector')]);
execFileSync('codesign',['--force','--sign','-',join(cache,'connector')]);
const manifest={manifest_version:'0.3',name:'underwriting-desk',display_name:'Underwriting Desk',version:'0.3.0',description:'Connect Claude to your local investment workspace. Read only analyst-released evidence and propose work for review.',author:{name:'Cooper Reed'},server:{type:'binary',entry_point:'server/connector',mcp_config:{command:'${__dirname}/server/connector',args:[],platform_overrides:{win32:{command:'${__dirname}/server/connector.exe'}}}},compatibility:{platforms:['darwin','win32']},tools_generated:true};
const entry=(bytes,executable=false)=>[new Uint8Array(bytes),{os:3,attrs:(executable?0o100755:0o100644)<<16}];
const extension=zipSync({'manifest.json':new TextEncoder().encode(JSON.stringify(manifest,null,2)),'server/connector':entry(await readFile(join(cache,'connector')),true),'server/connector.exe':entry(await readFile(join(cache,'connector-windows-amd64.exe')),true)},{level:6});
await writeFile(join(out,'Underwriting Desk.mcpb'),extension);
const base={};async function walk(dir,prefix){for(const item of await readdir(dir,{withFileTypes:true})){if(item.name.startsWith('.')||item.name.endsWith('.map'))continue;const p=join(dir,item.name),name=prefix+'/'+item.name;if(item.isSymbolicLink())throw Error('No symlinks in desktop package');if(item.isDirectory())await walk(p,name);else base[name]=entry(await readFile(p));}}
await walk(join(wb,'dist'),'dist');for(const name of runtimeFiles)base['mcp-server/'+name]=entry(await readFile(join(wb,'mcp-server',name)));
let notices='Underwriting Desk dependency notices. Not all listed development dependencies are included in the application.\n';
const pnpmRoot=join(wb,'node_modules/.pnpm');
async function licensePackages(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(!item.isDirectory())continue;const p=join(dir,item.name);if(item.name.startsWith('@')){await licensePackages(p);continue;}for(const file of await readdir(p,{withFileTypes:true})){if(file.isFile()&&/^(LICENSE|LICENCE|NOTICE)([.-]|$)/i.test(file.name)){notices+='\n\n'+item.name+' — '+file.name+'\n'+await readFile(join(p,file.name),'utf8');}}}}
for(const item of await readdir(pnpmRoot,{withFileTypes:true})){if(item.isDirectory()&&item.name!=='node_modules'){try{await licensePackages(join(pnpmRoot,item.name,'node_modules'));}catch(error){if(error.code!=='ENOENT')throw error;}}}
const goRoot=execFileSync(process.env.GO_BINARY||'go',['env','GOROOT'],{encoding:'utf8'}).trim();notices+='\n\nGo runtime\n'+await readFile(join(goRoot,'LICENSE'),'utf8').catch(()=>readFile(join(goRoot,'../LICENSE'),'utf8'));
base['THIRD-PARTY-NOTICES.txt']=entry(Buffer.from(notices));
base['desktop-start.mjs']=entry(await readFile(join(wb,'launcher/desktop-start.mjs')));base['Underwriting Desk.mcpb']=entry(extension);
const artifacts=[];
for(const [platform,nodeArch,goos,goarch,label] of [['darwin','arm64','darwin','arm64','Mac-Apple-Silicon'],['darwin','x64','darwin','amd64','Mac-Intel'],['win','x64','windows','amd64','Windows']]){
 const rt=await runtime(platform,nodeArch),entries={...base,['runtime/'+(platform==='win'?'node.exe':'node')]:entry(rt.node,true),'runtime/LICENSE':entry(rt.license)};
 entries['desktop-manifest.json']=entry(Buffer.from(JSON.stringify({files:Object.fromEntries(Object.entries(entries).map(([name,[bytes]])=>[name,{sha256:hash(bytes),bytes:bytes.length}]))})));
 await writeFile(join(go,'cmd/launcher/payload.zip'),zipSync(entries,{level:6}));
 const binary=join(cache,'Desk-'+label+(goos==='windows'?'.exe':''));build('./cmd/launcher',binary,goos,goarch,goos==='windows');
 let result;if(goos==='darwin'){
 const app=join(out,label,'Underwriting Desk.app','Contents');await mkdir(join(app,'MacOS'),{recursive:true});await copyFile(binary,join(app,'MacOS','UnderwritingDesk'));await chmod(join(app,'MacOS','UnderwritingDesk'),0o755);
 const plist='<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>UnderwritingDesk</string><key>CFBundleIdentifier</key><string>com.dailyai.underwritingdesk</string><key>CFBundleName</key><string>Underwriting Desk</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.3.0</string><key>LSMinimumSystemVersion</key><string>12.0</string></dict></plist>';
 await writeFile(join(app,'Info.plist'),plist);execFileSync('codesign',['--force','--sign','-',dirname(app)]);result=join(out,'Underwriting-Desk-'+label+'.zip');execFileSync('ditto',['-c','-k','--keepParent',dirname(app),result]);
 }else{result=join(out,'Underwriting-Desk-Windows.exe');await copyFile(binary,result);}
 const bytes=await readFile(result);artifacts.push({file:result.split('/').at(-1),bytes:bytes.length,sha256:hash(bytes),nativeTested:false});console.log('Built',result);
}
artifacts.push({file:'Underwriting Desk.mcpb',bytes:extension.length,sha256:hash(extension),nativeTested:false});await writeFile(join(out,'artifacts.json'),JSON.stringify({version:'0.3.0-pilot',nodeVersion:version,signed:false,artifacts},null,2));console.log(JSON.stringify(artifacts,null,2));
