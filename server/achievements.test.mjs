import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS,COSMETICS,collectAchievements,cosmeticUnlocked,prestigeAppearance,getPrestigeHonors } from '../shared/achievements.mjs';
import { createState,applyAction,settle,getStats } from '../shared/economy.mjs';

test('achievement catalog has 86 unique, meaningful milestones and keeps all original IDs',()=>{
  assert.equal(ACHIEVEMENTS.length,86);assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,86);
  for(const id of ['first','click100','auto','hundred','team','research','speed','million','click1000','prestige','billion','all'])assert.ok(ACHIEVEMENTS.some(a=>a.id===id),id);
  const state=createState(0);
  for(const a of ACHIEVEMENTS){assert.ok(a.name&&a.text&&a.icon);assert.ok(a.target>0);assert.equal(a.value(state,getStats(state)),0);}
});

test('unlocking cosmetics and achievements never changes balances or production',()=>{
  const state=createState(0);
  assert.deepEqual(COSMETICS.filter(c=>cosmeticUnlocked(state,c.id)).map(c=>c.id),['classic']);
  applyAction(state,{type:'click',amount:10},0);
  assert.ok(state.achievements.includes('click10'));assert.equal(cosmeticUnlocked(state,'chalk'),true);assert.equal(cosmeticUnlocked(state,'jade'),false);
  const before={balance:state.balance,totalEarned:state.totalEarned,runEarned:state.runEarned,stats:getStats(state)};
  collectAchievements(state,getStats(state));
  assert.deepEqual({balance:state.balance,totalEarned:state.totalEarned,runEarned:state.runEarned,stats:getStats(state)},before);
  assert.equal(cosmeticUnlocked(state,'missing-theme'),false);
});

test('all stage milestones, peak rates, and upgrades survive a prestige reset',()=>{
  const state=createState(0);state.generators=state.generators.map(()=>100);state.upgrades=['click-1','click-2','click-3'];state.runEarned=1e6;state.totalEarned=1e6;
  const peak=getStats(state).cps;collectAchievements(state,getStats(state));
  assert.ok(state.achievements.includes('stage-multiverse-100'));assert.ok(state.achievements.includes('research'));assert.equal(cosmeticUnlocked(state,'jade'),true);
  applyAction(state,{type:'prestige'},0);
  assert.deepEqual(state.generators,Array(10).fill(0));assert.equal(state.upgrades.length,0);
  assert.equal(state.achievementRecords.maxCps,peak);assert.deepEqual(state.achievementRecords.generators,Array(10).fill(100));
  assert.equal(ACHIEVEMENTS.find(a=>a.id==='stage-multiverse-100').value(state,getStats(state)),100);
  assert.ok(state.achievements.includes('all'));assert.ok(state.achievements.includes('prestige:1'));
  assert.equal(cosmeticUnlocked(state,'blueprint'),true);assert.equal(cosmeticUnlocked(state,'violet'),true);
});

test('legacy saves migrate without dropping existing badges or changing game data',()=>{
  const state=createState(0);delete state.achievementRecords;state.achievements=['first','team','speed','all'];state.totalEarned=5;state.balance=3;state.prestigeCount=2;
  collectAchievements(state,getStats(state));
  for(const id of ['first','team','speed','all'])assert.ok(state.achievements.includes(id));
  assert.equal(state.balance,3);assert.equal(state.totalEarned,5);assert.equal(state.achievementRecords.generators.length,10);
  // Unknown historical prestige counts are represented lazily, never expanded into stored arrays.
  assert.equal(state.achievements.some(id=>id.startsWith('prestige:')),false);
  const empty=createState(0);delete empty.achievements;delete empty.achievementRecords;settle(empty,0);
  assert.deepEqual(empty.achievements,[]);assert.equal(empty.achievementRecords.maxCps,0);
});

test('each legitimate prestige awards its own badge, independently of points gained',()=>{
  const state=createState(0);state.runEarned=4e6;state.totalEarned=4e6;
  applyAction(state,{type:'prestige'},0);assert.equal(state.prestige,2);assert.equal(state.prestigeCount,1);assert.ok(state.achievements.includes('prestige:1'));assert.ok(!state.achievements.includes('prestige:2'));
  state.runEarned=1e6;state.totalEarned+=1e6;applyAction(state,{type:'prestige'},0);
  assert.equal(state.prestigeCount,2);assert.ok(state.achievements.includes('prestige:2'));assert.ok(state.achievements.includes('prestige-runs-2'));
});

test('procedural prestige appearances remain distinct and deterministic beyond the first eight',()=>{
  const appearances=Array.from({length:1000},(_,i)=>prestigeAppearance(i+1));
  assert.equal(new Set(appearances.map(a=>a.id)).size,1000);
  assert.equal(new Set(appearances.map(a=>JSON.stringify([a.hue,a.pattern,a.rings,a.rotation,a.frequency]))).size,1000);
  assert.equal(new Set(appearances.slice(0,8).map(a=>a.name)).size,8);
  assert.deepEqual(prestigeAppearance(500),prestigeAppearance(500));
  assert.equal(prestigeAppearance(0).id,'classic');assert.equal(prestigeAppearance(-1).id,'classic');assert.equal(prestigeAppearance(NaN).id,'classic');
});

test('prestige honors use bounded lazy pagination, including fabricated huge counts',()=>{
  assert.deepEqual(getPrestigeHonors(0),[]);assert.equal(getPrestigeHonors(5).length,5);
  const page=getPrestigeHonors(250,{offset:100,limit:10});assert.equal(page.length,10);assert.equal(page[0].id,'prestige:101');assert.equal(page[9].run,110);
  assert.equal(getPrestigeHonors(1e200,{limit:1e100}).length,100);assert.equal(getPrestigeHonors(Infinity).length,0);
  const state=createState(0);state.prestigeCount=1e200;collectAchievements(state,getStats(state));assert.ok(state.achievements.length<20);
});

test('event and count-based cosmetics require their exact milestones',()=>{
  const state=createState(0);state.eventStats.wins=9;collectAchievements(state,getStats(state));assert.equal(cosmeticUnlocked(state,'aurora'),false);
  state.eventStats.wins=10;collectAchievements(state,getStats(state));assert.equal(cosmeticUnlocked(state,'aurora'),true);
  state.achievements=Array.from({length:100},(_,i)=>`prestige:${i+1}`);assert.equal(cosmeticUnlocked(state,'violet'),false);
  state.achievements=ACHIEVEMENTS.slice(0,10).map(a=>a.id);assert.equal(cosmeticUnlocked(state,'violet'),true);
});
