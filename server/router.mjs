import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { GENERATORS, UPGRADES, createState, settle, applyAction, getStats, priceFor, upgradeAvailable, EconomyError } from '../shared/economy.mjs';
import { getPublicEvent, EventError } from '../shared/events.mjs';
import { DEFAULT_EMOJI, isProfileEmoji, profileEmoji, normalizeNickname, nicknameValidationError, nicknameKey } from '../shared/profile.mjs';

const PREFIX='/integrals-api';
const TOKEN_RE=/^ir_[A-Za-z0-9_-]{43}$/;
export const ACTION_WINDOW_MS=15*60*1000;
const ACTION_FUTURE_MS=60*1000;
const ACTION_ID_RE=/^(\d{1,16})-([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
class ApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const reject=(status,code,message)=>{throw new ApiError(status,code,message);};
function nickname(value,fallback){
  if(value===undefined&&fallback!==undefined)return fallback;
  const error=nicknameValidationError(value);
  if(error)reject(400,'invalid_nickname',error);
  return normalizeNickname(value);
}
function emoji(value,fallback=DEFAULT_EMOJI){
  if(value===undefined)return profileEmoji(fallback);
  if(!isProfileEmoji(value))reject(400,'invalid_emoji','Выбери эмодзи из предложенного списка.');
  return value;
}
async function bodyJSON(req){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))reject(415,'json_required','Нужен JSON-запрос.');
  if(Number(req.headers['content-length']||0)>2048)reject(413,'body_too_large','Запрос слишком большой.');
  return new Promise((resolve,rejectPromise)=>{
    let size=0,chunks=[],finished=false;
    const timer=setTimeout(()=>done(new ApiError(408,'body_timeout','Время ожидания запроса истекло.')),5000);timer.unref();
    const done=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);req.off('data',onData);req.off('end',onEnd);req.off('error',onError);req.off('aborted',onAborted);if(error){req.resume();rejectPromise(error);}else resolve(value);};
    const onData=chunk=>{size+=chunk.length;if(size>2048){done(new ApiError(413,'body_too_large','Запрос слишком большой.'));return;}chunks.push(chunk);};
    const onEnd=()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();done(null,value);}catch{done(new ApiError(400,'invalid_json','Некорректный JSON.'));}};
    const onError=()=>done(new ApiError(400,'request_error','Запрос прерван.'));
    const onAborted=()=>done(new ApiError(400,'request_aborted','Запрос прерван.'));
    req.on('data',onData);req.on('end',onEnd);req.on('error',onError);req.on('aborted',onAborted);
  });
}
function publicPlayer(row,state,now){
  return {economyVersion:state.economyVersion,revision:state.revision||0,id:row.public_id,nickname:row.display_nickname||row.nickname,emoji:profileEmoji(row.emoji),listed:!!row.listed,serverTime:now,lastSeen:state.lastSeen,lastSettled:state.lastSettled,balance:state.balance,totalEarned:state.totalEarned,runEarned:state.runEarned,clicks:state.clicks,generators:state.generators,upgrades:state.upgrades,achievements:state.achievements||[],achievementRecords:state.achievementRecords||{},activeEvent:getPublicEvent(state.activeEvent),eventCooldowns:state.eventCooldowns||{},eventStats:state.eventStats||{wins:0,losses:0},lastEventResult:state.lastEventResult||null,prestige:state.prestige,prestigeCount:state.prestigeCount,golden:state.golden,offlineEarned:state.offlineEarned,stats:getStats(state),generatorPrices:GENERATORS.map((g,i)=>priceFor(g.id,state.generators[i])),availableUpgrades:UPGRADES.filter(u=>upgradeAvailable(state,u)).map(u=>u.id)};
}
const DEFAULT_ORIGIN_ALLOWED=origin=>!origin||origin==='https://blumbutta.github.io'||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

