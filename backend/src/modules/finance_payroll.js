// Payroll: statutory settings (PF/ESI), salary structure, bulk slip generation, salary slips, Form 16, reports.
const { db, ROLES, auth, role, safe, num, badUrl, today, registerReport } = require('./_kit');
const { round2, httpError, sendError } = require('../controllers/feesController');

const admin = [auth, role(...ROLES.ADMIN)];
const staff = [auth, role(...ROLES.STAFF)];

db.exec(`
  CREATE TABLE IF NOT EXISTS pay_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pf_employee_rate REAL NOT NULL DEFAULT 12,
    pf_employer_rate REAL NOT NULL DEFAULT 12,
    eps_rate REAL NOT NULL DEFAULT 8.33,
    pf_wage_ceiling REAL NOT NULL DEFAULT 15000,
    pf_apply_ceiling INTEGER NOT NULL DEFAULT 1,
    esi_employee_rate REAL NOT NULL DEFAULT 0.75,
    esi_employer_rate REAL NOT NULL DEFAULT 3.25,
    esi_gross_ceiling REAL NOT NULL DEFAULT 21000
  );
  INSERT OR IGNORE INTO pay_settings (id) VALUES (1);
  CREATE TABLE IF NOT EXISTS pay_structure (
    teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
    basic REAL NOT NULL DEFAULT 0,
    da REAL NOT NULL DEFAULT 0,
    hra REAL NOT NULL DEFAULT 0,
    conveyance REAL NOT NULL DEFAULT 0,
    other_allowance REAL NOT NULL DEFAULT 0,
    tds REAL NOT NULL DEFAULT 0,
    other_deduction REAL NOT NULL DEFAULT 0,
    pf_applicable INTEGER NOT NULL DEFAULT 1,
    esi_applicable INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS pay_slip_details (
    payroll_id INTEGER PRIMARY KEY REFERENCES payroll(id) ON DELETE CASCADE,
    days_in_month INTEGER, lop_days REAL NOT NULL DEFAULT 0,
    da REAL NOT NULL DEFAULT 0, hra REAL NOT NULL DEFAULT 0, conveyance REAL NOT NULL DEFAULT 0, other_allowance REAL NOT NULL DEFAULT 0,
    pf REAL NOT NULL DEFAULT 0, esi REAL NOT NULL DEFAULT 0, tds REAL NOT NULL DEFAULT 0, other_deduction REAL NOT NULL DEFAULT 0,
    pf_wage REAL NOT NULL DEFAULT 0, employer_pf REAL NOT NULL DEFAULT 0, employer_eps REAL NOT NULL DEFAULT 0, employer_esi REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS pay_form16 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    financial_year TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT,
    remarks TEXT,
    uploaded_by INTEGER,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, financial_year)
  );
`);

const settings = () => db.prepare('SELECT * FROM pay_settings WHERE id = 1').get();
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
const isFy = (fy) => /^\d{4}-\d{2}$/.test(fy || '') && Number(fy.slice(5)) === (Number(fy.slice(0, 4)) + 1) % 100;
const daysIn = (month) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

// Statutory amounts for one month's earnings.
function statutory(basic, gross, s = settings(), { pf = true, esi = true } = {}) {
  const pfWage = pf ? (s.pf_apply_ceiling && s.pf_wage_ceiling > 0 ? Math.min(basic, s.pf_wage_ceiling) : basic) : 0;
  const employeePf = Math.round((pfWage * s.pf_employee_rate) / 100);
  const employerTotal = Math.round((pfWage * s.pf_employer_rate) / 100);
  const eps = Math.min(employerTotal, Math.round((pfWage * s.eps_rate) / 100));
  const esiOn = esi && gross > 0 && gross <= s.esi_gross_ceiling;
  return {
    pf_wage: round2(pfWage), pf: employeePf, employer_eps: eps, employer_pf: employerTotal - eps,
    // ESIC rounds contributions up to the next rupee.
    esi: esiOn ? Math.ceil((gross * s.esi_employee_rate) / 100) : 0,
    employer_esi: esiOn ? Math.ceil((gross * s.esi_employer_rate) / 100) : 0,
  };
}

