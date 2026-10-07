// Connection messages are intentionally fixed: server strings can contain secrets
// or untrusted content and must never become a profile/status message.
const HTTP_STATUS=error=>Number.isInteger(error?.status)?error.status:0;

export function describeCloudError(error,{online=true}={}){
  const status=HTTP_STATUS(error),code=error?.code;
  if(status===401||code==='unauthorized')return {
    code:'unauthorized',title:'Ключ не принят',kind:'error',retryDelayMs:0,
    message:'Ключ сохранён в этом браузере. Откройте профиль и восстановите доступ по действующему ключу. Создавать новую учётную запись не нужно.',
  };
  if(status===403||code==='origin_forbidden'||code==='forbidden')return {
    code:'forbidden',title:'Доступ отклонён',kind:'error',retryDelayMs:60_000,
    message:'Сервер отклонил запрос на подключение. Ключ остаётся в браузере. Попробуйте подключиться позже.',
  };
  if(status===429)return {
    code:'rate_limited',title:'Пауза подключения',kind:'warning',retryDelayMs:60_000,
    message:'Сервер просит подождать. Повторим подключение не раньше чем через минуту. Ключ менять не нужно.',
  };
  if(status===503||code==='storage_unavailable')return {
    code:'storage_unavailable',title:'Облако недоступно',kind:'warning',retryDelayMs:30_000,
    message:'Облачное сохранение сейчас недоступно. Ключ остаётся в браузере. Повторим подключение автоматически.',
  };
  if(status>=500)return {
    code:'server_error',title:'Сервер недоступен',kind:'warning',retryDelayMs:15_000,
    message:'На сервере возникла ошибка. Попробуем подключиться ещё раз. Ключ входа менять не нужно.',
  };
  if(code==='invalid_response'||status>=400)return {
    code:'invalid_response',title:'Ошибка ответа',kind:'error',retryDelayMs:30_000,
    message:'Сервер вернул ответ, который игра не смогла обработать. Повторим подключение. Ключ входа менять не нужно.',
  };
  // An explicit HTTP response above remains useful even if connectivity changed
  // immediately afterwards. Offline takes priority for transport-only failures.
  if(!online||code==='offline')return {
    code:'offline',title:'Нет интернета',kind:'warning',retryDelayMs:10_000,
    message:'Проверьте подключение к интернету. После восстановления связи попробуем войти с тем же ключом.',
  };
  if(code==='timeout'||code==='ETIMEDOUT'||error?.name==='AbortError'||error?.name==='TimeoutError')return {
    code:'timeout',title:'Сервер не ответил',kind:'warning',retryDelayMs:15_000,
    message:'Время ожидания ответа истекло. Повторим подключение с тем же ключом.',
  };
  return {
    code:'network',title:'Нет связи с сервером',kind:'warning',retryDelayMs:10_000,
    message:'Не удалось связаться с сервером. Проверьте соединение; игра попробует подключиться снова с тем же ключом.',
  };
}

// Only a definite rejection of this action permits removing it from the queue.
// Auth, routing, throttling and server failures preserve it for recovery/retry.
export function rejectedCloudAction(error){
  return [400,409,422].includes(HTTP_STATUS(error));
}

const validPlayerVersion=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  typeof value.id==='string'&&value.id.trim().length>0&&
  Number.isSafeInteger(value.revision)&&value.revision>=0;

/** accepted is a server-only session watermark, never a value loaded from storage. */
export function shouldAcceptCloudPlayer(player,accepted=null){
  if(!validPlayerVersion(player))return false;
  if(accepted===null)return true;
  return validPlayerVersion(accepted)&&player.id===accepted.id&&player.revision>=accepted.revision;
}
