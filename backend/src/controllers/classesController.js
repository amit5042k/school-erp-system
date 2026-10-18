const db = require('../config/db');
const { dbError } = require('../utils/http');

exports.list = (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, t.full_name AS class_teacher_name,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS strength
    FROM classes c LEFT JOIN teachers t ON t.id = c.class_teacher_id
    ORDER BY c.name, c.section
  `).all());
};

exports.create = (req, res) => {
  const { name, section, class_teacher_id, description } = req.body;
  if (!name || !section) return res.status(400).json({ error: 'name and section required' });
  try {
    const info = db.prepare(`INSERT INTO classes (name, section, class_teacher_id, description) VALUES (?, ?, ?, ?)`)
      .run(name, section, class_teacher_id || null, description || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { dbError(res, e); }
};

exports.update = (req, res) => {
  const sets = [], vals = [];
  for (const f of ['name', 'section', 'class_teacher_id', 'description']) {
    if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f] === '' ? null : req.body[f]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields provided' });
  if (('name' in req.body && !req.body.name) || ('section' in req.body && !req.body.section)) {
    return res.status(400).json({ error: 'name and section cannot be empty' });
  }
  vals.push(req.params.id);
  try {
    const info = db.prepare(`UPDATE classes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { dbError(res, e); }
};

exports.remove = (req, res) => {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM students WHERE class_id = ?').get(req.params.id);
  if (c) return res.status(409).json({ error: `Cannot delete: ${c} student(s) are still in this class` });
  try {
    const info = db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { dbError(res, e); }
};
