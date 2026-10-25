// Human Resource: employee profiles, staff attendance (manual + biometric CSV), attendance rules,
// notebook checking, department/extra leaves, teacher posts, job applications, photo upload links, HR reports.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const {
  db, ROLES, auth, role, safe, isDate, num, badUrl, today, currentSession,
  registerReport, registerMaster, messaging,
} = require('./_kit');
const { LEAVE_TYPES, leaveTypes } = require('../controllers/moduleControllers');

/* ---------- Schema ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS hr_staff_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present','absent','half_day','leave','late')),
    in_time TEXT,
    out_time TEXT,
    remarks TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','biometric')),
    marked_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, date)
  );
  CREATE TABLE IF NOT EXISTS hr_punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    punch_date TEXT NOT NULL,
    punch_time TEXT NOT NULL,
    batch TEXT,
    imported_by INTEGER,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, punch_date, punch_time)
  );
  CREATE TABLE IF NOT EXISTS hr_attendance_rules (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    office_start TEXT NOT NULL DEFAULT '08:00',
    office_end TEXT NOT NULL DEFAULT '14:30',
    late_after_minutes INTEGER NOT NULL DEFAULT 10,
    half_day_after TEXT NOT NULL DEFAULT '10:30',
    min_full_hours REAL NOT NULL DEFAULT 5,
    weekly_off TEXT NOT NULL DEFAULT 'Sunday'
  );
  INSERT OR IGNORE INTO hr_attendance_rules (id) VALUES (1);
  CREATE TABLE IF NOT EXISTS hr_notebook_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    check_date TEXT NOT NULL,
    students_checked INTEGER NOT NULL DEFAULT 0,
    total_students INTEGER,
    remarks TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS hr_department_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department TEXT NOT NULL,
    staff_category TEXT NOT NULL DEFAULT '',
    session TEXT NOT NULL,
    leave_type TEXT NOT NULL,
    allowed REAL NOT NULL DEFAULT 0,
    UNIQUE(department, staff_category, session, leave_type)
  );
  CREATE TABLE IF NOT EXISTS hr_extra_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    session TEXT NOT NULL,
    leave_type TEXT NOT NULL,
    days REAL NOT NULL,
    reason TEXT,
    granted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS hr_teacher_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    designation TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    sanctioned INTEGER NOT NULL DEFAULT 1,
    remarks TEXT,
    UNIQUE(designation, subject)
  );
  CREATE TABLE IF NOT EXISTS hr_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    post_applied TEXT NOT NULL,
    subject TEXT,
    qualification TEXT,
    experience_years REAL,
    current_school TEXT,
    message TEXT,
    resume_file TEXT,
    resume_name TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','shortlisted','interviewed','rejected','hired')),
    remarks TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS hr_photo_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

registerMaster({
  type: 'profile-categories', title: 'Profile Categories', group: 'Human Resource',
  description: 'Sections of an employee profile (used to organise profile details and documents).',
  seed: ['Personal Details', 'Contact Details', 'Qualification', 'Experience', 'Bank & Statutory', 'Documents'],
});
registerMaster({
  type: 'leave-types', title: 'Leave Types', group: 'Human Resource',
  description: 'Leave types offered to staff. Leave applications currently accept the eight standard types listed here.',
  fields: [{ name: 'paid', label: 'Paid?', type: 'select', options: ['Yes', 'No'] }],
  seed: LEAVE_TYPES.map(name => ({ name, paid: name === 'Leave without Pay' ? 'No' : 'Yes' })),
});

/* ---------- Helpers ---------- */
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const PRIVATE_DIR = path.join(UPLOAD_DIR, 'hr-private');
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

const STAFF_STATUS = ['active', 'inactive', 'left'];
const ATT_STATUS = ['present', 'absent', 'half_day', 'leave', 'late'];
const ATT_CODE = { present: 'P', absent: 'A', half_day: 'H', leave: 'L', late: 'LT' };
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const appUrl = () => (process.env.APP_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
const err400 = (res, error) => res.status(400).json({ error });

function daysInclusive(from, to) {
  const a = Date.parse(from), b = Date.parse(to);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) / 86400000) + 1;
}
function monthDays(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
const validMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
function eachDate(from, to, fn) {
  const d = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) fn(d.toISOString().slice(0, 10));
}

const rules = () => db.prepare('SELECT * FROM hr_attendance_rules WHERE id = 1').get();

// Status from first-in / last-out using the attendance rule.
function statusFromPunches(firstIn, lastOut, r) {
  const start = mins(r.office_start), inM = mins(firstIn);
  const lateBy = Math.max(0, inM - start);
  const isLate = lateBy > r.late_after_minutes;
  let status = isLate ? 'late' : 'present';
  if (inM > mins(r.half_day_after)) status = 'half_day';
  else if (lastOut && (mins(lastOut) - inM) / 60 < r.min_full_hours) status = 'half_day';
  return { status, late_minutes: isLate ? lateBy : 0 };
}

/* ---------- Employees ---------- */
const EMP_FIELDS = ['employee_no', 'full_name', 'subject', 'qualification', 'phone', 'email', 'department', 'photo_url',
  'designation', 'staff_category', 'status', 'joining_date', 'gender', 'dob', 'address', 'bank_name', 'bank_account',
  'ifsc', 'pan_no', 'uan_no', 'esi_no', 'blood_group', 'aadhaar_no'];
const QUICK_FIELDS = ['designation', 'department', 'staff_category', 'status', 'phone', 'email', 'subject'];

function empProblem(d, creating) {
  if (creating || 'employee_no' in d) if (!String(d.employee_no || '').trim()) return 'Employee No is required';
  if (creating || 'full_name' in d) if (!String(d.full_name || '').trim()) return 'Full Name is required';
  if (d.status && !STAFF_STATUS.includes(d.status)) return `status must be one of ${STAFF_STATUS.join(', ')}`;
  if (d.email && !isEmail(d.email)) return 'Email is not valid';
  if (d.phone && !/^\+?[\d\s-]{7,15}$/.test(d.phone)) return 'Phone number is not valid';
  for (const f of ['joining_date', 'dob']) if (d[f] && !isDate(d[f])) return `${f} must be YYYY-MM-DD`;
  if (d.dob && d.dob > today()) return 'Date of birth cannot be in the future';
  if (d.gender && !['M', 'F', 'O'].includes(d.gender)) return 'gender must be M, F or O';
  if (d.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(d.ifsc)) return 'IFSC code should look like SBIN0001234';
  if (d.pan_no && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(d.pan_no)) return 'PAN should look like ABCDE1234F';
  if (d.aadhaar_no && !/^\d{12}$/.test(String(d.aadhaar_no).replace(/\s/g, ''))) return 'Aadhaar number must be 12 digits';
  return badUrl(d.photo_url, 'photo_url');
}
function pickEmp(body, fields = EMP_FIELDS) {
  const d = {};
  for (const f of fields) if (body && f in body) {
    const v = body[f];
    d[f] = v === '' || v == null ? null : typeof v === 'string' ? v.trim() : v;
  }
  if (d.ifsc) d.ifsc = d.ifsc.toUpperCase();
  if (d.pan_no) d.pan_no = d.pan_no.toUpperCase();
  if (d.aadhaar_no) d.aadhaar_no = String(d.aadhaar_no).replace(/\s/g, '');
  return d;
}
// Someone who has left shouldn't keep signing in; re-enabling is a deliberate step in Users & Roles.
function disableLoginIfLeft(teacherId, status) {
  if (status !== 'left') return 0;
  return db.prepare("UPDATE users SET active = 0 WHERE role = 'teacher' AND linked_id = ?").run(teacherId).changes;
}

