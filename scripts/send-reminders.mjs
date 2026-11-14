// Sends due reminders as Web Push notifications to the device(s) in the PUSH_CONFIG secret.
// PUSH_CONFIG is the setup code from the app (Deck → Settings → Notifications): base64 JSON
// { v:1, device, subject, vapid:{publicKey, privateKey}, sub:{endpoint, keys:{p256dh, auth}} }, or an array of them.
import fs from 'node:fs';
import { dueFor } from './schedule.mjs';

export function parseConfig(raw) {
  if (!raw || !raw.trim()) return [];
  const text = raw.trim().startsWith('{') || raw.trim().startsWith('[') ? raw.trim() : Buffer.from(raw.trim(), 'base64').toString('utf8');
  const o = JSON.parse(text);
  return (Array.isArray(o) ? o : [o]).filter(x => x && x.vapid && x.sub && x.sub.endpoint);
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(new URL('../reminders.json', import.meta.url)));
  const devices = parseConfig(process.env.PUSH_CONFIG || '');
  if (!devices.length) { console.log('No PUSH_CONFIG secret yet. Turn on notifications in the app and add the setup code as a repo secret.'); return; }
  const isTest = String(process.env.TEST) === 'true';
  const due = isTest ? [{ id: 'test', title: 'Dashboard notifications work', body: 'Reminders will arrive here. Tap to open your hand.', url: 'deck.html#today' }]
    : dueFor(cfg, process.env.SCHEDULE || '');
  if (!due.length) { console.log('Nothing due for', process.env.SCHEDULE); return; }
  const webpush = (await import('web-push')).default;
  let failed = 0;
  for (const d of devices) for (const r of due) {
    const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.id });
    try {
      await webpush.sendNotification(d.sub, payload, { TTL: 3 * 3600, urgency: 'high', topic: r.id,
        vapidDetails: { subject: d.subject || 'https://eyrek.github.io/daily-dashboard/', publicKey: d.vapid.publicKey, privateKey: d.vapid.privateKey } });
      console.log(`Sent "${r.title}" to ${d.device || 'device'}`);
    } catch (e) {
      failed++;
      console.log(`Failed "${r.title}" to ${d.device || 'device'}: ${e.statusCode || ''} ${e.body || e.message}`);
      if (e.statusCode === 404 || e.statusCode === 410) console.log('That device unsubscribed. Turn notifications on again in the app and update the PUSH_CONFIG secret.');
    }
  }
  if (failed) process.exitCode = 1;
}
if (import.meta.url === `file://${process.argv[1]}`) main();
