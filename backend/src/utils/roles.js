// Storage for staff roles (see utils/permissions.js for what the levels mean).
const db = require('../config/db');
const { DEFAULT_ROLES, AREA_KEYS, normalizePerms, normalizeActions } = require('./permissions');

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_roles (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    perms TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);
// Action switches per area (utils/permissions.js ACTIONS); NULL means everything on.
try { db.exec('ALTER TABLE staff_roles ADD COLUMN actions TEXT'); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
try { db.exec('ALTER TABLE users ADD COLUMN role_key TEXT'); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }

const ins = db.prepare('INSERT OR IGNORE INTO staff_roles (key, name, perms, builtin, sort_order) VALUES (?, ?, ?, 1, ?)');
DEFAULT_ROLES.forEach((r, i) => ins.run(r.key, r.name, JSON.stringify(r.perms), i));
// Areas added in later versions: built-in roles take the default level, custom roles start with none.
for (const r of db.prepare('SELECT key, perms FROM staff_roles').all()) {
  const perms = JSON.parse(r.perms);
  const missing = AREA_KEYS.filter(k => !(k in perms));
  if (!missing.length) continue;
  const def = DEFAULT_ROLES.find(d => d.key === r.key)?.perms || {};
  for (const k of missing) perms[k] = def[k] || 'none';
  db.prepare('UPDATE staff_roles SET perms = ? WHERE key = ?').run(JSON.stringify(perms), r.key);
}
// Existing teacher logins become the Teacher role, which matches what teachers could already do.
db.prepare("UPDATE users SET role_key = 'teacher' WHERE role = 'teacher' AND role_key IS NULL").run();

let cache = null;
function all() {
  if (!cache) {
    cache = new Map(db.prepare('SELECT * FROM staff_roles ORDER BY sort_order, name').all()
      .map(r => [r.key, { key: r.key, name: r.name, builtin: !!r.builtin, sort_order: r.sort_order, perms: normalizePerms(JSON.parse(r.perms)),
        actions: normalizeActions(r.actions ? JSON.parse(r.actions) : {}) }]));
  }
  return cache;
}
const get = (key) => (key ? all().get(key) || null : null);
const invalidate = () => { cache = null; };

module.exports = { all, get, invalidate };
