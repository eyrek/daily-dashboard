/* deck-push.js: turns on Web Push for this device. The signing key pair (VAPID) is made here with WebCrypto
   and kept only on this device (localStorage 'deck.push', never in backups or save codes). The user pastes the
   resulting setup code into the GitHub secret PUSH_CONFIG; the scheduled workflow uses it to send reminders. */
(function () {
  'use strict';
  const KEY = 'deck.push', SUBJECT = 'https://eyrek.github.io/daily-dashboard/';
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext && !!(window.crypto && crypto.subtle);
  const installed = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  async function keys() {
    let k = read();
    if (k && k.vapid && k.vapid.publicKey && k.vapid.privateKey) return k;
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    k = { vapid: { publicKey: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), privateKey: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d } };
    write(k); return k;
  }
  async function registration() {
    if (!navigator.serviceWorker.controller) await navigator.serviceWorker.register('sw.js');
    return navigator.serviceWorker.ready;
  }
  async function enable(device) {
    if (!supported()) throw new Error('This browser can’t receive push notifications. Use the installed app from Chrome on Android.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in Android Settings → Apps → Dashboard → Notifications, then try again.');
    const reg = await registration(), k = await keys();
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey && b64u(sub.options.applicationServerKey) !== k.vapid.publicKey) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(k.vapid.publicKey) });
    const cfg = { v: 1, device: device || (/Android/i.test(navigator.userAgent) ? 'phone' : 'computer'), subject: SUBJECT, vapid: k.vapid, sub: sub.toJSON() };
    k.code = btoa(JSON.stringify(cfg)); k.at = Date.now(); write(k);
    return k.code;
  }
  async function status() {
    if (!supported()) return { supported: false, installed: installed() };
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const k = read();
    return { supported: true, installed: installed(), permission: Notification.permission, subscribed: !!sub, code: sub && k && k.code ? k.code : '' };
  }
  async function testLocal() {
    const reg = await registration();
    await reg.showNotification('Notifications are on', { body: 'This one came from the app itself. Scheduled reminders come from GitHub.', icon: 'icon-192.png', badge: 'badge-96.png', tag: 'local-test', data: { url: 'deck.html#today' } });
  }
  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
    const k = read(); if (k) { delete k.code; write(k); }
  }
  window.DeckPush = { supported, installed, enable, status, testLocal, disable };
})();
