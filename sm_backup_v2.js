/* =====================================================================
   ☁️ آڑھت بک — نیا گوگل ڈرائیو بیک اپ / ریسٹور نظام (SM110TH026)
   یہ سکرپٹ index.html کے آخر میں لگتی ہے (build_general.py خود لگاتا ہے) اور پرانے ڈرائیو فنکشن بدل دیتی ہے۔
   ---------------------------------------------------------------------
   ✔ فائل کا نام: BKSM + تاریخ(2) + مہینہ(3 حروف) + دن(2) + وقت  → مثلاً BKSM01OCTTH0112PM.JSON
   ✔ گوگل اکاؤنٹ ایک بار؛ ای میل یاد رہتی ہے (Drive About API سے — پرانا userinfo drive.file پر چلتا ہی نہیں تھا)
   ✔ ٹوکن 1 گھنٹہ محفوظ رہتا ہے؛ ہر بار نئی اجازت نہیں
   ✔ اوپر لمبی پروگریس پٹی: اصل بائٹس (اپلوڈ/ڈاؤنلوڈ) + ریکارڈ کی گنتی
   ✔ بیک اپ کے بعد فائلوں کی فہرست (سائز + ریکارڈ) + OK؛ ریسٹور پر وہی فہرست، ترتیب بدلنے کے بٹن
   ✔ خودکار: دن 12 اور رات 12 (ایپ کھلتے ہی جو وقت گزر چکا ہو) — نہ ہو سکے تو "ٹیپ کریں" پٹی
   ✔ ڈرائیو میں صرف آخری 10 فائلیں
   ✔ ریسٹور سے پہلے موجودہ ڈیٹا کی حفاظتی کاپی (IndexedDB) + "ریسٹور واپس کریں"
   ✔ ریسٹور میں سبسکرپشن کی تاریخ/پیکج پیچھے نہیں جاتے؛ ڈرائیو/اکاؤنٹ کی سیٹنگ فون کی اپنی رہتی ہے
   ===================================================================== */
