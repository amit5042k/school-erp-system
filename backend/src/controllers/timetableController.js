const db = require('../config/db');

exports.byClass = (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, teachers.full_name AS teacher_name
    FROM timetable t LEFT JOIN teachers ON teachers.id = t.teacher_id
    WHERE t.class_id = ? ORDER BY
      CASE day
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END,
      period
  `).all(req.params.classId);
  res.json(rows);
};

exports.upsert = (req, res) => {
  const { class_id, day, period, subject, teacher_id, start_time, end_time } = req.body;
  if (!class_id || !day || !period || !subject) return res.status(400).json({ error: 'Missing fields' });
  const info = db.prepare(`
    INSERT INTO timetable (class_id, day, period, subject, teacher_id, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(class_id, day, period, subject, teacher_id || null, start_time || null, end_time || null);
  res.status(201).json({ id: info.lastInsertRowid });
};
