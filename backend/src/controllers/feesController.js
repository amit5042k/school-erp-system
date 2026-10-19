const db = require('../config/db');
const { today, dbError, isDate, num } = require('../utils/http');
const { canSeeStudent } = require('../middleware/auth');

/* ---------- Schema (fees + fee_payments extensions, finance settings) ---------- */
function addColumn(table, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}
// fees.amount is the NET payable (gross - discount - waived), so every existing total stays correct.
for (const def of [
  'head TEXT', 'session TEXT', 'installment_id INTEGER', 'gross_amount REAL', 'discount REAL NOT NULL DEFAULT 0',
  'waived REAL NOT NULL DEFAULT 0', "kind TEXT NOT NULL DEFAULT 'demand'", 'created_at TEXT',
]) addColumn('fees', def);
for (const def of [
  "mode TEXT NOT NULL DEFAULT 'cash'", 'cheque_no TEXT', 'cheque_bank TEXT', 'cheque_date TEXT', 'cheque_status TEXT',
  'fine REAL NOT NULL DEFAULT 0', 'remarks TEXT', 'reconciled_on TEXT', 'bank_ref TEXT', 'reconciled_by INTEGER',
  'reversed INTEGER NOT NULL DEFAULT 0', 'reversed_on TEXT', 'reverse_reason TEXT', 'student_id INTEGER',
]) addColumn('fee_payments', def);

db.exec(`
  UPDATE fee_payments SET student_id = (SELECT student_id FROM fees WHERE fees.id = fee_payments.fee_id) WHERE student_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_fin_fee_demand ON fees(student_id, session, head, installment_id) WHERE installment_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_fin_fee_opening ON fees(student_id, session) WHERE kind = 'opening';
  CREATE INDEX IF NOT EXISTS ix_fee_payments_receipt ON fee_payments(receipt_no);
  CREATE INDEX IF NOT EXISTS ix_fee_payments_student ON fee_payments(student_id);

  CREATE TABLE IF NOT EXISTS fin_counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS fin_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fine_type TEXT NOT NULL DEFAULT 'none' CHECK (fine_type IN ('none','per_day','flat')),
    fine_amount REAL NOT NULL DEFAULT 0,
    grace_days INTEGER NOT NULL DEFAULT 0,
    max_fine REAL NOT NULL DEFAULT 0,
    receipt_prefix TEXT NOT NULL DEFAULT 'RC-'
  );
  INSERT OR IGNORE INTO fin_settings (id) VALUES (1);
`);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const settings = () => db.prepare('SELECT * FROM fin_settings WHERE id = 1').get();

function nextReceiptNo() {
  db.prepare('INSERT INTO fin_counters (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1').run('receipt');
  const n = db.prepare('SELECT value FROM fin_counters WHERE name = ?').get('receipt').value;
  return `${settings().receipt_prefix || 'RC-'}${String(n).padStart(6, '0')}`;
}

const statusFor = (amount, paid) => (round2(paid) >= round2(amount) ? 'paid' : paid > 0 ? 'partial' : 'pending');

// Late fine on one fee as of a date (YYYY-MM-DD), from Configure Fine Settings.
function fineFor(fee, onDate = today(), s = settings()) {
  const balance = round2(fee.amount - (fee.paid || 0));
  if (s.fine_type === 'none' || balance <= 0 || !fee.due_date) return 0;
  const days = Math.floor((Date.parse(onDate) - Date.parse(fee.due_date)) / 86400000) - (s.grace_days || 0);
  if (days <= 0) return 0;
  let fine = s.fine_type === 'flat' ? s.fine_amount : days * s.fine_amount;
  if (s.max_fine > 0) fine = Math.min(fine, s.max_fine);
  return round2(fine);
}

const httpError = (status, message) => Object.assign(new Error(message), { status });
const MODES = ['cash', 'cheque', 'online', 'card'];

/**
 * Collect payment against one or more fees of a student under a single receipt.
 * items: [{ fee_id, amount, fine? }]. Returns { receipt_no, total, fine }.
 */
