// School accounts: chart of accounts, double-entry vouchers (Receipt, Payment, Contra, Journal), automatic posting
// of fee receipts and salaries, books and final reports, and Tally Prime XML export.
const { db, ROLES, auth, role, safe, isDate, num, today, registerReport } = require('./_kit');
const events = require('../utils/events');

const admin = [auth, role(...ROLES.ADMIN)];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const httpError = (status, message) => Object.assign(new Error(message), { status });

/* ---------- Tables ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS acc_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    nature TEXT NOT NULL CHECK (nature IN ('asset','liability','income','expense')),
    tally_parent TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS acc_ledgers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    group_id INTEGER NOT NULL REFERENCES acc_groups(id),
    opening_balance REAL NOT NULL DEFAULT 0,
    opening_type TEXT NOT NULL DEFAULT 'Dr' CHECK (opening_type IN ('Dr','Cr')),
    gstin TEXT, pan TEXT, bank_account TEXT, ifsc TEXT, notes TEXT,
    system_key TEXT UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS acc_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT,
    auto_post_fees INTEGER NOT NULL DEFAULT 1,
    auto_post_payroll INTEGER NOT NULL DEFAULT 1,
    fee_cash_ledger_id INTEGER,
    fee_bank_ledger_id INTEGER,
    salary_bank_ledger_id INTEGER
  );
  INSERT OR IGNORE INTO acc_settings (id) VALUES (1);
  CREATE TABLE IF NOT EXISTS acc_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vtype TEXT NOT NULL CHECK (vtype IN ('receipt','payment','contra','journal')),
    fy TEXT NOT NULL,
    number INTEGER NOT NULL,
    voucher_no TEXT NOT NULL,
    date TEXT NOT NULL,
    narration TEXT,
    reference TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
    cancel_reason TEXT, cancelled_at TEXT, cancelled_by INTEGER,
    source_type TEXT, source_ref TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    UNIQUE (vtype, fy, number)
  );
  CREATE INDEX IF NOT EXISTS ix_acc_voucher_source ON acc_vouchers(source_type, source_ref);
  CREATE INDEX IF NOT EXISTS ix_acc_voucher_date ON acc_vouchers(date);
  CREATE TABLE IF NOT EXISTS acc_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL REFERENCES acc_vouchers(id) ON DELETE CASCADE,
    ledger_id INTEGER NOT NULL REFERENCES acc_ledgers(id),
    dr REAL NOT NULL DEFAULT 0,
    cr REAL NOT NULL DEFAULT 0,
    line_narration TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS ix_acc_lines_ledger ON acc_lines(ledger_id);
  CREATE INDEX IF NOT EXISTS ix_acc_lines_voucher ON acc_lines(voucher_id);
  CREATE TABLE IF NOT EXISTS acc_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    user_id INTEGER,
    before_json TEXT,
    after_json TEXT,
    at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Automatic posting only picks up receipts/salaries from this date; older ones are posted with a manual backfill.
try { db.exec('ALTER TABLE acc_settings ADD COLUMN auto_post_since TEXT'); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
db.prepare('UPDATE acc_settings SET auto_post_since = COALESCE(auto_post_since, ?) WHERE id = 1').run(today());
// Built-in groups are found by a stable key, so renaming them can't break automatic posting.
try { db.exec('ALTER TABLE acc_groups ADD COLUMN system_key TEXT'); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_acc_group_key ON acc_groups(system_key)');
// Only one active voucher per source: a salary voucher is cancelled and posted afresh when its slip changes.
db.exec(`DROP INDEX IF EXISTS ux_acc_voucher_source;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_acc_voucher_source_active ON acc_vouchers(source_type, source_ref) WHERE source_type IS NOT NULL AND status = 'active'`);

/* ---------- Seed chart of accounts ---------- */
const TALLY_PARENTS = {
  asset: ['Cash-in-Hand', 'Bank Accounts', 'Current Assets', 'Fixed Assets', 'Sundry Debtors', 'Deposits (Asset)', 'Loans & Advances (Asset)', 'Investments'],
  liability: ['Capital Account', 'Current Liabilities', 'Sundry Creditors', 'Duties & Taxes', 'Provisions', 'Loans (Liability)', 'Reserves & Surplus'],
  income: ['Direct Incomes', 'Indirect Incomes'],
  expense: ['Direct Expenses', 'Indirect Expenses'],
};
const SEED_GROUPS = [
  ['Cash-in-Hand', 'asset', 'Cash-in-Hand'], ['Bank Accounts', 'asset', 'Bank Accounts'],
  ['Current Assets', 'asset', 'Current Assets'], ['Fixed Assets', 'asset', 'Fixed Assets'],
  ['Sundry Debtors', 'asset', 'Sundry Debtors'], ['Deposits (Asset)', 'asset', 'Deposits (Asset)'],
  ['Loans & Advances (Asset)', 'asset', 'Loans & Advances (Asset)'],
  ['Corpus / General Fund', 'liability', 'Capital Account'], ['Current Liabilities', 'liability', 'Current Liabilities'],
  ['Sundry Creditors', 'liability', 'Sundry Creditors'], ['Duties & Taxes', 'liability', 'Duties & Taxes'],
  ['Provisions', 'liability', 'Provisions'], ['Loans (Liability)', 'liability', 'Loans (Liability)'],
  ['Fees Received in Advance', 'liability', 'Current Liabilities'],
  ['Fee Income', 'income', 'Direct Incomes'], ['Other Income', 'income', 'Indirect Incomes'],
  ['Grants & Donations', 'income', 'Indirect Incomes'],
  ['Salaries & Staff Costs', 'expense', 'Indirect Expenses'], ['Utilities', 'expense', 'Indirect Expenses'],
  ['Repairs & Maintenance', 'expense', 'Indirect Expenses'], ['Transport Expenses', 'expense', 'Indirect Expenses'],
  ['Academic Expenses', 'expense', 'Direct Expenses'], ['Administrative Expenses', 'expense', 'Indirect Expenses'],
  ['Bank & Finance Charges', 'expense', 'Indirect Expenses'],
];
// [name, group, system_key]
const SEED_LEDGERS = [
  ['Cash', 'Cash-in-Hand', 'cash'], ['School Bank Account', 'Bank Accounts', 'bank'],
  ['General Fund', 'Corpus / General Fund', null],
  ['Late Fee / Fine', 'Other Income', 'fine'], ['Fee Income (General)', 'Fee Income', 'fee_general'],
  ['Interest Received', 'Other Income', null], ['Donations Received', 'Grants & Donations', null],
  ['Salaries & Wages', 'Salaries & Staff Costs', 'salaries'],
  ['Salary Deductions Payable (PF/ESI/TDS)', 'Current Liabilities', 'salary_deductions'],
  ['Electricity Charges', 'Utilities', null], ['Water Charges', 'Utilities', null],
  ['Telephone & Internet', 'Utilities', null], ['Building Repairs & Maintenance', 'Repairs & Maintenance', null],
  ['Furniture & Equipment Repairs', 'Repairs & Maintenance', null], ['Vehicle Fuel', 'Transport Expenses', null],
  ['Vehicle Maintenance', 'Transport Expenses', null], ['Stationery & Printing', 'Administrative Expenses', null],
  ['Office Expenses', 'Administrative Expenses', null], ['Audit & Professional Fees', 'Administrative Expenses', null],
  ['Laboratory Expenses', 'Academic Expenses', null], ['Sports & Activities', 'Academic Expenses', null],
  ['Examination Expenses', 'Academic Expenses', null], ['Bank Charges', 'Bank & Finance Charges', null],
];
const groupKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
(function seed() {
  // Key existing built-in groups (sort_order is the seed position and never changes, so renamed ones are found too).
  const key = db.prepare(`UPDATE acc_groups SET system_key = ? WHERE id = (SELECT id FROM acc_groups WHERE builtin = 1 AND system_key IS NULL
    AND (name = ? OR sort_order = ?) ORDER BY name = ? DESC, id LIMIT 1) AND NOT EXISTS (SELECT 1 FROM acc_groups WHERE system_key = ?)`);
  const g = db.prepare(`INSERT OR IGNORE INTO acc_groups (name, nature, tally_parent, builtin, sort_order, system_key) SELECT ?, ?, ?, 1, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM acc_groups WHERE system_key = ?)`);
  SEED_GROUPS.forEach(([name, nature, parent], i) => {
    const k = groupKey(name);
    key.run(k, name, i, name, k);
    g.run(name, nature, parent, i, k, k);
  });
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM acc_ledgers').get();
  if (!c) {
    const l = db.prepare('INSERT OR IGNORE INTO acc_ledgers (name, group_id, system_key) VALUES (?, (SELECT id FROM acc_groups WHERE name = ?), ?)');
    for (const [name, group, key] of SEED_LEDGERS) l.run(name, group, key);
  }
  const s = db.prepare('SELECT * FROM acc_settings WHERE id = 1').get();
  const sys = (k) => db.prepare('SELECT id FROM acc_ledgers WHERE system_key = ?').get(k)?.id || null;
  db.prepare(`UPDATE acc_settings SET fee_cash_ledger_id = COALESCE(fee_cash_ledger_id, ?), fee_bank_ledger_id = COALESCE(fee_bank_ledger_id, ?),
    salary_bank_ledger_id = COALESCE(salary_bank_ledger_id, ?) WHERE id = 1`).run(sys('cash'), sys('bank'), sys('bank'));
  return s;
})();

