/* 📒 آڑھت بک — پرچی / بل کی تصویر (واٹس ایپ کے لیے)
   - کینوس پر سیدھا بنتی ہے (کوئی باہر کی لائبریری نہیں، انٹرنیٹ کے بغیر بھی)
   - دائیں سے بائیں، نوری نستعلیق؛ ہندسے صاف فونٹ میں
   - draw(spec) → canvas؛ spec = { shop, sub, title, meta:[[لیبل, قدر]], cols:[{t, w, num}], rows:[[…]], lines:[[لیبل, رقم, 'tot'|'net'|'' ]], foot }
   - رنگ ایپ کے تھیم سے (--c1…--c5، --l0…--l3) */
(() => {
  'use strict';
  const W = 760, PAD = 28;
  const css = v => (getComputedStyle(document.documentElement).getPropertyValue(v) || '').trim();
  const UR = "'Noori', 'Jameel Noori Nastaleeq', serif";
  const NUM = "Tahoma, 'Segoe UI', Arial, sans-serif";

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

  async function draw(spec) {
    await fonts();
    const c1 = css('--c1') || '#dc2626', c3 = css('--c3') || '#991b1b', c4 = css('--c4') || '#7f1d1d', l0 = css('--l0') || '#fef2f2', l3 = css('--l3') || '#fca5a5';
    const ROW = 46, cols = spec.cols || [], rows = spec.rows || [], lines = spec.lines || [], meta = spec.meta || [];
    const H = 150 + 70 + Math.ceil(meta.length / 2) * 40 + (cols.length ? 50 + rows.length * ROW : 0) + 20 + lines.length * 50 + 70;
    const cv = document.createElement('canvas');
    const k = 2; cv.width = W * k; cv.height = H * k;
    const ctx = cv.getContext('2d'); ctx.scale(k, k);
    ctx.direction = 'rtl';
    // پس منظر
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    // اوپر کی پٹی: دکان کا نام
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, c4); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 130);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    fit(ctx, spec.shop || 'آڑھت بک', W - 2 * PAD, 52, "'NooriKasheeda', " + UR);
    ctx.fillText(spec.shop || 'آڑھت بک', W / 2, 62);
    if (spec.sub) { fit(ctx, spec.sub, W - 2 * PAD, 24, UR); ctx.fillStyle = '#fde68a'; ctx.fillText(spec.sub, W / 2, 108); }
    let y = 130;
    // عنوان
    ctx.fillStyle = l0; ctx.fillRect(0, y, W, 62);
    ctx.fillStyle = c3; fit(ctx, spec.title, W - 2 * PAD, 34, UR); ctx.fillText(spec.title, W / 2, y + 43);
    y += 62 + 14;
    // تفصیل: دو کالم
    ctx.textAlign = 'right';
    meta.forEach((m, i) => {
      const colX = i % 2 === 0 ? W - PAD : W / 2 - 6;
      const yy = y + Math.floor(i / 2) * 40 + 28;
      ctx.fillStyle = '#57534e'; ctx.font = `22px ${UR}`;
      const lab = m[0] + ': '; ctx.fillText(lab, colX, yy);
      const lw = ctx.measureText(lab).width;
      ctx.fillStyle = '#1c1917';
      const v = String(m[1] == null ? '' : m[1]);
      if (isNum(v)) { ctx.font = `bold 21px ${NUM}`; ctx.direction = 'ltr'; ctx.textAlign = 'right'; ctx.fillText(v, colX - lw, yy); ctx.direction = 'rtl'; }
      else { fit(ctx, v, W / 2 - PAD - lw - 10, 24, UR, 'bold'); ctx.fillText(v, colX - lw, yy); }
    });
    y += Math.ceil(meta.length / 2) * 40 + 10;
    // جدول
    if (cols.length) {
      const tw = W - 2 * PAD, sum = cols.reduce((a, c) => a + c.w, 0);
      const xs = []; let x = W - PAD; cols.forEach(c => { const w = tw * c.w / sum; xs.push([x, w]); x -= w; });
      ctx.fillStyle = c3; ctx.fillRect(PAD, y, tw, 44);
      ctx.fillStyle = '#ffffff';
      cols.forEach((c, i) => { ctx.textAlign = 'center'; fit(ctx, c.t, xs[i][1] - 8, 22, UR, 'bold'); ctx.fillText(c.t, xs[i][0] - xs[i][1] / 2, y + 31); });
      y += 44;
      rows.forEach((r, ri) => {
        ctx.fillStyle = ri % 2 ? l0 : '#ffffff'; ctx.fillRect(PAD, y, tw, ROW);
        r.forEach((v, i) => {
          const c = cols[i], s = String(v == null ? '' : v);
          ctx.fillStyle = '#1c1917';
          if (c.num || isNum(s)) { ctx.textAlign = 'center'; fit(ctx, s, xs[i][1] - 8, 21, NUM, 'bold'); ctx.direction = 'ltr'; ctx.fillText(s, xs[i][0] - xs[i][1] / 2, y + 31); ctx.direction = 'rtl'; }
          else { ctx.textAlign = 'right'; fit(ctx, s, xs[i][1] - 12, 23, UR); ctx.fillText(s, xs[i][0] - 6, y + 32); }
        });
        y += ROW;
      });
      ctx.strokeStyle = l3; ctx.lineWidth = 1.5; ctx.strokeRect(PAD, y - rows.length * ROW - 44, tw, rows.length * ROW + 44);
      y += 16;
    }
    // حساب کی لائنیں
    lines.forEach(L => {
      const [lab, amt, kind] = L;
      if (kind === 'net') { ctx.fillStyle = c1; ctx.fillRect(PAD, y, W - 2 * PAD, 48); ctx.fillStyle = '#ffffff'; }
      else if (kind === 'tot') { ctx.fillStyle = l0; ctx.fillRect(PAD, y, W - 2 * PAD, 46); ctx.fillStyle = c4; }
      else ctx.fillStyle = '#1c1917';
      ctx.textAlign = 'right'; fit(ctx, lab, W * 0.62, kind === 'net' ? 28 : 24, UR, kind ? 'bold' : '');
      ctx.fillText(lab, W - PAD - 10, y + 33);
      ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.font = `bold ${kind === 'net' ? 26 : 22}px ${NUM}`;
      ctx.fillText(String(amt), PAD + 12, y + 32); ctx.direction = 'rtl';
      if (!kind) { ctx.strokeStyle = '#e7e5e4'; ctx.beginPath(); ctx.moveTo(PAD, y + 47); ctx.lineTo(W - PAD, y + 47); ctx.stroke(); }
      y += 50;
    });
    // نیچے
    ctx.fillStyle = '#78716c'; ctx.textAlign = 'center'; ctx.font = `19px ${UR}`;
    ctx.fillText(spec.foot || 'آڑھت بک', W / 2, H - 24);
    return cv;
  }

  const toBlob = cv => new Promise(res => cv.toBlob(b => res(b), 'image/png'));

  // شیئر: فون پر سیدھا واٹس ایپ وغیرہ کی فہرست؛ نہ ہو سکے تو false
  async function share(cv, fileName, text) {
    const blob = await toBlob(cv);
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: text || '' }); return true; }
      catch (e) { return e && e.name === 'AbortError' ? true : false; }
    }
    return false;
  }
  // تصویر کلپ بورڈ میں (واٹس ایپ کی چیٹ میں «پیسٹ»)
  async function copyImage(cv) {
    try { const blob = await toBlob(cv); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return true; } catch (e) { return false; }
  }
  function download(cv, fileName) {
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  }

  window.AB_RECEIPT = { draw, share, copyImage, download };
})();
