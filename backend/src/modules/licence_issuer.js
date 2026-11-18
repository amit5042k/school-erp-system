/**
 * The ERP provider's licence server (only when LICENSE_ISSUER=true, e.g. on the provider's own install).
 *
 * The provider adds a licence per school on the Licences page: registered email, school name, web address,
 * plan (modules), student limit, expiry and status. Each school's install calls POST /api/public/licence/check with
 * its registered email every 10 minutes and gets back a signed licence (RS256). The signing key is created once and
 * kept in this database, so it travels with every backup; losing it would make every school's licence unverifiable.
 */
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { db, auth, safe, isDate, num } = require('./_kit');
const { AREAS } = require('../utils/permissions');

const ISSUER = process.env.LICENSE_ISSUER === 'true';
const AREA_KEYS = AREAS.map(a => a.key);
const err = (status, message) => Object.assign(new Error(message), { status });
const normDomain = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/^www\./, '');
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

if (ISSUER) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lic_keys (id INTEGER PRIMARY KEY CHECK (id = 1), private_key TEXT NOT NULL, public_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS lic_licences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      school_name TEXT NOT NULL,
      domain TEXT,
      plan_name TEXT,
      areas TEXT,                         -- JSON list of area keys; NULL = every module
      max_students INTEGER,               -- NULL = no limit
      expires_on TEXT,                    -- NULL = no expiry
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'suspended')),
      contact_name TEXT, contact_phone TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_lic_licences_email ON lic_licences(lower(email));
    CREATE TABLE IF NOT EXISTS lic_installs (
      install_id TEXT PRIMARY KEY,
      licence_id INTEGER REFERENCES lic_licences(id) ON DELETE CASCADE,
      email TEXT, domain TEXT, ip TEXT, students INTEGER, result TEXT,
      first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  if (!db.prepare('SELECT 1 FROM lic_keys WHERE id = 1').get()) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    db.prepare('INSERT INTO lic_keys (id, private_key, public_key) VALUES (1, ?, ?)').run(privateKey, publicKey);
    console.log('Licence server: created the licence signing key (kept in the database; included in backups).');
  }
}
const keys = () => db.prepare('SELECT private_key, public_key FROM lic_keys WHERE id = 1').get();

/* ---------- Public: a school's install asks for its licence ---------- */
const hits = new Map();   // ip → [timestamps], a simple limit against email guessing
function tooMany(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 10000) hits.clear();
  return list.length > 120;
}

function check(req, res) {
  if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many licence checks; try again later' });
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const domain = normDomain(b.domain);
  const installId = String(b.install_id || '').slice(0, 64);
  if (!isEmail(email)) return res.status(400).json({ error: 'A registered email is required' });
  const lic = db.prepare('SELECT * FROM lic_licences WHERE lower(email) = ?').get(email);
  const seen = (licenceId, result) => {
    if (!installId) return;
    db.prepare(`INSERT INTO lic_installs (install_id, licence_id, email, domain, ip, students, result) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(install_id) DO UPDATE SET licence_id = excluded.licence_id, email = excluded.email, domain = excluded.domain,
        ip = excluded.ip, students = excluded.students, result = excluded.result, last_seen = CURRENT_TIMESTAMP`)
      .run(installId, licenceId, email, domain || null, req.ip, Number.isInteger(b.students) ? b.students : null, result);
  };
  if (!lic) { seen(null, 'no licence'); return res.status(404).json({ error: `No licence is registered for ${email}. Contact your ERP provider.` }); }
  if (lic.domain && domain && normDomain(lic.domain) !== domain) {
    seen(lic.id, `wrong address ${domain}`);
    return res.status(403).json({ error: `This licence is for ${lic.domain}, not ${domain}` });
  }
  seen(lic.id, lic.status);
  const areas = lic.areas ? JSON.parse(lic.areas) : null;
  const payload = {
    email: lic.email, school_name: lic.school_name, domain: lic.domain || null, code: `L${lic.id}`,
    status: lic.status, expires_on: lic.expires_on || null, max_students: lic.max_students ?? null,
    plan: { key: lic.plan_name ? lic.plan_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null, name: lic.plan_name || null, areas },
  };
  const token = jwt.sign(payload, keys().private_key, { algorithm: 'RS256', expiresIn: '30d' });
  res.json({ token, public_key: keys().public_key });
}

/* ---------- The provider's Licences page ---------- */
// Only the provider's own Super Admin, never a staff role.
const superAdmin = (req, res, next) => ((req.user.base_role || req.user.role) === 'admin' ? next() : res.status(403).json({ error: 'Only the Super Admin can manage licences' }));

