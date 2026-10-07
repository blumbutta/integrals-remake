import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createState,migrateState} from '../shared/economy.mjs';
import {profileEmoji} from '../shared/profile.mjs';
import {describeCloudError,rejectedCloudAction,shouldAcceptCloudPlayer} from '../cloud-connection.mjs';

const appSource=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');

// Compile the real declarations rather than maintaining a second sync algorithm.
// Let the JS parser find the closing brace: templates and nested blocks can both
// contain braces, so counting characters would silently extract the wrong code.
function declaration(name){
  const start=appSource.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.notEqual(start,-1,`app.mjs declares ${name}`);
  for(let end=appSource.indexOf('}',start);end!==-1;end=appSource.indexOf('}',end+1)){
    const source=appSource.slice(start,end+1);
    try{new Script(`(${source})`);return source;}catch(error){if(error.name!=='SyntaxError')throw error;}
  }
  assert.fail(`Could not extract ${name} from app.mjs`);
}

const syncSource=[
  'request','reportCloudFailure','acceptPlayer','syncCloud','queueClicks',
  'flush','performFlush','beginSession',
].map(declaration).join('\n');

const PROFILE_ID='11111111-1111-4111-8111-111111111111';
const TOKEN='ir_test-key-that-must-survive-connection-failure';
const player=(revision=1,overrides={})=>({
  ...createState(),id:PROFILE_ID,revision,serverTime:Date.now(),
  nickname:'Тестовый исследователь',emoji:'🧠',listed:true,offlineEarned:0,...overrides,
});
const clickAction=()=>({id:`${Date.now()}-11111111-1111-4111-8111-111111111111`,type:'click',amount:3});
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

function harness(fetchHandler){
  const calls=[],statuses=[],banners=[],saved=[],timers=new Map(),elements=new Map();let timerId=0;
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{open:false,title:'',children:[],append(child){this.children.push(child);}});
    return elements.get(selector);
  };
  let context;
  context=createContext({
    AbortController,crypto:webcrypto,navigator:{onLine:true},
    API:'https://example.invalid/integrals-api',
    sessionEpoch:0,readOnlyTab:false,transitioning:false,cloudChecking:false,
    flushPromise:null,reconnectPromise:null,acceptedCloudPlayer:null,connectionProblem:null,
    nextCloudRetryAt:0,connected:false,busy:false,mode:'cloud',token:TOKEN,
    state:player(0),pending:[],clickBuffer:0,clockOffset:0,baseTime:Date.now(),
    nickname:'Исследователь',emoji:'🧠',listed:true,selectedCosmetic:'classic',prestigePage:0,
    earnedAchievements:new Set(),actionWaiters:new Map(),
    migrateState,profileEmoji,describeCloudError,rejectedCloudAction,shouldAcceptCloudPlayer,
    $:element,
    document:{createElement:()=>({addEventListener(){}})},
    setStatus(text,kind){statuses.push({text,kind});},
    showBanner(text){banners.push(text);},
    save(){saved.push(JSON.parse(JSON.stringify({state:context.state,pending:context.pending,token:context.token})));},
    render(){},showOffline(){},refreshAccountStatus(){},toast(){},
    // Timers are controlled, so timeout coverage never waits 15 real seconds.
    setTimeout(callback){timers.set(++timerId,callback);return timerId;},
    clearTimeout(id){timers.delete(id);},
    fetch(url,options){
      const call={path:new URL(url).pathname.replace('/integrals-api',''),options};calls.push(call);
      return fetchHandler(call,calls.length);
    },
  });
  new Script(syncSource,{filename:'app.mjs:cloud-sync-functions'}).runInContext(context);
  return {context,calls,statuses,banners,saved,timers};
}

test('an empty flush cannot claim cloud success; the first server reply replaces a forged cached revision',async()=>{
  const authoritative=player(3,{balance:42,totalEarned:42});
  const h=harness(()=>response(200,{player:authoritative}));
  h.context.state=player(Number.MAX_SAFE_INTEGER,{balance:1e100,totalEarned:1e100});

  // Exercise the worker too, so a guard in flush cannot hide a false success.
  await h.context.performFlush();await h.context.flush();
  assert.equal(h.context.connected,false);
  assert.equal(h.calls.length,0);
  assert.equal(h.statuses.some(status=>status.kind==='online'),false);

  assert.equal(await h.context.syncCloud(true),true);
  assert.equal(h.context.state.balance,42);
  assert.equal(h.context.state.revision,3);
  assert.equal(h.context.acceptedCloudPlayer.revision,3);
  assert.equal(h.context.connected,true);
  assert.equal(h.context.token,TOKEN);
  assert.deepEqual(h.calls.map(call=>call.path),['/state']);

  h.context.acceptPlayer(player(2,{balance:999}));
  assert.equal(h.context.state.balance,42,'an older reply in this session cannot roll back the confirmed profile');
});

