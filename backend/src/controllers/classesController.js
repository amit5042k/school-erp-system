const db = require('../config/db');

exports.list = (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, t.full_name AS class_teacher_name,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS strength
    FROM classes c LEFT JOIN teachers t ON t.id = c.class_teacher_id
    ORDER BY c.name, c.section
  `).all());
};

exports.create = (req, res) => {
  const { name, section, class_teacher_id } = req.body;
  if (!name || !section) return res.status(400).json({ error: 'name and section required' });
  try {
    const info = db.prepare(`INSERT INTO classes (name, section, class_teacher_id) VALUES (?, ?, ?)`)
      .run(name, section, class_teacher_id || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
