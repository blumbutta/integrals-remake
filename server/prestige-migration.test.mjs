import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createIntegralsHandler} from './router.mjs';
import {PRESTIGE_VERSION,MAX_PRESTIGE,getStats} from '../shared/economy.mjs';

const initialTime=1_800_000_000_000;
function request(api,path,method='GET',body,token){return new Promise(resolve=>{
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{url:'/integrals-api'+path,method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},socket:{remoteAddress:'127.0.0.1'}});
  const res={writableEnded:false,destroyed:false,setHeader(){},writeHead(status){this.status=status;},end(raw){this.writableEnded=true;resolve({status:this.status,data:JSON.parse(raw)});}};
  assert.equal(api.handle(req,res),true);
});}
function withoutPrestige(state){const copy=structuredClone(state);for(const key of ['prestige','prestigeCount','prestigeVersion','legacyPrestige'])delete copy[key];return copy;}

test('startup migrates all accounts and ranking before reads, preserves saves and archives old prestige once',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'integrals-prestige-migration-')),dbPath=join(dir,'game.sqlite');let api;
  try{
    api=createIntegralsHandler({dbPath,now:()=>initialTime});const accounts=[];
    for(let i=0;i<6;i++){
      const created=await request(api,'/players','POST',{nickname:'Миграция престижа '+i});
      assert.equal(created.status,201);accounts.push(created.data);
    }
    api.close();api=null;
    const db=new DatabaseSync(dbPath),rows=db.prepare('SELECT * FROM integrals_players ORDER BY id').all();
    const cases=[
      {points:9e80,count:7,version:undefined,expected:7},
      {points:4e100,count:150,version:undefined,expected:MAX_PRESTIGE},
      {points:5e50,count:145,version:PRESTIGE_VERSION,expected:MAX_PRESTIGE},
      {points:999,count:9,version:PRESTIGE_VERSION,expected:9},
      {points:3,count:3,version:PRESTIGE_VERSION,expected:3,denormalized:888},
      {points:0,count:0,version:PRESTIGE_VERSION,expected:0},
    ];
    const before=[];
    for(let i=0;i<rows.length;i++){
      const state=JSON.parse(rows[i].state),example=cases[i];
      state.balance=12345.25+i;state.totalEarned=50000+i;state.runEarned=40000+i;
      state.clicks=87+i;state.generators[0]=10;state.upgrades=['click-1'];
      state.achievements=['first'];state.eventStats={wins:2,losses:1};state.eventCooldowns={school:initialTime+150000};
      state.prestige=example.points;state.prestigeCount=example.count;
      if(i===1)state.activeEvent={id:'preserved-challenge',eventId:'school',kind:'quiz',startedAt:initialTime,deadline:initialTime+60000,reward:example.points*6,penalty:example.points*6,prompts:[],data:{},_answers:[0,1,2]};
      if(example.version===undefined)delete state.prestigeVersion;else state.prestigeVersion=example.version;
      const encoded=JSON.stringify(state);before.push(state);
      db.prepare('UPDATE integrals_players SET state=?,prestige=?,total_earned=?,listed=? WHERE id=?').run(encoded,example.denormalized??example.points,state.totalEarned,i===1?0:1,rows[i].id);
    }
    db.prepare('INSERT INTO integrals_actions(player_id,action_id,fingerprint,created_at) VALUES(?,?,?,?)').run(rows[0].id,'migration-receipt','keep-this-receipt',initialTime);
    const metadata=db.prepare('SELECT id,public_id,token_hash,nickname,nickname_key,display_nickname,emoji,listed,total_earned,click_tokens,click_refill,created_at,updated_at FROM integrals_players ORDER BY id').all();
    db.close();

    const later=initialTime+3_600_000;
    api=createIntegralsHandler({dbPath,now:()=>later});
    const migratedDb=new DatabaseSync(dbPath),migrated=migratedDb.prepare('SELECT state,prestige FROM integrals_players ORDER BY id').all();
    assert.deepEqual(migratedDb.prepare('SELECT id,public_id,token_hash,nickname,nickname_key,display_nickname,emoji,listed,total_earned,click_tokens,click_refill,created_at,updated_at FROM integrals_players ORDER BY id').all(),metadata);
    assert.equal(migratedDb.prepare('SELECT COUNT(*) AS count FROM integrals_actions').get().count,1);
    for(let i=0;i<migrated.length;i++){
      const state=JSON.parse(migrated[i].state),example=cases[i];
      assert.equal(state.prestigeVersion,PRESTIGE_VERSION);assert.equal(state.prestige,example.expected);assert.equal(state.prestigeCount,example.expected);
      assert.equal(migrated[i].prestige,example.expected);
      const expectedOther=withoutPrestige(before[i]);
      if(i===1){
        const ratio=(1+example.expected*.1)/(1+example.points*.1);
        expectedOther.activeEvent.reward*=ratio;expectedOther.activeEvent.penalty*=ratio;
        assert.ok(state.activeEvent.reward<1000,'an in-flight challenge cannot preserve the runaway bonus');
      }
      assert.deepEqual(withoutPrestige(state),expectedOther);
      assert.ok(getStats(state).multiplier<=11);
      if(i<3)assert.deepEqual(state.legacyPrestige,{points:example.points,count:example.count});
    }
    assert.equal(migrated[5].state,JSON.stringify(before[5]),'already normalized state is not rewritten');
    migratedDb.close();api.close();api=null;

    // Reopening must not overwrite the archived original values or advance time.
    api=createIntegralsHandler({dbPath,now:()=>later+1000});
    const reopened=new DatabaseSync(dbPath);
    assert.deepEqual(reopened.prepare('SELECT state,prestige FROM integrals_players ORDER BY id').all(),migrated);reopened.close();
    const health=await request(api,'/health');assert.equal(health.data.prestigeVersion,PRESTIGE_VERSION);
    const rating=await request(api,'/leaderboard');assert.equal(rating.status,200);
    for(const entry of rating.data.entries){const index=accounts.findIndex(account=>account.player.id===entry.id);assert.equal(entry.prestige,cases[index].expected);}
    assert.equal(rating.data.entries.some(entry=>entry.id===accounts[1].player.id),false,'hidden profiles migrate too without becoming listed');

    const state=JSON.parse(migrated[0].state),cps=getStats(state).cps,elapsed=later+1000-initialTime;
    const expectedIncome=cps*(30+(elapsed-30_000)/1000*.5);
    const loaded=await request(api,'/state','GET',undefined,accounts[0].token);
    assert.equal(loaded.status,200);assert.equal(loaded.data.player.prestigeVersion,PRESTIGE_VERSION);
    assert.ok(Math.abs(loaded.data.player.balance-(state.balance+expectedIncome))<1e-6,'the first offline settlement uses the normalized prestige, not the old enormous bonus');
    assert.equal(loaded.data.player.id,accounts[0].player.id);
  }finally{api?.close();rmSync(dir,{recursive:true,force:true});}
});