const employees = {
  get(req, res) {
    if (req.user.role !== 'admin' && Number(req.params.id) !== req.user.linked_id) return res.status(403).json({ error: 'Forbidden' });
    const row = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  },
  create(req, res) {
    const d = pickEmp(req.body);
    const problem = empProblem(d, true);
    if (problem) return err400(res, problem);
    if (!d.status) d.status = 'active';
    const cols = Object.keys(d);
    const info = db.prepare(`INSERT INTO teachers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(c => d[c]));
    res.status(201).json({ id: info.lastInsertRowid });
  },
  update(req, res) {
    const d = pickEmp(req.body);
    if (!Object.keys(d).length) return err400(res, 'No fields provided');
    const problem = empProblem(d, false);
    if (problem) return err400(res, problem);
    const cols = Object.keys(d);
    const info = db.prepare(`UPDATE teachers SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => d[c]), req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, logins_disabled: disableLoginIfLeft(Number(req.params.id), d.status) });
  },
  quickUpdate(req, res) {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || !rows.length) return err400(res, 'rows[] required');
    for (const [i, r] of rows.entries()) {
      if (!r || !Number(r.id)) return err400(res, `Row ${i + 1}: id is required`);
      const problem = empProblem(pickEmp(r, QUICK_FIELDS), false);
      if (problem) return err400(res, `Row ${i + 1}: ${problem}`);
    }
    let updated = 0, disabled = 0;
    db.transaction(() => {
      for (const r of rows) {
        const d = pickEmp(r, QUICK_FIELDS);
        const cols = Object.keys(d);
        if (!cols.length) continue;
        updated += db.prepare(`UPDATE teachers SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => d[c]), r.id).changes;
        disabled += disableLoginIfLeft(Number(r.id), d.status);
      }
    })();
    res.json({ ok: true, updated, logins_disabled: disabled });
  },
};

/* ---------- Staff attendance ---------- */
const staffAttendance = {
  list(req, res) {
    const date = req.query.date || today();
    if (!isDate(date)) return err400(res, 'date must be YYYY-MM-DD');
    const own = req.user.role !== 'admin';
    const rows = db.prepare(`
      SELECT t.id AS teacher_id, t.employee_no, t.full_name, t.department, t.designation,
        a.status, a.in_time, a.out_time, a.remarks, a.source,
        (SELECT leave_type FROM staff_leaves l WHERE l.teacher_id = t.id AND l.status = 'approved'
          AND ? BETWEEN COALESCE(l.approved_from, l.from_date) AND COALESCE(l.approved_to, l.to_date) LIMIT 1) AS on_leave
      FROM teachers t LEFT JOIN hr_staff_attendance a ON a.teacher_id = t.id AND a.date = ?
      WHERE COALESCE(t.status, 'active') = 'active' ${own ? 'AND t.id = ?' : ''}
      ORDER BY t.full_name
    `).all(date, date, ...(own ? [req.user.linked_id ?? -1] : []));
    res.json({ date, weekday: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }), rules: rules(), rows });
  },
  save(req, res) {
    const { date, records } = req.body || {};
    if (!isDate(date)) return err400(res, 'date must be YYYY-MM-DD');
    if (date > today()) return err400(res, 'Cannot mark attendance for a future date');
    if (!Array.isArray(records) || !records.length) return err400(res, 'records[] required');
    for (const [i, r] of records.entries()) {
      if (!r || !Number(r.teacher_id)) return err400(res, `Row ${i + 1}: teacher_id required`);
      if (!ATT_STATUS.includes(r.status)) return err400(res, `Row ${i + 1}: status must be one of ${ATT_STATUS.join(', ')}`);
      for (const f of ['in_time', 'out_time']) if (r[f] && !isTime(r[f])) return err400(res, `Row ${i + 1}: ${f} must be HH:MM`);
      if (r.in_time && r.out_time && mins(r.out_time) < mins(r.in_time)) return err400(res, `Row ${i + 1}: out time is before in time`);
    }
    const up = db.prepare(`
      INSERT INTO hr_staff_attendance (teacher_id, date, status, in_time, out_time, remarks, source, marked_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(teacher_id, date) DO UPDATE SET status = excluded.status, in_time = excluded.in_time, out_time = excluded.out_time,
        remarks = excluded.remarks, source = 'manual', marked_by = excluded.marked_by, updated_at = CURRENT_TIMESTAMP
    `);
    db.transaction(() => {
      for (const r of records) {
        const absent = r.status === 'absent' || r.status === 'leave';
        up.run(r.teacher_id, date, r.status, absent ? null : r.in_time || null, absent ? null : r.out_time || null, r.remarks || null, req.user.id);
      }
    })();
    res.json({ ok: true, count: records.length });
  },
};

/* ---------- Biometric CSV import ---------- */
function normDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [, d, mo, y] = m;
  else return null;
  const out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const back = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(back.getTime()) && back.toISOString().slice(0, 10) === out ? out : null;
}
function normTime(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]), se = Number(m[3] || 0), ap = m[4] && m[4].toUpperCase();
  if (ap) { if (h < 1 || h > 12) return null; if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0; }
  if (h > 23 || mi > 59 || se > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
}
// Recalculate one staff member's day from their punches (never overwrites a manual entry unless asked).
function recompute(teacherId, date, overwrite, userId) {
  const p = db.prepare('SELECT punch_time FROM hr_punches WHERE teacher_id = ? AND punch_date = ? ORDER BY punch_time').all(teacherId, date);
  if (!p.length) return false;
  const existing = db.prepare('SELECT source FROM hr_staff_attendance WHERE teacher_id = ? AND date = ?').get(teacherId, date);
  if (existing && existing.source === 'manual' && !overwrite) return false;
  const firstIn = p[0].punch_time.slice(0, 5);
  const lastOut = p.length > 1 ? p[p.length - 1].punch_time.slice(0, 5) : null;
  const { status, late_minutes } = statusFromPunches(firstIn, lastOut, rules());
  db.prepare(`
    INSERT INTO hr_staff_attendance (teacher_id, date, status, in_time, out_time, remarks, source, marked_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'biometric', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(teacher_id, date) DO UPDATE SET status = excluded.status, in_time = excluded.in_time, out_time = excluded.out_time,
      remarks = excluded.remarks, source = 'biometric', marked_by = excluded.marked_by, updated_at = CURRENT_TIMESTAMP
  `).run(teacherId, date, status, firstIn, lastOut, late_minutes ? `Late by ${late_minutes} min` : null, userId);
  return true;
}

function importPunches(req, res) {
  const csv = String(req.body?.csv || '');
  const overwrite = !!req.body?.overwrite_manual;
  if (!csv.trim()) return err400(res, 'Paste or choose a CSV file with columns: employee_no, date, time');
  const lines = csv.split(/\r?\n/);
  if (lines.length > 50000) return err400(res, 'File is too large: import at most 50,000 lines at a time');
  const byEmp = new Map(db.prepare('SELECT id, employee_no FROM teachers').all().map(t => [String(t.employee_no).trim().toUpperCase(), t.id]));
  const ins = db.prepare('INSERT OR IGNORE INTO hr_punches (teacher_id, punch_date, punch_time, batch, imported_by) VALUES (?, ?, ?, ?, ?)');
  const batch = `BIO-${Date.now().toString(36)}`;
  const errors = [], touched = new Set();
  let imported = 0, duplicates = 0, blank = 0;
  const now = today();
  db.transaction(() => {
    lines.forEach((raw, i) => {
      const line = raw.trim();
      if (!line) { blank++; return; }
      const cells = line.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
      if (i === 0 && /emp|code|id/i.test(cells[0] || '') && !normDate(cells[1])) return; // header row
      const [emp, d, t] = cells;
      const teacherId = byEmp.get(String(emp || '').toUpperCase());
      const date = normDate(d), time = normTime(t);
      const fail = !emp ? 'missing employee no' : !teacherId ? `unknown employee no "${emp}"`
        : !date ? `bad date "${d || ''}"` : date > now ? 'date is in the future' : !time ? `bad time "${t || ''}"` : null;
      if (fail) { if (errors.length < 200) errors.push({ line: i + 1, text: line.slice(0, 80), error: fail }); return; }
      const info = ins.run(teacherId, date, time, batch, req.user.id);
      if (info.changes) { imported++; touched.add(`${teacherId}|${date}`); } else duplicates++;
    });
    let days = 0;
    for (const k of touched) { const [tid, date] = k.split('|'); if (recompute(Number(tid), date, overwrite, req.user.id)) days++; }
    res.locals.days = days;
  })();
  res.json({ ok: true, batch, imported, duplicates, rejected: errors.length, errors, days_updated: res.locals.days, blank_lines: blank });
}

/* ---------- Attendance rules ---------- */
const attendanceRules = {
  get(req, res) { res.json(rules()); },
  update(req, res) {
    const r = { ...rules(), ...req.body };
    for (const f of ['office_start', 'office_end', 'half_day_after']) if (!isTime(r[f])) return err400(res, `${f} must be HH:MM`);
    if (mins(r.office_end) <= mins(r.office_start)) return err400(res, 'Office end must be after office start');
    if (mins(r.half_day_after) <= mins(r.office_start)) return err400(res, 'Half-day cut-off must be after office start');
    const late = num(r.late_after_minutes), hrs = num(r.min_full_hours);
    if (!Number.isInteger(late) || late < 0 || late > 240) return err400(res, 'Late after must be 0–240 minutes');
    if (!(hrs > 0 && hrs <= 12)) return err400(res, 'Minimum hours for a full day must be between 0 and 12');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'None'];
    if (!days.includes(r.weekly_off)) return err400(res, 'Weekly off must be a weekday or None');
    db.prepare(`UPDATE hr_attendance_rules SET office_start = ?, office_end = ?, late_after_minutes = ?, half_day_after = ?,
      min_full_hours = ?, weekly_off = ? WHERE id = 1`).run(r.office_start, r.office_end, late, r.half_day_after, hrs, r.weekly_off);
    res.json({ ok: true });
  },
};

/* ---------- Notebook checks ---------- */
const notebook = {
  list(req, res) {
    const own = req.user.role !== 'admin';
    const w = [], p = [];
    if (own) { w.push('n.teacher_id = ?'); p.push(req.user.linked_id ?? -1); }
    if (req.query.from) { w.push('n.check_date >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('n.check_date <= ?'); p.push(req.query.to); }
    res.json(db.prepare(`
      SELECT n.*, t.full_name AS teacher_name, c.name AS class_name, c.section AS class_section
      FROM hr_notebook_checks n JOIN teachers t ON t.id = n.teacher_id JOIN classes c ON c.id = n.class_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY n.check_date DESC, n.id DESC LIMIT 1000`).all(...p));
  },
  create(req, res) {
    const b = req.body || {};
    const teacherId = req.user.role === 'admin' ? Number(b.teacher_id) : req.user.linked_id;
    if (!teacherId) return err400(res, req.user.role === 'admin' ? 'Choose a teacher' : 'Your account is not linked to a staff record');
    if (!Number(b.class_id)) return err400(res, 'Choose a class');
    if (!String(b.subject || '').trim()) return err400(res, 'Subject is required');
    if (!isDate(b.check_date) || b.check_date > today()) return err400(res, 'Check date must be a valid date, not in the future');
    const checked = num(b.students_checked);
    if (!Number.isInteger(checked) || checked < 0) return err400(res, 'Students checked must be a whole number of 0 or more');
    const strength = db.prepare('SELECT COUNT(*) AS c FROM students WHERE class_id = ? AND COALESCE(status, \'active\') = \'active\'').get(b.class_id).c;
    const total = b.total_students === '' || b.total_students == null ? strength : num(b.total_students);
    if (!Number.isInteger(total) || total < 0) return err400(res, 'Total students must be a whole number');
    if (checked > total) return err400(res, `Students checked (${checked}) cannot exceed total students (${total})`);
    const info = db.prepare(`INSERT INTO hr_notebook_checks (teacher_id, class_id, subject, check_date, students_checked, total_students, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(teacherId, b.class_id, String(b.subject).trim(), b.check_date, checked, total, b.remarks || null, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  remove(req, res) {
    const row = db.prepare('SELECT teacher_id FROM hr_notebook_checks WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && row.teacher_id !== req.user.linked_id) return res.status(403).json({ error: 'You can only delete your own entries' });
    db.prepare('DELETE FROM hr_notebook_checks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  },
};

/* ---------- Department and extra leaves ---------- */
const extraFor = db.prepare('SELECT COALESCE(SUM(days), 0) AS d FROM hr_extra_leaves WHERE teacher_id = ? AND session = ? AND leave_type = ?');
const upsertAllowance = db.prepare(`
  INSERT INTO leave_allowances (teacher_id, session, leave_type, allowed) VALUES (?, ?, ?, ?)
  ON CONFLICT(teacher_id, session, leave_type) DO UPDATE SET allowed = excluded.allowed`);
const leaveTypeOk = (t) => leaveTypes().includes(t);

const departmentLeaves = {
  list(req, res) {
    const session = req.query.session || currentSession();
    res.json({ session, rows: db.prepare('SELECT * FROM hr_department_leaves WHERE session = ? ORDER BY department, staff_category, leave_type').all(session) });
  },
  upsert(req, res) {
    const b = req.body || {};
    const department = String(b.department || '').trim(), category = String(b.staff_category || '').trim();
    const session = String(b.session || currentSession()).trim();
    const allowed = num(b.allowed);
    if (!department) return err400(res, 'Department is required');
    if (!session) return err400(res, 'Session is required');
    if (!leaveTypeOk(b.leave_type)) return err400(res, `Leave type must be one of: ${leaveTypes().join(', ')}`);
    if (!(allowed >= 0 && allowed <= 365)) return err400(res, 'Allowed days must be between 0 and 365');
    db.prepare(`INSERT INTO hr_department_leaves (department, staff_category, session, leave_type, allowed) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(department, staff_category, session, leave_type) DO UPDATE SET allowed = excluded.allowed`)
      .run(department, category, session, b.leave_type, allowed);
    res.json({ ok: true });
  },
  remove(req, res) {
    const info = db.prepare('DELETE FROM hr_department_leaves WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
  // Writes each staff member's allowance = their department rule (+category-specific rule wins) + any extra leaves.
  apply(req, res) {
    const session = String(req.body?.session || currentSession());
    const rulesForSession = db.prepare('SELECT * FROM hr_department_leaves WHERE session = ?').all(session);
    if (!rulesForSession.length) return err400(res, `No department leave rules for ${session}`);
    const staff = db.prepare("SELECT id, department, staff_category FROM teachers WHERE COALESCE(status, 'active') = 'active'").all();
    let updated = 0;
    const staffTouched = new Set();
    db.transaction(() => {
      for (const t of staff) {
        const dep = String(t.department || '').toLowerCase(), cat = String(t.staff_category || '').toLowerCase();
        for (const type of leaveTypes()) {
          const mine = rulesForSession.filter(r => r.leave_type === type && r.department.toLowerCase() === dep);
          const rule = mine.find(r => r.staff_category && r.staff_category.toLowerCase() === cat) || mine.find(r => !r.staff_category);
          if (!rule) continue;
          upsertAllowance.run(t.id, session, type, rule.allowed + extraFor.get(t.id, session, type).d);
          updated++; staffTouched.add(t.id);
        }
      }
    })();
    res.json({ ok: true, session, staff: staffTouched.size, allowances_updated: updated });
  },
};

const extraLeaves = {
  list(req, res) {
    const session = req.query.session || currentSession();
    const own = req.user.role !== 'admin';
    res.json(db.prepare(`
      SELECT e.*, t.full_name AS teacher_name, t.employee_no, u.full_name AS granted_by_name
      FROM hr_extra_leaves e JOIN teachers t ON t.id = e.teacher_id LEFT JOIN users u ON u.id = e.granted_by
      WHERE e.session = ? ${own ? 'AND e.teacher_id = ?' : ''} ORDER BY e.id DESC`).all(session, ...(own ? [req.user.linked_id ?? -1] : [])));
  },
  create(req, res) {
    const b = req.body || {};
    const days = num(b.days), session = String(b.session || currentSession()).trim();
    if (!Number(b.teacher_id) || !db.prepare('SELECT id FROM teachers WHERE id = ?').get(b.teacher_id)) return err400(res, 'Choose a staff member');
    if (!leaveTypeOk(b.leave_type)) return err400(res, `Leave type must be one of: ${leaveTypes().join(', ')}`);
    if (!(days > 0 && days <= 60) || Math.round(days * 2) !== days * 2) return err400(res, 'Days must be between 0.5 and 60 (in half days)');
    if (!String(b.reason || '').trim()) return err400(res, 'Please give a reason');
    let id;
    db.transaction(() => {
      id = db.prepare('INSERT INTO hr_extra_leaves (teacher_id, session, leave_type, days, reason, granted_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(b.teacher_id, session, b.leave_type, days, String(b.reason).trim(), req.user.id).lastInsertRowid;
      const cur = db.prepare('SELECT allowed FROM leave_allowances WHERE teacher_id = ? AND session = ? AND leave_type = ?').get(b.teacher_id, session, b.leave_type);
      upsertAllowance.run(b.teacher_id, session, b.leave_type, (cur?.allowed || 0) + days);
    })();
    res.status(201).json({ id });
  },
  remove(req, res) {
    const e = db.prepare('SELECT * FROM hr_extra_leaves WHERE id = ?').get(req.params.id);
    if (!e) return res.status(404).json({ error: 'Not found' });
    db.transaction(() => {
      db.prepare('DELETE FROM hr_extra_leaves WHERE id = ?').run(e.id);
      const cur = db.prepare('SELECT allowed FROM leave_allowances WHERE teacher_id = ? AND session = ? AND leave_type = ?').get(e.teacher_id, e.session, e.leave_type);
      if (cur) upsertAllowance.run(e.teacher_id, e.session, e.leave_type, Math.max(0, cur.allowed - e.days));
    })();
    res.json({ ok: true });
  },
};

/* ---------- Teacher posts ---------- */
const teacherPosts = {
  list(req, res) {
    res.json(db.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM teachers t WHERE COALESCE(t.status, 'active') = 'active'
        AND lower(COALESCE(t.designation, '')) = lower(p.designation)
        AND (p.subject = '' OR lower(COALESCE(t.subject, '')) = lower(p.subject))) AS filled
      FROM hr_teacher_posts p ORDER BY p.designation, p.subject`).all().map(r => ({ ...r, vacant: r.sanctioned - r.filled })));
  },
  save(req, res) {
    const b = req.body || {};
    const designation = String(b.designation || '').trim(), subject = String(b.subject || '').trim();
    const sanctioned = num(b.sanctioned);
    if (!designation) return err400(res, 'Designation is required');
    if (!Number.isInteger(sanctioned) || sanctioned < 0 || sanctioned > 500) return err400(res, 'Sanctioned posts must be a whole number from 0 to 500');
    if (req.params.id) {
      const info = db.prepare('UPDATE hr_teacher_posts SET designation = ?, subject = ?, sanctioned = ?, remarks = ? WHERE id = ?')
        .run(designation, subject, sanctioned, b.remarks || null, req.params.id);
      if (!info.changes) return res.status(404).json({ error: 'Not found' });
      return res.json({ ok: true });
    }
    const info = db.prepare('INSERT INTO hr_teacher_posts (designation, subject, sanctioned, remarks) VALUES (?, ?, ?, ?)').run(designation, subject, sanctioned, b.remarks || null);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  remove(req, res) {
    const info = db.prepare('DELETE FROM hr_teacher_posts WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
};

/* ---------- Public: job applications and photo upload links ---------- */
// Check the file's first bytes, not just its name, so a renamed script can't slip through.
const MAGIC = {
  '.pdf': (b) => b.slice(0, 4).toString() === '%PDF',
  '.doc': (b) => b.slice(0, 4).toString('hex') === 'd0cf11e0',
  '.docx': (b) => b.slice(0, 2).toString() === 'PK',
  '.jpg': (b) => b.slice(0, 3).toString('hex') === 'ffd8ff',
  '.jpeg': (b) => b.slice(0, 3).toString('hex') === 'ffd8ff',
  '.png': (b) => b.slice(0, 8).toString('hex') === '89504e470d0a1a0a',
  '.webp': (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP',
};
function memoryUpload(field, exts, maxMb) {
  const up = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 20, fieldSize: 20000 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(exts.includes(ext) ? null : Object.assign(new Error(`Only ${exts.join(', ')} files are allowed`), { status: 400 }), exts.includes(ext));
    },
  }).single(field);
  return (req, res, next) => up(req, res, (e) => {
    if (e) return err400(res, e.code === 'LIMIT_FILE_SIZE' ? `File must be ${maxMb} MB or smaller` : e.message);
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!MAGIC[ext] || !MAGIC[ext](req.file.buffer)) return err400(res, 'The file does not look like a real ' + ext.slice(1).toUpperCase() + ' file');
    }
    next();
  });
}
const publicLimit = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions from this network. Please try again in an hour.' },
});

function careersInfo(req, res) {
  const s = db.prepare('SELECT school_name, address, phone, email, website FROM school_settings WHERE id = 1').get() || {};
  const open = db.prepare(`SELECT designation, subject FROM hr_teacher_posts p WHERE sanctioned > (SELECT COUNT(*) FROM teachers t
    WHERE COALESCE(t.status, 'active') = 'active' AND lower(COALESCE(t.designation, '')) = lower(p.designation)
    AND (p.subject = '' OR lower(COALESCE(t.subject, '')) = lower(p.subject))) ORDER BY designation, subject`).all();
  res.json({ school: s, open_posts: open });
}

function apply(req, res) {
  const b = req.body || {};
  if (b.website_url) return res.status(201).json({ ok: true }); // honeypot field: bots fill it, people never see it
  const full_name = String(b.full_name || '').trim(), email = String(b.email || '').trim(), phone = String(b.phone || '').trim();
  const post = String(b.post_applied || '').trim();
  if (full_name.length < 2 || full_name.length > 100) return err400(res, 'Please enter your full name');
  if (!email && !phone) return err400(res, 'Please give an email address or phone number');
  if (email && !isEmail(email)) return err400(res, 'Email address is not valid');
  if (phone && !/^\+?[\d\s-]{7,15}$/.test(phone)) return err400(res, 'Phone number is not valid');
  if (!post || post.length > 100) return err400(res, 'Please choose the post you are applying for');
  const exp = b.experience_years === '' || b.experience_years == null ? null : num(b.experience_years);
  if (exp != null && !(exp >= 0 && exp <= 50)) return err400(res, 'Experience must be between 0 and 50 years');
  if (!req.file) return err400(res, 'Please attach your resume (PDF or Word, up to 5 MB)');
  const ext = path.extname(req.file.originalname).toLowerCase();
  const stored = crypto.randomBytes(16).toString('hex') + ext;
  fs.writeFileSync(path.join(PRIVATE_DIR, stored), req.file.buffer);
  const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
  db.prepare(`INSERT INTO hr_applications (full_name, email, phone, post_applied, subject, qualification, experience_years, current_school,
    message, resume_file, resume_name, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    full_name, email || null, phone || null, post, clip(b.subject, 100), clip(b.qualification, 200), exp,
    clip(b.current_school, 150), clip(b.message, 2000), stored, req.file.originalname.slice(0, 150), req.ip);
  res.status(201).json({ ok: true });
}

const applications = {
  list(req, res) {
    res.json(db.prepare('SELECT id, full_name, email, phone, post_applied, subject, qualification, experience_years, current_school, message, resume_name, status, remarks, created_at FROM hr_applications ORDER BY id DESC').all());
  },
  update(req, res) {
    const { status, remarks } = req.body || {};
    if (status && !['new', 'shortlisted', 'interviewed', 'rejected', 'hired'].includes(status)) return err400(res, 'Unknown status');
    const info = db.prepare('UPDATE hr_applications SET status = COALESCE(?, status), remarks = COALESCE(?, remarks) WHERE id = ?')
      .run(status || null, remarks ?? null, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
  resume(req, res) {
    const a = db.prepare('SELECT resume_file, resume_name FROM hr_applications WHERE id = ?').get(req.params.id);
    const full = a && a.resume_file && path.join(PRIVATE_DIR, path.basename(a.resume_file));
    if (!full || !fs.existsSync(full)) return res.status(404).json({ error: 'Resume not found' });
    res.download(full, a.resume_name || path.basename(full));
  },
};

const tokenRow = (raw) => db.prepare(`
  SELECT k.*, t.full_name FROM hr_photo_tokens k JOIN teachers t ON t.id = k.teacher_id WHERE k.token_hash = ?`).get(hash(String(raw || '')));
function tokenProblem(k) {
  if (!k) return 'This link is not valid. Please ask the school office for a new one.';
  if (k.used_at) return 'This link has already been used. Please ask the school office for a new one.';
  if (k.expires_at < new Date().toISOString()) return 'This link has expired. Please ask the school office for a new one.';
  return null;
}

async function sendPhotoLinks(req, res, next) {
  try {
    const { teacher_ids, channel } = req.body || {};
    const ids = Array.isArray(teacher_ids) ? teacher_ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return err400(res, 'Select at least one staff member');
    if (!['sms', 'email', 'screen'].includes(channel)) return err400(res, 'channel must be sms, email or screen');
    if (channel !== 'screen' && !messaging.status()[channel]) {
      return err400(res, `${channel.toUpperCase()} is not configured on the server. Choose "Show on screen" to copy the links instead.`);
    }
    const staff = db.prepare(`SELECT id, full_name, phone, email FROM teachers WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    const expires = new Date(Date.now() + 7 * 86400000).toISOString();
    const school = db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get()?.school_name || 'School';
    const out = { sent: 0, failed: 0, skipped: 0, links: [] };
    for (const t of staff) {
      const to = channel === 'sms' ? t.phone : channel === 'email' ? t.email : 'screen';
      if (!to) { out.skipped++; continue; }
      const raw = crypto.randomBytes(24).toString('hex');
      const link = `${appUrl()}/photo-upload/${raw}`;
      db.prepare('UPDATE hr_photo_tokens SET used_at = ? WHERE teacher_id = ? AND used_at IS NULL').run('superseded', t.id);
      db.prepare('INSERT INTO hr_photo_tokens (token_hash, teacher_id, expires_at, created_by) VALUES (?, ?, ?, ?)').run(hash(raw), t.id, expires, req.user.id);
      if (channel === 'screen') { out.links.push({ name: t.full_name, link }); continue; }
      const r = await messaging.send({
        channel, recipients: [{ to, name: t.full_name }], subject: `${school}: upload your photo`,
        body: `Dear {name}, please upload your photo for school records: ${link} (valid for 7 days).`,
        userId: req.user.id, audience: 'photo-upload-link', redact: [raw],
      });
      out.sent += r.sent; out.failed += r.failed + r.not_configured; out.skipped += r.skipped;
    }
    res.json(out);
  } catch (e) { next(e); }
}

function photoInfo(req, res) {
  const k = tokenRow(req.params.token);
  const problem = tokenProblem(k);
  if (problem) return res.status(410).json({ error: problem });
  const school = db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get()?.school_name || 'School';
  res.json({ name: k.full_name, school, expires_at: k.expires_at });
}

function photoUpload(req, res) {
  const k = tokenRow(req.params.token);
  const problem = tokenProblem(k);
  if (problem) return res.status(410).json({ error: problem });
  if (!req.file) return err400(res, 'Please choose a photo (JPG, PNG or WEBP, up to 3 MB)');
  const ext = path.extname(req.file.originalname).toLowerCase();
  const stored = crypto.randomBytes(16).toString('hex') + ext;
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext];
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.file.buffer);
  db.transaction(() => {
    db.prepare('INSERT INTO files (stored_name, original_name, mime, size, uploaded_by) VALUES (?, ?, ?, ?, NULL)')
      .run(stored, `photo-${k.teacher_id}${ext}`, mime, req.file.size);
    db.prepare('UPDATE teachers SET photo_url = ? WHERE id = ?').run(`/api/files/${stored}`, k.teacher_id);
    db.prepare('UPDATE hr_photo_tokens SET used_at = ? WHERE id = ?').run(new Date().toISOString(), k.id);
  })();
  res.json({ ok: true });
}

/* ---------- Reports ---------- */
const DAY_COLS = Array.from({ length: 31 }, (_, i) => ({ key: `d${i + 1}`, label: String(i + 1) }));
// Register columns for the chosen month only (no 29–31 for shorter months).
const withMonthDays = (cols) => (p) => {
  const n = validMonth(p.month) ? monthDays(p.month) : 31;
  return cols.filter(c => !/^d\d+$/.test(c.key) || Number(c.key.slice(1)) <= n);
};
const monthParam = { name: 'month', label: 'Month', type: 'month', default: 'currentMonth', required: true };
const staffFilter = (user, teacherParam) => (user.role === 'admin' ? teacherParam : String(user.linked_id ?? -1));
const leaveRange = (l) => [l.approved_from || l.from_date, l.approved_to || l.to_date];

const COLS_STAFF_ATTENDANCE = [
    { key: 'employee_no', label: 'Emp No' }, { key: 'full_name', label: 'Name' }, { key: 'department', label: 'Department' },
    ...DAY_COLS,
    { key: 'present', label: 'P', type: 'number', total: true }, { key: 'late', label: 'LT', type: 'number', total: true },
    { key: 'half_day', label: 'H', type: 'number', total: true }, { key: 'leave', label: 'L', type: 'number', total: true },
    { key: 'absent', label: 'A', type: 'number', total: true }, { key: 'pct', label: 'Attendance %', type: 'percent' },
  ];

registerReport({
  key: 'staff-attendance', title: 'Staff Attendance Report', group: 'Human Resource',
  description: 'Monthly register. P present, LT late, H half day, L leave, A absent.',
  params: [monthParam, { name: 'department', label: 'Department', type: 'text' }, { name: 'teacher_id', label: 'Staff', type: 'teacher' }],
  columns: COLS_STAFF_ATTENDANCE,
  columnsFor: withMonthDays(COLS_STAFF_ATTENDANCE),
  run: (p) => {
    if (!validMonth(p.month)) throw Object.assign(new Error('Month must be YYYY-MM'), { status: 400 });
    const n = monthDays(p.month), from = `${p.month}-01`, to = `${p.month}-${String(n).padStart(2, '0')}`;
    const staff = db.prepare(`SELECT id, employee_no, full_name, department FROM teachers
      WHERE COALESCE(status, 'active') != 'left' AND (? = '' OR lower(department) LIKE '%' || lower(?) || '%') AND (? = '' OR id = ?)
      ORDER BY full_name`).all(p.department, p.department, p.teacher_id, p.teacher_id);
    const att = db.prepare('SELECT teacher_id, date, status FROM hr_staff_attendance WHERE date BETWEEN ? AND ?').all(from, to);
    const leaves = db.prepare(`SELECT teacher_id, from_date, to_date, approved_from, approved_to FROM staff_leaves
      WHERE status = 'approved' AND COALESCE(approved_to, to_date) >= ? AND COALESCE(approved_from, from_date) <= ?`).all(from, to);
    return staff.map(t => {
      const row = { ...t, present: 0, late: 0, half_day: 0, leave: 0, absent: 0 };
      const marks = {};
      for (const l of leaves.filter(x => x.teacher_id === t.id)) {
        const [a, b] = leaveRange(l);
        eachDate(a < from ? from : a, b > to ? to : b, (d) => { marks[d] = 'leave'; });
      }
      for (const a of att.filter(x => x.teacher_id === t.id)) marks[a.date] = a.status;
      for (const [d, s] of Object.entries(marks)) { row[`d${Number(d.slice(8))}`] = ATT_CODE[s]; row[s]++; }
      const marked = row.present + row.late + row.half_day + row.leave + row.absent;
      row.pct = marked ? ((row.present + row.late + row.half_day / 2 + row.leave) / marked) * 100 : null;
      return row;
    });
  },
});

registerReport({
  key: 'biometric-attendance', title: 'Biometric Attendance Report', group: 'Human Resource',
  description: 'Every punch imported from the biometric device.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' }, { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'teacher_id', label: 'Staff', type: 'teacher' },
  ],
  columns: [
    { key: 'punch_date', label: 'Date', type: 'date' }, { key: 'punch_time', label: 'Punch Time' }, { key: 'employee_no', label: 'Emp No' },
    { key: 'full_name', label: 'Name' }, { key: 'department', label: 'Department' }, { key: 'batch', label: 'Import Batch' },
  ],
  run: (p) => db.prepare(`SELECT p.*, t.employee_no, t.full_name, t.department FROM hr_punches p JOIN teachers t ON t.id = p.teacher_id
    WHERE p.punch_date BETWEEN ? AND ? AND (? = '' OR p.teacher_id = ?) ORDER BY p.punch_date DESC, t.full_name, p.punch_time LIMIT 5000`)
    .all(p.from, p.to, p.teacher_id, p.teacher_id),
});

registerReport({
  key: 'biometric-attendance-2', title: 'Biometric Attendance Report 2', group: 'Human Resource',
  description: 'Daily first-in / last-out per staff member, with late marks from the attendance rule.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' }, { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'teacher_id', label: 'Staff', type: 'teacher' }, { name: 'only_late', label: 'Show', type: 'select', options: [{ value: 'late', label: 'Late / half day only' }] },
  ],
  columns: [
    { key: 'punch_date', label: 'Date', type: 'date' }, { key: 'employee_no', label: 'Emp No' }, { key: 'full_name', label: 'Name' },
    { key: 'first_in', label: 'First In' }, { key: 'last_out', label: 'Last Out' }, { key: 'hours', label: 'Hours', type: 'number' },
    { key: 'punches', label: 'Punches', type: 'number' }, { key: 'late_minutes', label: 'Late (min)', type: 'number', total: true },
    { key: 'status', label: 'Status' },
  ],
  run: (p) => {
    const r = rules();
    return db.prepare(`SELECT p.punch_date, t.employee_no, t.full_name, MIN(p.punch_time) AS first, MAX(p.punch_time) AS last, COUNT(*) AS punches
      FROM hr_punches p JOIN teachers t ON t.id = p.teacher_id
      WHERE p.punch_date BETWEEN ? AND ? AND (? = '' OR p.teacher_id = ?)
      GROUP BY p.teacher_id, p.punch_date ORDER BY p.punch_date DESC, t.full_name`).all(p.from, p.to, p.teacher_id, p.teacher_id)
      .map(x => {
        const firstIn = x.first.slice(0, 5), lastOut = x.punches > 1 ? x.last.slice(0, 5) : null;
        const s = statusFromPunches(firstIn, lastOut, r);
        return {
          punch_date: x.punch_date, employee_no: x.employee_no, full_name: x.full_name, first_in: firstIn, last_out: lastOut || '—',
          hours: lastOut ? Math.round(((mins(lastOut) - mins(firstIn)) / 60) * 100) / 100 : null, punches: x.punches,
          late_minutes: s.late_minutes, status: { present: 'Present', late: 'Late', half_day: 'Half Day' }[s.status],
        };
      })
      .filter(x => p.only_late !== 'late' || x.status !== 'Present');
  },
});

const COLS_STUDENT_ATTENDANCE = [
    { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Name' }, { key: 'class', label: 'Class' }, { key: 'roll_no', label: 'Roll' },
    ...DAY_COLS,
    { key: 'present', label: 'P', type: 'number', total: true }, { key: 'late', label: 'LT', type: 'number', total: true },
    { key: 'leave', label: 'L', type: 'number', total: true }, { key: 'absent', label: 'A', type: 'number', total: true },
    { key: 'pct', label: 'Attendance %', type: 'percent' },
  ];

registerReport({
  key: 'student-attendance', title: 'Student Attendance Report', group: 'Attendance', roles: ROLES.STAFF,
  description: 'Monthly class register. P present, A absent, LT late, L leave.',
  params: [monthParam, { name: 'class_id', label: 'Class', type: 'class' }],
  columns: COLS_STUDENT_ATTENDANCE,
  columnsFor: withMonthDays(COLS_STUDENT_ATTENDANCE),
  run: (p) => {
    if (!validMonth(p.month)) throw Object.assign(new Error('Month must be YYYY-MM'), { status: 400 });
    const from = `${p.month}-01`, to = `${p.month}-${String(monthDays(p.month)).padStart(2, '0')}`;
    const att = db.prepare('SELECT student_id, date, status FROM attendance WHERE date BETWEEN ? AND ?').all(from, to);
    const has = new Set(att.map(a => a.student_id));
    return db.prepare(`SELECT s.id, s.admission_no, s.full_name, s.roll_no, s.status, c.name || ' ' || c.section AS class
      FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE (? = '' OR s.class_id = ?)
      ORDER BY c.name, c.section, s.roll_no, s.full_name`).all(p.class_id, p.class_id)
      .filter(s => (s.status || 'active') === 'active' || has.has(s.id))
      .map(s => {
        const row = { admission_no: s.admission_no, full_name: s.full_name, class: s.class, roll_no: s.roll_no, present: 0, late: 0, leave: 0, absent: 0 };
        for (const a of att.filter(x => x.student_id === s.id)) {
          row[`d${Number(a.date.slice(8))}`] = { present: 'P', absent: 'A', late: 'LT', leave: 'L' }[a.status];
          row[a.status]++;
        }
        const marked = row.present + row.late + row.leave + row.absent;
        row.pct = marked ? ((row.present + row.late) / marked) * 100 : null;
        return row;
      });
  },
});

registerReport({
  key: 'gender-wise-students', title: 'Gender Wise Student Details', group: 'Attendance', roles: ROLES.STAFF,
  description: 'Active students in each class by gender.',
  params: [],
  columns: [
    { key: 'class', label: 'Class' }, { key: 'boys', label: 'Boys', type: 'number', total: true },
    { key: 'girls', label: 'Girls', type: 'number', total: true }, { key: 'other', label: 'Other / Not set', type: 'number', total: true },
    { key: 'total', label: 'Total', type: 'number', total: true },
  ],
  run: () => db.prepare(`
    SELECT COALESCE(c.name || ' ' || c.section, 'No class') AS class,
      SUM(upper(substr(COALESCE(s.gender, ''), 1, 1)) = 'M') AS boys,
      SUM(upper(substr(COALESCE(s.gender, ''), 1, 1)) = 'F') AS girls,
      SUM(upper(substr(COALESCE(s.gender, ''), 1, 1)) NOT IN ('M', 'F')) AS other,
      COUNT(*) AS total
    FROM students s LEFT JOIN classes c ON c.id = s.class_id
    WHERE COALESCE(s.status, 'active') = 'active'
    GROUP BY s.class_id ORDER BY c.name, c.section`).all(),
});

const leaveCols = [
  { key: 'employee_no', label: 'Emp No' }, { key: 'teacher_name', label: 'Name' }, { key: 'department', label: 'Department' },
  { key: 'leave_type', label: 'Leave Type' }, { key: 'from_date', label: 'From', type: 'date' }, { key: 'to_date', label: 'To', type: 'date' },
  { key: 'days', label: 'Days', type: 'number', total: true }, { key: 'status', label: 'Status' },
];
const leaveSql = `SELECT l.*, t.employee_no, t.full_name AS teacher_name, t.department FROM staff_leaves l JOIN teachers t ON t.id = l.teacher_id`;
const withDays = (rows) => rows.map(l => { const [a, b] = l.status === 'approved' ? leaveRange(l) : [l.from_date, l.to_date]; return { ...l, days: daysInclusive(a, b) }; });

registerReport({
  key: 'staff-leaves', title: 'Staff Leaves Report', group: 'Human Resource',
  params: [
    { name: 'from', label: 'Leave From', type: 'date', default: 'yearStart' }, { name: 'to', label: 'Leave To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected', 'cancelled'] },
    { name: 'leave_type', label: 'Leave Type', type: 'select', options: LEAVE_TYPES }, { name: 'teacher_id', label: 'Staff', type: 'teacher' },
  ],
  columns: [...leaveCols, { key: 'approved_from', label: 'Approved From', type: 'date' }, { key: 'approved_to', label: 'Approved To', type: 'date' },
    { key: 'reason', label: 'Reason' }, { key: 'remarks', label: 'Remarks' }],
  run: (p) => withDays(db.prepare(`${leaveSql} WHERE l.to_date >= ? AND l.from_date <= ? AND (? = '' OR l.status = ?)
    AND (? = '' OR l.leave_type = ?) AND (? = '' OR l.teacher_id = ?) ORDER BY l.from_date DESC`)
    .all(p.from, p.to, p.status, p.status, p.leave_type, p.leave_type, p.teacher_id, p.teacher_id)),
});

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
registerReport({
  key: 'month-wise-leave-count', title: 'Month Wise Leave Count', group: 'Human Resource',
  description: 'Approved leave days per month for each staff member and leave type.',
  params: [{ name: 'year', label: 'Year', type: 'number', default: String(new Date().getFullYear()), required: true }, { name: 'teacher_id', label: 'Staff', type: 'teacher' }],
  columns: [
    { key: 'employee_no', label: 'Emp No' }, { key: 'teacher_name', label: 'Name' }, { key: 'leave_type', label: 'Leave Type' },
    ...MONTHS.map(m => ({ key: m, label: m[0].toUpperCase() + m.slice(1), type: 'number', total: true })),
    { key: 'total', label: 'Total', type: 'number', total: true },
  ],
  run: (p) => {
    const y = Number(p.year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) throw Object.assign(new Error('Year must be between 2000 and 2100'), { status: 400 });
    const rows = new Map();
    for (const l of db.prepare(`${leaveSql} WHERE l.status = 'approved' AND COALESCE(l.approved_to, l.to_date) >= ? AND COALESCE(l.approved_from, l.from_date) <= ?
      AND (? = '' OR l.teacher_id = ?) ORDER BY t.full_name`).all(`${y}-01-01`, `${y}-12-31`, p.teacher_id, p.teacher_id)) {
      const k = `${l.teacher_id}|${l.leave_type}`;
      if (!rows.has(k)) rows.set(k, { employee_no: l.employee_no, teacher_name: l.teacher_name, leave_type: l.leave_type, ...Object.fromEntries(MONTHS.map(m => [m, 0])), total: 0 });
      const r = rows.get(k);
      const [a, b] = leaveRange(l);
      eachDate(a < `${y}-01-01` ? `${y}-01-01` : a, b > `${y}-12-31` ? `${y}-12-31` : b, (d) => { r[MONTHS[Number(d.slice(5, 7)) - 1]]++; r.total++; });
    }
    return [...rows.values()];
  },
});

const appliedCols = [...leaveCols, { key: 'applied_on', label: 'Applied On', type: 'date' }, { key: 'decided_at', label: 'Decided On', type: 'date' }, { key: 'remarks', label: 'Remarks' }];
registerReport({
  key: 'leave-applied-status', title: 'Staff Leave Applied Status', group: 'Human Resource',
  description: 'Leave applications by the date they were applied, with their current status.',
  params: [
    { name: 'from', label: 'Applied From', type: 'date', default: 'monthStart' }, { name: 'to', label: 'Applied To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected', 'cancelled'] }, { name: 'teacher_id', label: 'Staff', type: 'teacher' },
  ],
  columns: appliedCols,
  run: (p) => withDays(db.prepare(`${leaveSql} WHERE date(l.applied_on, 'localtime') BETWEEN ? AND ? AND (? = '' OR l.status = ?)
    AND (? = '' OR l.teacher_id = ?) ORDER BY l.applied_on DESC`).all(p.from, p.to, p.status, p.status, p.teacher_id, p.teacher_id)),
});
registerReport({
  key: 'leave-applied-status-new', title: 'Staff Leave Applied Status New', group: 'Human Resource',
  description: 'Leave applications received in the last few days.',
  params: [{ name: 'days', label: 'Last N days', type: 'number', default: '7', required: true },
    { name: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected', 'cancelled'] }],
  columns: appliedCols,
  run: (p) => {
    const n = Number(p.days);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw Object.assign(new Error('Days must be between 1 and 365'), { status: 400 });
    return withDays(db.prepare(`${leaveSql} WHERE l.applied_on >= datetime('now', ?) AND (? = '' OR l.status = ?) ORDER BY l.applied_on DESC`)
      .all(`-${n} days`, p.status, p.status));
  },
});

registerReport({
  key: 'notebook-teacherwise', title: 'TeacherWise Notebook Report', group: 'Human Resource', roles: ROLES.STAFF,
  description: 'Notebook / copy checking done by each teacher.',
  params: [{ name: 'from', label: 'From', type: 'date', default: 'monthStart' }, { name: 'to', label: 'To', type: 'date', default: 'today' }, { name: 'teacher_id', label: 'Teacher', type: 'teacher' }],
  columns: [
    { key: 'employee_no', label: 'Emp No' }, { key: 'teacher_name', label: 'Teacher' }, { key: 'checks', label: 'Checks', type: 'number', total: true },
    { key: 'classes', label: 'Classes Covered' }, { key: 'subjects', label: 'Subjects' }, { key: 'checked', label: 'Notebooks Checked', type: 'number', total: true },
    { key: 'expected', label: 'Notebooks Expected', type: 'number', total: true }, { key: 'pct', label: 'Coverage %', type: 'percent' },
    { key: 'last_check', label: 'Last Check', type: 'date' },
  ],
  run: (p, user) => {
    const tid = staffFilter(user, p.teacher_id);
    return db.prepare(`SELECT t.employee_no, t.full_name AS teacher_name, COUNT(*) AS checks,
        GROUP_CONCAT(DISTINCT c.name || ' ' || c.section) AS classes, GROUP_CONCAT(DISTINCT n.subject) AS subjects,
        SUM(n.students_checked) AS checked, SUM(n.total_students) AS expected, MAX(n.check_date) AS last_check
      FROM hr_notebook_checks n JOIN teachers t ON t.id = n.teacher_id JOIN classes c ON c.id = n.class_id
      WHERE n.check_date BETWEEN ? AND ? AND (? = '' OR n.teacher_id = ?) GROUP BY n.teacher_id ORDER BY t.full_name`)
      .all(p.from, p.to, tid, tid).map(r => ({ ...r, pct: r.expected ? (r.checked / r.expected) * 100 : null }));
  },
});
registerReport({
  key: 'notebook-subjectwise', title: 'SubjectWise Class Notebook Report', group: 'Human Resource', roles: ROLES.STAFF,
  description: 'Notebook checking for each class and subject.',
  params: [{ name: 'from', label: 'From', type: 'date', default: 'monthStart' }, { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'class_id', label: 'Class', type: 'class' }, { name: 'subject', label: 'Subject', type: 'text' }],
  columns: [
    { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' }, { key: 'teachers', label: 'Teacher(s)' },
    { key: 'checks', label: 'Checks', type: 'number', total: true }, { key: 'checked', label: 'Notebooks Checked', type: 'number', total: true },
    { key: 'expected', label: 'Notebooks Expected', type: 'number', total: true }, { key: 'pct', label: 'Coverage %', type: 'percent' },
    { key: 'last_check', label: 'Last Check', type: 'date' },
  ],
  run: (p, user) => {
    const tid = staffFilter(user, '');
    return db.prepare(`SELECT c.name || ' ' || c.section AS class, n.subject, GROUP_CONCAT(DISTINCT t.full_name) AS teachers, COUNT(*) AS checks,
        SUM(n.students_checked) AS checked, SUM(n.total_students) AS expected, MAX(n.check_date) AS last_check
      FROM hr_notebook_checks n JOIN teachers t ON t.id = n.teacher_id JOIN classes c ON c.id = n.class_id
      WHERE n.check_date BETWEEN ? AND ? AND (? = '' OR n.class_id = ?) AND (? = '' OR lower(n.subject) LIKE '%' || lower(?) || '%')
        AND (? = '' OR n.teacher_id = ?)
      GROUP BY n.class_id, lower(n.subject) ORDER BY c.name, c.section, n.subject`)
      .all(p.from, p.to, p.class_id, p.class_id, p.subject, p.subject, tid, tid).map(r => ({ ...r, pct: r.expected ? (r.checked / r.expected) * 100 : null }));
  },
});

registerReport({
  key: 'teacher-applications', title: 'Online Teacher Application Report', group: 'Human Resource',
  params: [{ name: 'from', label: 'From', type: 'date', default: 'yearStart' }, { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['new', 'shortlisted', 'interviewed', 'rejected', 'hired'] },
    { name: 'post', label: 'Post', type: 'text' }],
  columns: [
    { key: 'created_at', label: 'Received', type: 'date' }, { key: 'full_name', label: 'Name' }, { key: 'post_applied', label: 'Post' },
    { key: 'subject', label: 'Subject' }, { key: 'qualification', label: 'Qualification' }, { key: 'experience_years', label: 'Experience (yrs)', type: 'number' },
    { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'status', label: 'Status' }, { key: 'remarks', label: 'Remarks' },
  ],
  run: (p) => db.prepare(`SELECT * FROM hr_applications WHERE date(created_at, 'localtime') BETWEEN ? AND ? AND (? = '' OR status = ?)
    AND (? = '' OR lower(post_applied) LIKE '%' || lower(?) || '%') ORDER BY id DESC`).all(p.from, p.to, p.status, p.status, p.post, p.post),
});

/* ---------- Routes ---------- */
function register(router) {
  const A = role(...ROLES.ADMIN), S = role(...ROLES.STAFF);
  router.get('/hr/employees/:id', auth, S, employees.get);
  router.post('/hr/employees', auth, A, safe(employees.create));
  router.put('/hr/employees', auth, A, safe(employees.quickUpdate));
  router.put('/hr/employees/:id', auth, A, safe(employees.update));

  router.get('/hr/staff-attendance', auth, S, safe(staffAttendance.list));
  router.post('/hr/staff-attendance', auth, A, safe(staffAttendance.save));
  router.post('/hr/biometric/import', auth, A, safe(importPunches));
  router.get('/hr/attendance-rules', auth, S, attendanceRules.get);
  router.put('/hr/attendance-rules', auth, A, safe(attendanceRules.update));

  router.get('/hr/notebook-checks', auth, S, notebook.list);
  router.post('/hr/notebook-checks', auth, S, safe(notebook.create));
  router.delete('/hr/notebook-checks/:id', auth, S, notebook.remove);

  router.get('/hr/department-leaves', auth, A, departmentLeaves.list);
  router.post('/hr/department-leaves', auth, A, safe(departmentLeaves.upsert));
  router.post('/hr/department-leaves/apply', auth, A, safe(departmentLeaves.apply));
  router.delete('/hr/department-leaves/:id', auth, A, departmentLeaves.remove);
  router.get('/hr/extra-leaves', auth, S, extraLeaves.list);
  router.post('/hr/extra-leaves', auth, A, safe(extraLeaves.create));
  router.delete('/hr/extra-leaves/:id', auth, A, safe(extraLeaves.remove));

  router.get('/hr/teacher-posts', auth, A, teacherPosts.list);
  router.post('/hr/teacher-posts', auth, A, safe(teacherPosts.save));
  router.put('/hr/teacher-posts/:id', auth, A, safe(teacherPosts.save));
  router.delete('/hr/teacher-posts/:id', auth, A, teacherPosts.remove);

  router.get('/hr/applications', auth, A, applications.list);
  router.put('/hr/applications/:id', auth, A, safe(applications.update));
  router.get('/hr/applications/:id/resume', auth, A, applications.resume);
  router.post('/hr/photo-links', auth, A, sendPhotoLinks);

  // Public (no login): careers page and photo upload links.
  router.get('/public/careers', careersInfo);
  router.post('/public/careers/apply', publicLimit, memoryUpload('resume', ['.pdf', '.doc', '.docx'], 5), safe(apply));
  router.get('/public/photo-upload/:token', photoInfo);
  router.post('/public/photo-upload/:token', publicLimit, memoryUpload('photo', ['.jpg', '.jpeg', '.png', '.webp'], 3), safe(photoUpload));
}

// recompute is reused by the live biometric (ADMS) integration so punches follow the same attendance rules.
module.exports = { register, recompute };
