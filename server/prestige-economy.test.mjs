import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,normalizePrestige,getStats,applyAction,settle,PRESTIGE_PRICE,PRESTIGE_VERSION,MAX_PRESTIGE,MAX_OFFLINE_MS} from '../shared/economy.mjs';

test('each ordinary reset awards exactly one level regardless of run earnings, never a chain of free resets',()=>{
  const state=createState(0);state.totalEarned=1e100;state.clicks=500;
  for(let level=1;level<=MAX_PRESTIGE;level++){
    state.balance=PRESTIGE_PRICE;state.runEarned=1e100;state.generators[0]=25;state.upgrades=['autoclick-1'];
    const result=applyAction(state,{type:'prestige'},0);
    assert.equal(result.prestigeGain,1);assert.equal(result.cosmicAscension,false);
    assert.equal(state.prestige,level);assert.equal(state.prestigeCount,level);
    assert.equal(getStats(state).multiplier,1+level*.1);
    assert.equal(state.totalEarned,1e100);assert.equal(state.balance,0);assert.equal(state.runEarned,0);
    assert.equal(state.generators.some(Boolean),false);assert.deepEqual(state.upgrades,[]);
    assert.ok(state.achievements.includes(`prestige:${level}`));
    assert.throws(()=>applyAction(state,{type:'prestige'},0),{code:'prestige_locked'});
  }
  assert.equal(state.cosmicAscensions,0,'reaching level 100 alone does not grant the final reward');
  assert.equal(getStats(state).multiplier,11);
});

test('paid transition FROM level 100 resets ranking and level, permanently awards the world and keeps account history',()=>{
  const state=createState(0);state.prestige=state.prestigeCount=100;
  state.totalEarned=1e20;state.runEarned=1e18;state.balance=PRESTIGE_PRICE-1;
  state.generators[10]=4;state.upgrades=['click-1'];state.clicks=75000;
  state.achievements=['first','prestige:100'];state.eventStats={wins:8,losses:3};
  assert.throws(()=>applyAction(state,{type:'prestige'},0),{code:'prestige_locked'});
  assert.equal(state.cosmicAscensions,0);assert.equal(state.totalEarned,1e20);assert.equal(state.prestigeCount,100);
  state.balance=PRESTIGE_PRICE;
  assert.throws(()=>applyAction(state,{type:'prestige'},0),{code:'cosmic_confirmation_required'});
  assert.equal(state.totalEarned,1e20);assert.equal(state.cosmicAscensions,0);assert.equal(state.balance,PRESTIGE_PRICE);
  const result=applyAction(state,{type:'prestige',confirmCosmicReset:true},0);
  assert.equal(result.cosmicAscension,true);assert.equal(result.prestigeGain,0);
  assert.equal(state.cosmicAscensions,1);assert.equal(state.prestigeCount,0);assert.equal(state.prestige,0);
  assert.equal(state.totalEarned,0);assert.equal(state.balance,0);assert.equal(state.runEarned,0);
  assert.equal(state.clicks,75000);assert.deepEqual(state.eventStats,{wins:8,losses:3});
  assert.ok(state.achievements.includes('prestige:100'));assert.equal(getStats(state).multiplier,1);
  assert.throws(()=>applyAction(state,{type:'prestige'},0),{code:'prestige_locked'});
  const restored=JSON.parse(JSON.stringify(state));normalizePrestige(restored);
  assert.equal(restored.cosmicAscensions,1);
  applyAction(restored,{type:'click'},0);assert.equal(restored.totalEarned,1);
  restored.balance=PRESTIGE_PRICE;applyAction(restored,{type:'prestige'},0);
  assert.equal(restored.cosmicAscensions,1);assert.equal(restored.prestigeCount,1);
  assert.equal(restored.totalEarned,1,'ordinary resets in a new ranking run preserve its earned score');
});

test('legacy inflated points are corrected by actual cycles with no reset of savings or history, once only',()=>{
  const state=createState(0);delete state.prestigeVersion;delete state.cosmicAscensions;
  state.prestige=75000;state.prestigeCount=1;state.balance=123456;state.totalEarned=2e15;
  state.runEarned=1e15;state.generators[0]=10;state.upgrades=['autoclick-1'];state.achievements=['first'];
  const before=structuredClone(state);
  assert.equal(getStats(state).multiplier,1.1,'unmigrated raw points cannot affect calculations');
  normalizePrestige(state);
  assert.equal(state.prestigeVersion,PRESTIGE_VERSION);assert.equal(state.prestige,1);
  assert.equal(state.prestigeCount,1);assert.equal(state.cosmicAscensions,0);
  assert.deepEqual(state.legacyPrestige,{points:75000,count:1});
  for(const field of ['balance','totalEarned','runEarned','generators','upgrades','achievements'])assert.deepEqual(state[field],before[field]);
  const normalized=structuredClone(state);normalizePrestige(state);assert.deepEqual(state,normalized);
  state.prestige=9e99;state.prestigeCount=150;normalizePrestige(state);
  assert.equal(state.prestigeCount,100);assert.equal(state.prestige,100);assert.equal(getStats(state).multiplier,11);
  assert.deepEqual(state.legacyPrestige,{points:75000,count:1});assert.equal(state.cosmicAscensions,0);
});

test('old offline interval and already active challenge cannot cash in the broken multiplier after migration',()=>{
  const state=createState(0);state.generators[0]=4;state.prestige=75000;state.prestigeCount=1;delete state.prestigeVersion;
  settle(state,MAX_OFFLINE_MS*2);
  assert.equal(state.balance,1.1*(30+MAX_OFFLINE_MS/1000*.5));
  const eventState=createState(0);eventState.generators[1]=1;eventState.prestige=75000;eventState.prestigeCount=1;
  // Create a real solvable challenge then recreate the old server's inflated stakes.
  applyAction(eventState,{type:'event_start',itemId:'school'},0);
  const newReward=eventState.activeEvent.reward,answers=[...eventState.activeEvent._answers],id=eventState.activeEvent.id;
  eventState.prestige=75000;delete eventState.prestigeVersion;
  eventState.activeEvent.reward*=7501/1.1;eventState.activeEvent.penalty*=7501/1.1;
  normalizePrestige(eventState);
  assert.ok(Math.abs(eventState.activeEvent.reward-newReward)<1e-9);
  assert.equal(eventState.activeEvent.reward,eventState.activeEvent.penalty);
  const normalizedReward=eventState.activeEvent.reward;normalizePrestige(eventState);
  assert.equal(eventState.activeEvent.reward,normalizedReward);
  applyAction(eventState,{type:'event_answer',itemId:id,answers},0);
  assert.ok(Math.abs(eventState.balance-newReward)<1e-9);
});