test('a malformed persisted state rolls back the entire startup migration instead of exposing partial rankings',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'integrals-prestige-atomic-')),dbPath=join(dir,'game.sqlite');let api;
  try{
    api=createIntegralsHandler({dbPath,now:()=>initialTime});
    for(const nickname of ['Атомарность первая','Атомарность вторая'])assert.equal((await request(api,'/players','POST',{nickname})).status,201);
    api.close();api=null;
    const db=new DatabaseSync(dbPath),row=db.prepare('SELECT id,state FROM integrals_players ORDER BY id').get(),legacy=JSON.parse(row.state);
    delete legacy.prestigeVersion;legacy.prestige=1e70;legacy.prestigeCount=15;
    const original=JSON.stringify(legacy);db.prepare('UPDATE integrals_players SET state=?,prestige=? WHERE id=?').run(original,legacy.prestige,row.id);
    db.prepare("UPDATE integrals_players SET state='broken-json' WHERE id<>?").run(row.id);db.close();
    api=createIntegralsHandler({dbPath,now:()=>initialTime+1000});
    assert.equal((await request(api,'/health')).status,503);
    const check=new DatabaseSync(dbPath),unchanged=check.prepare('SELECT state,prestige FROM integrals_players WHERE id=?').get(row.id);
    assert.equal(unchanged.state,original);assert.equal(unchanged.prestige,legacy.prestige);check.close();
  }finally{api?.close();rmSync(dir,{recursive:true,force:true});}
});
