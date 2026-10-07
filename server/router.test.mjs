import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createIntegralsHandler } from './router.mjs';
import { PRESTIGE_PRICE, GENERATORS, createState } from '../shared/economy.mjs';
import { PROFILE_EMOJIS, DEFAULT_EMOJI, isProfileEmoji, profileEmoji } from '../shared/profile.mjs';

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
    assert.equal(created.data.player.listed,true);assert.equal(created.data.player.emoji,DEFAULT_EMOJI);assert.equal(created.data.player.generators.length,GENERATORS.length);
    const action=await f.request(p+'/action','POST',{id:actionId(1),type:'click',amount:20},token);
    assert.equal(action.data.player.totalEarned,20);
    const rating=await f.request(p+'/leaderboard');
    assert.deepEqual(Object.keys(rating.data.entries[0]).sort(),['balance','emoji','id','nickname','prestige','rank','totalEarned']);
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
test('curated emoji choices validate on create and update, persist on reads and cannot inject profile fields',async()=>{
  assert.equal(new Set(PROFILE_EMOJIS).size,PROFILE_EMOJIS.length);assert.ok(PROFILE_EMOJIS.includes(DEFAULT_EMOJI));
  assert.equal(profileEmoji(undefined),DEFAULT_EMOJI);assert.equal(profileEmoji('<script>'),DEFAULT_EMOJI);
  const f=await fixture();try{
    const created=await f.request(p+'/players','POST',{nickname:'Квант',emoji:'🧪'});
    assert.equal(created.status,201);assert.equal(created.data.player.emoji,'🧪');const token=created.data.token;
    for(const choice of PROFILE_EMOJIS){
      assert.equal(isProfileEmoji(choice),true);
      const updated=await f.request(p+'/profile','PATCH',{emoji:choice},token);
      assert.equal(updated.status,200);assert.equal(updated.data.player.emoji,choice);
      assert.equal((await f.request(p+'/state','GET',undefined,token)).data.player.emoji,choice);
    }
    const invalid=['','🧪🧪','<img src=x>','plain text',null,12,{},['🧪'],'🧪 '];
    for(const value of invalid){
      assert.equal(isProfileEmoji(value),false);
      const create=await f.request(p+'/players','POST',{emoji:value});assert.equal(create.status,400);assert.equal(create.data.error.code,'invalid_emoji');
      const patch=await f.request(p+'/profile','PATCH',{emoji:value,nickname:'Не сохранять'},token);assert.equal(patch.status,400);assert.equal(patch.data.error.code,'invalid_emoji');
    }
    const renamed=await f.request(p+'/profile','PATCH',{nickname:'Новая теорема'},token);
    assert.equal(renamed.data.player.emoji,PROFILE_EMOJIS.at(-1));assert.equal(renamed.data.player.nickname,'Новая теорема');
    assert.equal((await f.request(p+'/profile','PATCH',{emoji:DEFAULT_EMOJI,balance:10000},token)).status,400);
    const db=new DatabaseSync(f.dbPath);const rows=db.prepare('SELECT nickname,emoji,total_earned FROM integrals_players').all();db.close();
    assert.deepEqual(rows.map(row=>({...row})),[{nickname:'Новая теорема',emoji:PROFILE_EMOJIS.at(-1),total_earned:0}]);
  }finally{await f.close();}
});
test('leaderboard reports separate current balance, lifetime score, prestige, emoji and rank without private state',async()=>{
  const f=await fixture();try{
    const first=(await f.request(p+'/players','POST',{nickname:'Первый',emoji:'🚀'})).data;
    const second=(await f.request(p+'/players','POST',{nickname:'Второй',emoji:'🤖'})).data;
    await f.request(p+'/action','POST',{id:actionId(60),type:'click',amount:20},first.token);
    await f.request(p+'/action','POST',{id:actionId(61),type:'buy',itemId:'autoclick'},first.token);
    await f.request(p+'/action','POST',{id:actionId(62),type:'click',amount:19},second.token);
    const db=new DatabaseSync(f.dbPath),row=db.prepare('SELECT * FROM integrals_players WHERE public_id=?').get(second.player.id),state=JSON.parse(row.state);
    state.prestige=7;db.prepare('UPDATE integrals_players SET state=?,prestige=? WHERE id=?').run(JSON.stringify(state),7,row.id);db.close();
    const rating=(await f.request(p+'/leaderboard')).data;
    assert.deepEqual(rating.entries,[
      {id:first.player.id,nickname:'Первый',emoji:'🚀',totalEarned:20,balance:5,prestige:0,rank:1},
      {id:second.player.id,nickname:'Второй',emoji:'🤖',totalEarned:19,balance:19,prestige:7,rank:2},
    ]);
    assert.ok(!JSON.stringify(rating).includes(first.token));assert.ok(!JSON.stringify(rating).includes(second.token));
    for(const entry of rating.entries)assert.deepEqual(Object.keys(entry).sort(),['balance','emoji','id','nickname','prestige','rank','totalEarned']);
    await f.request(p+'/profile','PATCH',{listed:false},first.token);
    const hidden=(await f.request(p+'/leaderboard')).data.entries;assert.equal(hidden.length,1);assert.equal(hidden[0].id,second.player.id);assert.equal(hidden[0].rank,1);
  }finally{await f.close();}
});
test('old database receives an additive emoji migration and recovery, receipts and selected emoji survive restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'integrals-legacy-')),dbPath=join(dir,'old.sqlite'),t=1_000_000;
  const token='ir_'+'b'.repeat(43),tokenHash=createHash('sha256').update(token).digest('hex'),publicId='b1b4ec24-4ca0-4a52-aac3-727940ae9556';
  const legacy=createState(t);legacy.balance=73.5;legacy.totalEarned=12345;legacy.runEarned=345;legacy.prestige=7;legacy.prestigeCount=2;legacy.clicks=5;
  const replay={id:actionId(70),type:'click',amount:5};
  const db=new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE integrals_players (
    id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL,
    total_earned REAL NOT NULL DEFAULT 0, prestige REAL NOT NULL DEFAULT 0,
    click_tokens REAL NOT NULL DEFAULT 24, click_refill INTEGER NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  ); CREATE TABLE integrals_actions (
    player_id INTEGER NOT NULL REFERENCES integrals_players(id), action_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(player_id,action_id)
  );`);
  db.prepare('INSERT INTO integrals_players(id,public_id,token_hash,nickname,state,total_earned,prestige,click_refill,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(42,publicId,tokenHash,'Прежний профиль',JSON.stringify(legacy),legacy.totalEarned,legacy.prestige,t,t,t);
  db.prepare('INSERT INTO integrals_actions(player_id,action_id,fingerprint,created_at) VALUES(?,?,?,?)').run(42,replay.id,createHash('sha256').update(JSON.stringify({type:'click',amount:5})).digest('hex'),t);
  db.close();let f;
  try{
    f=await fixture({dbPath});
    const migrated=new DatabaseSync(dbPath),row=migrated.prepare('SELECT * FROM integrals_players').get();
    assert.equal(row.id,42);assert.equal(row.public_id,publicId);assert.equal(row.token_hash,tokenHash);assert.equal(row.emoji,DEFAULT_EMOJI);assert.equal(row.state,JSON.stringify(legacy));
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM integrals_actions').get().count,1);migrated.close();
    const loaded=await f.request(p+'/state','GET',undefined,token);assert.equal(loaded.status,200);assert.equal(loaded.data.player.emoji,DEFAULT_EMOJI);assert.equal(loaded.data.player.balance,73.5);
    const repeated=await f.request(p+'/action','POST',replay,token);assert.equal(repeated.status,200);assert.equal(repeated.data.player.clicks,5);
    assert.equal((await f.request(p+'/profile','PATCH',{emoji:'⚛️'},token)).data.player.emoji,'⚛️');
    await f.close();f=await fixture({dbPath});
    const reopened=(await f.request(p+'/state','GET',undefined,token)).data.player;
    assert.equal(reopened.emoji,'⚛️');assert.equal(reopened.id,publicId);assert.equal(reopened.nickname,'Прежний профиль');assert.equal(reopened.totalEarned,12345);assert.equal(reopened.balance,73.5);assert.equal(reopened.prestige,7);
    const rating=(await f.request(p+'/leaderboard')).data;assert.deepEqual(rating.entries,[{id:publicId,nickname:'Прежний профиль',emoji:'⚛️',totalEarned:12345,balance:73.5,prestige:7,rank:1}]);
    assert.ok(!JSON.stringify(rating).includes(token));assert.ok(!JSON.stringify(rating).includes(tokenHash));
    const persisted=new DatabaseSync(dbPath);assert.equal(persisted.prepare('PRAGMA table_info(integrals_players)').all().filter(column=>column.name==='emoji').length,1);assert.equal(persisted.prepare('SELECT token_hash FROM integrals_players WHERE id=42').get().token_hash,tokenHash);persisted.close();
  }finally{if(f?.server.listening)await f.close();rmSync(dir,{recursive:true,force:true});}
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
    assert.equal(started.data.player.activeEvent.penalty,started.data.player.activeEvent.reward);
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
test('server prestige rejects historical wealth without current funds and accepts the exact price',async()=>{
  const f=await fixture();try{
    const {data:{token}}=await f.request(p+'/players','POST',{});
    const db=new DatabaseSync(f.dbPath),row=db.prepare('SELECT * FROM integrals_players').get(),state=JSON.parse(row.state);
    state.runEarned=1e18;state.totalEarned=1e18;state.balance=PRESTIGE_PRICE-1;
    db.prepare('UPDATE integrals_players SET state=? WHERE id=?').run(JSON.stringify(state),row.id);
    const denied=await f.request(p+'/action','POST',{id:actionId(40),type:'prestige'},token);
    assert.equal(denied.status,400);assert.equal(denied.data.error.code,'prestige_locked');
    assert.equal(JSON.parse(db.prepare('SELECT state FROM integrals_players WHERE id=?').get(row.id).state).prestigeCount,0);
    state.balance=PRESTIGE_PRICE;db.prepare('UPDATE integrals_players SET state=? WHERE id=?').run(JSON.stringify(state),row.id);
    const accepted=await f.request(p+'/action','POST',{id:actionId(41),type:'prestige'},token);
    assert.equal(accepted.status,200);assert.equal(accepted.data.player.balance,0);assert.equal(accepted.data.player.totalEarned,1e18);assert.equal(accepted.data.player.prestigeCount,1);db.close();
  }finally{await f.close();}
});
test('persisted ten-stage profiles migrate on read and can buy the new generator without losing recovery data',async()=>{
  const f=await fixture();try{
    const {data:{token,player}}=await f.request(p+'/players','POST',{nickname:'Старая лаборатория'});
    const db=new DatabaseSync(f.dbPath),row=db.prepare('SELECT * FROM integrals_players').get(),legacy=JSON.parse(row.state);
    legacy.generators=[2,1,0,0,0,0,0,0,0,0];legacy.achievementRecords.generators=[5,2,0,0,0,0,0,0,0,0];
    legacy.balance=20_000_000_000_000;legacy.totalEarned=30_000_000_000_000;legacy.runEarned=legacy.totalEarned;legacy.upgrades=['click-1'];legacy.achievements=['all','upgrades-24'];
    db.prepare('UPDATE integrals_players SET state=? WHERE id=?').run(JSON.stringify(legacy),row.id);
    const loaded=await f.request(p+'/state','GET',undefined,token);assert.equal(loaded.status,200);
    const migrated=loaded.data.player;assert.equal(migrated.id,player.id);assert.equal(migrated.nickname,'Старая лаборатория');
    assert.deepEqual(migrated.generators,[...legacy.generators,0]);assert.deepEqual(migrated.achievementRecords.generators,[...legacy.achievementRecords.generators,0]);
    assert.equal(migrated.balance,legacy.balance);assert.equal(migrated.totalEarned,legacy.totalEarned);assert.equal(migrated.stats.cps,2.5);assert.ok(migrated.achievements.includes('all'));
    const bought=await f.request(p+'/action','POST',{id:actionId(50),type:'buy',itemId:'superintelligence'},token);
    assert.equal(bought.status,200);assert.equal(bought.data.player.generators[10],1);assert.equal(bought.data.player.balance,10_000_000_000_000);
    assert.equal(bought.data.player.stats.cps,240_000_002.5);
    const persisted=JSON.parse(db.prepare('SELECT state FROM integrals_players WHERE id=?').get(row.id).state);db.close();
    assert.equal(persisted.generators.length,11);assert.equal(persisted.generators[10],1);assert.ok(persisted.achievements.includes('stage-superintelligence-1'));
  }finally{await f.close();}
});
