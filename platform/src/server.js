// School ERP platform console: the owner manages schools, plans, licences, renewals and server config here.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { cfg, check } = require('./config');

const problems = check();
if (problems.length) {
  console.error('Platform config problems:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const { db, log } = require('./db');
const { sign, effectiveStatus, sha256, localToday } = require('./licence');
const prov = require('./provision');
const gen = require('./generate');
const system = require('./system');

let AREAS = [];
try { AREAS = require(path.join(cfg.backendDir, 'src', 'utils', 'permissions.js')).AREAS; }
catch { AREAS = require('./db').ALL_AREAS.map(k => ({ key: k, label: k })); }

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '200kb' }));

/* ---------- Licence endpoint used by school backends ---------- */
app.get('/api/public/licence', rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!/^[a-f0-9]{64}$/.test(key)) return res.status(401).json({ error: 'Invalid licence key' });
  const s = db.prepare("SELECT * FROM schools WHERE licence_key_hash = ? AND status != 'archived'").get(sha256(key));
  if (!s) return res.status(404).json({ error: 'Unknown licence key' });
  res.json({ token: sign(s) });
});

/* ---------- Owner auth ---------- */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase().slice(0, 100)}`,
});
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const o = db.prepare('SELECT * FROM owners WHERE email = ? AND active = 1').get(email);
  const ok = bcrypt.compareSync(password, o ? o.password_hash : DUMMY) && !!o;
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  db.prepare('UPDATE owners SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(o.id);
  log('owner.login', { ownerId: o.id });
  res.json({ token: jwt.sign({ id: o.id }, cfg.jwtSecret, { expiresIn: '12h' }), owner: { name: o.name, email: o.email } });
});

function owner(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const { id } = jwt.verify(token, cfg.jwtSecret);
    const o = db.prepare('SELECT id, name, email FROM owners WHERE id = ? AND active = 1').get(id);
    if (!o) throw new Error('inactive');
    req.owner = o;
    next();
  } catch { res.status(401).json({ error: 'Please sign in again' }); }
}
const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: 'That value is already used' });
    next(e);
  }
};

/* ---------- Talking to school backends ---------- */
async function schoolCall(s, method, urlPath) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`http://${cfg.schoolHost}:${s.port}${urlPath}`, { method, headers: { 'X-Platform-Key': s.licence_key }, signal: ctrl.signal });
    return r.ok ? await r.json() : { error: `HTTP ${r.status}` };
  } catch (e) { return { error: e.name === 'AbortError' ? 'not responding' : 'offline' }; }
  finally { clearTimeout(timer); }
}
// Ask the school to re-read its licence now instead of within 10 minutes (best effort).
const pushLicence = (s) => schoolCall(s, 'POST', '/api/licence/refresh').catch(() => {});

const withPlan = (s) => {
  const p = db.prepare('SELECT name, price_per_year, max_students FROM plans WHERE id = ?').get(s.plan_id);
  return { ...prov.publicSchool(s), effective_status: effectiveStatus(s), plan_name: p?.name, plan_price: p?.price_per_year ?? 0,
    student_limit: s.max_students ?? p?.max_students ?? null, url: `${cfg.sslMode === 'none' ? 'http' : 'https'}://${s.subdomain}.${cfg.baseDomain}` };
};

/* ---------- Owner API ---------- */
app.get('/api/me', owner, (req, res) => res.json(req.owner));
app.get('/api/areas', owner, (req, res) => res.json(AREAS));

