import {GENERATORS} from './shared/economy.mjs';

const W=1200,H=760,ACTOR_LIMIT=45,PARTICLE_LIMIT=70,FRAME_MS=1000/30;
const HUB={x:592,y:533},HOLE={x:651,y:125};
const FILES=['cursoricon.png','grandmaIcon.png','farmIcon.png','factoryIcon.png','mineIcon.png','shipmentIcon.png','alchemylabIcon.png','portalIcon.png','timemachineIcon.png','antimattercondenserIcon.png'];
const LOCATIONS=[
  {id:'school',name:'Школа',generatorIndices:[1,3],x:207,y:412,bounds:[68,279,283,233],label:[207,538],unlock:'Школьник · преподаватель'},
  {id:'university',name:'Университет',generatorIndices:[2,5],x:447,y:286,bounds:[316,176,260,203],label:[447,400],unlock:'Студент · профессор'},
  {id:'computing',name:'Вычислительный квартал',generatorIndices:[4,6],x:877,y:460,bounds:[741,326,286,224],label:[890,579],unlock:'Компьютер · искусственный интеллект'},
  {id:'portals',name:'Портальные острова',generatorIndices:[7],x:967,y:147,bounds:[867,52,227,187],label:[979,262],unlock:'Откройте портал'},
  {id:'observatory',name:'Обсерватория времени',generatorIndices:[8],x:688,y:231,bounds:[582,115,233,204],label:[697,331],unlock:'Машина времени'},
  {id:'thought',name:'Башня Глубокой мысли',generatorIndices:[9],x:1100,y:367,bounds:[1039,271,143,185],label:[1100,485],unlock:'Глубокая мысль'},
];
const HOMES=[{x:585,y:544,size:30},{x:167,y:493,size:47},{x:408,y:353,size:51},{x:267,y:480,size:65},{x:823,y:525,size:48},{x:491,y:350,size:51},{x:958,y:495,size:42},{x:967,y:167,size:77},{x:687,y:235,size:55},{x:1101,y:370,size:75}];
const TASKS=[['Собирает новую идею','Доставляет интегралы в центр'],['Решает домашнее задание','Считает пример в тетради'],['Готовится к сессии','Ищет первообразную'],['Объясняет решение у доски','Проверяет школьные работы'],['Вычисляет численный интеграл','Обрабатывает новые данные'],['Доказывает новую теорему','Читает научный доклад'],['Обучает математическую модель','Сопоставляет закономерности'],['Принимает идеи другого измерения','Стабилизирует портал'],['Возвращает вычисления из будущего','Сверяет научное время'],['Ищет главный ответ','Размышляет о бесконечности']];
const GLYPHS=['∫','x²','+ C','Σ','dx','π','λ','∞'];
const seed=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};

