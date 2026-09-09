import {readFileSync} from 'node:fs';import {buildOperatingReview} from '../mcp-server/operating-review.mjs';
const template=JSON.parse(readFileSync(new URL('../../examples/operating-review/case.json',import.meta.url)));
const inputs=JSON.parse(readFileSync(0,'utf8'));const outputs=inputs.map(values=>{const d=structuredClone(template);d.sources=d.sources.slice(0,1);d.sources[0].mapping.rows.forEach((r,i)=>r.value=values[i]);return buildOperatingReview(d);});process.stdout.write(JSON.stringify(outputs));
