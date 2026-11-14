// Run: node --test tests/
const test = require('node:test'), assert = require('node:assert/strict');
const { createDeck } = require('../deck-core.js');

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
}
function make(dateStr = '2026-11-16T12:00', store = memStore()) {
  let t = new Date(dateStr);
  const D = createDeck({ storage: store, now: () => new Date(t) });
  D.load();
  D.at = s => { t = new Date(s); };
  return { D, store };
}
const day = (D, s) => { D.at(s + 'T12:00'); return D.today(); };

test('day rollover: 00:30 still counts as the previous day', () => {
  const { D } = make('2026-11-15T00:30');
  assert.equal(D.today(), '2026-11-14');
  D.at('2026-11-15T04:30'); assert.equal(D.today(), '2026-11-15');
});

test('fresh deck has two cards in training and workout separate', () => {
  const { D } = make();
  assert.deepEqual(D.trainingCards().map(c => c.id), ['evening', 'morning']);
  assert.ok(!D.card('morning').links.some(l => l.id === 'workout'));
  assert.equal(D.sessionFor(D.today()), 'Deadlift');
});

test('history is not rewritten when links are added or drafted', () => {
  const { D } = make('2026-11-16T12:00');
  for (const d of ['2026-11-16', '2026-11-17']) { day(D, d); D.playAll('evening', d); D.playAll('morning', d); }
  day(D, '2026-11-18');
  assert.equal(D.record(D.card('evening')).played, 2);
  D.draft('meditate');
  D.addLink('evening', 'Floss', 'Healthy');
  assert.equal(D.record(D.card('morning')).played, 2);
  assert.equal(D.record(D.card('evening')).played, 2);
  assert.equal(D.record(D.card('evening')).missRun, 0);
  assert.ok(!D.isPlayed(D.card('evening'), D.today()), 'today needs the new link too');
});

test('minimum counts as played; excused day and pause are not due', () => {
  const { D } = make('2026-11-16T12:00');
  const c = D.card('evening');
  D.toggleMin('evening'); assert.ok(D.isPlayed(c, '2026-11-16'));
  day(D, '2026-11-17'); D.toggleSkip('evening');
  day(D, '2026-11-18'); assert.equal(D.record(c).missRun, 0);
  D.addPause('2026-11-18', '2026-11-20');
  day(D, '2026-11-21'); assert.equal(D.record(c).missRun, 0);
  day(D, '2026-11-23'); assert.equal(D.record(c).missRun, 2, 'Nov 21 and 22 missed');
});

test('per-week habit never nags on off days', () => {
  const { D } = make('2026-11-16T12:00');
  D.draft('sysdesign');
  const c = D.trainingCards().find(x => x.name.startsWith('System design'));
  D.playAll(c.id);
  day(D, '2026-11-18'); D.playAll(c.id);
  day(D, '2026-11-19');
  const r = D.record(c);
  assert.equal(r.type, 'perWeek'); assert.ok(r.week.done); assert.equal(r.missRun, 0);
});

test('strength rises with plays and one miss barely dents it', () => {
  const { D } = make('2026-11-16T12:00');
  for (let i = 0; i < 20; i++) { day(D, D.addDays('2026-11-16', i)); D.playAll('morning'); }
  day(D, '2026-12-06'); const s1 = D.strength(D.card('morning'), '2026-12-05');
  day(D, '2026-12-07'); const s2 = D.strength(D.card('morning'));
  assert.ok(s1 > 0.6, 's1=' + s1); assert.ok(s1 - s2 < 0.06, 'one miss dent ' + (s1 - s2));
});

test('workout rotation is derived from the log: done/rest advance, skip does not', () => {
  const { D } = make('2026-11-16T12:00');
  D.logWorkout('done'); day(D, '2026-11-17'); assert.equal(D.sessionFor(D.today()), 'Push');
  D.logWorkout('skip'); day(D, '2026-11-18'); assert.equal(D.sessionFor(D.today()), 'Push');
  D.pickSession('Squat'); D.logWorkout('done'); day(D, '2026-11-19'); assert.equal(D.sessionFor(D.today()), 'Pull');
});

test('graduation: candidate after 28 days, two 6+ campfires and strength; SRBAI decides', () => {
  const { D } = make('2026-11-16T12:00');
  for (let i = 0; i < 35; i++) { day(D, D.addDays('2026-11-16', i)); D.playAll('morning'); D.playAll('evening'); }
  day(D, '2026-12-14'); D.submitFire({ ratings: { wake: 6 } });
  day(D, '2026-12-20'); D.submitFire({ ratings: { wake: 7 } });
  const cand = D.candidates();
  assert.ok(cand.some(x => x.lid === 'wake'), JSON.stringify(cand));
  let r = D.graduationCheck('morning', 'wake', [5, 5, 5, 5]); assert.equal(r.data.graduated, false);
  r = D.graduationCheck('morning', 'wake', [6, 7, 6, 7]); assert.equal(r.data.graduated, true);
  assert.equal(D.cardState(D.card('morning'), D.today()), 'relic');
  assert.ok(D.S.relics.some(x => x.combo && x.card === 'morning'));
  assert.equal(D.record(D.card('morning'), '2026-12-10').played > 0, true, 'history before graduation still intact');
  assert.equal(D.sessionFor(D.today()) !== undefined, true);
});