app.get('/api/dashboard', owner, wrap(async (req, res) => {
  const schools = db.prepare("SELECT * FROM schools WHERE status != 'archived' ORDER BY name").all();
  const usage = await Promise.all(schools.map(s => schoolCall(s, 'GET', '/api/licence/usage')));
  const t = localToday();
  const soon = new Date(`${t}T12:00:00`); soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  const rows = schools.map((s, i) => ({ ...withPlan(s), usage: usage[i] }));
  const fyStart = `${Number(t.slice(5, 7)) >= 4 ? t.slice(0, 4) : Number(t.slice(0, 4)) - 1}-04-01`;
  const counts = {};
  for (const r of rows) counts[r.effective_status] = (counts[r.effective_status] || 0) + 1;
  res.json({
    counts, total: rows.length,
    expiring_soon: rows.filter(r => ['active', 'trial'].includes(r.effective_status) && r.expires_on <= soonStr),
    students: rows.reduce((a, r) => a + (r.usage?.students || 0), 0),
    annual_recurring: rows.filter(r => r.effective_status === 'active').reduce((a, r) => a + (r.plan_price || 0), 0),
    revenue_this_fy: db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM renewals WHERE paid_on >= ?').get(fyStart).s,
    revenue_12m: db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM renewals WHERE paid_on >= date('now', '-12 months')").get().s,
    fy_start: fyStart, schools: rows,
  });
}));

app.get('/api/schools', owner, (req, res) => {
  const all = req.query.archived === '1';
  res.json(db.prepare(`SELECT * FROM schools ${all ? '' : "WHERE status != 'archived'"} ORDER BY name`).all().map(withPlan));
});
app.get('/api/schools/:id', owner, wrap(async (req, res) => {
  const s = prov.getSchool(req.params.id);
  res.json({
    ...withPlan(s),
    usage: s.status === 'archived' ? null : await schoolCall(s, 'GET', '/api/licence/usage'),
    renewals: db.prepare('SELECT * FROM renewals WHERE school_id = ? ORDER BY paid_on DESC, id DESC').all(s.id),
    events: db.prepare('SELECT e.*, o.name AS owner_name FROM events e LEFT JOIN owners o ON o.id = e.owner_id WHERE school_id = ? ORDER BY id DESC LIMIT 50').all(s.id),
  });
}));
app.post('/api/schools', owner, wrap(async (req, res) => {
  const out = await prov.createSchool(req.body || {}, req.owner.id);
  res.status(201).json(out);
}));
app.put('/api/schools/:id', owner, wrap(async (req, res) => {
  const s = prov.updateSchool(req.params.id, req.body || {}, req.owner.id);
  pushLicence(prov.getSchool(s.id));
  res.json(withPlan(prov.getSchool(s.id)));
}));
for (const [action, status] of [['suspend', 'suspended'], ['resume', 'active']]) {
  app.post(`/api/schools/:id/${action}`, owner, wrap(async (req, res) => {
    const s = prov.setStatus(req.params.id, status, req.owner.id);
    pushLicence(prov.getSchool(s.id));
    res.json(withPlan(prov.getSchool(s.id)));
  }));
}
app.post('/api/schools/:id/renew', owner, wrap(async (req, res) => {
  const s = prov.renew(req.params.id, req.body || {}, req.owner.id);
  pushLicence(prov.getSchool(s.id));
  res.json(withPlan(prov.getSchool(s.id)));
}));
// Licence file for a school running on its own server (LICENSE_FILE mode).
app.get('/api/schools/:id/licence-file', owner, wrap(async (req, res) => {
  const s = prov.getSchool(req.params.id);
  res.setHeader('Content-Disposition', `attachment; filename="licence-${s.code}.jwt"`);
  res.type('text/plain').send(sign(s, { forFile: true }));
}));
app.delete('/api/schools/:id', owner, wrap(async (req, res) => {
  const s = prov.getSchool(req.params.id);
  if (s.status === 'archived') return res.status(400).json({ error: 'Already archived' });
  if (String(req.body?.confirm_code || '') !== s.code) return res.status(400).json({ error: `Type the school code (${s.code}) to confirm` });
  const stop = await system.stopSchool(s.code);
  const out = prov.archive(s.id, String(req.body?.confirm_code || ''), req.owner.id);
  res.json({ ...out, stop });
}));

