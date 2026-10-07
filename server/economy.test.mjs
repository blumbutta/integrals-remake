import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATORS, UPGRADES, createState, applyAction, settle, getStats, priceFor, MAX_OFFLINE_MS, PRESTIGE_PRICE, migrateState } from '../shared/economy.mjs';

test('first generator has reachable price and production; bulk prices compound',()=>{
  const s=createState(0);applyAction(s,{type:'click',amount:15},0);assert.equal(s.balance,15);
  applyAction(s,{type:'buy',itemId:'autoclick'},0);assert.equal(s.balance,0);assert.equal(getStats(s).cps,0.25);
  settle(s,10000);assert.equal(s.balance,2.5);
  assert.equal(priceFor('autoclick',0),15);assert.equal(priceFor('autoclick',1),18);
  assert.ok(priceFor('autoclick',0,10)>150);assert.equal(GENERATORS.length,11);assert.equal(UPGRADES.length,26);
});
test('legacy ten-stage saves append zero slots without losing balances, records or active challenge stakes',()=>{
  const state=createState(0);state.generators=[4,1,2,3,0,0,0,0,0,0];
  state.achievementRecords={generators:[8,2,4,6,0,0,0,0,0,0],maxGenerators:20,maxUpgrades:3,maxCps:999};
  state.balance=1234;state.totalEarned=5678;state.runEarned=1234;state.upgrades=['click-1'];state.achievements=['all','upgrades-24'];
  applyAction(state,{type:'event_start',itemId:'school'},0);
  // Simulate the older release on disk, including its historical smaller penalty.
  state.generators.length=10;state.achievementRecords.generators.length=10;state.activeEvent.penalty=10;
  const snapshot=structuredClone(state),rate=getStats(state).cps;
  assert.ok(Number.isFinite(rate));assert.equal(migrateState(state),state);
  assert.deepEqual(state.generators,[...snapshot.generators,0]);
  assert.deepEqual(state.achievementRecords,{...snapshot.achievementRecords,generators:[...snapshot.achievementRecords.generators,0]});
  for(const key of ['balance','totalEarned','runEarned','upgrades','achievements','activeEvent','eventCooldowns'])assert.deepEqual(state[key],snapshot[key]);
  migrateState(state);settle(state,0);assert.equal(state.generators.length,11);assert.equal(getStats(state).cps,rate);assert.equal(state.activeEvent.penalty,10);
});
test('superintelligence can be purchased from an old save and both researches multiply its production',()=>{
  const state=createState(0);state.generators=Array(10).fill(0);state.balance=1e20;
  const generator=GENERATORS.at(-1);assert.equal(generator.id,'superintelligence');
  assert.equal(generator.basePrice,10_000_000_000_000);assert.equal(generator.baseCps,240_000_000);
  assert.throws(()=>applyAction(state,{type:'upgrade',itemId:'superintelligence-1'},0),{code:'upgrade_locked'});
  applyAction(state,{type:'buy',itemId:'superintelligence',amount:10},0);assert.equal(state.generators[10],10);assert.equal(getStats(state).cps,2_400_000_000);
  applyAction(state,{type:'upgrade',itemId:'superintelligence-1'},0);assert.equal(getStats(state).cps,4_800_000_000);
  assert.throws(()=>applyAction(state,{type:'upgrade',itemId:'superintelligence-2'},0),{code:'upgrade_locked'});
  applyAction(state,{type:'buy',itemId:'superintelligence',amount:15},0);applyAction(state,{type:'upgrade',itemId:'superintelligence-2'},0);
  assert.equal(getStats(state).cps,24_000_000_000);assert.ok(state.achievements.includes('stage-superintelligence-25'));
  assert.ok(UPGRADES.every(u=>u.name&&u.description));
});
test('offline production pays half after grace and stops after 12 hours, even across repeated settlement',()=>{
  const s=createState(0);s.generators[0]=4;
  const initial=settle(s,MAX_OFFLINE_MS*3);
  assert.equal(initial.offlineEarned,MAX_OFFLINE_MS/1000*0.5);
  assert.equal(s.balance,30+MAX_OFFLINE_MS/1000*0.5);
  const previous=s.balance;settle(s,MAX_OFFLINE_MS*4);assert.equal(s.balance,previous);
  s.lastSeen=MAX_OFFLINE_MS*4;settle(s,MAX_OFFLINE_MS*4+10000);assert.equal(s.balance,previous+10);
});
test('heartbeat keeps active production full and time cannot move backwards',()=>{
  const s=createState(0);s.generators[0]=4;
  for(let t=10000;t<=120000;t+=10000){settle(s,t);s.lastSeen=t;}
  assert.equal(s.balance,120);settle(s,1000);assert.equal(s.balance,120);assert.equal(s.lastSettled,120000);
});
test('upgrades enforce unlock, affordability and uniqueness',()=>{
  const s=createState(0);s.balance=100000;
  assert.throws(()=>applyAction(s,{type:'upgrade',itemId:'click-1'},0),{code:'upgrade_locked'});
  s.clicks=25;applyAction(s,{type:'upgrade',itemId:'click-1'},0);assert.equal(getStats(s).clickPower,2);
  assert.throws(()=>applyAction(s,{type:'upgrade',itemId:'click-1'},0),{code:'upgrade_locked'});
  s.generators[0]=10;applyAction(s,{type:'upgrade',itemId:'autoclick-1'},0);assert.equal(getStats(s).cps,5);
});
test('prestige is earned per run, resets purchased production and preserves lifetime totals',()=>{
  const s=createState(0);
  assert.throws(()=>applyAction(s,{type:'prestige'},0),{code:'prestige_locked'});
  s.runEarned=1000000;s.totalEarned=1500000;s.balance=PRESTIGE_PRICE;s.generators[0]=10;s.upgrades=['click-1'];
  applyAction(s,{type:'prestige'},0);
  assert.equal(s.prestige,1);assert.equal(s.prestigeCount,1);assert.equal(s.totalEarned,1500000);assert.equal(s.runEarned,0);
  assert.equal(s.balance,0);assert.deepEqual(s.generators,GENERATORS.map(()=>0));assert.deepEqual(s.upgrades,[]);
  assert.equal(getStats(s).multiplier,1.1);assert.equal(getStats(s).clickPower,1.1);
});
test('prestige requires its exact price in spendable balance, independently of historical earnings',()=>{
  const s=createState(0);s.runEarned=1e20;s.totalEarned=1e20;s.balance=PRESTIGE_PRICE-1;s.clicks=500;s.generators[0]=4;
  assert.equal(PRESTIGE_PRICE,999_999_999_999_999);
  assert.throws(()=>applyAction(s,{type:'prestige'},0),error=>error.code==='prestige_locked'&&error.message.includes('999 999 999 999 999'));
  assert.equal(s.balance,PRESTIGE_PRICE-1);assert.equal(s.prestigeCount,0);assert.equal(s.generators[0],4);
  s.balance=PRESTIGE_PRICE;const gain=getStats(s).prestigeGain;
  applyAction(s,{type:'prestige'},0);
  assert.equal(s.balance,0);assert.equal(s.prestige,gain);assert.equal(s.prestigeCount,1);assert.equal(s.clicks,500);assert.equal(s.totalEarned,1e20);
});
test('golden reward can only be claimed once in its server window',()=>{
  const s=createState(0);s.golden={nextAt:100000,availableUntil:0};
  assert.throws(()=>applyAction(s,{type:'golden'},99000),{code:'golden_unavailable'});
  const result=applyAction(s,{type:'golden'},100000);assert.equal(result.reward,25);assert.equal(s.balance,25);
  assert.throws(()=>applyAction(s,{type:'golden'},100000),{code:'golden_unavailable'});
  assert.ok(s.golden.nextAt>=190000&&s.golden.nextAt<=280000);
});
test('invalid actions cannot create negative purchases or inject arbitrary earnings',()=>{
  for(const action of [{type:'click',amount:NaN},{type:'click',amount:0},{type:'click',amount:25},{type:'buy',itemId:'autoclick',amount:-1},{type:'buy',itemId:'missing'},{type:'upgrade',itemId:'missing'},{type:'award',amount:1e9}]){
    const s=createState(0);assert.throws(()=>applyAction(s,action,0));assert.equal(s.balance,0);assert.equal(s.totalEarned,0);
  }
});
test('MAX purchase supports arbitrary count and achievements survive prestige',()=>{
  const s=createState(0);s.balance=1e20;s.runEarned=1e6;s.totalEarned=1e6;
  applyAction(s,{type:'buy',itemId:'autoclick',amount:27},0);
  assert.equal(s.generators[0],27);assert.ok(s.achievements.includes('team'));assert.ok(s.achievements.includes('auto'));
  applyAction(s,{type:'prestige'},0);assert.equal(s.generators[0],0);
  assert.ok(s.achievements.includes('team'));assert.ok(s.achievements.includes('prestige'));
});
