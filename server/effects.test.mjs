import test from 'node:test';
import assert from 'node:assert/strict';
import { createClickEffects, cursorRingLayout } from '../effects.mjs';

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
  const preference={matches:false,addEventListener(){},removeEventListener(){}};
  globalThis.document={head:new Element(),createElement:()=>new Element()};globalThis.matchMedia=()=>preference;
  globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback();}disconnect(){}};
  const reactor=new Element(),button=new Element(),stage=new Element(),rain=new Element(),ring=new Element();button.clientWidth=221;
  const animations=[];reactor.animate=(frames,options)=>{const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
  const effects=createClickEffects({reactor,button,stage,rain,ring});
  t.after(()=>{effects.destroy();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  return {effects,reactor,button,stage,rain,ring,animations,preference};
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
test('cursor rendering has one radius, at most 50 images, and decreases size with count',t=>{
  const {effects,ring}=environment(t);effects.update(1);
  const initial=Number.parseFloat(ring.querySelectorAll('.orbit-cursor')[0].style.getPropertyValue('--cursor-size'));
  effects.update(1000);const cursors=ring.querySelectorAll('.orbit-cursor');
  assert.equal(cursors.length,50);assert.equal(new Set(cursors.map(c=>c.style.getPropertyValue('--radius'))).size,1);
  assert.equal(new Set(cursors.map(c=>c.style.getPropertyValue('--angle'))).size,50);
  assert.ok(Number.parseFloat(cursors[0].style.getPropertyValue('--cursor-size'))<initial);
  assert.equal(ring.style.overflow,'hidden');assert.equal(ring.querySelectorAll('.cursor-overflow')[0].textContent,'+950');
});
test('cursor ring stays inside both stage dimensions on narrow, wide and shallow layouts',()=>{
  for(const [w,h,button] of [[296,279,221],[380,334,260],[1280,334,260],[480,334,260],[220,220,190],[500,180,160]])for(const count of [1,10,25,50,1000]){
    const layout=cursorRingLayout(count,w,h,button);
    assert.ok(layout.radius+layout.padding<=Math.min(w,h)/2+1e-9,`${w}×${h}, ${count}`);
    assert.ok(layout.size>=10&&layout.size<=26);assert.ok(layout.visible<=50);
  }
});
test('reduced-motion preference suppresses manual shaking and formula rain',t=>{
  const {effects,animations,rain,preference}=environment(t);preference.matches=true;effects.manualClick();
  assert.equal(animations.length,0);assert.equal(rain.children.length,0);
});
