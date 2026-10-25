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
  const DEV_WA = '923206793793';        // ڈویلپر/سبسکرپشن: پی بی ٹی کوڈ لیبز 03206793793 — کبھی نہ بدلیں
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
  const en = v => String(v == null ? '' : v).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x6F0));
  function normPhone(raw) {
    const s = en(raw).trim();
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
    // کوڈ چالو ہو جائے تو آزمائش ختم — اسی کوڈ کی تاریخ چلے (آزمائش کے دن ساتھ نہیں جڑتے)
    const n = now(), pe = paidExp(), e = pe ? pe : trialEnd();
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
    code = en(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
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
      if (s.paid && !L.usedAt) cloud().fs(`licenses/${code}?updateMask.fieldPaths=usedAt`, { method: 'PATCH', body: JSON.stringify({ fields: { usedAt: { integerValue: String(Date.now()) } } }) }).catch(() => {});
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
    const ico = { 180: '🗓️', 365: '🏆' };
    H.modal(`<div class="licHead"><h3>📜 آڑھت بک کی سبسکرپشن</h3><div class="licState">${statusText()}</div></div>
      ${okPhone(p) ? '' : `<div class="f"><label>مالک کا موبائل نمبر</label><input id="licPh" inputmode="tel" placeholder="03001234567"></div>`}
      <div class="licHint">👇 مدت پر ہاتھ رکھیں — درخواست سیدھی ڈویلپر کی واٹس ایپ چیٹ میں جائے گی؛ ادائیگی کے بعد وہ آپ کو کوڈ بھیجیں گے</div>
      <div class="licPlans2">${PLANS.map(x => `<button class="licPlan ${x[0] === 365 ? 'best' : ''}" onclick="AB_LIC.request(${x[0]}, this)">
          ${x[0] === 365 ? '<span class="rib">⭐ سب سے فائدہ مند</span>' : ''}
          <div class="pi">${ico[x[0]] || '📅'}</div><div class="pn">${x[1]}</div>
          <div class="pp">${rsTxt(x[2])} <small>روپے</small></div>
          <div class="pm">تقریباً <span class="num">${rsTxt(Math.round(x[2] / (x[0] / 30.4) / 10) * 10)}</span> روپے ماہانہ</div>
          ${x[0] === 365 ? '<div class="ps">✅ 5,000 روپے کی بچت</div>' : '<div class="ps">&nbsp;</div>'}
          <span class="pw">💬 واٹس ایپ پر درخواست</span>
          <span class="licSend"><span class="fly">💬</span><span>پیغام چیٹ میں جا رہا ہے…</span></span></button>`).join('')}</div>
      <div class="licCodeBox"><div class="lcTitle">🔑 ڈویلپر سے آیا ہوا کوڈ</div>
        <div class="lcInWrap"><span class="lcKey">🔐</span><input id="licCode" class="lcIn" placeholder="کوڈ یہاں لکھیں" autocomplete="off" spellcheck="false"></div>
        <div class="lcBtns"><button class="lcBtn go" onclick="AB_LIC.useCode()">✅ چالو کریں</button><button class="lcBtn rs" onclick="AB_LIC.restore()">🔄 بحال کریں</button><button class="lcBtn cl" onclick="App.closeModal()">✖ بند</button></div></div>
      <div class="licFoot">📱 نیا فون یا ایپ دوبارہ لگائی؟ «بحال کریں» دبائیں — اسی موبائل نمبر کی باقی سبسکرپشن خود واپس آ جائے گی۔<br><span class="dev">👨‍💻 پی بی ٹی کوڈ لیبز ☎ <span class="num" dir="ltr">0320-6793793</span></span></div>`);
  }
  // نمبر نہ ہو تو پاپ اپ والے خانے سے لے کر محفوظ
  function takePhone() {
    const el = $('licPh'); if (!el) return true;
    const p = normPhone(el.value);
    if (!okPhone(p)) { toast('⚠️ درست موبائل نمبر لکھیں'); return false; }
    host().setPhone(el.value.trim());
    return true;
  }
  function request(days, el) {
    if (!takePhone()) return;
    const s = host().settings(); const plan = PLANS.find(x => x[0] === days);
    const msg = (days === -1 ? 'السلام علیکم — آڑھت بک میں مزید ڈیوائس چاہیے (ابھی ' + allowed() + ' ڈیوائسز)\n' : 'السلام علیکم — آڑھت بک کی سبسکرپشن چاہیے\n')
      + 'مدت: ' + (plan ? plan[1] + ' — ' + rsTxt(plan[2]) + ' روپے' : '') + '\n'
      + 'آڑھت: ' + (s.shop || '') + '\n'
      + 'مالک: ' + (s.owner || '') + '\n'
      + 'موبائل: ' + showPhone(phone()) + '\n'
      + 'ڈیوائسز: ' + (days === -1 ? allowed() + 1 : allowed()) + '\n'
      + 'پتہ: ' + (s.address || '');
    const url = 'https://wa.me/' + DEV_WA + '?text=' + encodeURIComponent(msg);
    if (!el) { window.open(url, '_blank'); return; }
    // دبتا ہوا بٹن + پیغام اڑتا ہوا، پھر چیٹ (کروم میں ہاتھ رکھنے کے بعد 5 سیکنڈ تک نیا صفحہ کھل سکتا ہے)
    try { navigator.vibrate && navigator.vibrate(35); } catch (e) {}
    el.classList.add('press', 'sent');
    setTimeout(() => el.classList.remove('press'), 160);
    setTimeout(() => {
      window.open(url, '_blank');
      const t = el.querySelector('.licSend span:last-child'); if (t) t.textContent = '✅ چیٹ کھل گئی — وہاں «بھیجیں» دبائیں';
      setTimeout(() => el.classList.remove('sent'), 2600);
    }, 900);
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
      H.modal(`<div class="dvp"><h3>🛠️ ڈویلپر پینل</h3>
        <div class="grid2"><div class="f"><label>ای میل</label><input id="dvE" value="${DEV_EMAIL}" style="direction:ltr"></div>
        <div class="f"><label>پاس ورڈ</label><input id="dvP" type="password" style="direction:ltr"></div></div>
        <div class="row" style="justify-content:center;margin-top:6px"><button class="btn" id="dvGo">🔓 کھولیں</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>
        <details><summary>📊 فائربیس کا استعمال (مفت پیکج)</summary><div id="uBox" class="uBox"></div></details></div>`);
      $('dvGo').onclick = devLogin;
      if (window.AB_USAGE) AB_USAGE.render('uBox');
      return;
    }
    const plans = '<option value="c">اپنی مرضی کے دن</option>' + PLANS.map(x => `<option value="${x[0]}">${x[1]}</option>`).join('') + '<option value="0">ہمیشہ کے لیے</option>';
    H.modal(`<div class="dvp"><h3>🛠️ ڈویلپر پینل — نیا کوڈ</h3>
      <div class="f"><label>📋 گاہک کا واٹس ایپ والا پیغام یہاں پیسٹ کریں — نمبر، نام، مدت اور ڈیوائسز خود بھر جائیں گے</label><textarea id="dvPaste" rows="2" placeholder="پورا پیغام پیسٹ کریں"></textarea></div>
      <div class="grid2"><div class="f"><label>گاہک کا موبائل نمبر</label><input id="dvPh" inputmode="tel" placeholder="03001234567"></div>
        <div class="f"><label>آڑھت / گاہک کا نام</label><input id="dvN"></div>
        <div class="f"><label>مدت</label><select id="dvD" onchange="document.getElementById('dvCw').style.visibility=this.value==='c'?'visible':'hidden'">${plans}</select></div>
        <div class="f" id="dvCw"><label>کتنے دن؟</label><input id="dvC" inputmode="numeric" placeholder="1 سے 3650"></div>
        <div class="f" style="grid-column:1/-1"><label>کتنی ڈیوائسز؟ (3 شامل؛ ہر زیادہ ڈیوائس 5,000 سالانہ)</label><input id="dvDev" inputmode="numeric" value="3"></div></div>
      <div id="dvInfo" class="muted"></div>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="btn light" id="dvChk">🔍 نمبر دیکھیں</button><button class="btn" id="dvMake">🎁 کوڈ بنائیں</button><button class="btn light" onclick="AB_LIC.codes()">📋 سب کوڈ</button><button class="btn light" onclick="AB_LBL.open()">📝 الفاظ</button><button class="btn gray" onclick="App.closeModal()">بند</button></div>
      <div id="dvOut"></div>
      <details><summary>📊 فائربیس کا استعمال (مفت پیکج)</summary><div id="uBox" class="uBox"></div></details></div>`);
    if (window.AB_USAGE) AB_USAGE.render('uBox');
    $('dvChk').onclick = devCheck; $('dvMake').onclick = devMake;
    $('dvPaste').oninput = devPaste;
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
  // ---------- گاہک کا درخواست والا پیغام پیسٹ: «موبائل: … / آڑھت: … / مدت: … / ڈیوائسز: …» خود خانوں میں ----------
  function devPaste() {
    const t = en($('dvPaste').value);
    const line = k => { const m = new RegExp(k + '\\s*[:：]\\s*(.+)').exec(t); return m ? m[1].trim() : ''; };
    let ph = line('موبائل');
    if (!ph) { const m = /(\+?92|0)3\d{2}[\s-]?\d{7}/.exec(t); ph = m ? m[0] : ''; }
    if (ph) $('dvPh').value = ph.replace(/[^\d+]/g, '');
    const nm = line('آڑھت') || line('مالک'); if (nm) $('dvN').value = nm;
    const md = line('مدت');
    const pl = PLANS.find(x => md.indexOf(x[1]) === 0);
    if (pl) { $('dvD').value = String(pl[0]); $('dvCw').style.visibility = 'hidden'; }
    const dv = parseInt(line('ڈیوائسز'), 10); if (dv >= 1 && dv <= 50) $('dvDev').value = String(dv);
    const out = $('dvInfo');
    out.innerHTML = ph ? `✅ پیغام سے بھرا: ${esc(ph)}${nm ? ' • ' + esc(nm) : ''}${pl ? ' • ' + pl[1] : ''}${dv ? ' • ' + dv + ' ڈیوائسز' : ''}` : '⚠️ پیغام میں موبائل نمبر نہیں ملا';
    if (ph) devCheck();
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
    const days = $('dvD').value === 'c' ? Math.trunc(+en($('dvC').value)) : +$('dvD').value;
    if (!okPhone(p)) { toast('⚠️ درست نمبر لکھیں'); return; }
    if ($('dvD').value === 'c' && !(days >= 1 && days <= 3650)) { toast('⚠️ دن لکھیں — 1 سے 3650 تک'); return; }
    const devs = Math.trunc(+en($('dvDev').value));
    if (!(devs >= 1 && devs <= 50)) { toast('⚠️ ڈیوائسز لکھیں — 1 سے 50 تک'); return; }
    const btn = $('dvMake'); btn.disabled = true;
    try {
      const s = await devFs(`subs/${p}`);
      const cur = s ? fv(s.fields.exp) || 0 : 0;
      const exp = days ? Math.max(cur, Date.now()) + days * DAY : FOREVER;
      const code = (days ? days + 'D' : 'LT') + rnd(7);   // مدت کا اشارہ کوڈ کے شروع میں: 3D… 180D… LT… (ہمیشہ)
      const doc = path => `projects/${CFG.projectId}/databases/(default)/documents/${path}`;
      const I = v => ({ integerValue: String(Math.trunc(v)) }), S = v => ({ stringValue: String(v) });
      await devFs(':commit', { method: 'POST', body: JSON.stringify({ writes: [
        { update: { name: doc(`licenses/${code}`), fields: { phone: S(p), name: S(name), days: I(days), exp: I(exp), dev: I(devs), at: I(Date.now()) } }, currentDocument: { exists: false } },
        { update: { name: doc(`subs/${p}`), fields: { exp: I(exp), dev: I(devs), upd: I(Date.now()) } } }
      ] }) });
      const msg = 'آڑھت بک — آپ کا سبسکرپشن کوڈ:\n' + showCode(code) + '\n' + (days ? urDay(exp) + ' تک' : 'ہمیشہ کے لیے')
        + '\nایپ کھولیں ← سیٹنگ ← سبسکرپشن ← کوڈ لکھ کر «چالو کریں»';
      $('dvOut').innerHTML = `<div class="okBox"><div>✅ کوڈ بن گیا — ${esc(showPhone(p))} • ${devs} ڈیوائسز • ${days ? days + ' دن • ' : ''}${days ? esc(urDay(exp)) + ' تک' : 'ہمیشہ کے لیے'}</div><div class="joinCode num">${showCode(code)}</div>
        <div class="row" style="justify-content:center"><button class="btn light sm" onclick="AB_LIC.copy('${showCode(code)}')">📋 کوڈ کاپی</button><a class="btn sm" target="_blank" href="https://wa.me/${p}?text=${encodeURIComponent(msg)}">💬 گاہک کو واٹس ایپ</a></div></div>`;
    } catch (e) { toast(e.message === 'denied' ? '❌ اجازت نہیں — فائربیس کے اصول دیکھیں' : '⚠️ کوڈ نہیں بن سکا، دوبارہ کوشش کریں'); }
    finally { btn.disabled = false; }
  }

  // ---------- کوڈ دکھانا: مدت والا حصہ الگ (180D-K7M2QX9) ----------
  function showCode(c) { const m = /^(\d+D|LT)([A-Z0-9]{7})$/.exec(c || ''); return m ? m[1] + '-' + m[2] : (c || ''); }
  function copy(t) {
    const done = () => toast('📋 کاپی ہو گیا: ' + t);
    try { navigator.clipboard.writeText(t).then(done, () => fallback()); } catch (e) { fallback(); }
    function fallback() { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) {} a.remove(); }
  }

  // =====================================================================
  //   📋 سب کوڈ — فہرست، حساب، معطل / بحال / حذف، ترتیب، شیئر اور پرنٹ (صرف ڈویلپر)
  // =====================================================================
  let LIST = [], view = { f: 'all', sort: 'expAsc', q: '' };
  async function loadCodes() {
    const out = []; let tok = '';
    for (let g = 0; g < 20; g++) {
      const j = await devFs(`licenses?pageSize=300${tok ? '&pageToken=' + encodeURIComponent(tok) : ''}`);
      ((j && j.documents) || []).forEach(d => {
        const f = d.fields || {};
        out.push({ code: d.name.split('/').pop(), phone: fv(f.phone) || '', name: fv(f.name) || '', days: fv(f.days) || 0, exp: fv(f.exp) || 0,
          dev: fv(f.dev) || BASE_DEVICES, at: fv(f.at) || 0, usedAt: fv(f.usedAt) || 0, off: !!(f.off && f.off.booleanValue) });
      });
      tok = j && j.nextPageToken; if (!tok) break;
    }
    LIST = out;
  }
  function left(ms) {
    if (ms >= FOREVER - DAY) return 'ہمیشہ';
    const d = ms - Date.now(); if (d <= 0) return 'ختم';
    const dd = Math.floor(d / DAY), hh = Math.floor((d % DAY) / 3600e3), mm = Math.floor((d % 3600e3) / 60000);
    return dd ? `${dd} دن ${hh} گھنٹے` : `${hh} گھنٹے ${mm} منٹ`;
  }
  const BUCKETS = [
    ['all', 'سب', () => true],
    ['live', 'چالو', x => !x.off && x.exp > Date.now()],
    ['d7', '7 دن میں ختم', x => !x.off && x.exp > Date.now() && x.exp - Date.now() <= 7 * DAY],
    ['d15', '15 دن میں ختم', x => !x.off && x.exp > Date.now() && x.exp - Date.now() <= 15 * DAY],
    ['d30', '30 دن میں ختم', x => !x.off && x.exp > Date.now() && x.exp - Date.now() <= 30 * DAY],
    ['month', 'اس مہینے ختم', x => { const n = new Date(), e = new Date(x.exp); return !x.off && x.exp > Date.now() && e.getFullYear() === n.getFullYear() && e.getMonth() === n.getMonth(); }],
    ['unused', 'ابھی چالو نہیں ہوئے', x => !x.off && !x.usedAt],
    ['ended', 'ختم شدہ', x => !x.off && x.exp <= Date.now()],
    ['off', 'معطل', x => x.off]
  ];
  function rows() {
    const b = BUCKETS.find(x => x[0] === view.f) || BUCKETS[0];
    const q = en(view.q).trim().toUpperCase().replace(/-/g, '');
    let r = LIST.filter(b[2]).filter(x => !q || (x.name + ' ' + showPhone(x.phone) + ' ' + x.phone + ' ' + x.code).toUpperCase().replace(/-/g, '').indexOf(q) >= 0);
    const S = { expAsc: (a, b) => a.exp - b.exp, expDesc: (a, b) => b.exp - a.exp, atDesc: (a, b) => b.at - a.at, atAsc: (a, b) => a.at - b.at, name: (a, b) => a.name.localeCompare(b.name, 'ur') };
    return r.sort(S[view.sort] || S.expAsc);
  }
  function codesHtml() {
    const r = rows();
    return `<div class="dvp"><h3>📋 سب کوڈ (${LIST.length})</h3>
      <div class="cdChips">${BUCKETS.map(b => `<button class="${view.f === b[0] ? 'on' : ''}" onclick="AB_LIC.cv('f','${b[0]}')">${b[1]} <b class="num">${LIST.filter(b[2]).length}</b></button>`).join('')}</div>
      <div class="grid2"><div class="f"><input id="cdQ" placeholder="🔍 نام، نمبر یا کوڈ" value="${esc(view.q)}" oninput="AB_LIC.cv('q',this.value,true)"></div>
        <div class="f"><select onchange="AB_LIC.cv('sort',this.value)">${[['expAsc', 'ختم: قریب پہلے'], ['expDesc', 'ختم: دور پہلے'], ['atDesc', 'بنے: نئے پہلے'], ['atAsc', 'بنے: پرانے پہلے'], ['name', 'نام سے']].map(o => `<option value="${o[0]}" ${view.sort === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div></div>
      <div id="cdList" class="cdList">${listHtml(r)}</div>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="btn light sm" onclick="AB_LIC.shareCodes()">📤 شیئر</button><button class="btn light sm" onclick="AB_LIC.printCodes()">🖨️ پرنٹ</button><button class="btn light sm" onclick="AB_LIC.codes(true)">🔄 تازہ</button><button class="btn gray sm" onclick="AB_LIC.dev()">⬅️ واپس</button></div></div>`;
  }
  function listHtml(r) {
    return r.map(x => {
      const st = x.off ? '⏸️ معطل' : x.exp <= Date.now() ? '⛔ ختم' : x.usedAt ? '✅ چالو' : '🕓 ابھی چالو نہیں ہوا';
      return `<div class="cdRow ${x.off ? 'off' : x.exp <= Date.now() ? 'end' : x.exp - Date.now() <= 7 * DAY ? 'soon' : ''}">
        <div class="cdTop"><b>${esc(x.name || '—')}</b><span class="num" dir="ltr">${esc(showPhone(x.phone))}</span></div>
        <div class="cdMid"><span class="num" dir="ltr">${showCode(x.code)}</span><span>${st}</span><span>📱 <span class="num">${x.dev}</span></span></div>
        <div class="cdSub">بنا: ${x.at ? urDay(x.at) : '—'} • چالو: ${x.usedAt ? urDay(x.usedAt) : '—'} • ختم: ${x.exp >= FOREVER - DAY ? 'ہمیشہ' : urDay(x.exp)} • باقی: <b>${left(x.exp)}</b></div>
        <div class="row cdBtns"><button class="btn light sm" onclick="AB_LIC.copy('${showCode(x.code)}')">📋</button>
          <a class="btn light sm" target="_blank" href="https://wa.me/${x.phone}">💬</a>
          <button class="btn light sm" onclick="AB_LIC.cOff('${x.code}')">${x.off ? '▶️ بحال' : '⏸️ معطل'}</button>
          <button class="btn gray sm" onclick="AB_LIC.cDel('${x.code}')">🗑️</button></div></div>`;
    }).join('') || '<div class="muted">کوئی کوڈ نہیں</div>';
  }
  async function codes(reload) {
    if (!dev || Date.now() > dev.until) { devOpen(); return; }
    const H = host();
    if (reload || !LIST.length) {
      H.modal('<div class="dvp"><h3>📋 سب کوڈ</h3><div class="muted">⏳ فہرست آ رہی ہے…</div></div>');
      try { await loadCodes(); } catch (e) { H.modal('<div class="dvp"><h3>📋 سب کوڈ</h3><div class="muted">⚠️ فہرست نہیں آ سکی — انٹرنیٹ یا فائربیس کے اصول دیکھیں</div><button class="btn gray sm" onclick="AB_LIC.dev()">⬅️ واپس</button></div>'); return; }
    }
    H.modal(codesHtml());
  }
  function cv(k, v, typing) {
    view[k] = v;
    if (typing) { const l = $('cdList'); if (l) l.innerHTML = listHtml(rows()); return; }
    host().modal(codesHtml());
  }
  // ایک نمبر کی سبسکرپشن دوبارہ حساب: اس نمبر کے غیر معطل کوڈ بننے کی ترتیب سے جمع (جیسے بنتے وقت ہوئے تھے)
  async function recompute(phone) {
    let exp = 0, dv = 0;
    LIST.filter(x => x.phone === phone && !x.off).sort((a, b) => a.at - b.at).forEach(x => {
      exp = x.days ? Math.max(exp, x.at) + x.days * DAY : FOREVER; dv = Math.max(dv, x.dev);
    });
    await devFs(`subs/${phone}`, { method: 'PATCH', body: JSON.stringify({ fields: { exp: { integerValue: String(exp) }, dev: { integerValue: String(dv || BASE_DEVICES) }, upd: { integerValue: String(Date.now()) } } }) });
  }
  async function cOff(code) {
    const x = LIST.find(y => y.code === code); if (!x) return;
    if (!(await host().ask((x.off ? 'یہ کوڈ دوبارہ چالو کریں؟ ' : 'یہ کوڈ معطل کریں؟ گاہک کی سبسکرپشن اگلی جانچ پر (زیادہ سے زیادہ 6 گھنٹے میں) رک جائے گی۔ ') + showCode(code), x.off ? 'بحال کریں' : 'معطل کریں'))) { codes(); return; }
    try {
      await devFs(`licenses/${code}?updateMask.fieldPaths=off`, { method: 'PATCH', body: JSON.stringify({ fields: { off: { booleanValue: !x.off } } }) });
      x.off = !x.off; await recompute(x.phone); toast(x.off ? '⏸️ معطل ہو گیا' : '▶️ بحال ہو گیا');
    } catch (e) { toast('⚠️ نہیں ہو سکا — انٹرنیٹ دیکھیں'); }
    codes();
  }
  async function cDel(code) {
    const x = LIST.find(y => y.code === code); if (!x) return;
    if (!(await host().ask('یہ کوڈ ہمیشہ کے لیے حذف کریں؟ ' + showCode(code) + ' — ' + esc(x.name) + '۔ گاہک کی سبسکرپشن سے اس کے دن نکل جائیں گے۔', 'حذف کریں'))) { codes(); return; }
    try { await devFs(`licenses/${code}`, { method: 'DELETE' }); LIST = LIST.filter(y => y.code !== code); await recompute(x.phone); toast('🗑️ حذف ہو گیا'); }
    catch (e) { toast('⚠️ نہیں ہو سکا — انٹرنیٹ دیکھیں'); }
    codes();
  }
  function codesText() {
    const b = BUCKETS.find(x => x[0] === view.f) || BUCKETS[0];
    return '📒 آڑھت بک — کوڈوں کی فہرست (' + b[1] + ') — ' + urDay(Date.now()) + '\n\n' + rows().map((x, i) =>
      `${i + 1}) ${x.name || '—'} — ${showPhone(x.phone)}\nکوڈ: ${showCode(x.code)} • ${x.dev} ڈیوائسز • ${x.off ? 'معطل' : x.exp <= Date.now() ? 'ختم' : x.usedAt ? 'چالو' : 'ابھی چالو نہیں ہوا'}\nبنا: ${x.at ? urDay(x.at) : '—'} • چالو: ${x.usedAt ? urDay(x.usedAt) : '—'} • ختم: ${x.exp >= FOREVER - DAY ? 'ہمیشہ' : urDay(x.exp)} • باقی: ${left(x.exp)}`).join('\n\n');
  }
  function shareCodes() {
    const t = codesText();
    if (navigator.share) navigator.share({ text: t }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
  }
  function printCodes() {
    const w = window.open('', '_blank'); if (!w) { toast('⚠️ پرنٹ والا صفحہ نہیں کھل سکا'); return; }
    const b = BUCKETS.find(x => x[0] === view.f) || BUCKETS[0];
    w.document.write(`<!DOCTYPE html><html lang="ur" dir="rtl"><head><meta charset="utf-8"><title>کوڈوں کی فہرست</title><style>body{font-family:'Noori',Tahoma,sans-serif;margin:12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:4px;text-align:right}th{background:#fde2e2}.n{direction:ltr;unicode-bidi:embed;font-family:Tahoma}</style></head><body>
      <h2 style="margin:0 0 6px">📒 آڑھت بک — کوڈوں کی فہرست (${b[1]}) — ${urDay(Date.now())}</h2>
      <table><tr><th>#</th><th>نام</th><th>موبائل</th><th>کوڈ</th><th>ڈیوائسز</th><th>حالت</th><th>بنا</th><th>چالو</th><th>ختم</th><th>باقی</th></tr>
      ${rows().map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td class="n">${esc(showPhone(x.phone))}</td><td class="n">${showCode(x.code)}</td><td>${x.dev}</td><td>${x.off ? 'معطل' : x.exp <= Date.now() ? 'ختم' : x.usedAt ? 'چالو' : 'ابھی نہیں'}</td><td>${x.at ? urDay(x.at) : '—'}</td><td>${x.usedAt ? urDay(x.usedAt) : '—'}</td><td>${x.exp >= FOREVER - DAY ? 'ہمیشہ' : urDay(x.exp)}</td><td>${left(x.exp)}</td></tr>`).join('')}</table>
      <script>setTimeout(function(){print()},400)<\/script></body></html>`);
    w.document.close();
  }

  window.AB_LIC = {
    status, statusText, strip, card, canWrite, allowed, overLimit, check, activate, normPhone, tap,
    open: openModal, request, useCode, restore, copy, codes, cv, cOff, cDel, shareCodes, printCodes, dev: () => devOpen(),
    start() {
      if (this._on) return; this._on = true;
      check(false);
      setInterval(() => { if (Date.now() - (st.checked || 0) > 6 * 3600e3) check(false); }, 10 * 60000);
      window.addEventListener('online', () => check(false));
    }
  };
})();
