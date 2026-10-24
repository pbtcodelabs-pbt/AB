/* 📒 آڑھت بک — پرچی / بل / تھرمل رسید کی تصویر
   - کینوس پر سیدھا بنتی ہے (کوئی باہر کی لائبریری نہیں، انٹرنیٹ کے بغیر بھی)
   - دائیں سے بائیں، نوری نستعلیق؛ ہندسے صاف فونٹ میں
   - draw(spec, opt) → canvas؛ spec = { shop, sub, title, meta:[[لیبل, قدر]], cols:[{t, w, num}], rows:[[…]], lines:[[لیبل, رقم, 'tot'|'net'|'' ]], foot }
     opt = { thermal: 58|80 } → تنگ، صرف کالا سفید (تھرمل پرنٹر کے لیے، چوڑائی بالکل پرنٹر کے نقطوں جتنی)
   - واٹس ایپ والی تصویر میں رنگ ایپ کے تھیم سے (--c1…--c5، --l0…--l3)
   - تھرمل پرنٹ: بلوٹوتھ (ESC/POS تصویر)، عام پرنٹ (58/80 ملی میٹر صفحہ)، یا شیئر */
(() => {
  'use strict';
  const css = v => (getComputedStyle(document.documentElement).getPropertyValue(v) || '').trim();
  const UR = "'Noori', 'Jameel Noori Nastaleeq', serif";
  const NUM = "Tahoma, 'Segoe UI', Arial, sans-serif";
  const DOTS = { 58: 384, 80: 576 };   // 203 نقطے فی انچ والے پرنٹر

  async function fonts() {
    try { await Promise.all([document.fonts.load("30px 'Noori'"), document.fonts.load("40px 'NooriKasheeda'")]); } catch (e) {}
  }
  // متن کو چوڑائی میں سمو دیں (لمبا ہو تو فونٹ چھوٹا)
  function fit(ctx, text, maxW, size, family, weight) {
    let s = size;
    do { ctx.font = `${weight || ''} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break; s -= 1; } while (s > 11);
    return s;
  }
  const isNum = t => /^[\d,.\s\-–/+()]+$/.test(String(t));

  async function draw(spec, opt) {
    opt = opt || {};
    await fonts();
    const th = !!opt.thermal;
    // تھرمل: منطقی چوڑائی 420 (58 ملی میٹر پر لکھائی پڑھنے لائق رہے)، کینوس = پرنٹر کے نقطے
    const W = th ? 420 : 760, PAD = th ? 10 : 28;
    const C = th ? { c1: '#000', c3: '#000', c4: '#000', l0: '#fff', l3: '#000' }
      : { c1: css('--c1') || '#dc2626', c3: css('--c3') || '#991b1b', c4: css('--c4') || '#7f1d1d', l0: css('--l0') || '#fef2f2', l3: css('--l3') || '#fca5a5' };
    const ROW = th ? 40 : 46, LINE = th ? 42 : 50, MROW = th ? 34 : 40;
    const cols = spec.cols || [], rows = spec.rows || [], lines = spec.lines || [], meta = spec.meta || [];
    const mcol = th ? 1 : 2;
    const HEAD = th ? (spec.sub ? 92 : 62) : 130, TITLE = th ? 46 : 62;
    const H = HEAD + TITLE + 14 + Math.ceil(meta.length / mcol) * MROW + 10 + (cols.length ? 44 + rows.length * ROW + 16 : 0) + lines.length * LINE + (th ? 60 : 70);
    const k = th ? DOTS[opt.thermal] / W : 2;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    const ctx = cv.getContext('2d'); ctx.scale(k, k);
    ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    // اوپر: دکان کا نام (تھرمل میں کالی پٹی نہیں — کاغذ اور گرمی بچے)
    if (!th) { const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, C.c4); g.addColorStop(1, C.c1); ctx.fillStyle = g; ctx.fillRect(0, 0, W, HEAD); }
    ctx.fillStyle = th ? '#000' : '#fff'; ctx.textAlign = 'center';
    fit(ctx, spec.shop || 'آڑھت بک', W - 2 * PAD, th ? 40 : 52, "'NooriKasheeda', " + UR);
    ctx.fillText(spec.shop || 'آڑھت بک', W / 2, th ? 46 : 62);
    if (spec.sub) { fit(ctx, spec.sub, W - 2 * PAD, th ? 20 : 24, UR); ctx.fillStyle = th ? '#000' : '#fde68a'; ctx.fillText(spec.sub, W / 2, th ? 80 : 108); }
    let y = HEAD;
    // عنوان
    if (th) { ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y + 2); ctx.lineTo(W - PAD, y + 2); ctx.moveTo(PAD, y + TITLE - 2); ctx.lineTo(W - PAD, y + TITLE - 2); ctx.stroke(); }
    else { ctx.fillStyle = C.l0; ctx.fillRect(0, y, W, TITLE); }
    ctx.fillStyle = C.c3; fit(ctx, spec.title, W - 2 * PAD, th ? 28 : 34, UR, th ? 'bold' : ''); ctx.fillText(spec.title, W / 2, y + (th ? 33 : 43));
    y += TITLE + 14;
    // تفصیل
    ctx.textAlign = 'right';
    const colW = (W - 2 * PAD) / mcol;
    meta.forEach((m, i) => {
      const colX = W - PAD - (i % mcol) * colW;
      const yy = y + Math.floor(i / mcol) * MROW + (th ? 24 : 28);
      ctx.fillStyle = th ? '#000' : '#57534e'; ctx.font = `${th ? 20 : 22}px ${UR}`;
      const lab = m[0] + ': '; ctx.fillText(lab, colX, yy);
      const lw = ctx.measureText(lab).width;
      ctx.fillStyle = '#000';
      const v = String(m[1] == null ? '' : m[1]);
      if (isNum(v)) { ctx.font = `bold ${th ? 20 : 21}px ${NUM}`; ctx.direction = 'ltr'; ctx.textAlign = 'right'; ctx.fillText(v, colX - lw, yy); ctx.direction = 'rtl'; }
      else { fit(ctx, v, colW - lw - 10, th ? 22 : 24, UR, 'bold'); ctx.fillText(v, colX - lw, yy); }
    });
    y += Math.ceil(meta.length / mcol) * MROW + 10;
    // جدول
    if (cols.length) {
      const tw = W - 2 * PAD, sum = cols.reduce((a, c) => a + c.w, 0);
      const xs = []; let x = W - PAD; cols.forEach(c => { const w = tw * c.w / sum; xs.push([x, w]); x -= w; });
      if (th) { ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(PAD, y, tw, 40); ctx.fillStyle = '#000'; }
      else { ctx.fillStyle = C.c3; ctx.fillRect(PAD, y, tw, 44); ctx.fillStyle = '#fff'; }
      cols.forEach((c, i) => { ctx.textAlign = 'center'; fit(ctx, c.t, xs[i][1] - 6, th ? 20 : 22, UR, 'bold'); ctx.fillText(c.t, xs[i][0] - xs[i][1] / 2, y + (th ? 28 : 31)); });
      y += th ? 40 : 44;
      rows.forEach((r, ri) => {
        if (!th) { ctx.fillStyle = ri % 2 ? C.l0 : '#fff'; ctx.fillRect(PAD, y, tw, ROW); }
        r.forEach((v, i) => {
          const c = cols[i], s = String(v == null ? '' : v);
          ctx.fillStyle = '#000';
          if (c.num || isNum(s)) { ctx.textAlign = 'center'; fit(ctx, s, xs[i][1] - 6, th ? 20 : 21, NUM, 'bold'); ctx.direction = 'ltr'; ctx.fillText(s, xs[i][0] - xs[i][1] / 2, y + (th ? 27 : 31)); ctx.direction = 'rtl'; }
          else { ctx.textAlign = 'right'; fit(ctx, s, xs[i][1] - 8, th ? 21 : 23, UR); ctx.fillText(s, xs[i][0] - 4, y + (th ? 28 : 32)); }
        });
        if (th) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(PAD, y + ROW); ctx.lineTo(W - PAD, y + ROW); ctx.stroke(); ctx.setLineDash([]); }
        y += ROW;
      });
      if (!th) { ctx.strokeStyle = C.l3; ctx.lineWidth = 1.5; ctx.strokeRect(PAD, y - rows.length * ROW - 44, tw, rows.length * ROW + 44); }
      y += 16;
    }
    // حساب کی لائنیں
    lines.forEach(L => {
      const [lab, amt, kind] = L;
      if (th) {
        ctx.fillStyle = '#000';
        if (kind === 'net') { ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeRect(PAD, y + 1, W - 2 * PAD, LINE - 4); }
      } else if (kind === 'net') { ctx.fillStyle = C.c1; ctx.fillRect(PAD, y, W - 2 * PAD, 48); ctx.fillStyle = '#fff'; }
      else if (kind === 'tot') { ctx.fillStyle = C.l0; ctx.fillRect(PAD, y, W - 2 * PAD, 46); ctx.fillStyle = C.c4; }
      else ctx.fillStyle = '#1c1917';
      ctx.textAlign = 'right'; fit(ctx, lab, W * 0.6, kind === 'net' ? (th ? 24 : 28) : (th ? 21 : 24), UR, kind ? 'bold' : '');
      ctx.fillText(lab, W - PAD - 8, y + (th ? 28 : 33));
      ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.font = `bold ${kind === 'net' ? (th ? 24 : 26) : (th ? 20 : 22)}px ${NUM}`;
      ctx.fillText(String(amt), PAD + 8, y + (th ? 28 : 32)); ctx.direction = 'rtl';
      if (!kind) { ctx.strokeStyle = th ? '#000' : '#e7e5e4'; ctx.lineWidth = 1; if (th) ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(PAD, y + LINE - 3); ctx.lineTo(W - PAD, y + LINE - 3); ctx.stroke(); ctx.setLineDash([]); }
      y += LINE;
    });
    // نیچے
    ctx.fillStyle = th ? '#000' : '#78716c'; ctx.textAlign = 'center'; ctx.font = `${th ? 18 : 19}px ${UR}`;
    ctx.fillText(spec.foot || 'آڑھت بک', W / 2, H - (th ? 22 : 24));
    return cv;
  }

  const toBlob = cv => new Promise(res => cv.toBlob(b => res(b), 'image/png'));

  // شیئر: فون پر سیدھا واٹس ایپ / پرنٹر ایپ وغیرہ کی فہرست؛ نہ ہو سکے تو false
  async function share(cv, fileName, text) {
    const blob = await toBlob(cv);
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: text || '' }); return true; }
      catch (e) { return e && e.name === 'AbortError' ? true : false; }
    }
    return false;
  }
  async function copyImage(cv) {
    try { const blob = await toBlob(cv); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return true; } catch (e) { return false; }
  }
  function download(cv, fileName) {
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- عام پرنٹ (کمپیوٹر / لیپ ٹاپ سے جڑا تھرمل پرنٹر): صفحہ بالکل رول جتنا ----------
  function printThermal(cv, mm) {
    const w = window.open('', '_blank'); if (!w) return false;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>رسید</title><style>@page{size:${mm}mm auto;margin:0}html,body{margin:0;padding:0}img{width:${mm}mm;display:block}</style></head>
      <body><img src="${cv.toDataURL('image/png')}" onload="setTimeout(function(){print()},250)"></body></html>`);
    w.document.close();
    return true;
  }

  // ---------- بلوٹوتھ تھرمل پرنٹر (ESC/POS، تصویر کی شکل میں — اردو ہر پرنٹر پر صاف) ----------
  const BT_SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb'];
  let bt = null; // { dev, ch }
  function raster(cv) {
    const w = cv.width, h = cv.height, bw = Math.ceil(w / 8);
    const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
    const out = [0x1b, 0x40]; // ESC @
    const BAND = 200;
    for (let y0 = 0; y0 < h; y0 += BAND) {
      const bh = Math.min(BAND, h - y0);
      out.push(0x1d, 0x76, 0x30, 0, bw & 255, bw >> 8, bh & 255, bh >> 8); // GS v 0
      for (let y = y0; y < y0 + bh; y++) for (let bx = 0; bx < bw; bx++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit; if (x >= w) continue;
          const i = (y * w + x) * 4, lum = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
          if (px[i + 3] > 128 && lum < 150) b |= 0x80 >> bit;
        }
        out.push(b);
      }
    }
    out.push(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x10); // کاغذ آگے + کٹ (جن میں کٹر ہو)
    return new Uint8Array(out);
  }
  async function btConnect() {
    if (!navigator.bluetooth) throw new Error('nobt');
    if (bt && bt.dev.gatt.connected && bt.ch) return bt;
    const dev = bt && bt.dev ? bt.dev : await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
    const srv = await dev.gatt.connect();
    let ch = null;
    for (const s of await srv.getPrimaryServices()) {
      for (const c of await s.getCharacteristics()) { if (c.properties.writeWithoutResponse || c.properties.write) { ch = c; break; } }
      if (ch) break;
    }
    if (!ch) throw new Error('nochar');
    bt = { dev, ch };
    return bt;
  }
  async function printBluetooth(cv) {
    const { ch } = await btConnect();
    const data = raster(cv), CH = 180;
    for (let i = 0; i < data.length; i += CH) {
      const part = data.slice(i, i + CH);
      if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part); else await ch.writeValue(part);
      if (i % (CH * 20) === 0) await new Promise(r => setTimeout(r, 15));
    }
    return true;
  }
  function btName() { return bt && bt.dev ? (bt.dev.name || '') : ''; }

  window.AB_RECEIPT = { draw, share, copyImage, download, printThermal, printBluetooth, btName, btSupported: () => !!navigator.bluetooth };
})();
