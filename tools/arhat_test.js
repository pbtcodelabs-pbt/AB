// 📒 آڑھت بک — حساب کے خودکار ٹیسٹ۔ چلائیں: node tools/arhat_test.js
// ہر مثال کا جواب پہلے سے ہاتھ سے نکالا ہوا ہے؛ ایک بھی غلط ہو تو ریلیز نہ کریں۔
const C = require('../calc.js');
let pass = 0, fail = 0;
function eq(name, got, want){
  if(JSON.stringify(got) === JSON.stringify(want)){ pass++; }
  else { fail++; console.log('❌ ' + name + ' — ملا: ' + JSON.stringify(got) + ' — چاہیے: ' + JSON.stringify(want)); }
}
const R = n => Math.round(n * 100); // روپے → پیسے
function charges(key){ return C.TEMPLATES[key].list().map((c, i) => Object.assign({ id: 'c' + i }, c)); }

// ---------- 1) گول کرنا ----------
eq('rdiv 5/10', C.rdiv(5, 10), 1);
eq('rdiv 15/10', C.rdiv(15, 10), 2);
eq('rdiv 14/10', C.rdiv(14, 10), 1);
eq('rdiv -15/10', C.rdiv(-15, 10), -2);
eq('toPaisa 7.25', C.toPaisa('7.25'), 725);
eq('toPaisa 0.1', C.toPaisa('0.1'), 10);
eq('toPaisa 19.99', C.toPaisa('19.99'), 1999);
eq('toPaisa 1,250', C.toPaisa('1,250'), 125000);
eq('toPaisa خالی', C.toPaisa(''), 0);
eq('fmt', C.fmt(R(220000)), '220,000');
eq('fmt پیسے', C.fmt(12345), '123.45');

// ---------- 2) فروٹ منڈی: پوری پرچی ----------
{
  const ch = charges('fruit');
  const p = { lines: [
    { item: 'آم', nag: '100', rate: R(1500), basis: 'nag', buyer: 'احمد' },
    { item: 'آم', nag: '50', rate: R(1400), basis: 'nag', buyer: 'بلال' }
  ], manual: { c2: R(300), c3: R(12000) } };
  const r = C.calcParchi(p, ch);
  eq('فروٹ: کل بکری', r.gross, R(220000));
  eq('فروٹ: کمیشن 7.25٪', r.zCharges[0].amount, R(15950));
  eq('فروٹ: مارکیٹ فیس', r.zCharges[1].amount, R(50));
  eq('فروٹ: چنگی ہاتھ سے', r.zCharges[2].amount, R(300));
  eq('فروٹ: گاڑی کا کرایہ', r.zCharges[3].amount, R(12000));
  eq('فروٹ: مزدوری فی نگ', r.zCharges[4].amount, R(1500));
  eq('فروٹ: کل کٹوتی', r.zTotal, R(29800));
  eq('فروٹ: صاف رقم', r.net, R(190200));
  eq('فروٹ: احمد سے', r.buyers[0].total, R(152000));
  eq('فروٹ: بلال سے', r.buyers[1].total, R(70950));
  eq('فروٹ: آڑھتی کی کمائی', r.income, R(18150));
  eq('فروٹ: جوڑ درست', r.check, true);
  eq('فروٹ: کل نگ', r.nag, 150);
}

// ---------- 3) پیسوں کی گولائی ----------
{
  const ch = [{ id: 'k', name: 'کمیشن', kind: 'percent', rate: 725, side: 'zamindar', income: true, on: true, itemRates: {} }];
  const r = C.calcParchi({ lines: [{ item: 'سیب', nag: '3', rate: 3333, basis: 'nag', buyer: 'ا' }] }, ch);
  eq('گولائی: بکری', r.gross, 9999);
  eq('گولائی: کمیشن 724.93 → 725 پیسے', r.zCharges[0].amount, 725);
}

// ---------- 4) غلہ منڈی: فی من ----------
{
  const ch = charges('ghalla');
  const r = C.calcParchi({ lines: [{ item: 'گندم', nag: '20', grams: 1000000, rate: R(4000), basis: 'maund', buyer: 'ملز' }] }, ch);
  eq('غلہ: 1000 کلو @ 4000 فی من', r.gross, R(100000));
  eq('غلہ: کمیشن 2.5٪', r.zCharges[0].amount, R(2500));
  eq('غلہ: مارکیٹ فیس 1٪', r.zCharges[2].amount, R(1000));
  eq('غلہ: تلائی 5 فی من', r.zCharges[3].amount, R(125));
  eq('غلہ: مزدوری 10 فی من', r.zCharges[4].amount, R(250));
  eq('غلہ: خریدار کمیشن 0.5٪', r.buyers[0].charges[0].amount, R(500));
}

