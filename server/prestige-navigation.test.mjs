import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {createState,getStats,applyAction,PRESTIGE_PRICE} from '../shared/economy.mjs';
import {prestigeAppearance} from '../shared/achievements.mjs';

const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');

function declaration(name){
  const start=app.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.notEqual(start,-1,name);
  for(let end=app.indexOf('}',start);end!==-1;end=app.indexOf('}',end+1)){
    const source=app.slice(start,end+1);
    try{new Script(`(${source})`);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Missing declaration ${name}`);
}

function registration(selector){
  const start=app.indexOf(`$('${selector}').addEventListener('click',`);
  assert.notEqual(start,-1,selector);
  for(let end=app.indexOf(');',start);end!==-1;end=app.indexOf(');',end+2)){
    const source=app.slice(start,end+2);
    try{new Script(source);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Missing event handler ${selector}`);
}

// Parse the live dialog and confirmation callbacks, including the final await.
const source=[declaration('openPrestige'),
  ...['#prestige-confirm','#prestige-back','#prestige-final-confirm'].map(registration),
].join('\n');

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

function harness({decision=async()=>true,animation=Promise.resolve()}={}){
  const calls=[],elements=new Map(),snapshots=[];let context;
  const state=createState(1000);state.balance=PRESTIGE_PRICE+1000;state.runEarned=4e6;state.totalEarned=5e6;
  state.generators[0]=4;state.generators[1]=2;state.upgrades=['click-1'];state.achievements=['first'];
  function element(selector){
    if(!elements.has(selector))elements.set(selector,{hidden:false,disabled:false,open:false,checked:true,innerHTML:'',textContent:'',events:new Map(),
      showModal(){this.open=true;calls.push('dialog:open');},
      close(){this.open=false;calls.push('dialog:close');},
      focus(){this.focused=true;},
      scrollIntoView(){calls.push('scroll');},
      addEventListener(event,callback){this.events.set(event,callback);},
    });
    return elements.get(selector);
  }
  context=createContext({
    state,currentPage:'lab',prestigeSubmitting:false,readOnlyTab:false,
    cinematicActive:false,cinematicSound:true,selectedCosmetic:'classic',prestigePage:0,
    appearance:prestigeAppearance(0),musicVolume:20,resumeMusicAfterVisibility:false,
    PRESTIGE_PRICE,getStats,prestigeAppearance,structuredClone,$:element,
    projected:()=>context.state,fmt:value=>String(value),esc:value=>String(value),
    showReadOnlyNotice(){calls.push('read-only');},
    save(){calls.push('save');},render(){calls.push('render');},toast(){calls.push('toast');},
    setCinematicUI(active){context.cinematicActive=active;calls.push(`cinematic:${active}`);},
    showPage(page){context.currentPage=page;calls.push(`show:${page}`);},
    async act(action){
      calls.push('act');assert.equal(action.type,'prestige');
      const accepted=await decision();
      if(accepted){applyAction(context.state,action,1000);calls.push('accepted');}
      return accepted;
    },
    world:{
      setPaused(value){calls.push(`paused:${value}`);},
      playPrestige(options){calls.push('play');snapshots.push(options);return animation;},
      update(next,appearance){calls.push('world:update');snapshots.push({next:structuredClone(next),appearance});},
    },
    prestigeAudio:{prepare(){calls.push('audio:prepare');},play(){calls.push('audio:play');},stop(){calls.push('audio:stop');}},
    music:{playing:false,pause(){calls.push('music:pause');},resume:async()=>{}},
    updateMusic(){},matchMedia:()=>({matches:false}),document:{hidden:false},
    selectedAppearance:next=>prestigeAppearance(next.prestigeCount),
  });
  new Script(source,{filename:'app.mjs:prestige-navigation'}).runInContext(context);
  const fire=selector=>{
    const handler=element(selector).events.get('click');assert.ok(handler,selector);
    return handler();
  };
  return {context,element,fire,calls,snapshots};
}

test('opening the black hole and the first confirmation stay in the laboratory without an action or animation',()=>{
  const h=harness(),before=JSON.stringify(h.context.state);
  h.context.openPrestige();
  assert.equal(h.context.currentPage,'lab');assert.equal(h.element('#prestige-dialog').open,true);
  assert.equal(h.element('#prestige-step-one').hidden,false);assert.equal(h.element('#prestige-step-two').hidden,true);
  assert.equal(h.element('#prestige-confirm').disabled,false);
  assert.deepEqual(h.calls,['dialog:open']);
  h.fire('#prestige-confirm');
  assert.equal(h.context.currentPage,'lab');assert.equal(h.element('#prestige-step-one').hidden,true);
  assert.equal(h.element('#prestige-step-two').hidden,false);assert.equal(h.element('#prestige-back').focused,true);
  assert.deepEqual(h.calls,['dialog:open']);assert.equal(JSON.stringify(h.context.state),before);
  h.fire('#prestige-back');assert.equal(h.element('#prestige-step-one').hidden,false);
  assert.equal(h.element('#prestige-step-two').hidden,true);assert.equal(h.context.currentPage,'lab');
});

test('only the accepted second confirmation opens the world, then plays the previous world exactly once',async()=>{
  const decision=deferred(),animation=deferred();
  const h=harness({decision:()=>decision.promise,animation:animation.promise});
  const before=structuredClone(h.context.state);
  h.context.openPrestige();h.fire('#prestige-confirm');
  const first=h.fire('#prestige-final-confirm');await h.fire('#prestige-final-confirm');
  assert.equal(h.calls.filter(call=>call==='act').length,1,'a repeated confirmation cannot submit another reset');
  assert.equal(h.context.currentPage,'lab');assert.equal(h.calls.includes('play'),false);
  assert.equal(JSON.stringify(h.context.state),JSON.stringify(before));
  decision.resolve(true);
  // Resolve the server decision, then allow its two awaiting callbacks to run.
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(h.context.currentPage,'world');assert.equal(h.element('#prestige-dialog').open,false);
  assert.equal(h.calls.filter(call=>call==='show:world').length,1);assert.equal(h.calls.filter(call=>call==='play').length,1);
  assert.ok(h.calls.indexOf('accepted')<h.calls.indexOf('show:world'));
  assert.ok(h.calls.indexOf('show:world')<h.calls.indexOf('scroll'));
  assert.ok(h.calls.indexOf('scroll')<h.calls.indexOf('play'));
  assert.equal(JSON.stringify(h.snapshots[0].state),JSON.stringify(before),'the cinematic receives the intact old world');
  assert.notEqual(h.snapshots[0].state,h.context.state);
  assert.equal(h.context.state.balance,0);assert.equal(h.context.state.prestigeCount,1);
  assert.ok(h.context.state.generators.every(count=>count===0));
  assert.equal(h.snapshots[1].next.prestigeCount,1,'the world is updated to the accepted new epoch');
  assert.equal(h.context.prestigeSubmitting,true);
  animation.resolve();await first;
  assert.equal(h.context.prestigeSubmitting,false);assert.equal(h.context.cinematicActive,false);
  assert.equal(h.element('#prestige-final-confirm').disabled,false);assert.equal(h.context.selectedCosmetic,'prestige');
});

test('a refused or failed prestige leaves the current world, account and theme intact',async()=>{
  for(const decision of [async()=>false,async()=>{throw new Error('Connection failed');}]){
    const h=harness({decision});const before=JSON.stringify(h.context.state);
    h.context.openPrestige();h.fire('#prestige-confirm');await h.fire('#prestige-final-confirm');
    assert.equal(h.context.currentPage,'lab');assert.equal(h.element('#prestige-dialog').open,true);
    assert.equal(JSON.stringify(h.context.state),before);assert.equal(h.context.selectedCosmetic,'classic');
    for(const call of ['show:world','scroll','play','world:update','audio:play','music:pause'])assert.equal(h.calls.includes(call),false,call);
    assert.equal(h.snapshots.length,0);assert.equal(h.context.prestigeSubmitting,false);
    assert.equal(h.context.cinematicActive,false);assert.equal(h.element('#prestige-final-confirm').disabled,false);
  }
});
