// ---------- 📒 آڑھت بک (AB) — Service Worker ----------
// یہ نمبر HTML فائل کے APP_BUILD_VERSION جیسا نہیں ہوتا (وہ اردو میں ہے، یہ ہمیشہ انگریزی/ASCII میں رہے گا) —
// صرف کیش کا نام بدلنے کے لیے استعمال ہوتا ہے تاکہ پرانی فائلیں خودکار صاف ہو کر نئی لوڈ ہو جائیں۔
// ہر نئی ڈیلیوری پر یہ نمبر لازمی بدلیں (فائل کے نام جیسا ہی رکھیں) ----------
const CACHE_VERSION = 'AB2310FR001';
const CACHE_PREFIX = 'arth-book-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// ---------- 🔒🆕 ہدایت (FM21SEPMO03): آف لائن نہ چلنے کی اصل جڑ یہاں ملی — پہلے تمام فائلیں
// ایک ہی فہرست میں تھیں اور ہر ایک کی precache ناکامی خاموشی سے نظرانداز (صرف console.warn) ہو جاتی تھی۔
// اگر کمزور/ٹوٹے نیٹ ورک کے دوران خود index.html ہی کیش ہونے میں ناکام رہے، تب بھی install "کامیاب" مان کر
// self.skipWaiting() چل جاتا، پرانا (مکمل/درست) کیش صاف ہو جاتا، اور نیا ورژن قبضہ لے لیتا — نتیجہ: اگلی
// بار آف لائن کھولنے پر خالی/ٹوٹا صفحہ۔ اب فائلیں دو حصوں میں: CRITICAL (ایپ شیل — ان کی ناکامی پوری
// اپڈیٹ کو منسوخ کر دے، پرانا/کام کرتا ورژن جوں کا توں فعال رہے) اور OPTIONAL (فونٹ/آئیکن/CDN — ناکامی پر
// صرف وارننگ، اپڈیٹ نہ رکے) ---------- -->
const CRITICAL_URLS = [
  './',
  './index.html',
  './manifest.json'
];
// 🪶 SM1710SA139: اردو فونٹ اب ہلکی WOFF2 شکل میں (24 MB → 10.3 MB، لکھائی بالکل وہی)۔ فونٹ کبھی نہیں بدلتے، اس لیے نئے ورژن پر
// دوبارہ سرور سے نہیں اترتے — پچھلے ورژن کی محفوظ کاپی ہی نئے ورژن میں منتقل ہو جاتی ہے (پہلے ہر ریلیز پر ہر فون 24 MB دوبارہ لیتا تھا)
const FONT_URLS = [
  './fonts/JameelNooriNastaleeq-Regular.woff2',
  './fonts/JameelNooriNastaleeq-Kasheeda.woff2'
];
const OPTIONAL_URLS = [
  './icons/favicon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // ---------- 🆕 ہدایت (FM8SEPTU4): 3 نئے فونٹ — fonts/ فولڈر میں ---------- -->
  // ---------- 🗑️ ہدایت (FM13SEPSU): 4 فونٹ (Gandhara Suls, Akram Unicode, AlQalam Khawar, AlFars Aban)
  // فہرست سے ہٹا دیے گئے، اس لیے یہ precache انٹریز بھی ہٹا دی گئیں ---------- -->
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// ---------- انسٹال — نیا ورژن آتے ہی سب ضروری فائلیں پیشگی کیش کر لیں ----------
// ---------- 🔒 ہدایت (17 ستمبر، دوپہر): پہلے یہاں سے self.skipWaiting() ہٹا کر مینوئل بٹن پر
// منحصر کر دیا گیا تھا — غلط تھا، کیونکہ آپ کے لیے نیا بلڈ اپلوڈ ہوتے ہی خودکار اپڈیٹ ہونا ضروری ہے
// (کوئی بٹن دبانے کی ضرورت نہیں)۔ واپس خودکار skipWaiting بحال — اصل مسئلہ یہ نہیں تھا، اصل مسئلہ یہ تھا
// کہ صفحہ فوراً ری لوڈ ہو جاتا تھا چاہے صارف لکھ رہا ہو — وہ فکس index.html میں الگ سے کیا گیا ہے
// (ری لوڈ اب صارف کے لکھنا بند کرنے تک انتظار کرتا ہے، نئے ورژن کا لوڈ ہونا خودکار ہی رہتا ہے) ---------- -->
// ---------- ⛔ FM510MO305: غلط ریپو پہرہ — یہ sw.js کسی دوسری ایپ کی جگہ لگ جائے (SM کی FM میں یا FM کی SM میں) تو انسٹال
// ہی ناکام: پرانا صحیح ورژن چلتا رہے۔ اور دوسری ایپ کی index.html کبھی کیش میں نہ رکھی جائے ---------- -->
const __APP_KIND = 'AB';
function __appHostKind(h, p){
  h = String(h || '').toLowerCase(); p = String(p || '');
  let x = 5381; for(let i = 0; i < h.length; i++){ x = (((x * 33) >>> 0) ^ h.charCodeAt(i)) >>> 0; }
  if(x === 3796688142 || x === 1729952530) return 'FM';
  if(/\.github\.io$/.test(h) && /^\/AB(\/|$)/i.test(p)) return 'AB';
  if((/\.github\.io$/.test(h) && /^\/SM(\/|$)/i.test(p)) || /sabzi-mandi/.test(h)) return 'SM';
  return '';
}
const __WRONG_REPO = (() => { const k = __appHostKind(self.location.hostname, self.location.pathname); return !!k && k !== __APP_KIND; })();
self.addEventListener('install', (event) => {
  if(__WRONG_REPO) event.waitUntil(Promise.reject(new Error('⛔ غلط ایپ کی sw.js — انسٹال روک دی گئی')));
});
// صفحہ (HTML) کیش میں رکھنے سے پہلے دیکھیں کہ یہ اسی ایپ کا ہے
function __safeCachePut(req, res){
  try{
    const isHtml = req.mode === 'navigate' || /\/$|\.html$/.test(new URL(req.url).pathname) || /text\/html/.test(res.headers.get('content-type') || '');
    if(!isHtml) return caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
    return res.clone().text().then((txt) => {
      const m = txt.match(/APP_BUILD_VERSION = '([A-Za-z]{2})/);
      if(m && m[1].toUpperCase() !== __APP_KIND) return; // دوسری ایپ کا صفحہ — کیش نہیں
      return caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
    });
  }catch(e){ return caches.open(CACHE_NAME).then((cache) => cache.put(req, res)); }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // ---------- 🔒🆕 ہدایت (FM21SEPMO06): "نیا ورژن اپ لوڈ کے بعد بھی پرانا ٹائم شو ہو رہا ہے" کی
      // اصل جڑ — یہ addAll() فائل کے نام سے فیچ کرتا تھا (بغیر cache:'reload' کے)، جس کی وجہ سے اگر براؤزر کی
      // اپنی HTTP کیش (GitHub Pages Cache-Control ہیڈر کی بنا پر) ابھی تک index.html/manifest.json کو "تازہ"
      // سمجھ رہی ہو، تو یہ خود بخود وہی پرانی کاپی استعمال کر لیتا — چاہے سرور پر نئی فائل موجود ہو۔ نتیجہ: SW
      // درست طریقے سے اپڈیٹ/ایکٹیویٹ/ری لوڈ تو ہو جاتا، مگر کیش میں پرانا مواد ہی بند ہو جاتا، تو صفحہ ری لوڈ
      // کے بعد بھی پرانا ورژن دکھتا رہتا۔ فکس: cache:'reload' — ہمیشہ براہ راست سرور سے تازہ فائل منگوائیں،
      // براؤزر کی HTTP کیش کو نظرانداز کریں (پلے رائٹ سے حقیقی GitHub-Pages-جیسی Cache-Control ہیڈر کے ساتھ
      // ٹیسٹ کر کے یہ بگ پہلے دوبارہ پیدا کیا گیا، پھر اسی فکس سے حل ہوا) ---------- -->
      // ---------- CRITICAL: addAll() — ایک بھی ناکام ہو تو پوری install ناکام، پرانا SW/کیش فعال رہے ---------- -->
      await cache.addAll(CRITICAL_URLS.map((url) => new Request(url, { cache: 'reload' })));
      // ---------- OPTIONAL: ہر فائل الگ سے، ناکامی صرف وارننگ (اپڈیٹ نہ رکے) ---------- -->
      await Promise.all(FONT_URLS.map(async (url) => {
        try{
          const old = await caches.match(url); // پرانے ورژن کی کیش میں موجود ہو تو وہی — سرور سے دوبارہ نہیں
          if(old && old.ok){ await cache.put(url, old); return; }
          await cache.add(url);
        }catch(err){ console.warn('Font precache failed (optional)', url, err); }
      }));
      await Promise.all(
        OPTIONAL_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Precache failed for (optional)', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
    .catch((err) => {
      console.warn('⚠️ اہم فائلوں کی precache ناکام — یہ اپڈیٹ منسوخ، پرانا ورژن فعال رہے گا:', err);
      throw err; // ---------- install event کو باقاعدہ ناکام ہونے دیں تاکہ browser پرانی/فعال SW برقرار رکھے ---------- -->
    })
  );
});

// ---------- محفوظ رکھا (کوئی نقصان نہیں) — اگر کبھی مینوئل بٹن دوبارہ چاہیے ہو تو یہ پہلے سے تیار ہے ----------
self.addEventListener('message', (event) => {
  if(event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ---------- ایکٹیویٹ — پرانے ورژن کے کیش خودکار صاف کر دیں ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- فیچ — اسی اوریجن کی فائلیں: پہلے کیش، نہ ملے تو نیٹ ورک (اور نیٹ ورک سے ملنے پر خودکار کیش اپڈیٹ) ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // SM110TH026: privacy/terms pages are plain pages, never served from the app cache
  if (/\/(privacy|terms)\.html$/.test(new URL(req.url).pathname)) return;

  const url = new URL(req.url);

  // ---------- 🐛 ہدایت: مخصوص، محفوظ CDN فائلیں (jsPDF، گوگل فونٹس) بھی کیش ہوں —
  // باقی سب (Firestore کالز وغیرہ) ہمیشہ کی طرح براہ راست نیٹ ورک پر ہی رہیں ---------- -->
  const CACHEABLE_CROSS_ORIGIN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  if (url.origin !== self.location.origin) {
    if (CACHEABLE_CROSS_ORIGIN_HOSTS.includes(url.hostname)) {
      event.respondWith(
        caches.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            return res;
          }).catch(() => cached);
        })
      );
    }
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      // ---------- 🔒 ہدایت (FM21SEPMO06): یہاں بھی وہی HTTP-کیش بگ — بیک گراؤنڈ میں تازہ کاپی لانے
      // کی یہ کوشش پہلے req کو براہ راست fetch کرتی تھی، جو براؤزر کی اپنی HTTP کیش سے پرانا جواب دوبارہ لا
      // سکتی تھی۔ اب cache:'reload' سے ہمیشہ سرور سے حقیقی تازہ کاپی ہی آئے گی ---------- -->
      // 💾 SM1710SA137: فون میں محفوظ فائل ہو تو بس وہی — پیچھے سے دوبارہ پوری ڈاؤن لوڈ نہیں (پہلے ہر بار ایپ کھلنے پر
      // 24 MB کے اردو فونٹ + 1.4 MB ایپ فائل دوبارہ آتی تھیں، اسی سے فائربیس ہوسٹنگ کی ماہانہ حد ختم ہو رہی تھی)۔
      // نیا ورژن پھر بھی فوراً آتا ہے: ہر ریلیز پر CACHE_VERSION بدلتا ہے → نیا sw انسٹال ہو کر تازہ فائلیں لے آتا ہے
      if (cached) return cached;
      const networkFetch = fetch(req.url, { cache: 'reload' }).then((res) => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          __safeCachePut(req, resClone);
        }
        return res;
      }).catch(() => {
        if (cached) return cached;
        // ---------- 🛟 ہدایت (FM21SEPMO03): نیٹ ورک ناکام اور یہی مخصوص فائل کیش میں بھی نہیں —
        // اگر یہ صفحہ کھولنے کی درخواست ہے تو خالی/ٹوٹا صفحہ دکھانے کی بجائے کم از کم ایپ شیل
        // (index.html) دکھا دیں، تاکہ ایپ بہرحال کھلے ---------- -->
        if (req.mode === 'navigate' || req.destination === 'document') {
          return caches.match('./index.html');
        }
        return undefined;
      });

      if (cached) return cached; // ---------- کیش میں پہلے سے موجود — فوراً دکھائیں، نیٹ ورک پس منظر میں تازہ کرتا رہے ---------- -->

      // ---------- 🆕🔒 ہدایت (FM21SEPMO0O): شام کو نیٹ/ڈیٹا پیکج ختم ہونے پر ایپ بالکل نہ کھلنے کی اصل جڑ
      // یہاں ملی — "ڈیٹا پیکج ختم" اکثر صاف/فوری بند کنکشن نہیں ہوتا، بلکہ آدھا زندہ/بہت سست کنکشن ہوتا ہے:
      // درخواست بھیج تو دی جاتی ہے مگر جواب کبھی نہیں آتا (نہ کامیابی نہ ناکامی)۔ اوپر fetch() کا کوئی ٹائم
      // آؤٹ نہیں تھا — اگر یہی صفحہ (یا اس کا مخصوص URL، مثلاً ہوم سکرین آئیکن کا لانچ URL) عین اسی شکل میں
      // پہلے سے کیش میں نہ ہو، تو یہ ہمیشہ کے لیے لٹک جاتا اور صفحہ کبھی نہ کھلتا — چاہے ایپ شیل کیش میں
      // موجود ہی کیوں نہ ہو۔ (پلے رائٹ سے ایک "جان بوجھ کر کبھی جواب نہ دینے والا" ٹیسٹ سرور بنا کر یہ بگ پہلے
      // حقیقی طور پر دوبارہ پیدا کیا گیا — بغیر فکس کے صفحہ 10+ سیکنڈ تک بھی نہیں کھلا، لامحدود لٹکتا رہتا —
      // پھر اسی فکس سے حل ہوا، اور صاف آف لائن (سرور مکمل بند) میں کوئی سستی نہیں آئی، تصدیق شدہ)۔ اب صفحہ
      // کھولنے کی درخواست پر 4 سیکنڈ کی حد — نہ ملے تو فوراً محفوظ شدہ ایپ شیل (index.html) دکھا دیں، تاکہ ایپ
      // کبھی بھی "بالکل نہ کھلنے" کی حالت میں نہ رہے ---------- -->
      if (req.mode === 'navigate' || req.destination === 'document') {
        const shellTimeout = new Promise((resolve) => {
          setTimeout(() => { caches.match('./index.html').then((shell) => resolve(shell)); }, 4000);
        });
        return Promise.race([networkFetch, shellTimeout]);
      }

      return networkFetch;
    })
  );
});
