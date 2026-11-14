/* deck-ui.js: shared rendering for the hand (dashboard + deck page), identity marks, relic emblems,
   toasts and celebrations. Depends on window.Deck from deck-core.js. */
(function () {
  'use strict';
  const D = window.Deck, esc = D.esc;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- identity system: colour + shape + glyph, never colour alone ---------- */
  const ID = {
    Relaxed: { c: '#1a8fb5', on: '#fff', shape: '<circle cx="50" cy="50" r="46"/>', glyph: '<path d="M5.5 12.5q1.6-3 3.25 0t3.25 0 3.25 0 3.25 0" fill="none"/>' },
    Confident: { c: '#e0a100', on: '#1a1400', shape: '<path d="M50 4 92 17V50C92 74 74 89 50 97 26 89 8 74 8 50V17Z"/>', glyph: '<path d="M6.5 15.5 12 8.5l5.5 7" fill="none"/>' },
    Interesting: { c: '#7a5af8', on: '#fff', shape: '<path d="M50 3 97 50 50 97 3 50Z"/>', glyph: '<path d="M12 5.5l1.7 4.8 4.8 1.7-4.8 1.7L12 18.5l-1.7-4.8L5.5 12l4.8-1.7z" fill="currentColor" stroke="none"/>' },
    Relationships: { c: '#e2457a', on: '#fff', shape: '<path d="M50 3 91 26.5V73.5L50 97 9 73.5V26.5Z"/>', glyph: '<circle cx="9.6" cy="12" r="3.6" fill="none"/><circle cx="14.4" cy="12" r="3.6" fill="none"/>' },
    Healthy: { c: '#2f9e55', on: '#fff', shape: '<rect x="7" y="7" width="86" height="86" rx="18"/>', glyph: '<path d="M5 12.5h3l2-4.5 3.5 8 2-3.5H19" fill="none"/>' }
  };
  const idOf = k => ID[k] || ID.Healthy;
  function idMark(k, size = 18) {
    const I = idOf(k);
    return `<svg class="idmark" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(k)}"><g fill="${I.c}">${I.shape}</g><g transform="translate(50 50) scale(2.7) translate(-12 -12)" stroke="${I.on}" color="${I.on}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I.glyph}</g></svg>`;
  }
  function hash(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
  function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mix(hex, to, amt) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const a = p(hex), b = p(to); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amt).toString(16).padStart(2, '0')).join(''); }
  /* a unique, stable emblem per relic, generated from its name */
  function emblem(name, k, size = 56) {
    const I = idOf(k), r = rng(hash(name)), n = 5 + Math.floor(r() * 5), len = 18 + r() * 10, w = 5 + r() * 4, rot = r() * 360, dash = 2 + Math.floor(r() * 5);
    let petals = ''; for (let i = 0; i < n; i++) petals += `<ellipse cx="50" cy="${50 - len}" rx="${w.toFixed(1)}" ry="${(len * 0.55).toFixed(1)}" transform="rotate(${(rot + i * 360 / n).toFixed(1)} 50 50)"/>`;
    return `<svg class="emb" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><g fill="${I.c}">${I.shape}</g><g fill="${I.on}" opacity=".22">${petals}</g><circle cx="50" cy="50" r="31" fill="none" stroke="${I.on}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="${dash} ${dash + 2}"/><circle cx="50" cy="50" r="19" style="fill:var(--cardbg)" stroke="${mix(I.c, '#000000', 0.25)}" stroke-width="2.5"/><g transform="translate(50 50) scale(1.25) translate(-12 -12)" style="color:var(--ink);stroke:var(--ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${I.glyph}</g></svg>`;
  }

  /* ---------- toast with undo ---------- */
  let toastEl, toastT;
  function toast(msg, withUndo) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button type="button">Undo</button>' : ''}`;
    toastEl.classList.add('show');
    const b = toastEl.querySelector('button'); if (b) b.onclick = () => { D.undo(); hideToast(); };
    clearTimeout(toastT); toastT = setTimeout(hideToast, withUndo ? 6000 : 4000);
  }
  function hideToast() { if (toastEl) toastEl.classList.remove('show'); }
  /* run a core action; toast the outcome (undo for real changes, the message for refusals) */
  function act(r, quiet) {
    if (!r) return r;
    if (!r.ok) { if (r.msg) toast(r.msg); return r; }
    if (!quiet) toast(r.msg && r.msg !== 'graduated' && r.msg !== 'not yet' ? r.msg : r.label, true);
    return r;
  }

  /* ---------- celebration overlay for a new relic ---------- */
  function celebrate(name, idn) {
    const ov = document.createElement('div'); ov.className = 'celebrate';
    ov.innerHTML = `<div class="cel-card" role="status"><div class="cel-emb">${emblem(name, idn, 128)}</div><p class="cel-k">Relic earned</p><h3>${esc(name)}</h3><p class="cel-v">${idMark(idn, 16)} A vote for <b>${esc(idn)}</b> that now runs on its own</p><button type="button">Nice</button></div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.tagName === 'BUTTON') close(); });
    ov.querySelector('button').focus();
    if (reduced()) return;
    const card = ov.querySelector('.cel-card'), emb = ov.querySelector('.cel-emb');
    card.animate([{ transform: 'translateY(60px) rotate(6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.9,.25,1.2)' });
    emb.animate([{ transform: 'perspective(400px) rotateY(180deg) scale(.6)' }, { transform: 'perspective(400px) rotateY(0) scale(1)' }], { duration: 700, delay: 150, easing: 'cubic-bezier(.2,.9,.25,1.2)', fill: 'backwards' });
    const box = document.createElement('div'); box.className = 'parts'; card.appendChild(box);
    const keys = Object.keys(ID);
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('span'); p.className = 'pt'; p.innerHTML = idMark(keys[i % keys.length], 14); box.appendChild(p);
      const a = (i / 18) * Math.PI * 2, dist = 90 + Math.random() * 70;
      p.animate([{ transform: 'translate(0,0) scale(.4)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px,${Math.sin(a) * dist + 40}px) rotate(${(Math.random() - 0.5) * 540}deg)`, opacity: 0 }], { duration: 1000 + Math.random() * 400, delay: 380, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'both' });
    }
  }
  function stampIn(el) {
    if (!el || reduced()) return;
    el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px) rotate(-2deg) scale(1.03)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1.2)' });
    const s = el.querySelector('.stamp'); if (s) s.animate([{ transform: 'rotate(-12deg) scale(2.2)', opacity: 0 }, { transform: 'rotate(-12deg) scale(1)', opacity: 1 }], { duration: 260, delay: 160, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'backwards' });
  }

  /* ---------- small pieces ---------- */
  const niceDay = (k, today) => k === today ? 'Today' : k === D.addDays(today, -1) ? 'Yesterday' : D.parse(k).toLocaleDateString(undefined, { weekday: 'long' });
  const longDay = k => D.parse(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  function weekStrip(c, k) {
    const cells = []; for (let i = 6; i >= 0; i--) { const d = D.addDays(k, -i); const h = D.heat(c, k, 2).find(x => x.d === d); cells.push(`<i class="h-${h ? h.st : 'none'}" title="${esc(longDay(d))}: ${esc(h ? h.st : '')}"></i>`); }
    return `<span class="strip" aria-hidden="true">${cells.join('')}</span>`;
  }
  function meter(v) { const p = Math.round(v * 100); return `<span class="meter" title="Habit strength ${p}%" aria-label="Habit strength ${p}%"><i style="width:${p}%"></i></span><small>${p}%</small>`; }

  function habitCard(c, k, today, opts = {}) {
    const S = D.S, L = D.logOf(k, c.id) || { links: {} }, played = D.isPlayed(c, k), due = D.isDue(c, k), s = D.sched(c);
    const training = D.linksAt(c, k, 'training'), relicLinks = D.linksAt(c, k, 'auto');
    const rec = D.record(c, k);
    if (!due && !played && !L.skip) {
      const why = D.isPaused(k) ? 'Paused' : 'Off today';
      return `<article class="hc off"><header><h3>${esc(c.name)}</h3><span class="badge">${why}</span></header></article>`;
    }
    let badge = played ? (L.min ? 'Minimum ✓' : 'Played ✓') : L.skip ? 'Excused' : training.length > 1 ? 'Combo' : 'Habit';
    if (s.type === 'perWeek') badge = `${rec.week.plays} of ${rec.week.n} this week${rec.week.done ? ' ✓' : ''}`;
    const rows = training.map(l => {
      const on = !!(L.links && L.links[l.id]);
      return `<label class="lk${on ? ' on' : ''}"><input type="checkbox" data-act="link" data-c="${c.id}" data-l="${l.id}" data-d="${k}"${on ? ' checked' : ''}><span>${esc(l.name)}</span>${idMark(l.idn, 16)}</label>`;
    }).join('');
    const relicLine = relicLinks.length ? `<p class="auto">◆ Runs on its own: ${relicLinks.map(l => esc(l.name.replace(/\s*\(.*\)$/, ''))).join(' · ')}</p>` : '';
    let nudge = '';
    if (!played && !L.skip && k === today) {
      if (s.type === 'perWeek') { if (rec.week.behind) nudge = `<p class="nudge">${rec.week.needed} more this week and ${rec.week.daysLeft} day${rec.week.daysLeft === 1 ? '' : 's'} left. The minimum counts.</p>`; }
      else if (rec.missRun >= 2) nudge = '<p class="nudge hard">Two misses in a row. Even the minimum today stops the slide.</p>';
      else if (rec.missRun === 1) nudge = '<p class="nudge">Missed last time. Today keeps it alive.</p>';
    }
    const recLine = s.type === 'perWeek' ? (rec.weeks ? `Hit the target ${rec.met} of the last ${rec.weeks} weeks` : 'First week') : (rec.due > 1 ? `Played ${rec.played} of the last ${rec.due} days` : 'Day one');
    return `<article class="hc${played ? ' played' : ''}${L.skip ? ' skipped' : ''}" data-card="${c.id}">
      <header><h3>${esc(c.name)}</h3><span class="badge">${esc(badge)}</span></header>
      ${c.cue ? `<p class="cue">${esc(c.cue)}</p>` : ''}
      <div class="links">${rows}</div>${relicLine}${nudge}
      <div class="hc-actions">
        ${!played && training.length > 1 ? `<button type="button" class="sm" data-act="all" data-c="${c.id}" data-d="${k}">Played all</button>` : ''}
        ${c.min ? `<button type="button" class="sm minbtn${L.min ? ' on' : ''}" data-act="min" data-c="${c.id}" data-d="${k}" aria-pressed="${!!L.min}" title="Doing just this counts as playing the card">Minimum: ${esc(c.min)}</button>` : ''}
        ${!played ? `<button type="button" class="sm ghost" data-act="skip" data-c="${c.id}" data-d="${k}" aria-pressed="${!!L.skip}">${L.skip ? 'Un-excuse' : 'Excuse today'}</button>` : ''}
      </div>
      <footer>${weekStrip(c, k)}<span class="rec">${recLine}</span><span class="str">${D.diff(today, c.hist[0].from) >= 7 ? meter(D.strength(c, today)) : '<small>New card</small>'}</span></footer>
    </article>`;
  }

  function lastNight(today) {
    const y = D.addDays(today, -1);
    const cards = D.trainingCards(y).filter(c => c.part === 'evening' && D.isDue(c, y) && !D.isPlayed(c, y));
    if (!cards.length) return '';
    return `<section class="lastnight" aria-label="Last night"><h3>Last night</h3><p class="hint">Your phone was out of the room, so log last night's routine now.</p>${cards.map(c => {
      const L = D.logOf(y, c.id) || { links: {} };
      return `<div class="ln"><b>${esc(c.name)}</b><div class="ln-links">${D.linksAt(c, y, 'training').map(l => `<label class="chip${L.links[l.id] ? ' on' : ''}"><input type="checkbox" data-act="link" data-c="${c.id}" data-l="${l.id}" data-d="${y}"${L.links[l.id] ? ' checked' : ''}><span>${esc(l.name.replace(/^\d+:\d+:\s*/, ''))}</span></label>`).join('')}</div>
        <div class="row"><button type="button" class="sm pri" data-act="all" data-c="${c.id}" data-d="${y}">All done</button>${c.min ? `<button type="button" class="sm" data-act="min" data-c="${c.id}" data-d="${y}">Just the minimum</button>` : ''}<button type="button" class="sm ghost" data-act="skip" data-c="${c.id}" data-d="${y}">Excuse it</button></div></div>`;
    }).join('')}</section>`;
  }

  function workoutBlock(k) {
    const s = D.sessionFor(k), r = D.workoutResult(k), W = D.S.workout, wk = D.workoutWeek(k);
    const opts = W.cycle.map(x => `<option${x === s ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const label = s === 'Rest' ? 'Rest day' : `${s} day`;
    const res = { done: 'Done ✓', rest: 'Rested ✓', skip: 'Skipped' }[r] || '';
    return `<section class="wo${r ? ' logged' : ''}" aria-label="Workout"><div class="wo-h">${idMark('Healthy', 18)}<b>Workout: ${esc(label)}</b>${res ? `<span class="badge">${res}</span>` : ''}<small>${wk} this week</small></div>
      <div class="row">${r ? `<button type="button" class="sm ghost" data-act="wo" data-r="" data-d="${k}">Change</button>` : (s === 'Rest' ? `<button type="button" class="sm pri" data-act="wo" data-r="rest" data-d="${k}">Rested</button>` : `<button type="button" class="sm pri" data-act="wo" data-r="done" data-d="${k}">Done</button><button type="button" class="sm" data-act="wo" data-r="rest" data-d="${k}">Rest day</button>`) + `<button type="button" class="sm ghost" data-act="wo" data-r="skip" data-d="${k}">Skip</button>`}
      ${r ? '' : `<label class="pick">Swap to <select data-act="pick" data-d="${k}" aria-label="Swap today's session">${opts}</select></label>`}</div></section>`;
  }

  function tasksBlock(k, today) {
    const t = D.tasks(k), done = t.filter(x => x.done).length, isToday = k === today;
    const pips = [0, 1, 2].map(i => `<span class="pip${i < done ? ' spent' : ''}${i >= t.length ? ' free' : ''}" aria-hidden="true"></span>`).join('');
    const slots = t.map(x => `<div class="tc${x.done ? ' played' : ''}"><button type="button" class="tcb" data-act="task" data-id="${x.id}" data-d="${k}" aria-pressed="${x.done}"><span class="cost">1</span><span class="tt">${esc(x.text)}</span>${x.step ? `<span class="ts">First step: ${esc(x.step)}</span>` : ''}<span class="tp">${x.done ? 'Played' : 'Tap to play'}</span><span class="stamp" aria-hidden="true">PLAYED</span></button>${x.done ? '' : `<button type="button" class="rm" data-act="rmtask" data-id="${x.id}" data-d="${k}" aria-label="Remove ${esc(x.text)}">×</button>`}</div>`);
    if (t.length < 3) slots.push(`<form class="tc add" data-act="addtask" data-d="${k}"><label class="sr" for="nt-${k}">New task</label><input id="nt-${k}" name="t" placeholder="Add a task" maxlength="80" autocomplete="off" enterkeyhint="done"><details class="stepd"><summary>+ first step</summary><input name="s" placeholder="First tiny step" maxlength="80" autocomplete="off" aria-label="First tiny step"></details><button type="submit" class="sm">Add</button></form>`);
    const later = isToday ? D.later(k) : [];
    const laterHTML = later.length ? `<details class="later"${t.length < 3 ? '' : ''}><summary>Later (${later.length})</summary><div class="chips">${later.slice(0, 12).map(x => `<span class="lchip"><button type="button" class="chip" data-act="take" data-from="${x.d}" data-id="${x.id}"${t.length >= 3 ? ' disabled' : ''}>↩ ${esc(x.text)}</button><button type="button" class="x" data-act="drop" data-from="${x.d}" data-id="${x.id}" aria-label="Drop ${esc(x.text)}">×</button></span>`).join('')}</div></details>` : '';
    return `<section class="tasks" aria-label="Tasks"><div class="energy"><span class="elabel">Energy</span>${pips}<span class="ecount">${3 - done} left</span></div>
      <div class="hand">${slots.join('')}</div>${laterHTML}
      ${t.length >= 3 && isToday ? `<form class="park" data-act="park"><input name="t" placeholder="Out of energy. Park another task in Later" maxlength="80" aria-label="Park a task for later"><button type="submit" class="sm ghost">Park</button></form>` : ''}</section>`;
  }

  function handHTML(view) {
    const today = D.today(), k = view, S = D.S;
    const order = c => { const h = D.logicalHour(); return c.part === 'morning' ? (h < 15 ? 0 : 2) : c.part === 'evening' ? (h < 15 ? 2 : 0) : 1; };
    const cards = D.S.cards.filter(c => D.cardState(c, k) === 'training').sort((a, b) => order(a) - order(b));
    const back = D.diff(today, k);
    const notice = D.notice ? `<p class="banner">${esc(D.notice)}</p>` : '';
    const onboard = !S.settings.onboarded && k === today ? `<section class="onboard"><b>Two quick setup steps</b><ol><li>Set trash pickup days and one recycling date in <a href="#settings">Settings</a>.</li><li>Look over your starting cards in <a href="#habits">Habits</a>. Edit, shelve or keep them.</li></ol><button type="button" class="sm" data-act="onboarded">Got it</button></section>` : '';
    const chores = D.choresDue(k).map(c => `<label class="chore${D.choreDoneOn(c.id, k) ? ' on' : ''}"><input type="checkbox" data-act="chore" data-id="${c.id}" data-d="${k}"${D.choreDoneOn(c.id, k) ? ' checked' : ''}><span>${esc(c.name)}${c.eve ? ' <small>tonight</small>' : ''}${c.late ? ` <small>from ${esc(c.late)}</small>` : ''}</span></label>`).join('');
    const fire = k === today && D.fireDue(k) ? '<a class="firelink" href="#campfire">🔥 Campfire this week: 10 minutes to review ›</a>' : '';
    return `${notice}
      <div class="dayswitch" role="group" aria-label="Day"><button type="button" class="nav" data-act="day" data-to="-1"${back >= 3 ? ' disabled' : ''} aria-label="Previous day">‹</button><b>${esc(niceDay(k, today))}</b><span>${esc(longDay(k))}</span><button type="button" class="nav" data-act="day" data-to="1"${back <= 0 ? ' disabled' : ''} aria-label="Next day">›</button></div>
      ${onboard}${k === today && D.logicalHour() < 13 ? lastNight(today) : ''}
      ${tasksBlock(k, today)}
      <div class="habits">${cards.map(c => habitCard(c, k, today)).join('') || '<p class="hint">No habit cards in training. Draft one from the draw pile.</p>'}</div>
      ${workoutBlock(k)}
      ${chores ? `<div class="chores"><span class="elabel">Due</span>${chores}</div>` : ''}${fire}`;
  }

  function mountHand(el) {
    let view = D.today(), wantFocus = false, lastPlayed = new Set(), drew = false;
    const playedSet = () => { const s = new Set(); for (const c of D.S.cards) if (D.isPlayed(c, view)) s.add(c.id); D.tasks(view).forEach(t => t.done && s.add(t.id)); return s; };
    function draw() {
      if (view > D.today()) view = D.today();
      el.dataset.today = D.today();
      const before = lastPlayed;
      el.innerHTML = handHTML(view);
      lastPlayed = playedSet();
      if (drew) for (const id of lastPlayed) if (!before.has(id)) {
        const btn = el.querySelector(`.tc [data-id="${id}"]`);
        const n = el.querySelector(`[data-card="${id}"]`) || (btn && btn.closest('.tc'));
        if (n) stampIn(n);
      }
      drew = true;
      if (wantFocus) { const i = el.querySelector('.tc.add input[name=t]') || el.querySelector('.park input'); if (i) i.focus(); wantFocus = false; }
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
      const a = b.dataset.act, d = b.dataset.d || view;
      if (a === 'day') { view = D.addDays(view, +b.dataset.to); return draw(); }
      if (a === 'task') act(D.toggleTask(b.dataset.id, d), true);
      if (a === 'rmtask') act(D.removeTask(b.dataset.id, d));
      if (a === 'all') act(D.playAll(b.dataset.c, d), true);
      if (a === 'min') act(D.toggleMin(b.dataset.c, d), true);
      if (a === 'skip') act(D.toggleSkip(b.dataset.c, d));
      if (a === 'wo') act(D.logWorkout(b.dataset.r, d), true);
      if (a === 'take') act(D.takeLater(b.dataset.from, b.dataset.id, view));
      if (a === 'drop') act(D.dropLater(b.dataset.from, b.dataset.id));
      if (a === 'onboarded') act(D.setSettings({ onboarded: true }), true);
    });
    el.addEventListener('change', e => {
      const i = e.target, a = i.dataset && i.dataset.act; if (!a) return;
      if (a === 'link') act(D.toggleLink(i.dataset.c, i.dataset.l, i.checked, i.dataset.d), true);
      if (a === 'chore') act(D.toggleChore(i.dataset.id, i.dataset.d), true);
      if (a === 'pick') act(D.pickSession(i.value, i.dataset.d), true);
    });
    el.addEventListener('submit', e => {
      e.preventDefault(); const f = e.target;
      if (f.dataset.act === 'addtask') { wantFocus = true; const r = act(D.addTask(f.t.value, f.s ? f.s.value : '', f.dataset.d), true); if (!r.ok) wantFocus = false; }
      if (f.dataset.act === 'park') { if (f.t.value.trim()) { wantFocus = true; act(D.parkTask(f.t.value)); } }
    });
    D.onChange(draw);
    window.addEventListener('storage', e => { if (e.key === D.KEY) D.reloadFromStorage(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (el.dataset.today !== D.today()) view = D.today(); draw(); } });
    setInterval(() => { if (el.dataset.today !== D.today()) { view = D.today(); draw(); } }, 60000);
    draw();
    return { draw, setView(k) { view = k; draw(); } };
  }

  window.DeckUI = { ID, idMark, emblem, toast, act, celebrate, stampIn, mountHand, habitCard, weekStrip, meter, longDay };
})();
