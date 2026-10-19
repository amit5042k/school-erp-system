// Finance: fee heads, installments, class fee structure, demand generation, collection & receipts,
// ledger, cheques, opening balance, discounts/waivers, fines, reconciliation, app blocking, reports.
const { db, ROLES, auth, role, safe, canSeeStudent, isStaff, isDate, num, today, currentSession,
  registerMaster, registerReport, masterNames } = require('./_kit');
const fees = require('../controllers/feesController');
const { flatten } = require('../utils/masters');

const { round2, httpError, sendError } = fees;
const admin = [auth, role(...ROLES.ADMIN)];

/* ---------- Master lists ---------- */
registerMaster({
  type: 'fee-heads', title: 'Fee Categories', group: 'Finance', read: ROLES.ADMIN,
  description: 'Fee heads charged to students (Tuition, Admission, Transport…). Mark transport heads so transport fee reports and route fares work.',
  fields: [
    { name: 'is_transport', label: 'Transport Fee?', type: 'select', options: ['No', 'Yes'] },
    { name: 'description', label: 'Description' },
  ],
  seed: [
    { name: 'Tuition Fee', code: 'TUI', is_transport: 'No' }, { name: 'Admission Fee', code: 'ADM', is_transport: 'No' },
    { name: 'Annual Charges', code: 'ANN', is_transport: 'No' }, { name: 'Exam Fee', code: 'EXM', is_transport: 'No' },
    { name: 'Computer Fee', code: 'CMP', is_transport: 'No' }, { name: 'Development Fund', code: 'DEV', is_transport: 'No' },
    { name: 'Transport Fee', code: 'TRN', is_transport: 'Yes' },
  ],
});
registerMaster({
  type: 'finance-categories', title: 'Finance Categories', group: 'Finance', read: ROLES.ADMIN,
  description: 'Fee category of a student (General, RTE, Staff Ward…). Assigned on the Student Discount/Fee Waveoff screen.',
  fields: [{ name: 'description', label: 'Description' }],
  seed: ['General', 'RTE', 'Staff Ward', 'Sibling', 'Scholarship'],
});
registerMaster({
  type: 'discount-categories', title: 'Discount Categories', group: 'Finance', read: ROLES.ADMIN,
  description: 'Percent discounts apply to each fee; flat discounts apply per installment fee, capped at the fee amount.',
  fields: [
    { name: 'discount_type', label: 'Type', type: 'select', options: ['Percent', 'Flat'] },
    { name: 'value', label: 'Value (% or ₹)', type: 'number' },
    { name: 'description', label: 'Description' },
  ],
  seed: [
    { name: 'Sibling Discount', discount_type: 'Percent', value: 10 },
    { name: 'Staff Ward Concession', discount_type: 'Percent', value: 50 },
    { name: 'RTE Free Seat', discount_type: 'Percent', value: 100 },
    { name: 'Merit Scholarship', discount_type: 'Flat', value: 1000 },
  ],
});

const master = (type, name) => flatten(db.prepare('SELECT * FROM masters WHERE type = ? AND name = ?').get(type, name));
const transportHeads = () => db.prepare("SELECT name, data FROM masters WHERE type = 'fee-heads'").all()
  .filter(r => flatten(r).is_transport === 'Yes').map(r => r.name);

/* ---------- Tables ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS fin_installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    name TEXT NOT NULL,
    due_date TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(session, name)
  );
  CREATE TABLE IF NOT EXISTS fin_structure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    head TEXT NOT NULL,
    installment_id INTEGER NOT NULL REFERENCES fin_installments(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK (amount >= 0),
    UNIQUE(session, class_id, head, installment_id)
  );
  CREATE TABLE IF NOT EXISTS fin_student_profile (
    student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    finance_category TEXT
  );
  CREATE TABLE IF NOT EXISTS fin_student_discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    session TEXT NOT NULL,
    head TEXT,
    approved_by TEXT,
    reason TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_fin_student_discount ON fin_student_discounts(student_id, category, session, COALESCE(head, ''));
  CREATE TABLE IF NOT EXISTS fin_app_blocks (
    student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    blocked_by INTEGER,
    blocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

/* ---------- Shared queries ---------- */
const STUDENT_SQL = `
  SELECT s.id, s.admission_no, s.full_name, s.father_name, s.contact, s.class_id, s.status,
    c.name AS class_name, c.section AS class_section, fp.finance_category
  FROM students s LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN fin_student_profile fp ON fp.student_id = s.id`;
const studentInfo = (id) => db.prepare(`${STUDENT_SQL} WHERE s.id = ?`).get(id);
const GROSS = 'COALESCE(f.gross_amount, f.amount + f.discount + f.waived)';
const feeLabel = (f) => (f.head ? `${f.head} — ${f.term}` : f.term);

const RECEIPTS_SQL = `
  SELECT p.receipt_no, MIN(p.paid_on) AS paid_on, MAX(p.mode) AS mode, MAX(p.cheque_no) AS cheque_no, MAX(p.cheque_bank) AS cheque_bank,
    MAX(p.cheque_date) AS cheque_date, MAX(p.cheque_status) AS cheque_status, MAX(p.reversed) AS reversed, MAX(p.reversed_on) AS reversed_on,
    MAX(p.reverse_reason) AS reverse_reason, p.student_id, ROUND(SUM(p.amount), 2) AS amount, ROUND(SUM(p.fine), 2) AS fine,
    ROUND(SUM(p.amount + p.fine), 2) AS total, MAX(p.reconciled_on) AS reconciled_on, MAX(p.bank_ref) AS bank_ref,
    MAX(p.remarks) AS remarks, u.full_name AS received_by_name, s.full_name AS student_name, s.admission_no,
    c.name || ' ' || c.section AS class
  FROM fee_payments p
  LEFT JOIN users u ON u.id = p.received_by
  JOIN students s ON s.id = p.student_id
  LEFT JOIN classes c ON c.id = s.class_id`;

