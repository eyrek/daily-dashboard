/* Deck cloud sync (Supabase). Local-first: the deck always lives in localStorage and works offline;
   when signed in, it is kept in step with one row per account in Supabase.
   No library: Supabase Auth (email code) and the REST API are called with fetch. */
(function (root) {
  'use strict';
  const CFG = {
    url: 'https://iroezsviwezwhvfihqhl.supabase.co',
    key: 'sb_publishable_cIaEcTey0VV22l6OkXE7fw_wwm5eD-n', // publishable key: public by design, row-level security protects the data
    google: '432336762758-9tsfn0o4bn3nj2j2gdk0s77jnudpuh2e.apps.googleusercontent.com'
  };
  const SESSION = 'deck.sync.session', META = 'deck.sync.meta';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let state = { status: 'off', msg: '', at: 0 }, busy = null, again = false, timer = 0;
  const listeners = new Set();
  const setState = (status, msg = '') => { state = { status, msg, at: Date.now() }; listeners.forEach(f => { try { f(state); } catch (e) {} }); };
  const device = () => (/Android/i.test(navigator.userAgent) ? 'phone' : /Windows/i.test(navigator.userAgent) ? 'windows' : /Mac/i.test(navigator.userAgent) ? 'mac' : 'browser');

  async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
    const h = Object.assign({ apikey: CFG.key, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, headers);
    const r = await fetch(CFG.url + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!r.ok) { const e = new Error((data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return data;
  }

  /* ---------- auth: Sign in with Google -> Supabase session ----------
     Phone app: Android Credential Manager (account picker) via @capgo/capacitor-social-login.
     Browser: Google Identity Services button. Either way we get a Google ID token and trade it for a Supabase session. */
  const session = () => ls.get(SESSION);
  const keepSession = d => { const o = session() || {}; ls.set(SESSION, { access: d.access_token, refresh: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000, email: (d.user && d.user.email) || o.email, uid: (d.user && d.user.id) || o.uid }); };
  async function token() {
    const s = session(); if (!s) return null;
    if (s.exp - Date.now() > 60000) return s.access;
    try { keepSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh } })); return session().access; }
    catch (e) { if (e.status === 400 || e.status === 401) { ls.set(SESSION, null); setState('off', 'Signed out. Sign in again to keep syncing.'); } throw e; }
  }
  const native = () => !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform() && root.Capacitor.Plugins && root.Capacitor.Plugins.SocialLogin);
  async function nonces() {
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return { raw, hashed: Array.from(new Uint8Array(dig), b => b.toString(16).padStart(2, '0')).join('') };
  }
  async function exchange(idToken, raw) {
    keepSession(await call('/auth/v1/token?grant_type=id_token', { method: 'POST', body: { provider: 'google', id_token: idToken, nonce: raw } }));
    ls.set(META, null); await sync('first'); return true;
  }
  let nativeReady = null;
  async function signInNative() {
    const SL = root.Capacitor.Plugins.SocialLogin;
    if (!nativeReady) nativeReady = SL.initialize({ google: { webClientId: CFG.google, mode: 'online', skipAuthOnlyAuthorizationAfterSignIn: true } });
    await nativeReady;
    const n = await nonces();
    const r = await SL.login({ provider: 'google', options: { nonce: n.hashed, filterByAuthorizedAccounts: false } });
    const idToken = r && r.result && r.result.idToken; if (!idToken) throw new Error('Google didn’t return a sign-in token.');
    return exchange(idToken, n.raw);
  }
  function loadGis() {
    if (root.google && google.accounts && google.accounts.id) return Promise.resolve();
    return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = () => bad(new Error('Couldn’t reach Google. Check your connection.')); document.head.appendChild(s); });
  }
  /* draws the official Google button into el; resolves after a successful sign-in */
  async function renderButton(el, onDone) {
    if (native()) { el.innerHTML = '<button type="button" class="sm pri">Sign in with Google</button>'; el.firstChild.onclick = () => signInNative().then(() => onDone && onDone(), e => onDone && onDone(e)); return; }
    await loadGis(); const n = await nonces();
    google.accounts.id.initialize({ client_id: CFG.google, nonce: n.hashed, use_fedcm_for_button: true, callback: res => exchange(res.credential, n.raw).then(() => onDone && onDone(), e => onDone && onDone(e)) });
    el.innerHTML = ''; google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
  }
  async function signOut() {
    const s = session(); ls.set(SESSION, null); ls.set(META, null); setState('off');
    if (s) call('/auth/v1/logout', { method: 'POST', token: s.access }).catch(() => {});
    try { if (native()) root.Capacitor.Plugins.SocialLogin.logout({ provider: 'google' }); else if (root.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
  }

  /* ---------- sync ----------
     meta = { version: remote version we last matched, fp: fingerprint of the deck at that moment }
     local changed  = Deck.fingerprint() !== meta.fp;  remote changed = remote.version !== meta.version
     only remote → take it;  only local → push;  both → merge (Deck.mergeInto) and push;  neither → nothing. */
  async function pull(tok, uid) {
    const rows = await call('/rest/v1/decks?select=data,version,updated_at,device&user_id=eq.' + uid, { token: tok });
    return rows && rows[0] ? rows[0] : null;
  }
  async function push(tok, uid, data, base) {
    const row = { data, device: device(), updated_at: new Date().toISOString() };
    if (base == null) {
      try { await call('/rest/v1/decks', { method: 'POST', token: tok, body: Object.assign({ user_id: uid, version: 1 }, row), headers: { Prefer: 'return=minimal' } }); return 1; }
      catch (e) { if (e.status === 409) return null; throw e; }
    }
    const out = await call('/rest/v1/decks?user_id=eq.' + uid + '&version=eq.' + base, { method: 'PATCH', token: tok, body: Object.assign({ version: base + 1 }, row), headers: { Prefer: 'return=representation' } });
    return out && out.length ? base + 1 : null; // null = someone else saved first
  }
  async function once(why) {
    const D = root.Deck; if (!D || !CFG.url) return;
    const tok = await token(); if (!tok) { setState('off'); return; }
    const uid = session().uid;
    setState('syncing');
    D.syncFromStorage && D.syncFromStorage();
    for (let attempt = 0; attempt < 3; attempt++) {
      const meta = ls.get(META) || {}, remote = await pull(tok, uid);
      const localChanged = D.fingerprint() !== meta.fp;
      if (!remote) {
        const v = await push(tok, uid, D.S, null); if (v == null) continue;
        ls.set(META, { version: v, fp: D.fingerprint() }); setState('ok'); return;
      }
      const remoteChanged = remote.version !== meta.version;
      if (!remoteChanged && !localChanged) { setState('ok'); return; }
      if (remoteChanged && !localChanged) { D.adopt(remote.data); ls.set(META, { version: remote.version, fp: D.fingerprint() }); setState('ok', 'Updated from ' + (remote.device || 'another device')); return; }
      let data = D.S;
      if (remoteChanged) { // both sides moved (or first sign-in on a device with its own deck): combine them
        const merged = D.mergeInto(D.S, remote.data); D.adopt(merged); data = D.S;
      }
      const v = await push(tok, uid, data, remote.version); if (v == null) continue;
      ls.set(META, { version: v, fp: D.fingerprint() }); setState('ok', remoteChanged ? 'Merged with ' + (remote.device || 'another device') : ''); return;
    }
    throw new Error('Another device kept saving at the same moment. Will retry.');
  }
  async function sync(why) {
    if (!configured() || !session()) return;
    if (busy) { again = true; return busy; }
    busy = (async () => {
      try { await once(why); }
      catch (e) { setState(navigator.onLine === false ? 'offline' : 'error', navigator.onLine === false ? 'Offline. Changes will sync when you reconnect.' : (e.message || 'Sync failed')); }
      finally { busy = null; if (again) { again = false; setTimeout(() => sync('again'), 50); } }
    })();
    return busy;
  }
  const soon = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(() => sync('change'), ms); };
  async function history() {
    const tok = await token(); if (!tok) return [];
    return call('/rest/v1/deck_history?select=id,version,device,saved_at&order=saved_at.desc&limit=30', { token: tok });
  }
  async function restore(id) {
    const tok = await token(); const rows = await call('/rest/v1/deck_history?select=data&id=eq.' + Number(id), { token: tok });
    if (!rows || !rows[0]) throw new Error('Version not found.');
    root.Deck.adopt(rows[0].data); soon(10); return true;
  }

  function configured() { return !!(CFG.url && CFG.key); }
  function start() {
    if (!configured() || !root.Deck) return;
    if (session()) setState('syncing');
    root.Deck.onChange(() => soon());
    addEventListener('online', () => sync('online'));
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync('visible'); else if (timer) { clearTimeout(timer); sync('hide'); } });
    addEventListener('storage', e => { if (e.key === root.Deck.KEY) soon(); });
    setInterval(() => { if (document.visibilityState === 'visible') sync('tick'); }, 5 * 60000);
    sync('load');
  }

  root.DeckSync = {
    configured, start, sync, renderButton, signOut, history, restore, native,
    get signedIn() { return !!session(); }, get email() { return (session() || {}).email || ''; },
    get state() { return state; }, onState(f) { listeners.add(f); return () => listeners.delete(f); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