/* ---------- Plans ---------- */
function planBody(b, creating) {
  const out = {};
  if (creating || 'name' in b) { out.name = String(b.name || '').trim(); if (!out.name) throw prov.httpError(400, 'Plan name is required'); }
  if (creating) {
    out.key = String(b.key || out.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    if (!out.key) throw prov.httpError(400, 'Plan name must contain letters or digits');
  }
  if (creating || 'price_per_year' in b) {
    out.price_per_year = Number(b.price_per_year || 0);
    if (!(out.price_per_year >= 0)) throw prov.httpError(400, 'Price must be 0 or more');
  }
  if ('max_students' in b) {
    out.max_students = b.max_students === '' || b.max_students == null ? null : Number(b.max_students);
    if (out.max_students !== null && !(Number.isInteger(out.max_students) && out.max_students > 0)) throw prov.httpError(400, 'Student limit must be a whole number or blank');
  }
  if (creating || 'areas' in b) {
    const keys = new Set(AREAS.map(a => a.key));
    const areas = Array.isArray(b.areas) ? [...new Set(b.areas)].filter(a => keys.has(a)) : [];
    if (!areas.length) throw prov.httpError(400, 'Choose at least one area');
    out.areas = JSON.stringify(areas);
  }
  if ('active' in b) out.active = b.active ? 1 : 0;
  return out;
}
app.get('/api/plans', owner, (req, res) => {
  res.json(db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM schools s WHERE s.plan_id = p.id AND s.status != 'archived') AS schools FROM plans p ORDER BY price_per_year, id`)
    .all().map(p => ({ ...p, areas: JSON.parse(p.areas) })));
});
app.post('/api/plans', owner, wrap(async (req, res) => {
  const b = planBody(req.body || {}, true);
  const info = db.prepare('INSERT INTO plans (key, name, price_per_year, max_students, areas) VALUES (?, ?, ?, ?, ?)')
    .run(b.key, b.name, b.price_per_year, b.max_students ?? null, b.areas);
  log('plan.create', { ownerId: req.owner.id, detail: b.name });
  res.status(201).json({ id: info.lastInsertRowid });
}));
app.put('/api/plans/:id', owner, wrap(async (req, res) => {
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Plan not found' });
  const b = planBody(req.body || {}, false);
  const keys = Object.keys(b);
  if (!keys.length) return res.status(400).json({ error: 'Nothing to change' });
  db.prepare(`UPDATE plans SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => b[k]), p.id);
  log('plan.update', { ownerId: req.owner.id, detail: `${p.name}: ${keys.join(', ')}` });
  for (const s of db.prepare("SELECT * FROM schools WHERE plan_id = ? AND status != 'archived'").all(p.id)) pushLicence(s);
  res.json({ ok: true });
}));

/* ---------- Renewals & activity ---------- */
app.get('/api/renewals', owner, (req, res) => {
  res.json(db.prepare(`SELECT r.*, s.name AS school_name, s.code, o.name AS owner_name FROM renewals r
    JOIN schools s ON s.id = r.school_id LEFT JOIN owners o ON o.id = r.owner_id ORDER BY r.paid_on DESC, r.id DESC LIMIT 500`).all());
});
app.get('/api/events', owner, (req, res) => {
  res.json(db.prepare(`SELECT e.*, s.name AS school_name, o.name AS owner_name FROM events e
    LEFT JOIN schools s ON s.id = e.school_id LEFT JOIN owners o ON o.id = e.owner_id ORDER BY e.id DESC LIMIT 300`).all());
});

/* ---------- Server config ---------- */
app.get('/api/system', owner, wrap(async (req, res) => {
  res.json({
    apply_enabled: cfg.applyEnabled, ssl_mode: cfg.sslMode, base_domain: cfg.baseDomain, console_host: cfg.consoleHost,
    ecosystem_path: cfg.ecosystemPath, nginx_conf_path: cfg.nginxConfPath, commands: system.planned(),
    nginx: gen.nginx(), ecosystem: gen.ecosystem({ mask: true }),
  });
}));
app.post('/api/system/apply', owner, wrap(async (req, res) => {
  const files = gen.writeAll();
  const result = await system.applyAll();
  log('system.apply', { ownerId: req.owner.id, detail: result.dryRun ? 'dry run' : result.steps.map(s => `${s.command}: ${s.ok ? 'ok' : 'FAILED'}`).join('; ') });
  res.json({ files, ...result });
}));

app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '1h' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`Platform console on http://localhost:${cfg.port} (${cfg.applyEnabled ? 'apply ENABLED' : 'dry-run'})`));
}

module.exports = app;
