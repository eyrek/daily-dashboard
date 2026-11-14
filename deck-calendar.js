/* deck-calendar.js: Google Calendar in Deck.
   Two backends behind one interface:
   - phone: inside the Android app, reads the phone's calendar (Google Calendar syncs to it) via the
     @ebarooni/capacitor-calendar plugin; ⏰ opens the system event editor.
   - google: in a browser, "Sign in with Google" (Google Identity Services, read-only Calendar scope) and the
     Calendar REST API. Browser sign-ins last about an hour; after that a one-tap "Refresh calendar" appears.
     ⏰ opens Google Calendar's new-event page with the task filled in.
   Features: today's agenda on the hand, workout session from calendar events, next week at the campfire. */
(function () {
  'use strict';
  const D = window.Deck, esc = D.esc;
  /* OAuth client ID for https://eyrek.github.io (not a secret; it only works from that site). */
  const GOOGLE_CLIENT_ID = '';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
  const Cap = window.Capacitor;
  const native = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  const pad = n => String(n).padStart(2, '0');
  const localKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const utcKey = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const nextHalfHour = () => { const s = new Date(); s.setMinutes(s.getMinutes() < 30 ? 30 : 60, 0, 0); return s; };

  /* ---------- backend: phone calendar (Android app) ---------- */
  function phoneBackend() {
    const CAL = Cap && Cap.Plugins ? Cap.Plugins.CapacitorCalendar : null; if (!CAL) return null;
    return {
      kind: 'phone',
      async permission() { try { return (await CAL.checkPermission({ scope: 'readCalendar' })).result; } catch (e) { return 'unavailable'; } },
      async connect() { const r = await CAL.requestFullCalendarAccess(); if (!r || r.result !== 'granted') throw new Error('Calendar access wasn’t allowed. You can allow it in Android Settings → Apps → Deck → Permissions.'); },
      async events(from, to) {
        const r = await CAL.listEventsInRange({ from, to });
        return (r && r.result || []).map(e => ({ id: e.id, title: e.title, start: e.startDate, end: e.endDate, allDay: !!e.isAllDay, cal: e.calendarId != null ? String(e.calendarId) : '', color: e.color || '' }));
      },
      async calendars() { try { return ((await CAL.listCalendars()).result || []).filter(c => c.visible !== false).map(c => ({ id: String(c.id), title: c.title || c.accountName || 'Calendar', color: c.color || '' })); } catch (e) { return []; } },
      async schedule(text) { const s = nextHalfHour(); await CAL.createEventWithPrompt({ title: text, startDate: s.getTime(), endDate: s.getTime() + 30 * 60e3, description: 'Added from Deck' }); }
    };
  }

  /* ---------- backend: Google sign-in (browser) ---------- */
  function googleBackend() {
    if (!GOOGLE_CLIENT_ID || !window.fetch) return null;
    const TK = 'deck.gcal.token', FLAG = 'deck.gcal.connected';
    let token = null, client = null;
    try { const t = JSON.parse(sessionStorage.getItem(TK) || 'null'); if (t && t.exp > Date.now() + 60e3) token = t; } catch (e) {}
    const connectedBefore = () => { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } };
    function loadGis() {
      if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
      return new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = () => res(); s.onerror = () => rej(new Error('Couldn’t load Google sign-in. Check your connection.'));
        document.head.appendChild(s);
      });
    }
    async function getToken(prompt) {
      await loadGis();
      return new Promise((res, rej) => {
        client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID, scope: SCOPE,
          callback: r => {
            if (r && r.access_token) {
              token = { v: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
              try { sessionStorage.setItem(TK, JSON.stringify(token)); localStorage.setItem(FLAG, '1'); } catch (e) {}
              res();
            } else rej(new Error((r && r.error_description) || 'Google sign-in didn’t finish.'));
          },
          error_callback: err => rej(new Error(err && err.type === 'popup_closed' ? 'The Google window was closed before finishing.' : 'Google sign-in was blocked. Allow pop-ups for this site and try again.'))
        });
        client.requestAccessToken({ prompt });
      });
    }
    async function api(path) {
      if (!token || token.exp < Date.now() + 30e3) { token = null; throw Object.assign(new Error('expired'), { expired: true }); }
      const r = await fetch('https://www.googleapis.com/calendar/v3' + path, { headers: { Authorization: 'Bearer ' + token.v } });
      if (r.status === 401) { token = null; try { sessionStorage.removeItem(TK); } catch (e) {} throw Object.assign(new Error('expired'), { expired: true }); }
      if (!r.ok) throw new Error('Google Calendar said ' + r.status + '.');
      return r.json();
    }
    let calCache = null;
    async function calendars() {
      if (!calCache) {
        const r = await api('/users/me/calendarList?minAccessRole=reader&maxResults=100');
        calCache = (r.items || []).filter(c => !c.hidden && c.selected !== false).map(c => ({ id: c.id, title: c.summaryOverride || c.summary || 'Calendar', color: c.backgroundColor || '', primary: !!c.primary }));
      }
      return calCache;
    }
    const toMs = t => t.dateTime ? Date.parse(t.dateTime) : Date.parse(t.date + 'T00:00:00Z');
    return {
      kind: 'google',
      async permission() { return token && token.exp > Date.now() + 30e3 ? 'granted' : connectedBefore() ? 'expired' : 'prompt'; },
      async connect() { await getToken(connectedBefore() ? '' : 'consent'); },
      async events(from, to) {
        const cals = await calendars(), out = [];
        const q = `?timeMin=${encodeURIComponent(new Date(from).toISOString())}&timeMax=${encodeURIComponent(new Date(to).toISOString())}&singleEvents=true&orderBy=startTime&maxResults=250`;
        await Promise.all(cals.map(async c => {
          const r = await api('/calendars/' + encodeURIComponent(c.id) + '/events' + q);
          for (const e of r.items || []) {
            if (e.status === 'cancelled' || !e.start) continue;
            if ((e.attendees || []).some(a => a.self && a.responseStatus === 'declined')) continue;
            out.push({ id: e.id, title: e.summary, start: toMs(e.start), end: toMs(e.end || e.start), allDay: !e.start.dateTime, cal: c.id, color: c.color });
          }
        }));
        return out;
      },
      calendars,
      async schedule(text) {
        const s = nextHalfHour(), e = new Date(s.getTime() + 30 * 60e3);
        const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${f(s)}/${f(e)}&details=${encodeURIComponent('Added from Deck')}`, '_blank', 'noopener');
      }
    };
  }

  const B = native ? phoneBackend() : googleBackend();
  const available = !!B;
  let byDay = {}, perm = 'unknown', fetchedAt = 0, error = '';

  const settings = () => Object.assign({ show: true, hidden: [] }, (D.S.settings && D.S.settings.calendar) || {});
  const setSettings = patch => D.setSettings({ calendar: Object.assign(settings(), patch) });
  async function permission() { perm = B ? await B.permission() : 'unavailable'; return perm; }
  async function connect() {
    if (!B) throw new Error('Calendar isn’t set up in this browser yet.');
    await B.connect(); perm = 'granted'; await refresh(true); return true;
  }
  /* bucket events by local day; all-day events are dated in UTC, so use their UTC date */
  function bucket(events) {
    const hidden = new Set(settings().hidden.map(String)), out = {};
    for (const e of events || []) {
      if (!e || (e.cal && hidden.has(String(e.cal)))) continue;
      const ev = { id: e.id, title: e.title || '(No title)', start: e.start, end: e.end, allDay: e.allDay, color: e.color || '', cal: e.cal };
      const key = ev.allDay ? utcKey : localKey;
      let k = key(e.start); const last = key(Math.max(e.start, (e.end || e.start) - 1));
      for (let i = 0; i < 14 && k <= last; i++, k = D.addDays(k, 1)) (out[k] = out[k] || []).push(ev);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
    return out;
  }
  async function refresh(force) {
    if (!B) return;
    if ((await permission()) !== 'granted') { redraw(); return; }
    if (!force && Date.now() - fetchedAt < 4 * 60e3) return;
    try {
      const from = D.parse(D.today()); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + 8);
      byDay = bucket(await B.events(from.getTime(), to.getTime())); fetchedAt = Date.now(); error = '';
    } catch (e) { if (e.expired) perm = 'expired'; else error = e && e.message ? e.message : String(e); }
    redraw();
  }
  function redraw() { if (window.DeckUI && DeckUI.refresh) DeckUI.refresh(); if (typeof window.__deckCalChanged === 'function') window.__deckCalChanged(); }
  const eventsOn = k => byDay[k] || [];
  const hasData = () => fetchedAt > 0;

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
    if (!available || !settings().show || k < D.today()) return '';
    if (perm !== 'granted' && !hasData()) {
      if (k !== D.today()) return '';
      if (perm === 'expired') return `<section class="agenda"><div class="ag-h"><b>Calendar</b></div><p class="hint">Google sign-ins in the browser last about an hour.</p><button type="button" class="sm" data-act="calconnect">Refresh calendar</button></section>`;
      return `<section class="agenda"><div class="ag-h"><b>Calendar</b></div><p class="hint">See today's Google Calendar here and plan your tasks around it.</p><button type="button" class="sm" data-act="calconnect">${B.kind === 'google' ? 'Sign in with Google' : 'Connect calendar'}</button></section>`;
    }
    const evs = eventsOn(k), now = Date.now();
    const rows = evs.map(e => `<li class="${!e.allDay && e.end < now ? 'past' : ''}"><time>${e.allDay ? 'All day' : esc(time(e.start))}</time><span>${e.color ? `<i style="background:${esc(e.color)}"></i>` : ''}${esc(e.title)}</span></li>`).join('');
    const stale = perm === 'expired' ? '<button type="button" class="sm ghost" data-act="calconnect">Refresh calendar</button>' : '';
    return `<section class="agenda" aria-label="Calendar"><div class="ag-h"><b>Calendar</b><small>${evs.length ? evs.length + ' event' + (evs.length > 1 ? 's' : '') : ''}</small></div>${evs.length ? `<ul>${rows}</ul>` : '<p class="hint">Nothing on your calendar.</p>'}${stale}${error ? `<p class="hint">Couldn't read the calendar: ${esc(error)}</p>` : ''}</section>`;
  }
  function weekHTML() {
    if (!available) return '';
    if (!hasData()) return `<p class="hint">${perm === 'expired' ? 'Refresh your calendar on Today to see next week here.' : 'Connect your calendar in Settings to see next week here.'}</p>`;
    const out = [];
    for (let i = 1; i <= 7; i++) {
      const k = D.addDays(D.today(), i), evs = eventsOn(k);
      const label = D.parse(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      out.push(`<li><b>${esc(label)}</b> ${evs.length ? evs.slice(0, 4).map(e => esc((e.allDay ? '' : time(e.start) + ' ') + e.title)).join(' · ') + (evs.length > 4 ? ` · +${evs.length - 4} more` : '') : '<span class="hint">free</span>'}</li>`);
    }
    return `<ul class="weekcal">${out.join('')}</ul><p class="hint">Heavy days are a good reason to keep that day's tasks small.</p>`;
  }
  async function scheduleTask(text) { if (!B) throw new Error('Calendar isn’t available here.'); await B.schedule(text); setTimeout(() => refresh(true), 1500); }
  async function listCalendars() { if (!B || perm !== 'granted') return []; try { return await B.calendars(); } catch (e) { return []; } }

  if (B) {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    setInterval(() => refresh(), 10 * 60e3);
    refresh(true);
  }
  window.DeckCal = { native, available, get kind() { return B ? B.kind : ''; }, configured: !!GOOGLE_CLIENT_ID,
    settings, setSettings, permission, connect, refresh, eventsOn, workoutHint, stripHTML, weekHTML, scheduleTask, listCalendars,
    get granted() { return perm === 'granted'; }, get error() { return error; } };
})();
