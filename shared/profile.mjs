// Shared profile choices: the server accepts only these complete emoji strings.
export const DEFAULT_EMOJI='🧠';
export const PROFILE_EMOJIS=Object.freeze([
  DEFAULT_EMOJI,'🧪','🔬','🧬','🤖','🚀','🌌','✨',
  '⚛️','📐','🦉','🐙','🦊','🐱','🐼','🐸',
]);
export const isProfileEmoji=value=>typeof value==='string'&&PROFILE_EMOJIS.includes(value);
// Display fallback for old saves; API writes validate explicitly instead.
export const profileEmoji=value=>isProfileEmoji(value)?value:DEFAULT_EMOJI;

// Names are entered deliberately; an empty field never creates an anonymous account.
export function normalizeNickname(value){
  return typeof value==='string'?value.normalize('NFKC').trim().replace(/\p{Zs}+/gu,' '):'';
}
export function nicknameValidationError(value){
  if(typeof value!=='string')return 'Введи имя участника.';
  const name=normalizeNickname(value);
  if([...name].length<2||[...name].length>24||/[\p{Cc}\p{Cf}]/u.test(value)||/[<>@/\\]/u.test(name))return 'Имя: от 2 до 24 символов, без ссылок и адресов.';
  return '';
}
// Compatibility characters, case and spacing cannot reserve the same name twice.
// Uppercase first also folds cases such as ß/SS and Greek final sigma consistently.
export const nicknameKey=value=>normalizeNickname(value).toUpperCase().toLowerCase().normalize('NFKC');
