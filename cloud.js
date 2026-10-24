/* 📒 آڑھت بک — کئی آلات کا ڈیٹا ملانا (فائربیس: aarhat-book)
   - ہر آلہ گمنام (Anonymous) شناخت سے جڑتا ہے؛ آڑھت کا ڈیٹا shops/<آڑھت کوڈ>/records/<قسم__شناخت>
   - مالک «کلاؤڈ چالو» کرتا ہے → آڑھت کوڈ + جوڑنے کا کوڈ بنتا ہے؛ ملازم وہی کوڈ لکھ کر جڑتا ہے
   - ہر آلہ آف لائن کام کرتا رہے؛ نیٹ ہو تو اپنی تبدیلیاں بھیجے اور دوسروں کی لے
   - ایک ہی ریکارڈ دو جگہ بدلا ہو تو جس کا upd بعد کا وہ جیتے
   - حفاظت سرور کے اصولوں (firestore.rules) سے؛ ہر بات اردو میں
   app.js سے window.AB_HOST کے ذریعے ڈیٹا ملتا ہے */
(() => {
  'use strict';
  const CFG = window.AB_FIREBASE;
  if (!CFG) return;
  const KEY = CFG.apiKey;
  const BASE = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents`;
  const META_KEY = 'ab_cloud';          // اس آلے کی شناخت، ٹوکن، آخری لینا — یہ آلہ وار ہے، بیک اپ/sync میں نہیں جاتا
  const PUSHED_KEY = 'ab_cloud_pushed'; // کون سا ریکارڈ کس upd تک بھیجا جا چکا
  const PAGE = 300;

  const host = () => window.AB_HOST;
  const toast = m => host() && host().toast(m);
  let meta = {}, pushed = {};
  try { meta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { meta = {}; }
  try { pushed = JSON.parse(localStorage.getItem(PUSHED_KEY) || '{}') || {}; } catch (e) { pushed = {}; }
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} };
  const savePushed = () => { try { localStorage.setItem(PUSHED_KEY, JSON.stringify(pushed)); } catch (e) {} };

  let busy = false, pushTimer = null, lastErr = '';

  // ---------- شناخت (Anonymous) ----------
  async function token() {
    if (meta.idToken && Date.now() < (meta.exp || 0) - 60000) return meta.idToken;
    if (meta.refresh) {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(meta.refresh)
      });
      if (r.ok) { const j = await r.json(); meta.idToken = j.id_token; meta.refresh = j.refresh_token; meta.uid = j.user_id; meta.exp = Date.now() + (+j.expires_in || 3600) * 1000; saveMeta(); return meta.idToken; }
    }
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
    });
    if (!r.ok) throw new Error('auth');
    const j = await r.json();
    meta.idToken = j.idToken; meta.refresh = j.refreshToken; meta.uid = j.localId; meta.exp = Date.now() + (+j.expiresIn || 3600) * 1000; saveMeta();
    return meta.idToken;
  }
  async function fs(path, opt = {}) {
    const t = await token();
    const r = await fetch(path.startsWith('http') ? path : `${BASE}/${path}`, Object.assign({}, opt, {
      headers: Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, opt.headers || {})
    }));
    if (r.status === 403) throw new Error('denied');
    if (r.status === 404) throw new Error('notfound');
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }
  const S = v => ({ stringValue: String(v) });
  const I = v => ({ integerValue: String(Math.trunc(v)) });
  const docName = p => `projects/${CFG.projectId}/databases/(default)/documents/${p}`;

  // ---------- کوڈ ----------
  function rnd(n, abc) { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(x => abc[x % abc.length]).join(''); }
  // آڑھت کوڈ اور جوڑنے کا کوڈ ایک ہی لائن میں: مثلاً AB7K2M9QX4-58302917 (واٹس ایپ پر بھیجنا آسان)
  const joinCode = () => meta.shopId && meta.joinKey ? `${meta.shopId}-${meta.joinKey}` : '';
  function parseCode(c) {
    const m = /^\s*([A-Z0-9]{10,24})\s*-\s*([0-9]{6,12})\s*$/i.exec(String(c || ''));
    return m ? { shopId: m[1].toUpperCase(), key: m[2] } : null;
  }

  // ---------- مالک: کلاؤڈ چالو ----------
  async function enableOwner() {
    if (busy) return false;
    busy = true; render();
    try {
      await token();
      const shopId = 'AB' + rnd(14, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      const joinKey = rnd(8, '0123456789');
      const st = host().settings();
      await fs(`shops?documentId=${shopId}`, { method: 'POST', body: JSON.stringify({ fields: { owner: S(meta.uid), name: S(st.shop || ''), at: I(Date.now()) } }) });
      await fs(`shops/${shopId}/members?documentId=${meta.uid}`, { method: 'POST', body: JSON.stringify({ fields: { role: S('owner'), name: S(st.owner || 'مالک'), at: I(Date.now()) } }) });
      await fs(`shops/${shopId}/secret?documentId=join`, { method: 'POST', body: JSON.stringify({ fields: { key: S(joinKey) } }) });
      Object.assign(meta, { shopId, joinKey, role: 'owner', lastPull: 0, on: true }); saveMeta();
      pushed = {}; savePushed();
      host().setCloud({ shopId, joinKey });
      await sync(true);
      toast('✅ کلاؤڈ چالو — اب ملازم کو جوڑنے کا کوڈ دیں');
      return true;
    } catch (e) { handleErr(e); return false; } finally { busy = false; render(); }
  }

  // ---------- ملازم (یا مالک کا نیا آلہ): آڑھت سے جڑنا ----------
  async function join(code, name) {
    const c = parseCode(code);
    if (!c) { toast('⚠️ جوڑنے کا کوڈ درست نہیں — جیسا ملا ویسا ہی لکھیں'); return false; }
    if (busy) return false;
    busy = true; render();
    try {
      await token();
      try {
        await fs(`shops/${c.shopId}/members?documentId=${meta.uid}`, { method: 'POST', body: JSON.stringify({ fields: { role: S('staff'), name: S(name || 'ملازم'), key: S(c.key), at: I(Date.now()) } }) });
      } catch (e) { if (!/http 409/.test(e.message)) throw e; } // پہلے سے جڑا ہوا
      Object.assign(meta, { shopId: c.shopId, joinKey: c.key, role: meta.role === 'owner' && meta.shopId === c.shopId ? 'owner' : 'staff', lastPull: 0, on: true }); saveMeta();
      pushed = {}; savePushed();
      await sync(true);
      host().setCloud({ shopId: c.shopId, joinKey: c.key });
      toast('✅ آڑھت سے جڑ گئے — سارا ریکارڈ آ گیا');
      return true;
    } catch (e) { handleErr(e, true); return false; } finally { busy = false; render(); }
  }

  // ---------- ملانا: پہلے لینا، پھر بھیجنا ----------
  async function sync(loud) {
    if (!meta.on || !meta.shopId) return false;
    if (!navigator.onLine) { if (loud) toast('انٹرنیٹ نہیں ہے — آن لائن ہو کر دوبارہ'); return false; }
    try {
      await pull();
      await push();
      meta.lastSync = Date.now(); lastErr = ''; saveMeta(); render();
      if (loud) toast('✅ سب آلات کا ڈیٹا مل گیا');
      return true;
    } catch (e) { handleErr(e, loud); return false; }
  }
  async function pull() {
    for (let guard = 0; guard < 200; guard++) {
      const body = { structuredQuery: {
        from: [{ collectionId: 'records' }],
        where: { fieldFilter: { field: { fieldPath: 'u' }, op: 'GREATER_THAN_OR_EQUAL', value: I(meta.lastPull || 0) } },
        orderBy: [{ field: { fieldPath: 'u' }, direction: 'ASCENDING' }],
        limit: PAGE } };
      const res = await fs(`shops/${meta.shopId}:runQuery`, { method: 'POST', body: JSON.stringify(body) });
      const docs = res.filter(x => x.document).map(x => x.document.fields);
      if (!docs.length) return;
      const list = [];
      let maxU = meta.lastPull || 0;
      docs.forEach(f => {
        const u = +f.u.integerValue;
        if (u > maxU) maxU = u;
        let rec = null; try { rec = JSON.parse(f.j.stringValue); } catch (e) {}
        if (rec) list.push({ c: f.c.stringValue, k: f.k.stringValue, u, rec });
        pushed[f.c.stringValue + '__' + f.k.stringValue] = Math.max(pushed[f.c.stringValue + '__' + f.k.stringValue] || 0, u);
      });
      host().mergeRemote(list);
      savePushed();
      const moved = maxU > (meta.lastPull || 0);
      meta.lastPull = maxU; saveMeta();
      if (docs.length < PAGE || !moved) return;
    }
  }
  async function push() {
    const all = host().records(); // [{c, k, u, d, rec}]
    const todo = all.filter(x => x.u && !(pushed[x.c + '__' + x.k] >= x.u));
    for (let i = 0; i < todo.length; i += 400) {
      const part = todo.slice(i, i + 400);
      const writes = part.map(x => ({ update: { name: docName(`shops/${meta.shopId}/records/${x.c}__${x.k}`), fields: {
        c: S(x.c), k: S(x.k), u: I(x.u), d: S(x.d || ''), j: S(JSON.stringify(x.rec)) } } }));
      await fs(`${BASE.replace(/\/documents$/, '')}/documents:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
      part.forEach(x => { pushed[x.c + '__' + x.k] = x.u; });
      savePushed();
    }
  }

  // ---------- مالک: جڑے آلات ----------
  async function members() {
    const j = await fs(`shops/${meta.shopId}/members?pageSize=100`);
    return (j.documents || []).map(d => ({ uid: d.name.split('/').pop(), role: d.fields.role && d.fields.role.stringValue, name: d.fields.name && d.fields.name.stringValue, at: d.fields.at ? +d.fields.at.integerValue : 0 }));
  }
  async function removeMember(uid) { await fs(`shops/${meta.shopId}/members/${uid}`, { method: 'DELETE' }); }

  function handleErr(e, loud) {
    console.warn('cloud', e);
    const m = e.message || '';
    lastErr = m === 'denied' ? 'اجازت نہیں — کوڈ غلط ہے یا اس آلے کو آڑھت سے ہٹا دیا گیا' :
      m === 'auth' ? 'کلاؤڈ سے شناخت نہیں ہو سکی، انٹرنیٹ دیکھیں' :
      /Failed to fetch|NetworkError|network/i.test(m) ? 'انٹرنیٹ نہیں ہے' :
      'کلاؤڈ سے رابطہ نہیں ہو سکا، دوبارہ کوشش کریں';
    render();
    if (loud) toast('⚠️ ' + lastErr);
  }

  // ---------- خودکار ----------
  window.addEventListener('ab-data-changed', () => {
    if (!meta.on) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { if (navigator.onLine) sync(false); }, 2500);
  });
  window.addEventListener('online', () => { if (meta.on) sync(false); });
  setInterval(() => { if (meta.on && navigator.onLine && document.visibilityState === 'visible') sync(false); }, 30000);
  document.addEventListener('visibilitychange', () => { if (meta.on && document.visibilityState === 'visible' && navigator.onLine) sync(false); });

  // ---------- حالت ----------
  function state() {
    if (!meta.on) return { cls: 'off', txt: 'کلاؤڈ بند — ریکارڈ صرف اس آلے میں (اور گوگل ڈرائیو پر اگر جڑی ہو)' };
    if (busy) return { cls: 'busy', txt: '⏳ کلاؤڈ سے مل رہا ہے…' };
    if (lastErr) return { cls: 'warn', txt: '⚠️ ' + lastErr };
    const t = meta.lastSync ? new Date(meta.lastSync) : null;
    const p = n => String(n).padStart(2, '0');
    return { cls: 'ok', txt: '✅ کلاؤڈ چالو — آخری بار ملا: <span class="num">' + (t ? `${p(t.getHours())}:${p(t.getMinutes())}` : '—') + '</span>' };
  }
  function render() {
    const st = document.getElementById('cloudStatus');
    if (st) { const s = state(); st.className = 'dstatus ' + s.cls; st.innerHTML = s.txt; }
  }

  window.AB_CLOUD = {
    enableOwner, join, sync, members, removeMember, render, parseCode,
    on: () => !!meta.on, role: () => meta.role || '', uid: () => meta.uid || '', code: joinCode,
    start() { if (meta.on) sync(false); }
  };
})();
