/* =====================================================================
   📒 آڑھت بک — حساب کا انجن (calc.js)
   - خرچے اور کمیشن کوڈ میں پکے نہیں: آڑھتی خود بناتا ہے (قسم، شرح، کس سے کٹے، آمدن یا آگے ادا، جنس وار شرح)
   - پرچی: زمیندار کا مال → بکری (خریدار، نگ، ریٹ) → زمیندار کی کٹوتیاں → صاف رقم؛ ہر خریدار کا الگ حساب
   - رقم ہمیشہ پیسوں میں پوری گنتی (روپے × 100)؛ فیصد سوویں حصے میں (7.25% = 725)
   - اس فائل میں نظر آنے والا ہر لفظ اردو میں — انگریزی کبھی نہیں
   ===================================================================== */
(function(root){
  'use strict';

  // ---------- حساب کی قسمیں ----------
  const KINDS = {
    percent: 'رقم کا فیصد',
    perNag:  'فی نگ',
    perMaund:'فی من (40 کلو)',
    fixed:   'ہر پرچی پر مقرر رقم',
    manual:  'ہر پرچی پر ہاتھ سے لکھیں'
  };
  const SIDES = { zamindar: 'زمیندار سے', buyer: 'خریدار سے' };

  // ---------- تیار سانچے (آڑھتی بعد میں اپنی مرضی سے بدلے) ----------
  function ch(name, kind, rate, side, income){ return { name, kind, rate, side, income: !!income, on: true, itemRates: {} }; }
  const TEMPLATES = {
    fruit: { label: '🍎 فروٹ منڈی آڑھت', list: () => [
      ch('کمیشن', 'percent', 725, 'zamindar', true),
      ch('منڈی خرچہ', 'fixed', 5000, 'zamindar', false),
      ch('چنگی', 'manual', 0, 'zamindar', false),
      ch('گاڑی کا کرایہ', 'manual', 0, 'zamindar', false),
      ch('مزدوری (اتروائی)', 'perNag', 1000, 'zamindar', false),
      ch('خریدار کا کمیشن', 'percent', 100, 'buyer', true),
      ch('مزدوری (لدوائی)', 'perNag', 500, 'buyer', false)
    ]},
    sabzi: { label: '🥬 سبزی منڈی آڑھت', list: () => [
      ch('کمیشن', 'percent', 725, 'zamindar', true),
      ch('منڈی خرچہ', 'fixed', 4000, 'zamindar', false),
      ch('چنگی', 'manual', 0, 'zamindar', false),
      ch('گاڑی کا کرایہ', 'manual', 0, 'zamindar', false),
      ch('مزدوری (اتروائی)', 'perNag', 500, 'zamindar', false),
      ch('خریدار کا کمیشن', 'percent', 100, 'buyer', true),
      ch('مزدوری (لدوائی)', 'perNag', 300, 'buyer', false)
    ]},
    ghalla: { label: '🌾 غلہ منڈی آڑھت', list: () => [
      ch('کمیشن', 'percent', 250, 'zamindar', true),
      ch('منڈی خرچہ', 'fixed', 5000, 'zamindar', false),
      ch('مارکیٹ فیس', 'percent', 100, 'zamindar', false),
      ch('تلائی', 'perMaund', 500, 'zamindar', false),
      ch('مزدوری', 'perMaund', 1000, 'zamindar', false),
      ch('گاڑی کا کرایہ', 'manual', 0, 'zamindar', false),
      ch('باردانہ', 'perNag', 0, 'zamindar', false),
      ch('خریدار کا کمیشن', 'percent', 50, 'buyer', true)
    ]}
  };

  // ---------- رقم: پیسوں میں ----------
  // اردو / عربی ہندسے → 0-9
  function en(v){ return String(v == null ? '' : v).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x6F0)); }
  function toPaisa(v){ const n = parseFloat(en(v).replace(/[,،٬]/g, '')); return isFinite(n) ? Math.round(n * 100) : 0; }
  function toGrams(v){ const n = parseFloat(en(v).replace(/[,،٬]/g, '')); return isFinite(n) ? Math.round(n * 1000) : 0; }
  function int(v){ const n = parseInt(en(v).replace(/[,،٬]/g, ''), 10); return isFinite(n) ? n : 0; }
  // آدھے سے اوپر اوپر — منفی پر بھی یکساں
  function rdiv(num, den){ const s = num < 0 ? -1 : 1; return s * Math.floor((Math.abs(num) * 2 + den) / (2 * den)); }
  function fmt(p){
    const neg = p < 0; p = Math.abs(p);
    const r = Math.floor(p / 100), ps = p % 100;
    const s = r.toLocaleString('en-US') + (ps ? '.' + String(ps).padStart(2, '0') : '');
    return (neg ? '−' : '') + s;
  }
  function rateText(c){ return c.kind === 'percent' ? (c.rate / 100) + '٪' : fmt(c.rate) + ' روپے'; }

  // ---------- بکری کی ایک قطار کی رقم ----------
  function lineAmount(l){
    if(l.basis === 'maund') return rdiv(int(l.grams) * int(l.rate), 40000);
    return int(l.nag) * int(l.rate);
  }
  function itemRate(c, item){
    const k = String(item || '').trim();
    return (k && c.itemRates && c.itemRates[k] != null) ? int(c.itemRates[k]) : int(c.rate);
  }
  // ---------- ایک طرف (زمیندار کی پوری پرچی، یا ایک خریدار) کی کٹوتی ----------
  function chargeOn(c, lines, manualVal){
    switch(c.kind){
      case 'percent': {
        let num = 0; lines.forEach(l => { num += lineAmount(l) * itemRate(c, l.item); });
        return rdiv(num, 10000);
      }
      case 'perNag': { let s = 0; lines.forEach(l => { s += int(l.nag) * itemRate(c, l.item); }); return s; }
      case 'perMaund': { let num = 0; lines.forEach(l => { num += int(l.grams) * itemRate(c, l.item); }); return rdiv(num, 40000); }
      case 'fixed': return lines.length ? int(c.rate) : 0;
      case 'manual': return lines.length ? (manualVal != null && manualVal !== '' ? int(manualVal) : int(c.rate)) : 0;
    }
    return 0;
  }
  // ---------- پوری پرچی کا حساب ----------
  function calcParchi(p, charges){
    const lines = (p.lines || []).filter(l => int(l.nag) > 0 || int(l.grams) > 0);
    const active = (charges || []).filter(c => c.on);
    const gross = lines.reduce((s, l) => s + lineAmount(l), 0);
    const manual = p.manual || {};
    const zCharges = active.filter(c => c.side === 'zamindar').map(c => ({ id: c.id, name: c.name, income: !!c.income, amount: chargeOn(c, lines, manual[c.id]) }));
    const zTotal = zCharges.reduce((s, x) => s + x.amount, 0);
    // خریدار کی پہچان: کھاتے والا خریدار ہو تو اس کی شناخت، ورنہ نام
    const byBuyer = {}, bName = {};
    lines.forEach(l => {
      const name = String(l.buyer || '').trim() || 'بغیر نام خریدار';
      const key = l.buyerId ? 'id:' + l.buyerId : 'n:' + name;
      (byBuyer[key] = byBuyer[key] || []).push(l); bName[key] = name;
    });
    const bManual = p.buyerManual || {};
    const buyers = Object.keys(byBuyer).map(key => {
      const bl = byBuyer[key], name = bName[key];
      const goods = bl.reduce((s, l) => s + lineAmount(l), 0);
      const cs = active.filter(c => c.side === 'buyer').map(c => ({ id: c.id, name: c.name, income: !!c.income, amount: chargeOn(c, bl, (bManual[key] || {})[c.id]) }));
      const extra = cs.reduce((s, x) => s + x.amount, 0);
      return { key, id: bl[0].buyerId || '', name, goods, charges: cs, total: goods + extra, nag: bl.reduce((s, l) => s + int(l.nag), 0) };
    });
    const income = zCharges.filter(x => x.income).reduce((s, x) => s + x.amount, 0)
      + buyers.reduce((s, b) => s + b.charges.filter(x => x.income).reduce((t, x) => t + x.amount, 0), 0);
    const buyersTotal = buyers.reduce((s, b) => s + b.total, 0);
    // جانچ: خریداروں سے آنے والی رقم = زمیندار کی صاف رقم + سب کٹوتیاں
    const allDed = zTotal + buyers.reduce((s, b) => s + (b.total - b.goods), 0);
    const check = (buyersTotal === (gross - zTotal) + allDed);
    return { lines, gross, zCharges, zTotal, net: gross - zTotal, buyers, buyersTotal, income, nag: lines.reduce((s, l) => s + int(l.nag), 0), check };
  }

  const API = { KINDS, SIDES, TEMPLATES, toPaisa, toGrams, int, rdiv, fmt, rateText, lineAmount, itemRate, chargeOn, calcParchi };
  if(typeof module !== 'undefined' && module.exports){ module.exports = API; }
  root.ABCalc = API;
})(typeof window !== 'undefined' ? window : globalThis);
