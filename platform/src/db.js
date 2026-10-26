const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { cfg } = require('./config');

fs.mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
const db = new Database(path.join(cfg.dataDir, 'platform.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price_per_year REAL NOT NULL DEFAULT 0,
    max_students INTEGER,
    areas TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','expired','archived')),
    starts_on TEXT NOT NULL,
    expires_on TEXT NOT NULL,
    max_students INTEGER,
    port INTEGER UNIQUE NOT NULL,
    licence_key TEXT NOT NULL,
    licence_key_hash TEXT UNIQUE NOT NULL,
    contact_name TEXT, contact_phone TEXT, contact_email TEXT, notes TEXT,
    archive_path TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TEXT
  );
  CREATE TABLE IF NOT EXISTS renewals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id),
    paid_on TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    months INTEGER NOT NULL DEFAULT 0,
    old_expires_on TEXT,
    new_expires_on TEXT,
    mode TEXT, reference TEXT, note TEXT,
    owner_id INTEGER REFERENCES owners(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER REFERENCES schools(id),
    owner_id INTEGER REFERENCES owners(id),
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Starting plans; set your own names, prices and limits on the Plans page.
const ALL_AREAS = ['students', 'attendance', 'academics', 'academic-comm', 'communication', 'finance', 'accounts', 'payroll', 'hr',
  'library', 'transport', 'hostel', 'inventory', 'front-office', 'administration'];
if (!db.prepare('SELECT COUNT(*) AS c FROM plans').get().c) {
  const ins = db.prepare('INSERT INTO plans (key, name, price_per_year, max_students, areas) VALUES (?, ?, ?, ?, ?)');
  const basic = ['students', 'attendance', 'academics', 'academic-comm', 'communication', 'finance', 'front-office', 'administration'];
  ins.run('basic', 'Basic', 0, 500, JSON.stringify(basic));
  ins.run('standard', 'Standard', 0, 1500, JSON.stringify([...basic, 'accounts', 'hr', 'payroll', 'library', 'transport']));
  ins.run('premium', 'Premium', 0, null, JSON.stringify(ALL_AREAS));
}

const log = (action, { schoolId = null, ownerId = null, detail = null } = {}) =>
  db.prepare('INSERT INTO events (school_id, owner_id, action, detail) VALUES (?, ?, ?, ?)')
    .run(schoolId, ownerId, action, detail ? String(detail).slice(0, 1000) : null);

module.exports = { db, log, ALL_AREAS };
