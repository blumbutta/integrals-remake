// Shared profile choices: the server accepts only these complete emoji strings.
export const DEFAULT_EMOJI='🧠';
export const PROFILE_EMOJIS=Object.freeze([
  DEFAULT_EMOJI,'🧪','🔬','🧬','🤖','🚀','🌌','✨',
  '⚛️','📐','🦉','🐙','🦊','🐱','🐼','🐸',
]);
export const isProfileEmoji=value=>typeof value==='string'&&PROFILE_EMOJIS.includes(value);
// Display fallback for old saves; API writes validate explicitly instead.
export const profileEmoji=value=>isProfileEmoji(value)?value:DEFAULT_EMOJI;
