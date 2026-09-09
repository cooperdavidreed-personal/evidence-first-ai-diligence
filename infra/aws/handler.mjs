import {buildOperatingReview,checkMetricClaim} from './operating-review.mjs';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('./case.json',import.meta.url)));
// Fixed public synthetic case only. No uploaded company records, model access or persistent storage.
export async function handler(event){
 const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
 if(!event.requestContext?.authorizer?.jwt?.claims?.sub)return reply(403,{error:'Authentication required'});
 if(event.isBase64Encoded||typeof event.body!=='string'||Buffer.byteLength(event.body)>4096)return reply(400,{error:'Expected a JSON request under 4 KB'});
 try{const {claim}=JSON.parse(event.body);if(!claim||typeof claim.metric!=='string'||!['actual','forecast'].includes(claim.basis)||typeof claim.ref!=='string'||!Number.isFinite(claim.value))return reply(400,{error:'Invalid numeric claim'});const d=structuredClone(fixture);d.sources[0].status='superseded';d.sources[1].status='accepted';return reply(200,{case:'synthetic-monthly-review',review:buildOperatingReview(d),result:checkMetricClaim(d,claim)});}catch{return reply(400,{error:'Invalid request'});}
}