test('auth, server, malformed HTTP and timeout failures retain the queued action and recovery key',async t=>{
  const cases=[
    ['401',()=>response(401,{error:{code:'unauthorized',message:'Rejected key'}}),'unauthorized'],
    ['500',()=>response(500,{error:{code:'internal_error',message:'Server error'}}),'server_error'],
    ['HTML 400',()=>({ok:false,status:400,json:async()=>{throw new SyntaxError('HTML, not JSON');}}),'invalid_response'],
    ['timeout',call=>new Promise((resolve,reject)=>call.options.signal.addEventListener('abort',()=>{
      const error=new Error('Aborted');error.name='AbortError';reject(error);
    },{once:true})),'timeout'],
  ];
  for(const [name,reply,code] of cases)await t.test(name,async()=>{
    const h=harness(reply),action=clickAction();h.context.pending=[action];h.context.connected=true;
    const work=h.context.flush();
    if(name==='timeout')for(const callback of [...h.timers.values()])callback();
    await work;
    assert.equal(h.context.pending.length,1);
    assert.equal(h.context.pending[0].id,action.id);
    assert.equal(h.context.pending[0].amount,3);
    assert.equal(h.context.token,TOKEN);
    assert.equal(h.context.connected,false);
    assert.equal(h.context.connectionProblem.code,code);
    assert.equal(h.context.busy,false);
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].path,'/action');
    assert.equal(h.calls[0].options.headers.Authorization,`Bearer ${TOKEN}`);
    assert.equal(h.statuses.some(status=>status.kind==='online'),false);
    assert.equal(h.timers.size,0);
  });
});

test('reconnection fetches authoritative state before sending the same queued action exactly once',async()=>{
  const stateReply=deferred(),action=clickAction();
  const h=harness(call=>{
    if(call.path==='/state')return stateReply.promise;
    assert.equal(call.path,'/action');
    assert.equal(JSON.parse(call.options.body).id,action.id);
    return response(200,{player:player(5,{balance:45,totalEarned:45,clicks:3})});
  });
  h.context.pending=[action];h.context.connected=true;
  const reconnect=h.context.syncCloud(true);
  assert.equal(h.context.syncCloud(true),reconnect,'manual and periodic retries share one attempt');
  await h.context.flush();
  assert.deepEqual(h.calls.map(call=>call.path),['/state'],'the regular flush timer cannot race the reconnect GET');

  stateReply.resolve(response(200,{player:player(4,{balance:42,totalEarned:42})}));
  assert.equal(await reconnect,true);
  await h.context.flush();
  assert.deepEqual(h.calls.map(call=>call.path),['/state','/action']);
  assert.equal(h.context.pending.length,0);
  assert.equal(h.context.state.balance,45);
  assert.equal(h.context.token,TOKEN);
  assert.equal(h.context.connected,true);
  assert.equal(h.context.busy,false);
  assert.equal(h.context.cloudChecking,false);
});

test('switching sessions invalidates an old reply without clearing the new account or its retry',async()=>{
  const oldReply=deferred(),newReply=deferred();
  const h=harness((call,count)=>{
    assert.equal(call.path,'/state');return count===1?oldReply.promise:newReply.promise;
  });
  const oldSync=h.context.syncCloud(true);
  h.context.beginSession();
  const nextToken='ir_another-test-account-key';h.context.token=nextToken;
  const nextPlayer=player(1,{id:'22222222-2222-4222-8222-222222222222',balance:77});
  h.context.state=nextPlayer;
  const newSync=h.context.syncCloud(true);

  oldReply.resolve(response(200,{player:player(999,{balance:999})}));
  assert.equal(await oldSync,false);
  assert.equal(h.context.token,nextToken);
  assert.equal(h.context.state.id,nextPlayer.id);
  assert.equal(h.context.state.balance,77);
  assert.equal(h.context.reconnectPromise,newSync,'the old finally cannot clear the new session retry');
  assert.equal(h.context.connected,false);
  assert.equal(h.context.connectionProblem,null,'a stale response is not a connection failure in the new session');

  newReply.resolve(response(200,{player:nextPlayer}));
  assert.equal(await newSync,true);
  assert.equal(h.context.acceptedCloudPlayer.id,nextPlayer.id);
  assert.equal(h.context.token,nextToken);
  assert.equal(h.calls[0].options.headers.Authorization,`Bearer ${TOKEN}`);
  assert.equal(h.calls[1].options.headers.Authorization,`Bearer ${nextToken}`);
});
