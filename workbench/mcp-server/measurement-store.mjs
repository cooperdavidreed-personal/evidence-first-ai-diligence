import {randomUUID} from 'node:crypto';
const components=new Set(['save','release','revoke','backup','restore','delete','read','mcp-read','mcp-propose']);
export function measurementMethods(db){
 db.exec('CREATE TABLE IF NOT EXISTS measurement_sessions(id TEXT PRIMARY KEY,mode TEXT NOT NULL,started TEXT NOT NULL,finished TEXT,duration_ms REAL,outcome TEXT,corrections INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS measurement_events(session TEXT NOT NULL,component TEXT NOT NULL,elapsed_ms REAL NOT NULL,success INTEGER NOT NULL)');
 const starts=new Map();
 const active=()=>db.prepare('SELECT * FROM measurement_sessions WHERE finished IS NULL').get();
 function exported(){return {schema:'desk.local-measurements/v1',privacy:'Opt-in local records. No company names, content, prompts, identity or provider usage collected.',sessions:db.prepare('SELECT * FROM measurement_sessions').all().map(s=>({...s,totalTimeStatus:s.duration_ms===null?'unavailable or not finished':'measured monotonic elapsed time',cost:{providerUSD:null,providerStatus:'not collected; existing external subscription',allocatedSubscriptionUSD:null,hardwareEnergyUSD:null},components:db.prepare('SELECT component,elapsed_ms,success FROM measurement_events WHERE session=?').all(s.id)}))};}
 return {
  measurementStatus:()=>({active:active()??null}),
  measurementStart(mode){if(!['Desk','Excel + assistant'].includes(mode))throw Error('Choose a supported baseline or Desk task');if(active())throw Error('Finish the current task before starting another');const id=randomUUID();db.prepare('INSERT INTO measurement_sessions(id,mode,started) VALUES(?,?,?)').run(id,mode,new Date().toISOString());starts.set(id,process.hrtime.bigint());return {id};},
  measurementFinish(outcome){if(!['completed','failed','abandoned'].includes(outcome))throw Error('Choose the task outcome');const s=active();if(!s)throw Error('No task is running');const start=starts.get(s.id),elapsed=start===undefined?null:Number(process.hrtime.bigint()-start)/1e6;db.prepare('UPDATE measurement_sessions SET finished=?,duration_ms=?,outcome=? WHERE id=?').run(new Date().toISOString(),elapsed,outcome,s.id);starts.delete(s.id);return {outcome,duration_ms:elapsed};},
  measurementCorrection(){const s=active();if(!s)throw Error('No task is running');db.prepare('UPDATE measurement_sessions SET corrections=corrections+1 WHERE id=?').run(s.id);return {recorded:true};},
  measurementComponent(component,elapsed,success){if(!components.has(component)||!Number.isFinite(elapsed)||elapsed<0)return;const s=active();if(!s||s.mode!=='Desk')return;const count=db.prepare('SELECT COUNT(*) AS n FROM measurement_events WHERE session=?').get(s.id).n;if(count>=10000)return;db.prepare('INSERT INTO measurement_events VALUES(?,?,?,?)').run(s.id,component,elapsed,success?1:0);},
  measurementExport:exported,
  measurementDelete(){db.exec('BEGIN IMMEDIATE');try{db.exec('DELETE FROM measurement_events;DELETE FROM measurement_sessions');db.exec('COMMIT');starts.clear();return {deleted:true};}catch(e){db.exec('ROLLBACK');throw e;}},
 };
}
