import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, eventAvailable, getPublicEvent } from '../shared/events.mjs';
import { createState, applyAction, settle, GENERATORS } from '../shared/economy.mjs';

test('all nine event types unlock from their own generator and validate their own generated answers',()=>{
  assert.equal(EVENTS.length,9);
  for(const event of EVENTS){
    const s=createState(0);
    assert.equal(eventAvailable(s,event.id,0),false);
    assert.throws(()=>applyAction(s,{type:'event_start',itemId:event.id},0),{code:'event_locked'});
    s.generators[GENERATORS.findIndex(g=>g.id===event.generatorId)]=1;
    assert.equal(eventAvailable(s,event.id,0),true);
    applyAction(s,{type:'event_start',itemId:event.id},0);
    const active=s.activeEvent,publicEvent=getPublicEvent(active);
    assert.equal(active.deadline,event.durationSec*1000);assert.ok(active.reward>0);assert.ok(active.penalty>0);
    assert.equal(publicEvent._answers,undefined);assert.ok(!JSON.stringify(publicEvent).includes('_answers'));
    const reward=active.reward;
    applyAction(s,{type:'event_answer',itemId:active.id,answers:[...active._answers]},0);
    assert.equal(s.eventStats.wins,1);assert.equal(s.totalEarned,reward);assert.equal(s.activeEvent,null);
    assert.equal(eventAvailable(s,event.id,1),false);
    assert.throws(()=>applyAction(s,{type:'event_start',itemId:event.id},1),{code:'event_cooldown'});
  }
});
test('events are optional; no failure or penalty occurs without explicit start',()=>{
  const s=createState(0);s.balance=100;s.generators[1]=1;
  settle(s,100000);assert.equal(s.eventStats.losses,0);assert.equal(s.activeEvent,null);assert.ok(s.balance>=100);
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
