import {GENERATORS} from './shared/economy.mjs';

const WIDTH=440, HEIGHT=420, MAX_ACTORS=45, MAX_PARTICLES=64, FRAME_MS=1000/30;
const REACTOR={x:252,y:309};
const FILES=['cursoricon.png','grandmaIcon.png','farmIcon.png','factoryIcon.png','mineIcon.png','shipmentIcon.png','alchemylabIcon.png','portalIcon.png','timemachineIcon.png','antimattercondenserIcon.png'];
const TASKS=[
  ['Доставляет новую идею','Собирает светящиеся интегралы','Проверяет следующий клик'],
  ['Решает домашнее задание','Считает пример в тетради','Проверяет ответ карандашом'],
  ['Выводит формулу на доске','Готовится к сессии','Ищет первообразную'],
  ['Объясняет решение у доски','Проверяет студенческие работы','Проводит маленькую лекцию'],
  ['Вычисляет численный интеграл','Проверяет алгоритм','Обрабатывает новые данные'],
  ['Доказывает новую теорему','Читает научный доклад','Исправляет знак перед константой'],
  ['Обучает математическую модель','Сопоставляет закономерности','Проверяет новую гипотезу'],
  ['Принимает идеи из другого измерения','Стабилизирует математический портал','Связывает две бесконечности'],
  ['Возвращает вычисления из будущего','Сверяет ход научного времени','Замыкает временную петлю'],
  ['Ищет главный ответ','Размышляет о бесконечности','Собирает единую теорию'],
];
const ANCHORS=[
  {x:337,y:329,size:28}, {x:102,y:342,size:43}, {x:90,y:231,size:47},
  {x:191,y:238,size:66}, {x:334,y:233,size:51}, {x:204,y:121,size:45},
  {x:89,y:110,size:38}, {x:294,y:112,size:56}, {x:386,y:337,size:44},
  {x:374,y:108,size:53},
];
const GLYPHS=['∫','+ C','x²','Σ','dx','π','λ','∞'];
const seed=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

