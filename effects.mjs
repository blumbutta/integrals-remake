const FORMULAS=['∫ x² dx = x³/3 + C','∫ sin x dx = −cos x + C','∫ eˣ dx = eˣ + C','∫ dx/x = ln|x| + C','∫ cos x dx = sin x + C','∫₀¹ x dx = ½','∫ 2x dx = x² + C','∫₀π sin x dx = 2','∫ xⁿ dx = xⁿ⁺¹/(n+1) + C','∮ f(z) dz = 2πi·Res f','∫₀∞ e⁻ˣ dx = 1','∫ dx = x + C'];
export function cursorRingLayout(count,width,height,buttonWidth){
  const visible=Math.min(50,Math.max(0,Math.floor(Number.isFinite(count)?count:0)));
  const size=Math.max(10,Math.min(26,26-Math.max(0,visible-1)*14/49,Math.min(width,height)/5));
  const padding=size*Math.SQRT2/2+8;
  const radius=Math.max(0,Math.min(buttonWidth/2+15,Math.min(width,height)/2-padding));
  return {visible,size,radius,padding};
}
export function createClickEffects({reactor,button,stage,rain,ring}) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const style=document.createElement('style');style.textContent=`
    .formula-drop{position:absolute;left:var(--x);top:-36px;color:#fff8dd;font:italic var(--size)/1.2 Georgia,serif;white-space:nowrap;text-shadow:0 1px 8px #0008;pointer-events:none;animation:formula-fall var(--duration) linear forwards;will-change:transform;opacity:0;}
    @keyframes formula-fall{0%{opacity:0;transform:translate3d(0,0,0) rotate(var(--tilt))}10%{opacity:.72}80%{opacity:.45}100%{opacity:0;transform:translate3d(var(--drift),var(--fall),0) rotate(calc(var(--tilt) + 12deg))}}
    .orbit-cursor{position:absolute;left:50%;top:50%;width:var(--cursor-size);height:var(--cursor-size);margin:calc(var(--cursor-size) / -2);transform:rotate(var(--angle)) translateX(var(--radius));pointer-events:none;filter:drop-shadow(0 2px 2px #000a)}
    .orbit-cursor img{display:block;width:100%;height:100%;object-fit:contain;transform:rotate(-90deg);animation:cursor-working 2.8s ease-in-out infinite;animation-delay:var(--delay)}
    @keyframes cursor-working{0%,78%,100%{transform:rotate(-90deg) translateY(0)}85%{transform:rotate(-90deg) translateY(4px) scale(.9)}}
    .cursor-overflow{position:absolute;right:4%;bottom:4%;color:#fff3c6;font:600 12px Georgia,serif;background:#102939bb;padding:3px 6px;border-radius:4px}
    .click-shock{position:absolute;left:50%;top:50%;width:var(--diameter);height:var(--diameter);border:2px solid #fff7d7;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);animation:click-shock-wave .6s ease-out forwards}
    @keyframes click-shock-wave{to{transform:translate(-50%,-50%) scale(1.45);opacity:0}}
    @media(prefers-reduced-motion:reduce){.formula-drop,.click-shock{display:none}.orbit-cursor img{animation:none}}
  `;document.head.append(style);
  let owned=-1,quake=null,shakeTimer,clickSequence=0,disposed=false;
  ring.style.overflow='hidden';
  function sizeCursors(){const layout=cursorRingLayout(owned,stage.clientWidth,stage.clientHeight,button.clientWidth);ring.querySelectorAll('.orbit-cursor').forEach(el=>{el.style.setProperty('--radius',`${layout.radius}px`);el.style.setProperty('--cursor-size',`${layout.size}px`);});}
  const observer=new ResizeObserver(sizeCursors);observer.observe(stage);
  function update(count){
    count=Math.max(0,Math.floor(Number.isFinite(count)?count:0));if(disposed||count===owned)return;owned=count;ring.replaceChildren();ring.setAttribute('role','img');ring.setAttribute('aria-label',`Автокликеры вокруг интеграла: ${count}`);
    const visible=Math.min(count,50);
    for(let i=0;i<visible;i++){
      const cursor=document.createElement('span');cursor.className='orbit-cursor';
      cursor.style.setProperty('--angle',`${-90+i*360/Math.max(visible,1)}deg`);cursor.style.setProperty('--delay',`${-(i*.21)%2.8}s`);
      const icon=document.createElement('img');icon.src='./assets/original/cursoricon.png';icon.alt='';cursor.append(icon);ring.append(cursor);
    }
    if(count>visible){const overflow=document.createElement('span');overflow.className='cursor-overflow';overflow.textContent=`+${new Intl.NumberFormat('ru-RU').format(count-visible)}`;ring.append(overflow);}
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
  return {update,manualClick,destroy(){disposed=true;observer.disconnect();stopQuake();reduced.removeEventListener?.('change',motionChange);rain.replaceChildren();ring.replaceChildren();stage.querySelectorAll('.click-shock').forEach(el=>el.remove());style.remove();}};
}
