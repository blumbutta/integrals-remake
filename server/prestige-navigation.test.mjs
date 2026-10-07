import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {createState,getStats,applyAction,PRESTIGE_PRICE,MAX_PRESTIGE,PRESTIGE_VERSION,GENERATORS,UPGRADES,migrateState,normalizePrestige} from '../shared/economy.mjs';
import {prestigeAppearance,ACHIEVEMENTS} from '../shared/achievements.mjs';
import {EVENTS} from '../shared/events.mjs';

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
  const calls=[],elements=new Map(),snapshots=[],toasts=[],actions=[];let context;
  const state=createState(1000);state.balance=PRESTIGE_PRICE+1000;state.runEarned=4e6;state.totalEarned=5e6;
  state.generators[0]=4;state.generators[1]=2;state.upgrades=['click-1'];state.achievements=['first'];
  function element(selector){
    if(!elements.has(selector))elements.set(selector,{hidden:false,disabled:false,open:false,checked:true,innerHTML:'',textContent:'',events:new Map(),dataset:{},classes:new Set(),
      classList:{toggle(name,enabled){const classes=elements.get(selector).classes;if(enabled)classes.add(name);else classes.delete(name);}},
      setAttribute(name,value){this[name]=value;},style:{setProperty(){}},
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
    appearance:prestigeAppearance(0),musicVolume:20,musicEnabled:true,resumeMusicAfterVisibility:false,
    PRESTIGE_PRICE,MAX_PRESTIGE,getStats,prestigeAppearance,structuredClone,$:element,
    projected:()=>context.state,fmt:value=>String(value),esc:value=>String(value),
    showReadOnlyNotice(){calls.push('read-only');},
    save(){calls.push('save');},render(){calls.push('render');},toast(message){calls.push('toast');toasts.push(message);},
    setCinematicUI(active){context.cinematicActive=active;calls.push(`cinematic:${active}`);},
    showPage(page){context.currentPage=page;calls.push(`show:${page}`);},
    async act(action){
      calls.push('act');actions.push(structuredClone(action));assert.equal(action.type,'prestige');
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
    updateMusic(){},startPreferredMusic(){calls.push('music:start-preferred');},matchMedia:()=>({matches:false}),document:{hidden:false},
    selectedAppearance:next=>prestigeAppearance(next.prestigeCount),
  });
  new Script(source,{filename:'app.mjs:prestige-navigation'}).runInContext(context);
  const fire=selector=>{
    const handler=element(selector).events.get('click');assert.ok(handler,selector);
    return handler();
  };
  return {context,element,fire,calls,snapshots,toasts,actions};
}

test('opening the black hole and the first confirmation stay in the laboratory without an action or animation',()=>{
  const h=harness(),before=JSON.stringify(h.context.state);
  h.context.openPrestige();
  assert.equal(h.context.currentPage,'lab');assert.equal(h.element('#prestige-dialog').open,true);
  assert.equal(h.element('#prestige-step-one').hidden,false);assert.equal(h.element('#prestige-step-two').hidden,true);
  assert.equal(h.element('#prestige-confirm').disabled,false);
  assert.match(h.element('#prestige-preserved-note').textContent,/Рейтинговая сумма начнётся с нуля/);
  assert.match(h.element('#prestige-preserved-note').textContent,/престиж вырастет на 1/);
  assert.match(h.element('#prestige-preserved-note').textContent,/Общий заработок за всё время и достижения сохранятся/);
  assert.doesNotMatch(h.element('#prestige-preserved-note').textContent,/место в рейтинге сохранятся/);
  assert.match(h.element('#prestige-reset-items').textContent,/рейтинговая сумма/);
  assert.doesNotMatch(h.element('#prestige-kept-items').textContent,/рейтинг/);
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
  assert.equal(h.context.state.runEarned,0);assert.equal(h.context.state.totalEarned,before.totalEarned,'ordinary prestige preserves lifetime earnings while resetting ranking earnings');
  assert.deepEqual(h.actions,[{type:'prestige'}],'an ordinary reset never sends cosmic reset consent');
  assert.ok(h.context.state.generators.every(count=>count===0));
  assert.equal(h.snapshots[1].next.prestigeCount,1,'the world is updated to the accepted new epoch');
  assert.equal(h.context.prestigeSubmitting,true);
  animation.resolve();await first;
  assert.equal(h.context.prestigeSubmitting,false);assert.equal(h.context.cinematicActive,false);
  assert.equal(h.element('#prestige-final-confirm').disabled,false);assert.equal(h.context.selectedCosmetic,'prestige');
  assert.ok(h.calls.indexOf('cinematic:false')<h.calls.indexOf('music:start-preferred'),'preferred ambient music resumes after the cinematic ends');
});

test('prestige completion respects disabled music and a hidden page',async()=>{
  for(const [enabled,hidden] of [[false,false],[true,true]]){
    const h=harness();h.context.musicEnabled=enabled;h.context.document.hidden=hidden;
    h.context.openPrestige();h.fire('#prestige-confirm');await h.fire('#prestige-final-confirm');
    assert.equal(h.context.state.prestigeCount,1);assert.equal(h.calls.includes('music:start-preferred'),false);
    assert.equal(h.context.musicEnabled,enabled,'temporary cinematic pauses do not change the stored preference');
  }
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


test('the paid transition from the prestige cap clearly warns twice, resets rating, and keeps its permanent world award',async()=>{
  const h=harness();h.context.state.prestige=h.context.state.prestigeCount=MAX_PRESTIGE;
  h.context.state.totalEarned=PRESTIGE_PRICE*50;
  h.context.state.balance=PRESTIGE_PRICE-1;h.context.openPrestige();
  assert.equal(h.element('#prestige-confirm').disabled,true,'the maximum level still requires the full purchase price');
  assert.match(h.element('#prestige-cost-warning').innerHTML,/мировом рейтинге обнулятся/);
  assert.ok(h.element('#prestige-details').innerHTML.includes(`0 / ${MAX_PRESTIGE}`));
  assert.ok(h.element('#prestige-details').innerHTML.includes(`>×${1+MAX_PRESTIGE*.1}<`));
  assert.match(h.element('#prestige-details').innerHTML,/>×1</);
  assert.match(h.element('#prestige-details').innerHTML,/Постоянная награда/);
  assert.doesNotMatch(h.element('#prestige-details').innerHTML,/\+0 уровень|prestige:101/);
  h.context.state.balance=PRESTIGE_PRICE+500;h.context.openPrestige();
  assert.equal(h.element('#prestige-confirm').disabled,false,'zero prestigeGain does not block the final cycle');
  assert.match(h.element('#prestige-final-warning').textContent,/мировом рейтинге станут нулевыми/);
  assert.match(h.element('#prestige-final-confirm').textContent,/обнулить рейтинг/);
  h.fire('#prestige-confirm');
  assert.equal(h.context.currentPage,'lab');assert.equal(h.calls.includes('act'),false);
  await h.fire('#prestige-final-confirm');
  assert.equal(h.context.currentPage,'world');assert.equal(h.context.state.totalEarned,0);
  assert.deepEqual(h.actions,[{type:'prestige',confirmCosmicReset:true}],'only the second confirmation sends explicit consent to reset the ranking');
  assert.equal(h.context.state.prestigeCount,0);assert.equal(h.context.state.prestige,0);
  assert.equal(h.context.state.cosmicAscensions,1);assert.equal(h.context.prestigePage,0);
  assert.equal(h.context.selectedCosmetic,'classic');assert.equal(h.calls.filter(call=>call==='play').length,1);
  assert.equal(h.snapshots[1].next.cosmicAscensions,1,'the new world receives permanent ownership immediately');
  assert.match(h.toasts.at(-1),/особый мир открыт навсегда/);
  assert.doesNotMatch(h.toasts.at(-1),/Перерождение №0|\+0/);
  assert.ok(h.context.state.achievements.includes('first'));
});

test('the maximum level remains a purchasable final cycle while the god emblem requires actual permanent ownership',()=>{
  const h=harness(),avatar=h.element('avatar');
  h.context.emoji='🧪';h.context.$$=()=>[avatar];
  const mark=app.slice(app.indexOf('const blackHoleOwnerMark='),app.indexOf('\nfunction renderProfileFrame'));
  new Script(mark+'\n'+declaration('renderProfileFrame')+'\n'+declaration('renderPrestigeResource')).runInContext(h.context);
  h.context.state.prestige=h.context.state.prestigeCount=MAX_PRESTIGE;
  h.context.renderProfileFrame(h.context.state);h.context.renderPrestigeResource(h.context.state);
  assert.equal(h.element('#prestige-open').disabled,false);
  assert.ok(h.element('#prestige-open').classes.has('affordable'));
  assert.match(h.element('#prestige-resource-note').textContent,/Рейтинг и престиж → 0/);
  assert.equal(avatar.classes.has('prestige-god'),false);assert.doesNotMatch(avatar.innerHTML,/<svg/);
  h.context.state.cosmicAscensions=1;h.context.state.prestige=h.context.state.prestigeCount=0;
  h.context.renderProfileFrame(h.context.state);h.context.renderPrestigeResource(h.context.state);
  assert.ok(avatar.classes.has('prestige-god'));assert.ok(avatar.classes.has('prestige-avatar'));
  assert.match(avatar.innerHTML,/<svg/);assert.match(h.element('#profile-button')['aria-label'],/Владыка чёрной дыры/);
  assert.equal(h.element('#prestige-open').disabled,false,'a new cycle may start after obtaining the permanent award');
});


test('restoring a local save preserves completed cosmic cycles and the archived legacy prestige',()=>{
  const context=createContext({createState,PRESTIGE_VERSION,GENERATORS,UPGRADES,migrateState,normalizePrestige,ACHIEVEMENTS,EVENTS});
  new Script(declaration('validAchievement')+'\n'+declaration('validateState')).runInContext(context);
  const saved=createState();saved.cosmicAscensions=2;saved.legacyPrestige={points:75000,count:120};
  const restored=context.validateState(saved);
  assert.equal(restored.cosmicAscensions,2);assert.equal(restored.prestigeCount,0);
  assert.equal(JSON.stringify(restored.legacyPrestige),JSON.stringify(saved.legacyPrestige));
  assert.equal(restored.prestigeVersion,PRESTIGE_VERSION);
  const old=createState();delete old.prestigeVersion;old.prestige=75000;old.prestigeCount=120;
  const migrated=context.validateState(old);
  assert.equal(migrated.prestigeCount,MAX_PRESTIGE);assert.equal(migrated.cosmicAscensions,0,'the old cap alone does not grant the permanent reward');
});


test('a level change between confirmations requires showing the new destructive terms before sending consent',async()=>{
  const h=harness();h.context.state.prestige=h.context.state.prestigeCount=MAX_PRESTIGE-1;
  h.context.openPrestige();h.fire('#prestige-confirm');
  h.context.state.prestige=h.context.state.prestigeCount=MAX_PRESTIGE;
  await h.fire('#prestige-final-confirm');
  assert.equal(h.actions.length,0);assert.equal(h.calls.includes('play'),false);
  assert.equal(h.context.currentPage,'lab');assert.equal(h.element('#prestige-step-one').hidden,false);
  assert.match(h.element('#prestige-cost-warning').innerHTML,/мировом рейтинге обнулятся/);
  assert.equal(h.context.prestigeSubmitting,false);
});


test('ranking displays cycle score and never falls back to lifetime earnings',async()=>{
  const h=harness();
  h.context.request=async()=>({entries:[
    {id:'a',nickname:'Первый',emoji:'🧪',prestige:2,rank:1,score:4321,totalEarned:999999999},
    {id:'b',nickname:'Второй',emoji:'∫',prestige:1,rank:2,runEarned:1234,totalEarned:888888888},
    {id:'c',nickname:'Третий',emoji:'∫',prestige:0,rank:3,totalEarned:777777777},
  ]});
  h.context.profileEmoji=value=>value;h.context.blackHoleOwnerMark='';
  h.element('#refresh-ranking').querySelector=()=>h.element('refresh-label');
  new Script(declaration('loadRanking')).runInContext(h.context);
  await h.context.loadRanking();
  const markup=h.element('#ranking-content').innerHTML;
  assert.match(markup,/Сначала престиж, затем интегралы за текущий цикл/);
  assert.match(markup,/>Интегралы за цикл</);
  assert.match(markup,/<strong>4321 ∫<\/strong>/);
  assert.match(markup,/<strong>1234 ∫<\/strong>/);
  assert.match(markup,/<strong>0 ∫<\/strong>/);
  assert.doesNotMatch(markup,/999999999|888888888|777777777/);
  assert.ok(markup.indexOf('Первый')<markup.indexOf('Второй'),'the server prestige-first ordering is preserved');
});
