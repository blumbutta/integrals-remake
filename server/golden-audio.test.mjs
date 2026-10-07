import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

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
function goldenRegistration(){
  const start=app.indexOf("$('#golden-button').addEventListener('click',");
  assert.notEqual(start,-1,'golden click handler');
  for(let end=app.indexOf(');',start);end!==-1;end=app.indexOf(');',end+2)){
    const source=app.slice(start,end+2);
    try{new Script(source);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail('Missing golden click handler');
}
const source=[declaration('prepareEffectAudio'),declaration('blip'),goldenRegistration()].join('\n');
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

function harness({sound=true,readOnly=false,decision=async()=>true}={}){
  const calls=[],starts=[],effects=[],button={hidden:false,addEventListener(event,handler){assert.equal(event,'click');this.click=handler;}};
  class AudioContext{
    constructor(){calls.push('audio:create');this.state='suspended';this.currentTime=10;this.destination={};}
    resume(){calls.push('audio:resume');this.state='running';return Promise.resolve();}
    createOscillator(){
      return {
        frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
        connect(){},disconnect(){},
        start(time){calls.push('sound:start');starts.push(time);},stop(){},
      };
    }
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const context=createContext({
    sound,readOnlyTab:readOnly,goldenClaiming:false,audio:undefined,
    window:{AudioContext},effects,
    $:selector=>{assert.equal(selector,'#golden-button');return button;},
    showReadOnlyNotice(){calls.push('notice');},
    render(){calls.push('render');},
    async act(action){
      assert.equal(action.type,'golden');calls.push('act');
      const accepted=await decision();calls.push(accepted?'accepted':'refused');return accepted;
    },
  });
  new Script(source+"\nconst actualBlip=blip;blip=(kind)=>{effects.push(kind);return actualBlip(kind);};",{filename:'app.mjs:golden-audio'}).runInContext(context);
  return {context,calls,starts,effects,button};
}

test('the golden click unlocks audio in the gesture but plays one reward sound only after acceptance',async()=>{
  const decision=deferred(),h=harness({decision:()=>decision.promise});
  const first=h.button.click();
  assert.equal(h.button.hidden,true);assert.equal(h.context.goldenClaiming,true);
  assert.ok(h.calls.indexOf('audio:create')<h.calls.indexOf('act'),'browser audio is prepared before awaiting the request');
  assert.equal(h.starts.length,0);assert.deepEqual(h.effects,[]);
  await h.button.click();
  assert.equal(h.calls.filter(call=>call==='act').length,1,'a duplicate click cannot claim again');
  assert.equal(h.calls.filter(call=>call==='audio:create').length,1);
  assert.equal(h.starts.length,0);
  decision.resolve(true);await first;
  assert.deepEqual(h.effects,['golden']);assert.ok(h.starts.length>0);
  assert.ok(h.calls.indexOf('accepted')<h.calls.indexOf('sound:start'));
  assert.ok(h.starts.every(time=>Number.isFinite(time)&&time>=10));
  assert.equal(h.context.goldenClaiming,false);assert.equal(h.calls.filter(call=>call==='render').length,1);
});

test('refused and failed golden claims make no reward sound and release the click guard',async()=>{
  for(const decision of [async()=>false,async()=>{throw new Error('Connection failed');}]){
    const h=harness({decision});
    try{await h.button.click();}catch(error){assert.match(error.message,/Connection failed/);}
    assert.equal(h.calls.filter(call=>call==='act').length,1);
    assert.deepEqual(h.effects,[]);assert.equal(h.starts.length,0);
    assert.equal(h.context.goldenClaiming,false);assert.equal(h.calls.filter(call=>call==='render').length,1);
  }
});

test('read-only clicks show their explanation without requesting a reward or creating an audio context',async()=>{
  const h=harness({readOnly:true});await h.button.click();
  assert.deepEqual(h.calls,['notice']);assert.deepEqual(h.effects,[]);
  assert.equal(h.starts.length,0);assert.equal(h.context.audio,undefined);assert.equal(h.context.goldenClaiming,false);
});

test('muted effects never create audio, including an accepted golden claim',async()=>{
  const h=harness({sound:false});
  await h.button.click();h.context.prepareEffectAudio();h.context.blip('click');h.context.blip('buy');
  assert.equal(h.calls.filter(call=>call==='act').length,1);assert.ok(h.calls.includes('accepted'));
  assert.equal(h.calls.includes('audio:create'),false);assert.equal(h.calls.includes('audio:resume'),false);
  assert.equal(h.starts.length,0);assert.equal(h.context.audio,undefined);
});

test('turning effects off while a golden claim waits suppresses its eventual success sound',async()=>{
  const decision=deferred(),h=harness({decision:()=>decision.promise});
  const work=h.button.click();h.context.sound=false;decision.resolve(true);await work;
  assert.ok(h.calls.includes('accepted'));assert.deepEqual(h.effects,['golden']);
  assert.equal(h.starts.length,0,'the current sound setting wins over the setting at click time');
});
