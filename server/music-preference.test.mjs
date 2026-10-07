import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
function declaration(name){
  const start=app.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1,name);
  for(let end=app.indexOf('}',start);end!==-1;end=app.indexOf('}',end+1)){
    const source=app.slice(start,end+1);try{new Script(`(${source})`);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Missing ${name}`);
}
function statement(marker){
  const start=app.indexOf(marker);assert.notEqual(start,-1,marker);
  for(let end=app.indexOf(');',start);end!==-1;end=app.indexOf(');',end+2)){
    const source=app.slice(start,end+2);try{new Script(source);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Missing ${marker}`);
}
const preference=app.match(/^let musicEnabled=.+;$/m)?.[0];assert.ok(preference);
const source=[preference,...['updateMusic','startPreferredMusic','unlockPreferredMusic'].map(declaration),
  statement("$('#music-button').addEventListener('click',"),
  statement("document.addEventListener('visibilitychange',()=>{if(document.hidden){music.pause();"),
  statement("window.addEventListener('storage',event=>{if(event.key===MUSIC_KEY)"),
  statement("$('#portal-game-dialog').addEventListener('close',"),
].join('\n');
const MUSIC_KEY='integrals-remake-music';
function harness({stored,readOnly=false,start}={}){
  const elements=new Map(),calls=[],writes=[],storage=new Map(stored===undefined?[]:[[MUSIC_KEY,stored]]);
  const target=()=>({events:new Map(),hidden:false,open:false,attributes:new Map(),classes:new Map(),textContent:'',title:'',
    addEventListener(event,handler){this.events.set(event,handler);},
    setAttribute(name,value){this.attributes.set(name,value);},
    classList:{toggle(){}},
  });
  function element(selector){if(!elements.has(selector))elements.set(selector,target());return elements.get(selector);}
  const document=target(),window=target();
  const music={playing:false,async start(){calls.push('start');if(start)return start();music.playing=true;return true;},pause(){calls.push('pause');music.playing=false;}};
  const context=createContext({
    MUSIC_KEY,readStorage:key=>storage.get(key)||null,writeStorage(key,value){writes.push({key,value});storage.set(key,value);},
    readOnlyTab:readOnly,cinematicActive:false,resumeMusicAfterVisibility:false,portalResumeMusic:false,
    $:element,music,document,window,prestigeAudio:{stop(){calls.push('cinematic:stop');}},
  });
  new Script(source,{filename:'app.mjs:music-preference'}).runInContext(context);
  const evaluate=value=>new Script(value).runInContext(context);
  const fire=(selector,event,value={})=>{
    const target=selector==='document'?document:selector==='window'?window:element(selector),handler=target.events.get(event);assert.ok(handler,selector+' '+event);
    return handler(value);
  };
  return {context,evaluate,element,fire,storage,writes,calls};
}

test('music defaults on and explicit disabling survives reload and user gestures',async()=>{
  const first=harness();assert.equal(first.evaluate('musicEnabled'),true);assert.equal(await first.context.startPreferredMusic(),true);
  first.fire('#music-button','click');assert.equal(first.evaluate('musicEnabled'),false);assert.equal(first.context.music.playing,false);
  assert.deepEqual(first.writes,[{key:MUSIC_KEY,value:'off'}]);
  const reopened=harness({stored:first.storage.get(MUSIC_KEY)});assert.equal(reopened.evaluate('musicEnabled'),false);
  assert.equal(await reopened.context.startPreferredMusic(),false);
  reopened.context.unlockPreferredMusic({isTrusted:true,target:{closest:()=>null}});
  assert.equal(reopened.calls.length,0);assert.equal(reopened.element('#music-button').attributes.get('aria-pressed'),undefined);
  reopened.context.updateMusic();assert.equal(reopened.element('#music-button').attributes.get('aria-pressed'),'false');
  reopened.fire('#music-button','click');await Promise.resolve();assert.equal(reopened.evaluate('musicEnabled'),true);
  assert.equal(reopened.storage.get(MUSIC_KEY),'on');assert.equal(reopened.calls.filter(call=>call==='start').length,1);
});

