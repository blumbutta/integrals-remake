import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,applyAction,GENERATORS,getStats} from '../shared/economy.mjs';
import {resourceInfo,resourceDiscovered} from '../resource-info.mjs';

test('resource mystery opens at its price and survives spending, bulk selection and prestige',()=>{
  const s=createState(1000);
  assert.equal(resourceDiscovered(s,0),false);
  assert.deepEqual(resourceInfo(s,'autoclick'),{id:'autoclick',discovered:false,price:15,unlockPrice:15});
  s.balance=15;s.totalEarned=15;s.runEarned=15;
  applyAction(s,{type:'buy',itemId:'autoclick'},1000);
  assert.equal(s.balance,0);assert.equal(resourceDiscovered(s,0),true);
  assert.equal(resourceInfo(s,'autoclick',10).discovered,true);
  s.generators[0]=0;s.balance=0;
  assert.equal(resourceDiscovered(s,0),true);
  assert.equal(resourceDiscovered(s,1),false);
});
test('resource details include effective rates, total share and only unlocked research',()=>{
  const s=createState();s.totalEarned=1e9;s.prestige=5;s.generators[1]=10;s.generators[2]=1;s.upgrades=['abacus-1'];
  const info=resourceInfo(s,'abacus',10);
  assert.equal(info.count,10);assert.equal(info.amount,10);
  assert.equal(info.unitCps,2*2*1.5);assert.equal(info.totalCps,60);
  assert.equal(info.share,60/getStats(s).cps*100);
  assert.deepEqual(info.research.map(u=>[u.id,u.owned]),[['abacus-1',true]]);
  s.generators[1]=25;
  assert.deepEqual(resourceInfo(s,'abacus').research.map(u=>[u.id,u.owned]),[['abacus-1',true],['abacus-2',false]]);
  assert.equal(resourceInfo(s,'missing'),null);
});
test('anonymous resource details expose no name, description, production or research',()=>{
  const s=createState();s.totalEarned=100;
  for(const generator of GENERATORS.slice(1))assert.deepEqual(Object.keys(resourceInfo(s,generator.id)).sort(),['discovered','id','price','unlockPrice']);
});

test('resource tooltip attributes teamwork to its source and includes newly unlocked research',()=>{
  const state=createState(0);state.generators[0]=50;state.generators[10]=10;state.totalEarned=1e15;state.upgrades=['autoclick-team'];
  const info=resourceInfo(state,'autoclick');
  assert.ok(info.teamworkCps>info.directCps);assert.equal(info.teamworkBonus,0.2*50/150);
  assert.equal(info.totalCps,info.teamworkCps+info.directCps);assert.equal(info.unitCps,info.totalCps/50);
  assert.equal(info.research.find(u=>u.id==='autoclick-team').owned,true);
  assert.equal(info.research.find(u=>u.id==='autoclick-3').owned,false);
  assert.equal(info.research.some(u=>u.id==='autoclick-4'),false);
});
