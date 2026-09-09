import {randomBytes} from 'node:crypto';
export const connectionTool = {name:'verify_desk_connection',description:'Complete the current Desk setup test using the exact code shown in its onboarding wizard. Does not read company evidence or approve any investment work.',inputSchema:{type:'object',properties:{code:{type:'string'}},required:['code'],additionalProperties:false}};
export function onboardingMethods(db, now=()=>Date.now()) {
  db.exec('CREATE TABLE IF NOT EXISTS desktop_onboarding (id INTEGER PRIMARY KEY CHECK(id=1), code TEXT, expires INTEGER, verified INTEGER, completed INTEGER NOT NULL DEFAULT 0)');
  db.exec('INSERT OR IGNORE INTO desktop_onboarding(id) VALUES (1)');
  return {
    onboardingStatus(){const row=db.prepare('SELECT expires,verified,completed FROM desktop_onboarding WHERE id=1').get();return {verified:!!row.verified,expired:!row.verified&&row.expires!==null&&row.expires<=now(),expires:row.expires,completed:!!row.completed};},
    beginConnectionTest(){const code=randomBytes(18).toString('hex'),expires=now()+10*60*1000;db.prepare('UPDATE desktop_onboarding SET code=?,expires=?,verified=NULL WHERE id=1').run(code,expires);return {code,expires};},
    verifyConnection(code){if(typeof code!=='string'||! /^[a-f0-9]{36}$/.test(code))throw Error('Invalid connection code');const result=db.prepare('UPDATE desktop_onboarding SET verified=?,code=NULL WHERE id=1 AND code=? AND expires>? AND verified IS NULL').run(now(),code,now());if(!result.changes)throw Error('Connection code expired or already used. Start a fresh test in Underwriting Desk.');return {status:'CONNECTION_VERIFIED',companyEvidenceShared:false};},
    completeOnboarding(){db.prepare('UPDATE desktop_onboarding SET completed=1 WHERE id=1').run();return {completed:true};},
  };
}
