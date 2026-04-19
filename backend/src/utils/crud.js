const db = require('../config/db');

/**
 * Build a simple CRUD controller for a given table.
 * Allowed fields are whitelisted. PK is always `id`.
 */
function makeCrud({ table, fields, orderBy = 'id DESC', joins = '', selectExtra = '*' }) {
  return {
    list(req, res) {
      const rows = db.prepare(`SELECT ${selectExtra} FROM ${table} ${joins} ORDER BY ${orderBy}`).all();
      res.json(rows);
    },
    get(req, res) {
      const row = db.prepare(`SELECT ${selectExtra} FROM ${table} ${joins} WHERE ${table}.id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    },
    create(req, res) {
      const cols = [], vals = [], placeholders = [];
      for (const f of fields) if (f in req.body) { cols.push(f); vals.push(req.body[f]); placeholders.push('?'); }
      if (!cols.length) return res.status(400).json({ error: 'No fields provided' });
      try {
        const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`).run(...vals);
        res.status(201).json({ id: info.lastInsertRowid });
      } catch (e) { res.status(400).json({ error: e.message }); }
    },
    update(req, res) {
      const sets = [], vals = [];
      for (const f of fields) if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
      if (!sets.length) return res.status(400).json({ error: 'No fields provided' });
      vals.push(req.params.id);
      try {
        const info = db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        if (!info.changes) return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true });
      } catch (e) { res.status(400).json({ error: e.message }); }
    },
    remove(req, res) {
      const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
      if (!info.changes) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    },
  };
}

module.exports = { makeCrud };