// ---------- 5) جنس وار الگ شرح ----------
{
  const ch = [{ id: 'k', name: 'کمیشن', kind: 'percent', rate: 725, side: 'zamindar', income: true, on: true, itemRates: { 'کینو': 600 } }];
  const r = C.calcParchi({ lines: [
    { item: 'کینو', nag: '10', rate: R(100), basis: 'nag', buyer: 'ا' },
    { item: 'آم', nag: '10', rate: R(100), basis: 'nag', buyer: 'ا' }
  ] }, ch);
  eq('جنس وار: کینو 6٪ + آم 7.25٪', r.zCharges[0].amount, R(60) + R(72.5));
}

// ---------- 6) بند خرچہ شامل نہیں ----------
{
  const ch = charges('fruit'); ch[0].on = false;
  const r = C.calcParchi({ lines: [{ item: 'آم', nag: '1', rate: R(1000), basis: 'nag', buyer: 'ا' }] }, ch);
  eq('بند کمیشن نہیں کٹا', r.zCharges.some(x => x.name === 'کمیشن'), false);
}

// ---------- 7) خالی پرچی ----------
{
  const r = C.calcParchi({ lines: [blank()] }, charges('fruit'));
  function blank(){ return { item: '', nag: '', rate: '', basis: 'nag', buyer: '' }; }
  eq('خالی: بکری صفر', r.gross, 0);
  eq('خالی: مقرر خرچہ نہیں لگا', r.zTotal, 0);
  eq('خالی: کوئی خریدار نہیں', r.buyers.length, 0);
}

// ---------- 8) ایک ہی نام کے دو کھاتے (شناخت سے الگ) ----------
{
  const r = C.calcParchi({ lines: [
    { item: 'آم', nag: '1', rate: R(100), basis: 'nag', buyer: 'علی', buyerId: 'b1' },
    { item: 'آم', nag: '1', rate: R(100), basis: 'nag', buyer: 'علی', buyerId: 'b2' },
    { item: 'آم', nag: '1', rate: R(100), basis: 'nag', buyer: 'علی', buyerId: 'b1' }
  ] }, []);
  eq('شناخت سے الگ خریدار', r.buyers.map(b => [b.id, b.goods]), [['b1', R(200)], ['b2', R(100)]]);
}

// ---------- 9) خریدار کے ہاتھ والے خرچے ----------
{
  const ch = [{ id: 'm', name: 'لدوائی', kind: 'manual', rate: R(100), side: 'buyer', income: false, on: true, itemRates: {} }];
  const r = C.calcParchi({ lines: [{ item: 'آم', nag: '1', rate: R(500), basis: 'nag', buyer: 'علی', buyerId: 'b1' }], buyerManual: { 'id:b1': { m: R(250) } } }, ch);
  eq('خریدار: ہاتھ والا خرچہ', r.buyers[0].total, R(750));
}

// ---------- 🛒 اپنا مال (خرید فروخت) ----------
{
  const ch = charges('sabzi');
  const p = { mode: 'trade', arr: [{ item: 'آلو', nag: '20', packing: 'بوری', buyRate: R(1000), kir: R(30), maz: R(10), pkc: R(5) }],
    lines: [{ item: 'آلو', nag: '15', rate: R(1300), basis: 'nag', buyer: 'احمد' }], manual: {} };
  const r = C.calcParchi(p, ch);
  eq('خرید: خرید کل', r.trade.buy, R(20000));
  eq('خرید: کرایہ', r.trade.kiraya, R(600));
  eq('خرید: مزدوری', r.trade.mazdoori, R(200));
  eq('خرید: پیکنگ', r.trade.packing, R(100));
  eq('خرید: کل خرچے', r.trade.exp, R(900));
  eq('خرید: بیوپاری کو ادائیگی', r.net, R(20000));
  eq('خرید: بکری', r.gross, R(19500));
  eq('خرید: زمیندار کی کٹوتی نہیں', r.zTotal, 0);
  eq('خرید: نفع / نقصان', r.profit, R(19500 - 20000 - 900));
  eq('خرید: باقی مال', r.left, 5);
  eq('خرید: خریدار کا کمیشن 1٪ اور لدوائی', r.buyers[0].total, R(19500) + R(195) + R(45));
  eq('خرید: جوڑ درست', r.check, true);
}
console.log((fail ? '❌' : '✅') + ' ' + pass + ' درست، ' + fail + ' غلط');
process.exit(fail ? 1 : 0);
