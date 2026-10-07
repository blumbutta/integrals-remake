const motifs=[
  '<path d="M27 29h18M27 49h18M40 26c-10 0-5 26-14 26"/>',
  '<path d="m26 25 21 18-11 1-5 10-5-29Zm10 19 7 11"/>',
  '<path d="M20 48h32M24 48V34l12-8 12 8v14M29 35v9m7-9v9m7-9v9M20 31l16-11 16 11"/>',
  '<path d="M22 44c-2-12 11-17 14-10 3-7 16-2 14 10-1 9-11 12-14 5-3 7-13 4-14-5Z"/>',
  '<path d="m36 22 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z"/>',
  '<path d="M25 49h22M27 26h18M30 26v12l-9 12q15 10 30 0l-9-12V26M27 43h18"/>',
  '<circle cx="36" cy="39" r="14"/><path d="m28 39 5 5 12-12M36 19v-3M16 39h-3m43 0h3M36 59v3"/>',
];
export function achievementArtwork(achievement,index,unlocked){
  const category=achievement.id.startsWith('stage-')?2:achievement.id.includes('click')?1:achievement.id.includes('event')?6:achievement.id.includes('research')?5:achievement.id.includes('prestige')?3:index%motifs.length;
  const hue=(index*43+category*29+28)%360,id=`medal-${index}`,tone=unlocked?`hsl(${hue} 58% 58%)`:'#5b6d7a';
  return `<span class="achievement-medal ${unlocked?'medal-earned':'medal-locked'}" aria-hidden="true"><svg viewBox="0 0 72 86" fill="none"><defs><linearGradient id="${id}" x1="12" y1="12" x2="60" y2="66" gradientUnits="userSpaceOnUse"><stop stop-color="${unlocked?'#fff2bd':'#9faeb7'}"/><stop offset=".45" stop-color="${tone}"/><stop offset="1" stop-color="${unlocked?'#786035':'#455767'}"/></linearGradient><radialGradient id="${id}-core"><stop stop-color="${tone}"/><stop offset="1" stop-color="#102633"/></radialGradient></defs><path d="m18 51-5 31 13-7 8 7 4-31M36 51l3 31 9-8 12 6-7-29" fill="${tone}" stroke="#091824" stroke-width="2"/><path d="M36 5 58 15 65 39 56 61 36 70 15 60 7 39 15 16Z" fill="url(#${id})" stroke="${unlocked?'#ffeac0':'#91a3ad'}" stroke-width="1.5"/><path d="m36 12 18 8 5 19-7 17-16 7-16-8-6-16 6-18Z" fill="url(#${id}-core)" stroke="#e9d195" stroke-opacity=".7"/><g stroke="${unlocked?'#fff1bf':'#a2b2bd'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${motifs[category]}</g>${unlocked?'<path d="m13 16 4 1-3 4-1-5Zm42-4 2 5 5 1-5 2-2 5-2-5-5-2 5-1Z" fill="#fff4d0"/>':'<path d="M30 62v-4a6 6 0 0 1 12 0v4" stroke="#c1ced4" stroke-width="2"/><rect x="27" y="61" width="18" height="14" rx="3" fill="#405466" stroke="#acbac6"/><circle cx="36" cy="67" r="2" fill="#dae1e7"/>'}</svg></span>`;
}
