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
  const APP_VERSION = 'AB2610MO045';
  const UPDATE_NOTE = 'وصولی / ادائیگی سبزی منڈی کے انداز پر: بڑے ٹیب، کھاتوں کی فہرست سے چننا، حالیہ اندراج کارڈ میں';
  const C = window.ABCalc;
  // ---------- اردو / عربی کی بورڈ کے ہندسے (۰۱۲… / ٠١٢…) لکھتے ہی 0-9 میں — ورنہ رقم، نمبر اور کوڈ نہیں پہچانے جاتے ----------
  document.addEventListener('input', e => {
    const el = e.target; if(!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    const v = el.value; if(!/[\u0660-\u0669\u06F0-\u06F9]/.test(v)) return;
    const pos = el.selectionStart;
    el.value = v.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x6F0));
    try{ if(pos != null) el.setSelectionRange(pos, pos); }catch(err){}
  }, true);
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
    if(DB.settings.pin){ DB.settings.pinH = pinHash(DB.settings.pin); delete DB.settings.pin; try{ localStorage.setItem('ab_settings', JSON.stringify(DB.settings)); }catch(e){} } // پرانا سادہ پن → خفیہ شکل
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

  // ---------- 🔐 پن خفیہ شکل میں (SHA-256) — sync سے ملازم کے آلے پر جائیں تو بھی کوئی پن پڑھ نہ سکے ----------
  function sha256(str){
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const bytes = unescape(encodeURIComponent(str)).split('').map(c => c.charCodeAt(0));
    const l = bytes.length * 8; bytes.push(0x80); while((bytes.length % 64) !== 56) bytes.push(0);
    for(let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 0xff);
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for(let o = 0; o < bytes.length; o += 64){
      const w = new Array(64);
      for(let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for(let i = 16; i < 64; i++){ const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f2, g, h] = H;
      for(let i = 0; i < 64; i++){
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f2) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f2; f2 = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = H.map((x, i) => (x + [a, b, c, d, e, f2, g, h][i]) | 0);
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function pinSalt(){ if(!DB.settings.salt){ DB.settings.salt = Math.random().toString(36).slice(2) + Date.now().toString(36); } return DB.settings.salt; }
  function pinHash(pin){ return sha256('AB-PIN:' + pinSalt() + ':' + String(pin)); }
  function hasOwnerPin(){ return !!DB.settings.pinH; }
  function checkOwner(pin){ return hasOwnerPin() && pinHash(pin) === DB.settings.pinH; }
  function staffUsers(){ return (DB.settings.users || []).filter(u => !u.deleted); }
  function needsLogin(){ return hasOwnerPin() || staffUsers().length > 0; }
  // ---------- اس وقت کون استعمال کر رہا ہے ----------
  let curUser = null; // { role: 'owner' } یا { role: 'staff', id }
  function ownerUser(){ return { role: 'owner' }; }
  function me(){
    if(!curUser){
      if(needsLogin()) return null;
      // پن نہیں لگا: ملازم والی ڈیوائس پر اندراج اسی ڈیوائس کے نام سے (مالک کے نام سے نہیں)
      if(window.AB_CLOUD && AB_CLOUD.on() && AB_CLOUD.role() === 'staff'){ let n = ''; try{ n = localStorage.getItem('ab_devname') || ''; }catch(e){} return { role: 'owner', name: n || 'ملازم ڈیوائس' }; }
      return { role: 'owner', name: DB.settings.owner || 'مالک' };
    }
    if(curUser.role === 'owner') return { role: 'owner', name: DB.settings.owner || 'مالک' };
    const u = staffUsers().find(x => x.id === curUser.id);
    return u ? { role: 'staff', id: u.id, name: u.name, screens: u.screens || [] } : null; // ملازم ہٹا دیا گیا ہو تو باہر
  }
  const isStaff = () => { const m = me(); return !!(m && m.role === 'staff'); };
  const STAFF_SCREENS = [['parchi', 'نئی پرچی'], ['parchis', 'پرچیاں'], ['zamindar', 'زمیندار'], ['buyer', 'خریدار'], ['cash', 'وصولی / ادائیگی'], ['roznamcha', 'روزنامچہ']];
  function canSee(sc){
    const m = me(); if(!m || m.role === 'owner') return true;
    if(sc === 'home' || sc === 'search') return true;   // تلاش سب کے لیے؛ نتیجے اجازت کے حساب سے
    if(sc === 'party') return m.screens.includes('zamindar') || m.screens.includes('buyer');
    if(sc === 'due') return m.screens.includes('buyer') || m.screens.includes('cash');
    return m.screens.includes(sc);
  }
  // ملازم کے لیے: حذف/پرانی چیز بدلنے پر مالک کا پن
  async function ownerOk(msg){
    if(!isStaff()) return true;
    if(!hasOwnerPin()){ toast('⚠️ یہ کام صرف مالک کر سکتا ہے'); return false; }
    return pinPrompt(msg || 'یہ کام صرف مالک کر سکتا ہے — مالک کا پن لکھیں');
  }

  // ---------- تبدیلیوں کا ریکارڈ (کس نے کیا، ساتھ) ----------
  function logIt(what, ref){
    const m = me();
    if(m && m.role === 'staff') what = '👤 ' + m.name + ': ' + what;
    DB.log.push({ at: Date.now(), what, ref: ref || '', by: m ? m.name : '' });
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
  function modal(html){ $('modalBox').classList.remove('wide'); $('modalBox').innerHTML = html; $('modal').classList.add('open'); }
  function closeModal(){ $('modal').classList.remove('open'); }
  // ---------- ⏳ کام کی پیش رفت (بیک اپ وغیرہ): پٹی 0 سے 100٪ تک، آخر میں «ٹھیک ہے» والا پیغام ----------
  function progress(title, pct, step){
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if(!$('pgBar') || !$('modal').classList.contains('open')){ modal(`<div class="pgBox"><h3>${esc(title)}</h3><div class="pgTrack"><i id="pgBar" style="width:${p}%"></i></div><div class="pgPct num" id="pgPct">${p}%</div><div class="muted" id="pgStep">${esc(step || '')}</div></div>`); return; }
    $('pgBar').style.width = p + '%'; $('pgPct').textContent = p + '%'; $('pgStep').textContent = step || '';
  }
  function progressDone(title, lines){
    progress(title, 100, '✅ مکمل');
    return new Promise(r => setTimeout(() => { modal(`<div class="pgBox"><div class="pgOk">✅</div><h3>${esc(title)}</h3><div class="pgLines">${(lines || []).map(l => `<div>${l}</div>`).join('')}</div>
      <button class="btn wide" style="margin-top:10px" onclick="App.closeModal()">👍 ٹھیک ہے</button></div>`); r(); }, 500));
  }
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
    if(!p){ p = { id: uid(), type, name: n, phone: '', place: '', opening: 0, createdAt: Date.now(), no: nextPartyNo(type) }; DB.parties.push(p); put('parties'); logIt('نیا ' + PT[type] + ': ' + n, p.id); }
    return p;
  }
  // ---------- کھاتہ نمبر (منڈی کے رجسٹر جیسا): نام کی جگہ نمبر لکھیں تو کھاتہ خود آ جائے ----------
  function nextPartyNo(type){ return DB.parties.filter(p => p.type === type).reduce((m, p) => Math.max(m, int(p.no)), 0) + 1; }
  function numberParties(){
    const miss = DB.parties.filter(p => !int(p.no)); if(!miss.length) return;
    miss.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id))).forEach(p => { p.no = nextPartyNo(p.type); });
    put('parties');
  }
  function partyByNo(type, v){ const t = C.en ? C.en(String(v || '')).trim() : String(v || '').trim(); if(!/^\d+$/.test(t)) return null; return parties(type).find(p => int(p.no) === +t) || null; }
  const pNo = p => p && int(p.no) ? int(p.no) : '';
  function partyOpts(type){ return parties(type).sort((a, b) => int(a.no) - int(b.no)).map(x => `<option value="${esc(x.name)}" label="نمبر ${pNo(x)}${x.place ? ' • ' + esc(x.place) : ''}">`).join(''); }
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
    liveCash().filter(c => c.partyId === pid).forEach(c => rows.push({ date: c.date, at: c.at, text: cashText(c, p.type) + (c.no ? ' (نمبر ' + c.no + ')' : '') + (c.note ? ' — ' + c.note : ''), amt: cashSign(c, p.type) * c.amount, cash: c.id }));
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.at - b.at);
    let bal = 0; rows.forEach(r => { bal += r.amt; r.bal = bal; });
    return { rows, bal };
  }
  // ---------- وصولی / ادائیگی کا کھاتے پر اثر: «جمع» = رقم آئی (receive)، «بنام» = رقم دی (pay) ----------
  // خریدار سے وصولی اور زمیندار کو ادائیگی بقایا گھٹاتی ہیں؛ الٹی (خریدار کو دی، زمیندار سے آئی) بقایا بڑھاتی ہے
  function cashSign(c, type){ return (type === 'zamindar') === (c.kind === 'pay') ? -1 : 1; }
  function cashText(c, type){
    if(c.kind === 'pay') return c.adv ? 'پیشگی (ایڈوانس)' : (type === 'buyer' ? 'ادائیگی (خریدار کو دی)' : 'ادائیگی');
    return type === 'zamindar' ? 'وصولی (زمیندار سے آئی)' : 'وصولی';
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
    if(!hasOwnerPin()){ toast('⚠️ یہ دن بند ہے — پہلے سیٹنگ میں مالک کا پن لگائیں'); return false; }
    const ok = await pinPrompt('یہ دن (' + urDate(date) + ') بند ہے۔ تبدیلی کے لیے مالک کا پن لکھیں');
    return ok;
  }
  function pinPrompt(msg){
    return new Promise(res => {
      modal(`<h3>🔒 مالک کا پن</h3><div class="muted">${esc(msg)}</div><div class="f" style="margin:10px 0"><input id="mPin" type="password" inputmode="numeric" maxlength="8" style="text-align:center;font-size:24px"></div>
        <div class="row" style="justify-content:center"><button class="btn" id="mOk">ٹھیک ہے</button><button class="btn gray" id="mNo">منسوخ</button></div>`);
      setTimeout(() => $('mPin') && $('mPin').focus(), 50);
      $('mOk').onclick = () => { const v = $('mPin').value; closeModal(); if(checkOwner(v)) res(true); else { toast('❌ پن غلط ہے'); res(false); } };
      $('mNo').onclick = () => { closeModal(); res(false); };
    });
  }

  // =====================================================================
  //   نیویگیشن
  // =====================================================================
  const NAV = [
    ['home', '🏠', 'ہوم'], ['search', '🔍', 'تلاش'], ['parchi', '📝', 'نئی پرچی'], ['parchis', '📚', 'پرچیاں'],
    ['zamindar', '🧑‍🌾', 'زمیندار'], ['buyer', '🧑‍💼', 'خریدار'], ['cash', '💵', 'وصولی / ادائیگی'],
    ['roznamcha', '📖', 'روزنامچہ'], ['due', '🔔', 'یاد دہانی'], ['reports', '📊', 'رپورٹیں'], ['charges', '⚙️', 'خرچے اور کمیشن'], ['backup', '💾', 'بیک اپ'], ['settings', '🛠️', 'سیٹنگ']
  ];
  let screen = 'home', arg = null;
  // ---------- ☰ مینو (سبزی منڈی جیسا): نمبر والی رنگین قطاریں، ترتیب «نمبر سے / الف سے»، ⣿ پکڑ کر ہوم پر ----------
  const NAV_CLR = ['#0f766e', '#4f46e5', '#059669', '#dc2626', '#7c3aed', '#0369a1', '#c026d3', '#ea580c', '#0e7490', '#16a34a', '#be123c', '#ca8a04', '#9a3412', '#475569'];
  function renderSide(){
    const m = me(), srt = homePref().menuSort || 'num';
    const L = t => window.AB_LBL ? AB_LBL.L(t) : t;
    let ls = NAV.map((n, i) => ({ n, i })).filter(x => x.i > 0 && canSee(x.n[0]));
    if(srt === 'alpha') ls.sort((a, b) => L(a.n[2]).localeCompare(L(b.n[2]), 'ur'));
    $('side').innerHTML = `<div class="brand">${esc(shopName())}</div>` + (m && needsLogin() ? `<div class="who">${m.role === 'owner' ? '👑' : '👤'} ${esc(m.name)}</div>` : '')
      + (m ? `<div class="sideSort"><button class="${srt === 'num' ? 'on' : ''}" onclick="App.menuSort('num')">1️⃣ نمبر سے</button><button class="${srt === 'alpha' ? 'on' : ''}" onclick="App.menuSort('alpha')">ا الف سے</button></div>
        <button class="nav home ${screen === 'home' ? 'on' : ''}" onclick="App.go('home')"><span class="no">🏠</span><span class="tx">ہوم</span></button>`
        + ls.map(x => `<button class="nav ${screen === x.n[0] ? 'on' : ''}" style="--nc:${NAV_CLR[x.i % NAV_CLR.length]}" onclick="App.go('${x.n[0]}')"><span class="no num">${x.i}</span><span class="e">${x.n[1]}</span><span class="tx">${x.n[2]}</span><span class="dh" title="پکڑ کر ہوم پر لائیں" onpointerdown="App.menuDrag(event,'${x.n[0]}')" onclick="event.stopPropagation()">⣿</span></button>`).join('') : '')
      + (m && needsLogin() ? `<button class="nav" onclick="App.logout()"><span class="no">🔒</span><span class="tx">تالا / صارف بدلیں</span></button>` : '');
  }
  function go(s, a, fromPop){
    if(!canSee(s)){ toast('🔒 یہ حصہ آپ کے لیے نہیں — مالک سے اجازت لیں'); return; }
    if(s === 'parchi' && a === undefined && cur && cur.no) cur = null; // محفوظ پرچی کے بعد نئی؛ ادھوری پرچی محفوظ رہے
    screen = s; arg = a == null ? null : a; menu(false);
    if(!fromPop){ try{ history.pushState({ s, a: arg }, ''); }catch(e){} }
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', e => { const st = e.state; if(st && st.s){ screen = st.s; arg = st.a; render(); } else { screen = 'home'; arg = null; render(); } });
  function menu(open){ $('side').classList.toggle('open', !!open); $('sideShade').classList.toggle('open', !!open); }
  // دکان کا نام پورا دکھے: پہلے ایک لائن میں چھوٹا کر کے (24 سے 16 تک)، پھر بھی نہ سمائے تو دو لائنیں
  function fitTitle(){
    const t = $('ttl'); if(!t) return;
    t.classList.remove('two'); let f = 34; t.style.fontSize = f + 'px';
    while(t.scrollWidth > t.clientWidth + 1 && f > 18){ f--; t.style.fontSize = f + 'px'; }
    if(t.scrollWidth > t.clientWidth + 1) t.classList.add('two');
  }
  window.addEventListener('resize', () => fitTitle());
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitTitle());
  if(document.fonts) document.fonts.addEventListener('loadingdone', () => fitTitle());
  function render(){
    renderSide();
    $('ttl').textContent = shopName();
    { const st = DB.settings, ph = st.phone ? String(st.phone).trim() : '';
      $('ttlSub').innerHTML = DB.settings.registered ? [st.owner ? '👤 ' + esc(st.owner) : '', ph ? '📞 <span class="num">' + esc(/^0\d{10}$/.test(ph) ? ph.slice(0, 4) + '-' + ph.slice(4) : ph) + '</span>' : ''].filter(Boolean).map(x => '<span>' + x + '</span>').join('') : ''; }
    fitTitle();
    const v = $('view');
    if(!DB.settings.registered){ v.innerHTML = viewRegister(); return; }
    if(!me()){ curUser = null; v.innerHTML = viewPinGate(); renderSide(); return; }
    if(!canSee(screen)){ screen = 'home'; arg = null; }
    const fn = VIEWS[screen] || VIEWS.home;
    v.innerHTML = fn(arg);
    if(AFTER[screen]) AFTER[screen](arg);
    if(window.AB_DRIVE) AB_DRIVE.render();
  }

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
        ${window.AB_CLOUD ? '<button class="btn light wide" style="margin-top:8px" onclick="App.cloudJoinForm()">📲 ملازم ہیں یا دوسری ڈیوائس؟ پہلے سے موجود آڑھت سے جڑیں</button>' : ''}</div></div>`;
  }
  function register(){
    const shop = $('rShop').value.trim(), owner = $('rOwner').value.trim(), phone = $('rPhone').value.trim();
    if(!shop){ toast('⚠️ آڑھت کا نام لکھیں'); return; }
    if(window.AB_LIC && !/^\d{11,15}$/.test(AB_LIC.normPhone(phone))){ toast('⚠️ مالک کا موبائل نمبر لکھیں'); return; }
    DB.settings = Object.assign(DB.settings, { shop, owner, phone, address: $('rAddr').value.trim(), registered: true, createdAt: Date.now(), nextParchiNo: 1 });
    DB.charges = (DB.charges || []).map(c => Object.assign(c, { deleted: Date.now() })).concat(TEMPLATES[$('rTpl').value].list().map(c => Object.assign({ id: uid() }, c)));
    put('settings'); put('charges'); logIt('آڑھت رجسٹر: ' + shop);
    go('home'); toast('✅ خوش آمدید — 14 دن مفت آزمائش شروع'); if(window.AB_LIC) AB_LIC.check(false);
  }
  let pinBuf = '';
  function viewPinGate(){
    return `<div class="gate">${themePicker()}<div class="gt" style="text-align:center">🔒 پن لکھیں</div>
      <div class="card"><div class="muted" style="text-align:center">مالک یا ملازم — اپنا پن لکھیں</div><div class="pinDots">${[...Array(Math.max(4, pinBuf.length)).keys()].map(i => `<i class="${pinBuf.length > i ? 'f' : ''}"></i>`).join('')}</div>
      <div class="pinPad">${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k => `<button onclick="App.pinKey('${k}')">${k}</button>`).join('')}</div></div></div>`;
  }
  function pinKey(k){
    if(k === '⌫') pinBuf = pinBuf.slice(0, -1);
    else if(k !== '✓' && pinBuf.length < 8) pinBuf += k;
    if(pinBuf.length >= 4){
      const h = pinHash(pinBuf);
      if(hasOwnerPin() && h === DB.settings.pinH){ curUser = ownerUser(); pinBuf = ''; logIt('مالک نے ایپ کھولی'); render(); return; }
      const u = staffUsers().find(x => x.pinH === h);
      if(u){ curUser = { role: 'staff', id: u.id }; pinBuf = ''; logIt('ایپ کھولی'); if(!canSee(screen)) screen = 'home'; render(); return; }
    }
    if(k === '✓' || pinBuf.length >= 8){ if(pinBuf.length) toast('❌ پن غلط ہے'); pinBuf = ''; }
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
  // ---------- 📊 ڈیش بورڈ (سبزی منڈی جیسا): ہر خانہ دبائیں تو پوری تفصیل ----------
  // ---------- 📊 ڈیش بورڈ (سبزی منڈی جیسا، چھوٹا): مدت — آج / کل / ہفتہ / مہینہ ----------
  const DPER = [['t', 'آج'], ['y', 'گزشتہ کل'], ['w', 'یہ ہفتہ'], ['m', 'یہ مہینہ']];
  function perRange(k){
    const n = new Date(), y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
    const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    if(k === 'y'){ const t = iso(new Date(y, m, d - 1)); return [t, t]; }
    if(k === 'w') return [iso(new Date(y, m, d - 6)), iso(n)];
    if(k === 'm') return [iso(new Date(y, m, 1)), iso(n)];
    return [iso(n), iso(n)];
  }
  function dashData(per){
    const [f, t] = perRange(per || 't'); const inR = x => x >= f && x <= t;
    const ps = liveParchis().filter(p => inR(p.date));
    let gross = 0, income = 0, nag = 0, exp = 0; const inc = {}, ex = {};
    ps.forEach(p => { const r = calcParchi(p, p.chargesSnap || chargesList()); gross += r.gross; income += r.income; nag += r.nag;
      r.zCharges.concat(...r.buyers.map(x => x.charges)).forEach(x => { if(!x.amount) return; const m = x.income ? inc : ex; m[x.name] = (m[x.name] || 0) + x.amount; if(!x.income) exp += x.amount; }); });
    const cs = liveCash().filter(c => inR(c.date));
    const rec = cs.filter(c => c.kind === 'receive').reduce((a, c) => a + c.amount, 0), pay = cs.filter(c => c.kind === 'pay').reduce((a, c) => a + c.amount, 0);
    const all = liveCash(); const cashHand = int(DB.settings.openCash) + all.filter(c => c.kind === 'receive').reduce((a, c) => a + c.amount, 0) - all.filter(c => c.kind === 'pay').reduce((a, c) => a + c.amount, 0);
    const bal = type => parties(type).map(p => ({ p, bal: ledger(p.id).bal })).filter(x => x.bal);
    const zs = bal('zamindar'), bs = bal('buyer');
    return { per, f, t, ps, gross, income, nag, n: ps.length, inc, ex, exp, cs, rec, pay, cashHand, zs, bs,
      payab: zs.reduce((a, x) => a + (x.bal > 0 ? x.bal : 0), 0), recv: bs.reduce((a, x) => a + (x.bal > 0 ? x.bal : 0), 0) };
  }
  function homePref(){ let h = {}; try{ h = JSON.parse(localStorage.getItem('ab_home') || '{}') || {}; }catch(e){} return h; }
  function setHomePref(o){ try{ localStorage.setItem('ab_home', JSON.stringify(Object.assign(homePref(), o))); }catch(e){} }
  function dash(k){
    const d = dashData(homePref().per || 't'), perName = (DPER.find(x => x[0] === d.per) || DPER[0])[1];
    const row = (a, v, on, cls) => `<div class="it" ${on ? `onclick="App.closeModal();${on}"` : 'style="cursor:default"'}><div>${a}</div><span class="num ${cls || ''}">${fmt(v)}</span></div>`;
    const tot = (lab, v) => `<table class="t" style="margin-top:6px"><tr class="net"><td>${lab}</td><td class="v">${fmt(v)}</td></tr></table>`;
    const cashRows = list => list.map(c => { const p = party(c.partyId); return row(`<span class="pnoTag num">${int(c.no)}</span> <b>${esc(p ? p.name : '')}</b> <span class="muted">${p ? PT[p.type] : ''}${c.note ? ' • ' + esc(c.note) : ''}</span>`, c.amount, `App.go('cash','v:${c.id}')`, c.kind === 'pay' ? 'amt-out' : 'amt-in'); }).join('') || '<div class="muted">اس مدت میں کوئی اندراج نہیں</div>';
    const partyRows = (xs, type) => xs.slice().sort((a, b) => b.bal - a.bal).map(x => row(`<span class="pnoTag num">${pNo(x.p)}</span> <b>${esc(x.p.name)}</b> <span class="muted">${balText(type, x.bal)}</span>`, Math.abs(x.bal), `App.go('party','${x.p.id}')`, (x.bal > 0) === (type === 'buyer') ? 'amt-in' : 'amt-out')).join('') || '<div class="muted">کوئی بقایا نہیں</div>';
    const mapRows = m => Object.keys(m).sort((a, b) => m[b] - m[a]).map(n => row(esc(n), m[n])).join('') || '<div class="muted">اس مدت میں کچھ نہیں</div>';
    const T = {
      sale: ['🧺 بکری', d.ps.map(p => row(`پرچی <span class="num">${p.no}</span> — <b>${esc(p.zamindar)}</b> <span class="muted">${esc(p.vehicle || '')}</span>`, (p.totals || {}).gross || calcParchi(p, p.chargesSnap || chargesList()).gross, `App.go('parchi','${p.id}')`)).join('') || '<div class="muted">اس مدت میں کوئی پرچی نہیں</div>', tot('کل بکری (' + d.nag + ' نگ)', d.gross)],
      income: ['💰 کمائی (منافع)', mapRows(d.inc), tot('کل کمائی', d.income)],
      exp: ['🧑‍🔧 خرچے (مزدوری، کرایہ… آگے ادا)', mapRows(d.ex), tot('کل خرچے', d.exp)],
      rec: ['📥 کیش آیا (جمع)', cashRows(d.cs.filter(c => c.kind === 'receive')), tot('کل جمع', d.rec)],
      pay: ['📤 کیش گیا (بنام)', cashRows(d.cs.filter(c => c.kind === 'pay')), tot('کل بنام', d.pay)],
      cashh: ['🪙 گلہ (ہاتھ میں نقد)', row('شروع کا نقد (سیٹنگ)', int(DB.settings.openCash)) + row('سب جمع (آئے)', liveCash().filter(c => c.kind === 'receive').reduce((t, c) => t + c.amount, 0)) + row('سب بنام (گئے)', liveCash().filter(c => c.kind === 'pay').reduce((t, c) => t + c.amount, 0)) + row((DPER.find(x => x[0] === d.per) || DPER[0])[1] + ' آئے', d.rec, '', 'amt-in') + row((DPER.find(x => x[0] === d.per) || DPER[0])[1] + ' گئے', d.pay, '', 'amt-out'), tot('ہاتھ میں نقد', d.cashHand)],
      z: ['🧑‍🌾 زمینداروں کے بقایا', partyRows(d.zs, 'zamindar'), tot('کل دینے ہیں', d.payab)],
      b: ['🧑‍💼 خریداروں کے بقایا', partyRows(d.bs, 'buyer'), tot('کل لینے ہیں', d.recv)],
      net: ['💼 لینا اور دینا', row('خریداروں سے لینے ہیں', d.recv, "App.dash('b')", 'amt-in') + row('ہاتھ میں نقد', d.cashHand, "App.dash('cashh')", 'amt-in') + row('بیوپاریوں کو دینے ہیں', d.payab, "App.dash('z')", 'amt-out'), tot('فرق (لینا + نقد − دینا)', d.recv + d.cashHand - d.payab)]
    }[k];
    if(!T) return;
    modal(`<h3>${T[0]}</h3><div class="muted" style="margin-bottom:4px">${['z', 'b', 'cashh'].includes(k) ? 'اب تک' : perName + (d.f === d.t ? ' — ' + esc(urDate(d.f)) : ' — ' + esc(urDate(d.f)) + ' سے ' + esc(urDate(d.t)))} — کسی نام پر دبائیں تو اس کا کھاتہ / پرچی کھلے</div><div class="list" style="text-align:right;max-height:55vh;overflow:auto">${T[1]}</div>${T[2]}
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
  }
  const VIEWS = {};
  const AFTER = {};
  // ---------- 🏠 ہوم (سبزی منڈی جیسا): چھوٹا ڈیش بورڈ (چھپ سکتا ہے) + اپنی مرضی کے آئیکن (✏️ ہٹائیں / جگہ بدلیں / مینو سے کھینچ کر لائیں) ----------
  const HOME_DEF = ['parchi', 'parchis', 'zamindar', 'buyer', 'cash', 'roznamcha', 'reports', 'search', 'settings'];
  let homeEdit = false;
  function homeItems(){ const h = homePref(); const ok = k => NAV.some(n => n[0] === k) && k !== 'home' && canSee(k); return (Array.isArray(h.items) ? h.items : HOME_DEF).filter(ok); }
  function navNo(k){ return NAV.findIndex(n => n[0] === k); }   // ہوم = 0، باقی 1 سے
  VIEWS.home = function(){
    const h = homePref(), cols = Math.min(5, Math.max(1, int(h.cols) || (window.innerWidth >= 700 ? 5 : 3))), its = homeItems();
    let dashHtml = '';
    if(!isStaff()){
      if(h.dashOff) dashHtml = `<button class="dbShow" onclick="App.dashToggle()">👁️ ڈیش بورڈ دکھائیں</button>`;
      else {
        const d = dashData(h.per || 't');
        const chip = (k, cls, lab, v) => `<button class="dbChip ${cls}" onclick="App.dash('${k}')"><span class="l">${lab}</span><span class="v num">${fmt(v)}</span></button>`;
        dashHtml = `<div class="dbx"><button class="dbEye" onclick="App.dashToggle()" title="ڈیش بورڈ چھپائیں">🙈</button>
          <div class="dbRow r3">${chip('z', 'or', 'بیوپاریوں کو دینے', d.payab)}${chip('b', 'pu', 'خریداروں سے لینے', d.recv)}${chip('cashh', 'gd', 'ہاتھ میں نقد', d.cashHand)}</div>
          <div class="dbPer">${DPER.map(x => `<button class="${(h.per || 't') === x[0] ? 'on' : ''}" onclick="App.dashPer('${x[0]}')">${x[1]}</button>`).join('')}</div>
          <div class="dbRow r4">${chip('sale', 'rd', 'بکری', d.gross)}${chip('income', 'gr', 'کمائی', d.income)}${chip('rec', 'bl', 'کیش آیا', d.rec)}${chip('pay', 'pk', 'کیش گیا', d.pay)}</div></div>`;
      }
    }
    return `${window.AB_LIC ? AB_LIC.strip() : ''}${backupBanner()}${dueBanner()}${dashHtml}
      <div class="homeBar"><span class="muted">فی لائن</span>${[1, 2, 3, 4, 5].map(n => `<button class="${n === cols ? 'on' : ''}" onclick="App.homeCols(${n})">${n}</button>`).join('')}<span class="sp"></span>
        <button class="hbEdit ${homeEdit ? 'on' : ''}" onclick="App.homeEditT()" title="آئیکن ترتیب دیں">${homeEdit ? '✅' : '✏️'}</button></div>
      ${homeEdit ? '<div class="muted" style="text-align:center;margin:-2px 0 6px">✖ سے ہٹائیں • آئیکن پکڑ کر کھینچیں تو جگہ بدلے • مینو (☰) سے ⣿ پکڑ کر یہاں لائیں یا ➕</div>' : ''}
      <div class="homeGrid ${homeEdit ? 'edit' : ''}" id="homeGrid" style="--cols:${cols}">${its.map(k => { const n = NAV[navNo(k)];
        return `<div class="hIc" data-k="${k}"><button class="hb" onclick="App.homeTap('${k}')"><span class="e">${n[1]}</span><span class="no num">${navNo(k)}</span></button><span class="t">${n[2]}</span>${homeEdit ? `<button class="hx" onclick="App.homeDel('${k}')">✖</button>` : ''}</div>`; }).join('')}
        ${homeEdit ? `<div class="hIc add"><button class="hb" onclick="App.homeAddList()"><span class="e">➕</span></button><span class="t">آئیکن لگائیں</span></div>` : ''}</div>`;
  };
  AFTER.home = function(){ if(homeEdit) gridDrag(); };
  // ✏️ ترتیب: آئیکن پکڑ کر کھینچیں تو جگہ بدلے
  function gridDrag(){
    const g = $('homeGrid'); if(!g) return;
    g.querySelectorAll('.hIc[data-k]').forEach(el => {
      el.querySelector('.hb').addEventListener('pointerdown', e => {
        const k = el.dataset.k, sx = e.clientX, sy = e.clientY; let ghost = null;
        const mv = ev => {
          if(!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
          ev.preventDefault();
          if(!ghost){ ghost = el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); el.classList.add('dragging'); }
          ghost.style.left = (ev.clientX - 36) + 'px'; ghost.style.top = (ev.clientY - 36) + 'px';
        };
        const up = ev => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
          if(!ghost) return; ghost.remove(); el.classList.remove('dragging');
          const t = document.elementFromPoint(ev.clientX, ev.clientY); const to = t && t.closest && t.closest('.hIc[data-k]');
          if(to && to.dataset.k !== k){ const its = homeItems(); const a = its.indexOf(k), b2 = its.indexOf(to.dataset.k); its.splice(a, 1); its.splice(b2, 0, k); setHomePref({ items: its }); render(); }
        };
        window.addEventListener('pointermove', mv, { passive: false }); window.addEventListener('pointerup', up);
      });
    });
  }
  // ☰ مینو کے ⣿ سے آئیکن کھینچ کر ہوم پر
  function menuDrag(e, k){
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY; let ghost = null; const n = NAV[navNo(k)];
    const mv = ev => {
      if(!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      ev.preventDefault();
      if(!ghost){ menu(false); if(screen !== 'home') go('home'); ghost = document.createElement('div'); ghost.className = 'hIc ghost'; ghost.innerHTML = `<span class="hb"><span class="e">${n[1]}</span></span><span class="t">${n[2]}</span>`; document.body.appendChild(ghost); }
      ghost.style.left = (ev.clientX - 36) + 'px'; ghost.style.top = (ev.clientY - 36) + 'px';
    };
    const up = ev => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if(!ghost){ return; } ghost.remove();
      const t = document.elementFromPoint(ev.clientX, ev.clientY);
      if(t && t.closest && t.closest('#view')){ homeAdd(k, t.closest('.hIc[data-k]')); }
    };
    window.addEventListener('pointermove', mv, { passive: false }); window.addEventListener('pointerup', up);
  }
  function homeAdd(k, before){
    const its = homeItems().filter(x => x !== k);
    const i = before ? its.indexOf(before.dataset.k) : -1;
    if(i >= 0) its.splice(i, 0, k); else its.push(k);
    setHomePref({ items: its }); toast('✅ «' + NAV[navNo(k)][2] + '» ہوم پر لگ گیا'); if(screen === 'home') render(); else go('home');
  }
  // =====================================================================
  //   نئی پرچی
  // =====================================================================
  let cur = null;
  function blankLine(){ return { item: '', nag: '', grams: '', rate: '', basis: 'nag', buyer: '' }; }
  function blankParchi(){ return { id: uid(), no: 0, date: today(), zamindar: '', zamindarId: '', place: '', vehicle: '', bilty: '', lines: [], manual: {}, buyerManual: {}, note: '', createdAt: Date.now() }; }
  // ---------- 🧺 جنس کے کارڈ (سبزی منڈی کے «بل بنائیں» جیسے) ----------
  const ITEM_ICON = { 'آم': '🥭', 'کیلا': '🍌', 'سیب': '🍎', 'کینو': '🍊', 'مالٹا': '🍊', 'سنگترہ': '🍊', 'انگور': '🍇', 'امرود': '🍐', 'ناشپاتی': '🍐', 'خربوزہ': '🍈', 'تربوز': '🍉', 'آڑو': '🍑', 'آلو بخارا': '🍑', 'انار': '🍎', 'لیموں': '🍋', 'کھجور': '🌴', 'آلو': '🥔', 'پیاز': '🧅', 'ٹماٹر': '🍅', 'بھنڈی': '🌿', 'گوبھی': '🥦', 'بند گوبھی': '🥬', 'مٹر': '🫛', 'لہسن': '🧄', 'ادرک': '🫚', 'مرچ': '🌶️', 'شملہ مرچ': '🫑', 'کھیرا': '🥒', 'گاجر': '🥕', 'مولی': '🥕', 'بینگن': '🍆', 'کدو': '🎃', 'پالک': '🥬', 'دھنیا': '🌿', 'گندم': '🌾', 'چاول': '🌾', 'مکئی': '🌽' };
  const ITEM_BASE = ['آم', 'کیلا', 'سیب', 'کینو', 'مالٹا', 'انگور', 'امرود', 'خربوزہ', 'تربوز', 'آلو', 'پیاز', 'ٹماٹر', 'بھنڈی', 'گوبھی', 'مٹر', 'لہسن', 'ادرک', 'مرچ'];
  const itemIcon = n => ITEM_ICON[String(n || '').trim()] || '🧺';
  function itemCards(){ const used = itemNames(); return used.concat(ITEM_BASE.filter(x => !used.includes(x))); }
  let pzQ = '';
  function itemNames(){ const s = new Set(); liveParchis().forEach(p => p.lines.forEach(l => l.item && s.add(l.item))); return [...s].slice(0, 300); }
  function lineVals(k, base){ const s = new Set(base); liveParchis().forEach(p => p.lines.forEach(l => l[k] && s.add(l[k]))); return [...s].slice(0, 200).map(n => `<option value="${esc(n)}">`).join(''); }
  // جنس کے ساتھ ورائیٹی، اور پیکنگ / مارکہ (پرچی، بل، تصویر میں)
  const lineItem = l => [l.item, l.variety].filter(Boolean).join(' ');
  const lineXtra = l => [l.packing, l.marka ? 'مارکہ ' + l.marka : ''].filter(Boolean).join(' • ');
  const lineFull = l => [lineItem(l), lineXtra(l) ? '(' + lineXtra(l) + ')' : ''].filter(Boolean).join(' ');
  // پچھلی / اگلی پرچی (نمبر کی ترتیب سے)
  function parchiNbr(p){
    const ls = liveParchis().slice().sort((a, b) => a.no - b.no);
    if(!p.no) return { prev: ls[ls.length - 1] || null, next: null };
    return { prev: ls.filter(x => x.no < p.no).pop() || null, next: ls.find(x => x.no > p.no) || null };
  }
  VIEWS.parchi = function(id){
    if(id && (!cur || cur.id !== id)){ const p = DB.parchis.find(x => x.id === id); if(p) cur = JSON.parse(JSON.stringify(p)); }
    if(!cur) cur = blankParchi();
    numberParties();
    const p = cur, ch = cur.chargesSnap && cur.no ? cur.chargesSnap : chargesList();
    const manualCs = ch.filter(c => c.on && c.side === 'zamindar' && c.kind === 'manual');
    const nb = parchiNbr(p);
    if(!window.__pzOld) return pzView(p, nb, manualCs);
    return `<div class="pageTitle">📝 ${p.no ? 'پرچی نمبر ' + p.no : 'نئی پرچی'} ${isLocked(p.date) ? '🔒' : ''}<span class="sp"></span>
        <button class="btn light sm" ${nb.prev ? `onclick="App.parchiStep('${nb.prev.id}')" title="پچھلی پرچی نمبر ${nb.prev.no}"` : 'disabled'}>➡️ پچھلی</button>
        <button class="btn light sm" ${nb.next ? `onclick="App.parchiStep('${nb.next.id}')" title="اگلی پرچی نمبر ${nb.next.no}"` : 'disabled'}>اگلی ⬅️</button>
        <button class="btn gold sm" onclick="App.newParchi()">🆕 نئی</button></div>
      <datalist id="dlZ">${partyOpts('zamindar')}</datalist>
      <datalist id="dlB">${partyOpts('buyer')}</datalist>
      <datalist id="dlI">${itemNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <datalist id="dlPk">${lineVals('packing', ['پیٹی', 'کریٹ', 'بوری', 'ٹوکری', 'کارٹن', 'جال', 'کھلا'])}</datalist>
      <datalist id="dlVr">${lineVals('variety', [])}</datalist><datalist id="dlMk">${lineVals('marka', [])}</datalist>
      <div class="parchiWrap"><div>
        <div class="card"><h3>🧑‍🌾 زمیندار اور گاڑی</h3>
          <div class="grid2 wideable">
            <div class="f"><label>تاریخ</label><input type="date" value="${esc(p.date)}" onchange="App.pset('date',this.value)"></div>
            <div class="f"><label>زمیندار — نام یا نمبر ${pNo(findParty('zamindar', p.zamindar)) ? '<span class="pnoTag num">' + pNo(findParty('zamindar', p.zamindar)) + '</span>' : ''}</label><input list="dlZ" value="${esc(p.zamindar)}" placeholder="نام یا کھاتہ نمبر" oninput="App.pset('zamindar',this.value)" onchange="App.pnum(this)"></div>
            <div class="f"><label>گاؤں / شہر</label><input value="${esc(p.place)}" placeholder="مثلاً ساہیوال" oninput="App.pset('place',this.value)"></div>
            <div class="f"><label>گاڑی نمبر</label><input value="${esc(p.vehicle)}" placeholder="گاڑی کا نمبر" oninput="App.pset('vehicle',this.value)"></div>
            <div class="f"><label>بلٹی نمبر</label><input value="${esc(p.bilty)}" placeholder="بلٹی" oninput="App.pset('bilty',this.value)"></div>
            <div class="f"><label>نقد (ابھی زمیندار کو دیا)</label><input inputmode="decimal" value="${esc(inRs(p.cashNow))}" placeholder="0" oninput="App.pset('cashNow',this.value)"></div>
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
        <div class="row" style="margin-top:6px"><button class="btn wa" onclick="App.shareParchi('z')">📤 زمیندار کو پرچی (واٹس ایپ)</button>
          <button class="btn wa" onclick="App.shareParchi('b')">📤 خریدار کو بل (واٹس ایپ)</button>
          <button class="btn light" onclick="App.thermal()">🧾 تھرمل رسید</button></div>
      </div></div>`;
  };
  // ---------- 📝 نئی پرچی — سبزی منڈی کے «بل بنائیں» جیسی: اوپر بیوپاری، جنس کے کارڈ، نیچے پرچی کی پٹی ----------
  function pzView(p, nb, manualCs){
    const z = findParty('zamindar', p.zamindar);
    const r = calcParchi(p, parchiCharges());
    const q = (C.en ? C.en(pzQ) : pzQ).trim();
    const items = itemCards().filter(n => !q || n.includes(q));
    const inPz = n => p.lines.filter(l => l.item === n).reduce((s, l) => s + int(l.nag), 0);
    return `<div class="pageTitle">📝 ${p.no ? 'پرچی نمبر ' + p.no : 'نئی پرچی'} ${isLocked(p.date) ? '🔒' : ''}<span class="sp"></span>
        <button class="btn light sm" ${nb.prev ? `onclick="App.parchiStep('${nb.prev.id}')"` : 'disabled'}>➡️</button>
        <button class="btn light sm" ${nb.next ? `onclick="App.parchiStep('${nb.next.id}')"` : 'disabled'}>⬅️</button>
        <button class="btn gold sm" onclick="App.newParchi()">🆕 نئی</button></div>
      <div class="pzTop">
        <div class="pzRow"><button class="pzTrig ${p.zamindar ? 'on' : ''}" onclick="App.pzPick()"><span>${p.zamindar ? `🧑‍🌾 ${pNo(z) ? '<span class="pnoTag num">' + pNo(z) + '</span> ' : ''}<b>${esc(p.zamindar)}</b>` : '— زمیندار منتخب کریں —'}</span><span class="chev">▾</span></button>
          <button class="pzPlus" onclick="App.pzPick(true)" title="نیا زمیندار">+</button></div>
        <details class="pzMeta" ${p.vehicle || p.bilty || p.note || int(p.cashNow) || p.date !== today() ? 'open' : ''}><summary>🚚 گاڑی، بلٹی، تاریخ، نقد ${p.vehicle ? '— ' + esc(p.vehicle) : ''} ${p.date !== today() ? '— ' + esc(urDate(p.date)) : ''}</summary>
          <div class="grid2 wideable">
            <div class="f"><label>تاریخ</label><input type="date" value="${esc(p.date)}" onchange="App.pset('date',this.value)"></div>
            <div class="f"><label>گاڑی نمبر</label><input value="${esc(p.vehicle)}" placeholder="گاڑی کا نمبر" oninput="App.pset('vehicle',this.value)"></div>
            <div class="f"><label>بلٹی نمبر</label><input value="${esc(p.bilty)}" placeholder="بلٹی" oninput="App.pset('bilty',this.value)"></div>
            <div class="f"><label>گاؤں / شہر</label><input value="${esc(p.place)}" placeholder="مثلاً ساہیوال" oninput="App.pset('place',this.value)"></div>
            <div class="f"><label>نقد (ابھی زمیندار کو دیا)</label><input inputmode="decimal" value="${esc(inRs(p.cashNow))}" placeholder="0" oninput="App.pset('cashNow',this.value)"></div>
            <div class="f"><label>نوٹ</label><input value="${esc(p.note)}" placeholder="اختیاری" oninput="App.pset('note',this.value)"></div>
          </div></details>
        <div class="pzSearch"><input id="pzQ" value="${esc(pzQ)}" placeholder="🔍 جنس کا نام لکھیں…" oninput="App.pzSearch(this.value)"><button onclick="App.pzNewItem()" title="نئی جنس">+</button></div>
      </div>
      <div class="itemGrid">${items.map(n => { const c = inPz(n); return `<button class="itCard ${c ? 'has' : ''}" onclick="App.bkOpen(-1,decodeURIComponent('${encodeURIComponent(n)}'))"><span class="ie">${itemIcon(n)}</span><span class="in">${esc(n)}</span>${c ? `<span class="ic num">${c}</span>` : ''}</button>`; }).join('')}
        ${q && !items.includes(q) ? `<button class="itCard new" onclick="App.bkOpen(-1, document.getElementById('pzQ').value.trim())"><span class="ie">➕</span><span class="in">«${esc(q)}»</span></button>` : ''}</div>
      <div class="pzSpacer"></div>
      <button class="cartBar ${r.lines.length ? 'full' : ''}" onclick="App.pzCart()"><span>🧾 ${r.lines.length ? `<span class="num">${r.lines.length}</span> بکری • <span class="num">${r.nag}</span> نگ` : 'پرچی خالی ہے — جنس پر ہاتھ رکھیں'}</span>${r.lines.length ? `<span class="num">${fmt(r.gross)}</span>` : ''}</button>`;
  }
  // ایک بکری کا خانہ (پاپ اپ): خریدار، نگ، ریٹ، پیکنگ…
  function bkOpen(i, item){
    const l = i >= 0 ? cur.lines[i] : Object.assign(blankLine(), { item: item || '' });
    if(!String(l.item || '').trim()){ toast('⚠️ جنس کا نام لکھیں'); return; }
    const last = cur.lines.filter(x => x.item === l.item).pop();
    const pk = ['پیٹی', 'کریٹ', 'بوری', 'ٹوکری', 'کارٹن', 'جال', 'کھلا'];
    modal(`<h3>${itemIcon(l.item)} ${esc(l.item)} — ${i >= 0 ? 'بکری بدلیں' : 'بکری لکھیں'}</h3><div style="text-align:right">
      <datalist id="dlB2">${partyOpts('buyer')}</datalist>
      <div class="f"><label>خریدار — نام یا کھاتہ نمبر</label><input id="bkB" list="dlB2" value="${esc(l.buyer)}" placeholder="نام یا نمبر" onchange="App.bkNum()"></div>
      <div class="grid2"><div class="f"><label>نگ</label><input id="bkN" inputmode="numeric" value="${esc(l.nag)}" placeholder="0" oninput="App.bkAmt()" style="font-size:22px;text-align:center"></div>
        <div class="f"><label>ریٹ (روپے)</label><input id="bkR" inputmode="decimal" value="${l.rate ? esc(l.rate / 100) : last && last.rate ? esc(last.rate / 100) : ''}" placeholder="0" oninput="App.bkAmt()" style="font-size:22px;text-align:center"></div></div>
      <div class="seg" style="margin:4px 0"><button id="bkBn" class="${l.basis !== 'maund' ? 'on' : ''}" onclick="App.bkBasis('nag')">فی نگ</button><button id="bkBm" class="${l.basis === 'maund' ? 'on' : ''}" onclick="App.bkBasis('maund')">فی من (40 کلو)</button></div>
      <div class="f" id="bkWw" style="${l.basis === 'maund' ? '' : 'display:none'}"><label>وزن (کلو)</label><input id="bkW" inputmode="decimal" value="${l.grams ? esc(l.grams / 1000) : ''}" placeholder="0" oninput="App.bkAmt()"></div>
      <div class="pkChips">${pk.map(x => `<button class="${(l.packing || (last && last.packing)) === x ? 'on' : ''}" onclick="App.bkPk(this)">${x}</button>`).join('')}</div>
      <details class="lx" ${l.variety || l.marka ? 'open' : ''}><summary>📦 ورائیٹی / مارکہ (اختیاری)</summary><div class="grid2">
        <div class="f"><label>ورائیٹی</label><input id="bkV" value="${esc(l.variety || '')}" placeholder="مثلاً چونسا"></div>
        <div class="f"><label>مارکہ</label><input id="bkM" value="${esc(l.marka || '')}" placeholder="مال پر لکھا نشان"></div></div></details>
      <div class="bkAmt" id="bkA"></div></div>
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" onclick="App.bkSave(${i},decodeURIComponent('${encodeURIComponent(l.item)}'),false)">✅ ${i >= 0 ? 'محفوظ' : 'شامل کریں'}</button>
        ${i >= 0 ? `<button class="btn gray" onclick="App.bkDel(${i})">🗑️ ہٹائیں</button>` : `<button class="btn light" onclick="App.bkSave(-1,decodeURIComponent('${encodeURIComponent(l.item)}'),true)">➕ اور اگلا خریدار</button>`}
        <button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
    bkState = { basis: l.basis === 'maund' ? 'maund' : 'nag', pk: l.packing || (last && last.packing) || '' };
    bkAmt(); setTimeout(() => { const e = $(l.buyer ? 'bkN' : 'bkB'); if(e) e.focus(); }, 60);
  }
  let bkState = { basis: 'nag', pk: '' };
  function bkAmt(){ const el = $('bkA'); if(!el) return; const l = { nag: $('bkN').value, rate: toPaisa($('bkR').value), basis: bkState.basis, grams: toGrams(($('bkW') || {}).value) }; el.innerHTML = 'رقم: <b class="num">' + fmt(lineAmount(l)) + '</b> روپے'; }
  function bkSave(i, item, again){
    const name = $('bkB').value.trim(), bp = partyByNo('buyer', name) || findParty('buyer', name);
    const l = { item, nag: String($('bkN').value).replace(/[^\d]/g, ''), rate: toPaisa($('bkR').value), basis: bkState.basis, grams: bkState.basis === 'maund' ? toGrams($('bkW').value) : '',
      buyer: bp ? bp.name : name, packing: bkState.pk, variety: $('bkV').value.trim(), marka: $('bkM').value.trim() };
    if(bp) l.buyerId = bp.id;
    if(!l.buyer){ toast('⚠️ خریدار کا نام لکھیں'); return; }
    if(!int(l.nag) && !int(l.grams)){ toast('⚠️ نگ لکھیں'); return; }
    if(!int(l.rate)){ toast('⚠️ ریٹ لکھیں'); return; }
    if(i >= 0) cur.lines[i] = Object.assign(cur.lines[i], l); else cur.lines.push(l);
    closeModal(); toast('✅ ' + l.item + ' — ' + l.buyer + ': ' + fmt(lineAmount(l)));
    render(); if(again) bkOpen(-1, item); else if(i >= 0) pzCart();
  }
  // اوپر زمیندار چننے کی فہرست (سبزی منڈی کے «گاہک منتخب کریں» جیسی)
  function pzPick(isNew){
    const list = parties('zamindar').sort((a, b) => int(a.no) - int(b.no));
    modal(`<h3>🧑‍🌾 زمیندار منتخب کریں</h3><div class="f"><input id="pzZq" placeholder="🔍 نام یا کھاتہ نمبر — نیا نام لکھ کر ✅" oninput="App.pzZf(this.value)" value=""></div>
      <div class="list pzList" id="pzZl" style="text-align:right;max-height:50vh;overflow:auto">${list.map(x => `<div class="it" data-s="${esc(x.name + ' ' + pNo(x) + ' ' + (x.place || ''))}" onclick="App.pzSetZ('${x.id}')"><div><span class="pnoTag num">${pNo(x)}</span> <b>${esc(x.name)}</b> <span class="muted">${esc(x.place || '')}</span></div></div>`).join('') || '<div class="muted">ابھی کوئی زمیندار نہیں — نام لکھ کر ✅ دبائیں</div>'}</div>
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" onclick="App.pzSetZ(null)">✅ یہ نام لگائیں</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
    setTimeout(() => { const e = $('pzZq'); if(e) e.focus(); }, 60);
  }
  function pzCart(){
    const r = calcParchi(cur, parchiCharges());
    const ch = cur.chargesSnap && cur.no ? cur.chargesSnap : chargesList();
    const manualCs = ch.filter(c => c.on && c.side === 'zamindar' && c.kind === 'manual');
    modal(`<div class="sheetHd"><h3>🧾 ${cur.no ? 'پرچی نمبر ' + cur.no : 'نئی پرچی'} — ${esc(cur.zamindar || 'زمیندار؟')}</h3></div>
      <div class="list" style="text-align:right">${cur.lines.map((l, i) => `<div class="it" onclick="App.bkOpen(${i})"><div>${itemIcon(l.item)} <b>${esc(lineFull(l))}</b> → ${esc(l.buyer || '؟')} <span class="muted"><span class="num">${esc(l.nag || (int(l.grams) / 1000) + ' کلو')}</span> × <span class="num">${fmt(int(l.rate))}</span></span></div><span class="num">${fmt(lineAmount(l))}</span></div>`).join('') || '<div class="muted">ابھی کوئی بکری نہیں — جنس کے کارڈ پر ہاتھ رکھیں</div>'}</div>
      ${manualCs.length ? `<div class="grid2" style="text-align:right;margin-top:6px">${manualCs.map(c => `<div class="f"><label>${esc(c.name)} (روپے)</label><input inputmode="decimal" value="${cur.manual[c.id] != null ? esc(inRs(cur.manual[c.id])) : ''}" placeholder="${esc(inRs(c.rate) || '0')}" oninput="App.pman('${c.id}',this.value);App.pzCartRes()"></div>`).join('')}</div>` : ''}
      <div id="result" style="text-align:right">${resultHtml(r, cur, false)}</div>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="btn" onclick="App.closeModal();App.saveParchi()">💾 پرچی محفوظ کریں</button>
        <button class="btn light" onclick="App.closeModal();App.printParchi()">🖨️ زمیندار کی پرچی</button><button class="btn light" onclick="App.closeModal();App.printBuyers()">🖨️ خریداروں کے بل</button></div>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="btn wa" onclick="App.shareParchi('z')">📤 زمیندار کو پرچی</button><button class="btn wa" onclick="App.shareParchi('b')">📤 خریدار کو بل</button>
        <button class="btn light" onclick="App.thermal()">🧾 تھرمل</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
    $('modalBox').classList.add('wide');
  }
  AFTER.parchi = function(){ renderResult(); };
  AFTER.settings = function(){ if(window.AB_CLOUD){ AB_CLOUD.render(); if(AB_CLOUD.on() && AB_CLOUD.role() === 'owner') loadMembers(); } };
  function cloudCard(){
    const C = window.AB_CLOUD;
    if(!C) return '';
    if(!C.on()) return `<div class="card"><h3>☁️ کئی ڈیوائسز — لیپ ٹاپ اور ملازمین کے موبائل</h3>
      <div class="muted">کلاؤڈ چالو کرنے سے آپ کی سب ڈیوائسز (لیپ ٹاپ، موبائل، ملازمین کے فون) کا ریکارڈ ایک ہو جائے گا۔ ہر ڈیوائس انٹرنیٹ کے بغیر بھی کام کرتی رہے گی، نیٹ آتے ہی سب مل جائیں گے۔</div>
      <div class="row" style="margin-top:8px"><button class="btn gold" onclick="App.cloudEnable()">👑 میں مالک ہوں — کلاؤڈ چالو کریں</button>
      <button class="btn light" onclick="App.cloudJoinForm()">📲 میں ملازم ہوں — آڑھت سے جڑیں</button></div></div>`;
    const owner = C.role() === 'owner';
    return `<div class="card"><h3>☁️ کئی ڈیوائسز — کلاؤڈ</h3><div id="cloudStatus" class="dstatus"></div>
      ${owner ? `<div class="muted">ملازم یا اپنی دوسری ڈیوائس کو جوڑنے کے لیے یہ کوڈ دیں۔ وہ اپنی آڑھت بک میں «آڑھت سے جڑیں» دبا کر یہی کوڈ لکھے:</div>
        <div class="joinCode num">${esc(C.code())}</div>
        <div class="row"><button class="btn light sm" onclick="App.cloudCopy()">📋 کوڈ کاپی کریں</button><button class="btn light sm" onclick="App.cloudShare()">💬 واٹس ایپ پر بھیجیں</button>
        <button class="btn sm" onclick="AB_CLOUD.sync(true)">🔄 ابھی ملائیں</button></div>
        ${C.ownerKey() ? `<div class="okBox"><div><b>🔑 مالک کا خفیہ کوڈ</b> — یہ کسی کو نہ دیں؛ کاغذ پر لکھ کر سنبھال لیں۔ فون بدلے یا ایپ دوبارہ انسٹال ہو تو اسی سے آپ دوبارہ مالک بنیں گے (مالک کی بیک اپ فائل میں بھی یہ خود ہوتا ہے)۔</div><div class="joinCode num">${esc(C.ownerKey())}</div></div>` : ''}
        <h3 style="margin-top:10px">📱 جڑی ہوئی ڈیوائسز</h3><div id="cloudMembers" class="list"><div class="muted">…</div></div>`
      : `<div class="muted">یہ ڈیوائس آڑھت سے ملازم کے طور پر جڑی ہے۔</div><div class="row" style="margin-top:6px"><button class="btn sm" onclick="AB_CLOUD.sync(true)">🔄 ابھی ملائیں</button>
        <button class="btn light sm" onclick="App.claimForm()">👑 میں مالک ہوں (نئی ڈیوائس)</button></div>`}</div>`;
  }
  async function loadMembers(){
    const box = $('cloudMembers'); if(!box) return;
    try{
      const ms = await AB_CLOUD.refreshDevices();
      const lim = window.AB_LIC ? AB_LIC.allowed() : 99;
      box.innerHTML = `<div class="muted" style="margin-bottom:4px">📱 جڑی ڈیوائسز: <span class="num">${ms.length}</span> / <span class="num">${lim}</span>${ms.length > lim ? ' — ⛔ حد سے زیادہ ڈیوائسز پر نیا اندراج بند؛ کوئی ڈیوائس ہٹائیں یا مزید ڈیوائس لیں' : ''}</div>` + ms.map((m, i) => `<div class="it" style="cursor:default"><div>${m.role === 'owner' ? '👑' : '📱'} ${esc(m.name || '')} <span class="muted">${m.uid === AB_CLOUD.uid() ? '(یہ ڈیوائس)' : ''}${i >= lim ? ' ⛔ حد سے زیادہ' : ''}</span></div>
        ${m.role !== 'owner' ? `<button class="btn gray sm" onclick="App.cloudRemove('${m.uid}','${esc(m.name || '')}')">ہٹائیں</button>` : ''}</div>`).join('') || '<div class="muted">کوئی نہیں</div>';
    }catch(e){ box.innerHTML = '<div class="muted">فہرست نہیں آ سکی — انٹرنیٹ دیکھیں</div>'; }
  }
  function cloudJoinForm(){
    modal(`<h3>📲 آڑھت سے جڑیں</h3><div style="text-align:right">
      <div class="muted">مالک کی ڈیوائس میں سیٹنگ ← «کئی ڈیوائسز» میں جوڑنے کا کوڈ لکھا ہے، وہی یہاں لکھیں۔</div>
      <div class="f"><label>جوڑنے کا کوڈ</label><input id="cjCode" dir="ltr" style="text-align:center;font-family:Tahoma,Arial" placeholder="AB…-12345678"></div>
      <div class="f"><label>اپنا نام</label><input id="cjName" placeholder="مثلاً منشی اسلم"></div></div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="cjOk">✅ جڑیں</button><button class="btn gray" onclick="App.closeModal()">منسوخ</button></div>`);
    $('cjOk').onclick = async () => {
      const code = $('cjCode').value, name = $('cjName').value.trim();
      if(!AB_CLOUD.parseCode(code)){ toast('⚠️ کوڈ درست نہیں'); return; }
      if(DB.settings.registered && liveParchis().length && !(await ask('اس ڈیوائس کا موجودہ ریکارڈ بھی آڑھت کے کلاؤڈ میں مل جائے گا۔ جاری رکھیں؟'))) return;
      closeModal();
      const wasRegistered = !!DB.settings.registered; // نیا آلہ ہو تو جڑنے کے بعد سیدھا ہوم
      if(await AB_CLOUD.join(code, name)){ curUser = null; try{ localStorage.setItem('ab_devname', name || 'ملازم'); }catch(e){} logIt('آڑھت سے جڑا: ' + (name || 'ملازم')); go(wasRegistered ? 'settings' : 'home'); }
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
        <div class="f"><label>خریدار — نام یا نمبر ${pNo(findParty('buyer', l.buyer)) ? '<span class="pnoTag num">' + pNo(findParty('buyer', l.buyer)) + '</span>' : ''}</label><input list="dlB" value="${esc(l.buyer)}" placeholder="نام یا کھاتہ نمبر" oninput="App.lset(${i},'buyer',this.value)" onchange="App.lnum(${i},this)"></div>
      </div>
      <details class="lx" ${l.packing || l.variety || l.marka ? 'open' : ''}><summary>📦 پیکنگ / ورائیٹی / مارکہ ${l.packing || l.variety || l.marka ? '— ' + esc([l.packing, l.variety, l.marka].filter(Boolean).join('، ')) : '(اختیاری)'}</summary><div class="lineGrid">
        <div class="f"><label>پیکنگ</label><input list="dlPk" value="${esc(l.packing || '')}" placeholder="مثلاً پیٹی" oninput="App.lset(${i},'packing',this.value)"></div>
        <div class="f"><label>ورائیٹی</label><input list="dlVr" value="${esc(l.variety || '')}" placeholder="مثلاً چونسا" oninput="App.lset(${i},'variety',this.value)"></div>
        <div class="f"><label>مارکہ</label><input list="dlMk" value="${esc(l.marka || '')}" placeholder="مال پر لکھا نشان" oninput="App.lset(${i},'marka',this.value)"></div></div></details><div class="row" style="justify-content:space-between;margin-top:4px"><span class="lineAmt" id="la${i}"></span>
        ${cur.lines.length > 1 ? `<button class="btn gray sm" onclick="App.delLine(${i})">🗑️ ہٹائیں</button>` : ''}</div></div>`;
  }
  function parchiCharges(){ return cur.chargesSnap && cur.no ? cur.chargesSnap : chargesList(); }
  // زمیندار کا پچھلا حساب (پیشگی ہو تو اسی پرچی سے کٹتی دکھے)
  function zPrevHtml(p, r){
    const z = p.zamindarId ? party(p.zamindarId) : findParty('zamindar', p.zamindar); if(!z) return '';
    const old = DB.parchis.find(x => x.id === p.id && !x.deleted);
    const lc = DB.cash.find(c => c.id === 'pc_' + p.id && !c.deleted);
    const prior = ledger(z.id).bal - (old ? calcParchi(old, old.chargesSnap || chargesList()).net : 0) + (lc ? lc.amount : 0);
    if(!prior) return '';
    const after = prior + r.net - int(p.cashNow);
    return `<table class="t" style="margin-top:4px"><tr><td>${prior < 0 ? '➖ پہلے سے پیشگی / لینے ہیں' : '➕ پچھلا بقایا (دینے ہیں)'}</td><td class="v">${fmt(Math.abs(prior))}</td></tr>
      <tr class="tot"><td>اس پرچی کے بعد کل — ${balText('zamindar', after)}</td><td class="v">${fmt(Math.abs(after))}</td></tr></table>`;
  }
  function resultHtml(r, p, forPrint){
    const tag = x => forPrint ? '' : `<span class="tag ${x.income ? 'in' : 'out'}">${x.income ? 'آمدن' : 'آگے ادا'}</span>`;
    let h = `<div class="card"><h3>🧾 زمیندار کی پرچی</h3>
      <div class="muted">${esc(p.zamindar || 'زمیندار کا نام لکھیں')} ${p.place ? '— ' + esc(p.place) : ''} ${p.vehicle ? '— گاڑی ' + esc(p.vehicle) : ''}</div>
      <table class="t"><tr><th>کل بکری (${r.nag} نگ)</th><th class="v">${fmt(r.gross)}</th></tr>
      ${r.zCharges.map(x => `<tr><td>➖ ${esc(x.name)} ${tag(x)}</td><td class="v">${fmt(x.amount)}</td></tr>`).join('')}
      ${int(p.cashNow) ? `<tr><td>➖ نقد (ابھی دیا)</td><td class="v">${fmt(int(p.cashNow))}</td></tr>` : ''}
      <tr class="tot"><td>کل کٹوتی</td><td class="v">${fmt(r.zTotal + int(p.cashNow))}</td></tr>
      <tr class="net"><td>${int(p.cashNow) ? 'زمیندار کو باقی صاف رقم' : 'زمیندار کو صاف رقم'}</td><td class="v">${fmt(r.net - int(p.cashNow))}</td></tr></table>${forPrint ? '' : zPrevHtml(p, r)}</div>`;
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
    if(window.AB_LIC && !AB_LIC.canWrite()) return;
    const r = calcParchi(cur, parchiCharges());
    if(!String(cur.zamindar || '').trim()){ toast('⚠️ زمیندار کا نام لکھیں'); return; }
    if(!r.lines.length){ toast('⚠️ کم از کم ایک بکری لکھیں'); return; }
    if(r.lines.some(l => !String(l.buyer || '').trim())){ toast('⚠️ ہر بکری میں خریدار کا نام لکھیں'); return; }
    if(r.lines.some(l => !int(l.rate))){ toast('⚠️ ہر بکری کا ریٹ لکھیں'); return; }
    if(r.lines.some(l => l.basis === 'maund' && !int(l.grams))){ toast('⚠️ فی من ریٹ والی بکری کا وزن لکھیں'); return; }
    if(!r.check){ toast('⚠️ حساب کا جوڑ نہیں مل رہا'); return; }
    const old = DB.parchis.find(p => p.id === cur.id);
    if(old && !(await ownerOk('محفوظ پرچی بدلنا صرف مالک کا کام ہے — مالک کا پن لکھیں'))) return;
    if(old && !(await unlockFor(old.date))) return;
    if(!(await unlockFor(cur.date))) return;
    // کھاتے جوڑیں (نیا نام ہو تو نیا کھاتہ)
    const z = ensureParty('zamindar', cur.zamindar); cur.zamindarId = z.id; cur.zamindar = z.name;
    if(!z.place && cur.place){ z.place = cur.place; put('parties'); }
    cur.lines.forEach(l => { if(String(l.buyer || '').trim()){ const b = ensureParty('buyer', l.buyer); l.buyerId = b.id; l.buyer = b.name; } });
    // ادھار کی حد: اس پرچی کے بعد کسی خریدار کا بقایا اس کی حد سے بڑھے تو پوچھیں
    {
      const rNew = calcParchi(cur, parchiCharges()), rOld = old ? calcParchi(old, old.chargesSnap || chargesList()) : null;
      const over = rNew.buyers.map(b => { const bp = b.id && party(b.id); if(!bp || !bp.limit) return null;
        const oldB = rOld ? rOld.buyers.filter(x => x.id === b.id).reduce((s, x) => s + x.total, 0) : 0;
        const nb = ledger(bp.id).bal - oldB + b.total; return nb > bp.limit ? { n: bp.name, nb, lim: bp.limit } : null; }).filter(Boolean);
      if(over.length && !(await ask('⛔ ادھار کی حد سے زیادہ:<br>' + over.map(x => esc(x.n) + ' — بقایا ' + fmt(x.nb) + ' (حد ' + fmt(x.lim) + ')').join('<br>') + '<br>پھر بھی پرچی محفوظ کریں؟', 'پھر بھی محفوظ کریں'))) return;
    }
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
      snap.by = (me() || {}).name || '';
      snap.no = Math.max(DB.settings.nextParchiNo || 1, DB.parchis.reduce((m, p) => Math.max(m, p.no || 0), 0) + 1); DB.settings.nextParchiNo = snap.no + 1; put('settings');
      DB.parchis.push(snap);
      logIt('نئی پرچی ' + snap.no + ': ' + snap.zamindar + ' — بکری ' + fmt(snap.totals.gross), snap.id);
    }
    // «نقد» جو گاڑی آتے ہی زمیندار کو دیا — اسی پرچی سے جڑی ادائیگی (کھاتے میں خود)
    { const cid = 'pc_' + snap.id, amt = int(snap.cashNow); let c = DB.cash.find(x => x.id === cid);
      if(amt > 0){ if(!c){ c = { id: cid, kind: 'pay', at: Date.now(), by: (me() || {}).name || '' }; DB.cash.push(c); }
        Object.assign(c, { partyId: snap.zamindarId, amount: amt, date: snap.date, method: 'نقد', note: 'پرچی نمبر ' + snap.no + ' کے ساتھ', parchiId: snap.id }); delete c.deleted; put('cash'); }
      else if(c && !c.deleted){ c.deleted = Date.now(); put('cash'); } }
    if(put('parchis')){ cur = JSON.parse(JSON.stringify(snap)); toast('✅ پرچی نمبر ' + snap.no + ' محفوظ — کھاتوں میں درج'); render(); }
  }

  // ---------- پرنٹ ----------
  function printDoc(title, body){
    if(window.AB_LBL){ title = AB_LBL.L(title); body = AB_LBL.L(body); }
    const w = window.open('', '_blank'); if(!w){ toast('⚠️ پرنٹ والا صفحہ نہیں کھل سکا'); return; }
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    w.document.write(`<!DOCTYPE html><html lang="ur" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><base href="${esc(location.href.replace(/[^/]*$/, ''))}">
      <style>${css} body{background:#fff !important; margin:8mm; font-size:16px;} .card{box-shadow:none; border:1px solid #999; break-inside:avoid;} .t tr.net td{background:#eee; color:#000;}
      .ph{text-align:center; border-bottom:3px double #7f1d1d; margin-bottom:8px;} .ph h1{font-family:'NooriKasheeda',serif; font-weight:normal; margin:0; font-size:32px; color:#7f1d1d;} .ph div{font-size:15px;}</style></head>
      <body><div class="ph"><h1>${esc(shopName())}</h1><div>${esc(shopSub())}</div><div>${esc(shopContacts())}</div><div>${esc(shopFoot())}</div></div>${body}
      <div class="muted" style="text-align:center;margin-top:10px">آڑھت بک • ${esc(urDate(today()))}</div>${brandHtml()}<script>setTimeout(function(){print()},600)<\/script></body></html>`);
    w.document.close();
  }
  // 📣 ہر پرنٹ کے نیچے پی بی ٹی کوڈ لیبز
  function brandHtml(){ const B = (window.AB_RECEIPT && AB_RECEIPT.BRAND) || []; return B.length ? `<div style="text-align:center;margin-top:8px;padding:6px;border:2px solid #7f1d1d;border-radius:8px;font-size:15px">${esc(B[0])}<br><b>${esc(B[1])}</b></div>` : ''; }
  function parchiHead(p){ return `<div style="text-align:center;margin-bottom:6px">${p.no ? 'پرچی نمبر <b class="num">' + p.no + '</b> • ' : ''}تاریخ: ${esc(urDate(p.date))}<br>زمیندار: <b>${esc(p.zamindar)}</b>${pNo(party(p.zamindarId)) ? ' (نمبر <span class="num">' + pNo(party(p.zamindarId)) + '</span>)' : ''} ${p.place ? '— ' + esc(p.place) : ''} ${p.vehicle ? '• گاڑی: ' + esc(p.vehicle) : ''} ${p.bilty ? '• بلٹی: ' + esc(p.bilty) : ''}</div>`; }
  function printParchi(){
    const r = calcParchi(cur, parchiCharges());
    printDoc('زمیندار کی پرچی', parchiHead(cur) + `<div class="card"><table class="t"><tr><th>جنس</th><th>خریدار</th><th class="v">نگ</th><th class="v">ریٹ</th><th class="v">رقم</th></tr>
      ${r.lines.map(l => `<tr><td>${esc(lineFull(l))}</td><td>${esc(l.buyer)}</td><td class="v">${esc(l.nag)}</td><td class="v">${fmt(int(l.rate))}${l.basis === 'maund' ? ' / من' : ''}</td><td class="v">${fmt(lineAmount(l))}</td></tr>`).join('')}</table></div>` + resultHtml(r, cur, true).split('<div class="card"><h3>🧑‍💼')[0]);
  }
  function printBuyers(){
    const r = calcParchi(cur, parchiCharges());
    printDoc('خریداروں کے بل', r.buyers.map(b => `<div class="card">${parchiHead(cur)}<h3>خریدار: ${esc(b.name)}</h3><table class="t"><tr><th>جنس</th><th class="v">نگ</th><th class="v">ریٹ</th><th class="v">رقم</th></tr>
      ${r.lines.filter(l => (l.buyerId && l.buyerId === b.id) || (!l.buyerId && String(l.buyer).trim() === b.name)).map(l => `<tr><td>${esc(lineFull(l))}</td><td class="v">${esc(l.nag)}</td><td class="v">${fmt(int(l.rate))}</td><td class="v">${fmt(lineAmount(l))}</td></tr>`).join('')}
      <tr><td colspan="3">مال کی رقم</td><td class="v">${fmt(b.goods)}</td></tr>
      ${b.charges.map(x => `<tr><td colspan="3">➕ ${esc(x.name)}</td><td class="v">${fmt(x.amount)}</td></tr>`).join('')}
      <tr class="net"><td colspan="3">کل رقم</td><td class="v">${fmt(b.total)}</td></tr></table></div>`).join('<div style="page-break-after:always"></div>'));
  }

  // ---------- 📤 واٹس ایپ: پرچی / بل کی تصویر (receipt.js) — پہلے ایپ میں دکھے، پھر بھیجیں ----------
  // پرچی کا سر اور نیچے کا حصہ — منڈی کی چھپی پرچی جیسا
  function shopTag(){ const s = DB.settings; return s.tagline == null ? 'سبزی فروٹ کمیشن ایجنٹ' : s.tagline; }
  function shopContacts(){ const s = DB.settings; const cs = (s.contacts || []).filter(c => c.n || c.p); return cs.length ? cs.map(c => [c.n, c.p].filter(Boolean).join(' ')).join(' • ') : (s.phone ? [s.owner, s.phone].filter(Boolean).join(' ') : ''); }
  function shopFoot(){ const s = DB.settings; return [s.shopNo ? 'دکان نمبر ' + s.shopNo : '', s.address].filter(Boolean).join(' • '); }
  function shopSub(){ const s = DB.settings; return [shopTag(), s.trademark ? 'ٹریڈ مارک ' + s.trademark : ''].filter(Boolean).join(' • '); }
  function partyBal(pid){ return pid ? ledger(pid).bal : null; }
  function zamindarSpec(p, r){
    const z = p.zamindarId, bal = partyBal(z);
    const cash = int(p.cashNow), xc = r.lines.some(l => lineXtra(l));
    return { shop: shopSub() ? shopName() : shopName(), sub: shopSub(), title: 'زمیندار کی پرچی — نمبر ' + p.no,
      meta: [['تاریخ', urDate(p.date)], ['زمیندار', p.zamindar + (pNo(party(z)) ? ' (نمبر ' + pNo(party(z)) + ')' : '')], ['گاؤں / شہر', p.place || '—'], ['گاڑی', p.vehicle || '—'], ...(p.bilty ? [['بلٹی', p.bilty]] : [])],
      cols: [{ t: 'جنس', w: 3 }].concat(xc ? [{ t: 'پیکنگ / مارکہ', w: 2.4 }] : []).concat([{ t: 'خریدار', w: 3 }, { t: 'نگ', w: 1.4, num: 1 }, { t: 'ریٹ', w: 2 }, { t: 'رقم', w: 2.4, num: 1 }]),
      rows: r.lines.map(l => [lineItem(l)].concat(xc ? [lineXtra(l)] : []).concat([l.buyer, l.nag || (l.grams ? (int(l.grams) / 1000) + ' کلو' : ''), fmt(int(l.rate)) + (l.basis === 'maund' ? ' / من' : ''), fmt(lineAmount(l))])),
      // منڈی کی پرچی جیسا: نقد بھی کٹوتیوں میں، پھر ٹوٹل میزان، پھر صاف رقم
      lines: [['کل بکری (' + r.nag + ' نگ)', fmt(r.gross), '']].concat(r.zCharges.filter(x => x.amount).map(x => ['➖ ' + x.name, fmt(x.amount), '']))
        .concat(cash ? [['➖ نقد (ابھی دیا)', fmt(cash), '']] : [])
        .concat([['کل کٹوتی', fmt(r.zTotal + cash), 'tot'], [cash ? 'زمیندار کو باقی صاف رقم (روپے)' : 'زمیندار کو صاف رقم (روپے)', fmt(r.net - cash), 'net']])
        .concat(bal != null ? [['کھاتے کا کل بقایا — ' + balText('zamindar', bal), fmt(Math.abs(bal)), 'tot']] : []),
      sub2: shopContacts(), foot: [shopFoot(), urDate(today())].filter(Boolean).join(' • ') };
  }
  function buyerSpec(p, r, b){
    const bal = partyBal(b.id);
    const ls = r.lines.filter(l => (l.buyerId && l.buyerId === b.id) || (!l.buyerId && String(l.buyer).trim() === b.name));
    return { shop: shopName(), sub: shopSub(), title: 'خریدار کا بل — پرچی نمبر ' + p.no,
      meta: [['تاریخ', urDate(p.date)], ['خریدار', b.name + (pNo(party(b.id)) ? ' (نمبر ' + pNo(party(b.id)) + ')' : '')], ['زمیندار', p.zamindar], ['گاڑی', p.vehicle || '—']],
      cols: [{ t: 'جنس', w: 3.5 }, { t: 'نگ', w: 1.5, num: 1 }, { t: 'ریٹ', w: 2.2 }, { t: 'رقم', w: 2.6, num: 1 }],
      rows: ls.map(l => [lineFull(l), l.nag || (l.grams ? (int(l.grams) / 1000) + ' کلو' : ''), fmt(int(l.rate)) + (l.basis === 'maund' ? ' / من' : ''), fmt(lineAmount(l))]),
      lines: [['مال کی رقم (' + b.nag + ' نگ)', fmt(b.goods), '']].concat(b.charges.filter(x => x.amount).map(x => ['➕ ' + x.name, fmt(x.amount), '']))
        .concat([['اس بل کی کل رقم (روپے)', fmt(b.total), 'net']])
        .concat(bal != null ? [['کھاتے کا کل بقایا — ' + balText('buyer', bal), fmt(Math.abs(bal)), 'tot']] : []),
      sub2: shopContacts(), foot: [shopFoot(), urDate(today())].filter(Boolean).join(' • ') };
  }
  async function shareParchi(kind, key){
    if(!cur || !cur.no){ toast('⚠️ پہلے پرچی محفوظ کریں'); return; }
    if(!window.AB_RECEIPT){ toast('⚠️ تصویر نہیں بن سکی'); return; }
    const r = calcParchi(cur, parchiCharges());
    let spec, pid, file;
    if(kind === 'z'){ spec = zamindarSpec(cur, r); pid = cur.zamindarId; file = 'parchi-' + cur.no + '.png'; }
    else {
      if(!r.buyers.length){ toast('⚠️ اس پرچی میں کوئی خریدار نہیں'); return; }
      const b = key != null ? r.buyers[+key] : (r.buyers.length === 1 ? r.buyers[0] : null);
      if(!b){
        modal(`<h3>📤 کس خریدار کو بل؟</h3><div class="list">${r.buyers.map((x, i) => `<div class="it" onclick="App.shareParchi('b',${i})"><div><b>${esc(x.name)}</b> <span class="muted">${x.nag} نگ</span></div><span class="num">${fmt(x.total)}</span></div>`).join('')}</div>
          <div class="row" style="justify-content:center;margin-top:8px"><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
        return;
      }
      spec = buyerSpec(cur, r, b); pid = b.id; file = 'bill-' + cur.no + '-' + (r.buyers.indexOf(b) + 1) + '.png';
    }
    const cv = await AB_RECEIPT.draw(spec);
    const pp = pid ? party(pid) : null;
    const phone = pp && pp.phone && window.AB_LIC ? AB_LIC.normPhone(pp.phone) : '';
    shareCv = { cv, file, phone, name: pp ? pp.name : '' };
    modal(`<h3>${kind === 'z' ? '🧾 زمیندار کی پرچی' : '🧾 خریدار کا بل'}</h3>
      <img src="${cv.toDataURL('image/png')}" style="width:100%;border-radius:10px;border:1px solid var(--l3)" alt="">
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn wa" onclick="App.shareSend()">📤 بھیجیں</button>
        ${phone ? `<button class="btn light" onclick="App.shareChat()">💬 ${esc(shareCv.name)} کی چیٹ</button>` : ''}
        <button class="btn light" onclick="App.shareSave()">⬇️ محفوظ کریں</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>
      ${phone ? '' : `<div class="muted" style="margin-top:4px">${pp ? 'اس کھاتے میں فون نمبر لکھیں تو سیدھا اسی کی چیٹ کھلے گی۔' : ''}</div>`}`);
  }
  // ---------- 🧾 تھرمل رسید (58 / 80 ملی میٹر): بلوٹوتھ پرنٹر، عام پرنٹ، یا شیئر (پرنٹر ایپ) ----------
  function rcptMM(){ try{ return +localStorage.getItem('ab_rcpt') === 58 ? 58 : 80; }catch(e){ return 80; } }
  async function thermal(kind, key, mm){
    if(!cur || !cur.no){ toast('⚠️ پہلے پرچی محفوظ کریں'); return; }
    const r = calcParchi(cur, parchiCharges());
    if(kind == null){
      modal(`<h3>🧾 تھرمل رسید — کس کی؟</h3><div class="list">
        <div class="it" onclick="App.thermal('z')"><div><b>🧑‍🌾 زمیندار کی پرچی</b> <span class="muted">${esc(cur.zamindar)}</span></div><span class="num">${fmt(r.net)}</span></div>
        ${r.buyers.map((b, i) => `<div class="it" onclick="App.thermal('b',${i})"><div><b>🧑‍💼 ${esc(b.name)}</b> <span class="muted">خریدار کا بل</span></div><span class="num">${fmt(b.total)}</span></div>`).join('')}</div>
        <div class="row" style="justify-content:center;margin-top:8px"><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
      return;
    }
    const spec = kind === 'z' ? zamindarSpec(cur, r) : buyerSpec(cur, r, r.buyers[+key]);
    thermalShow(spec, kind === 'z' ? 'rcpt-' + cur.no : 'rcpt-' + cur.no + '-' + (+key + 1), mm);
  }
  // ایک ہی تھرمل پیش منظر: پرچی، خریدار کا بل، روز کا بل
  let thSpec = null;
  async function thermalShow(spec, file, mm){
    if(spec){ thSpec = { spec, file }; } else if(!thSpec) return;
    mm = mm || rcptMM();
    try{ localStorage.setItem('ab_rcpt', String(mm)); }catch(e){}
    const sp = Object.assign({}, thSpec.spec, { foot: [shopFoot(), urDate(today()) + ' ' + urTime(Date.now())].filter(Boolean).join(' • ') });
    const cv = await AB_RECEIPT.draw(sp, { thermal: mm });
    shareCv = { cv, file: thSpec.file + '.png', thermal: mm };
    const bt = AB_RECEIPT.btSupported();
    modal(`<h3>🧾 تھرمل رسید</h3>
      <div class="row" style="justify-content:center;margin-bottom:6px">${[58, 80].map(x => `<button class="btn ${x === mm ? '' : 'light'} sm" onclick="App.thermalShow(null,null,${x})"><span class="num">${x}</span> ملی میٹر</button>`).join('')}</div>
      <div style="background:#e7e5e4;padding:8px;border-radius:10px;max-height:52vh;overflow:auto"><img src="${cv.toDataURL('image/png')}" style="width:${mm === 58 ? 220 : 300}px;max-width:100%;display:block;margin:auto;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)" alt=""></div>
      <div class="row" style="justify-content:center;margin-top:8px">${bt ? `<button class="btn" onclick="App.thermalBT()">🖨️ بلوٹوتھ پرنٹر${AB_RECEIPT.btName() ? ' (' + esc(AB_RECEIPT.btName()) + ')' : ''}</button>` : ''}
        <button class="btn light" onclick="App.thermalPrint()">🖨️ عام پرنٹ</button><button class="btn light" onclick="App.shareSend()">📤 شیئر</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>
      <div class="muted" style="margin-top:4px">بلوٹوتھ پرنٹر نہ جڑے تو «📤 شیئر» سے پرنٹر کی اپنی ایپ چنیں۔ کمپیوٹر سے جڑا پرنٹر ہو تو «عام پرنٹ»۔</div>`);
  }
  async function thermalBT(){
    if(!shareCv) return;
    try{ toast('⏳ پرنٹر سے جڑ رہا ہے…'); await AB_RECEIPT.printBluetooth(shareCv.cv); toast('✅ رسید پرنٹر کو چلی گئی'); }
    catch(e){
      const m = e && e.message;
      toast(m === 'nobt' ? '⚠️ اس ڈیوائس پر بلوٹوتھ پرنٹ نہیں — «شیئر» سے پرنٹر ایپ چنیں' : m === 'nochar' ? '⚠️ یہ پرنٹر سیدھا نہیں جڑتا — «شیئر» سے اس کی ایپ چنیں' : (e && e.name === 'NotFoundError') ? 'پرنٹر نہیں چنا گیا' : '⚠️ پرنٹر سے رابطہ نہیں ہو سکا — پرنٹر چالو کر کے دوبارہ');
    }
  }
  function thermalPrint(){ if(shareCv && !AB_RECEIPT.printThermal(shareCv.cv, shareCv.thermal || rcptMM())) toast('⚠️ پرنٹ والا صفحہ نہیں کھل سکا'); }
  let shareCv = null;
  async function shareSend(){
    if(!shareCv) return;
    if(await AB_RECEIPT.share(shareCv.cv, shareCv.file)) return;
    AB_RECEIPT.download(shareCv.cv, shareCv.file);
    toast('⬇️ تصویر محفوظ ہو گئی — واٹس ایپ میں تصویر لگا کر بھیجیں');
  }
  async function shareChat(){
    if(!shareCv || !shareCv.phone) return;
    const ok = await AB_RECEIPT.copyImage(shareCv.cv);
    toast(ok ? '📋 تصویر کاپی ہو گئی — چیٹ میں دبا کر «پیسٹ» کریں' : '⬇️ تصویر محفوظ کی — چیٹ میں لگا دیں');
    if(!ok) AB_RECEIPT.download(shareCv.cv, shareCv.file);
    window.open('https://wa.me/' + shareCv.phone, '_blank');
  }
  function shareSave(){ if(shareCv){ AB_RECEIPT.download(shareCv.cv, shareCv.file); toast('⬇️ تصویر محفوظ'); } }

  // ---------- 🧾 خریدار (گاہک) کا روز کا بل — منڈی کے ہاتھ والے بل جیسا: اس دن کا سارا مال، سابقہ بقایا، آج وصولی، باقی بقایا ----------
  function buyerDay(pid, date){
    const rows = [], chg = {}, nos = []; let goods = 0, total = 0, nag = 0;
    liveParchis().filter(p => p.date === date).sort((a, b) => a.no - b.no).forEach(p => {
      const r = calcParchi(p, p.chargesSnap || chargesList());
      r.buyers.filter(b => b.id === pid).forEach(b => {
        nos.push(p.no);
        r.lines.filter(l => l.buyerId === pid).forEach(l => rows.push({ l, z: p.zamindar }));
        b.charges.forEach(x => { if(x.amount) chg[x.name] = (chg[x.name] || 0) + x.amount; });
        goods += b.goods; total += b.total; nag += b.nag;
      });
    });
    const L = ledger(pid); let prev = 0, rec = 0, gave = 0;
    L.rows.forEach(r => { if((r.date || '') < date) prev += r.amt; else if(r.date === date && r.cash){ if(r.amt < 0) rec -= r.amt; else gave += r.amt; } });
    return { rows, chg, nos, goods, total, nag, prev, rec, gave, end: prev + total - rec + gave };
  }
  function buyerDayDates(pid){
    const s = new Set();
    liveParchis().forEach(p => { if(p.lines.some(l => l.buyerId === pid)) s.add(p.date); });
    liveCash().forEach(c => { if(c.partyId === pid) s.add(c.date); });
    return [...s].sort().reverse();
  }
  function dayBillSpec(pid, date){
    const p = party(pid), d = buyerDay(pid, date);
    const pre = d.prev ? [['سابقہ بقایا' + (d.prev < 0 ? ' (ہمارے ذمے)' : ''), fmt(Math.abs(d.prev)), '']] : [];
    return { shop: shopName(), sub: shopSub(), title: 'خریدار کا بل — ' + urDate(date),
      meta: [['تاریخ', urDate(date)], ['خریدار', p.name + (pNo(p) ? ' (نمبر ' + pNo(p) + ')' : '')]].concat(d.nos.length ? [['پرچی نمبر', d.nos.join('، ')]] : []),
      cols: [{ t: 'جنس', w: 3.6 }, { t: 'نگ', w: 1.4, num: 1 }, { t: 'ریٹ', w: 2 }, { t: 'رقم', w: 2.4, num: 1 }],
      rows: d.rows.map(x => [lineFull(x.l), x.l.nag || (x.l.grams ? (int(x.l.grams) / 1000) + ' کلو' : ''), fmt(int(x.l.rate)) + (x.l.basis === 'maund' ? ' / من' : ''), fmt(lineAmount(x.l))]),
      lines: (d.rows.length ? [['آج کا مال (' + d.nag + ' نگ)', fmt(d.goods), '']].concat(Object.keys(d.chg).map(k => ['➕ ' + k, fmt(d.chg[k]), '']), [['آج کا بل', fmt(d.total), 'tot']]) : [['آج کوئی مال نہیں', '0', '']])
        .concat(pre, d.prev ? [['کل رقم', fmt(d.prev + d.total), 'tot']] : [])
        .concat(d.rec ? [['➖ آج وصول ہوئے', fmt(d.rec), '']] : [], d.gave ? [['➕ آج اسے دیے', fmt(d.gave), '']] : [])
        .concat([['باقی بقایا — ' + balText('buyer', d.end), fmt(Math.abs(d.end)), 'net']]),
      sub2: shopContacts(), foot: [shopFoot(), urDate(today())].filter(Boolean).join(' • ') };
  }
  let dayBillSel = null;
  async function dayBill(pid, date){
    const p = party(pid); if(!p || p.type !== 'buyer'){ toast('⚠️ خریدار چنیں'); return; }
    if(!window.AB_RECEIPT){ toast('⚠️ تصویر نہیں بن سکی'); return; }
    const ds = buyerDayDates(pid);
    date = date || (ds.includes(today()) || !ds.length ? today() : ds[0]);
    dayBillSel = { pid, date };
    const spec = dayBillSpec(pid, date), cv = await AB_RECEIPT.draw(spec);
    const phone = p.phone && window.AB_LIC ? AB_LIC.normPhone(p.phone) : '';
    shareCv = { cv, file: 'bill-' + (pNo(p) || 'k') + '-' + date + '.png', phone, name: p.name };
    modal(`<h3>🧾 ${esc(p.name)} — روز کا بل</h3>
      <div class="row" style="justify-content:center;margin-bottom:6px"><input type="date" value="${esc(date)}" onchange="App.dayBill('${pid}',this.value)" style="max-width:180px">
        ${ds.slice(0, 6).map(x => `<button class="btn ${x === date ? '' : 'light'} sm" onclick="App.dayBill('${pid}','${x}')">${esc(urDate(x))}</button>`).join('')}</div>
      <img src="${cv.toDataURL('image/png')}" style="width:100%;border-radius:10px;border:1px solid var(--l3)" alt="">
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn wa" onclick="App.shareSend()">📤 بھیجیں</button>
        ${phone ? `<button class="btn light" onclick="App.shareChat()">💬 ${esc(p.name)} کی چیٹ</button>` : ''}
        <button class="btn light" onclick="App.dayBillPrint()">🖨️ پرنٹ</button><button class="btn light" onclick="App.dayBillThermal()">🧾 تھرمل</button>
        <button class="btn light" onclick="App.shareSave()">⬇️ محفوظ</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
  }
  function dayBillThermal(){ if(!dayBillSel) return; const p = party(dayBillSel.pid); thermalShow(dayBillSpec(dayBillSel.pid, dayBillSel.date), 'rcpt-' + (pNo(p) || 'k') + '-' + dayBillSel.date); }
  function dayBillPrint(){
    if(!dayBillSel) return; const sp = dayBillSpec(dayBillSel.pid, dayBillSel.date);
    printDoc(sp.title, `<div style="text-align:center;margin-bottom:6px">${sp.meta.map(m => esc(m[0]) + ': <b>' + esc(m[1]) + '</b>').join(' • ')}</div>
      <div class="card"><table class="t"><tr>${sp.cols.map(c => `<th class="${c.num ? 'v' : ''}">${esc(c.t)}</th>`).join('')}</tr>
      ${sp.rows.map(r => `<tr>${r.map((v, i) => `<td class="${sp.cols[i].num || i > 1 ? 'v' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
      ${sp.lines.map(l => `<tr class="${l[2] || ''}"><td colspan="${sp.cols.length - 1}">${esc(l[0])}</td><td class="v">${esc(l[1])}</td></tr>`).join('')}</table></div>`);
  }
  function dayBillFromCash(){ const el = $('cP'), p = el && (findParty('buyer', el.value) || partyByNo('buyer', el.value)); if(!p){ toast('⚠️ پہلے خریدار کا نام یا نمبر لکھیں'); return; } dayBill(p.id); }

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
        <div class="muted">${esc(urDate(p.date))} ${p.vehicle ? '• گاڑی ' + esc(p.vehicle) : ''} • بکری ${rs(t.gross || 0)} • صاف ${rs(t.net || 0)}${p.by ? ' • 👤 ' + esc(p.by) : ''}</div></div>
        <button class="btn gray sm" onclick="event.stopPropagation();App.delParchi('${p.id}')">🗑️</button></div>`; }).join('');
    return `<div class="pageTitle">📚 پرچیاں<span class="sp"></span><button class="btn gold sm" onclick="App.go('parchi')">📝 نئی پرچی</button></div>
      <div class="card"><div class="row"><div class="f" style="flex:1 1 280px;min-width:0"><label>تاریخ سے چنیں (خالی = سب)</label><input type="date" value="${esc(listDate)}" onchange="App.setListDate(this.value)"></div>
        ${listDate ? '<button class="btn gray sm" onclick="App.setListDate(\'\')">سب دکھائیں</button>' : ''}</div>
        <table class="t" style="margin-top:6px"><tr><td>پرچیاں</td><td class="v">${live.length}</td></tr><tr><td>کل بکری</td><td class="v">${fmt(g)}</td></tr><tr class="tot"><td>آڑھتی کی کمائی</td><td class="v">${fmt(inc)}</td></tr></table></div>
      <div class="card"><div class="list">${rows || '<div class="muted">کوئی پرچی نہیں</div>'}</div></div>
      ${bin.length ? `<div class="card"><h3>🗑️ ردی کی ٹوکری (${bin.length})</h3><div class="list">${bin.map(p => `<div class="it"><div>نمبر <span class="num">${p.no}</span> — ${esc(p.zamindar)} <span class="muted">${esc(urDate(p.date))}</span></div>
        <button class="btn light sm" onclick="App.restoreParchi('${p.id}')">↩️ واپس لائیں</button></div>`).join('')}</div></div>` : ''}`;
  };
  async function delParchi(id){
    const p = DB.parchis.find(x => x.id === id); if(!p) return;
    if(!(await ownerOk())) return;
    if(!(await unlockFor(p.date))) return;
    if(!(await ask('پرچی نمبر ' + p.no + ' (' + esc(p.zamindar) + ') ردی کی ٹوکری میں چلی جائے گی اور کھاتوں سے نکل جائے گی۔ بعد میں واپس لائی جا سکتی ہے۔'))) return;
    p.deleted = Date.now(); put('parchis');
    { const c = DB.cash.find(x => x.id === 'pc_' + p.id && !x.deleted); if(c){ c.deleted = Date.now(); c.byParchi = 1; put('cash'); } }
    logIt('پرچی ' + p.no + ' ردی میں', p.id); render(); toast('🗑️ ردی کی ٹوکری میں');
  }
  async function restoreParchi(id){ const p = DB.parchis.find(x => x.id === id); if(!p) return; if(!(await ownerOk())) return; delete p.deleted; put('parchis'); { const c = DB.cash.find(x => x.id === 'pc_' + p.id && x.byParchi); if(c){ delete c.deleted; delete c.byParchi; put('cash'); } } logIt('پرچی ' + p.no + ' واپس', p.id); render(); toast('✅ پرچی واپس آ گئی'); }

  // =====================================================================
  //   زمیندار / خریدار
  // =====================================================================
  let partySearch = '';
  function viewParties(type){
    numberParties();
    const qn = C.en ? C.en(partySearch).trim() : partySearch;
    const list = parties(type).filter(p => !qn || p.name.includes(qn) || (p.phone || '').includes(qn) || String(pNo(p)) === qn)
      .map(p => ({ p, bal: ledger(p.id).bal })).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));
    const sum = list.reduce((s, x) => s + (x.bal > 0 ? x.bal : 0), 0);
    if(!window.__pOld) return partyCards(type, list, sum);
    return `<div class="pageTitle">${type === 'zamindar' ? '🧑‍🌾 زمیندار' : '🧑‍💼 خریدار'} (${parties(type).length})<span class="sp"></span>${type === 'buyer' ? '<button class="btn light sm" onclick="App.go(\'due\')">🔔 یاد دہانی</button>' : ''}<button class="btn gold sm" onclick="App.partyForm('${type}')">➕ نیا ${PT[type]}</button></div>
      <div class="card"><div class="f"><input placeholder="🔍 نام، نمبر یا فون سے تلاش" value="${esc(partySearch)}" oninput="App.psearch(this.value,'${type}')"></div>
        <table class="t" style="margin-top:6px"><tr class="tot"><td>${type === 'zamindar' ? 'کل جو زمینداروں کو دینے ہیں' : 'کل جو خریداروں سے لینے ہیں'}</td><td class="v">${fmt(sum)}</td></tr></table></div>
      <div class="card"><div class="list" id="plist">${list.map(x => `<div class="it" onclick="App.go('party','${x.p.id}')"><div><span class="pnoTag num">${pNo(x.p)}</span> <b>${esc(x.p.name)}</b> <span class="muted">${esc(x.p.place || '')} ${esc(x.p.phone || '')}</span>
        <div class="muted">${balText(type, x.bal)}${type === 'buyer' && x.p.limit && x.bal > x.p.limit ? ' • <span class="tag out">⛔ حد سے زیادہ</span>' : ''}${type === 'zamindar' && x.bal < 0 ? ' • پیشگی باقی' : ''}</div></div><div class="a ${x.bal > 0 ? (type === 'zamindar' ? 'amt-out' : 'amt-in') : ''}">${fmt(Math.abs(x.bal))}</div></div>`).join('') || '<div class="muted">کوئی کھاتہ نہیں — پرچی محفوظ کرنے پر خود بن جاتا ہے</div>'}</div></div>`;
  }
  // ---------- 👥 کھاتوں کی فہرست — سبزی منڈی کے «گاہک / بیوپاری» جیسی: تلاش + ➕، چھانٹی، کارڈ پر فون / واٹس ایپ / وصولی ----------
  let partyFilter = 'all';
  function partyCards(type, list, sum){
    const z = type === 'zamindar';
    const shown = list.filter(x => partyFilter === 'all' || (partyFilter === 'due' ? x.bal !== 0 : x.bal === 0));
    const wa = ph => window.AB_LIC && ph ? AB_LIC.normPhone(ph) : '';
    return `<div class="pageTitle">${z ? '🧑‍🌾 زمیندار' : '🧑‍💼 خریدار'} <span class="cntPill num">${parties(type).length}</span><span class="sp"></span>${!z ? '<button class="btn light sm" onclick="App.go(\'due\')">🔔 یاد دہانی</button>' : ''}</div>
      <div class="pzTop">
        <div class="pzSearch" style="margin-top:0"><input id="pS" value="${esc(partySearch)}" placeholder="🔍 نام، نمبر یا فون…" oninput="App.psearch(this.value,'${type}')"><button onclick="App.partyForm('${type}')" title="نیا ${PT[type]}">+</button></div>
        <div class="pfRow">${[['all', 'سب'], ['due', 'بقایا والے'], ['zero', 'حساب برابر']].map(f => `<button class="${partyFilter === f[0] ? 'on' : ''}" onclick="App.pfilter('${f[0]}')">${f[1]}</button>`).join('')}
          <span class="pfSum">${z ? 'کل دینے ہیں' : 'کل لینے ہیں'}: <b class="num">${fmt(sum)}</b></span></div></div>
      <div class="pcList">${shown.map(x => { const p = x.p, w = wa(p.phone), out = x.bal > 0 ? (z ? 'out' : 'in') : (x.bal < 0 ? (z ? 'in' : 'out') : '');
        return `<div class="pCard" onclick="App.go('party','${p.id}')"><span class="pAv num">${pNo(p) || '؟'}</span>
          <div class="pMid"><b>${esc(p.name)}</b><div class="muted">${esc([p.place, p.phone].filter(Boolean).join(' • ')) || '&nbsp;'}${!z && p.limit && x.bal > p.limit ? ' • <span class="tag out">⛔ حد سے زیادہ</span>' : ''}${z && x.bal < 0 ? ' • پیشگی' : ''}</div>
            <div class="pAct" onclick="event.stopPropagation()">${p.phone ? `<a class="pa" href="tel:${esc(p.phone)}" title="فون">📞</a>` : ''}${w ? `<a class="pa wa" href="https://wa.me/${w}" target="_blank" title="واٹس ایپ">💬</a>` : ''}<button class="pa" onclick="App.go('cash','${z ? 'pay' : 'receive'}:${p.id}')" title="${z ? 'ادائیگی' : 'وصولی'}">${z ? '💸' : '💵'}</button>${!z ? `<button class="pa" onclick="App.dayBill('${p.id}')" title="روز کا بل">🧾</button>` : ''}</div></div>
          <div class="pBal ${out}"><span class="num">${fmt(Math.abs(x.bal))}</span><small>${balText(type, x.bal)}</small></div></div>`; }).join('') || '<div class="card muted">کوئی کھاتہ نہیں — ➕ سے بنائیں یا پرچی محفوظ کرنے پر خود بن جاتا ہے</div>'}</div>`;
  }
  VIEWS.zamindar = () => viewParties('zamindar');
  VIEWS.buyer = () => viewParties('buyer');
  VIEWS.party = function(id){
    const p = party(id); if(!p) return '<div class="card">کھاتہ نہیں ملا</div>';
    const L = ledger(id);
    if(!window.__pOld){
      const z = p.type === 'zamindar', T = cashTotals(p), w = window.AB_LIC && p.phone ? AB_LIC.normPhone(p.phone) : '';
      return `<div class="pageTitle">${z ? '🧑‍🌾' : '🧑‍💼'} ${PT[p.type]} کا کھاتہ<span class="sp"></span><button class="btn light sm" onclick="App.go('${p.type}')">↩️ فہرست</button></div>
        <div class="pHero ${L.bal ? '' : 'zero'}"><span class="pAv num">${pNo(p) || '؟'}</span><div class="pMid"><b>${esc(p.name)}</b>
          <div class="s">${esc([p.place, p.phone].filter(Boolean).join(' • '))}${p.limit ? ' • ادھار کی حد ' + fmt(p.limit) : ''}</div></div>
          <div class="pBig"><span class="num">${fmt(Math.abs(L.bal))}</span><small>${balText(p.type, L.bal)}</small></div></div>
        ${p.limit && L.bal > p.limit ? `<div class="warn">⛔ ادھار حد سے <span class="num">${fmt(L.bal - p.limit)}</span> روپے زیادہ</div>` : ''}
        <div class="pChips"><div><span>کل جمع</span><b class="num">${fmt(T.jam)}</b></div><div><span>کل بنام</span><b class="num">${fmt(T.banam)}</b></div><div><span>اندراج</span><b class="num">${L.rows.length}</b></div></div>
        <div class="pBtns">
          <button onclick="App.go('cash','${z ? 'pay' : 'receive'}:${p.id}')"><span>${z ? '💸' : '💵'}</span>${z ? 'ادائیگی' : 'وصولی'}</button>
          ${!z ? `<button onclick="App.dayBill('${p.id}')"><span>🧾</span>روز کا بل</button>` : `<button onclick="App.newParchiFor('${p.id}')"><span>📝</span>نئی پرچی</button>`}
          <button onclick="App.printLedger('${p.id}')"><span>🖨️</span>پرنٹ</button>
          ${p.phone ? `<a href="tel:${esc(p.phone)}"><span>📞</span>فون</a>` : ''}${w ? `<a href="https://wa.me/${w}" target="_blank"><span>💬</span>واٹس ایپ</a>` : ''}
          <button onclick="App.partyForm('${p.type}','${p.id}')"><span>✏️</span>بدلیں</button></div>
        <div class="card"><h3>📖 کھاتہ</h3><div class="tblWrap">${ledgerTable(p, L)}</div></div>`;
    }
    return `<div class="pageTitle">${p.type === 'zamindar' ? '🧑‍🌾' : '🧑‍💼'} ${esc(p.name)}<span class="sp"></span>
        <button class="btn gold sm" onclick="App.go('cash','${p.type === 'zamindar' ? 'pay' : 'receive'}:${p.id}')">${p.type === 'zamindar' ? '💸 ادائیگی' : '💵 وصولی'}</button>
        ${p.type === 'buyer' ? `<button class="btn light sm" onclick="App.dayBill('${p.id}')">🧾 روز کا بل</button>` : ''}
        <button class="btn light sm" onclick="App.printLedger('${p.id}')">🖨️</button>
        <button class="btn light sm" onclick="App.partyForm('${p.type}','${p.id}')">✏️</button></div>
      <div class="card"><div class="muted">${PT[p.type]} ${pNo(p) ? '• کھاتہ نمبر <span class="num">' + pNo(p) + '</span>' : ''} ${p.place ? '• ' + esc(p.place) : ''} ${p.phone ? '• فون ' + esc(p.phone) : ''}${p.limit ? ' • ادھار کی حد ' + fmt(p.limit) : ''}</div>
        ${p.limit && L.bal > p.limit ? `<div class="warn">⛔ ادھار حد سے <span class="num">${fmt(L.bal - p.limit)}</span> روپے زیادہ</div>` : ''}
        <table class="t"><tr class="net"><td>${balText(p.type, L.bal)}</td><td class="v">${fmt(Math.abs(L.bal))}</td></tr></table></div>
      <div class="card"><h3>📖 کھاتہ</h3><div class="tblWrap">${ledgerTable(p, L)}</div></div>`;
  };
  function ledgerTable(p, L){
    const z = p.type === 'zamindar';
    // منشی کی زبان: زمیندار کو مال کی رقم «جمع»، ادائیگی «بنام»؛ خریدار پر مال «بنام»، وصولی «جمع»
    return `<table class="t"><tr><th>تاریخ</th><th>تفصیل</th><th class="v">${z ? 'جمع' : 'بنام'}</th><th class="v">${z ? 'بنام' : 'جمع'}</th><th class="v">بقایا</th></tr>
      ${L.rows.map(r => `<tr ${r.parchi ? `onclick="App.go('parchi','${r.parchi}')" style="cursor:pointer"` : ''}><td>${esc(urDate(r.date))}</td><td>${esc(r.text)}</td>
        <td class="v">${r.amt > 0 ? fmt(r.amt) : ''}</td><td class="v">${r.amt < 0 ? fmt(-r.amt) : ''}</td><td class="v">${fmt(r.bal)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">ابھی کوئی اندراج نہیں</td></tr>'}</table>`;
  }
  function printLedger(id){
    const p = party(id); const L = ledger(id);
    printDoc('کھاتہ — ' + p.name, `<h3 style="text-align:center">${PT[p.type]} کا کھاتہ: ${esc(p.name)}${pNo(p) ? ' (نمبر <span class="num">' + pNo(p) + '</span>)' : ''} ${p.place ? '— ' + esc(p.place) : ''}</h3>${ledgerTable(p, L)}
      <table class="t" style="margin-top:8px"><tr class="net"><td>${balText(p.type, L.bal)}</td><td class="v">${fmt(Math.abs(L.bal))}</td></tr></table>`);
  }
  function partyForm(type, id){
    const p = id ? party(id) : { name: '', phone: '', place: '', opening: 0, no: nextPartyNo(type) };
    modal(`<h3>${id ? 'کھاتہ بدلیں' : 'نیا ' + PT[type]}</h3><div style="text-align:right">
      <div class="grid2"><div class="f"><label>کھاتہ نمبر</label><input id="pfNo" inputmode="numeric" value="${esc(pNo(p))}"></div>
      <div class="f"><label>نام</label><input id="pfN" value="${esc(p.name)}"></div></div>
      <div class="f"><label>فون</label><input id="pfP" inputmode="tel" value="${esc(p.phone)}"></div>
      <div class="f"><label>گاؤں / شہر</label><input id="pfL" value="${esc(p.place)}"></div>
      <div class="f"><label>پچھلا بقایا (روپے) — ${type === 'zamindar' ? 'جو ہم نے اسے دینے ہیں' : 'جو اس سے لینے ہیں'}</label><input id="pfO" inputmode="decimal" value="${esc(inRs(p.opening))}" placeholder="0"></div>
      ${type === 'buyer' ? `<div class="grid2"><div class="f"><label>ادھار کی حد (روپے؛ خالی = کوئی حد نہیں)</label><input id="pfLim" inputmode="decimal" value="${esc(inRs(p.limit))}" placeholder="مثلاً 500000"></div>
        <div class="f"><label>یاد دہانی: کتنے دن بعد (خالی = عام)</label><input id="pfDue" inputmode="numeric" value="${esc(p.dueDays || '')}" placeholder="${int(DB.settings.dueDays) || 7}"></div></div>` : ''}</div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" onclick="App.saveParty('${type}','${id || ''}')">💾 محفوظ</button><button class="btn gray" onclick="App.closeModal()">منسوخ</button></div>`);
  }
  function saveParty(type, id){
    const name = $('pfN').value.trim(); if(!name){ toast('⚠️ نام لکھیں'); return; }
    const dup = findParty(type, name); if(dup && dup.id !== id){ toast('⚠️ اس نام کا ' + PT[type] + ' پہلے سے موجود ہے'); return; }
    const no = int($('pfNo').value) || nextPartyNo(type), dn = partyByNo(type, no);
    if(dn && dn.id !== id){ toast('⚠️ نمبر ' + no + ' پہلے سے ' + dn.name + ' کا ہے'); return; }
    let p = id ? party(id) : null;
    if(!p){ p = { id: uid(), type, createdAt: Date.now() }; DB.parties.push(p); }
    p.no = no;
    const oldName = p.name;
    Object.assign(p, { name, phone: $('pfP').value.trim(), place: $('pfL').value.trim(), opening: toPaisa($('pfO').value) });
    if(type === 'buyer' && $('pfLim')){ p.limit = toPaisa($('pfLim').value) || 0; p.dueDays = int($('pfDue').value) || 0; }
    if(oldName && oldName !== name){ DB.parchis.forEach(x => { if(x.zamindarId === p.id) x.zamindar = name; x.lines.forEach(l => { if(l.buyerId === p.id) l.buyer = name; }); }); put('parchis'); }
    put('parties'); logIt((id ? 'کھاتہ بدلا: ' : 'نیا کھاتہ: ') + name, p.id); closeModal(); render(); toast('✅ محفوظ');
  }

  // =====================================================================
  //   وصولی / ادائیگی
  // =====================================================================
  // =====================================================================
  //   🔍 تلاش — پرچی نمبر، گاڑی، بلٹی، زمیندار، خریدار، جنس، فون، رقم؛ کئی الفاظ کسی بھی ترتیب میں
  // =====================================================================
  let sQuery = '';
  const norm = s => C.en ? C.en(s) : String(s == null ? '' : s);
  function sWords(q){ return norm(q).toLowerCase().replace(/[،,]/g, ' ').split(/\s+/).filter(Boolean); }
  function sHit(hay, words){ const h = norm(hay).toLowerCase(); const hn = h.replace(/[\s\-]/g, ''); return words.every(w => h.indexOf(w) >= 0 || hn.indexOf(w.replace(/-/g, '')) >= 0); }
  function searchResults(q){
    const words = sWords(q); if(!words.length) return '<div class="muted">پرچی نمبر، گاڑی نمبر، بلٹی، زمیندار یا خریدار کا نام، جنس، فون نمبر یا رقم لکھیں۔ کئی الفاظ بھی لکھ سکتے ہیں، جیسے «اکرم آم»۔</div>';
    const out = [];
    if(canSee('parchis') || canSee('parchi')){
      const exact = words.length === 1 && /^\d+$/.test(words[0]) ? +words[0] : 0;
      const ps = liveParchis().filter(p => {
        const hay = ['نمبر ' + p.no, p.no, p.zamindar, p.place, p.vehicle, p.bilty, p.note, urDate(p.date), p.date, p.by, (p.totals && inRs(p.totals.gross)) || '']
          .concat(p.lines.map(l => l.item + ' ' + l.buyer)).join(' | ');
        return (exact && p.no === exact) || sHit(hay, words);
      }).sort((a, b) => (exact && b.no === exact) - (exact && a.no === exact) || (b.date || '').localeCompare(a.date || '') || b.no - a.no).slice(0, 60);
      if(ps.length) out.push(`<div class="card"><h3>📚 پرچیاں (${ps.length})</h3><div class="list">${ps.map(p => { const t = p.totals || {};
        const buyers = [...new Set(p.lines.map(l => l.buyer).filter(Boolean))].join('، '), items = [...new Set(p.lines.map(l => l.item).filter(Boolean))].join('، ');
        return `<div class="it" onclick="App.go('parchi','${p.id}')"><div><b>نمبر <span class="num">${p.no}</span> — ${esc(p.zamindar)}</b>
          <div class="muted">${esc(urDate(p.date))}${p.vehicle ? ' • گاڑی ' + esc(p.vehicle) : ''}${p.bilty ? ' • بلٹی ' + esc(p.bilty) : ''} • ${esc(items)} • خریدار: ${esc(buyers)}</div></div>
          <span class="num">${fmt(t.gross || 0)}</span></div>`; }).join('')}</div></div>`);
    }
    if(canSee('party')){
      const pt = DB.parties.filter(p => !p.deleted && canSee(p.type) && (sHit([p.name, p.phone, p.place, PT[p.type], 'نمبر ' + pNo(p)].join(' | '), words) || (words.length === 1 && String(pNo(p)) === words[0]))).slice(0, 60);
      if(pt.length) out.push(`<div class="card"><h3>👥 کھاتے (${pt.length})</h3><div class="list">${pt.map(p => { const b = ledger(p.id).bal;
        return `<div class="it" onclick="App.go('party','${p.id}')"><div><b>${p.type === 'zamindar' ? '🧑‍🌾' : '🧑‍💼'} ${esc(p.name)}</b> <span class="muted">${PT[p.type]} ${p.place ? '• ' + esc(p.place) : ''} ${p.phone ? '• ' + esc(p.phone) : ''}</span>
          <div class="muted">${balText(p.type, b)}</div></div><span class="num">${fmt(Math.abs(b))}</span></div>`; }).join('')}</div></div>`);
    }
    if(canSee('cash')){
      const cs = liveCash().filter(c => { const p = party(c.partyId);
        return sHit([p ? p.name : '', c.note, c.method, inRs(c.amount), urDate(c.date), c.date, c.kind === 'pay' ? 'ادائیگی' : 'وصولی', c.by].join(' | '), words); })
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.at - a.at).slice(0, 60);
      if(cs.length) out.push(`<div class="card"><h3>💵 وصولی / ادائیگی (${cs.length})</h3><div class="list">${cs.map(c => { const p = party(c.partyId);
        return `<div class="it" onclick="${p ? `App.go('party','${p.id}')` : ''}"><div>${c.kind === 'pay' ? '💸 ادائیگی' : '💵 وصولی'} — <b>${esc(p ? p.name : '')}</b>
          <div class="muted">${esc(urDate(c.date))} ${c.method ? '• ' + esc(c.method) : ''} ${c.note ? '• ' + esc(c.note) : ''}</div></div><span class="num ${c.kind === 'pay' ? 'amt-out' : 'amt-in'}">${fmt(c.amount)}</span></div>`; }).join('')}</div></div>`);
    }
    return out.join('') || '<div class="card"><div class="muted">کچھ نہیں ملا — لکھائی بدل کر دیکھیں</div></div>';
  }
  VIEWS.search = function(){
    return `<div class="pageTitle">🔍 تلاش</div>
      <div class="card"><div class="f"><input id="sQ" value="${esc(sQuery)}" placeholder="🔍 پرچی نمبر، گاڑی، نام، جنس، فون یا رقم" oninput="App.searchQ(this.value)" autocomplete="off"></div></div>
      <div id="sRes">${searchResults(sQuery)}</div>`;
  };
  AFTER.search = function(){ const i = $('sQ'); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length, i.value.length); }catch(e){} } };

  // =====================================================================
  //   🔔 وصولی کی یاد دہانی — جن خریداروں نے کئی دن سے ادائیگی نہیں کی؛ زمیندار جن پر پیشگی باقی
  // =====================================================================
  const daysAgo = iso => iso ? Math.floor((new Date(today()) - new Date(iso)) / 864e5) : 9999;
  function dueDays(p){ return int(p && p.dueDays) || int(DB.settings.dueDays) || 7; }
  function dueList(){
    return parties('buyer').map(p => {
      const L = ledger(p.id); if(L.bal <= 0) return null;
      const lastRec = liveCash().filter(c => c.partyId === p.id && c.kind !== 'pay').reduce((m, c) => c.date > m ? c.date : m, '');
      const firstDebt = (L.rows.find(r => r.amt > 0) || {}).date || '';
      const since = lastRec || firstDebt, d = daysAgo(since);
      return { p, bal: L.bal, lastRec, d, over: !!(p.limit && L.bal > p.limit), due: d >= dueDays(p) };
    }).filter(Boolean).sort((a, b) => (b.due - a.due) || (b.bal - a.bal));
  }
  function advList(){ return parties('zamindar').map(p => ({ p, bal: ledger(p.id).bal })).filter(x => x.bal < 0).sort((a, b) => a.bal - b.bal); }
  function dueBanner(){
    if(!(canSee('buyer') || canSee('cash'))) return '';
    const l = dueList().filter(x => x.due || x.over); if(!l.length) return '';
    return `<div class="licStrip warn" onclick="App.go('due')"><div>🔔 <span class="num">${l.length}</span> خریداروں کی ادائیگی رکی ہوئی — کل <span class="num">${fmt(l.reduce((s, x) => s + x.bal, 0))}</span> روپے</div><button class="btn gold sm">دیکھیں</button></div>`;
  }
  function remindText(x){
    return 'السلام علیکم ' + x.p.name + '،\n' + shopName() + ' کی طرف سے یاد دہانی: آپ کے ذمے ' + fmt(x.bal) + ' روپے بقایا ہیں'
      + (x.lastRec ? '، آخری ادائیگی ' + urDate(x.lastRec) + ' کو ہوئی تھی' : '') + '۔\nمہربانی فرما کر جلد ادائیگی کر دیں۔ شکریہ\n' + (DB.settings.phone ? 'رابطہ: ' + DB.settings.phone : '');
  }
  VIEWS.due = function(){
    const l = dueList(), adv = canSee('zamindar') ? advList() : [];
    const row = x => `<div class="it ${x.over ? 'overLim' : ''}"><div onclick="App.go('party','${x.p.id}')" style="flex:1;cursor:pointer"><b>${esc(x.p.name)}</b> ${x.over ? '<span class="tag out">⛔ حد سے زیادہ</span>' : ''}
        <div class="muted">${x.lastRec ? 'آخری وصولی: ' + esc(urDate(x.lastRec)) + ' • ' : 'ابھی کوئی وصولی نہیں • '}<span class="num">${x.d >= 9999 ? '—' : x.d}</span> دن${x.p.limit ? ' • حد: ' + fmt(x.p.limit) : ''}</div></div>
        <div class="row" style="gap:4px"><span class="num amt-in">${fmt(x.bal)}</span>
        ${x.p.phone ? `<button class="btn wa sm" onclick="App.remind('${x.p.id}')">💬</button><a class="btn light sm" href="tel:${esc(x.p.phone)}">📞</a>` : `<button class="btn light sm" onclick="App.partyForm('buyer','${x.p.id}')" title="فون لکھیں">📞➕</button>`}</div></div>`;
    const due = l.filter(x => x.due || x.over), rest = l.filter(x => !(x.due || x.over));
    return `<div class="pageTitle">🔔 وصولی کی یاد دہانی</div>
      <div class="card"><div class="row"><div class="f" style="flex:1"><label>کتنے دن ادائیگی نہ ہو تو یاد دہانی (عام حد؛ ہر خریدار کے کھاتے میں الگ بھی)</label><input inputmode="numeric" value="${int(DB.settings.dueDays) || 7}" onchange="App.setDueDays(this.value)"></div></div></div>
      <div class="card"><h3>🔴 ادائیگی رکی ہوئی (${due.length}) — <span class="num">${fmt(due.reduce((s, x) => s + x.bal, 0))}</span></h3><div class="list">${due.map(row).join('') || '<div class="muted">کوئی نہیں ✅</div>'}</div></div>
      ${rest.length ? `<div class="card"><h3>🟢 باقی ادھار (${rest.length}) — <span class="num">${fmt(rest.reduce((s, x) => s + x.bal, 0))}</span></h3><div class="list">${rest.map(row).join('')}</div></div>` : ''}
      ${adv.length ? `<div class="card"><h3>🧑‍🌾 زمینداروں پر پیشگی (${adv.length}) — <span class="num">${fmt(adv.reduce((s, x) => s - x.bal, 0))}</span></h3><div class="muted">یہ رقم ان کی اگلی پرچی کی صاف رقم سے خود کٹ جائے گی</div><div class="list">${adv.map(x => `<div class="it" onclick="App.go('party','${x.p.id}')"><div><b>${esc(x.p.name)}</b></div><span class="num amt-out">${fmt(-x.bal)}</span></div>`).join('')}</div></div>` : ''}`;
  };
  function remind(pid){
    const x = dueList().find(y => y.p.id === pid); if(!x) return;
    const ph = window.AB_LIC ? AB_LIC.normPhone(x.p.phone) : x.p.phone;
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(remindText(x)), '_blank');
    logIt('یاد دہانی بھیجی: ' + x.p.name + ' — ' + fmt(x.bal), x.p.id);
  }

  // ---------- 💵 وصولی / ادائیگی (منڈی کے کمپیوٹر جیسا): نمبر، کھاتہ، تفصیل، جمع / بنام؛ کھاتے کا کل جمع / کل بنام؛ پچھلی / اگلی ----------
  // arg: 'receive:<id>' (خریدار) • 'pay:<id>' (زمیندار) • 'v:<اندراج>' (پرانا اندراج دیکھیں / بدلیں)
  function numberCash(){
    const miss = DB.cash.filter(c => !int(c.no)); if(!miss.length) return;
    let n = DB.cash.reduce((m, c) => Math.max(m, int(c.no)), 0);
    miss.sort((x, y) => (x.at || 0) - (y.at || 0) || String(x.id).localeCompare(String(y.id))).forEach(c => { c.no = ++n; });
    put('cash');
  }
  function nextCashNo(){ return DB.cash.reduce((m, c) => Math.max(m, int(c.no)), 0) + 1; }
  function cashTotals(p){
    const L = ledger(p.id); let up = 0, down = 0;
    L.rows.forEach(r => { if(r.amt > 0) up += r.amt; else down -= r.amt; });
    // زمیندار: مال کی رقم «جمع»، ادائیگی «بنام» • خریدار: مال «بنام»، وصولی «جمع»
    return p.type === 'zamindar' ? { jam: up, banam: down, bal: L.bal } : { jam: down, banam: up, bal: L.bal };
  }
  VIEWS.cash = function(a){
    numberCash();
    const [k0, id0] = String(a || 'receive:').split(':');
    const ed = k0 === 'v' ? DB.cash.find(c => c.id === id0 && !c.deleted) : null;
    const edP = ed ? party(ed.partyId) : null;
    const type = ed ? (edP ? edP.type : 'buyer') : (k0 === 'pay' ? 'zamindar' : 'buyer');
    const pp = ed ? edP : (id0 ? party(id0) : null);
    const ls = liveCash().slice().sort((x, y) => int(x.no) - int(y.no));
    const prev = ed ? ls.filter(c => int(c.no) < int(ed.no)).pop() : ls[ls.length - 1];
    const next = ed ? ls.find(c => int(c.no) > int(ed.no)) : null;
    const jam = ed && ed.kind === 'receive' ? inRs(ed.amount) : '', banam = ed && ed.kind === 'pay' ? inRs(ed.amount) : '';
    const recent = liveCash().slice().sort((x, y) => y.at - x.at).slice(0, 30);
    return `<div class="pageTitle">💵 وصولی / ادائیگی<span class="sp"></span>
        <button class="btn light sm" ${prev ? `onclick="App.go('cash','v:${prev.id}')" title="نمبر ${int(prev.no)}"` : 'disabled'}>➡️ پچھلی</button>
        <button class="btn light sm" ${next ? `onclick="App.go('cash','v:${next.id}')" title="نمبر ${int(next.no)}"` : 'disabled'}>اگلی ⬅️</button>
        <button class="btn gold sm" onclick="App.go('cash','${type === 'zamindar' ? 'pay' : 'receive'}:')">🆕 نئی</button></div>
      ${ed ? '' : `<div class="cashTabs"><button class="in ${type === 'buyer' ? 'on' : ''}" onclick="App.go('cash','receive:')"><span>💵</span>خریدار سے وصولی</button><button class="out ${type === 'zamindar' ? 'on' : ''}" onclick="App.go('cash','pay:')"><span>💸</span>زمیندار کو ادائیگی</button></div>`}
      <div class="pzTop cashBox">
        <datalist id="dlP">${partyOpts(type)}</datalist>
        <div class="grid2 wideable">
          <div class="f"><label>نمبر</label><input class="num" value="${ed ? int(ed.no) : nextCashNo()}" disabled></div>
          <div class="f"><label>تاریخ</label><input id="cD" type="date" value="${esc(ed ? ed.date : today())}"></div>
          <div class="f" style="grid-column:1/-1"><label>${PT[type]} — نام یا کھاتہ نمبر</label><div class="pzRow"><input id="cP" list="dlP" value="${esc(pp ? pp.name : '')}" placeholder="نام یا کھاتہ نمبر" ${ed ? 'disabled' : ''} oninput="App.cashHint('${type}')" onchange="App.cashNum('${type}')" style="flex:1;min-width:0">${ed ? '' : `<button class="pzPlus" onclick="App.cashPick('${type}')" title="فہرست">▾</button>`}</div></div>
          <div class="f" style="grid-column:1/-1"><label>تفصیل</label><input id="cN" value="${esc(ed ? ed.note || '' : '')}" placeholder="مثلاً نقد، بینک، چیک نمبر…"></div>
          <div class="f"><label>جمع (روپے) — رقم آئی</label><input id="cJ" class="jam" inputmode="decimal" value="${esc(jam)}" placeholder="0" oninput="App.cashSide('J')"></div>
          <div class="f"><label>بنام (روپے) — رقم دی</label><input id="cB" class="banam" inputmode="decimal" value="${esc(banam)}" placeholder="0" oninput="App.cashSide('B')"></div>
          <div class="f"><label>طریقہ</label><select id="cM">${['نقد', 'بینک', 'چیک', 'موبائل والٹ'].map(m => `<option ${ed && ed.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          ${type === 'zamindar' ? `<div class="f"><label>ادائیگی کی قسم</label><select id="cT"><option value="">عام ادائیگی (حساب میں سے)</option><option value="adv" ${ed && ed.adv ? 'selected' : ''}>پیشگی (ایڈوانس) — مال آنے سے پہلے</option></select></div>` : ''}
        </div>
        <div id="cHint" style="margin:8px 0"></div>
        <div class="row"><button class="btn" style="flex:1" onclick="App.saveCash('${type}')">💾 ${ed ? 'تبدیلی محفوظ کریں' : 'محفوظ کریں'}</button>
          ${ed ? `<button class="btn gray" onclick="App.delCash('${ed.id}')">🗑️ حذف</button>` : ''}
          ${type === 'buyer' ? `<button class="btn light" onclick="App.dayBillFromCash()">🧾 روز کا بل</button>` : ''}</div>
        ${ed && ed.by ? `<div class="muted" style="margin-top:4px">👤 ${esc(ed.by)}${ed.edBy ? ' • بدلا: ' + esc(ed.edBy) : ''}</div>` : ''}</div>
      <h3 class="secHd">🕘 حالیہ اندراج</h3><div class="pcList">${recent.map(c => { const p = party(c.partyId), t = p ? p.type : 'buyer';
        return `<div class="pCard ${ed && ed.id === c.id ? 'sel' : ''}" onclick="App.go('cash','v:${c.id}')"><span class="pAv num ${c.kind === 'pay' ? 'out' : 'in'}">${int(c.no)}</span>
          <div class="pMid"><b>${esc(p ? p.name : '')}</b><div class="muted">${p ? PT[t] : ''} • ${esc(urDate(c.date))} • ${esc(cashText(c, t))}${c.note ? ' • ' + esc(c.note) : ''}${c.by ? ' • 👤 ' + esc(c.by) : ''}</div></div>
          <div class="pBal ${c.kind === 'pay' ? 'out' : 'in'}"><span class="num">${fmt(c.amount)}</span><small>${c.kind === 'pay' ? '💸 بنام' : '💵 جمع'}</small></div></div>`; }).join('') || '<div class="card muted">کوئی اندراج نہیں</div>'}</div>`;
  };
  AFTER.cash = function(){ const p = $('cP'); const a = String(arg || ''); const ed = a.startsWith('v:') ? DB.cash.find(c => c.id === a.slice(2)) : null;
    const t = ed ? ((party(ed.partyId) || {}).type || 'buyer') : (a.startsWith('pay') ? 'zamindar' : 'buyer'); cashHint(t); if(p && !p.value) p.focus(); };
  function cashPick(type){
    const list = parties(type).sort((a, b) => int(a.no) - int(b.no));
    modal(`<h3>${type === 'zamindar' ? '🧑‍🌾' : '🧑‍💼'} ${PT[type]} منتخب کریں</h3><div class="f"><input id="pzZq" placeholder="🔍 نام یا کھاتہ نمبر" oninput="App.pzZf(this.value)"></div>
      <div class="list" id="pzZl" style="text-align:right;max-height:55vh;overflow:auto">${list.map(x => { const b = ledger(x.id).bal; return `<div class="it" data-s="${esc(x.name + ' ' + pNo(x) + ' ' + (x.place || '') + ' ' + (x.phone || ''))}" onclick="App.cashSetP(decodeURIComponent('${encodeURIComponent(x.name)}'),'${type}')"><div><span class="pnoTag num">${pNo(x)}</span> <b>${esc(x.name)}</b> <span class="muted">${esc(x.place || '')}</span></div><span class="num muted">${b ? fmt(Math.abs(b)) : ''}</span></div>`; }).join('') || '<div class="muted">ابھی کوئی کھاتہ نہیں — نام خانے میں لکھ دیں، کھاتہ خود بن جائے گا</div>'}</div>
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
    setTimeout(() => { const e = $('pzZq'); if(e) e.focus(); }, 60);
  }
  function cashSide(w){ const o = $(w === 'J' ? 'cB' : 'cJ'), me_ = $(w === 'J' ? 'cJ' : 'cB'); if(o && me_ && String(me_.value).trim()) o.value = ''; }
  function cashNum(type){ const el = $('cP'), p = el && partyByNo(type, el.value); if(p){ el.value = p.name; cashHint(type); } }
  function cashHint(type){
    const el = $('cHint'); if(!el) return; const p = findParty(type, $('cP').value);
    if(!p){ el.innerHTML = ''; return; }
    const t = cashTotals(p);
    el.innerHTML = `<div class="cashSum"><div><span class="l">کھاتہ نمبر</span><b class="num">${pNo(p) || '—'}</b></div><div><span class="l">کل جمع</span><b class="num">${fmt(t.jam)}</b></div><div><span class="l">کل بنام</span><b class="num">${fmt(t.banam)}</b></div>
      <div class="${t.bal ? 'hot' : ''}"><span class="l">${balText(type, t.bal)}</span><b class="num">${fmt(Math.abs(t.bal))}</b></div></div>`;
  }
  async function saveCash(type){
    if(window.AB_LIC && !AB_LIC.canWrite()) return;
    if(type !== 'zamindar' && type !== 'buyer') type = type === 'pay' ? 'zamindar' : 'buyer'; // پرانا انداز
    const a = String(arg || ''), ed = a.startsWith('v:') ? DB.cash.find(c => c.id === a.slice(2) && !c.deleted) : null;
    const jam = toPaisa($('cJ').value), banam = toPaisa($('cB').value), date = $('cD').value || today();
    if((jam > 0) === (banam > 0)){ toast('⚠️ جمع یا بنام — کسی ایک خانے میں رقم لکھیں'); return; }
    const kind = jam > 0 ? 'receive' : 'pay', amount = jam || banam;
    const fields = { kind, amount, date, method: $('cM').value, note: $('cN').value.trim() };
    if(type === 'zamindar' && kind === 'pay' && $('cT') && $('cT').value === 'adv') fields.adv = true;
    if(ed){
      if(String(ed.id).startsWith('pc_')){ toast('⚠️ یہ نقد پرچی نمبر کے ساتھ لکھا ہے — پرچی کھول کر بدلیں'); return; }
      if(!(await ownerOk())) return;
      if(!(await unlockFor(ed.date)) || !(await unlockFor(date))) return;
      const before = fmt(ed.amount) + ' ' + (ed.kind === 'pay' ? 'بنام' : 'جمع');
      delete ed.adv; Object.assign(ed, fields, { edAt: Date.now(), edBy: (me() || {}).name || '' });
      put('cash'); logIt('اندراج نمبر ' + ed.no + ' بدلا: ' + before + ' ← ' + fmt(amount) + ' ' + (kind === 'pay' ? 'بنام' : 'جمع'), ed.id);
      toast('✅ اندراج نمبر ' + ed.no + ' بدل گیا'); render(); return;
    }
    const name = $('cP').value.trim();
    if(!name){ toast('⚠️ ' + PT[type] + ' کا نام یا نمبر لکھیں'); return; }
    if(!(await unlockFor(date))) return;
    let p = findParty(type, name) || partyByNo(type, name);
    if(!p){ p = ensureParty(type, name); toast('🆕 نیا کھاتہ بنا: ' + name); }   // نیا نام = نیا کھاتہ (پوچھے بغیر — پرچی کی طرح)
    const c = Object.assign({ id: uid(), no: nextCashNo(), partyId: p.id, at: Date.now(), by: (me() || {}).name || '' }, fields);
    DB.cash.push(c); put('cash'); logIt('اندراج نمبر ' + c.no + ' — ' + p.name + ': ' + fmt(amount) + ' ' + (kind === 'pay' ? 'بنام' : 'جمع'), c.id);
    toast('✅ نمبر ' + c.no + ' محفوظ — ' + p.name + ' ' + (kind === 'pay' ? 'بنام ' : 'جمع ') + fmt(amount) + ' روپے');
    go('cash', (type === 'zamindar' ? 'pay' : 'receive') + ':' + p.id);
  }
  async function delCash(id){
    const c = DB.cash.find(x => x.id === id); if(!c) return;
    if(!(await ownerOk())) return;
    if(!(await unlockFor(c.date))) return;
    if(!(await ask('یہ اندراج (' + fmt(c.amount) + ' روپے) ہٹا دیں؟ کھاتے سے نکل جائے گا۔'))) return;
    c.deleted = Date.now(); put('cash'); logIt('اندراج' + (c.no ? ' نمبر ' + c.no : '') + ' ہٹایا: ' + fmt(c.amount), c.id);
    if(screen === 'cash' && String(arg || '') === 'v:' + id){ const p = party(c.partyId); go('cash', (p && p.type === 'zamindar' ? 'pay' : 'receive') + ':' + (p ? p.id : '')); } else render();
  }

  // =====================================================================
  //   روزنامچہ
  // =====================================================================
  let rozDate = '';
  // =====================================================================
  //   📊 رپورٹیں (صرف مالک) — تاریخ چنیں؛ خلاصہ، زمیندار وار، خریدار وار، جنس وار، خرچے و کمیشن، مہینہ وار
  // =====================================================================
  const RP = { from: '', to: '', tab: 'sum', preset: 'month' };
  const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function rpPreset(k){
    const n = new Date(), y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
    const R = {
      today: [isoOf(n), isoOf(n)],
      yday: [isoOf(new Date(y, m, d - 1)), isoOf(new Date(y, m, d - 1))],
      week: [isoOf(new Date(y, m, d - 6)), isoOf(n)],
      month: [isoOf(new Date(y, m, 1)), isoOf(n)],
      last: [isoOf(new Date(y, m - 1, 1)), isoOf(new Date(y, m, 0))],
      year: [isoOf(new Date(y, 0, 1)), isoOf(n)],
      all: ['', '']
    }[k];
    if(R){ RP.from = R[0]; RP.to = R[1]; RP.preset = k; }
  }
  rpPreset('month');
  const inRange = date => (!RP.from || date >= RP.from) && (!RP.to || date <= RP.to);
  function rpData(){
    const ps = liveParchis().filter(p => inRange(p.date));
    return ps.map(p => ({ p, r: calcParchi(p, p.chargesSnap || chargesList()) }));
  }
  const kg = g => (Math.round(int(g) / 100) / 10).toLocaleString('en-US');
  // ہر رپورٹ: { title, cols:[[نام, عدد؟]], rows:[[…]], total:[…] }
  function rpBuild(tab){
    const D = rpData();
    const cash = liveCash().filter(c => inRange(c.date));
    if(tab === 'sum'){
      let gross = 0, net = 0, income = 0, nag = 0, zded = 0, bextra = 0, pass = 0;
      D.forEach(({ r }) => { gross += r.gross; net += r.net; income += r.income; nag += r.nag; zded += r.zTotal; bextra += r.buyers.reduce((s, b) => s + b.total - b.goods, 0);
        r.zCharges.concat(...r.buyers.map(b => b.charges)).forEach(x => { if(!x.income) pass += x.amount; }); });
      const rec = cash.filter(c => c.kind !== 'pay').reduce((s, c) => s + c.amount, 0), pay = cash.filter(c => c.kind === 'pay').reduce((s, c) => s + c.amount, 0);
      return { title: 'خلاصہ', cols: [['تفصیل', 0], ['رقم / تعداد', 1]], rows: [
        ['پرچیاں', D.length], ['کل نگ', nag], ['کل بکری (روپے)', fmt(gross)], ['زمینداروں سے کٹوتی', fmt(zded)], ['زمینداروں کو صاف رقم', fmt(net)],
        ['خریداروں پر خرچے', fmt(bextra)], ['آگے ادا ہونے والے خرچے', fmt(pass)], ['💰 آڑھتی کی کمائی', fmt(income)],
        ['خریداروں سے وصولی', fmt(rec)], ['زمینداروں کو ادائیگی', fmt(pay)]], total: null };
    }
    if(tab === 'zam' || tab === 'buy'){
      const type = tab === 'zam' ? 'zamindar' : 'buyer', M = {};
      const row = (id, name) => M[id || name] = M[id || name] || { id, name, n: 0, nag: 0, a: 0, b: 0, c: 0, cash: 0 };
      D.forEach(({ p, r }) => {
        if(type === 'zamindar'){ const x = row(p.zamindarId, p.zamindar); x.n++; x.nag += r.nag; x.a += r.gross; x.b += r.zTotal; x.c += r.net; }
        else r.buyers.forEach(b => { const x = row(b.id, b.name); x.n++; x.nag += b.nag; x.a += b.goods; x.b += b.total - b.goods; x.c += b.total; });
      });
      cash.forEach(c => { const pt = party(c.partyId); if(!pt || pt.type !== type) return; if((type === 'zamindar') !== (c.kind === 'pay')) return; row(pt.id, pt.name).cash += c.amount; });
      const list = Object.values(M).sort((a, b) => b.c - a.c);
      const T = list.reduce((t, x) => { t.n += x.n; t.nag += x.nag; t.a += x.a; t.b += x.b; t.c += x.c; t.cash += x.cash; return t; }, { n: 0, nag: 0, a: 0, b: 0, c: 0, cash: 0 });
      const bal = x => x.id ? ledger(x.id).bal : 0;
      if(type === 'zamindar') return { title: 'زمیندار وار', cols: [['زمیندار', 0], ['پرچیاں', 1], ['نگ', 1], ['بکری', 1], ['کٹوتی', 1], ['صاف رقم', 1], ['ادائیگی', 1], ['کل بقایا', 1]],
        rows: list.map(x => [x.name, x.n, x.nag, fmt(x.a), fmt(x.b), fmt(x.c), fmt(x.cash), fmt(bal(x))]), total: ['کل', T.n, T.nag, fmt(T.a), fmt(T.b), fmt(T.c), fmt(T.cash), ''] };
      return { title: 'خریدار وار', cols: [['خریدار', 0], ['پرچیاں', 1], ['نگ', 1], ['مال', 1], ['خرچے', 1], ['کل', 1], ['وصولی', 1], ['کل بقایا', 1]],
        rows: list.map(x => [x.name, x.n, x.nag, fmt(x.a), fmt(x.b), fmt(x.c), fmt(x.cash), fmt(bal(x))]), total: ['کل', T.n, T.nag, fmt(T.a), fmt(T.b), fmt(T.c), fmt(T.cash), ''] };
    }
    if(tab === 'item'){
      const M = {};
      D.forEach(({ r }) => r.lines.forEach(l => { const k = String(l.item || '').trim() || 'بغیر نام'; const x = M[k] = M[k] || { name: k, nag: 0, g: 0, a: 0, n: 0 }; x.nag += int(l.nag); x.g += int(l.grams); x.a += lineAmount(l); x.n++; }));
      const list = Object.values(M).sort((a, b) => b.a - a.a);
      const T = list.reduce((t, x) => { t.nag += x.nag; t.g += x.g; t.a += x.a; return t; }, { nag: 0, g: 0, a: 0 });
      return { title: 'جنس وار', cols: [['جنس', 0], ['نگ', 1], ['وزن (کلو)', 1], ['بکری', 1], ['اوسط فی نگ', 1]],
        rows: list.map(x => [x.name, x.nag, x.g ? kg(x.g) : '—', fmt(x.a), x.nag ? fmt(Math.round(x.a / x.nag)) : '—']), total: ['کل', T.nag, T.g ? kg(T.g) : '—', fmt(T.a), ''] };
    }
    if(tab === 'chg'){
      const M = {};
      D.forEach(({ r }) => {
        r.zCharges.forEach(x => { const m = M[x.name] = M[x.name] || { name: x.name, z: 0, b: 0, income: x.income }; m.z += x.amount; });
        r.buyers.forEach(b => b.charges.forEach(x => { const m = M[x.name] = M[x.name] || { name: x.name, z: 0, b: 0, income: x.income }; m.b += x.amount; }));
      });
      const list = Object.values(M).filter(x => x.z || x.b).sort((a, b) => (b.z + b.b) - (a.z + a.b));
      const T = list.reduce((t, x) => { t.z += x.z; t.b += x.b; if(x.income) t.i += x.z + x.b; return t; }, { z: 0, b: 0, i: 0 });
      return { title: 'خرچے اور کمیشن', cols: [['خرچہ', 0], ['زمیندار سے', 1], ['خریدار سے', 1], ['کل', 1], ['قسم', 0]],
        rows: list.map(x => [x.name, fmt(x.z), fmt(x.b), fmt(x.z + x.b), x.income ? 'آمدن' : 'آگے ادا']), total: ['کل', fmt(T.z), fmt(T.b), fmt(T.z + T.b), 'آمدن ' + fmt(T.i)] };
    }
    if(tab === 'mon'){
      const M = {}, n = new Date();
      for(let i = 11; i >= 0; i--){ const d = new Date(n.getFullYear(), n.getMonth() - i, 1); const k = isoOf(d).slice(0, 7); M[k] = { k, n: 0, nag: 0, a: 0, i: 0 }; }
      liveParchis().forEach(p => { const k = (p.date || '').slice(0, 7); if(!M[k]) return; const r = calcParchi(p, p.chargesSnap || chargesList()); M[k].n++; M[k].nag += r.nag; M[k].a += r.gross; M[k].i += r.income; });
      const list = Object.values(M).reverse();
      const T = list.reduce((t, x) => { t.n += x.n; t.nag += x.nag; t.a += x.a; t.i += x.i; return t; }, { n: 0, nag: 0, a: 0, i: 0 });
      return { title: 'مہینہ وار کمائی (پچھلے 12 مہینے)', cols: [['مہینہ', 0], ['پرچیاں', 1], ['نگ', 1], ['بکری', 1], ['کمائی', 1]],
        rows: list.map(x => [MONTHS[+x.k.slice(5) - 1] + ' ' + x.k.slice(0, 4), x.n, x.nag, fmt(x.a), fmt(x.i)]), total: ['کل', T.n, T.nag, fmt(T.a), fmt(T.i)], noRange: true };
    }
  }
  const RP_TABS = [['sum', '📋 خلاصہ'], ['zam', '🧑‍🌾 زمیندار وار'], ['buy', '🧑‍💼 خریدار وار'], ['item', '🧺 جنس وار'], ['chg', '⚙️ خرچے و کمیشن'], ['mon', '📅 مہینہ وار']];
  const RP_PRE = [['today', 'آج'], ['yday', 'کل'], ['week', '7 دن'], ['month', 'یہ مہینہ'], ['last', 'پچھلا مہینہ'], ['year', 'یہ سال'], ['all', 'سب']];
  function rpRange(){ return RP.from || RP.to ? (urDate(RP.from) || 'شروع') + ' سے ' + (urDate(RP.to) || 'آج') + ' تک' : 'شروع سے اب تک'; }
  function rpTable(rep){
    return `<div class="tscroll"><table class="t rpt"><tr>${rep.cols.map(c => `<th class="${c[1] ? 'v' : ''}">${c[0]}</th>`).join('')}</tr>
      ${rep.rows.map(r => `<tr>${r.map((v, i) => `<td class="${rep.cols[i][1] ? 'v' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${rep.cols.length}" class="muted">اس مدت میں کچھ نہیں</td></tr>`}
      ${rep.total ? `<tr class="tot">${rep.total.map((v, i) => `<td class="${rep.cols[i][1] ? 'v' : ''}">${esc(v)}</td>`).join('')}</tr>` : ''}</table></div>`;
  }
  VIEWS.reports = function(){
    const rep = rpBuild(RP.tab);
    return `<div class="pageTitle">📊 رپورٹیں</div>
      <div class="card"><div class="cdChips">${RP_PRE.map(p => `<button class="${RP.preset === p[0] ? 'on' : ''}" onclick="App.rpSet('preset','${p[0]}')">${p[1]}</button>`).join('')}</div>
        <div class="grid2"><div class="f"><label>سے</label><input type="date" value="${esc(RP.from)}" onchange="App.rpSet('from',this.value)"></div><div class="f"><label>تک</label><input type="date" value="${esc(RP.to)}" onchange="App.rpSet('to',this.value)"></div></div></div>
      <div class="rpTabs">${RP_TABS.map(t => `<button class="${RP.tab === t[0] ? 'on' : ''}" onclick="App.rpSet('tab','${t[0]}')">${t[1]}</button>`).join('')}</div>
      <div class="card"><h3>${rep.title}</h3><div class="muted">${rep.noRange ? 'تاریخ سے آزاد' : rpRange()}</div>${rpTable(rep)}
        <div class="row" style="margin-top:8px"><button class="btn light" onclick="App.rpPrint()">🖨️ پرنٹ</button><button class="btn wa" onclick="App.rpShare()">📤 تصویر شیئر</button></div></div>`;
  };
  function rpPrint(){ const rep = rpBuild(RP.tab); printDoc('رپورٹ — ' + rep.title, `<h2 style="text-align:center;margin:4px 0">📊 ${esc(rep.title)}</h2><div style="text-align:center">${esc(rep.noRange ? '' : rpRange())}</div><div class="card">${rpTable(rep)}</div>`); }
  async function rpShare(){
    const rep = rpBuild(RP.tab);
    const cols = rep.cols.map((c, i) => ({ t: c[0], w: i === 0 ? 2.6 : 1.4, num: c[1] }));
    const rows = rep.rows.concat(rep.total ? [rep.total] : []);
    const cv = await AB_RECEIPT.draw({ shop: shopName(), sub: shopSub(), title: '📊 ' + rep.title, meta: [['مدت', rep.noRange ? 'پچھلے 12 مہینے' : rpRange()]], cols, rows, lines: [], sub2: shopContacts(), foot: [shopFoot(), urDate(today())].filter(Boolean).join(' • ') });
    shareCv = { cv, file: 'report-' + RP.tab + '.png' };
    modal(`<h3>📊 ${esc(rep.title)}</h3><img src="${cv.toDataURL('image/png')}" style="width:100%;border-radius:10px;border:1px solid var(--l3)" alt="">
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn wa" onclick="App.shareSend()">📤 بھیجیں</button><button class="btn light" onclick="App.shareSave()">⬇️ محفوظ کریں</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
  }

  VIEWS.roznamcha = function(){
    const d = rozDate || today();
    const ps = liveParchis().filter(p => p.date === d);
    let gross = 0, net = 0, income = 0, nag = 0; const byCharge = {};
    ps.forEach(p => { const r = calcParchi(p, p.chargesSnap || chargesList()); gross += r.gross; net += r.net; income += r.income; nag += r.nag;
      r.zCharges.concat(...r.buyers.map(b => b.charges)).forEach(x => { byCharge[x.name] = byCharge[x.name] || { amt: 0, income: x.income }; byCharge[x.name].amt += x.amount; }); });
    const cs = liveCash().filter(c => c.date === d);
    const rec = cs.filter(c => c.kind === 'receive').reduce((s, c) => s + c.amount, 0), pay = cs.filter(c => c.kind === 'pay').reduce((s, c) => s + c.amount, 0);
    return `<div class="pageTitle">📖 روزنامچہ ${isLocked(d) ? '🔒' : ''}</div>
      <div class="card"><div class="row"><div class="f" style="flex:1 1 280px;min-width:0"><label>تاریخ</label><input type="date" value="${esc(d)}" onchange="App.setRozDate(this.value)"></div>
        <button class="btn ${isLocked(d) ? 'light' : 'gold'} sm" onclick="App.toggleLock('${d}')">${isLocked(d) ? '🔓 دن کھولیں' : '🔒 دن بند کریں'}</button></div>
        <div class="muted">${esc(urDate(d, true))}</div></div>
      <div class="stats"><div class="stat"><div class="l">بکری (${ps.length} پرچی، ${nag} نگ)</div><div class="n">${fmt(gross)}</div></div>
        <div class="stat g"><div class="l">آڑھتی کی کمائی</div><div class="n">${fmt(income)}</div></div>
        <div class="stat"><div class="l">وصولی (جمع)</div><div class="n">${fmt(rec)}</div></div>
        <div class="stat y"><div class="l">ادائیگی (بنام)</div><div class="n">${fmt(pay)}</div></div></div>
      <div class="card"><h3>🧮 کٹوتیاں اور خرچے</h3><table class="t">${Object.keys(byCharge).map(k => `<tr><td>${esc(k)} <span class="tag ${byCharge[k].income ? 'in' : 'out'}">${byCharge[k].income ? 'آمدن' : 'آگے ادا'}</span></td><td class="v">${fmt(byCharge[k].amt)}</td></tr>`).join('') || '<tr><td class="muted">کچھ نہیں</td></tr>'}
        <tr class="tot"><td>زمینداروں کی صاف رقم</td><td class="v">${fmt(net)}</td></tr></table></div>
      <div class="card"><h3>📚 اس دن کی پرچیاں</h3><div class="list">${ps.map(p => `<div class="it" onclick="App.go('parchi','${p.id}')"><div>نمبر <span class="num">${p.no}</span> — ${esc(p.zamindar)}</div><div class="a">${fmt((p.totals || {}).gross || 0)}</div></div>`).join('') || '<div class="muted">کوئی پرچی نہیں</div>'}</div></div>
      <div class="card"><h3>💵 اس دن کی وصولی / ادائیگی</h3><div class="list">${cs.map(c => { const p = party(c.partyId); return `<div class="it"><div>${c.kind === 'pay' ? '💸 ادائیگی' : '💵 وصولی'} — ${esc(p ? p.name : '')}</div><div class="a ${c.kind === 'pay' ? 'amt-out' : 'amt-in'}">${fmt(c.amount)}</div></div>`; }).join('') || '<div class="muted">کوئی اندراج نہیں</div>'}</div></div>`;
  };
  async function toggleLock(d){
    if(isLocked(d)){ if(!(await unlockFor(d))) return; DB.locks[d] = { on: false }; put('locks'); logIt('دن کھولا: ' + d); toast('🔓 دن کھل گیا'); }
    else {
      if(!hasOwnerPin()){ toast('⚠️ دن بند کرنے کے لیے پہلے سیٹنگ میں مالک کا پن لگائیں'); go('settings'); return; }
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
        <div class="muted">ایک بار جوڑ دیں: دن میں تین بار — <b>صبح 8، دوپہر 2 اور رات 8 بجے</b> — سارا ریکارڈ آپ کی اپنی گوگل ڈرائیو کے فولڈر <span class="num">BKAR Backup</span> میں خود محفوظ ہوگا (فائلیں <span class="num">BKAR…json</span> نام سے)، اور ہر دن کی الگ نقل 90 دن تک رہے گی۔ ایپ صرف اپنی بنائی فائلیں دیکھ سکتی ہے۔</div>
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
    // مالک کی بیک اپ: نئے آلے پر لگا کر کلاؤڈ سے جڑ کر خود دوبارہ مالک (ملازم کی بیک اپ میں نہیں)
    try{ const op = window.AB_CLOUD && AB_CLOUD.ownerPack(); if(op) data.cloudOwner = op; }catch(e){}
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
    loadAll(); safeCopy(); if(window.AB_LBL) AB_LBL.install(); logIt('بیک اپ واپس لایا گیا (' + (b.at || '') + ')'); curUser = ownerUser(); go('home'); toast('✅ بیک اپ واپس آ گیا');
    // مالک کی بیک اپ اور یہ آلہ کلاؤڈ سے نہیں جڑا: جڑ کر دوبارہ مالک بنیں
    if(b.cloudOwner && window.AB_CLOUD && !AB_CLOUD.on() && navigator.onLine){
      if(await ask('یہ بیک اپ کلاؤڈ والی آڑھت کے مالک کا ہے۔ یہ ڈیوائس آڑھت سے جوڑ کر دوبارہ مالک بنا دیں؟', 'جوڑیں اور مالک بنیں')){
        if(await AB_CLOUD.join(b.cloudOwner.code, DB.settings.owner || 'مالک') && await AB_CLOUD.claimOwner(b.cloudOwner.ownerKey)){ curUser = ownerUser(); logIt('نئی ڈیوائس پر دوبارہ مالک بنے'); render(); }
      }
    }
    return true;
  }
  function backupFileName(d){
    const p = n => String(n).padStart(2, '0');
    const h = d.getHours(), h12 = h % 12 || 12;
    return 'BKAR' + p(d.getDate()) + p(d.getMonth() + 1) + ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getDay()] + p(h12) + p(d.getMinutes()) + (h < 12 ? 'AM' : 'PM') + '.json';
  }
  async function exportBackup(){
    const wait = ms => new Promise(r => setTimeout(r, ms));
    progress('📥 بیک اپ فائل بن رہی ہے', 10, 'ریکارڈ جمع ہو رہا ہے…'); await wait(300);
    progress('📥 بیک اپ فائل بن رہی ہے', 45, 'پرچیاں، کھاتے، وصولی، خرچے…'); await wait(300);
    const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
    // فائل کا نام باقی ایپس کے انداز پر: BKAR + تاریخ + مہینہ + دن + وقت + AM/PM، مثلاً BKAR2410SA0455AM.json
    // (انگریزی حروف میں — براؤزر ڈاؤن لوڈ میں اردو نام قبول نہیں کرتا)
    const name = backupFileName(new Date());
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    progress('📥 بیک اپ فائل بن رہی ہے', 85, 'فون میں محفوظ ہو رہی ہے…'); await wait(300);
    DB.settings.lastBackup = Date.now(); put('settings'); render();
    await progressDone('بیک اپ فائل بن گئی', ['📄 فائل: <b class="num" dir="ltr">' + esc(name) + '</b>', '📚 پرچیاں: <b class="num">' + liveParchis().length + '</b>', '👥 کھاتے: <b class="num">' + DB.parties.filter(p => !p.deleted).length + '</b>',
      '📂 فون کے «ڈاؤن لوڈ» فولڈر میں', '<span class="muted">یہ فائل واٹس ایپ یا ای میل پر اپنے پاس بھی بھیج دیں</span>']);
  }
  function importBackup(inp){
    const f = inp.files && inp.files[0]; inp.value = ''; if(!f) return;
    const rdr = new FileReader();
    rdr.onload = async () => { let b; try{ b = JSON.parse(rdr.result); }catch(e){ toast('❌ یہ درست بیک اپ فائل نہیں'); return; } applyBackup(b); };
    rdr.readAsText(f);
  }
  window.AB_HOST = { progress, progressDone, snapshot, apply: applyBackup, toast, version: APP_VERSION, fileName: backupFileName, count: () => liveParchis().length,
    settings: () => DB.settings,
    setLabels(m){ DB.settings.labels = m; put('settings'); logIt('الفاظ بدلے: ' + Object.keys(m).length); if(window.AB_LBL) AB_LBL.install(); render(); },
    modal, closeModal, ask,
    setPhone(v){ DB.settings.phone = v; put('settings'); logIt('مالک کا موبائل نمبر: ' + v); },
    refreshHome(){ if(screen === 'home' && DB.settings.registered && me()) render(); },
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
      if(changed.has('settings') && window.AB_LBL) AB_LBL.install();   // دوسری ڈیوائس سے بدلے الفاظ
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
      ${window.AB_LIC ? AB_LIC.card() : ''}
      <div class="card"><h3>🏪 آڑھت کی معلومات</h3><div class="grid2 wideable">
        <div class="f"><label>آڑھت / دکان کا نام</label><input id="sShop" value="${esc(s.shop)}"></div>
        <div class="f"><label>مالک کا نام</label><input id="sOwner" value="${esc(s.owner)}"></div>
        <div class="f"><label>موبائل نمبر</label><input id="sPhone" inputmode="tel" value="${esc(s.phone)}"></div>
        <div class="f"><label>منڈی کا پتہ</label><input id="sAddr" value="${esc(s.address)}"></div>
        <div class="f"><label>کاروبار کی تفصیل (پرچی پر)</label><input id="sTag" value="${esc(s.tagline == null ? 'سبزی فروٹ کمیشن ایجنٹ' : s.tagline)}" placeholder="مثلاً سبزی فروٹ کمیشن ایجنٹ"></div>
        <div class="f"><label>ٹریڈ مارک</label><input id="sTm" value="${esc(s.trademark)}" placeholder="مثلاً ایچ جی"></div>
        <div class="f"><label>دکان نمبر</label><input id="sNo" value="${esc(s.shopNo)}" placeholder="مثلاً 16"></div>
        <div class="f"><label>🪙 شروع کا نقد (گلے میں — روپے)</label><input id="sCash" inputmode="decimal" value="${esc(inRs(s.openCash))}" placeholder="0"></div></div>
        <div class="muted" style="margin-top:6px">📞 پرچی پر نام اور نمبر (سرپرست، شراکت دار…) — زیادہ سے زیادہ 4</div>
        <div class="grid2 wideable">${[0, 1, 2, 3].map(i => { const c = (s.contacts || [])[i] || {}; return `<div class="f"><input id="sCn${i}" value="${esc(c.n)}" placeholder="نام"></div><div class="f"><input id="sCp${i}" inputmode="tel" value="${esc(c.p)}" placeholder="نمبر"></div>`; }).join('')}</div>
        <button class="btn" style="margin-top:8px" onclick="App.saveSettings()">💾 محفوظ</button></div>
      <div class="card"><h3>🎨 رنگ</h3><div class="themesCard">${themePicker()}</div><div class="muted">رنگ صرف اس ڈیوائس پر بدلتا ہے؛ ریکارڈ پر کوئی اثر نہیں۔</div></div>
      <div class="card"><h3>🔒 مالک کا پن</h3><div class="muted">پن لگانے سے ایپ کھلتے وقت پن پوچھے گی، اور بند دن کی تبدیلی بھی صرف اسی سے ہوگی۔ ${hasOwnerPin() ? '✅ پن لگا ہوا ہے' : '❌ ابھی پن نہیں لگا'}</div>
        <div class="row" style="margin-top:6px"><div class="f" style="flex:1"><input id="sPin" type="password" inputmode="numeric" maxlength="8" placeholder="نیا پن (4 سے 8 ہندسے)"></div>
        <button class="btn" onclick="App.setPin()">💾 پن لگائیں</button>${hasOwnerPin() ? '<button class="btn gray" onclick="App.removePin()">ہٹائیں</button>' : ''}</div></div>
      ${staffCard()}
      <div class="card"><h3>📜 تبدیلیوں کا ریکارڈ (آخری 40)</h3><div class="list">${lg.map(x => `<div class="it" style="cursor:default"><div>${esc(x.what)}</div><div class="muted">${esc(urDate(new Date(x.at).toISOString().slice(0, 10)))} ${urTime(x.at)}</div></div>`).join('') || '<div class="muted">کچھ نہیں</div>'}</div></div>
      <div class="card plain"><div class="muted">ورژن: <span class="num">${APP_VERSION}</span> • سافٹ ویئر: پی بی ٹی کوڈ لیبز</div>${brandHtml()}</div>`;
  };
  function saveSettings(){
    Object.assign(DB.settings, { shop: $('sShop').value.trim() || DB.settings.shop, owner: $('sOwner').value.trim(), phone: $('sPhone').value.trim(), address: $('sAddr').value.trim(),
      tagline: $('sTag').value.trim(), trademark: $('sTm').value.trim(), shopNo: $('sNo').value.trim(), openCash: toPaisa($('sCash').value),
      contacts: [0, 1, 2, 3].map(i => ({ n: $('sCn' + i).value.trim(), p: $('sCp' + i).value.trim() })).filter(c => c.n || c.p) });
    put('settings'); logIt('آڑھت کی معلومات بدلیں'); render(); toast('✅ محفوظ'); if(window.AB_LIC) AB_LIC.check(false);
  }
  // پن ایک دوسرے کے آگے والے حصے نہ ہوں (1234 اور 12345 ساتھ نہیں — ورنہ چار ہندسوں پر ہی پہلا کھل جائے)
  function pinClash(pin, exceptId){
    const hs = []; for(let n = 4; n <= 8; n++) if(pin.length >= n) hs.push(pinHash(pin.slice(0, n)));
    const others = staffUsers().filter(u => u.id !== exceptId).map(u => u.pinH).concat(exceptId === 'owner' ? [] : (hasOwnerPin() ? [DB.settings.pinH] : []));
    if(others.some(h => hs.includes(h))) return true;
    // دوسرے کا پن اس کے آگے والا حصہ ہو — صرف لمبائی 4 سے 8 تک کے حصے جانچے جا سکتے ہیں
    return staffUsers().filter(u => u.id !== exceptId).some(u => (u.pinPfx || []).includes(pinHash(pin))) || (exceptId !== 'owner' && (DB.settings.pinPfx || []).includes(pinHash(pin)));
  }
  function prefixes(pin){ const a = []; for(let n = 4; n < pin.length; n++) a.push(pinHash(pin.slice(0, n))); return a; }
  async function setPin(){
    const v = $('sPin').value.trim();
    if(!/^\d{4,8}$/.test(v)){ toast('⚠️ پن 4 سے 8 ہندسوں کا ہو'); return; }
    if(hasOwnerPin() && !(await pinPrompt('پرانا پن لکھیں'))) return;
    if(pinClash(v, 'owner')){ toast('⚠️ یہ پن کسی ملازم کے پن سے ملتا ہے — کوئی اور چنیں'); return; }
    DB.settings.pinH = pinHash(v); DB.settings.pinPfx = prefixes(v); curUser = ownerUser(); put('settings'); logIt('مالک کا پن بدلا'); render(); toast('✅ پن لگ گیا — یاد رکھیں');
  }
  async function removePin(){
    if(staffUsers().length){ toast('⚠️ پہلے سب ملازمین ہٹائیں، پھر مالک کا پن ہٹ سکتا ہے'); return; }
    if(!(await pinPrompt('پن ہٹانے کے لیے موجودہ پن لکھیں'))) return; delete DB.settings.pinH; delete DB.settings.pinPfx; put('settings'); logIt('مالک کا پن ہٹایا'); render();
  }
  // ---------- 👥 ملازمین اور اجازتیں ----------
  function staffCard(){
    const us = staffUsers();
    return `<div class="card"><h3>👥 ملازمین اور اجازتیں</h3>
      <div class="muted">ہر ملازم کا اپنا پن؛ آپ طے کریں وہ کون سی اسکرینیں دیکھ سکے۔ خرچے، بیک اپ اور سیٹنگ صرف مالک کے لیے۔ ملازم حذف کرے یا محفوظ پرچی بدلے تو مالک کا پن مانگا جائے گا۔ ہر اندراج پر لکھنے والے کا نام آتا ہے۔</div>
      ${hasOwnerPin() ? `<div class="list" style="margin:6px 0">${us.map(u => `<div class="it" onclick="App.staffForm('${u.id}')"><div>👤 <b>${esc(u.name)}</b><div class="muted">${STAFF_SCREENS.filter(x => (u.screens || []).includes(x[0])).map(x => x[1]).join('، ') || 'کوئی اسکرین نہیں'}</div></div><span class="muted">✏️</span></div>`).join('') || '<div class="muted">ابھی کوئی ملازم نہیں</div>'}</div>
        <button class="btn gold" onclick="App.staffForm('')">➕ نیا ملازم</button>`
      : `<div class="warn">پہلے اوپر مالک کا پن لگائیں، پھر ملازم بنا سکتے ہیں۔</div>`}</div>`;
  }
  function staffForm(id){
    const u = id ? staffUsers().find(x => x.id === id) : { name: '', screens: ['parchi', 'parchis', 'cash'] };
    if(!u) return;
    modal(`<h3>${id ? 'ملازم بدلیں' : 'نیا ملازم'}</h3><div style="text-align:right">
      <div class="f"><label>نام</label><input id="sfN" value="${esc(u.name)}" placeholder="مثلاً منشی اسلم"></div>
      <div class="f"><label>${id ? 'نیا پن (خالی چھوڑیں تو پرانا رہے گا)' : 'پن (4 سے 8 ہندسے)'}</label><input id="sfP" type="password" inputmode="numeric" maxlength="8"></div>
      <div class="muted" style="margin-top:6px">یہ ملازم کیا دیکھ سکے:</div>
      ${STAFF_SCREENS.map(x => `<label style="display:flex;gap:8px;align-items:center;font-size:17px"><input type="checkbox" class="sfS" value="${x[0]}" ${(u.screens || []).includes(x[0]) ? 'checked' : ''} style="width:22px;height:22px"> ${x[1]}</label>`).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="sfOk">💾 محفوظ</button>${id ? '<button class="btn gray" id="sfDel">🗑️ ہٹائیں</button>' : ''}<button class="btn gray" onclick="App.closeModal()">منسوخ</button></div>`);
    $('sfOk').onclick = () => {
      const name = $('sfN').value.trim(), pin = $('sfP').value.trim(), screens = [...document.querySelectorAll('.sfS:checked')].map(x => x.value);
      if(!name){ toast('⚠️ نام لکھیں'); return; }
      if(!id && !pin){ toast('⚠️ پن لکھیں'); return; }
      if(pin && !/^\d{4,8}$/.test(pin)){ toast('⚠️ پن 4 سے 8 ہندسوں کا ہو'); return; }
      if(pin && pinClash(pin, id || '__new')){ toast('⚠️ یہ پن کسی اور سے ملتا ہے — کوئی اور چنیں'); return; }
      if(!DB.settings.users) DB.settings.users = [];
      let x = id ? DB.settings.users.find(y => y.id === id) : null;
      if(!x){ x = { id: uid(), createdAt: Date.now() }; DB.settings.users.push(x); }
      Object.assign(x, { name, screens });
      if(pin){ x.pinH = pinHash(pin); x.pinPfx = prefixes(pin); }
      put('settings'); logIt((id ? 'ملازم بدلا: ' : 'نیا ملازم: ') + name); closeModal(); render(); toast('✅ محفوظ — ملازم اپنے پن سے ایپ کھولے');
    };
    if(id) $('sfDel').onclick = async () => {
      closeModal();
      if(!(await ask('«' + esc(u.name) + '» کو ہٹا دیں؟ اس کا پن کام نہیں کرے گا؛ اس کے لکھے اندراج ویسے ہی رہیں گے۔'))) return;
      const x = DB.settings.users.find(y => y.id === id); x.deleted = Date.now(); put('settings'); logIt('ملازم ہٹایا: ' + u.name); render();
    };
  }

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
    go, menu, register, pinKey, closeModal, staffForm,
    rpSet(k, v){ if(k === 'preset') rpPreset(v); else { RP[k] = v; if(k !== 'tab') RP.preset = ''; } render(); }, rpPrint, rpShare,
    remind, setDueDays(v){ DB.settings.dueDays = int(v) || 7; put('settings'); render(); },
    searchQ(v){ sQuery = v; const r = $('sRes'); if(r) r.innerHTML = searchResults(v); },
    logout(){ curUser = null; pinBuf = ''; menu(false); render(); },
    setTheme(k){ try{ localStorage.setItem('ab_theme', k); }catch(e){} applyTheme(k); render(); }, verTap(){ if(window.AB_LIC && AB_LIC.tap()) return; toast('ورژن ' + APP_VERSION); },
    newParchi(){ cur = blankParchi(); pzQ = ''; render(); },
    newParchiFor(id){ const p = party(id); cur = blankParchi(); pzQ = ''; if(p){ cur.zamindar = p.name; cur.zamindarId = p.id; cur.place = p.place || ''; } go('parchi'); },
    pfilter(k){ partyFilter = k; render(); },
    bkOpen, bkSave, pzPick, pzCart, bkAmt,
    bkNum(){ const e = $('bkB'), p = e && partyByNo('buyer', e.value); if(p) e.value = p.name; },
    bkBasis(b){ bkState.basis = b; $('bkBn').classList.toggle('on', b === 'nag'); $('bkBm').classList.toggle('on', b === 'maund'); $('bkWw').style.display = b === 'maund' ? '' : 'none'; bkAmt(); },
    bkPk(el){ const on = el.classList.contains('on'); document.querySelectorAll('.pkChips button').forEach(b => b.classList.remove('on')); if(!on){ el.classList.add('on'); bkState.pk = el.textContent; } else bkState.pk = ''; },
    bkDel(i){ cur.lines.splice(i, 1); closeModal(); render(); toast('🗑️ بکری ہٹا دی'); if(cur.lines.length) pzCart(); },
    pzCartRes(){ const el = $('result'); if(el) el.innerHTML = resultHtml(calcParchi(cur, parchiCharges()), cur, false); },
    pzSearch(v){ pzQ = v; const pos = v.length; render(); const e = $('pzQ'); if(e){ e.focus(); try{ e.setSelectionRange(pos, pos); }catch(er){} } },
    pzNewItem(){ const v = (($('pzQ') || {}).value || '').trim(); if(v) bkOpen(-1, v); else { toast('✍️ اوپر خانے میں نئی جنس کا نام لکھیں'); const e = $('pzQ'); if(e) e.focus(); } },
    pzZf(v){ const q = (C.en ? C.en(v) : v).trim(); document.querySelectorAll('#pzZl .it').forEach(it => { it.style.display = !q || it.dataset.s.includes(q) ? '' : 'none'; }); },
    pzSetZ(id){
      let p = id ? party(id) : null;
      if(!p){ const v = (($('pzZq') || {}).value || '').trim(); if(!v){ toast('⚠️ نام لکھیں یا فہرست سے چنیں'); return; } p = partyByNo('zamindar', v) || findParty('zamindar', v); if(!p){ cur.zamindar = v; cur.zamindarId = ''; closeModal(); render(); toast('🆕 نیا زمیندار — پرچی محفوظ ہوتے ہی کھاتہ بن جائے گا'); return; } }
      cur.zamindar = p.name; cur.zamindarId = p.id; if(!cur.place && p.place) cur.place = p.place; closeModal(); render();
    },
    async parchiStep(id){
      // نئی (محفوظ نہ ہوئی) پرچی میں کچھ لکھا ہو تو پوچھیں
      if(cur && !cur.no && (String(cur.zamindar || '').trim() || cur.lines.some(l => l.item || l.buyer || l.rate)) && !(await ask('یہ نئی پرچی ابھی محفوظ نہیں ہوئی — چھوڑ کر آگے جائیں؟', 'ہاں، چھوڑ دیں'))) return;
      const p = DB.parchis.find(x => x.id === id); if(!p) return; cur = JSON.parse(JSON.stringify(p)); render(); window.scrollTo(0, 0);
    },
    pnum(el){ const p = partyByNo('zamindar', el.value); if(p){ cur.zamindar = p.name; cur.zamindarId = p.id; if(!cur.place && p.place) cur.place = p.place; render(); } else if(cur.zamindar !== el.value){ cur.zamindar = el.value; } },
    lnum(i, el){ const p = partyByNo('buyer', el.value), l = cur.lines[i]; if(p && l){ l.buyer = p.name; l.buyerId = p.id; render(); } },
    pset(k, v){ cur[k] = k === 'cashNow' ? toPaisa(v) : v; if(k === 'zamindar' || k === 'place' || k === 'vehicle' || k === 'cashNow') renderResult(); if(k === 'date') render(); },
    lset(i, k, v){ const l = cur.lines[i]; if(!l) return; if(k === 'rate') l.rate = toPaisa(v); else if(k === 'grams') l.grams = toGrams(v); else if(k === 'nag') l.nag = String(v).replace(/[^\d]/g, ''); else l[k] = v; if(k === 'buyer') delete l.buyerId; renderResult(); },
    pman(id, v){ if(String(v).trim() === '') delete cur.manual[id]; else cur.manual[id] = toPaisa(v); renderResult(); },
    addLine(){ const last = cur.lines[cur.lines.length - 1] || {}; cur.lines.push(Object.assign(blankLine(), { item: last.item || '', basis: last.basis || 'nag' })); render(); },
    delLine(i){ cur.lines.splice(i, 1); render(); },
    dash, menuDrag, saveParchi,
    dashToggle(){ setHomePref({ dashOff: !homePref().dashOff }); render(); }, dashPer(k){ setHomePref({ per: k }); render(); },
    homeCols(n){ setHomePref({ cols: n }); render(); }, homeEditT(){ homeEdit = !homeEdit; render(); },
    homeTap(k){ if(homeEdit) return; go(k); }, homeDel(k){ setHomePref({ items: homeItems().filter(x => x !== k) }); render(); },
    homeAddList(){ const its = homeItems(); const rest = NAV.filter(n => n[0] !== 'home' && canSee(n[0]) && !its.includes(n[0]));
      modal(`<h3>➕ ہوم پر آئیکن لگائیں</h3><div class="list" style="text-align:right">${rest.map(n => `<div class="it" onclick="App.closeModal();App.homeAddK('${n[0]}')"><div>${n[1]} ${n[2]}</div><span class="num">${navNo(n[0])}</span></div>`).join('') || '<div class="muted">سب آئیکن پہلے سے ہوم پر ہیں</div>'}</div><div class="row" style="justify-content:center;margin-top:8px"><button class="btn gray" onclick="App.closeModal()">بند</button></div>`); },
    homeAddK(k){ homeAdd(k, null); }, menuSort(k){ setHomePref({ menuSort: k }); renderSide(); }, printParchi, printBuyers, delParchi, restoreParchi, shareParchi, shareSend, shareChat, shareSave, thermal, thermalShow, thermalBT, thermalPrint, dayBill, dayBillPrint, dayBillThermal, dayBillFromCash, cashSide, cashPick, cashSetP(n, t){ closeModal(); const e = $('cP'); if(e){ e.value = n; cashHint(t); const j = $(t === 'zamindar' ? 'cB' : 'cJ'); if(j) j.focus(); } },
    setListDate(d){ listDate = d; render(); }, setRozDate(d){ rozDate = d; render(); }, toggleLock,
    psearch(v, type){ partySearch = v; const pos = v.length; render(); const i = $('pS') || document.querySelector('#view .f input'); if(i){ i.focus(); i.setSelectionRange(pos, pos); } },
    partyForm, saveParty, printLedger, cashHint, cashNum, saveCash, delCash,
    chEdit(id){ editCh = id ? JSON.parse(JSON.stringify(chargesList().find(x => x.id === id))) : { id: '', name: '', kind: 'percent', rate: 0, side: 'zamindar', income: true, on: true, itemRates: {} }; render(); },
    chCancel(){ editCh = null; render(); }, chSave,
    chToggle(id, on){ const c = chargesList().find(x => x.id === id); if(c){ c.on = on; put('charges'); logIt('خرچہ ' + (on ? 'چالو' : 'بند') + ': ' + c.name); render(); } },
    async chRemove(id){ if(!(await ask('یہ خرچہ فہرست سے ہٹا دیں؟ (محفوظ پرچیاں نہیں بدلیں گی)'))) return; const c = chargesAll().find(x => x.id === id); if(c) c.deleted = Date.now(); put('charges'); logIt('خرچہ ہٹایا: ' + (c ? c.name : '')); editCh = null; render(); },
    async chTemplate(k){ if(!(await ask(TEMPLATES[k].label + ' کا سانچہ لگ جائے گا اور موجودہ فہرست بدل جائے گی۔'))) return; const now = Date.now(); chargesAll().forEach(c => { if(!c.deleted) c.deleted = now; }); DB.charges = chargesAll().concat(TEMPLATES[k].list().map(c => Object.assign({ id: uid() }, c))); put('charges'); logIt('سانچہ لگا: ' + TEMPLATES[k].label); render(); toast('✅ سانچہ لگ گیا'); },
    exportBackup, importBackup, saveSettings, setPin, removePin,
    cloudJoinForm,
    claimForm(){
      modal(`<h3>👑 دوبارہ مالک بنیں</h3><div style="text-align:right"><div class="muted">مالک کی پرانی ڈیوائس کی سیٹنگ میں لکھا «مالک کا خفیہ کوڈ» یہاں لکھیں۔</div>
        <div class="f"><label>مالک کا خفیہ کوڈ</label><input id="ckK" dir="ltr" style="text-align:center;font-family:Tahoma,Arial;text-transform:uppercase"></div></div>
        <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="ckOk">✅ مالک بنیں</button><button class="btn gray" onclick="App.closeModal()">منسوخ</button></div>`);
      $('ckOk').onclick = async () => { const k = $('ckK').value; closeModal(); if(await AB_CLOUD.claimOwner(k)){ curUser = ownerUser(); logIt('اس ڈیوائس پر دوبارہ مالک بنے'); render(); } };
    },
    async cloudEnable(){ if(!(await ask('آڑھت کا ریکارڈ آپ کے اپنے کلاؤڈ (آڑھت بک) پر جائے گا اور جڑی ہوئی ڈیوائسز میں مل جائے گا۔ کلاؤڈ چالو کریں؟', 'چالو کریں'))) return; if(await AB_CLOUD.enableOwner()){ logIt('کلاؤڈ چالو'); render(); } },
    cloudCopy(){ const c = AB_CLOUD.code(); try{ navigator.clipboard.writeText(c).then(() => toast('📋 کوڈ کاپی ہو گیا')); }catch(e){ toast(c); } },
    cloudShare(){ const msg = 'آڑھت بک — «' + shopName() + '» سے جڑنے کا کوڈ:\n' + AB_CLOUD.code() + '\nآڑھت بک کھولیں ← سیٹنگ ← آڑھت سے جڑیں'; window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); },
    async cloudRemove(uid, name){ if(!(await ask('«' + esc(name) + '» کو آڑھت سے ہٹا دیں؟ اس ڈیوائس پر نیا ریکارڈ کلاؤڈ میں نہیں جائے گا۔'))) return; try{ await AB_CLOUD.removeMember(uid); logIt('ڈیوائس ہٹائی: ' + name); loadMembers(); toast('✅ ہٹا دیا'); }catch(e){ toast('⚠️ نہیں ہٹا سکا — انٹرنیٹ دیکھیں'); } },
    async driveOff(){ if(!(await ask('ڈرائیو سے خودکار بیک اپ بند کریں؟ ڈرائیو پر پہلے سے محفوظ فائلیں رہیں گی۔'))) return; AB_DRIVE.disconnect(); render(); }
  };

  // =====================================================================
  //   شروع
  // =====================================================================
  (async function start(){
    $('verBadge').textContent = APP_VERSION; applyTheme(curTheme());
    const restored = await safeRestoreIfEmpty();
    loadAll();
    if(window.AB_LBL) AB_LBL.install();
    try{ history.replaceState({ s: 'home', a: null }, ''); }catch(e){}
    render();
    if(restored) toast('🛡️ ریکارڈ حفاظتی کاپی سے واپس آ گیا');
    if(DB.settings.registered) safeCopy();
    showUpdated();
    registerSW();
    if(window.AB_CLOUD) AB_CLOUD.start();
    if(window.AB_LIC) AB_LIC.start();
  })();
})();