/** Only claims /integrals-api routes; all other games retain their existing handlers. */
export function createIntegralsHandler({dbPath=process.env.INTEGRALS_DB_PATH,originAllowed=DEFAULT_ORIGIN_ALLOWED,now=Date.now}={}){
  let db=null,closed=false;
  // Production must explicitly select a persistent disk. Never silently lose player saves.
  const configured=typeof dbPath==='string'&&dbPath.length>0&&
    (process.env.NODE_ENV!=='production'||(dbPath!==':memory:'&&isAbsolute(dbPath)));
  if(configured){
    try{
      if(dbPath!==':memory:')mkdirSync(dirname(dbPath),{recursive:true});
      db=new DatabaseSync(dbPath,{timeout:5000});
      db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS integrals_players (
          id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE,
          nickname TEXT NOT NULL, nickname_key TEXT, display_nickname TEXT, emoji TEXT NOT NULL DEFAULT '${DEFAULT_EMOJI}', listed INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL,
          total_earned REAL NOT NULL DEFAULT 0, prestige REAL NOT NULL DEFAULT 0,
          click_tokens REAL NOT NULL DEFAULT 24, click_refill INTEGER NOT NULL,
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS integrals_actions (
          player_id INTEGER NOT NULL REFERENCES integrals_players(id), action_id TEXT NOT NULL,
          fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL,
          PRIMARY KEY(player_id,action_id)
        );
        CREATE INDEX IF NOT EXISTS integrals_ranking ON integrals_players(listed,total_earned DESC);
        CREATE INDEX IF NOT EXISTS integrals_action_expiry ON integrals_actions(created_at);`);
      // Additive migrations preserve profile IDs, recovery hashes, state and receipts.
      tx(()=>{
        const columns=db.prepare('PRAGMA table_info(integrals_players)').all();
        if(!columns.some(column=>column.name==='emoji'))db.exec(`ALTER TABLE integrals_players ADD COLUMN emoji TEXT NOT NULL DEFAULT '${DEFAULT_EMOJI}'`);
        if(!columns.some(column=>column.name==='nickname_key'))db.exec('ALTER TABLE integrals_players ADD COLUMN nickname_key TEXT');
        if(!columns.some(column=>column.name==='display_nickname'))db.exec('ALTER TABLE integrals_players ADD COLUMN display_nickname TEXT');
        const rows=db.prepare('SELECT id,nickname,nickname_key FROM integrals_players ORDER BY created_at,id').all();
        const claimed=new Set(rows.filter(row=>row.nickname_key!==null).map(row=>row.nickname_key));
        const reserved=new Set([...claimed,...rows.map(row=>nicknameKey(row.nickname))]);
        const update=db.prepare('UPDATE integrals_players SET nickname_key=?,display_nickname=? WHERE id=?');
        for(const row of rows){
          if(row.nickname_key!==null)continue;
          const original=normalizeNickname(row.nickname);let display=original,key=nicknameKey(display),attempt=0;
          // Only ambiguous old names gain a stable visible suffix. The original
          // nickname remains stored until that player deliberately chooses a new one.
          if(claimed.has(key)){
            do{
              const suffix=` · ${row.id.toString(36)}${attempt?'-'+attempt:''}`;
              display=[...original].slice(0,24-[...suffix].length).join('')+suffix;key=nicknameKey(display);attempt++;
            }while(reserved.has(key));
          }
          update.run(key,display,row.id);claimed.add(key);reserved.add(key);
        }
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS integrals_nickname_unique ON integrals_players(nickname_key)');
      });
    }catch{
      try{db?.close();}catch{}db=null;
      // No path, SQL, request body or credentials are emitted to logs.
      console.error('Integrals storage is unavailable; its API will return 503.');
    }
  }
  const ipLimits=new Map();
  let lastPrune=-Infinity;
  function pruneExpired(t){
    if(t-lastPrune<60_000)return;
    db.prepare('DELETE FROM integrals_actions WHERE rowid IN (SELECT rowid FROM integrals_actions WHERE created_at < ? ORDER BY created_at LIMIT 5000)').run(t-ACTION_WINDOW_MS);
    lastPrune=t;
  }
  function limit(req,kind){
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
    const key=kind+':'+ip,t=now(),windowMs=kind==='create'?3600000:60000,max=kind==='create'?20:900;
    let bucket=ipLimits.get(key);
    if(!bucket||t>=bucket.expires){bucket={count:0,expires:t+windowMs};ipLimits.set(key,bucket);}
    if(++bucket.count>max)reject(429,'request_limit','Слишком много запросов. Попробуй позже.');
    if(ipLimits.size>10000){for(const [k,b] of ipLimits){if(b.expires<=t)ipLimits.delete(k);}if(ipLimits.size>10000)ipLimits.delete(ipLimits.keys().next().value);}
  }
  function auth(req){
    const header=req.headers.authorization||'';
    if(!header.startsWith('Bearer ')||!TOKEN_RE.test(header.slice(7)))reject(401,'unauthorized','Нужен код восстановления профиля.');
    const row=db.prepare('SELECT * FROM integrals_players WHERE token_hash = ?').get(hash(header.slice(7)));
    if(!row)reject(401,'unauthorized','Код восстановления не найден.');
    return row;
  }
  function tx(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  function availableNickname(name,playerId=null){
    const key=nicknameKey(name),owner=db.prepare('SELECT id FROM integrals_players WHERE nickname_key=?').get(key);
    if(owner&&owner.id!==playerId)reject(409,'nickname_taken','Это имя уже занято. Выбери другое имя участника.');
    return key;
  }
  function save(row,state,t){
    db.prepare('UPDATE integrals_players SET state=?, nickname=?, nickname_key=?, display_nickname=?, emoji=?, listed=?, total_earned=?, prestige=?, click_tokens=?, click_refill=?, updated_at=? WHERE id=?').run(JSON.stringify(state),row.nickname,row.nickname_key,row.display_nickname,profileEmoji(row.emoji),row.listed,state.totalEarned,state.prestige,row.click_tokens,row.click_refill,t,row.id);
  }
  function playerOperation(req,operation){
    return tx(()=>{
      const row=auth(req),state=JSON.parse(row.state),t=Math.max(now(),state.lastSettled);
      settle(state,t);const offlineEarned=state.offlineEarned;
      operation?.(row,state,t);
      state.lastSeen=t;state.offlineEarned=offlineEarned;state.revision=(state.revision||0)+1;
      save(row,state,t);return {player:publicPlayer(row,state,t)};
    });
  }
  const json=(res,status,data)=>{if(res.writableEnded||res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  async function route(req,res,path,search){
    const origin=req.headers.origin;
    if(origin&&!originAllowed(origin))reject(403,'origin_forbidden','Этот источник не разрешён.');
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){
      res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Max-Age','600');res.writeHead(204);res.end();return;
    }
    if(!db||closed)reject(503,'storage_unavailable','Облачное сохранение временно недоступно. Локальный прогресс работает.');
    limit(req,'request');
    pruneExpired(now());
    if(path==='/health'&&req.method==='GET'){json(res,200,{ok:true,game:'integrals-remake',storage:'persistent',rankingPeriods:['all'],profileNames:'unique-required',economyVersion:2});return;}
    if(path==='/players'&&req.method==='POST'){
      limit(req,'create');const body=await bodyJSON(req);
      if(Object.keys(body).some(k=>!['nickname','emoji'].includes(k)))reject(400,'invalid_fields','Передано неизвестное поле.');
      const t=now(),token='ir_'+randomBytes(32).toString('base64url'),publicId=randomUUID();
      const name=nickname(body.nickname),selectedEmoji=emoji(body.emoji),state=createState(t);
      const row=tx(()=>{
        const nameKey=availableNickname(name);
        const result=db.prepare('INSERT INTO integrals_players (public_id,token_hash,nickname,nickname_key,display_nickname,emoji,state,click_refill,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(publicId,hash(token),name,nameKey,name,selectedEmoji,JSON.stringify(state),t,t,t);
        return db.prepare('SELECT * FROM integrals_players WHERE id=?').get(result.lastInsertRowid);
      });
      json(res,201,{token,player:publicPlayer(row,state,t)});return;
    }
    if(path==='/state'&&req.method==='GET'){json(res,200,playerOperation(req));return;}
    if(path==='/action'&&req.method==='POST'){
      const action=await bodyJSON(req);
      if(Object.keys(action).some(k=>!['id','type','amount','itemId','answers'].includes(k)))reject(400,'invalid_fields','Передано неизвестное поле.');
      const matched=typeof action.id==='string'&&ACTION_ID_RE.exec(action.id);
      if(!matched)reject(400,'invalid_action_id','Нужен идентификатор действия вида timestamp-UUID.');
      const actionTime=Number(matched[1]),currentTime=now();
      if(!Number.isSafeInteger(actionTime)||actionTime<currentTime-ACTION_WINDOW_MS)reject(409,'action_expired','Действие старше 15 минут и больше не может быть отправлено.');
      if(actionTime>currentTime+ACTION_FUTURE_MS)reject(409,'action_from_future','Обнови связь с сервером: часы действия слишком далеко в будущем.');
      const canonical=JSON.stringify({type:action.type,amount:action.amount,itemId:action.itemId,answers:action.answers}),fingerprint=hash(canonical);
      const result=playerOperation(req,(row,state,t)=>{
        const previous=db.prepare('SELECT fingerprint FROM integrals_actions WHERE player_id=? AND action_id=?').get(row.id,action.id);
        if(previous){if(previous.fingerprint!==fingerprint)reject(409,'action_conflict','Этот идентификатор уже использован для другого действия.');return;}
        if(action.type==='click'){
          const amount=action.amount??1;
          if(!Number.isInteger(amount)||amount<1||amount>24)reject(400,'invalid_amount','За один запрос допустимо от 1 до 24 кликов.');
          const tokens=Math.min(24,row.click_tokens+Math.max(0,t-row.click_refill)*12/1000);
          if(tokens+1e-9<amount)reject(429,'click_limit','Лимит: 12 кликов в секунду.');
          row.click_tokens=Math.max(0,tokens-amount);row.click_refill=t;
        }
        applyAction(state,action,t);
        db.prepare('INSERT INTO integrals_actions (player_id,action_id,fingerprint,created_at) VALUES (?,?,?,?)').run(row.id,action.id,fingerprint,actionTime);
      });
      json(res,200,result);return;
    }
    if(path==='/profile'&&req.method==='PATCH'){
      const body=await bodyJSON(req);
      if(Object.keys(body).some(k=>!['nickname','listed','emoji'].includes(k)))reject(400,'invalid_fields','Передано неизвестное поле.');
      if(body.listed!==undefined&&typeof body.listed!=='boolean')reject(400,'invalid_listed','Настройка рейтинга должна быть true или false.');
      json(res,200,playerOperation(req,row=>{
        if(body.nickname!==undefined){const name=nickname(body.nickname);row.nickname_key=availableNickname(name,row.id);row.nickname=name;row.display_nickname=name;}
        row.emoji=emoji(body.emoji,row.emoji);if(body.listed!==undefined)row.listed=body.listed?1:0;
      }));return;
    }
    if(path==='/leaderboard'&&req.method==='GET'){
      const period=search.get('period')||'all';
      if(period!=='all')reject(400,'unsupported_period','Пока доступен общий рейтинг за всё время.');
      const entries=db.prepare("SELECT public_id AS id,COALESCE(display_nickname,nickname) AS nickname,emoji,total_earned AS totalEarned,json_extract(state,'$.balance') AS balance,prestige FROM integrals_players WHERE listed=1 ORDER BY total_earned DESC,created_at ASC,id ASC LIMIT 100").all().map((row,i)=>({...row,emoji:profileEmoji(row.emoji),rank:i+1}));
      json(res,200,{period:'all',entries,updatedAt:now()});return;
    }
    if(['/health','/players','/state','/action','/profile','/leaderboard'].includes(path))reject(405,'method_not_allowed','Этот метод не поддерживается.');
    reject(404,'not_found','Маршрут не найден.');
  }
  return {
    handle(req,res){
      let url;try{url=new URL(req.url,'http://localhost');}catch{return false;}
      if(url.pathname!==PREFIX&&!url.pathname.startsWith(PREFIX+'/'))return false;
      route(req,res,url.pathname.slice(PREFIX.length)||'/',url.searchParams).catch(error=>{
        const known=error instanceof ApiError||error instanceof EconomyError||error instanceof EventError;
        json(res,known?(error.status||400):500,{error:{code:known?error.code:'internal_error',message:known?error.message:'Не удалось обработать запрос. Повтори позже.'}});
      });return true;
    },
    close(){if(closed)return;closed=true;if(db){try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}finally{db.close();}}},
  };
}
