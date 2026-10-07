import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, WORLD_EVENTS, eventAvailable, eventStakes, getPublicEvent } from '../shared/events.mjs';
import { createState, applyAction, settle, GENERATORS } from '../shared/economy.mjs';

test('all twelve event types unlock from their own generator and validate their own generated answers',()=>{
  assert.equal(EVENTS.length,12);
  for(const event of EVENTS){
    const s=createState(0);
    assert.equal(eventAvailable(s,event.id,0),false);
    assert.throws(()=>applyAction(s,{type:'event_start',itemId:event.id},0),{code:'event_locked'});
    s.generators[GENERATORS.findIndex(g=>g.id===event.generatorId)]=1;
    assert.equal(eventAvailable(s,event.id,0),true);
    applyAction(s,{type:'event_start',itemId:event.id},0);
    const active=s.activeEvent,publicEvent=getPublicEvent(active);
    assert.equal(active.deadline,event.durationSec*1000);assert.ok(active.reward>0);assert.equal(active.penalty,active.reward);
    assert.equal(publicEvent._answers,undefined);assert.ok(!JSON.stringify(publicEvent).includes('_answers'));
    const reward=active.reward;
    applyAction(s,{type:'event_answer',itemId:active.id,answers:[...active._answers]},0);
    assert.equal(s.eventStats.wins,1);assert.equal(s.totalEarned,reward);assert.equal(s.activeEvent,null);
    assert.equal(eventAvailable(s,event.id,1),false);
    assert.throws(()=>applyAction(s,{type:'event_start',itemId:event.id},1),{code:'event_cooldown'});
  }
});
test('binary decode gets 90 seconds and world events stay optional with independent unlocks and payoffs',()=>{
  const binary=EVENTS.find(e=>e.id==='computer');assert.equal(binary.durationSec,90);
  const s=createState(0);s.generators[4]=1;applyAction(s,{type:'event_start',itemId:'computer'},0);
  assert.equal(s.activeEvent.deadline,90_000);settle(s,60_000);assert.ok(s.activeEvent);
  settle(s,90_001);assert.equal(s.lastEventResult.outcome,'timeout');
  assert.equal(WORLD_EVENTS.length,3);assert.ok(WORLD_EVENTS.every(e=>e.source==='world'));
  assert.deepEqual(new Set(WORLD_EVENTS.map(e=>e.id)),new Set(['school-olympiad','portal-meteors','academic-discovery']));
  for(const e of WORLD_EVENTS){
    const state=createState(0);state.generators[0]=1;settle(state,100_000);assert.equal(state.activeEvent,null);assert.equal(state.eventStats.losses,0);
    assert.throws(()=>applyAction(state,{type:'event_start',itemId:e.id},100_000),{code:'event_locked'});
    assert.ok(e.rules&&e.description&&e.rewardClicks>0);
  }
});
test('events are optional; no failure or penalty occurs without explicit start',()=>{
  const s=createState(0);s.balance=100;s.generators[1]=1;
  settle(s,100000);assert.equal(s.eventStats.losses,0);assert.equal(s.activeEvent,null);assert.ok(s.balance>=100);
});
test('stake preview equals both reward and penalty in click-based and production-based cases',()=>{
  for(const definition of EVENTS){
    for(const stats of [{clickPower:1000,cps:1},{clickPower:1,cps:1e9}]){
      const stakes=eventStakes(stats,definition),expected=Math.max(definition.rewardClicks*stats.clickPower,stats.cps*30);
      assert.deepEqual(stakes,{reward:expected,penalty:expected});assert.equal('penaltyClicks' in definition,false);
    }
  }
});
test('both stakes remain fixed when production changes during a challenge',()=>{
  const state=createState(0);state.generators[1]=1;state.balance=1000;
  applyAction(state,{type:'event_start',itemId:'school'},0);const active=state.activeEvent;
  assert.equal(active.reward,60);assert.equal(active.penalty,60);
  state.generators[10]=1;state.prestige=10;
  const wrong=active._answers.map((value,i)=>(value+1)%active.prompts[i].options.length);
  applyAction(state,{type:'event_answer',itemId:active.id,answers:wrong},0);
  assert.equal(state.balance,940);assert.equal(state.lastEventResult.penalty,60);assert.equal(state.totalEarned,0);
});
test('old active challenge stakes survive loading and still use their original penalty once',()=>{
  const state=createState(0);state.generators[1]=1;state.balance=1000;
  applyAction(state,{type:'event_start',itemId:'school'},0);
  state.activeEvent.penalty=10;const restored=JSON.parse(JSON.stringify(state)),active=restored.activeEvent;
  settle(restored,0);assert.equal(restored.activeEvent.reward,60);assert.equal(restored.activeEvent.penalty,10);
  const wrong=active._answers.map((value,i)=>(value+1)%active.prompts[i].options.length);
  applyAction(restored,{type:'event_answer',itemId:active.id,answers:wrong},0);
  assert.equal(restored.balance,990);assert.equal(restored.lastEventResult.penalty,10);
});
test('wrong answers deduct only available balance and never reduce lifetime earnings',()=>{
  const s=createState(0);s.balance=3;s.totalEarned=100;s.runEarned=100;s.generators[1]=1;
  applyAction(s,{type:'event_start',itemId:'school'},0);
  const active=s.activeEvent,wrong=active._answers.map((value,i)=>(value+1)%active.prompts[i].options.length);
  applyAction(s,{type:'event_answer',itemId:active.id,answers:wrong},0);
  assert.equal(s.balance,0);assert.equal(s.totalEarned,100);assert.equal(s.runEarned,100);assert.equal(s.eventStats.losses,1);assert.equal(s.lastEventResult.penalty,3);
  assert.throws(()=>applyAction(s,{type:'event_answer',itemId:active.id,answers:wrong},0),{code:'event_unavailable'});
});
test('timeouts apply once; late answer cannot award anything, and prestige cannot dodge active challenge',()=>{
  const s=createState(0);s.balance=100;s.totalEarned=1e6;s.runEarned=1e6;s.generators[1]=1;
  applyAction(s,{type:'event_start',itemId:'school'},0);
  const active=structuredClone(s.activeEvent);
  assert.throws(()=>applyAction(s,{type:'prestige'},0),{code:'event_active'});
  applyAction(s,{type:'event_answer',itemId:active.id,answers:active._answers},active.deadline+1);
  const after=s.balance;
  assert.equal(s.eventStats.losses,1);assert.equal(s.eventStats.wins,0);assert.equal(s.lastEventResult.outcome,'timeout');
  settle(s,active.deadline+1);assert.equal(s.balance,after);assert.equal(s.eventStats.losses,1);
});
test('challenge mismatches and forged answer shapes cannot resolve an active event',()=>{
  const s=createState(0);s.generators[1]=1;
  applyAction(s,{type:'event_start',itemId:'school'},0);
  const active=structuredClone(s.activeEvent);
  assert.throws(()=>applyAction(s,{type:'event_answer',itemId:'other',answers:active._answers},0),{code:'event_mismatch'});
  assert.throws(()=>applyAction(s,{type:'event_answer',itemId:active.id,answers:[99,99,99]},0),{code:'invalid_answers'});
  assert.throws(()=>applyAction(s,{type:'event_answer',itemId:active.id,answers:['a','b','c']},0),{code:'invalid_answers'});
  assert.equal(s.activeEvent.id,active.id);assert.equal(s.totalEarned,0);
});
