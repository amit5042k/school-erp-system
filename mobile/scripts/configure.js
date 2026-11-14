// Writes capacitor.config.json from app.config.json, overridable by env:
//   ERP_URL, API_URL, APP_ID, APP_NAME, VERSION_NAME, VERSION_CODE
// Also writes www/config.js for the offline page and android/app/version.properties for Gradle.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
const pick = (env, key) => process.env[env] || cfg[key];

const erpUrl = String(pick('ERP_URL', 'erpUrl')).replace(/\/$/, '');
const apiUrl = String(pick('API_URL', 'apiUrl') || '').replace(/\/$/, '');
const appId = pick('APP_ID', 'appId');
const appName = pick('APP_NAME', 'appName');
const versionName = String(pick('VERSION_NAME', 'versionName'));
const versionCode = Number(pick('VERSION_CODE', 'versionCode'));

for (const [name, url] of [['ERP_URL', erpUrl], ['API_URL', apiUrl]]) {
  if (url && !/^https:\/\//.test(url) && !/^http:\/\/(10\.|192\.168\.|localhost|127\.)/.test(url)) {
    throw new Error(`${name} must use https:// (got ${url})`);
  }
}
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(appId)) throw new Error(`Invalid APP_ID: ${appId}`);
if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error('VERSION_CODE must be a positive whole number');

const host = (u) => (u ? new URL(u).host : null);
// Android push is only switched on when Firebase is configured; the web app reads this from the user agent,
// because asking for a push token without google-services.json crashes the Android app.
const hasFirebase = fs.existsSync(path.join(root, 'android', 'app', 'google-services.json'));

const capConfig = {
  appId,
  appName,
  webDir: 'www',
  server: {
    url: erpUrl,
    cleartext: erpUrl.startsWith('http://'),
    allowNavigation: [host(erpUrl), host(apiUrl)].filter(Boolean),
    errorPath: 'offline.html',
  },
  // Each app tells the website it's the app, and whether it can register for push: Android needs Firebase's
  // google-services.json for that, iOS uses Apple's push service directly.
  android: { allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: false,
    appendUserAgent: `SchoolERP-App/${versionName} push=${hasFirebase ? 1 : 0}` },
  ios: { contentInset: 'automatic', appendUserAgent: `SchoolERP-App/${versionName} push=1` },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: cfg.themeColor || '#133b7a', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    StatusBar: { backgroundColor: cfg.themeColor || '#133b7a', style: 'DARK', overlaysWebView: false },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

fs.writeFileSync(path.join(root, 'capacitor.config.json'), JSON.stringify(capConfig, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'www', 'config.js'), `window.ERP_URL = ${JSON.stringify(erpUrl)};\n`);
const androidApp = path.join(root, 'android', 'app');
if (fs.existsSync(androidApp)) {
  fs.writeFileSync(path.join(androidApp, 'version.properties'), `appId=${appId}\nversionName=${versionName}\nversionCode=${versionCode}\n`);
}
console.log(`Configured ${appName} (${appId}) v${versionName} (${versionCode}) → ${erpUrl}; push ${hasFirebase ? 'on' : 'off (no google-services.json)'}`);