/** A canvas-only map. update() copies state and never mutates the game or its DOM. */
export function createLabWorld(canvas,{onInspect,onLocation}={}){
  const ctx=canvas?.getContext?.('2d',{alpha:false});
  if(!ctx)return {update(){},burst(){},setPaused(){},get paused(){return true;},resize(){},destroy(){},playPrestige(){return Promise.resolve();},finishPrestige(){}};
  let destroyed=false,manualPaused=false,inView=true,raf=0,lastFrame=0,time=0;
  let width=W,height=H,dpr=1,scale=1,ox=0,oy=0,flash=0,flashTimer=0,lastInspection=-Infinity;
  let actors=[],particles=[],waves=[],hitAreas=[],cinema=null;
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');let reduced=!!media?.matches;
  const snapshot=(state={},options={})=>{
    const counts=Array.from({length:10},(_,i)=>Number.isFinite(state.generators?.[i])?Math.max(0,Math.floor(state.generators[i])):0);
    const prestige=Number.isFinite(state.prestige)?Math.max(0,state.prestige):0;
    const hue=Number.isFinite(Number(options.hue))?((Number(options.hue)%360)+360)%360:206+Math.min(65,Math.log2(prestige+1)*5);
    return {counts,prestige,hue,accent:typeof options.accent==='string'?options.accent:'#a8f4ef',total:counts.reduce((a,b)=>a+b,0)};
  };
  let latest=snapshot(),shown=latest;
  const images=FILES.map(file=>{const image=new Image();image.decoding='async';image.onload=image.onerror=()=>{if(!destroyed)draw();};image.src=new URL(`./assets/original/${file}`,import.meta.url).href;return image;});
  const tint=(light=70,alpha=1,hue=shown.hue)=>`hsla(${hue},65%,${light}%,${alpha})`;
  const available=l=>l.generatorIndices.some(i=>shown.counts[i]>0);
  function rr(x,y,w,h,r,fill,stroke,lw=1){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
  function poly(points,fill,stroke,lw=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
  function line(points,color,lw=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.stroke();}
  function ellipse(x,y,rx,ry,fill,stroke,lw=1){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
  function text(value,x,y,size=13,color='#d6e4df',font='sans-serif',align='left'){ctx.fillStyle=color;ctx.font=`${size}px ${font}`;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(value,x,y);}
  function glow(x,y,r,color,alpha=.2){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();}
  function imageAt(type,x,y,size,alpha=1,angle=0){
    const image=images[type];ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(angle);
    if(image.complete&&image.naturalWidth){const w=Math.min(size*image.naturalWidth/image.naturalHeight,size*1.62);ctx.drawImage(image,-w/2,-size,w,size);}else text(['↖','π','Σ','λ','⌘','∫','●','◉','◷','∞'][type],0,-size*.15,size*.7,tint(82),'Georgia, serif','center');ctx.restore();
  }
  function progress(){return cinema?clamp((performance.now()-cinema.started)/cinema.duration,0,1):0;}
  function object(x,y,key,paint){
    const p=progress();ctx.save();
    if(cinema&&!cinema.reduced&&p<.84){
      const delay=.16+seed(key+71)*.19,t=smooth((p-delay)/(.78-delay));
      if(t>=.998){ctx.restore();return;}
      const bend=Math.sin(t*Math.PI)*(key%2?70:-70),nx=x+(HOLE.x-x)*t+bend,ny=y+(HOLE.y-y)*t-Math.sin(t*Math.PI)*40;
      ctx.translate(nx,ny);ctx.rotate(Math.pow(t,1.7)*(key%2?1.15:-1.15));ctx.scale(Math.pow(1-t,1.25),Math.pow(1-t,1.25));ctx.translate(-x,-y);ctx.globalAlpha=1-Math.pow(t,5);
    }else if(cinema&&p>=.84){const a=smooth((p-.84)/.14);ctx.globalAlpha=a;ctx.translate(x,y);ctx.scale(.94+.06*a,.94+.06*a);ctx.translate(-x,-y);}
    paint();ctx.restore();
  }
  function landLayer(x,y,delay,end,paint){
    ctx.save();const p=progress();
    if(cinema&&!cinema.reduced&&p<.84){
      const t=smooth((p-delay)/(end-delay));
      if(t>=.998){ctx.restore();return;}
      // The whole physical surface moves, so its roads and river remain attached.
      ctx.translate(x+(HOLE.x-x)*t,y+(HOLE.y-y)*t);
      ctx.rotate(-t*.24);ctx.scale(Math.pow(1-t,1.45),Math.pow(1-t,1.15));
      ctx.translate(-x,-y);ctx.globalAlpha*=1-Math.pow(t,3);
    }else if(cinema&&p>=.84){
      const reveal=smooth((p-.84)/.14);ctx.globalAlpha*=reveal;
      ctx.translate(x,y);ctx.scale(.94+.06*reveal,.94+.06*reveal);ctx.translate(-x,-y);
    }
    paint();ctx.restore();
  }
  function sky(){
    const p=progress(),space=cinema&&!cinema.reduced?(p<.84?smooth((p-.28)/.46):1-smooth((p-.84)/.14)):0;
    const groundColor=`rgb(${Math.round(36-30*space)},${Math.round(71-49*space)},${Math.round(63-22*space)})`;
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#061629');g.addColorStop(.4,'#18374b');g.addColorStop(1,groundColor);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    glow(680,200,430,tint(38),.13);glow(265,149,265,'#91afad',.06);
    for(let i=0;i<125;i++){const x=seed(i+8)*W,y=seed(i+37)*370,r=i%17===0?1.5:.6;ellipse(x,y,r,r,`rgba(215,237,230,${.15+seed(i+73)*.42+(reduced?0:Math.sin(time*.5+i)*.06)})`);}
    glow(110,92,67,'#b6d7d7',.12);ellipse(110,92,26,26,'#d0d6c0');ellipse(121,84,24,25,'#11263a');
    landLayer(600,480,.28,.75,()=>{
      for(let layer=0;layer<3;layer++){const y=235+layer*40,points=[[0,H],[0,y+30]];for(let x=0;x<=W;x+=65)points.push([x,y-25-seed(x+layer*83)*75]);points.push([W,H]);poly(points,['#163447','#1d404d','#285057'][layer]);}
    });
    if(shown.total&&!reduced&&!cinema){const phase=(time+9)%31;if(phase<1.3){const x=230+phase*390,y=49+phase*82;line([[x-78,y-19],[x,y]],'rgba(206,243,241,.35)',1);glow(x,y,12,'#cafff4',.27);}}
    // Faint constellations keep the sky spacious without being an empty block.
    const points=[[457,65],[489,36],[532,56],[547,91],[515,113]];line(points,'rgba(162,208,210,.11)',.8);for(const [x,y]of points)ellipse(x,y,1.4,1.4,'#8aa9b5');
  }
  function terrain(){
    poly([[0,428],[153,366],[288,397],[439,325],[647,355],[782,309],[982,359],[1200,425],[1200,760],[0,760]],'#244944');
    poly([[0,567],[123,472],[327,471],[520,424],[654,443],[781,400],[1002,462],[1200,491],[1200,760],[0,760]],'#2b5145');
    poly([[0,671],[203,611],[348,655],[595,596],[785,667],[1056,607],[1200,641],[1200,760],[0,760]],'#2b4c3d');
    const routes=[[[150,493],[315,550],[453,481],[HUB.x,HUB.y]],[[437,343],[480,414],[511,487],[HUB.x,HUB.y]],[[HUB.x,HUB.y],[741,606],[849,560],[951,520]],[[701,267],[679,351],[727,406],[808,480]],[[971,508],[1034,459],[1060,410],[1102,399]]];
    for(const route of routes){ctx.beginPath();ctx.moveTo(...route[0]);ctx.bezierCurveTo(...route[1],...route[2],...route[3]);ctx.lineWidth=27;ctx.strokeStyle='#183a36';ctx.stroke();ctx.lineWidth=19;ctx.strokeStyle='#819281';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='rgba(204,210,165,.36)';ctx.setLineDash([3,8]);ctx.stroke();ctx.setLineDash([]);}
    // River beneath the island and small pedestrian bridges.
    ctx.beginPath();ctx.moveTo(930,760);ctx.bezierCurveTo(795,657,1041,664,1080,568);ctx.bezierCurveTo(1118,480,1183,497,1223,528);ctx.strokeStyle='#142f38';ctx.lineWidth=65;ctx.stroke();ctx.strokeStyle='#35636a';ctx.lineWidth=47;ctx.stroke();
    for(let i=0;i<13;i++){const x=990+Math.sin(i*1.2)*48,y=584+i*13;line([[x,y],[x+19,y-2]],'rgba(151,208,202,.14)',1);}
    for(let i=0;i<7;i++)line([[1043+i*5,602-i*2],[1065+i*5,622-i*2]],'#bba875',4);
    // Grass and stones are deterministic and do not allocate during a frame.
    for(let i=0;i<76;i++){const x=20+seed(i+803)*1160,y=425+seed(i+913)*315;if(y>700||x<53||x>1150||seed(i+71)>.47){line([[x-2,y],[x-4,y-5],[x,y-2],[x+3,y-7]],'rgba(135,167,111,.3)',1);}}
  }
  function spaceDust(){
    const p=progress();
    if(cinema&&!cinema.reduced&&p>.35&&p<.84){
      for(let i=0;i<23;i++){const startX=seed(i+482)*W,startY=310+seed(i+593)*450,t=clamp((p-.27-seed(i)*.12)/.44,0,1);const x=startX+(HOLE.x-startX)*t,y=startY+(HOLE.y-startY)*t;glow(x,y,5,tint(81),.3);line([[x+(startX-x)*.06,y+(startY-y)*.06],[x,y]],tint(74,.35),1);}
    }
  }
  function tree(x,y,size=1,key=0){object(x,y,key+600,()=>{ellipse(x,y+2,16*size,5*size,'rgba(6,26,29,.25)');line([[x,y],[x,y-27*size]],'#675740',5*size);ellipse(x-7*size,y-33*size,15*size,19*size,'#1d4440');ellipse(x+6*size,y-39*size,17*size,21*size,'#346450');ellipse(x,y-53*size,13*size,15*size,'#467355');});}
  function nature(){
    const trees=[[39,555,1.15],[67,580,.75],[322,604,1.1],[355,622,.8],[743,629,1.1],[778,649,.8],[1068,524,.65],[1163,569,1.1],[84,366,.8],[290,282,.9],[566,379,.75],[812,294,.75],[758,322,.7],[36,643,.95],[475,694,.65]];
    trees.forEach(([x,y,s],i)=>tree(x,y,s,i));
    for(const [x,y]of [[311,512],[477,440],[739,558],[779,387],[1038,462]])object(x,y,800+x,()=>{line([[x,y],[x,y-27]],'#213734',3);glow(x,y-31,25,'#f3cf82',.18);rr(x-4,y-38,8,11,3,'#e6c27e','#837459');ellipse(x,y+2,5,2,'#1d3c34');});
  }
  function pad(x,y,w,h){ellipse(x,y+6,w*.55,h*.52,'rgba(7,27,30,.28)');poly([[x-w/2,y-h/2],[x+w*.39,y-h/2],[x+w/2,y+h*.25],[x-w*.4,y+h/2]],'#5f7666','#92a18b',1);}
  function windowPane(x,y,w,h,lit=true){rr(x,y,w,h,Math.min(5,w/3),lit?'#d8c18a':'#24434b','#76928b',1);if(lit)glow(x+w/2,y+h/2,Math.max(w,h),'#edd8a1',.04);line([[x+w/2,y+2],[x+w/2,y+h-2]],'#42544e',1);}
  function school(){
    pad(207,493,262,73);
    rr(91,359,224,115,2,'#b8ae84','#526056',2);poly([[315,359],[338,377],[338,482],[315,474]],'#7d866c');
    poly([[74,360],[204,301],[327,360]],'#3f6664','#8eaaa0',2);poly([[204,301],[221,303],[340,368],[327,360]],'#244b52');
    for(let i=0;i<5;i++)line([[102+i*24,348-i*10],[230+i*18,348+i*3]],'rgba(175,198,174,.12)',1);
    rr(190,331,26,30,12,'#274b51','#b2bfa5',2);ellipse(203,344,8,8,'#d8d3a6');text('∫',203,351,20,'#527173','Georgia, serif','center');
    for(const x of [110,147,237,274]){windowPane(x,383,24,31);windowPane(x,427,24,29);}
    rr(188,418,32,57,13,'#426468','#9fa882',2);line([[204,422],[204,475]],'#758a7b',1);ellipse(210,449,1.5,1.5,'#dcca8d');
    rr(165,477,79,7,2,'#9c9b7c');rr(155,484,99,7,2,'#788473');
    rr(96,407,217,5,1,'#8a9075');text('Ш К О Л А',203,379,9,'#426065','sans-serif','center');
    line([[321,418],[351,418]],'#50615a',2);rr(337,398,9,20,1,'#8ea995');
    // Outdoor homework desks and a blackboard: helpers actually have a workplace.
    poly([[122,485],[175,485],[185,495],[132,495]],'#b69562','#695e48');line([[136,494],[136,507]],'#66553e',4);line([[176,494],[176,506]],'#66553e',4);
    poly([[144,486],[161,486],[166,491],[149,491]],'#e9dfb9');
    rr(259,414,58,35,2,'#153e3c','#9d875d',3);text('a² + b²',288,435,12,'#d1dfc0','Georgia, serif','center');line([[267,450],[267,473]],'#998563',2);line([[307,450],[307,473]],'#998563',2);
  }
  function university(){
    pad(447,361,246,72);rr(343,237,204,105,2,'#abae9a','#6e877e',1.5);poly([[547,237],[569,252],[569,350],[547,341]],'#738f86');
    poly([[327,239],[445,188],[562,239]],'#94a59c','#c4cfb7',2);poly([[345,233],[446,198],[544,233]],'#314e58');text('Σ',446,227,29,'#c7d5ba','Georgia, serif','center');
    for(let i=0;i<6;i++){const x=360+i*31;rr(x,250,13,86,4,'#cad0b1','#819287');rr(x-3,248,19,5,1,'#dee0ba');rr(x-3,332,19,5,1,'#a6b194');}
    for(let i=0;i<5;i++)windowPane(377+i*31,258,15,31);rr(428,298,32,43,13,'#1f4850','#b3c0a2');
    for(let i=0;i<4;i++)rr(337-i*4,341+i*6,215+i*8,5,1,['#a3af96','#879e8d','#759381','#637f70'][i]);
    text('УНИВЕРСИТЕТ',445,246,8,'#d6dec4','sans-serif','center');
    rr(380,299,42,24,2,'#133f3e','#9b9c75',2);text('∫ x² dx',401,315,10,'#d0e5c4','Georgia, serif','center');
    poly([[477,340],[510,340],[517,347],[484,347]],'#b49668');line([[486,347],[486,361]],'#796544',4);line([[509,347],[509,360]],'#796544',4);
  }
  function computing(){
    pad(886,527,287,104);
    rr(764,393,131,112,5,'#6c9191','#adc9b8',2);poly([[895,393],[918,410],[918,517],[895,505]],'#476a72');
    poly([[753,393],[773,380],[894,380],[913,394]],'#9bb5a6');
    for(let row=0;row<3;row++)for(let col=0;col<5;col++)windowPane(776+col*23,407+row*25,15,16,(row+col)%3!==1);
    rr(809,473,29,33,3,'#214b56','#b3cec3');
    rr(930,417,66,88,7,'#4c777d','#90b8b8',2);poly([[996,417],[1014,429],[1014,515],[996,505]],'#305763');
    for(let i=0;i<6;i++){rr(939,429+i*10,47,4,1,'#213f4b');ellipse(981,431+i*10,1,1,tint(78));}
    ellipse(963,407,44,21,'#244551','#92b8b5',2);ellipse(963,389,36,33,'#38545e','#80a5a7',1.5);
    glow(963,384,48,shown.counts[6]?'#e0646b':tint(62),.13);ellipse(963,384,19,19,shown.counts[6]?'#5a232c':'#27424d','#a6c6bd');ellipse(961,379,6,6,shown.counts[6]?'#d86566':'#6d9297');
    text('COMPUTE',829,390,9,'#c7d4bd','monospace','center');
    line([[787,522],[845,522]],'#bfbea0',6);line([[795,522],[795,537]],'#526963',4);line([[837,522],[837,537]],'#526963',4);
    for(let i=0;i<4;i++)text(i%2?'1010':'0101',780,384-i*9,7,'#aac5bc','monospace');
  }
  function portal(){
    const bob=reduced?0:Math.sin(time*.5)*4;
    ctx.save();ctx.translate(0,bob);ellipse(974,261,65,8,'rgba(1,21,30,.12)');
    poly([[878,181],[917,158],[1035,158],[1073,190],[1034,236],[1005,219],[976,257],[939,220],[913,231]],'#3b4e58','#779998',1.5);
    poly([[878,181],[917,158],[1035,158],[1073,190],[1024,206],[922,202]],'#447366','#9abaa2',1.2);
    line([[942,203],[953,235],[976,257]],'#75979a',2);line([[1013,204],[1005,219]],'#87adb0',1.5);
    ellipse(967,172,54,17,'#264e56','#a3bbae',2);ellipse(967,163,39,12,'#7c9d91');
    glow(967,123,87,tint(63),.3);
    ctx.beginPath();ctx.ellipse(967,122,43,61,0,0,Math.PI*2);ctx.strokeStyle='#adc1ae';ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle=tint(73);ctx.lineWidth=3;ctx.stroke();
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2+(reduced?0:time*.15);ellipse(967+Math.cos(a)*43,122+Math.sin(a)*61,2.2,2.2,'#d4efe0');}
    poly([[1069,121],[1112,117],[1136,138],[1104,153],[1091,141]],'#4a736c','#93b9ae');poly([[1084,146],[1104,176],[1127,148]],'#334b59');
    line([[1058,179],[1078,152],[1100,141]],'rgba(162,217,216,.24)',1);ctx.restore();
  }
  function observatory(){
    pad(690,283,218,74);poly([[598,272],[615,248],[762,248],[790,280],[747,302],[620,296]],'#5e8072','#96ab8f');
    rr(624,195,125,77,4,'#8b9d8f','#bbcbb2',2);poly([[749,195],[767,207],[767,277],[749,272]],'#5e7e79');
    ctx.beginPath();ctx.ellipse(687,194,64,61,0,Math.PI,0);ctx.closePath();ctx.fillStyle='#698c88';ctx.fill();ctx.strokeStyle='#bdc5a3';ctx.lineWidth=2;ctx.stroke();
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.ellipse(687,194,Math.abs(i)*21+5,60,0,Math.PI,0);ctx.strokeStyle='rgba(194,205,169,.3)';ctx.lineWidth=1;ctx.stroke();}
    line([[687,134],[714,111]],'#b9c7b2',11);line([[709,110],[720,119]],'#435e6c',16);ellipse(717,110,6,3,'#cbddc9','#9eb8af');
    for(const x of [636,719])windowPane(x,217,20,35);rr(670,236,33,37,13,'#34545b','#b2b594',2);
    rr(625,194,124,7,2,'#c0b894');text('ΧΡΟΝΟΣ',686,207,8,'#c9d6c0','Georgia, serif','center');
    for(let i=0;i<3;i++)rr(653-i*5,270+i*6,68+i*10,5,1,'#93a387');
  }
  function thought(){
    pad(1100,426,116,56);poly([[1053,412],[1073,320],[1126,320],[1150,412]],'#3f6271','#8fa9b4',2);poly([[1083,322],[1094,281],[1112,281],[1121,322]],'#4e7283','#a8b7b5');
    for(let i=0;i<6;i++){line([[1066-i,401-i*12],[1136+i,401-i*12]],'#638b97',2);ellipse(1100,397-i*12,2,2,tint(78));}
    line([[1101,284],[1101,257]],'#b8cfd0',2);ellipse(1101,252,4,4,tint(82));glow(1101,280,49,tint(64),.2);
    for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(1100,302,41,9+i*4,-.25+i*.23,0,Math.PI*2);ctx.strokeStyle=tint(77,.35);ctx.lineWidth=1;ctx.stroke();}
  }
  const BUILDINGS=[school,university,computing,portal,observatory,thought];
  function buildings(){
    const p=progress();
    LOCATIONS.forEach((location,index)=>{
      const unlocked=available(location);object(location.x,location.y,index+1,()=>{
        ctx.save();if(!unlocked)ctx.globalAlpha*=.18;BUILDINGS[index]();ctx.restore();
        if(!cinema||p>.9){
          const [x,y]=location.label;rr(x-103,y-13,206,36,7,unlocked?'rgba(7,30,36,.8)':'rgba(9,30,36,.4)');
          text(location.name,x,y+1,12,unlocked?'#d4e2d4':'#8ba5a0','sans-serif','center');
          const count=location.generatorIndices.reduce((n,i)=>n+shown.counts[i],0);text(unlocked?`Помощников: ${count} · исследовать →`:location.unlock,x,y+15,8.5,unlocked?'#8db7ac':'#71918b','sans-serif','center');
        }
      });
    });
  }
  function reactor(){object(HUB.x,HUB.y,29,()=>{
    pad(592,562,151,61);ellipse(592,548,66,22,'#33564f','#94aa86',2);ellipse(592,539,51,18,'#839983','#b9c8a6');
    glow(592,494,95,tint(65),shown.total?.23:.06+flash*.3);
    const glass=ctx.createLinearGradient(560,0,622,0);glass.addColorStop(0,'#507a7d');glass.addColorStop(.4,'rgba(109,179,182,.14)');glass.addColorStop(1,'#284c60');
    rr(558,450,67,86,19,glass,'#a4bdb2',1.5);ellipse(592,454,33,10,'rgba(159,204,177,.1)','#b8c9a4');rr(575,442,34,7,2,'#bdc49d');
    line([[566,470],[566,518]],'rgba(226,255,225,.44)',2);
    ctx.save();ctx.shadowColor=shown.accent;ctx.shadowBlur=shown.total?15:0;text('∫',591,520,72,shown.total||flash?'#e2ffed':'#93b2aa','Georgia, serif','center');ctx.restore();
    line([[591,441],[591,428]],'#a4bdab',2);ellipse(591,425,4,4,tint(shown.total?82:45));
    for(let i=0;i<5;i++)ellipse(573+i*9,542,2,2,(i+Math.floor(time))%4===0?'#4d736f':tint(shown.total?76:46));
    text('ИСТОЧНИК ИНТЕГРАЛОВ',592,591,10,'#c0d4c4','sans-serif','center');
    if(!shown.total)text('Первая идея разбудит этот мир',592,608,10,'#87aaa0','sans-serif','center');
  });}
  function rebuildActors(){
    const list=[];for(let type=0;type<10;type++)if(shown.counts[type])list.push({type,order:0});
    for(let order=1;order<8&&list.length<ACTOR_LIMIT;order++)for(let type=0;type<10&&list.length<ACTOR_LIMIT;type++)if(shown.counts[type]>order&&order<(type===0?8:type>=6?3:6))list.push({type,order});
    actors=list.map(a=>({...a,key:a.type*17+a.order,phase:seed(a.type*17+a.order+53)*Math.PI*2,nextWork:time+.4+seed(a.type*17+a.order+9)*7}));
  }
  function actorPosition(actor){
    const h=HOMES[actor.type],n=actor.order,moving=!reduced,phase=actor.phase;
    let x=h.x+(n?Math.ceil(n/2)*(n%2?-12:12):0),y=h.y+(n?8+Math.floor(n/2)*8:0),size=h.size*(n?.78:1);
    if(actor.type===0){x=585+Math.cos((moving?time*.33:0)+phase)*(74+n*4);y=550+Math.sin((moving?time*.33:0)+phase)*24;}
    else if([1,2,3,5].includes(actor.type)){x+=moving?Math.sin(time*(n?.24:.45)+phase)*(n?12:2):0;y+=moving?Math.sin(time*(n?.4:1.4)+phase)*(n?4:.8):0;}
    else if(actor.type===7)y+=moving?Math.sin(time*.5)*4:0;
    return {x,y,size};
  }
  function drawActors(){
    hitAreas=[];
    const list=actors.map(a=>({...a,...actorPosition(a)})).sort((a,b)=>a.y-b.y||b.order-a.order);
    for(const a of list){
      const {x,y,size,type,order,key}=a;
      object(x,y,key+80,()=>{
        ellipse(x,y+2,size*.32,4,'rgba(4,25,27,.27)');
        if(type===7){ctx.save();ctx.translate(x,y-size*.5);ctx.rotate(reduced?0:time*.2+order);imageAt(type,0,size*.5,size,order?.65:1);ctx.restore();}
        else imageAt(type,x,y,size,order?.83:1);
        if(type===8&&order===0){const angle=reduced?0:time*.5;line([[x,y-size*.53],[x+Math.sin(angle)*9,y-size*.53-Math.cos(angle)*9]],'#f1e0af',1.5);}
        if(order===0&&[1,2,3,5].includes(type)&&!reduced&&!cinema){const phase=(time+a.phase)%14;if(phase>1&&phase<4){ctx.save();ctx.globalAlpha=Math.min(1,(phase-1)*2,4-phase);rr(x-20,y-size-24,61,20,5,'#dbe3ca');poly([[x,y-size-4],[x+8,y-size-4],[x+2,y-size+2]],'#dbe3ca');text(type===1?'2 + 2 = 4':type===3?'Проверь знак!':'∫ x² dx',x+10,y-size-10,9,'#3d6265','Georgia, serif','center');ctx.restore();}}
      });
      const image=images[type],ratio=image.naturalWidth/image.naturalHeight||1;hitAreas.push({actor:a,x,y,size,w:Math.min(size*ratio,size*1.62)});
    }
  }
  function spawnParticle(x,y,key,manual=false){
    if(particles.length>=PARTICLE_LIMIT)particles.shift();const n=seed(key+time*13);
    particles.push({x,y,toX:manual?x+(n-.5)*170:HUB.x,toY:manual?y-40-n*60:HUB.y-33,cx:manual?x+(n-.5)*110:(x+HUB.x)/2+(n-.5)*130,cy:Math.min(y,HUB.y)-45-n*76,born:time,duration:manual?.7+n*.6:2.4+n*1.7,glyph:GLYPHS[Math.floor(n*GLYPHS.length)],key});
  }
  function animate(){
    for(const a of actors)if(time>=a.nextWork){a.nextWork=time+7+seed(a.key+time)*9;if(!cinema){const p=actorPosition(a);spawnParticle(p.x,p.y-p.size*.7,a.key);}}
    particles=particles.filter(p=>time-p.born<p.duration);waves=waves.filter(w=>time-w.born<1.2);
  }
  function drawParticles(){
    for(const p of particles){const t=clamp((time-p.born)/p.duration,0,1),u=1-t,x=u*u*p.x+2*u*t*p.cx+t*t*p.toX,y=u*u*p.y+2*u*t*p.cy+t*t*p.toY;object(x,y,p.key+240,()=>{ctx.save();ctx.globalAlpha*=Math.min(1,t*5,(1-t)*4);glow(x,y,17,tint(78),.31);text(p.glyph,x,y,14,'#c7fbe5','Georgia, serif','center');ctx.restore();});}
    for(const w of waves){const t=clamp((time-w.born)/1.2,0,1);ctx.beginPath();ctx.ellipse(w.x,w.y,20+t*115,10+t*55,-.12,0,Math.PI*2);ctx.strokeStyle=tint(82,(1-t)*.43);ctx.lineWidth=1.5;ctx.stroke();}
  }
  function blackHole(){
    if(!cinema)return;const p=progress(),hue=cinema.hue;
    if(cinema.reduced){glow(HOLE.x,HOLE.y,220,tint(86,1,hue),.19);return;}
    const opening=smooth(p/.2),closing=1-smooth((p-.75)/.13),r=70*opening*closing;
    if(r>1){
      glow(HOLE.x,HOLE.y,r*2.4,tint(67,1,hue),.39*closing);
      for(let i=0;i<6;i++){ctx.save();ctx.translate(HOLE.x,HOLE.y);ctx.rotate(time*.27+i*.52);ctx.beginPath();ctx.ellipse(0,0,r*(1+i*.12),r*(.27+i*.027),0,0,Math.PI*2);ctx.strokeStyle=tint(70+i*3,.52-i*.045,hue+i*7);ctx.lineWidth=2.8-i*.3;ctx.stroke();ctx.restore();}
      ellipse(HOLE.x,HOLE.y,r*.83,r*.83,'#020711',tint(84,.95,hue),2);
      ctx.save();ctx.translate(HOLE.x,HOLE.y);ctx.rotate(-time*.4);ctx.beginPath();ctx.ellipse(0,0,r*1.5,r*.31,-.35,Math.PI,Math.PI*2);ctx.strokeStyle=tint(88,.85,hue);ctx.lineWidth=5;ctx.stroke();ctx.restore();
    }
    // The reveal is a light emitted by the hole, never a DOM/full-page overlay.
    const flare=Math.max(0,1-Math.abs(p-.83)/.055);
    if(flare){glow(HOLE.x,HOLE.y,130+flare*950,'#e8faff',flare*.82);}
    if(p>.84)glow(HOLE.x,HOLE.y,145,tint(84,1,latest.hue),(1-p)*1.8);
  }
  function draw(){
    if(destroyed)return;
    if(cinema&&progress()>=.84&&!cinema.revealed){cinema.revealed=true;shown=latest;rebuildActors();particles=[];waves=[];}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#071b2b';ctx.fillRect(0,0,width,height);ctx.translate(ox,oy);ctx.scale(scale,scale);
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();sky();landLayer(600,535,.37,.805,terrain);nature();buildings();reactor();drawActors();drawParticles();spaceDust();blackHole();
    if(cinema){const p=progress();text(p<.22?'Пространство начинает изгибаться…':p<.76?'Идеи возвращаются к истоку':p<.88?'За пределами бесконечности':'Новая вселенная. Новое начало.',600,724,17,'#d8e9e2','Georgia, serif','center');}
    else{text('АТЛАС БЕСКОНЕЧНОСТИ',38,716,12,'#a6c1b3','sans-serif');text('Нажмите на здание или помощника',38,737,10,'#739c91','sans-serif');text(shown.prestige?`ВСЕЛЕННАЯ · ${Math.floor(shown.prestige)}`:'ПЕРВАЯ ВСЕЛЕННАЯ',1160,731,10,'#8caeaa','sans-serif','right');}
    ctx.restore();ctx.setTransform(1,0,0,1,0,0);
  }
  const canAnimate=()=>!destroyed&&!manualPaused&&!document.hidden&&inView&&!reduced&&(shown.total>0||!!cinema);
  function loop(stamp){raf=0;if(!canAnimate())return;const delta=stamp-lastFrame;if(delta>=FRAME_MS-.4){time+=Math.min(delta/1000,.12);lastFrame=stamp;animate();draw();if(cinema&&progress()>=1){finishPrestige();return;}}raf=requestAnimationFrame(loop);}
  function schedule(){if(canAnimate()){if(!raf){lastFrame=performance.now();raf=requestAnimationFrame(loop);}}else if(raf){cancelAnimationFrame(raf);raf=0;}}
  function applyLatest(){shown=latest;rebuildActors();particles=[];waves=[];draw();schedule();}
  function update(state,options={}){
    if(destroyed)return;const next=snapshot(state,options),changed=next.counts.some((v,i)=>v!==latest.counts[i])||next.hue!==latest.hue||next.prestige!==latest.prestige||next.accent!==latest.accent;latest=next;
    if(!cinema&&changed)applyLatest();
  }
  function resize(){if(destroyed)return;const r=canvas.getBoundingClientRect();width=Math.max(1,r.width||W);height=Math.max(1,r.height||H);dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);scale=Math.min(width/W,height/H);ox=(width-W*scale)/2;oy=(height-H*scale)/2;draw();schedule();}
  function burst(x,y){
    if(destroyed||manualPaused||document.hidden||!inView||cinema)return;
    const p=Number.isFinite(x)&&Number.isFinite(y)?{x:(x-ox)/scale,y:(y-oy)/scale}:HUB;
    if(reduced||!shown.total){flash=.55;draw();clearTimeout(flashTimer);flashTimer=setTimeout(()=>{flash=0;if(!destroyed)draw();},160);return;}
    if(waves.length>=5)waves.shift();waves.push({...p,born:time});for(let i=0;i<5;i++)spawnParticle(p.x,p.y,i+time*19,true);draw();schedule();
  }
  function finishPrestige(){
    if(!cinema)return;const previous=cinema;cinema=null;clearTimeout(previous.timer);shown=latest;rebuildActors();particles=[];waves=[];flash=0;if(!destroyed){draw();schedule();}previous.resolve();
  }
  function playPrestige({state,durationMs=6500,hue}={}){
    finishPrestige();if(destroyed||document.hidden||manualPaused||!inView){if(!destroyed)applyLatest();return Promise.resolve();}
    const old=state?snapshot(state,{hue:Number.isFinite(Number(hue))?Number(hue):shown.hue,accent:shown.accent}):shown;shown=old;rebuildActors();waves=[];
    const duration=reduced?420:clamp(Number(durationMs)||6500,1200,15000);
    if(!reduced){
      if(!particles.length)for(const actor of actors.filter(a=>a.order===0)){const p=actorPosition(actor);spawnParticle(p.x,p.y-p.size*.6,actor.key);}
      for(const particle of particles){particle.born=time-.15;particle.duration=duration/1000;}
    }
    return new Promise(resolve=>{cinema={started:performance.now(),duration,hue:Number.isFinite(Number(hue))?Number(hue):275,reduced,resolve,revealed:false,timer:0};
      // Both a timer and visibility cleanup guarantee resolution when RAF is throttled.
      cinema.timer=setTimeout(finishPrestige,duration+20);draw();schedule();
    });
  }
  function pointer(event){
    if(destroyed||cinema)return;const now=performance.now();if(now-lastInspection<150)return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left-ox)/scale,y=(event.clientY-rect.top-oy)/scale;
    const hit=hitAreas.findLast(a=>x>=a.x-a.w*.55&&x<=a.x+a.w*.55&&y>=a.y-a.size&&y<=a.y+6);
    if(hit&&typeof onInspect==='function'){lastInspection=now;const i=hit.actor.type;onInspect({generatorIndex:i,name:GENERATORS[i].name,count:shown.counts[i],task:TASKS[i][Math.floor(time/8+hit.actor.phase)%TASKS[i].length]});return;}
    const location=LOCATIONS.findLast(l=>{const [bx,by,bw,bh]=l.bounds,[lx,ly]=l.label;return (x>=bx&&x<=bx+bw&&y>=by&&y<=by+bh)||(x>=lx-104&&x<=lx+104&&y>=ly-14&&y<=ly+24);});
    if(location&&typeof onLocation==='function'){lastInspection=now;onLocation({id:location.id,name:location.name,generatorIndices:[...location.generatorIndices]});}
  }
  function visibility(){if(document.hidden&&cinema)finishPrestige();schedule();if(!document.hidden)draw();}
  function pagehide(){finishPrestige();if(raf){cancelAnimationFrame(raf);raf=0;}}
  function motionChanged(event){reduced=event.matches;if(reduced){particles=[];waves=[];finishPrestige();}schedule();draw();}
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  const io=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{inView=!!entries[0]?.isIntersecting;if(!inView&&cinema)finishPrestige();schedule();if(inView)draw();},{rootMargin:'40px'}):null;
  ro?.observe(canvas);io?.observe(canvas);if(!ro)window.addEventListener('resize',resize);
  canvas.addEventListener('click',pointer);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);media?.addEventListener?.('change',motionChanged);resize();
  return {
    update,burst,resize,playPrestige,finishPrestige,
    setPaused(value){manualPaused=!!value;if(manualPaused&&cinema)finishPrestige();schedule();if(!manualPaused)draw();},
    get paused(){return manualPaused||document.hidden||!inView;},
    destroy(){if(destroyed)return;destroyed=true;finishPrestige();if(raf)cancelAnimationFrame(raf);raf=0;clearTimeout(flashTimer);ro?.disconnect();io?.disconnect();window.removeEventListener('resize',resize);window.removeEventListener('pagehide',pagehide);document.removeEventListener('visibilitychange',visibility);media?.removeEventListener?.('change',motionChanged);canvas.removeEventListener('click',pointer);for(const i of images)i.onload=i.onerror=null;actors=[];particles=[];waves=[];hitAreas=[];},
  };
}