function fyMonths(fy) {
  const y = Number(fy.slice(0, 4));
  return [...Array(12)].map((_, i) => { const m = ((3 + i) % 12) + 1; return `${m >= 4 ? y : y + 1}-${String(m).padStart(2, '0')}`; });
}
function currentFy() {
  const t = today(), y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const fyOptions = () => { const s = Number(currentFy().slice(0, 4)); return [...Array(6)].map((_, i) => `${s - i}-${String((s - i + 1) % 100).padStart(2, '0')}`); };

const wrap = (fn) => (req, res, next) => {
  try { return fn(req, res, next); } catch (e) { if (e.status) return sendError(res, e); throw e; }
};
const ownOrAdmin = (req, teacherId) => req.user.role === 'admin' || (req.user.role === 'teacher' && Number(teacherId) === Number(req.user.linked_id));

const SLIP_SQL = `
  SELECT p.*, t.full_name AS teacher_name, t.employee_no, t.designation, t.department, t.joining_date, t.bank_name,
    t.bank_account, t.ifsc, t.pan_no, t.uan_no, t.esi_no,
    d.days_in_month, d.lop_days, COALESCE(d.da, 0) AS da, COALESCE(d.hra, 0) AS hra, COALESCE(d.conveyance, 0) AS conveyance,
    COALESCE(d.other_allowance, 0) AS other_allowance, COALESCE(d.pf, 0) AS pf, COALESCE(d.esi, 0) AS esi, COALESCE(d.tds, 0) AS tds,
    COALESCE(d.other_deduction, 0) AS other_deduction, COALESCE(d.pf_wage, 0) AS pf_wage, COALESCE(d.employer_pf, 0) AS employer_pf,
    COALESCE(d.employer_eps, 0) AS employer_eps, COALESCE(d.employer_esi, 0) AS employer_esi, (d.payroll_id IS NOT NULL) AS has_details
  FROM payroll p JOIN teachers t ON t.id = p.teacher_id LEFT JOIN pay_slip_details d ON d.payroll_id = p.id`;

const h = {
  getSettings: (req, res) => res.json(settings()),
  putSettings(req, res) {
    const next = { ...settings(), ...req.body };
    for (const k of ['pf_employee_rate', 'pf_employer_rate', 'eps_rate', 'esi_employee_rate', 'esi_employer_rate']) {
      next[k] = num(next[k]);
      if (!(next[k] >= 0 && next[k] <= 100)) throw httpError(400, `${k.replace(/_/g, ' ')} must be between 0 and 100`);
    }
    for (const k of ['pf_wage_ceiling', 'esi_gross_ceiling']) {
      next[k] = num(next[k]);
      if (!(next[k] >= 0)) throw httpError(400, `${k.replace(/_/g, ' ')} must be 0 or more`);
    }
    if (next.eps_rate > next.pf_employer_rate) throw httpError(400, 'EPS rate cannot exceed the employer PF rate');
    db.prepare(`UPDATE pay_settings SET pf_employee_rate = ?, pf_employer_rate = ?, eps_rate = ?, pf_wage_ceiling = ?, pf_apply_ceiling = ?,
      esi_employee_rate = ?, esi_employer_rate = ?, esi_gross_ceiling = ? WHERE id = 1`).run(
      next.pf_employee_rate, next.pf_employer_rate, next.eps_rate, next.pf_wage_ceiling, next.pf_apply_ceiling ? 1 : 0,
      next.esi_employee_rate, next.esi_employer_rate, next.esi_gross_ceiling);
    res.json({ ok: true });
  },

  structure(req, res) {
    res.json(db.prepare(`SELECT t.id AS teacher_id, t.employee_no, t.full_name, t.designation, t.department, COALESCE(t.status, 'active') AS status,
      s.basic, s.da, s.hra, s.conveyance, s.other_allowance, s.tds, s.other_deduction, s.pf_applicable, s.esi_applicable, s.updated_at
      FROM teachers t LEFT JOIN pay_structure s ON s.teacher_id = t.id ORDER BY t.full_name`).all());
  },
  saveStructure(req, res) {
    const t = db.prepare('SELECT id FROM teachers WHERE id = ?').get(req.params.teacherId);
    if (!t) throw httpError(404, 'Staff member not found');
    const v = {};
    for (const k of ['basic', 'da', 'hra', 'conveyance', 'other_allowance', 'tds', 'other_deduction']) {
      v[k] = req.body[k] === '' || req.body[k] == null ? 0 : num(req.body[k]);
      if (!(v[k] >= 0)) throw httpError(400, `${k.replace('_', ' ')} must be 0 or more`);
      v[k] = round2(v[k]);
    }
    if (!(v.basic > 0)) throw httpError(400, 'Basic salary must be more than 0');
    db.prepare(`INSERT INTO pay_structure (teacher_id, basic, da, hra, conveyance, other_allowance, tds, other_deduction, pf_applicable, esi_applicable, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(teacher_id) DO UPDATE SET basic = excluded.basic, da = excluded.da, hra = excluded.hra,
      conveyance = excluded.conveyance, other_allowance = excluded.other_allowance, tds = excluded.tds, other_deduction = excluded.other_deduction,
      pf_applicable = excluded.pf_applicable, esi_applicable = excluded.esi_applicable, updated_at = excluded.updated_at`).run(
      t.id, v.basic, v.da, v.hra, v.conveyance, v.other_allowance, v.tds, v.other_deduction,
      req.body.pf_applicable === false || req.body.pf_applicable === 0 ? 0 : 1,
      req.body.esi_applicable === false || req.body.esi_applicable === 0 ? 0 : 1, new Date().toISOString());
    res.json({ ok: true });
  },

  // Generate slips for a month from each person's salary structure, prorated for loss-of-pay days.
  generate(req, res) {
    const { month } = req.body;
    if (!isMonth(month)) throw httpError(400, 'month must be YYYY-MM');
    const lop = Object.fromEntries((req.body.entries || []).map(e => [Number(e.teacher_id), e.lop_days]));
    const ids = Array.isArray(req.body.teacher_ids) && req.body.teacher_ids.length ? req.body.teacher_ids.map(Number) : null;
    const people = db.prepare(`SELECT s.*, t.full_name FROM pay_structure s JOIN teachers t ON t.id = s.teacher_id
      WHERE COALESCE(t.status, 'active') = 'active'`).all().filter(p => !ids || ids.includes(p.teacher_id));
    if (!people.length) throw httpError(400, 'No active staff with a salary structure. Set salaries in Salary Structure first.');
    const st = settings(), dim = daysIn(month);
    const out = { month, created: 0, already_existed: 0, total_net: 0, skipped: [] };
    db.transaction(() => {
      for (const p of people) {
        if (db.prepare('SELECT 1 FROM payroll WHERE teacher_id = ? AND month = ?').get(p.teacher_id, month)) { out.already_existed++; continue; }
        const l = lop[p.teacher_id] === '' || lop[p.teacher_id] == null ? 0 : num(lop[p.teacher_id]);
        if (!(l >= 0 && l <= dim)) throw httpError(400, `Loss-of-pay days for ${p.full_name} must be between 0 and ${dim}`);
        const f = (dim - l) / dim;
        const e = { basic: round2(p.basic * f), da: round2(p.da * f), hra: round2(p.hra * f), conveyance: round2(p.conveyance * f), other_allowance: round2(p.other_allowance * f) };
        const allowances = round2(e.da + e.hra + e.conveyance + e.other_allowance);
        const gross = round2(e.basic + allowances);
        const sx = statutory(round2(e.basic + e.da), gross, st, { pf: !!p.pf_applicable, esi: !!p.esi_applicable });
        const deductions = round2(sx.pf + sx.esi + p.tds + p.other_deduction);
        const net = round2(gross - deductions);
        if (net < 0) { out.skipped.push(`${p.full_name}: deductions exceed earnings`); continue; }
        const id = db.prepare(`INSERT INTO payroll (teacher_id, month, basic, allowances, deductions, net_pay, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`)
          .run(p.teacher_id, month, e.basic, allowances, deductions, net).lastInsertRowid;
        db.prepare(`INSERT INTO pay_slip_details (payroll_id, days_in_month, lop_days, da, hra, conveyance, other_allowance, pf, esi, tds, other_deduction,
          pf_wage, employer_pf, employer_eps, employer_esi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          id, dim, l, e.da, e.hra, e.conveyance, e.other_allowance, sx.pf, sx.esi, p.tds, p.other_deduction, sx.pf_wage, sx.employer_pf, sx.employer_eps, sx.employer_esi);
        out.created++; out.total_net = round2(out.total_net + net);
      }
    })();
    res.json(out);
  },
  markPaid(req, res) {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) throw httpError(400, 'Select at least one slip');
    const d = req.body.paid_on || today();
    let n = 0;
    for (const id of ids) n += db.prepare("UPDATE payroll SET status = 'paid', paid_on = ? WHERE id = ? AND status = 'pending'").run(d, id).changes;
    res.json({ ok: true, updated: n });
  },

  slip(req, res) {
    const s = db.prepare(`${SLIP_SQL} WHERE p.id = ?`).get(req.params.id);
    if (!s || !ownOrAdmin(req, s.teacher_id)) throw httpError(404, 'Salary slip not found');
    const school = db.prepare('SELECT school_name, address, phone, email, website, logo_url FROM school_settings WHERE id = 1').get();
    res.json({ ...s, gross: round2(s.basic + s.allowances), school });
  },
  mySlips(req, res) {
    if (req.user.role !== 'teacher') throw httpError(403, 'Only staff logins have payslips');
    res.json(db.prepare(`${SLIP_SQL} WHERE p.teacher_id = ? ORDER BY p.month DESC`).all(req.user.linked_id ?? -1));
  },

  form16List(req, res) {
    const w = [], p = [];
    if (req.user.role !== 'admin') { w.push('f.teacher_id = ?'); p.push(req.user.linked_id ?? -1); }
    else if (req.query.teacher_id) { w.push('f.teacher_id = ?'); p.push(req.query.teacher_id); }
    if (req.query.financial_year) { w.push('f.financial_year = ?'); p.push(req.query.financial_year); }
    res.json(db.prepare(`SELECT f.*, t.full_name, t.employee_no, t.pan_no, u.full_name AS uploaded_by_name
      FROM pay_form16 f JOIN teachers t ON t.id = f.teacher_id LEFT JOIN users u ON u.id = f.uploaded_by
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY f.financial_year DESC, t.full_name`).all(...p));
  },
  form16Save(req, res) {
    const { teacher_id, financial_year, file_url, file_name, remarks } = req.body;
    if (!teacher_id || !db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(teacher_id)) throw httpError(400, 'Choose a staff member');
    if (!isFy(financial_year)) throw httpError(400, 'Financial year must look like 2025-26');
    if (!file_url) throw httpError(400, 'Upload the Form 16 file');
    const bad = badUrl(file_url, 'file'); if (bad) throw httpError(400, bad);
    db.prepare(`INSERT INTO pay_form16 (teacher_id, financial_year, file_url, file_name, remarks, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(teacher_id, financial_year) DO UPDATE SET file_url = excluded.file_url, file_name = excluded.file_name,
      remarks = excluded.remarks, uploaded_by = excluded.uploaded_by, uploaded_at = CURRENT_TIMESTAMP`)
      .run(teacher_id, financial_year, file_url, file_name || null, remarks || null, req.user.id);
    res.status(201).json({ ok: true });
  },
  form16Delete(req, res) {
    const info = db.prepare('DELETE FROM pay_form16 WHERE id = ?').run(req.params.id);
    if (!info.changes) throw httpError(404, 'Not found');
    res.json({ ok: true });
  },
};

/* ---------- Reports ---------- */
const money = (key, label, total = true) => ({ key, label, type: 'money', total });
const MONTH = { name: 'month', label: 'Month', type: 'month', default: 'currentMonth', required: true };
const STAFF_COLS = [{ key: 'employee_no', label: 'Emp No' }, { key: 'teacher_name', label: 'Name' }, { key: 'designation', label: 'Designation' }];

registerReport({
  key: 'pay-salary', title: 'Salary Report', group: 'Payroll',
  params: [MONTH, { name: 'status', label: 'Status', type: 'select', options: ['pending', 'paid'] }],
  columns: [...STAFF_COLS, { key: 'department', label: 'Department' }, money('basic', 'Basic'), money('allowances', 'Allowances'),
    money('gross', 'Gross'), money('pf', 'PF'), money('esi', 'ESI'), money('deductions', 'Total Deductions'), money('net_pay', 'Net Pay'),
    { key: 'status', label: 'Status' }],
  run: (p) => db.prepare(`${SLIP_SQL} WHERE p.month = ? AND (? = '' OR p.status = ?) ORDER BY t.full_name`).all(p.month, p.status, p.status)
    .map(r => ({ ...r, gross: round2(r.basic + r.allowances) })),
});

const fyParam = () => ({ name: 'fy', label: 'Financial Year', type: 'select', options: fyOptions(), default: currentFy(), required: true });
const MONTH_COLS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m, i) => money(`m${i}`, m));
registerReport({
  key: 'pay-yearly-salary', title: 'Employee Yearly Salary Report', group: 'Payroll',
  description: 'Net pay per month for the financial year (April to March).',
  params: [fyParam(), { name: 'teacher_id', label: 'Staff', type: 'teacher' }],
  columns: [...STAFF_COLS, ...MONTH_COLS, money('gross_total', 'Gross (Year)'), money('deduction_total', 'Deductions (Year)'), money('net_total', 'Net (Year)')],
  run: (p) => {
    const months = fyMonths(p.fy);
    const rows = db.prepare(`${SLIP_SQL} WHERE p.month BETWEEN ? AND ? AND (? = '' OR p.teacher_id = ?) ORDER BY t.full_name`)
      .all(months[0], months[11], p.teacher_id, p.teacher_id);
    const by = new Map();
    for (const r of rows) {
      const k = r.teacher_id;
      if (!by.has(k)) by.set(k, { employee_no: r.employee_no, teacher_name: r.teacher_name, designation: r.designation, gross_total: 0, deduction_total: 0, net_total: 0 });
      const o = by.get(k);
      o[`m${months.indexOf(r.month)}`] = r.net_pay;
      o.gross_total = round2(o.gross_total + r.basic + r.allowances);
      o.deduction_total = round2(o.deduction_total + r.deductions);
      o.net_total = round2(o.net_total + r.net_pay);
    }
    return [...by.values()];
  },
});

registerReport({
  key: 'pay-esi', title: 'ESI Report', group: 'Payroll',
  description: 'Employee and employer ESI contributions (staff whose gross is within the ESI ceiling).',
  params: [MONTH],
  columns: [...STAFF_COLS, { key: 'esi_no', label: 'ESI No' }, { key: 'paid_days', label: 'Paid Days', type: 'number' },
    money('gross', 'Gross Wages'), money('esi', 'Employee ESI'), money('employer_esi', 'Employer ESI'), money('total', 'Total ESI')],
  run: (p) => db.prepare(`${SLIP_SQL} WHERE p.month = ? AND (COALESCE(d.esi, 0) > 0 OR COALESCE(d.employer_esi, 0) > 0) ORDER BY t.full_name`).all(p.month)
    .map(r => ({ ...r, gross: round2(r.basic + r.allowances), paid_days: r.days_in_month ? r.days_in_month - r.lop_days : null, total: round2(r.esi + r.employer_esi) })),
});

registerReport({
  key: 'pay-pf', title: 'Monthly PF Report', group: 'Payroll',
  description: 'EPF wages and contributions (employee share, employer EPF and EPS).',
  params: [MONTH],
  columns: [...STAFF_COLS, { key: 'uan_no', label: 'UAN' }, money('gross', 'Gross Wages'), money('pf_wage', 'EPF Wages'),
    money('pf', 'Employee PF'), money('employer_pf', 'Employer EPF'), money('employer_eps', 'Employer EPS'), money('total', 'Total')],
  run: (p) => db.prepare(`${SLIP_SQL} WHERE p.month = ? AND COALESCE(d.pf, 0) > 0 ORDER BY t.full_name`).all(p.month)
    .map(r => ({ ...r, gross: round2(r.basic + r.allowances), total: round2(r.pf + r.employer_pf + r.employer_eps) })),
});

registerReport({
  key: 'pay-bank-statement', title: 'Bank Statement Report', group: 'Payroll',
  description: 'Salary transfer sheet for the bank.',
  params: [MONTH],
  columns: [...STAFF_COLS, { key: 'bank_name', label: 'Bank' }, { key: 'bank_account', label: 'Account No' }, { key: 'ifsc', label: 'IFSC' },
    money('net_pay', 'Net Pay'), { key: 'note', label: 'Note' }],
  run: (p) => db.prepare(`${SLIP_SQL} WHERE p.month = ? ORDER BY t.full_name`).all(p.month)
    .map(r => ({ ...r, note: r.bank_account && r.ifsc ? '' : 'Bank details missing' })),
});

registerReport({
  key: 'pay-summary', title: 'Payroll Summary Report', group: 'Payroll',
  params: [{ name: 'from', label: 'From Month', type: 'month', default: 'currentMonth' }, { name: 'to', label: 'To Month', type: 'month', default: 'currentMonth' }],
  columns: [{ key: 'month', label: 'Month' }, { key: 'staff', label: 'Staff', type: 'number' }, money('gross', 'Gross'),
    money('pf', 'Employee PF'), money('esi', 'Employee ESI'), money('deductions', 'Total Deductions'), money('net', 'Net Pay'),
    money('employer', 'Employer PF+ESI'), money('paid', 'Paid'), money('pending', 'Pending')],
  run: (p) => db.prepare(`
    SELECT p.month, COUNT(*) AS staff, ROUND(SUM(p.basic + p.allowances), 2) AS gross, ROUND(SUM(COALESCE(d.pf, 0)), 2) AS pf,
      ROUND(SUM(COALESCE(d.esi, 0)), 2) AS esi, ROUND(SUM(p.deductions), 2) AS deductions, ROUND(SUM(p.net_pay), 2) AS net,
      ROUND(SUM(COALESCE(d.employer_pf, 0) + COALESCE(d.employer_eps, 0) + COALESCE(d.employer_esi, 0)), 2) AS employer,
      ROUND(SUM(CASE WHEN p.status = 'paid' THEN p.net_pay ELSE 0 END), 2) AS paid,
      ROUND(SUM(CASE WHEN p.status = 'pending' THEN p.net_pay ELSE 0 END), 2) AS pending
    FROM payroll p LEFT JOIN pay_slip_details d ON d.payroll_id = p.id
    WHERE p.month BETWEEN ? AND ? GROUP BY p.month ORDER BY p.month`).all(p.from || '0000-00', p.to || '9999-99'),
});

function register(router) {
  router.get('/pay/settings', ...admin, h.getSettings);
  router.put('/pay/settings', ...admin, safe(wrap(h.putSettings)));
  router.get('/pay/structure', ...admin, h.structure);
  router.put('/pay/structure/:teacherId', ...admin, safe(wrap(h.saveStructure)));
  router.post('/pay/generate', ...admin, safe(wrap(h.generate)));
  router.post('/pay/mark-paid', ...admin, safe(wrap(h.markPaid)));
  router.get('/pay/slip/:id', ...staff, safe(wrap(h.slip)));
  router.get('/pay/my-slips', ...staff, safe(wrap(h.mySlips)));
  router.get('/pay/form16', ...staff, h.form16List);
  router.post('/pay/form16', ...admin, safe(wrap(h.form16Save)));
  router.delete('/pay/form16/:id', ...admin, safe(wrap(h.form16Delete)));
  router.get('/pay/financial-years', ...staff, (req, res) => res.json({ current: currentFy(), options: fyOptions() }));
}

module.exports = { register, statutory };
