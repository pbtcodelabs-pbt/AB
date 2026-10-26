// ---------- 📒 آڑھت بک (AB) — سروس ورکر ----------
// ہر ریلیز پر CACHE_VERSION بدلیں (index.html / app.js والے APP_VERSION جیسا)
const CACHE_VERSION = 'AB2610MO051';
const CACHE_PREFIX = 'arth-book-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const FONT_CACHE = CACHE_PREFIX + 'fonts-v1'; // فونٹ کبھی نہیں بدلتے — ہر ریلیز پر دوبارہ نہ اتریں

// ایپ کا ڈھانچہ — ایک بھی فائل نہ ملے تو اپڈیٹ رک جائے اور پرانا چلتا ورژن ہی رہے
const SHELL = ['./', './index.html', './app.js', './calc.js', './drive.js', './cloud-config.js', './receipt.js', './labels.js', './datewheel.js', './usage.js', './cloud.js', './license.js', './manifest.json'];
const ICONS = ['./icons/favicon-32.png', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
const FONTS = ['./fonts/JameelNooriNastaleeq-Regular.woff2', './fonts/JameelNooriNastaleeq-Kasheeda.woff2'];

// ---------- غلط جگہ پہرہ: یہ sw.js سبزی منڈی / فروٹ منڈی کی جگہ لگ جائے تو انسٹال ہی نہ ہو ----------
const WRONG = /\.github\.io$/.test(self.location.hostname) && /^\/(SM|FM)(\/|$)/i.test(self.location.pathname);

self.addEventListener('install', (event) => {
  if(WRONG){ event.waitUntil(Promise.reject(new Error('غلط ایپ کی sw.js'))); return; }
  // نیا ورژن انتظار نہ کرے، فوراً آگے آئے — پرانا ورژن (سبزی منڈی والا ڈھانچہ) اسے آگے آنے کا اشارہ نہیں دیتا تھا،
  // اس لیے فون پر AB2310FR001 ہی اٹکا رہتا تھا۔ ڈیٹا فون میں الگ محفوظ ہے، اس پر کوئی اثر نہیں
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(ICONS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    const fc = await caches.open(FONT_CACHE);
    await Promise.all(FONTS.map(async (u) => { if(!(await fc.match(u))) await fc.add(u).catch(() => {}); }));
  })());
});

self.addEventListener('message', (event) => { if(event.data === 'SKIP_WAITING') self.skipWaiting(); });

// ---------- صرف آڑھت بک کے پرانے کیش مٹائیں — اسی ویب سائٹ کی دوسری ایپس کے کبھی نہیں ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => {
      if(k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME && k !== FONT_CACHE) return caches.delete(k);
    }))).then(() => self.clients.claim())
  );
});

// ---------- پہلے کیش سے (آف لائن بھی چلے)، نہ ملے تو نیٹ سے ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if(hit) return hit;
    if(req.mode === 'navigate'){ const shell = await caches.match('./index.html'); if(shell) return shell; }
    return fetch(req);
  })());
});
