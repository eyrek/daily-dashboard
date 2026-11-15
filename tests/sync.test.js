/* Two simulated devices syncing through a fake Supabase (same REST shapes deck-sync.js uses). */
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), vm = require('vm'), path = require('path');
const { createDeck } = require('../deck-core.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'deck-sync.js'), 'utf8');

function memStore() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }

function fakeServer() {
  const S = { row: null, history: [], calls: 0 };
  S.fetch = async (url, opt = {}) => {
    S.calls++;
    const u = new URL(url), method = opt.method || 'GET', body = opt.body ? JSON.parse(opt.body) : null;
    const res = (status, data) => ({ ok: status < 300, status, text: async () => (data == null ? '' : JSON.stringify(data)) });
    if (u.pathname === '/auth/v1/token') return res(200, { access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: 'me@example.com' } });
    if (u.pathname === '/rest/v1/decks') {
      if (method === 'GET') return res(200, S.row ? [JSON.parse(JSON.stringify(S.row))] : []);
      if (method === 'POST') { if (S.row) return res(409, { message: 'duplicate' }); S.row = body; S.history.push(body); return res(201, null); }
      if (method === 'PATCH') {
        const want = Number(u.searchParams.get('version').replace('eq.', ''));
        if (!S.row || S.row.version !== want) return res(200, []);
        S.row = Object.assign({}, S.row, body); S.history.push(S.row); return res(200, [S.row]);
      }
    }
    return res(404, { message: 'nope ' + u.pathname });
  };
  return S;
}

function device(server, name, now) {
  const storage = memStore();
  const Deck = createDeck({ storage, now }); Deck.load();
  const win = { Deck, localStorage: storage, navigator: { userAgent: name, onLine: true }, fetch: server.fetch, addEventListener() {}, setInterval() {}, setTimeout, clearTimeout, crypto: globalThis.crypto, TextEncoder, document: { visibilityState: 'visible' }, URL };
  win.window = win; win.globalThis = win;
  vm.runInNewContext(SRC, win);
  // pretend we're signed in (the Google step is UI); the token endpoint above hands out sessions
  storage.setItem('deck.sync.session', JSON.stringify({ access: 'tok', refresh: 'r', exp: Date.now() + 3.6e6, email: 'me@example.com', uid: 'u1' }));
  return { Deck, Sync: win.DeckSync, storage };
}
const at = s => () => new Date(s);

test('first device uploads, second device merges its own ticks in, then edits flow both ways', async () => {
  const srv = fakeServer(), now = at('2026-11-14T10:00:00');
  const A = device(srv, 'Windows', now), B = device(srv, 'Android', now);
  const k = A.Deck.today(), task = A.Deck.addTask('Call mom', '', k);
  assert.ok(task.ok);
  await A.Sync.sync('t'); assert.equal(srv.row.version, 1); assert.equal(A.Sync.state.status, 'ok');

  B.Deck.addTask('Buy milk', '', k);
  await B.Sync.sync('t');
  assert.equal(srv.row.version, 2, 'B merged and pushed');
  const names = d => d.Deck.tasks(k).map(t => t.text).sort();
  assert.deepEqual(names(B), ['Buy milk', 'Call mom']);

  await A.Sync.sync('t');
  assert.deepEqual(names(A), ['Buy milk', 'Call mom'], 'A picked up the merge');
  assert.equal(srv.row.version, 2, 'pulling does not push');

  // an un-tick on one device must reach the other (plain pull, no merge resurrecting it)
  const id = A.Deck.tasks(k)[0].id;
  A.Deck.toggleTask(id, k); await A.Sync.sync('t'); await B.Sync.sync('t');
  assert.equal(B.Deck.tasks(k).find(t => t.id === id).done, true);
  B.Deck.toggleTask(id, k); await B.Sync.sync('t'); await A.Sync.sync('t');
  assert.equal(!!A.Deck.tasks(k).find(t => t.id === id).done, false, 'un-tick synced');

  // nothing changed: no writes
  const v = srv.row.version; await A.Sync.sync('t'); await B.Sync.sync('t'); assert.equal(srv.row.version, v);
});

test('a reinstall (empty device) gets the saved deck back', async () => {
  const srv = fakeServer(), now = at('2026-11-14T10:00:00');
  const A = device(srv, 'Android', now); const k = A.Deck.today();
  A.Deck.addTask('Mow lawn', '', k); await A.Sync.sync('t');
  const fresh = device(srv, 'Android', now); // fresh install: seed deck, signed in
  await fresh.Sync.sync('t');
  assert.deepEqual(fresh.Deck.tasks(k).map(t => t.text), ['Mow lawn']);
});

test('both devices edit offline, then both sync: nothing is lost', async () => {
  const srv = fakeServer(), now = at('2026-11-14T10:00:00');
  const A = device(srv, 'Windows', now), B = device(srv, 'Android', now); const k = A.Deck.today();
  await A.Sync.sync('t'); await B.Sync.sync('t');
  A.Deck.addTask('From PC', '', k); B.Deck.addTask('From phone', '', k);
  await A.Sync.sync('t'); await B.Sync.sync('t'); await A.Sync.sync('t');
  const names = d => d.Deck.tasks(k).map(t => t.text).sort();
  assert.deepEqual(names(A), ['From PC', 'From phone']); assert.deepEqual(names(B), names(A));
});

test('a stale write is refused and retried as a merge', async () => {
  const srv = fakeServer(), now = at('2026-11-14T10:00:00');
  const A = device(srv, 'Windows', now); const k = A.Deck.today();
  await A.Sync.sync('t');
  srv.row = Object.assign({}, srv.row, { version: srv.row.version + 5 }); // someone else saved meanwhile
  A.Deck.addTask('Still here', '', k); await A.Sync.sync('t');
  assert.equal(A.Sync.state.status, 'ok');
  assert.ok(srv.row.data.tasks[k].some(t => t.text === 'Still here'));
});
