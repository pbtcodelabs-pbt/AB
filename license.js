/* 📒 آڑھت بک — سبسکرپشن (فائربیس: aarhat-book)
   - ہر آڑھت کی پہچان مالک کا موبائل نمبر (settings.phone، بین الاقوامی شکل 923001234567)
   - نئی آڑھت: 14 دن مفت آزمائش — شروع کی تاریخ سرور پر trials/<نمبر> میں (دوبارہ انسٹال سے آزمائش نئی نہیں ہوتی)
   - ڈویلپر (ورژن پر 7 ٹیپ) کوڈ بناتا ہے: licenses/<کوڈ> اور subs/<نمبر> میں ختم ہونے کی تاریخ
   - گاہک کوڈ لکھے یا صرف «بحال کریں» — نمبر سے subs/<نمبر> پڑھ کر سبسکرپشن خود واپس (نیا فون / دوبارہ انسٹال)
   - مدت ختم: ریکارڈ محفوظ اور دیکھا جا سکے، نیا اندراج بند
   - لکھنا صرف ڈویلپر کا (firestore.rules میں ای میل/پاس ورڈ والی شناخت)؛ ہر بات اردو میں */
(() => {
  'use strict';
  const CFG = window.AB_FIREBASE;
  if (!CFG) return;
  const DEV_WA = '923206793793';        // ڈویلپر/سبسکرپشن: عبدالحفیظ 03206793793 — کبھی نہ بدلیں
  const DEV_EMAIL = 'piarybhai@gmail.com';
  const TRIAL_DAYS = 14;
  const BASE_DEVICES = 3;               // سبسکرپشن (اور آزمائش) میں شامل آلات؛ زیادہ آلہ = 5,000 روپے سالانہ
  const DAY = 864e5;
  const FOREVER = Date.UTC(2100, 0, 1);
  const PLANS = [[180, 'چھ مہینے', 15000], [365, 'ایک سال', 25000]];   // [دن، نام، قیمت روپے]
  const rsTxt = n => n.toLocaleString('en-US');
  const KEY = 'ab_lic';                 // آلہ وار: آخری معلوم حالت (آف لائن بھی چلے) — بیک اپ/sync میں نہیں
  const BASE = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents`;

  const host = () => window.AB_HOST;
  const toast = m => host() && host().toast(m);
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { st = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  // ---------- موبائل نمبر کی پکی شکل: 03001234567 → 923001234567 ----------
  function normPhone(raw) {
    const s = String(raw || '').trim();
    let d = s.replace(/\D/g, '');
    if (!d) return '';
    if (s.indexOf('+') === 0) return d;
    if (d.indexOf('00') === 0) return d.slice(2);
    if (d.indexOf('92') === 0 && d.length >= 12) return d;
    return '92' + d.replace(/^0+/, '');
  }
  const okPhone = p => /^\d{11,15}$/.test(p);
  const phone = () => normPhone(host() && host().settings().phone);
  const showPhone = p => p && p.indexOf('92') === 0 ? '0' + p.slice(2) : (p ? '+' + p : '');

  // گھڑی پیچھے کرنے سے مدت نہ بڑھے: دیکھا گیا سب سے بڑا وقت
  function now() { const n = Date.now(); if (n > (st.seen || 0)) { st.seen = n; save(); } return Math.max(n, st.seen || 0); }
  function trialEnd() {
    if (st.phone && st.phone !== phone()) return 0;
    const s = host().settings();
    return (st.trialAt || s.createdAt || now()) + TRIAL_DAYS * DAY;
  }
  function paidExp() { return st.phone && st.phone === phone() ? (st.exp || 0) : 0; }
  function status() {
    const n = now(), pe = paidExp(), e = Math.max(trialEnd(), pe);
    return { ok: e > n, paid: pe > n, forever: pe >= FOREVER - DAY, exp: e, days: Math.max(0, Math.ceil((e - n) / DAY)) };
  }
  function urDay(ms) {
    const M = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
    const d = new Date(ms); return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear();
  }
  function statusText() {
    const s = status();
    if (s.paid && s.forever) return '✅ سبسکرپشن چالو — ہمیشہ کے لیے';
    if (s.paid) return `✅ سبسکرپشن چالو — <span class="num">${s.days}</span> دن باقی (${urDay(s.exp)} تک)`;
    if (s.ok) return `🎁 مفت آزمائش — <span class="num">${s.days}</span> دن باقی`;
    return '⛔ سبسکرپشن ختم — آپ کا ریکارڈ محفوظ ہے اور دیکھ سکتے ہیں، مگر نیا اندراج بند ہے';
  }

  // ---------- فائربیس (گمنام شناخت cloud.js والی) ----------
  const cloud = () => window.AB_CLOUD;
  const fv = f => f ? (f.integerValue != null ? +f.integerValue : f.timestampValue ? Date.parse(f.timestampValue) : f.stringValue) : undefined;
  async function getDoc(path) {
    try { return (await cloud().fs(path)).fields || {}; }
    catch (e) { if (e.message === 'notfound') return null; throw e; }
  }

  // ---------- سرور سے حالت لینا: آزمائش کی تاریخ + سبسکرپشن ----------
  let busy = false;
  async function check(loud) {
    const p = phone();
    if (!okPhone(p) || !cloud() || !navigator.onLine) { if (loud) toast(okPhone(p) ? '⚠️ انٹرنیٹ نہیں ہے' : '⚠️ پہلے سیٹنگ میں مالک کا موبائل نمبر لکھیں'); return false; }
    if (busy) return false;
    busy = true;
    const was = status();
    try {
      let t = await getDoc(`trials/${p}`);
      if (!t) {
        const at = new Date().toISOString();
        try { await cloud().fs(`trials?documentId=${p}`, { method: 'POST', body: JSON.stringify({ fields: { at: { timestampValue: at } } }) }); } catch (e) {}
        t = await getDoc(`trials/${p}`) || { at: { timestampValue: at } };
      }
      const s = await getDoc(`subs/${p}`);
      const fresh = st.phone !== p;
      st.phone = p; st.trialAt = fv(t.at) || st.trialAt; st.exp = s ? (fv(s.exp) || 0) : 0; st.dev = s ? (fv(s.dev) || 0) : 0; st.checked = Date.now(); save();
      const n = status();
      if (n.paid && (!was.paid || fresh)) toast('✅ آپ کی سبسکرپشن بحال ہو گئی — ' + (n.forever ? 'ہمیشہ کے لیے' : n.days + ' دن باقی'));
      else if (loud) toast(n.paid ? '✅ سبسکرپشن چالو ہے' : n.ok ? '🎁 مفت آزمائش جاری — ' + n.days + ' دن باقی' : '⛔ اس نمبر پر کوئی سبسکرپشن نہیں ملی');
      refresh();
      return true;
    } catch (e) { if (loud) toast('⚠️ سرور سے رابطہ نہیں ہو سکا، دوبارہ کوشش کریں'); return false; }
    finally { busy = false; }
  }

  // ---------- کوڈ سے چالو کرنا ----------
  async function activate(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 8) { toast('⚠️ کوڈ پورا لکھیں'); return false; }
    const p = phone();
    if (!okPhone(p)) { toast('⚠️ پہلے مالک کا موبائل نمبر لکھیں'); return false; }
    if (!navigator.onLine) { toast('⚠️ کوڈ چالو کرنے کے لیے انٹرنیٹ چاہیے'); return false; }
    try {
      const L = await getDoc(`licenses/${code}`);
      if (!L) { toast('❌ یہ کوڈ درست نہیں'); return false; }
      if (fv(L.phone) !== p) { toast('❌ یہ کوڈ کسی دوسرے موبائل نمبر کا ہے — کوڈ ' + showPhone(fv(L.phone)) + ' کے لیے بنا ہے'); return false; }
      await check(false);
      st.exp = Math.max(st.exp || 0, fv(L.exp) || 0); st.dev = Math.max(st.dev || 0, fv(L.dev) || 0); st.code = code; save();
      const s = status();
      toast(s.paid ? '✅ سبسکرپشن چالو ہو گئی — ' + (s.forever ? 'ہمیشہ کے لیے' : s.days + ' دن') : '⚠️ اس کوڈ کی مدت ختم ہو چکی');
      refresh();
      return s.paid;
    } catch (e) { toast('⚠️ سرور سے رابطہ نہیں ہو سکا، دوبارہ کوشش کریں'); return false; }
  }

  // ---------- اندراج سے پہلے: مدت ختم ہو تو روکیں ----------
  // ---------- آلات کی حد: سبسکرپشن میں جتنے آلات، کلاؤڈ کی فہرست میں اس سے بعد میں جڑے آلے پر نیا اندراج بند ----------
  function allowed() { return Math.max(BASE_DEVICES, (status().paid && st.dev) || 0); }
  function overLimit() {
    const C = window.AB_CLOUD; if (!C || !C.on() || !C.devices) return false;
    const d = C.devices(); return d.pos >= 0 && d.pos >= allowed();
  }
  function canWrite() {
    if (overLimit()) {
      toast('⛔ ڈیوائسز کی حد پوری — اس ڈیوائس پر نیا اندراج بند');
      host().modal(`<h3>📱 ڈیوائسز کی حد پوری</h3><div class="licState">آپ کی سبسکرپشن میں <span class="num">${allowed()}</span> ڈیوائسز شامل ہیں؛ یہ ڈیوائس ان کے بعد جڑی ہے۔</div>
        <div class="muted">مالک سیٹنگ ← «جڑی ہوئی ڈیوائسز» سے کوئی پرانی ڈیوائس ہٹا دیں، یا ڈویلپر سے مزید ڈیوائس لیں (ہر زیادہ ڈیوائس <span class="num">5,000</span> روپے سالانہ)۔ ریکارڈ دیکھا جا سکتا ہے۔</div>
        <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" onclick="AB_LIC.request(-1)">💬 مزید ڈیوائس — ڈویلپر سے بات</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>`);
      return false;
    }
    if (status().ok) return true;
    toast('⛔ سبسکرپشن ختم — نیا اندراج بند ہے');
    openModal();
    return false;
  }

  // ---------- ہوم کی پٹی ----------
  function strip() {
    const s = status();
    if (s.paid && (s.forever || s.days > 5)) return '';
    const cls = !s.ok ? 'off' : s.paid ? 'warn' : 'trial';
    return `<div class="licStrip ${cls}" onclick="AB_LIC.open()"><div>${!s.ok ? '⛔ سبسکرپشن ختم — نیا اندراج بند (ریکارڈ محفوظ ہے)' : s.paid ? `⏳ سبسکرپشن کے <span class="num">${s.days}</span> دن باقی` : `🎁 مفت آزمائش: <span class="num">${s.days}</span> دن باقی`}</div><button class="btn gold sm">📜 سبسکرپشن</button></div>`;
  }
  // ---------- سیٹنگ کا خانہ ----------
  function card() {
    const p = phone();
    return `<div class="card"><h3>📜 سبسکرپشن</h3><div class="licState">${statusText()}</div>
      <div class="muted">شامل ڈیوائسز: <span class="num">${allowed()}</span> (ایک فون پر کئی ملازم اپنے پن سے = ایک ڈیوائس)</div>
      <div class="muted">مالک کا موبائل نمبر: <span class="num">${esc(showPhone(p) || '—')}</span> — سبسکرپشن اسی نمبر پر ہے؛ نیا فون ہو یا ایپ دوبارہ لگے تو «بحال کریں» سے خود واپس آ جاتی ہے۔</div>
      <div class="row" style="margin-top:6px"><button class="btn" onclick="AB_LIC.open()">📜 سبسکرپشن لیں / کوڈ لکھیں</button><button class="btn light" onclick="AB_LIC.check(true)">🔄 بحال کریں</button></div></div>`;
  }

  // ---------- سبسکرپشن کا پاپ اپ ----------
  function openModal() {
    const H = host(); const p = phone();
    H.modal(`<h3>📜 آڑھت بک کی سبسکرپشن</h3><div class="licState">${statusText()}</div>
      ${okPhone(p) ? '' : `<div class="f"><label>مالک کا موبائل نمبر</label><input id="licPh" inputmode="tel" placeholder="03001234567"></div>`}
      <div class="muted" style="margin:6px 0 2px">مدت چنیں — ڈویلپر کو واٹس ایپ پر درخواست جائے گی، رقم کی ادائیگی کے بعد وہ آپ کو کوڈ بھیجیں گے:</div>
      <div class="licPlans">${PLANS.map(x => `<button class="btn light" onclick="AB_LIC.request(${x[0]})">💬 ${x[1]} — <span class="num">${rsTxt(x[2])}</span> روپے${x[0] === 365 ? '<br><small>(5,000 روپے کی بچت)</small>' : ''}</button>`).join('')}</div>
      <div class="f" style="margin-top:8px"><label>ڈویلپر سے آیا ہوا کوڈ</label><input id="licCode" placeholder="کوڈ یہاں لکھیں" style="direction:ltr;text-align:center;letter-spacing:2px"></div>
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" onclick="AB_LIC.useCode()">✅ چالو کریں</button><button class="btn light" onclick="AB_LIC.restore()">🔄 بحال کریں</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>
      <div class="muted" style="margin-top:6px">نیا فون یا ایپ دوبارہ لگائی؟ «بحال کریں» دبائیں — اسی موبائل نمبر کی باقی سبسکرپشن خود واپس آ جائے گی۔ ڈویلپر: <span class="num" dir="ltr">0320-6793793</span> (عبدالحفیظ)</div>`);
  }
  // نمبر نہ ہو تو پاپ اپ والے خانے سے لے کر محفوظ
  function takePhone() {
    const el = $('licPh'); if (!el) return true;
    const p = normPhone(el.value);
    if (!okPhone(p)) { toast('⚠️ درست موبائل نمبر لکھیں'); return false; }
    host().setPhone(el.value.trim());
    return true;
  }
  function request(days) {
    if (!takePhone()) return;
    const s = host().settings(); const plan = PLANS.find(x => x[0] === days);
    const msg = (days === -1 ? 'السلام علیکم — آڑھت بک میں مزید ڈیوائس چاہیے (ابھی ' + allowed() + ' ڈیوائسز)\n' : 'السلام علیکم — آڑھت بک کی سبسکرپشن چاہیے\n')
      + 'مدت: ' + (plan ? plan[1] + ' — ' + rsTxt(plan[2]) + ' روپے' : '') + '\n'
      + 'آڑھت: ' + (s.shop || '') + '\n'
      + 'مالک: ' + (s.owner || '') + '\n'
      + 'موبائل: ' + showPhone(phone()) + '\n'
      + 'پتہ: ' + (s.address || '');
    window.open('https://wa.me/' + DEV_WA + '?text=' + encodeURIComponent(msg), '_blank');
  }
  async function useCode() { if (!takePhone()) return; const c = ($('licCode') || {}).value; if (await activate(c)) host().closeModal(); }
  async function restore() { if (!takePhone()) return; if (await check(true)) { const m = document.querySelector('#modalBox .licState'); if (m) m.innerHTML = statusText(); } }

  function refresh() {
    document.querySelectorAll('.licState').forEach(el => { el.innerHTML = statusText(); });
    const H = host(); if (H && H.refreshHome) H.refreshHome();
  }

  // =====================================================================
  //   ڈویلپر پینل — ورژن پر 7 ٹیپ؛ ای میل/پاس ورڈ والی شناخت (صرف ڈویلپر)
  // =====================================================================
  let taps = [], dev = null;
  function tap() {
    const n = Date.now(); taps = taps.filter(t => n - t < 4000); taps.push(n);
    if (taps.length >= 7) { taps = []; devOpen(); return true; }
    return false;
  }
  async function devFs(path, opt = {}) {
    const r = await fetch(`${BASE}/${path}`, Object.assign({}, opt, { headers: { Authorization: 'Bearer ' + dev.idToken, 'Content-Type': 'application/json' } }));
    const j = r.ok ? await r.json() : null;
    if (window.AB_USAGE) window.AB_USAGE.track(opt.method || 'GET', path, opt.body, j);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status === 403 ? 'denied' : 'http ' + r.status);
    return j;
  }
  function devOpen() {
    const H = host();
    if (!dev || Date.now() > dev.until) {
      H.modal(`<h3>🛠️ ڈویلپر پینل</h3><div class="muted">صرف ڈویلپر کے لیے</div>
        <div class="f"><label>ای میل</label><input id="dvE" value="${DEV_EMAIL}" style="direction:ltr"></div>
        <div class="f"><label>پاس ورڈ</label><input id="dvP" type="password" style="direction:ltr"></div>
        <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" id="dvGo">🔓 کھولیں</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>
        <div id="uBox" class="uBox"></div>`);
      $('dvGo').onclick = devLogin;
      if (window.AB_USAGE) AB_USAGE.render('uBox');
      return;
    }
    const plans = '<option value="c">اپنی مرضی کے دن</option>' + PLANS.map(x => `<option value="${x[0]}">${x[1]}</option>`).join('') + '<option value="0">ہمیشہ کے لیے</option>';
    H.modal(`<h3>🛠️ ڈویلپر پینل — نیا کوڈ</h3>
      <div class="f"><label>گاہک کا موبائل نمبر</label><input id="dvPh" inputmode="tel" placeholder="03001234567"></div>
      <div class="f"><label>آڑھت / گاہک کا نام</label><input id="dvN"></div>
      <div class="grid2"><div class="f"><label>مدت</label><select id="dvD" onchange="document.getElementById('dvCw').style.display=this.value==='c'?'':'none'">${plans}</select></div>
        <div class="f" id="dvCw"><label>کتنے دن؟ (1 سے 3650)</label><input id="dvC" type="number" inputmode="numeric" min="1" max="3650" placeholder="مثلاً 15"></div></div>
      <div class="f"><label>کتنی ڈیوائسز؟ (3 شامل؛ ہر زیادہ ڈیوائس 5,000 سالانہ)</label><input id="dvDev" type="number" inputmode="numeric" min="1" max="50" value="3"></div>
      <div id="dvInfo" class="muted"></div>
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn light" id="dvChk">🔍 نمبر دیکھیں</button><button class="btn" id="dvMake">🎁 کوڈ بنائیں</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>
      <div id="dvOut"></div><div id="uBox" class="uBox"></div>`);
    if (window.AB_USAGE) AB_USAGE.render('uBox');
    $('dvChk').onclick = devCheck; $('dvMake').onclick = devMake;
  }
  async function devLogin() {
    const email = $('dvE').value.trim(), password = $('dvP').value;
    try {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CFG.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      if (!r.ok) { toast('❌ ای میل یا پاس ورڈ غلط ہے'); return; }
      const j = await r.json();
      dev = { idToken: j.idToken, until: Date.now() + 50 * 60000 };   // پاس ورڈ کہیں محفوظ نہیں؛ ایک گھنٹے سے کم
      devOpen();
    } catch (e) { toast('⚠️ انٹرنیٹ نہیں ہے'); }
  }
  async function devCheck() {
    const p = normPhone($('dvPh').value); const out = $('dvInfo');
    if (!okPhone(p)) { toast('⚠️ درست نمبر لکھیں'); return; }
    try {
      const s = await devFs(`subs/${p}`), t = await devFs(`trials/${p}`);
      const e = s ? fv(s.fields.exp) : 0, ta = t ? fv(t.fields.at) : 0, dv = s ? fv(s.fields.dev) || BASE_DEVICES : 0;
      out.innerHTML = `آزمائش شروع: ${ta ? urDay(ta) : 'کبھی نہیں'} • سبسکرپشن: ${e ? (e >= FOREVER - DAY ? 'ہمیشہ کے لیے' : urDay(e) + ' تک' + (e < Date.now() ? ' (ختم)' : '')) + ' • ڈیوائسز: ' + dv : 'نہیں'}`;
      if (dv) $('dvDev').value = dv;
    } catch (e) { toast(e.message === 'denied' ? '❌ اجازت نہیں — فائربیس کے اصول دیکھیں' : '⚠️ سرور سے رابطہ نہیں ہو سکا'); }
  }
  function rnd(n) { const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(x => abc[x % abc.length]).join(''); }
  async function devMake() {
    const raw = $('dvPh').value, p = normPhone(raw), name = $('dvN').value.trim();
    const days = $('dvD').value === 'c' ? Math.trunc(+$('dvC').value) : +$('dvD').value;
    if (!okPhone(p)) { toast('⚠️ درست نمبر لکھیں'); return; }
    if ($('dvD').value === 'c' && !(days >= 1 && days <= 3650)) { toast('⚠️ دن لکھیں — 1 سے 3650 تک'); return; }
    const devs = Math.trunc(+$('dvDev').value);
    if (!(devs >= 1 && devs <= 50)) { toast('⚠️ ڈیوائسز لکھیں — 1 سے 50 تک'); return; }
    const btn = $('dvMake'); btn.disabled = true;
    try {
      const s = await devFs(`subs/${p}`);
      const cur = s ? fv(s.fields.exp) || 0 : 0;
      const exp = days ? Math.max(cur, Date.now()) + days * DAY : FOREVER;
      const code = rnd(10);
      const doc = path => `projects/${CFG.projectId}/databases/(default)/documents/${path}`;
      const I = v => ({ integerValue: String(Math.trunc(v)) }), S = v => ({ stringValue: String(v) });
      await devFs(':commit', { method: 'POST', body: JSON.stringify({ writes: [
        { update: { name: doc(`licenses/${code}`), fields: { phone: S(p), name: S(name), days: I(days), exp: I(exp), dev: I(devs), at: I(Date.now()) } }, currentDocument: { exists: false } },
        { update: { name: doc(`subs/${p}`), fields: { exp: I(exp), dev: I(devs), upd: I(Date.now()) } } }
      ] }) });
      const msg = 'آڑھت بک — آپ کا سبسکرپشن کوڈ:\n' + code + '\n' + (days ? urDay(exp) + ' تک' : 'ہمیشہ کے لیے')
        + '\nایپ کھولیں ← سیٹنگ ← سبسکرپشن ← کوڈ لکھ کر «چالو کریں»';
      $('dvOut').innerHTML = `<div class="okBox"><div>✅ کوڈ بن گیا — ${esc(showPhone(p))} • ${devs} ڈیوائسز • ${days ? days + ' دن • ' : ''}${days ? esc(urDay(exp)) + ' تک' : 'ہمیشہ کے لیے'}</div><div class="joinCode num">${code}</div>
        <div class="row" style="justify-content:center"><a class="btn sm" target="_blank" href="https://wa.me/${p}?text=${encodeURIComponent(msg)}">💬 گاہک کو واٹس ایپ</a></div></div>`;
    } catch (e) { toast(e.message === 'denied' ? '❌ اجازت نہیں — فائربیس کے اصول دیکھیں' : '⚠️ کوڈ نہیں بن سکا، دوبارہ کوشش کریں'); }
    finally { btn.disabled = false; }
  }

  window.AB_LIC = {
    status, statusText, strip, card, canWrite, allowed, overLimit, check, activate, normPhone, tap,
    open: openModal, request, useCode, restore,
    start() {
      if (this._on) return; this._on = true;
      check(false);
      setInterval(() => { if (Date.now() - (st.checked || 0) > 6 * 3600e3) check(false); }, 10 * 60000);
      window.addEventListener('online', () => check(false));
    }
  };
})();
