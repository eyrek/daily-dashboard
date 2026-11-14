// Shared by the workflow generator and the sender. Local times in New York -> UTC cron lines, DST-safe:
// each reminder gets one cron line per possible UTC offset (EST -5, EDT -4); the sender only acts on the
// line whose offset is in effect on that day, so every reminder fires once.
export const OFFSETS = [-5, -4];
export function utcHM(time, off) { const [h, m] = time.split(':').map(Number); return [((h - off) % 24 + 24) % 24, m]; }
export function cronFor(time, off) { const [h, m] = utcHM(time, off); return `${m} ${h} * * *`; }
export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const offset = Math.round((asUTC - Math.floor(date.getTime() / 60000) * 60000) / 3600000);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { dateKey: `${p.year}-${p.month}-${p.day}`, dow, offset, hm: `${p.hour}:${p.minute}` };
}
const dayNum = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
export function dayMatches(r, dateKey, dow) {
  if (r.kind === 'daily') return true;
  if (r.kind === 'weekly') return (r.days || []).includes(dow);
  if (r.kind === 'eve-before') return (r.pickupDays || []).includes((dow + 1) % 7);
  if (r.kind === 'biweekly-eve') return !!r.pickupAnchor && (((dayNum(dateKey) + 1 - dayNum(r.pickupAnchor)) % 14) + 14) % 14 === 0;
  return false;
}
/* which reminders are due for this cron line, given when the run actually happened (runs can be late) */
export function dueFor(config, schedule, now = new Date()) {
  const out = [];
  for (const r of config.reminders.filter(x => x.on)) for (const off of OFFSETS) {
    if (cronFor(r.time, off) !== schedule) continue;
    const [h, m] = utcHM(r.time, off);
    let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m);
    if (t > now.getTime() + 60000) t -= 864e5;            // intended instant = most recent occurrence
    if (now.getTime() - t > 3 * 3600e3) continue;          // far too late: skip rather than nag at the wrong time
    const lp = localParts(new Date(t), config.tz);
    if (lp.offset !== off) continue;                       // other DST variant
    if (dayMatches(r, lp.dateKey, lp.dow)) out.push(r);
  }
  return out;
}
