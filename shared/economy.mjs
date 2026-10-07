import { startEvent, answerEvent, settleEvent } from './events.mjs';
import { collectAchievements as unlockAchievements } from './achievements.mjs';

export const ECONOMY_VERSION = 2;
export const PRESTIGE_VERSION = 2;
export const MAX_PRESTIGE = 10;
export const MAX_OFFLINE_MS = 12 * 60 * 60 * 1000;
export const ACTIVE_GRACE_MS = 30_000;
export const GOLDEN_WINDOW_MS = 15_000;
export const PRESTIGE_PRICE = 999_999_999_999_999;
export const GENERATORS = Object.freeze([
  {id:'autoclick',name:'Автоклик',description:'Первый шаг к бесконечности.',basePrice:15,baseCps:0.25,icon:'⌁'},
  {id:'abacus',name:'Школьник',description:'Начинает с простых задач и не сдаётся.',basePrice:125,baseCps:2,icon:'⠿'},
  {id:'calculator',name:'Студент',description:'Интегрирует между парами и дедлайнами.',basePrice:1200,baseCps:14,icon:'▦'},
  {id:'algorithm',name:'Преподаватель',description:'Один пример превращает в целую лекцию.',basePrice:12000,baseCps:100,icon:'⌘'},
  {id:'neuron',name:'Компьютер',description:'Считает, пока лаборатория отдыхает.',basePrice:160000,baseCps:800,icon:'⟁'},
  {id:'quantum',name:'Профессор',description:'Находит решение там, где кончаются учебники.',basePrice:2300000,baseCps:7000,icon:'⊙'},
  {id:'singularity',name:'Искусственный интеллект',description:'Учится интегрировать быстрее самого себя.',basePrice:40000000,baseCps:70000,icon:'◉'},
  {id:'dimension',name:'Портал',description:'Доставляет интегралы из другого измерения.',basePrice:700000000,baseCps:900000,icon:'◇'},
  {id:'universe',name:'Машина времени',description:'Будущие вычисления уже готовы сегодня.',basePrice:14000000000,baseCps:12000000,icon:'✧'},
  {id:'multiverse',name:'Глубокая мысль',description:'Ищет главный ответ среди бесконечных чисел.',basePrice:300000000000,baseCps:200000000,icon:'∞'},
  {id:'superintelligence',name:'Сверхразум ИИ',description:'Открывает математику за пределами человеческого воображения.',basePrice:10_000_000_000_000,baseCps:8_000_000_000,icon:'✺'},
]);
// Manual play stays relevant at every scale; research adds percentage points.
export const BASE_CLICK_PRODUCTION_SHARE = 0.05;
export const MAX_CLICK_PRODUCTION_SHARE = 0.20;
const TEAMWORK_LIMIT = 0.20;
const TEAMWORK_HALF_SIZE = 100;
const RESEARCH_TIERS = [
  {level:3,amount:50,priceFactor:500,multiplier:3,name:'Новый метод'},
  {level:4,amount:75,priceFactor:8000,multiplier:4,name:'Прорыв'},
  {level:5,amount:100,priceFactor:120000,multiplier:6,name:'Большая теория'},
  {level:6,amount:150,priceFactor:30000000,multiplier:10,name:'Научная школа'},
];
export const UPGRADES = Object.freeze([
  {id:'click-1',name:'Острый карандаш',description:'Сила клика ×2.',price:100,target:'click',multiplier:2,requirement:{type:'clicks',amount:25}},
  {id:'click-2',name:'Быстрая мысль',description:'Сила клика ×2.',price:1500,target:'click',multiplier:2,requirement:{type:'clicks',amount:150}},
  {id:'click-3',name:'Поток сознания',description:'Сила клика ×2.',price:25000,target:'click',multiplier:2,requirement:{type:'clicks',amount:500}},
  {id:'click-4',name:'Чистая математика',description:'Сила клика ×2.',price:1000000,target:'click',multiplier:2,requirement:{type:'clicks',amount:2000}},
  ...GENERATORS.flatMap((g,i)=>[
    {id:g.id+'-1',name:['Двойной импульс','Пять с плюсом','Красный диплом','Новый учебный план','Разгон процессора','Фундаментальный труд','Самообучение','Стабильный переход','Петля времени','Ответ 42','Рекурсивное озарение'][i],description:g.name+': производство ×2.',price:g.basePrice*12,target:g.id,multiplier:2,requirement:{type:'generator',itemId:g.id,amount:10}},
    {id:g.id+'-2',name:g.name+' · совершенство',description:g.name+': производство ещё ×2.',price:g.basePrice*120,target:g.id,multiplier:2,requirement:{type:'generator',itemId:g.id,amount:25}},
  ]),
  // Append to preserve the original research order, IDs and saved purchases.
  ...[
    ['click-sync-1','Прикладная мысль',50_000,500,0.015],
    ['click-sync-2','Связь с лабораторией',5_000_000,2000,0.025],
    ['click-sync-3','Коллективное озарение',500_000_000,5000,0.03],
    ['click-sync-4','Ручное управление временем',50_000_000_000,12000,0.035],
    ['click-sync-5','Прикосновение к бесконечности',5_000_000_000_000,25000,0.045],
  ].map(([id,name,price,amount,productionShare])=>({id,name,price,target:'click',multiplier:1,productionShare,
    description:`Каждый ручной клик дополнительно приносит ${(productionShare*100).toLocaleString('ru-RU')}% текущего производства в секунду.`,requirement:{type:'clicks',amount}})),
  ...GENERATORS.flatMap(g=>[
    {id:g.id+'-team',name:g.name+' · командная работа',target:g.id,multiplier:1,teamwork:true,price:g.basePrice*1800,
      description:'Команда усиливает всю лабораторию: 50 помощников дают +6,7%, 100 дают +10%. Дальше бонус растёт плавнее, предел +20%.',requirement:{type:'generator',itemId:g.id,amount:50}},
    ...RESEARCH_TIERS.map(t=>({id:g.id+'-'+t.level,name:g.name+' · '+t.name,description:g.name+': собственное производство ×'+t.multiplier+'. Командный бонус сохраняется.',price:g.basePrice*t.priceFactor,target:g.id,multiplier:t.multiplier,requirement:{type:'generator',itemId:g.id,amount:t.amount}})),
  ]),
]);

