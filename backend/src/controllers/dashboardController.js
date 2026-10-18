const db = require('../config/db');
const { today: localToday } = require('../utils/http');

exports.summary = (req, res) => {
  const { role } = req.user;

  if (role === 'admin' || role === 'teacher') {
    const today = localToday();
    const totals = {
      students: db.prepare('SELECT COUNT(*) AS c FROM students').get().c,
      teachers: db.prepare('SELECT COUNT(*) AS c FROM teachers').get().c,
      classes: db.prepare('SELECT COUNT(*) AS c FROM classes').get().c,
      present_today: db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE date = ? AND status = ?').get(today, 'present').c,
      absent_today: db.prepare('SELECT COUNT(*) AS c FROM attendance WHERE date = ? AND status = ?').get(today, 'absent').c,
      fees_pending: db.prepare("SELECT COALESCE(SUM(amount - paid), 0) AS s FROM fees WHERE status != 'paid'").get().s,
      fees_collected: db.prepare('SELECT COALESCE(SUM(paid), 0) AS s FROM fees').get().s,
    };
    const announcements = role === 'admin'
      ? db.prepare('SELECT id, title, posted_at FROM announcements ORDER BY posted_at DESC LIMIT 5').all()
      : db.prepare("SELECT id, title, posted_at FROM announcements WHERE audience IN ('all','teacher') ORDER BY posted_at DESC LIMIT 5").all();
    return res.json({ role, totals, announcements });
  }

  if (role === 'student' || role === 'parent') {
    const studentId = req.user.linked_id;
    const student = studentId ? db.prepare(`
      SELECT s.*, c.name AS class_name, c.section AS class_section FROM students s
      LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?
    `).get(studentId) : null;
    const attendance = studentId ? db.prepare(`
      SELECT
        SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) AS absent,
        COUNT(*) AS total FROM attendance WHERE student_id = ?
    `).get(studentId) : { present: 0, absent: 0, total: 0 };
    const fees = studentId ? db.prepare(`
      SELECT term, amount, paid, status, due_date FROM fees WHERE student_id = ?
    `).all(studentId) : [];
    const announcements = db.prepare(`
      SELECT id, title, posted_at FROM announcements
      WHERE audience IN ('all', ?) ORDER BY posted_at DESC LIMIT 5
    `).all(role);
    return res.json({ role, student, attendance, fees, announcements });
  }

  res.json({ role, message: 'Welcome' });
};