function clean(b, cur = {}) {
  const v = { ...cur, ...b };
  const email = String(v.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw err(400, 'Enter the school\'s registered email');
  const school = String(v.school_name || '').trim();
  if (!school) throw err(400, 'Enter the school name');
  const domain = v.domain ? normDomain(v.domain) : null;
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw err(400, 'Web address should look like erp.yourschool.in');
  let areas = v.areas;
  if (typeof areas === 'string') { try { areas = JSON.parse(areas); } catch { areas = null; } }
  if (areas != null) {
    if (!Array.isArray(areas) || areas.some(a => !AREA_KEYS.includes(a))) throw err(400, 'Unknown module in the plan');
    if (!areas.includes('administration')) areas = [...areas, 'administration'];   // the school must always reach Settings
    if (areas.length >= AREA_KEYS.length) areas = null;
  }
  const max = v.max_students === '' || v.max_students == null ? null : num(v.max_students);
  if (max != null && !(Number.isInteger(max) && max > 0)) throw err(400, 'Maximum students must be a whole number (or blank for no limit)');
  const expires = v.expires_on || null;
  if (expires && !isDate(expires)) throw err(400, 'Expiry must be a date (or blank for no expiry)');
  if (!['active', 'trial', 'suspended'].includes(v.status || 'active')) throw err(400, 'Status must be active, trial or suspended');
  const text = (x, n) => (x == null || x === '' ? null : String(x).trim().slice(0, n));
  return {
    email, school_name: school.slice(0, 200), domain, plan_name: text(v.plan_name, 60), areas: areas ? JSON.stringify(areas) : null,
    max_students: max, expires_on: expires, status: v.status || 'active',
    contact_name: text(v.contact_name, 100), contact_phone: text(v.contact_phone, 30), notes: text(v.notes, 1000),
  };
}
const FIELDS = ['email', 'school_name', 'domain', 'plan_name', 'areas', 'max_students', 'expires_on', 'status', 'contact_name', 'contact_phone', 'notes'];

const h = {
  list(req, res) {
    res.json({
      areas: AREAS,
      rows: db.prepare(`SELECT l.*, (SELECT COUNT(*) FROM lic_installs i WHERE i.licence_id = l.id) AS installs,
          (SELECT MAX(last_seen) FROM lic_installs i WHERE i.licence_id = l.id) AS last_seen,
          (SELECT students FROM lic_installs i WHERE i.licence_id = l.id ORDER BY last_seen DESC LIMIT 1) AS students,
          (SELECT GROUP_CONCAT(DISTINCT domain) FROM lic_installs i WHERE i.licence_id = l.id) AS seen_at
        FROM lic_licences l ORDER BY l.school_name`).all().map(r => ({ ...r, areas: r.areas ? JSON.parse(r.areas) : null })),
    });
  },
  create(req, res) {
    const d = clean(req.body);
    if (db.prepare('SELECT 1 FROM lic_licences WHERE lower(email) = ?').get(d.email)) throw err(409, `${d.email} already has a licence`);
    const info = db.prepare(`INSERT INTO lic_licences (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`).run(...FIELDS.map(f => d[f]));
    res.status(201).json({ id: info.lastInsertRowid });
  },
  update(req, res) {
    const cur = db.prepare('SELECT * FROM lic_licences WHERE id = ?').get(req.params.id);
    if (!cur) throw err(404, 'Licence not found');
    const d = clean(req.body, { ...cur, areas: cur.areas ? JSON.parse(cur.areas) : null });
    if (db.prepare('SELECT 1 FROM lic_licences WHERE lower(email) = ? AND id != ?').get(d.email, cur.id)) throw err(409, `${d.email} already has a licence`);
    db.prepare(`UPDATE lic_licences SET ${FIELDS.map(f => `${f} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...FIELDS.map(f => d[f]), cur.id);
    res.json({ ok: true });
  },
  remove(req, res) {
    const cur = db.prepare('SELECT * FROM lic_licences WHERE id = ?').get(req.params.id);
    if (!cur) throw err(404, 'Licence not found');
    if (db.prepare('SELECT 1 FROM lic_installs WHERE licence_id = ?').get(cur.id)) throw err(409, 'This licence is in use; suspend it instead of deleting it');
    db.prepare('DELETE FROM lic_licences WHERE id = ?').run(cur.id);
    res.json({ ok: true });
  },
  installs(req, res) {
    res.json(db.prepare('SELECT * FROM lic_installs WHERE licence_id = ? OR (? = 0 AND licence_id IS NULL) ORDER BY last_seen DESC LIMIT 200')
      .all(Number(req.params.id) || null, Number(req.params.id) || 0));
  },
};

function registerRoot(app) {
  if (!ISSUER) return;
  app.post('/api/public/licence/check', express.json({ limit: '10kb' }), check);
}

function register(router) {
  if (!ISSUER) return;
  const A = [auth, superAdmin];
  router.get('/licences', ...A, safe(h.list));
  router.post('/licences', ...A, safe(h.create));
  router.put('/licences/:id', ...A, safe(h.update));
  router.delete('/licences/:id', ...A, safe(h.remove));
  router.get('/licences/:id/installs', ...A, safe(h.installs));
}

module.exports = { register, registerRoot };