test('cracking a combo relic puts its links back in training and it can be played', () => {
  const { D } = make('2026-11-16T12:00');
  D.graduate('morning', 'wake');
  const combo = D.S.relics.find(x => x.combo && x.card === 'morning');
  day(D, '2026-11-20'); D.crack(combo.id);
  const c = D.card('morning');
  assert.equal(D.cardState(c, D.today()), 'training');
  D.playAll('morning'); assert.ok(D.isPlayed(c, D.today()));
});

test('campfire: one per week (Sunday and Monday are the same campfire)', () => {
  const { D } = make('2026-11-22T20:00');
  assert.ok(D.fireDue());
  D.submitFire({ ratings: { wake: 3 }, note: 'a' });
  day(D, '2026-11-23'); assert.ok(!D.fireDue());
  D.submitFire({ ratings: { wake: 4 }, note: 'b' });
  assert.equal(D.S.fires.length, 1); assert.equal(D.S.fires[0].note, 'b');
});

test('chores: weekly carries over until done; eve-before and biweekly', () => {
  const { D } = make('2026-11-21T12:00'); // Saturday
  assert.ok(D.choresDue().some(c => c.id === 'mow'));
  day(D, '2026-11-22'); const m = D.choresDue().find(c => c.id === 'mow'); assert.ok(m && m.late === 'Sat');
  D.toggleChore('mow'); day(D, '2026-11-23'); assert.ok(!D.choresDue().some(c => c.id === 'mow'));
  D.setChore('trash', { days: [2] }); assert.ok(D.choresDue().some(c => c.id === 'trash')); // Mon eve before Tue pickup
  D.setChore('recycle', { anchor: '2026-11-10' }); assert.ok(D.choresDue().some(c => c.id === 'recycle'));
  day(D, '2026-12-23'); assert.ok(!D.choresDue().some(c => c.name === 'Mow the lawn'), 'out of season');
});

test('tasks: 3 energy, played tasks stay, later pile', () => {
  const { D } = make('2026-11-16T12:00');
  for (const t of ['a', 'b', 'c']) assert.ok(D.addTask(t).ok);
  assert.equal(D.addTask('d').ok, false);
  const [a] = D.tasks(D.today()); D.toggleTask(a.id); assert.equal(D.removeTask(a.id).ok, false);
  day(D, '2026-11-17'); assert.equal(D.later().length, 2);
  const L = D.later()[0]; D.takeLater(L.d, L.id); assert.equal(D.tasks(D.today()).length, 1); assert.equal(D.later().length, 1);
});

test('undo restores the previous state', () => {
  const { D } = make();
  D.addTask('x'); assert.equal(D.tasks(D.today()).length, 1);
  D.undo(); assert.equal(D.tasks(D.today()).length, 0);
});

test('migration from v1 keeps logs, converts workout, keeps a backup', () => {
  const v1 = { v: 1, created: '2026-11-14',
    cards: [{ id: 'evening', name: 'Evening Shutdown', part: 'evening', state: 'training', started: '2026-11-14', min: 'x', links: [{ id: 'phone', name: 'p', idn: 'Relaxed', state: 'training', since: '2026-11-14' }] },
      { id: 'morning', name: 'Morning Engine', part: 'morning', state: 'training', started: '2026-11-14', min: 'y', links: [{ id: 'wake', name: 'w', idn: 'Healthy', state: 'training' }, { id: 'workout', name: 'Workout', idn: 'Healthy', state: 'auto', workout: true }] }],
    relics: [{ id: 'r1', card: 'morning', link: 'workout', name: 'Training rotation', idn: 'Healthy', on: 'before the deck', miss: 0 }],
    bench: [{ id: 'sysdesign', name: 'System design session', idn: 'Confident' }], chores: [{ id: 'trash', name: 'Trash out', kind: 'eve-before', days: [] }],
    workout: { cycle: ['Deadlift', 'Push', 'Squat', 'Pull', 'Rest'], next: 1, log: { '2026-11-14': 'Deadlift' } },
    tasks: { '2026-11-14': [{ id: 't', text: 'Call', step: '', done: true }] },
    log: { '2026-11-14': { evening: { links: { phone: true } }, morning: { links: { wake: true, workout: true } } } }, chorelog: {}, curses: [], fires: [{ date: '2026-11-14', ratings: { wake: 6 } }] };
  const store = memStore({ 'deck.v1': JSON.stringify(v1) });
  const { D } = make('2026-11-15T12:00', store);
  assert.equal(D.S.v, 2);
  assert.ok(store.getItem('deck.v1.bak.v1'));
  assert.ok(D.isPlayed(D.card('evening'), '2026-11-14'));
  assert.ok(D.isPlayed(D.card('morning'), '2026-11-14'));
  assert.equal(D.sessionFor('2026-11-15'), 'Push');
  assert.ok(!D.card('morning').links.some(l => l.id === 'workout'));
  assert.deepEqual(D.S.bench[0].sched, { type: 'perWeek', n: 2 });
});