test('pending autoplay is represented as enabled and can be switched off immediately',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve),h=harness({start:()=>pending});
  const opening=h.context.startPreferredMusic();h.context.updateMusic();const button=h.element('#music-button');
  assert.equal(button.attributes.get('aria-pressed'),'true');assert.match(button.title,/после первого нажатия/);
  h.fire('#music-button','click');assert.equal(h.evaluate('musicEnabled'),false);assert.equal(h.storage.get(MUSIC_KEY),'off');
  release(false);assert.equal(await opening,false);assert.equal(button.attributes.get('aria-pressed'),'false');
  assert.equal(button.title,'Включить музыку');assert.deepEqual(h.calls,['start','pause']);
});

test('gesture unlock ignores synthetic events and the music toggle itself',()=>{
  const h=harness();
  h.context.unlockPreferredMusic({isTrusted:false,target:{closest:()=>null}});
  h.context.unlockPreferredMusic({isTrusted:true,target:{closest:()=>({})}});
  assert.equal(h.calls.length,0);
  h.context.unlockPreferredMusic({isTrusted:true,target:{closest:()=>null}});assert.deepEqual(h.calls,['start']);
  h.context.unlockPreferredMusic({isTrusted:true,target:{closest:()=>null}});assert.deepEqual(h.calls,['start'],'playing music does not request another start on every click');
});

test('hidden pages, portals, cinematics and read-only tabs cannot start the soundtrack',async()=>{
  for(const blocked of ['hidden','portal','cinematic','readOnly']){
    const h=harness({readOnly:blocked==='readOnly'});
    h.context.document.hidden=blocked==='hidden';h.context.cinematicActive=blocked==='cinematic';h.element('#portal-game-dialog').open=blocked==='portal';
    assert.equal(await h.context.startPreferredMusic(),false,blocked);assert.equal(h.calls.length,0);
    h.context.unlockPreferredMusic({isTrusted:true,target:{closest:()=>null}});assert.equal(h.calls.length,0,blocked);
  }
});

test('visibility and portal transitions preserve preference and restart only when enabled',async()=>{
  for(const stored of [undefined,'off']){
    const h=harness({stored});await h.context.startPreferredMusic();
    h.context.document.hidden=true;h.fire('document','visibilitychange');
    assert.equal(h.context.music.playing,false);assert.equal(h.writes.length,0);
    h.context.document.hidden=false;h.element('#portal-game-dialog').open=true;h.fire('document','visibilitychange');
    assert.equal(h.context.music.playing,false,'visibility cannot override an open portal');
    h.element('#portal-game-dialog').open=false;h.fire('#portal-game-dialog','close');
    assert.equal(h.element('#portal-game-frame').src,'about:blank');
    assert.equal(h.context.music.playing,stored!=='off');assert.equal(h.writes.length,0);
  }
});

test('another tab can disable music without a feedback write; read-only tabs remain silent when re-enabled',()=>{
  const h=harness({readOnly:true});
  h.fire('window','storage',{key:MUSIC_KEY,newValue:'off'});assert.equal(h.evaluate('musicEnabled'),false);
  assert.deepEqual(h.calls,['pause']);assert.equal(h.writes.length,0);
  h.fire('window','storage',{key:MUSIC_KEY,newValue:'on'});assert.equal(h.evaluate('musicEnabled'),true);
  assert.deepEqual(h.calls,['pause']);assert.equal(h.writes.length,0);
  h.context.updateMusic();assert.match(h.element('#music-button').title,/активной вкладке/);
  h.fire('window','storage',{key:'unrelated',newValue:'off'});assert.equal(h.evaluate('musicEnabled'),true);
});
