const db = require('../config/db');
const { today, dbError, isDate, num } = require('../utils/http');
const { canSeeStudent } = require('../middleware/auth');

// Unpaid fees past their due date are reported as overdue.
const STATUS_SQL = `CASE WHEN f.status != 'paid' AND f.due_date IS NOT NULL AND f.due_date < ? THEN 'overdue' ELSE f.status END`;

exports.list = (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, ${STATUS_SQL} AS status, s.full_name AS student_name, s.admission_no
    FROM fees f JOIN students s ON s.id = f.student_id
    ORDER BY f.due_date DESC
  `).all(today());
  res.json(rows);
};

exports.byStudent = (req, res) => {
  res.json(db.prepare(`SELECT f.*, ${STATUS_SQL} AS status FROM fees f WHERE f.student_id = ? ORDER BY f.due_date DESC`)
    .all(today(), req.params.studentId));
};

exports.create = (req, res) => {
  const { student_id, term, due_date } = req.body;
  const amount = num(req.body.amount);
  if (!student_id || !term) return res.status(400).json({ error: 'student_id and term are required' });
  if (!(amount > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  if (due_date && !isDate(due_date)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });
  try {
    const info = db.prepare(`INSERT INTO fees (student_id, term, amount, due_date) VALUES (?, ?, ?, ?)`)
      .run(student_id, term, amount, due_date || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { dbError(res, e); }
};

exports.pay = (req, res) => {
  const amount = num(req.body.amount);
  const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(req.params.id);
  if (!fee) return res.status(404).json({ error: 'Not found' });
  const due = Math.round((fee.amount - (fee.paid || 0)) * 100) / 100;
  if (due <= 0) return res.status(400).json({ error: 'This fee is already fully paid' });
  if (!(amount > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  if (amount > due) return res.status(400).json({ error: `amount exceeds the balance due (₹${due})` });

  const paid = Math.round(((fee.paid || 0) + amount) * 100) / 100;
  const status = paid >= fee.amount ? 'paid' : 'partial';
  const receipt = `RCPT-${fee.id}-${Date.now()}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('INSERT INTO fee_payments (fee_id, amount, receipt_no, paid_on, received_by) VALUES (?, ?, ?, ?, ?)')
      .run(fee.id, amount, receipt, now, req.user.id);
    db.prepare('UPDATE fees SET paid = ?, status = ?, paid_on = ?, receipt_no = ? WHERE id = ?')
      .run(paid, status, now, receipt, fee.id);
  })();
  res.json({ ok: true, paid, status, receipt, balance: Math.round((fee.amount - paid) * 100) / 100 });
};

exports.payments = (req, res) => {
  const fee = db.prepare('SELECT student_id FROM fees WHERE id = ?').get(req.params.id);
  if (!fee) return res.status(404).json({ error: 'Not found' });
  if (!canSeeStudent(req.user, fee.student_id)) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT * FROM fee_payments WHERE fee_id = ? ORDER BY paid_on DESC').all(req.params.id));
};
