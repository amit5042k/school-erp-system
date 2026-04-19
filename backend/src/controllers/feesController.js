const db = require('../config/db');

exports.list = (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, s.full_name AS student_name, s.admission_no
    FROM fees f JOIN students s ON s.id = f.student_id
    ORDER BY f.due_date DESC
  `).all();
  res.json(rows);
};

exports.byStudent = (req, res) => {
  res.json(db.prepare('SELECT * FROM fees WHERE student_id = ? ORDER BY due_date DESC').all(req.params.studentId));
};

exports.create = (req, res) => {
  const { student_id, term, amount, due_date } = req.body;
  if (!student_id || !term || !amount) return res.status(400).json({ error: 'student_id, term, amount required' });
  const info = db.prepare(`
    INSERT INTO fees (student_id, term, amount, due_date) VALUES (?, ?, ?, ?)
  `).run(student_id, term, amount, due_date || null);
  res.status(201).json({ id: info.lastInsertRowid });
};

exports.pay = (req, res) => {
  const { amount } = req.body;
  const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(req.params.id);
  if (!fee) return res.status(404).json({ error: 'Not found' });
  const paid = (fee.paid || 0) + Number(amount || 0);
  const status = paid >= fee.amount ? 'paid' : paid > 0 ? 'partial' : 'pending';
  const receipt = 'RCPT-' + Date.now();
  db.prepare(`UPDATE fees SET paid = ?, status = ?, paid_on = ?, receipt_no = ? WHERE id = ?`)
    .run(paid, status, new Date().toISOString(), receipt, req.params.id);
  res.json({ ok: true, paid, status, receipt });
};
