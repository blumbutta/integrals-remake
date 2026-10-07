import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createIntegralsHandler} from './router.mjs';
import {PRESTIGE_PRICE,MAX_PRESTIGE} from '../shared/economy.mjs';
import {shouldAcceptCloudPlayer} from '../cloud-connection.mjs';

const initialTime=1_800_000_000_000;
const actionId=n=>`${initialTime}-${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
function request(api,path,method='GET',body,token){return new Promise(resolve=>{
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{url:'/integrals-api'+path,method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},socket:{remoteAddress:'127.0.0.1'}});
  const res={writableEnded:false,destroyed:false,setHeader(){},writeHead(status){this.status=status;},end(raw){this.writableEnded=true;resolve({status:this.status,data:JSON.parse(raw)});}};
  assert.equal(api.handle(req,res),true);
});}

test('paid ascension from the prestige limit resets the authoritative ranking and awards once across retries and restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'integrals-cosmic-ascension-')),dbPath=join(dir,'game.sqlite');let api,clock=initialTime;
  try{
    api=createIntegralsHandler({dbPath,now:()=>clock});
    const champion=(await request(api,'/players','POST',{nickname:'Сотый престиж'})).data;
    clock++;
    const other=(await request(api,'/players','POST',{nickname:'Другой исследователь'})).data;
    clock++;
    const beginner=(await request(api,'/players','POST',{nickname:'Новый исследователь'})).data;
    assert.equal(champion.player.cosmicAscensions,0);
    assert.equal((await request(api,'/action','POST',{id:actionId(1),type:'click',amount:20},other.token)).status,200);
    api.close();api=null;

    const db=new DatabaseSync(dbPath),row=db.prepare('SELECT * FROM integrals_players WHERE public_id=?').get(champion.player.id),state=JSON.parse(row.state);
    state.prestige=MAX_PRESTIGE;state.prestigeCount=MAX_PRESTIGE;
    state.balance=PRESTIGE_PRICE;state.totalEarned=PRESTIGE_PRICE*10;state.runEarned=PRESTIGE_PRICE*2;
    state.achievements=[`prestige:${MAX_PRESTIGE}`];state.legacyPrestige={points:1e100,count:100};
    db.prepare('UPDATE integrals_players SET state=?,prestige=?,total_earned=? WHERE id=?').run(JSON.stringify(state),MAX_PRESTIGE,state.totalEarned,row.id);db.close();

    api=createIntegralsHandler({dbPath,now:()=>clock});
    const before=(await request(api,'/state','GET',undefined,champion.token)).data.player;
    assert.equal(before.prestige,MAX_PRESTIGE);assert.equal(before.cosmicAscensions,0,'startup does not grant an ascension for reaching the prestige limit');
    assert.equal((await request(api,'/leaderboard')).data.entries[0].id,champion.player.id);
    const deniedAction={id:actionId(2),type:'prestige'};
    const prior=new DatabaseSync(dbPath),beforeConfirmation=prior.prepare('SELECT * FROM integrals_players WHERE id=?').get(row.id);prior.close();
    for(const action of [deniedAction,{...deniedAction,confirmCosmicReset:false}]){
      const denied=await request(api,'/action','POST',action,champion.token);
      assert.equal(denied.status,400);assert.equal(denied.data.error.code,'cosmic_confirmation_required');
    }
    const check=new DatabaseSync(dbPath);
    assert.deepEqual(check.prepare('SELECT * FROM integrals_players WHERE id=?').get(row.id),beforeConfirmation,'an old client cannot reset score or create an action receipt without the new explicit confirmation');
    assert.equal(check.prepare('SELECT COUNT(*) AS count FROM integrals_actions WHERE player_id=? AND action_id=?').get(row.id,deniedAction.id).count,0);check.close();
    const action={...deniedAction,confirmCosmicReset:true};
    const replies=await Promise.all(Array.from({length:8},()=>request(api,'/action','POST',action,champion.token)));
    for(const response of replies){
      assert.equal(response.status,200,JSON.stringify(response.data));
      const player=response.data.player;
      assert.equal(player.balance,0);assert.equal(player.totalEarned,0);assert.equal(player.runEarned,0);
      assert.equal(player.prestige,0);assert.equal(player.prestigeCount,0);assert.equal(player.cosmicAscensions,1);
      assert.equal(player.stats.multiplier,1);
      assert.equal(shouldAcceptCloudPlayer(player,before),true,'a newer server revision may intentionally lower the score');
    }
    const ranking=(await request(api,'/leaderboard')).data.entries;
    assert.deepEqual(ranking.map(entry=>entry.id),[other.player.id,champion.player.id,beginner.player.id]);
    const ranked=ranking.find(entry=>entry.id===champion.player.id);
    assert.equal(ranked.rank,2);assert.equal(ranked.score,0);assert.equal(ranked.totalEarned,0);assert.equal(ranked.prestige,0);assert.equal(ranked.cosmicAscensions,1);
    const stored=new DatabaseSync(dbPath),saved=stored.prepare('SELECT state,total_earned,prestige,token_hash,created_at FROM integrals_players WHERE id=?').get(row.id);
    assert.equal(saved.total_earned,0);assert.equal(saved.prestige,0);
    assert.equal(saved.token_hash,row.token_hash);assert.equal(saved.created_at,row.created_at);
    assert.deepEqual(JSON.parse(saved.state).legacyPrestige,state.legacyPrestige);
    assert.equal(stored.prepare('SELECT COUNT(*) AS count FROM integrals_actions WHERE player_id=? AND action_id=?').get(row.id,action.id).count,1);
    stored.close();api.close();api=null;

    clock+=1000;api=createIntegralsHandler({dbPath,now:()=>clock});
    const recovered=await request(api,'/state','GET',undefined,champion.token);
    assert.equal(recovered.status,200);assert.equal(recovered.data.player.cosmicAscensions,1);assert.equal(recovered.data.player.totalEarned,0);
    assert.equal((await request(api,'/action','POST',action,champion.token)).data.player.cosmicAscensions,1,'durable receipt prevents a second award');
    for(const altered of [deniedAction,{...action,confirmCosmicReset:false}]){
      const conflict=await request(api,'/action','POST',altered,champion.token);
      assert.equal(conflict.status,409);assert.equal(conflict.data.error.code,'action_conflict','changing confirmation cannot reuse the successful receipt');
    }
    const unfunded=await request(api,'/action','POST',{id:actionId(3),type:'prestige'},champion.token);
    assert.equal(unfunded.status,400);assert.equal(unfunded.data.error.code,'prestige_locked');
    const finalRank=(await request(api,'/leaderboard')).data.entries.find(entry=>entry.id===champion.player.id);
    assert.equal(finalRank.cosmicAscensions,1);assert.equal(finalRank.score,0);assert.equal(finalRank.totalEarned,0);assert.equal(finalRank.rank,2);
  }finally{api?.close();rmSync(dir,{recursive:true,force:true});}
});

test('client imports, profile fields and forged actions cannot award an ascension or overwrite cloud state',async()=>{
  const api=createIntegralsHandler({dbPath:':memory:',now:()=>initialTime});
  try{
    const account=(await request(api,'/players','POST',{nickname:'Чистый профиль'})).data;
    const maliciousState={balance:PRESTIGE_PRICE,totalEarned:1e50,prestige:100,prestigeCount:100,cosmicAscensions:999};
    for(const [path,method,body,status] of [
      ['/players','POST',{nickname:'Подложный профиль',cosmicAscensions:999},400],
      ['/players','POST',{nickname:'Подложный импорт',state:maliciousState},400],
      ['/profile','PATCH',{cosmicAscensions:999},400],
      ['/profile','PATCH',{state:maliciousState},400],
      ['/action','POST',{id:actionId(10),type:'prestige',cosmicAscensions:999},400],
      ['/action','POST',{id:actionId(11),type:'import',state:maliciousState},400],
      ['/action','POST',{id:actionId(12),type:'import'},400],
      ['/action','POST',{id:actionId(13),type:'prestige',confirmCosmicReset:'true'},400],
      ['/action','POST',{id:actionId(14),type:'prestige',confirmCosmicReset:1},400],
      ['/action','POST',{id:actionId(15),type:'prestige',confirmCosmicReset:null},400],
      ['/action','POST',{id:actionId(16),type:'click',confirmCosmicReset:true},400],
      ['/state','POST',maliciousState,405],
      ['/state','PATCH',maliciousState,405],
      ['/import','POST',{state:maliciousState},404],
    ])assert.equal((await request(api,path,method,body,account.token)).status,status,`${method} ${path}`);
    const restored=(await request(api,'/state','GET',undefined,account.token)).data.player;
    assert.equal(restored.id,account.player.id);assert.equal(restored.cosmicAscensions,0);
    assert.equal(restored.balance,0);assert.equal(restored.totalEarned,0);assert.equal(restored.prestige,0);assert.equal(restored.prestigeCount,0);
    const ranking=(await request(api,'/leaderboard')).data.entries;
    assert.equal(ranking.length,1);assert.equal(ranking[0].cosmicAscensions,0);
  }finally{api.close();}
});
