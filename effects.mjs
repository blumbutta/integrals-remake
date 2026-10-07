const FORMULAS=['∫ x² dx = x³/3 + C','∫ sin x dx = −cos x + C','∫ eˣ dx = eˣ + C','∫ dx/x = ln|x| + C','∫ cos x dx = sin x + C','∫₀¹ x dx = ½','∫ 2x dx = x² + C','∫₀π sin x dx = 2','∫ xⁿ dx = xⁿ⁺¹/(n+1) + C','∮ f(z) dz = 2πi·Res f','∫₀∞ e⁻ˣ dx = 1','∫ dx = x + C'];
const CURSOR_LIMIT=100,CURSOR_BASE=50n;
const CURSOR_COLORS=[
  {name:'белый',color:'#ffffff',filter:'none'},
  {name:'жёлтый',color:'#ffe36b',filter:'brightness(0) saturate(100%) invert(91%) sepia(53%) saturate(747%) hue-rotate(338deg) brightness(106%) contrast(101%)'},
  {name:'оранжевый',color:'#ff9b45',filter:'brightness(0) saturate(100%) invert(69%) sepia(63%) saturate(1436%) hue-rotate(331deg) brightness(104%) contrast(101%)'},
  {name:'красный',color:'#ff6874',filter:'brightness(0) saturate(100%) invert(57%) sepia(65%) saturate(2123%) hue-rotate(317deg) brightness(107%) contrast(102%)'},
  {name:'фиолетовый',color:'#bc8cff',filter:'brightness(0) saturate(100%) invert(64%) sepia(62%) saturate(1023%) hue-rotate(215deg) brightness(104%) contrast(101%)'},
  {name:'голубой',color:'#78c9ff',filter:'brightness(0) saturate(100%) invert(78%) sepia(60%) saturate(947%) hue-rotate(173deg) brightness(105%) contrast(102%)'},
  {name:'бирюзовый',color:'#65e8bf',filter:'brightness(0) saturate(100%) invert(90%) sepia(30%) saturate(1153%) hue-rotate(91deg) brightness(95%) contrast(93%)'},
  {name:'розовый',color:'#ff93d4',filter:'brightness(0) saturate(100%) invert(71%) sepia(56%) saturate(1685%) hue-rotate(286deg) brightness(104%) contrast(102%)'},
];
const countValue=value=>typeof value==='bigint'?(value>0n?value:0n):typeof value==='number'&&Number.isFinite(value)&&value>0?BigInt(Math.floor(value)):0n;
const numberText=value=>new Intl.NumberFormat('ru-RU').format(value);
function tierStyle(tier){return CURSOR_COLORS[tier]||{name:`спектральный ${tier+1}`,color:`hsl(${(tier*137.507764)%360} 88% 74%)`,filter:`sepia(1) saturate(7) hue-rotate(${(tier*137.507764)%360}deg)`};}
/** BigInt weights keep the displayed sum exact, including counts above Number.MAX_SAFE_INTEGER. */
export function cursorRepresentation(count){
  const total=countValue(count);
  if(total===0n)return [];
  if(total<=100n)return Array.from({length:Number(total)},()=>({tier:0,weight:1n,multiplier:1n,value:1n,...tierStyle(0)}));
  const groups=[];let remaining=total,weight=1n,tier=0;
  while(remaining>0n){
    // Extremely large values can need more than 100 nonzero tiers. Keep the final
    // tier exact by grouping its entire remaining coefficient in one weighted tier.
    const units=tier===CURSOR_LIMIT-1?remaining:remaining%CURSOR_BASE;
    if(units>0n)groups.push({tier,weight,units,icons:Number(units>100n?100n:units)});
    if(tier===CURSOR_LIMIT-1)break;
    remaining/=CURSOR_BASE;weight*=CURSOR_BASE;tier++;
  }
  let excess=groups.reduce((sum,group)=>sum+group.icons,0)-CURSOR_LIMIT;
  // Compress highest tiers first. For 9 999 this makes two orange icons (×2, ×1)
  // plus 49 yellow and 49 white: exactly 100 images representing all 9 999 cursors.
  for(let i=groups.length-1;i>=0&&excess>0;i--){const reduction=Math.min(excess,groups[i].icons-1);groups[i].icons-=reduction;excess-=reduction;}
  return groups.reverse().flatMap(group=>{
    const divisor=BigInt(group.icons),each=group.units/divisor,remainder=group.units%divisor;
    return Array.from({length:group.icons},(_,i)=>{const multiplier=each+(BigInt(i)<remainder?1n:0n);return {tier:group.tier,weight:group.weight,multiplier,value:group.weight*multiplier,...tierStyle(group.tier)};});
  });
}
export function cursorTierLegend(count){
  const icons=cursorRepresentation(count),tiers=[...new Map(icons.map(icon=>[icon.tier,icon])).values()].sort((a,b)=>a.tier-b.tier);
  return `Курсоров: ${numberText(countValue(count))}${tiers.map(icon=>` · ${icon.name} = ${numberText(icon.weight)}`).join('')}${icons.some(icon=>icon.multiplier>1n)?' · ×N — N курсоров этого цвета':''}`;
}
export function cursorRingLayout(count,width,height,buttonWidth){
  const icons=cursorRepresentation(count),visible=icons.length;
  const size=Math.max(6,Math.min(26,26-Math.max(0,visible-1)*20/99,Math.min(width,height)/5));
  const padding=size*Math.SQRT2/2+(icons.some(icon=>icon.multiplier>1n)?16:8);
  const radius=Math.max(0,Math.min(buttonWidth/2+15,Math.min(width,height)/2-padding));
  return {visible,size,radius,padding};
}
export function createClickEffects({reactor,button,stage,rain,ring}) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const style=document.createElement('style');style.textContent=`
    .formula-drop{position:absolute;left:var(--x);top:-36px;color:#fff8dd;font:italic var(--size)/1.2 Georgia,serif;white-space:nowrap;text-shadow:0 1px 8px #0008;pointer-events:none;animation:formula-fall var(--duration) linear forwards;will-change:transform;opacity:0;}
    @keyframes formula-fall{0%{opacity:0;transform:translate3d(0,0,0) rotate(var(--tilt))}10%{opacity:.72}80%{opacity:.45}100%{opacity:0;transform:translate3d(var(--drift),var(--fall),0) rotate(calc(var(--tilt) + 12deg))}}
    .orbit-cursor{position:absolute;left:50%;top:50%;width:var(--cursor-size);height:var(--cursor-size);margin:calc(var(--cursor-size) / -2);transform:rotate(var(--angle)) translateX(var(--radius));pointer-events:none;filter:drop-shadow(0 2px 2px #000a)}
    .orbit-cursor img{display:block;width:100%;height:100%;object-fit:contain;filter:var(--cursor-filter,none);transform:rotate(-90deg);animation:cursor-working 2.8s ease-in-out infinite;animation-delay:var(--delay)}
    @keyframes cursor-working{0%,78%,100%{transform:rotate(-90deg) translateY(0)}85%{transform:rotate(-90deg) translateY(4px) scale(.9)}}
    .cursor-multiplier{position:absolute;left:50%;top:-5px;min-width:10px;max-width:20px;padding:1px 2px;color:var(--cursor-color,#fff);background:#102939ed;border:1px solid currentColor;border-radius:3px;font:700 7px/1.1 system-ui,sans-serif;text-align:center;white-space:nowrap;transform:rotate(calc(-1 * var(--angle)));transform-origin:0 100%}
    .click-shock{position:absolute;left:50%;top:50%;width:var(--diameter);height:var(--diameter);border:2px solid #fff7d7;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);animation:click-shock-wave .6s ease-out forwards}
    @keyframes click-shock-wave{to{transform:translate(-50%,-50%) scale(1.45);opacity:0}}
    @media(prefers-reduced-motion:reduce){.formula-drop,.click-shock{display:none}.orbit-cursor img{animation:none}}
  `;document.head.append(style);
  let owned=-1n,quake=null,shakeTimer,clickSequence=0,disposed=false;
  ring.style.overflow='hidden';
  function sizeCursors(){const layout=cursorRingLayout(owned,stage.clientWidth,stage.clientHeight,button.clientWidth);ring.querySelectorAll('.orbit-cursor').forEach(el=>{el.style.setProperty('--radius',`${layout.radius}px`);el.style.setProperty('--cursor-size',`${layout.size}px`);});}
  const observer=new ResizeObserver(sizeCursors);observer.observe(stage);
  function update(count){
    count=countValue(count);if(disposed||count===owned)return;owned=count;ring.replaceChildren();ring.setAttribute('role','img');
    const icons=cursorRepresentation(count),visible=icons.length,legend=cursorTierLegend(count);
    const detail=`${legend}. В одном кольце ${visible} ${visible===1?'значок':'значков'}. Каждый цвет обозначает вес автокликов; множитель показывает число единиц этого цвета.`;
    ring.setAttribute('title',detail);ring.setAttribute('aria-label',detail);
    const caption=document.getElementById?.('cursor-legend');if(caption){caption.textContent=legend;caption.hidden=count<=100n;}
    for(let i=0;i<visible;i++){
      const representation=icons[i],cursor=document.createElement('span');cursor.className=`orbit-cursor cursor-tier-${representation.tier}`;
      for(const [name,value] of Object.entries({tier:representation.tier,weight:representation.weight,multiplier:representation.multiplier,value:representation.value}))cursor.setAttribute(`data-${name}`,String(value));
      cursor.style.setProperty('--angle',`${-90+i*360/Math.max(visible,1)}deg`);cursor.style.setProperty('--delay',`${-(i*.21)%2.8}s`);
      cursor.style.setProperty('--cursor-color',representation.color);cursor.style.setProperty('--cursor-filter',representation.filter);
      cursor.setAttribute('title',`${representation.name}: ${numberText(representation.weight)} × ${numberText(representation.multiplier)} = ${numberText(representation.value)} автокликов`);
      const icon=document.createElement('img');icon.src='./assets/original/cursoricon.png';icon.alt='';cursor.append(icon);
      if(representation.multiplier>1n){const badge=document.createElement('span');badge.className='cursor-multiplier';badge.textContent=representation.multiplier<=999n?`×${numberText(representation.multiplier)}`:'×⋯';badge.setAttribute('aria-label',`Множитель ${numberText(representation.multiplier)}`);cursor.append(badge);}
      ring.append(cursor);
    }
    sizeCursors();
  }
  function stopQuake(){quake?.cancel();quake=null;clearTimeout(shakeTimer);reactor.style.removeProperty('transform');}
  function restartQuake(){
    stopQuake();const direction=(clickSequence++%2)?-1:1;
    const frames=[
      {transform:`translate(${-2*direction}px,${direction}px)`},
      {transform:`translate(${3*direction}px,${-2*direction}px) rotate(${.2*direction}deg)`,offset:.22},
      {transform:`translate(${-2*direction}px,${-direction}px)`,offset:.48},
      {transform:`translate(${direction}px,${2*direction}px)`,offset:.72},
      {transform:'translate(0,0) rotate(0deg)'},
    ];
    if(typeof reactor.animate==='function'){
      quake=reactor.animate(frames,{duration:230,easing:'ease-out',fill:'none'});
      const current=quake;current.onfinish=()=>{if(quake===current)quake=null;};
    }else{
      reactor.style.transform=frames[0].transform;shakeTimer=setTimeout(()=>reactor.style.removeProperty('transform'),230);
    }
  }
  const motionChange=()=>{if(reduced.matches)stopQuake();};reduced.addEventListener?.('change',motionChange);
  function manualClick(){
    if(disposed||reduced.matches)return;
    for(let i=0;i<3;i++){
      while(rain.children.length>=48)rain.firstElementChild.remove();
      const el=document.createElement('span');el.className='formula-drop';el.textContent=FORMULAS[Math.floor(Math.random()*FORMULAS.length)];
      el.style.setProperty('--x',`${-12+Math.random()*85}%`);el.style.setProperty('--size',`${15+Math.random()*9}px`);el.style.setProperty('--duration',`${2.1+Math.random()*2}s`);el.style.setProperty('--tilt',`${-10+Math.random()*20}deg`);el.style.setProperty('--drift',`${-40+Math.random()*80}px`);el.style.setProperty('--fall',`${Math.max(600,reactor.clientHeight+90)}px`);el.addEventListener('animationend',()=>el.remove(),{once:true});rain.append(el);
    }
    // Cancel the previous impulse so every accepted manual click starts a fresh motion.
    // No class toggling or accumulated transforms: rapid clicking stays within 3 px.
    restartQuake();
    if(stage.querySelectorAll('.click-shock').length<4){const wave=document.createElement('span');wave.className='click-shock';wave.style.setProperty('--diameter',`${button.clientWidth}px`);wave.addEventListener('animationend',()=>wave.remove(),{once:true});stage.append(wave);}
  }
  return {update,manualClick,destroy(){disposed=true;observer.disconnect();stopQuake();reduced.removeEventListener?.('change',motionChange);rain.replaceChildren();ring.replaceChildren();const caption=document.getElementById?.('cursor-legend');if(caption){caption.textContent='';caption.hidden=true;}stage.querySelectorAll('.click-shock').forEach(el=>el.remove());style.remove();}};
}
