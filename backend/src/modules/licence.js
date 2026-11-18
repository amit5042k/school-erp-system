/**
 * Licensing. Every school install needs a licence from the ERP provider, tied to the school's registered email.
 *
 * Modes (from the environment):
 *   LICENSE_ISSUER=true               – this install is the provider's licence server (Licences page); it is not limited
 *   LICENSE_FILE                      – a licence JSON/JWT file (offline installs)
 *   LICENSE_SERVER_URL + LICENSE_KEY  – older platform console with a per-school key
 *   (default) email                   – the Super Admin enters the school's registered email on the Licence page; the
 *                                       install checks it with the provider's licence server (LICENSE_SERVER_URL,
 *                                       default https://nextgenos.in) every 10 minutes. A new install has a 30-day trial.
 * Licences are signed (RS256). The server's public key comes with the first licence and is kept, so a licence copied
 * or edited on disk is refused; LICENSE_PUBLIC_KEY(_FILE) pins it explicitly.
 *
 * Effects: trial over / expired / suspended / unverified → read-only (writes get 402; nothing is deleted);
 * areas outside the plan → 403; creating students beyond the plan's cap → 403.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { areaForPath, isSelfService, normPath, AREAS } = require('../utils/permissions');
const { today } = require('../utils/http');

const ISSUER = process.env.LICENSE_ISSUER === 'true';
const KEY = process.env.LICENSE_KEY || '';
const FILE = process.env.LICENSE_FILE || '';
const SERVER_URL = (process.env.LICENSE_SERVER_URL || (KEY ? '' : 'https://nextgenos.in')).replace(/\/+$/, '');
const MODE = ISSUER ? 'unlimited' : FILE ? 'file' : SERVER_URL && KEY ? 'server' : 'email';
const TRIAL_DAYS = 30;
const CACHE_MS = 10 * 60 * 1000;
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_FILE = process.env.LICENSE_CACHE_FILE
  || path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'school.sqlite')), 'licence-cache.json');

let publicKey = process.env.LICENSE_PUBLIC_KEY || '';
if (!publicKey && process.env.LICENSE_PUBLIC_KEY_FILE) {
  try { publicKey = fs.readFileSync(process.env.LICENSE_PUBLIC_KEY_FILE, 'utf8'); }
  catch (e) { console.error('Licence: cannot read LICENSE_PUBLIC_KEY_FILE:', e.message); }
}
// A key was configured but couldn't be loaded: refuse every licence rather than accept unsigned ones.
const keyMissing = !publicKey && !!process.env.LICENSE_PUBLIC_KEY_FILE;

// This install: a stable id, when it first started (trial), the registered email, its web address and the licence
// server's public key once known.
db.exec(`
  CREATE TABLE IF NOT EXISTS licence_install (
    id INTEGER PRIMARY KEY CHECK (id = 1), install_id TEXT NOT NULL, first_start TEXT NOT NULL,
    email TEXT, domain TEXT, public_key TEXT, last_error TEXT, last_checked_at TEXT
  );
`);
db.prepare('INSERT OR IGNORE INTO licence_install (id, install_id, first_start) VALUES (1, ?, ?)').run(crypto.randomUUID(), today());
const install = () => db.prepare('SELECT * FROM licence_install WHERE id = 1').get();
if (MODE === 'email' && !publicKey && install().public_key) publicKey = install().public_key;

// Student cap enforced in the database too, so no code path can go past it.
db.exec(`
  CREATE TABLE IF NOT EXISTS licence_limits (id INTEGER PRIMARY KEY CHECK (id = 1), max_students INTEGER);
  INSERT OR IGNORE INTO licence_limits (id, max_students) VALUES (1, NULL);
  CREATE TRIGGER IF NOT EXISTS trg_licence_student_cap BEFORE INSERT ON students
  WHEN (SELECT max_students FROM licence_limits WHERE id = 1) IS NOT NULL
   AND (SELECT COUNT(*) FROM students WHERE COALESCE(status, 'active') = 'active') >= (SELECT max_students FROM licence_limits WHERE id = 1)
  BEGIN SELECT RAISE(ABORT, 'LICENCE_STUDENT_CAP'); END;
  CREATE TRIGGER IF NOT EXISTS trg_licence_student_cap_reactivate BEFORE UPDATE OF status ON students
  WHEN COALESCE(NEW.status, 'active') = 'active' AND COALESCE(OLD.status, 'active') <> 'active'
   AND (SELECT max_students FROM licence_limits WHERE id = 1) IS NOT NULL
   AND (SELECT COUNT(*) FROM students WHERE COALESCE(status, 'active') = 'active') >= (SELECT max_students FROM licence_limits WHERE id = 1)
  BEGIN SELECT RAISE(ABORT, 'LICENCE_STUDENT_CAP'); END;
`);
const setCap = db.prepare('UPDATE licence_limits SET max_students = ? WHERE id = 1');
const activeStudents = () => db.prepare("SELECT COUNT(*) AS c FROM students WHERE COALESCE(status, 'active') = 'active'").get().c;

// Accepts a signed JWT string or a plain licence object; returns the licence payload or throws.
function readLicence(raw) {
  const text = typeof raw === 'string' ? raw.trim() : null;
  const looksJwt = text && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(text);
  if (keyMissing) throw new Error('licence public key could not be read');
  if (publicKey) {
    const token = looksJwt ? text : raw && raw.token;
    if (!token) throw new Error('licence is not signed');
    return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  }
  if (looksJwt) return jwt.decode(text);
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return obj && obj.token ? jwt.decode(obj.token) : obj;
}

let current = null;       // { licence, fetched_at, source }
let lastAttempt = 0;
let inflight = null;

function saveCache(entry) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(entry), { mode: 0o600 }); } catch (e) { console.error('Licence cache write failed:', e.message); }
}
function loadCache() {
  try {
    const entry = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    entry.licence = readLicence(entry.raw);
    // A cached licence counts only for the email registered now.
    if (MODE === 'email' && String(entry.licence?.email || '').toLowerCase() !== String(install().email || '').toLowerCase()) return null;
    return entry;
  } catch { return null; }
}

async function fetchFromServer() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SERVER_URL}/api/public/licence`, { headers: { Authorization: `Bearer ${KEY}` }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`platform replied ${res.status}`);
    const body = await res.json();
    const licence = readLicence(body.token || body);
    const entry = { raw: body.token || body, licence, fetched_at: Date.now(), source: 'server' };
    saveCache({ raw: entry.raw, fetched_at: entry.fetched_at, source: 'server' });
    return entry;
  } finally { clearTimeout(timer); }
}

const normDomain = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/^www\./, '');

// Email mode: ask the provider's licence server for this school's licence.
async function fetchByEmail() {
  const me = install();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SERVER_URL}/api/public/licence/check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ email: me.email, domain: normDomain(process.env.PUBLIC_URL || me.domain), install_id: me.install_id, students: activeStudents() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The server answered: no licence for this email, or another web address. Not an outage, so no grace period.
      const err = Object.assign(new Error(body.error || `licence server replied ${res.status}`), { definite: res.status >= 400 && res.status < 500 });
      throw err;
    }
    // The first licence brings the server's public key; after that it must not change.
    if (!publicKey && body.public_key) {
      publicKey = body.public_key;
      db.prepare('UPDATE licence_install SET public_key = ? WHERE id = 1').run(publicKey);
    }
    const licence = readLicence(body.token);
    if (String(licence.email || '').toLowerCase() !== String(me.email).toLowerCase()) throw new Error('the licence is for another email');
    const entry = { raw: body.token, licence, fetched_at: Date.now(), source: 'server' };
    saveCache({ raw: entry.raw, fetched_at: entry.fetched_at, source: 'server' });
    db.prepare('UPDATE licence_install SET last_error = NULL, last_checked_at = ? WHERE id = 1').run(new Date().toISOString());
    return entry;
  } finally { clearTimeout(timer); }
}

async function refresh(force = false) {
  if (MODE === 'unlimited') return null;
  if (!force && current && Date.now() - lastAttempt < CACHE_MS) return current;
  if (inflight) return inflight;
  lastAttempt = Date.now();
  inflight = (async () => {
    await null; // let `inflight` be assigned before the finally below clears it (file mode has no other await)
    try {
      if (MODE === 'file') {
        const raw = fs.readFileSync(FILE, 'utf8');
        current = { raw, licence: readLicence(raw), fetched_at: Date.now(), source: 'file' };
      } else if (MODE === 'email') {
        if (install().email) current = await fetchByEmail();
        else current = null;   // not registered yet: the trial applies
      } else {
        current = await fetchFromServer();
      }
    } catch (e) {
      console.error('Licence check failed:', e.message);
      if (MODE === 'email') {
        db.prepare('UPDATE licence_install SET last_error = ?, last_checked_at = ? WHERE id = 1').run(String(e.message).slice(0, 300), new Date().toISOString());
        if (e.definite) { current = null; try { fs.unlinkSync(CACHE_FILE); } catch (_) { /* none */ } }
        else if (!current) current = loadCache();
      } else if (!current) current = loadCache();
    } finally { inflight = null; }
    setCap.run(current?.licence?.max_students ? Number(current.licence.max_students) : null);
    return current;
  })();
  return inflight;
}

