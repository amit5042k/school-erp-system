const db = require('../config/db');

exports.list = (req, res) => {
  res.json(db.prepare('SELECT * FROM teachers ORDER BY full_name').all());
};

exports.get = (req, res) => {
  const row = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
};

exports.create = (req, res) => {
  const { employee_no, full_name, subject, qualification, phone, email } = req.body;
  if (!employee_no || !full_name) return res.status(400).json({ error: 'employee_no and full_name are required' });
  try {
    const info = db.prepare(`
      INSERT INTO teachers (employee_no, full_name, subject, qualification, phone, email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(employee_no, full_name, subject || null, qualification || null, phone || null, email || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.update = (req, res) => {
  const fields = ['employee_no','full_name','subject','qualification','phone','email'];
  const sets = [], values = [];
  for (const f of fields) if (f in req.body) { sets.push(`${f} = ?`); values.push(req.body[f]); }
  if (!sets.length) return res.status(400).json({ error: 'No fields provided' });
  values.push(req.params.id);
  const info = db.prepare(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};

exports.remove = (req, res) => {
  const info = db.prepare('DELETE FROM teachers WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};
