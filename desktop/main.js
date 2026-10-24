// 📒 آڑھت بک — کمپیوٹر (ونڈوز) والی ایپ
// ایپ ویب سائٹ سے کھلتی ہے (pbtcodelabs-pbt.github.io/AB/) تاکہ ہر نیا ورژن کمپیوٹر پر بھی خود آ جائے — exe دوبارہ بنانے کی ضرورت نہیں۔
// انٹرنیٹ نہ ہو تو سروس ورکر والا آخری محفوظ ورژن؛ بالکل پہلی بار بھی انٹرنیٹ نہ ہو تو exe کے اندر رکھی کاپی (app/)۔
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

const LIVE = 'https://pbtcodelabs-pbt.github.io/AB/';

// ایک وقت میں ایک ہی کھڑکی (دوبارہ کھولنے پر پہلی سامنے آ جائے)
if(!app.requestSingleInstanceLock()){ app.quit(); }

let win = null, usedLocal = false;
function create(){
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 900, minHeight: 600,
    title: 'آڑھت بک', backgroundColor: '#7f1d1d',
    icon: path.join(__dirname, 'app', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  // گوگل لاگ اِن (ڈرائیو بیک اپ) عام کروم سمجھ کر چلے
  const ua = win.webContents.getUserAgent().replace(/\s?Electron\/[\d.]+/, '').replace(/\s?aarhat-book\/[\d.]+/i, '');
  win.webContents.setUserAgent(ua);
  win.loadURL(LIVE);
  // ویب سائٹ نہ کھلے (پہلی بار اور انٹرنیٹ نہیں) → اندر والی کاپی
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if(isMain && !usedLocal){ usedLocal = true; win.loadFile(path.join(__dirname, 'app', 'index.html')); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // پرنٹ والی کھڑکیاں اور گوگل لاگ اِن ایپ کے اندر
    if(url === 'about:blank' || url === '' || /^https:\/\/accounts\.google\.com\//.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    // واٹس ایپ وغیرہ باہر کے لنک براؤزر میں
    if(/^https?:/.test(url) && url.indexOf(LIVE) !== 0){ shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
}
app.on('second-instance', () => { if(win){ if(win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  // بلوٹوتھ تھرمل پرنٹر: پہلا ملنے والا پرنٹر چنیں (ونڈوز میں براؤزر جیسا چننے کا خانہ نہیں ہوتا)
  if(win === null) create();
  win.webContents.on('select-bluetooth-device', (event, list, cb) => { event.preventDefault(); if(list.length) cb(list[0].deviceId); });
});
app.on('window-all-closed', () => app.quit());
