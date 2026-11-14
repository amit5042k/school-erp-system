// Push to the Android and iOS apps (modules/push.js decides who gets what; this delivers it).
//   Android: Firebase Cloud Messaging HTTP v1. Configure in backend/.env:
//     FCM_SERVICE_ACCOUNT_FILE=/path/to/firebase-service-account.json   (or FCM_SERVICE_ACCOUNT_JSON='{...}')
//   iOS: Apple Push Notification service, token-based (a .p8 key from the Apple Developer account):
//     APNS_KEY_FILE=/path/to/AuthKey_XXXXXXXXXX.p8 (or APNS_KEY='-----BEGIN PRIVATE KEY-----…'),
//     APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (the app id, default in.schoolerp.app),
//     APNS_SANDBOX=true only for apps installed from Xcode during development.
// Without these, app notifications still land in the in-app Notifications page.
const fs = require('fs');
const http2 = require('http2');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

db.exec(`
  CREATE TABLE IF NOT EXISTS push_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    app_version TEXT,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_push_devices_user ON push_devices(user_id);
`);

const readSecret = (inline, file) => {
  if (process.env[inline]) return process.env[inline];
  if (process.env[file]) {
    try { return fs.readFileSync(process.env[file], 'utf8'); } catch (e) { console.error(`Could not read ${file}:`, e.message); }
  }
  return null;
};

/* ---------- Android: FCM HTTP v1 ---------- */
let serviceAccount;
function fcmAccount() {
  if (serviceAccount !== undefined) return serviceAccount;
  serviceAccount = null;
  try {
    const raw = readSecret('FCM_SERVICE_ACCOUNT_JSON', 'FCM_SERVICE_ACCOUNT_FILE');
    if (raw) {
      const sa = JSON.parse(raw);
      if (sa.client_email && sa.private_key && sa.project_id) serviceAccount = sa;
      else console.error('FCM service account is missing client_email, private_key or project_id');
    }
  } catch (e) { console.error('Could not read FCM service account:', e.message); }
  return serviceAccount;
}

let fcmToken = null;
async function fcmAccessToken(sa) {
  if (fcmToken && fcmToken.exp - 60 > Date.now() / 1000) return fcmToken.value;
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 },
    sa.private_key, { algorithm: 'RS256' });
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`FCM auth failed (${res.status})`);
  fcmToken = { value: data.access_token, exp: now + (data.expires_in || 3600) };
  return fcmToken.value;
}

const UNREGISTERED = /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT.*registration/i;
async function sendFcm(token, msg) {
  const sa = fcmAccount();
  if (!sa) return 'not_configured';
  const base = (process.env.FCM_BASE_URL || 'https://fcm.googleapis.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await fcmAccessToken(sa)}` },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: { link: msg.link || '/home', kind: msg.kind || 'general', inbox_id: String(msg.inboxId || '') },
        android: { priority: 'HIGH', notification: { channel_id: 'school_erp_default', click_action: 'FCM_PLUGIN_ACTIVITY' } },
      },
    }),
  });
  if (res.ok) return 'sent';
  const text = await res.text().catch(() => '');
  if (res.status === 404 || UNREGISTERED.test(text)) return 'gone';
  console.error(`FCM send failed (${res.status}): ${text.slice(0, 200)}`);
  return 'failed';
}

/* ---------- iOS: APNs ---------- */
function apnsConfig() {
  const key = readSecret('APNS_KEY', 'APNS_KEY_FILE');
  const keyId = process.env.APNS_KEY_ID, teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  return {
    key, keyId, teamId,
    topic: process.env.APNS_BUNDLE_ID || 'in.schoolerp.app',
    host: process.env.APNS_HOST || (process.env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'),
  };
}

// Apple accepts a provider token for up to an hour and rejects refreshing it more than every 20 minutes.
let apnsJwt = null;
function apnsToken(cfg) {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwt.iat < 40 * 60) return apnsJwt.value;
  apnsJwt = { iat: now, value: jwt.sign({ iss: cfg.teamId, iat: now }, cfg.key, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.keyId } }) };
  return apnsJwt.value;
}

let session = null;
function apnsSession(host) {
  if (session && !session.closed && !session.destroyed && session.host === host) return session;
  session = http2.connect(host);
  session.host = host;
  session.on('error', () => { session = null; });
  session.on('goaway', () => { session = null; });
  session.unref();
  return session;
}

function sendApns(token, msg) {
  const cfg = apnsConfig();
  if (!cfg) return Promise.resolve('not_configured');
  return new Promise((resolve) => {
    let req;
    try {
      req = apnsSession(cfg.host).request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${apnsToken(cfg)}`, 'apns-topic': cfg.topic, 'apns-push-type': 'alert', 'apns-priority': '10',
        'content-type': 'application/json',
      });
    } catch (e) { console.error('APNs connection failed:', e.message); session = null; return resolve('failed'); }
    let status = 0, body = '';
    req.setTimeout(15000, () => { req.close(); resolve('failed'); });
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (d) => { body += d; });
    req.on('error', (e) => { console.error('APNs error:', e.message); resolve('failed'); });
    req.on('end', () => {
      if (status === 200) return resolve('sent');
      const reason = (() => { try { return JSON.parse(body).reason; } catch { return body; } })();
      if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(reason || '')) return resolve('gone');
      console.error(`APNs send failed (${status}): ${String(reason).slice(0, 200)}`);
      resolve('failed');
    });
    req.end(JSON.stringify({
      aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' },
      link: msg.link || '/home', kind: msg.kind || 'general', inbox_id: String(msg.inboxId || ''),
    }));
  });
}

/** Sends to one registered app device. Returns 'sent' | 'gone' | 'failed' | 'not_configured'. */
async function sendToDevice(device, msg) {
  try {
    return device.platform === 'ios' ? await sendApns(device.token, msg) : await sendFcm(device.token, msg);
  } catch (e) {
    console.error('App push error:', e.message);
    return 'failed';
  }
}

const appPushStatus = () => ({ android: !!fcmAccount(), ios: !!apnsConfig() });

module.exports = { sendToDevice, appPushStatus };
