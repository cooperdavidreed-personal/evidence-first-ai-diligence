import {isLoopbackHost} from './review-http.mjs';
export function desktopHandler(store,token,desktop){return async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const host=req.headers.host;
  if(!isLoopbackHost(host)||req.headers['x-desk-session']!==token||(req.headers.origin&&req.headers.origin!==`http://${host}`)){res.writeHead(403);res.end('{}');return;}
  try {
    if((req.url??'').split('?')[0]==='/__desk/desktop-extension'){
      if(req.method!=='GET'){res.writeHead(405);res.end('{}');return;}
      if(!desktop.readExtension)throw Error('Reopen the desktop application to download its Claude extension.');
      const bytes=await desktop.readExtension();res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="Underwriting Desk.mcpb"');res.end(bytes);return;
    }
    if(req.method==='GET'){res.end(JSON.stringify({version:desktop.version,platform:process.platform,...store.onboardingStatus()}));return;}
    if(req.method!=='POST'){res.writeHead(405);res.end('{}');return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024)throw Error('Request too large');chunks.push(chunk);}
    const {action}=JSON.parse(Buffer.concat(chunks).toString());let result;
    if(action==='test')result=store.beginConnectionTest();
    else if(action==='complete')result=store.completeOnboarding();
    else if(action==='connect'){await desktop.openExtension();result={opened:true};}
    else if(action==='quit'){result={closed:true};setTimeout(()=>desktop.quit(),200);}
    else throw Error('Unknown operation');
    res.end(JSON.stringify(result));
  }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
};}
