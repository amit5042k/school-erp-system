/**
 * Outbound email and SMS. Both are optional and configured in backend/.env:
 *   Email: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (false), SMTP_USER, SMTP_PASS, SMTP_FROM
 *   SMS:   SMS_API_URL with {to} and {message} placeholders, e.g.
 *          https://gateway.example/send?apikey=XXX&sender=SCHOOL&numbers={to}&message={message}
 *          SMS_API_METHOD=GET (default) or POST; for POST, SMS_API_BODY is a JSON template using the
 *          same placeholders and is sent with Content-Type: application/json.
 * When a channel isn't configured, sends are recorded with status 'not_configured' instead of failing,
 * so the rest of the app keeps working and the log shows what would have gone out.
 */
const db = require('../config/db');

db.exec(`
  CREATE TABLE IF NOT EXISTS message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
    recipient TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sent','failed','not_configured')),
    error TEXT,
    batch_id TEXT,
    sent_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

let transport = null;
function mailer() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const status = () => ({ email: !!process.env.SMTP_HOST, sms: !!process.env.SMS_API_URL });

const logRow = db.prepare(`
  INSERT INTO message_log (channel, recipient, recipient_name, subject, body, status, error, batch_id, sent_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

async function sendOne(channel, r, subject, body, batchId, userId, redact = []) {
  const fill = (t) => String(t).replace(/\{name\}/g, r.name || '');
  const text = fill(body);
  let st = 'sent', err = null;
  try {
    if (channel === 'email') {
      const t = mailer();
      if (!t) st = 'not_configured';
      else await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: r.to, subject: fill(subject || ''), text });
    } else {
      const url = process.env.SMS_API_URL;
      if (!url) st = 'not_configured';
      else {
        const enc = (s) => encodeURIComponent(s);
        const method = (process.env.SMS_API_METHOD || 'GET').toUpperCase();
        const target = url.replace('{to}', enc(r.to)).replace('{message}', enc(text));
        const opts = { method };
        if (method === 'POST' && process.env.SMS_API_BODY) {
          const json = (s) => JSON.stringify(s).slice(1, -1);
          opts.headers = { 'Content-Type': 'application/json' };
          opts.body = process.env.SMS_API_BODY.replace('{to}', json(r.to)).replace('{message}', json(text));
        }
        const res = await fetch(target, opts);
        if (!res.ok) throw new Error(`Gateway responded ${res.status}`);
      }
    }
  } catch (e) { st = 'failed'; err = String(e.message || e).slice(0, 300); }
  // Secrets (e.g. temporary passwords) are sent but never stored in the log.
  const logged = redact.reduce((t, secret) => (secret ? t.split(secret).join('******') : t), text);
  logRow.run(channel, r.to, r.name || null, subject || null, logged, st, err, batchId, userId || null);
  return st;
}

/**
 * Send to many recipients. recipients: [{ to, name? }]; '{name}' in subject/body is replaced per recipient.
 * redact: strings (e.g. passwords) to mask as ****** in the stored log.
 * Returns { batch_id, total, sent, failed, not_configured, skipped } (skipped = no phone/email).
 */
async function send({ channel, recipients, subject, body, userId, audience, redact = [] }) {
  if (!['sms', 'email'].includes(channel)) throw Object.assign(new Error('channel must be sms or email'), { status: 400 });
  if (!body) throw Object.assign(new Error('message body is required'), { status: 400 });
  const valid = channel === 'email'
    ? (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '')
    : (v) => /^\+?\d[\d\s-]{6,}$/.test(v || '');
  const seen = new Set(), list = [];
  let skipped = 0;
  for (const r of recipients || []) {
    const to = String(r.to || '').trim();
    if (!valid(to)) { skipped++; continue; }
    if (seen.has(to)) continue;
    seen.add(to); list.push({ ...r, to });
  }
  const batchId = `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const counts = { sent: 0, failed: 0, not_configured: 0 };
  for (const r of list) counts[await sendOne(channel, r, subject, body, batchId, userId, redact)]++;
  const loggedBody = redact.reduce((t, secret) => (secret ? t.split(secret).join('******') : t), body);
  db.prepare(`INSERT INTO communications (channel, audience, subject, body, recipient_count, sent_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(channel, audience || 'selected', subject || null, loggedBody, list.length, userId || null);
  return { batch_id: batchId, total: list.length, ...counts, skipped };
}

module.exports = { send, status };
