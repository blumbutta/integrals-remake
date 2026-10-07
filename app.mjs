import {GENERATORS, UPGRADES, PRESTIGE_PRICE, createState, settle, applyAction, getStats, priceFor} from './shared/economy.mjs';
import {EVENTS,eventAvailable,getPublicEvent} from './shared/events.mjs';
import {createMusicPlayer} from './music.mjs';
import {ACHIEVEMENTS,COSMETICS,cosmeticUnlocked,prestigeAppearance,getPrestigeHonors} from './shared/achievements.mjs';
import {formatNumber as fmt} from './format.mjs';
import {createClickEffects} from './effects.mjs';
import {createLabWorld} from './world.mjs';
import {researchArtwork} from './research-art.mjs';
import {achievementArtwork} from './achievement-art.mjs';
import {createPrestigeAudio} from './prestige-audio.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const music=createMusicPlayer(),prestigeAudio=createPrestigeAudio();
const actionWaiters=new Map();
const STORAGE='integrals-remake-v1', TOKEN_KEY='integrals-remake-token';
const isLocal=['localhost','127.0.0.1'].includes(location.hostname);
const API=isLocal?`${location.origin}/integrals-api`:'https://kozlogon-server.onrender.com/integrals-api';
const ORIGINAL_ICONS=['cursoricon.png','grandmaIcon.png','farmIcon.png','factoryIcon.png','mineIcon.png','shipmentIcon.png','alchemylabIcon.png','portalIcon.png','timemachineIcon.png','antimattercondenserIcon.png'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStorage(key){try{return localStorage.getItem(key);}catch{return null;}}
let storageAvailable=true;
function writeStorage(key,value){try{localStorage.setItem(key,value);}catch{storageAvailable=false;}}
let saved;try{saved=JSON.parse(readStorage(STORAGE)||'null');}catch{}
let sessionEpoch=0,readOnlyTab=false,releaseTabLock,transitioning=false,flushPromise=null;
if(navigator.locks){readOnlyTab=!(await new Promise(resolve=>{navigator.locks.request('integrals-remake-active-tab',{ifAvailable:true},lock=>{if(!lock){resolve(false);return;}resolve(true);return new Promise(r=>releaseTabLock=r);}).catch(()=>resolve(true));}));}
let token=readStorage(TOKEN_KEY)||null;
let state=createState(),mode=token?'cloud':'local',connected=false,quantity=1,currentPage='lab',busy=false,baseTime=Date.now(),clockOffset=0,pending=[],clickBuffer=0;
let nickname='Исследователь',listed=true,sound=Boolean(saved?.sound),earnedAchievements=new Set(saved?.achievements||[]);
let cinematicActive=false,cinematicSound=saved?.cinematicSound!==false,resumeMusicAfterVisibility=false,achievementFilter='all',worldLocation=null;
let localOffline=0,selectedCosmetic=typeof saved?.selectedCosmetic==='string'?saved.selectedCosmetic:'classic',worldPaused=Boolean(saved?.worldPaused),appearance,prestigePage=0,achievementNoticesReady=false;
let musicVolume=typeof saved?.musicVolume==='number'?saved.musicVolume:35;music.setVolume(musicVolume/100);
if(saved?.state){try{state=validateState(saved.state);nickname=typeof saved.nickname==='string'?saved.nickname.slice(0,24):nickname;listed=saved.listed!==false;if(mode==='local'){localOffline=settle(state).offlineEarned;state.lastSeen=Date.now();}}catch{}}
if(mode==='cloud'&&Array.isArray(saved?.pending))pending=saved.pending.slice(0,32).filter(a=>a&&typeof a.id==='string'&&['click','buy','upgrade','golden','prestige','event_start','event_answer'].includes(a.type));
function validAchievement(id){return typeof id==='string'&&(ACHIEVEMENTS.some(a=>a.id===id)||(/^prestige:[1-9]\d{0,15}$/.test(id)&&Number.isSafeInteger(Number(id.slice(9)))));}
function validateState(raw,requirePrivateEvent=false){
  if(!raw||typeof raw!=='object')throw Error('Неверный формат сохранения');
  const s=createState();
  for(const k of ['balance','totalEarned','runEarned','clicks','prestige','prestigeCount','lastSeen','lastSettled'])if(typeof raw[k]==='number'&&Number.isFinite(raw[k])&&raw[k]>=0&&raw[k]<=1e250)s[k]=raw[k];
  if(!Array.isArray(raw.generators)||raw.generators.length!==GENERATORS.length)throw Error('Несовместимое сохранение');
  s.generators=raw.generators.map(n=>Number.isInteger(n)&&n>=0&&n<=10000?n:0);
  s.prestigeCount=Math.min(Number.MAX_SAFE_INTEGER,Math.floor(s.prestigeCount));
  s.achievements=Array.isArray(raw.achievements)?[...new Set(raw.achievements.filter(validAchievement))]:[];
  if(raw.achievementRecords&&typeof raw.achievementRecords==='object'){
    const records=raw.achievementRecords,finite=n=>Number.isFinite(n)&&n>=0&&n<=1e250?n:0;
    s.achievementRecords={generators:Array.from({length:GENERATORS.length},(_,i)=>finite(records.generators?.[i])),maxGenerators:finite(records.maxGenerators),maxUpgrades:finite(records.maxUpgrades),maxCps:finite(records.maxCps)};
  }
  s.upgrades=Array.isArray(raw.upgrades)?[...new Set(raw.upgrades)].filter(id=>UPGRADES.some(u=>u.id===id)):[];
  if(raw.golden&&Number.isFinite(raw.golden.nextAt)&&Number.isFinite(raw.golden.availableUntil))s.golden={...s.golden,...raw.golden};
  if(raw.eventCooldowns&&typeof raw.eventCooldowns==='object')s.eventCooldowns=raw.eventCooldowns;
  if(raw.eventStats&&typeof raw.eventStats==='object')s.eventStats=raw.eventStats;
  if(raw.activeEvent){
    const e=raw.activeEvent,def=EVENTS.find(d=>d.id===e.eventId);
    if(!def||e.kind!==def.kind||typeof e.id!=='string'||typeof e.name!=='string'||!Number.isFinite(e.deadline)||!Number.isFinite(e.startedAt)||!Number.isFinite(e.reward)||e.reward<0||!Number.isFinite(e.penalty)||e.penalty<0||!Array.isArray(e.prompts)||e.prompts.length<1||e.prompts.length>3||e.prompts.some(q=>!q||typeof q.prompt!=='string'||(e.kind==='quiz'&&(!Array.isArray(q.options)||q.options.length<2||q.options.some(o=>typeof o!=='string'))))||!e.data||typeof e.data!=='object')throw Error('Повреждено активное испытание');
    if(e.kind==='reverse'&&(typeof e.data.digits!=='string'||!/^\d{4}$/.test(e.data.digits)||!Number.isFinite(e.data.memorizeUntil)))throw Error('Повреждено испытание памяти');
    if(e.kind==='sort'&&(!Array.isArray(e.data.numbers)||e.data.numbers.length!==6||e.data.numbers.some(n=>!Number.isFinite(n))))throw Error('Повреждена последовательность');
    if(requirePrivateEvent&&!Array.isArray(e._answers))throw Error('Нет данных для восстановления испытания');
    if(e._answers!==undefined&&(!Array.isArray(e._answers)||e._answers.some(a=>typeof a!=='string'&&typeof a!=='number')))throw Error('Повреждены ответы испытания');
    s.activeEvent=e;
  }
  s.lastSeen=Math.min(s.lastSeen,Date.now());s.lastSettled=Math.min(s.lastSettled,Date.now());
  return s;
}
function save(){
  if(readOnlyTab)return;
  writeStorage(STORAGE,JSON.stringify({version:1,state,nickname,listed,sound,musicVolume,selectedCosmetic,worldPaused,cinematicSound,achievements:[...earnedAchievements],pending:mode==='cloud'?pending:[],mode}));
}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4200);}
function setStatus(text,kind='local'){$('#save-status').innerHTML=`<i></i>${esc(text)}`;$('#save-status').className=`save-status ${kind}`;}
function showBanner(message,connectButton=false){const b=$('#connection-banner');b.hidden=!message;b.replaceChildren();if(!message)return;const span=document.createElement('span');span.textContent=message;b.append(span);if(connectButton){const btn=document.createElement('button');btn.className='text-button';btn.textContent='Подключить облако →';btn.addEventListener('click',connectCloud);b.append(btn);}}
async function request(path,options={}){
  const requestEpoch=sessionEpoch;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers},signal:controller.signal,cache:'no-store'});
    let data;try{data=await response.json();}catch{throw new Error('Сервер пока недоступен');}
    if(requestEpoch!==sessionEpoch){const error=new Error('Профиль изменился');error.status=499;error.code='stale_response';throw error;}
    if(!response.ok){const error=new Error(data.error?.message||'Сервер пока недоступен');error.code=data.error?.code;error.status=response.status;throw error;}return data;
  }finally{clearTimeout(timeout);}
}
function acceptPlayer(player){
  if(player.id===state.id&&(player.revision||0)<(state.revision||0))return;
  state={...player,lastSettled:player.serverTime};baseTime=Date.now();clockOffset=(player.serverTime||Date.now())-Date.now();nickname=player.nickname;listed=player.listed;connected=true;for(const id of player.achievements||[])earnedAchievements.add(id);
  setStatus('В облаке','online');showBanner('');save();render(true);
  if(player.offlineEarned>0)showOffline(player.offlineEarned);
}
function showOffline(value){if(value<1)return;$('#offline-earned').textContent=`+${fmt(value)} ∫`;if(!$$('dialog[open]').length)$('#offline-dialog').showModal();}
async function init(){
  if(readOnlyTab){setStatus('Только просмотр');showBanner('Лаборатория уже открыта в другой вкладке. Здесь доступен просмотр. Закройте другую вкладку и обновите эту, чтобы продолжить.');render(true);return;}
  if(mode==='cloud'){
    try{acceptPlayer((await request('/state')).player);await flush();}catch(error){if(error.code==='stale_response')return;connected=false;setStatus('Ожидаем связь','warning');showBanner('Связь с облаком потеряна. Ваш прогресс сохранён на сервере; повторяем подключение.');if(error.status===401){showBanner('Код сохранения не принят. Откройте профиль и восстановите лабораторию по действующему коду.');}}
  }else{
    setStatus('На устройстве');
    try{await request('/health');
      if(state.totalEarned===0&&!saved){await createCloud();}
      else showBanner('');
    }catch{showBanner('');}
    if(localOffline>0)showOffline(localOffline);
  }
  render(true);
}
function beginSession(){sessionEpoch++;busy=false;flushPromise=null;pending=[];clickBuffer=0;for(const resolve of actionWaiters.values())resolve(false);actionWaiters.clear();}
async function createCloud(){
  transitioning=true;let result;try{result=await request('/players',{method:'POST',body:JSON.stringify({nickname})});}finally{transitioning=false;}
  beginSession();token=result.token;writeStorage(TOKEN_KEY,token);mode='cloud';pending=[];clickBuffer=0;earnedAchievements=new Set();acceptPlayer(result.player);toast('Облачная лаборатория создана. Сохраните код восстановления в профиле.');
}
async function connectCloud(){
  if(state.totalEarned>0&&!confirm('Облачная лаборатория начнётся с нуля: локальные результаты не участвуют в рейтинге. Сначала будет скачана резервная копия текущей лаборатории. Продолжить?'))return;
  if(state.totalEarned>0)exportSave();
  try{await createCloud();}catch(error){toast(error.message);}
}
function projected(){
  if(mode==='local')return state;
  const s=structuredClone(state);settle(s,Date.now()+clockOffset);let extra=clickBuffer;
  for(const a of pending)if(a.type==='click')extra+=a.amount;
  const gain=extra*getStats(s).clickPower;s.balance+=gain;s.totalEarned+=gain;s.runEarned+=gain;s.clicks+=extra;
  return s;
}
function queueClicks(){if(!clickBuffer)return;pending.push({id:`${Date.now()+clockOffset}-${crypto.randomUUID()}`,type:'click',amount:clickBuffer});clickBuffer=0;save();}
function flush(){
  if(mode!=='cloud'||readOnlyTab)return Promise.resolve();
  if(busy)return flushPromise;
  flushPromise=performFlush();return flushPromise;
}
async function performFlush(){
  queueClicks();busy=true;const flushEpoch=sessionEpoch;
  try{
    while(pending.length){const action=pending[0];setStatus('Сохраняем…','syncing');
      try{const data=await request('/action',{method:'POST',body:JSON.stringify(action)});if(flushEpoch!==sessionEpoch)return;pending.shift();const delayedPrestige=action.type==='prestige'&&!actionWaiters.has(action.id);if(delayedPrestige){selectedCosmetic='prestige';prestigePage=Math.floor((data.player.prestigeCount-1)/8);}acceptPlayer(data.player);if(delayedPrestige)toast('Перерождение подтверждено сервером. Новый облик добавлен в награды.');actionWaiters.get(action.id)?.(true);actionWaiters.delete(action.id);if(action.type==='golden')toast('Золотой интеграл собран!');}
      catch(error){
        if(flushEpoch!==sessionEpoch)return;
        if(error.status>=400&&error.status<500&&error.status!==429){pending.shift();save();actionWaiters.get(action.id)?.(false);actionWaiters.delete(action.id);toast(error.message);continue;}
        throw error;
      }
    }
    connected=true;setStatus('В облаке','online');
  }catch(error){if(flushEpoch!==sessionEpoch)return;connected=false;setStatus('Ожидаем связь','warning');showBanner('Соединение прервалось. Подтверждённый прогресс сохранён; производство продолжается.');}
  finally{if(flushEpoch!==sessionEpoch)return;busy=false;if(!connected){for(const resolve of actionWaiters.values())resolve(false);actionWaiters.clear();}render();}
}
async function act(action){
  if(cinematicActive&&action.type!=='prestige'){toast('Дождитесь рождения нового мира');return false;}
  if(readOnlyTab){toast('Продолжите игру в первой вкладке');return false;}if(transitioning){toast('Подключаем лабораторию…');return false;}
  if(mode==='cloud'){
    if(!connected){toast('Дождитесь соединения с сервером');return false;}
    queueClicks();const queued={id:`${Date.now()+clockOffset}-${crypto.randomUUID()}`,...action};const done=new Promise(resolve=>actionWaiters.set(queued.id,resolve));pending.push(queued);save();flush();return done;
  }
  try{const result=applyAction(state,action);state.lastSeen=Date.now();save();render(true);if(action.type==='golden')toast(`Золотое открытие! +${fmt(result.reward||0)} ∫`);return true;}catch(error){toast(error.message);return false;}
}
let clickCredit=24,lastClickTime=performance.now(),audio;
function blip(kind='click'){
  if(!sound)return;
  try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);osc.type='sine';osc.frequency.setValueAtTime(kind==='buy'?660:400+Math.random()*160,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(kind==='buy'?990:280,audio.currentTime+.07);gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.1);osc.start();osc.stop(audio.currentTime+.11);}catch{}
}
function clickIntegral(event){
  if(cinematicActive)return;
  if(readOnlyTab){toast('Продолжите игру в первой вкладке');return;}if(transitioning){toast('Подключаем лабораторию…');return;}
  if(mode==='cloud'&&!connected){toast('Восстанавливаем соединение с облаком…');return;}
  const now=performance.now();clickCredit=Math.min(24,clickCredit+(now-lastClickTime)*.012);lastClickTime=now;if(clickCredit<1)return;clickCredit--;
  const power=getStats(projected()).clickPower;
  if(mode==='cloud'){if(clickBuffer>=24)return;clickBuffer++;}
  else{applyAction(state,{type:'click',amount:1});state.lastSeen=Date.now();save();}
  clickEffects.manualClick();world.burst();
  const stage=$('#integral-stage'),r=stage.getBoundingClientRect(),p=document.createElement('span');p.className='click-float';p.textContent=`+${fmt(power)}`;p.style.left=`${event?.clientX?event.clientX-r.left:r.width/2+(Math.random()-.5)*60}px`;p.style.top=`${event?.clientY?event.clientY-r.top:r.height*.45}px`;$('#click-particles').append(p);setTimeout(()=>p.remove(),900);$('#integral-button').classList.remove('clicked');void $('#integral-button').offsetWidth;$('#integral-button').classList.add('clicked');blip();render();
}
$('#integral-button').addEventListener('click',clickIntegral);
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!event.repeat&&currentPage==='lab'&&!$$('dialog[open]').length&&!event.target.closest('input,textarea,button,a,summary,select')){event.preventDefault();clickIntegral();}});
$('#golden-button').addEventListener('click',()=>act({type:'golden'}));
function maxQuantity(g,index,balance){let count=0;while(count<100&&priceFor(g.id,state.generators[index],count+1)<=balance)count++;return Math.max(1,count);}
let lastShopStamp='',lastAchievementStamp='';
function render(force=false){
  const s=projected(),stats=getStats(s);
  $('#balance').textContent=fmt(s.balance);$('#balance').title=fmt(s.balance,2);$('#balance').style.fontSize=`${Math.max(22,Math.min(56,440/Math.max(8,fmt(s.balance).length)))}px`;$('#cps').textContent=fmt(stats.cps,2);$('#click-power').textContent=`+${fmt(stats.clickPower)}`;$('#total-earned').textContent=fmt(s.totalEarned);$('#total-clicks').textContent=fmt(s.clicks);$('#multiplier').textContent=`×${fmt(stats.multiplier,2)}`;
  $('#profile-name').textContent=nickname;$('#prestige-badge').textContent=fmt(s.prestige);$('#owned-count').textContent=fmt(s.generators.reduce((a,b)=>a+b,0),0);$('#helpers-total').textContent=fmt(s.generators.reduce((a,b)=>a+b,0),0);$('#prestige-total').textContent=fmt(s.prestige,0);$('#upgrade-count').textContent=s.upgrades.length;
  $('#era-label').textContent=s.totalEarned>=1e9?'ЭПОХА IV · ЗА ГРАНЬЮ БЕСКОНЕЧНОСТИ':s.totalEarned>=1e6?'ЭПОХА III · ЕДИНАЯ ТЕОРИЯ':s.totalEarned>=1000?'ЭПОХА II · БОЛЬШИЕ ОТКРЫТИЯ':'ЭПОХА I · ПЕРВЫЙ ПРИНЦИП';
  const nextIndex=s.generators.findIndex(v=>v===0),goal=nextIndex===-1?PRESTIGE_PRICE:GENERATORS[nextIndex].basePrice,value=s.balance;
  $('#goal-text').textContent=nextIndex===0?'Первый автоклик. Лаборатория оживает.':nextIndex===-1?'Перерождение. Новый виток бесконечности.':GENERATORS[nextIndex].name;
  $('#goal-progress').textContent=value>=goal?'Можно открыть':`Осталось ${fmt(goal-value)} ∫`;$('#goal-bar').style.width=`${Math.min(100,value/goal*100)}%`;
  const now=Date.now()+clockOffset;$('#golden-button').hidden=!(s.golden?.availableUntil>now&&s.golden?.nextAt<=now);
  const stamp=JSON.stringify([s.generators,s.upgrades,quantity,GENERATORS.map((g,i)=>[s.balance>=priceFor(g.id,s.generators[i],quantity==='max'?maxQuantity(g,i,s.balance):quantity),s.totalEarned>=g.basePrice*.4,quantity==='max'?maxQuantity(g,i,s.balance):0]),UPGRADES.map(u=>s.balance>=u.price),connected]);
  if(force||stamp!==lastShopStamp){lastShopStamp=stamp;renderShop(s);}
  const confirmedAchievements=mode==='cloud'?(state.achievements||[]):(s.achievements||[]);
  const freshlyEarned=confirmedAchievements.filter(id=>!earnedAchievements.has(id));
  for(const id of confirmedAchievements)earnedAchievements.add(id);
  for(const a of ACHIEVEMENTS)if(mode==='local'&&a.value(s,stats)>=a.target&&!earnedAchievements.has(a.id)){earnedAchievements.add(a.id);freshlyEarned.push(a.id);}
  if(mode==='local')state.achievements=[...earnedAchievements].filter(validAchievement);
  s.achievements=[...earnedAchievements];
  if(achievementNoticesReady&&freshlyEarned.length){const first=ACHIEVEMENTS.find(a=>a.id===freshlyEarned[0]);toast(`Достижение: ${first?.name||'Новая бесконечность'}${freshlyEarned.length>1?` · ещё ${freshlyEarned.length-1}`:''}. Оформления — во вкладке «Награды».`);save();}
  achievementNoticesReady=true;
  if(!cinematicActive)applyAppearance(s);renderLabScene(s);clickEffects.update(s.generators[0]);
  const regularCount=ACHIEVEMENTS.filter(a=>earnedAchievements.has(a.id)).length;
  $('#achievement-count').textContent=fmt(regularCount+s.prestigeCount,0);$('#achievement-summary').textContent=`${regularCount} / ${ACHIEVEMENTS.length} · ${fmt(s.prestigeCount,0)} супердостижений`;
  $('#prestige-price').textContent=`${fmt(PRESTIGE_PRICE,0)} ∫`;$('#prestige-open').classList.toggle('affordable',s.balance>=PRESTIGE_PRICE);
  if(currentPage==='achievements')renderAchievements(s);
  if(currentPage==='rewards')renderRewards(s);
  if(currentPage==='world')renderWorldEvents(s);
  if(currentPage==='events')renderEvents(s);
  updateEventTimer();
  if(!storageAvailable){setStatus('Не сохранено','warning');$('#session-note').textContent='Браузер блокирует сохранение. Сделайте экспорт в профиле.';}
}
function renderShop(s){
  $('#generators-panel').innerHTML=GENERATORS.map((g,i)=>{
    const count=quantity==='max'?maxQuantity(g,i,s.balance):quantity,price=priceFor(g.id,s.generators[i],count),affordable=s.balance>=price,lock=s.totalEarned<g.basePrice*.4&&s.generators[i]===0&&i>1;
    return `<button class="generator-card ${affordable?'affordable':''} ${lock?'locked':''}" data-generator="${g.id}" data-count="${count}" ${!affordable?'disabled':''} aria-label="Купить ${esc(g.name)}, ${count} шт., цена ${fmt(price)} интегралов"><span class="generator-icon icon-${i}"><img class="generator-image" src="./assets/original/${ORIGINAL_ICONS[i]}" alt="" width="52" height="52"></span><span class="generator-info"><h3>${esc(g.name)} <span class="generator-number">${count>1?`×${count}`:''}</span></h3><p>${esc(g.description)}</p><small>+${fmt(g.baseCps,2)} ∫/с · базовая скорость</small></span><span class="generator-meta"><strong>∫ ${fmt(price)}</strong><span>${s.generators[i]>0?`${s.generators[i]} в работе`:lock?'Впереди открытие':'Не приобретено'}</span></span></button>`;
  }).join('');
  $('#upgrades-panel').innerHTML=UPGRADES.map((u,i)=>{
    const owned=s.upgrades.includes(u.id),r=u.requirement,gi=GENERATORS.findIndex(g=>g.id===r.itemId),unlocked=r.type==='clicks'?s.clicks>=r.amount:(s.generators[gi]||0)>=r.amount,affordable=unlocked&&s.balance>=u.price&&!owned;
    const requirement=r.type==='clicks'?`${r.amount} кликов`:`${r.amount} × ${GENERATORS[gi]?.name||''}`;
    return `<button class="upgrade-card ${owned?'purchased':''} ${affordable?'affordable':''}" data-upgrade="${u.id}" ${!affordable?'disabled':''}>${researchArtwork(i,owned)}<span class="generator-info"><h3>${esc(u.name)}</h3><p>${esc(u.description)}</p><small>${owned?'Исследование завершено':unlocked?'Доступно для исследования':`Откроется: ${esc(requirement)}`}</small></span><span class="generator-meta"><strong>${owned?'Готово':`∫ ${fmt(u.price)}`}</strong></span></button>`;
  }).join('');
}
$('#generators-panel').addEventListener('click',async e=>{const b=e.target.closest('[data-generator]');if(b&&await act({type:'buy',itemId:b.dataset.generator,amount:Number(b.dataset.count)}))blip('buy');});
$('#upgrades-panel').addEventListener('click',async e=>{const b=e.target.closest('[data-upgrade]');if(b&&await act({type:'upgrade',itemId:b.dataset.upgrade}))blip('buy');});
$$('[data-quantity]').forEach(b=>b.addEventListener('click',()=>{quantity=b.dataset.quantity==='max'?'max':Number(b.dataset.quantity);$$('[data-quantity]').forEach(n=>{n.classList.toggle('active',n===b);n.setAttribute('aria-pressed',String(n===b));});render(true);}));
for(const tab of ['generators','upgrades'])$(`#tab-${tab}`).addEventListener('click',()=>{for(const t of ['generators','upgrades']){$(`#tab-${t}`).classList.toggle('active',t===tab);$(`#tab-${t}`).setAttribute('aria-selected',String(t===tab));$(`#${t}-panel`).hidden=t!==tab;}$('.quantity-switch').classList.toggle('research-mode',tab==='upgrades');});
function showPage(page){
  if(cinematicActive&&page!=='world')return;
  if(!document.getElementById(`page-${page}`))return;
  currentPage=page;$$('[data-page]').forEach(n=>{n.classList.toggle('active',n.dataset.page===page);n.setAttribute('aria-current',n.dataset.page===page?'page':'false');});
  $$('.page-panel').forEach(p=>p.hidden=p.id!==`page-${page}`);
  if(page==='ranking')loadRanking();render(true);
  if(page==='world')world.resize();
}
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
function selectedAppearance(s){
  const run=selectedCosmetic.startsWith('prestige:')?Number(selectedCosmetic.slice(9)):selectedCosmetic==='prestige'?s.prestigeCount:0;
  if(Number.isSafeInteger(run)&&run>0&&run<=s.prestigeCount)return prestigeAppearance(run);
  const cosmetic=COSMETICS.find(c=>c.id===selectedCosmetic&&cosmeticUnlocked(s,c.id))||COSMETICS[0];
  return {...cosmetic,...cosmetic.colors,hue:cosmetic.id==='classic'?206:({chalk:145,jade:157,violet:268,amber:38,starfield:211,aurora:170,blueprint:210}[cosmetic.id]||206),rings:3,rotation:0};
}
function applyAppearance(s){
  const next=selectedAppearance(s);if(appearance?.id===next.id)return;appearance=next;
  document.body.dataset.theme=next.id;document.body.dataset.pattern=next.pattern;
  for(const [key,value]of Object.entries({'--accent':next.accent,'--cosmetic-glow':next.glow,'--theme-tint':next.tint,'--world-hue':next.hue,'--prestige-rings':next.rings,'--theme-rotation':`${next.rotation}deg`}))document.documentElement.style.setProperty(key,String(value));
}
function renderRewards(s){
  const stamp=JSON.stringify([s.achievements,selectedCosmetic,prestigePage,s.prestigeCount]);if(renderRewards.stamp===stamp)return;renderRewards.stamp=stamp;
  const unlocked=COSMETICS.filter(c=>cosmeticUnlocked(s,c.id));
  $('#cosmetics-panel').innerHTML=`<div class="cosmetics-heading"><div><span class="eyebrow">НАГРАДЫ ЗА ВАШИ ОТКРЫТИЯ</span><h2>Ваша лаборатория — ваш стиль</h2></div><span>${unlocked.length} / ${COSMETICS.length}</span></div><p>Достижения открывают оформление. Выбранный облик сохраняется вместе с игрой.</p><div class="cosmetics-grid">${COSMETICS.map(c=>{const open=cosmeticUnlocked(s,c.id);return `<button class="cosmetic-card ${appearance?.id===c.id?'selected':''}" data-cosmetic="${c.id}" ${open?'':'disabled'} aria-pressed="${appearance?.id===c.id}"><span class="cosmetic-swatch" style="--swatch:${c.colors.accent};--swatch-bg:${c.colors.tint}">${open?'✦':'◇'}</span><strong>${c.name}</strong><small>${c.description}</small><span>${appearance?.id===c.id?'✓ Выбрано':open?'Применить оформление':'Пока закрыто'}</span></button>`;}).join('')}</div>${s.prestigeCount?`<section class="prestige-honors"><div class="cosmetics-heading"><h2>Супердостижения · ${fmt(s.prestigeCount,0)}</h2><span>У каждого перерождения свой мир</span></div><div class="cosmetics-grid">${getPrestigeHonors(s.prestigeCount,{offset:prestigePage*8,limit:8}).map(h=>`<button class="cosmetic-card super-achievement ${appearance?.id===h.id?'selected':''}" data-cosmetic="${h.id}" aria-pressed="${appearance?.id===h.id}"><span class="cosmetic-swatch" style="--swatch:${h.appearance.accent};--swatch-bg:${h.appearance.tint}">∞</span><strong>${esc(h.name)}</strong><small>${esc(h.text)}</small><span>${appearance?.id===h.id?'✓ Выбрано':'Надеть облик'}</span></button>`).join('')}</div>${s.prestigeCount>8?`<div class="honors-pagination"><button class="secondary-button" data-honors-page="-1" ${prestigePage===0?'disabled':''}>← Раньше</button><span>${prestigePage+1} / ${Math.ceil(s.prestigeCount/8)}</span><button class="secondary-button" data-honors-page="1" ${(prestigePage+1)*8>=s.prestigeCount?'disabled':''}>Дальше →</button></div>`:''}</section>`:''}`;
}
function renderAchievements(s){
  const stamp=JSON.stringify([s.achievementRecords,Math.floor(s.totalEarned),s.clicks,s.eventStats,earnedAchievements.size,achievementFilter]);if(stamp===lastAchievementStamp)return;lastAchievementStamp=stamp;
  const stats=getStats(s),earned=ACHIEVEMENTS.filter(a=>earnedAchievements.has(a.id)),locked=ACHIEVEMENTS.filter(a=>!earnedAchievements.has(a.id));
  const card=(a,done)=>{const value=Math.min(a.target,a.value(s,stats)),index=ACHIEVEMENTS.indexOf(a);return `<article class="achievement-card ${done?'unlocked':'locked-achievement'}">${achievementArtwork(a,index,done)}<div class="achievement-copy"><span class="achievement-state">${done?'✓ Получено':'Ещё не получено'}</span><h3>${a.name}</h3><p>${a.text}</p>${done?'<small>В вашей коллекции навсегда</small>':`<div class="progress-track"><div style="width:${value/a.target*100}%"></div></div><small>${fmt(value)} / ${fmt(a.target)}</small>`}</div></article>`;};
  const group=(items,done)=>`<section class="achievement-section ${done?'earned':'locked'}"><header><h2>${done?'Полученные достижения':'Впереди новые открытия'}</h2><span>${items.length}</span></header>${items.length?`<div class="achievement-group-grid">${items.map(a=>card(a,done)).join('')}</div>`:`<p class="achievement-empty">${done?'Первое достижение появится после первого интеграла.':'Все обычные достижения собраны! Новые миры ждут за чёрной дырой.'}</p>`}</section>`;
  $('#achievements-grid').innerHTML=(achievementFilter!=='locked'?group(earned,true):'')+(achievementFilter!=='earned'?group(locked,false):'');
  $$('[data-achievement-filter]').forEach(b=>{const active=b.dataset.achievementFilter===achievementFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
$('#achievement-filters').addEventListener('click',e=>{const b=e.target.closest('[data-achievement-filter]');if(b){achievementFilter=b.dataset.achievementFilter;renderAchievements(projected());}});
$('#cosmetics-panel').addEventListener('click',e=>{
  const page=e.target.closest('[data-honors-page]');if(page){prestigePage=Math.max(0,Math.min(Math.ceil(state.prestigeCount/8)-1,prestigePage+Number(page.dataset.honorsPage)));render(true);return;}
  const b=e.target.closest('[data-cosmetic]');if(!b||b.disabled)return;
  selectedCosmetic=b.dataset.cosmetic;save();render(true);toast(`Оформление: ${appearance.name}`);
});
async function loadRanking(){
  $('#ranking-content').innerHTML='<div class="empty-state"><span>◎</span><h2>Связываемся с лабораториями мира…</h2></div>';
  try{const {entries}=await request('/leaderboard?period=all');
    if(!entries?.length){$('#ranking-content').innerHTML='<div class="empty-state"><span>↗</span><h2>Первое место пока свободно.</h2><p>Создайте облачную лабораторию и начните историю этого рейтинга.</p></div>';return;}
    $('#ranking-content').innerHTML=`<table class="leaderboard-table"><thead><tr><th>МЕСТО</th><th>ИССЛЕДОВАТЕЛЬ</th><th>ПРЕСТИЖ</th><th>ИНТЕГРАЛЫ</th></tr></thead><tbody>${entries.map(p=>`<tr class="${p.id===state.id?'is-me':''}"><td><span class="rank rank-${p.rank}">${p.rank<4?['①','②','③'][p.rank-1]:p.rank}</span></td><td><span class="rank-avatar">${esc(Array.from(p.nickname)[0])}</span>${esc(p.nickname)} ${p.id===state.id?'<small>это вы</small>':''}</td><td>∞ ${fmt(p.prestige)}</td><td><strong>${fmt(p.totalEarned,2)}</strong><span> ∫</span></td></tr>`).join('')}</tbody></table>`;
  }catch{$('#ranking-content').innerHTML='<div class="empty-state"><span>◎</span><h2>Рейтинг пока не подключён.</h2><p>Для общего рейтинга серверу нужно постоянное хранилище. Локальная лаборатория уже доступна — её результаты хранятся на этом устройстве.</p><button class="secondary-button" id="retry-ranking">Попробовать снова</button></div>';$('#retry-ranking').addEventListener('click',loadRanking);}
}
$('#refresh-ranking').addEventListener('click',loadRanking);
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#help-open').addEventListener('click',()=>$('#help-dialog').showModal());
$('#profile-button').addEventListener('click',()=>{
  $('#nickname').value=nickname;$('#listed').checked=listed;$('#listed').disabled=mode!=='cloud';$('#copy-code').disabled=mode!=='cloud';$('#profile-mode').textContent=mode==='cloud'?'Прогресс хранится на сервере и привязан к вашему коду восстановления.':'Локальная лаборатория. Прогресс хранится только в этом браузере; экспортируйте сохранение для резервной копии.';$('#profile-dialog').showModal();
});
$('#profile-form').addEventListener('submit',async e=>{e.preventDefault();if(readOnlyTab){toast('Профиль изменяется в первой вкладке');return;}const name=$('#nickname').value.trim();if(name.length<2){toast('Введите имя от 2 до 24 символов');return;}
  try{if(mode==='cloud'){const submitEpoch=sessionEpoch;await flush();if(submitEpoch!==sessionEpoch)return;acceptPlayer((await request('/profile',{method:'PATCH',body:JSON.stringify({nickname:name,listed:$('#listed').checked})})).player);}else{nickname=name;save();render();}toast('Профиль сохранён');$('#profile-dialog').close();}catch(error){toast(error.message);}
});
$('#copy-code').addEventListener('click',async()=>{if(!token)return;try{await navigator.clipboard.writeText(token);toast('Код скопирован. Храните его в надёжном месте.');}catch{const input=$('#recovery-code');input.type='text';input.value=token;input.closest('details').open=true;input.focus();input.select();toast('Скопируйте выделенный код и храните его в надёжном месте.');}});
async function restore(code){
  if(readOnlyTab)throw new Error('Восстановите лабораторию в первой вкладке');
  const nextToken=code.trim();let data;transitioning=true;try{data=await request('/state',{headers:{Authorization:`Bearer ${nextToken}`}});}finally{transitioning=false;}
  beginSession();token=nextToken;writeStorage(TOKEN_KEY,token);mode='cloud';earnedAchievements=new Set();acceptPlayer(data.player);toast('Лаборатория восстановлена');$('#profile-dialog').close();
}
$('#restore-form').addEventListener('submit',async e=>{e.preventDefault();const code=$('#recovery-code').value.trim();if(!code){toast('Введите код восстановления');return;}if(!confirm('Переключиться на лабораторию по этому коду? Текущая облачная лаборатория останется на сервере. Сохраните её код перед переключением.'))return;try{await restore(code);$('#recovery-code').value='';}catch(error){toast(error.message);}});
function exportSave(){
  save();const data=mode==='cloud'?{game:'integrals-remake',version:1,recoveryCode:token,note:'Секретный код доступа к лаборатории. Не публикуйте этот файл.'}:{game:'integrals-remake',version:1,state,nickname,selectedCosmetic,worldPaused,cinematicSound,achievements:[...earnedAchievements]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`integrals-remake-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#export-save').addEventListener('click',exportSave);
$('#import-save').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(readOnlyTab){toast('Импорт доступен в первой вкладке');return;}try{if(file.size>100000)throw Error('Слишком большой файл');const data=JSON.parse(await file.text());if(data.game!=='integrals-remake'||data.version!==1)throw Error('Это не сохранение Integrals: Remake');if(!confirm('Загрузить это сохранение вместо текущей лаборатории? Сначала экспортируйте текущее, если хотите к нему вернуться.'))return;if(data.recoveryCode){await restore(data.recoveryCode);}else{const imported=validateState(data.state,true);beginSession();token=null;try{localStorage.removeItem(TOKEN_KEY);}catch{}mode='local';connected=false;pending=[];clickBuffer=0;clockOffset=0;state=imported;settle(state);state.lastSeen=Date.now();nickname=String(data.nickname||'Исследователь').slice(0,24);earnedAchievements=new Set([...(data.achievements||[]).filter(validAchievement),...state.achievements]);selectedCosmetic=typeof data.selectedCosmetic==='string'?data.selectedCosmetic:'classic';prestigePage=0;worldPaused=Boolean(data.worldPaused);cinematicSound=data.cinematicSound!==false;updateWorldPause();save();setStatus('На устройстве');showBanner('');render(true);$('#profile-dialog').close();toast('Сохранение загружено');}}catch(error){toast(error.message);}finally{e.target.value='';}});
let prestigeSubmitting=false;
function setCinematicUI(active){
  cinematicActive=active;$('#page-world').classList.toggle('cinematic-active',active);
  $('.main-nav').inert=active;$('#world-events').inert=active;$('#profile-button').disabled=active;$('#world-pause').disabled=active;$('#music-button').disabled=active;
  $('#world-cinematic-skip').hidden=!active;$('#world-cinematic-mute').hidden=!active||!cinematicSound;
  if(!active)$('#world-cinematic-status').textContent='';
}
$('#prestige-open').addEventListener('click',()=>{
  showPage('world');$('#world-widget').scrollIntoView({block:'start',behavior:'instant'});
  const s=projected(),stats=getStats(s),next=prestigeAppearance(s.prestigeCount+1),missing=Math.max(0,PRESTIGE_PRICE-s.balance);
  $('#prestige-step-one').hidden=false;$('#prestige-step-two').hidden=true;
  $('#prestige-audio-enabled').checked=cinematicSound;
  $('#prestige-details').innerHTML=`<div class="prestige-reward"><span>Цена чёрной дыры</span><strong>${fmt(PRESTIGE_PRICE,0)} ∫</strong></div><div><span>Ваш баланс</span><strong>${fmt(s.balance,0)} ∫</strong></div><div><span>За перерождение</span><strong>+${fmt(stats.prestigeGain)} ∞</strong></div><div class="prestige-reward"><span>Супердостижение и уникальный облик</span><strong>${esc(next.name)}</strong></div>${missing>0?`<p class="prestige-missing">Не хватает ${fmt(missing,0)} ∫. Развивайте производство и возвращайтесь.</p>`:''}`;
  $('#prestige-confirm').disabled=missing>0||stats.prestigeGain<1||Boolean(s.activeEvent)||readOnlyTab;
  $('#prestige-confirm').textContent=s.activeEvent?'Сначала завершите испытание':missing>0?'Пока недостаточно интегралов':'Да, хочу переродиться';
  $('#prestige-final-confirm').disabled=false;$('#prestige-dialog').showModal();
});
$('#prestige-confirm').addEventListener('click',()=>{$('#prestige-step-one').hidden=true;$('#prestige-step-two').hidden=false;$('#prestige-back').focus();});
$('#prestige-back').addEventListener('click',()=>{$('#prestige-step-two').hidden=true;$('#prestige-step-one').hidden=false;$('#prestige-confirm').focus();});
$('#prestige-final-confirm').addEventListener('click',async()=>{
  if(prestigeSubmitting)return;
  prestigeSubmitting=true;$('#prestige-final-confirm').disabled=true;
  cinematicSound=$('#prestige-audio-enabled').checked;save();
  const oldWorld=structuredClone(projected()),oldAppearance={...appearance},resumeMusic=music.playing;
  if(cinematicSound)Promise.resolve(prestigeAudio.prepare?.()).catch(()=>{});
  setCinematicUI(true);$('#world-cinematic-skip').disabled=true;let succeeded=false;
  try{
    succeeded=await act({type:'prestige'});if(!succeeded)return;
    selectedCosmetic='prestige';prestigePage=Math.floor((state.prestigeCount-1)/8);save();$('#prestige-dialog').close();
    music.pause();updateMusic();
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?450:6500;
    $('#world-cinematic-status').textContent='В небе открывается чёрная дыра. Мир переходит в новую эпоху…';
    if(cinematicSound)prestigeAudio.play({volume:musicVolume/100,durationMs:duration});
    world.setPaused(false);
    const animation=world.playPrestige({state:oldWorld,durationMs:duration,hue:oldAppearance.hue});
    const nextAppearance=selectedAppearance(state);world.update(state,{hue:nextAppearance.hue,accent:nextAppearance.accent});
    $('#world-cinematic-skip').disabled=false;await animation;
  }catch{if(succeeded)toast('Новая эпоха сохранена.');}
  finally{
    prestigeAudio.stop();setCinematicUI(false);prestigeSubmitting=false;$('#prestige-final-confirm').disabled=false;
    updateWorldPause();render(true);
    if(resumeMusic&&!document.hidden){resumeMusicAfterVisibility=false;music.resume().then(updateMusic).catch(()=>{});}
    else if(resumeMusic)resumeMusicAfterVisibility=true;
    if(succeeded){$('#world-cinematic-status').textContent=`Эпоха ${fmt(state.prestigeCount,0)} · ${appearance.name}. Новый мир ждёт первых жителей.`;toast(`Перерождение №${fmt(state.prestigeCount,0)}. Облик «${appearance.name}» добавлен в награды.`);}
  }
});
$('#world-cinematic-skip').addEventListener('click',()=>{prestigeAudio.stop();world.finishPrestige();});
$('#world-cinematic-mute').addEventListener('click',()=>{prestigeAudio.stop();cinematicSound=false;save();$('#world-cinematic-mute').hidden=true;});
function updateSound(){$('#sound-button').classList.toggle('sound-enabled',sound);$('#sound-button').setAttribute('aria-label',sound?'Выключить звук':'Включить звук');$('#sound-button').title=sound?'Выключить звук':'Включить звук';}
$('#sound-button').addEventListener('click',()=>{sound=!sound;if(!sound&&cinematicActive){prestigeAudio.stop();cinematicSound=false;$('#world-cinematic-mute').hidden=true;}updateSound();save();blip('buy');});
setInterval(()=>{if(readOnlyTab)return;if(mode==='local'){const r=settle(state);state.lastSeen=Date.now();if(r.offlineEarned>1)showOffline(r.offlineEarned);}if(!document.hidden)render();},200);
setInterval(()=>{if(readOnlyTab)return;if(mode==='cloud'&&(clickBuffer||pending.length))flush();},800);
setInterval(async()=>{if(readOnlyTab)return;if(mode==='local'){save();return;}if(busy)return;await flush();if(pending.length)return;try{acceptPlayer((await request('/state')).player);}catch(error){if(error.code==='stale_response')return;connected=false;setStatus('Ожидаем связь','warning');}},15000);
document.addEventListener('visibilitychange',()=>{if(readOnlyTab)return;if(document.hidden){if(mode==='cloud'){queueClicks();flush();}save();}else if(mode==='cloud'&&!busy){request('/state').then(data=>acceptPlayer(data.player)).catch(error=>{if(error.code==='stale_response')return;connected=false;setStatus('Ожидаем связь','warning');});}else if(mode==='local'){const r=settle(state);state.lastSeen=Date.now();if(r.offlineEarned>0)showOffline(r.offlineEarned);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){resumeMusicAfterVisibility=resumeMusicAfterVisibility||music.playing;music.pause();prestigeAudio.stop();}else if(resumeMusicAfterVisibility&&!cinematicActive){resumeMusicAfterVisibility=false;music.resume().then(updateMusic).catch(()=>{});}});
window.addEventListener('storage',event=>{if(readOnlyTab&&event.key===STORAGE&&event.newValue){try{const other=JSON.parse(event.newValue);state=validateState(other.state);nickname=other.nickname;token=readStorage(TOKEN_KEY);mode=other.mode;listed=other.listed;earnedAchievements=new Set((other.achievements||[]).filter(validAchievement));selectedCosmetic=other.selectedCosmetic||'classic';render(true);}catch{}}});
window.addEventListener('pagehide',()=>{if(mode==='cloud')queueClicks();save();});


let selectedEvent=null,eventRenderedId=null,eventAnswers=[],eventResultSeen=null,timeoutRefreshId=null;
const durationText=ms=>{const sec=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`;};
function renderLabScene(s){
  const target=$('#lab-roster'),total=s.generators.reduce((a,b)=>a+b,0);if(!cinematicActive)world.update(s,{hue:appearance.hue,accent:appearance.accent});
  const stamp=JSON.stringify(s.generators);if(renderLabScene.stamp!==stamp){renderLabScene.stamp=stamp;
    const owned=GENERATORS.map((g,i)=>({g,i,n:s.generators[i]})).filter(x=>x.n>0);
    target.innerHTML=owned.length?owned.map(({g,i,n})=>`<div class="lab-scene-row ${i===3?'roster-teacher':''}"><strong>${esc(g.name)} <span>×${fmt(n,0)}</span></strong><div class="lab-scene-sprites">${Array.from({length:Math.min(n,24)},()=>i===3?`<span class="teacher-portrait"><img src="./assets/original/${ORIGINAL_ICONS[i]}" alt="" width="101" height="64"></span>`:`<img src="./assets/original/${ORIGINAL_ICONS[i]}" alt="" width="48" height="48">`).join('')}${n>24?`<span>+${fmt(n-24,0)}</span>`:''}</div></div>`).join(''):'<div class="lab-scene-empty"><p>Пока здесь тихо.</p><small>Первый помощник появится после покупки в магазине.</small></div>';
    $('#world-status').textContent=total?`${fmt(total,0)} жителей · ${owned.length} открытых направлений · нажмите на здание, чтобы выбрать событие`:'Приглашайте жителей: вместе с ними открываются новые районы.';
    $('#world-canvas').setAttribute('aria-label',total?`Мир интегралов. ${owned.map(x=>`${x.g.name}: ${x.n}`).join(', ')}. Подробности — в списке жителей.`:'Мир интегралов ждёт первого помощника.');
  }
  const now=Date.now()+clockOffset,open=EVENTS.filter(e=>eventAvailable(s,e.id,now)),eventStamp=JSON.stringify([s.activeEvent?.id,open.map(e=>e.id),s.generators[1]>0]);
  const normalOpen=open.filter(e=>e.source!=='world').length,worldOpen=open.length-normalOpen,nav=document.querySelector('[data-page="events"]');nav.classList.toggle('events-ready',Boolean(normalOpen||s.activeEvent));nav.setAttribute('aria-label',s.activeEvent?'События: испытание идёт':`События: доступно ${normalOpen}`);
  document.querySelector('[data-page="world"]').classList.toggle('events-ready',worldOpen>0);
  if(renderLabScene.eventStamp!==eventStamp){renderLabScene.eventStamp=eventStamp;
    $('#lab-event-preview').innerHTML=s.activeEvent?`<div class="event-alert active-challenge"><span class="event-alert-count">◷</span><div><h3>${esc(s.activeEvent.name)}</h3><p>Испытание идёт · <b id="active-event-remaining"></b></p><button class="event-alert-action" data-open-event="${s.activeEvent.eventId}">Вернуться к заданию →</button></div></div>`:open.length?`<div class="event-alert ready"><span class="event-alert-count">${open.length}</span><div><h3>Есть новое испытание!</h3><p>${open.slice(0,2).map(e=>esc(e.name)).join(' · ')}${open.length>2?` · и ещё ${open.length-2}`:''}${worldOpen?`<br>${worldOpen} особых события — во вкладке мира`:''}</p><button class="event-alert-action" data-open-event="${open[0].id}">Посмотреть правила и награду →</button></div></div>`:`<div class="event-alert waiting"><span class="event-alert-count">✧</span><div><h3>${s.generators[1]>0?'Перерыв между открытиями':'Первое задание уже близко'}</h3><p>${s.generators[1]>0?'Лаборатория готовит новые испытания. Следующий запуск указан в событиях.':'Пригласите школьника — откроется домашнее задание с наградой.'}</p></div></div>`;
  }
  if(s.activeEvent&&$('#active-event-remaining'))$('#active-event-remaining').textContent=durationText(s.activeEvent.deadline-now);
}
$('#lab-event-preview').addEventListener('click',e=>{const b=e.target.closest('[data-open-event]');if(b)openEvent(b.dataset.openEvent);});
function eventCard(event,s){
  const now=Date.now()+clockOffset,generatorIndex=GENERATORS.findIndex(g=>g.id===event.generatorId),unlocked=s.generators[generatorIndex]>0,cooldown=Math.max(0,(s.eventCooldowns?.[event.id]||0)-now),active=s.activeEvent?.eventId===event.id;
  return `<article class="event-card ${unlocked?'unlocked':''} ${event.source==='world'?'world-exclusive':''}"><div class="event-card-top"><img src="./assets/original/${ORIGINAL_ICONS[generatorIndex]}" alt="" width="56" height="56"><span class="event-level">${event.source==='world'?'СОБЫТИЕ МИРА':`ЭТАП ${generatorIndex}`}</span></div><h2>${esc(event.name)}</h2><p>${esc(event.description)}</p><div class="event-rules">${esc(event.rules)}</div><div class="event-meta"><span>◷ ${event.durationSec} сек</span><span>${unlocked?'✓ Открыто':`Нужен: ${esc(GENERATORS[generatorIndex].name)}`}</span></div><button class="${unlocked?'secondary-button':'locked-event'}" data-event="${event.id}" ${!unlocked||(!active&&s.activeEvent)||cooldown>0&&!active?'disabled':''}>${active?'Продолжить →':!unlocked?'Сначала откройте этап':cooldown>0?`Снова через ${durationText(cooldown)}`:'Правила и награда →'}</button></article>`;
}
function renderEvents(s){
  $('#event-summary').textContent=`${s.eventStats?.wins||0} побед · ${s.eventStats?.losses||0} неудач`;$('#resume-event').hidden=!s.activeEvent;
  const stamp=JSON.stringify([s.generators,s.activeEvent?.id,Math.floor((Date.now()+clockOffset)/5000),s.eventCooldowns]);if(renderEvents.stamp===stamp)return;renderEvents.stamp=stamp;
  $('#events-grid').innerHTML=EVENTS.filter(e=>e.source!=='world').map(e=>eventCard(e,s)).join('');
}
function renderWorldEvents(s){
  const stamp=JSON.stringify([s.generators,s.activeEvent?.id,Math.floor((Date.now()+clockOffset)/5000),s.eventCooldowns,worldLocation]);if(renderWorldEvents.stamp===stamp)return;renderWorldEvents.stamp=stamp;
  const all=EVENTS.filter(e=>!worldLocation||worldLocation.generatorIndices.includes(GENERATORS.findIndex(g=>g.id===e.generatorId)));
  $('#world-location-title').textContent=worldLocation?`События: ${worldLocation.name}`:'События живого мира';$('#world-show-all-events').hidden=!worldLocation;
  $('#world-events-grid').innerHTML=all.length?all.sort((a,b)=>Number(b.source==='world')-Number(a.source==='world')).map(e=>eventCard(e,s)).join(''):'<p class="world-empty-events">Здесь жители собирают интегралы. Первые испытания откроются в школе.</p>';
}
$('#world-events-grid').addEventListener('click',e=>{const b=e.target.closest('[data-event]');if(b&&!cinematicActive)openEvent(b.dataset.event);});
$('#world-show-all-events').addEventListener('click',()=>{worldLocation=null;renderWorldEvents(projected());});
$('#events-grid').addEventListener('click',event=>{const button=event.target.closest('[data-event]');if(button)openEvent(button.dataset.event);});
$('#resume-event').addEventListener('click',()=>openEvent(state.activeEvent?.eventId));
function openEvent(id){
  const event=EVENTS.find(e=>e.id===id);if(!event||cinematicActive)return;selectedEvent=event;
  const active=getPublicEvent(state.activeEvent);
  if(active){renderChallenge(active);}else{
    eventRenderedId=null;$('#event-title').textContent=event.name;$('#event-timer').textContent=`${event.durationSec} сек`;
    const stats=getStats(state),reward=Math.max(event.rewardClicks*stats.clickPower,stats.cps*30),penalty=event.penaltyClicks*stats.clickPower;
    $('#event-body').innerHTML=`<p class="event-description">${esc(event.description)}</p><div class="event-rules-panel"><h3>Правила</h3><p>${esc(event.rules)}</p></div><div class="event-stakes"><div><span>Победа</span><strong>+${fmt(reward)} ∫</strong></div><div><span>Ошибка или время вышло</span><strong>−${fmt(penalty)} ∫</strong></div></div><p class="section-note">Награда: минимум ${event.rewardClicks} ваших кликов. Штраф: до ${event.penaltyClicks} кликов, в пределах текущего баланса. Таймер начнётся после нажатия кнопки. Повтор — через ${Math.round(event.cooldownSec/60)} минут.</p><button id="start-event" class="primary-button">Принять испытание →</button>`;
    $('#start-event').addEventListener('click',async()=>{const b=$('#start-event');b.disabled=true;b.textContent='Начинаем…';if(await act({type:'event_start',itemId:event.id})){renderChallenge(getPublicEvent(state.activeEvent));}else if(b.isConnected){b.disabled=false;b.textContent='Попробовать снова';}});
  }
  if(!$('#event-dialog').open)$('#event-dialog').showModal();
}
function renderChallenge(active){
  if(!active)return;eventRenderedId=active.id;eventAnswers=[];$('#event-title').textContent=active.name;$('#event-timer').textContent=durationText(active.deadline-(Date.now()+clockOffset));
  let fields='';
  if(active.kind==='quiz')fields=active.prompts.map((q,i)=>`<fieldset class="quiz-question"><legend><span>${i+1}.</span> ${esc(q.prompt)}</legend><div class="quiz-options">${q.options.map((o,j)=>`<label><input type="radio" name="question-${i}" value="${j}" required><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`).join('');
  else if(active.kind==='reverse')fields=`<p>${esc(active.prompts[0]?.prompt||'Запомните последовательность и запишите её в обратном порядке.')}</p><div id="memory-preview" class="memory-preview">${esc(Array.isArray(active.data.digits)?active.data.digits.join(' '):active.data.digits)}</div><label class="field-label" for="memory-answer">Последовательность в обратном порядке</label><input id="memory-answer" type="text" inputmode="numeric" autocomplete="off" required placeholder="Ваш ответ">`;
  else if(active.kind==='sort')fields=`<p>${esc(active.prompts[0]?.prompt||'Нажмите на числа в порядке возрастания.')}</p><div class="sort-options">${active.data.numbers.map((n,i)=>`<button type="button" class="secondary-button" data-sort-index="${i}">${esc(n)}</button>`).join('')}</div><div id="sort-answer" class="sort-answer">Ваша последовательность появится здесь</div><button id="sort-reset" type="button" class="text-button">Начать последовательность заново</button>`;
  $('#event-body').innerHTML=`<form id="event-answer-form">${fields}<p class="section-note">Свернуть окно можно, но таймер продолжит идти.</p><button type="submit" class="primary-button">Проверить ответ →</button></form>`;
  if(active.kind==='sort'){
    $$('#event-body [data-sort-index]').forEach(b=>b.addEventListener('click',()=>{eventAnswers.push(active.data.numbers[Number(b.dataset.sortIndex)]);b.disabled=true;$('#sort-answer').textContent=eventAnswers.join(' → ');}));
    $('#sort-reset').addEventListener('click',()=>{eventAnswers=[];$$('#event-body [data-sort-index]').forEach(b=>b.disabled=false);$('#sort-answer').textContent='Ваша последовательность появится здесь';});
  }
  $('#event-answer-form').addEventListener('submit',async e=>{e.preventDefault();let answers;
    if(active.kind==='quiz')answers=active.prompts.map((_,i)=>Number(new FormData(e.target).get(`question-${i}`)));
    else if(active.kind==='reverse')answers=[$('#memory-answer').value.replace(/\s/g,'')];
    else{answers=eventAnswers;if(answers.length!==active.data.numbers.length){toast('Выберите все числа');return;}}
    const b=e.target.querySelector('[type="submit"]');b.disabled=true;
    if(await act({type:'event_answer',itemId:active.id,answers}))showEventResult(state.lastEventResult);else if(b.isConnected)b.disabled=false;
  });
}
function showEventResult(result){
  if(!result)return;eventResultSeen=result.id;eventRenderedId=null;$('#event-timer').textContent=result.outcome==='win'?'✓':'×';
  $('#event-body').innerHTML=`<div class="event-result ${result.outcome==='win'?'win':'loss'}"><span>${result.outcome==='win'?'✦':'⌁'}</span><h3>${result.outcome==='win'?'Гипотеза подтверждена!':result.outcome==='timeout'?'Время вышло.':'В этот раз не сошлось.'}</h3><strong>${result.outcome==='win'?`+${fmt(result.reward)}`:`−${fmt(result.penalty)}`} ∫</strong><p>${result.outcome==='win'?'Награда уже в вашей лаборатории.':'Эксперименты бывают разными. Новая попытка откроется после перерыва.'}</p><button type="button" class="primary-button" id="finish-event">${currentPage==='world'?'Вернуться в мир':'Продолжить игру'}</button></div>`;
  $('#finish-event').addEventListener('click',()=>$('#event-dialog').close());renderEvents(projected());
}
function updateEventTimer(){
  const active=getPublicEvent(state.activeEvent),now=Date.now()+clockOffset;
  if($('#event-dialog').open&&active&&eventRenderedId===active.id){
    $('#event-timer').textContent=durationText(active.deadline-now);$('#event-timer').classList.toggle('urgent',active.deadline-now<10000);
    if(active.kind==='reverse'&&$('#memory-preview')&&now>=active.data.memorizeUntil)$('#memory-preview').textContent='• • • •';
    if(now>=active.deadline){const b=$('#event-answer-form [type="submit"]');if(b)b.disabled=true;if(mode==='cloud'&&timeoutRefreshId!==active.id){timeoutRefreshId=active.id;setTimeout(()=>{if(!busy)request('/state').then(data=>acceptPlayer(data.player)).catch(()=>{});},250);}}
  }
  if(!active&&state.lastEventResult&&state.lastEventResult.id!==eventResultSeen){
    eventResultSeen=state.lastEventResult.id;if($('#event-dialog').open&&eventRenderedId)showEventResult(state.lastEventResult);
    else if(state.lastEventResult.at>=Date.now()+clockOffset-30000)toast(state.lastEventResult.outcome==='win'?`Испытание пройдено: +${fmt(state.lastEventResult.reward)} ∫`:`Испытание завершено: −${fmt(state.lastEventResult.penalty)} ∫`);
  }
}
function updateMusic(){const b=$('#music-button');b.classList.toggle('playing',music.playing);b.setAttribute('aria-pressed',String(music.playing));b.setAttribute('aria-label',music.playing?'Выключить музыку':'Включить музыку');b.title=music.playing?'Выключить музыку':'Включить музыку';b.textContent=music.playing?'Ⅱ':'▶';}
$('#music-button').addEventListener('click',async()=>{resumeMusicAfterVisibility=false;try{await music.toggle();updateMusic();}catch{toast('Браузер не смог включить музыку. Попробуйте ещё раз.');}});
$('#music-volume').value=musicVolume;$('#music-volume-value').textContent=`${musicVolume}%`;
$('#music-volume').addEventListener('input',e=>{musicVolume=Number(e.target.value);music.setVolume(musicVolume/100);$('#music-volume-value').textContent=`${musicVolume}%`;save();});
$('#open-events')?.addEventListener('click',()=>document.querySelector('[data-page="events"]').click());
const clickEffects=createClickEffects({reactor:$('.reactor-panel'),button:$('#integral-button'),stage:$('#integral-stage'),rain:$('#formula-rain'),ring:$('#cursors-ring')});
const world=createLabWorld($('#world-canvas'),{onInspect:resident=>toast(`${resident.name} ×${fmt(resident.count,0)} · ${resident.task}`),onLocation:location=>{
  if(cinematicActive)return;worldLocation=location;renderWorldEvents(projected());expandWorld(false);$('#world-events').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}});
function updateWorldPause(){world.setPaused(worldPaused);$('#world-pause').setAttribute('aria-pressed',String(worldPaused));$('#world-pause').textContent=worldPaused?'▶':'Ⅱ';$('#world-pause').setAttribute('aria-label',worldPaused?'Оживить мир':'Приостановить мир');$('#world-pause').title=worldPaused?'Оживить мир':'Приостановить мир';}
$('#world-pause').addEventListener('click',()=>{worldPaused=!worldPaused;updateWorldPause();save();});
function expandWorld(value){$('#world-widget').classList.toggle('expanded',value);$('#world-expand').setAttribute('aria-expanded',String(value));$('#world-expand').setAttribute('aria-label',value?'Свернуть мир':'Развернуть мир на весь экран');$('#world-expand').textContent=value?'×':'⛶';world.resize();}
$('#world-expand').addEventListener('click',()=>expandWorld(!$('#world-widget').classList.contains('expanded')));
document.addEventListener('keydown',e=>{if(e.key==='Escape')expandWorld(false);});
updateWorldPause();updateSound();updateMusic();render(true);init();
