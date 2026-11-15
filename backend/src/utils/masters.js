/**
 * Master lists: simple named lookups (subjects, departments, leave types, purposes to meet ...).
 * All live in one `masters` table keyed by `type`; extra per-type fields are stored as JSON in `data`
 * and returned flattened. Modules call registerMaster({ type, title, group, fields, read, write }).
 *   fields: extra fields beyond name/code, [{ name, label, type?: 'text'|'number'|'select'|'date'|'textarea', options? }]
 */
const db = require('../config/db');

db.exec(`
  CREATE TABLE IF NOT EXISTS masters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    data TEXT,
    UNIQUE(type, name)
  );
`);

const types = new Map();

db.exec('CREATE TABLE IF NOT EXISTS master_seeded (type TEXT PRIMARY KEY)');

function registerMaster(def) {
  if (!def || !/^[a-z0-9-]+$/.test(def.type) || !def.title) throw new Error(`Invalid master type: ${def && def.type}`);
  if (types.has(def.type)) throw new Error(`Duplicate master type: ${def.type}`);
  types.set(def.type, { group: 'General', fields: [], read: ['admin', 'teacher'], write: ['admin'], seed: [], ...def });
  // Seed defaults the first time a type is used, so dropdowns aren't empty on a new install.
  const def2 = types.get(def.type);
  if (def2.seed.length) {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM masters WHERE type = ?').get(def.type);
    // Only ever once per list: if the school later empties a list on purpose, an update must not refill it.
    const done = db.prepare('SELECT 1 FROM master_seeded WHERE type = ?').get(def.type);
    db.prepare('INSERT OR IGNORE INTO master_seeded (type) VALUES (?)').run(def.type);
    if (!c && !done) {
      const ins = db.prepare('INSERT OR IGNORE INTO masters (type, name, code, sort_order, data) VALUES (?, ?, ?, ?, ?)');
      def2.seed.forEach((s, i) => {
        const item = typeof s === 'string' ? { name: s } : s;
        const { name, code, ...rest } = item;
        ins.run(def.type, name, code || null, i, Object.keys(rest).length ? JSON.stringify(rest) : null);
      });
    }
  }
}

const flatten = (row) => {
  if (!row) return row;
  const { data, ...rest } = row;
  let extra = {};
  try { extra = data ? JSON.parse(data) : {}; } catch { extra = {}; }
  return { ...extra, ...rest };
};

// Active names of a type, for modules that validate against a master list.
function masterNames(type) {
  return db.prepare('SELECT name FROM masters WHERE type = ? AND active = 1 ORDER BY sort_order, name').all(type).map(r => r.name);
}

module.exports = { registerMaster, types, flatten, masterNames };
