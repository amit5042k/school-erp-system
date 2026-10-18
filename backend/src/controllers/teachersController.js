const db = require('../config/db');
const { dbError, badUrl } = require('../utils/http');

const FIELDS = ['employee_no', 'full_name', 'subject', 'qualification', 'phone', 'email', 'department', 'photo_url'];

exports.list = (req, res) => {
  res.json(db.prepare('SELECT * FROM teachers ORDER BY full_name').all());
};

exports.get = (req, res) => {
  const row = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
};

exports.create = (req, res) => {
  const { employee_no, full_name } = req.body;
  if (!employee_no || !full_name) return res.status(400).json({ error: 'employee_no and full_name are required' });
  if (badUrl(req.body.photo_url)) return res.status(400).json({ error: badUrl(req.body.photo_url, 'photo_url') });
  try {
    const info = db.prepare(`INSERT INTO teachers (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`)
      .run(...FIELDS.map(f => req.body[f] || null));
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { dbError(res, e); }
};

exports.update = (req, res) => {
  const sets = [], values = [];
  for (const f of FIELDS) if (f in req.body) { sets.push(`${f} = ?`); values.push(req.body[f] === '' ? null : req.body[f]); }
  if (!sets.length) return res.status(400).json({ error: 'No fields provided' });
  if (badUrl(req.body.photo_url)) return res.status(400).json({ error: badUrl(req.body.photo_url, 'photo_url') });
  values.push(req.params.id);
  try {
    const info = db.prepare(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { dbError(res, e); }
};

exports.remove = (req, res) => {
  try {
    const info = db.prepare('DELETE FROM teachers WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { dbError(res, e); }
};
