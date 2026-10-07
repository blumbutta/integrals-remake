// Cosmetic milestones never change the economy. Peak records survive a prestige reset.
const safe=value=>Number.isFinite(value)&&value>0?value:0;
const generators=state=>Array.from({length:stages.length},(_,i)=>safe(state.generators?.[i]));
const totalGenerators=state=>generators(state).reduce((a,b)=>a+b,0);
const peakGenerators=state=>Math.max(totalGenerators(state),safe(state.achievementRecords?.maxGenerators));
const peakUpgrades=state=>Math.max(state.upgrades?.length||0,safe(state.achievementRecords?.maxUpgrades));
const peakCps=(state,stats)=>Math.max(safe(stats?.cps),safe(state.achievementRecords?.maxCps));
const clicks=state=>safe(state.clicks),earned=state=>safe(state.totalEarned),wins=state=>safe(state.eventStats?.wins),prestiges=state=>safe(state.prestigeCount);
const countText=value=>new Intl.NumberFormat('ru-RU').format(value);
const item=(id,icon,name,text,target,value)=>({id,icon,name,text,target,value});
const stages=[
  ['autoclick','Автоклик','↖','автокликов'],['abacus','Школьник','π','школьников'],
  ['calculator','Студент','Σ','студентов'],['algorithm','Преподаватель','⌘','преподавателей'],
  ['neuron','Компьютер','λ','компьютеров'],['quantum','Профессор','⟨⟩','профессоров'],
  ['singularity','Искусственный интеллект','ψ','систем ИИ'],['dimension','Портал','⊙','порталов'],
  ['universe','Машина времени','◇','машин времени'],['multiverse','Глубокая мысль','∞','Глубоких мыслей'],
  ['superintelligence','Сверхразум ИИ','✺','Сверхразумов ИИ'],
];

export const ACHIEVEMENTS=Object.freeze([
  // These twelve IDs remain valid in old saves; awarded badges are never revoked.
  item('first','∫','Первый принцип','Собрать первый интеграл',1,earned),
  item('click100','↖','Разминка для ума','Сделать 100 кликов',100,clicks),
  item('auto','⌘','Сила автоматизации','Приобрести первый генератор',1,peakGenerators),
  item('hundred','Σ','Сходится!','Получить 1 000 интегралов',1000,earned),
  item('team','π','Научное сообщество','Приобрести 25 генераторов одновременно',25,peakGenerators),
  item('research','⌁','Озарение','Завершить 3 исследования за цикл',3,peakUpgrades),
  item('speed','↗','Экспоненциальный рост','Производить 100 интегралов/с',100,peakCps),
  item('million','◇','Теория большого числа','Получить 1 миллион интегралов',1e6,earned),
  item('click1000','✦','Всё в ваших руках','Сделать 1 000 кликов',1000,clicks),
  item('prestige','∞','За пределами','Выполнить первое перерождение',1,prestiges),
  item('billion','⊙','Масштаб вселенной','Получить 1 миллиард интегралов',1e9,earned),
  item('all','ψ','Единая теория','Открыть все виды производства',stages.length,state=>stages.reduce((sum,_,i)=>sum+(Math.max(safe(state.generators?.[i]),safe(state.achievementRecords?.generators?.[i]))>0?1:0),0)),
  ...[
    [10,'Первые штрихи'],[500,'Ритм исследования'],[10_000,'Твёрдая рука'],[100_000,'Мастер повторения'],[1_000_000,'Миллион прикосновений'],
  ].map(([n,name])=>item('click'+n,'↖',name,`Сделать ${countText(n)} кликов`,n,clicks)),
  ...[
    [100,'Числа обретают вес'],[10_000,'Пять порядков'],[100_000,'Предел близко'],[1e7,'Семь нулей'],[1e8,'За горизонтом'],[1e10,'Новая величина'],[1e12,'Триллион возможностей'],[1e15,'Квадриллион решений'],
  ].map(([n,name])=>item('earned-'+n,'∫',name,`Получить ${countText(n)} интегралов за всё время`,n,earned)),
  ...[
    [1,'Тихий поток'],[10,'Уверенный темп'],[1000,'Тысяча в секунду'],[10_000,'Поток идей'],[100_000,'Вычислительный шторм'],[1e6,'Скорость мысли'],[1e7,'Непрерывная бесконечность'],
  ].map(([n,name])=>item('cps-'+n,'↗',name,`Достичь производства ${countText(n)} интегралов/с`,n,peakCps)),
  ...stages.flatMap(([id,name,icon,plural],index)=>[1,10,25,100].map(n=>item(
    `stage-${id}-${n}`,icon,`${name} · ${n===1?'начало':n===10?'команда':n===25?'отдел':'империя'}`,
    n===1?`Купить помощника «${name}»`:`Иметь ${n} ${plural} одновременно`,n,
    state=>Math.max(safe(state.generators?.[index]),safe(state.achievementRecords?.generators?.[index])),
  ))),
  ...[[1,'Любопытство'],[10,'Десять открытий'],[24,'Все грани знания'],[26,'Разум без границ']].map(([n,name])=>item('upgrades-'+n,'⌁',name,`Завершить ${n} исследований за один цикл`,n,peakUpgrades)),
  ...[[1,'Первое испытание'],[10,'Верные решения'],[50,'Мастер задач'],[100,'Безупречная практика']].map(([n,name])=>item('event-wins-'+n,'✓',name,`Победить в ${n} испытаниях`,n,wins)),
  ...[[2,'Вторая жизнь'],[5,'Пять начал'],[10,'Вечное возвращение'],[25,'За пределами циклов']].map(([n,name])=>item('prestige-runs-'+n,'∞',name,`Выполнить ${n} перерождений`,n,prestiges)),
  ...[[100,'Большая лаборатория'],[500,'Исследовательский город'],[1000,'Цивилизация науки']].map(([n,name])=>item('team-'+n,'π',name,`Иметь ${countText(n)} помощников одновременно`,n,peakGenerators)),
]);
const KNOWN_IDS=new Set(ACHIEVEMENTS.map(a=>a.id));
const knownPrestige=id=>/^prestige:[1-9]\d{0,15}$/.test(id)&&Number.isSafeInteger(Number(id.slice(9)));

