export const WORLD_EVENTS=Object.freeze([
  {id:'school-olympiad',source:'world',generatorId:'abacus',name:'Школьная олимпиада',description:'Команда школьников готова к задачам со звёздочкой.',rules:'Три задачи: скобки, дробь и неизвестное. Выбери правильный ответ в каждой.',kind:'quiz',durationSec:90,rewardClicks:90,cooldownSec:300},
  {id:'portal-meteors',source:'world',generatorId:'dimension',name:'Метеорный поток',description:'Портал принёс шесть отметок космической обсерватории.',rules:'Расположи время появления шести метеоров по возрастанию, от самого раннего к позднему.',kind:'sort',durationSec:60,rewardClicks:600,cooldownSec:300},
  {id:'academic-discovery',source:'world',generatorId:'quantum',name:'Академическое открытие',description:'Профессор проверяет новую гипотезу об интегралах.',rules:'Три вопроса о площади, первообразной и постоянной интегрирования. Подтверди все три вывода.',kind:'quiz',durationSec:75,rewardClicks:320,cooldownSec:300},
]);
export const EVENTS = Object.freeze([
  {id:'school',generatorId:'abacus',name:'Контрольная',description:'Помоги школьнику решить три примера.',rules:'Три вопроса. Выбери правильный ответ в каждом.',kind:'quiz',durationSec:60,rewardClicks:40,cooldownSec:300},
  {id:'student',generatorId:'calculator',name:'Сессия',description:'Три производные до звонка.',rules:'Выбери производную каждой функции.',kind:'quiz',durationSec:45,rewardClicks:60,cooldownSec:300},
  {id:'teacher',generatorId:'algorithm',name:'Проверка работ',description:'Найди ошибки в чужих решениях.',rules:'В каждом вопросе укажи неверное равенство.',kind:'quiz',durationSec:35,rewardClicks:90,cooldownSec:300},
  {id:'computer',generatorId:'neuron',name:'Двоичный код',description:'Переведи сообщения компьютера.',rules:'Переведи три двоичных числа в десятичные.',kind:'quiz',durationSec:90,rewardClicks:120,cooldownSec:300},
  {id:'professor',generatorId:'quantum',name:'Научный семинар',description:'Подбери первообразные многочленов.',rules:'Выбери неопределённый интеграл каждого выражения.',kind:'quiz',durationSec:45,rewardClicks:180,cooldownSec:300},
  {id:'ai',generatorId:'singularity',name:'Обучение модели',description:'Найди закономерности в последовательностях.',rules:'Выбери следующее число в каждом ряду.',kind:'quiz',durationSec:30,rewardClicks:240,cooldownSec:300},
  {id:'portal',generatorId:'dimension',name:'Обратный сигнал',description:'Портал исказил три сигнала. Восстанови числа на входе.',rules:'Для каждого сигнала выбери исходное число. Операции выполняются по стрелкам слева направо. Чтобы восстановить вход, пройди цепочку справа налево, отменяя каждое действие. Все схемы остаются на экране.',kind:'quiz',durationSec:75,rewardClicks:360,cooldownSec:300},
  {id:'time',generatorId:'universe',name:'Хронология',description:'Верни числа на правильную временную линию.',rules:'Расположи шесть чисел по возрастанию.',kind:'sort',durationSec:45,rewardClicks:480,cooldownSec:300},
  {id:'thought',generatorId:'multiverse',name:'Главный вопрос',description:'Проверь логику Глубокой мысли.',rules:'Три логические задачи. Нужны три верных ответа.',kind:'quiz',durationSec:35,rewardClicks:720,cooldownSec:300},
  ...WORLD_EVENTS,
]);
const GENERATOR_IDS=['autoclick','abacus','calculator','algorithm','neuron','quantum','singularity','dimension','universe','multiverse','superintelligence'];
const randomInt=(lo,hi)=>lo+Math.floor(Math.random()*(hi-lo+1));
export class EventError extends Error {constructor(code,message){super(message);this.name='EventError';this.code=code;}}
function eventError(code,message){throw new EventError(code,message);}
function shuffle(values){const result=[...values];for(let i=result.length-1;i>0;i--){const j=randomInt(0,i);[result[i],result[j]]=[result[j],result[i]];}return result;}
function choice(prompt,answer,alternatives){
  const options=shuffle([...new Set([String(answer),...alternatives.map(String)])].slice(0,4));
  return {public:{prompt,options},answer:options.indexOf(String(answer))};
}
function question(kind,index){
  const a=randomInt(2,12),b=randomInt(2,9);
  if(kind==='portal'){
    const offset=randomInt(3,9),factor=randomInt(2,5),shift=randomInt(2,7);
    const input=index===2?a*factor+offset:randomInt(8,24);
    const steps=index===0?[`+ ${offset}`,`× ${factor}`]:index===1?[`× ${factor}`,`− ${offset}`]:[`− ${offset}`,`÷ ${factor}`,`+ ${shift}`];
    const output=index===0?(input+offset)*factor:index===1?input*factor-offset:a+shift;
    const q=choice(`? → ${steps.join(' → ')} → ${output}. Какое число поступило в портал?`,input,[input+1,input-1,input+factor]);
    q.public.circuit={steps,output};return q;
  }
  if(kind==='school-olympiad'){
    if(index===0)return choice(`${a} × (${b} + 2) = ?`,a*(b+2),[a*b+2,a+b+2,a*b*2]);
    if(index===1)return choice(`(${a*b} + ${b*2}) / ${b} = ?`,a+2,[a+b,a*2,a-1]);
    return choice(`Найди x: ${a}x + ${b} = ${a*3+b}`,3,[2,4,5]);
  }
  if(kind==='academic-discovery'){
    if(index===0)return choice(`Площадь под графиком y = ${2*a}x на отрезке [0; 1] равна…`,a,[2*a,a+1,a-1]);
    if(index===1)return choice(`Какая функция является первообразной для ${2*a}x?`,`${a}x² + C`,[`${2*a}x + C`,`${a}x + C`,`${2*a}x² + C`]);
    return choice('Чем могут отличаться две первообразные одной функции на одном интервале?','Постоянным слагаемым',['Произвольным множителем','Знаком производной','Любой функцией x']);
  }
  if(kind==='school'){
    const result=index===0?a+b:index===1?a*b:a+b-b;
    const prompt=index===0?`${a} + ${b} = ?`:index===1?`${a} × ${b} = ?`:`${a+b} − ${b} = ?`;
    return choice(prompt,result,[result+1,result-1,result+randomInt(2,8)]);
  }
  if(kind==='student'){
    if(index===0)return choice(`Найди производную f(x) = ${a}x²`,`${2*a}x`,[`${a}x`,`${2*a}x²`,`${a}`]);
    if(index===1)return choice(`Найди производную f(x) = ${a}x³`,`${3*a}x²`,[`${a}x²`,`${3*a}x³`,`${2*a}x`]);
    return choice(`Найди производную f(x) = ${a}x + ${b}`,a,[a+b,b,0]);
  }
  if(kind==='teacher')return choice('Какое равенство неверно?',`${a+b} − ${b} = ${a+1}`,[`${a} + ${b} = ${a+b}`,`${a} × ${b} = ${a*b}`,`${a}² = ${a*a}`]);
  if(kind==='computer'){
    const value=randomInt(5,63);return choice(`Переведи ${value.toString(2)}₂ в десятичную систему`,value,[value+2,value-2,value+8]);
  }
  if(kind==='professor'){
    const power=index+1,coefficient=a*(power+1),symbols={1:'x',2:'x²',3:'x³',4:'x⁴'};
    return choice(`∫ ${coefficient}${symbols[power]} dx = ?`,`${a}${symbols[power+1]} + C`,[`${coefficient}${symbols[power+1]} + C`,`${a}${symbols[power]} + C`,`${coefficient*power}${symbols[Math.max(1,power-1)]} + C`]);
  }
  if(kind==='ai'){
    const start=randomInt(1,8),step=randomInt(2,5);
    const numbers=index===1?[start,start*2,start*4,start*8]:index===2?[1,4,9,16]:[start,start+step,start+step*2,start+step*3];
    const next=index===1?start*16:index===2?25:start+step*4;
    return choice(`${numbers.join(', ')}, ?`,next,[next+1,next-1,next+step]);
  }
  const logic=[
    ['Все А — Б. Все Б — В. Что обязательно верно?','Все А — В',['Все В — А','Ни один А не В','Все Б — А']],
    ['Если идёт дождь, крыша мокрая. Крыша сухая. Что следует?','Дождь не идёт',['Дождь идёт','Крыши нет','Ничего не следует']],
    ['Аня выше Бори, Боря выше Веры. Кто ниже всех?','Вера',['Аня','Боря','Определить нельзя']],
    ['Ровно одно из двух утверждений верно. Первое ложно. Второе…','Истинно',['Ложно','Не существует','Может быть любым']],
    ['В ящике только красные и синие шары. Вынутый шар не красный. Какой он?','Синий',['Зелёный','Белый','Определить нельзя']],
  ];
  const row=logic[index];return choice(row[0],row[1],row[2]);
}
export function eventAvailable(state,eventId,now=Date.now()){
  const event=EVENTS.find(e=>e.id===eventId);
  return !!event&&!state.activeEvent&&(state.generators[GENERATOR_IDS.indexOf(event.generatorId)]||0)>0&&(state.eventCooldowns?.[eventId]||0)<=now;
}
export function getPublicEvent(event){
  if(!event)return null;
  return {id:event.id,eventId:event.eventId,kind:event.kind,name:event.name,deadline:event.deadline,startedAt:event.startedAt,reward:event.reward,penalty:event.penalty,prompts:event.prompts.map(p=>({...p,...(p.options?{options:[...p.options]}:{}),...(p.circuit?{circuit:{...p.circuit,steps:[...p.circuit.steps]}}:{})})),data:{...event.data,...(event.data.numbers?{numbers:[...event.data.numbers]}:{})}};
}
export function eventStakes(stats,definition){
  const reward=Math.max(definition.rewardClicks*stats.clickPower,stats.cps*30);
  return {reward,penalty:reward};
}
export function startEvent(state,eventId,stats,now=Date.now()){
  const definition=EVENTS.find(e=>e.id===eventId);
  if(!definition)eventError('unknown_event','Такого испытания нет.');
  if(state.activeEvent)eventError('event_active','Сначала заверши текущее испытание.');
  if((state.generators[GENERATOR_IDS.indexOf(definition.generatorId)]||0)<1)eventError('event_locked','Для испытания сначала купи нужного помощника.');
  if((state.eventCooldowns?.[eventId]||0)>now)eventError('event_cooldown','Испытание ещё готовится к следующему запуску.');
  let prompts=[],answers=[],data={};
  if(definition.kind==='quiz'){
    for(let i=0;i<3;i++){const q=question(eventId,i);prompts.push(q.public);answers.push(q.answer);}
  }else{
    const meteors=eventId==='portal-meteors';
    const numbers=new Set();while(numbers.size<6)numbers.add(randomInt(1,meteors?360:99));data={numbers:shuffle([...numbers])};prompts=[{prompt:meteors?'Расставь отметки появления метеоров по времени, от ранней к поздней (секунды).':'Расположи числа по возрастанию.'}];answers=[...numbers].sort((a,b)=>a-b);
  }
  const event={id:globalThis.crypto.randomUUID(),eventId,kind:definition.kind,name:definition.name,startedAt:now,deadline:now+definition.durationSec*1000,...eventStakes(stats,definition),prompts,data,_answers:answers};
  state.activeEvent=event;state.eventCooldowns||={};state.eventCooldowns[eventId]=now+definition.cooldownSec*1000;state.eventStats||={wins:0,losses:0};return event;
}
function resolve(state,outcome,now){
  const event=state.activeEvent;
  const reward=outcome==='win'?event.reward:0,penalty=outcome==='win'?0:Math.min(state.balance,event.penalty);
  if(reward){state.balance=Math.min(1e250,state.balance+reward);state.totalEarned=Math.min(1e250,state.totalEarned+reward);state.runEarned=Math.min(1e250,state.runEarned+reward);}
  else state.balance=Math.max(0,state.balance-penalty);
  state.eventStats||={wins:0,losses:0};state.eventStats[outcome==='win'?'wins':'losses']++;
  const result={id:event.id,eventId:event.eventId,outcome,reward,penalty,at:now};state.activeEvent=null;state.lastEventResult=result;return result;
}
export function settleEvent(state,now=Date.now()){
  if(state.activeEvent&&now>state.activeEvent.deadline)return resolve(state,'timeout',now);
  return null;
}
export function answerEvent(state,instanceId,answers,now=Date.now()){
  if(!state.activeEvent){
    if(state.lastEventResult?.id===instanceId&&state.lastEventResult.outcome==='timeout')return state.lastEventResult;
    eventError('event_unavailable','Активного испытания нет.');
  }
  if(instanceId!==state.activeEvent.id)eventError('event_mismatch','Ответ относится к другому испытанию.');
  const expired=settleEvent(state,now);if(expired)return expired;
  const event=state.activeEvent;
  if(!Array.isArray(answers)||answers.length!==event._answers.length||answers.some(value=>typeof value!=='string'&&typeof value!=='number'))eventError('invalid_answers','Заполни все ответы на испытание.');
  if(event.kind==='quiz'&&answers.some((value,i)=>!Number.isInteger(value)||value<0||value>=event.prompts[i].options.length))eventError('invalid_answers','Выбери по одному ответу на каждый вопрос.');
  if(event.kind==='reverse'&&(typeof answers[0]!=='string'||!/^\d{4}$/.test(answers[0])))eventError('invalid_answers','Нужно ввести ровно четыре цифры.');
  if(event.kind==='sort'&&answers.some(value=>!Number.isInteger(value)))eventError('invalid_answers','В последовательности должны быть целые числа.');
  return resolve(state,event._answers.every((value,i)=>answers[i]===value)?'win':'loss',now);
}
