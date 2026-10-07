const formatters = new Map();
/** Full decimal notation at every magnitude; never compact or scientific labels. */
export function formatNumber(value, precision = 1) {
  if (!Number.isFinite(value)) return '0';
  const places = Math.max(0, Math.min(8, Math.floor(precision)));
  if (!formatters.has(places)) formatters.set(places, new Intl.NumberFormat('ru-RU', {
    notation: 'standard', useGrouping: true, maximumFractionDigits: places,
  }));
  return formatters.get(places).format(Math.max(0, value));
}
