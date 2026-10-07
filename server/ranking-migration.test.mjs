import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createIntegralsHandler} from './router.mjs';
import {getStats} from '../shared/economy.mjs';

const initialTime=1_800_000_000_000;
function request(api,path,method='GET',body,token){return new Promise(resolve=>{
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{url:'/integrals-api'+path,method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},socket:{remoteAddress:'127.0.0.1'}});
  const res={writableEnded:false,destroyed:false,setHeader(){},writeHead(status){this.status=status;},end(raw){this.writableEnded=true;resolve({status:this.status,data:JSON.parse(raw)});}};
  assert.equal(api.handle(req,res),true);
});}

test('ranking v2 clears only legacy prestiged scores once, settling old income without losing balances or inventory',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'integrals-ranking-migration-')),dbPath=join(dir,'game.sqlite');let api,clock=initialTime;
  try{
    api=createIntegralsHandler({dbPath,now:()=>clock});const accounts=[];
    for(let i=0;i<5;i++)accounts.push((await request(api,'/players','POST',{nickname:'Новый рейтинг '+i})).data);
    assert.equal(accounts[0].player.rankingVersion,2);
    api.close();api=null;
    const db=new DatabaseSync(dbPath),rows=db.prepare('SELECT * FROM integrals_players ORDER BY id').all(),states=[];
    const counts=[7,0,0,10,3],reset=[true,true,false,false,true];
    for(let i=0;i<rows.length;i++){
      const state=JSON.parse(rows[i].state);
      state.prestige=counts[i];state.prestigeCount=counts[i];state.cosmicAscensions=i===1?2:0;
      state.balance=1500+i;state.totalEarned=5000+i;state.runEarned=500+i;
      state.generators[0]=4;state.upgrades=['click-1'];state.revision=12;
      if(i!==3)delete state.rankingVersion;
      if(i===0){state.prestige=1e70;delete state.prestigeVersion;}
      if(i===4)state.legacyRanking={runEarned:123,resetAt:initialTime-1000};
      db.prepare('UPDATE integrals_players SET state=?,prestige=?,total_earned=?,listed=? WHERE id=?').run(JSON.stringify(state),state.prestige,state.totalEarned,i===1?0:1,rows[i].id);
      states.push(state);
    }
    const metadata=db.prepare('SELECT id,public_id,token_hash,nickname,listed,created_at,updated_at,click_tokens,click_refill FROM integrals_players ORDER BY id').all();db.close();

    clock+=3_600_000;api=createIntegralsHandler({dbPath,now:()=>clock});
    const check=new DatabaseSync(dbPath),migrated=check.prepare('SELECT state,prestige,total_earned FROM integrals_players ORDER BY id').all();
    assert.deepEqual(check.prepare('SELECT id,public_id,token_hash,nickname,listed,created_at,updated_at,click_tokens,click_refill FROM integrals_players ORDER BY id').all(),metadata);
    for(let i=0;i<states.length;i++){
      const original=states[i],current=JSON.parse(migrated[i].state);
      assert.equal(current.rankingVersion,2);assert.deepEqual(current.generators,original.generators);assert.deepEqual(current.upgrades,original.upgrades);
      assert.equal(current.lastSeen,original.lastSeen);assert.equal(current.cosmicAscensions,original.cosmicAscensions);
      assert.equal(migrated[i].prestige,counts[i]);assert.equal(migrated[i].total_earned,current.totalEarned);
      if(reset[i]){
        const income=getStats(current).cps*(30+(3_600_000-30_000)/1000*.5);
        assert.ok(Math.abs(current.balance-original.balance-income)<1e-8,'offline production remains in the spendable balance');
        assert.ok(Math.abs(current.totalEarned-original.totalEarned-income)<1e-8,'lifetime earnings are preserved and credited');
        assert.equal(current.runEarned,0);assert.equal(current.revision,original.revision+1);assert.equal(current.lastSettled,clock);
        assert.deepEqual(current.legacyRanking,original.legacyRanking||{runEarned:original.runEarned+income,resetAt:clock});
      }else{
        assert.deepEqual(current,{...original,rankingVersion:2},'beginners and already migrated players do not lose score or advance time');
      }
    }
    check.close();
    const health=(await request(api,'/health')).data;assert.equal(health.rankingVersion,2);
    const ranking=(await request(api,'/leaderboard')).data.entries;
    for(let i=0;i<states.length;i++){
      if(i===1){assert.ok(!ranking.some(entry=>entry.id===accounts[i].player.id));continue;}
      const entry=ranking.find(entry=>entry.id===accounts[i].player.id);
      assert.equal(entry.score,reset[i]?0:states[i].runEarned);
    }
    const firstRead=(await request(api,'/state','GET',undefined,accounts[0].token)).data.player;
    assert.equal(firstRead.runEarned,0,'first touch cannot refill the ranking with pre-migration offline income');
    assert.equal(firstRead.rankingVersion,2);
    const snapshotDb=new DatabaseSync(dbPath),snapshot=snapshotDb.prepare('SELECT state,prestige,total_earned FROM integrals_players ORDER BY id').all();snapshotDb.close();
    api.close();api=null;clock+=300_000;api=createIntegralsHandler({dbPath,now:()=>clock});
    const reopened=new DatabaseSync(dbPath);
    assert.deepEqual(reopened.prepare('SELECT state,prestige,total_earned FROM integrals_players ORDER BY id').all(),snapshot,'restart neither clears new scores nor accrues income during migration again');reopened.close();
    const later=(await request(api,'/state','GET',undefined,accounts[0].token)).data.player;
    assert.equal(later.runEarned,getStats(later).cps*(30+270*.5),'only post-reset offline production contributes to the new ranking');
  }finally{api?.close();rmSync(dir,{recursive:true,force:true});}
});