/* ---------- Helpers ---------- */
const settings = () => db.prepare('SELECT * FROM acc_settings WHERE id = 1').get();
const companyName = () => settings().company_name
  || db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get()?.school_name || 'School';

// Indian financial year (April–March) of a date, e.g. 2026-10-24 → "2026-27".
function fyOf(date) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const fyRange = (fy) => { const s = Number(fy.slice(0, 4)); return { from: `${s}-04-01`, to: `${s + 1}-03-31` }; };
const PREFIX = { receipt: 'RV', payment: 'PV', contra: 'CV', journal: 'JV' };
const TYPES = Object.keys(PREFIX);
const TYPE_LABEL = { receipt: 'Receipt', payment: 'Payment', contra: 'Contra', journal: 'Journal' };

const LEDGER_SQL = `SELECT l.*, g.name AS group_name, g.nature, g.tally_parent,
  CASE g.tally_parent WHEN 'Cash-in-Hand' THEN 'cash' WHEN 'Bank Accounts' THEN 'bank' ELSE NULL END AS kind
  FROM acc_ledgers l JOIN acc_groups g ON g.id = l.group_id`;
const ledgerById = (id) => db.prepare(`${LEDGER_SQL} WHERE l.id = ?`).get(id);
const isCashBank = (l) => l && (l.kind === 'cash' || l.kind === 'bank');
const openingSigned = (l) => round2(l.opening_type === 'Cr' ? -l.opening_balance : l.opening_balance);

function ledgerByName(name, groupName) {
  if (db.prepare('SELECT 1 FROM acc_groups WHERE name = ?').get(name)) name = `${name} (Fee)`;
  const found = db.prepare('SELECT id FROM acc_ledgers WHERE name = ?').get(name);
  if (found) return found.id;
  const g = db.prepare('SELECT id FROM acc_groups WHERE system_key = ?').get(groupKey(groupName));
  if (!g) throw new Error(`Built-in group "${groupName}" is missing`);
  return db.prepare('INSERT INTO acc_ledgers (name, group_id) VALUES (?, ?)').run(name, g.id).lastInsertRowid;
}
const systemLedger = (key) => db.prepare('SELECT id FROM acc_ledgers WHERE system_key = ?').get(key)?.id;

function nextNumber(vtype, fy) {
  return (db.prepare('SELECT COALESCE(MAX(number), 0) AS n FROM acc_vouchers WHERE vtype = ? AND fy = ?').get(vtype, fy).n) + 1;
}
const formatNo = (vtype, fy, n) => `${PREFIX[vtype]}/${fy}/${String(n).padStart(4, '0')}`;

// Validates and normalises lines; returns [{ ledger_id, dr, cr, line_narration }].
function checkVoucher(vtype, date, lines) {
  if (!TYPES.includes(vtype)) throw httpError(400, 'Voucher type must be receipt, payment, contra or journal');
  if (!isDate(date)) throw httpError(400, 'Date must be YYYY-MM-DD');
  if (date > today()) throw httpError(400, 'Voucher date cannot be in the future');
  if (!Array.isArray(lines)) throw httpError(400, 'Add the voucher lines');
  const out = [];
  for (const raw of lines) {
    const dr = round2(raw.dr || 0), cr = round2(raw.cr || 0);
    if (!raw.ledger_id && !dr && !cr) continue; // blank grid row
    if (!raw.ledger_id) throw httpError(400, 'Every line with an amount needs a ledger');
    if (!(dr >= 0) || !(cr >= 0) || Number.isNaN(dr) || Number.isNaN(cr)) throw httpError(400, 'Amounts must be positive numbers');
    if ((dr > 0) === (cr > 0)) throw httpError(400, 'Each line must have either a Debit or a Credit amount');
    const l = ledgerById(raw.ledger_id);
    if (!l) throw httpError(400, `Ledger ${raw.ledger_id} not found`);
    if (!l.active) throw httpError(400, `Ledger "${l.name}" is inactive`);
    out.push({ ledger_id: l.id, dr, cr, line_narration: raw.line_narration ? String(raw.line_narration).slice(0, 200) : null, ledger: l });
  }
  if (out.length < 2) throw httpError(400, 'A voucher needs at least two lines');
  const dr = round2(out.reduce((a, x) => a + x.dr, 0)), cr = round2(out.reduce((a, x) => a + x.cr, 0));
  if (dr !== cr) throw httpError(400, `Debit (₹${dr}) and Credit (₹${cr}) totals must be equal`);
  if (!(dr > 0)) throw httpError(400, 'Voucher total must be more than zero');
  const cb = (x) => isCashBank(x.ledger);
  if (vtype === 'receipt' && !out.some(x => cb(x) && x.dr > 0)) throw httpError(400, 'A Receipt must debit a Cash or Bank ledger');
  if (vtype === 'payment' && !out.some(x => cb(x) && x.cr > 0)) throw httpError(400, 'A Payment must credit a Cash or Bank ledger');
  if (vtype === 'contra' && !out.every(cb)) throw httpError(400, 'A Contra voucher can only use Cash and Bank ledgers');
  if (vtype === 'journal' && out.some(cb)) throw httpError(400, 'A Journal cannot use Cash or Bank ledgers; use Receipt, Payment or Contra');
  return out;
}

