import test from 'node:test';
import assert from 'node:assert/strict';
import {worldLocations,worldEventsFor} from '../world.mjs';
import {createState} from '../shared/economy.mjs';
import {EVENTS} from '../shared/events.mjs';

test('unopened map locations and event lists contain no upcoming names or icons',()=>{
  const state=createState();
  assert.deepEqual(worldEventsFor(state),[]);
  for(const location of worldLocations(state)){
    assert.equal(location.name,'Неизвестный район');
    assert.equal(location.unlocked,false);
    assert.deepEqual(location.generatorIndices,[]);
    assert.deepEqual(worldEventsFor(state,location.id),[]);
  }
});

test('opening a shared school location does not reveal teacher events',()=>{
  const state=createState();state.generators[1]=1;
  const locations=worldLocations(state),school=locations.find(item=>item.id==='school');
  assert.equal(school.name,'Школа');assert.deepEqual(school.generatorIndices,[1]);
  assert.deepEqual(worldEventsFor(state,'school').map(event=>event.id),['school','school-olympiad']);
  assert.equal(worldEventsFor(state).some(event=>event.id==='teacher'),false);
  assert.equal(locations.find(item=>item.id==='university').name,'Неизвестный район');
  state.generators[3]=1;
  assert.equal(worldEventsFor(state,'school').some(event=>event.id==='teacher'),true);
});

test('every discovered map event belongs to an owned resource and invalid district stays empty',()=>{
  const state=createState();state.generators=state.generators.map(()=>1);
  const events=worldEventsFor(state);
  assert.equal(events.length,EVENTS.length);
  assert.equal(new Set(events.map(item=>item.id)).size,EVENTS.length);
  assert.deepEqual(worldEventsFor(state,'does-not-exist'),[]);
  state.generators=state.generators.map(()=>0);
  assert.deepEqual(worldEventsFor(state),[]);
  assert.ok(worldLocations(state).every(item=>!item.unlocked));
});
