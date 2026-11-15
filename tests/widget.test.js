const test = require('node:test'), assert = require('node:assert');
const { createDeck } = require('../deck-core.js');
const { snapshot, apply } = require('../deck-widget.js');
function memStore() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }

test('snapshot lists tasks, routine steps, workout and chores; widget ticks apply idempotently', () => {
  const D = createDeck({ storage: memStore(), now: () => new Date('2026-11-15T19:00:00') }); D.load(); // Sunday evening
  const k = D.today();
  D.addTask('Call mom', 'Open contacts', k);
  const s = snapshot(D);
  assert.equal(s.day, k);
  const ids = s.items.filter(x => x.k === 'i').map(x => x.id);
  assert.ok(ids.some(i => i.startsWith('task:')), 'task row');
  assert.ok(ids.some(i => i.startsWith('link:evening:')), 'evening routine steps');
  assert.ok(ids.includes('workout'), 'workout row');
  assert.ok(ids.includes('chore:trash'), 'trash goes out Sunday night');
  assert.equal(s.doneCount, 0); assert.equal(s.total, ids.length);

  const t = s.items.find(x => x.id.startsWith('task:')), l = s.items.find(x => x.id.startsWith('link:'));
  for (const id of [t.id, l.id, 'workout', 'chore:trash']) { apply(D, { id, day: k, done: true }); apply(D, { id, day: k, done: true }); }
  const s2 = snapshot(D);
  for (const id of [t.id, l.id, 'workout', 'chore:trash']) assert.equal(s2.items.find(x => x.id === id).done, true, id);
  apply(D, { id: 'workout', day: k, done: false });
  assert.equal(snapshot(D).items.find(x => x.id === 'workout').done, false);
  assert.equal(apply(D, { id: 'task:nope', day: k, done: true }), false);
});
