import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createIntegralsHandler } from './router.mjs';

async function fixture(options={}){
  const dir=mkdtempSync(join(tmpdir(),'integrals-test-'));let time=1_000_000;
  const dbPath=options.dbPath||join(dir,'game.sqlite');
  const api=createIntegralsHandler({dbPath,now:()=>time,...options});
  const server=createServer((req,res)=>{if(!api.handle(req,res)){res.writeHead(200);res.end('existing-game');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function request(path,method='GET',body,token,headers={}){
    const r=await fetch(base+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,headers:r.headers};
  }
  return {api,server,dbPath,dir,request,setTime:t=>{time=t;},async close(remove=true){await new Promise(resolve=>server.close(resolve));api.close();if(remove)rmSync(dir,{recursive:true,force:true});}};
}
const p='/integrals-api';
const actionId=(n,time=1_000_000)=>`${time}-${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
test('authentication, independent router, origin filtering and explicit unsupported period',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/health')).data,'existing-game');
    assert.equal((await f.request(p+'/health')).status,200);
    assert.equal((await f.request(p+'/state')).status,401);
    assert.equal((await f.request(p+'/state','GET',undefined,'ir_'+ 'a'.repeat(43))).status,401);
    assert.equal((await f.request(p+'/players','POST',{},undefined,{Origin:'https://attacker.invalid'})).status,403);
    assert.equal((await f.request(p+'/leaderboard?period=week')).status,400);
    assert.equal((await f.request(p+'/not-found')).status,404);
    assert.equal((await f.request(p+'/state','POST',{})).status,405);
  }finally{await f.close();}
});
test('profile creation, durable recovery after reopen, hash-only storage and public ranking minimization',async()=>{
  const f=await fixture();let token,publicId;
  try{
    const created=await f.request(p+'/players','POST',{nickname:'Интегратор'});
    assert.equal(created.status,201);token=created.data.token;publicId=created.data.player.id;
    assert.equal(created.data.player.listed,true);assert.equal(created.data.player.generators.length,10);
    const action=await f.request(p+'/action','POST',{id:actionId(1),type:'click',amount:20},token);
    assert.equal(action.data.player.totalEarned,20);
    const rating=await f.request(p+'/leaderboard');
    assert.deepEqual(Object.keys(rating.data.entries[0]).sort(),['id','nickname','prestige','rank','totalEarned']);
    assert.equal(rating.data.entries[0].id,publicId);assert.ok(!JSON.stringify(rating.data).includes(token));
    const hide=await f.request(p+'/profile','PATCH',{listed:false},token);assert.equal(hide.data.player.listed,false);
    assert.equal((await f.request(p+'/leaderboard')).data.entries.length,0);
    const db=new DatabaseSync(f.dbPath);const row=db.prepare('SELECT * FROM integrals_players').get();db.close();
    assert.match(row.token_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(row).includes(token));
    await f.close(false);
    assert.ok(!readFileSync(f.dbPath).includes(Buffer.from(token)));
    const reopened=await fixture({dbPath:f.dbPath});
    try{const state=await reopened.request(p+'/state','GET',undefined,token);assert.equal(state.status,200);assert.equal(state.data.player.totalEarned,20);assert.equal(state.data.player.id,publicId);}finally{await reopened.close();}
  }finally{if(f.server.listening)await f.close();else rmSync(f.dir,{recursive:true,force:true});}
});
test('idempotency and races: duplicate clicks execute once, reusing id for different payload fails',async()=>{
  const f=await fixture();try{
    const {data:{token}}=await f.request(p+'/players','POST',{});
    const action={id:actionId(2),type:'click',amount:10};
    const results=await Promise.all(Array.from({length:8},()=>f.request(p+'/action','POST',action,token)));
    assert.ok(results.every(r=>r.status===200));
    assert.equal((await f.request(p+'/state','GET',undefined,token)).data.player.clicks,10);
    assert.equal((await f.request(p+'/action','POST',{...action,amount:11},token)).status,409);
    assert.equal((await f.request(p+'/action','POST',{id:actionId(3),type:'click',amount:-1},token)).status,400);
    assert.equal((await f.request(p+'/action','POST',{id:actionId(4),type:'click',amount:1,balance:10000},token)).status,400);
    assert.equal((await f.request(p+'/state','GET',undefined,token)).data.player.totalEarned,10);
  }finally{await f.close();}
});
test('click limiter has burst 24 and refills at 12 per second; parallel distinct actions cannot overspend',async()=>{
  const f=await fixture();try{
    const {data:{token}}=await f.request(p+'/players','POST',{});
    assert.equal((await f.request(p+'/action','POST',{id:actionId(5),type:'click',amount:24},token)).status,200);
    assert.equal((await f.request(p+'/action','POST',{id:actionId(6),type:'click',amount:1},token)).status,429);
    f.setTime(1001000);
    assert.equal((await f.request(p+'/action','POST',{id:actionId(7),type:'click',amount:12},token)).status,200);
    const buys=await Promise.all([8,9,10].map(i=>f.request(p+'/action','POST',{id:actionId(i),type:'buy',itemId:'autoclick'},token)));
    assert.equal(buys.filter(r=>r.status===200).length,2);assert.equal(buys.filter(r=>r.status===400).length,1);
    const state=(await f.request(p+'/state','GET',undefined,token)).data.player;
    assert.equal(state.generators[0],2);assert.equal(state.balance,3);
  }finally{await f.close();}
});
test('profile fields are validated and cannot modify score or inject markup',async()=>{
  const f=await fixture();try{
    const {data:{token}}=await f.request(p+'/players','POST',{});
    for(const body of [{nickname:'<script>'},{nickname:'me@example.org'},{listed:'false'},{totalEarned:1000000}])assert.equal((await f.request(p+'/profile','PATCH',body,token)).status,400);
    const response=await f.request(p+'/profile','PATCH',{nickname:'Новая теорема',listed:false},token);
    assert.equal(response.status,200);assert.equal(response.data.player.nickname,'Новая теорема');assert.equal(response.data.player.totalEarned,0);
  }finally{await f.close();}
});
test('missing configured storage fails closed without intercepting other games',async()=>{
  const f=await fixture({dbPath:''});try{
    assert.equal((await f.request(p+'/health')).status,503);
    assert.equal((await f.request(p+'/players','POST',{})).status,503);
    assert.equal((await f.request('/cube-health')).data,'existing-game');
  }finally{await f.close();}
});
test('receipts expire safely: replay after pruning is rejected without applying it again',async()=>{
  const f=await fixture();try{
    const {data:{token}}=await f.request(p+'/players','POST',{});
    const action={id:actionId(20),type:'click',amount:5};
    assert.equal((await f.request(p+'/action','POST',action,token)).status,200);
    f.setTime(1_000_000+14*60_000);
    assert.equal((await f.request(p+'/action','POST',action,token)).data.player.clicks,5);
    f.setTime(1_000_000+16*60_000);
    await f.request(p+'/health');
    const db=new DatabaseSync(f.dbPath);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM integrals_actions').get().count,0);
    const before=db.prepare('SELECT state FROM integrals_players').get().state;
    const stale=await f.request(p+'/action','POST',action,token);
    assert.equal(stale.status,409);assert.equal(stale.data.error.code,'action_expired');
    assert.equal(db.prepare('SELECT state FROM integrals_players').get().state,before);db.close();
    const valid=await f.request(p+'/action','POST',{id:actionId(21,1_960_000),type:'click',amount:1},token);
    assert.equal(valid.status,200);assert.equal(valid.data.player.clicks,6);
  }finally{await f.close();}
});
test('untrusted action timestamps and malformed IDs fail before updating player state',async()=>{
  const f=await fixture();try{
    const {data:{token}}=await f.request(p+'/players','POST',{});
    const future=await f.request(p+'/action','POST',{id:actionId(22,1_060_001),type:'click'},token);
    assert.equal(future.status,409);assert.equal(future.data.error.code,'action_from_future');
    const malformed=await f.request(p+'/action','POST',{id:'old-static-id',type:'click'},token);
    assert.equal(malformed.status,400);assert.equal(malformed.data.error.code,'invalid_action_id');
    assert.equal((await f.request(p+'/state','GET',undefined,token)).data.player.clicks,0);
    assert.equal((await f.request(p+'/action','POST',{id:actionId(23,1_060_000),type:'click'},token)).status,200);
  }finally{await f.close();}
});
test('event API keeps answers private, enforces unlock and scores only the server challenge once',async()=>{
  const f=await fixture();try{
    const {data:{token}}=await f.request(p+'/players','POST',{});
    const start={id:actionId(30),type:'event_start',itemId:'school'};
    assert.equal((await f.request(p+'/action','POST',start,token)).data.error.code,'event_locked');
    const db=new DatabaseSync(f.dbPath),row=db.prepare('SELECT * FROM integrals_players').get(),state=JSON.parse(row.state);
    state.generators[1]=1;db.prepare('UPDATE integrals_players SET state=? WHERE id=?').run(JSON.stringify(state),row.id);
    const started=await f.request(p+'/action','POST',start,token);
    assert.equal(started.status,200);assert.equal(started.data.player.activeEvent._answers,undefined);
    assert.ok(!JSON.stringify(started.data).includes('_answers'));
    const saved=JSON.parse(db.prepare('SELECT state FROM integrals_players WHERE id=?').get(row.id).state),event=saved.activeEvent;
    assert.equal((await f.request(p+'/state','GET',undefined,token)).data.player.activeEvent._answers,undefined);
    const forged={id:actionId(31),type:'event_answer',itemId:event.id,answers:event._answers,reward:1e10};
    assert.equal((await f.request(p+'/action','POST',forged,token)).status,400);
    const answer={id:actionId(32),type:'event_answer',itemId:event.id,answers:event._answers};
    const win=await f.request(p+'/action','POST',answer,token);
    assert.equal(win.status,200);assert.equal(win.data.player.totalEarned,event.reward);assert.equal(win.data.player.eventStats.wins,1);
    assert.equal((await f.request(p+'/action','POST',answer,token)).data.player.totalEarned,event.reward);
    assert.equal((await f.request(p+'/action','POST',{...answer,id:actionId(33)},token)).data.error.code,'event_unavailable');
    db.close();
  }finally{await f.close();}
});
