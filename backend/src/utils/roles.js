// Storage for staff roles (see utils/permissions.js for what the levels mean).
const db = require('../config/db');
const { DEFAULT_ROLES, normalizePerms } = require('./permissions');

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_roles (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    perms TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);
try { db.exec('ALTER TABLE users ADD COLUMN role_key TEXT'); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }

const ins = db.prepare('INSERT OR IGNORE INTO staff_roles (key, name, perms, builtin, sort_order) VALUES (?, ?, ?, 1, ?)');
DEFAULT_ROLES.forEach((r, i) => ins.run(r.key, r.name, JSON.stringify(r.perms), i));
// Existing teacher logins become the Teacher role, which matches what teachers could already do.
db.prepare("UPDATE users SET role_key = 'teacher' WHERE role = 'teacher' AND role_key IS NULL").run();

let cache = null;
function all() {
  if (!cache) {
    cache = new Map(db.prepare('SELECT * FROM staff_roles ORDER BY sort_order, name').all()
      .map(r => [r.key, { key: r.key, name: r.name, builtin: !!r.builtin, sort_order: r.sort_order, perms: normalizePerms(JSON.parse(r.perms)) }]));
  }
  return cache;
}
const get = (key) => (key ? all().get(key) || null : null);
const invalidate = () => { cache = null; };

module.exports = { all, get, invalidate };
