// Bulk import from Excel (.xlsx) or CSV: students, staff, opening fee balances, parent logins, student logins.
// Flow: download template → upload → preview (each row OK / will update / skip / error) → commit in one
// transaction → download the failed rows with reasons. Every commit is kept in the import history.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { db, ROLES, auth, role, safe, today, isDate, num, currentSession, registerReport } = require('./_kit');
const { ensureStaffLogin } = require('../utils/staffLogin');
const fees = require('../controllers/feesController');
const { linkChild } = require('./family');

db.exec(`
  CREATE TABLE IF NOT EXISTS imp_batches (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    file_name TEXT,
    user_id INTEGER,
    rows TEXT NOT NULL,
    results TEXT,
    committed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS imp_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    file_name TEXT,
    mode TEXT,
    user_id INTEGER,
    total INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const MAX_ROWS = 5000;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const STAFF_CATEGORY_HINT = 'Teaching / Non-Teaching / …';

/* ---------- Column definitions ---------- */
// kind: text | date | int | money | gender | blood | email | phone | class | section | password
const col = (key, label, opts = {}) => ({ key, label, kind: 'text', required: false, aliases: [], example: '', ...opts });

const TYPES = {
  students: {
    title: 'Students', description: 'Add or update student records. Matched on Admission No.',
    columns: [
      col('admission_no', 'Admission No', { required: true, example: 'ADM2026101', aliases: ['adm no', 'admission number', 'admno', 'sr no'] }),
      col('full_name', 'Student Name', { required: true, example: 'Riya Sharma', aliases: ['name', 'full name', 'student'] }),
      col('gender', 'Gender', { kind: 'gender', example: 'F', aliases: ['sex'] }),
      col('dob', 'Date of Birth', { kind: 'date', example: '15/04/2012', aliases: ['dob', 'birth date', 'date of birth dd mm yyyy'] }),
      col('class', 'Class', { kind: 'class', example: 'Class 8', aliases: ['class name', 'standard', 'std', 'grade'] }),
      col('section', 'Section', { kind: 'section', example: 'A', aliases: ['sec', 'division'] }),
      col('roll_no', 'Roll No', { kind: 'int', example: '12', aliases: ['roll number', 'roll'] }),
      col('father_name', "Father's Name", { example: 'Rakesh Sharma', aliases: ['father', 'father name'] }),
      col('mother_name', "Mother's Name", { example: 'Neha Sharma', aliases: ['mother', 'mother name'] }),
      col('contact', 'Contact No', { kind: 'phone', example: '9876543210', aliases: ['phone', 'mobile', 'contact', 'mobile no', 'phone no'] }),
      col('email', 'Email', { kind: 'email', example: 'riya@example.com' }),
      col('address', 'Address', { example: 'Sector 2, Jalandhar' }),
      col('admission_date', 'Admission Date', { kind: 'date', example: '01/04/2026', aliases: ['date of admission', 'doa'] }),
      col('session', 'Session', { example: '2026-27', aliases: ['academic year'] }),
      col('category', 'Category', { example: 'General', aliases: ['caste category'] }),
      col('religion', 'Religion', { example: 'Hindu' }),
      col('blood_group', 'Blood Group', { kind: 'blood', example: 'B+' }),
      col('house', 'House', { example: 'Red' }),
      col('aadhaar_no', 'Aadhaar No', { kind: 'aadhaar', example: '123412341234', aliases: ['aadhaar', 'aadhar', 'aadhar no', 'uid'] }),
    ],
  },
  staff: {
    title: 'Staff', description: 'Add or update employees. Matched on Employee No.',
    columns: [
      col('employee_no', 'Employee No', { required: true, example: 'EMP101', aliases: ['emp no', 'employee number', 'empno', 'staff id'] }),
      col('full_name', 'Full Name', { required: true, example: 'Anita Verma', aliases: ['name', 'employee name', 'staff name'] }),
      col('designation', 'Designation', { example: 'TGT' }),
      col('department', 'Department', { example: 'Science' }),
      col('staff_category', 'Staff Category', { example: 'Teaching', aliases: ['category'] }),
      col('gender', 'Gender', { kind: 'gender', example: 'F', aliases: ['sex'] }),
      col('dob', 'Date of Birth', { kind: 'date', example: '20/08/1988', aliases: ['dob', 'birth date'] }),
      col('joining_date', 'Joining Date', { kind: 'date', example: '01/07/2020', aliases: ['date of joining', 'doj'] }),
      col('phone', 'Phone', { kind: 'phone', example: '9810012345', aliases: ['mobile', 'contact', 'contact no', 'mobile no'] }),
      col('official_email', 'Official Email', { kind: 'email', example: 'anita.sharma@school.example', aliases: ['school email', 'work email'] }),
      col('email', 'Personal Email', { kind: 'email', example: 'anita88@gmail.com', aliases: ['email'] }),
      col('qualification', 'Qualification', { example: 'M.Sc, B.Ed' }),
      col('subject', 'Subject', { example: 'Science' }),
      col('address', 'Address', { example: 'Model Town, Jalandhar' }),
      col('bank_name', 'Bank Name', { example: 'State Bank of India', aliases: ['bank'] }),
      col('bank_account', 'Bank Account No', { example: '30123456789', aliases: ['account no', 'bank account', 'account number', 'a c no'] }),
      col('ifsc', 'IFSC', { kind: 'ifsc', example: 'SBIN0001234', aliases: ['ifsc code'] }),
      col('pan_no', 'PAN', { kind: 'pan', example: 'ABCDE1234F', aliases: ['pan no', 'pan number'] }),
      col('uan_no', 'UAN (PF)', { example: '100123456789', aliases: ['uan', 'uan no', 'pf uan'] }),
      col('esi_no', 'ESI No', { example: '', aliases: ['esi', 'esic no'] }),
      col('blood_group', 'Blood Group', { kind: 'blood', example: 'O+' }),
      col('aadhaar_no', 'Aadhaar No', { kind: 'aadhaar', example: '', aliases: ['aadhaar', 'aadhar', 'aadhar no'] }),
      col('biometric_id', 'Biometric ID', { example: '101', aliases: ['biometric', 'device id', 'punch id', 'enroll id'] }),
    ],
  },
  opening: {
    title: 'Opening Fee Balances', description: 'Dues brought forward from the old system, per student and session. Matched on Admission No + Session.',
    columns: [
      col('admission_no', 'Admission No', { required: true, example: 'ADM2025001', aliases: ['adm no', 'admission number', 'admno'] }),
      col('amount', 'Opening Balance', { required: true, kind: 'money', example: '4500', aliases: ['amount', 'balance', 'dues', 'opening amount'] }),
      col('session', 'Session', { example: currentSession() || '2025-26', aliases: ['academic year'] }),
      col('due_date', 'Due Date', { kind: 'date', example: '30/04/2026' }),
      col('remarks', 'Remarks', { example: 'Carried from 2025-26' }),
    ],
  },
  parents: {
    title: 'Parent Logins', description: 'Create parent logins and link them to their children. One row per child; repeat the username for siblings.',
    columns: [
      col('admission_no', 'Child Admission No', { required: true, example: 'ADM2025001', aliases: ['admission no', 'adm no', 'student admission no'] }),
      col('full_name', 'Parent Name', { required: true, example: 'Rakesh Gupta', aliases: ['name', 'guardian name', 'parent'] }),
      col('phone', 'Phone', { kind: 'phone', example: '9811100001', aliases: ['mobile', 'contact', 'mobile no'] }),
      col('email', 'Email', { kind: 'email', example: '' }),
      col('username', 'Username', { kind: 'username', example: '9811100001', aliases: ['login', 'user name', 'login id'] }),
      col('password', 'Password', { kind: 'password', example: '', aliases: ['initial password'] }),
    ],
  },
  'student-logins': {
    title: 'Student Logins', description: 'Create logins for students. Username defaults to the Admission No.',
    columns: [
      col('admission_no', 'Admission No', { required: true, example: 'ADM2025002', aliases: ['adm no', 'admission number'] }),
      col('username', 'Username', { kind: 'username', example: '', aliases: ['login', 'user name', 'login id'] }),
      col('password', 'Password', { kind: 'password', example: '', aliases: ['initial password'] }),
    ],
  },
};

/* ---------- Parsing ---------- */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
    return String(v);
  }
  return v;
}

function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function readTable(file) {
  const name = String(file.originalname || '').toLowerCase();
  let grid;
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    grid = parseCsv(file.buffer.toString('utf8'));
  } else if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(file.buffer); } catch { throw Object.assign(new Error('Could not read this Excel file. Save it as .xlsx (Excel Workbook) and try again.'), { status: 400 }); }
    const ws = wb.worksheets.find(w => w.name.toLowerCase() === 'data') || wb.worksheets[0];
    if (!ws) throw Object.assign(new Error('The workbook has no sheets'), { status: 400 });
    grid = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const vals = [];
      for (let c = 1; c <= Math.max(r.cellCount, ws.columnCount); c++) vals.push(cellText(r.getCell(c).value));
      grid[n - 1] = vals;
    });
    grid = Array.from(grid, r => r || []);
  } else {
    throw Object.assign(new Error('Upload an .xlsx or .csv file'), { status: 400 });
  }
  const blank = (r) => !r || r.every(v => v === '' || v == null);
  if (!grid.some(r => !blank(r))) throw Object.assign(new Error('The file is empty'), { status: 400 });
  return { grid, blank };
}

// The heading row is the one (among the first 10 filled rows) that matches the most known columns,
// so a title line such as "Student List 2026" above the headings doesn't break the import.
function locateHeader(type, { grid, blank }) {
  let best = null;
  const filled = grid.map((r, i) => ({ r, i })).filter(x => !blank(x.r)).slice(0, 10);
  for (const { r, i } of filled) {
    const header = r.map(h => String(h instanceof Date ? '' : h ?? '').trim());
    const m = mapHeader(type, header);
    if (!best || Object.keys(m.index).length > Object.keys(best.m.index).length) best = { i, header, m };
  }
  const body = grid.slice(best.i + 1).map((r, k) => ({ n: best.i + 2 + k, r })).filter(x => !blank(x.r));
  return { ...best.m, body };
}

function mapHeader(type, header) {
  const def = TYPES[type];
  const index = {};
  const unknown = [];
  header.forEach((h, i) => {
    // Compare without spaces too, so "D.O.B", "Adm. No" and "AdmNo" all match.
    const n = norm(h).replace(/\s+/g, '');
    if (!n) return;
    const same = (x) => norm(x).replace(/\s+/g, '') === n;
    const c = def.columns.find(c => same(c.label) || same(c.key) || c.aliases.some(same));
    if (c && !(c.key in index)) index[c.key] = i; else if (!c) unknown.push(h);
  });
  const missing = def.columns.filter(c => c.required && !(c.key in index)).map(c => c.label);
  return { index, unknown, missing };
}

/* ---------- Value conversion ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => {
  const s = `${y}-${pad(m)}-${pad(d)}`;
  const t = new Date(`${s}T00:00:00Z`);
  return t.getUTCFullYear() === +y && t.getUTCMonth() + 1 === +m && t.getUTCDate() === +d ? s : null;
};
function toDate(v) {
  if (v === '' || v == null) return { value: null };
  if (v instanceof Date) return { value: ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) };
  if (typeof v === 'number' || /^\d{4,5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Math.floor(Number(v));
    if (n > 20000 && n < 80000) {   // Excel serial date (days since 1899-12-30)
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return { value: ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
    }
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return { value: ymd(m[1], m[2], m[3]) || undefined };
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 50 ? 1900 : 2000) + Number(m[3]) : Number(m[3]);
    return { value: ymd(y, m[2], m[1]) || undefined };
  }
  return { value: undefined };
}
const str = (v) => (v instanceof Date ? toDate(v).value : v == null ? '' : String(v).trim());

const GENDERS = { m: 'M', male: 'M', boy: 'M', f: 'F', female: 'F', girl: 'F', o: 'O', other: 'O', others: 'O', transgender: 'O' };

function convert(c, raw) {
  const s = str(raw);
  if (s === '' && c.kind !== 'date') return { value: null };
  switch (c.kind) {
    case 'date': {
      const d = toDate(raw);
      return d.value === undefined ? { error: `${c.label} "${s}" is not a valid date (use DD/MM/YYYY)` } : d;
    }
    case 'int': {
      const n = Number(s);
      return Number.isInteger(n) && n > 0 ? { value: n } : { error: `${c.label} must be a positive whole number` };
    }
    case 'money': {
      const n = Number(s.replace(/[₹,\s]/g, ''));
      return Number.isFinite(n) && n >= 0 ? { value: Math.round(n * 100) / 100 } : { error: `${c.label} must be an amount of 0 or more` };
    }
    case 'gender': {
      const g = GENDERS[s.toLowerCase()];
      return g ? { value: g } : { error: `Gender "${s}" must be M, F or O (Male / Female / Other)` };
    }
    case 'blood': {
      const b = s.toUpperCase().replace(/\s+/g, '').replace('VE', '').replace(/POSITIVE$/, '+').replace(/NEGATIVE$/, '-');
      return BLOOD_GROUPS.includes(b) ? { value: b } : { error: `Blood group "${s}" must be one of ${BLOOD_GROUPS.join(', ')}` };
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { value: s } : { error: `Email "${s}" is not valid` };
    case 'phone': {
      const p = s.replace(/\.0$/, '');
      return /^\+?[\d\s-]{7,15}$/.test(p) ? { value: p } : { error: `Phone "${s}" is not valid` };
    }
    case 'aadhaar': {
      const a = s.replace(/[\s-]/g, '');
      return /^\d{12}$/.test(a) ? { value: a } : { error: 'Aadhaar number must be 12 digits' };
    }
    case 'ifsc':
      return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(s) ? { value: s.toUpperCase() } : { error: `IFSC "${s}" should look like SBIN0001234` };
    case 'pan':
      return /^[A-Z]{5}\d{4}[A-Z]$/i.test(s) ? { value: s.toUpperCase() } : { error: `PAN "${s}" should look like ABCDE1234F` };
    case 'username':
      return /^[A-Za-z0-9._@-]{3,64}$/.test(s) ? { value: s } : { error: 'Username must be 3–64 letters, digits or . _ @ -' };
    case 'password':
      return s.length >= 6 ? { value: s } : { error: 'Password must be at least 6 characters' };
    default:
      return { value: s.slice(0, 500) };
  }
}

/* ---------- Lookups ---------- */
const classKey = (s) => norm(s).replace(/\b(class|std|standard|grade)\b/g, '').replace(/\s+/g, '');
function classLookup() {
  const list = db.prepare('SELECT id, name, section FROM classes').all();
  return {
    list,
    find(name, section) {
      let n = name, sec = section;
      if (n && !sec) {   // "Class 8 A" / "8-A" in one column
        const m = String(n).trim().match(/^(.*?)[\s-]+([A-Za-z])$/);
        if (m && list.some(c => classKey(c.name) === classKey(m[1]))) { n = m[1]; sec = m[2]; }
      }
      const byName = list.filter(c => classKey(c.name) === classKey(n));
      if (!byName.length) return { error: `Unknown class "${name}". Add it in Settings › Manage Classes first.` };
      if (!sec) return byName.length === 1 ? { id: byName[0].id } : { error: `Class "${name}" has sections ${byName.map(c => c.section).join(', ')}; fill in Section` };
      const hit = byName.find(c => norm(c.section) === norm(sec));
      return hit ? { id: hit.id } : { error: `Class "${name}" has no section "${sec}"` };
    },
  };
}
const studentByAdm = db.prepare('SELECT id, full_name, class_id FROM students WHERE lower(admission_no) = lower(?)');
const teacherByEmp = db.prepare('SELECT id FROM teachers WHERE lower(employee_no) = lower(?)');
const userByName = db.prepare('SELECT id, role, linked_id FROM users WHERE lower(username) = lower(?)');

/* ---------- Row validation ---------- */
// Returns { action: 'create'|'update'|'skip'|'error', errors, data, key, note }
function validateRow(type, values, ctx, mode) {
  const def = TYPES[type];
  const data = {}, errors = [];
  for (const c of def.columns) {
    const raw = values[c.key];
    const out = convert(c, raw);
    if (out.error) errors.push(out.error);
    else data[c.key] = out.value;
    if (c.required && (data[c.key] == null || data[c.key] === '') && !out.error) errors.push(`${c.label} is required`);
  }
  if (errors.length) return { action: 'error', errors, data };
  return VALIDATORS[type](data, ctx, mode);
}

const existing = (mode) => (mode === 'update' ? 'update' : 'skip');

const VALIDATORS = {
  students(d, ctx, mode) {
    const errors = [];
    const key = d.admission_no.toLowerCase();
    if (ctx.seen.has(key)) return { action: 'error', errors: [`Admission No ${d.admission_no} appears more than once in this file (row ${ctx.seen.get(key)})`], data: d };
    ctx.seen.set(key, ctx.row);
    if (d.class) {
      const c = ctx.classes.find(d.class, d.section);
      if (c.error) errors.push(c.error); else d.class_id = c.id;
    } else if (d.section) errors.push('Section given without a Class');
    if (d.dob && d.dob > today()) errors.push('Date of birth cannot be in the future');
    if (errors.length) return { action: 'error', errors, data: d };
    const ex = studentByAdm.get(d.admission_no);
    if (ex) return { action: existing(mode), data: d, id: ex.id, note: `Existing student ${ex.full_name}` };
    return { action: 'create', data: d };
  },
  staff(d, ctx, mode) {
    const key = d.employee_no.toLowerCase();
    if (ctx.seen.has(key)) return { action: 'error', errors: [`Employee No ${d.employee_no} appears more than once in this file (row ${ctx.seen.get(key)})`], data: d };
    ctx.seen.set(key, ctx.row);
    if (d.dob && d.dob > today()) return { action: 'error', errors: ['Date of birth cannot be in the future'], data: d };
    const ex = teacherByEmp.get(d.employee_no);
    return ex ? { action: existing(mode), data: d, id: ex.id } : { action: 'create', data: d };
  },
  opening(d, ctx, mode) {
    d.session = d.session || currentSession();
    const key = `${d.admission_no.toLowerCase()}|${d.session}`;
    if (ctx.seen.has(key)) return { action: 'error', errors: [`Admission No ${d.admission_no} for session ${d.session} appears more than once (row ${ctx.seen.get(key)})`], data: d };
    ctx.seen.set(key, ctx.row);
    const st = studentByAdm.get(d.admission_no);
    if (!st) return { action: 'error', errors: [`No student with Admission No ${d.admission_no}`], data: d };
    d.student_id = st.id;
    const cur = db.prepare("SELECT id, paid FROM fees WHERE student_id = ? AND session = ? AND kind = 'opening'").get(st.id, d.session);
    if (cur) {
      if (mode === 'update' && d.amount < fees.round2(cur.paid)) {
        return { action: 'error', errors: [`Opening balance can't be less than the ₹${fees.round2(cur.paid)} already paid`], data: d };
      }
      return { action: existing(mode), data: d, id: cur.id, note: `${st.full_name}` };
    }
    if (d.amount === 0) return { action: 'skip', data: d, note: 'Zero balance, nothing to add' };
    return { action: 'create', data: d, note: st.full_name };
  },
  parents(d, ctx, mode) {
    const st = studentByAdm.get(d.admission_no);
    if (!st) return { action: 'error', errors: [`No student with Admission No ${d.admission_no}`], data: d };
    d.student_id = st.id;
    d.username = d.username || (d.phone ? d.phone.replace(/[^\d]/g, '') : null);
    if (!d.username) return { action: 'error', errors: ['Give a Username or a Phone (used as the username)'], data: d };
    if (!/^[A-Za-z0-9._@-]{3,64}$/.test(d.username)) return { action: 'error', errors: ['Username must be 3–64 letters, digits or . _ @ -'], data: d };
    const key = `${d.username.toLowerCase()}|${st.id}`;
    if (ctx.seen.has(key)) return { action: 'error', errors: [`This parent and child pair appears more than once (row ${ctx.seen.get(key)})`], data: d };
    ctx.seen.set(key, ctx.row);
    const u = userByName.get(d.username);
    if (u && u.role !== 'parent') return { action: 'error', errors: [`Username ${d.username} is already used by a ${u.role} login`], data: d };
    if (u) {
      const linked = db.prepare('SELECT 1 FROM parent_children WHERE parent_user_id = ? AND student_id = ?').get(u.id, st.id);
      if (linked && mode !== 'update') return { action: 'skip', data: d, id: u.id, note: `Already linked to ${st.full_name}` };
      // In skip mode an existing parent is only linked to the new child; their name, contact and password stay as they are.
      return { action: 'update', linkOnly: mode !== 'update', data: d, id: u.id, note: linked ? 'Existing parent login' : `Link existing parent to ${st.full_name}` };
    }
    const sibling = ctx.newUsers.get(d.username.toLowerCase());
    ctx.newUsers.set(d.username.toLowerCase(), ctx.row);
    return { action: 'create', data: d, note: sibling ? `Same login as row ${sibling} (another child)` : `Child: ${st.full_name}` };
  },
  'student-logins'(d, ctx, mode) {
    const st = studentByAdm.get(d.admission_no);
    if (!st) return { action: 'error', errors: [`No student with Admission No ${d.admission_no}`], data: d };
    d.student_id = st.id;
    d.username = d.username || d.admission_no;
    if (!/^[A-Za-z0-9._@-]{3,64}$/.test(d.username)) return { action: 'error', errors: ['Username must be 3–64 letters, digits or . _ @ -'], data: d };
    if (ctx.seen.has(st.id)) return { action: 'error', errors: [`Admission No ${d.admission_no} appears more than once (row ${ctx.seen.get(st.id)})`], data: d };
    ctx.seen.set(st.id, ctx.row);
    if (ctx.newUsers.has(d.username.toLowerCase())) return { action: 'error', errors: [`Username ${d.username} is used twice in this file (row ${ctx.newUsers.get(d.username.toLowerCase())})`], data: d };
    ctx.newUsers.set(d.username.toLowerCase(), ctx.row);
    const own = db.prepare("SELECT id, username FROM users WHERE role = 'student' AND linked_id = ?").get(st.id);
    if (own) return { action: existing(mode), data: d, id: own.id, note: mode === 'update' ? `Reset password of ${own.username}` : `Already has login ${own.username}` };
    const u = userByName.get(d.username);
    if (u) return { action: 'error', errors: [`Username ${d.username} is already taken`], data: d };
    return { action: 'create', data: d, note: st.full_name };
  },
};

