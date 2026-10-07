import test from 'node:test';
import assert from 'node:assert/strict';
import {describeCloudError,rejectedCloudAction,shouldAcceptCloudPlayer} from '../cloud-connection.mjs';

test('cloud errors distinguish authentication, permission, throttling, storage and server failures',()=>{
  const cases=[
    [{status:401},'unauthorized','Ключ не принят','error'],
    [{code:'unauthorized'},'unauthorized','Ключ не принят','error'],
    [{status:403},'forbidden','Доступ отклонён','error'],
    [{code:'origin_forbidden'},'forbidden','Доступ отклонён','error'],
    [{status:429},'rate_limited','Пауза подключения','warning'],
    [{status:503},'storage_unavailable','Облако недоступно','warning'],
    [{code:'storage_unavailable'},'storage_unavailable','Облако недоступно','warning'],
    [{status:500},'server_error','Сервер недоступен','warning'],
    [{status:502},'server_error','Сервер недоступен','warning'],
  ];
  for(const [error,code,title,kind] of cases){
    const result=describeCloudError(error);assert.equal(result.code,code);assert.equal(result.title,title);assert.equal(result.kind,kind);
    assert.ok(result.message.length>0);assert.ok(Number.isFinite(result.retryDelayMs)&&result.retryDelayMs>=0);
  }
  const unauthorized=describeCloudError({status:401});
  assert.match(unauthorized.message,/Ключ сохранён в этом браузере/);assert.match(unauthorized.message,/восстановите доступ/);assert.match(unauthorized.message,/новую учётную запись не нужно/);
  assert.ok(describeCloudError({status:429}).retryDelayMs>=60_000);
});

test('transport errors distinguish timeout, invalid response, offline and generic network failures',()=>{
  for(const error of [{code:'timeout'},{code:'ETIMEDOUT'},{name:'AbortError'},{name:'TimeoutError'}])assert.equal(describeCloudError(error).title,'Сервер не ответил');
  assert.equal(describeCloudError({code:'invalid_response'}).title,'Ошибка ответа');
  for(const status of [404,405])assert.equal(describeCloudError({status}).code,'invalid_response');
  assert.equal(describeCloudError({code:'offline'}).title,'Нет интернета');
  assert.equal(describeCloudError(new TypeError('Failed to fetch'),{online:false}).code,'offline');
  assert.equal(describeCloudError({name:'AbortError'},{online:false}).code,'offline');
  assert.equal(describeCloudError({status:401},{online:false}).code,'unauthorized');
  for(const error of [undefined,null,{},new TypeError('Failed to fetch'),{code:'network'}])assert.equal(describeCloudError(error).title,'Нет связи с сервером');
});

test('messages never echo secrets, untrusted error text, unknown codes or claims about a lost or banned account',()=>{
  const secret='ir_PRIVATE_RECOVERY_KEY',untrusted=`<img onerror="alert(1)">${secret}: profile deleted, account banned`;
  const errors=[401,403,429,503,500,404,0].map(status=>({status,code:secret,message:untrusted}));
  errors.push({code:'timeout',message:untrusted},{code:'invalid_response',message:untrusted},{code:'offline',message:untrusted});
  for(const error of errors){
    const result=describeCloudError(error),serialized=JSON.stringify(result);
    assert.ok(!serialized.includes(secret));assert.ok(!serialized.includes('<img'));assert.ok(!serialized.includes('deleted'));assert.ok(!serialized.includes('banned'));
    assert.ok(!/заблокирован|удалён|удален|профиль пропал|забанен/i.test(serialized));
    assert.deepEqual(Object.keys(result).sort(),['code','kind','message','retryDelayMs','title']);
  }
});

test('only definitive 400, 409 and 422 action rejections can drop a pending action',()=>{
  for(const status of [400,409,422])assert.equal(rejectedCloudAction({status}),true);
  for(const status of [0,200,401,403,404,405,408,429,500,502,503,504])assert.equal(rejectedCloudAction({status}),false);
  for(const error of [undefined,null,{},new Error('400'),{code:400},{status:'400'},{status:NaN}])assert.equal(rejectedCloudAction(error),false);
});

test('the first authoritative response ignores a forged cached revision and establishes a fresh session watermark',()=>{
  const forgedCache={id:'profile-a',revision:Number.MAX_SAFE_INTEGER,balance:1e100};
  const player={id:'profile-a',revision:1,balance:10},accepted=null;
  assert.ok(forgedCache.revision>player.revision);
  assert.equal(shouldAcceptCloudPlayer(player,accepted),true);
  assert.equal(shouldAcceptCloudPlayer({...player,revision:0},null),true);
  // Explicitly switching accounts starts a new session rather than sharing a watermark.
  assert.equal(shouldAcceptCloudPlayer({id:'profile-b',revision:0},null),true);
});

test('a session accepts equal/newer server revisions and rejects stale or other-profile replies',()=>{
  const accepted=Object.freeze({id:'profile-a',revision:12});
  assert.equal(shouldAcceptCloudPlayer({id:'profile-a',revision:13},accepted),true);
  assert.equal(shouldAcceptCloudPlayer({id:'profile-a',revision:12},accepted),true);
  assert.equal(shouldAcceptCloudPlayer({id:'profile-a',revision:11},accepted),false);
  assert.equal(shouldAcceptCloudPlayer({id:'profile-b',revision:1000},accepted),false);
  assert.deepEqual(accepted,{id:'profile-a',revision:12});
});

test('malformed player versions and invalid watermarks cannot replace a confirmed profile',()=>{
  for(const player of [null,undefined,[],{}, {id:'',revision:0},{id:' ',revision:0},{id:42,revision:0},{id:'a'}, {id:'a',revision:-1},{id:'a',revision:1.5},{id:'a',revision:'2'},{id:'a',revision:Infinity},{id:'a',revision:Number.MAX_SAFE_INTEGER+1}])assert.equal(shouldAcceptCloudPlayer(player,null),false);
  assert.equal(shouldAcceptCloudPlayer({id:'a',revision:1},{id:'a',revision:NaN}),false);
  assert.equal(shouldAcceptCloudPlayer({id:'a',revision:1},{}),false);
});