function collect({ student_id, items, mode = 'cash', cheque_no, cheque_bank, cheque_date, remarks, paid_date, userId }) {
  if (!Array.isArray(items) || !items.length) throw httpError(400, 'Select at least one fee to collect');
  if (!MODES.includes(mode)) throw httpError(400, `mode must be one of ${MODES.join(', ')}`);
  if (mode === 'cheque' && (!cheque_no || !cheque_bank)) throw httpError(400, 'Cheque number and bank are required for cheque payments');
  if (cheque_date && !isDate(cheque_date)) throw httpError(400, 'cheque_date must be YYYY-MM-DD');
  const day = paid_date || today();
  if (!isDate(day)) throw httpError(400, 'payment date must be YYYY-MM-DD');
  if (day > today()) throw httpError(400, 'Payment date cannot be in the future');
  // Back-dated receipts are stamped at local noon so they land on the right day in every report.
  const paidOn = day === today() ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString();

  return db.transaction(() => {
    const receipt = nextReceiptNo();
    let total = 0, fineTotal = 0;
    const seen = new Set();
    for (const it of items) {
      const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(it.fee_id);
      if (!fee) throw httpError(404, `Fee ${it.fee_id} not found`);
      if (student_id && fee.student_id !== Number(student_id)) throw httpError(400, 'All fees on one receipt must belong to the same student');
      if (seen.has(fee.id)) throw httpError(400, 'A fee appears twice on this receipt');
      seen.add(fee.id);
      student_id = fee.student_id;
      const due = round2(fee.amount - (fee.paid || 0));
      const amount = round2(num(it.amount));
      const fine = round2(it.fine == null || it.fine === '' ? 0 : num(it.fine));
      const label = fee.head ? `${fee.head} (${fee.term})` : fee.term;
      if (due <= 0) throw httpError(400, `${label} is already fully paid`);
      if (!(amount >= 0) || !(fine >= 0) || amount + fine <= 0) throw httpError(400, `Enter a positive amount for ${label}`);
      if (amount > due) throw httpError(400, `amount exceeds the balance due (₹${due}) for ${label}`);
      const paid = round2((fee.paid || 0) + amount);
      db.prepare(`INSERT INTO fee_payments (fee_id, student_id, amount, fine, receipt_no, paid_on, received_by, mode, cheque_no, cheque_bank, cheque_date, cheque_status, remarks)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(fee.id, fee.student_id, amount, fine, receipt, paidOn, userId, mode,
          mode === 'cheque' ? cheque_no : null, mode === 'cheque' ? cheque_bank : null,
          mode === 'cheque' ? cheque_date || day : null, mode === 'cheque' ? 'pending' : null, remarks || null);
      db.prepare('UPDATE fees SET paid = ?, status = ?, paid_on = ?, receipt_no = ? WHERE id = ?')
        .run(paid, statusFor(fee.amount, paid), paidOn, receipt, fee.id);
      total += amount; fineTotal += fine;
    }
    return { receipt_no: receipt, total: round2(total), fine: round2(fineTotal), grand_total: round2(total + fineTotal) };
  })();
}

// Undo a receipt's effect on its fees (bounced cheque / cancelled receipt).
function reverseReceipt(receiptNo, reason, chequeStatus) {
  return db.transaction(() => {
    const rows = db.prepare('SELECT * FROM fee_payments WHERE receipt_no = ? AND reversed = 0').all(receiptNo);
    if (!rows.length) throw httpError(404, 'Receipt not found or already reversed');
    const now = new Date().toISOString();
    for (const p of rows) {
      const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(p.fee_id);
      const paid = round2(Math.max(0, (fee.paid || 0) - p.amount));
      db.prepare('UPDATE fees SET paid = ?, status = ? WHERE id = ?').run(paid, statusFor(fee.amount, paid), fee.id);
    }
    db.prepare(`UPDATE fee_payments SET reversed = 1, reversed_on = ?, reverse_reason = ?, cheque_status = COALESCE(?, cheque_status)
                WHERE receipt_no = ? AND reversed = 0`).run(now, reason || null, chequeStatus || null, receiptNo);
    return rows.length;
  })();
}

/** Apply a discount or waiver to one fee: lowers the net amount, never below what is already paid. */
function adjustFee({ fee_id, type, amount, reason, approved_by, discount_category, userId }) {
  if (!['discount', 'waiver'].includes(type)) throw httpError(400, 'type must be discount or waiver');
  const value = round2(num(amount));
  if (!(value > 0)) throw httpError(400, 'Amount must be a positive number');
  const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(fee_id);
  if (!fee) throw httpError(404, 'Fee not found');
  const newAmount = round2(fee.amount - value);
  if (newAmount < round2(fee.paid || 0)) {
    throw httpError(400, `Cannot reduce below the amount already paid (₹${round2(fee.paid)}). Maximum allowed: ₹${round2(fee.amount - (fee.paid || 0))}`);
  }
  db.transaction(() => {
    const gross = fee.gross_amount != null ? fee.gross_amount : round2(fee.amount + (fee.discount || 0) + (fee.waived || 0));
    const col = type === 'discount' ? 'discount' : 'waived';
    db.prepare(`UPDATE fees SET amount = ?, gross_amount = ?, ${col} = ${col} + ?, status = ? WHERE id = ?`)
      .run(newAmount, gross, value, statusFor(newAmount, fee.paid || 0), fee.id);
    db.prepare(`INSERT INTO fin_adjustments (fee_id, student_id, type, amount, discount_category, reason, approved_by, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(fee.id, fee.student_id, type, value, discount_category || null, reason || null, approved_by || null, userId || null);
  })();
  return newAmount;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS fin_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fee_id INTEGER NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('discount','waiver')),
    amount REAL NOT NULL,
    discount_category TEXT,
    reason TEXT,
    approved_by TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

/* ---------- Route handlers ---------- */
// Unpaid fees past their due date are reported as overdue.
const STATUS_SQL = `CASE WHEN f.status != 'paid' AND f.due_date IS NOT NULL AND f.due_date < ? THEN 'overdue' ELSE f.status END`;

const sendError = (res, e) => {
  if (e.status) return res.status(e.status).json({ error: e.message });
  return dbError(res, e);
};

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
  const { student_id, term, due_date, head, session } = req.body;
  const amount = num(req.body.amount);
  if (!student_id || !term) return res.status(400).json({ error: 'student_id and term are required' });
  if (!(amount > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  if (due_date && !isDate(due_date)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });
  try {
    const info = db.prepare(`INSERT INTO fees (student_id, term, amount, gross_amount, due_date, head, session, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(student_id, term, round2(amount), round2(amount), due_date || null, head || null, session || null, new Date().toISOString());
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { dbError(res, e); }
};

exports.pay = (req, res) => {
  const amount = num(req.body.amount);
  const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(req.params.id);
  if (!fee) return res.status(404).json({ error: 'Not found' });
  const due = round2(fee.amount - (fee.paid || 0));
  if (due <= 0) return res.status(400).json({ error: 'This fee is already fully paid' });
  if (!(amount > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  if (amount > due) return res.status(400).json({ error: `amount exceeds the balance due (₹${due})` });
  try {
    const r = collect({ student_id: fee.student_id, items: [{ fee_id: fee.id, amount, fine: req.body.fine }], mode: req.body.mode || 'cash',
      cheque_no: req.body.cheque_no, cheque_bank: req.body.cheque_bank, cheque_date: req.body.cheque_date, remarks: req.body.remarks, userId: req.user.id });
    const after = db.prepare('SELECT amount, paid, status FROM fees WHERE id = ?').get(fee.id);
    res.json({ ok: true, paid: after.paid, status: after.status, receipt: r.receipt_no, balance: round2(after.amount - after.paid) });
  } catch (e) { sendError(res, e); }
};

exports.payments = (req, res) => {
  const fee = db.prepare('SELECT student_id FROM fees WHERE id = ?').get(req.params.id);
  if (!fee) return res.status(404).json({ error: 'Not found' });
  if (!canSeeStudent(req.user, fee.student_id)) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT * FROM fee_payments WHERE fee_id = ? ORDER BY paid_on DESC').all(req.params.id));
};

Object.assign(exports, { collect, reverseReceipt, adjustFee, fineFor, settings, round2, statusFor, httpError, sendError, MODES });
