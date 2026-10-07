import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {createState,migrateState} from '../shared/economy.mjs';
import {profileEmoji,normalizeNickname,nicknameValidationError} from '../shared/profile.mjs';
import {shouldAcceptCloudPlayer} from '../cloud-connection.mjs';

const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function declaration(name){
  const start=app.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.notEqual(start,-1,name);
  for(let end=app.indexOf('}',start);end!==-1;end=app.indexOf('}',end+1)){
    const source=app.slice(start,end+1);try{new Script(`(${source})`);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Missing declaration ${name}`);
}
function registration(selector,event){
  const start=app.indexOf(`$('${selector}').addEventListener('${event}',`);assert.notEqual(start,-1,selector);
  for(let end=app.indexOf(');',start);end!==-1;end=app.indexOf(');',end+2)){
    const source=app.slice(start,end+2);try{new Script(source);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Missing event handler ${selector}`);
}
const bootstrap=app.slice(app.indexOf('let token=readStorage(TOKEN_KEY)'),app.indexOf('let cinematicActive='));
const functions=['init','openWelcome','validatedNickname','createCloud','restore','beginSession','acceptPlayer','syncCloud','act','clickIntegral'].map(declaration).join('\n');
const listeners=[['#welcome-dialog','cancel'],['#welcome-form','submit'],['#welcome-local','click'],['#welcome-restore-form','submit'],['#profile-form','submit']].map(args=>registration(...args)).join('\n');
const TOKEN_KEY='integrals-remake-token';
const makePlayer=(nickname='Новая теория')=>({...createState(),id:'11111111-1111-4111-8111-111111111111',revision:1,serverTime:Date.now(),nickname,emoji:'🧪',listed:true,offlineEarned:0});
function harness({token=null,saved=null,request=async()=>({token:'ir_test-created-key',player:makePlayer()}),readOnly=false}={}){
  const storage=new Map(token?[[TOKEN_KEY,token]]:[]),elements=new Map(),calls=[],writes=[],saves=[];let context;
  const evaluate=source=>new Script(source).runInContext(context);
  function element(selector){
    if(!elements.has(selector))elements.set(selector,{value:'',open:false,hidden:false,disabled:false,textContent:'',events:new Map(),
      showModal(){this.open=true;},close(){this.open=false;},focus(){this.focused=true;},
      addEventListener(event,handler){this.events.set(event,handler);},querySelector(){return element(selector+' submit');},
    });
    return elements.get(selector);
  }
  context=createContext({
    saved,readStorage:key=>storage.get(key)||null,TOKEN_KEY,createState,migrateState,profileEmoji,normalizeNickname,nicknameValidationError,shouldAcceptCloudPlayer,
    writeStorage(key,value){writes.push({key,value});storage.set(key,value);},
    readOnlyTab:readOnly,transitioning:false,sessionEpoch:0,flushPromise:null,reconnectPromise:null,
    acceptedCloudPlayer:null,connectionProblem:null,nextCloudRetryAt:0,cloudChecking:false,
    actionWaiters:new Map(),localOffline:0,cinematicActive:false,$:element,
    setStatus(){},showBanner(){},render(){},toast(){},showOffline(){},refreshAccountStatus(){},renderEmojiPicker(){},loadRanking(){},
    save(){saves.push(evaluate('({nickname,emoji,token,mode,needsName})'));},
    exportSave(){saves.push({backup:true});},
    reportCloudFailure(error){context.connectionProblem=error;evaluate('connected=false');},
    async request(path,options){calls.push({path,options});return request(path,options);},
    async flush(){},
  });
  new Script(bootstrap+'\n'+functions+'\n'+listeners,{filename:'app.mjs:onboarding'}).runInContext(context);
  const fire=async(selector,event)=>{
    const target=element(selector),handler=target.events.get(event);assert.ok(handler,selector+' '+event);
    const dispatched={target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
    await handler(dispatched);return dispatched;
  };
  return {context,evaluate,element,fire,calls,writes,saves,storage};
}

test('first visit starts with an empty required name and blocks clicks and purchases before onboarding',async()=>{
  const h=harness();await h.context.init();
  assert.equal(h.evaluate('nickname'),'');assert.equal(h.evaluate('needsName'),true);
  assert.equal(h.element('#welcome-dialog').open,true);assert.equal(h.element('#welcome-name').value,'');
  const input=html.match(/<input id="welcome-name"[^>]*>/)?.[0];assert.ok(input);assert.match(input,/\brequired\b/);assert.doesNotMatch(input,/\bvalue=/);
  assert.equal(await h.context.act({type:'buy',itemId:'autoclick'}),false);h.context.clickIntegral();
  assert.equal(h.evaluate('state.clicks'),0);assert.equal(h.calls.length,0);
  const cancel=await h.fire('#welcome-dialog','cancel');assert.equal(cancel.defaultPrevented,true);
  h.element('#welcome-name').value='   ';await h.fire('#welcome-form','submit');
  assert.match(h.element('#welcome-error').textContent,/2.*24/);assert.equal(h.calls.length,0);
});

test('duplicate name errors stay visible without a key or local fallback; a fresh name creates exactly one profile',async()=>{
  let taken=true;
  const h=harness({request:async(path,options)=>{
    assert.equal(path,'/players');assert.equal(JSON.parse(options.body).nickname,'Фёдор Петров');
    if(taken)throw Object.assign(new Error('Это имя уже занято.'),{status:409,code:'nickname_taken'});
    return {token:'ir_test-new-key',player:makePlayer('Фёдор Петров')};
  }});
  await h.context.init();h.element('#welcome-name').value='  Фёдор  Петров ';h.element('#welcome-emoji').value='🧪';
  await h.fire('#welcome-form','submit');
  assert.match(h.element('#welcome-error').textContent,/занято/);assert.equal(h.element('#welcome-dialog').open,true);
  assert.equal(h.element('#welcome-local').hidden,true);assert.equal(h.evaluate('needsName'),true);assert.equal(h.storage.has(TOKEN_KEY),false);
  taken=false;await h.fire('#welcome-form','submit');
  assert.equal(h.evaluate('needsName'),false);assert.equal(h.evaluate('mode'),'cloud');assert.equal(h.evaluate('nickname'),'Фёдор Петров');
  assert.equal(h.storage.get(TOKEN_KEY),'ir_test-new-key');assert.equal(h.element('#welcome-dialog').open,false);
  assert.equal(h.calls.length,2);assert.equal(h.writes.length,1);
});

test('network failure permits named local play without creating or overwriting a cloud key',async()=>{
  const h=harness({request:async()=>{throw Object.assign(new Error('Connection failed'),{code:'network'});}});
  await h.context.init();h.element('#welcome-name').value='Локальная теория';h.element('#welcome-emoji').value='🚀';
  await h.fire('#welcome-form','submit');assert.equal(h.element('#welcome-local').hidden,false);
  assert.equal(h.evaluate('needsName'),true);await h.fire('#welcome-local','click');
  assert.equal(h.evaluate('needsName'),false);assert.equal(h.evaluate('mode'),'local');assert.equal(h.evaluate('nickname'),'Локальная теория');
  assert.equal(h.evaluate('emoji'),'🚀');assert.equal(h.storage.has(TOKEN_KEY),false);assert.equal(h.saves.at(-1).nickname,'Локальная теория');
});

test('reload reuses the stored key and existing local names do not reopen registration',async()=>{
  const h=harness({token:'ir_test-existing-key',request:async path=>{assert.equal(path,'/state');return {player:makePlayer('Прежний игрок')};}});
  await h.context.init();assert.equal(h.element('#welcome-dialog').open,false);
  assert.equal(h.evaluate('token'),'ir_test-existing-key');assert.equal(h.evaluate('nickname'),'Прежний игрок');
  assert.deepEqual(h.calls.map(call=>call.path),['/state']);assert.equal(h.writes.length,0);
  const local=harness({saved:{nickname:'Прежняя локальная игра'}});await local.context.init();
  assert.equal(local.evaluate('needsName'),false);assert.equal(local.element('#welcome-dialog').open,false);assert.equal(local.calls.length,0);
});

test('restore checks the supplied key before switching profiles and a bad key preserves the previous account',async()=>{
  let authorized=false;
  const h=harness({token:'ir_test-original-key',request:async(path,options)=>{
    assert.equal(path,'/state');assert.equal(options.headers.Authorization,'Bearer ir_test-restored-key');
    if(!authorized)throw Object.assign(new Error('Ключ не принят'),{status:401,code:'unauthorized'});
    return {player:makePlayer('Восстановленная теория')};
  }});
  await assert.rejects(h.context.restore('  ir_test-restored-key  '),/Ключ/);
  assert.equal(h.evaluate('token'),'ir_test-original-key');assert.equal(h.storage.get(TOKEN_KEY),'ir_test-original-key');assert.equal(h.writes.length,0);
  authorized=true;await h.context.restore(' ir_test-restored-key ');
  assert.equal(h.evaluate('token'),'ir_test-restored-key');assert.equal(h.evaluate('nickname'),'Восстановленная теория');
  assert.equal(h.storage.get(TOKEN_KEY),'ir_test-restored-key');assert.equal(h.calls.some(call=>call.path==='/players'),false);
});

test('read-only tabs and an in-flight login cannot create an account or start a local fallback',async()=>{
  for(const readOnly of [true,false]){
    const h=harness({readOnly});if(!readOnly)h.context.transitioning=true;
    await assert.rejects(h.context.createCloud('Новое имя'));
    h.element('#welcome-name').value='Новое имя';await h.fire('#welcome-local','click');
    assert.equal(h.calls.length,0);assert.equal(h.evaluate('needsName'),true);assert.equal(h.evaluate('token'),null);assert.equal(h.saves.length,0);
  }
});

test('a rejected duplicate profile rename keeps the dialog and existing cloud identity',async()=>{
  const h=harness({token:'ir_test-existing-key',request:async path=>{
    assert.equal(path,'/profile');throw Object.assign(new Error('Это имя уже занято. Выбери другое имя участника.'),{status:409,code:'nickname_taken'});
  }});
  h.evaluate("nickname='Прежнее имя'");h.element('#nickname').value='Занятое имя';h.element('#profile-dialog').open=true;
  await h.fire('#profile-form','submit');
  assert.match(h.element('#profile-error').textContent,/занято/);assert.equal(h.element('#profile-dialog').open,true);
  assert.equal(h.evaluate('nickname'),'Прежнее имя');assert.equal(h.evaluate('token'),'ir_test-existing-key');assert.equal(h.element('#profile-form submit').disabled,false);
});