export class EconomyError extends Error {
  constructor(code,message){super(message);this.name='EconomyError';this.code=code;}
}
const fail=(code,message)=>{throw new EconomyError(code,message);};
const bounded=value=>Math.min(1e250,Math.max(0,value));
const schedule=(now,random=Math.random)=>now+90_000+Math.floor(Math.max(0,Math.min(0.99999999,random()))*90_001);
export function createState(now=Date.now()) {
  return {version:1,economyVersion:ECONOMY_VERSION,prestigeVersion:PRESTIGE_VERSION,rankingVersion:2,cosmicAscensions:0,balance:0,totalEarned:0,runEarned:0,clicks:0,generators:GENERATORS.map(()=>0),upgrades:[],achievements:[],achievementRecords:{generators:GENERATORS.map(()=>0),maxGenerators:0,maxUpgrades:0,maxCps:0},activeEvent:null,eventCooldowns:{},eventStats:{wins:0,losses:0},lastEventResult:null,prestige:0,prestigeCount:0,lastSeen:now,lastSettled:now,serverTime:now,offlineEarned:0,golden:{availableUntil:0,nextAt:schedule(now)}};
}
// Append the new stage without resetting valid progress, peak records or active stakes.
// This is a schema migration; callers still validate untrusted imported saves.
export function migrateState(state) {
  for(const slots of [state.generators,state.achievementRecords?.generators]){
    if(Array.isArray(slots)&&slots.length===10)while(slots.length<GENERATORS.length)slots.push(0);
  }
  return state;
}
const prestigeLevel=state=>Number.isFinite(state.prestigeCount)?Math.min(MAX_PRESTIGE,Math.max(0,Math.floor(state.prestigeCount))):0;
// Old points were accidentally derived from a million-integral threshold while
// the actual reset price is a quadrillion. Completed cycles are the authority.
export function normalizePrestige(state){
  state.cosmicAscensions=Number.isSafeInteger(state.cosmicAscensions)&&state.cosmicAscensions>0?state.cosmicAscensions:0;
  const level=prestigeLevel(state),oldPoints=Number.isFinite(state.prestige)?Math.max(0,state.prestige):0;
  if(state.prestigeVersion!==PRESTIGE_VERSION||state.prestige!==level||state.prestigeCount!==level){
    if((oldPoints!==level||state.prestigeCount!==level)&&!state.legacyPrestige){
      state.legacyPrestige={points:state.prestige,count:state.prestigeCount};
    }
    const oldMultiplier=1+oldPoints*.1,newMultiplier=1+level*.1;
    // A challenge already in flight must not retain its old runaway multiplier.
    // Both rewards and penalties depend linearly on that multiplier.
    if(oldMultiplier>newMultiplier&&state.activeEvent){
      const ratio=newMultiplier/oldMultiplier;
      for(const key of ['reward','penalty'])if(Number.isFinite(state.activeEvent[key]))state.activeEvent[key]*=ratio;
    }
    state.prestige=level;state.prestigeCount=level;state.prestigeVersion=PRESTIGE_VERSION;
  }
  return state;
}
export function priceFor(itemId,owned,amount=1) {
  const g=typeof itemId==='number'?GENERATORS[itemId]:GENERATORS.find(x=>x.id===itemId);
  if(!g||!Number.isInteger(owned)||owned<0||!Number.isInteger(amount)||amount<1||amount>100)return Infinity;
  return Math.ceil(g.basePrice*Math.pow(1.15,owned)*(Math.pow(1.15,amount)-1)/0.15-1e-9);
}
export function upgradeAvailable(state,u){
  if(state.upgrades.includes(u.id))return false;
  return u.requirement.type==='clicks'?state.clicks>=u.requirement.amount:state.generators[GENERATORS.findIndex(g=>g.id===u.requirement.itemId)]>=u.requirement.amount;
}
export function getStats(state) {
  const multiplier=1+prestigeLevel(state)*0.1,owned=new Set(state.upgrades);
  let flatClickPower=1,clickProductionShare=BASE_CLICK_PRODUCTION_SHARE;
  const rawRates=GENERATORS.map((g,i)=>g.baseCps*(state.generators[i]??0));
  const teamworkShares=GENERATORS.map(()=>0);
  for(const u of UPGRADES){
    if(!owned.has(u.id))continue;
    if(u.target==='click'){
      flatClickPower*=u.multiplier;clickProductionShare+=u.productionShare||0;
    }else{
      const index=GENERATORS.findIndex(g=>g.id===u.target);
      if(index<0)continue;
      rawRates[index]*=u.multiplier;
      if(u.teamwork){
        const count=state.generators[index]??0;
        teamworkShares[index]=TEAMWORK_LIMIT*count/(count+TEAMWORK_HALF_SIZE);
      }
    }
  }
  const baseCps=bounded(rawRates.reduce((sum,value)=>sum+value,0)*multiplier);
  const teamworkBonus=teamworkShares.reduce((sum,value)=>sum+value,0);
  const cps=bounded(baseCps*(1+teamworkBonus));
  clickProductionShare=Math.min(MAX_CLICK_PRODUCTION_SHARE,clickProductionShare);
  flatClickPower=bounded(flatClickPower*multiplier);
  const generatorRates=GENERATORS.map((g,i)=>{
    const count=state.generators[i]??0,directCps=bounded(rawRates[i]*multiplier),teamworkCps=bounded(baseCps*teamworkShares[i]);
    const totalCps=bounded(directCps+teamworkCps);
    return {id:g.id,count,directCps,teamworkCps,teamworkBonus:teamworkShares[i],totalCps,unitCps:count?totalCps/count:g.baseCps*multiplier};
  });
  return {cps,clickPower:bounded(flatClickPower+cps*clickProductionShare),multiplier,prestigeGain:prestigeLevel(state)<MAX_PRESTIGE?1:0,
    baseCps,flatClickPower,clickProductionShare,teamworkBonus,generatorRates};
}
function credit(state,value){const safe=bounded(value);state.balance=bounded(state.balance+safe);state.totalEarned=bounded(state.totalEarned+safe);state.runEarned=bounded(state.runEarned+safe);return safe;}
function finished(state,result){unlockAchievements(state,getStats(state));return result;}
// Settle the one outstanding pre-update interval at the rates that earned it.
// No balances, purchased upgrades or achievement records are rescaled.
const LEGACY_BASE_CPS=[0.25,2,14,85,550,3500,23000,160000,1100000,8000000,240000000];
function previousEconomyCps(state){
  const owned=new Set(state.upgrades),multiplier=1+state.prestige*0.1;
  return bounded(GENERATORS.reduce((sum,g,i)=>{
    let rate=LEGACY_BASE_CPS[i]*(state.generators[i]??0);
    if(owned.has(g.id+'-1'))rate*=2;
    if(owned.has(g.id+'-2'))rate*=2;
    return sum+rate;
  },0)*multiplier);
}
export function settle(state,now=Date.now()) {
  if(!Number.isFinite(now))fail('invalid_time','Некорректное время.');
  migrateState(state);normalizePrestige(state);
  const until=Math.max(state.lastSettled,now),from=state.lastSettled;
  const activeEnd=state.lastSeen+ACTIVE_GRACE_MS;
  const activeMs=Math.max(0,Math.min(until,activeEnd)-from);
  const offlineMs=Math.max(0,Math.min(until,activeEnd+MAX_OFFLINE_MS)-Math.max(from,activeEnd));
  const cps=state.economyVersion===ECONOMY_VERSION?getStats(state).cps:previousEconomyCps(state);
  const offlineEarned=cps*offlineMs/1000*0.5;
  const earned=credit(state,cps*activeMs/1000+offlineEarned);
  state.lastSettled=until;state.serverTime=until;state.offlineEarned=offlineEarned;state.economyVersion=ECONOMY_VERSION;
  if(now>=state.golden.nextAt){
    if(now<=state.golden.nextAt+GOLDEN_WINDOW_MS)state.golden.availableUntil=state.golden.nextAt+GOLDEN_WINDOW_MS;
    else{state.golden.availableUntil=0;state.golden.nextAt=schedule(now);}
  }
  settleEvent(state,now);unlockAchievements(state,getStats(state));return {earned,offlineEarned};
}
export function applyAction(state,action,now=Date.now()) {
  if(!action||typeof action!=='object'||Array.isArray(action))fail('invalid_action','Некорректное действие.');
  settle(state,now);
  if(action.type==='event_start'){
    startEvent(state,action.itemId,getStats(state),now);return finished(state,{type:'event_start'});
  }
  if(action.type==='event_answer'){
    const result=answerEvent(state,action.itemId,action.answers,now);return finished(state,{type:'event_answer',...result});
  }
  if(action.type==='click'){
    const amount=action.amount??1;
    if(!Number.isInteger(amount)||amount<1||amount>24)fail('invalid_amount','За один запрос допустимо от 1 до 24 кликов.');
    const reward=credit(state,getStats(state).clickPower*amount);state.clicks+=amount;return finished(state,{type:'click',reward,count:amount});
  }
  if(action.type==='buy'){
    const index=GENERATORS.findIndex(g=>g.id===action.itemId),amount=action.amount??1;
    if(index<0)fail('unknown_item','Такого генератора нет.');
    if(!Number.isInteger(amount)||amount<1||amount>100)fail('invalid_amount','Можно купить от 1 до 100 генераторов.');
    const cost=priceFor(action.itemId,state.generators[index],amount);
    if(!Number.isFinite(cost)||state.balance<cost)fail('insufficient_funds','Недостаточно интегралов.');
    state.balance=Math.max(0,state.balance-cost);state.generators[index]+=amount;return finished(state,{type:'buy',count:amount});
  }
  if(action.type==='upgrade'){
    const upgrade=UPGRADES.find(u=>u.id===action.itemId);
    if(!upgrade)fail('unknown_item','Такого улучшения нет.');
    if(!upgradeAvailable(state,upgrade))fail('upgrade_locked','Это улучшение пока недоступно или уже куплено.');
    if(state.balance<upgrade.price)fail('insufficient_funds','Недостаточно интегралов.');
    state.balance-=upgrade.price;state.upgrades.push(upgrade.id);return finished(state,{type:'upgrade'});
  }
  if(action.type==='prestige'){
    if(state.activeEvent)fail('event_active','Заверши испытание перед перерождением.');
    if(state.balance<PRESTIGE_PRICE)fail('prestige_locked','Для перерождения нужно 999 999 999 999 999 интегралов на балансе.');
    const gain=getStats(state).prestigeGain,cosmicAscension=state.prestigeCount===MAX_PRESTIGE;
    if(cosmicAscension&&action.confirmCosmicReset!==true)fail('cosmic_confirmation_required','Обновите игру и подтвердите сброс рейтинга при переходе с последнего престижа.');
    if(cosmicAscension){
      // Finishing the last universe starts a new ranking run. The award
      // belongs to the account and survives this and all subsequent resets.
      state.cosmicAscensions=Math.min(Number.MAX_SAFE_INTEGER,state.cosmicAscensions+1);
      state.totalEarned=0;state.prestigeCount=0;state.lastEventResult=null;
    }else state.prestigeCount++;
    state.prestige=state.prestigeCount;
    if(Number.isSafeInteger(state.prestigeCount)&&state.prestigeCount>0){const honor=`prestige:${state.prestigeCount}`;if(!state.achievements.includes(honor))state.achievements.push(honor);}
    state.balance=0;state.runEarned=0;state.offlineEarned=0;state.generators=GENERATORS.map(()=>0);state.upgrades=[];state.golden={availableUntil:0,nextAt:schedule(now)};return finished(state,{type:'prestige',prestigeGain:gain,cosmicAscension});
  }
  if(action.type==='golden'){
    if(state.golden.availableUntil<=0||now>state.golden.availableUntil||now<state.golden.nextAt)fail('golden_unavailable','Золотой интеграл сейчас недоступен.');
    const stats=getStats(state),reward=credit(state,Math.max(stats.clickPower*25,stats.cps*60));
    state.golden={availableUntil:0,nextAt:schedule(now)};return finished(state,{type:'golden',reward});
  }
  fail('unknown_action','Неизвестное действие.');
}
