// Run: NODE_PATH=/tmp/wp/node_modules node --test tests/push.test.mjs   (web-push only needed for the last test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dueFor, cronFor, localParts } from '../scripts/schedule.mjs';
import { parseConfig } from '../scripts/send-reminders.mjs';
const cfg = JSON.parse(fs.readFileSync(new URL('../reminders.json', import.meta.url)));

test('8:25pm shutdown fires once in winter (EST) and once in summer (EDT)', () => {
  // Nov 16 2026 20:25 EST = Nov 17 01:25 UTC
  assert.deepEqual(dueFor(cfg, cronFor('20:25', -5), new Date('2026-11-17T01:31:00Z')).map(r => r.id), ['shutdown']);
  assert.deepEqual(dueFor(cfg, cronFor('20:25', -4), new Date('2026-11-17T00:26:00Z')).map(r => r.id), [], 'EDT line silent in winter');
  // Jul 1 2026 20:25 EDT = Jul 2 00:25 UTC
  assert.deepEqual(dueFor(cfg, cronFor('20:25', -4), new Date('2026-07-02T00:40:00Z')).map(r => r.id), ['shutdown']);
  assert.deepEqual(dueFor(cfg, cronFor('20:25', -5), new Date('2026-07-02T01:26:00Z')).map(r => r.id), []);
});

test('campfire only on Sunday evenings, even though UTC is already Monday', () => {
  // Sun Nov 22 2026 18:57 EST = 23:57 UTC Sunday
  assert.deepEqual(dueFor(cfg, cronFor('18:57', -5), new Date('2026-11-22T23:59:00Z')).map(r => r.id), ['campfire']);
  assert.deepEqual(dueFor(cfg, cronFor('18:57', -5), new Date('2026-11-23T23:59:00Z')).map(r => r.id), []);
});

test('late runs still count, very late runs are dropped', () => {
  assert.equal(dueFor(cfg, cronFor('20:25', -5), new Date('2026-11-17T02:10:00Z')).length, 1);
  assert.equal(dueFor(cfg, cronFor('20:25', -5), new Date('2026-11-17T05:00:00Z')).length, 0);
});

test('trash: evening before pickup; recycling every other week', () => {
  const c = structuredClone(cfg);
  c.reminders.find(r => r.id === 'trash').on = true; c.reminders.find(r => r.id === 'trash').pickupDays = [2, 5];
  const rc = c.reminders.find(r => r.id === 'recycle'); rc.on = true; rc.pickupAnchor = '2026-11-19';
  // Mon Nov 16 19:30 EST -> pickup Tue
  assert.ok(dueFor(c, cronFor('19:30', -5), new Date('2026-11-17T00:31:00Z')).some(r => r.id === 'trash'));
  assert.ok(!dueFor(c, cronFor('19:30', -5), new Date('2026-11-18T00:31:00Z')).some(r => r.id === 'trash'), 'Tue evening: no pickup Wed');
  // Wed Nov 18 19:35 -> recycling Thu Nov 19 (anchor); Wed Nov 25 no; Wed Dec 2 yes
  assert.ok(dueFor(c, cronFor('19:35', -5), new Date('2026-11-19T00:36:00Z')).some(r => r.id === 'recycle'));
  assert.ok(!dueFor(c, cronFor('19:35', -5), new Date('2026-11-26T00:36:00Z')).some(r => r.id === 'recycle'));
  assert.ok(dueFor(c, cronFor('19:35', -5), new Date('2026-12-03T00:36:00Z')).some(r => r.id === 'recycle'));
});

test('localParts handles the DST switch', () => {
  assert.equal(localParts(new Date('2026-03-09T00:30:00Z'), 'America/New_York').offset, -4);
  assert.equal(localParts(new Date('2026-11-02T01:30:00Z'), 'America/New_York').offset, -5);
});

test('keys made with WebCrypto (as the phone does) work with web-push', async () => {
  let webpush; try { webpush = (await import('web-push')).default; } catch (e) { if (process.env.REQUIRE_WEBPUSH) throw e; return; }
  const { subtle } = globalThis.crypto;
  const b64u = buf => Buffer.from(buf).toString('base64url');
  const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const vapid = { publicKey: b64u(await subtle.exportKey('raw', vk.publicKey)), privateKey: (await subtle.exportKey('jwk', vk.privateKey)).d };
  const ck = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc:123', keys: { p256dh: b64u(await subtle.exportKey('raw', ck.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
  const code = Buffer.from(JSON.stringify({ v: 1, device: 'phone', vapid, sub })).toString('base64');
  const [d] = parseConfig(code);
  const req = webpush.generateRequestDetails(d.sub, '{"title":"t"}', { vapidDetails: { subject: 'https://eyrek.github.io/daily-dashboard/', publicKey: d.vapid.publicKey, privateKey: d.vapid.privateKey } });
  assert.match(req.headers.Authorization, /^vapid t=.+, k=/);
  assert.ok(req.body.length > 0);
});