(function(){
  'use strict';
  if(window.__smBkV2) return; window.__smBkV2 = true;

  // 👉 آڑھت بک کے اپنے گوگل OAuth کلائنٹ کی ID یہاں (یا build_general میں) لگائیں؛ خالی ہو تو پرانی (FM والی) ID چلتی رہے گی
  const OWN_CLIENT_ID = '17117109520-cmjeqcj0eq2q1qu9gvcfq2iiovrm8et9.apps.googleusercontent.com';
  const KEEP = 10;
  const TOKEN_KEY = 'smDriveTok';
  const EMAIL_KEY = 'smGdriveEmail';
  const STATE_KEY = 'smAutoBkState2';
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const DAYS = ['SU','MO','TU','WE','TH','FR','SA'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtSize = n => { n = Number(n) || 0; return n >= 1048576 ? (n/1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(n/1024)) + ' KB'; };
  const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true}); };
  const mkErr = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  const localDay = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0'); };
  const arr = x => Array.isArray(x) ? x : [];

  // ---------------------------------------------------------------- فائل کا نام
  window.generateBackupFileName = function(){
    const n = new Date();
    let h = n.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if(h === 0) h = 12;
    return 'BKSM' + String(n.getDate()).padStart(2,'0') + MONTHS[n.getMonth()] + DAYS[n.getDay()] +
           String(h).padStart(2,'0') + String(n.getMinutes()).padStart(2,'0') + ap + '.JSON';
  };

  // ---------------------------------------------------------------- گنتی
  function countsOf(b){
    const c = arr(b.customers).length, s = arr(b.suppliers).length, p = arr(b.products).length, i = arr(b.invoices).length;
    const other = arr(b.payments).length + arr(b.expenses).length + arr(b.recoveryList).length + arr(b.diary).length + arr(b.advanceOrders).length;
    return { c, s, p, i, r: c + s + p + i + other };
  }
  function currentCounts(){ try{ return countsOf(buildBackupObject()); }catch(e){ return {c:0,s:0,p:0,i:0,r:0}; } }
  function countsLine(k){
    return `👥 ${k.c} کسٹمر  •  🚚 ${k.s} بیوپاری  •  🥬 ${k.p} آئٹم  •  🧾 ${k.i} بل`;
  }

  // ---------------------------------------------------------------- لمبی پروگریس پٹی
  const Prog = {
    box: null, target: 0, shown: 0, timer: null, hideT: null, tap: null, theme: 'bk',
    ensure(){
      if(this.box) return;
      const d = document.createElement('div');
      d.id = 'smBkBanner';
      d.setAttribute('dir', 'rtl');
      d.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; z-index:2147483000; padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 10px; box-shadow:0 6px 18px rgba(0,0,0,.35); font-family:inherit; color:#fff; text-align:center;';
      d.innerHTML = '<div id="smBkTitle" style="font-weight:900; font-size:15px; margin-bottom:3px;"></div>' +
        '<div id="smBkCounts" style="font-size:12.5px; font-weight:700; opacity:.96; margin-bottom:6px; line-height:1.6;"></div>' +
        '<div style="height:24px; background:rgba(255,255,255,.28); border-radius:14px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,.5);">' +
        '<div id="smBkFill" style="height:100%; width:0%; background:linear-gradient(90deg,#bbf7d0,#4ade80,#22c55e); border-radius:14px;"></div>' +
        '<div id="smBkPct" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12.5px; color:#064e3b; text-shadow:0 1px 0 rgba(255,255,255,.6);">0%</div></div>' +
        '<div id="smBkStage" style="font-size:12px; font-weight:700; margin-top:5px; min-height:16px;"></div>';
      d.addEventListener('click', () => { if(this.tap) this.tap(); });
      (document.body || document.documentElement).appendChild(d);
      this.box = d;
    },
    $(id){ return document.getElementById(id); },
    paint(){
      const f = this.$('smBkFill'), p = this.$('smBkPct'); if(!f) return;
      f.style.width = this.shown.toFixed(1) + '%'; p.textContent = Math.floor(this.shown) + '%';
    },
    start(title, counts, theme){
      this.ensure(); clearTimeout(this.hideT); clearInterval(this.timer);
      this.tap = null; this.target = 0; this.shown = 0; this.theme = theme || 'bk';
      this.box.style.background = this.theme === 'rs' ? 'linear-gradient(160deg,#15803d,#166534)' : 'linear-gradient(160deg,#1d4ed8,#1e3a8a)';
      this.box.style.cursor = 'default';
      this.$('smBkTitle').textContent = title || '';
      this.$('smBkCounts').innerHTML = counts || '';
      this.$('smBkStage').textContent = '';
      this.paint(); this.box.style.display = 'block';
      // آہستہ آہستہ چلتی ہے: ہر 90ms پر 0.6% سے 2.2% (100% تک تقریباً 5-7 سیکنڈ)
      this.timer = setInterval(() => {
        if(this.shown < this.target){
          const step = Math.min(2.2, Math.max(0.6, (this.target - this.shown) * 0.09));
          this.shown = Math.min(this.target, this.shown + step); this.paint();
        }
      }, 90);
    },
    set(pct, stage){
      if(pct > this.target) this.target = Math.min(100, pct);
      if(stage != null){ const s = this.$('smBkStage'); if(s) s.textContent = stage; }
    },
    counts(html){ const c = this.$('smBkCounts'); if(c) c.innerHTML = html; },
    async reach(pct, stage){
      this.set(pct, stage);
      while(this.shown < Math.min(pct, 100) - 0.01) await sleep(60);
    },
    async finish(msg, opts){
      opts = opts || {};
      this.set(100, '');
      while(this.shown < 99.99) await sleep(60);
      this.$('smBkTitle').textContent = msg;
      this.$('smBkStage').textContent = opts.hint || '';
      if(opts.tap){ this.tap = opts.tap; this.box.style.cursor = 'pointer'; }
      clearTimeout(this.hideT);
      this.hideT = setTimeout(() => this.hide(), opts.keepMs || 4000);
    },
    fail(msg){
      clearInterval(this.timer); clearTimeout(this.hideT);
      if(!this.box) return;
      this.box.style.background = 'linear-gradient(160deg,#b91c1c,#7f1d1d)';
      this.$('smBkTitle').textContent = '❌ ' + msg;
      this.$('smBkStage').textContent = '';
      this.hideT = setTimeout(() => this.hide(), 5000);
    },
    hide(){
      clearInterval(this.timer); clearTimeout(this.hideT); this.tap = null;
      if(this.box) this.box.style.display = 'none';
    }
  };

  // ---------------------------------------------------------------- گوگل لاگ ان (ایک بار)
  const savedEmail = () => loadFromStorage(EMAIL_KEY, null) || (AppState.settings && AppState.settings.gdriveAccountEmail) || '';
  const cachedToken = () => { const t = loadFromStorage(TOKEN_KEY, null); return (t && t.token && t.exp > Date.now() + 90000) ? t.token : null; };
  const clientId = () => OWN_CLIENT_ID || GOOGLE_DRIVE_CLIENT_ID;

  function getToken(interactive){
    return new Promise((resolve, reject) => {
      const c = cachedToken();
      if(c){ gDriveAccessToken = c; return resolve(c); }
      if(!navigator.onLine) return reject(mkErr('offline', 'انٹرنیٹ نہیں ہے'));
      if(!window.google || !google.accounts || !google.accounts.oauth2) return reject(mkErr('gis', 'گوگل کی سروس لوڈ نہیں ہوئی — انٹرنیٹ چیک کریں'));
      let done = false;
      const to = setTimeout(() => { if(!done){ done = true; reject(mkErr('timeout', 'گوگل نے جواب نہیں دیا')); } }, interactive ? 180000 : 20000);
      const em = savedEmail();
      const cfg = {
        client_id: clientId(), scope: GOOGLE_DRIVE_SCOPE, prompt: '',
        callback: resp => {
          if(done) return; done = true; clearTimeout(to);
          if(!resp || resp.error || !resp.access_token) return reject(mkErr((resp && resp.error) || 'denied', (resp && (resp.error_description || resp.error)) || 'اجازت نہیں ملی'));
          gDriveAccessToken = resp.access_token;
          saveToStorage(TOKEN_KEY, { token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
          resolve(resp.access_token);
        },
        error_callback: err => {
          if(done) return; done = true; clearTimeout(to);
          const t = (err && err.type) || 'popup';
          reject(mkErr(t, t === 'popup_closed' ? 'گوگل کی کھڑکی بند کر دی گئی' : t === 'popup_failed_to_open' ? 'گوگل کی کھڑکی کھل نہیں سکی' : 'گوگل سے رابطہ نہیں ہو سکا'));
        }
      };
      if(em) cfg.hint = em;
      try{ google.accounts.oauth2.initTokenClient(cfg).requestAccessToken({}); }
      catch(e){ if(!done){ done = true; clearTimeout(to); reject(mkErr('gis', e.message)); } }
    });
  }
  const auth = () => ({ 'Authorization': 'Bearer ' + gDriveAccessToken });

  async function rememberAccount(){
    try{
      const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: auth() });
      if(r.ok){
        const j = await r.json(); const em = j && j.user && j.user.emailAddress;
        if(em){
          saveToStorage(EMAIL_KEY, em);
          if(AppState.settings.gdriveAccountEmail !== em){ AppState.settings.gdriveAccountEmail = em; persistAllData(); }
          return em;
        }
      }
    }catch(e){}
    return savedEmail();
  }

  // ---------------------------------------------------------------- ڈرائیو کی فائلیں
  const nameOk = n => /^BK(SM|FM)/i.test(n || '');
  async function listBackups(folderId){
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(`'${folderId}' in parents and mimeType='application/json' and trashed=false`) +
      '&orderBy=' + encodeURIComponent('createdTime desc') + '&pageSize=60&fields=' + encodeURIComponent('files(id,name,size,createdTime,appProperties)');
    const r = await fetch(url, { headers: auth() });
    if(!r.ok) throw mkErr('list', 'فہرست نہیں ملی (' + r.status + ')');
    const j = await r.json();
    return arr(j.files).filter(f => nameOk(f.name)).map(f => {
      const a = f.appProperties || {};
      const k = (a.c != null && a.r != null) ? { c: +a.c, s: +a.s || 0, p: +a.p || 0, i: +a.i || 0, r: +a.r } : null;
      return { id: f.id, name: f.name, size: Number(f.size) || 0, created: f.createdTime, k };
    });
  }
  async function downloadJson(id, size, onFrac){
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: auth() });
    if(!r.ok) throw mkErr('download', 'ڈاؤنلوڈ ناکام (' + r.status + ')');
    let text;
    if(r.body && r.body.getReader){
      const rd = r.body.getReader(), chunks = []; let got = 0;
      for(;;){ const { done, value } = await rd.read(); if(done) break; chunks.push(value); got += value.length; if(onFrac && size) onFrac(Math.min(1, got / size)); }
      const all = new Uint8Array(got); let o = 0; chunks.forEach(c => { all.set(c, o); o += c.length; });
      text = new TextDecoder('utf-8').decode(all);
    } else { text = await r.text(); }
    if(onFrac) onFrac(1);
    return JSON.parse(text);
  }
  // جن فائلوں میں گنتی درج نہیں (پرانی) ان کی گنتی ایک بار نکال کر ڈرائیو میں لکھ دیں
  async function fillMissingCounts(files){
    const todo = files.filter(f => !f.k);
    let idx = 0;
    const worker = async () => {
      while(idx < todo.length){
        const f = todo[idx++];
        try{
          const b = await downloadJson(f.id, f.size);
          f.k = countsOf(b);
          fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, auth()),
            body: JSON.stringify({ appProperties: { c: String(f.k.c), s: String(f.k.s), p: String(f.k.p), i: String(f.k.i), r: String(f.k.r) } }) }).catch(() => {});
        }catch(e){ f.k = { c: 0, s: 0, p: 0, i: 0, r: 0, bad: true }; }
      }
    };
    await Promise.all([worker(), worker()]);
  }
  // ڈرائیو میں صرف آخری KEEP فائلیں؛ ایک ہی نام (ایک ہی منٹ) کی پرانی نقل بھی صاف
  async function trimOld(files, keepId){
    const seen = new Set(), keep = [], drop = [];
    files.forEach(f => { if(f.id === keepId || (!seen.has(f.name) && keep.length < KEEP)){ keep.push(f); seen.add(f.name); } else drop.push(f); });
    for(const f of drop){
      if(f.id === keepId) continue;
      try{ await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE', headers: auth() }); }catch(e){}
    }
    return keep;
  }

  function uploadXhr(folderId, name, text, props, onFrac){
    return new Promise((resolve, reject) => {
      const bd = 'smbk' + Date.now();
      const meta = { name, mimeType: 'application/json', parents: [folderId], appProperties: props };
      const body = new Blob([`--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, text, `\r\n--${bd}--`]);
      const x = new XMLHttpRequest();
      x.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime');
      x.setRequestHeader('Authorization', 'Bearer ' + gDriveAccessToken);
      x.setRequestHeader('Content-Type', 'multipart/related; boundary=' + bd);
      x.upload.onprogress = e => { if(e.lengthComputable && onFrac) onFrac(e.loaded / e.total); };
      x.onload = () => { if(x.status >= 200 && x.status < 300){ try{ resolve(JSON.parse(x.responseText)); }catch(e){ reject(mkErr('upload', 'جواب سمجھ نہیں آیا')); } } else reject(mkErr('upload', 'اپلوڈ ناکام (' + x.status + ')')); };
      x.onerror = () => reject(mkErr('upload', 'اپلوڈ کے دوران نیٹ ٹوٹ گیا'));
      x.ontimeout = () => reject(mkErr('upload', 'اپلوڈ میں بہت دیر لگی'));
      x.timeout = 180000;
      x.send(body);
    });
  }

  // ---------------------------------------------------------------- ہماری اپنی کھڑکیاں (فہرست / تصدیق)
  function overlay(id){
    let o = document.getElementById(id);
    if(!o){
      o = document.createElement('div'); o.id = id; o.setAttribute('dir', 'rtl');
      o.style.cssText = 'display:none; position:fixed; inset:0; z-index:2147483100; background:rgba(15,23,42,.6); align-items:center; justify-content:center; padding:10px; font-family:inherit;';
      document.body.appendChild(o);
    }
    return o;
  }
  const closeOv = id => { const o = document.getElementById(id); if(o) o.style.display = 'none'; };
  const BTN = 'width:100%; border:none; border-radius:12px; padding:13px; font-weight:900; font-size:15px; cursor:pointer; font-family:inherit; margin-top:8px;';

  // mode: 'info' (بیک اپ کے بعد) یا 'restore'
  function showList(files, o){
    o = o || {};
    const ov = overlay('smBkList');
    let sort = 'new';
    const maxR = Math.max(0, ...files.map(f => f.k ? f.k.r : 0));
    const render = () => {
      const list = files.slice();
      if(sort === 'big') list.sort((a, b) => (b.k ? b.k.r : 0) - (a.k ? a.k.r : 0));
      if(sort === 'small') list.sort((a, b) => (a.k ? a.k.r : 0) - (b.k ? b.k.r : 0));
      const chip = (k, t) => `<button type="button" data-sort="${k}" style="flex:1; border:none; border-radius:10px; padding:8px 4px; font-weight:800; font-size:12px; cursor:pointer; font-family:inherit; background:${sort === k ? '#1d4ed8' : '#e2e8f0'}; color:${sort === k ? '#fff' : '#334155'};">${t}</button>`;
      const items = list.length ? list.map(f => {
        const k = f.k || { c: 0, s: 0, p: 0, i: 0, r: 0 };
        const badges = (f.k && f.k.r === maxR && maxR > 0 && files.length > 1 ? '<span style="background:#fef3c7; color:#92400e; border-radius:8px; padding:1px 7px; font-size:11px; font-weight:800; margin-inline-start:4px;">⭐ سب سے زیادہ ریکارڈ</span>' : '') +
          (f.id === (o.highlightId || '') ? '<span style="background:#dcfce7; color:#166534; border-radius:8px; padding:1px 7px; font-size:11px; font-weight:800; margin-inline-start:4px;">🆕 ابھی کا</span>' : '');
        return `<div ${o.mode === 'restore' ? `data-pick="${esc(f.id)}"` : ''} style="border:1.5px solid ${f.id === (o.highlightId || '') ? '#22c55e' : '#e2e8f0'}; border-radius:12px; padding:10px; margin-bottom:8px; ${o.mode === 'restore' ? 'cursor:pointer;' : ''} background:#fff;">
          <div dir="ltr" style="font-weight:900; font-size:13.5px; color:#0f172a; text-align:left; word-break:break-all;">📄 ${esc(f.name)}</div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px;">🕒 ${esc(fmtDate(f.created))} &nbsp;•&nbsp; 📦 ${fmtSize(f.size)}${badges}</div>
          <div style="font-size:12.5px; font-weight:800; color:#1e3a8a; margin-top:4px; line-height:1.7;">${f.k && f.k.bad ? '⚠️ فائل پڑھی نہیں جا سکی' : countsLine(k) + ` &nbsp;•&nbsp; کل ریکارڈ: <b>${k.r}</b>`}</div>
          ${o.mode === 'restore' ? '<div style="margin-top:6px; text-align:center; background:#16a34a; color:#fff; border-radius:9px; padding:6px; font-weight:900; font-size:13px;">↩️ اس سے ریسٹور کریں</div>' : ''}
        </div>`;
      }).join('') : '<div style="text-align:center; color:#64748b; padding:24px 8px; font-weight:700;">ڈرائیو میں ابھی کوئی بیک اپ فائل نہیں</div>';
      ov.innerHTML = `<div style="background:#f8fafc; width:100%; max-width:440px; max-height:90vh; overflow:auto; border-radius:18px; padding:14px; box-shadow:0 20px 50px rgba(0,0,0,.45);">
        <div style="text-align:center; font-size:34px;">${o.icon || '☁️'}</div>
        <div style="text-align:center; font-weight:900; font-size:17px; color:#0f172a;">${o.title || ''}</div>
        <div style="text-align:center; font-size:12.5px; color:#475569; line-height:1.7; margin:4px 0 8px;">${o.sub || ''}</div>
        ${o.extra || ''}
        ${files.length > 1 ? `<div style="display:flex; gap:6px; margin-bottom:8px;">${chip('new', '🆕 نئی پہلے')}${chip('big', '📊 زیادہ ریکارڈ')}${chip('small', '📉 کم ریکارڈ')}</div>` : ''}
        ${items}
        <button type="button" id="smBkListOk" style="${BTN} background:linear-gradient(155deg,#16a34a,#15803d); color:#fff;">${o.mode === 'restore' ? 'منسوخ' : '✅ ٹھیک ہے (OK)'}</button>
      </div>`;
      if(o.mode === 'restore'){ const ok = ov.querySelector('#smBkListOk'); ok.style.background = '#e2e8f0'; ok.style.color = '#0f172a'; }
      ov.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { sort = b.getAttribute('data-sort'); render(); });
      ov.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const f = files.find(x => x.id === b.getAttribute('data-pick')); if(f && o.onPick) o.onPick(f); });
      ov.querySelector('#smBkListOk').onclick = () => { closeOv('smBkList'); if(o.onClose) o.onClose(); };
      (o.bind || []).forEach(fn => fn(ov));
    };
    render(); ov.style.display = 'flex';
  }

  // ---------------------------------------------------------------- حفاظتی کاپی (IndexedDB) — ریسٹور واپس کرنے کے لیے
  function idb(){
    return new Promise((res, rej) => {
      try{
        const q = indexedDB.open('abBkSnap', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('kv');
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      }catch(e){ rej(e); }
    });
  }
  async function snapPut(v){ const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'last'); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); }); }
  async function snapGet(){ try{ const d = await idb(); return await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get('last'); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }catch(e){ return null; } }

  // ---------------------------------------------------------------- ریسٹور کا اصل عمل (پرانے proceedWithImport پر مبنی، مگر محفوظ)
  const ORIG_PROCEED = window.proceedWithImport;
  const ORIG_SHOW_MODAL = window.showBackupConfirmModal;
  window.showBackupConfirmModal = function(type, fileName, info){
    if(window.__smSilent){ window.__smLastModal = { type, info }; return; }
    return ORIG_SHOW_MODAL.apply(this, arguments);
  };
  const KEEP_DEVICE_KEYS = ['gdriveAccountEmail', 'gdriveFolderId', 'gdrivePromptShown', 'lastBackupFileName', 'lastBackupAt', 'lastGDriveBackupAt'];

  function applyBackupObject(backup){
    const S = AppState.settings, cur = Object.assign({}, S);
    window.__smLastModal = null; window.__smSilent = true;
    pendingImportBackup = backup; pendingImportFileName = 'SM';
    try{ ORIG_PROCEED(); } finally { window.__smSilent = false; }
    const res = window.__smLastModal;
    if(!res || res.type !== 'import') throw new Error((res && res.info && res.info.message) || 'بحالی ناکام');
    // فون کی اپنی چیزیں واپس
    KEEP_DEVICE_KEYS.forEach(k => { if(cur[k] !== undefined) S[k] = cur[k]; else delete S[k]; });
    // سبسکرپشن: جس کی تاریخ آگے ہو وہی رہے (پرانا بیک اپ ایپ کو "ختم" نہ کر دے)
    const be = backup.settings && backup.settings.subscriptionExpiry, ce = cur.subscriptionExpiry;
    if(ce && (!be || String(ce) >= String(be))){
      S.subscriptionExpiry = ce; S.isOnFreeTrial = cur.isOnFreeTrial;
      if(cur.smPlan !== undefined) S.smPlan = cur.smPlan;
    }
    persistAllData();
    try{ refreshAllScreens(); }catch(e){}
  }
  const liveCounts = () => ({ c: customersData.length, s: suppliersData.length, p: productsData.length, i: invoicesData.length });

  // ---------------------------------------------------------------- بیک اپ
  let busy = false;
  const state = { needTap: false, lastFail: 0 };

  async function smBackupNow(opt){
    opt = opt || {}; const auto = !!opt.auto;
    if(busy){ if(!auto) alert('ابھی ایک بیک اپ/ریسٹور چل رہا ہے، تھوڑا انتظار کریں'); return false; }
    if(AppState.currentRole !== 'admin' && auto) return false;
    busy = true;
    try{
      let backup, text, bytes, k;
      try{
        backup = buildBackupObject(); text = JSON.stringify(backup); bytes = new Blob([text]).size; k = countsOf(backup);
      }catch(e){ throw mkErr('build', 'ڈیٹا تیار نہیں ہو سکا: ' + e.message); }
      const name = generateBackupFileName();
      Prog.start('☁️ گوگل ڈرائیو پر بیک اپ ہو رہا ہے', `${countsLine(k)}<br>📄 <span dir="ltr">${esc(name)}</span> &nbsp;•&nbsp; 📦 ${fmtSize(bytes)} &nbsp;•&nbsp; کل ریکارڈ ${k.r}`, 'bk');
      Prog.set(6, 'ڈیٹا تیار ہو گیا');
      // گوگل سے رابطہ
      Prog.set(14, 'گوگل ڈرائیو سے رابطہ…');
      let tok;
      try{ tok = await getToken(!auto); }
      catch(e){
        if(auto){ Prog.hide(); state.needTap = true; state.lastFail = Date.now(); try{ renderDriveBackupReminder(); }catch(_){} return false; }
        throw e;
      }
      Prog.set(20, 'رابطہ ہو گیا ✔');
      const em = await rememberAccount();
      const folderId = await ensureGDriveBackupFolder();
      Prog.set(26, 'فولڈر تیار: ' + GDRIVE_BACKUP_FOLDER_NAME);
      // اپلوڈ — اصل بائٹس
      const props = { c: String(k.c), s: String(k.s), p: String(k.p), i: String(k.i), r: String(k.r) };
      Prog.set(30, 'اپلوڈ ہو رہا ہے…');
      const up = await uploadXhr(folderId, name, text, props, f => Prog.set(30 + 56 * f, `اپلوڈ: ${Math.round(f * 100)}%`));
      Prog.set(88, 'اپلوڈ مکمل — تصدیق ہو رہی ہے…');
      if(!up || !up.id) throw mkErr('verify', 'ڈرائیو نے فائل کی تصدیق نہیں کی');
      if(up.size != null && Number(up.size) !== bytes){
        try{ await fetch(`https://www.googleapis.com/drive/v3/files/${up.id}`, { method: 'DELETE', headers: auth() }); }catch(e){}
        throw mkErr('verify', 'فائل کا سائز ڈرائیو پر مختلف آیا — بیک اپ رد کیا گیا، دوبارہ کوشش کریں');
      }
      AppState.settings.lastBackupFileName = name;
      AppState.settings.lastBackupAt = new Date().toISOString();
      AppState.settings.lastGDriveBackupAt = AppState.settings.lastBackupAt;
      persistAllData();
      try{ renderHomeLastBackupLine(); }catch(e){}
      Prog.set(93, 'فائل ڈرائیو پر محفوظ ✔');
      // فہرست + پرانی صفائی
      let files = [];
      try{
        files = await listBackups(folderId);
        files = await trimOld(files, up.id);
        files.forEach(f => { if(f.id === up.id) f.k = k; });
        await fillMissingCounts(files);
      }catch(e){ console.warn('list/trim', e); }
      state.needTap = false;
      saveToStorage(STATE_KEY, Object.assign(loadFromStorage(STATE_KEY, {}), { lastOk: Date.now() }));
      const showFiles = () => showList(files, { icon: '✅', title: 'بیک اپ مکمل!', highlightId: up.id, mode: 'info',
        sub: `گوگل اکاؤنٹ: <b dir="ltr">${esc(em || savedEmail() || '—')}</b><br>فولڈر: <b>${esc(GDRIVE_BACKUP_FOLDER_NAME)}</b><br>ڈرائیو میں اب ${files.length} فائلیں ہیں (زیادہ سے زیادہ ${KEEP} رہتی ہیں)` });
      if(auto){
        await Prog.finish('✅ خودکار بیک اپ مکمل — ' + k.r + ' ریکارڈ', { hint: 'فائلیں دیکھنے کے لیے یہاں ٹیپ کریں', tap: () => { Prog.hide(); showFiles(); }, keepMs: 7000 });
      } else {
        await Prog.finish('✅ بیک اپ مکمل!', { keepMs: 1200 });
        Prog.hide(); showFiles();
      }
      try{ renderDriveBackupReminder(); }catch(e){}
      return true;
    }catch(err){
      console.warn('backup failed', err);
      if(auto){ Prog.hide(); state.lastFail = Date.now(); state.needTap = true; try{ renderDriveBackupReminder(); }catch(_){} }
      else { Prog.fail('بیک اپ نہیں ہو سکا'); setTimeout(() => alert('❌ بیک اپ نہیں ہو سکا\n\n' + (err.message || err) + '\n\nانٹرنیٹ دیکھ کر دوبارہ کوشش کریں۔'), 150); }
      return false;
    }finally{ busy = false; }
  }

  // ---------------------------------------------------------------- ریسٹور
  async function smRestoreFlow(){
    if(busy){ alert('ابھی ایک بیک اپ/ریسٹور چل رہا ہے، تھوڑا انتظار کریں'); return; }
    busy = true;
    let files;
    try{
      Prog.start('📂 ڈرائیو کی بیک اپ فائلیں ڈھونڈ رہا ہوں…', '', 'rs');
      Prog.set(20, 'گوگل ڈرائیو سے رابطہ…');
      await getToken(true);
      Prog.set(45, 'فولڈر کھول رہا ہوں…');
      await rememberAccount();
      const folderId = await ensureGDriveBackupFolder();
      Prog.set(65, 'فہرست لے رہا ہوں…');
      files = await listBackups(folderId);
      Prog.set(85, 'ہر فائل کے ریکارڈ گن رہا ہوں…');
      await fillMissingCounts(files);
      Prog.hide();
    }catch(err){
      Prog.fail('فہرست نہیں مل سکی'); busy = false;
      setTimeout(() => alert('❌ ڈرائیو سے فہرست نہیں مل سکی\n\n' + (err.message || err)), 150);
      return;
    }
    busy = false;
    const cur = currentCounts();
    showList(files, { icon: '📂', title: 'کون سی فائل سے ریسٹور کرنا ہے؟', mode: 'restore',
      sub: `فون میں ابھی: ${countsLine(cur)}<br>کوئی فائل دبائیں — بڑی (زیادہ ریکارڈ) یا پرانی، جو چاہیں چنیں`,
      onPick: f => confirmRestore(f, cur) });
  }

  function confirmRestore(f, cur){
    closeOv('smBkList');
    const k = f.k || { c: 0, s: 0, p: 0, i: 0, r: 0 };
    const less = k.r < cur.r;
    const ov = overlay('smBkConfirm');
    const row = (t, a, b) => `<tr><td style="padding:4px 6px; font-weight:800;">${t}</td><td style="padding:4px 6px; text-align:center;">${a}</td><td style="padding:4px 6px; text-align:center; font-weight:900; color:${b < a ? '#b91c1c' : '#166534'};">${b}</td></tr>`;
    ov.innerHTML = `<div style="background:#fff; width:100%; max-width:400px; border-radius:18px; padding:16px; box-shadow:0 20px 50px rgba(0,0,0,.45);">
      <div style="text-align:center; font-size:34px;">⚠️</div>
      <div style="text-align:center; font-weight:900; font-size:17px;">یہ بیک اپ ریسٹور کریں؟</div>
      <div dir="ltr" style="text-align:center; font-weight:900; font-size:13.5px; margin:6px 0; word-break:break-all;">📄 ${esc(f.name)}</div>
      <div style="text-align:center; font-size:12px; color:#64748b;">🕒 ${esc(fmtDate(f.created))} • 📦 ${fmtSize(f.size)}</div>
      <table style="width:100%; margin-top:10px; font-size:13.5px; border-collapse:collapse; background:#f8fafc; border-radius:10px;">
        <tr style="font-size:12px; color:#64748b;"><td></td><td style="text-align:center; padding:4px;">فون میں اب</td><td style="text-align:center; padding:4px;">بیک اپ میں</td></tr>
        ${row('👥 کسٹمر', cur.c, k.c)}${row('🚚 بیوپاری', cur.s, k.s)}${row('🥬 آئٹم', cur.p, k.p)}${row('🧾 بل', cur.i, k.i)}
      </table>
      ${less ? '<div style="margin-top:10px; background:#fef2f2; color:#991b1b; border-radius:10px; padding:8px; font-size:12.5px; font-weight:800; line-height:1.6;">⚠️ اس فائل میں فون کے موجودہ ڈیٹا سے کم ریکارڈ ہیں۔ ریسٹور کے بعد فون کا نیا ڈیٹا اس فائل جیسا ہو جائے گا۔</div>' : ''}
      <div style="margin-top:10px; font-size:12.5px; color:#334155; line-height:1.7; text-align:center;">ریسٹور سے پہلے فون کے موجودہ ڈیٹا کی حفاظتی کاپی خود بنتی ہے — غلطی ہو تو "ریسٹور واپس کریں" سے پرانا ڈیٹا لوٹ آئے گا۔</div>
      <button type="button" id="smBkGo" style="${BTN} background:linear-gradient(155deg,#16a34a,#15803d); color:#fff;">✅ ہاں، ریسٹور کریں</button>
      <button type="button" id="smBkNo" style="${BTN} background:#e2e8f0; color:#0f172a;">منسوخ</button></div>`;
    ov.style.display = 'flex';
    ov.querySelector('#smBkNo').onclick = () => closeOv('smBkConfirm');
    ov.querySelector('#smBkGo').onclick = () => { closeOv('smBkConfirm'); doRestore(f, cur); };
  }

  async function doRestore(f, cur){
    if(busy) return; busy = true;
    const kk = f.k || { c: 0, s: 0, p: 0, i: 0, r: 0 };
    let snapshotted = false;
    try{
      Prog.start('📥 ڈرائیو سے ڈیٹا واپس آ رہا ہے', `${esc(f.name)}<br>${countsLine(kk)} &nbsp;•&nbsp; 📦 ${fmtSize(f.size)}`, 'rs');
      Prog.set(6, 'فائل منگوا رہا ہوں…');
      const backup = await downloadJson(f.id, f.size, fr => Prog.set(6 + 44 * fr, `ڈاؤنلوڈ: ${Math.round(fr * 100)}%`));
      Prog.set(52, 'ڈاؤنلوڈ مکمل ✔ — فائل جانچ رہا ہوں…');
      if(!backup || !Array.isArray(backup.products) || !Array.isArray(backup.customers) || (backup.invoices != null && !Array.isArray(backup.invoices)) || (backup.suppliers != null && !Array.isArray(backup.suppliers)))
        throw mkErr('invalid', 'یہ آڑھت بک کی درست بیک اپ فائل نہیں لگتی — ریسٹور نہیں کیا');
      const bk = countsOf(backup);
      Prog.set(60, `فائل درست ہے ✔ (${bk.r} ریکارڈ)`);
      // حفاظتی کاپی
      Prog.set(64, 'فون کے موجودہ ڈیٹا کی حفاظتی کاپی بنا رہا ہوں…');
      try{
        const snap = JSON.parse(JSON.stringify(buildBackupObject()));
        await snapPut({ at: new Date().toISOString(), from: f.name, counts: cur, data: snap });
        snapshotted = true;
      }catch(e){ console.warn('snapshot failed', e); }
      if(!snapshotted && !confirm('⚠️ فون کے پرانے ڈیٹا کی حفاظتی کاپی نہیں بن سکی۔\n\nپھر بھی ریسٹور کریں؟')){ throw mkErr('cancel', 'آپ نے ریسٹور روک دیا'); }
      Prog.set(72, snapshotted ? 'حفاظتی کاپی تیار ✔' : 'حفاظتی کاپی کے بغیر جاری');
      // اصل بحالی
      Prog.set(76, 'ڈیٹا بحال ہو رہا ہے…');
      await sleep(250);
      try{
        applyBackupObject(backup);
        const lv = liveCounts();
        if(lv.c !== bk.c || lv.s !== bk.s || lv.p !== bk.p || lv.i !== bk.i) throw new Error('بحالی کے بعد گنتی میل نہیں کھائی');
      }catch(e){
        if(snapshotted){ try{ const s = await snapGet(); if(s && s.data) applyBackupObject(s.data); }catch(_){} }
        throw mkErr('apply', 'بحالی میں خرابی — پرانا ڈیٹا واپس رکھ دیا گیا ہے (' + e.message + ')');
      }
      await Prog.reach(82, `👥 ${bk.c} کسٹمر بحال ✔`);
      await Prog.reach(87, `🚚 ${bk.s} بیوپاری بحال ✔`);
      await Prog.reach(92, `🥬 ${bk.p} آئٹم بحال ✔`);
      await Prog.reach(97, `🧾 ${bk.i} بل بحال ✔`);
      await Prog.finish('✅ ڈیٹا واپس آ گیا!', { keepMs: 1200 });
      Prog.hide();
      busy = false;
      showRestoreDone(f, bk);
    }catch(err){
      console.warn('restore failed', err);
      Prog.fail(err.code === 'cancel' ? 'ریسٹور روک دیا گیا' : 'ریسٹور نہیں ہو سکا');
      if(err.code !== 'cancel') setTimeout(() => alert('❌ ریسٹور نہیں ہو سکا\n\n' + (err.message || err)), 150);
    }finally{ busy = false; }
  }

  async function showRestoreDone(f, bk){
    let files = [];
    try{ const fid = await ensureGDriveBackupFolder(); files = await listBackups(fid); await fillMissingCounts(files); }catch(e){}
    const undo = `<button type="button" data-undo="1" style="${BTN} background:#fff7ed; color:#9a3412; border:1.5px solid #fb923c; margin-top:0; margin-bottom:8px;">↩️ ریسٹور واپس کریں (پرانا ڈیٹا لوٹائیں)</button>`;
    showList(files, { icon: '✅', title: 'ڈیٹا بحال ہو گیا!', mode: 'info', highlightId: f.id,
      sub: `<b dir="ltr">${esc(f.name)}</b> سے<br>${countsLine(bk)}<br><span style="color:#166534; font-weight:800;">ایپ کی تمام سکرینیں تازہ کر دی گئی ہیں</span>`,
      extra: undo, bind: [ov => { const b = ov.querySelector('[data-undo]'); if(b) b.onclick = () => { closeOv('smBkList'); smUndoRestore(); }; }] });
  }

  async function smUndoRestore(){
    const s = await snapGet();
    if(!s || !s.data){ alert('واپس کرنے کے لیے کوئی حفاظتی کاپی نہیں ملی'); return; }
    if(!confirm(`↩️ ریسٹور واپس کریں؟\n\nفون کا ڈیٹا اس وقت جیسا ہو جائے گا جب ریسٹور سے پہلے تھا:\n👥 ${s.counts.c} کسٹمر • 🚚 ${s.counts.s} بیوپاری • 🥬 ${s.counts.p} آئٹم • 🧾 ${s.counts.i} بل`)) return;
    if(busy) return; busy = true;
    try{
      Prog.start('↩️ پرانا ڈیٹا واپس آ رہا ہے', countsLine(s.counts), 'rs');
      await Prog.reach(40, 'بحال ہو رہا ہے…'); applyBackupObject(s.data);
      await Prog.finish('✅ پرانا ڈیٹا واپس آ گیا', { keepMs: 2500 });
    }catch(e){ Prog.fail('واپسی نہیں ہو سکی'); alert('❌ ' + e.message); }
    finally{ busy = false; }
  }

  // ---------------------------------------------------------------- خودکار: دن 12 اور رات 12
  // رات 12 کا سلاٹ = 00:00 سے 11:59 تک؛ دن 12 کا سلاٹ = 12:00 سے 23:59 تک — ایپ جب بھی کھلے، گزرا ہوا وقت پکڑ لیتی ہے
  function checkAuto(){
    try{
      if(busy || AppState.currentRole !== 'admin') return;
      if(AppState.settings && AppState.settings.smJoinedAsStaff) return;
      const today = localDay();
      let st = loadFromStorage(STATE_KEY, {});
      if(st.date !== today) st = Object.assign({}, st, { date: today, done: [] });
      const h = new Date().getHours();
      const due = [0, 12].filter(x => h >= x && !st.done.includes(x));
      if(!due.length) return;
      if(!savedEmail()){ state.needTap = true; try{ renderDriveBackupReminder(); }catch(e){} return; } // پہلی بار گوگل جوڑنا صارف کے ٹیپ سے
      if(!navigator.onLine) return;
      if(Date.now() - state.lastFail < 15 * 60 * 1000) return;
      smBackupNow({ auto: true }).then(ok => {
        if(ok){ const s2 = loadFromStorage(STATE_KEY, {}); s2.date = today; s2.done = Array.from(new Set((s2.done || []).concat(due))); saveToStorage(STATE_KEY, s2); }
      });
    }catch(e){ console.warn('auto check', e); }
  }
  setTimeout(checkAuto, 4000);
  setInterval(checkAuto, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) setTimeout(checkAuto, 1200); });
  window.addEventListener('online', () => setTimeout(checkAuto, 1500));

  // ---------------------------------------------------------------- ہوم پر یاد دہانی پٹی + آخری بیک اپ لائن
  window.renderDriveBackupReminder = function(){
    const home = document.getElementById('screen-home'); if(!home) return;
    let el = document.getElementById('driveBackupReminder');
    const last = AppState.settings.lastGDriveBackupAt ? new Date(AppState.settings.lastGDriveBackupAt).getTime() : 0;
    const stale = Date.now() - last > 24 * 3600 * 1000;
    const need = AppState.currentRole === 'admin' && !busy && (state.needTap || stale);
    if(!need){ if(el) el.remove(); return; }
    if(!el){ el = document.createElement('div'); el.id = 'driveBackupReminder'; home.insertBefore(el, home.firstChild); }
    const linked = !!savedEmail();
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    const msg = !linked ? '☁️ گوگل ڈرائیو ابھی جڑی نہیں — ایک بار جوڑ لیں' :
      state.needTap ? '⏰ بیک اپ کا وقت ہو گیا — ٹیپ کریں' :
      ('📂 گوگل ڈرائیو بیک اپ ' + (days === null ? 'ابھی تک نہیں ہوا' : (days === 0 ? 'آج نہیں ہوا' : days + ' دن سے نہیں ہوا')));
    el.innerHTML = `<div dir="rtl" style="margin:6px 0 10px; background:#fff7ed; border:2px solid #fb923c; border-radius:12px; padding:8px 10px; display:flex; align-items:center; gap:8px; justify-content:space-between;">
      <span style="font-weight:800; color:#9a3412; font-size:14px;">${msg}</span>
      <button type="button" onclick="backupToGoogleDrive(false)" style="border:none; border-radius:10px; background:#ea580c; color:#fff; font-weight:800; padding:7px 12px; cursor:pointer; font-family:inherit;">${linked ? 'ابھی لیں' : 'جوڑیں'}</button></div>`;
  };
  window.renderHomeLastBackupLine = function(){
    const el = document.getElementById('hbcLastBackupLine'); if(!el) return;
    const n = AppState.settings.lastBackupFileName, at = AppState.settings.lastGDriveBackupAt || AppState.settings.lastBackupAt;
    if(!n){ el.innerHTML = '⚠️ ابھی تک کوئی بیک اپ نہیں — ⚙️ سے بیک اپ لیں'; return; }
    el.innerHTML = `💾 آخری بیک اپ: <b dir="ltr">${esc(n)}</b>${at ? ' • ' + esc(fmtDate(at)) : ''}`;
  };

  // ---------------------------------------------------------------- پرانے نام نئے نظام سے جوڑ دیے (بٹن/پرانا کوڈ جوں کے توں کام کریں)
  window.backupToGoogleDrive = function(silent){ return smBackupNow({ auto: silent === true }); };
  window.restoreFromGoogleDrive = function(){ return smRestoreFlow(); };
  window.smListDriveBackups = async function(){
    if(busy) return; busy = true;
    try{
      Prog.start('📂 ڈرائیو کی فائلیں', '', 'bk'); Prog.set(30, 'رابطہ…');
      await getToken(true); const fid = await ensureGDriveBackupFolder(); const files = await listBackups(fid); await fillMissingCounts(files); Prog.hide();
      showList(files, { icon: '📂', title: 'ڈرائیو میں بیک اپ فائلیں', mode: 'info', sub: `ڈرائیو میں ${files.length} فائلیں (زیادہ سے زیادہ ${KEEP} رہتی ہیں)` });
    }catch(e){ Prog.fail('فہرست نہیں مل سکی'); }
    finally{ busy = false; }
  };
  window.smUndoLastRestore = smUndoRestore;

  // فون کا ڈیٹا براؤزر خود صاف نہ کرے — مستقل اسٹوریج کی درخواست
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
  window.__smBk = { Prog, countsOf, getToken, listBackups, smBackupNow, checkAuto, state, applyBackupObject, snapGet, KEEP };
})();