export const COSMETICS=Object.freeze([
  {id:'classic',name:'Классическая лаборатория',description:'Оригинальная синяя лаборатория, дерево и белый интеграл.',colors:{accent:'#f17154',tint:'#221611',glow:'#f1715455'},pattern:'classic'},
  {id:'chalk',name:'Меловая доска',description:'Зелёная доска и светлые штрихи. Награда за 10 кликов.',requiredIds:['click10'],colors:{accent:'#b9e4bb',tint:'#102019',glow:'#b9e4bb44'},pattern:'chalk'},
  {id:'jade',name:'Нефритовый класс',description:'Свежая зелень первой школьной команды.',requiredIds:['stage-abacus-1'],colors:{accent:'#55d6a0',tint:'#0d201a',glow:'#55d6a055'},pattern:'leaves'},
  {id:'violet',name:'Фиолетовая геометрия',description:'Мягкий фиолетовый свет за 10 открытых достижений.',requiredCount:10,colors:{accent:'#b28cff',tint:'#1b1329',glow:'#b28cff55'},pattern:'lattice'},
  {id:'amber',name:'Янтарный импульс',description:'Солнечные лучи за 1 000 кликов.',requiredIds:['click1000'],colors:{accent:'#ffc45f',tint:'#251b0d',glow:'#ffc45f55'},pattern:'rays'},
  {id:'starfield',name:'Миллион звёзд',description:'Звёздное небо за первый миллион интегралов.',requiredIds:['million'],colors:{accent:'#91c6ff',tint:'#101a30',glow:'#91c6ff66'},pattern:'stars'},
  {id:'aurora',name:'Северное сияние',description:'Переливы полярного света за 10 побед в испытаниях.',requiredIds:['event-wins-10'],colors:{accent:'#6ce8d2',tint:'#101e29',glow:'#ad90ff66'},pattern:'aurora'},
  {id:'blueprint',name:'Чертёж бесконечности',description:'Новая система координат за первое перерождение.',requiredIds:['prestige'],colors:{accent:'#83bfff',tint:'#10233b',glow:'#83bfff55'},pattern:'blueprint'},
]);