// What the school may do right now.
function state() {
  if (MODE === 'unlimited') return { mode: 'unlimited', issuer: ISSUER, readOnly: false, areas: null };
  const lic = current?.licence;
  if (!lic && MODE === 'email') {
    // No licence yet: a 30-day trial from the first start, then read-only until the school's email is licensed.
    const me = install();
    const d = new Date(`${me.first_start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + TRIAL_DAYS);
    const ends = d.toISOString().slice(0, 10), t = today();
    const over = ends < t;
    return {
      mode: MODE, status: over ? 'expired' : 'trial', trial: true, readOnly: over, expires_on: ends,
      days_left: Math.round((Date.parse(ends) - Date.parse(t)) / 86400000), areas: null, max_students: null,
      reason: over ? `The ${TRIAL_DAYS}-day free trial ended on ${ends}${me.email ? '' : '. Enter the school\'s registered email on the Licence page'}` : null,
      email: me.email || null, domain: me.domain || null, last_error: me.last_error || null, checked_at: me.last_checked_at || null,
    };
  }
  if (!lic) return { mode: MODE, status: 'unverified', readOnly: true, areas: null, reason: 'The licence could not be verified' };
  const stale = (MODE === 'server' || MODE === 'email') && Date.now() - current.fetched_at > GRACE_MS;
  const expires = lic.expires_on || null;
  const t = today();
  let status = lic.status || 'active';
  if ((status === 'active' || status === 'trial') && expires && expires < t) status = 'expired';
  if (stale && status !== 'suspended') status = 'unverified';
  const daysLeft = expires ? Math.round((Date.parse(expires) - Date.parse(t)) / 86400000) : null;
  const readOnly = !['active', 'trial'].includes(status);
  const reason = status === 'suspended' ? 'This school\'s licence is suspended'
    : status === 'expired' ? `The licence expired on ${expires}`
    : status === 'unverified' ? 'The licence server has not been reachable for over 7 days' : null;
  const areas = Array.isArray(lic.plan?.areas) ? lic.plan.areas : null;
  return {
    mode: MODE, status, readOnly, reason, expires_on: expires, days_left: daysLeft,
    school_name: lic.school_name || null, code: lic.code || null,
    plan: lic.plan ? { key: lic.plan.key || null, name: lic.plan.name || null } : null,
    areas, max_students: lic.max_students ?? null, checked_at: current?.fetched_at ? new Date(current.fetched_at).toISOString() : null,
    ...(MODE === 'email' ? { email: install().email || null, domain: lic.domain || install().domain || null, last_error: install().last_error || null } : {}),
  };
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Razorpay's webhook reports money already collected; refusing it while read-only would leave a paid fee unrecorded.
// It checks Razorpay's signature itself, so it stays open in every licence state.
const ALWAYS_OPEN = /^\/(health$|licence\/|auth\/|payments\/webhook$)/;
const STUDENT_CREATE = [/^POST \/students$/, /^POST \/stu\/admission$/];

async function guard(req, res, next) {
  if (MODE === 'unlimited') return next();
  const p = normPath(req.path); // already without the /api mount
  if (ALWAYS_OPEN.test(p) || req.method === 'OPTIONS') return next();
  // With a licence in hand the periodic re-check runs in the background, so a slow licence server never delays a page.
  if (current) refresh().catch(() => {});
  else { try { await refresh(); } catch (_) { /* state() handles a missing licence */ } }
  const s = state();
  if (s.areas) {
    const area = areaForPath(p);
    if (area && !s.areas.includes(area) && !isSelfService(req.method, p)) {
      const label = AREAS.find(a => a.key === area)?.label || area;
      return res.status(403).json({ error: `${label} is not included in your plan. Contact your ERP provider to upgrade.`, code: 'PLAN_AREA' });
    }
  }
  if (s.readOnly && WRITE.has(req.method)) {
    return res.status(402).json({ error: `${s.reason || 'Licence inactive'} — the ERP is read-only. Please renew the licence.`, code: 'LICENCE_READ_ONLY' });
  }
  if (s.max_students && STUDENT_CREATE.some(re => re.test(`${req.method} ${p}`)) && activeStudents() >= s.max_students) {
    return res.status(403).json({ error: `Your plan allows ${s.max_students} active students. Contact your ERP provider to upgrade.`, code: 'LICENCE_STUDENT_CAP' });
  }
  next();
}

function usage(req, res) {
  const given = String(req.headers['x-platform-key'] || '');
  const ok = KEY && given.length === KEY.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(KEY));
  if (!ok) return res.status(401).json({ error: 'Invalid platform key' });
  const one = (sql) => { try { return db.prepare(sql).get(); } catch { return null; } };
  res.json({
    students: activeStudents(),
    students_total: one('SELECT COUNT(*) AS c FROM students')?.c ?? 0,
    staff: one("SELECT COUNT(*) AS c FROM teachers WHERE COALESCE(status, 'active') = 'active'")?.c ?? 0,
    users: one('SELECT COUNT(*) AS c FROM users WHERE active = 1')?.c ?? 0,
    last_login_at: one('SELECT MAX(last_login_at) AS t FROM users')?.t ?? null,
    last_activity_at: one('SELECT MAX(created_at) AS t FROM audit_log')?.t ?? null,
    licence: state(),
  });
}

function registerRoot(app) {
  if (MODE !== 'unlimited') refresh().catch(() => {});
  app.get('/api/licence/usage', usage);
  app.get('/api/licence/status', authRequired, (req, res) => {
    const s = state();
    res.json({ ...s, students: s.mode === 'unlimited' ? undefined : activeStudents() });
  });
  // The school's Super Admin registers the email the licence was issued to (and the web address it runs at).
  app.post('/api/licence/register', authRequired, express.json(), async (req, res) => {
    if ((req.user.base_role || req.user.role) !== 'admin') return res.status(403).json({ error: 'Only the Super Admin can register the licence' });
    if (MODE !== 'email') return res.status(400).json({ error: 'This install does not use email licences' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter the registered email address' });
    const domain = normDomain(process.env.PUBLIC_URL || req.get('x-forwarded-host') || req.get('host'));
    db.prepare('UPDATE licence_install SET email = ?, domain = ?, last_error = NULL WHERE id = 1').run(email, domain);
    current = null;
    await refresh(true);
    const s = state();
    if (s.last_error) return res.status(400).json({ ...s, error: `Not activated: ${s.last_error}` });
    res.json(s);
  });
  app.post('/api/licence/check-now', authRequired, async (req, res) => {
    if ((req.user.base_role || req.user.role) !== 'admin') return res.status(403).json({ error: 'Only the Super Admin can do this' });
    await refresh(true);
    res.json(state());
  });
  // Lets the platform push a change (suspend / renew) without waiting for the cache to expire.
  app.post('/api/licence/refresh', async (req, res) => {
    const given = String(req.headers['x-platform-key'] || '');
    if (!KEY || given.length !== KEY.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(KEY))) {
      return res.status(401).json({ error: 'Invalid platform key' });
    }
    await refresh(true);
    res.json(state());
  });
  app.use('/api', guard);
}

function register() {}

module.exports = { register, registerRoot, state, refresh };
