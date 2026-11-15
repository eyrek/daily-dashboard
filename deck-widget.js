/* Home-screen widget bridge (Android app only).
   - Publishes "today's hand" (tasks, routine steps still in training, chores, the workout) to the widget.
   - Applies ticks made on the widget when the app is next open (or right away if it's running). */
(function (root) {
  'use strict';
  const Cap = root.Capacitor;
  const W = Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.Plugins ? Cap.Plugins.DeckWidget : null;

  /* pure: build the widget snapshot from a deck API (testable in node) */
  function snapshot(D, k = D.today()) {
    const S = D.S, items = [];
    const head = text => items.push({ k: 'h', id: 'h:' + text, text });
    const row = (id, text, sub, done) => items.push({ k: 'i', id, text, sub: sub || '', done: !!done });

    const ts = D.tasks(k);
    if (ts.length) { head('Tasks'); ts.forEach(t => row('task:' + t.id, t.text, t.step ? 'First step: ' + t.step : '', t.done)); }

    for (const c of D.trainingCards(k)) {
      if (!D.isDue(c, k)) continue;
      const L = D.logOf(k, c.id) || {}, links = D.linksAt(c, k, 'training');
      if (!links.length) continue;
      head(c.name + (L.min ? ' · minimum done' : ''));
      links.forEach(l => row('link:' + c.id + ':' + l.id, l.name, l.idn || '', L.min || (L.links && L.links[l.id])));
    }

    const ses = D.sessionFor(k), r = D.workoutResult(k);
    const chores = D.choresDue(k);
    if (ses || chores.length) head('Also today');
    if (ses) row('workout', ses === 'Rest' ? 'Rest day' : 'Workout: ' + ses, ses === 'Rest' ? 'Tap when you’ve taken it easy' : '', r === 'done' || r === 'rest');
    chores.forEach(ch => row('chore:' + ch.id, ch.name, ch.eve ? 'Tonight, for tomorrow’s pickup' : ch.late ? 'From ' + ch.late : '', D.choreDoneOn(ch.id, k)));

    const rows = items.filter(x => x.k === 'i');
    const date = D.parse(k).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    return { v: 1, day: k, dayStart: (S.settings && S.settings.dayStart) != null ? S.settings.dayStart : 4, title: date, total: rows.length, doneCount: rows.filter(x => x.done).length, items };
  }

  /* pure: apply one widget tick ({id, day, done}) as "make it this state" so replays are harmless */
  function apply(D, a) {
    const d = a.day, want = !!a.done, p = String(a.id || '').split(':');
    if (!d || !p[0]) return false;
    if (p[0] === 'task') { const t = D.tasks(d).find(x => x.id === p[1]); if (t && !!t.done !== want) D.toggleTask(t.id, d); return !!t; }
    if (p[0] === 'link') { const L = D.logOf(d, p[1]) || {}; if (!!(L.links && L.links[p[2]]) !== want) D.toggleLink(p[1], p[2], want, d); return true; }
    if (p[0] === 'chore') { if (D.choreDoneOn(p[1], d) !== want) D.toggleChore(p[1], d); return true; }
    if (p[0] === 'workout') {
      const r = D.workoutResult(d), on = r === 'done' || r === 'rest';
      if (on !== want) D.logWorkout(want ? (D.sessionFor(d) === 'Rest' ? 'rest' : 'done') : '', d);
      return true;
    }
    return false;
  }

  let timer = 0, draining = false;
  async function publish() {
    if (!W || !root.Deck) return;
    try { await W.update({ json: JSON.stringify(snapshot(root.Deck)) }); } catch (e) { console.warn('widget update', e); }
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(publish, 400); };
  async function drain() {
    if (!W || !root.Deck || draining) return;
    draining = true;
    try {
      const r = await W.drain(); const acts = (r && r.actions) || [];
      acts.sort((a, b) => (a.at || 0) - (b.at || 0)).forEach(a => { try { apply(root.Deck, a); } catch (e) {} });
      if (acts.length && root.DeckUI && root.DeckUI.toast) root.DeckUI.toast(acts.length === 1 ? 'Ticked from the widget.' : acts.length + ' ticks from the widget.');
    } catch (e) { console.warn('widget drain', e); }
    finally { draining = false; publish(); }
  }
  function start() {
    if (!W || !root.Deck) return;
    root.Deck.onChange(soon);
    W.addListener('ticked', () => drain());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') drain(); });
    drain();
  }

  root.DeckWidget = { snapshot, apply, start, publish, drain, get available() { return !!W; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = { snapshot, apply };
})(typeof window !== 'undefined' ? window : globalThis);