export function collectAchievements(state,stats={}){
  const previous=state.achievementRecords&&typeof state.achievementRecords==='object'?state.achievementRecords:{};
  state.achievementRecords={
    generators:generators(state).map((value,i)=>Math.max(value,safe(previous.generators?.[i]))),
    maxGenerators:Math.max(totalGenerators(state),safe(previous.maxGenerators)),
    maxUpgrades:Math.max(state.upgrades?.length||0,safe(previous.maxUpgrades)),
    maxCps:Math.max(safe(stats?.cps),safe(previous.maxCps)),
  };
  const owned=new Set((Array.isArray(state.achievements)?state.achievements:[]).filter(id=>typeof id==='string'&&(KNOWN_IDS.has(id)||knownPrestige(id))));
  const unlocked=[];
  for(const a of ACHIEVEMENTS)if(!owned.has(a.id)&&a.value(state,stats)>=a.target){owned.add(a.id);unlocked.push(a.id);}
  state.achievements=[...owned];return unlocked;
}

export function cosmeticUnlocked(state,cosmeticId){
  const cosmetic=typeof cosmeticId==='string'?COSMETICS.find(c=>c.id===cosmeticId):COSMETICS.find(c=>c.id===cosmeticId?.id);
  if(!cosmetic)return false;
  const owned=new Set(Array.isArray(state?.achievements)?state.achievements:[]);
  return (cosmetic.requiredIds||[]).every(id=>owned.has(id))&&(!cosmetic.requiredCount||ACHIEVEMENTS.filter(a=>owned.has(a.id)).length>=cosmetic.requiredCount);
}

const normalizeCount=value=>Number.isFinite(value)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(value))):0;
const PRESTIGE_DIRECTIONS=[
  {name:'Коралловая орбита',pattern:'rings',hue:16},
  {name:'Аметистовая решётка',pattern:'lattice',hue:274},
  {name:'Лазурное созвездие',pattern:'stars',hue:207},
  {name:'Золотой рассвет',pattern:'rays',hue:42},
  {name:'Полярная волна',pattern:'aurora',hue:164},
  {name:'Серебряный спутник',pattern:'orbit',hue:226},
  {name:'Рубиновый кристалл',pattern:'crystal',hue:345},
  {name:'Фиолетовая интерференция',pattern:'wave',hue:298},
];
export function prestigeAppearance(value){
  const count=normalizeCount(value);
  if(count===0)return {id:'classic',name:COSMETICS[0].name,achievementTitle:'Первое начало',...COSMETICS[0].colors,pattern:'classic',hue:16,rings:3,rotation:0,frequency:3,variant:'0',run:0};
  const direction=PRESTIGE_DIRECTIONS[count-1]||{name:`Спектр бесконечности · ${count}`,pattern:PRESTIGE_DIRECTIONS[(count-1)%PRESTIGE_DIRECTIONS.length].pattern};
  // A golden-angle rotation avoids repeating a small fixed colour cycle.
  const hue=direction.hue??((count*137.50776405003785)%360);
  return {id:`prestige:${count}`,name:direction.name,achievementTitle:`Перерождение №${count} · ${direction.name}`,accent:`hsl(${hue} 82% 72%)`,tint:`hsl(${hue} 42% 10%)`,glow:`hsl(${(hue+37)%360} 88% 70% / .35)`,pattern:direction.pattern,hue,rings:3+(count%11),rotation:(count*17.32050807568877)%360,frequency:3+(count%17),variant:count.toString(36),run:count};
}

export function getPrestigeHonors(value,{offset=0,limit=100}={}){
  const count=normalizeCount(value),start=Math.min(count,normalizeCount(offset)),size=Math.min(100,normalizeCount(limit),count-start);
  return Array.from({length:size},(_,index)=>{
    const run=start+index+1,appearance=prestigeAppearance(run);
    return {id:`prestige:${run}`,name:appearance.achievementTitle,icon:'∞',text:`Завершено перерождение №${run}. Открыт облик «${appearance.name}».`,run,appearance};
  });
}
