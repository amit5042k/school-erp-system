const db = require('../config/db');
const { dbError } = require('./http');

/**
 * Simple CRUD controller for a table. Only whitelisted fields are written; PK is `id`.
 * `validate(data, req, existing)` may return an error string to reject a create/update.
 */
function makeCrud({ table, fields, orderBy = 'id DESC', joins = '', selectExtra = '*', validate }) {
  const pick = (body) => {
    const data = {};
    for (const f of fields) if (body && f in body) data[f] = body[f] === '' ? null : body[f];
    return data;
  };
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
      const data = pick(req.body);
      if (!Object.keys(data).length) return res.status(400).json({ error: 'No fields provided' });
      const problem = validate && validate(data, req, null);
      if (problem) return res.status(400).json({ error: problem });
      const cols = Object.keys(data);
      try {
        const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
          .run(...cols.map(c => data[c]));
        res.status(201).json({ id: info.lastInsertRowid });
      } catch (e) { dbError(res, e); }
    },
    update(req, res) {
      const data = pick(req.body);
      const cols = Object.keys(data);
      if (!cols.length) return res.status(400).json({ error: 'No fields provided' });
      const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const problem = validate && validate({ ...existing, ...data }, req, existing);
      if (problem) return res.status(400).json({ error: problem });
      try {
        db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
          .run(...cols.map(c => data[c]), req.params.id);
        res.json({ ok: true });
      } catch (e) { dbError(res, e); }
    },
    remove(req, res) {
      try {
        const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
        if (!info.changes) return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true });
      } catch (e) { dbError(res, e); }
    },
  };
}

module.exports = { makeCrud };
