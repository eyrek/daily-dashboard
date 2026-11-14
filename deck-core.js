/* deck-core.js: all habit/task logic, no DOM. Works in the browser (window.DeckCore / window.Deck)
   and in Node (module.exports) for tests. State is one JSON object in storage under KEY. */
(function (root) {
  'use strict';
  const VERSION = 2, KEY = 'deck.v1';
  const IDS = ['Relaxed', 'Confident', 'Interesting', 'Relationships', 'Healthy'];
  const SRBAI = [
    'is something I do automatically.',
    'is something I do without having to consciously remember.',
    'is something I do without thinking.',
    'is something I start doing before I realise I’m doing it.'
  ];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------- date helpers (local calendar days as 'YYYY-MM-DD') ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return dkey(d); };
  const diff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const dow = k => parse(k).getDay();
  const monthOf = k => parse(k).getMonth() + 1;
  const weekOf = k => addDays(k, -((dow(k) + 6) % 7)); // Monday of k's week
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* state-history helpers: hist = [{from:'YYYY-MM-DD', state}] ascending */
  function stateAt(hist, d) { let s = null; for (const h of hist || []) if (h.from <= d) s = h.state; return s; }
  function setState(obj, state, d) {
    obj.hist = obj.hist || [];
    const last = obj.hist[obj.hist.length - 1];
    if (last && last.from === d) last.state = state; else obj.hist.push({ from: d, state });
    obj.mt = Date.now();
  }
  const startOf = o => (o.hist && o.hist[0] ? o.hist[0].from : '9999-12-31');

  function createDeck(opts = {}) {
    const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const now = opts.now || (() => new Date());
    let S = null, readOnly = false, notice = '', undoSlot = null;
    const listeners = new Set();

    /* ---------- clock ---------- */
    const dayStart = () => (S && S.settings && Number.isFinite(S.settings.dayStart)) ? S.settings.dayStart : 4;
    function today() { const d = now(); d.setHours(d.getHours() - dayStart()); return dkey(d); }
    function logicalHour() { const h = now().getHours(); return h < dayStart() ? h + 24 : h; }

    /* ---------- seed + migrations ---------- */
    function seed() {
      const t = today();
      const L = (id, name, idn, state = 'training') => ({ id, name, idn, hist: [{ from: t, state }] });
      return normalize({
        v: VERSION, rev: 0, created: t,
        settings: { dayStart: 4, onboarded: false },
        cards: [
          { id: 'evening', name: 'Evening Shutdown', part: 'evening', cue: 'Starts at 8:30', min: 'Phone out of the bedroom + skincare', sched: { type: 'daily' }, hist: [{ from: t, state: 'training' }],
            links: [L('phone', '8:30: phone on the charger outside the bedroom', 'Relaxed'), L('skin', 'Brush teeth → moisturizer / retinol', 'Healthy'),
              L('read', 'Read in bed (book on the pillow)', 'Interesting'), L('lights', 'Lights out around 9', 'Healthy')] },
          { id: 'morning', name: 'Morning Engine', part: 'morning', cue: 'Starts with the alarm', min: 'Up at 6:30 + one NeetCode problem', sched: { type: 'daily' }, hist: [{ from: t, state: 'training' }],
            links: [L('wake', 'Up at 6:30', 'Healthy'), L('neet', 'Coffee → NeetCode (1+ problem)', 'Confident', 'auto'), L('yoga', 'Yoga / mobility', 'Relaxed', 'auto')] }
        ],
        relics: [
          { id: uid(), card: 'morning', link: 'neet', name: 'Coffee → NeetCode', idn: 'Confident', on: 'before the deck', miss: 0 },
          { id: uid(), card: 'morning', link: 'yoga', name: 'Morning yoga / mobility', idn: 'Relaxed', on: 'before the deck', miss: 0 },
          { id: uid(), card: '', name: 'Training rotation', idn: 'Healthy', on: 'before the deck', miss: 0 }
        ],
        bench: [
          { id: 'macros', name: 'Log macros (saved meals)', idn: 'Healthy', cue: 'After each meal → log it', min: 'Protein hit (190 g)' },
          { id: 'meditate', name: 'Meditate 3 min', idn: 'Relaxed', cue: 'After yoga, still on the mat', join: 'morning' },
          { id: 'sysdesign', name: 'System design session', idn: 'Confident', cue: 'Late morning', min: '10 minutes on one topic', sched: { type: 'perWeek', n: 2 } },
          { id: 'reachout', name: 'Message one person', idn: 'Relationships', cue: 'After lunch → text a friend or family', min: 'Send a one-line hello' }
        ],
        chores: [
          { id: 'trash', name: 'Trash out', kind: 'eve-before', days: [] },
          { id: 'recycle', name: 'Recycling out', kind: 'biweekly-eve', anchor: '' },
          { id: 'mow', name: 'Mow the lawn', kind: 'weekly', days: [6], season: [4, 11], off: 'Winter yard / house chore' },
          { id: 'hair', name: 'Trim hair', kind: 'weekly', days: [0] }
        ],
        workout: { cycle: ['Deadlift', 'Push', 'Squat', 'Pull', 'Rest'], start: 'Deadlift', log: {} },
        curses: [{ id: 'tiktok', name: 'TikTok', since: t, plan: 'If I reach for my phone in bed → I read my book instead.',
          layers: [{ id: 'del', name: 'Delete the app', on: '' }, { id: 'delay', name: 'Delay app in front of it (one sec)', on: '' },
            { id: 'gray', name: 'Grayscale in the evening', on: '' }, { id: 'limit', name: 'Daily limit set in Digital Wellbeing', on: '' },
            { id: 'bed', name: 'Phone charges outside the bedroom', on: '' }], slips: [] }]
      });
    }
    function normalize(o) {
      o.settings = Object.assign({ dayStart: 4, onboarded: false }, o.settings || {});
      for (const k of ['cards', 'relics', 'bench', 'chores', 'curses', 'fires', 'pauses']) if (!Array.isArray(o[k])) o[k] = [];
      for (const k of ['tasks', 'log', 'chorelog', 'gone']) if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
      o.workout = Object.assign({ cycle: ['Deadlift', 'Push', 'Squat', 'Pull', 'Rest'], start: 'Deadlift', log: {} }, o.workout || {});
      if (!o.workout.log || typeof o.workout.log !== 'object') o.workout.log = {};
      for (const c of o.cards) {
        c.sched = c.sched || { type: 'daily' }; c.links = Array.isArray(c.links) ? c.links : [];
        if (!c.hist || !c.hist.length) c.hist = [{ from: o.created || '2026-01-01', state: 'training' }];
        for (const l of c.links) if (!l.hist || !l.hist.length) l.hist = [{ from: startOf(c), state: 'training' }];
      }
      for (const c of o.curses) { c.layers = c.layers || []; c.slips = c.slips || []; c.slips.forEach(s => { s.id = s.id || uid(); }); }
      for (const ch of o.chores) { ch.id = ch.id || uid(); ch.days = ch.days || []; }
      for (const f of o.fires) { f.id = f.id || uid(); f.week = f.week || weekOf(addDays(f.date, 1)); f.ratings = f.ratings || {}; }
      if (typeof o.rev !== 'number') o.rev = 0;
      return o;
    }
    const MIGRATE = {
      1(o) {
        const created = o.created || dkey(now());
        for (const c of o.cards || []) {
          c.hist = [{ from: c.started || created, state: c.state === 'relic' ? 'relic' : 'training' }];
          c.sched = c.id === 'sysdesign' ? { type: 'perWeek', n: 2 } : { type: 'daily' };
          c.links = (c.links || []).filter(l => !l.workout).map(l => ({ id: l.id, name: l.name, idn: l.idn, hist: [{ from: l.since || c.started || created, state: l.state === 'auto' ? 'auto' : 'training' }] }));
          delete c.state; delete c.started;
        }
        const wl = {};
        for (const [d, s] of Object.entries((o.workout && o.workout.log) || {})) wl[d] = { s, r: s === 'Rest' ? 'rest' : 'done' };
        const cyc = (o.workout && o.workout.cycle) || ['Deadlift', 'Push', 'Squat', 'Pull', 'Rest'];
        o.workout = { cycle: cyc, start: cyc[((o.workout && o.workout.next) || 0) % cyc.length], log: wl };
        for (const d of Object.keys(o.log || {})) for (const cid of Object.keys(o.log[d])) {
          const L = o.log[d][cid]; if (L && L.links) delete L.links.workout;
        }
        for (const r of o.relics || []) if (r.link === 'workout') { r.card = ''; r.link = undefined; }
        for (const b of o.bench || []) if (b.id === 'sysdesign') b.sched = { type: 'perWeek', n: 2 };
        o.settings = { dayStart: 4, onboarded: false }; o.pauses = []; o.gone = {};
        o.fires = (o.fires || []).map(f => ({ id: uid(), date: f.date, week: weekOf(addDays(f.date, 1)), ratings: f.ratings || {}, checks: f.checks || {}, note: f.note || '' }));
        o.v = 2; return o;
      }
    };

    /* ---------- load / save ---------- */
    function load() {
      readOnly = false; notice = '';
      let raw = null; try { raw = storage ? storage.getItem(KEY) : null; } catch (e) { raw = null; }
      if (raw == null) { S = seed(); persist(); return S; }
      let o = null; try { o = JSON.parse(raw); } catch (e) { o = null; }
      if (!o || typeof o.v !== 'number') {
        try { storage.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch (e) {}
        notice = 'Your saved deck was unreadable. A copy was kept and a fresh deck was started.';
        S = seed(); persist(); return S;
      }
      if (o.v > VERSION) { readOnly = true; S = normalize(o); notice = 'A newer version of this app saved your deck. Reload to update. Nothing will be saved until then.'; return S; }
      if (o.v < VERSION) {
        try { storage.setItem(KEY + '.bak.v' + o.v, raw); } catch (e) {}
        while (o.v < VERSION) o = MIGRATE[o.v](o);
      }
      S = normalize(o); persist(); snapshot(); return S;
    }
    function persist() {
      if (readOnly || !storage) return false;
      try { S.rev = (S.rev || 0) + 1; storage.setItem(KEY, JSON.stringify(S)); return true; }
      catch (e) { notice = 'Couldn’t save. Your browser storage may be full or blocked. Download a backup from Settings.'; return false; }
    }
    function snapshot() {
      if (!storage || readOnly) return;
      try {
        const k = KEY + '.snap.' + today();
        if (storage.getItem(k) == null) storage.setItem(k, JSON.stringify(S));
        const keys = []; for (let i = 0; i < storage.length; i++) { const x = storage.key(i); if (x && x.startsWith(KEY + '.snap.')) keys.push(x); }
        keys.sort().slice(0, -7).forEach(x => storage.removeItem(x));
      } catch (e) {}
    }
    function snapshots() {
      const out = []; if (!storage) return out;
      try { for (let i = 0; i < storage.length; i++) { const x = storage.key(i); if (x && x.startsWith(KEY + '.snap.')) out.push(x.slice((KEY + '.snap.').length)); } } catch (e) {}
      return out.sort().reverse();
    }
    function restoreSnapshot(day) { const raw = storage.getItem(KEY + '.snap.' + day); if (!raw) return false; return commit('Restore backup', () => { S = normalize(JSON.parse(raw)); }); }
    /* pick up writes made by another tab before applying an action */
    function syncFromStorage() {
      if (!storage) return;
      try { const raw = storage.getItem(KEY); if (!raw) return; const o = JSON.parse(raw); if (o.v === VERSION && o.rev !== S.rev) S = normalize(o); else if (o.v > VERSION) { readOnly = true; notice = 'A newer version of this app saved your deck. Reload to update.'; } } catch (e) {}
    }
    const emit = () => listeners.forEach(f => { try { f(); } catch (e) { if (typeof console !== 'undefined') console.error(e); } });
    function commit(label, fn) {
      if (readOnly) return { ok: false, msg: notice };
      syncFromStorage();
      const before = JSON.stringify(S);
      let r;
      try { r = fn(S); } catch (e) { S = JSON.parse(before); return { ok: false, msg: 'Something went wrong; nothing changed.' }; }
      if (r && r.error) { S = JSON.parse(before); return { ok: false, msg: r.error }; }
      undoSlot = { label, before };
      persist(); emit();
      return { ok: true, label, msg: (r && r.msg) || '' , data: r && r.data };
    }
    function undo() {
      if (!undoSlot || readOnly) return false;
      const keepRev = S.rev; S = normalize(JSON.parse(undoSlot.before)); S.rev = keepRev; undoSlot = null; persist(); emit(); return true;
    }
    function reloadFromStorage() { load(); emit(); }

    /* ---------- lookups ---------- */
    const card = id => S.cards.find(c => c.id === id);
    const cardState = (c, d) => (d < startOf(c) ? null : stateAt(c.hist, d));
    const linkState = (l, d) => (d < startOf(l) ? null : stateAt(l.hist, d));
    const linksAt = (c, d, st) => c.links.filter(l => linkState(l, d) === st);
    const liveLinks = (c, d) => c.links.filter(l => { const s = linkState(l, d); return s && s !== 'removed'; });
    const trainingCards = (d = today()) => S.cards.filter(c => cardState(c, d) === 'training');
    const logOf = (d, cid) => (S.log[d] || {})[cid] || null;
    function isPaused(d) { return S.pauses.some(p => p.from <= d && d <= p.to); }
    const lastTrainingStart = (l) => { let s = null; for (const h of l.hist) if (h.state === 'training') s = h.from; return s; };

    /* ---------- schedule / played ---------- */
    function sched(c) { return c.sched || { type: 'daily' }; }
    function isScheduledDay(c, d) { const s = sched(c); return s.type === 'days' ? (s.days || []).includes(dow(d)) : true; }
    function isDue(c, d) {
      if (cardState(c, d) !== 'training' || isPaused(d)) return false;
      const L = logOf(d, c.id); if (L && L.skip) return false;
      return isScheduledDay(c, d);
    }
    function isPlayed(c, d) {
      const L = logOf(d, c.id); if (!L) return false;
      if (L.min) return true;
      const need = linksAt(c, d, 'training');
      return need.length > 0 && need.every(l => L.links && L.links[l.id]);
    }
    function weekPlays(c, d) { let n = 0; for (let x = weekOf(d); x <= d; x = addDays(x, 1)) if (cardState(c, x) === 'training' && isPlayed(c, x)) n++; return n; }
    function weekStatus(c, d) {
      const s = sched(c), n = s.n || 1, plays = weekPlays(c, d);
      let daysLeft = 0; for (let x = d; x <= addDays(weekOf(d), 6); x = addDays(x, 1)) if (!isPaused(x)) daysLeft++;
      const needed = Math.max(0, n - plays);
      return { n, plays, needed, daysLeft, done: plays >= n, behind: needed > daysLeft };
    }
    function record(c, k = today(), span = 14) {
      const s = sched(c), start = startOf(c);
      if (s.type === 'perWeek') {
        let met = 0, weeks = 0;
        for (let w = 1; w <= 4; w++) {
          const wk = addDays(weekOf(k), -7 * w); if (addDays(wk, 6) < start) break;
          weeks++; if (weekPlays(c, addDays(wk, 6)) >= (s.n || 1)) met++;
        }
        return { type: 'perWeek', met, weeks, week: weekStatus(c, k), missRun: 0 };
      }
      let due = 0, played = 0;
      for (let i = 1; i <= span; i++) { const d = addDays(k, -i); if (d < start) break; if (isDue(c, d)) { due++; if (isPlayed(c, d)) played++; } }
      if (isDue(c, k) && isPlayed(c, k)) { due++; played++; }
      let missRun = 0;
      for (let i = 1; i <= 21; i++) {
        const d = addDays(k, -i); if (d < start) break;
        if (!isDue(c, d)) continue;
        if (isPlayed(c, d)) break; missRun++;
      }
      return { type: 'days', due, played, missRun, playedToday: isPlayed(c, k) };
    }
    /* habit strength 0..1, Loop-style exponential smoothing; misses fade it slowly, pauses/skips don't count */
    function strength(c, k = today()) {
      const s = sched(c), m = Math.pow(0.5, 1 / 13);
      let score = 0, d = startOf(c);
      if (d > k) return 0;
      for (; d <= k; d = addDays(d, 1)) {
        if (cardState(c, d) !== 'training' && cardState(c, d) !== 'relic') continue;
        if (isPaused(d)) continue;
        if (d === k && !isPlayed(c, d)) break; // today only counts once played
        if (s.type === 'perWeek') {
          const L = logOf(d, c.id); if (L && L.skip) continue;
          let cnt = 0; for (let i = 0; i < 7; i++) { const x = addDays(d, -i); if (x >= startOf(c) && isPlayed(c, x)) cnt++; }
          score = score * m + Math.min(1, cnt / (s.n || 1)) * (1 - m);
        } else {
          if (!isDue(c, d) && cardState(c, d) === 'training') continue;
          if (cardState(c, d) === 'relic') { score = score * m + 1 * (1 - m); continue; }
          score = score * m + (isPlayed(c, d) ? 1 : 0) * (1 - m);
        }
      }
      return score;
    }
    function heat(c, k = today(), weeks = 12) {
      const end = addDays(weekOf(k), 6), first = addDays(weekOf(k), -7 * (weeks - 1)), out = [];
      for (let d = first; d <= end; d = addDays(d, 1)) {
        let st;
        if (d > k) st = 'future';
        else if (d < startOf(c) || !cardState(c, d) || cardState(c, d) === 'shelved') st = 'none';
        else if (cardState(c, d) === 'relic') st = 'relic';
        else if (isPaused(d)) st = 'pause';
        else if ((logOf(d, c.id) || {}).skip) st = 'skip';
        else if (isPlayed(c, d)) st = (logOf(d, c.id) || {}).min ? 'min' : 'played';
        else if (sched(c).type === 'perWeek' || !isScheduledDay(c, d)) st = 'off';
        else st = d === k ? 'today' : 'missed';
        out.push({ d, st });
      }
      return out;
    }

    /* ---------- habit actions ---------- */
    const L_ = (d, cid) => { S.log[d] = S.log[d] || {}; return (S.log[d][cid] = S.log[d][cid] || { links: {} }); };
    const tidy = (d, cid) => { const L = (S.log[d] || {})[cid]; if (L && !L.min && !L.skip && !Object.values(L.links || {}).some(Boolean)) { delete S.log[d][cid]; if (!Object.keys(S.log[d]).length) delete S.log[d]; } };
    const toggleLink = (cid, lid, on, d = today()) => commit(on ? 'Ticked' : 'Unticked', () => { const L = L_(d, cid); L.links[lid] = !!on; if (!on) delete L.links[lid]; tidy(d, cid); });
    const toggleMin = (cid, d = today()) => commit('Minimum', () => { const L = L_(d, cid); L.min = !L.min; if (!L.min) delete L.min; tidy(d, cid); });
    const toggleSkip = (cid, d = today()) => commit('Excused', () => { const L = L_(d, cid); L.skip = !L.skip; if (!L.skip) delete L.skip; tidy(d, cid); });
    const playAll = (cid, d = today()) => commit('Played', () => { const c = card(cid), L = L_(d, cid); linksAt(c, d, 'training').forEach(l => { L.links[l.id] = true; }); });

    /* ---------- workout rotation (derived from the log, never a counter) ---------- */
    function nextSession(d) {
      const W = S.workout, n = W.cycle.length;
      const prev = Object.keys(W.log).filter(x => x < d && W.log[x] && (W.log[x].r === 'done' || W.log[x].r === 'rest')).sort().pop();
      if (!prev) return W.cycle.includes(W.start) ? W.start : W.cycle[0];
      const i = W.cycle.indexOf(W.log[prev].s); return W.cycle[(i + 1 + n) % n];
    }
    const sessionFor = d => (S.workout.log[d] && S.workout.log[d].s) || nextSession(d);
    const workoutResult = d => (S.workout.log[d] || {}).r || '';
    const logWorkout = (r, d = today()) => commit(r ? 'Workout logged' : 'Workout cleared', () => {
      const s = sessionFor(d);
      if (!r) { if (S.workout.log[d] && S.workout.log[d].pick) S.workout.log[d].r = ''; else delete S.workout.log[d]; }
      else S.workout.log[d] = Object.assign({}, S.workout.log[d], { s, r });
    });
    const pickSession = (s, d = today()) => commit('Workout changed', () => { S.workout.log[d] = Object.assign({}, S.workout.log[d], { s, pick: true }); });
    function workoutWeek(k = today()) { let n = 0; for (let x = weekOf(k); x <= k; x = addDays(x, 1)) if (workoutResult(x) === 'done') n++; return n; }

    /* ---------- chores ---------- */
    const inSeason = (m, s) => !s || (s[0] <= s[1] ? m >= s[0] && m <= s[1] : m >= s[0] || m <= s[1]);
    const choreDoneOn = (id, d) => !!(S.chorelog[d] || {})[id];
    function choresDue(k = today()) {
      const out = [], tomorrow = addDays(k, 1);
      for (const c of S.chores) {
        if (c.kind === 'weekly') {
          for (let i = 0; i <= 6; i++) {
            const o = addDays(k, -i);
            if (!(c.days || []).includes(dow(o))) continue;
            let done = false; for (let x = o; x <= k; x = addDays(x, 1)) if (choreDoneOn(c.id, x)) done = true;
            if (done && !choreDoneOn(c.id, k)) break;
            const name = inSeason(monthOf(o), c.season) ? c.name : c.off; if (!name) break;
            out.push({ id: c.id, name, late: i > 0 ? DAY_NAMES[dow(o)] : '' }); break;
          }
        }
        if (c.kind === 'eve-before' && (c.days || []).includes(dow(tomorrow))) out.push({ id: c.id, name: c.name, eve: true });
        if (c.kind === 'biweekly-eve' && c.anchor && ((diff(tomorrow, c.anchor) % 14) + 14) % 14 === 0) out.push({ id: c.id, name: c.name, eve: true });
      }
      return out;
    }
    const toggleChore = (id, d = today()) => commit('Chore', () => { const x = (S.chorelog[d] = S.chorelog[d] || {}); x[id] = !x[id]; if (!x[id]) delete x[id]; if (!Object.keys(x).length) delete S.chorelog[d]; });

    /* ---------- tasks ---------- */
    const tasks = d => S.tasks[d] || [];
    function addTask(text, step = '', d = today()) {
      text = String(text || '').trim(); step = String(step || '').trim();
      if (!text) return { ok: false, msg: 'Type a task first.' };
      if (tasks(d).length >= 3) return { ok: false, msg: 'Out of energy: 3 tasks is today’s limit. Park it in Later.' };
      return commit('Task added', () => { (S.tasks[d] = S.tasks[d] || []).push({ id: uid(), text, step, done: false }); });
    }
    const toggleTask = (id, d = today()) => commit('Task', () => { const t = tasks(d).find(x => x.id === id); if (t) t.done = !t.done; });
    const removeTask = (id, d = today()) => commit('Task removed', () => {
      const t = tasks(d).find(x => x.id === id); if (!t) return; if (t.done) return { error: 'Played cards stay played.' };
      S.tasks[d] = tasks(d).filter(x => x.id !== id); if (!S.tasks[d].length) delete S.tasks[d];
    });
    function later(k = today()) {
      const out = [];
      for (const d of Object.keys(S.tasks).filter(x => x < k && diff(k, x) <= 30).sort().reverse())
        for (const t of S.tasks[d]) if (!t.done && !t.moved) out.push({ d, id: t.id, text: t.text, step: t.step });
      for (const t of (S.later || [])) out.push({ d: 'later', id: t.id, text: t.text, step: t.step });
      return out;
    }
    function takeLater(fromDay, id, k = today()) {
      if (tasks(k).length >= 3) return { ok: false, msg: 'Out of energy for today.' };
      return commit('Task back in hand', () => {
        let t;
        if (fromDay === 'later') { t = (S.later || []).find(x => x.id === id); S.later = (S.later || []).filter(x => x.id !== id); }
        else { t = (S.tasks[fromDay] || []).find(x => x.id === id); if (t) t.moved = true; }
        if (!t) return { error: 'That task is gone.' };
        (S.tasks[k] = S.tasks[k] || []).push({ id: uid(), text: t.text, step: t.step || '', done: false });
      });
    }
    const parkTask = (text, step = '') => commit('Parked in Later', () => { S.later = S.later || []; S.later.push({ id: uid(), text: String(text).trim(), step: String(step || '').trim() }); });
    const dropLater = (fromDay, id) => commit('Dropped', () => {
      if (fromDay === 'later') S.later = (S.later || []).filter(x => x.id !== id);
      else { const t = (S.tasks[fromDay] || []).find(x => x.id === id); if (t) t.moved = true; }
    });

    /* ---------- relics, graduation, campfire ---------- */
    const relicName = r => { const c = card(r.card); if (r.combo && c) return c.name; const l = c && r.link && c.links.find(x => x.id === r.link); return (l && l.name) || r.name || 'Relic'; };
    function graduateNow(S, cid, lid, d) {
      const c = card(cid), l = c && c.links.find(x => x.id === lid); if (!l) return;
      setState(l, 'auto', d);
      S.relics.push({ id: uid(), card: cid, link: lid, name: l.name, idn: l.idn, on: d, miss: 0 });
      if (!linksAt(c, d, 'training').length) {
        setState(c, 'relic', d);
        const tally = {}; liveLinks(c, d).forEach(x => { tally[x.idn] = (tally[x.idn] || 0) + 1; });
        S.relics.push({ id: uid(), card: cid, combo: true, name: c.name, idn: Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || 'Healthy', on: d, miss: 0 });
      }
    }
    /* a training link becomes a graduation candidate after 28+ days in training, its last two weekly ratings at 6+, and card strength >= 0.8 */
    function candidates(k = today()) {
      const out = [];
      for (const c of trainingCards(k)) for (const l of linksAt(c, k, 'training')) {
        const since = lastTrainingStart(l); if (!since || diff(k, since) < 28) continue;
        const fires = S.fires.filter(f => f.date >= since && f.ratings && f.ratings[l.id] != null).sort((a, b) => a.date < b.date ? -1 : 1).slice(-2);
        if (fires.length < 2 || !fires.every(f => f.ratings[l.id] >= 6)) continue;
        if (l.srbai && l.srbai.date >= fires[fires.length - 1].date) continue; // checked since the last campfire
        if (strength(c, k) < 0.8) continue;
        out.push({ cid: c.id, lid: l.id, name: l.name, card: c.name, strength: strength(c, k) });
      }
      return out;
    }
    const graduationCheck = (cid, lid, answers, d = today()) => commit('Graduation check', () => {
      const a = answers.map(Number); if (a.length !== 4 || a.some(x => !(x >= 1 && x <= 7))) return { error: 'Answer all four questions.' };
      const avg = a.reduce((x, y) => x + y, 0) / 4;
      const c = card(cid), l = c && c.links.find(x => x.id === lid); if (!l) return { error: 'Habit not found.' };
      l.srbai = { date: d, avg };
      if (avg >= 6) { graduateNow(S, cid, lid, d); return { msg: 'graduated', data: { graduated: true, avg } }; }
      return { msg: 'not yet', data: { graduated: false, avg } };
    });
    const graduate = (cid, lid, d = today()) => commit('Graduated', () => graduateNow(S, cid, lid, d));
    function crackNow(rid, d) {
      const r = S.relics.find(x => x.id === rid); if (!r) return;
      const c = card(r.card);
      if (c) {
        if (r.combo) {
          liveLinks(c, d).forEach(l => { if (linkState(l, d) === 'auto') setState(l, 'training', d); });
          setState(c, 'training', d);
          S.relics = S.relics.filter(x => x.card !== c.id);
        } else {
          const l = c.links.find(x => x.id === r.link); if (l) setState(l, 'training', d);
          if (cardState(c, d) === 'relic') { setState(c, 'training', d); S.relics = S.relics.filter(x => !(x.combo && x.card === c.id)); }
          S.relics = S.relics.filter(x => x.id !== rid);
        }
      } else S.relics = S.relics.filter(x => x.id !== rid);
      S.gone[rid] = Date.now();
    }
    const crack = (rid, d = today()) => commit('Relic cracked', () => crackNow(rid, d));
    /* campfire weeks run Sunday..Saturday so a Sunday-night and a Monday campfire count as the same one */
    const fireWeek = k => weekOf(addDays(k, 1));
    const currentFire = (k = today()) => S.fires.find(f => f.week === fireWeek(k)) || null;
    function fireDue(k = today()) { const w = dow(k); return (w === 0 || w === 1 || w === 2) && !currentFire(k); }
    function submitFire(input, k = today()) {
      return commit('Campfire closed', () => {
        const wk = fireWeek(k);
        let f = S.fires.find(x => x.week === wk);
        if (!f) { f = { id: uid(), week: wk }; S.fires.push(f); }
        Object.assign(f, { date: k, ratings: input.ratings || {}, checks: input.checks || {}, note: input.note || '', at: Date.now() });
        const cracked = [];
        for (const [rid, ok] of Object.entries(f.checks)) {
          const r = S.relics.find(x => x.id === rid); if (!r) continue;
          r.miss = ok ? 0 : (r.miss || 0) + 1;
          if (r.miss >= 2) cracked.push(rid);
        }
        cracked.forEach(id => crackNow(id, k));
        if (input.layer) { const [cid, lid] = input.layer.split('|'); const cu = S.curses.find(x => x.id === cid); const ly = cu && cu.layers.find(x => x.id === lid); if (ly) ly.on = k; }
        let msg = '';
        if (input.draft) { const r = draftNow(input.draft, k); if (r && r.error) msg = r.error; }
        return { msg, data: { cracked: cracked.length } };
      });
    }

    /* ---------- draw pile / editing ---------- */
    function draftNow(bid, d) {
      const b = S.bench.find(x => x.id === bid); if (!b) return { error: 'Not in the draw pile.' };
      const target = b.join && card(b.join);
      if (b.cardRef && card(b.cardRef)) {
        if (trainingCards(d).length >= 3) return { error: 'Your hand is full (3 cards in training). Graduate or shelve one first.' };
        setState(card(b.cardRef), 'training', d);
      } else if (target && cardState(target, d) === 'training') {
        target.links.push({ id: b.id, name: b.name + (b.cue ? ` (${b.cue.charAt(0).toLowerCase() + b.cue.slice(1)})` : ''), idn: b.idn, hist: [{ from: d, state: 'training' }] });
        target.mt = Date.now();
      } else {
        if (trainingCards(d).length >= 3) return { error: 'Your hand is full (3 cards in training). Graduate or shelve one first.' };
        if (card(b.id)) b.id = b.id + '-' + uid().slice(0, 3);
        S.cards.push({ id: b.id, name: b.name, cue: b.cue || '', min: b.min || '', part: b.part || 'any', sched: b.sched || { type: 'daily' }, hist: [{ from: d, state: 'training' }], mt: Date.now(),
          links: [{ id: b.id + '-1', name: b.name, idn: b.idn, hist: [{ from: d, state: 'training' }] }] });
      }
      S.bench = S.bench.filter(x => x !== b); S.gone[b.id] = Date.now();
      return null;
    }
    const draft = (bid, d = today()) => commit('Drafted', () => draftNow(bid, d));
    const shelve = (cid, d = today()) => commit('Shelved', () => {
      const c = card(cid); if (!c) return { error: 'Card not found.' };
      setState(c, 'shelved', d);
      const l = liveLinks(c, d)[0];
      S.bench.push({ id: uid(), cardRef: cid, name: c.name, idn: (l && l.idn) || 'Healthy', cue: c.cue || '', min: c.min || '' });
    });
    const addBench = item => commit('Added to draw pile', () => { S.bench.push(Object.assign({ id: uid() }, item)); });
    const removeBench = bid => commit('Removed from draw pile', () => { S.bench = S.bench.filter(x => x.id !== bid); S.gone[bid] = Date.now(); });
    const updateCard = (cid, patch) => commit('Card edited', () => {
      const c = card(cid); if (!c) return { error: 'Card not found.' };
      for (const k of ['name', 'cue', 'min', 'part', 'sched']) if (patch[k] !== undefined) c[k] = patch[k];
      if (!c.name || !String(c.name).trim()) return { error: 'A card needs a name.' };
      c.mt = Date.now();
    });
    const updateLink = (cid, lid, patch) => commit('Link edited', () => {
      const c = card(cid), l = c && c.links.find(x => x.id === lid); if (!l) return { error: 'Link not found.' };
      if (patch.name !== undefined) { if (!String(patch.name).trim()) return { error: 'A link needs a name.' }; l.name = String(patch.name).trim(); }
      if (patch.idn !== undefined) l.idn = patch.idn;
      c.mt = Date.now();
    });
    const moveLink = (cid, lid, dir) => commit('Link moved', () => {
      const c = card(cid), i = c.links.findIndex(x => x.id === lid), j = i + dir;
      if (i < 0 || j < 0 || j >= c.links.length) return;
      [c.links[i], c.links[j]] = [c.links[j], c.links[i]]; c.mt = Date.now();
    });
    const addLink = (cid, name, idn, d = today()) => commit('Link added', () => {
      const c = card(cid); if (!c) return { error: 'Card not found.' }; if (!String(name).trim()) return { error: 'Name the new link.' };
      c.links.push({ id: uid(), name: String(name).trim(), idn: idn || 'Healthy', hist: [{ from: d, state: 'training' }] }); c.mt = Date.now();
    });
    const removeLink = (cid, lid, d = today()) => commit('Link removed', () => {
      const c = card(cid), l = c && c.links.find(x => x.id === lid); if (!l) return;
      if (liveLinks(c, d).length <= 1) return { error: 'A card needs at least one link. Shelve the card instead.' };
      setState(l, 'removed', d); c.mt = Date.now();
      if (cardState(c, d) === 'training' && !linksAt(c, d, 'training').length) graduateNowCombo(c, d);
    });
    function graduateNowCombo(c, d) { setState(c, 'relic', d); S.relics.push({ id: uid(), card: c.id, combo: true, name: c.name, idn: (liveLinks(c, d)[0] || {}).idn || 'Healthy', on: d, miss: 0 }); }
    const newCard = (name, idn, d = today()) => commit('Card created', () => {
      if (!String(name).trim()) return { error: 'Name the card.' };
      S.bench.push({ id: uid(), name: String(name).trim(), idn: idn || 'Healthy' });
    });

    /* ---------- curses ---------- */
    const curse = id => S.curses.find(x => x.id === id);
    const toggleLayer = (cid, lid, on, d = today()) => commit('Friction layer', () => { const l = curse(cid).layers.find(x => x.id === lid); l.on = on ? d : ''; });
    const setPlan = (cid, text) => commit('Plan saved', () => { curse(cid).plan = text; });
    const logSlip = (cid, ctx, d = today()) => commit('Slip logged', () => { curse(cid).slips.push({ id: uid(), date: d, ctx }); });
    const undoSlip = cid => commit('Slip removed', () => { curse(cid).slips.pop(); });
    const addCurse = name => commit('Curse added', () => {
      if (!String(name).trim()) return { error: 'Name the curse.' };
      S.curses.push({ id: uid(), name: String(name).trim(), since: today(), plan: 'If [where I usually slip] → then I [specific replacement].',
        layers: [{ id: 'del', name: 'Delete or log out', on: '' }, { id: 'delay', name: 'Delay app in front of it', on: '' }, { id: 'gray', name: 'Grayscale in the evening', on: '' }, { id: 'limit', name: 'Daily limit set', on: '' }], slips: [] });
    });
    const purgeCurse = (cid, d = today()) => commit('Curse purged', () => {
      const c = curse(cid); if (!c) return;
      S.relics.push({ id: uid(), card: '', name: `Purged: ${c.name}`, idn: 'Relaxed', on: d, miss: 0, purged: true, curse: clone(c) });
      S.curses = S.curses.filter(x => x !== c); S.gone[cid] = Date.now();
    });

    /* ---------- settings, pause ---------- */
    const setSettings = patch => commit('Settings saved', () => { Object.assign(S.settings, patch); });
    const setChore = (id, patch) => commit('Chore saved', () => { const c = S.chores.find(x => x.id === id); if (c) Object.assign(c, patch, { mt: Date.now() }); });
    const setWorkout = patch => commit('Workout saved', () => { Object.assign(S.workout, patch); });
    const addPause = (from, to) => commit('Pause added', () => { if (!from || !to || to < from) return { error: 'Pick a start and end date.' }; S.pauses.push({ id: uid(), from, to }); });
    const removePause = id => commit('Pause removed', () => { S.pauses = S.pauses.filter(p => p.id !== id); S.gone[id] = Date.now(); });

    /* ---------- merge (for moving between devices) ---------- */
    function mergeInto(a, b) {
      const out = clone(a), gone = Object.assign({}, a.gone || {}, b.gone || {});
      out.gone = gone;
      for (const [d, cards] of Object.entries(b.log || {})) for (const [cid, R] of Object.entries(cards)) {
        out.log[d] = out.log[d] || {}; const L = out.log[d][cid];
        if (!L) { out.log[d][cid] = clone(R); continue; }
        L.links = L.links || {}; for (const [k, v] of Object.entries(R.links || {})) if (v) L.links[k] = true;
        if (R.min) L.min = true; if (R.skip) L.skip = true;
      }
      for (const [d, ts] of Object.entries(b.tasks || {})) {
        const mine = out.tasks[d] = out.tasks[d] || [];
        for (const t of ts) { const m = mine.find(x => x.id === t.id); if (!m) mine.push(clone(t)); else { m.done = m.done || t.done; m.moved = m.moved || t.moved; } }
      }
      for (const [d, cs] of Object.entries(b.chorelog || {})) out.chorelog[d] = Object.assign({}, out.chorelog[d], cs);
      for (const [d, w] of Object.entries((b.workout || {}).log || {})) { const m = out.workout.log[d]; if (!m || (!m.r && w.r)) out.workout.log[d] = clone(w); }
      const byId = (key, prefer = (x, y) => ((y.mt || 0) > (x.mt || 0) ? y : x)) => {
        const map = new Map(); for (const x of out[key] || []) map.set(x.id, x);
        for (const y of b[key] || []) { const x = map.get(y.id); map.set(y.id, x ? clone(prefer(x, y)) : clone(y)); }
        out[key] = [...map.values()].filter(x => !gone[x.id]);
      };
      byId('cards'); byId('relics'); byId('bench'); byId('chores'); byId('pauses');
      byId('fires', (x, y) => ((y.at || 0) > (x.at || 0) ? y : x));
      const cm = new Map(); for (const c of out.curses) cm.set(c.id, c);
      for (const c of b.curses || []) {
        const m = cm.get(c.id);
        if (!m) { cm.set(c.id, clone(c)); continue; }
        for (const s of c.slips || []) if (!m.slips.some(x => x.id === s.id)) m.slips.push(clone(s));
        for (const l of c.layers || []) { const ml = m.layers.find(x => x.id === l.id); if (ml && !ml.on && l.on) ml.on = l.on; }
      }
      out.curses = [...cm.values()].filter(x => !gone[x.id]);
      out.later = [...new Map([...(out.later || []), ...(b.later || [])].map(x => [x.id, x])).values()];
      return normalize(out);
    }
    const b64e = s => (typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));
    const b64d = s => (typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'));
    const exportJSON = () => JSON.stringify(S, null, 1);
    const exportCode = () => b64e(JSON.stringify(S));
    function parseIncoming(text) {
      text = String(text || '').trim(); let o;
      try { o = JSON.parse(text.startsWith('{') ? text : b64d(text)); } catch (e) { return null; }
      if (!o || typeof o.v !== 'number' || o.v > VERSION) return null;
      while (o.v < VERSION) o = MIGRATE[o.v](o);
      return normalize(o);
    }
    function importData(text, mode = 'merge') {
      const o = parseIncoming(text); if (!o) return { ok: false, msg: 'That doesn’t look like a deck save code or backup.' };
      return commit(mode === 'merge' ? 'Merged' : 'Replaced', () => { const keep = S.rev; S = mode === 'merge' ? mergeInto(S, o) : o; S.rev = keep; });
    }
    const replaceRaw = text => { let o; try { o = JSON.parse(text); } catch (e) { return { ok: false, msg: 'That isn’t valid JSON. Nothing changed.' }; } if (!o || o.v !== VERSION) return { ok: false, msg: 'Missing "v": ' + VERSION + '. Nothing changed.' }; return commit('Raw edit', () => { const keep = S.rev; S = normalize(o); S.rev = keep; }); };
    const resetAll = () => commit('Reset', () => { const keep = S.rev; S = seed(); S.rev = keep; });

    const api = {
      VERSION, KEY, IDS, SRBAI, DAY_NAMES,
      today, logicalHour, addDays, diff, dow, weekOf, esc, uid, parse,
      load, undo, onChange: f => { listeners.add(f); return () => listeners.delete(f); }, reloadFromStorage,
      get S() { return S; }, get readOnly() { return readOnly; }, get notice() { return notice; }, clearNotice() { notice = ''; },
      get undoLabel() { return undoSlot ? undoSlot.label : ''; },
      card, cardState, linkState, linksAt, liveLinks, trainingCards, isPaused, isDue, isPlayed, isScheduledDay, record, strength, heat, weekStatus, sched, logOf,
      toggleLink, toggleMin, toggleSkip, playAll,
      nextSession, sessionFor, workoutResult, logWorkout, pickSession, workoutWeek,
      choresDue, choreDoneOn, toggleChore,
      tasks, addTask, toggleTask, removeTask, later, takeLater, parkTask, dropLater,
      relicName, candidates, graduationCheck, graduate, crack, currentFire, fireDue, submitFire,
      draft, shelve, addBench, removeBench, updateCard, updateLink, moveLink, addLink, removeLink, newCard,
      toggleLayer, setPlan, logSlip, undoSlip, addCurse, purgeCurse,
      setSettings, setChore, setWorkout, addPause, removePause,
      exportJSON, exportCode, importData, mergeInto, replaceRaw, resetAll, snapshots, restoreSnapshot
    };
    return api;
  }

  const exported = { createDeck, VERSION, KEY, stateAt, weekOf, addDays, dkey };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else {
    root.DeckCore = exported;
    root.Deck = createDeck();
    root.Deck.load();
    if (root.navigator && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
