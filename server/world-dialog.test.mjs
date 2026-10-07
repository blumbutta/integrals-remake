import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {worldLocations,worldEventsFor} from '../world.mjs';
import {createState,GENERATORS,getStats} from '../shared/economy.mjs';
import {EVENTS,eventAvailable,eventStakes,getPublicEvent} from '../shared/events.mjs';

const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const lists=source.slice(source.indexOf('function eventCard('),source.indexOf("$('#event-body').addEventListener('click'"));
const opening=source.slice(source.indexOf('function openEvent('),source.indexOf('function renderChallenge('));
function fixture(){
  const state=createState(),nodes=new Map(),icons=[];
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',hidden:false,open:false,classList:{add(){},remove(){}},setAttribute(){},focus(){},addEventListener(){},showModal(){this.open=true;this.opened=(this.opened||0)+1;}});
    return nodes.get(selector);
  };
  const context={state,GENERATORS,EVENTS,eventAvailable,eventStakes,getPublicEvent,getStats,worldLocations,worldEventsFor,
    $:node,$$:()=>[],Date,clockOffset:0,cinematicActive:false,worldLocation:null,eventDialogView:null,eventRenderedId:null,selectedEvent:null,currentPage:'world',
    projected:()=>state,showPage:page=>{context.currentPage=page;},esc:String,fmt:String,durationText:ms=>String(Math.ceil(ms/1000)),
    generatorIcon:index=>{icons.push(index);return `image-${index}.png`;},toast:message=>{context.message=message;},renderChallenge:active=>{context.challenge=active;},
  };
  vm.createContext(context);vm.runInContext(lists+'\n'+opening,context);
  return {state,node,context,icons};
}

test('map popup never renders the details of a locked district or hidden teachers',()=>{
  const {state,node,context,icons}=fixture();state.generators[1]=1;
  context.openWorldEvents('portals');
  assert.equal(node('#event-dialog').open,true);
  assert.equal(node('#event-title').textContent,'Неизвестный район');
  assert.doesNotMatch(node('#event-body').innerHTML,/Портал|Метеор|Обратный сигнал|image-/);
  assert.equal(icons.length,0);
  context.openWorldEvents('school');
  const html=node('#event-body').innerHTML;
  assert.match(html,/Контрольная/);assert.match(html,/Школьная олимпиада/);
  assert.doesNotMatch(html,/Преподаватель|Проверка работ|image-3/);
  assert.deepEqual(icons,[1,1]);
  assert.equal(node('#event-dialog').opened,1,'changing the district reuses the same popup');
});

test('hidden direct event selection cannot reveal rules; a running event still resumes',()=>{
  const {state,node,context}=fixture();
  context.openEvent('portal');
  assert.equal(context.message,'Это испытание ещё не открыто');
  assert.equal(node('#event-dialog').open,false);
  state.generators[1]=1;
  state.activeEvent={id:'running-school',eventId:'school',kind:'quiz',name:'Контрольная',deadline:Date.now()+60000,startedAt:Date.now(),prompts:[],data:{}};
  context.openEvent('school');
  assert.equal(context.challenge.id,'running-school');
  assert.equal(node('#event-dialog').open,true);
});