/* ---------- Applying rows ---------- */
const tempPassword = () => crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).padEnd(8, '7');
const STUDENT_COLS = ['admission_no', 'full_name', 'gender', 'dob', 'class_id', 'roll_no', 'father_name', 'mother_name', 'contact', 'email',
  'address', 'admission_date', 'session', 'category', 'religion', 'blood_group', 'house', 'aadhaar_no'];
const STAFF_COLS = ['employee_no', 'full_name', 'designation', 'department', 'staff_category', 'gender', 'dob', 'joining_date', 'phone', 'email', 'official_email',
  'qualification', 'subject', 'address', 'bank_name', 'bank_account', 'ifsc', 'pan_no', 'uan_no', 'esi_no', 'blood_group', 'aadhaar_no', 'biometric_id'];

function upsert(table, cols, d, id, mapped) {
  // On update only columns present in the file overwrite; blank cells keep what's there.
  const use = cols.filter(c => (id ? mapped.has(c) && d[c] != null : d[c] != null));
  if (id) {
    if (!use.length) return;
    db.prepare(`UPDATE ${table} SET ${use.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...use.map(c => d[c]), id);
    return id;
  }
  return db.prepare(`INSERT INTO ${table} (${use.join(', ')}) VALUES (${use.map(() => '?').join(', ')})`).run(...use.map(c => d[c])).lastInsertRowid;
}

const APPLY = {
  students(v, mapped) {
    const m = new Set([...mapped, ...(mapped.has('class') ? ['class_id'] : [])]);
    upsert('students', STUDENT_COLS, v.data, v.action === 'update' ? v.id : null, m);
  },
  staff(v, mapped, out) {
    const id = upsert('teachers', STAFF_COLS, v.data, v.action === 'update' ? v.id : null, mapped) || v.id;
    const r = id ? ensureStaffLogin(id) : null;
    if (r?.created) out.credentials.push({ username: r.created.username, password: r.created.password, name: r.created.name, role: 'staff' });
  },
  opening(v) {
    const d = v.data;
    const term = `Opening Balance ${d.session}${d.remarks ? ` (${d.remarks})` : ''}`.slice(0, 200);
    if (v.action === 'update') {
      const cur = db.prepare('SELECT paid FROM fees WHERE id = ?').get(v.id);
      if (d.amount === 0 && !cur.paid) { db.prepare('DELETE FROM fees WHERE id = ?').run(v.id); return; }
      db.prepare('UPDATE fees SET amount = ?, gross_amount = ?, status = ?, term = ? WHERE id = ?')
        .run(d.amount, d.amount, fees.statusFor(d.amount, cur.paid), term, v.id);
      return;
    }
    db.prepare(`INSERT INTO fees (student_id, term, amount, gross_amount, due_date, head, session, kind, created_at)
      VALUES (?, ?, ?, ?, ?, 'Opening Balance', ?, 'opening', ?)`)
      .run(d.student_id, term, d.amount, d.amount, d.due_date || today(), d.session, new Date().toISOString());
  },
  parents(v, mapped, out) {
    const d = v.data;
    let u = userByName.get(d.username);
    if (v.linkOnly) { linkChild(u.id, d.student_id); return; }
    if (!u) {
      const pw = d.password || tempPassword();
      const id = db.prepare(`INSERT INTO users (username, password_hash, role, full_name, email, phone, linked_id, must_change_password)
        VALUES (?, ?, 'parent', ?, ?, ?, ?, 1)`).run(d.username, bcrypt.hashSync(pw, 10), d.full_name, d.email || null, d.phone || null, d.student_id).lastInsertRowid;
      out.credentials.push({ username: d.username, password: pw, name: d.full_name, role: 'parent' });
      u = { id };
    } else if (v.action === 'update') {
      db.prepare('UPDATE users SET full_name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?').run(d.full_name, d.email || null, d.phone || null, u.id);
      if (d.password) {
        db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(bcrypt.hashSync(d.password, 10), u.id);
        out.credentials.push({ username: d.username, password: d.password, name: d.full_name, role: 'parent' });
      }
    }
    linkChild(u.id, d.student_id);
  },
  'student-logins'(v, mapped, out) {
    const d = v.data;
    const st = db.prepare('SELECT full_name, email, contact FROM students WHERE id = ?').get(d.student_id);
    const pw = d.password || tempPassword();
    if (v.action === 'update') {
      const u = db.prepare('SELECT username FROM users WHERE id = ?').get(v.id);
      // Resets the password only; a login the school switched off (e.g. a student who left) stays off.
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(bcrypt.hashSync(pw, 10), v.id);
      out.credentials.push({ username: u.username, password: pw, name: st.full_name, role: 'student' });
      return;
    }
    db.prepare(`INSERT INTO users (username, password_hash, role, full_name, email, phone, linked_id, must_change_password)
      VALUES (?, ?, 'student', ?, ?, ?, ?, 1)`).run(d.username, bcrypt.hashSync(pw, 10), st.full_name, st.email || null, st.contact || null, d.student_id);
    out.credentials.push({ username: d.username, password: pw, name: st.full_name, role: 'student' });
  },
};

/* ---------- Batches ---------- */
function validateAll(type, batch, mode) {
  const ctx = { seen: new Map(), newUsers: new Map(), classes: classLookup(), row: 0 };
  return batch.rows.map(r => {
    ctx.row = r.n;
    const v = validateRow(type, r.values, ctx, mode);
    return { n: r.n, values: r.values, ...v };
  });
}

const publicRow = (type, r) => ({
  row: r.n, action: r.action, errors: r.errors || [], note: r.note || null,
  key: r.data ? (type === 'staff' ? r.data.employee_no : r.data.admission_no) : r.values.admission_no || r.values.employee_no,
  name: r.data?.full_name || r.note || null,
});
const countOf = (rows) => rows.reduce((a, r) => { a[r.action] = (a[r.action] || 0) + 1; return a; }, { create: 0, update: 0, skip: 0, error: 0 });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('file');

function typeOr404(req, res) {
  const t = TYPES[req.params.type];
  if (!t) { res.status(404).json({ error: 'Unknown import type' }); return null; }
  return t;
}

async function preview(req, res, next) {
  if (!typeOr404(req, res)) return;
  upload(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB' : err.message });
      if (!req.file) return res.status(400).json({ error: 'Choose a file to upload (field name "file")' });
      const type = req.params.type;
      const mode = req.body.mode === 'update' ? 'update' : 'skip';
      const { index, unknown, missing, body } = locateHeader(type, await readTable(req.file));
      if (missing.length) return res.status(400).json({ error: `Missing column(s): ${missing.join(', ')}. Download the template to see the expected headings.`, unknown_columns: unknown });
      if (!body.length) return res.status(400).json({ error: 'No data rows found under the header row' });
      if (body.length > MAX_ROWS) return res.status(400).json({ error: `At most ${MAX_ROWS} rows per file; split the file and import in parts` });
      const rows = body.map(({ n, r }) => {
        const values = {};
        for (const [k, i] of Object.entries(index)) {
          const v = r[i];
          values[k] = v instanceof Date ? v.toISOString() : v == null ? '' : v;
        }
        return { n, values };
      });
      // Dates were serialised for storage; turn them back into Date objects when validating.
      const id = crypto.randomBytes(12).toString('hex');
      db.prepare("DELETE FROM imp_batches WHERE created_at < datetime('now', '-1 day')").run();
      db.prepare('INSERT INTO imp_batches (id, type, file_name, user_id, rows) VALUES (?, ?, ?, ?, ?)')
        .run(id, type, req.file.originalname.slice(0, 200), req.user.id, JSON.stringify({ rows, mapped: Object.keys(index) }));
      const checked = validateAll(type, hydrate({ rows }), mode);
      res.json({ batch_id: id, mode, file_name: req.file.originalname, columns: Object.keys(index), unknown_columns: unknown,
        counts: countOf(checked), rows: checked.map(r => publicRow(type, r)) });
    } catch (e) { next(e); }
  });
}

// Stored rows keep dates as ISO strings; restore them so a serial/Date cell is parsed the same at commit.
function hydrate(batch) {
  return { ...batch, rows: batch.rows.map(r => ({ n: r.n, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) =>
    [k, typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ? new Date(v) : v])) })) };
}

function loadBatch(req, res) {
  const b = db.prepare('SELECT * FROM imp_batches WHERE id = ? AND type = ?').get(String(req.params.batchId || req.body.batch_id || ''), req.params.type);
  if (!b) { res.status(404).json({ error: 'This upload has expired or was not found; upload the file again' }); return null; }
  return { ...b, data: hydrate(JSON.parse(b.rows)), mapped: new Set(JSON.parse(b.rows).mapped || []) };
}

function commit(req, res) {
  if (!typeOr404(req, res)) return;
  const b = loadBatch(req, res); if (!b) return;
  if (b.committed_at) return res.status(409).json({ error: 'This upload was already imported; upload the file again to import it again' });
  const type = req.params.type;
  const mode = req.body.mode === 'update' ? 'update' : 'skip';
  const out = { created: 0, updated: 0, skipped: 0, failed: 0, credentials: [] };
  const results = [];
  db.transaction(() => {
    // Re-check against the current data: something may have changed since the preview.
    for (const v of validateAll(type, b.data, mode)) {
      if (v.action === 'error') { out.failed++; results.push(v); continue; }
      if (v.action === 'skip') { out.skipped++; results.push(v); continue; }
      try {
        db.transaction(() => APPLY[type](v, b.mapped, out))();
        if (v.action === 'create') out.created++; else out.updated++;
        results.push(v);
      } catch (e) {
        out.failed++;
        const msg = /LICENCE_STUDENT_CAP/.test(e.message) ? 'Student limit of your plan reached' : /UNIQUE/.test(e.message) ? 'Already exists (duplicate)' : /FOREIGN KEY/.test(e.message) ? 'Refers to a record that does not exist' : 'Could not be saved';
        results.push({ ...v, action: 'error', errors: [msg] });
      }
    }
    // Passwords typed into the sheet are not kept once imported (the database is copied to off-site backups).
    const scrub = (values) => { if (!values || !('password' in values)) return values; const { password, ...rest } = values; return rest; };
    db.prepare('UPDATE imp_batches SET rows = ?, results = ?, committed_at = ? WHERE id = ?')
      .run(JSON.stringify({ rows: [], mapped: [...b.mapped] }),
        JSON.stringify(results.map(r => ({ n: r.n, values: scrub(r.values), action: r.action, errors: r.errors || [] }))), new Date().toISOString(), b.id);
    db.prepare('INSERT INTO imp_history (type, file_name, mode, user_id, total, created, updated, skipped, failed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(type, b.file_name, mode, req.user.id, results.length, out.created, out.updated, out.skipped, out.failed);
  })();
  res.json({ ...out, total: results.length, rows: results.map(r => publicRow(type, r)) });
}

/* ---------- Spreadsheets ---------- */
async function sendWorkbook(res, wb, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

function styleHeader(ws) {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF133B7A' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function template(req, res, next) {
  try {
    const def = typeOr404(req, res); if (!def) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.columns = def.columns.map(c => ({ header: c.label + (c.required ? ' *' : ''), key: c.key, width: Math.max(14, c.label.length + 4) }));
    ws.addRow(Object.fromEntries(def.columns.map(c => [c.key, c.example])));
    styleHeader(ws);
    def.columns.forEach((c, i) => { if (['date', 'phone', 'aadhaar', 'text', 'username', 'password'].includes(c.kind)) ws.getColumn(i + 1).numFmt = '@'; });
    const lists = wb.addWorksheet('Lists');
    const classes = db.prepare('SELECT DISTINCT name FROM classes ORDER BY name').all().map(r => r.name);
    const sections = db.prepare('SELECT DISTINCT section FROM classes ORDER BY section').all().map(r => r.section);
    lists.getColumn(1).values = ['Classes', ...classes];
    lists.getColumn(2).values = ['Sections', ...sections];
    lists.getColumn(3).values = ['Blood Groups', ...BLOOD_GROUPS];
    lists.state = 'hidden';
    const letter = (i) => String.fromCharCode(65 + i);
    def.columns.forEach((c, i) => {
      const range = `${letter(i)}2:${letter(i)}${MAX_ROWS + 1}`;
      const add = (formulae) => ws.dataValidations.add(range, { type: 'list', allowBlank: true, formulae, showErrorMessage: true });
      if (c.kind === 'gender') add(['"M,F,O"']);
      if (c.kind === 'class' && classes.length) add([`Lists!$A$2:$A$${classes.length + 1}`]);
      if (c.kind === 'section' && sections.length) add([`Lists!$B$2:$B$${sections.length + 1}`]);
      if (c.kind === 'blood') add([`Lists!$C$2:$C$${BLOOD_GROUPS.length + 1}`]);
    });
    const help = wb.addWorksheet('Help');
    help.columns = [{ header: 'Column', width: 24 }, { header: 'Required', width: 10 }, { header: 'What to enter', width: 70 }];
    const hint = (c) => ({
      date: 'Date as DD/MM/YYYY (Excel dates work too)', gender: 'M, F or O (Male / Female / Other also accepted)',
      class: 'Class name exactly as in Settings › Manage Classes, e.g. Class 8', section: 'Section letter, e.g. A',
      int: 'Whole number', money: 'Amount in rupees, e.g. 4500', blood: BLOOD_GROUPS.join(', '), aadhaar: '12 digits',
      phone: 'Mobile number', email: 'Email address', ifsc: 'e.g. SBIN0001234', pan: 'e.g. ABCDE1234F',
      username: 'Letters, digits or . _ @ - (3 to 64)', password: 'At least 6 characters; leave blank to generate one',
    }[c.kind] || (c.key === 'staff_category' ? STAFF_CATEGORY_HINT : 'Text'));
    for (const c of def.columns) help.addRow([c.label, c.required ? 'Yes' : '', hint(c)]);
    help.addRow([]);
    help.addRow(['Notes', '', 'Keep the heading row. Delete the example row before importing. Up to 5000 rows per file.']);
    styleHeader(help);
    await sendWorkbook(res, wb, `import-${req.params.type}-template.xlsx`);
  } catch (e) { next(e); }
}

async function errorReport(req, res, next) {
  try {
    const def = typeOr404(req, res); if (!def) return;
    const b = loadBatch(req, res); if (!b) return;
    const rows = b.results ? JSON.parse(b.results) : validateAll(req.params.type, b.data, req.query.mode === 'update' ? 'update' : 'skip');
    const failed = rows.filter(r => r.action === 'error');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.columns = [{ header: 'Row', key: '_row', width: 6 }, ...def.columns.map(c => ({ header: c.label, key: c.key, width: Math.max(14, c.label.length + 4) })),
      { header: 'Error', key: '_error', width: 60 }];
    for (const r of failed) {
      const vals = {};
      for (const c of def.columns) {
        const v = r.values[c.key];
        vals[c.key] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v instanceof Date ? toDate(v).value : v;
      }
      ws.addRow({ _row: r.n, ...vals, _error: (r.errors || []).join('; ') });
    }
    styleHeader(ws);
    ws.getColumn('_error').font = { color: { argb: 'FFB91C1C' } };
    await sendWorkbook(res, wb, `import-${req.params.type}-errors.xlsx`);
  } catch (e) { next(e); }
}

/* ---------- History ---------- */
const historyRows = (from, to, type) => db.prepare(`
  SELECT h.*, datetime(h.created_at, 'localtime') AS at, u.full_name AS by_name FROM imp_history h LEFT JOIN users u ON u.id = h.user_id
  WHERE date(h.created_at, 'localtime') BETWEEN ? AND ? AND (? = '' OR h.type = ?) ORDER BY h.id DESC`).all(from, to, type, type);

registerReport({
  key: 'import-history', title: 'Import History', group: 'Student', description: 'Every bulk import: who ran it, when and how many rows were added, updated, skipped or failed.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'type', label: 'Import', type: 'select', options: Object.entries(TYPES).map(([value, t]) => ({ value, label: t.title })) },
  ],
  columns: [
    { key: 'at', label: 'When' }, { key: 'type_title', label: 'Import' }, { key: 'file_name', label: 'File' }, { key: 'by_name', label: 'By' },
    { key: 'mode', label: 'Existing rows' }, { key: 'total', label: 'Rows', type: 'number', total: true },
    { key: 'created', label: 'Added', type: 'number', total: true }, { key: 'updated', label: 'Updated', type: 'number', total: true },
    { key: 'skipped', label: 'Skipped', type: 'number', total: true }, { key: 'failed', label: 'Failed', type: 'number', total: true },
  ],
  run: (p) => historyRows(p.from, p.to, p.type).map(r => ({ ...r, type_title: TYPES[r.type]?.title || r.type, mode: r.mode === 'update' ? 'Updated' : 'Skipped' })),
});

function register(router) {
  router.get('/imports/types', auth, role(...ROLES.ADMIN), (req, res) => res.json(Object.entries(TYPES).map(([type, t]) => ({
    type, title: t.title, description: t.description,
    columns: t.columns.map(c => ({ key: c.key, label: c.label, required: c.required })),
  }))));
  router.get('/imports/history', auth, role(...ROLES.ADMIN), (req, res) => res.json(historyRows('0000-01-01', '9999-12-31', '').slice(0, 50)
    .map(r => ({ ...r, type_title: TYPES[r.type]?.title || r.type }))));
  router.get('/imports/:type/template', auth, role(...ROLES.ADMIN), template);
  router.post('/imports/:type/preview', auth, role(...ROLES.ADMIN), preview);
  router.post('/imports/:type/commit', auth, role(...ROLES.ADMIN), safe(commit));
  router.get('/imports/:type/errors/:batchId', auth, role(...ROLES.ADMIN), errorReport);
}

module.exports = { register, TYPES, parseCsv, toDate };