function insertVoucher({ vtype, date, narration, reference, attachment_url, lines, userId, source_type = null, source_ref = null }) {
  const fy = fyOf(date);
  const number = nextNumber(vtype, fy);
  const info = db.prepare(`INSERT INTO acc_vouchers (vtype, fy, number, voucher_no, date, narration, reference, attachment_url, source_type, source_ref, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(vtype, fy, number, formatNo(vtype, fy, number), date,
    narration || null, reference || null, attachment_url || null, source_type, source_ref, userId || null);
  const ins = db.prepare('INSERT INTO acc_lines (voucher_id, ledger_id, dr, cr, line_narration, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  lines.forEach((x, i) => ins.run(info.lastInsertRowid, x.ledger_id, x.dr, x.cr, x.line_narration || null, i));
  return info.lastInsertRowid;
}

function voucherFull(id) {
  const v = db.prepare(`SELECT v.*, u.full_name AS created_by_name, cu.full_name AS cancelled_by_name FROM acc_vouchers v
    LEFT JOIN users u ON u.id = v.created_by LEFT JOIN users cu ON cu.id = v.cancelled_by WHERE v.id = ?`).get(id);
  if (!v) return null;
  v.lines = db.prepare(`SELECT al.*, l.name AS ledger_name, g.name AS group_name FROM acc_lines al
    JOIN acc_ledgers l ON l.id = al.ledger_id JOIN acc_groups g ON g.id = l.group_id WHERE al.voucher_id = ? ORDER BY al.sort_order, al.id`).all(id);
  v.total = round2(v.lines.reduce((a, x) => a + x.dr, 0));
  return v;
}

/* ---------- Automatic posting from Fees and Payroll ---------- */
const RECEIPT_ROWS = `SELECT p.*, f.head, f.term, s.full_name AS student_name, s.admission_no
  FROM fee_payments p JOIN fees f ON f.id = p.fee_id LEFT JOIN students s ON s.id = p.student_id WHERE p.receipt_no = ?`;
const localDay = (iso) => db.prepare("SELECT date(?, 'localtime') AS d").get(iso).d;

function feeLines(rows) {
  const byHead = {};
  let fine = 0, total = 0;
  for (const r of rows) {
    const head = r.head || 'Fee Income (General)';
    byHead[head] = round2((byHead[head] || 0) + r.amount);
    fine = round2(fine + (r.fine || 0));
    total = round2(total + r.amount + (r.fine || 0));
  }
  const income = Object.entries(byHead).filter(([, a]) => a > 0)
    .map(([head, amount]) => ({ ledger_id: head === 'Fee Income (General)' ? systemLedger('fee_general') : ledgerByName(head, 'Fee Income'), amount }));
  if (fine > 0) income.push({ ledger_id: systemLedger('fine'), amount: fine });
  return { income, total };
}

// A Cash/Bank ledger chosen in Settings, checked so a missing one is reported by name instead of failing on the insert.
function settingsLedger(id, what) {
  if (!id || !ledgerById(id)) throw new Error(`the ${what} ledger chosen in Accounts Settings no longer exists`);
  return id;
}

// Posts a fee receipt as a Receipt voucher (once). Returns true when a voucher was created.
function postReceipt(receiptNo) {
  if (db.prepare("SELECT 1 FROM acc_vouchers WHERE source_type = 'fee_receipt' AND source_ref = ?").get(receiptNo)) return false;
  const rows = db.prepare(RECEIPT_ROWS).all(receiptNo);
  if (!rows.length) return false;
  // A receipt already reversed before it was ever posted had no lasting effect on the books.
  if (rows.every(r => r.reversed)) return false;
  const s = settings();
  const { income, total } = feeLines(rows);
  if (!(total > 0)) return false;
  const first = rows[0];
  const day = localDay(first.paid_on);
  if (!isDate(day)) throw new Error(`receipt ${receiptNo} has an invalid date "${first.paid_on}"`);
  const cashBank = first.mode === 'cash' ? settingsLedger(s.fee_cash_ledger_id, 'fee cash') : settingsLedger(s.fee_bank_ledger_id, 'fee bank');
  const lines = [{ ledger_id: cashBank, dr: total, cr: 0 }, ...income.map(x => ({ ledger_id: x.ledger_id, dr: 0, cr: x.amount }))];
  const ref = first.mode === 'cheque' ? [first.cheque_no, first.cheque_bank].filter(Boolean).join(' / ') : (first.remarks || null);
  insertVoucher({
    vtype: 'receipt', date: day, lines, userId: first.received_by,
    narration: `Fee receipt ${receiptNo} — ${first.student_name || 'Student'} (${first.admission_no || '—'}), ${first.mode}`,
    reference: ref, source_type: 'fee_receipt', source_ref: receiptNo,
  });
  return true;
}

// A cancelled receipt or bounced cheque is reversed by a dated Payment voucher, keeping the original intact.
function postReversal(receiptNo) {
  if (db.prepare("SELECT 1 FROM acc_vouchers WHERE source_type = 'fee_reversal' AND source_ref = ?").get(receiptNo)) return false;
  const orig = db.prepare("SELECT * FROM acc_vouchers WHERE source_type = 'fee_receipt' AND source_ref = ? AND status = 'active'").get(receiptNo);
  if (!orig) return false;
  const rows = db.prepare(RECEIPT_ROWS).all(receiptNo);
  if (!rows.length || !rows.every(r => r.reversed)) return false;
  const lines = db.prepare('SELECT ledger_id, dr, cr FROM acc_lines WHERE voucher_id = ? ORDER BY sort_order').all(orig.id)
    .map(l => ({ ledger_id: l.ledger_id, dr: l.cr, cr: l.dr }));
  const r = rows[0];
  const day = r.reversed_on ? localDay(r.reversed_on) : today();
  const why = r.cheque_status === 'bounced' ? 'cheque bounced' : 'receipt cancelled';
  insertVoucher({
    vtype: 'payment', date: day > orig.date ? day : orig.date, lines, userId: null,
    narration: `Reversal of ${receiptNo} (${orig.voucher_no}) — ${why}${r.reverse_reason ? ': ' + r.reverse_reason : ''}`,
    reference: orig.voucher_no, source_type: 'fee_reversal', source_ref: receiptNo,
  });
  return true;
}

// Salary paid → Payment voucher: Dr Salaries (gross), Cr Bank (net), Cr Deductions Payable.
// Returns what the slip's voucher should be, or null when the slip should have none.
function salaryPlan(p) {
  if (!p || p.status !== 'paid' || !(p.net_pay > 0)) return null;
  const deductions = round2(p.deductions || 0);
  const gross = round2(p.net_pay + deductions);
  const lines = [{ ledger_id: systemLedger('salaries'), dr: gross, cr: 0 },
    { ledger_id: settingsLedger(settings().salary_bank_ledger_id, 'salary bank'), dr: 0, cr: round2(p.net_pay) }];
  if (deductions > 0) lines.push({ ledger_id: systemLedger('salary_deductions'), dr: 0, cr: deductions });
  // Slips marked paid without a date are dated the last day of their salary month.
  const monthEnd = /^\d{4}-\d{2}$/.test(p.month || '') ? db.prepare("SELECT date(? || '-01', '+1 month', '-1 day') AS d").get(p.month).d : today();
  const day = isDate(p.paid_on) ? p.paid_on : (p.paid_on ? localDay(p.paid_on) : monthEnd);
  if (!isDate(day)) throw new Error(`salary slip ${p.id} has an invalid paid date "${p.paid_on}"`);
  return { date: day > today() ? today() : day, capped: day > today(), lines, gross, deductions };
}
// Whether a posted salary voucher still matches the slip (a future paid date is posted as today, so any date up to it matches).
function salaryMatches(v, plan) {
  const lines = db.prepare('SELECT ledger_id, dr, cr FROM acc_lines WHERE voucher_id = ?').all(v.id);
  const ded = systemLedger('salary_deductions');
  const gross = round2(lines.reduce((a, l) => a + l.dr, 0));
  const deductions = round2(lines.filter(l => l.ledger_id === ded).reduce((a, l) => a + l.cr, 0));
  return gross === plan.gross && deductions === plan.deductions && (v.date === plan.date || (plan.capped && v.date <= plan.date));
}
// Keeps a slip's salary voucher in step with Payroll: posts it when paid; cancels it (and posts afresh if still paid) when
// the slip goes back to pending, is deleted, or its amounts or date change. A voucher cancelled by hand in Accounts is
// not posted again until the slip itself changes. Returns true when a voucher was created.
function postSalary(payrollId, userId = null) {
  const ref = String(payrollId);
  const p = db.prepare(`SELECT p.*, t.full_name, t.employee_no FROM payroll p JOIN teachers t ON t.id = p.teacher_id WHERE p.id = ?`).get(payrollId);
  const plan = salaryPlan(p);
  const active = db.prepare("SELECT * FROM acc_vouchers WHERE source_type = 'salary' AND source_ref = ? AND status = 'active'").get(ref);
  if (active) {
    if (plan && salaryMatches(active, plan)) return false;
    const reason = !p ? 'salary slip deleted in Payroll' : !plan ? 'salary slip no longer paid in Payroll' : 'salary slip changed in Payroll';
    const before = JSON.stringify(voucherFull(active.id));
    db.prepare("UPDATE acc_vouchers SET status = 'cancelled', cancel_reason = ?, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = NULL WHERE id = ?").run(reason, active.id);
    db.prepare('INSERT INTO acc_audit (voucher_id, action, user_id, before_json) VALUES (?, ?, ?, ?)').run(active.id, `cancelled: ${reason}`, userId, before);
  }
  if (!plan) return false;
  const last = db.prepare("SELECT * FROM acc_vouchers WHERE source_type = 'salary' AND source_ref = ? ORDER BY id DESC LIMIT 1").get(ref);
  if (!active && last?.cancelled_by && salaryMatches(last, plan)) return false;
  insertVoucher({
    vtype: 'payment', date: plan.date, lines: plan.lines, userId: null,
    narration: `Salary ${p.month} — ${p.full_name} (${p.employee_no})`, source_type: 'salary', source_ref: ref,
  });
  return true;
}
// Paid slips with no salary voucher in the books (one cancelled by hand in Accounts counts as dealt with).
const UNPOSTED_SALARY = `p.status = 'paid' AND NOT EXISTS (SELECT 1 FROM acc_vouchers v WHERE v.source_type = 'salary' AND v.source_ref = CAST(p.id AS TEXT)
  AND (v.status = 'active' OR v.cancelled_by IS NOT NULL))`;

const tx = (fn) => db.transaction(fn);
// Posts one item in its own savepoint, so one bad receipt or slip is skipped and logged (once per error) instead of
// rolling back everything else in the sweep.
const failures = new Map();
function attempt(what, fn) {
  try {
    const r = tx(fn)();
    failures.delete(what);
    return r;
  } catch (e) {
    if (failures.get(what) !== e.message) console.error(`accounts: could not post ${what}: ${e.message}`);
    failures.set(what, e.message);
    return null;
  }
}

function syncRange(from, to) {
  const out = { receipts: 0, reversals: 0, salaries: 0, failed: [] };
  const run = (what, fn) => {
    const r = attempt(what, fn);
    if (r === null) out.failed.push(`${what}: ${failures.get(what)}`);
    return r;
  };
  tx(() => {
    const receipts = db.prepare(`SELECT receipt_no, MIN(paid_on) AS paid_on, MIN(reversed) AS all_reversed FROM fee_payments
      GROUP BY receipt_no HAVING date(MIN(paid_on), 'localtime') BETWEEN ? AND ? ORDER BY MIN(paid_on), MIN(id)`).all(from, to);
    for (const r of receipts) {
      if (run(`receipt ${r.receipt_no}`, () => postReceipt(r.receipt_no))) out.receipts++;
      if (r.all_reversed && run(`reversal of ${r.receipt_no}`, () => postReversal(r.receipt_no))) out.reversals++;
    }
    const pays = db.prepare(`SELECT id FROM payroll WHERE status = 'paid'
      AND COALESCE(substr(paid_on, 1, 10), date(month || '-01', '+1 month', '-1 day')) BETWEEN ? AND ? ORDER BY paid_on, id`).all(from, to);
    for (const p of pays) if (run(`salary slip ${p.id}`, () => postSalary(p.id))) out.salaries++;
  })();
  return out;
}

// Posts anything since auto_post_since that isn't in the books yet. Covers receipts created without a signed-in
// request (e.g. the online payment webhook) and anything a targeted hook missed, and cancels salary vouchers whose
// slip was deleted (e.g. with its teacher), set back to pending or re-priced.
function catchUp() {
  const s = settings();
  if (!s.auto_post_fees && !s.auto_post_payroll) return;
  const since = s.auto_post_since || today();
  tx(() => {
    if (s.auto_post_fees) {
      const rows = db.prepare(`SELECT receipt_no, MIN(reversed) AS all_reversed FROM fee_payments
        WHERE date(paid_on, 'localtime') >= ? GROUP BY receipt_no`).all(since);
      for (const r of rows) {
        attempt(`receipt ${r.receipt_no}`, () => postReceipt(r.receipt_no));
        if (r.all_reversed) attempt(`reversal of ${r.receipt_no}`, () => postReversal(r.receipt_no));
      }
    }
    if (s.auto_post_payroll) {
      const stale = db.prepare(`SELECT v.source_ref AS id FROM acc_vouchers v LEFT JOIN payroll p ON CAST(p.id AS TEXT) = v.source_ref
        WHERE v.source_type = 'salary' AND v.status = 'active' AND (p.id IS NULL OR p.status <> 'paid'
          OR ROUND(p.net_pay + COALESCE(p.deductions, 0), 2) <> (SELECT ROUND(SUM(dr), 2) FROM acc_lines WHERE voucher_id = v.id))`).all();
      const unposted = db.prepare(`SELECT p.id FROM payroll p WHERE ${UNPOSTED_SALARY}
        AND COALESCE(substr(p.paid_on, 1, 10), date(p.month || '-01', '+1 month', '-1 day')) >= ?`).all(since);
      for (const p of [...stale, ...unposted]) attempt(`salary slip ${p.id}`, () => postSalary(Number(p.id)));
    }
  })();
}
setInterval(() => { try { catchUp(); } catch (e) { console.error('accounts catch-up failed:', e.message); } }, 60 * 1000).unref();

events.on('api:change', ({ method, path, body, user, result }) => {
  try {
    const s = settings();
    if (s.auto_post_fees) {
      if (method === 'POST' && path === '/api/finance/collect' && result?.receipt_no) attempt(`receipt ${result.receipt_no}`, () => postReceipt(result.receipt_no));
      const pay = path.match(/^\/api\/fees\/\d+\/pay$/);
      if (method === 'POST' && pay && result?.receipt) attempt(`receipt ${result.receipt}`, () => postReceipt(result.receipt));
      const rev = path.match(/^\/api\/finance\/(?:receipt|cheques)\/([^/]+)\/(?:cancel|bounce)$/);
      if (method === 'POST' && rev) { const no = decodeURIComponent(rev[1]); attempt(`reversal of ${no}`, () => postReversal(no)); }
    }
    if (s.auto_post_payroll) {
      if (method === 'POST' && path === '/api/pay/mark-paid' && Array.isArray(body?.ids)) {
        for (const id of body.ids) attempt(`salary slip ${id}`, () => postSalary(Number(id), user?.id));
      }
      // Any edit or delete of a slip: status, amounts or paid date may have changed.
      const pr = path.match(/^\/api\/payroll\/(\d+)$/);
      if ((method === 'PUT' || method === 'DELETE') && pr) attempt(`salary slip ${pr[1]}`, () => postSalary(Number(pr[1]), user?.id));
    }
    // Online payments (verify / reconcile) and anything else money-related: sweep for unposted entries.
    if (/^\/api\/(payments|finance|fees|pay|payroll)(\/|$)/.test(path)) catchUp();
  } catch (e) { console.error('accounts auto-post failed:', e.message); }
});

/* ---------- Balances ---------- */
// Signed balance (Dr positive) from opening balance plus active vouchers up to `to` (inclusive), optionally from `from`.
function movement(ledgerId, from, to) {
  return round2(db.prepare(`SELECT COALESCE(SUM(al.dr - al.cr), 0) AS m FROM acc_lines al JOIN acc_vouchers v ON v.id = al.voucher_id
    WHERE al.ledger_id = ? AND v.status = 'active' AND (? = '' OR v.date >= ?) AND (? = '' OR v.date <= ?)`).get(ledgerId, from || '', from || '', to || '', to || '').m);
}
function balancesAsOn(to) {
  const ledgers = db.prepare(`${LEDGER_SQL} ORDER BY g.sort_order, g.name, l.name`).all();
  const moves = new Map(db.prepare(`SELECT al.ledger_id, ROUND(SUM(al.dr - al.cr), 2) AS m FROM acc_lines al JOIN acc_vouchers v ON v.id = al.voucher_id
    WHERE v.status = 'active' AND (? = '' OR v.date <= ?) GROUP BY al.ledger_id`).all(to || '', to || '').map(r => [r.ledger_id, r.m]));
  return ledgers.map(l => ({ ...l, balance: round2(openingSigned(l) + (moves.get(l.id) || 0)) }));
}
// Cash in hand can never be negative: a voucher that would take it below zero on its date or any later day is
// refused (it means a receipt wasn't entered, or the wrong ledger was chosen). Bank accounts may be overdrawn.
function cashShortfall(lines, date, exceptId = 0) {
  for (const x of lines) {
    if (x.ledger.kind !== 'cash') continue;
    const delta = round2(lines.filter(y => y.ledger_id === x.ledger_id).reduce((a, y) => a + y.dr - y.cr, 0));
    if (delta >= 0) continue;
    const l = ledgerById(x.ledger_id);
    const before = db.prepare(`SELECT COALESCE(SUM(al.dr - al.cr), 0) AS m FROM acc_lines al JOIN acc_vouchers v ON v.id = al.voucher_id
      WHERE al.ledger_id = ? AND v.status = 'active' AND v.id != ? AND v.date <= ?`).get(l.id, exceptId, date).m;
    let bal = round2(openingSigned(l) + before + delta), low = bal;
    for (const d of db.prepare(`SELECT ROUND(SUM(al.dr - al.cr), 2) AS m FROM acc_lines al JOIN acc_vouchers v ON v.id = al.voucher_id
      WHERE al.ledger_id = ? AND v.status = 'active' AND v.id != ? AND v.date > ? GROUP BY v.date ORDER BY v.date`).all(l.id, exceptId, date)) {
      bal = round2(bal + d.m); low = Math.min(low, bal);
    }
    if (low < 0) return `${l.name} would go below zero (₹${low.toFixed(2)}). Enter the missing receipts first, or pay from a bank ledger.`;
  }
  return null;
}
const drcr = (n) => (n >= 0 ? { dr: round2(n), cr: 0 } : { dr: 0, cr: round2(-n) });
const fmtBal = (n) => `${Math.abs(round2(n)).toFixed(2)} ${n >= 0 ? 'Dr' : 'Cr'}`;

/* ---------- Tally XML ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const envelope = (company, report, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC><REPORTNAME>${report}</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
   <REQUESTDATA>
${inner}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
function tallyMasters() {
  const groups = db.prepare('SELECT * FROM acc_groups ORDER BY sort_order, name').all()
    .filter(g => g.name !== g.tally_parent)
    .map(g => `    <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="${esc(g.name)}" ACTION="Create"><NAME.LIST><NAME>${esc(g.name)}</NAME></NAME.LIST><PARENT>${esc(g.tally_parent)}</PARENT></GROUP></TALLYMESSAGE>`);
  const ledgers = db.prepare(`${LEDGER_SQL} ORDER BY l.name`).all().map(l => {
    // Tally stores debit balances as negative numbers.
    const ob = round2(-openingSigned(l));
    return `    <TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(l.name)}" ACTION="Create"><NAME.LIST><NAME>${esc(l.name)}</NAME></NAME.LIST>`
      + `<PARENT>${esc(l.group_name)}</PARENT><OPENINGBALANCE>${ob.toFixed(2)}</OPENINGBALANCE>`
      + `${l.pan ? `<INCOMETAXNUMBER>${esc(l.pan)}</INCOMETAXNUMBER>` : ''}${l.gstin ? `<PARTYGSTIN>${esc(l.gstin)}</PARTYGSTIN>` : ''}</LEDGER></TALLYMESSAGE>`;
  });
  return envelope(companyName(), 'All Masters', [...groups, ...ledgers].join('\n'));
}
function tallyVouchers(from, to) {
  const list = db.prepare("SELECT id FROM acc_vouchers WHERE status = 'active' AND date BETWEEN ? AND ? ORDER BY date, id").all(from, to);
  const items = list.map(({ id }) => {
    const v = voucherFull(id);
    const date = v.date.replace(/-/g, '');
    const entries = v.lines.map(l => {
      const debit = l.dr > 0;
      const amt = debit ? -l.dr : l.cr;
      return `      <ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(l.ledger_name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    }).join('\n');
    return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="${TYPE_LABEL[v.vtype]}" ACTION="Create">
      <DATE>${date}</DATE><EFFECTIVEDATE>${date}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>${TYPE_LABEL[v.vtype]}</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${esc(v.voucher_no)}</VOUCHERNUMBER>
      <NARRATION>${esc([v.narration, v.reference ? `Ref: ${v.reference}` : ''].filter(Boolean).join(' | '))}</NARRATION>
${entries}
     </VOUCHER>
    </TALLYMESSAGE>`;
  });
  return { xml: envelope(companyName(), 'Vouchers', items.join('\n')), count: list.length };
}

/* ---------- Handlers ---------- */
const GROUP_FIELDS = ['name', 'nature', 'tally_parent'];
const h = {
  summary(req, res) {
    const bal = balancesAsOn(today());
    const t = today();
    const day = (vtype) => round2(db.prepare(`SELECT COALESCE(SUM(al.dr), 0) AS s FROM acc_vouchers v JOIN acc_lines al ON al.voucher_id = v.id
      WHERE v.status = 'active' AND v.vtype = ? AND v.date = ?`).get(vtype, t).s);
    const unposted = {
      receipts: db.prepare(`SELECT COUNT(DISTINCT receipt_no) AS c FROM fee_payments p WHERE p.reversed = 0
        AND NOT EXISTS (SELECT 1 FROM acc_vouchers v WHERE v.source_type = 'fee_receipt' AND v.source_ref = p.receipt_no)`).get().c,
      salaries: db.prepare(`SELECT COUNT(*) AS c FROM payroll p WHERE ${UNPOSTED_SALARY}`).get().c,
    };
    res.json({
      fy: fyOf(t),
      cash: bal.filter(l => l.kind === 'cash').map(l => ({ id: l.id, name: l.name, balance: l.balance })),
      bank: bal.filter(l => l.kind === 'bank').map(l => ({ id: l.id, name: l.name, balance: l.balance })),
      today: { receipts: day('receipt'), payments: day('payment') },
      vouchers_this_fy: db.prepare("SELECT COUNT(*) AS c FROM acc_vouchers WHERE fy = ? AND status = 'active'").get(fyOf(t)).c,
      unposted,
    });
  },
  getSettings(req, res) {
    res.json({ ...settings(), company_name_effective: companyName(), fy: fyOf(today()) });
  },
  putSettings(req, res) {
    const b = req.body || {};
    const cur = settings();
    const pick = (k) => (k in b ? b[k] : cur[k]);
    for (const k of ['fee_cash_ledger_id', 'fee_bank_ledger_id', 'salary_bank_ledger_id']) {
      if (k in b) {
        const l = ledgerById(b[k]);
        if (!isCashBank(l)) throw httpError(400, 'Choose a Cash or Bank ledger');
        if (k === 'fee_cash_ledger_id' && l.kind !== 'cash') throw httpError(400, 'Cash fee receipts need a Cash ledger');
      }
    }
    if ('auto_post_since' in b && !isDate(b.auto_post_since)) throw httpError(400, 'Auto-post start date must be YYYY-MM-DD');
    db.prepare(`UPDATE acc_settings SET company_name = ?, auto_post_fees = ?, auto_post_payroll = ?, fee_cash_ledger_id = ?, fee_bank_ledger_id = ?, salary_bank_ledger_id = ?, auto_post_since = ? WHERE id = 1`)
      .run(pick('company_name') ? String(pick('company_name')).slice(0, 120) : null, pick('auto_post_fees') ? 1 : 0, pick('auto_post_payroll') ? 1 : 0,
        pick('fee_cash_ledger_id'), pick('fee_bank_ledger_id'), pick('salary_bank_ledger_id'), pick('auto_post_since'));
    res.json({ ok: true });
  },

  groups(req, res) {
    res.json({
      tally_parents: TALLY_PARENTS,
      groups: db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM acc_ledgers l WHERE l.group_id = g.id) AS ledgers FROM acc_groups g ORDER BY
        CASE g.nature WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'income' THEN 3 ELSE 4 END, g.sort_order, g.name`).all(),
    });
  },
  saveGroup(req, res) {
    const b = req.body || {};
    const id = req.params.id ? Number(req.params.id) : null;
    const cur = id ? db.prepare('SELECT * FROM acc_groups WHERE id = ?').get(id) : null;
    if (id && !cur) throw httpError(404, 'Group not found');
    const d = { ...(cur || {}), ...Object.fromEntries(GROUP_FIELDS.filter(f => f in b).map(f => [f, b[f]])) };
    d.name = String(d.name || '').trim();
    if (!d.name) throw httpError(400, 'Group name is required');
    if (db.prepare('SELECT 1 FROM acc_ledgers WHERE name = ?').get(d.name)) throw httpError(409, 'A ledger already has this name; choose a different group name');
    if (!TALLY_PARENTS[d.nature]) throw httpError(400, 'Nature must be asset, liability, income or expense');
    if (!TALLY_PARENTS[d.nature].includes(d.tally_parent)) throw httpError(400, `Tally group for ${d.nature} must be one of: ${TALLY_PARENTS[d.nature].join(', ')}`);
    if (cur?.builtin && (d.nature !== cur.nature || d.tally_parent !== cur.tally_parent)) throw httpError(400, "A built-in group's nature and Tally group can't change");
    if (cur && d.nature !== cur.nature && db.prepare('SELECT 1 FROM acc_ledgers WHERE group_id = ?').get(id)) throw httpError(400, "Can't change the nature of a group that has ledgers");
    if (id) db.prepare('UPDATE acc_groups SET name = ?, nature = ?, tally_parent = ? WHERE id = ?').run(d.name, d.nature, d.tally_parent, id);
    else {
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM acc_groups').get().m;
      const info = db.prepare('INSERT INTO acc_groups (name, nature, tally_parent, sort_order) VALUES (?, ?, ?, ?)').run(d.name, d.nature, d.tally_parent, max + 1);
      return res.status(201).json({ id: info.lastInsertRowid });
    }
    res.json({ ok: true });
  },
  deleteGroup(req, res) {
    const g = db.prepare('SELECT * FROM acc_groups WHERE id = ?').get(req.params.id);
    if (!g) throw httpError(404, 'Group not found');
    if (g.builtin) throw httpError(400, 'Built-in groups cannot be deleted');
    if (db.prepare('SELECT 1 FROM acc_ledgers WHERE group_id = ?').get(g.id)) throw httpError(409, 'Move or delete the ledgers in this group first');
    db.prepare('DELETE FROM acc_groups WHERE id = ?').run(g.id);
    res.json({ ok: true });
  },

  ledgers(req, res) {
    const rows = balancesAsOn(isDate(req.query.as_on) ? req.query.as_on : today());
    const used = new Set(db.prepare('SELECT DISTINCT ledger_id FROM acc_lines').all().map(r => r.ledger_id));
    res.json(rows.filter(l => req.query.all === '1' || l.active).map(l => ({ ...l, in_use: used.has(l.id), balance_text: fmtBal(l.balance) })));
  },
  saveLedger(req, res) {
    const b = req.body || {};
    const id = req.params.id ? Number(req.params.id) : null;
    const cur = id ? db.prepare('SELECT * FROM acc_ledgers WHERE id = ?').get(id) : null;
    if (id && !cur) throw httpError(404, 'Ledger not found');
    const d = { ...(cur || { opening_balance: 0, opening_type: 'Dr', active: 1 }) };
    for (const f of ['name', 'group_id', 'opening_balance', 'opening_type', 'gstin', 'pan', 'bank_account', 'ifsc', 'notes', 'active']) if (f in b) d[f] = b[f] === '' ? null : b[f];
    d.name = String(d.name || '').trim();
    if (!d.name) throw httpError(400, 'Ledger name is required');
    // Tally needs ledger and group names to be different.
    if (db.prepare('SELECT 1 FROM acc_groups WHERE name = ?').get(d.name)) throw httpError(409, 'A group already has this name; choose a different ledger name');
    const g = db.prepare('SELECT * FROM acc_groups WHERE id = ?').get(d.group_id);
    if (!g) throw httpError(400, 'Choose a group');
    d.opening_balance = round2(d.opening_balance == null ? 0 : num(d.opening_balance));
    if (!(d.opening_balance >= 0)) throw httpError(400, 'Opening balance must be 0 or more (choose Dr or Cr)');
    if (!['Dr', 'Cr'].includes(d.opening_type)) throw httpError(400, 'Opening balance type must be Dr or Cr');
    if (d.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(d.pan)) throw httpError(400, 'PAN should look like ABCDE1234F');
    if (d.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/i.test(d.gstin)) throw httpError(400, 'GSTIN should be 15 characters, e.g. 03ABCDE1234F1Z5');
    if (cur?.system_key) {
      const oldG = db.prepare('SELECT nature, tally_parent FROM acc_groups WHERE id = ?').get(cur.group_id);
      if (oldG.nature !== g.nature || oldG.tally_parent !== g.tally_parent) throw httpError(400, 'This ledger is used for automatic posting; keep it in a group of the same kind');
      if (!d.active) throw httpError(400, 'This ledger is used for automatic posting and cannot be deactivated');
    }
    const vals = [d.name, d.group_id, d.opening_balance, d.opening_type, d.gstin ? String(d.gstin).toUpperCase() : null, d.pan ? String(d.pan).toUpperCase() : null,
      d.bank_account || null, d.ifsc || null, d.notes || null, d.active ? 1 : 0];
    if (id) {
      db.prepare(`UPDATE acc_ledgers SET name = ?, group_id = ?, opening_balance = ?, opening_type = ?, gstin = ?, pan = ?, bank_account = ?, ifsc = ?, notes = ?, active = ? WHERE id = ?`).run(...vals, id);
      return res.json({ ok: true });
    }
    const info = db.prepare(`INSERT INTO acc_ledgers (name, group_id, opening_balance, opening_type, gstin, pan, bank_account, ifsc, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...vals);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  deleteLedger(req, res) {
    const l = db.prepare('SELECT * FROM acc_ledgers WHERE id = ?').get(req.params.id);
    if (!l) throw httpError(404, 'Ledger not found');
    if (l.system_key) throw httpError(400, 'This ledger is used for automatic posting and cannot be deleted');
    const s = settings();
    if ([s.fee_cash_ledger_id, s.fee_bank_ledger_id, s.salary_bank_ledger_id].includes(l.id)) throw httpError(400, 'This ledger is chosen in Accounts Settings for automatic posting; choose another ledger there first');
    if (db.prepare('SELECT 1 FROM acc_lines WHERE ledger_id = ?').get(l.id)) throw httpError(409, 'This ledger has vouchers; deactivate it instead');
    db.prepare('DELETE FROM acc_ledgers WHERE id = ?').run(l.id);
    res.json({ ok: true });
  },

  vouchers(req, res) {
    const q = req.query, w = [], p = [];
    if (isDate(q.from)) { w.push('v.date >= ?'); p.push(q.from); }
    if (isDate(q.to)) { w.push('v.date <= ?'); p.push(q.to); }
    if (TYPES.includes(q.vtype)) { w.push('v.vtype = ?'); p.push(q.vtype); }
    if (['active', 'cancelled'].includes(q.status)) { w.push('v.status = ?'); p.push(q.status); }
    if (q.ledger_id) { w.push('EXISTS (SELECT 1 FROM acc_lines x WHERE x.voucher_id = v.id AND x.ledger_id = ?)'); p.push(q.ledger_id); }
    if (q.source === 'auto') w.push('v.source_type IS NOT NULL');
    if (q.source === 'manual') w.push('v.source_type IS NULL');
    if (q.q) { w.push("(v.voucher_no LIKE '%' || ? || '%' OR v.narration LIKE '%' || ? || '%' OR v.reference LIKE '%' || ? || '%')"); p.push(q.q, q.q, q.q); }
    res.json(db.prepare(`SELECT v.id, v.vtype, v.voucher_no, v.date, v.narration, v.reference, v.status, v.source_type,
      (SELECT ROUND(SUM(dr), 2) FROM acc_lines WHERE voucher_id = v.id) AS amount,
      (SELECT GROUP_CONCAT(l.name, ', ') FROM acc_lines al JOIN acc_ledgers l ON l.id = al.ledger_id WHERE al.voucher_id = v.id) AS ledgers
      FROM acc_vouchers v ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY v.date DESC, v.id DESC LIMIT 500`).all(...p));
  },
  voucher(req, res) {
    const v = voucherFull(req.params.id);
    if (!v) throw httpError(404, 'Voucher not found');
    v.audit = db.prepare(`SELECT a.action, a.at, a.before_json, a.after_json, u.full_name AS by_name FROM acc_audit a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.voucher_id = ? ORDER BY a.id`).all(v.id);
    v.school = db.prepare('SELECT school_name, address, phone, email FROM school_settings WHERE id = 1').get();
    res.json(v);
  },
  nextNo(req, res) {
    const date = isDate(req.query.date) ? req.query.date : today();
    if (!TYPES.includes(req.query.vtype)) throw httpError(400, 'vtype is required');
    const fy = fyOf(date);
    res.json({ voucher_no: formatNo(req.query.vtype, fy, nextNumber(req.query.vtype, fy)), fy });
  },
  createVoucher(req, res) {
    const b = req.body || {};
    const lines = checkVoucher(b.vtype, b.date, b.lines);
    const short = cashShortfall(lines, b.date);
    if (short) throw httpError(400, short);
    if (b.attachment_url && !/^(https?:\/\/|\/api\/files\/)/i.test(b.attachment_url)) throw httpError(400, 'Attachment must be an uploaded file or a web link');
    const id = tx(() => {
      // Only these fields: source_type/source_ref are reserved for automatic posting.
      const vid = insertVoucher({ vtype: b.vtype, date: b.date, narration: b.narration, reference: b.reference, attachment_url: b.attachment_url, lines, userId: req.user.id });
      db.prepare('INSERT INTO acc_audit (voucher_id, action, user_id, after_json) VALUES (?, ?, ?, ?)').run(vid, 'created', req.user.id, JSON.stringify(voucherFull(vid)));
      return vid;
    })();
    const v = voucherFull(id);
    res.status(201).json({ id, voucher_no: v.voucher_no });
  },
  updateVoucher(req, res) {
    const cur = voucherFull(req.params.id);
    if (!cur) throw httpError(404, 'Voucher not found');
    if (cur.status !== 'active') throw httpError(400, 'A cancelled voucher cannot be edited');
    if (cur.source_type) throw httpError(400, 'This voucher was posted automatically from Fees/Payroll; correct it there, or cancel it here');
    const b = req.body || {};
    const date = b.date || cur.date;
    if (fyOf(date) !== cur.fy) throw httpError(400, `The date must stay within financial year ${cur.fy}; cancel and re-enter it instead`);
    const lines = checkVoucher(cur.vtype, date, b.lines || cur.lines);
    const short = cashShortfall(lines, date, cur.id);
    if (short) throw httpError(400, short);
    if (b.attachment_url && !/^(https?:\/\/|\/api\/files\/)/i.test(b.attachment_url)) throw httpError(400, 'Attachment must be an uploaded file or a web link');
    tx(() => {
      db.prepare('UPDATE acc_vouchers SET date = ?, narration = ?, reference = ?, attachment_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(date, 'narration' in b ? b.narration || null : cur.narration, 'reference' in b ? b.reference || null : cur.reference,
          'attachment_url' in b ? b.attachment_url || null : cur.attachment_url, cur.id);
      db.prepare('DELETE FROM acc_lines WHERE voucher_id = ?').run(cur.id);
      const ins = db.prepare('INSERT INTO acc_lines (voucher_id, ledger_id, dr, cr, line_narration, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      lines.forEach((x, i) => ins.run(cur.id, x.ledger_id, x.dr, x.cr, x.line_narration, i));
      db.prepare('INSERT INTO acc_audit (voucher_id, action, user_id, before_json, after_json) VALUES (?, ?, ?, ?, ?)')
        .run(cur.id, 'edited', req.user.id, JSON.stringify(cur), JSON.stringify(voucherFull(cur.id)));
    })();
    res.json({ ok: true });
  },
  cancelVoucher(req, res) {
    const cur = voucherFull(req.params.id);
    if (!cur) throw httpError(404, 'Voucher not found');
    if (cur.status !== 'active') throw httpError(400, 'Voucher is already cancelled');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw httpError(400, 'A reason is required to cancel a voucher');
    const linked = (type) => db.prepare("SELECT id, voucher_no FROM acc_vouchers WHERE source_type = ? AND source_ref = ? AND status = 'active'").get(type, cur.source_ref);
    // A fee receipt and its reversal cancel each other out: cancelling the receipt cancels its reversal too, and the
    // reversal can't be cancelled alone (that would book income for a receipt cancelled in Fees).
    const reversal = cur.source_type === 'fee_receipt' ? linked('fee_reversal') : null;
    if (cur.source_type === 'fee_reversal' && linked('fee_receipt')) {
      throw httpError(400, `This reverses a receipt cancelled in Fees; cancel the original receipt voucher ${linked('fee_receipt').voucher_no} instead (its reversal is cancelled with it)`);
    }
    const cancel = (v, why) => {
      db.prepare("UPDATE acc_vouchers SET status = 'cancelled', cancel_reason = ?, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ? WHERE id = ?").run(why, req.user.id, v.id);
      db.prepare('INSERT INTO acc_audit (voucher_id, action, user_id, before_json) VALUES (?, ?, ?, ?)').run(v.id, `cancelled: ${why}`, req.user.id, JSON.stringify(v));
    };
    tx(() => {
      cancel(cur, reason);
      if (reversal) cancel(voucherFull(reversal.id), `${reason} (with ${cur.voucher_no})`);
    })();
    res.json({ ok: true, also_cancelled: reversal ? reversal.voucher_no : undefined });
  },
  sync(req, res) {
    const from = req.body?.from, to = req.body?.to;
    if (!isDate(from) || !isDate(to)) throw httpError(400, 'Choose a From and To date');
    if (from > to) throw httpError(400, 'From date must be before To date');
    res.json(syncRange(from, to));
  },
  tallyVouchers(req, res) {
    const fy = fyOf(today());
    const from = isDate(req.query.from) ? req.query.from : fyRange(fy).from;
    const to = isDate(req.query.to) ? req.query.to : today();
    if (from > to) throw httpError(400, 'From date must be before To date');
    const { xml, count } = tallyVouchers(from, to);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tally-vouchers-${from}-to-${to}.xml"`);
    res.setHeader('X-Voucher-Count', String(count));
    res.send(xml);
  },
  tallyMasters(req, res) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tally-masters.xml"');
    res.send(tallyMasters());
  },
};
const wrap = (fn) => (req, res) => {
  try { return fn(req, res); } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
};

/* ---------- Reports ---------- */
const money = (key, label, total = false) => ({ key, label, type: 'money', total });
const dateCol = { key: 'date', label: 'Date', type: 'date' };
const ledgerParam = (label = 'Ledger', filter = null) => ({
  name: 'ledger_id', label, type: 'select', required: true,
  get options() {
    return db.prepare(`${LEDGER_SQL} WHERE l.active = 1 ORDER BY l.name`).all()
      .filter(l => !filter || filter(l)).map(l => ({ value: String(l.id), label: `${l.name} (${l.group_name})` }));
  },
});
const fyParam = {
  name: 'fy', label: 'Financial Year', type: 'select', required: true,
  get default() { return fyOf(today()); },
  get options() {
    const cur = Number(fyOf(today()).slice(0, 4));
    return [0, 1, 2, 3, 4].map(i => cur - i).map(y => { const f = `${y}-${String((y + 1) % 100).padStart(2, '0')}`; return { value: f, label: f }; });
  },
};
const fyStartDefault = () => fyRange(fyOf(today())).from;
const fromTo = [{ name: 'from', label: 'From', type: 'date', get default() { return fyStartDefault(); }, required: true }, { name: 'to', label: 'To', type: 'date', default: 'today', required: true }];

// Counter-ledgers of a voucher line, e.g. "Tuition Fee, Late Fee / Fine" for the cash line of a receipt.
const OTHER_SIDE = `(SELECT GROUP_CONCAT(l2.name, ', ') FROM acc_lines o JOIN acc_ledgers l2 ON l2.id = o.ledger_id
  WHERE o.voucher_id = v.id AND o.ledger_id != al.ledger_id AND ((al.dr > 0 AND o.cr > 0) OR (al.cr > 0 AND o.dr > 0)))`;

function statement(ledgerId, from, to) {
  const l = ledgerById(ledgerId);
  if (!l) return [];
  const opening = round2(openingSigned(l) + movement(l.id, '', db.prepare("SELECT date(?, '-1 day') AS d").get(from).d));
  let bal = opening;
  const rows = [{ date: from, voucher_no: '', vtype: '', particulars: 'Opening Balance', dr: opening > 0 ? opening : 0, cr: opening < 0 ? -opening : 0, balance: fmtBal(opening) }];
  const lines = db.prepare(`SELECT v.date, v.voucher_no, v.vtype, v.narration, al.dr, al.cr, ${OTHER_SIDE} AS other FROM acc_lines al
    JOIN acc_vouchers v ON v.id = al.voucher_id WHERE al.ledger_id = ? AND v.status = 'active' AND v.date BETWEEN ? AND ? ORDER BY v.date, v.id`).all(l.id, from, to);
  for (const x of lines) {
    bal = round2(bal + x.dr - x.cr);
    rows.push({ date: x.date, voucher_no: x.voucher_no, vtype: TYPE_LABEL[x.vtype], particulars: x.other || x.narration || '', narration: x.narration, dr: x.dr, cr: x.cr, balance: fmtBal(bal) });
  }
  rows.push({ date: to, voucher_no: '', vtype: '', particulars: 'Closing Balance', dr: 0, cr: 0, balance: fmtBal(bal) });
  return rows;
}
const statementCols = [dateCol, { key: 'voucher_no', label: 'Voucher No' }, { key: 'vtype', label: 'Type' }, { key: 'particulars', label: 'Particulars' },
  money('dr', 'Debit (₹)', true), money('cr', 'Credit (₹)', true), { key: 'balance', label: 'Balance' }];

registerReport({
  key: 'acc-day-book', title: 'Day Book', group: 'Accounts', description: 'Every voucher line for the period.',
  params: [{ name: 'from', label: 'From', type: 'date', default: 'today', required: true }, { name: 'to', label: 'To', type: 'date', default: 'today', required: true },
    { name: 'vtype', label: 'Voucher Type', type: 'select', options: TYPES.map(t => ({ value: t, label: TYPE_LABEL[t] })) }],
  columns: [dateCol, { key: 'voucher_no', label: 'Voucher No' }, { key: 'vtype', label: 'Type' }, { key: 'ledger', label: 'Ledger' },
    money('dr', 'Debit (₹)', true), money('cr', 'Credit (₹)', true), { key: 'narration', label: 'Narration' }],
  run: (p) => db.prepare(`SELECT v.date, v.voucher_no, v.vtype, l.name AS ledger, al.dr, al.cr, v.narration FROM acc_lines al
    JOIN acc_vouchers v ON v.id = al.voucher_id JOIN acc_ledgers l ON l.id = al.ledger_id
    WHERE v.status = 'active' AND v.date BETWEEN ? AND ? AND (? = '' OR v.vtype = ?) ORDER BY v.date, v.id, al.sort_order`)
    .all(p.from, p.to, p.vtype, p.vtype).map(r => ({ ...r, vtype: TYPE_LABEL[r.vtype] })),
});
registerReport({
  key: 'acc-cash-book', title: 'Cash Book', group: 'Accounts', description: 'Cash receipts and payments with running balance.',
  params: [ledgerParam('Cash Ledger', l => l.kind === 'cash'), { name: 'from', label: 'From', type: 'date', get default() { return fyStartDefault(); }, required: true },
    { name: 'to', label: 'To', type: 'date', default: 'today', required: true }],
  columns: statementCols,
  run: (p) => statement(p.ledger_id, p.from, p.to),
});
registerReport({
  key: 'acc-bank-book', title: 'Bank Book', group: 'Accounts', description: 'Bank deposits and withdrawals with running balance.',
  params: [ledgerParam('Bank Ledger', l => l.kind === 'bank'), { name: 'from', label: 'From', type: 'date', get default() { return fyStartDefault(); }, required: true },
    { name: 'to', label: 'To', type: 'date', default: 'today', required: true }],
  columns: statementCols,
  run: (p) => statement(p.ledger_id, p.from, p.to),
});
registerReport({
  key: 'acc-ledger', title: 'Ledger Statement', group: 'Accounts', description: 'Any ledger with opening, entries and running balance.',
  params: [ledgerParam(), { name: 'from', label: 'From', type: 'date', get default() { return fyStartDefault(); }, required: true },
    { name: 'to', label: 'To', type: 'date', default: 'today', required: true }],
  columns: statementCols,
  run: (p) => statement(p.ledger_id, p.from, p.to),
});
registerReport({
  key: 'acc-trial-balance', title: 'Trial Balance', group: 'Accounts', description: 'Closing balance of every ledger; debit and credit totals match.',
  params: [{ name: 'as_on', label: 'As On', type: 'date', default: 'today', required: true }],
  columns: [{ key: 'group', label: 'Group' }, { key: 'ledger', label: 'Ledger' }, money('dr', 'Debit (₹)', true), money('cr', 'Credit (₹)', true)],
  run: (p) => {
    const rows = balancesAsOn(p.as_on).filter(l => l.balance !== 0).map(l => ({ group: l.group_name, ledger: l.name, ...drcr(l.balance) }));
    // Opening balances entered out of balance show up as a difference line, as in Tally.
    const diff = round2(rows.reduce((a, r) => a + r.dr - r.cr, 0));
    if (diff !== 0) rows.push({ group: '—', ledger: 'Difference in Opening Balances', ...drcr(-diff) });
    return rows;
  },
});
function incomeExpense(from, to) {
  return db.prepare(`SELECT l.name AS ledger, g.name AS grp, g.nature, ROUND(SUM(al.cr - al.dr), 2) AS net FROM acc_lines al
    JOIN acc_vouchers v ON v.id = al.voucher_id JOIN acc_ledgers l ON l.id = al.ledger_id JOIN acc_groups g ON g.id = l.group_id
    WHERE v.status = 'active' AND v.date BETWEEN ? AND ? AND g.nature IN ('income','expense') GROUP BY l.id ORDER BY g.nature DESC, g.name, l.name`).all(from, to);
}
registerReport({
  key: 'acc-income-expenditure', title: 'Income & Expenditure Account', group: 'Accounts',
  description: 'Income less expenditure for the period, with the surplus or deficit.',
  params: fromTo, columns: [{ key: 'side', label: 'Side' }, { key: 'group', label: 'Group' }, { key: 'ledger', label: 'Ledger' }, money('income', 'Income (₹)', true), money('expenditure', 'Expenditure (₹)', true)],
  run: (p) => {
    const rows = incomeExpense(p.from, p.to).filter(r => r.net !== 0).map(r => (r.nature === 'income'
      ? { side: 'Income', group: r.grp, ledger: r.ledger, income: r.net, expenditure: 0 }
      : { side: 'Expenditure', group: r.grp, ledger: r.ledger, income: 0, expenditure: -r.net }));
    const inc = round2(rows.reduce((a, r) => a + r.income, 0)), exp = round2(rows.reduce((a, r) => a + r.expenditure, 0));
    const surplus = round2(inc - exp);
    rows.push(surplus >= 0
      ? { side: 'Result', group: '', ledger: 'Excess of Income over Expenditure (Surplus)', income: 0, expenditure: surplus }
      : { side: 'Result', group: '', ledger: 'Excess of Expenditure over Income (Deficit)', income: -surplus, expenditure: 0 });
    return rows;
  },
});
registerReport({
  key: 'acc-receipts-payments', title: 'Receipts & Payments Account', group: 'Accounts',
  description: 'Cash and bank opening balances, what came in and went out by ledger, and closing balances.',
  params: fromTo, columns: [{ key: 'side', label: 'Side' }, { key: 'particulars', label: 'Particulars' }, money('receipts', 'Receipts (₹)', true), money('payments', 'Payments (₹)', true)],
  run: (p) => {
    const cb = db.prepare(`${LEDGER_SQL} WHERE g.tally_parent IN ('Cash-in-Hand','Bank Accounts') ORDER BY l.name`).all();
    const dayBefore = db.prepare("SELECT date(?, '-1 day') AS d").get(p.from).d;
    const rows = [];
    for (const l of cb) {
      const ob = round2(openingSigned(l) + movement(l.id, '', dayBefore));
      if (ob) rows.push({ side: 'Opening', particulars: `Opening balance — ${l.name}`, receipts: ob > 0 ? ob : 0, payments: ob < 0 ? -ob : 0 });
    }
    // For each cash/bank line, the other side of the voucher is what money came from or went to.
    const flows = db.prepare(`SELECT o.ledger_id, l2.name, ROUND(SUM(CASE WHEN o.cr > 0 THEN o.cr ELSE 0 END), 2) AS inflow,
        ROUND(SUM(CASE WHEN o.dr > 0 THEN o.dr ELSE 0 END), 2) AS outflow
      FROM acc_vouchers v JOIN acc_lines o ON o.voucher_id = v.id JOIN acc_ledgers l2 ON l2.id = o.ledger_id JOIN acc_groups g2 ON g2.id = l2.group_id
      WHERE v.status = 'active' AND v.date BETWEEN ? AND ? AND v.vtype IN ('receipt','payment')
        AND g2.tally_parent NOT IN ('Cash-in-Hand','Bank Accounts') GROUP BY o.ledger_id ORDER BY l2.name`).all(p.from, p.to);
    for (const f of flows) {
      if (f.inflow) rows.push({ side: 'Receipts', particulars: f.name, receipts: f.inflow, payments: 0 });
      if (f.outflow) rows.push({ side: 'Payments', particulars: f.name, receipts: 0, payments: f.outflow });
    }
    for (const l of cb) {
      const cl = round2(openingSigned(l) + movement(l.id, '', p.to));
      if (cl) rows.push({ side: 'Closing', particulars: `Closing balance — ${l.name}`, receipts: cl < 0 ? -cl : 0, payments: cl > 0 ? cl : 0 });
    }
    return rows;
  },
});
registerReport({
  key: 'acc-balance-sheet', title: 'Balance Sheet', group: 'Accounts', description: 'Assets and liabilities as on a date, with accumulated surplus.',
  params: [{ name: 'as_on', label: 'As On', type: 'date', default: 'today', required: true }],
  columns: [{ key: 'side', label: 'Side' }, { key: 'group', label: 'Group' }, { key: 'ledger', label: 'Ledger' }, money('liabilities', 'Liabilities (₹)', true), money('assets', 'Assets (₹)', true)],
  run: (p) => {
    const bal = balancesAsOn(p.as_on).filter(l => l.balance !== 0);
    const rows = [];
    for (const l of bal.filter(x => x.nature === 'liability')) rows.push({ side: 'Liabilities', group: l.group_name, ledger: l.name, liabilities: round2(-l.balance), assets: 0 });
    const surplus = round2(-bal.filter(x => x.nature === 'income' || x.nature === 'expense').reduce((a, l) => a + l.balance, 0));
    if (surplus) rows.push({ side: 'Liabilities', group: 'Income & Expenditure', ledger: surplus >= 0 ? 'Excess of Income over Expenditure' : 'Excess of Expenditure over Income', liabilities: surplus, assets: 0 });
    for (const l of bal.filter(x => x.nature === 'asset')) rows.push({ side: 'Assets', group: l.group_name, ledger: l.name, liabilities: 0, assets: l.balance });
    const diff = round2(rows.reduce((a, r) => a + r.assets - r.liabilities, 0));
    if (diff) rows.push({ side: 'Liabilities', group: '—', ledger: 'Difference in Opening Balances', liabilities: diff > 0 ? diff : 0, assets: diff < 0 ? -diff : 0 });
    return rows;
  },
});
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
registerReport({
  key: 'acc-expense-monthly', title: 'Monthly Expenses by Head', group: 'Accounts', description: 'Each expense ledger month by month for a financial year.',
  params: [fyParam],
  columns: [{ key: 'ledger', label: 'Expense Head' }, ...MONTHS.map((m, i) => money(`m${i}`, m, true)), money('total', 'Total', true)],
  run: (p) => {
    const { from, to } = fyRange(p.fy || fyOf(today()));
    const rows = db.prepare(`SELECT l.name AS ledger, substr(v.date, 1, 7) AS ym, ROUND(SUM(al.dr - al.cr), 2) AS amt FROM acc_lines al
      JOIN acc_vouchers v ON v.id = al.voucher_id JOIN acc_ledgers l ON l.id = al.ledger_id JOIN acc_groups g ON g.id = l.group_id
      WHERE v.status = 'active' AND g.nature = 'expense' AND v.date BETWEEN ? AND ? GROUP BY l.id, ym ORDER BY l.name`).all(from, to);
    const by = {};
    for (const r of rows) {
      const o = (by[r.ledger] ||= { ledger: r.ledger, total: 0, ...Object.fromEntries(MONTHS.map((_, i) => [`m${i}`, 0])) });
      const m = Number(r.ym.slice(5, 7));
      const idx = m >= 4 ? m - 4 : m + 8;
      o[`m${idx}`] = round2(o[`m${idx}`] + r.amt);
      o.total = round2(o.total + r.amt);
    }
    return Object.values(by);
  },
});

function register(router) {
  router.get('/accounts/summary', ...admin, wrap(h.summary));
  router.get('/accounts/settings', ...admin, wrap(h.getSettings));
  router.put('/accounts/settings', ...admin, safe(wrap(h.putSettings)));
  router.get('/accounts/groups', ...admin, wrap(h.groups));
  router.post('/accounts/groups', ...admin, safe(wrap(h.saveGroup)));
  router.put('/accounts/groups/:id', ...admin, safe(wrap(h.saveGroup)));
  router.delete('/accounts/groups/:id', ...admin, safe(wrap(h.deleteGroup)));
  router.get('/accounts/ledgers', ...admin, wrap(h.ledgers));
  router.post('/accounts/ledgers', ...admin, safe(wrap(h.saveLedger)));
  router.put('/accounts/ledgers/:id', ...admin, safe(wrap(h.saveLedger)));
  router.delete('/accounts/ledgers/:id', ...admin, safe(wrap(h.deleteLedger)));
  router.get('/accounts/next-number', ...admin, wrap(h.nextNo));
  router.get('/accounts/vouchers', ...admin, wrap(h.vouchers));
  router.get('/accounts/vouchers/:id', ...admin, wrap(h.voucher));
  router.post('/accounts/vouchers', ...admin, safe(wrap(h.createVoucher)));
  router.put('/accounts/vouchers/:id', ...admin, safe(wrap(h.updateVoucher)));
  router.post('/accounts/vouchers/:id/cancel', ...admin, safe(wrap(h.cancelVoucher)));
  router.post('/accounts/sync', ...admin, safe(wrap(h.sync)));
  router.get('/accounts/tally/vouchers.xml', ...admin, wrap(h.tallyVouchers));
  router.get('/accounts/tally/masters.xml', ...admin, wrap(h.tallyMasters));
}

module.exports = { register, fyOf, syncRange, catchUp };
