const db = require('../config/db');
const { today, dbError, isDate } = require('../utils/http');

const STATUSES = ['present', 'absent', 'late', 'leave'];

exports.markBulk = (req, res) => {
  const { date, records } = req.body;
  if (!isDate(date) || !Array.isArray(records)) return res.status(400).json({ error: 'date (YYYY-MM-DD) and records[] required' });
  if (date > today()) return res.status(400).json({ error: 'Cannot mark attendance for a future date' });
  const bad = records.find(r => !r || !r.student_id || !STATUSES.includes(r.status));
  if (bad) return res.status(400).json({ error: `Each record needs student_id and a status of ${STATUSES.join('/')}` });
  const stmt = db.prepare(`
    INSERT INTO attendance (student_id, date, status, remarks)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, remarks=excluded.remarks
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) stmt.run(r.student_id, date, r.status, r.remarks || null);
  });
  try { tx(records); } catch (e) { return dbError(res, e); }
  res.json({ ok: true, count: records.length });
};

exports.byDate = (req, res) => {
  const date = req.query.date;
  const classId = req.query.class_id;
  if (!date) return res.status(400).json({ error: 'date is required' });
  const rows = db.prepare(`
    SELECT s.id AS student_id, s.full_name, s.roll_no, s.class_id, a.status, a.remarks
    FROM students s
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
    ${classId ? 'WHERE s.class_id = ?' : ''}
    ORDER BY s.roll_no, s.full_name
  `).all(...(classId ? [date, classId] : [date]));
  res.json(rows);
};

exports.byStudent = (req, res) => {
  const rows = db.prepare(`
    SELECT date, status, remarks FROM attendance
    WHERE student_id = ? ORDER BY date DESC LIMIT 180
  `).all(req.params.studentId);
  res.json(rows);
};