test('a newer saved version is never overwritten; corrupt data is kept', () => {
  const store = memStore({ 'deck.v1': JSON.stringify({ v: 9, precious: true }) });
  const { D } = make('2026-11-16T12:00', store);
  assert.ok(D.readOnly); D.addTask('x');
  assert.equal(JSON.parse(store.getItem('deck.v1')).precious, true);
  const s2 = memStore({ 'deck.v1': '{oops' }); const { D: D2 } = make('2026-11-16T12:00', s2);
  assert.ok(D2.notice); assert.ok([...s2._m.keys()].some(k => k.startsWith('deck.v1.corrupt.')));
});

test('two tabs: an action picks up the other tab’s write first', () => {
  const store = memStore();
  const { D: A } = make('2026-11-16T12:00', store);
  const { D: B } = make('2026-11-16T12:00', store);
  A.addTask('from A'); B.addTask('from B');
  assert.deepEqual(B.tasks(B.today()).map(t => t.text), ['from A', 'from B']);
});

test('merge between devices unions logs and respects removals', () => {
  const s1 = memStore(), { D: P } = make('2026-11-16T12:00', s1);
  const s2 = memStore({ 'deck.v1': s1.getItem('deck.v1') }), { D: W } = make('2026-11-16T12:00', s2);
  P.toggleLink('evening', 'phone', true); P.removeBench('reachout');
  W.toggleLink('evening', 'skin', true); W.addTask('pc task');
  const r = P.importData(W.exportCode(), 'merge'); assert.ok(r.ok, r.msg);
  const L = P.logOf(P.today(), 'evening');
  assert.ok(L.links.phone && L.links.skin);
  assert.equal(P.tasks(P.today()).length, 1);
  assert.ok(!P.S.bench.some(b => b.id === 'reachout'), 'removed bench card not resurrected');
});

test('shelve and re-draft keeps the card history', () => {
  const { D } = make('2026-11-16T12:00');
  D.playAll('evening'); day(D, '2026-11-17'); D.shelve('evening');
  assert.equal(D.trainingCards().length, 1);
  const b = D.S.bench.find(x => x.cardRef === 'evening'); day(D, '2026-11-20'); D.draft(b.id);
  assert.equal(D.cardState(D.card('evening'), D.today()), 'training');
  assert.ok(D.isPlayed(D.card('evening'), '2026-11-16'));
  assert.equal(D.heat(D.card('evening')).find(x => x.d === '2026-11-18').st, 'none');
});

test('a failed graduation check waits for the next campfire', () => {
  const { D } = make('2026-11-16T12:00');
  for (let i = 0; i < 42; i++) { day(D, D.addDays('2026-11-16', i)); D.playAll('morning'); }
  day(D, '2026-12-14'); D.submitFire({ ratings: { wake: 6 } });
  day(D, '2026-12-20'); D.submitFire({ ratings: { wake: 6 } });
  D.graduationCheck('morning', 'wake', [4, 4, 4, 4]);
  assert.ok(!D.candidates().some(x => x.lid === 'wake'));
  day(D, '2026-12-27'); D.submitFire({ ratings: { wake: 7 } });
  assert.ok(D.candidates().some(x => x.lid === 'wake'));
});

test('workout can be logged as the session the calendar says, and the rotation follows it', () => {
  const { D } = make('2026-11-16T12:00');
  assert.equal(D.sessionFor(D.today()), 'Deadlift');
  D.logWorkout('done', D.today(), 'Squat');
  assert.equal(D.S.workout.log[D.today()].s, 'Squat');
  day(D, '2026-11-17'); assert.equal(D.sessionFor(D.today()), 'Pull');
  D.logWorkout('done', D.today(), 'NotASession'); assert.equal(D.S.workout.log[D.today()].s, 'Pull');
});

test('Teaneck Zone 6 recycling dates: evening before each pickup, holiday shifts respected', () => {
  const { D } = make('2026-11-23T12:00');
  assert.equal(D.S.chores.find(c => c.id === 'recycle').kind, 'dates-eve');
  assert.ok(D.choresDue().some(c => c.id === 'recycle'), 'Mon Nov 23: out tonight for Tue Nov 24');
  day(D, '2026-11-24'); assert.ok(!D.choresDue().some(c => c.id === 'recycle'));
  day(D, '2027-01-19'); assert.ok(D.choresDue().some(c => c.id === 'recycle'), 'Tue Jan 19: out for Wed Jan 20 (MLK shift)');
  day(D, '2027-01-05'); assert.ok(D.choresDue().some(c => c.id === 'xmastree'));
  D.setChore('recycle', { dates: [] }); D.load(); assert.deepEqual(D.S.chores.find(c => c.id === 'recycle').dates, [], 'patch applies once; edits stick');
});
