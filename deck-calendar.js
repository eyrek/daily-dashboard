/* deck-calendar.js: Google Calendar inside the Android app, through the phone's calendar (which Google Calendar
   syncs to). Reads the next 8 days of events to show today's agenda, pick up the workout session from your
   calendar, and preview next week at the campfire; opens the system event editor to put a task on the calendar.
   In a normal browser this does nothing (DeckCal.native === false). */
(function () {
  'use strict';
  const D = window.Deck, esc = D.esc;
  const Cap = window.Capacitor;
  const native = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  const CAL = native && Cap.Plugins ? Cap.Plugins.CapacitorCalendar : null;
  let byDay = {}, perm = 'unknown', fetchedAt = 0, error = '', calendars = null;

  const settings = () => Object.assign({ show: true, hidden: [] }, (D.S.settings && D.S.settings.calendar) || {});
  const setSettings = patch => D.setSettings({ calendar: Object.assign(settings(), patch) });
  const pad = n => String(n).padStart(2, '0');
  const localKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const utcKey = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  async function permission() {
    if (!CAL) return 'unavailable';
    try { perm = (await CAL.checkPermission({ scope: 'readCalendar' })).result; } catch (e) { perm = 'unavailable'; }
    return perm;
  }
  async function connect() {
    if (!CAL) throw new Error('Calendar needs the Android app.');
    const r = await CAL.requestFullCalendarAccess();
    perm = r && r.result;
    if (perm !== 'granted') throw new Error('Calendar access wasn’t allowed. You can allow it in Android Settings → Apps → Deck → Permissions.');
    await refresh(true); return true;
  }
  /* bucket events by the local day they fall on; all-day events are stored at UTC midnight, so use their UTC date */
  function bucket(events) {
    const hidden = new Set(settings().hidden), out = {};
    for (const e of events || []) {
      if (!e || (e.calendarId && hidden.has(String(e.calendarId)))) continue;
      const ev = { id: e.id, title: e.title || '(No title)', start: e.startDate, end: e.endDate, allDay: !!e.isAllDay, color: e.color || '', cal: e.calendarId };
      if (ev.allDay) {
        let k = utcKey(e.startDate); const last = utcKey(Math.max(e.startDate, (e.endDate || e.startDate) - 1));
        for (let i = 0; i < 14 && k <= last; i++, k = D.addDays(k, 1)) (out[k] = out[k] || []).push(ev);
      } else {
        let k = localKey(e.startDate); const last = localKey(Math.max(e.startDate, (e.endDate || e.startDate) - 1));
        for (let i = 0; i < 14 && k <= last; i++, k = D.addDays(k, 1)) (out[k] = out[k] || []).push(ev);
      }
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
    return out;
  }
  async function refresh(force) {
    if (!CAL) return;
    if ((await permission()) !== 'granted') { redraw(); return; }
    if (!force && Date.now() - fetchedAt < 4 * 60e3) return;
    try {
      const from = D.parse(D.today()); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + 8);
      const r = await CAL.listEventsInRange({ from: from.getTime(), to: to.getTime() });
      byDay = bucket(r && r.result); fetchedAt = Date.now(); error = '';
    } catch (e) { error = e && e.message ? e.message : String(e); }
    redraw();
  }
  function redraw() { if (window.DeckUI && DeckUI.refresh) DeckUI.refresh(); if (typeof window.__deckCalChanged === 'function') window.__deckCalChanged(); }
  const eventsOn = k => byDay[k] || [];

  /* the workout session your calendar names for day k, e.g. "Push day" → Push */
  function workoutHint(k) {
    const cyc = D.S.workout.cycle;
    for (const e of eventsOn(k)) {
      const t = e.title.toLowerCase();
      for (const s of cyc) {
        const re = new RegExp('(^|[^a-z])' + s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])');
        if (re.test(t)) return { session: s, title: e.title };
      }
    }
    return null;
  }

  function stripHTML(k) {
    if (!native || !settings().show || k < D.today()) return '';
    if (perm !== 'granted') {
      return k === D.today() ? `<section class="agenda"><div class="ag-h"><b>Calendar</b></div><p class="hint">See today's Google Calendar here and plan your tasks around it.</p><button type="button" class="sm" data-act="calconnect">Connect calendar</button></section>` : '';
    }
    const evs = eventsOn(k), now = Date.now();
    const rows = evs.map(e => `<li class="${!e.allDay && e.end < now ? 'past' : ''}"><time>${e.allDay ? 'All day' : esc(time(e.start))}</time><span>${e.color ? `<i style="background:${esc(e.color)}"></i>` : ''}${esc(e.title)}</span></li>`).join('');
    return `<section class="agenda" aria-label="Calendar"><div class="ag-h"><b>Calendar</b><small>${evs.length ? evs.length + ' event' + (evs.length > 1 ? 's' : '') : ''}</small></div>${evs.length ? `<ul>${rows}</ul>` : '<p class="hint">Nothing on your calendar.</p>'}${error ? `<p class="hint">Couldn't read the calendar: ${esc(error)}</p>` : ''}</section>`;
  }
  function weekHTML() {
    if (!native) return '';
    if (perm !== 'granted') return '<p class="hint">Connect your calendar in Settings to see next week here.</p>';
    const out = [];
    for (let i = 1; i <= 7; i++) {
      const k = D.addDays(D.today(), i), evs = eventsOn(k);
      const label = D.parse(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      out.push(`<li><b>${esc(label)}</b> ${evs.length ? evs.slice(0, 4).map(e => esc((e.allDay ? '' : time(e.start) + ' ') + e.title)).join(' · ') + (evs.length > 4 ? ` · +${evs.length - 4} more` : '') : '<span class="hint">free</span>'}</li>`);
    }
    return `<ul class="weekcal">${out.join('')}</ul><p class="hint">Heavy days are a good reason to keep that day's tasks small.</p>`;
  }
  async function scheduleTask(text) {
    if (!CAL) throw new Error('Calendar needs the Android app.');
    const start = new Date(); start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
    await CAL.createEventWithPrompt({ title: text, startDate: start.getTime(), endDate: start.getTime() + 30 * 60e3, description: 'Added from Deck' });
    setTimeout(() => refresh(true), 1500);
  }
  async function listCalendars() {
    if (!CAL || perm !== 'granted') return [];
    try { calendars = ((await CAL.listCalendars()).result || []).filter(c => c.visible !== false); } catch (e) { calendars = []; }
    return calendars;
  }

  if (CAL) {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    setInterval(() => refresh(), 10 * 60e3);
    refresh(true);
  }
  window.DeckCal = { native, settings, setSettings, permission, connect, refresh, eventsOn, workoutHint, stripHTML, weekHTML, scheduleTask, listCalendars,
    get granted() { return perm === 'granted'; }, get error() { return error; } };
})();
