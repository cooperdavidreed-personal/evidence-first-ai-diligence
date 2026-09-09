// Deterministic, bounded monthly operating review. No inferred mappings or model calls.
export const operatingMetrics=['revenue','ebitda','cash','debt'];
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const stamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;}
export function operatingBasis(deal){return JSON.stringify({config:deal.operatingReview??null,sources:deal.sources.filter(s=>['accepted','superseded'].includes(s.status)).map(s=>({id:s.id,digest:s.digest,status:s.status,availableOn:s.availableOn??null,mapping:s.mapping}))});}
export function buildOperatingReview(deal){
 const config=deal.operatingReview;
 if(!config)return null;
 const {period,currency,scenario,cutoff,minimumCash}=config;
 const exclusions=[],eligible=[];
 const candidates=deal.sources.filter(s=>['accepted','superseded'].includes(s.status));
 const dated=candidates.filter(s=>s.availableOn&&validDate(s.availableOn)&&s.availableOn<=cutoff);
 const replaced=new Set(dated.map(s=>s.replaces).filter(Boolean));
 const admittedSources=dated.filter(s=>!replaced.has(s.id)).map(s=>s.id);
 for(const source of candidates){
  if(!source.availableOn||!validDate(source.availableOn)){exclusions.push({sourceId:source.id,reason:'Availability date unconfirmed'});continue;}
  if(source.availableOn>cutoff){exclusions.push({sourceId:source.id,reason:'Available after the review cutoff'});continue;}
  if(!admittedSources.includes(source.id)||!source.mapping)continue;
  for(const row of source.mapping.rows)if(row.period===period&&source.mapping.currency===currency&&(row.scenario??'Base')===scenario){
   if(row.periodType!==(row.metric==='cash'||row.metric==='debt'?'as-of':'month')){exclusions.push({sourceId:source.id,reason:'Period duration is unconfirmed or does not match monthly review'});continue;}
   if(row.basis==='actual'||row.basis==='forecast')eligible.push({...row,sourceId:source.id,sourceDigest:source.digest,availableOn:source.availableOn});
  }
 }
 const lines=operatingMetrics.map(metric=>{
  const actuals=eligible.filter(r=>r.metric===metric&&r.basis==='actual'),forecasts=eligible.filter(r=>r.metric===metric&&r.basis==='forecast');
  const actual=actuals.length===1?actuals[0]:null,forecast=forecasts.length===1?forecasts[0]:null;
  const conflict=actuals.length>1||forecasts.length>1,comparable=!!actual&&!!forecast&&actual.definition===forecast.definition;
  return {metric,actual,forecast,delta:comparable&&!conflict?actual.value-forecast.value:null,status:conflict?'conflicting':!actual?'missing actual':!forecast?'missing forecast':!comparable?'definition changed':'comparable'};
 });
 const get=(metric,basis)=>lines.find(l=>l.metric===metric)?.[basis]??null;
 const derived=[];
 function add(label,actual,forecast,refs,explanation){derived.push({label,actual,forecast,delta:actual!==null&&forecast!==null?actual-forecast:null,refs,explanation});}
 const cash=get('cash','actual'),debt=get('debt','actual'),fc=get('cash','forecast'),fd=get('debt','forecast');
 const coherent=(a,b)=>a&&b&&a.sourceId===b.sourceId;
 add('Net debt',coherent(cash,debt)?debt.value-cash.value:null,coherent(fc,fd)&&cash&&debt&&cash.definition===fc.definition&&debt.definition===fd.definition?fd.value-fc.value:null,[cash,debt,fc,fd].filter(Boolean).map(r=>r.ref),'Debt less cash, from the same source and period. Not a leverage multiple.');
 add('Cash above analyst minimum',cash?cash.value-minimumCash:null,null,cash?[cash.ref]:[],'Cash less the named analyst minimum; not a contractual covenant or cash runway.');
 const revenue=get('revenue','actual'),ebitda=get('ebitda','actual');
 add('EBITDA margin (%)',coherent(revenue,ebitda)&&revenue.value>0?100*ebitda.value/revenue.value:null,null,[revenue,ebitda].filter(Boolean).map(r=>r.ref),'Reported monthly EBITDA divided by monthly revenue. No annualization.');
 const concerns=lines.filter(l=>l.status!=='comparable').map(l=>({key:l.metric,question:'Confirm '+l.metric+' evidence for '+period,why:l.status,refs:[l.actual,l.forecast].filter(Boolean).map(r=>r.ref)}));
 if(cash&&cash.value<minimumCash)concerns.push({key:'cash-minimum',question:'How will liquidity be restored above the analyst minimum?',why:'Cash is '+(minimumCash-cash.value).toLocaleString('en-US')+' '+currency+' below the analyst minimum.',refs:[cash.ref]});
 return {admittedSources,period,currency,scenario,cutoff,minimumCash,owner:config.owner,lines,derived,concerns,exclusions,basis:operatingBasis(deal)};
}
export function operatingText(deal){const r=buildOperatingReview(deal);if(!r)return [];const cite=ref=>{for(const source of deal.sources){const excerpt=source.excerpts.find(e=>e.id===ref);if(excerpt)return source.name+' — '+excerpt.locator;}return 'Source unavailable';};return ['Monthly operating review',r.period+' · '+r.scenario+' · '+r.currency+' · evidence available through '+r.cutoff,...r.lines.map(l=>l.metric+': actual '+(l.actual?.value??'unavailable')+'; forecast '+(l.forecast?.value??'unavailable')+'; variance '+(l.delta??'not comparable')+'; '+l.status+'; sources '+[l.actual,l.forecast].filter(Boolean).map(x=>cite(x.ref)).join('; ')),...r.derived.map(d=>d.label+': '+(d.actual??'unavailable')+(d.label.includes('%')?'%':' '+r.currency)+'. '+d.explanation+' Sources: '+d.refs.map(cite).join('; ')),'Minimum cash assumption: '+r.minimumCash+' '+r.currency+'; owner '+r.owner,...r.concerns.map(c=>'Requires attention: '+c.question+' '+c.why),...r.exclusions.map(e=>'Excluded: '+(deal.sources.find(s=>s.id===e.sourceId)?.name??'Unavailable source')+' — '+e.reason)];}
// A numeric claim can cite a real locator and still refer to the wrong fact.
// This checks mapped numbers only, not semantic entailment of arbitrary prose.
export function checkMetricClaim(deal,claim){
 const review=buildOperatingReview(deal);if(!review)return {grade:'unsupported',reason:'No selected review basis'};
 const line=review.lines.find(l=>l.metric===claim.metric),row=line?.[claim.basis];
 if(!row||line.status==='conflicting')return {grade:'unsupported',reason:'Missing or conflicting admitted metric'};
 if(claim.period!==review.period||claim.currency!==review.currency||claim.scenario!==review.scenario||claim.ref!==row.ref)return {grade:'unsupported',reason:'Citation or review basis does not match the claimed metric'};
 return Math.abs(row.value-claim.value)<0.005?{grade:'supported',reason:'Mapped numeric value agrees'}:{grade:'contradicted',reason:'Cited metric has a different value'};
}
