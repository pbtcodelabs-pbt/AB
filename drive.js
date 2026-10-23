/* 📒 آڑھت بک — گوگل ڈرائیو پر خودکار بیک اپ
   - ہر تبدیلی کے چند سیکنڈ بعد «تازہ ترین» فائل ڈرائیو پر اپڈیٹ
   - ہر دن کی الگ نقل بھی، 90 دن سے پرانی خود صاف
   - اجازت صرف drive.file: ایپ صرف اپنی بنائی فائلیں دیکھ سکتی ہے
   - گوگل کا Client ID وہی جو اسی ویب سائٹ کی دوسری ایپس (دودھ ڈائری، مکتبہ، میڈیسن شیلف) میں ہے
   app.js سے window.AB_HOST کے ذریعے ڈیٹا ملتا ہے؛ ہر بات اردو میں */
(() => {
  'use strict';

  const CLIENT_ID = '954131537356-2be2rne30mje71l9qibosblvj3j0eqoj.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';
  // نام انگریزی حروف میں (مالک کی ہدایت): اردو نام فون کے فائل مینیجر میں ٹھیک نہیں پڑھے جاتے
  // فولڈر BKAR Backup؛ ہر دن کی فائل BKAR + تاریخ + مہینہ + دن + وقت + AM/PM (مثلاً BKAR2410SA0455AM.json)؛ ساتھ BKAR-LATEST.json
  const FOLDER_NAME = 'BKAR Backup';
  const LATEST_NAME = 'BKAR-LATEST.json';
  const META_KEY = 'ab_drive';
  const KEEP_DAILY = 90;
  const AUTO_DELAY = 4000;
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  const host = () => window.AB_HOST;
  const toast = m => host() && host().toast(m);
  // کمپیوٹر (.exe) والی ایپ فائل سے کھلتی ہے — وہاں گوگل کی اجازت والی کھڑکی نہیں چلتی
  const SUPPORTED = /^https?:$/.test(location.protocol);

  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { meta = {}; }
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} };

  let token = null, tokenExp = 0, tokenClient = null, busy = false, autoTimer = null, waitTap = false;
  const hasToken = () => token && Date.now() < tokenExp - 60000;

  const pad = n => String(n).padStart(2, '0');
  const dayStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const when = iso => { if (!iso) return ''; const d = new Date(iso); return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // ---------- گوگل کی اسکرپٹ ----------
  let gisPromise = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gisPromise = null; rej(new Error('gis')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  // ---------- اجازت ----------
  function getToken(interactive) {
    if (hasToken()) return Promise.resolve(token);
    if (!SUPPORTED) return Promise.reject(new Error('unsupported'));
    if (!interactive) return Promise.reject(new Error('need-consent'));
    if (!navigator.onLine) return Promise.reject(new Error('offline'));
    return loadGis().then(() => new Promise((res, rej) => {
      if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
      tokenClient.callback = r => {
        if (r.error) { rej(new Error(r.error)); return; }
        token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        res(token);
      };
      tokenClient.error_callback = e => rej(new Error((e && e.type) || 'popup'));
      const opts = { prompt: meta.email ? '' : 'consent' };
      if (meta.email) opts.hint = meta.email;
      tokenClient.requestAccessToken(opts);
    }));
  }

  async function api(url, opt = {}) {
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + token }, opt.headers || {}) }));
    if (r.status === 401) { token = null; throw new Error('expired'); }
    if (!r.ok) throw new Error('http ' + r.status);
    return r;
  }

  async function whoAmI() {
    try {
      const j = await (await api('https://www.googleapis.com/oauth2/v3/userinfo')).json();
      if (j.email) { meta.email = j.email; saveMeta(); }
    } catch (e) {}
  }

  async function ensureFolder() {
    if (meta.folderId) {
      try {
        const j = await (await api(`${DRIVE}/${meta.folderId}?fields=id,name,trashed`)).json();
        if (!j.trashed) {
          if (j.name !== FOLDER_NAME) await api(`${DRIVE}/${meta.folderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME }) });
          return meta.folderId;
        }
      } catch (e) { if (e.message === 'expired') throw e; }
      meta.folderId = null; meta.latestId = null; meta.dailyId = null;
    }
    const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const found = await (await api(`${DRIVE}?q=${q}&fields=files(id)&spaces=drive`)).json();
    if (found.files && found.files.length) { meta.folderId = found.files[0].id; saveMeta(); return meta.folderId; }
    const made = await (await api(DRIVE + '?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    })).json();
    meta.folderId = made.id; saveMeta(); return made.id;
  }

  async function listFiles() {
    const folder = await ensureFolder();
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const j = await (await api(`${DRIVE}?q=${q}&orderBy=modifiedTime desc&pageSize=200&fields=files(id,name,modifiedTime,appProperties)`)).json();
    return j.files || [];
  }

  function multipart(metaObj, content) {
    const b = 'ab' + Date.now();
    return {
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metaObj)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`
    };
  }
  async function upload(name, content, count, existingId) {
    const props = { name, appProperties: { count: String(count), app: 'aarhat-book', day: dayStamp() } };
    if (existingId) {
      return (await api(`${UPLOAD}/${existingId}?uploadType=multipart&fields=id`, Object.assign({ method: 'PATCH' }, multipart(props, content)))).json();
    }
    return (await api(`${UPLOAD}?uploadType=multipart&fields=id`, Object.assign({ method: 'POST' },
      multipart(Object.assign({ mimeType: 'application/json', parents: [meta.folderId] }, props), content)))).json();
  }

  // ---------- بیک اپ ----------
  async function backup(interactive) {
    if (busy) return false;
    busy = true; render();
    try {
      await getToken(interactive);
      if (!meta.email) await whoAmI();
      await ensureFolder();
      const content = JSON.stringify(host().snapshot());
      const n = host().count();
      let latestId = meta.latestId;
      if (!latestId) {
        const q = encodeURIComponent(`name='${LATEST_NAME}' and '${meta.folderId}' in parents and trashed=false`);
        const f = (await (await api(`${DRIVE}?q=${q}&fields=files(id)`)).json()).files;
        latestId = (f && f[0] && f[0].id) || null;
      }
      try { meta.latestId = (await upload(LATEST_NAME, content, n, latestId)).id; }
      catch (e) { if (latestId && /404/.test(e.message)) meta.latestId = (await upload(LATEST_NAME, content, n, null)).id; else throw e; }

      const today = dayStamp(), dailyName = host().fileName(new Date()); // دن کی فائل کا نام ہر بار آخری وقت سے بدلتا ہے
      if (meta.dailyDay === today && meta.dailyId) {
        try { await upload(dailyName, content, n, meta.dailyId); }
        catch (e) { meta.dailyId = (await upload(dailyName, content, n, null)).id; }
      } else {
        meta.dailyId = (await upload(dailyName, content, n, null)).id; meta.dailyDay = today;
        cleanupOld().catch(() => {});
      }
      meta.lastDrive = new Date().toISOString(); meta.lastCount = n; meta.pending = false;
      saveMeta();
      return n;
    } catch (e) {
      handleErr(e, interactive);
      return false;
    } finally { busy = false; render(); }
  }

  async function cleanupOld() {
    const cutoff = dayStamp(new Date(Date.now() - KEEP_DAILY * 864e5));
    const old = (await listFiles()).filter(f => f.name !== LATEST_NAME && f.appProperties && f.appProperties.day && f.appProperties.day < cutoff);
    for (const f of old) await api(`${DRIVE}/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }

  function handleErr(e, interactive) {
    console.warn('drive', e);
    const m = e.message || '';
    if (m === 'need-consent') return;
    if (!interactive && m === 'expired') return;
    toast(
      m === 'unsupported' ? 'کمپیوٹر والی ایپ میں ڈرائیو نہیں جڑتی — بیک اپ فائل بنائیں' :
      m === 'offline' ? 'انٹرنیٹ نہیں ہے، آن لائن ہو کر دوبارہ کریں' :
      m === 'gis' ? 'گوگل سے رابطہ نہیں ہو سکا، انٹرنیٹ دیکھیں' :
      /popup|access_denied/.test(m) ? 'گوگل اکاؤنٹ کی اجازت نہیں ملی' :
      'ڈرائیو پر محفوظ نہیں ہو سکا، دوبارہ کوشش کریں');
  }

  // ---------- واپس لانا ----------
  async function openRestore() {
    const box = document.getElementById('driveFiles'); if (!box) return;
    box.innerHTML = '<div class="muted" style="text-align:center">ڈرائیو سے فائلیں آ رہی ہیں…</div>';
    try {
      await getToken(true);
      if (!meta.email) await whoAmI();
      const files = (await listFiles()).filter(f => /\.json$/.test(f.name));
      render();
      if (!files.length) { box.innerHTML = '<div class="muted" style="text-align:center">ڈرائیو پر ابھی کوئی بیک اپ نہیں</div>'; return; }
      files.sort((a, b) => (b.name === LATEST_NAME) - (a.name === LATEST_NAME) || b.modifiedTime.localeCompare(a.modifiedTime));
      box.innerHTML = '<div class="list">' + files.slice(0, 60).map(f => {
        const n = (f.appProperties && f.appProperties.count) || '؟';
        const day = f.appProperties && f.appProperties.day;
        const lbl = f.name === LATEST_NAME ? `⭐ تازہ ترین — <span class="num">${when(f.modifiedTime)}</span>` : `📅 <span class="num">${day ? day.split('-').reverse().join('-') : when(f.modifiedTime)}</span> کی نقل <span class="muted num">${f.name}</span>`;
        return `<div class="it" data-id="${f.id}" data-n="${n}"><div>${lbl}</div><span class="muted"><span class="num">${n}</span> پرچیاں</span></div>`;
      }).join('') + '</div>';
      box.querySelectorAll('.it').forEach(b => b.onclick = () => restoreFile(b.dataset.id));
    } catch (e) { box.innerHTML = ''; handleErr(e, true); }
  }

  async function restoreFile(id) {
    try {
      await getToken(true);
      const j = await (await api(`${DRIVE}/${id}?alt=media`)).json();
      if (await host().apply(j)) { meta.lastDrive = new Date().toISOString(); meta.pending = false; saveMeta(); render(); }
    } catch (e) { handleErr(e, true); }
  }

  // ---------- خودکار بیک اپ ----------
  function onChanged() {
    meta.pending = true; saveMeta(); render();
    if (!meta.email || !navigator.onLine || !SUPPORTED) return;
    clearTimeout(autoTimer);
    if (!hasToken()) {
      // اجازت پہلے دی جا چکی ہے؛ ٹوکن ختم ہو تو اگلے ٹچ پر خاموشی سے نیا لے کر محفوظ کریں
      waitTap = true;
      return;
    }
    autoTimer = setTimeout(() => { if (hasToken() && navigator.onLine) backup(false); }, AUTO_DELAY);
  }
  document.addEventListener('pointerdown', () => {
    if (!waitTap || busy || !meta.pending || !meta.email) return;
    waitTap = false;
    getToken(true).then(() => backup(false)).catch(() => { waitTap = true; });
  }, true);
  window.addEventListener('online', () => { if (meta.pending && meta.email) waitTap = true; });

  // ---------- جوڑنا / الگ کرنا ----------
  async function connect() {
    const n = await backup(true);
    if (n !== false) toast('✅ ڈرائیو سے جڑ گیا — سارا ریکارڈ محفوظ');
  }
  async function now() { const n = await backup(true); if (n !== false) toast('✅ ڈرائیو پر محفوظ ہو گیا'); }
  function disconnect() {
    try { if (token && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    meta = {}; token = null; saveMeta(); render(); toast('ڈرائیو سے الگ کر دیا');
  }

  // ---------- حالت ----------
  function state() {
    if (!SUPPORTED) return { cls: 'off', txt: 'کمپیوٹر والی ایپ میں ڈرائیو نہیں — روز بیک اپ فائل بنائیں' };
    if (busy) return { cls: 'busy', txt: '⏳ ڈرائیو پر محفوظ ہو رہا ہے…' };
    if (!meta.email) return { cls: 'warn', txt: '⚠️ ڈرائیو سے نہیں جڑا — ریکارڈ صرف اس آلے میں ہے' };
    if (meta.pending) return { cls: 'warn', txt: '⏳ نئی تبدیلی ڈرائیو پر جانا باقی' };
    return { cls: 'ok', txt: '✅ ڈرائیو پر محفوظ — <span class="num">' + when(meta.lastDrive) + '</span>' };
  }
  function render() {
    const st = document.getElementById('driveStatus');
    if (st) { const s = state(); st.className = 'dstatus ' + s.cls; st.innerHTML = s.txt + (meta.email ? `<div class="muted num" style="direction:ltr;text-align:right">${meta.email}</div>` : ''); }
    const chip = document.getElementById('driveChip');
    if (chip) { const s = state(); chip.textContent = busy ? '⏳' : s.cls === 'ok' ? '☁️' : '⚠️'; chip.className = 'ib dchip ' + s.cls; }
    const bn = document.getElementById('btnDriveNow'); if (bn) bn.disabled = busy;
  }

  window.addEventListener('ab-data-changed', onChanged);
  if (meta.email && navigator.onLine && SUPPORTED) loadGis().catch(() => {});
  if (meta.pending && meta.email) waitTap = true;

  window.AB_DRIVE = {
    connect, now, disconnect, openRestore, render, supported: SUPPORTED,
    connected: () => !!meta.email, lastBackup: () => meta.lastDrive || null, pending: () => !!meta.pending
  };
})();
