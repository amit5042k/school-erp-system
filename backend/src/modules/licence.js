/**
 * Licence enforcement for multi-school (platform) installs.
 *
 * Config (backend/.env of each school), any one of:
 *   LICENSE_SERVER_URL + LICENSE_KEY  – fetch the licence from the platform console (cached 10 min, last good copy
 *                                       kept on disk; a platform outage never locks a school out for up to 7 days)
 *   LICENSE_FILE                      – a licence JSON/JWT file for single-school installs
 *   (neither)                         – unlimited: the existing single-school behaviour
 * LICENSE_PUBLIC_KEY_FILE / LICENSE_PUBLIC_KEY – the platform's RSA public key; when set, licences must be signed.
 *
 * Effects: expired / suspended / unverified → read-only (writes get 402); areas outside the plan → 403;
 * creating students beyond the plan's cap → 403.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { areaForPath, isSelfService, AREAS } = require('../utils/permissions');
const { today } = require('../utils/http');

const SERVER_URL = (process.env.LICENSE_SERVER_URL || '').replace(/\/+$/, '');
const KEY = process.env.LICENSE_KEY || '';
const FILE = process.env.LICENSE_FILE || '';
const MODE = SERVER_URL && KEY ? 'server' : FILE ? 'file' : 'unlimited';
const CACHE_MS = 10 * 60 * 1000;
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_FILE = process.env.LICENSE_CACHE_FILE
  || path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'school.sqlite')), 'licence-cache.json');

let publicKey = process.env.LICENSE_PUBLIC_KEY || '';
if (!publicKey && process.env.LICENSE_PUBLIC_KEY_FILE) {
  try { publicKey = fs.readFileSync(process.env.LICENSE_PUBLIC_KEY_FILE, 'utf8'); }
  catch (e) { console.error('Licence: cannot read LICENSE_PUBLIC_KEY_FILE:', e.message); }
}

// Student cap enforced in the database too, so no code path can go past it.
db.exec(`
  CREATE TABLE IF NOT EXISTS licence_limits (id INTEGER PRIMARY KEY CHECK (id = 1), max_students INTEGER);
  INSERT OR IGNORE INTO licence_limits (id, max_students) VALUES (1, NULL);
  CREATE TRIGGER IF NOT EXISTS trg_licence_student_cap BEFORE INSERT ON students
  WHEN (SELECT max_students FROM licence_limits WHERE id = 1) IS NOT NULL
   AND (SELECT COUNT(*) FROM students WHERE COALESCE(status, 'active') = 'active') >= (SELECT max_students FROM licence_limits WHERE id = 1)
  BEGIN SELECT RAISE(ABORT, 'LICENCE_STUDENT_CAP'); END;
`);
const setCap = db.prepare('UPDATE licence_limits SET max_students = ? WHERE id = 1');
const activeStudents = () => db.prepare("SELECT COUNT(*) AS c FROM students WHERE COALESCE(status, 'active') = 'active'").get().c;

// Accepts a signed JWT string or a plain licence object; returns the licence payload or throws.
function readLicence(raw) {
  const text = typeof raw === 'string' ? raw.trim() : null;
  const looksJwt = text && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(text);
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

async function refresh(force = false) {
  if (MODE === 'unlimited') return null;
  if (!force && current && Date.now() - lastAttempt < CACHE_MS) return current;
  if (inflight) return inflight;
  lastAttempt = Date.now();
  inflight = (async () => {
    try {
      if (MODE === 'file') {
        const raw = fs.readFileSync(FILE, 'utf8');
        current = { raw, licence: readLicence(raw), fetched_at: Date.now(), source: 'file' };
      } else {
        current = await fetchFromServer();
      }
    } catch (e) {
      console.error('Licence check failed:', e.message);
      if (!current) current = loadCache();
    } finally { inflight = null; }
    setCap.run(current?.licence?.max_students ? Number(current.licence.max_students) : null);
    return current;
  })();
  return inflight;
}

// What the school may do right now.
function state() {
  if (MODE === 'unlimited') return { mode: 'unlimited', readOnly: false, areas: null };
  const lic = current?.licence;
  if (!lic) return { mode: MODE, status: 'unverified', readOnly: true, areas: null, reason: 'The licence could not be verified' };
  const stale = MODE === 'server' && Date.now() - current.fetched_at > GRACE_MS;
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
  };
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Razorpay's webhook reports money already collected; refusing it while read-only would leave a paid fee unrecorded.
// It checks Razorpay's signature itself, so it stays open in every licence state.
const ALWAYS_OPEN = /^\/(health$|licence\/|auth\/|payments\/webhook$)/;
const STUDENT_CREATE = [/^POST \/students$/, /^POST \/stu\/admission$/];

async function guard(req, res, next) {
  if (MODE === 'unlimited') return next();
  const p = req.path; // already without the /api mount
  if (ALWAYS_OPEN.test(p) || req.method === 'OPTIONS') return next();
  try { await refresh(); } catch (_) { /* state() handles a missing licence */ }
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
