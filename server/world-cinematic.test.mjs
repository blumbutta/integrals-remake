import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabWorld} from '../world.mjs';
import {GENERATORS} from '../shared/economy.mjs';
import {researchArtwork} from '../research-art.mjs';

function browser(t){
  const names=['window','document','performance','Image','ResizeObserver','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame'];
  const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const media=new EventTarget();media.matches=false;
  const document=new EventTarget();document.hidden=false;
  const window=new EventTarget();window.devicePixelRatio=1;window.innerWidth=1440;window.innerHeight=900;window.matchMedia=()=>media;
  const frames=new Map(),worlds=[],intersections=[];let clock=0,id=0,state,stack=[];
  const paint=[],labels=[],portraits=[];let portraitCount=0,canvas;
  const defaults=()=>({matrix:[1,0,0,1,0,0],globalAlpha:1,fillStyle:'#000',strokeStyle:'#000'});
  state=defaults();
  const record=(kind,color,bounds)=>paint.push({kind,color,bounds,matrix:[...state.matrix],alpha:state.globalAlpha});
  const methods={
    save(){stack.push({...state,matrix:[...state.matrix]});},restore(){state=stack.pop()||defaults();},
    setTransform(...matrix){state.matrix=matrix;},
    translate(x,y){const [a,b,c,d,e,f]=state.matrix;state.matrix=[a,b,c,d,a*x+c*y+e,b*x+d*y+f];},
    scale(x,y){const [a,b,c,d,e,f]=state.matrix;state.matrix=[a*x,b*x,c*y,d*y,e,f];},
    rotate(r){const [a,b,c,d,e,f]=state.matrix,co=Math.cos(r),si=Math.sin(r);state.matrix=[a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f];},
    fill(){record('fill',state.fillStyle);},stroke(){record('stroke',state.strokeStyle);},fillRect(...bounds){record('rect',state.fillStyle,bounds);},
    fillText(value){labels.push(value);},drawImage(image,...args){portraitCount++;portraits.push({source:image.src,args,matrix:[...state.matrix]});},
    createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};},
  };
  const ctx=new Proxy({}, {get(_target,key){return methods[key]??state[key]??(()=>{});},set(_target,key,value){state[key]=value;return true;}});
  const values={window,document,performance:{now:()=>clock},
    Image:class{naturalWidth=64;naturalHeight=64;complete=true;set src(value){this.source=value;if(value.endsWith('superintelligence.png')){this.naturalWidth=403;this.naturalHeight=740;}}get src(){return this.source;}},
    ResizeObserver:class{observe(){}disconnect(){}},IntersectionObserver:class{constructor(callback){intersections.push(callback);}observe(){}disconnect(){}},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(key){frames.delete(key);},
  };
  for(const name of names)Object.defineProperty(globalThis,name,{value:values[name],configurable:true,writable:true});
  t.after(()=>{for(const world of worlds)world.destroy();for(const name of names){const descriptor=original.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return {
    frames,paint,labels,portraits,document,
    world(options={},size={width:1200,height:760}){canvas=new EventTarget();canvas.getContext=()=>ctx;canvas.getBoundingClientRect=()=>({left:0,top:0,...size});const world=createLabWorld(canvas,options);worlds.push(world);return world;},
    clear(){paint.length=0;labels.length=0;portraitCount=0;portraits.length=0;},
    click(x,y){clock+=200;const event=new Event('click');Object.defineProperties(event,{clientX:{value:x},clientY:{value:y}});canvas.dispatchEvent(event);},
    frameAt(value){clock=value;const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(clock);},
    intersection(isIntersecting,time=clock){intersections.at(-1)([{isIntersecting,time}]);},
    get portraitCount(){return portraitCount;},
    reduce(){media.matches=true;const event=new Event('change');Object.defineProperty(event,'matches',{value:true});media.dispatchEvent(event);},
  };
}
const oldWorld=()=>({generators:GENERATORS.map(()=>8),prestige:1});
const newWorld=()=>({generators:GENERATORS.map(()=>0),prestige:9});
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
  assert.ok(browserMock.labels.includes('Неизвестный район'),'the new empty world returns to undiscovered districts');
  assert.equal(browserMock.labels.includes('Школа'),false,'old district labels disappear together with the absorbed inhabitants');
  assert.equal(browserMock.labels.some(label=>/АТЛАС БЕСКОНЕЧНОСТИ|Нажмите на здание|ВСЕЛЕННАЯ ·/.test(String(label))),false,'map instructions and era are rendered once in the HTML status panel');
  assert.equal(browserMock.frames.size,0);
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

test('prestige starts immediately after the hidden world tab opens, before observer delivery',async t=>{
  const mock=browser(t),size={width:0,height:0},world=mock.world({},size),old=oldWorld();
  world.update(old);mock.intersection(false);assert.equal(mock.frames.size,0);
  mock.frameAt(100);Object.assign(size,{width:1200,height:760});world.resize();
  let settled=false;const animation=world.playPrestige({state:old,durationMs:6500}).then(()=>{settled=true;});world.update(newWorld());
  await Promise.resolve();assert.equal(settled,false,'the animation was not skipped because of the stale observer flag');
  assert.ok(mock.frames.size>0,'the first frame is scheduled without waiting for an observer callback');
  mock.intersection(false,0);assert.ok(mock.frames.size>0,'a queued notification from the hidden tab cannot cancel the new animation');
  mock.clear();mock.frameAt(100+6500*.62);
  const ground=mock.paint.find(p=>p.color===landColors[0]);assert.ok(ground);assert.ok(ground.alpha>0&&ground.alpha<1,'the world is visibly being absorbed');
  world.finishPrestige();await animation;assert.equal(mock.frames.size,0);
});

test('zero-size or offscreen worlds do not start, and leaving the viewport settles an active prestige',async t=>{
  const mock=browser(t),size={width:1200,height:760,top:950},world=mock.world({},size);
  world.update(oldWorld());await world.playPrestige({state:oldWorld()});assert.equal(mock.frames.size,0,'offscreen rectangle overrides a stale visible observer flag');
  Object.assign(size,{top:0,width:0,height:0});await world.playPrestige({state:oldWorld()});assert.equal(mock.frames.size,0,'display:none geometry cannot start a cinematic');
  Object.assign(size,{width:1200,height:760});world.resize();const animation=world.playPrestige({state:oldWorld()});world.update(newWorld());assert.ok(mock.frames.size>0);
  mock.frameAt(200);size.top=950;mock.intersection(false);await animation;assert.equal(mock.frames.size,0,'a current offscreen notification still cleans up the promise and frames');
});

test('the new orbital mind uses the supplied brain, stays inspectable, and joins prestige without changing legacy saves',async t=>{
  const mock=browser(t),locations=[],inspections=[];
  const world=mock.world({onLocation:value=>locations.push(value),onInspect:value=>inspections.push(value)});
  const legacy={generators:Array(10).fill(0),prestige:2},unchanged=structuredClone(legacy);
  world.update(legacy);assert.deepEqual(legacy,unchanged);assert.equal(mock.portraitCount,0);
  assert.equal(mock.labels.includes('Орбитальный сверхразум'),false,'a legacy empty slot does not reveal the future district');
  assert.ok(mock.labels.includes('Неизвестный район'));assert.ok(mock.labels.every(label=>!String(label).includes('NaN')));
  mock.click(238,191);assert.deepEqual(locations,[{id:'orbitalmind',name:'Неизвестный район',unlocked:false,generatorIndices:[]}]);
  const state=newWorld();state.generators[10]=3;mock.clear();world.update(state);
  assert.ok(mock.labels.includes('Орбитальный сверхразум'),'owning the new resource reveals its district name');
  const brains=mock.portraits.filter(p=>p.source.endsWith('/assets/custom/superintelligence.png'));
  assert.equal(brains.length,3,'main core and two working satellites use the supplied artwork');
  assert.ok(brains.every(p=>p.args.length===8&&p.args[1]+p.args[3]<740),'the canvas crops the image above its city');
  mock.click(238,105);assert.equal(inspections[0].generatorIndex,10);assert.equal(inspections[0].name,'Сверхразум ИИ');assert.equal(inspections[0].count,3);assert.ok(inspections[0].task.length>0);
  const animation=world.playPrestige({state,durationMs:6500});world.update(newWorld());
  mock.clear();mock.frameAt(400+6500*.62);assert.ok(mock.portraits.some(p=>p.source.endsWith('superintelligence.png')),'the old mind survives until its absorption phase');
  mock.clear();mock.frameAt(400+6500*.812);assert.equal(mock.portraitCount,0,'the new mind is absorbed along with the rest of the world');
  mock.clear();world.finishPrestige();await animation;assert.equal(mock.portraitCount,0);assert.equal(mock.frames.size,0);
  mock.clear();world.update({generators:GENERATORS.map(()=>100),prestige:9});assert.ok(mock.portraitCount<=45,'the added stage preserves the scene actor limit');
});

test('superintelligence research has two distinct illustrations instead of recycling the first upgrade',()=>{
  const svg=index=>researchArtwork(index).match(/<svg.*?<\/svg>/)[0];
  assert.notEqual(svg(24),svg(0));assert.notEqual(svg(25),svg(1));assert.notEqual(svg(24),svg(25));
  assert.ok(researchArtwork(25,true).includes('✓'));
});

test('the landscape fills wide and tall canvases while all landmark click targets remain aligned',t=>{
  const mock=browser(t),locations=[],size={width:1280,height:560};
  const world=mock.world({onLocation:location=>locations.push(location.id)},size);
  const targets=[['school',207,538],['university',447,400],['computing',890,579],['portals',979,262],['observatory',697,331],['thought',1100,485],['orbitalmind',238,191]];
  for(const dimensions of [{width:1280,height:560},{width:390,height:600}]){
    Object.assign(size,dimensions);mock.clear();world.resize();
    const background=mock.paint.find(p=>p.kind==='rect'),[sx,, ,sy,ox,oy]=background.matrix,[x,y,w,h]=background.bounds;
    const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} should equal ${b}`);
    near(ox+x*sx,0);near(oy+y*sy,0);near(w*sx,size.width);near(h*sy,size.height);
    assert.notEqual(background.color,'#071b2b','the sky and terrain replace letterbox bars');
    for(const [id,x,y]of targets){const cx=ox+x*sx,cy=oy+y*sy;assert.ok(cx>=0&&cx<=size.width&&cy>=0&&cy<=size.height);mock.click(cx,cy);assert.equal(locations.at(-1),id);}
  }
});
