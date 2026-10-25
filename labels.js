/* 📒 آڑھت بک — الفاظ اپنی منڈی کی زبان میں (مثلاً زمیندار → بیوپاری، خریدار → گاہک)
   - صرف لکھائی بدلتی ہے؛ حساب (جمع / نفی) کبھی نہیں بدلتا
   - بدلے ہوئے الفاظ settings.labels میں ({پرانا: نیا}) — آڑھت کی سب ڈیوائسز پر (کلاؤڈ سے)
   - بدلنا صرف ڈویلپر پینل سے (پاس ورڈ) — آڑھتی / ملازم خود نہیں بدل سکتے
   - ہر نیا بنا ہوا متن (اسکرین، پاپ اپ، پیغام، تصویر، پرنٹ) خود بدلتا ہے؛ پورا لفظ ہی بدلتا ہے (رنگ میں «نگ» نہیں) */
(() => {
  'use strict';
  // [اصل لفظ، بتانے والی بات] — جمع کی شکلیں الگ، تاکہ «زمینداروں» بھی ٹھیک بدلے
  const KEYS = [
    ['زمیندار', 'مال بھیجنے والا'], ['زمینداروں', 'زمیندار — جمع'],
    ['خریدار', 'مال خریدنے والا'], ['خریداروں', 'خریدار — جمع'],
    ['پرچی', 'زمیندار کا حساب'], ['پرچیاں', 'پرچی — جمع'], ['پرچیوں', 'پرچی — جمع'],
    ['بکری', 'فروخت'], ['جنس', 'مال کی قسم'], ['نگ', 'گنتی'], ['من', '40 کلو'],
    ['کمیشن', ''], ['مزدوری', ''], ['منڈی خرچہ', ''], ['مارکیٹ فیس', ''], ['منشیانہ', ''], ['گاڑی کا کرایہ', ''], ['چنگی', ''],
    ['کل کٹوتی', 'سب کٹوتیوں کا جوڑ'], ['صاف رقم', 'زمیندار کو ملنے والی رقم'],
    ['جمع', 'کھاتے میں آنے والی رقم'], ['بنام', 'کھاتے سے جانے والی رقم'],
    ['وصولی', ''], ['ادائیگی', ''], ['پیشگی', 'ایڈوانس'], ['نقد', ''],
    ['کھاتہ', ''], ['کھاتے', ''], ['روزنامچہ', ''], ['گاڑی', ''], ['بلٹی', ''],
    ['پیکنگ', ''], ['ورائیٹی', ''], ['مارکہ', ''], ['آڑھت', ''], ['آڑھتی', '']
  ];
  // تیار سانچے
  const PRESETS = {
    plain: { label: 'عام (زمیندار / خریدار)', map: {} },
    beopari: { label: 'فروٹ / سبزی منڈی (بیوپاری / گاہک)', map: { 'زمیندار': 'بیوپاری', 'زمینداروں': 'بیوپاریوں', 'خریدار': 'گاہک', 'خریداروں': 'گاہکوں', 'کل کٹوتی': 'ٹوٹل میزان', 'منڈی خرچہ': 'مارکیٹ فیس' } }
  };
  const host = () => window.AB_HOST;
  const AR = '\\u0621-\\u064A\\u0660-\\u06FF';   // اردو حروف — لفظ کی حد
  let map = {}, rx = null;
  function build() {
    const st = host() && host().settings ? host().settings() : {};
    map = Object.assign({}, (st && st.labels) || {});
    // جمع خالی ہو تو خود بنے: بیوپاری → بیوپاریوں
    [['زمیندار', 'زمینداروں'], ['خریدار', 'خریداروں']].forEach(([s, p]) => { if (map[s] && !map[p]) map[p] = map[s] + 'وں'; });
    Object.keys(map).forEach(k => { if (!map[k] || map[k] === k) delete map[k]; });
    const ks = Object.keys(map).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    rx = ks.length ? new RegExp(`(^|[^${AR}])(${ks.join('|')})(?=[^${AR}]|$)`, 'g') : null;
  }
  function L(s) {
    if (!rx || s == null) return s;
    const t = String(s); rx.lastIndex = 0;
    return rx.test(t) ? t.replace(rx, (m, pre, w) => pre + map[w]) : t;
  }
  function Lspec(o) {
    if (!rx) return o;
    if (typeof o === 'string') return L(o);
    if (Array.isArray(o)) return o.map(Lspec);
    if (o && typeof o === 'object') { const r = {}; Object.keys(o).forEach(k => { r[k] = Lspec(o[k]); }); return r; }
    return o;
  }
  // ---------- اسکرین پر نیا متن آتے ہی بدلیں ----------
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
  function fixNode(n) {
    if (!rx) return;
    if (n.nodeType === 3) {
      const p = n.parentNode; if (!p || SKIP.has(p.nodeName) || (p.closest && p.closest('[data-nolbl]'))) return;
      const v = L(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v;
      return;
    }
    if (n.nodeType !== 1 || n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') return;
    if (n.closest && n.closest('[data-nolbl]')) return;
    ['placeholder', 'title', 'aria-label'].forEach(a => { const v = n.getAttribute && n.getAttribute(a); if (v) { const w = L(v); if (w !== v) n.setAttribute(a, w); } });
    if (n.nodeName === 'INPUT' || n.nodeName === 'TEXTAREA') return;
    const tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let c; while ((c = tw.nextNode())) { if (c.nodeType === 3) fixNode(c); else ['placeholder', 'title', 'aria-label'].forEach(a => { const v = c.getAttribute(a); if (v) { const w = L(v); if (w !== v) c.setAttribute(a, w); } }); }
  }
  let obs = null;
  function install() {
    build();
    if (obs) obs.disconnect();
    if (!rx) return;
    fixNode(document.body);
    // اپنی کی ہوئی تبدیلیاں دوبارہ نہ پکڑیں (takeRecords) — ورنہ چکر بن سکتا ہے
    obs = new MutationObserver(list => { list.forEach(m => { if (m.type === 'characterData') fixNode(m.target); else m.addedNodes.forEach(fixNode); }); obs.takeRecords(); });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ---------- ڈویلپر پینل: الفاظ بدلنے کا صفحہ ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let draft = null;
  function editor() {
    const st = host().settings();
    if (!draft) draft = Object.assign({}, st.labels || {});
    const keys = KEYS.map(k => k[0]);
    const extra = Object.keys(draft).filter(k => !keys.includes(k));
    host().modal(`<div class="dvp" data-nolbl><h3>📝 الفاظ اپنی منڈی کی زبان میں</h3>
      <div class="muted">صرف لکھائی بدلتی ہے، حساب نہیں۔ خالی چھوڑیں تو اصل لفظ رہے گا۔ یہ آڑھت کی سب ڈیوائسز پر لگے گا۔</div>
      <div class="row" style="margin:6px 0">${Object.keys(PRESETS).map(k => `<button class="btn light sm" onclick="AB_LBL.preset('${k}')">${PRESETS[k].label}</button>`).join('')}</div>
      <div class="lblList">${KEYS.map(([k, hint]) => `<div class="lblRow"><span class="lblK">${esc(k)}${hint ? `<small>${esc(hint)}</small>` : ''}</span><span>←</span><input data-k="${esc(k)}" value="${esc(draft[k] || '')}" placeholder="${esc(k)}"></div>`).join('')}
        ${extra.map((k, i) => `<div class="lblRow"><input class="lblFrom" data-i="${i}" value="${esc(k)}" placeholder="اصل لفظ"><span>←</span><input data-x="${i}" value="${esc(draft[k] || '')}" placeholder="نیا لفظ"></div>`).join('')}
        <div class="lblRow"><input class="lblFrom" id="lblNewFrom" placeholder="➕ کوئی بھی اصل لفظ"><span>←</span><input id="lblNewTo" placeholder="نیا لفظ"></div></div>
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" onclick="AB_LBL.save()">💾 محفوظ کریں</button><button class="btn light" onclick="AB_LBL.reset()">↩️ اصل پر واپس</button><button class="btn gray" onclick="AB_LBL.close()">بند</button></div></div>`);
  }
  function collect() {
    const out = {};
    document.querySelectorAll('#modalBox input[data-k]').forEach(i => { const v = i.value.trim(); if (v) out[i.dataset.k] = v; });
    const froms = [...document.querySelectorAll('#modalBox input.lblFrom[data-i]')];
    froms.forEach(f => { const to = document.querySelector(`#modalBox input[data-x="${f.dataset.i}"]`); const a = f.value.trim(), b = to ? to.value.trim() : ''; if (a && b) out[a] = b; });
    const nf = (document.getElementById('lblNewFrom') || {}).value, nt = (document.getElementById('lblNewTo') || {}).value;
    if (nf && nf.trim() && nt && nt.trim()) out[nf.trim()] = nt.trim();
    return out;
  }
  window.AB_LBL = {
    KEYS, PRESETS, L, Lspec, install,
    open() { draft = null; editor(); },
    preset(k) { draft = Object.assign(collect(), PRESETS[k].map); if (k === 'plain') draft = {}; editor(); },
    reset() { draft = {}; editor(); },
    save() { const m = collect(); host().setLabels(m); draft = null; host().closeModal(); host().toast('✅ الفاظ محفوظ — سب ڈیوائسز پر لگ جائیں گے'); },
    close() { draft = null; host().closeModal(); }
  };
})();
