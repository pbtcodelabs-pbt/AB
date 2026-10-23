# 📒 آڑھت بک (AB) — سبزی منڈی (SM) کی کاپی سے ایک بار کی تبدیلی (23 اکتوبر 2026، AB2310FR001)
# یہ صرف تاریخ کے لیے رکھا ہے۔ AB اب اپنی الگ ایپ ہے — اسے دوبارہ نہ چلائیں، ورنہ AB کا کام مٹ جائے گا۔
import re, sys, os.path as p
ROOT = p.dirname(p.dirname(p.abspath(__file__)))
VER = sys.argv[1] if len(sys.argv) > 1 else 'AB2310FR001'
NOTE = 'آڑھت بک کی پہلی ریلیز'

def rep(s, old, new, cnt=1):
    n = s.count(old); assert n == cnt, (n, old[:90]); return s.replace(old, new)

f = p.join(ROOT, 'index.html'); s = open(f, encoding='utf-8').read()

# 1) غلط ریپو پہرہ: یہ فائل صرف /AB/ پر کھلے؛ SM یا FM کی جگہ لگ جائے تو کچھ نہ پڑھے
s = rep(s, "var __APP_KIND = 'SM';", "var __APP_KIND = 'AB';")
s = rep(s, "  if((/\\.github\\.io$/.test(h) && /^\\/SM(\\/|$)/i.test(p)) || /sabzi-mandi/.test(h)) return 'SM';",
           "  if(/\\.github\\.io$/.test(h) && /^\\/AB(\\/|$)/i.test(p)) return 'AB';\n"
           "  if((/\\.github\\.io$/.test(h) && /^\\/SM(\\/|$)/i.test(p)) || /sabzi-mandi/.test(h)) return 'SM';")
s = rep(s, "var nm = function(k){ return k === 'SM' ? 'سبزی منڈی (SM)' : 'فروٹ منڈی (FM)'; };",
           "var nm = function(k){ return k === 'AB' ? 'آڑھت بک (AB)' : k === 'SM' ? 'سبزی منڈی (SM)' : 'فروٹ منڈی (FM)'; };")

# 2) فون کا ڈیٹا "AB::" کے الگ خانے میں؛ اپنا فائربیس لگنے تک کلاؤڈ مکمل بند
s = rep(s, """/* 🥬 سبزی منڈی — جنرل ایڈیشن کا حفاظتی حصہ (ہر چیز سے پہلے چلتا ہے)
   1) اس ایپ کا سارا فون والا ڈیٹا "SM::" کے الگ خانے میں — کسی دوسری ایپ (مثلاً فروٹ منڈی) سے کبھی نہ ملے
   2) کلاؤڈ (فائربیس) مکمل بند — جب تک اس ایپ کا اپنا فائربیس پروجیکٹ نہ لگے، کوئی ڈیٹا کلاؤڈ پر نہیں جاتا */""",
"""/* 📒 آڑھت بک — حفاظتی حصہ (ہر چیز سے پہلے چلتا ہے)
   1) اس ایپ کا سارا فون والا ڈیٹا "AB::" کے الگ خانے میں — سبزی منڈی (SM::) یا کسی دوسری ایپ سے کبھی نہ ملے
   2) کلاؤڈ (فائربیس) مکمل بند — جب تک آڑھت بک کا اپنا فائربیس پروجیکٹ نہ لگے (AB_CLOUD_READY)، کوئی ڈیٹا کلاؤڈ پر نہیں جاتا */
const AB_CLOUD_READY = false;""")
s = rep(s, "  const P = 'SM::';", "  const P = 'AB::';")
s = rep(s, "  // ---------- ☁️ سبزی منڈی کا اپنا فائربیس (sabzi-mandi-143e6) — مالک والا کبھی نہیں ----------",
           "  // ---------- ☁️ آڑھت بک کا اپنا فائربیس (ابھی نہیں لگا) — سبزی منڈی یا مالک والا کبھی نہیں ----------")
s = rep(s, "    const u = (typeof input === 'string') ? input : (input && input.url) || '';\n",
           "    const u = (typeof input === 'string') ? input : (input && input.url) || '';\n"
           "    if(!AB_CLOUD_READY && /(firestore|identitytoolkit|securetoken)\\.googleapis\\.com/.test(u)){\n"
           "      return Promise.reject(new TypeError('آڑھت بک: کلاؤڈ ابھی بند ہے'));\n"
           "    }\n")
s = rep(s, "const FIREBASE_PROJECT_ID = 'sabzi-mandi-143e6';", "const FIREBASE_PROJECT_ID = 'arth-book-not-set'; // 📒 آڑھت بک کا اپنا فائربیس بنے تو یہاں لگائیں اور AB_CLOUD_READY = true")
s = rep(s, "const FIREBASE_API_KEY = 'AIzaSyAfvu0JOHGgNzp9HEcRpCnE40jSN2X2n7w';", "const FIREBASE_API_KEY = '';")
s = rep(s, "console.firebase.google.com/project/sabzi-mandi-143e6/", "console.firebase.google.com/project/arth-book-not-set/")

