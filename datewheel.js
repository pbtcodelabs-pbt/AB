/* 📒 آڑھت بک — 📅 تاریخ کا ویل (فروٹ منڈی والا): دائیں سال، درمیان مہینہ، بائیں دن؛ بیچ والا ریڈیم رنگ میں چمکتا، باقی دھندلے
   - ہر <input type="date"> خود ویل بن جاتا ہے (data-nowheel ہو تو نہیں)؛ اصل خانہ چھپا رہتا ہے اور اسی کی قیمت بدلتی ہے
   - ویل رکتے ہی خانے پر input + change چلتے ہیں — پرانے onchange ویسے ہی کام کرتے ہیں
   - ساتھ بڑا دن کا نام اور پوری تاریخ (25 اکتوبر 2026) + «آج / کل / پچھلی تاریخ» کا نشان
   - اونچائی کم (تین قطاریں، ہر قطار 20 پکسل)؛ انگلی، ماؤس کا پہیہ، کلک اور ↑ ↓ بٹن سب سے چلتا ہے */
(() => {
  'use strict';
  const H = 20;
  const MONTHS = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
  const DAYS = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];
  const p2 = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const today = () => key(new Date());
  const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

  function fill(col, items) { col.innerHTML = '<div class="dwSp"></div>' + items.map(([v, t]) => `<div class="dwIt" data-v="${v}">${t}</div>`).join('') + '<div class="dwSp"></div>'; }
  function idx(col, v) { return Math.max(0, [...col.querySelectorAll('.dwIt')].findIndex(e => +e.dataset.v === +v)); }
  function paint(col) {
    const c = col.scrollTop / H;
    col.querySelectorAll('.dwIt').forEach((e, i) => {
      const d = Math.abs(i - c);
      e.style.opacity = Math.max(.2, 1 - d * .4);
      e.style.filter = d < .5 ? 'none' : `blur(${Math.min(2, d).toFixed(2)}px)`;
      e.style.transform = `scale(${Math.max(.8, 1 - d * .1).toFixed(3)})`;
      e.classList.toggle('on', d < .5);
    });
  }
  function go(col, v, smooth) {
    if (col.__busy) return;
    const t = idx(col, v) * H;
    if (Math.abs(col.scrollTop - t) > 1) { if (smooth) col.scrollTo({ top: t, behavior: 'smooth' }); else col.scrollTop = t; }
    paint(col);
  }
  // دکھانا: ویل کی جگہ + بڑا دن + پوری تاریخ
  function apply(box, smooth, fire) {
    const v = box.__v, inp = box.__inp;
    const dim = new Date(v.y, v.m, 0).getDate(); if (v.d > dim) v.d = dim;
    const cy = box.querySelector('[data-k="y"]'), cm = box.querySelector('[data-k="m"]'), cd = box.querySelector('[data-k="d"]');
    if (cd.querySelectorAll('.dwIt').length !== dim) { fill(cd, Array.from({ length: dim }, (_, i) => [i + 1, i + 1])); cd.scrollTop = idx(cd, v.d) * H; }
    go(cy, v.y, smooth); go(cm, v.m, smooth); go(cd, v.d, smooth);
    const k = `${v.y}-${p2(v.m)}-${p2(v.d)}`, t = today();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const empty = !box.__set;
    box.querySelector('.dwDay').textContent = empty ? '📅 سب تاریخیں' : DAYS[new Date(v.y, v.m - 1, v.d).getDay()];
    box.querySelector('.dwFull').innerHTML = empty ? '<span class="dwHint">چننے کے لیے ویل گھمائیں</span>'
      : `<span class="n">${v.d}</span>${MONTHS[v.m - 1]}<span class="n">${v.y}</span>` +
        (k === t ? '<span class="dwTag">آج</span>' : k === key(y) ? '<span class="dwTag">کل</span>' : k < t ? '<span class="dwTag old">پچھلی تاریخ</span>' : '<span class="dwTag old">آگے کی تاریخ</span>');
    if (fire && inp.value !== k) {
      inp.value = k;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function enhance(inp) {
    if (inp.__dw || inp.dataset.nowheel != null) return;
    inp.__dw = true;
    const box = document.createElement('div');
    box.className = 'dwBox'; box.dir = 'rtl';
    box.innerHTML = '<div class="dwWheels"><div class="dwCol" data-k="y" tabindex="0" aria-label="سال"></div><div class="dwCol" data-k="m" tabindex="0" aria-label="مہینہ"></div><div class="dwCol" data-k="d" tabindex="0" aria-label="دن"></div><div class="dwBand"></div></div><div class="dwShow"><div class="dwDay"></div><div class="dwFull"></div></div>';
    inp.style.display = 'none';
    // دو کالم والے فارم میں ویل پوری چوڑائی لے (آدھی جگہ میں نہیں سماتا)
    const cell = inp.closest('.f'); if (cell && cell.parentElement && getComputedStyle(cell.parentElement).display === 'grid') cell.style.gridColumn = '1 / -1';
    inp.insertAdjacentElement('afterend', box);
    box.__inp = inp; box.__set = ok(inp.value);
    const t = today(), val = ok(inp.value) ? inp.value : t;
    const ys = []; for (let yy = Math.min(2024, +val.slice(0, 4)); yy <= Math.max(+t.slice(0, 4) + 1, +val.slice(0, 4)); yy++) ys.push([yy, yy]);
    fill(box.querySelector('[data-k="y"]'), ys);
    fill(box.querySelector('[data-k="m"]'), MONTHS.map((m, i) => [i + 1, m]));
    box.__v = { y: +val.slice(0, 4), m: +val.slice(5, 7), d: +val.slice(8, 10) };
    box.querySelectorAll('.dwCol').forEach(col => {
      col.addEventListener('scroll', () => {
        paint(col); clearTimeout(col.__t); col.__busy = true;
        col.__t = setTimeout(() => {
          col.__busy = false;
          const its = col.querySelectorAll('.dwIt'); if (!its.length) return;
          const i = Math.min(its.length - 1, Math.max(0, Math.round(col.scrollTop / H)));
          const nv = +its[i].dataset.v;
          if (box.__init) return; // پہلی بار جگہ پر لاتے وقت تبدیلی نہیں
          if (box.__v[col.dataset.k] === nv && box.__set) return;
          box.__v[col.dataset.k] = nv; box.__set = true; apply(box, true, true);
        }, 140);
      }, { passive: true });
      col.addEventListener('click', e => { const it = e.target.closest('.dwIt'); if (it) col.scrollTo({ top: idx(col, it.dataset.v) * H, behavior: 'smooth' }); });
      col.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault(); col.scrollBy({ top: e.key === 'ArrowUp' ? -H : H, behavior: 'smooth' });
      });
    });
    box.__init = true;
    apply(box, false, false);
    [0, 80, 250].forEach(ms => setTimeout(() => { box.__init = true; apply(box, false, false); }, ms));
    setTimeout(() => { box.__init = false; }, 450);
  }
  function scan(root) { (root.querySelectorAll ? root.querySelectorAll('input[type="date"]') : []).forEach(enhance); }
  function start() {
    scan(document);
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches && n.matches('input[type="date"]')) enhance(n); else scan(n);
    }))).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.AB_DW = { scan };
})();
