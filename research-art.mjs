const drawings=[
  '<path d="M11 34 29 10l8 7-19 23-9 1zM26 14l8 7M11 34l7 6M12 40l-3 1"/>',
  '<path d="M27 5 11 27h12l-2 16 17-24H26z"/><path d="m9 9-3-3m29 3 4-4M7 38l-3 2"/>',
  '<path d="M18 11c-10-5-16 9-9 15-6 9 4 17 12 10V12c0-9 13-10 14-1 10 1 12 15 4 19 2 8-9 13-15 6M10 21l9 2m9-5 8-2m-9 14 9 2"/>',
  '<circle cx="24" cy="24" r="17"/><path d="m24 6 6 18-6 18-6-18zM6 24h36"/>',
  '<path d="M14 6v30l7-8 7 13 6-3-7-12h13zM5 11H2m9-9V0m29 8 5-4"/>',
  '<path d="M12 10v26l7-8 6 12 5-3-6-12h11z"/><circle cx="33" cy="13" r="8"/><path d="M33 8v5l4 3"/>',
  '<path d="M7 9h16v31H7zM24 9h17v31H24M10 15h8m-8 6h8m9-6h10m-10 6h10"/><path d="m26 29 4 4 8-9"/>',
  '<circle cx="24" cy="20" r="13"/><path d="m17 31-5 13 12-6 12 6-5-13m-7-19 2 5 6 1-4 4 1 6-5-3-5 3 1-6-4-4 6-1z"/>',
  '<path d="m3 17 21-10 21 10-21 10zM10 22v11c8 8 20 8 28 0V22M43 18v16"/>',
  '<path d="M11 5h25v29H11zM16 12h15m-15 6h15m-15 6h10"/><circle cx="29" cy="34" r="7"/><path d="m25 40-2 6 6-3 6 3-2-6"/>',
  '<path d="M5 8h38v27H5zM10 40h28m-14-5v5M11 25l8-10 8 10 8-10"/>',
  '<path d="M7 38a17 17 0 0 1 34 0zM14 37a10 10 0 0 1 20 0M24 21v7m-12 0 5 5m19-5-5 5M24 38l11-19"/>',
  '<rect x="11" y="11" width="26" height="26" rx="3"/><path d="M18 18h12v12H18zM17 4v7m7-7v7m7-7v7m-14 26v7m7-7v7m7-7v7M4 17h7m-7 7h7m-7 7h7m26-14h7m-7 7h7m-7 7h7"/>',
  '<path d="M8 30 23 8l-3 17h17L25 43l2-13zM35 5v7m-4-3h8M7 10l-4-3"/>',
  '<path d="M9 40 31 8c7-6 16-2 8 8L18 33zM19 29l12 1M8 41h31"/>',
  '<ellipse cx="24" cy="24" rx="21" ry="8"/><ellipse cx="24" cy="24" rx="21" ry="8" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="21" ry="8" transform="rotate(120 24 24)"/><circle cx="24" cy="24" r="3"/>',
  '<path d="m9 9 15 15L39 9M9 39l15-15 15 15M9 9v30M39 9v30"/><circle cx="9" cy="9" r="5"/><circle cx="39" cy="9" r="5"/><circle cx="9" cy="39" r="5"/><circle cx="39" cy="39" r="5"/><circle cx="24" cy="24" r="6"/>',
  '<path d="M12 36C-3 21 9 8 20 14 25-3 48 12 36 24 46 42 22 46 20 33M12 36l24-12M20 14v19"/><circle cx="24" cy="24" r="4"/>',
  '<ellipse cx="24" cy="24" rx="12" ry="20"/><ellipse cx="24" cy="24" rx="6" ry="13"/><path d="M6 16h11M31 32h11m-5-4 5 4-5 4"/>',
  '<ellipse cx="16" cy="24" rx="9" ry="18"/><ellipse cx="33" cy="24" rx="9" ry="18"/><path d="M15 18h17l-5-5m5 5-5 5M33 30H16l5 5m-5-5 5-5"/>',
  '<circle cx="24" cy="25" r="17"/><path d="M24 13v12l9 6M18 4h12M24 4v4m-8 5 2 3m17 7-4 1"/>',
  '<path d="M12 5h24M12 43h24M15 6c0 15 18 21 18 36M33 6c0 15-18 21-18 36M18 35h12M19 12h10"/>',
  '<circle cx="24" cy="24" r="19"/><text x="24" y="31" text-anchor="middle" stroke="none" fill="currentColor" font-family="Georgia" font-size="22">42</text>',
  '<path d="M3 24c7-19 14-19 21 0s14 19 21 0c-7-19-14-19-21 0S10 43 3 24z"/><path d="M24 3v7m0 28v7M3 4l5 5m32 31 5 5"/>',
  '<path d="M22 11c-5-8-14-4-14 3-7 2-7 12-1 15-2 8 8 12 14 6V12m6-1c5-8 14-4 14 3 7 2 7 12 1 15 2 8-8 12-14 6V12M12 16h5v8h5m-10 5h5v-5m19-8h-5v8h-4m10 5h-6v-5"/><circle cx="12" cy="16" r="1.5"/><circle cx="36" cy="16" r="1.5"/><path d="M11 42c9 6 21 4 28-3m-6-1 7 1-3 6"/>',
  '<path d="m24 3 17 10v21L24 44 7 34V13zM7 13l17 10 17-10M24 23v21M7 34l17-11 17 11M24 3v9"/><path d="m24 14 8 5v10l-8 5-8-5V19z"/><circle cx="24" cy="23" r="4"/><circle cx="7" cy="13" r="2.5"/><circle cx="41" cy="13" r="2.5"/><circle cx="24" cy="44" r="2.5"/>',
];
export function researchArtwork(index,owned=false){
  const hue=(index*37+28)%360;
  return `<span class="research-emblem" style="--research-hue:${hue}" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawings[index%drawings.length]}</svg><span class="research-tier">${owned?'✓':String(index+1).padStart(2,'0')}</span></span>`;
}
