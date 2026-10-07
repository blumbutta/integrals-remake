import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {createState} from '../shared/economy.mjs';

const appSource=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');

// Exercise the app's actual guards and rendering, not a second implementation.
function declaration(name){
  const start=appSource.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.notEqual(start,-1,`app.mjs declares ${name}`);
  for(let end=appSource.indexOf('}',start);end!==-1;end=appSource.indexOf('}',end+1)){
    const source=appSource.slice(start,end+1);
    try{new Script(`(${source})`);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Could not extract ${name} from app.mjs`);
}

const functions=['showReadOnlyNotice','setStatus','act','clickIntegral','renderGolden'].map(declaration).join('\n');

function harness(overrides={}){
  const calls=[],elements=new Map();
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{
      hidden:false,open:false,className:'',title:'',innerHTML:'',textContent:'',attributes:new Map(),
      setAttribute(name,value){this.attributes.set(name,value);},
      getAttribute(name){return this.attributes.get(name);},
      showModal(){calls.push('notice');this.open=true;},
      focus(){calls.push('focus');},
    });
    return elements.get(selector);
  };
  const record=name=>(...args)=>{calls.push(name);return args[0];};
  const state=createState(1000);
  const context=createContext({
    readOnlyTab:true,needsName:false,cinematicActive:false,transitioning:false,
    mode:'cloud',connected:true,goldenClaiming:false,
    state,pending:[],clickBuffer:0,clickCredit:24,lastClickTime:1000,
    actionWaiters:new Map(),clockOffset:0,
    $:element,$$:selector=>selector==='dialog[open]'?[...elements.values()].filter(value=>value.open):[],
    esc:value=>String(value),
    openWelcome:record('welcome'),queueClicks:record('queue'),applyAction:record('apply'),
    flush:record('flush'),save:record('save'),render:record('render'),toast:record('toast'),
    getStats:record('stats'),projected:record('project'),
    performance:{now(){calls.push('clock');return 2000;}},
    clickEffects:{manualClick:record('effect')},world:{burst:record('burst')},
    ...overrides,
  });
  new Script(functions,{filename:'app.mjs:read-only-functions'}).runInContext(context);
  return {context,calls,element};
}

test('read-only golden, purchases and events open a clear notice without touching the state or queue',async()=>{
  for(const mode of ['local','cloud'])for(const action of [
    {type:'golden'},
    {type:'buy',itemId:'autoclick'},
    {type:'event_start',itemId:'school'},
    {type:'prestige'},
  ]){
    const h=harness({mode,needsName:true});
    const before=JSON.stringify(h.context.state);
    assert.equal(await h.context.act(action),false);
    assert.equal(h.element('#read-only-dialog').open,true);
    assert.deepEqual(h.calls,['notice'],'the read-only explanation precedes onboarding or any game action');
    assert.equal(JSON.stringify(h.context.state),before);
    assert.equal(h.context.pending.length,0);assert.equal(h.context.actionWaiters.size,0);
    assert.equal(h.context.clickBuffer,0);
  }
});

test('manual mouse and keyboard clicks in a read-only tab do not spend credit or pretend to earn integrals',()=>{
  for(const mode of ['local','cloud'])for(const event of [undefined,{clientX:120,clientY:200}]){
    const h=harness({mode,needsName:true});
    const before=JSON.stringify(h.context.state);
    h.context.clickIntegral(event);
    assert.equal(h.element('#read-only-dialog').open,true);
    assert.deepEqual(h.calls,['notice']);
    assert.equal(JSON.stringify(h.context.state),before);
    assert.equal(h.context.clickCredit,24);assert.equal(h.context.lastClickTime,1000);
    assert.equal(h.context.clickBuffer,0);assert.equal(h.context.pending.length,0);
  }
});

test('the read-only notice is idempotent and normal status updates cannot disguise read-only mode',()=>{
  const h=harness();
  h.context.showReadOnlyNotice();h.context.showReadOnlyNotice();
  assert.equal(h.calls.filter(call=>call==='notice').length,1);
  const status=h.element('#save-status');
  for(const [text,kind] of [['В облаке','online'],['Сохраняем…','syncing'],['На устройстве','local']]){
    h.context.setStatus(text,kind);
    assert.match(status.innerHTML,/Только просмотр/);
    assert.match(status.className,/(?:^|\s)readonly(?:\s|$)/);
    assert.match(status.getAttribute('aria-label'),/Только просмотр/);
    assert.ok(status.title.length>10,'the visible status has an explanatory title');
  }
  h.context.readOnlyTab=false;h.context.setStatus('В облаке','online');
  assert.match(status.innerHTML,/В облаке/);assert.equal(status.className,'save-status online');
});

test('golden integrals stay hidden in read-only, disconnected and modal views and show only in an actionable window',()=>{
  const now=1000,state={golden:{nextAt:900,availableUntil:2000}};
  const h=harness({readOnlyTab:false});const golden=h.element('#golden-button');
  h.context.renderGolden(state,now);assert.equal(golden.hidden,false);
  for(const flag of ['readOnlyTab','needsName','goldenClaiming','cinematicActive']){
    h.context[flag]=true;h.context.renderGolden(state,now);assert.equal(golden.hidden,true,flag);
    h.context[flag]=false;
  }
  h.element('#profile-dialog').open=true;h.context.renderGolden(state,now);assert.equal(golden.hidden,true);
  h.element('#profile-dialog').open=false;h.context.renderGolden(state,now);assert.equal(golden.hidden,false);
  h.context.connected=false;h.context.renderGolden(state,now);assert.equal(golden.hidden,true);
  h.context.mode='local';h.context.renderGolden(state,now);assert.equal(golden.hidden,false,'local play does not require a cloud connection');
  h.context.renderGolden(state,2000);assert.equal(golden.hidden,true,'the visible window has ended');
  h.context.renderGolden(state,899);assert.equal(golden.hidden,true,'the window has not opened');
  h.context.renderGolden({golden:{availableUntil:0,nextAt:900}},now);assert.equal(golden.hidden,true);
});
