const db = require('../config/db');
const { dbError } = require('../utils/http');

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

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

exports.upsert = (req, res) => {
  const { class_id, day, subject, teacher_id, start_time, end_time } = req.body;
  const period = Number(req.body.period);
  if (!class_id || !day || !period || !subject) return res.status(400).json({ error: 'class_id, day, period and subject are required' });
  if (!DAYS.includes(day)) return res.status(400).json({ error: `day must be one of ${DAYS.join(', ')}` });
  if (!Number.isInteger(period) || period < 1) return res.status(400).json({ error: 'period must be a positive whole number' });
  if (teacher_id) {
    const clash = db.prepare(`
      SELECT c.name, c.section FROM timetable t JOIN classes c ON c.id = t.class_id
      WHERE t.teacher_id = ? AND t.day = ? AND t.period = ? AND t.class_id != ?
    `).get(teacher_id, day, period, class_id);
    if (clash) return res.status(409).json({ error: `Teacher is already assigned to ${clash.name} ${clash.section} in this period` });
  }
  try {
    db.prepare(`
      INSERT INTO timetable (class_id, day, period, subject, teacher_id, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(class_id, day, period) DO UPDATE SET
        subject = excluded.subject, teacher_id = excluded.teacher_id,
        start_time = excluded.start_time, end_time = excluded.end_time
    `).run(class_id, day, period, subject, teacher_id || null, start_time || null, end_time || null);
  } catch (e) { return dbError(res, e); }
  const row = db.prepare('SELECT id FROM timetable WHERE class_id = ? AND day = ? AND period = ?').get(class_id, day, period);
  res.json({ ok: true, id: row.id });
};

exports.remove = (req, res) => {
  const info = db.prepare('DELETE FROM timetable WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};
