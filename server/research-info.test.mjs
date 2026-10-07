import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,GENERATORS,UPGRADES,applyAction,PRESTIGE_PRICE} from '../shared/economy.mjs';
import {resourceDiscovered} from '../resource-info.mjs';
import {researchInfo,researchList} from '../research-info.mjs';

test('unknown-resource research exposes no tooltip metadata, even with a forged purchased ID',()=>{
  const state=createState(0),portal=GENERATORS.find(generator=>generator.id==='dimension');
  state.totalEarned=portal.basePrice-1;state.balance=portal.basePrice*10000;
  for(const upgrade of UPGRADES.filter(upgrade=>upgrade.target==='dimension'))assert.equal(researchInfo(state,upgrade.id),null);
  state.upgrades=['dimension-1','dimension-team'];
  assert.equal(researchInfo(state,'dimension-1'),null);
  assert.equal(researchInfo(state,'dimension-team'),null,'ownership does not disclose an undiscovered resource');
  assert.equal(researchInfo(state,'not-a-research'),null);
  assert.equal(researchInfo(state,null),null);
});

test('lifetime discovery reveals research before ownership without bypassing its purchase requirements',()=>{
  const state=createState(0),index=GENERATORS.findIndex(generator=>generator.id==='dimension');
  state.totalEarned=GENERATORS[index].basePrice;state.balance=1e20;
  const info=researchInfo(state,'dimension-1');
  assert.equal(info.resourceIndex,index);assert.equal(info.resourceName,'Портал');assert.equal(info.target,'dimension');
  assert.equal(info.owned,false);assert.equal(info.unlocked,false);assert.equal(info.affordable,false);
  assert.equal(info.price,UPGRADES.find(upgrade=>upgrade.id==='dimension-1').price);
  assert.equal(info.requirement,'Иметь 10 × «Портал»');
  assert.ok(info.name&&info.description);
  state.balance=0;
  assert.equal(researchInfo(state,'dimension-1').resourceName,'Портал','spending the discovery balance does not hide research');
});

test('owned helpers reveal their research and quantity unlocks it independently of affordability',()=>{
  const state=createState(0),index=GENERATORS.findIndex(generator=>generator.id==='dimension');
  state.generators[index]=1;
  assert.equal(resourceDiscovered(state,index),true);assert.ok(researchInfo(state,'dimension-1'));
  assert.equal(researchInfo(state,'dimension-1').unlocked,false);
  state.generators[index]=10;
  let info=researchInfo(state,'dimension-1');
  assert.equal(info.unlocked,true);assert.equal(info.affordable,false);
  state.balance=info.price-1;assert.equal(researchInfo(state,'dimension-1').affordable,false);
  state.balance=info.price;info=researchInfo(state,'dimension-1');assert.equal(info.affordable,true);
});

test('manual research is visible from the start and respects click and balance thresholds',()=>{
  const state=createState(0);state.balance=1e20;
  const initial=researchInfo(state,'click-1');
  assert.equal(initial.resourceIndex,-1);assert.equal(initial.resourceName,'Ручной клик');assert.equal(initial.target,'click');
  assert.equal(initial.requirement,'Сделать 25 ручных кликов');assert.equal(initial.unlocked,false);assert.equal(initial.affordable,false);
  state.clicks=24;assert.equal(researchInfo(state,'click-1').affordable,false);
  state.clicks=25;assert.equal(researchInfo(state,'click-1').affordable,true);
  state.balance=99;assert.equal(researchInfo(state,'click-1').unlocked,true);assert.equal(researchInfo(state,'click-1').affordable,false);
  state.clicks=25000;
  const advanced=researchInfo(state,'click-sync-5');
  assert.equal(advanced.unlocked,true);assert.match(advanced.requirement.replace(/\s/g,' '),/25 000/);
});

test('purchased research is completed rather than purchasable and metadata reads do not alter progress',()=>{
  const state=createState(0);state.clicks=25;state.balance=100;
  applyAction(state,{type:'upgrade',itemId:'click-1'},0);
  state.balance=1e20;
  const before=JSON.stringify(state),info=researchInfo(state,'click-1');
  assert.equal(info.owned,true);assert.equal(info.unlocked,true);assert.equal(info.affordable,false);
  assert.equal(JSON.stringify(state),before);
  info.name='Changed tooltip';
  assert.notEqual(researchInfo(state,'click-1').name,info.name,'tooltip data does not mutate the shared catalog');
});

test('prestige clears purchased research but keeps already discovered resources visible',()=>{
  const state=createState(0);state.balance=PRESTIGE_PRICE;state.runEarned=1e15;state.totalEarned=1e15;
  state.generators[7]=10;state.upgrades=['dimension-1'];
  assert.equal(researchInfo(state,'dimension-1').owned,true);
  applyAction(state,{type:'prestige'},0);
  const info=researchInfo(state,'dimension-1');
  assert.equal(info.resourceName,'Портал');assert.equal(info.owned,false);assert.equal(info.unlocked,false);assert.equal(info.affordable,false);
});

test('purchasable research precedes cheaper locked items, while purchased tiles stay last and unknown resources stay hidden',()=>{
  const state=createState(0);state.totalEarned=1e9;state.balance=25000;
  state.generators[0]=10;state.generators[1]=10;state.generators[2]=10;
  state.upgrades=['autoclick-1','superintelligence-1'];
  const before=JSON.stringify(state),list=researchList(state);
  assert.deepEqual(list.slice(0,2).map(info=>info.id),['abacus-1','calculator-1']);
  assert.ok(list.slice(0,2).every(info=>info.affordable));
  assert.equal(list[2].id,'click-1','a cheaper locked click research cannot displace a purchasable resource upgrade');
  assert.equal(list.at(-1).id,'autoclick-1','a cheap completed research stays below unfinished ones');
  assert.equal(list.at(-1).affordable,false);
  assert.equal(list.some(info=>info.target==='superintelligence'),false,'even forged ownership does not reveal a future resource');
  for(const group of [list.filter(info=>info.affordable),list.filter(info=>!info.affordable&&!info.owned),list.filter(info=>info.owned)]){
    for(let i=1;i<group.length;i++)assert.ok(group[i-1].price<=group[i].price,'prices ascend within each group');
  }
  assert.equal(JSON.stringify(state),before,'sorting must not modify the save');
  state.clicks=25;
  assert.deepEqual(researchList(state).slice(0,3).map(info=>info.id),['click-1','abacus-1','calculator-1']);
  state.balance=99;
  const poor=researchList(state);assert.equal(poor.some(info=>info.affordable),false);
  assert.equal(poor[0].id,'click-1');assert.equal(poor.at(-1).id,'autoclick-1');
});