# 3) فون کے اندر تصویروں/حفاظتی کاپی کے ڈیٹا بیس بھی الگ نام سے
s = rep(s, "indexedDB.open('SM_'+", "indexedDB.open('AB_'+", 4)
s = rep(s, "indexedDB.open('smBkSnap'", "indexedDB.open('abBkSnap'")

# 4) بیک اپ کی پہچان: AB کی فائل صرف AB میں بحال ہو
s = rep(s, "function appKindCode(){ return String(typeof APP_BUILD_VERSION !== 'undefined' ? APP_BUILD_VERSION : '').slice(0, 2).toUpperCase() === 'SM' ? 'SM' : 'FM'; }",
           "function appKindCode(){ return 'AB'; } // 📒 آڑھت بک کی ہر بیک اپ فائل پر AB کی مہر")
s = rep(s, "  if(b && (b.appKind === 'FM' || b.appKind === 'SM')) return b.appKind;",
           "  if(b && (b.appKind === 'FM' || b.appKind === 'SM' || b.appKind === 'AB')) return b.appKind;")
s = rep(s, """  return k === 'FM'
    ? '❌ یہ فروٹ منڈی (FM) کی بیک اپ فائل ہے — سبزی منڈی (SM) کی ایپ میں نہیں لگ سکتی۔'
    : '❌ یہ سبزی منڈی (SM) کی بیک اپ فائل ہے — فروٹ منڈی (FM) کی ایپ میں نہیں لگ سکتی۔';""",
"""  return '❌ یہ ' + (k === 'FM' ? 'فروٹ منڈی (FM)' : 'سبزی منڈی (SM)') + ' کی بیک اپ فائل ہے — آڑھت بک (AB) کی ایپ میں نہیں لگ سکتی۔';""")
s = rep(s, "const isSM = String(typeof APP_BUILD_VERSION !== 'undefined' ? APP_BUILD_VERSION : '').startsWith('SM');",
           "const isSM = /^(SM|AB)/.test(String(typeof APP_BUILD_VERSION !== 'undefined' ? APP_BUILD_VERSION : ''));")

# 5) گوگل ڈرائیو کا الگ فولڈر
s = rep(s, "const GDRIVE_BACKUP_FOLDER_NAME = 'Sabzi Mandi POS Backup';", "const GDRIVE_BACKUP_FOLDER_NAME = 'Arth Book Backup';")

# 6) ورژن اور اپڈیٹ نوٹ
s = s.replace('SM2410SA176', VER)
s = re.sub(r"const UPDATE_NOTE = '[^']*';", "const UPDATE_NOTE = '" + NOTE + "';", s, count=1)

# 7) نام
s = rep(s, 'placeholder="مثلاً رحمان سبزی منڈی"', 'placeholder="مثلاً رحمان کمیشن شاپ"')
s = s.replace('سبزی منڈی', 'آڑھت بک').replace('Sabzi Mandi POS', 'Arth Book').replace('Sabzi_Mandi_POS', 'Arth_Book')
s = s.replace('🥬 آڑھت بک', '📒 آڑھت بک')
open(f, 'w', encoding='utf-8').write(s)

# ---------- sw.js ----------
f = p.join(ROOT, 'sw.js'); w = open(f, encoding='utf-8').read()
w = rep(w, "// ---------- 🥬 سبزی منڈی (جنرل ایپ) — Service Worker ----------", "// ---------- 📒 آڑھت بک (AB) — Service Worker ----------")
w = rep(w, "const CACHE_VERSION = 'SM2410SA176';", "const CACHE_VERSION = '" + VER + "';")
w = rep(w, "const CACHE_NAME = 'sabzi-mandi-general-' + CACHE_VERSION;", "const CACHE_PREFIX = 'arth-book-';\nconst CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;")
# ایک ہی ویب سائٹ پر دوسری ایپس (SM، DDL، MS…) کے کیش کبھی نہ مٹائیں — صرف آڑھت بک کے پرانے
w = rep(w, "          if (key !== CACHE_NAME) return caches.delete(key);",
           "          if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) return caches.delete(key);")
w = w.replace('سبزی منڈی', 'آڑھت بک').replace("const __APP_KIND = String(CACHE_VERSION).slice(0, 2).toUpperCase() === 'SM' ? 'SM' : 'FM';", "const __APP_KIND = 'AB';")  # + sw کا پہرہ: /AB/ → 'AB' (ہاتھ سے)
open(f, 'w', encoding='utf-8').write(w)

# ---------- sm_backup_v2.js (پرانی الگ کاپی) ----------
f = p.join(ROOT, 'sm_backup_v2.js'); b = open(f, encoding='utf-8').read()
b = rep(b, "indexedDB.open('smBkSnap'", "indexedDB.open('abBkSnap'")
b = b.replace('سبزی منڈی', 'آڑھت بک')
open(f, 'w', encoding='utf-8').write(b)
print('ok', VER)