/** A self-contained canvas world. The supplied state remains untouched. */
export function createLabWorld(canvas,{onInspect}={}){
  const ctx=canvas?.getContext?.('2d',{alpha:false});
  if(!ctx)return {update(){},burst(){},setPaused(){},get paused(){return true;},resize(){},destroy(){}};
  let destroyed=false,manualPaused=false,inView=true,frame=0,lastFrame=0,time=0,flashTimer=0;
  let width=WIDTH,height=HEIGHT,dpr=1,scale=1,offsetX=0,offsetY=0;
  let cameraZoom=1.28,cameraY=276,targetZoom=1.28,targetY=276;
  let counts=Array(10).fill(0),total=0,highest=-1,prestige=0,hue=206,accent='#9ae4ed';
  let actors=[],particles=[],waves=[],hitAreas=[],flash=0,lastInspection=-Infinity;
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced=!!motion?.matches;
  const images=FILES.map(file=>{
    const image=new Image();image.decoding='async';
    image.onload=()=>{if(!destroyed)draw();};image.onerror=()=>{if(!destroyed)draw();};
    image.src=new URL(`./assets/original/${file}`,import.meta.url).href;
    return image;
  });
  const tint=(light=70,alpha=1)=>`hsla(${hue}, 68%, ${light}%, ${alpha})`;
  const floorCount=()=>highest>=5?3:highest>=2?2:1;
  const toWorld=(x,y)=>({x:((x-offsetX)/scale-WIDTH/2)/cameraZoom+WIDTH/2,y:((y-offsetY)/scale-HEIGHT/2)/cameraZoom+cameraY});
  const canAnimate=()=>!destroyed&&!manualPaused&&!document.hidden&&inView&&!reduced&&total>0;
  function rounded(x,y,w,h,r,fill,stroke,lineWidth=1){
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  function polygon(points,fill,stroke,lineWidth=1){
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  function line(points,color,lineWidth=1){
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
  }
  function text(value,x,y,size=11,color='#e8eef2',font='sans-serif',align='left'){
    ctx.font=`${size}px ${font}`;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;ctx.fillText(value,x,y);
  }
  function glow(x,y,r,color,opacity=1){
    ctx.save();ctx.globalAlpha=opacity;
    const gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(1,'transparent');
    ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
  }
  function ellipse(x,y,rx,ry,color,stroke){
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    if(color){ctx.fillStyle=color;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  }
  function imageAt(index,x,y,size,alpha=1,angle=0){
    const image=images[index];ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(angle);
    if(image.complete&&image.naturalWidth){
      const ratio=image.naturalWidth/image.naturalHeight,w=Math.min(size*ratio,size*1.62);
      ctx.drawImage(image,-w/2,-size,w,size);
    }else text(['↖','π','Σ','λ','⌘','∫','●','◉','◷','∞'][index],0,-size*.2,size*.75,tint(84),'serif','center');
    ctx.restore();
  }
  function board(x,y,w,h,formula,secondary){
    rounded(x,y,w,h,3,'#112f34','#ad8453',3);
    rounded(x+3,y+3,w-6,h-6,1,'#16383b');
    line([[x+4,y+h-4],[x+w-3,y+h-4]],'#b08a55',2);
    text(formula,x+10,y+h*.46,Math.min(16,w/9),'#d9e8cf','Georgia, serif');
    if(secondary)text(secondary,x+10,y+h*.79,8.5,'#91aaa0','monospace');
    line([[x+w-25,y+h-3],[x+w-15,y+h-3]],'#d7e3c4',2);
    line([[x+w-12,y+h-3],[x+w-6,y+h-3]],'#ead699',2);
  }
  function desk(x,y,w=69){
    polygon([[x-w/2,y-10],[x+w/2-6,y-10],[x+w/2+4,y-3],[x-w/2+8,y-3]],'#b58c5d','#5d4b3b');
    rounded(x-w/2+5,y-3,w-3,5,1,'#715443');
    line([[x-w/2+11,y+2],[x-w/2+11,y+15]],'#403d36',4);
    line([[x+w/2-6,y+2],[x+w/2-6,y+15]],'#403d36',4);
    polygon([[x-12,y-9],[x+10,y-9],[x+16,y-5],[x-7,y-5]],'#e6dbb5');
    line([[x-7,y-8],[x+4,y-8]],'#707768',.7);
  }
  function lamp(x,y,active=true){
    line([[x,y],[x,y+14]],'#172b3d',2);
    if(active)glow(x,y+23,40,'#ffd68c',.16);
    polygon([[x-10,y+19],[x-4,y+12],[x+4,y+12],[x+10,y+19]],'#bba476','#eedda7');
    ellipse(x,y+19,10,3,active?'#f4dfa4':'#827856');
    if(active)polygon([[x-6,y+22],[x+6,y+22],[x+34,y+71],[x-34,y+71]],'rgba(253,222,151,.026)');
  }
  function background(){
    const gradient=ctx.createLinearGradient(0,0,0,HEIGHT);gradient.addColorStop(0,'#082238');gradient.addColorStop(.57,'#143c54');gradient.addColorStop(1,'#102c3d');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,WIDTH,HEIGHT);
    glow(226,193,260,tint(35),.19);glow(39,73,85,'#7894ac',.08);
    for(let i=0;i<39;i++){
      const x=12+seed(i+4)*416,y=13+seed(i+67)*228,r=i%7===0?1.1:.6;
      const alpha=.15+seed(i+20)*.4+(total&&!reduced?Math.sin(time*.65+i)*.05:0);
      ellipse(x,y,r,r,`rgba(206,230,229,${alpha})`);
    }
    ctx.save();ctx.globalAlpha=.075;
    for(let i=0;i<9;i++){
      const x=i*60-23,h=30+seed(i+300)*70;
      rounded(x,HEIGHT-125-h,38,h+115,3,'#bed7d4');
      polygon([[x-4,HEIGHT-125-h],[x+19,HEIGHT-151-h],[x+42,HEIGHT-125-h]],'#bed7d4');
    }ctx.restore();
    const gridY=390;
    for(let i=-3;i<9;i++)line([[i*67,gridY],[i*67+57,HEIGHT]],'rgba(124,177,184,.045)');
    line([[0,402],[WIDTH,402]],'rgba(124,177,184,.045)');
    if(prestige>0){
      ctx.save();ctx.strokeStyle=tint(78,.12);ctx.lineWidth=.6;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(232,183,156+i*13,52+i*15,-.42,0,Math.PI*2);ctx.stroke();}ctx.restore();
    }
  }
  function room(floor){
    const y=356-floor*112,roomHeight=floorCount()===1?160:96,top=y-roomHeight;
    const gradient=ctx.createLinearGradient(44,top,397,y);gradient.addColorStop(0,'#25465a');gradient.addColorStop(1,'#193a4c');
    rounded(44,top,352,roomHeight,2,gradient);
    polygon([[396,top],[416,top+13],[416,y+12],[396,y]],'#142e40');
    // The plaster, beams and fine floorboards keep the cutaway legible at phone size.
    for(let x=50;x<393;x+=24)line([[x,top+6],[x,y-3]],'rgba(142,178,184,.038)');
    rounded(46,top,348,5,1,'#53636a');
    line([[46,top+5],[46,y]],'#776b55',5);line([[394,top+4],[394,y]],'#776b55',5);
    for(const x of [61,355]){
      rounded(x,top+18,27,40,11,'#102d41','#627c83',1.2);
      const light=ctx.createLinearGradient(x,top+18,x+27,top+59);light.addColorStop(0,tint(46,.16));light.addColorStop(1,'#244d65');
      rounded(x+3,top+21,21,34,9,light);line([[x+13.5,top+21],[x+13.5,top+57]],'#65828a',.7);line([[x+3,top+40],[x+24,top+40]],'#65828a',.7);
    }
    polygon([[26,y],[396,y],[424,y+23],[55,y+23]],'#7a6957','#b4a079',.8);
    polygon([[55,y+23],[424,y+23],[424,y+30],[55,y+30]],'#3b4141','#667171',.7);
    polygon([[26,y],[55,y+23],[55,y+30],[26,y+7]],'#424641');
    for(let x=41;x<390;x+=22)line([[x,y+1],[x+27,y+22]],'rgba(215,188,140,.14)',.6);
    line([[28,y+1],[395,y+1]],'#d1b482',1);
    lamp(floor===0?196:floor===1?280:150,top+5,total>0);
    if(floor===0){
      board(56,top+21,121,floorCount()===1?56:46,'∫ f(x) dx','каждая идея имеет значение');
      if(floorCount()===1){
        // A taller first workshop fills the close-up before the academy gains floors.
        rounded(291,top+29,58,44,3,'#223e4e','#6d8180');
        text('ПЛАН РЕАКТОРА',320,top+41,5.8,'#a5b8b2','sans-serif','center');
        ellipse(319,top+55,14,9,null,'#709998');
        text('∫',319,top+62,21,'#b5d8cc','Georgia, serif','center');
        line([[299,top+63],[306,top+59]],'#719b9c',.7);line([[332,top+51],[340,top+46]],'#719b9c',.7);
        for(let i=0;i<4;i++)rounded(54+i*22,top+87,18,3,1,['#607f87','#b6956d','#6b876b','#809397'][i]);
        line([[51,top+92],[143,top+92]],'#a68b64',3);
        lamp(319,top+5,total>0);
      }
      desk(101,y-10,75);
      for(let i=0;i<3;i++)rounded(50,y-13-i*4,18,3,1,['#637d8d','#b69a70','#587762'][i]);
      rounded(310,y-11,58,6,2,'#426070','#879a91');
      for(let i=0;i<6;i++)ellipse(317+i*8,y-7,2,2,'#283e4b');
      if(highest<1){
        text('x² + y²',99,y-25,8,'#a7b9b2','monospace');
        line([[115,y-30],[123,y-34]],'#e0b960',2);
      }
    }else if(floor===1){
      board(124,top+14,132,48,'∫ x² dx = x³/3 + C','проверка · доказательство · идея');
      desk(90,y-8,54);desk(333,y-5,70);
      if(counts[4]>0){
        glow(333,y-30,39,tint(72),.2);
        for(let i=0;i<3;i++)text(i%2?'0101':'1010',307,y-68+i*8,7,tint(66,.56),'monospace');
      }
    }else{
      board(133,top+15,115,38,'lim → ∞','гипотезы следующего века');
      polygon([[185,y-11],[220,y-11],[223,y-5],[182,y-5]],'#af9066','#615949');
      polygon([[185,y-5],[219,y-5],[216,y+1],[188,y+1]],'#655342');
      rounded(188,y-3,28,6,1,'#655342');
      if(counts[6]>0){rounded(68,y-38,41,8,2,'#2d4555','#759191');rounded(73,y-4,32,7,2,'#394e59');}
    }
    // Small brass numbering and bolts, with no extra UI around the canvas.
    text(['I','II','III'][floor],411,y+18,8,'#bcb18c','serif','center');
    for(const x of [63,174,285,405])ellipse(x,y+27,1,1,'#958f75');
  }
  function roof(floors){
    const top=356-(floors-1)*112-(floors===1?160:96);
    polygon([[27,top],[224,top-34],[414,top+1],[392,top+8],[224,top-22],[48,top+8]],'#253c4d','#749293',1);
    line([[224,top-34],[224,top-22]],'#b4bfa7',1.2);
    for(let i=1;i<8;i++){const x=28+i*22;line([[x,top-(x-28)*.173],[x+16,top+4-(x-28)*.11]],'rgba(181,199,184,.09)',.7);}
    ellipse(224,top-13,6,6,'#132e3e','#aa9c76');text('∫',224,top-8,14,'#dbc895','Georgia, serif','center');
    if(floors===1){
      ctx.save();ctx.globalAlpha=.35;line([[214,top-46],[234,top-46]],'#78919b',1);line([[224,top-54],[224,top-38]],'#78919b',1);ctx.restore();
    }
  }
  function reactor(){
    const pulse=total>0?1+Math.sin(time*2.1)*.055:1;
    glow(REACTOR.x,REACTOR.y,86,tint(61),total>0?.24+flash*.25:.045+flash*.4);
    ellipse(253,351,48,12,'rgba(3,16,25,.42)');
    rounded(219,342,70,12,4,'#374f5b','#bcb486',1.5);
    ellipse(253,343,34,7,'#8f967e','#c3c3a0');
    const glass=ctx.createLinearGradient(222,0,282,0);glass.addColorStop(0,'rgba(49,112,130,.54)');glass.addColorStop(.25,'rgba(168,232,224,.12)');glass.addColorStop(.75,'rgba(63,132,154,.16)');glass.addColorStop(1,'rgba(18,55,76,.75)');
    rounded(224,267,59,77,15,glass,'#84abae',1.3);
    ellipse(253,270,29,9,'rgba(128,193,187,.11)','#90a7a0');
    line([[232,282],[232,326]],'rgba(222,248,232,.4)',2);
    line([[278,283],[278,327]],'rgba(170,224,221,.13)',1);
    ctx.save();ctx.translate(253,311);ctx.scale(pulse,pulse);ctx.shadowColor=accent;ctx.shadowBlur=total>0?12:0;
    text('∫',0,18,61,total>0||flash?'#e7ffff':'#799f9d','Georgia, serif','center');ctx.restore();
    rounded(238,257,30,6,2,'#bcae7a','#e0d3a4');
    line([[253,256],[253,246]],'#899b8d',2);ellipse(253,244,3,3,total>0?tint(87):'#718584');
    for(let i=0;i<5;i++)ellipse(235+i*9,349,1.6,1.6,total>0&&(i+Math.floor(time))%5<3?tint(79):'#516f73');
    // A broad lower plinth visually connects the reactor to the whole workshop.
    polygon([[205,354],[291,354],[302,364],[216,364]],'#314b55','#728778');
    if(total>0){
      for(let i=0;i<3;i++){
        const t=(time*.09+i/3)%1,y=331-t*50,x=252+Math.sin(t*6+i)*13;
        ellipse(x,y,1.1,1.1,tint(87,.25+.5*Math.sin(t*Math.PI)));
      }
    }
  }
  function extensions(){
    if(counts[8]>0){
      polygon([[365,337],[414,337],[430,350],[381,350]],'#7b7058','#b6a07a');
      rounded(371,302,31,34,4,'#324b54','#aa9867',2);
      line([[383,331],[383,347]],'#d1bd7a',2);
      for(let i=0;i<4;i++){const a=time*.55+i*Math.PI/2;ellipse(386+Math.cos(a)*22,316+Math.sin(a)*7,1.4,1.4,'#d5b978');}
    }
    if(counts[9]>0){
      line([[374,42],[374,20]],'#a4bac2',2);ellipse(374,18,3,3,tint(83));
      glow(374,52,42,tint(67),.17);
      for(let i=0;i<3;i++){
        ctx.beginPath();ctx.ellipse(374,56,27,7+i*4,-.3+i*.34,0,Math.PI*2);ctx.strokeStyle=tint(73,.22);ctx.lineWidth=.8;ctx.stroke();
      }
    }
    if(counts[7]>0){
      glow(294,86,48,tint(61),.22);
      ctx.beginPath();ctx.ellipse(294,88,31,37,0,0,Math.PI*2);ctx.strokeStyle=tint(72,.3);ctx.lineWidth=1;ctx.stroke();
    }
    if(highest>=2){
      // Copper conduit carries the upper floors' computations into the reactor.
      line([[401,137],[401,251],[298,251],[288,270]],'#9d9472',3);
      line([[402,138],[402,251],[299,251],[289,270]],tint(61,.24),1);
      if(highest>=5)line([[401,60],[401,136]],'#9d9472',3);
    }
  }
  function buildActors(){
    const list=[];
    for(let i=0;i<10;i++)if(counts[i]>0)list.push({type:i,order:0});
    for(let layer=1;layer<8&&list.length<MAX_ACTORS;layer++){
      for(let i=0;i<10&&list.length<MAX_ACTORS;i++)if(counts[i]>layer&&layer<(i===0?8:i===3?4:6))list.push({type:i,order:layer});
    }
    actors=list.map(({type,order})=>({type,order,key:type*17+order,phase:seed(type*17+order+50)*Math.PI*2,nextWork:time+.5+seed(type*17+order+91)*6}));
  }
  function actorPosition(actor){
    const anchor=ANCHORS[actor.type],j=actor.order;
    const active=!reduced&&total>0,t=active?time:0;
    const behind=j?Math.ceil(j/2)*(j%2?-7:7):0;
    let x=anchor.x+behind,y=anchor.y-(j?3+Math.floor(j/2)*3:0),size=anchor.size*(j?.76:1);
    if(actor.type===0){
      const angle=t*.52+actor.phase;x=335+Math.cos(angle)*(25+j*2);y=329+Math.sin(angle)*(9+j*1.5)-j*2;size=24+(j===0?4:0);
    }else if([1,2,3,5].includes(actor.type)){
      x+=active?Math.sin(t*(actor.type===3?.38:.68)+actor.phase)*(actor.type===3?5:1.8):0;
      y+=active?Math.sin(t*1.7+actor.phase)*1.1:0;
    }else if(actor.type===7)y+=active?Math.sin(t+actor.phase)*1.6:0;
    return {x,y,size};
  }
  function actorTask(actor){return TASKS[actor.type][Math.floor(time/(7+actor.type)+actor.phase)%TASKS[actor.type].length];}
  function drawActors(){
    hitAreas=[];
    const positioned=actors.map(actor=>({...actor,...actorPosition(actor)})).sort((a,b)=>a.y-b.y||b.order-a.order);
    for(const actor of positioned){
      const {x,y,size,type,order}=actor;
      ellipse(x,y+1,size*.29,3+size*.025,'rgba(3,20,29,.28)');
      if(type===6){glow(x,y-size*.55,size*.75,'#e05b61',order?.04:.12);}
      if(type===7){
        ctx.save();ctx.translate(x,y-size*.49);ctx.rotate(!reduced?time*.23+order*.9:order*.9);
        imageAt(type,0,size*.49,size,order?.52:1);ctx.restore();
      }else imageAt(type,x,y,size,order?.79:1);
      if(type===8&&order===0){
        const angle=!reduced?time*.6:0;
        line([[x,y-size*.54],[x+Math.sin(angle)*8,y-size*.54-Math.cos(angle)*8]],'#ede3ba',1);
      }
      if([1,2,5].includes(type)&&order===0){
        const py=y-8+Math.sin(time*2+actor.phase)*.6;
        line([[x+13,py],[x+19,py-7]],'#d8bf7d',1.5);
        if(total>0&&Math.sin(time*2+actor.phase)>.85)text('·',x+12,py-3,9,'#b6d1c9');
      }
      // Only a few foreground helpers get short chalk notes, avoiding visual noise.
      if(order===0&&[1,3,5].includes(type)&&!reduced){
        const phase=(time+actor.phase*2)%12;
        if(phase>1&&phase<3.6){
          const alpha=Math.min(1,(phase-1)*3,(3.6-phase)*3);ctx.save();ctx.globalAlpha=alpha;
          rounded(x-10,y-size-23,48,19,5,'#e7e2c9');
          polygon([[x+4,y-size-4],[x+11,y-size-4],[x+5,y-size+1]],'#e7e2c9');
          text(type===1?'2 + 2 = 4':type===3?'не забудь C':'∫ → ∞',x+14,y-size-10,8,'#345158','monospace','center');ctx.restore();
        }
      }
      const natural=images[type],aspect=natural.naturalWidth&&natural.naturalHeight?natural.naturalWidth/natural.naturalHeight:1;
      hitAreas.push({actor,x,y,size,w:Math.min(size*aspect,size*1.62)});
    }
  }
  function spawnParticle(x,y,key,manual=false){
    if(particles.length>=MAX_PARTICLES)particles.shift();
    const n=seed(key+time*17),destination=manual?{x:x+(n-.5)*145,y:y-30-n*42}:REACTOR;
    particles.push({x,y,toX:destination.x,toY:destination.y,cx:(x+destination.x)/2+(n-.5)*78,cy:Math.min(y,destination.y)-28-n*36,born:time,duration:manual?.65+n*.4:1.5+n*1.4,glyph:GLYPHS[Math.floor(n*GLYPHS.length)],manual});
  }
  function animateTasks(){
    let spawned=0;
    for(const actor of actors)if(time>=actor.nextWork){
      actor.nextWork=time+6+seed(actor.key+time)*8;
      if(spawned++<2){const p=actorPosition(actor);spawnParticle(p.x,p.y-p.size*.6,actor.key);}
    }
    particles=particles.filter(p=>time-p.born<p.duration);
    waves=waves.filter(w=>time-w.born<.9);
  }
  function drawParticles(){
    for(const p of particles){
      const t=clamp((time-p.born)/p.duration,0,1),u=1-t;
      const x=u*u*p.x+2*u*t*p.cx+t*t*p.toX,y=u*u*p.y+2*u*t*p.cy+t*t*p.toY;
      const alpha=Math.min(1,t*6,(1-t)*5);ctx.save();ctx.globalAlpha=alpha*.91;
      glow(x,y,12,tint(77),.34);text(p.glyph,x,y,10+(p.manual?2:0),p.manual?'#f8e5ad':'#c3f4ed','Georgia, serif','center');ctx.restore();
      if(!p.manual&&t>.86)glow(REACTOR.x,REACTOR.y,44,tint(81),(1-t)*.65);
    }
    for(const wave of waves){
      const t=clamp((time-wave.born)/.9,0,1);ctx.beginPath();ctx.ellipse(wave.x,wave.y,12+t*85,8+t*49,-.12,0,Math.PI*2);ctx.strokeStyle=tint(84,(1-t)*.48);ctx.lineWidth=1.6-t;ctx.stroke();
    }
  }
  function draw(){
    if(destroyed||width<=0||height<=0)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0c263b';ctx.fillRect(0,0,width,height);
    ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);
    background();const floors=floorCount();
    ctx.save();ctx.beginPath();ctx.rect(0,0,WIDTH,HEIGHT);ctx.clip();
    ctx.translate(WIDTH/2,HEIGHT/2);ctx.scale(cameraZoom,cameraZoom);ctx.translate(-WIDTH/2,-cameraY);
    ellipse(238,386,197,15,'rgba(2,15,24,.45)');
    for(let i=0;i<floors;i++)room(i);
    roof(floors);extensions();reactor();drawActors();drawParticles();
    ctx.restore();
    if(!total){
      text('z',188,149,9,'#adbfba','serif');text('z',195,142,7,'#7d999c','serif');
      text('Первая идея разбудит мастерскую',220,411,10,'#8ca7ae','sans-serif','center');
    }else{
      text('МАСТЕРСКАЯ БЕСКОНЕЧНОСТИ',220,408,8,'#90a9ae','sans-serif','center');
    }
    ctx.setTransform(1,0,0,1,0,0);
  }
  function loop(timestamp){
    frame=0;if(!canAnimate())return;
    const elapsed=timestamp-lastFrame;
    if(elapsed>=FRAME_MS-.4){time+=Math.min(elapsed/1000,.12);lastFrame=timestamp;cameraZoom+=(targetZoom-cameraZoom)*.14;cameraY+=(targetY-cameraY)*.14;animateTasks();draw();}
    frame=requestAnimationFrame(loop);
  }
  function schedule(){
    if(canAnimate()){if(!frame){lastFrame=performance.now();frame=requestAnimationFrame(loop);}}
    else if(frame){cancelAnimationFrame(frame);frame=0;}
  }
  function resize(){
    if(destroyed)return;
    const box=canvas.getBoundingClientRect();width=Math.max(1,box.width||WIDTH);height=Math.max(1,box.height||HEIGHT);
    dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    scale=Math.min(width/WIDTH,height/HEIGHT);offsetX=(width-WIDTH*scale)/2;offsetY=(height-HEIGHT*scale)/2;
    draw();schedule();
  }
  function update(state,options={}){
    if(destroyed)return;
    const next=Array.from({length:10},(_,i)=>Number.isFinite(state?.generators?.[i])?Math.max(0,Math.floor(state.generators[i])):0);
    const changed=next.some((n,i)=>n!==counts[i]);
    const nextPrestige=Number.isFinite(state?.prestige)?Math.max(0,state.prestige):0;
    let nextHue=Number(options.hue);if(!Number.isFinite(nextHue))nextHue=206+Math.min(65,Math.log2(nextPrestige+1)*5);
    nextHue=((nextHue%360)+360)%360;
    const nextAccent=typeof options.accent==='string'&&options.accent.length<90?options.accent:'#9ae4ed';
    const colorChanged=nextHue!==hue||nextAccent!==accent||nextPrestige!==prestige;
    if(changed){
      counts=next;total=counts.reduce((sum,n)=>sum+n,0);highest=counts.findLastIndex(n=>n>0);buildActors();
      const floors=floorCount();targetZoom=floors===1?1.28:floors===2?1.12:1;targetY=floors===1?276:floors===2?254:210;
      if(reduced||!total||manualPaused||document.hidden||!inView){cameraZoom=targetZoom;cameraY=targetY;}
      if(!total){particles=[];waves=[];}
    }
    hue=nextHue;accent=nextAccent;prestige=nextPrestige;
    if(changed||colorChanged){draw();schedule();}
  }
  function burst(x,y){
    if(destroyed||manualPaused||document.hidden||!inView)return;
    const point=Number.isFinite(x)&&Number.isFinite(y)?toWorld(x,y):REACTOR;
    const origin={x:clamp(point.x,0,WIDTH),y:clamp(point.y,0,HEIGHT)};
    if(reduced||!total){
      flash=.45;draw();clearTimeout(flashTimer);flashTimer=setTimeout(()=>{flash=0;if(!destroyed)draw();},160);return;
    }
    if(waves.length>=5)waves.shift();waves.push({x:origin.x,y:origin.y,born:time});
    for(let i=0;i<5;i++)spawnParticle(origin.x,origin.y,i+time*81,true);
    draw();schedule();
  }
  function pointer(event){
    if(destroyed||typeof onInspect!=='function')return;
    const now=performance.now();if(now-lastInspection<150)return;
    const rect=canvas.getBoundingClientRect(),{x,y}=toWorld(event.clientX-rect.left,event.clientY-rect.top);
    const hit=hitAreas.findLast(area=>x>=area.x-area.w*.55&&x<=area.x+area.w*.55&&y>=area.y-area.size&&y<=area.y+5);
    if(hit){lastInspection=now;const i=hit.actor.type;onInspect({generatorIndex:i,name:GENERATORS[i].name,count:counts[i],task:actorTask(hit.actor)});}
  }
  function visibility(){schedule();if(!document.hidden&&!destroyed)draw();}
  function motionChanged(event){reduced=event.matches;if(reduced){particles=[];waves=[];cameraZoom=targetZoom;cameraY=targetY;}schedule();draw();}
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  const intersection=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    inView=!!entries[0]?.isIntersecting;schedule();if(inView)draw();
  },{rootMargin:'40px'}):null;
  resizeObserver?.observe(canvas);intersection?.observe(canvas);
  if(!resizeObserver)window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',visibility);motion?.addEventListener?.('change',motionChanged);canvas.addEventListener('click',pointer);
  resize();
  return {
    update,burst,resize,
    setPaused(value){manualPaused=!!value;schedule();if(!manualPaused)draw();},
    get paused(){return manualPaused||document.hidden||!inView;},
    destroy(){
      if(destroyed)return;destroyed=true;if(frame)cancelAnimationFrame(frame);frame=0;clearTimeout(flashTimer);
      resizeObserver?.disconnect();intersection?.disconnect();window.removeEventListener('resize',resize);
      document.removeEventListener('visibilitychange',visibility);motion?.removeEventListener?.('change',motionChanged);canvas.removeEventListener('click',pointer);
      for(const image of images){image.onload=null;image.onerror=null;}actors=[];particles=[];waves=[];hitAreas=[];
    },
  };
}
