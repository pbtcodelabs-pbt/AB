/* 📒 آڑھت بک — فائربیس کے استعمال کا میٹر (موبائل کے نیٹ پیکج جیسا)
   - ایپ کی ہر فائربیس درخواست گنی جاتی ہے: پڑھنا (read)، لکھنا (write)، مٹانا (delete)
   - ہر آلہ اپنی گنتی 10 منٹ بعد سرور پر usage/<دن> میں جمع کرتا ہے (ایک لکھائی) — سب آڑھتوں/آلات کا کل
   - مفت پیکج (Spark) کی حد روزانہ: 50,000 پڑھنا، 20,000 لکھنا، 20,000 مٹانا — امریکی وقت کی آدھی رات کو نئی
     (پاکستان میں دوپہر 12 بجے گرمیوں میں، 1 بجے سردیوں میں)
   - Blaze ہو تو حد سے اوپر کا اندازاً بل (ممبئی کی قیمتیں، ڈالر فی ایک لاکھ)
   - یہ گنتی ایپ کی اپنی ہے (اندازاً)؛ پکا حساب فائربیس کنسول ← Usage میں */
(() => {
  'use strict';
  const CFG = window.AB_FIREBASE;
  if (!CFG) return;
  const FREE = { r: 50000, w: 20000, d: 20000 };
  const PRICE = { r: 0.035, w: 0.105, d: 0.0115 };   // ڈالر فی 1,00,000 — اندازاً (Firestore، asia-south1)
  const PKR = 280;                                     // ڈالر کا اندازاً ریٹ
  const KEY = 'ab_usage';                              // آلہ وار: آج کی گنتی + ابھی سرور پر نہ بھیجی گئی
  const BASE = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents`;
  const $ = id => document.getElementById(id);

  // ---------- فائربیس کا «دن»: امریکی (پیسیفک) وقت ----------
  function day(t) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t || new Date()); }
    catch (e) { return new Date((t || Date.now()) - 8 * 3600e3).toISOString().slice(0, 10); }
  }
  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { st = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  function roll() {
    const d = day();
    if (st.day !== d) {
      // کل کی نہ بھیجی گئی گنتی کل کے نام پر الگ رکھیں
      if (st.day && (st.pr || st.pw || st.pd)) st.old = { day: st.day, r: st.pr || 0, w: st.pw || 0, d: st.pd || 0 };
      Object.assign(st, { day: d, r: 0, w: 0, d: 0, pr: 0, pw: 0, pd: 0 });
    }
  }
  function add(r, w, d) {
    roll();
    st.r += r; st.w += w; st.d += d; st.pr += r; st.pw += w; st.pd += d; save();
  }

  // ---------- ہر درخواست کی گنتی (فائربیس کے اپنے قاعدے کے مطابق) ----------
  // دستاویز پڑھنا = 1؛ تلاش/فہرست = جتنی دستاویزات آئیں (کچھ نہ آئے تب بھی 1)؛ commit = ہر تبدیلی 1
  function track(method, url, body, json) {
    try {
      method = (method || 'GET').toUpperCase();
      if (/:runQuery/.test(url)) { const n = Array.isArray(json) ? json.filter(x => x.document).length : 0; add(Math.max(1, n), 0, 0); return; }
      if (/:commit/.test(url)) {
        const ws = (JSON.parse(body || '{}').writes || []);
        add(0, ws.filter(w => !w.delete).length, ws.filter(w => w.delete).length); return;
      }
      if (method === 'GET') { add(json && json.documents ? Math.max(1, json.documents.length) : 1, 0, 0); return; }
      if (method === 'DELETE') { add(0, 0, 1); return; }
      add(0, 1, 0);
    } catch (e) {}
  }

  // ---------- سرور پر جمع کرنا: ایک commit، increment سے (کئی آلات ایک ساتھ بھی درست) ----------
  let flushing = false;
  async function flushOne(d, r, w, del) {
    const name = `projects/${CFG.projectId}/databases/(default)/documents/usage/${d}`;
    const inc = (f, n) => ({ fieldPath: f, increment: { integerValue: String(n) } });
    const body = JSON.stringify({ writes: [{ transform: { document: name, fieldTransforms: [inc('r', r), inc('w', w + 1), inc('d', del)] } }] });
    await window.AB_CLOUD.fs(`${BASE.replace(/\/documents$/, '')}/documents:commit`, { method: 'POST', body, _noCount: true });
  }
  async function flush() {
    if (flushing || !navigator.onLine || !window.AB_CLOUD || !window.AB_CLOUD.fs) return;
    roll();
    flushing = true;
    try {
      if (st.old) { const o = st.old; await flushOne(o.day, o.r, o.w, o.d); delete st.old; save(); }
      if (st.pr || st.pw || st.pd) {
        const r = st.pr, w = st.pw, del = st.pd;
        await flushOne(st.day, r, w, del);
        st.pr -= r; st.pw -= w; st.pd -= del; st.w += 1; save();
      }
    } catch (e) {} finally { flushing = false; }
  }
  setInterval(flush, 10 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // ---------- دکھانا ----------
  const n = v => Math.round(v || 0).toLocaleString('en-US');
  function bar(label, used, free) {
    const pct = Math.min(100, Math.round(used * 100 / free));
    const cls = pct >= 80 ? 'red' : pct >= 50 ? 'yel' : 'grn';
    return `<div class="uRow"><div class="uTop"><span>${label}</span><span class="num" dir="ltr">${n(used)} / ${n(free)}</span></div>
      <div class="uBar"><i class="${cls}" style="width:${Math.max(2, pct)}%"></i></div>
      <div class="uSub"><span>استعمال: <b class="num">${pct}%</b></span><span>باقی: <b class="num">${n(Math.max(0, free - used))}</b> (<span class="num">${Math.max(0, 100 - pct)}%</span>)</span></div></div>`;
  }
  const over = (u, k) => Math.max(0, (u[k] || 0) - FREE[k]);
  const cost = u => (over(u, 'r') * PRICE.r + over(u, 'w') * PRICE.w + over(u, 'd') * PRICE.d) / 1e5;
  async function getDays() {
    // اس مہینے کے دن (سب آلات کا کل)
    const res = await window.AB_CLOUD.fs(`usage?pageSize=40`);
    const out = {};
    (res.documents || []).forEach(x => { const f = x.fields || {}; out[x.name.split('/').pop()] = { r: +(f.r && f.r.integerValue || 0), w: +(f.w && f.w.integerValue || 0), d: +(f.d && f.d.integerValue || 0) }; });
    return out;
  }
  async function render(boxId) {
    const box = $(boxId); if (!box) return;
    box.innerHTML = '<div class="muted">⏳ استعمال دیکھا جا رہا ہے…</div>';
    await flush();
    let days = {};
    try { days = await getDays(); } catch (e) { box.innerHTML = '<div class="muted">⚠️ سرور سے استعمال نہیں مل سکا — انٹرنیٹ دیکھیں</div>'; return; }
    const t = days[day()] || { r: 0, w: 0, d: 0 };
    const mk = day().slice(0, 7);
    const month = Object.keys(days).filter(k => k.indexOf(mk) === 0);
    let mCost = 0, mR = 0, mW = 0; month.forEach(k => { mCost += cost(days[k]); mR += days[k].r; mW += days[k].w; });
    const dn = Math.max(1, month.length), full = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
    const proj = mCost / dn * full;
    const top = Object.keys(days).sort().slice(-7).reverse();
    box.innerHTML = `<div class="uHead">📊 آج کا مفت پیکج (سب آڑھتیں اور سب آلات ملا کر)</div>
      ${bar('📖 پڑھنا', t.r, FREE.r)}${bar('✍️ لکھنا', t.w, FREE.w)}${bar('🗑️ مٹانا', t.d, FREE.d)}
      <div class="muted">مفت حد ہر روز نئی ہوتی ہے — پاکستان میں دوپہر 12 بجے (سردیوں میں 1 بجے)۔ اس آلے کا آج کا حصہ: پڑھنا <span class="num">${n(st.r)}</span>، لکھنا <span class="num">${n(st.w)}</span>۔</div>
      <div class="uHead" style="margin-top:8px">💳 اگر Blaze (پیسوں والا) پیکج ہوتا</div>
      <div class="uCost">آج کا بل: <b class="num" dir="ltr">$${cost(t).toFixed(2)}</b> (تقریباً <span class="num">${n(cost(t) * PKR)}</span> روپے)<br>
        اس مہینے اب تک: <b class="num" dir="ltr">$${mCost.toFixed(2)}</b> (<span class="num">${n(mCost * PKR)}</span> روپے) • پورے مہینے کا اندازہ: <b class="num" dir="ltr">$${proj.toFixed(2)}</b> (<span class="num">${n(proj * PKR)}</span> روپے)<br>
        <span class="muted">اس مہینے کل: پڑھنا <span class="num">${n(mR)}</span>، لکھنا <span class="num">${n(mW)}</span> — مفت حد کے اندر کا کوئی بل نہیں۔</span></div>
      <div class="uHead" style="margin-top:8px">📅 پچھلے دن</div>
      <div class="uDays">${top.map(k => `<div><span class="num">${k.slice(8)}/${k.slice(5, 7)}</span><span>📖 <span class="num">${n(days[k].r)}</span></span><span>✍️ <span class="num">${n(days[k].w)}</span></span><span class="num">${Math.round(days[k].r * 100 / FREE.r)}%</span></div>`).join('') || '<div class="muted">ابھی کچھ نہیں</div>'}</div>
      <div class="muted" style="margin-top:6px">یہ گنتی ایپ خود کرتی ہے (اندازاً، 10 منٹ کی دیر سے)۔ پکا حساب: فائربیس کنسول ← Usage۔</div>`;
  }

  window.AB_USAGE = { track, add, flush, render, today: () => (roll(), { r: st.r, w: st.w, d: st.d }), day };
})();
