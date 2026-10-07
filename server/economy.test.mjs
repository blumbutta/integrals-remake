import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATORS, UPGRADES, createState, applyAction, settle, getStats, priceFor, MAX_OFFLINE_MS } from '../shared/economy.mjs';

test('first generator has reachable price and production; bulk prices compound',()=>{
  const s=createState(0);applyAction(s,{type:'click',amount:15},0);assert.equal(s.balance,15);
  applyAction(s,{type:'buy',itemId:'autoclick'},0);assert.equal(s.balance,0);assert.equal(getStats(s).cps,0.25);
  settle(s,10000);assert.equal(s.balance,2.5);
  assert.equal(priceFor('autoclick',0),15);assert.equal(priceFor('autoclick',1),18);
  assert.ok(priceFor('autoclick',0,10)>150);assert.equal(GENERATORS.length,10);assert.ok(UPGRADES.length>=12);
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
  s.runEarned=1000000;s.totalEarned=1500000;s.balance=2000;s.generators[0]=10;s.upgrades=['click-1'];
  applyAction(s,{type:'prestige'},0);
  assert.equal(s.prestige,1);assert.equal(s.prestigeCount,1);assert.equal(s.totalEarned,1500000);assert.equal(s.runEarned,0);
  assert.equal(s.balance,0);assert.deepEqual(s.generators,GENERATORS.map(()=>0));assert.deepEqual(s.upgrades,[]);
  assert.equal(getStats(s).multiplier,1.1);assert.equal(getStats(s).clickPower,1.1);
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
