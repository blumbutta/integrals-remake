import test from 'node:test';
import assert from 'node:assert/strict';
import { createClickEffects, cursorRingLayout, cursorRepresentation, cursorTierLegend } from '../effects.mjs';

class Element {
  constructor(){this.children=[];this.className='';this.parent=null;this.attributes=new Map();const values=new Map();this.style={setProperty:(key,value)=>values.set(key,value),getPropertyValue:key=>values.get(key),removeProperty:key=>values.delete(key)};this.clientWidth=320;this.clientHeight=279;}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  replaceChildren(...items){this.children.forEach(child=>child.parent=null);this.children=[];this.append(...items);}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}}
  get firstElementChild(){return this.children[0];}
  setAttribute(key,value){this.attributes.set(key,value);}
  addEventListener(){}
  querySelectorAll(selector){const all=[];for(const child of this.children){if(child.className.split(' ').includes(selector.slice(1)))all.push(child);all.push(...child.querySelectorAll(selector));}return all;}
}
function environment(t){
  const previous={document:globalThis.document,matchMedia:globalThis.matchMedia,ResizeObserver:globalThis.ResizeObserver};
  const listeners=new Set(),legend=new Element(),preference={matches:false,addEventListener(name,callback){listeners.add(callback);},removeEventListener(name,callback){listeners.delete(callback);},change(value){this.matches=value;for(const callback of listeners)callback();}};
  globalThis.document={head:new Element(),createElement:()=>new Element(),getElementById:id=>id==='cursor-legend'?legend:null};globalThis.matchMedia=()=>preference;
  globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback();}disconnect(){}};
  const reactor=new Element(),button=new Element(),stage=new Element(),rain=new Element(),ring=new Element();button.clientWidth=221;
  const animations=[];reactor.animate=(frames,options)=>{const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
  const effects=createClickEffects({reactor,button,stage,rain,ring});
  t.after(()=>{effects.destroy();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  return {effects,reactor,button,stage,rain,ring,legend,animations,preference};
}

test('rapid manual clicks restart bounded quake every time; production updates never shake',t=>{
  const {effects,animations,rain,stage}=environment(t);
  effects.update(50);assert.equal(animations.length,0);
  for(let i=0;i<60;i++)effects.manualClick();
  assert.equal(animations.length,60);assert.ok(animations.slice(0,-1).every(a=>a.cancelled));assert.equal(animations.at(-1).cancelled,false);
  assert.notEqual(animations[0].frames[0].transform,animations[1].frames[0].transform);
  for(const a of animations){assert.equal(a.options.fill,'none');assert.equal(a.options.duration,230);assert.match(a.frames.at(-1).transform,/translate\(0,0\)/);}
  assert.equal(rain.children.length,48);assert.equal(stage.querySelectorAll('.click-shock').length,4);
  effects.destroy();assert.equal(animations.at(-1).cancelled,true);
});
test('counts up to 100 use only white cursors and larger numbers use exact base-50 weights',()=>{
  for(const count of [0,1,49,50,99,100]){
    const icons=cursorRepresentation(count);assert.equal(icons.length,count);
    assert.ok(icons.every(icon=>icon.tier===0&&icon.weight===1n&&icon.multiplier===1n&&icon.filter==='none'));
  }
  const icons=cursorRepresentation(101);assert.equal(icons.length,3);
  assert.equal(icons.filter(icon=>icon.tier===1).length,2);assert.equal(icons.filter(icon=>icon.tier===0).length,1);
  assert.ok(icons.filter(icon=>icon.tier===1).every(icon=>icon.weight===50n&&icon.color!==icons.at(-1).color));
  assert.equal(cursorRepresentation(2500)[0].weight,2500n);assert.equal(cursorRepresentation(125000)[0].tier,3);
});
test('every game count through 10000 fits 100 exact icons, including grouped 9999',()=>{
  for(let count=0;count<=10000;count++){
    const icons=cursorRepresentation(count);assert.ok(icons.length<=100,`Icon cap at ${count}`);
    assert.equal(icons.reduce((sum,icon)=>sum+icon.value,0n),BigInt(count),`Exact sum at ${count}`);
    for(const icon of icons){assert.equal(icon.weight,50n**BigInt(icon.tier));assert.equal(icon.value,icon.weight*icon.multiplier);assert.ok(icon.multiplier>=1n);}
  }
  const icons=cursorRepresentation(9999),orange=icons.filter(icon=>icon.tier===2);
  assert.equal(icons.length,100);assert.equal(orange.length,2);assert.deepEqual(orange.map(icon=>icon.multiplier),[2n,1n]);
  assert.equal(icons.filter(icon=>icon.tier===0).length,49);assert.equal(icons.filter(icon=>icon.tier===1).length,49);
  assert.equal(cursorRepresentation(10000).length,4);
});
test('large counts remain exact and bounded without overflowing or allocating one icon per owned cursor',()=>{
  for(const count of [Number.MAX_SAFE_INTEGER,1e250,50n**200n-1n,98765432101234567890123456789n]){
    const icons=cursorRepresentation(count);assert.ok(icons.length<=100);
    assert.equal(icons.reduce((sum,icon)=>sum+icon.value,0n),BigInt(count));
    assert.ok(icons.every(icon=>icon.color&&icon.name&&icon.filter));
  }
  for(const invalid of [-1,-123n,Infinity,NaN,undefined,'100'])assert.deepEqual(cursorRepresentation(invalid),[]);
  assert.equal(cursorRepresentation(4.8).length,4);
});
test('cursor rendering has one radius, at most 100 original images, and decreases size with visible count',t=>{
  const {effects,ring,legend}=environment(t);effects.update(1);
  const initial=Number.parseFloat(ring.querySelectorAll('.orbit-cursor')[0].style.getPropertyValue('--cursor-size'));
  assert.equal(legend.hidden,true);effects.update(100);const cursors=ring.querySelectorAll('.orbit-cursor');
  assert.equal(cursors.length,100);assert.equal(new Set(cursors.map(c=>c.style.getPropertyValue('--radius'))).size,1);
  assert.equal(new Set(cursors.map(c=>c.style.getPropertyValue('--angle'))).size,100);
  assert.ok(Number.parseFloat(cursors[0].style.getPropertyValue('--cursor-size'))<initial);
  assert.ok(cursors.every(cursor=>cursor.children[0].src==='./assets/original/cursoricon.png'));
  assert.equal(ring.style.overflow,'hidden');assert.equal(ring.querySelectorAll('.cursor-overflow').length,0);
  effects.update(9999);const weighted=ring.querySelectorAll('.orbit-cursor');
  assert.equal(weighted.length,100);assert.equal(weighted.reduce((sum,cursor)=>sum+BigInt(cursor.attributes.get('data-value')),0n),9999n);
  assert.equal(ring.querySelectorAll('.cursor-multiplier')[0].textContent,'×2');assert.equal(legend.hidden,false);assert.match(legend.textContent,/×N/);
  assert.ok(weighted.some(cursor=>cursor.attributes.get('data-tier')==='2'&&cursor.style.getPropertyValue('--cursor-filter')!=='none'));
  assert.match(ring.attributes.get('aria-label'),/9\s999/);assert.match(ring.attributes.get('title'),/оранжевый/);
  effects.update(50);assert.equal(legend.hidden,true);assert.equal(ring.querySelectorAll('.cursor-multiplier').length,0);
  effects.destroy();assert.equal(legend.hidden,true);assert.equal(legend.textContent,'');
});
test('visible legend explains only represented colors and signals grouped multipliers',()=>{
  assert.equal(cursorTierLegend(101),'Курсоров: 101 · белый = 1 · жёлтый = 50');
  assert.match(cursorTierLegend(9999),/оранжевый = 2\s500/);assert.match(cursorTierLegend(9999),/×N/);
  assert.ok(!cursorTierLegend(2500).includes('жёлтый'));assert.ok(!cursorTierLegend(2500).includes('×N'));
});
test('cursor ring stays inside both stage dimensions on narrow, wide and shallow layouts',()=>{
  for(const [w,h,button] of [[296,279,221],[380,334,260],[1280,334,260],[480,334,260],[220,220,190],[500,180,160]])for(const count of [1,10,25,50,100,101,1000,9999,10000]){
    const layout=cursorRingLayout(count,w,h,button);
    assert.ok(layout.radius+layout.padding<=Math.min(w,h)/2+1e-9,`${w}×${h}, ${count}`);
    assert.ok(layout.size>=6&&layout.size<=26);assert.ok(layout.visible<=100);assert.equal(layout.visible,cursorRepresentation(count).length);
  }
});
test('reduced-motion preference suppresses manual shaking and formula rain',t=>{
  const {effects,animations,rain,preference}=environment(t);preference.change(true);effects.manualClick();
  assert.equal(animations.length,0);assert.equal(rain.children.length,0);
  preference.change(false);effects.manualClick();assert.equal(animations.length,1);preference.change(true);
  assert.equal(animations[0].cancelled,true);effects.manualClick();assert.equal(animations.length,1);
});
