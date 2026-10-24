/* =====================================================================
   📒 آڑھت بک — ایپ
   آڑھتی کا اپنا مال نہیں ہوتا: زمیندار کا مال آتا ہے، آڑھتی بولی سے خریداروں کو بیچتا ہے،
   زمیندار سے کمیشن/خرچے کاٹ کر صاف رقم دیتا ہے، اور خریدار سے مال کی رقم + اس کے خرچے لیتا ہے۔
   - ہر لفظ اردو میں؛ رقم پیسوں میں پوری گنتی (calc.js)
   - ڈیٹا: ab_settings, ab_charges, ab_parties, ab_parchis, ab_cash, ab_log, ab_locks (خود "AB::" میں)
   - ہر محفوظ کرنے پر IndexedDB میں حفاظتی کاپی؛ localStorage مٹ جائے تو ایپ کھلتے ہی واپس
   ===================================================================== */
(function(){
  'use strict';
  const APP_VERSION = 'AB2410SA009';
  const UPDATE_NOTE = 'کئی آلات کا ڈیٹا ایک: مالک کلاؤڈ چالو کرے، ملازم کوڈ سے جڑیں (آڑھت بک کا اپنا فائربیس)';
  const C = window.ABCalc;
  const { fmt, toPaisa, toGrams, int, calcParchi, lineAmount, KINDS, SIDES, TEMPLATES, rateText } = C;

  // =====================================================================
  //   ڈیٹا اور حفاظت
  // =====================================================================
  const KEYS = ['ab_settings', 'ab_charges', 'ab_parties', 'ab_parchis', 'ab_cash', 'ab_log', 'ab_locks'];
  const DB = { settings: {}, charges: null, parties: [], parchis: [], cash: [], log: [], locks: {} };
  function rd(k, d){ try{ const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; }catch(e){ return d; } }
  function loadAll(){
    DB.settings = rd('ab_settings', {}); DB.charges = rd('ab_charges', null); DB.parties = rd('ab_parties', []);
    DB.parchis = rd('ab_parchis', []); DB.cash = rd('ab_cash', []); DB.log = rd('ab_log', []); DB.locks = rd('ab_locks', {});
    Object.keys(DB.locks).forEach(d => { if(typeof DB.locks[d] !== 'object') DB.locks[d] = { on: !!DB.locks[d] }; }); // پرانی شکل
    SYNCED.forEach(n => { seen[n] = new Map(); recs(n).forEach(r => seen[n].set(r.__k, sig(r.v))); });
  }
  // ---------- 🔄 کئی فون / کمپیوٹر کا ڈیٹا ملانے کی تیاری: ہر ریکارڈ پر «کب بدلا (upd)، کس آلے سے (dev)» کی مہر ----------
  // کوئی بھی ریکارڈ بدلے تو put() خود مہر لگاتا ہے؛ کچھ بھی پکا حذف نہیں ہوتا (deleted نشان) تاکہ حذف بھی دوسرے آلات تک پہنچے
  const DEV = (function(){ let d = null; try{ d = localStorage.getItem('ab_device'); if(!d){ d = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem('ab_device', d); } }catch(e){ d = 'd0'; } return d; })();
  const SYNCED = ['settings', 'charges', 'parties', 'parchis', 'cash', 'locks'];
  const seen = {};
  function recs(n){
    const v = DB[n];
    if(Array.isArray(v)) return v.map(r => ({ __k: r.id, v: r }));
    if(n === 'locks') return Object.keys(v || {}).map(d => ({ __k: d, v: v[d] }));
    return v ? [{ __k: '_', v }] : [];
  }
  function sig(r){ const o = Object.assign({}, r); delete o.upd; delete o.dev; return JSON.stringify(o); }
  function stamp(n){
    if(!seen[n]) seen[n] = new Map();
    const now = Date.now();
    recs(n).forEach(x => { const g = sig(x.v); if(seen[n].get(x.__k) !== g){ x.v.upd = now; x.v.dev = DEV; seen[n].set(x.__k, g); } });
  }
  function put(name){
    if(SYNCED.includes(name)) stamp(name);
    const k = 'ab_' + name;
    try{ localStorage.setItem(k, JSON.stringify(DB[name])); }
    catch(e){ toast('⚠️ محفوظ نہیں ہو سکا — فون میں جگہ کم ہے، بیک اپ لے کر پرانا ریکارڈ ہٹائیں'); return false; }
    safeCopy();
    if(SYNCED.includes(name)){ try{ window.dispatchEvent(new Event('ab-data-changed')); }catch(e){} } // گوگل ڈرائیو کا خودکار بیک اپ
    return true;
  }
  // ---------- IndexedDB حفاظتی کاپی ----------
  const SAFE_DB = 'abSafe_v1';
  function idb(){ return new Promise((res, rej) => { const r = indexedDB.open(SAFE_DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  let safeT = null;
  function safeCopy(){
    clearTimeout(safeT);
    safeT = setTimeout(async () => {
      try{ const db = await idb(); const tx = db.transaction('kv', 'readwrite'); const s = tx.objectStore('kv');
        KEYS.forEach(k => { const v = localStorage.getItem(k); if(v != null) s.put(v, k); }); s.put(Date.now(), '__at'); }catch(e){}
    }, 400);
  }
  async function safeRestoreIfEmpty(){
    if(localStorage.getItem('ab_settings')) return false;
    try{
      const db = await idb();
      const vals = await new Promise(res => { const out = {}; const tx = db.transaction('kv', 'readonly'); const s = tx.objectStore('kv');
        KEYS.forEach(k => { const r = s.get(k); r.onsuccess = () => { if(r.result != null) out[k] = r.result; }; }); tx.oncomplete = () => res(out); tx.onerror = () => res(out); });
      if(!vals.ab_settings) return false;
      Object.keys(vals).forEach(k => localStorage.setItem(k, vals[k]));
      return true;
    }catch(e){ return false; }
  }
  try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}

  // ---------- تبدیلیوں کا ریکارڈ ----------
  function logIt(what, ref){
    DB.log.push({ at: Date.now(), what, ref: ref || '' });
    if(DB.log.length > 3000) DB.log = DB.log.slice(-3000);
    put('log');
  }

  // =====================================================================
  //   مددگار
  // =====================================================================
  const $ = id => document.getElementById(id);
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function today(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  const MONTHS = ['جنوری','فروری','مارچ','اپریل','مئی','جون','جولائی','اگست','ستمبر','اکتوبر','نومبر','دسمبر'];
  const DAYS = ['اتوار','پیر','منگل','بدھ','جمعرات','جمعہ','ہفتہ'];
  function urDate(iso, withDay){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if(!m) return iso || '';
    const s = (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1];
    return withDay ? DAYS[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] + '، ' + s : s;
  }
  function urTime(ms){ const d = new Date(ms); let h = d.getHours(); const am = h < 12; h = h % 12 || 12; return h + ':' + String(d.getMinutes()).padStart(2, '0') + (am ? ' صبح' : ' شام'); }
  function rs(p){ return '<span class="num">' + fmt(p) + '</span>'; }
  function inRs(p){ return p ? String(p / 100) : ''; }
  function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
  function modal(html){ $('modalBox').innerHTML = html; $('modal').classList.add('open'); }
  function closeModal(){ $('modal').classList.remove('open'); }
  function ask(msg, okText){
    return new Promise(res => {
      modal(`<h3>تصدیق</h3><div style="margin:6px 0 12px">${msg}</div><div class="row" style="justify-content:center">
        <button class="btn" id="mOk">${okText || 'جی ہاں'}</button><button class="btn gray" id="mNo">منسوخ</button></div>`);
      $('mOk').onclick = () => { closeModal(); res(true); }; $('mNo').onclick = () => { closeModal(); res(false); };
    });
  }
  function shopName(){ return (DB.settings.shop || '').trim() || 'آڑھت بک'; }
  function chargesAll(){ if(!DB.charges){ DB.charges = TEMPLATES.fruit.list().map(c => Object.assign({ id: uid() }, c)); put('charges'); } return DB.charges; }
  function chargesList(){ return chargesAll().filter(c => !c.deleted); }

  // =====================================================================
  //   کھاتے: زمیندار اور خریدار
  // =====================================================================
  const PT = { zamindar: 'زمیندار', buyer: 'خریدار' };
  function parties(type){ return DB.parties.filter(p => p.type === type && !p.deleted); }
  function party(id){ return DB.parties.find(p => p.id === id); }
  function findParty(type, name){ const n = String(name || '').trim(); return parties(type).find(p => p.name.trim() === n); }
  function ensureParty(type, name){
    const n = String(name || '').trim(); if(!n) return null;
    let p = findParty(type, n);
    if(!p){ p = { id: uid(), type, name: n, phone: '', place: '', opening: 0, createdAt: Date.now() }; DB.parties.push(p); put('parties'); logIt('نیا ' + PT[type] + ': ' + n, p.id); }
    return p;
  }
  function liveParchis(){ return DB.parchis.filter(p => !p.deleted); }
  function liveCash(){ return DB.cash.filter(c => !c.deleted); }
  // ---------- کھاتے کے اندراج (پرانے سے نئے)؛ مثبت = زمیندار کو دینے ہیں / خریدار سے لینے ہیں ----------
  function ledger(pid){
    const p = party(pid); if(!p) return { rows: [], bal: 0 };
    const rows = [];
    if(p.opening) rows.push({ date: '', at: p.createdAt || 0, text: 'پچھلا بقایا', amt: p.opening });
    liveParchis().forEach(x => {
      const r = calcParchi(x, x.chargesSnap || chargesList());
      if(p.type === 'zamindar' && x.zamindarId === pid) rows.push({ date: x.date, at: x.createdAt, text: 'پرچی نمبر ' + x.no + ' — صاف رقم (' + r.nag + ' نگ)', amt: r.net, parchi: x.id });
      if(p.type === 'buyer') r.buyers.filter(b => b.id === pid).forEach(b => rows.push({ date: x.date, at: x.createdAt, text: 'پرچی نمبر ' + x.no + ' — مال (' + b.nag + ' نگ، زمیندار ' + (x.zamindar || '') + ')', amt: b.total, parchi: x.id }));
    });
    liveCash().filter(c => c.partyId === pid).forEach(c => rows.push({ date: c.date, at: c.at, text: (c.kind === 'pay' ? 'ادائیگی' : 'وصولی') + (c.note ? ' — ' + c.note : ''), amt: -c.amount, cash: c.id }));
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.at - b.at);
    let bal = 0; rows.forEach(r => { bal += r.amt; r.bal = bal; });
    return { rows, bal };
  }
  function balText(type, bal){
    if(!bal) return 'حساب برابر';
    if(type === 'zamindar') return bal > 0 ? 'اسے دینے ہیں' : 'اس سے لینے ہیں';
    return bal > 0 ? 'اس سے لینے ہیں' : 'اسے دینے ہیں';
  }

  // =====================================================================
  //   دن کا تالا
  // =====================================================================
  function isLocked(date){ return !!(DB.locks[date] && DB.locks[date].on); }
  async function unlockFor(date){
    if(!isLocked(date)) return true;
    if(!DB.settings.pin){ toast('⚠️ یہ دن بند ہے — پہلے سیٹنگ میں مالک کا پن لگائیں'); return false; }
    const ok = await pinPrompt('یہ دن (' + urDate(date) + ') بند ہے۔ تبدیلی کے لیے مالک کا پن لکھیں');
    return ok;
  }
  function pinPrompt(msg){
    return new Promise(res => {
      modal(`<h3>🔒 مالک کا پن</h3><div class="muted">${esc(msg)}</div><div class="f" style="margin:10px 0"><input id="mPin" type="password" inputmode="numeric" maxlength="8" style="text-align:center;font-size:24px"></div>
        <div class="row" style="justify-content:center"><button class="btn" id="mOk">ٹھیک ہے</button><button class="btn gray" id="mNo">منسوخ</button></div>`);
      setTimeout(() => $('mPin') && $('mPin').focus(), 50);
      $('mOk').onclick = () => { const v = $('mPin').value; closeModal(); if(v === DB.settings.pin) res(true); else { toast('❌ پن غلط ہے'); res(false); } };
      $('mNo').onclick = () => { closeModal(); res(false); };
    });
  }

  // =====================================================================
  //   نیویگیشن
  // =====================================================================
  const NAV = [
    ['home', '🏠', 'ہوم'], ['parchi', '📝', 'نئی پرچی'], ['parchis', '📚', 'پرچیاں'],
    ['zamindar', '🧑‍🌾', 'زمیندار'], ['buyer', '🧑‍💼', 'خریدار'], ['cash', '💵', 'وصولی / ادائیگی'],
    ['roznamcha', '📖', 'روزنامچہ'], ['charges', '⚙️', 'خرچے اور کمیشن'], ['backup', '💾', 'بیک اپ'], ['settings', '🛠️', 'سیٹنگ']
  ];
  let screen = 'home', arg = null;
  function renderSide(){
    $('side').innerHTML = `<div class="brand">📒 آڑھت بک</div>` + NAV.map(n => `<button class="nav ${screen === n[0] ? 'on' : ''}" onclick="App.go('${n[0]}')"><span class="e">${n[1]}</span>${n[2]}</button>`).join('');
  }
  function go(s, a, fromPop){
    if(s === 'parchi' && a === undefined && cur && cur.no) cur = null; // محفوظ پرچی کے بعد نئی؛ ادھوری پرچی محفوظ رہے
    screen = s; arg = a == null ? null : a; menu(false);
    if(!fromPop){ try{ history.pushState({ s, a: arg }, ''); }catch(e){} }
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', e => { const st = e.state; if(st && st.s){ screen = st.s; arg = st.a; render(); } else { screen = 'home'; arg = null; render(); } });
  function menu(open){ $('side').classList.toggle('open', !!open); $('sideShade').classList.toggle('open', !!open); }
  function render(){
    renderSide();
    $('ttl').textContent = shopName();
    const v = $('view');
    if(!DB.settings.registered){ v.innerHTML = viewRegister(); return; }
    if(DB.settings.pin && !unlocked){ v.innerHTML = viewPinGate(); return; }
    const fn = VIEWS[screen] || VIEWS.home;
    v.innerHTML = fn(arg);
    if(AFTER[screen]) AFTER[screen](arg);
    if(window.AB_DRIVE) AB_DRIVE.render();
  }
  let unlocked = false;

  // =====================================================================
  //   رجسٹریشن اور تالا
  // =====================================================================
  // ---------- 🎨 رنگ کا تھیم (ہر آلے کا اپنا؛ سرخ بنیادی) ----------
  const THEMES = [['red', 'سرخ', '#b91c1c'], ['blue', 'نیلا', '#1d4ed8'], ['green', 'سبز', '#15803d'], ['black', 'کالا', '#171717'], ['gray', 'سلیٹی', '#475569'], ['white', 'سادہ سفید', '#f5f5f4']];
  function curTheme(){ try{ return localStorage.getItem('ab_theme') || 'red'; }catch(e){ return 'red'; } }
  function applyTheme(k){
    if(k === 'red') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', k);
    const t = THEMES.find(x => x[0] === k) || THEMES[0];
    const m = document.querySelector('meta[name=theme-color]'); if(m) m.setAttribute('content', k === 'white' ? '#ffffff' : t[2]);
  }
  function themePicker(){
    const c = curTheme();
    return `<div class="themes"><span class="tl">🎨 رنگ:</span>${THEMES.map(t => `<button class="${c === t[0] ? 'on' : ''}" style="background:${t[2]}" title="${t[1]}" aria-label="${t[1]}" onclick="App.setTheme('${t[0]}')"></button>`).join('')}</div>`;
  }
  function viewRegister(){
    return `<div class="gate">${themePicker()}
      <div class="gateForm"><div class="gt">🏪 اپنی آڑھت کی معلومات</div>
        <div class="gGrid">
          <div class="f"><label>آڑھت / دکان کا نام</label><input id="rShop" placeholder="مثلاً رحمان کمیشن شاپ"></div>
          <div class="f"><label>مالک کا نام</label><input id="rOwner" placeholder="مالک کا پورا نام"></div>
          <div class="f"><label>موبائل نمبر</label><input id="rPhone" inputmode="tel" placeholder="03001234567"></div>
          <div class="f"><label>منڈی کا پتہ</label><input id="rAddr" placeholder="مثلاً فروٹ منڈی، ملتان"></div>
          <div class="f" style="grid-column:1/-1"><label>آپ کی آڑھت کس منڈی کی ہے؟ (خرچوں کا تیار سانچہ)</label><select id="rTpl">${Object.keys(TEMPLATES).map(k => `<option value="${k}">${TEMPLATES[k].label}</option>`).join('')}</select></div>
        </div>
        <div class="gm">کمیشن اور خرچے بعد میں «خرچے اور کمیشن» میں اپنی مرضی سے بدل سکتے ہیں۔</div>
        <button class="btn gold wide" onclick="App.register()">✅ شروع کریں</button>
        ${window.AB_CLOUD ? '<button class="btn light wide" style="margin-top:8px" onclick="App.cloudJoinForm()">📲 ملازم ہیں یا دوسرا آلہ؟ پہلے سے موجود آڑھت سے جڑیں</button>' : ''}</div></div>`;
  }
  function register(){
    const shop = $('rShop').value.trim(), owner = $('rOwner').value.trim(), phone = $('rPhone').value.trim();
    if(!shop){ toast('⚠️ آڑھت کا نام لکھیں'); return; }
    DB.settings = Object.assign(DB.settings, { shop, owner, phone, address: $('rAddr').value.trim(), registered: true, createdAt: Date.now(), nextParchiNo: 1 });
    DB.charges = (DB.charges || []).map(c => Object.assign(c, { deleted: Date.now() })).concat(TEMPLATES[$('rTpl').value].list().map(c => Object.assign({ id: uid() }, c)));
    put('settings'); put('charges'); logIt('آڑھت رجسٹر: ' + shop);
    go('home'); toast('✅ خوش آمدید — آڑھت بک تیار ہے');
  }
  let pinBuf = '';
  function viewPinGate(){
    return `<div class="gate">${themePicker()}<div class="gt" style="text-align:center">🔒 پن لکھیں</div>
      <div class="card"><div class="pinDots">${[...Array(String(DB.settings.pin || '').length || 4).keys()].map(i => `<i class="${pinBuf.length > i ? 'f' : ''}"></i>`).join('')}</div>
      <div class="pinPad">${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k => `<button onclick="App.pinKey('${k}')">${k}</button>`).join('')}</div></div></div>`;
  }
  function pinKey(k){
    const pin = String(DB.settings.pin || '');
    if(k === '⌫') pinBuf = pinBuf.slice(0, -1);
    else if(k !== '✓' && pinBuf.length < 8) pinBuf += k;
    if(pinBuf.length >= pin.length || k === '✓'){
      if(pinBuf === pin){ unlocked = true; pinBuf = ''; render(); return; }
      if(pinBuf.length){ toast('❌ پن غلط ہے'); pinBuf = ''; }
    }
    render();
  }

  // =====================================================================
  //   ہوم
  // =====================================================================
  function totalsFor(date){
    let gross = 0, income = 0, nag = 0, n = 0;
    liveParchis().filter(p => !date || p.date === date).forEach(p => { const r = calcParchi(p, p.chargesSnap || chargesList()); gross += r.gross; income += r.income; nag += r.nag; n++; });
    return { gross, income, nag, n };
  }
  function balancesSum(type){ let s = 0; parties(type).forEach(p => { const b = ledger(p.id).bal; if(b > 0) s += b; }); return s; }
  const VIEWS = {};
  const AFTER = {};
  VIEWS.home = function(){
    const t = totalsFor(today());
    const tiles = [['parchis', '📚', 'پرچیاں'], ['zamindar', '🧑‍🌾', 'زمیندار'], ['buyer', '🧑‍💼', 'خریدار'], ['cash', '💵', 'وصولی / ادائیگی'], ['roznamcha', '📖', 'روزنامچہ'], ['charges', '⚙️', 'خرچے اور کمیشن'], ['backup', '💾', 'بیک اپ'], ['settings', '🛠️', 'سیٹنگ']];
    return `<div class="pageTitle">🏠 ${esc(urDate(today(), true))}</div>${backupBanner()}
      <div class="stats">
        <div class="stat"><div class="l">آج کی بکری (${t.n} پرچی، ${t.nag} نگ)</div><div class="n">${fmt(t.gross)}</div></div>
        <div class="stat g"><div class="l">آج کی کمائی</div><div class="n">${fmt(t.income)}</div></div>
        <div class="stat y"><div class="l">زمینداروں کو دینے ہیں</div><div class="n">${fmt(balancesSum('zamindar'))}</div></div>
        <div class="stat"><div class="l">خریداروں سے لینے ہیں</div><div class="n">${fmt(balancesSum('buyer'))}</div></div>
      </div>
      <div class="tiles"><button class="tile big" onclick="App.go('parchi')"><span class="e">📝</span>نئی پرچی (گاڑی کی آمد)</button>
        ${tiles.map(x => `<button class="tile" onclick="App.go('${x[0]}')"><span class="e">${x[1]}</span>${x[2]}</button>`).join('')}</div>`;
  };

  // =====================================================================
  //   نئی پرچی
  // =====================================================================
  let cur = null;
  function blankLine(){ return { item: '', nag: '', grams: '', rate: '', basis: 'nag', buyer: '' }; }
  function blankParchi(){ return { id: uid(), no: 0, date: today(), zamindar: '', zamindarId: '', place: '', vehicle: '', bilty: '', lines: [blankLine()], manual: {}, buyerManual: {}, note: '', createdAt: Date.now() }; }
  function itemNames(){ const s = new Set(); liveParchis().forEach(p => p.lines.forEach(l => l.item && s.add(l.item))); return [...s].slice(0, 300); }
  VIEWS.parchi = function(id){
    if(id && (!cur || cur.id !== id)){ const p = DB.parchis.find(x => x.id === id); if(p) cur = JSON.parse(JSON.stringify(p)); }
    if(!cur) cur = blankParchi();
    const p = cur, ch = cur.chargesSnap && cur.no ? cur.chargesSnap : chargesList();
    const manualCs = ch.filter(c => c.on && c.side === 'zamindar' && c.kind === 'manual');
    return `<div class="pageTitle">📝 ${p.no ? 'پرچی نمبر ' + p.no : 'نئی پرچی'} ${isLocked(p.date) ? '🔒' : ''}<span class="sp"></span>
        <button class="btn gold sm" onclick="App.newParchi()">🆕 نئی</button></div>
      <datalist id="dlZ">${parties('zamindar').map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
      <datalist id="dlB">${parties('buyer').map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
      <datalist id="dlI">${itemNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="parchiWrap"><div>
        <div class="card"><h3>🧑‍🌾 زمیندار اور گاڑی</h3>
          <div class="grid2 wideable">
            <div class="f"><label>تاریخ</label><input type="date" value="${esc(p.date)}" onchange="App.pset('date',this.value)"></div>
            <div class="f"><label>زمیندار کا نام</label><input list="dlZ" value="${esc(p.zamindar)}" placeholder="مثلاً حاجی اکرم" oninput="App.pset('zamindar',this.value)"></div>
            <div class="f"><label>گاؤں / شہر</label><input value="${esc(p.place)}" placeholder="مثلاً ساہیوال" oninput="App.pset('place',this.value)"></div>
            <div class="f"><label>گاڑی نمبر</label><input value="${esc(p.vehicle)}" placeholder="گاڑی کا نمبر" oninput="App.pset('vehicle',this.value)"></div>
            <div class="f"><label>بلٹی نمبر</label><input value="${esc(p.bilty)}" placeholder="بلٹی" oninput="App.pset('bilty',this.value)"></div>
            <div class="f"><label>نوٹ</label><input value="${esc(p.note)}" placeholder="اختیاری" oninput="App.pset('note',this.value)"></div>
          </div></div>
        <div class="card"><h3>🧺 بکری — کس خریدار کو، کتنے نگ، کس ریٹ پر</h3>
          <div id="lines">${p.lines.map((l, i) => lineHtml(l, i)).join('')}</div>
          <button class="btn light" onclick="App.addLine()">➕ نئی بکری</button></div>
        ${manualCs.length ? `<div class="card"><h3>✍️ اس پرچی کے خرچے</h3><div class="grid2 wideable">${manualCs.map(c => `
          <div class="f"><label>${esc(c.name)} (روپے)</label><input inputmode="decimal" value="${p.manual[c.id] != null ? esc(inRs(p.manual[c.id])) : ''}" placeholder="${esc(inRs(c.rate) || '0')}" oninput="App.pman('${c.id}',this.value)"></div>`).join('')}</div></div>` : ''}
      </div>
      <div class="sticky"><div id="result"></div>
        <div class="row"><button class="btn" onclick="App.saveParchi()">💾 پرچی محفوظ کریں</button>
          <button class="btn light" onclick="App.printParchi()">🖨️ زمیندار کی پرچی</button>
          <button class="btn light" onclick="App.printBuyers()">🖨️ خریداروں کے بل</button></div>
      </div></div>`;
  };
  AFTER.parchi = function(){ renderResult(); };
  AFTER.settings = function(){ if(window.AB_CLOUD){ AB_CLOUD.render(); if(AB_CLOUD.on() && AB_CLOUD.role() === 'owner') loadMembers(); } };
  function cloudCard(){
    const C = window.AB_CLOUD;
    if(!C) return '';
    if(!C.on()) return `<div class="card"><h3>☁️ کئی آلات — لیپ ٹاپ اور ملازمین کے موبائل</h3>
      <div class="muted">کلاؤڈ چالو کرنے سے آپ کے سب آلات (لیپ ٹاپ، موبائل، ملازمین کے فون) کا ریکارڈ ایک ہو جائے گا۔ ہر آلہ انٹرنیٹ کے بغیر بھی کام کرتا رہے گا، نیٹ آتے ہی سب مل جائیں گے۔</div>
      <div class="row" style="margin-top:8px"><button class="btn gold" onclick="App.cloudEnable()">👑 میں مالک ہوں — کلاؤڈ چالو کریں</button>
      <button class="btn light" onclick="App.cloudJoinForm()">📲 میں ملازم ہوں — آڑھت سے جڑیں</button></div></div>`;
    const owner = C.role() === 'owner';
    return `<div class="card"><h3>☁️ کئی آلات — کلاؤڈ</h3><div id="cloudStatus" class="dstatus"></div>
      ${owner ? `<div class="muted">ملازم یا اپنے دوسرے آلے کو جوڑنے کے لیے یہ کوڈ دیں۔ وہ اپنی آڑھت بک میں «آڑھت سے جڑیں» دبا کر یہی کوڈ لکھے:</div>
        <div class="joinCode num">${esc(C.code())}</div>
        <div class="row"><button class="btn light sm" onclick="App.cloudCopy()">📋 کوڈ کاپی کریں</button><button class="btn light sm" onclick="App.cloudShare()">💬 واٹس ایپ پر بھیجیں</button>
        <button class="btn sm" onclick="AB_CLOUD.sync(true)">🔄 ابھی ملائیں</button></div>
        <h3 style="margin-top:10px">📱 جڑے ہوئے آلات</h3><div id="cloudMembers" class="list"><div class="muted">…</div></div>`
      : `<div class="muted">یہ آلہ آڑھت سے ملازم کے طور پر جڑا ہے۔</div><div class="row" style="margin-top:6px"><button class="btn sm" onclick="AB_CLOUD.sync(true)">🔄 ابھی ملائیں</button></div>`}</div>`;
  }
  async function loadMembers(){
    const box = $('cloudMembers'); if(!box) return;
    try{
      const ms = await AB_CLOUD.members();
      box.innerHTML = ms.map(m => `<div class="it" style="cursor:default"><div>${m.role === 'owner' ? '👑' : '📱'} ${esc(m.name || '')} <span class="muted">${m.uid === AB_CLOUD.uid() ? '(یہ آلہ)' : ''}</span></div>
        ${m.role !== 'owner' ? `<button class="btn gray sm" onclick="App.cloudRemove('${m.uid}','${esc(m.name || '')}')">ہٹائیں</button>` : ''}</div>`).join('') || '<div class="muted">کوئی نہیں</div>';
    }catch(e){ box.innerHTML = '<div class="muted">فہرست نہیں آ سکی — انٹرنیٹ دیکھیں</div>'; }
  }
  function cloudJoinForm(){
    modal(`<h3>📲 آڑھت سے جڑیں</h3><div style="text-align:right">
      <div class="muted">مالک کے آلے میں سیٹنگ ← «کئی آلات» میں جوڑنے کا کوڈ لکھا ہے، وہی یہاں لکھیں۔</div>
      <div class="f"><label>جوڑنے کا کوڈ</label><input id="cjCode" dir="ltr" style="text-align:center;font-family:Tahoma,Arial" placeholder="AB…-12345678"></div>
      <div class="f"><label>اپنا نام</label><input id="cjName" placeholder="مثلاً منشی اسلم"></div></div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="cjOk">✅ جڑیں</button><button class="btn gray" onclick="App.closeModal()">منسوخ</button></div>`);
    $('cjOk').onclick = async () => {
      const code = $('cjCode').value, name = $('cjName').value.trim();
      if(!AB_CLOUD.parseCode(code)){ toast('⚠️ کوڈ درست نہیں'); return; }
      if(DB.settings.registered && liveParchis().length && !(await ask('اس آلے کا موجودہ ریکارڈ بھی آڑھت کے کلاؤڈ میں مل جائے گا۔ جاری رکھیں؟'))) return;
      closeModal();
      const wasRegistered = !!DB.settings.registered; // نیا آلہ ہو تو جڑنے کے بعد سیدھا ہوم
      if(await AB_CLOUD.join(code, name)){ unlocked = true; logIt('آڑھت سے جڑا: ' + (name || 'ملازم')); go(wasRegistered ? 'settings' : 'home'); }
    };
  }
  AFTER.backup = function(){ if(window.AB_DRIVE) AB_DRIVE.render(); };
  function lineHtml(l, i){
    return `<div class="line"><span class="no">${i + 1}</span><div class="lineGrid">
        <div class="f"><label>جنس</label><input list="dlI" value="${esc(l.item)}" placeholder="مثلاً آم" oninput="App.lset(${i},'item',this.value)"></div>
        <div class="f"><label>نگ</label><input inputmode="numeric" value="${esc(l.nag)}" placeholder="0" oninput="App.lset(${i},'nag',this.value)"></div>
        <div class="f"><label>وزن (کلو)</label><input inputmode="decimal" value="${l.grams ? esc(l.grams / 1000) : ''}" placeholder="اختیاری" oninput="App.lset(${i},'grams',this.value)"></div>
        <div class="f"><label>ریٹ (روپے)</label><input inputmode="decimal" value="${l.rate ? esc(l.rate / 100) : ''}" placeholder="0" oninput="App.lset(${i},'rate',this.value)"></div>
        <div class="f"><label>ریٹ کس پر</label><select onchange="App.lset(${i},'basis',this.value)"><option value="nag" ${l.basis !== 'maund' ? 'selected' : ''}>فی نگ</option><option value="maund" ${l.basis === 'maund' ? 'selected' : ''}>فی من</option></select></div>
        <div class="f"><label>خریدار</label><input list="dlB" value="${esc(l.buyer)}" placeholder="خریدار کا نام" oninput="App.lset(${i},'buyer',this.value)"></div>
      </div><div class="row" style="justify-content:space-between;margin-top:4px"><span class="lineAmt" id="la${i}"></span>
        ${cur.lines.length > 1 ? `<button class="btn gray sm" onclick="App.delLine(${i})">🗑️ ہٹائیں</button>` : ''}</div></div>`;
  }
  function parchiCharges(){ return cur.chargesSnap && cur.no ? cur.chargesSnap : chargesList(); }
  function resultHtml(r, p, forPrint){
    const tag = x => forPrint ? '' : `<span class="tag ${x.income ? 'in' : 'out'}">${x.income ? 'آمدن' : 'آگے ادا'}</span>`;
    let h = `<div class="card"><h3>🧾 زمیندار کی پرچی</h3>
      <div class="muted">${esc(p.zamindar || 'زمیندار کا نام لکھیں')} ${p.place ? '— ' + esc(p.place) : ''} ${p.vehicle ? '— گاڑی ' + esc(p.vehicle) : ''}</div>
      <table class="t"><tr><th>کل بکری (${r.nag} نگ)</th><th class="v">${fmt(r.gross)}</th></tr>
      ${r.zCharges.map(x => `<tr><td>➖ ${esc(x.name)} ${tag(x)}</td><td class="v">${fmt(x.amount)}</td></tr>`).join('')}
      <tr class="tot"><td>کل کٹوتی</td><td class="v">${fmt(r.zTotal)}</td></tr>
      <tr class="net"><td>زمیندار کو صاف رقم</td><td class="v">${fmt(r.net)}</td></tr></table></div>`;
    h += `<div class="card"><h3>🧑‍💼 خریداروں کا حساب</h3>${r.buyers.length ? r.buyers.map(b => `
      <table class="t" style="margin-bottom:8px"><tr><th>${esc(b.name)} (${b.nag} نگ) — مال</th><th class="v">${fmt(b.goods)}</th></tr>
      ${b.charges.map(x => `<tr><td>➕ ${esc(x.name)} ${tag(x)}</td><td class="v">${fmt(x.amount)}</td></tr>`).join('')}
      <tr class="tot"><td>${esc(b.name)} سے لینے ہیں</td><td class="v">${fmt(b.total)}</td></tr></table>`).join('') : '<div class="muted">ابھی کوئی بکری نہیں</div>'}</div>`;
    if(!forPrint) h += `<div class="card"><table class="t"><tr class="tot"><td>💰 آڑھتی کی کمائی (اس پرچی سے)</td><td class="v">${fmt(r.income)}</td></tr></table>
      ${r.check ? '' : '<div class="warn">⚠️ حساب کا جوڑ نہیں مل رہا — اندراج دوبارہ دیکھیں</div>'}</div>`;
    return h;
  }
  function renderResult(){
    const r = calcParchi(cur, parchiCharges());
    const el = $('result'); if(el) el.innerHTML = resultHtml(r, cur, false);
    cur.lines.forEach((l, i) => { const a = $('la' + i); if(a) a.innerHTML = 'رقم: ' + rs(lineAmount(l)) + ' روپے'; });
  }
  async function saveParchi(){
    const r = calcParchi(cur, parchiCharges());
    if(!String(cur.zamindar || '').trim()){ toast('⚠️ زمیندار کا نام لکھیں'); return; }
    if(!r.lines.length){ toast('⚠️ کم از کم ایک بکری لکھیں'); return; }
    if(r.lines.some(l => !String(l.buyer || '').trim())){ toast('⚠️ ہر بکری میں خریدار کا نام لکھیں'); return; }
    if(r.lines.some(l => !int(l.rate))){ toast('⚠️ ہر بکری کا ریٹ لکھیں'); return; }
    if(r.lines.some(l => l.basis === 'maund' && !int(l.grams))){ toast('⚠️ فی من ریٹ والی بکری کا وزن لکھیں'); return; }
    if(!r.check){ toast('⚠️ حساب کا جوڑ نہیں مل رہا'); return; }
    const old = DB.parchis.find(p => p.id === cur.id);
    if(old && !(await unlockFor(old.date))) return;
    if(!(await unlockFor(cur.date))) return;
    // کھاتے جوڑیں (نیا نام ہو تو نیا کھاتہ)
    const z = ensureParty('zamindar', cur.zamindar); cur.zamindarId = z.id; cur.zamindar = z.name;
    if(!z.place && cur.place){ z.place = cur.place; put('parties'); }
    cur.lines.forEach(l => { if(String(l.buyer || '').trim()){ const b = ensureParty('buyer', l.buyer); l.buyerId = b.id; l.buyer = b.name; } });
    const snap = JSON.parse(JSON.stringify(cur));
    if(!snap.chargesSnap || !old) snap.chargesSnap = JSON.parse(JSON.stringify(chargesList().filter(c => c.on)));
    const r2 = calcParchi(snap, snap.chargesSnap);
    snap.totals = { gross: r2.gross, net: r2.net, income: r2.income };
    snap.savedAt = Date.now();
    if(old){
      snap.history = (old.history || []).concat([{ at: Date.now(), gross: old.totals && old.totals.gross, net: old.totals && old.totals.net }]);
      DB.parchis[DB.parchis.indexOf(old)] = snap;
      logIt('پرچی ' + snap.no + ' بدلی: صاف رقم ' + fmt(old.totals ? old.totals.net : 0) + ' ← ' + fmt(snap.totals.net), snap.id);
    } else {
      // نمبر: سب آلات سے آئی پرچیوں میں سب سے بڑا + 1 (کلاؤڈ میں دوسرے آلے کی پرچی کے نمبر سے نہ ٹکرائے)
      snap.no = Math.max(DB.settings.nextParchiNo || 1, DB.parchis.reduce((m, p) => Math.max(m, p.no || 0), 0) + 1); DB.settings.nextParchiNo = snap.no + 1; put('settings');
      DB.parchis.push(snap);
      logIt('نئی پرچی ' + snap.no + ': ' + snap.zamindar + ' — بکری ' + fmt(snap.totals.gross), snap.id);
    }
    if(put('parchis')){ cur = JSON.parse(JSON.stringify(snap)); toast('✅ پرچی نمبر ' + snap.no + ' محفوظ — کھاتوں میں درج'); render(); }
  }

  // ---------- پرنٹ ----------
  function printDoc(title, body){
    const w = window.open('', '_blank'); if(!w){ toast('⚠️ پرنٹ والا صفحہ نہیں کھل سکا'); return; }
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    w.document.write(`<!DOCTYPE html><html lang="ur" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><base href="${esc(location.href.replace(/[^/]*$/, ''))}">
      <style>${css} body{background:#fff !important; margin:8mm; font-size:16px;} .card{box-shadow:none; border:1px solid #999; break-inside:avoid;} .t tr.net td{background:#eee; color:#000;}
      .ph{text-align:center; border-bottom:3px double #7f1d1d; margin-bottom:8px;} .ph h1{font-family:'NooriKasheeda',serif; font-weight:normal; margin:0; font-size:32px; color:#7f1d1d;} .ph div{font-size:15px;}</style></head>
      <body><div class="ph"><h1>${esc(shopName())}</h1><div>${esc(DB.settings.address || '')} ${DB.settings.phone ? '• فون ' + esc(DB.settings.phone) : ''}</div></div>${body}
      <div class="muted" style="text-align:center;margin-top:10px">آڑھت بک سے بنی پرچی • ${esc(urDate(today()))}</div><script>setTimeout(function(){print()},600)<\/script></body></html>`);
    w.document.close();
  }
  function parchiHead(p){ return `<div style="text-align:center;margin-bottom:6px">${p.no ? 'پرچی نمبر <b class="num">' + p.no + '</b> • ' : ''}تاریخ: ${esc(urDate(p.date))}<br>زمیندار: <b>${esc(p.zamindar)}</b> ${p.place ? '— ' + esc(p.place) : ''} ${p.vehicle ? '• گاڑی: ' + esc(p.vehicle) : ''} ${p.bilty ? '• بلٹی: ' + esc(p.bilty) : ''}</div>`; }
  function printParchi(){
    const r = calcParchi(cur, parchiCharges());
    printDoc('زمیندار کی پرچی', parchiHead(cur) + `<div class="card"><table class="t"><tr><th>جنس</th><th>خریدار</th><th class="v">نگ</th><th class="v">ریٹ</th><th class="v">رقم</th></tr>
      ${r.lines.map(l => `<tr><td>${esc(l.item)}</td><td>${esc(l.buyer)}</td><td class="v">${esc(l.nag)}</td><td class="v">${fmt(int(l.rate))}${l.basis === 'maund' ? ' / من' : ''}</td><td class="v">${fmt(lineAmount(l))}</td></tr>`).join('')}</table></div>` + resultHtml(r, cur, true).split('<div class="card"><h3>🧑‍💼')[0]);
  }
  function printBuyers(){
    const r = calcParchi(cur, parchiCharges());
    printDoc('خریداروں کے بل', r.buyers.map(b => `<div class="card">${parchiHead(cur)}<h3>خریدار: ${esc(b.name)}</h3><table class="t"><tr><th>جنس</th><th class="v">نگ</th><th class="v">ریٹ</th><th class="v">رقم</th></tr>
      ${r.lines.filter(l => (l.buyerId && l.buyerId === b.id) || (!l.buyerId && String(l.buyer).trim() === b.name)).map(l => `<tr><td>${esc(l.item)}</td><td class="v">${esc(l.nag)}</td><td class="v">${fmt(int(l.rate))}</td><td class="v">${fmt(lineAmount(l))}</td></tr>`).join('')}
      <tr><td colspan="3">مال کی رقم</td><td class="v">${fmt(b.goods)}</td></tr>
      ${b.charges.map(x => `<tr><td colspan="3">➕ ${esc(x.name)}</td><td class="v">${fmt(x.amount)}</td></tr>`).join('')}
      <tr class="net"><td colspan="3">کل رقم</td><td class="v">${fmt(b.total)}</td></tr></table></div>`).join('<div style="page-break-after:always"></div>'));
  }

  // =====================================================================
  //   پرچیاں
  // =====================================================================
  let listDate = '';
  VIEWS.parchis = function(){
    const live = liveParchis().filter(p => !listDate || p.date === listDate).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.no - a.no);
    const bin = DB.parchis.filter(p => p.deleted);
    let g = 0, inc = 0;
    const rows = live.map(p => { const t = p.totals || {}; g += t.gross || 0; inc += t.income || 0;
      return `<div class="it" onclick="App.go('parchi','${p.id}')"><div><b>نمبر <span class="num">${p.no}</span> — ${esc(p.zamindar)}</b> ${isLocked(p.date) ? '🔒' : ''}
        <div class="muted">${esc(urDate(p.date))} ${p.vehicle ? '• گاڑی ' + esc(p.vehicle) : ''} • بکری ${rs(t.gross || 0)} • صاف ${rs(t.net || 0)}</div></div>
        <button class="btn gray sm" onclick="event.stopPropagation();App.delParchi('${p.id}')">🗑️</button></div>`; }).join('');
    return `<div class="pageTitle">📚 پرچیاں<span class="sp"></span><button class="btn gold sm" onclick="App.go('parchi')">📝 نئی پرچی</button></div>
      <div class="card"><div class="row"><div class="f" style="flex:1;min-width:160px"><label>تاریخ سے چنیں (خالی = سب)</label><input type="date" value="${esc(listDate)}" onchange="App.setListDate(this.value)"></div>
        ${listDate ? '<button class="btn gray sm" onclick="App.setListDate(\'\')">سب دکھائیں</button>' : ''}</div>
        <table class="t" style="margin-top:6px"><tr><td>پرچیاں</td><td class="v">${live.length}</td></tr><tr><td>کل بکری</td><td class="v">${fmt(g)}</td></tr><tr class="tot"><td>آڑھتی کی کمائی</td><td class="v">${fmt(inc)}</td></tr></table></div>
      <div class="card"><div class="list">${rows || '<div class="muted">کوئی پرچی نہیں</div>'}</div></div>
      ${bin.length ? `<div class="card"><h3>🗑️ ردی کی ٹوکری (${bin.length})</h3><div class="list">${bin.map(p => `<div class="it"><div>نمبر <span class="num">${p.no}</span> — ${esc(p.zamindar)} <span class="muted">${esc(urDate(p.date))}</span></div>
        <button class="btn light sm" onclick="App.restoreParchi('${p.id}')">↩️ واپس لائیں</button></div>`).join('')}</div></div>` : ''}`;
  };
  async function delParchi(id){
    const p = DB.parchis.find(x => x.id === id); if(!p) return;
    if(!(await unlockFor(p.date))) return;
    if(!(await ask('پرچی نمبر ' + p.no + ' (' + esc(p.zamindar) + ') ردی کی ٹوکری میں چلی جائے گی اور کھاتوں سے نکل جائے گی۔ بعد میں واپس لائی جا سکتی ہے۔'))) return;
    p.deleted = Date.now(); put('parchis'); logIt('پرچی ' + p.no + ' ردی میں', p.id); render(); toast('🗑️ ردی کی ٹوکری میں');
  }
  function restoreParchi(id){ const p = DB.parchis.find(x => x.id === id); if(!p) return; delete p.deleted; put('parchis'); logIt('پرچی ' + p.no + ' واپس', p.id); render(); toast('✅ پرچی واپس آ گئی'); }

  // =====================================================================
  //   زمیندار / خریدار
  // =====================================================================
  let partySearch = '';
  function viewParties(type){
    const list = parties(type).filter(p => !partySearch || p.name.includes(partySearch) || (p.phone || '').includes(partySearch))
      .map(p => ({ p, bal: ledger(p.id).bal })).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));
    const sum = list.reduce((s, x) => s + (x.bal > 0 ? x.bal : 0), 0);
    return `<div class="pageTitle">${type === 'zamindar' ? '🧑‍🌾 زمیندار' : '🧑‍💼 خریدار'} (${parties(type).length})<span class="sp"></span><button class="btn gold sm" onclick="App.partyForm('${type}')">➕ نیا ${PT[type]}</button></div>
      <div class="card"><div class="f"><input placeholder="🔍 نام یا فون سے تلاش" value="${esc(partySearch)}" oninput="App.psearch(this.value,'${type}')"></div>
        <table class="t" style="margin-top:6px"><tr class="tot"><td>${type === 'zamindar' ? 'کل جو زمینداروں کو دینے ہیں' : 'کل جو خریداروں سے لینے ہیں'}</td><td class="v">${fmt(sum)}</td></tr></table></div>
      <div class="card"><div class="list" id="plist">${list.map(x => `<div class="it" onclick="App.go('party','${x.p.id}')"><div><b>${esc(x.p.name)}</b> <span class="muted">${esc(x.p.place || '')} ${esc(x.p.phone || '')}</span>
        <div class="muted">${balText(type, x.bal)}</div></div><div class="a ${x.bal > 0 ? (type === 'zamindar' ? 'amt-out' : 'amt-in') : ''}">${fmt(Math.abs(x.bal))}</div></div>`).join('') || '<div class="muted">کوئی کھاتہ نہیں — پرچی محفوظ کرنے پر خود بن جاتا ہے</div>'}</div></div>`;
  }
  VIEWS.zamindar = () => viewParties('zamindar');
  VIEWS.buyer = () => viewParties('buyer');
  VIEWS.party = function(id){
    const p = party(id); if(!p) return '<div class="card">کھاتہ نہیں ملا</div>';
    const L = ledger(id);
    return `<div class="pageTitle">${p.type === 'zamindar' ? '🧑‍🌾' : '🧑‍💼'} ${esc(p.name)}<span class="sp"></span>
        <button class="btn gold sm" onclick="App.go('cash','${p.type === 'zamindar' ? 'pay' : 'receive'}:${p.id}')">${p.type === 'zamindar' ? '💸 ادائیگی' : '💵 وصولی'}</button>
        <button class="btn light sm" onclick="App.printLedger('${p.id}')">🖨️</button>
        <button class="btn light sm" onclick="App.partyForm('${p.type}','${p.id}')">✏️</button></div>
      <div class="card"><div class="muted">${PT[p.type]} ${p.place ? '• ' + esc(p.place) : ''} ${p.phone ? '• فون ' + esc(p.phone) : ''}</div>
        <table class="t"><tr class="net"><td>${balText(p.type, L.bal)}</td><td class="v">${fmt(Math.abs(L.bal))}</td></tr></table></div>
      <div class="card"><h3>📖 کھاتہ</h3><div class="tblWrap">${ledgerTable(p, L)}</div></div>`;
  };
  function ledgerTable(p, L){
    const z = p.type === 'zamindar';
    return `<table class="t"><tr><th>تاریخ</th><th>تفصیل</th><th class="v">${z ? 'جمع' : 'نام'}</th><th class="v">${z ? 'ادا' : 'وصول'}</th><th class="v">بقایا</th></tr>
      ${L.rows.map(r => `<tr ${r.parchi ? `onclick="App.go('parchi','${r.parchi}')" style="cursor:pointer"` : ''}><td>${esc(urDate(r.date))}</td><td>${esc(r.text)}</td>
        <td class="v">${r.amt > 0 ? fmt(r.amt) : ''}</td><td class="v">${r.amt < 0 ? fmt(-r.amt) : ''}</td><td class="v">${fmt(r.bal)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">ابھی کوئی اندراج نہیں</td></tr>'}</table>`;
  }
  function printLedger(id){
    const p = party(id); const L = ledger(id);
    printDoc('کھاتہ — ' + p.name, `<h3 style="text-align:center">${PT[p.type]} کا کھاتہ: ${esc(p.name)} ${p.place ? '— ' + esc(p.place) : ''}</h3>${ledgerTable(p, L)}
      <table class="t" style="margin-top:8px"><tr class="net"><td>${balText(p.type, L.bal)}</td><td class="v">${fmt(Math.abs(L.bal))}</td></tr></table>`);
  }
  function partyForm(type, id){
    const p = id ? party(id) : { name: '', phone: '', place: '', opening: 0 };
    modal(`<h3>${id ? 'کھاتہ بدلیں' : 'نیا ' + PT[type]}</h3><div style="text-align:right">
      <div class="f"><label>نام</label><input id="pfN" value="${esc(p.name)}"></div>
      <div class="f"><label>فون</label><input id="pfP" inputmode="tel" value="${esc(p.phone)}"></div>
      <div class="f"><label>گاؤں / شہر</label><input id="pfL" value="${esc(p.place)}"></div>
      <div class="f"><label>پچھلا بقایا (روپے) — ${type === 'zamindar' ? 'جو ہم نے اسے دینے ہیں' : 'جو اس سے لینے ہیں'}</label><input id="pfO" inputmode="decimal" value="${esc(inRs(p.opening))}" placeholder="0"></div></div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" onclick="App.saveParty('${type}','${id || ''}')">💾 محفوظ</button><button class="btn gray" onclick="App.closeModal()">منسوخ</button></div>`);
  }
  function saveParty(type, id){
    const name = $('pfN').value.trim(); if(!name){ toast('⚠️ نام لکھیں'); return; }
    const dup = findParty(type, name); if(dup && dup.id !== id){ toast('⚠️ اس نام کا ' + PT[type] + ' پہلے سے موجود ہے'); return; }
    let p = id ? party(id) : null;
    if(!p){ p = { id: uid(), type, createdAt: Date.now() }; DB.parties.push(p); }
    const oldName = p.name;
    Object.assign(p, { name, phone: $('pfP').value.trim(), place: $('pfL').value.trim(), opening: toPaisa($('pfO').value) });
    if(oldName && oldName !== name){ DB.parchis.forEach(x => { if(x.zamindarId === p.id) x.zamindar = name; x.lines.forEach(l => { if(l.buyerId === p.id) l.buyer = name; }); }); put('parchis'); }
    put('parties'); logIt((id ? 'کھاتہ بدلا: ' : 'نیا کھاتہ: ') + name, p.id); closeModal(); render(); toast('✅ محفوظ');
  }

  // =====================================================================
  //   وصولی / ادائیگی
  // =====================================================================
  VIEWS.cash = function(a){
    const [kind0, pid] = String(a || 'receive:').split(':');
    const kind = kind0 === 'pay' ? 'pay' : 'receive';
    const type = kind === 'pay' ? 'zamindar' : 'buyer';
    const pp = pid ? party(pid) : null;
    const recent = liveCash().slice().sort((x, y) => y.at - x.at).slice(0, 30);
    return `<div class="pageTitle">💵 وصولی / ادائیگی</div>
      <div class="card"><div class="seg"><button class="${kind === 'receive' ? 'on' : ''}" onclick="App.go('cash','receive:')">💵 خریدار سے وصولی</button><button class="${kind === 'pay' ? 'on' : ''}" onclick="App.go('cash','pay:')">💸 زمیندار کو ادائیگی</button></div>
        <datalist id="dlP">${parties(type).map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
        <div class="grid2 wideable">
          <div class="f"><label>${PT[type]}</label><input id="cP" list="dlP" value="${esc(pp ? pp.name : '')}" placeholder="${PT[type]} کا نام" oninput="App.cashHint('${type}')"></div>
          <div class="f"><label>رقم (روپے)</label><input id="cA" inputmode="decimal" placeholder="0"></div>
          <div class="f"><label>تاریخ</label><input id="cD" type="date" value="${today()}"></div>
          <div class="f"><label>طریقہ</label><select id="cM"><option>نقد</option><option>بینک</option><option>چیک</option><option>موبائل والٹ</option></select></div>
          <div class="f" style="grid-column:1/-1"><label>نوٹ</label><input id="cN" placeholder="اختیاری"></div>
        </div><div id="cHint" class="muted" style="margin:6px 0"></div>
        <button class="btn wide" onclick="App.saveCash('${kind}')">💾 ${kind === 'pay' ? 'ادائیگی' : 'وصولی'} محفوظ کریں</button></div>
      <div class="card"><h3>🕘 حالیہ اندراج</h3><div class="list">${recent.map(c => { const p = party(c.partyId);
        return `<div class="it"><div>${c.kind === 'pay' ? '💸 ادائیگی' : '💵 وصولی'} — <b>${esc(p ? p.name : '')}</b> <span class="muted">${esc(urDate(c.date))} • ${esc(c.method || '')} ${c.note ? '• ' + esc(c.note) : ''}</span></div>
          <div class="row"><span class="a ${c.kind === 'pay' ? 'amt-out' : 'amt-in'}">${fmt(c.amount)}</span><button class="btn gray sm" onclick="App.delCash('${c.id}')">🗑️</button></div></div>`; }).join('') || '<div class="muted">کوئی اندراج نہیں</div>'}</div></div>`;
  };
  AFTER.cash = function(){ const t = String(arg || '').startsWith('pay') ? 'zamindar' : 'buyer'; cashHint(t); };
  function cashHint(type){ const el = $('cHint'); if(!el) return; const p = findParty(type, $('cP').value); el.innerHTML = p ? (balText(type, ledger(p.id).bal) + ': ' + rs(Math.abs(ledger(p.id).bal)) + ' روپے') : ''; }
  async function saveCash(kind){
    const type = kind === 'pay' ? 'zamindar' : 'buyer';
    const name = $('cP').value.trim(), amount = toPaisa($('cA').value), date = $('cD').value || today();
    if(!name){ toast('⚠️ ' + PT[type] + ' کا نام لکھیں'); return; }
    if(amount <= 0){ toast('⚠️ رقم لکھیں'); return; }
    if(!(await unlockFor(date))) return;
    let p = findParty(type, name);
    if(!p){ if(!(await ask('«' + esc(name) + '» نام کا کوئی ' + PT[type] + ' نہیں۔ نیا کھاتہ بنا دیں؟', 'نیا کھاتہ بنائیں'))) return; p = ensureParty(type, name); }
    const c = { id: uid(), kind, partyId: p.id, amount, date, method: $('cM').value, note: $('cN').value.trim(), at: Date.now() };
    DB.cash.push(c); put('cash'); logIt((kind === 'pay' ? 'ادائیگی ' : 'وصولی ') + p.name + ': ' + fmt(amount), c.id);
    toast('✅ ' + (kind === 'pay' ? 'ادائیگی' : 'وصولی') + ' محفوظ — ' + fmt(amount) + ' روپے'); render();
  }
  async function delCash(id){
    const c = DB.cash.find(x => x.id === id); if(!c) return;
    if(!(await unlockFor(c.date))) return;
    if(!(await ask('یہ اندراج (' + fmt(c.amount) + ' روپے) ہٹا دیں؟ کھاتے سے نکل جائے گا۔'))) return;
    c.deleted = Date.now(); put('cash'); logIt('اندراج ہٹایا: ' + fmt(c.amount), c.id); render();
  }

  // =====================================================================
  //   روزنامچہ
  // =====================================================================
  let rozDate = '';
  VIEWS.roznamcha = function(){
    const d = rozDate || today();
    const ps = liveParchis().filter(p => p.date === d);
    let gross = 0, net = 0, income = 0, nag = 0; const byCharge = {};
    ps.forEach(p => { const r = calcParchi(p, p.chargesSnap || chargesList()); gross += r.gross; net += r.net; income += r.income; nag += r.nag;
      r.zCharges.concat(...r.buyers.map(b => b.charges)).forEach(x => { byCharge[x.name] = byCharge[x.name] || { amt: 0, income: x.income }; byCharge[x.name].amt += x.amount; }); });
    const cs = liveCash().filter(c => c.date === d);
    const rec = cs.filter(c => c.kind === 'receive').reduce((s, c) => s + c.amount, 0), pay = cs.filter(c => c.kind === 'pay').reduce((s, c) => s + c.amount, 0);
    return `<div class="pageTitle">📖 روزنامچہ ${isLocked(d) ? '🔒' : ''}</div>
      <div class="card"><div class="row"><div class="f" style="flex:1;min-width:160px"><label>تاریخ</label><input type="date" value="${esc(d)}" onchange="App.setRozDate(this.value)"></div>
        <button class="btn ${isLocked(d) ? 'light' : 'gold'} sm" onclick="App.toggleLock('${d}')">${isLocked(d) ? '🔓 دن کھولیں' : '🔒 دن بند کریں'}</button></div>
        <div class="muted">${esc(urDate(d, true))}</div></div>
      <div class="stats"><div class="stat"><div class="l">بکری (${ps.length} پرچی، ${nag} نگ)</div><div class="n">${fmt(gross)}</div></div>
        <div class="stat g"><div class="l">آڑھتی کی کمائی</div><div class="n">${fmt(income)}</div></div>
        <div class="stat"><div class="l">خریداروں سے وصولی</div><div class="n">${fmt(rec)}</div></div>
        <div class="stat y"><div class="l">زمینداروں کو ادائیگی</div><div class="n">${fmt(pay)}</div></div></div>
      <div class="card"><h3>🧮 کٹوتیاں اور خرچے</h3><table class="t">${Object.keys(byCharge).map(k => `<tr><td>${esc(k)} <span class="tag ${byCharge[k].income ? 'in' : 'out'}">${byCharge[k].income ? 'آمدن' : 'آگے ادا'}</span></td><td class="v">${fmt(byCharge[k].amt)}</td></tr>`).join('') || '<tr><td class="muted">کچھ نہیں</td></tr>'}
        <tr class="tot"><td>زمینداروں کی صاف رقم</td><td class="v">${fmt(net)}</td></tr></table></div>
      <div class="card"><h3>📚 اس دن کی پرچیاں</h3><div class="list">${ps.map(p => `<div class="it" onclick="App.go('parchi','${p.id}')"><div>نمبر <span class="num">${p.no}</span> — ${esc(p.zamindar)}</div><div class="a">${fmt((p.totals || {}).gross || 0)}</div></div>`).join('') || '<div class="muted">کوئی پرچی نہیں</div>'}</div></div>
      <div class="card"><h3>💵 اس دن کی وصولی / ادائیگی</h3><div class="list">${cs.map(c => { const p = party(c.partyId); return `<div class="it"><div>${c.kind === 'pay' ? '💸 ادائیگی' : '💵 وصولی'} — ${esc(p ? p.name : '')}</div><div class="a ${c.kind === 'pay' ? 'amt-out' : 'amt-in'}">${fmt(c.amount)}</div></div>`; }).join('') || '<div class="muted">کوئی اندراج نہیں</div>'}</div></div>`;
  };
  async function toggleLock(d){
    if(isLocked(d)){ if(!(await unlockFor(d))) return; DB.locks[d] = { on: false }; put('locks'); logIt('دن کھولا: ' + d); toast('🔓 دن کھل گیا'); }
    else {
      if(!DB.settings.pin){ toast('⚠️ دن بند کرنے کے لیے پہلے سیٹنگ میں مالک کا پن لگائیں'); go('settings'); return; }
      if(!(await ask(urDate(d) + ' بند کر دیں؟ اس کے بعد اس دن کی پرچی یا وصولی صرف مالک کے پن سے بدلے گی۔'))) return;
      DB.locks[d] = { on: true, at: Date.now() }; put('locks'); logIt('دن بند: ' + d); toast('🔒 دن بند ہو گیا');
    }
    render();
  }

  // =====================================================================
  //   خرچے اور کمیشن
  // =====================================================================
  let editCh = null;
  VIEWS.charges = function(){
    const ch = chargesList();
    const list = side => ch.filter(c => c.side === side).map(c => `<div class="chg ${c.on ? '' : 'off'}"><div><div class="n">${esc(c.name)} — <span class="num">${esc(rateText(c))}</span></div>
        <div class="d">${KINDS[c.kind]} • ${c.income ? 'آڑھتی کی آمدن' : 'آگے ادا ہوتا ہے'}${Object.keys(c.itemRates || {}).length ? ' • جنس وار: ' + Object.keys(c.itemRates).map(k => esc(k) + ' ' + (c.kind === 'percent' ? c.itemRates[k] / 100 + '٪' : fmt(c.itemRates[k]))).join('، ') : ''}</div></div>
        <div class="row"><label class="muted"><input type="checkbox" ${c.on ? 'checked' : ''} onchange="App.chToggle('${c.id}',this.checked)"> چالو</label><button class="btn light sm" onclick="App.chEdit('${c.id}')">✏️</button></div></div>`).join('') || '<div class="muted">کچھ نہیں</div>';
    return `<div class="pageTitle">⚙️ خرچے اور کمیشن<span class="sp"></span><button class="btn gold sm" onclick="App.chEdit('')">➕ نیا</button></div>
      ${editCh ? chForm() : ''}
      <div class="card"><h3>🧑‍🌾 زمیندار سے کٹنے والے</h3>${list('zamindar')}</div>
      <div class="card"><h3>🧑‍💼 خریدار سے لیے جانے والے</h3>${list('buyer')}</div>
      <div class="card"><h3>📋 تیار سانچہ</h3><div class="muted">سانچہ لگانے سے یہ فہرست بدل جائے گی؛ پہلے سے محفوظ پرچیاں نہیں بدلیں گی (ہر پرچی اپنی شرح ساتھ رکھتی ہے)۔</div>
        <div class="row" style="margin-top:6px">${Object.keys(TEMPLATES).map(k => `<button class="btn light" onclick="App.chTemplate('${k}')">${TEMPLATES[k].label}</button>`).join('')}</div></div>`;
  };
  function chForm(){
    const c = editCh;
    const ir = Object.keys(c.itemRates || {}).map(k => k + '=' + c.itemRates[k] / 100).join('، ');
    return `<div class="card" style="border-top-color:var(--gold)"><h3>${c.id ? '✏️ بدلیں: ' + esc(c.name) : '➕ نیا خرچہ / کمیشن'}</h3>
      <div class="grid2 wideable">
        <div class="f"><label>نام</label><input id="chN" value="${esc(c.name)}" placeholder="مثلاً کمیشن، مزدوری، چنگی"></div>
        <div class="f"><label>حساب کی قسم</label><select id="chK">${Object.keys(KINDS).map(k => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${KINDS[k]}</option>`).join('')}</select></div>
        <div class="f"><label>شرح (فیصد میں یا روپے)</label><input id="chR" inputmode="decimal" value="${esc(c.rate ? c.rate / 100 : '')}" placeholder="مثلاً 7.25"></div>
        <div class="f"><label>کس سے</label><select id="chS">${Object.keys(SIDES).map(k => `<option value="${k}" ${c.side === k ? 'selected' : ''}>${SIDES[k]}</option>`).join('')}</select></div>
        <div class="f"><label>یہ رقم</label><select id="chI"><option value="1" ${c.income ? 'selected' : ''}>آڑھتی کی آمدن ہے</option><option value="0" ${c.income ? '' : 'selected'}>آگے ادا ہوتی ہے (مزدور، گاڑی، منڈی)</option></select></div>
        <div class="f" style="grid-column:1/-1"><label>جنس وار الگ شرح (اختیاری) — مثلاً: آم=7، کینو=6.5</label><input id="chIR" value="${esc(ir)}" placeholder="جنس=شرح، جنس=شرح"></div>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="App.chSave()">💾 محفوظ</button><button class="btn gray" onclick="App.chCancel()">منسوخ</button>
        ${c.id ? `<button class="btn gray" onclick="App.chRemove('${c.id}')">🗑️ ہٹائیں</button>` : ''}</div></div>`;
  }
  function chSave(){
    const v = id => $(id).value;
    const name = v('chN').trim(); if(!name){ toast('⚠️ نام لکھیں'); return; }
    const itemRates = {};
    v('chIR').split(/[،,\n]/).forEach(x => { const m = x.split('='); if(m.length === 2 && m[0].trim() && m[1].trim() !== '') itemRates[m[0].trim()] = toPaisa(m[1]); });
    const c = Object.assign(editCh, { name, kind: v('chK'), rate: toPaisa(v('chR')), side: v('chS'), income: v('chI') === '1', itemRates });
    const ch = chargesAll();
    if(!c.id){ c.id = uid(); c.on = true; ch.push(c); } else ch[ch.findIndex(x => x.id === c.id)] = c;
    put('charges'); logIt('خرچہ محفوظ: ' + name + ' ' + rateText(c)); editCh = null; render(); toast('✅ محفوظ');
  }

  // =====================================================================
  //   بیک اپ
  // =====================================================================
  VIEWS.backup = function(){
    const D = window.AB_DRIVE, on = D && D.connected();
    return `<div class="pageTitle">💾 بیک اپ</div>
      <div class="card"><h3>☁️ گوگل ڈرائیو پر خودکار بیک اپ</h3>
        <div id="driveStatus" class="dstatus"></div>
        <div class="muted">ایک بار جوڑ دیں: ہر تبدیلی کے چند سیکنڈ بعد سارا ریکارڈ آپ کی اپنی گوگل ڈرائیو کے فولڈر <span class="num">BKAR Backup</span> میں خود محفوظ ہوگا (فائلیں <span class="num">BKAR…json</span> نام سے)، اور ہر دن کی الگ نقل 90 دن تک رہے گی۔ ایپ صرف اپنی بنائی فائلیں دیکھ سکتی ہے۔</div>
        ${D && D.supported ? `<div class="row" style="margin-top:8px">${on ? `<button class="btn" id="btnDriveNow" onclick="AB_DRIVE.now()">☁️ ابھی محفوظ کریں</button><button class="btn light" onclick="AB_DRIVE.openRestore()">📂 ڈرائیو سے واپس لائیں</button><button class="btn gray sm" onclick="App.driveOff()">الگ کریں</button>` : `<button class="btn gold" onclick="AB_DRIVE.connect()">☁️ گوگل ڈرائیو جوڑیں</button>`}</div>` : ''}
        <div id="driveFiles" style="margin-top:8px"></div></div>
      <div class="card"><h3>📥 بیک اپ فائل بنائیں</h3><div class="muted">سارا ریکارڈ (پرچیاں، کھاتے، وصولی، خرچے) ایک فائل میں فون میں محفوظ ہو جائے گا۔ روز ایک بار ضرور بنائیں اور واٹس ایپ یا ای میل پر اپنے پاس بھیج دیں۔</div>
        <button class="btn wide" style="margin-top:8px" onclick="App.exportBackup()">📥 بیک اپ فائل بنائیں</button></div>
      <div class="card"><h3>📤 بیک اپ واپس لائیں</h3><div class="muted">صرف آڑھت بک کی بیک اپ فائل لگے گی۔ موجودہ ریکارڈ اس فائل سے بدل جائے گا۔</div>
        <input type="file" id="bkFile" accept=".json,application/json" style="display:none" onchange="App.importBackup(this)">
        <button class="btn light wide" style="margin-top:8px" onclick="document.getElementById('bkFile').click()">📤 فائل چنیں</button></div>
      <div class="card plain"><div class="muted">🛡️ ہر تبدیلی کی ایک حفاظتی کاپی فون کے اندر الگ جگہ بھی بنتی ہے؛ ایپ کا ریکارڈ مٹ جائے تو ایپ کھلتے ہی خود واپس آ جاتا ہے۔</div></div>`;
  };
  function snapshot(){
    const data = { appKind: 'AB', app: 'آڑھت بک', version: APP_VERSION, at: new Date().toISOString(), data: {} };
    KEYS.forEach(k => { data.data[k] = localStorage.getItem(k); });
    return data;
  }
  // ---------- بیک اپ واپس لانا (فائل یا ڈرائیو) — صرف آڑھت بک کی فائل؛ پہلے موجودہ ریکارڈ کی حفاظتی کاپی ----------
  async function applyBackup(b){
    if(!b || b.appKind !== 'AB' || !b.data){ toast('❌ یہ آڑھت بک کی بیک اپ فائل نہیں — کسی دوسری ایپ کی ہے'); return false; }
    let st = {}; try{ st = JSON.parse(b.data.ab_settings || '{}') || {}; }catch(e){}
    let np = 0; try{ np = (JSON.parse(b.data.ab_parchis || '[]') || []).filter(p => !p.deleted).length; }catch(e){}
    if(!(await ask('بیک اپ: «' + esc(st.shop || '') + '» — ' + esc(b.at ? b.at.slice(0, 10) : '') + ' — ' + np + ' پرچیاں۔ موجودہ ریکارڈ اس سے بدل جائے گا۔ جاری رکھیں؟', 'واپس لائیں'))) return false;
    try{ const db = await idb(); const tx = db.transaction('kv', 'readwrite'); const s = tx.objectStore('kv'); KEYS.forEach(k => { const v = localStorage.getItem(k); if(v != null) s.put(v, 'before_import_' + k); }); }catch(e){}
    KEYS.forEach(k => { if(b.data[k] != null) localStorage.setItem(k, b.data[k]); else localStorage.removeItem(k); });
    loadAll(); safeCopy(); logIt('بیک اپ واپس لایا گیا (' + (b.at || '') + ')'); unlocked = true; go('home'); toast('✅ بیک اپ واپس آ گیا');
    return true;
  }
  function backupFileName(d){
    const p = n => String(n).padStart(2, '0');
    const h = d.getHours(), h12 = h % 12 || 12;
    return 'BKAR' + p(d.getDate()) + p(d.getMonth() + 1) + ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getDay()] + p(h12) + p(d.getMinutes()) + (h < 12 ? 'AM' : 'PM') + '.json';
  }
  function exportBackup(){
    const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
    // فائل کا نام باقی ایپس کے انداز پر: BKAR + تاریخ + مہینہ + دن + وقت + AM/PM، مثلاً BKAR2410SA0455AM.json
    // (انگریزی حروف میں — براؤزر ڈاؤن لوڈ میں اردو نام قبول نہیں کرتا)
    const name = backupFileName(new Date());
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    DB.settings.lastBackup = Date.now(); put('settings'); toast('✅ بیک اپ فائل بن گئی'); render();
  }
  function importBackup(inp){
    const f = inp.files && inp.files[0]; inp.value = ''; if(!f) return;
    const rdr = new FileReader();
    rdr.onload = async () => { let b; try{ b = JSON.parse(rdr.result); }catch(e){ toast('❌ یہ درست بیک اپ فائل نہیں'); return; } applyBackup(b); };
    rdr.readAsText(f);
  }
  window.AB_HOST = { snapshot, apply: applyBackup, toast, version: APP_VERSION, fileName: backupFileName, count: () => liveParchis().length,
    settings: () => DB.settings,
    setCloud(c){ DB.settings.cloud = c; put('settings'); },
    // کلاؤڈ کو بھیجنے والے ریکارڈ: [{c, k, u, d, rec}]
    records(){ const out = []; SYNCED.forEach(n => recs(n).forEach(x => { if(x.v && x.v.upd) out.push({ c: n, k: x.__k, u: x.v.upd, d: x.v.dev, rec: x.v }); })); return out; },
    // دوسرے آلات سے آئے ریکارڈ: جس کا upd بعد کا وہ جیتے؛ آنے والے پر دوبارہ مہر نہ لگے
    mergeRemote(list){
      const changed = new Set();
      list.forEach(({ c, k, u, rec }) => {
        if(!SYNCED.includes(c)) return;
        let cur = null;
        if(c === 'settings') cur = DB.settings;
        else if(c === 'locks') cur = DB.locks[k];
        else { if(!Array.isArray(DB[c])) DB[c] = []; cur = DB[c].find(r => r.id === k); }
        if(cur && (cur.upd || 0) >= u) return;
        if(c === 'settings'){ const keep = { cloud: DB.settings.cloud }; DB.settings = Object.assign({}, rec, keep.cloud ? keep : {}); }
        else if(c === 'locks') DB.locks[k] = rec;
        else { const i = DB[c].findIndex(r => r.id === k); if(i >= 0) DB[c][i] = rec; else DB[c].push(rec); }
        if(!seen[c]) seen[c] = new Map();
        seen[c].set(k, sig(c === 'settings' ? DB.settings : rec));
        changed.add(c);
      });
      if(!changed.size) return 0;
      changed.forEach(c => { try{ localStorage.setItem('ab_' + c, JSON.stringify(DB[c])); }catch(e){} });
      safeCopy();
      // لکھتے ہوئے فارم کو نہ مٹائیں — صرف دیکھنے والی اسکرینیں تازہ
      if(['home', 'parchis', 'zamindar', 'buyer', 'party', 'roznamcha', 'settings'].includes(screen) && !$('modal').classList.contains('open')) render();
      else if(!DB.settings.registered) render();
      return changed.size;
    }
  };
  // ---------- آج بیک اپ ہوا یا نہیں ----------
  function backedUpToday(){
    const t = today();
    const isToday = ms => { if(!ms) return false; const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') === t; };
    const D = window.AB_DRIVE;
    return isToday(DB.settings.lastBackup) || (D && D.connected() && !D.pending() && isToday(D.lastBackup() && Date.parse(D.lastBackup())));
  }
  function backupBanner(){
    const D = window.AB_DRIVE;
    if(!liveParchis().length && !DB.cash.length) return '';
    if(D && D.connected() && D.supported) return '';
    if(backedUpToday()) return '';
    return `<div class="bkBanner"><div>⚠️ آج کا بیک اپ نہیں ہوا — فون خراب یا گم ہو جائے تو ریکارڈ ضائع ہو سکتا ہے</div>
      <div class="row">${D && D.supported ? '<button class="btn gold sm" onclick="AB_DRIVE.connect()">☁️ گوگل ڈرائیو جوڑیں</button>' : ''}<button class="btn light sm" onclick="App.exportBackup()">📥 بیک اپ فائل</button></div></div>`;
  }

  // =====================================================================
  //   سیٹنگ
  // =====================================================================
  VIEWS.settings = function(){
    const s = DB.settings;
    const lg = DB.log.slice(-40).reverse();
    return `<div class="pageTitle">🛠️ سیٹنگ</div>
      ${cloudCard()}
      <div class="card"><h3>🏪 آڑھت کی معلومات</h3><div class="grid2 wideable">
        <div class="f"><label>آڑھت / دکان کا نام</label><input id="sShop" value="${esc(s.shop)}"></div>
        <div class="f"><label>مالک کا نام</label><input id="sOwner" value="${esc(s.owner)}"></div>
        <div class="f"><label>موبائل نمبر</label><input id="sPhone" inputmode="tel" value="${esc(s.phone)}"></div>
        <div class="f"><label>منڈی کا پتہ</label><input id="sAddr" value="${esc(s.address)}"></div></div>
        <button class="btn" style="margin-top:8px" onclick="App.saveSettings()">💾 محفوظ</button></div>
      <div class="card"><h3>🎨 رنگ</h3><div class="themesCard">${themePicker()}</div><div class="muted">رنگ صرف اس آلے پر بدلتا ہے؛ ریکارڈ پر کوئی اثر نہیں۔</div></div>
      <div class="card"><h3>🔒 مالک کا پن</h3><div class="muted">پن لگانے سے ایپ کھلتے وقت پن پوچھے گی، اور بند دن کی تبدیلی بھی صرف اسی سے ہوگی۔ ${s.pin ? '✅ پن لگا ہوا ہے' : '❌ ابھی پن نہیں لگا'}</div>
        <div class="row" style="margin-top:6px"><div class="f" style="flex:1"><input id="sPin" type="password" inputmode="numeric" maxlength="8" placeholder="نیا پن (4 سے 8 ہندسے)"></div>
        <button class="btn" onclick="App.setPin()">💾 پن لگائیں</button>${s.pin ? '<button class="btn gray" onclick="App.removePin()">ہٹائیں</button>' : ''}</div></div>
      <div class="card"><h3>📜 تبدیلیوں کا ریکارڈ (آخری 40)</h3><div class="list">${lg.map(x => `<div class="it" style="cursor:default"><div>${esc(x.what)}</div><div class="muted">${esc(urDate(new Date(x.at).toISOString().slice(0, 10)))} ${urTime(x.at)}</div></div>`).join('') || '<div class="muted">کچھ نہیں</div>'}</div></div>
      <div class="card plain"><div class="muted">ورژن: <span class="num">${APP_VERSION}</span></div></div>`;
  };
  function saveSettings(){
    Object.assign(DB.settings, { shop: $('sShop').value.trim() || DB.settings.shop, owner: $('sOwner').value.trim(), phone: $('sPhone').value.trim(), address: $('sAddr').value.trim() });
    put('settings'); logIt('آڑھت کی معلومات بدلیں'); render(); toast('✅ محفوظ');
  }
  async function setPin(){
    const v = $('sPin').value.trim();
    if(!/^\d{4,8}$/.test(v)){ toast('⚠️ پن 4 سے 8 ہندسوں کا ہو'); return; }
    if(DB.settings.pin && !(await pinPrompt('پرانا پن لکھیں'))) return;
    DB.settings.pin = v; unlocked = true; put('settings'); logIt('پن بدلا'); render(); toast('✅ پن لگ گیا — یاد رکھیں');
  }
  async function removePin(){ if(!(await pinPrompt('پن ہٹانے کے لیے موجودہ پن لکھیں'))) return; delete DB.settings.pin; put('settings'); logIt('پن ہٹایا'); render(); }

  // =====================================================================
  //   اپڈیٹ
  // =====================================================================
  function showUpdated(){
    let from = null; try{ from = localStorage.getItem('ab_updFrom'); }catch(e){}
    // یکساں اپڈیٹ کارڈ (سب ایپس جیسا): پرانا (کٹا ہوا) → نیا ورژن، نیچے کیا نیا ہے، درمیان میں اوکے
    if(from && from !== APP_VERSION){ try{ AppUpd.done(from, APP_VERSION, UPDATE_NOTE); }catch(e){} }
    try{ localStorage.setItem('ab_updFrom', APP_VERSION); }catch(e){}
  }
  function registerSW(){
    if(!('serviceWorker' in navigator) || window.__APP_WRONG_REPO) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if(refreshing) return; refreshing = true; location.reload(); });
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // نیا ورژن آتے ہی یکساں «اپڈیٹ ہو رہی ہے» پٹی (ریت گھڑی + زیبرا پٹی)، پھر خود تازہ
      const ask = w => { try{ if(!AppUpd.isWaiting()) AppUpd.waiting(); }catch(e){} w.postMessage('SKIP_WAITING'); };
      if(reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; if(!w) return;
        if(navigator.serviceWorker.controller){ try{ if(!AppUpd.isWaiting()) AppUpd.waiting(); }catch(e){} }
        w.addEventListener('statechange', () => { if(w.state === 'installed' && navigator.serviceWorker.controller) ask(w); }); });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
  }

  // =====================================================================
  //   عوامی بٹن
  // =====================================================================
  window.App = {
    go, menu, register, pinKey, closeModal,
    setTheme(k){ try{ localStorage.setItem('ab_theme', k); }catch(e){} applyTheme(k); render(); }, verTap(){ toast('ورژن ' + APP_VERSION); },
    newParchi(){ cur = blankParchi(); render(); },
    pset(k, v){ cur[k] = v; if(k === 'zamindar' || k === 'place' || k === 'vehicle') renderResult(); if(k === 'date') render(); },
    lset(i, k, v){ const l = cur.lines[i]; if(!l) return; if(k === 'rate') l.rate = toPaisa(v); else if(k === 'grams') l.grams = toGrams(v); else if(k === 'nag') l.nag = String(v).replace(/[^\d]/g, ''); else l[k] = v; if(k === 'buyer') delete l.buyerId; renderResult(); },
    pman(id, v){ if(String(v).trim() === '') delete cur.manual[id]; else cur.manual[id] = toPaisa(v); renderResult(); },
    addLine(){ const last = cur.lines[cur.lines.length - 1] || {}; cur.lines.push(Object.assign(blankLine(), { item: last.item || '', basis: last.basis || 'nag' })); render(); },
    delLine(i){ cur.lines.splice(i, 1); render(); },
    saveParchi, printParchi, printBuyers, delParchi, restoreParchi,
    setListDate(d){ listDate = d; render(); }, setRozDate(d){ rozDate = d; render(); }, toggleLock,
    psearch(v, type){ partySearch = v; const pos = v.length; render(); const i = document.querySelector('#view .f input'); if(i){ i.focus(); i.setSelectionRange(pos, pos); } },
    partyForm, saveParty, printLedger, cashHint, saveCash, delCash,
    chEdit(id){ editCh = id ? JSON.parse(JSON.stringify(chargesList().find(x => x.id === id))) : { id: '', name: '', kind: 'percent', rate: 0, side: 'zamindar', income: true, on: true, itemRates: {} }; render(); },
    chCancel(){ editCh = null; render(); }, chSave,
    chToggle(id, on){ const c = chargesList().find(x => x.id === id); if(c){ c.on = on; put('charges'); logIt('خرچہ ' + (on ? 'چالو' : 'بند') + ': ' + c.name); render(); } },
    async chRemove(id){ if(!(await ask('یہ خرچہ فہرست سے ہٹا دیں؟ (محفوظ پرچیاں نہیں بدلیں گی)'))) return; const c = chargesAll().find(x => x.id === id); if(c) c.deleted = Date.now(); put('charges'); logIt('خرچہ ہٹایا: ' + (c ? c.name : '')); editCh = null; render(); },
    async chTemplate(k){ if(!(await ask(TEMPLATES[k].label + ' کا سانچہ لگ جائے گا اور موجودہ فہرست بدل جائے گی۔'))) return; const now = Date.now(); chargesAll().forEach(c => { if(!c.deleted) c.deleted = now; }); DB.charges = chargesAll().concat(TEMPLATES[k].list().map(c => Object.assign({ id: uid() }, c))); put('charges'); logIt('سانچہ لگا: ' + TEMPLATES[k].label); render(); toast('✅ سانچہ لگ گیا'); },
    exportBackup, importBackup, saveSettings, setPin, removePin,
    cloudJoinForm,
    async cloudEnable(){ if(!(await ask('آڑھت کا ریکارڈ آپ کے اپنے کلاؤڈ (آڑھت بک) پر جائے گا اور جڑے ہوئے آلات میں مل جائے گا۔ کلاؤڈ چالو کریں؟', 'چالو کریں'))) return; if(await AB_CLOUD.enableOwner()){ logIt('کلاؤڈ چالو'); render(); } },
    cloudCopy(){ const c = AB_CLOUD.code(); try{ navigator.clipboard.writeText(c).then(() => toast('📋 کوڈ کاپی ہو گیا')); }catch(e){ toast(c); } },
    cloudShare(){ const msg = 'آڑھت بک — «' + shopName() + '» سے جڑنے کا کوڈ:\n' + AB_CLOUD.code() + '\nآڑھت بک کھولیں ← سیٹنگ ← آڑھت سے جڑیں'; window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); },
    async cloudRemove(uid, name){ if(!(await ask('«' + esc(name) + '» کو آڑھت سے ہٹا دیں؟ اس آلے پر نیا ریکارڈ کلاؤڈ میں نہیں جائے گا۔'))) return; try{ await AB_CLOUD.removeMember(uid); logIt('آلہ ہٹایا: ' + name); loadMembers(); toast('✅ ہٹا دیا'); }catch(e){ toast('⚠️ نہیں ہٹا سکا — انٹرنیٹ دیکھیں'); } },
    async driveOff(){ if(!(await ask('ڈرائیو سے خودکار بیک اپ بند کریں؟ ڈرائیو پر پہلے سے محفوظ فائلیں رہیں گی۔'))) return; AB_DRIVE.disconnect(); render(); }
  };

  // =====================================================================
  //   شروع
  // =====================================================================
  (async function start(){
    $('verBadge').textContent = APP_VERSION; applyTheme(curTheme());
    const restored = await safeRestoreIfEmpty();
    loadAll();
    try{ history.replaceState({ s: 'home', a: null }, ''); }catch(e){}
    render();
    if(restored) toast('🛡️ ریکارڈ حفاظتی کاپی سے واپس آ گیا');
    if(DB.settings.registered) safeCopy();
    showUpdated();
    registerSW();
    if(window.AB_CLOUD) AB_CLOUD.start();
  })();
})();
