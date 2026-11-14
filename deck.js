/* Deck: habits-as-cards tracker shared by index.html and deck.html.
   All state lives in localStorage under KEY on this device. */
(function () {
  const KEY = 'deck.v1';
  const IDS = ['Relaxed', 'Confident', 'Interesting', 'Relationships', 'Healthy'];
  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => dkey(new Date());
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return dkey(d); };
  const diff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const dow = k => parse(k).getDay();
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function seed() {
    const t = today();
    return {
      v: 1, created: t,
      cards: [
        { id: 'evening', name: 'Evening Shutdown', part: 'evening', state: 'training', started: t,
          min: 'Phone out of the bedroom + skincare',
          links: [
            { id: 'phone', name: '8:30: phone on the charger outside the bedroom', idn: 'Relaxed', state: 'training', since: t },
            { id: 'skin', name: 'Brush teeth → moisturizer / retinol', idn: 'Healthy', state: 'training', since: t },
            { id: 'read', name: 'Read in bed (book on the pillow)', idn: 'Interesting', state: 'training', since: t },
            { id: 'lights', name: 'Lights out around 9', idn: 'Healthy', state: 'training', since: t }
          ] },
        { id: 'morning', name: 'Morning Engine', part: 'morning', state: 'training', started: t,
          min: 'Up at 6:30 + one NeetCode problem',
          links: [
            { id: 'wake', name: 'Up at 6:30', idn: 'Healthy', state: 'training', since: t },
            { id: 'neet', name: 'Coffee → NeetCode (1+ problem)', idn: 'Confident', state: 'auto' },
            { id: 'yoga', name: 'Yoga / mobility', idn: 'Relaxed', state: 'auto' },
            { id: 'workout', name: 'Workout', idn: 'Healthy', state: 'auto', workout: true }
          ] }
      ],
      relics: [
        { id: uid(), card: 'morning', link: 'neet', name: 'Coffee → NeetCode', idn: 'Confident', on: 'before the deck', miss: 0 },
        { id: uid(), card: 'morning', link: 'yoga', name: 'Morning yoga / mobility', idn: 'Relaxed', on: 'before the deck', miss: 0 },
        { id: uid(), card: 'morning', link: 'workout', name: 'Training rotation', idn: 'Healthy', on: 'before the deck', miss: 0 }
      ],
      bench: [
        { id: 'macros', name: 'Log macros (saved meals)', idn: 'Healthy', cue: 'After each meal → log it', min: 'Protein hit (190 g)' },
        { id: 'meditate', name: 'Meditate 3 min', idn: 'Relaxed', cue: 'After yoga, still on the mat', join: 'morning' },
        { id: 'sysdesign', name: 'System design session', idn: 'Confident', cue: 'Late morning, 2–3× a week', min: '10 minutes on one topic' },
        { id: 'reachout', name: 'Message one person', idn: 'Relationships', cue: 'After lunch → text a friend or family', min: 'Send one emoji-level hello' }
      ],
      chores: [
        { id: 'trash', name: 'Trash out', kind: 'eve-before', days: [] },
        { id: 'recycle', name: 'Recycling out', kind: 'biweekly-eve', anchor: '' },
        { id: 'mow', name: 'Mow the lawn', kind: 'weekly', days: [6], season: [4, 11], off: 'Winter yard / house chore' },
        { id: 'hair', name: 'Trim hair', kind: 'weekly', days: [0] }
      ],
      workout: { cycle: ['Deadlift', 'Push', 'Squat', 'Pull', 'Rest'], next: 0, log: {} },
      tasks: {}, log: {}, chorelog: {},
      curses: [{ id: 'tiktok', name: 'TikTok', since: t,
        plan: 'If I reach for my phone in bed → I read my book instead.',
        layers: [
          { id: 'del', name: 'Delete the app', on: '' },
          { id: 'delay', name: 'Delay app in front of it (one sec)', on: '' },
          { id: 'gray', name: 'Grayscale in the evening', on: '' },
          { id: 'limit', name: 'Daily limit set in Digital Wellbeing', on: '' },
          { id: 'bed', name: 'Phone charges outside the bedroom', on: '' }
        ], slips: [] }],
      fires: []
    };
  }

  let S;
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
    if (!S || S.v !== 1) { S = seed(); persist(); }
    return S;
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function save() { persist(); if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('deckchange')); }

  /* ---- daily logic ---- */
  const dayLog = k => (S.log[k] = S.log[k] || {});
  const cardLog = (c, k) => { const d = dayLog(k); return (d[c] = d[c] || { links: {} }); };
  const findCard = id => S.cards.find(c => c.id === id);
  function isPlayed(card, k) {
    const L = (S.log[k] || {})[card.id]; if (!L) return false;
    if (L.min) return true;
    const need = card.links.filter(l => l.state === 'training');
    return need.length > 0 && need.every(l => L.links[l.id]);
  }
  function record(card, k = today(), n = 14) {
    const span = Math.min(n, diff(k, card.started) + 1);
    let played = 0, last = null;
    for (let i = 0; i < span; i++) { const d = addDays(k, -i); if (isPlayed(card, d)) { played++; if (!last) last = d; } }
    if (!last) for (let i = span; i < 120; i++) { const d = addDays(k, -i); if (d < card.started) break; if (isPlayed(card, d)) { last = d; break; } }
    const missedYesterday = card.started < k && !isPlayed(card, addDays(k, -1)) && !isPlayed(card, k);
    const missedTwice = missedYesterday && card.started < addDays(k, -1) && !isPlayed(card, addDays(k, -2));
    return { played, span, last, since: last ? diff(k, last) : null, missedYesterday, missedTwice };
  }
  function workoutFor(k) { return S.workout.log[k] || S.workout.cycle[S.workout.next % S.workout.cycle.length]; }
  function toggleLink(cid, lid, on, k = today()) {
    const card = findCard(cid), link = card && card.links.find(l => l.id === lid); if (!link) return;
    const L = cardLog(cid, k), W = S.workout, n = W.cycle.length;
    if (link.workout && on && !W.log[k]) { W.log[k] = W.cycle[W.next % n]; W.next = (W.next + 1) % n; }
    if (link.workout && !on && W.log[k]) { delete W.log[k]; W.next = (W.next - 1 + n) % n; }
    L.links[lid] = !!on; save();
  }
  function toggleMin(cid, k = today()) { const L = cardLog(cid, k); L.min = !L.min; save(); }

  function choresDue(k = today()) {
    const out = [], m = parse(k).getMonth() + 1, tomorrow = addDays(k, 1);
    for (const c of S.chores) {
      if (c.kind === 'weekly' && (c.days || []).includes(dow(k))) {
        const inSeason = !c.season || (m >= c.season[0] && m <= c.season[1]);
        if (inSeason) out.push({ id: c.id, name: c.name }); else if (c.off) out.push({ id: c.id, name: c.off });
      }
      if (c.kind === 'eve-before' && (c.days || []).includes(dow(tomorrow))) out.push({ id: c.id, name: c.name + ' (pickup tomorrow)', eve: true });
      if (c.kind === 'biweekly-eve' && c.anchor && ((diff(tomorrow, c.anchor) % 14) + 14) % 14 === 0) out.push({ id: c.id, name: c.name + ' (pickup tomorrow)', eve: true });
    }
    return out;
  }
  const choreDone = (id, k = today()) => !!(S.chorelog[k] || {})[id];
  function toggleChore(id, k = today()) { const d = (S.chorelog[k] = S.chorelog[k] || {}); d[id] = !d[id]; save(); }

  /* ---- tasks ---- */
  const tasks = k => (S.tasks[k] = S.tasks[k] || []);
  function addTask(text, step, k = today()) { const t = tasks(k); if (t.length >= 3 || !text.trim()) return false; t.push({ id: uid(), text: text.trim(), step: (step || '').trim(), done: false }); save(); return true; }
  function carryOver(k = today()) { const y = S.tasks[addDays(k, -1)] || [], t = tasks(k); return y.filter(x => !x.done && !t.some(z => z.text === x.text)); }

  /* ---- graduation, relics, drafting ---- */
  const trainingCards = () => S.cards.filter(c => c.state === 'training');
  function eligible(card, link, k = today()) {
    if (link.state !== 'training') return false;
    if (diff(k, link.since || card.started) < 28) return false;
    const last = S.fires.slice(-3);
    return last.length === 3 && last.every(f => (f.ratings || {})[link.id] >= 6);
  }
  function graduate(cid, lid, k = today()) {
    const card = findCard(cid), link = card.links.find(l => l.id === lid);
    link.state = 'auto';
    S.relics.push({ id: uid(), card: cid, link: lid, name: link.name, idn: link.idn, on: k, miss: 0 });
    if (card.links.every(l => l.state === 'auto')) {
      card.state = 'relic';
      const tally = {}; card.links.forEach(l => tally[l.idn] = (tally[l.idn] || 0) + 1);
      const idn = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      S.relics.push({ id: uid(), card: cid, combo: true, name: card.name, idn, on: k, miss: 0 });
    }
    save();
  }
  function crack(rid, k = today()) {
    const r = S.relics.find(x => x.id === rid); if (!r) return;
    const card = findCard(r.card);
    if (card) {
      if (r.combo) { card.state = 'training'; card.started = k; }
      else {
        const link = card.links.find(l => l.id === r.link);
        if (link) { link.state = 'training'; link.since = k; }
        if (card.state === 'relic') { card.state = 'training'; S.relics = S.relics.filter(x => !(x.combo && x.card === card.id)); }
      }
    }
    S.relics = S.relics.filter(x => x.id !== rid); save();
  }
  function draft(bid, k = today()) {
    const b = S.bench.find(x => x.id === bid); if (!b) return 'Not found';
    const link = { id: b.id, name: b.name, idn: b.idn, state: 'training', since: k };
    if (b.join && findCard(b.join) && findCard(b.join).state === 'training') {
      if (b.cue) link.name += ` (${b.cue.charAt(0).toLowerCase() + b.cue.slice(1)})`;
      findCard(b.join).links.push(link);
    } else {
      if (trainingCards().length >= 3) return 'Your hand is full: graduate or shelve a card first.';
      S.cards.push({ id: b.id, name: b.name, cue: b.cue || '', part: 'any', state: 'training', started: k, min: b.min || '', links: [link] });
    }
    S.bench = S.bench.filter(x => x.id !== bid); save(); return '';
  }

  /* ---- save code ---- */
  const exportCode = () => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  function importCode(code) { const o = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!o || o.v !== 1) throw new Error('bad'); S = o; save(); }
  function replace(o) { if (!o || o.v !== 1) throw new Error('bad'); S = o; save(); }

  /* ---- hand renderer (used on both pages) ---- */
  function cardHTML(c, k) {
    const L = (S.log[k] || {})[c.id] || { links: {} }, r = record(c, k), played = isPlayed(c, k);
    const rows = c.links.map(l => {
      let name = l.name;
      if (l.workout) { const w = workoutFor(k); name = w === 'Rest' ? 'Rest day (tap when rested)' : `Workout: ${w} day`; }
      const on = !!L.links[l.id];
      return `<label class="lk${l.state === 'auto' ? ' auto' : ''}${on ? ' on' : ''}"><input type="checkbox" data-act="link" data-c="${c.id}" data-l="${l.id}"${on ? ' checked' : ''}><span>${esc(name)}</span>${l.state === 'auto' ? '<em>relic</em>' : ''}</label>`;
    }).join('');
    const nudge = played ? '' : r.missedTwice ? '<p class="nudge hard">Two misses in a row. Even the minimum today breaks the slide.</p>'
      : r.missedYesterday ? '<p class="nudge">Missed yesterday. Today keeps it alive.</p>' : '';
    const rec = r.span > 1 ? `Played ${r.played} of the last ${r.span} days` : 'Day one';
    return `<article class="combo${played ? ' played' : ''}"><header><h3>${esc(c.name)}</h3><span class="badge">${played ? 'Played' : c.links.length > 1 ? 'Combo' : 'Habit'}</span></header>
      ${c.cue ? `<p class="cue">${esc(c.cue)}</p>` : ''}<div class="links">${rows}</div>${nudge}
      <footer>${c.min ? `<button type="button" class="minbtn${L.min ? ' on' : ''}" data-act="min" data-c="${c.id}">${L.min ? '✓ ' : ''}Minimum: ${esc(c.min)}</button>` : ''}<small>${rec}</small></footer></article>`;
  }
  function handHTML() {
    const k = today(), t = tasks(k), done = t.filter(x => x.done).length;
    const pips = [0, 1, 2].map(i => `<span class="pip${i < done ? ' spent' : ''}" aria-hidden="true"></span>`).join('');
    const slots = [0, 1, 2].map(i => {
      const x = t[i];
      if (x) return `<div class="tc${x.done ? ' played' : ''}"><button type="button" class="tcb" data-act="task" data-i="${i}"><span class="cost">1</span><span class="tt">${esc(x.text)}</span>${x.step ? `<span class="ts">First step: ${esc(x.step)}</span>` : ''}<span class="tp">${x.done ? 'Played ✓' : 'Tap to play'}</span></button><button type="button" class="rm" data-act="rmtask" data-i="${i}" aria-label="Remove task">×</button></div>`;
      if (i === t.length) return `<form class="tc add" data-act="addtask"><input name="t" placeholder="Task" maxlength="80" required aria-label="Task"><input name="s" placeholder="First tiny step (optional)" maxlength="80" aria-label="First tiny step"><button type="submit">Add to hand</button></form>`;
      return '<div class="tc empty" aria-hidden="true"></div>';
    }).join('');
    const carry = carryOver(k).filter(() => t.length < 3).map(x => `<button type="button" class="chip" data-act="carry" data-text="${esc(x.text)}" data-step="${esc(x.step)}">↩ ${esc(x.text)}</button>`).join('');
    const hour = new Date().getHours();
    const combos = trainingCards().slice().sort((a, b) => {
      const w = c => c.part === 'morning' ? (hour < 15 ? 0 : 2) : c.part === 'evening' ? (hour < 15 ? 2 : 0) : 1; return w(a) - w(b);
    }).map(c => cardHTML(c, k)).join('');
    const chores = choresDue(k).map(c => `<label class="chore${choreDone(c.id, k) ? ' on' : ''}"><input type="checkbox" data-act="chore" data-id="${c.id}"${choreDone(c.id, k) ? ' checked' : ''}><span>${esc(c.name)}</span></label>`).join('');
    const fireDue = dow(k) === 0 && !S.fires.some(f => f.date > addDays(k, -6));
    return `<div class="energy"><span class="elabel">Energy</span>${pips}<span class="ecount">${3 - done} left</span></div>
      <div class="hand">${slots}</div>${carry ? `<div class="carry"><span>Yesterday's unplayed:</span>${carry}</div>` : ''}
      <div class="combos">${combos || '<p class="empty-note">No habit cards in training. Draft one at the campfire.</p>'}</div>
      ${chores ? `<div class="chores"><span class="clabel">Due today</span>${chores}</div>` : ''}
      ${fireDue ? '<a class="fire" href="deck.html#campfire">🔥 Campfire tonight: 10 minutes to review the week ›</a>' : ''}`;
  }
  function mountHand(el) {
    const draw = () => { el.innerHTML = handHTML(); };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
      const k = today(), t = tasks(k), a = b.dataset.act;
      if (a === 'task') { t[+b.dataset.i].done = !t[+b.dataset.i].done; save(); }
      if (a === 'rmtask') { t.splice(+b.dataset.i, 1); save(); }
      if (a === 'min') toggleMin(b.dataset.c);
      if (a === 'carry') addTask(b.dataset.text, b.dataset.step);
    });
    el.addEventListener('change', e => {
      const i = e.target; if (!i.dataset) return;
      if (i.dataset.act === 'link') toggleLink(i.dataset.c, i.dataset.l, i.checked);
      if (i.dataset.act === 'chore') toggleChore(i.dataset.id);
    });
    el.addEventListener('submit', e => { e.preventDefault(); const f = e.target; addTask(f.t.value, f.s.value); });
    window.addEventListener('deckchange', draw);
    window.addEventListener('storage', e => { if (e.key === KEY) { load(); draw(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
    draw();
  }

  const api = { KEY, IDS, load, save, seed, today, addDays, diff, dow, uid, esc, isPlayed, record, workoutFor, toggleLink, toggleMin,
    choresDue, toggleChore, choreDone, tasks, addTask, carryOver, trainingCards, eligible, graduate, crack, draft,
    exportCode, importCode, replace, handHTML, mountHand, get S() { return S; } };
  if (typeof module !== 'undefined') module.exports = api; else window.Deck = api;
  if (typeof localStorage !== 'undefined') load();
})();
