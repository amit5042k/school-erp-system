// Signs school licences with the platform's RSA key; school backends verify with the public key.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { cfg } = require('./config');
const { db } = require('./db');

const PRIVATE = path.join(cfg.dataDir, 'licence-private.pem');
const PUBLIC = path.join(cfg.dataDir, 'licence-public.pem');

if (!fs.existsSync(PRIVATE) || !fs.existsSync(PUBLIC)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(PRIVATE, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC, publicKey, { mode: 0o644 });
}
const privateKey = fs.readFileSync(PRIVATE, 'utf8');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newKey = () => crypto.randomBytes(32).toString('hex');

function localToday() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Stored status, adjusted for the expiry date.
function effectiveStatus(s) {
  if (s.status === 'archived' || s.status === 'suspended') return s.status;
  if (s.expires_on < localToday()) return 'expired';
  return s.status;
}

function payload(school) {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(school.plan_id);
  return {
    code: school.code,
    school_name: school.name,
    status: effectiveStatus(school),
    starts_on: school.starts_on,
    expires_on: school.expires_on,
    plan: plan ? { key: plan.key, name: plan.name, areas: JSON.parse(plan.areas) } : null,
    max_students: school.max_students ?? plan?.max_students ?? null,
  };
}

// Server licences are short-lived (the backend re-fetches every 10 minutes); file licences last until expiry.
function sign(school, { forFile = false } = {}) {
  const opts = { algorithm: 'RS256', issuer: 'school-erp-platform', subject: school.code };
  if (!forFile) opts.expiresIn = '30d';
  return jwt.sign(payload(school), privateKey, opts);
}

module.exports = { sign, payload, effectiveStatus, sha256, newKey, localToday, PUBLIC_KEY_PATH: PUBLIC };
