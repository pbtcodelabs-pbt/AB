// 📒 آڑھت بک — کمپیوٹر (ونڈوز) والی ایپ: وہی ایپ (index.html) ایک کھڑکی میں، انٹرنیٹ کے بغیر بھی
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// ایک وقت میں ایک ہی کھڑکی (دوبارہ کھولنے پر پہلی سامنے آ جائے)
if(!app.requestSingleInstanceLock()){ app.quit(); }

let win = null;
function create(){
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 900, minHeight: 600,
    title: 'آڑھت بک', backgroundColor: '#7f1d1d',
    icon: path.join(__dirname, 'app', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // پرنٹ والی کھڑکیاں ایپ کے اندر کھلیں؛ باہر کے لنک (واٹس ایپ وغیرہ) براؤزر میں
  win.webContents.setWindowOpenHandler(({ url }) => {
    if(url === 'about:blank' || url === '') return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, title: 'پرنٹ' } };
    if(/^https?:/.test(url)){ shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
}
app.on('second-instance', () => { if(win){ if(win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
