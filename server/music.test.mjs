import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicPlayer} from '../music.mjs';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// A controlled Web Audio surface checks the asynchronous lifecycle and whether
// notes were actually scheduled; no real speakers, browser or timers are used.
function audioHarness(t){
  const originals=Object.fromEntries(['AudioContext','webkitAudioContext','setInterval','clearInterval','setTimeout'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const contexts=[],intervals=new Map(),timeouts=[];let nextTimer=0;
  const param=()=>({value:0,targets:[],cancelScheduledValues(){},setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(value){this.targets.push(value);}});
  class AudioContext{
    constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=20;this.destination={};this.resumptions=[];this.gains=[];this.starts=[];this.stops=[];this.suspensions=0;contexts.push(this);}
    node(){return {connect(target){return target;},disconnect(){},gain:param(),frequency:param(),detune:param(),Q:param(),pan:param(),delayTime:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
    createGain(){const node=this.node();this.gains.push(node);return node;}
    createDynamicsCompressor(){return this.node();}
    createConvolver(){return this.node();}
    createBiquadFilter(){return this.node();}
    createDelay(){return this.node();}
    createStereoPanner(){return this.node();}
    createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
    createOscillator(){const node=this.node();node.start=time=>this.starts.push(time);node.stop=time=>this.stops.push(time);return node;}
    resume(){const call=deferred();this.resumptions.push(call);return call.promise;}
    suspend(){this.suspensions++;this.state='suspended';return Promise.resolve();}
    allow(index){this.state='running';this.resumptions[index].resolve();}
  }
  Object.assign(globalThis,{AudioContext,webkitAudioContext:undefined,setInterval(callback){const id=++nextTimer;intervals.set(id,callback);return id;},clearInterval(id){intervals.delete(id);},setTimeout(callback){timeouts.push(callback);return ++nextTimer;}});
  t.after(()=>{for(const [key,descriptor] of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {contexts,intervals,timeouts,runTimeouts(){for(const callback of timeouts.splice(0))callback();}};
}

test('resume alone creates no audio; start reports no playback while autoplay permission is pending',async t=>{
  const h=audioHarness(t),music=createMusicPlayer();
  assert.equal(await music.resume(),false);assert.equal(h.contexts.length,0);assert.equal(music.playing,false);
  const starting=music.start(),context=h.contexts[0];
  assert.equal(h.contexts.length,1);assert.equal(context.resumptions.length,1);
  assert.equal(music.playing,false);assert.equal(context.starts.length,0);assert.equal(h.intervals.size,0);
  context.allow(0);assert.equal(await starting,true);
  assert.equal(music.playing,true);assert.ok(context.starts.length>0);assert.equal(h.intervals.size,1);
  const notes=context.starts.length;
  assert.equal(await music.start(),true);assert.equal(await music.resume(),true);
  assert.equal(context.resumptions.length,1);assert.equal(context.starts.length,notes);assert.equal(h.intervals.size,1);
  context.state='suspended';assert.equal(music.playing,false,'browser suspension is reflected immediately');
  context.state='closed';assert.equal(music.playing,false);
});

test('toggle cancels a pending autoplay attempt and a late resume cannot revive disabled music',async t=>{
  const h=audioHarness(t),music=createMusicPlayer(),starting=music.start(),context=h.contexts[0];
  assert.equal(await music.toggle(),false);assert.equal(music.playing,false);
  h.runTimeouts();assert.equal(context.suspensions,0,'the browser was still suspended during the fade timeout');
  context.allow(0);assert.equal(await starting,false);
  assert.equal(music.playing,false);assert.equal(context.starts.length,0);assert.equal(h.intervals.size,0);
  assert.equal(context.state,'suspended');assert.equal(context.suspensions,1);
  assert.equal(context.gains[0].gain.targets.at(-1),0);
});

test('concurrent resume attempts after a gesture schedule one score in either completion order',async t=>{
  for(const order of [[0,1],[1,0]])await t.test('completion '+order.join(' then '),async t=>{
    const h=audioHarness(t),music=createMusicPlayer(),first=music.start(),context=h.contexts[0],second=music.start();
    assert.equal(h.contexts.length,1);assert.equal(context.resumptions.length,2,'the gesture retries the suspended browser context');
    const attempts=[first,second];
    context.allow(order[0]);await attempts[order[0]];
    const notesBefore=context.starts.length;
    context.allow(order[1]);await attempts[order[1]];
    assert.equal(music.playing,true);assert.equal(h.intervals.size,1);assert.equal(context.suspensions,0);
    if(order[0]===1)assert.equal(context.starts.length,notesBefore,'an older successful request cannot schedule a duplicate score');
    else assert.equal(notesBefore,0,'only the current request may start scheduling');
  });
});

test('pausing after multiple pending attempts prevents every late request from creating notes',async t=>{
  const h=audioHarness(t),music=createMusicPlayer(),first=music.start(),context=h.contexts[0],second=music.resume();
  music.pause();h.runTimeouts();
  context.allow(1);assert.equal(await second,false);context.allow(0);assert.equal(await first,false);
  assert.equal(music.playing,false);assert.equal(h.intervals.size,0);assert.equal(context.starts.length,0);assert.equal(context.state,'suspended');
});

test('a rejected old autoplay request cannot cancel a newer successful gesture',async t=>{
  const h=audioHarness(t),music=createMusicPlayer(),first=music.start(),context=h.contexts[0];
  const rejection=assert.rejects(first,/autoplay denied/),second=music.start();
  context.allow(1);assert.equal(await second,true);const notes=context.starts.length;
  context.resumptions[0].reject(new Error('autoplay denied'));await rejection;
  assert.equal(music.playing,true);assert.equal(context.starts.length,notes);assert.equal(h.intervals.size,1);
});

test('a failed current start is retryable and a stale fade timeout cannot suspend new playback',async t=>{
  const h=audioHarness(t),music=createMusicPlayer(),first=music.start(),context=h.contexts[0];
  const rejection=assert.rejects(first,/not allowed/);context.resumptions[0].reject(new Error('not allowed'));await rejection;
  assert.equal(music.playing,false);assert.equal(h.intervals.size,0);
  const second=music.start();context.allow(1);await second;
  music.pause();assert.equal(music.playing,false);assert.equal(h.intervals.size,0);
  const third=music.start();context.allow(2);await third;h.runTimeouts();
  assert.equal(music.playing,true);assert.equal(context.state,'running');assert.equal(context.suspensions,0);assert.equal(h.intervals.size,1);
});

test('volume remains bounded and updates the existing soundtrack without restarting it',async t=>{
  const h=audioHarness(t),music=createMusicPlayer();music.setVolume(2);assert.equal(music.volume,1);
  const starting=music.start(),context=h.contexts[0];context.allow(0);await starting;
  const notes=context.starts.length;music.setVolume(.5);assert.equal(context.gains[0].gain.targets.at(-1),.34);
  music.setVolume(NaN);assert.equal(music.volume,.5);music.setVolume(-2);assert.equal(music.volume,0);
  assert.equal(context.starts.length,notes);assert.equal(h.intervals.size,1);
  music.pause();h.runTimeouts();assert.equal(music.playing,false);assert.equal(context.suspensions,1);
});
