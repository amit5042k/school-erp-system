const db = require('../config/db');
const { isStaff, canSeeStudent } = require('../middleware/auth');
const { dbError } = require('../utils/http');

exports.list = (req, res) => {
  const own = !isStaff(req.user);
  const rows = db.prepare(`
    SELECT s.*, c.name AS class_name, c.section AS class_section
    FROM students s LEFT JOIN classes c ON c.id = s.class_id
    ${own ? 'WHERE s.id = ?' : ''}
    ORDER BY s.full_name
  `).all(...(own ? [req.user.linked_id ?? -1] : []));
  res.json(rows);
};

exports.get = (req, res) => {
  if (!canSeeStudent(req.user, req.params.id)) return res.status(403).json({ error: 'Forbidden' });
  const row = db.prepare(`
    SELECT s.*, c.name AS class_name, c.section AS class_section
    FROM students s LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
};

exports.create = (req, res) => {
  const { admission_no, full_name, gender, dob, class_id, roll_no, father_name, mother_name, contact, address } = req.body;
  if (!admission_no || !full_name) return res.status(400).json({ error: 'admission_no and full_name are required' });
  try {
    const info = db.prepare(`
      INSERT INTO students (admission_no, full_name, gender, dob, class_id, roll_no, father_name, mother_name, contact, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(admission_no, full_name, gender || null, dob || null, class_id || null, roll_no || null, father_name || null, mother_name || null, contact || null, address || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { dbError(res, e); }
};

exports.update = (req, res) => {
  const fields = ['admission_no','full_name','gender','dob','class_id','roll_no','father_name','mother_name','contact','address'];
  const sets = [], values = [];
  for (const f of fields) if (f in req.body) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  if (!sets.length) return res.status(400).json({ error: 'No fields provided' });
  values.push(req.params.id);
  try {
    const info = db.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { dbError(res, e); }
};

exports.remove = (req, res) => {
  try {
    const info = db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { dbError(res, e); }
};
