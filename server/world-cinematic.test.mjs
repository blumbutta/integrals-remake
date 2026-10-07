import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabWorld} from '../world.mjs';

function browser(t){
  const names=['window','document','performance','Image','ResizeObserver','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame'];
  const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const media=new EventTarget();media.matches=false;
  const document=new EventTarget();document.hidden=false;
  const window=new EventTarget();window.devicePixelRatio=1;window.matchMedia=()=>media;
  const frames=new Map(),worlds=[];let clock=0,id=0,state,stack=[];
  const paint=[],labels=[];let portraitCount=0;
  const defaults=()=>({matrix:[1,0,0,1,0,0],globalAlpha:1,fillStyle:'#000',strokeStyle:'#000'});
  state=defaults();
  const record=(kind,color)=>paint.push({kind,color,matrix:[...state.matrix],alpha:state.globalAlpha});
  const methods={
    save(){stack.push({...state,matrix:[...state.matrix]});},restore(){state=stack.pop()||defaults();},
    setTransform(...matrix){state.matrix=matrix;},
    translate(x,y){const [a,b,c,d,e,f]=state.matrix;state.matrix=[a,b,c,d,a*x+c*y+e,b*x+d*y+f];},
    scale(x,y){const [a,b,c,d,e,f]=state.matrix;state.matrix=[a*x,b*x,c*y,d*y,e,f];},
    rotate(r){const [a,b,c,d,e,f]=state.matrix,co=Math.cos(r),si=Math.sin(r);state.matrix=[a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f];},
    fill(){record('fill',state.fillStyle);},stroke(){record('stroke',state.strokeStyle);},fillRect(){record('rect',state.fillStyle);},
    fillText(value){labels.push(value);},drawImage(){portraitCount++;},
    createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};},
  };
  const ctx=new Proxy({}, {get(_target,key){return methods[key]??state[key]??(()=>{});},set(_target,key,value){state[key]=value;return true;}});
  const values={window,document,performance:{now:()=>clock},
    Image:class{naturalWidth=64;naturalHeight=64;complete=true;set src(_value){}},
    ResizeObserver:class{observe(){}disconnect(){}},IntersectionObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(key){frames.delete(key);},
  };
  for(const name of names)Object.defineProperty(globalThis,name,{value:values[name],configurable:true,writable:true});
  t.after(()=>{for(const world of worlds)world.destroy();for(const name of names){const descriptor=original.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return {
    frames,paint,labels,document,
    world(){const canvas=new EventTarget();canvas.getContext=()=>ctx;canvas.getBoundingClientRect=()=>({width:1200,height:760,left:0,top:0});const world=createLabWorld(canvas);worlds.push(world);return world;},
    clear(){paint.length=0;labels.length=0;portraitCount=0;},
    frameAt(value){clock=value;const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(clock);},
    get portraitCount(){return portraitCount;},
    reduce(){media.matches=true;const event=new Event('change');Object.defineProperty(event,'matches',{value:true});media.dispatchEvent(event);},
  };
}
const oldWorld=()=>({generators:Array(10).fill(8),prestige:1});
const newWorld=()=>({generators:Array(10).fill(0),prestige:9});
const landColors=['#244944','#819281','#35636a']; // Ground, paved road and river.

test('prestige pulls the terrain, roads and river away, then reveals the buffered new world',async t=>{
  const browserMock=browser(t),world=browserMock.world(),old=oldWorld(),fresh=newWorld();
  const untouchedOld=structuredClone(old),untouchedFresh=structuredClone(fresh);
  world.update(old);const animation=world.playPrestige({state:old,durationMs:6500});world.update(fresh,{hue:265});
  browserMock.clear();browserMock.frameAt(6500*.62);
  const ground=browserMock.paint.find(p=>p.color===landColors[0]);assert.ok(ground);
  assert.notDeepEqual(ground.matrix,[1,0,0,1,0,0]);assert.ok(ground.alpha>0&&ground.alpha<1);
  for(const color of landColors.slice(1)){
    const surface=browserMock.paint.find(p=>p.color===color);assert.ok(surface,`${color} is still visible during collapse`);
    assert.deepEqual(surface.matrix,ground.matrix,'roads and water stay attached to the shrinking ground');
  }
  assert.ok(browserMock.portraitCount>0,'the original inhabitants are still being absorbed');
  browserMock.clear();browserMock.frameAt(6500*.812);
  for(const color of [...landColors,'#163447'])assert.equal(browserMock.paint.some(p=>p.color===color),false,'no land or distant hills remain before the flash');
  browserMock.clear();browserMock.frameAt(6500*.93);
  assert.ok(browserMock.paint.some(p=>p.color===landColors[0]),'new land is revealed');
  assert.equal(browserMock.portraitCount,0,'the new zero-generator state replaces the absorbed population');
  browserMock.clear();browserMock.frameAt(6500);await animation;
  assert.ok(browserMock.labels.includes('ВСЕЛЕННАЯ · 9'));assert.equal(browserMock.frames.size,0);
  assert.deepEqual(old,untouchedOld);assert.deepEqual(fresh,untouchedFresh);
});

test('skip, hidden page, reduced motion and destroy always settle the animation promise',{timeout:2000},async t=>{
  const mock=browser(t),world=mock.world();world.update(oldWorld());
  let animation=world.playPrestige({state:oldWorld()});world.update(newWorld());world.finishPrestige();await animation;assert.equal(mock.frames.size,0);
  animation=world.playPrestige({state:oldWorld()});mock.document.hidden=true;mock.document.dispatchEvent(new Event('visibilitychange'));await animation;assert.equal(mock.frames.size,0);
  mock.document.hidden=false;mock.document.dispatchEvent(new Event('visibilitychange'));
  animation=world.playPrestige({state:oldWorld()});world.destroy();await animation;assert.equal(mock.frames.size,0);
  const reduced=mock.world();reduced.update(oldWorld());mock.reduce();
  animation=reduced.playPrestige({state:oldWorld(),durationMs:6500});reduced.update(newWorld());assert.equal(mock.frames.size,0);
  await animation;assert.equal(mock.frames.size,0);reduced.destroy();
});
