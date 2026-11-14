/* deck-notify.js: on-device reminders when running inside the Android app (Capacitor).
   Schedules the next 7 days of reminders with Android's alarm system, at exact times, and leaves out anything
   already done, excused or paused. Reschedules whenever the deck changes or the app is opened.
   In a normal browser this does nothing (DeckNotify.native === false). */
(function () {
  'use strict';
  const D = window.Deck;
  const Cap = window.Capacitor;
  const native = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  const LN = native && Cap.Plugins ? Cap.Plugins.LocalNotifications : null;
  const BASE = 'https://eyrek.github.io/daily-dashboard/';
  const DEFAULTS = {
    shutdown: { on: true, time: '20:25' },
    trash: { on: true, time: '19:30' },
    recycle: { on: true, time: '19:35' },
    campfire: { on: true, time: '18:57' }
  };
  const LABELS = { shutdown: 'Evening Shutdown cue', trash: 'Trash night', recycle: 'Recycling night', campfire: 'Sunday campfire' };

  function settings() {
    const s = (D.S.settings && D.S.settings.reminders) || {}, out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = Object.assign({}, DEFAULTS[k], s[k] || {});
    return out;
  }
  function setReminder(key, patch) {
    const cur = settings(); cur[key] = Object.assign({}, cur[key], patch);
    return D.setSettings({ reminders: cur });
  }
  const at = (dayKey, time) => { const [h, m] = time.split(':').map(Number); const d = D.parse(dayKey); d.setHours(h, m, 0, 0); return d; };
  function hashId(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 1) % 2000000000 + 1; }

  /* what would be sent over the next `days` days, given the deck as it is now */
  function plan(days = 7, now = new Date()) {
    const R = settings(), out = [], today = D.today();
    const chore = id => D.S.chores.find(c => c.id === id) || {};
    for (let i = 0; i < days; i++) {
      const d = D.addDays(today, i), tomorrow = D.addDays(d, 1);
      const add = (kind, time, title, body, url) => { const t = at(d, time); if (t > now) out.push({ id: hashId(kind + d), kind, at: t, title, body, url }); };
      if (R.shutdown.on && !D.isPaused(d)) {
        const ev = D.S.cards.filter(c => c.part === 'evening' && D.cardState(c, d) === 'training' && D.isDue(c, d));
        const open = ev.filter(c => !D.isPlayed(c, d));
        if (open.length) {
          const first = D.linksAt(open[0], d, 'training')[0];
          add('shutdown', R.shutdown.time, open[0].name, first ? first.name.replace(/^\d+:\d+:\s*/, 'Now: ') : 'Time to start the routine.', 'deck.html#today');
        }
      }
      const tr = chore('trash');
      if (R.trash.on && (tr.days || []).includes(D.dow(tomorrow)) && !D.choreDoneOn('trash', d)) add('trash', R.trash.time, 'Trash night', 'Trash out tonight. Pickup is tomorrow.', './');
      const rc = chore('recycle');
      if (R.recycle.on && rc.anchor && ((D.diff(tomorrow, rc.anchor) % 14) + 14) % 14 === 0 && !D.choreDoneOn('recycle', d)) add('recycle', R.recycle.time, 'Recycling night', 'Recycling out tonight. Pickup is tomorrow.', './');
      if (R.campfire.on && D.dow(d) === 0 && !D.currentFire(d)) add('campfire', R.campfire.time, 'Campfire', '10 minutes to review the week and rate your habits.', 'deck.html#campfire');
    }
    return out.sort((a, b) => a.at - b.at);
  }

  let channelMade = false, timer = null, lastError = '';
  async function permission() { if (!LN) return 'unavailable'; try { return (await LN.checkPermissions()).display; } catch (e) { return 'unavailable'; } }
  async function sync() {
    if (!LN) return;
    try {
      if ((await permission()) !== 'granted') return;
      if (!channelMade) { await LN.createChannel({ id: 'reminders', name: 'Reminders', description: 'Habit cues, chores and the weekly campfire', importance: 4, visibility: 1 }); channelMade = true; }
      const pending = (await LN.getPending()).notifications || [];
      const ours = pending.filter(n => n.extra && n.extra.deck);
      if (ours.length) await LN.cancel({ notifications: ours.map(n => ({ id: n.id })) });
      const list = plan();
      if (list.length) await LN.schedule({ notifications: list.map(n => ({
        id: n.id, title: n.title, body: n.body, channelId: 'reminders', smallIcon: 'ic_stat_deck', iconColor: '#ff5a36',
        schedule: { at: n.at, allowWhileIdle: true }, extra: { deck: true, url: n.url } })) });
      lastError = '';
    } catch (e) { lastError = e && e.message ? e.message : String(e); }
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(sync, 600); };

  async function requestPermission() {
    if (!LN) throw new Error('Notifications need the Android app.');
    const r = await LN.requestPermissions();
    if (r.display !== 'granted') throw new Error('Notifications are blocked. Allow them in Android Settings → Apps → Dashboard → Notifications.');
    await sync(); return true;
  }
  async function exactAllowed() {
    if (!LN || typeof LN.checkExactNotificationSetting !== 'function') return true;
    try { return (await LN.checkExactNotificationSetting()).exact_alarm === 'granted'; } catch (e) { return true; }
  }
  async function openExactSetting() { if (LN && typeof LN.changeExactNotificationSetting === 'function') await LN.changeExactNotificationSetting(); }
  async function test() {
    if (!LN) throw new Error('Notifications need the Android app.');
    await LN.schedule({ notifications: [{ id: 7, title: 'Reminders work', body: 'This is how your cues will look. Tap to open your hand.', channelId: 'reminders', smallIcon: 'ic_stat_deck', iconColor: '#ff5a36',
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, extra: { url: 'deck.html#today' } }] });
  }

  if (LN) {
    LN.addListener('localNotificationActionPerformed', e => {
      const u = e && e.notification && e.notification.extra && e.notification.extra.url;
      if (u) location.href = new URL(u, BASE).href;
    });
    D.onChange(soon);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(); });
    soon();
  }
  window.DeckNotify = { native, LABELS, settings, setReminder, plan, sync, permission, requestPermission, exactAllowed, openExactSetting, test, get lastError() { return lastError; } };
})();