function ledgerFor(studentId) {
  const entries = [];
  for (const f of db.prepare(`SELECT f.*, ${GROSS} AS gross FROM fees f WHERE f.student_id = ?`).all(studentId)) {
    entries.push({ date: f.due_date || (f.created_at || '').slice(0, 10), order: f.kind === 'opening' ? -1 : 0,
      particulars: f.kind === 'opening' ? `Opening balance ${f.session || ''}`.trim() : `Fee due: ${feeLabel(f)}`, debit: round2(f.gross), credit: 0 });
  }
  for (const a of db.prepare(`SELECT a.*, date(a.created_at, 'localtime') AS d, f.term, f.head FROM fin_adjustments a JOIN fees f ON f.id = a.fee_id WHERE a.student_id = ?`).all(studentId)) {
    entries.push({ date: a.d, order: 2, debit: 0, credit: round2(a.amount),
      particulars: `${a.type === 'discount' ? `Discount${a.discount_category ? ` (${a.discount_category})` : ''}` : 'Fee waived off'}: ${feeLabel(a)}${a.reason ? ` — ${a.reason}` : ''}` });
  }
  // Fees marked paid before receipts were recorded (e.g. imported data) still need a credit line.
  for (const f of db.prepare(`SELECT f.*, f.paid - COALESCE((SELECT SUM(amount) FROM fee_payments p WHERE p.fee_id = f.id AND p.reversed = 0), 0) AS unrecorded
    FROM fees f WHERE f.student_id = ?`).all(studentId)) {
    if (round2(f.unrecorded) > 0) entries.push({ date: (f.paid_on || f.due_date || '').slice(0, 10), order: 3, debit: 0, credit: round2(f.unrecorded),
      particulars: `Paid (no receipt on record): ${feeLabel(f)}` });
  }
  const receipts = db.prepare(`${RECEIPTS_SQL} WHERE p.student_id = ? GROUP BY p.receipt_no`).all(studentId);
  for (const r of receipts) {
    const d = (r.paid_on || '').length > 10 ? localDay(r.paid_on) : r.paid_on;
    if (r.fine > 0) entries.push({ date: d, order: 1, particulars: `Late fine (receipt ${r.receipt_no})`, debit: r.fine, credit: 0 });
    entries.push({ date: d, order: 3, particulars: `Payment received — receipt ${r.receipt_no} (${r.mode}${r.cheque_no ? ` #${r.cheque_no}` : ''})`, debit: 0, credit: r.total, receipt_no: r.receipt_no });
    if (r.reversed) entries.push({ date: localDay(r.reversed_on), order: 4, debit: r.total, credit: 0, receipt_no: r.receipt_no,
      particulars: `${r.cheque_status === 'bounced' ? 'Cheque bounced' : 'Receipt cancelled'} — receipt ${r.receipt_no}${r.reverse_reason ? ` (${r.reverse_reason})` : ''}` });
  }
  entries.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.order - b.order);
  let bal = 0, debit = 0, credit = 0;
  for (const e of entries) { bal = round2(bal + e.debit - e.credit); e.balance = bal; debit += e.debit; credit += e.credit; delete e.order; }
  return { entries, totals: { debit: round2(debit), credit: round2(credit), balance: bal } };
}
const localDay = (iso) => (iso ? db.prepare("SELECT date(?, 'localtime') AS d").get(iso).d : '');

// Fee data: admins see all, students/parents only their linked student, teachers none.
function guardStudent(req, res, studentId) {
  if (req.user.role === 'teacher' || !canSeeStudent(req.user, studentId)) { res.status(403).json({ error: 'Forbidden' }); return false; }
  return true;
}

/* ---------- Handlers ---------- */
const h = {
  getSettings: (req, res) => res.json(fees.settings()),
  putSettings(req, res) {
    const s = fees.settings();
    const next = { ...s, ...req.body };
    if (!['none', 'per_day', 'flat'].includes(next.fine_type)) throw httpError(400, 'fine_type must be none, per_day or flat');
    for (const k of ['fine_amount', 'max_fine', 'grace_days']) {
      next[k] = num(next[k] ?? 0);
      if (!(next[k] >= 0)) throw httpError(400, `${k.replace('_', ' ')} must be 0 or more`);
    }
    if (!Number.isInteger(next.grace_days)) throw httpError(400, 'grace days must be a whole number');
    const prefix = String(next.receipt_prefix || 'RC-').trim();
    if (!/^[A-Za-z0-9/-]{1,10}$/.test(prefix)) throw httpError(400, 'Receipt prefix may use letters, digits, - and / (max 10)');
    db.prepare('UPDATE fin_settings SET fine_type = ?, fine_amount = ?, grace_days = ?, max_fine = ?, receipt_prefix = ? WHERE id = 1')
      .run(next.fine_type, round2(next.fine_amount), next.grace_days, round2(next.max_fine), prefix);
    res.json({ ok: true });
  },

  /* Installments */
  listInstallments(req, res) {
    const session = req.query.session || currentSession();
    res.json(db.prepare(`SELECT i.*, (SELECT COUNT(*) FROM fees WHERE installment_id = i.id) AS fee_count
      FROM fin_installments i WHERE session = ? ORDER BY sort_order, due_date`).all(session));
  },
  saveInstallment(req, res) {
    const { name, due_date } = req.body;
    const session = req.body.session || currentSession();
    if (!name || !String(name).trim()) throw httpError(400, 'Installment name is required');
    if (!isDate(due_date)) throw httpError(400, 'due_date must be YYYY-MM-DD');
    const sort = Number.isInteger(num(req.body.sort_order)) ? num(req.body.sort_order) : 0;
    if (req.params.id) {
      const info = db.prepare('UPDATE fin_installments SET name = ?, due_date = ?, sort_order = ? WHERE id = ?').run(String(name).trim(), due_date, sort, req.params.id);
      if (!info.changes) throw httpError(404, 'Not found');
      // Keep already-generated, unpaid demands on the new due date.
      db.prepare("UPDATE fees SET due_date = ? WHERE installment_id = ? AND status != 'paid'").run(due_date, req.params.id);
      return res.json({ ok: true });
    }
    const info = db.prepare('INSERT INTO fin_installments (session, name, due_date, sort_order) VALUES (?, ?, ?, ?)').run(session, String(name).trim(), due_date, sort);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  deleteInstallment(req, res) {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM fees WHERE installment_id = ?').get(req.params.id);
    if (c) throw httpError(409, `Cannot delete: ${c} fee demand(s) were generated for this installment`);
    const info = db.prepare('DELETE FROM fin_installments WHERE id = ?').run(req.params.id);
    if (!info.changes) throw httpError(404, 'Not found');
    res.json({ ok: true });
  },

  /* Class-wise fee structure */
  getStructure(req, res) {
    const session = req.query.session || currentSession();
    if (!req.query.class_id) throw httpError(400, 'class_id is required');
    res.json(db.prepare('SELECT * FROM fin_structure WHERE session = ? AND class_id = ?').all(session, req.query.class_id));
  },
  putStructure(req, res) {
    const session = req.body.session || currentSession();
    const { class_id, rows } = req.body;
    if (!class_id || !Array.isArray(rows)) throw httpError(400, 'class_id and rows[] are required');
    const heads = new Set(masterNames('fee-heads'));
    const tHeads = new Set(transportHeads());
    const inst = new Set(db.prepare('SELECT id FROM fin_installments WHERE session = ?').all(session).map(r => r.id));
    const up = db.prepare(`INSERT INTO fin_structure (session, class_id, head, installment_id, amount) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session, class_id, head, installment_id) DO UPDATE SET amount = excluded.amount`);
    const del = db.prepare('DELETE FROM fin_structure WHERE session = ? AND class_id = ? AND head = ? AND installment_id = ?');
    db.transaction(() => {
      for (const r of rows) {
        if (!heads.has(r.head)) throw httpError(400, `Unknown fee head: ${r.head}`);
        if (!inst.has(Number(r.installment_id))) throw httpError(400, 'Unknown installment for this session');
        // A transport head saved as 0 means "charge each student's route fare"; other heads at 0 are removed.
        const blank = r.amount === '' || r.amount == null;
        if (blank || (num(r.amount) === 0 && !tHeads.has(r.head))) { del.run(session, class_id, r.head, r.installment_id); continue; }
        const a = num(r.amount);
        if (!(a >= 0)) throw httpError(400, `Amount for ${r.head} must be 0 or more`);
        up.run(session, class_id, r.head, r.installment_id, round2(a));
      }
    })();
    res.json({ ok: true });
  },
  copyStructure(req, res) {
    const session = req.body.session || currentSession();
    const { from_class_id, to_class_ids } = req.body;
    if (!from_class_id || !Array.isArray(to_class_ids) || !to_class_ids.length) throw httpError(400, 'from_class_id and to_class_ids[] are required');
    const src = db.prepare('SELECT * FROM fin_structure WHERE session = ? AND class_id = ?').all(session, from_class_id);
    if (!src.length) throw httpError(400, 'The source class has no fee structure for this session');
    db.transaction(() => {
      for (const to of to_class_ids) {
        if (Number(to) === Number(from_class_id)) continue;
        db.prepare('DELETE FROM fin_structure WHERE session = ? AND class_id = ?').run(session, to);
        const ins = db.prepare('INSERT INTO fin_structure (session, class_id, head, installment_id, amount) VALUES (?, ?, ?, ?, ?)');
        for (const r of src) ins.run(session, to, r.head, r.installment_id, r.amount);
      }
    })();
    res.json({ ok: true, copied_rows: src.length });
  },

  /* Generate fee demands from the structure */
  generate(req, res) {
    const session = req.body.session || currentSession();
    const { class_id, student_id, installment_id } = req.body;
    const dry = !!req.body.dry_run;
    if (!class_id && !student_id) throw httpError(400, 'Choose a class or a student');
    const students = student_id
      ? db.prepare("SELECT id, class_id FROM students WHERE id = ?").all(student_id)
      : db.prepare("SELECT id, class_id FROM students WHERE class_id = ? AND COALESCE(status, 'active') = 'active'").all(class_id);
    if (!students.length) throw httpError(400, 'No active students found');
    const tHeads = new Set(transportHeads());
    const result = { students: students.length, created: 0, already_existed: 0, skipped_no_transport: 0, total_amount: 0, discounts_applied: 0 };
    const tx = db.transaction(() => {
      for (const s of students) {
        const rows = db.prepare(`SELECT fs.*, i.name AS installment_name, i.due_date FROM fin_structure fs JOIN fin_installments i ON i.id = fs.installment_id
          WHERE fs.session = ? AND fs.class_id = ? ${installment_id ? 'AND fs.installment_id = ?' : ''} ORDER BY i.sort_order, i.due_date, fs.head`)
          .all(...[session, s.class_id, ...(installment_id ? [installment_id] : [])]);
        const route = db.prepare('SELECT r.fare FROM student_transport st JOIN routes r ON r.id = st.route_id WHERE st.student_id = ?').get(s.id);
        const assigned = db.prepare('SELECT * FROM fin_student_discounts WHERE student_id = ? AND session = ?').all(s.id, session);
        for (const r of rows) {
          let amount = r.amount;
          if (tHeads.has(r.head)) {
            if (!route) { result.skipped_no_transport++; continue; }
            if (!(amount > 0)) amount = route.fare || 0;
          }
          if (!(amount > 0)) continue;
          const exists = db.prepare('SELECT id FROM fees WHERE student_id = ? AND session = ? AND head = ? AND installment_id = ?').get(s.id, session, r.head, r.installment_id);
          if (exists) { result.already_existed++; continue; }
          result.created++; result.total_amount = round2(result.total_amount + amount);
          if (dry) continue;
          const info = db.prepare(`INSERT INTO fees (student_id, term, amount, gross_amount, due_date, head, session, installment_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(s.id, `${r.installment_name} ${session}`, round2(amount), round2(amount), r.due_date, r.head, session, r.installment_id, new Date().toISOString());
          for (const d of assigned) if (!d.head || d.head === r.head) result.discounts_applied += applyDiscount(info.lastInsertRowid, d, req.user.id) ? 1 : 0;
        }
      }
    });
    tx();
    res.json({ ...result, dry_run: dry });
  },

  /* Collection */
  studentDues(req, res) {
    const s = studentInfo(req.params.studentId);
    if (!s) throw httpError(404, 'Student not found');
    if (!guardStudent(req, res, s.id)) return;
    const date = isDate(req.query.date) ? req.query.date : today();
    const st = fees.settings();
    const dues = db.prepare(`SELECT f.*, ${GROSS} AS gross, ROUND(f.amount - f.paid, 2) AS balance, i.name AS installment_name
      FROM fees f LEFT JOIN fin_installments i ON i.id = f.installment_id
      WHERE f.student_id = ? AND ROUND(f.amount - f.paid, 2) > 0 ORDER BY f.due_date, f.id`).all(s.id)
      .map(f => ({ ...f, fine: fees.fineFor(f, date, st), overdue: !!(f.due_date && f.due_date < date) }));
    const block = db.prepare('SELECT * FROM fin_app_blocks WHERE student_id = ?').get(s.id);
    res.json({ student: s, dues, total_due: round2(dues.reduce((a, d) => a + d.balance, 0)), total_fine: round2(dues.reduce((a, d) => a + d.fine, 0)), block: block || null, date });
  },
  collect(req, res) {
    const r = fees.collect({ ...req.body, userId: req.user.id, paid_date: req.body.paid_date });
    res.status(201).json(r);
  },
  receipts(req, res) {
    const studentId = isStaff(req.user) ? req.query.student_id : req.user.linked_id ?? -1;
    if (!isStaff(req.user) && !studentId) return res.json([]);
    if (req.user.role === 'teacher') throw httpError(403, 'Forbidden');
    const w = [], p = [];
    if (studentId) { w.push('p.student_id = ?'); p.push(studentId); }
    if (isDate(req.query.from)) { w.push("date(p.paid_on, 'localtime') >= ?"); p.push(req.query.from); }
    if (isDate(req.query.to)) { w.push("date(p.paid_on, 'localtime') <= ?"); p.push(req.query.to); }
    res.json(db.prepare(`${RECEIPTS_SQL} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} GROUP BY p.receipt_no ORDER BY MIN(p.paid_on) DESC LIMIT 500`).all(...p));
  },
  receipt(req, res) {
    const head = db.prepare(`${RECEIPTS_SQL} WHERE p.receipt_no = ? GROUP BY p.receipt_no`).get(req.params.no);
    if (!head) throw httpError(404, 'Receipt not found');
    if (!guardStudent(req, res, head.student_id)) return;
    const items = db.prepare(`SELECT p.amount, p.fine, f.term, f.head, f.due_date, ROUND(f.amount - f.paid, 2) AS balance_now
      FROM fee_payments p JOIN fees f ON f.id = p.fee_id WHERE p.receipt_no = ? ORDER BY p.id`).all(req.params.no);
    const school = db.prepare('SELECT school_name, address, phone, email, website, logo_url, academic_year FROM school_settings WHERE id = 1').get();
    res.json({ ...head, items, student: studentInfo(head.student_id), school,
      balance_after: round2(db.prepare('SELECT COALESCE(SUM(amount - paid), 0) AS b FROM fees WHERE student_id = ?').get(head.student_id).b) });
  },
  cancelReceipt(req, res) {
    if (!req.body.reason) throw httpError(400, 'A reason is required to cancel a receipt');
    const n = fees.reverseReceipt(req.params.no, req.body.reason, null);
    res.json({ ok: true, reversed_rows: n });
  },
  ledger(req, res) {
    const s = studentInfo(req.params.studentId);
    if (!s) throw httpError(404, 'Student not found');
    if (!guardStudent(req, res, s.id)) return;
    res.json({ student: s, ...ledgerFor(s.id) });
  },

  /* Cheques */
  cheques(req, res) {
    const status = ['pending', 'cleared', 'bounced'].includes(req.query.status) ? req.query.status : null;
    res.json(db.prepare(`${RECEIPTS_SQL} WHERE p.mode = 'cheque' ${status ? 'AND p.cheque_status = ?' : ''}
      GROUP BY p.receipt_no ORDER BY MIN(p.paid_on) DESC LIMIT 500`).all(...(status ? [status] : [])));
  },
  clearCheque(req, res) {
    const info = db.prepare("UPDATE fee_payments SET cheque_status = 'cleared' WHERE receipt_no = ? AND mode = 'cheque' AND cheque_status = 'pending' AND reversed = 0").run(req.params.no);
    if (!info.changes) throw httpError(404, 'No pending cheque with that receipt number');
    res.json({ ok: true });
  },
  bounceCheque(req, res) {
    const p = db.prepare("SELECT cheque_status FROM fee_payments WHERE receipt_no = ? AND mode = 'cheque' LIMIT 1").get(req.params.no);
    if (!p) throw httpError(404, 'No cheque payment with that receipt number');
    if (p.cheque_status === 'bounced') throw httpError(400, 'Cheque is already marked bounced');
    fees.reverseReceipt(req.params.no, req.body.reason || 'Cheque bounced', 'bounced');
    res.json({ ok: true });
  },

  /* Opening balance */
  openingList(req, res) {
    const session = req.query.session || currentSession();
    if (!req.query.class_id) throw httpError(400, 'class_id is required');
    res.json(db.prepare(`SELECT s.id AS student_id, s.admission_no, s.full_name, s.roll_no, f.id AS fee_id, f.amount, f.paid
      FROM students s LEFT JOIN fees f ON f.student_id = s.id AND f.kind = 'opening' AND f.session = ?
      WHERE s.class_id = ? AND COALESCE(s.status, 'active') = 'active' ORDER BY s.roll_no, s.full_name`).all(session, req.query.class_id));
  },
  openingSave(req, res) {
    const session = req.body.session || currentSession();
    const due = isDate(req.body.due_date) ? req.body.due_date : today();
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    if (!entries.length) throw httpError(400, 'Nothing to save');
    const out = { saved: 0, removed: 0 };
    db.transaction(() => {
      for (const e of entries) {
        const amount = e.amount === '' || e.amount == null ? 0 : num(e.amount);
        if (!(amount >= 0)) throw httpError(400, 'Opening balance must be 0 or more');
        const cur = db.prepare("SELECT * FROM fees WHERE student_id = ? AND session = ? AND kind = 'opening'").get(e.student_id, session);
        if (cur) {
          if (amount < round2(cur.paid)) throw httpError(400, `Opening balance for student ${e.student_id} cannot be less than the ₹${round2(cur.paid)} already paid`);
          if (amount === 0 && !cur.paid) { db.prepare('DELETE FROM fees WHERE id = ?').run(cur.id); out.removed++; continue; }
          db.prepare('UPDATE fees SET amount = ?, gross_amount = ?, status = ? WHERE id = ?').run(round2(amount), round2(amount), fees.statusFor(amount, cur.paid), cur.id);
          out.saved++;
        } else if (amount > 0) {
          db.prepare(`INSERT INTO fees (student_id, term, amount, gross_amount, due_date, head, session, kind, created_at) VALUES (?, ?, ?, ?, ?, 'Opening Balance', ?, 'opening', ?)`)
            .run(e.student_id, `Opening Balance ${session}`, round2(amount), round2(amount), due, session, new Date().toISOString());
          out.saved++;
        }
      }
    })();
    res.json(out);
  },

  /* Discounts, waivers, finance category */
  studentDiscounts(req, res) {
    const w = [], p = [];
    if (req.query.student_id) { w.push('d.student_id = ?'); p.push(req.query.student_id); }
    if (req.query.session) { w.push('d.session = ?'); p.push(req.query.session); }
    res.json(db.prepare(`SELECT d.*, s.full_name, s.admission_no FROM fin_student_discounts d JOIN students s ON s.id = d.student_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY d.id DESC`).all(...p));
  },
  addStudentDiscount(req, res) {
    const { student_id, category, head, approved_by, reason, apply_existing } = req.body;
    const session = req.body.session || currentSession();
    if (!student_id || !category) throw httpError(400, 'student_id and category are required');
    const cat = master('discount-categories', category);
    if (!cat || !cat.active) throw httpError(400, 'Unknown discount category');
    if (head && !masterNames('fee-heads').includes(head)) throw httpError(400, 'Unknown fee head');
    let applied = 0, id;
    db.transaction(() => {
      id = db.prepare(`INSERT INTO fin_student_discounts (student_id, category, session, head, approved_by, reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(student_id, category, session, head || null, approved_by || null, reason || null, req.user.id).lastInsertRowid;
      if (apply_existing) {
        const d = { category, head: head || null, reason, approved_by };
        const due = db.prepare(`SELECT id FROM fees WHERE student_id = ? AND session = ? AND kind = 'demand' ${head ? 'AND head = ?' : ''} AND ROUND(amount - paid, 2) > 0`)
          .all(...[student_id, session, ...(head ? [head] : [])]);
        for (const f of due) applied += applyDiscount(f.id, d, req.user.id) ? 1 : 0;
      }
    })();
    res.status(201).json({ id, applied_to_existing: applied });
  },
  removeStudentDiscount(req, res) {
    const info = db.prepare('DELETE FROM fin_student_discounts WHERE id = ?').run(req.params.id);
    if (!info.changes) throw httpError(404, 'Not found');
    res.json({ ok: true });
  },
  adjust(req, res) {
    const { fee_id, type, reason, approved_by } = req.body;
    const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(fee_id);
    if (!fee) throw httpError(404, 'Fee not found');
    if (!reason || !String(reason).trim()) throw httpError(400, 'A reason is required');
    let amount = req.body.amount;
    if (req.body.percent != null && req.body.percent !== '') {
      const pct = num(req.body.percent);
      if (!(pct > 0 && pct <= 100)) throw httpError(400, 'Percent must be between 0 and 100');
      amount = round2(((fee.gross_amount ?? fee.amount) * pct) / 100);
    }
    const net = fees.adjustFee({ fee_id, type, amount, reason, approved_by, userId: req.user.id });
    res.json({ ok: true, amount: net });
  },
  adjustments(req, res) {
    if (!req.query.student_id) throw httpError(400, 'student_id is required');
    res.json(db.prepare(`SELECT a.*, f.term, f.head, u.full_name AS created_by_name FROM fin_adjustments a JOIN fees f ON f.id = a.fee_id
      LEFT JOIN users u ON u.id = a.created_by WHERE a.student_id = ? ORDER BY a.id DESC`).all(req.query.student_id));
  },
  setCategory(req, res) {
    const cat = req.body.finance_category || null;
    if (cat && !masterNames('finance-categories').includes(cat)) throw httpError(400, 'Unknown finance category');
    if (!studentInfo(req.params.studentId)) throw httpError(404, 'Student not found');
    db.prepare(`INSERT INTO fin_student_profile (student_id, finance_category) VALUES (?, ?)
      ON CONFLICT(student_id) DO UPDATE SET finance_category = excluded.finance_category`).run(req.params.studentId, cat);
    res.json({ ok: true });
  },

  /* Reconciliation */
  reconList(req, res) {
    const w = ['p.reversed = 0'], p = [];
    if (isDate(req.query.from)) { w.push("date(p.paid_on, 'localtime') >= ?"); p.push(req.query.from); }
    if (isDate(req.query.to)) { w.push("date(p.paid_on, 'localtime') <= ?"); p.push(req.query.to); }
    if (fees.MODES.includes(req.query.mode)) { w.push('p.mode = ?'); p.push(req.query.mode); }
    if (req.query.state === 'reconciled') w.push('p.reconciled_on IS NOT NULL');
    if (req.query.state === 'unreconciled') w.push('p.reconciled_on IS NULL');
    res.json(db.prepare(`${RECEIPTS_SQL} WHERE ${w.join(' AND ')} GROUP BY p.receipt_no ORDER BY MIN(p.paid_on) DESC LIMIT 1000`).all(...p));
  },
  reconcile(req, res) {
    const { receipts, bank_date, bank_ref } = req.body;
    if (!Array.isArray(receipts) || !receipts.length) throw httpError(400, 'Select at least one receipt');
    if (!isDate(bank_date)) throw httpError(400, 'Bank statement date must be YYYY-MM-DD');
    let n = 0;
    db.transaction(() => {
      for (const r of receipts) {
        const bounced = db.prepare("SELECT 1 FROM fee_payments WHERE receipt_no = ? AND (reversed = 1 OR cheque_status = 'pending')").get(r);
        if (bounced) throw httpError(400, `Receipt ${r} is reversed or its cheque has not cleared yet`);
        const changed = db.prepare('UPDATE fee_payments SET reconciled_on = ?, bank_ref = ?, reconciled_by = ? WHERE receipt_no = ?').run(bank_date, bank_ref || null, req.user.id, r).changes;
        if (!changed) throw httpError(404, `Receipt ${r} not found`);
        n++;
      }
    })();
    res.json({ ok: true, reconciled: n });
  },
  unreconcile(req, res) {
    const { receipts } = req.body;
    if (!Array.isArray(receipts) || !receipts.length) throw httpError(400, 'Select at least one receipt');
    let n = 0;
    for (const r of receipts) n += db.prepare('UPDATE fee_payments SET reconciled_on = NULL, bank_ref = NULL, reconciled_by = NULL WHERE receipt_no = ?').run(r).changes ? 1 : 0;
    res.json({ ok: true, undone: n });
  },

  /* Block / unblock student app */
  blockCandidates(req, res) {
    const minBal = num(req.query.min_balance || 0) || 0;
    const w = ["COALESCE(s.status, 'active') = 'active'"], p = [today()];
    if (req.query.class_id) { w.push('s.class_id = ?'); p.push(req.query.class_id); }
    p.push(minBal);
    res.json(db.prepare(`
      SELECT s.id AS student_id, s.admission_no, s.full_name, c.name || ' ' || c.section AS class,
        ROUND(COALESCE((SELECT SUM(f.amount - f.paid) FROM fees f WHERE f.student_id = s.id AND (f.due_date IS NULL OR f.due_date <= ?)), 0), 2) AS overdue_balance,
        (SELECT COUNT(*) FROM users u WHERE u.linked_id = s.id AND u.role IN ('student','parent')) AS logins,
        b.reason AS blocked_reason, b.blocked_at
      FROM students s LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN fin_app_blocks b ON b.student_id = s.id
      WHERE ${w.join(' AND ')}
      GROUP BY s.id HAVING (overdue_balance > 0 AND overdue_balance >= ?) OR b.student_id IS NOT NULL
      ORDER BY c.name, c.section, s.full_name`).all(...p));
  },
  block(req, res) {
    const { student_ids } = req.body;
    const reason = String(req.body.reason || '').trim() || 'Fee pending';
    if (!Array.isArray(student_ids) || !student_ids.length) throw httpError(400, 'Select at least one student');
    let users = 0;
    db.transaction(() => {
      for (const id of student_ids) {
        if (!studentInfo(id)) throw httpError(404, `Student ${id} not found`);
        db.prepare(`INSERT INTO fin_app_blocks (student_id, reason, blocked_by) VALUES (?, ?, ?)
          ON CONFLICT(student_id) DO UPDATE SET reason = excluded.reason, blocked_by = excluded.blocked_by, blocked_at = CURRENT_TIMESTAMP`).run(id, reason, req.user.id);
        users += db.prepare("UPDATE users SET blocked_reason = ? WHERE linked_id = ? AND role IN ('student','parent')").run(reason, id).changes;
      }
    })();
    res.json({ ok: true, students: student_ids.length, logins_blocked: users });
  },
  unblock(req, res) {
    let users = 0;
    db.transaction(() => {
      const info = db.prepare('DELETE FROM fin_app_blocks WHERE student_id = ?').run(req.params.studentId);
      if (!info.changes) throw httpError(404, 'This student is not blocked');
      users = db.prepare("UPDATE users SET blocked_reason = NULL WHERE linked_id = ? AND role IN ('student','parent')").run(req.params.studentId).changes;
    })();
    res.json({ ok: true, logins_unblocked: users });
  },
};

// Apply an assigned discount category to one fee (once per category per fee). Returns true if applied.
function applyDiscount(feeId, d, userId) {
  const cat = master('discount-categories', d.category);
  if (!cat) return false;
  if (db.prepare('SELECT 1 FROM fin_adjustments WHERE fee_id = ? AND type = ? AND discount_category = ?').get(feeId, 'discount', d.category)) return false;
  const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(feeId);
  const gross = fee.gross_amount ?? fee.amount;
  let value = cat.discount_type === 'Flat' ? num(cat.value) : (gross * num(cat.value)) / 100;
  value = round2(Math.min(value, fee.amount - (fee.paid || 0)));
  if (!(value > 0)) return false;
  fees.adjustFee({ fee_id: feeId, type: 'discount', amount: value, reason: d.reason, approved_by: d.approved_by, discount_category: d.category, userId });
  return true;
}

/* ---------- Reports ---------- */
const P = {
  from: { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
  to: { name: 'to', label: 'To', type: 'date', default: 'today' },
  cls: { name: 'class_id', label: 'Class', type: 'class' },
  session: { name: 'session', label: 'Session', type: 'text', default: 'session' },
  upto: { name: 'upto', label: 'Dues Up To', type: 'date', default: 'today' },
  mode: { name: 'mode', label: 'Mode', type: 'select', options: ['cash', 'cheque', 'online', 'card'] },
};
const money = (key, label, total = true) => ({ key, label, type: 'money', total });
const CLASS_LABEL = "c.name || ' ' || c.section";

registerReport({
  key: 'fee-userwise-entry', title: 'Userwise Fees Entry Report', group: 'Finance',
  description: 'Fees collected by each user (excludes cancelled receipts and bounced cheques).',
  params: [P.from, P.to, P.mode],
  columns: [{ key: 'user', label: 'Collected By' }, { key: 'receipts', label: 'Receipts', type: 'number', total: true },
    money('cash', 'Cash'), money('cheque', 'Cheque'), money('online', 'Online'), money('card', 'Card'), money('fine', 'Fine'), money('total', 'Total')],
  run: (p) => db.prepare(`
    SELECT COALESCE(u.full_name, 'Unknown') AS user, COUNT(DISTINCT x.receipt_no) AS receipts,
      ROUND(SUM(CASE WHEN x.mode = 'cash' THEN x.amount + x.fine ELSE 0 END), 2) AS cash,
      ROUND(SUM(CASE WHEN x.mode = 'cheque' THEN x.amount + x.fine ELSE 0 END), 2) AS cheque,
      ROUND(SUM(CASE WHEN x.mode = 'online' THEN x.amount + x.fine ELSE 0 END), 2) AS online,
      ROUND(SUM(CASE WHEN x.mode = 'card' THEN x.amount + x.fine ELSE 0 END), 2) AS card,
      ROUND(SUM(x.fine), 2) AS fine, ROUND(SUM(x.amount + x.fine), 2) AS total
    FROM fee_payments x LEFT JOIN users u ON u.id = x.received_by
    WHERE x.reversed = 0 AND date(x.paid_on, 'localtime') BETWEEN ? AND ? AND (? = '' OR x.mode = ?)
    GROUP BY x.received_by ORDER BY total DESC`).all(p.from, p.to, p.mode, p.mode),
});

registerReport({
  key: 'fee-daywise-collection', title: 'Daywise Collection Report', group: 'Finance',
  params: [P.from, P.to],
  columns: [{ key: 'day', label: 'Date', type: 'date' }, { key: 'receipts', label: 'Receipts', type: 'number', total: true },
    money('cash', 'Cash'), money('cheque', 'Cheque'), money('online', 'Online'), money('card', 'Card'), money('fine', 'Fine'), money('total', 'Total')],
  run: (p) => db.prepare(`
    SELECT date(paid_on, 'localtime') AS day, COUNT(DISTINCT receipt_no) AS receipts,
      ROUND(SUM(CASE WHEN mode = 'cash' THEN amount + fine ELSE 0 END), 2) AS cash,
      ROUND(SUM(CASE WHEN mode = 'cheque' THEN amount + fine ELSE 0 END), 2) AS cheque,
      ROUND(SUM(CASE WHEN mode = 'online' THEN amount + fine ELSE 0 END), 2) AS online,
      ROUND(SUM(CASE WHEN mode = 'card' THEN amount + fine ELSE 0 END), 2) AS card,
      ROUND(SUM(fine), 2) AS fine, ROUND(SUM(amount + fine), 2) AS total
    FROM fee_payments WHERE reversed = 0 AND date(paid_on, 'localtime') BETWEEN ? AND ?
    GROUP BY day ORDER BY day`).all(p.from, p.to),
});

const PENDING_WHERE = `ROUND(f.amount - f.paid, 2) > 0 AND (f.due_date IS NULL OR f.due_date <= ?)
  AND (? = '' OR s.class_id = ?) AND (? = '' OR f.session = ? OR f.session IS NULL)`;
const pendingArgs = (p) => [p.upto, p.class_id, p.class_id, p.session, p.session];

registerReport({
  key: 'fee-pending', title: 'Pending Fee Report', group: 'Finance',
  description: 'Students with fees due up to the chosen date.',
  params: [P.upto, P.cls, P.session],
  columns: [{ key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' }, { key: 'class', label: 'Class' },
    { key: 'father_name', label: 'Father' }, { key: 'contact', label: 'Contact' }, { key: 'finance_category', label: 'Category' },
    { key: 'items', label: 'Dues', type: 'number' }, money('due', 'Net Due'), money('paid', 'Paid'), money('balance', 'Balance')],
  run: (p) => db.prepare(`
    SELECT s.admission_no, s.full_name, ${CLASS_LABEL} AS class, s.father_name, s.contact, fp.finance_category,
      COUNT(*) AS items, ROUND(SUM(f.amount), 2) AS due, ROUND(SUM(f.paid), 2) AS paid, ROUND(SUM(f.amount - f.paid), 2) AS balance
    FROM fees f JOIN students s ON s.id = f.student_id LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN fin_student_profile fp ON fp.student_id = s.id
    WHERE ${PENDING_WHERE} GROUP BY s.id ORDER BY c.name, c.section, s.roll_no, s.full_name`).all(...pendingArgs(p)),
});

registerReport({
  key: 'fee-pending-headwise', title: 'Pending Fee Report Headwise', group: 'Finance',
  params: [P.upto, P.cls, P.session],
  columns: [{ key: 'head', label: 'Fee Head' }, { key: 'students', label: 'Students', type: 'number' },
    money('gross', 'Gross'), money('concession', 'Discount/Waived'), money('paid', 'Paid'), money('balance', 'Balance')],
  run: (p) => db.prepare(`
    SELECT COALESCE(f.head, f.term) AS head, COUNT(DISTINCT f.student_id) AS students, ROUND(SUM(${GROSS}), 2) AS gross,
      ROUND(SUM(f.discount + f.waived), 2) AS concession, ROUND(SUM(f.paid), 2) AS paid, ROUND(SUM(f.amount - f.paid), 2) AS balance
    FROM fees f JOIN students s ON s.id = f.student_id
    WHERE ${PENDING_WHERE} GROUP BY 1 ORDER BY balance DESC`).all(...pendingArgs(p)),
});

registerReport({
  key: 'fee-pending-transport', title: 'Pending Transport Fee Report', group: 'Finance',
  description: 'Unpaid transport fees (heads marked "Transport Fee? Yes" in Fee Categories).',
  params: [P.upto, P.cls, P.session],
  columns: [{ key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' }, { key: 'class', label: 'Class' },
    { key: 'route', label: 'Route' }, { key: 'pickup_stop', label: 'Stop' }, { key: 'contact', label: 'Contact' },
    money('due', 'Net Due'), money('paid', 'Paid'), money('balance', 'Balance')],
  run: (p) => {
    const heads = transportHeads();
    if (!heads.length) return [];
    return db.prepare(`
      SELECT s.admission_no, s.full_name, ${CLASS_LABEL} AS class, r.name AS route, st.pickup_stop, s.contact,
        ROUND(SUM(f.amount), 2) AS due, ROUND(SUM(f.paid), 2) AS paid, ROUND(SUM(f.amount - f.paid), 2) AS balance
      FROM fees f JOIN students s ON s.id = f.student_id LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN student_transport st ON st.student_id = s.id LEFT JOIN routes r ON r.id = st.route_id
      WHERE f.head IN (${heads.map(() => '?').join(',')}) AND ${PENDING_WHERE}
      GROUP BY s.id ORDER BY r.name, c.name, s.full_name`).all(...heads, ...pendingArgs(p));
  },
});

registerReport({
  key: 'fee-pending-installment', title: 'Pending Fee Report By Installment', group: 'Finance',
  params: [P.cls, { ...P.session, required: true }],
  columns: [{ key: 'installment', label: 'Installment' }, { key: 'due_date', label: 'Due Date', type: 'date' },
    { key: 'class', label: 'Class' }, { key: 'students', label: 'Students Pending', type: 'number', total: true },
    money('due', 'Net Due'), money('paid', 'Paid'), money('balance', 'Balance')],
  run: (p) => db.prepare(`
    SELECT i.name AS installment, i.due_date, ${CLASS_LABEL} AS class,
      SUM(CASE WHEN ROUND(f.amount - f.paid, 2) > 0 THEN 1 ELSE 0 END) AS students,
      ROUND(SUM(f.amount), 2) AS due, ROUND(SUM(f.paid), 2) AS paid, ROUND(SUM(f.amount - f.paid), 2) AS balance
    FROM fees f JOIN fin_installments i ON i.id = f.installment_id JOIN students s ON s.id = f.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE i.session = ? AND (? = '' OR s.class_id = ?)
    GROUP BY i.id, s.class_id HAVING balance > 0 ORDER BY i.sort_order, i.due_date, c.name, c.section`).all(p.session, p.class_id, p.class_id),
});

registerReport({
  key: 'fee-student-ledger', title: 'Student Ledger Report', group: 'Finance',
  description: 'Every fee due, discount, fine and payment for a student, with running balance.',
  params: [{ name: 'student_id', label: 'Student', type: 'student', required: true }],
  columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'particulars', label: 'Particulars' },
    money('debit', 'Debit (₹)'), money('credit', 'Credit (₹)'), { key: 'balance', label: 'Balance', type: 'money' }],
  run: (p) => ledgerFor(p.student_id).entries,
});

const ADJ_COLUMNS = [{ key: 'day', label: 'Date', type: 'date' }, { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' },
  { key: 'class', label: 'Class' }, { key: 'fee', label: 'Fee' }, { key: 'discount_category', label: 'Category' },
  money('amount', 'Amount'), { key: 'approved_by', label: 'Approved By' }, { key: 'reason', label: 'Reason' }, { key: 'entered_by', label: 'Entered By' }];
const adjustmentRows = (type) => (p) => db.prepare(`
  SELECT date(a.created_at, 'localtime') AS day, s.admission_no, s.full_name, ${CLASS_LABEL} AS class,
    COALESCE(f.head || ' — ', '') || f.term AS fee, a.discount_category, a.amount, a.approved_by, a.reason, u.full_name AS entered_by
  FROM fin_adjustments a JOIN fees f ON f.id = a.fee_id JOIN students s ON s.id = a.student_id
  LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN users u ON u.id = a.created_by
  WHERE a.type = ? AND date(a.created_at, 'localtime') BETWEEN ? AND ? AND (? = '' OR s.class_id = ?)
  ORDER BY a.id DESC`).all(type, p.from, p.to, p.class_id, p.class_id);
registerReport({ key: 'fee-discounts', title: 'Student Discount Reports', group: 'Finance',
  params: [{ ...P.from, default: 'yearStart' }, P.to, P.cls], columns: ADJ_COLUMNS, run: adjustmentRows('discount') });
registerReport({ key: 'fee-waivers', title: 'Waived off Fees Report', group: 'Finance',
  params: [{ ...P.from, default: 'yearStart' }, P.to, P.cls], columns: ADJ_COLUMNS, run: adjustmentRows('waiver') });

registerReport({
  key: 'fee-reconciliation', title: 'Reconciliation Report', group: 'Finance',
  params: [P.from, P.to, { name: 'state', label: 'Status', type: 'select', options: ['reconciled', 'unreconciled'] }, P.mode],
  columns: [{ key: 'receipt_no', label: 'Receipt' }, { key: 'paid_on', label: 'Received', type: 'date' }, { key: 'admission_no', label: 'Adm No' },
    { key: 'student_name', label: 'Student' }, { key: 'mode', label: 'Mode' }, { key: 'cheque_no', label: 'Cheque No' },
    money('total', 'Amount'), { key: 'reconciled_on', label: 'Bank Date', type: 'date' }, { key: 'bank_ref', label: 'Bank Ref' }],
  run: (p) => db.prepare(`${RECEIPTS_SQL}
    WHERE p.reversed = 0 AND date(p.paid_on, 'localtime') BETWEEN ? AND ? AND (? = '' OR p.mode = ?)
      AND (? = '' OR (? = 'reconciled' AND p.reconciled_on IS NOT NULL) OR (? = 'unreconciled' AND p.reconciled_on IS NULL))
    GROUP BY p.receipt_no ORDER BY MIN(p.paid_on)`).all(p.from, p.to, p.mode, p.mode, p.state, p.state, p.state)
    .map(r => ({ ...r, paid_on: localDay(r.paid_on) })),
});

registerReport({
  key: 'fee-reconciliation-headwise', title: 'Reconciliation Collection Report Headwise', group: 'Finance',
  description: 'Reconciled collections by fee head, by bank statement date.',
  params: [{ ...P.from, label: 'Bank Date From' }, { ...P.to, label: 'Bank Date To' }],
  columns: [{ key: 'head', label: 'Fee Head' }, { key: 'receipts', label: 'Receipts', type: 'number', total: true },
    money('amount', 'Fee Amount'), money('fine', 'Fine'), money('total', 'Total')],
  run: (p) => db.prepare(`
    SELECT COALESCE(f.head, f.term) AS head, COUNT(DISTINCT x.receipt_no) AS receipts, ROUND(SUM(x.amount), 2) AS amount,
      ROUND(SUM(x.fine), 2) AS fine, ROUND(SUM(x.amount + x.fine), 2) AS total
    FROM fee_payments x JOIN fees f ON f.id = x.fee_id
    WHERE x.reversed = 0 AND x.reconciled_on BETWEEN ? AND ? GROUP BY 1 ORDER BY total DESC`).all(p.from, p.to),
});

registerReport({
  key: 'fee-app-blocks', title: 'App Block Students Report', group: 'Finance',
  params: [P.cls],
  columns: [{ key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' }, { key: 'class', label: 'Class' },
    { key: 'reason', label: 'Reason' }, { key: 'blocked_by', label: 'Blocked By' }, { key: 'blocked_at', label: 'Blocked On', type: 'date' },
    money('balance', 'Current Balance')],
  run: (p) => db.prepare(`
    SELECT s.admission_no, s.full_name, ${CLASS_LABEL} AS class, b.reason, u.full_name AS blocked_by, b.blocked_at,
      ROUND(COALESCE((SELECT SUM(amount - paid) FROM fees WHERE student_id = s.id), 0), 2) AS balance
    FROM fin_app_blocks b JOIN students s ON s.id = b.student_id LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN users u ON u.id = b.blocked_by WHERE (? = '' OR s.class_id = ?) ORDER BY c.name, s.full_name`).all(p.class_id, p.class_id),
});

registerReport({
  key: 'fee-cheques', title: 'Cheque Payment Status Report', group: 'Finance',
  params: [{ ...P.from, default: 'yearStart' }, P.to, { name: 'status', label: 'Status', type: 'select', options: ['pending', 'cleared', 'bounced'] }],
  columns: [{ key: 'receipt_no', label: 'Receipt' }, { key: 'cheque_no', label: 'Cheque No' }, { key: 'cheque_bank', label: 'Bank' },
    { key: 'cheque_date', label: 'Cheque Date', type: 'date' }, { key: 'student_name', label: 'Student' }, { key: 'class', label: 'Class' },
    money('total', 'Amount'), { key: 'cheque_status', label: 'Status' }],
  run: (p) => db.prepare(`${RECEIPTS_SQL} WHERE p.mode = 'cheque' AND date(p.paid_on, 'localtime') BETWEEN ? AND ? AND (? = '' OR p.cheque_status = ?)
    GROUP BY p.receipt_no ORDER BY MIN(p.paid_on) DESC`).all(p.from, p.to, p.status, p.status),
});

/* ---------- Routes ---------- */
function register(router) {
  router.get('/finance/settings', ...admin, h.getSettings);
  router.put('/finance/settings', ...admin, safe(wrap(h.putSettings)));

  router.get('/finance/installments', ...admin, h.listInstallments);
  router.post('/finance/installments', ...admin, safe(wrap(h.saveInstallment)));
  router.put('/finance/installments/:id', ...admin, safe(wrap(h.saveInstallment)));
  router.delete('/finance/installments/:id', ...admin, safe(wrap(h.deleteInstallment)));
  router.get('/finance/structure', ...admin, safe(wrap(h.getStructure)));
  router.put('/finance/structure', ...admin, safe(wrap(h.putStructure)));
  router.post('/finance/structure/copy', ...admin, safe(wrap(h.copyStructure)));
  router.post('/finance/generate', ...admin, safe(wrap(h.generate)));

  router.get('/finance/student-dues/:studentId', auth, safe(wrap(h.studentDues)));
  router.post('/finance/collect', ...admin, safe(wrap(h.collect)));
  router.get('/finance/receipts', auth, safe(wrap(h.receipts)));
  router.get('/finance/receipt/:no', auth, safe(wrap(h.receipt)));
  router.post('/finance/receipt/:no/cancel', ...admin, safe(wrap(h.cancelReceipt)));
  router.get('/finance/ledger/:studentId', auth, safe(wrap(h.ledger)));

  router.get('/finance/cheques', ...admin, h.cheques);
  router.post('/finance/cheques/:no/clear', ...admin, safe(wrap(h.clearCheque)));
  router.post('/finance/cheques/:no/bounce', ...admin, safe(wrap(h.bounceCheque)));

  router.get('/finance/opening-balance', ...admin, safe(wrap(h.openingList)));
  router.post('/finance/opening-balance', ...admin, safe(wrap(h.openingSave)));

  router.get('/finance/student-discounts', ...admin, h.studentDiscounts);
  router.post('/finance/student-discounts', ...admin, safe(wrap(h.addStudentDiscount)));
  router.delete('/finance/student-discounts/:id', ...admin, safe(wrap(h.removeStudentDiscount)));
  router.post('/finance/adjust', ...admin, safe(wrap(h.adjust)));
  router.get('/finance/adjustments', ...admin, safe(wrap(h.adjustments)));
  router.put('/finance/student-category/:studentId', ...admin, safe(wrap(h.setCategory)));

  router.get('/finance/reconciliation', ...admin, h.reconList);
  router.post('/finance/reconciliation', ...admin, safe(wrap(h.reconcile)));
  router.post('/finance/reconciliation/undo', ...admin, safe(wrap(h.unreconcile)));

  router.get('/finance/app-blocks', ...admin, h.blockCandidates);
  router.post('/finance/app-blocks', ...admin, safe(wrap(h.block)));
  router.delete('/finance/app-blocks/:studentId', ...admin, safe(wrap(h.unblock)));
}

// Turn thrown httpError(status, msg) into JSON responses; anything else falls through to safe()/the error handler.
function wrap(fn) {
  return (req, res, next) => {
    try { return fn(req, res, next); } catch (e) { if (e.status) return sendError(res, e); throw e; }
  };
}

module.exports = { register };
