// Student administration: admission, full profile, status changes (with login control), Transfer Certificates,
// document checklist, registrations, custom fields, settings and student reports.
const {
  db, ROLES, auth, role, safe, addColumn, isStaff, canSeeStudent, today, isDate, num, badUrl, currentSession,
  registerReport, registerMaster, masterNames,
} = require('./_kit');

addColumn('students', 'registration_id INTEGER');
addColumn('students', 'prospectus_id INTEGER');

db.exec(`
  CREATE TABLE IF NOT EXISTS stu_settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS stu_status_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    reason TEXT,
    status_date TEXT NOT NULL,
    disabled_users TEXT,
    enabled_users TEXT,
    changed_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stu_tc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tc_no TEXT UNIQUE NOT NULL,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    application_date TEXT,
    issue_date TEXT NOT NULL,
    leaving_date TEXT NOT NULL,
    last_class TEXT,
    qualified_for_promotion TEXT,
    dues_paid TEXT,
    working_days INTEGER,
    days_present INTEGER,
    conduct TEXT,
    reason TEXT NOT NULL,
    nationality TEXT DEFAULT 'Indian',
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
    previous_status TEXT,
    cancel_reason TEXT,
    issued_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stu_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('received','pending')),
    file_url TEXT,
    received_on TEXT,
    remarks TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, doc_type)
  );

  CREATE TABLE IF NOT EXISTS stu_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no TEXT UNIQUE NOT NULL,
    reg_date TEXT NOT NULL,
    session TEXT,
    prospectus_id INTEGER REFERENCES prospectus(id) ON DELETE SET NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT,
    gender TEXT CHECK (gender IN ('M','F','O')),
    dob TEXT,
    father_name TEXT,
    mother_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    last_school TEXT,
    registration_fee REAL DEFAULT 0,
    test_date TEXT,
    test_marks REAL,
    interview_status TEXT NOT NULL DEFAULT 'pending' CHECK (interview_status IN ('pending','selected','rejected','waitlisted')),
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','selected','rejected','waitlisted','admitted')),
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stu_custom_values (
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    field_id INTEGER NOT NULL,
    value TEXT,
    PRIMARY KEY (student_id, field_id)
  );
`);

registerMaster({
  type: 'student-documents', title: 'Student Document Checklist', group: 'Student',
  description: 'Documents collected from every student at admission. Pending ones show in the Student Pending Documents report.',
  seed: ['Birth Certificate', 'Aadhaar Card', 'Transfer Certificate (previous school)', 'Previous Report Card', 'Passport Size Photographs', 'Address Proof', 'Caste Certificate'],
});
registerMaster({
  type: 'student-custom-fields', title: 'Student Custom Fields', group: 'Student',
  description: 'Extra details the school records for each student. Filled on the admission form.',
  fields: [
    { name: 'field_type', label: 'Field Type', type: 'select', options: ['text', 'number', 'date', 'select'] },
    { name: 'options', label: 'Choices (comma separated, for select)' },
  ],
});
registerMaster({
  type: 'student-houses', title: 'Houses', group: 'Student', read: ROLES.ALL,
  seed: ['Red House', 'Blue House', 'Green House', 'Yellow House'],
});
registerMaster({
  type: 'student-categories', title: 'Student Categories', group: 'Student', read: ROLES.ALL,
  seed: ['General', 'OBC', 'SC', 'ST', 'EWS'],
});

/* ---------- Settings ---------- */
const SETTING_DEFAULTS = {
  admission_prefix: '', tc_prefix: 'TC/', registration_prefix: 'REG/', registration_fee: '0',
  prospectus_prefix: '', prospectus_start: '', prospectus_fee: '0',
};
function settings() {
  const out = { ...SETTING_DEFAULTS };
  for (const r of db.prepare('SELECT key, value FROM stu_settings').all()) if (r.key in out) out[r.key] = r.value ?? '';
  return out;
}

// Next number in a series like "REG/012": keeps the prefix and zero-padding of the last one.
function nextInSeries(last, prefix, startWidth = 3) {
  if (!last) return `${prefix}${'1'.padStart(startWidth, '0')}`;
  const m = String(last).match(/^(.*?)(\d+)$/);
  return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : `${last}-1`;
}

function nextAdmissionNo() {
  const { admission_prefix: prefix } = settings();
  const last = db.prepare(
    `SELECT admission_no FROM students WHERE admission_no LIKE ? || '%' AND admission_no GLOB '*[0-9]' ORDER BY id DESC LIMIT 1`,
  ).get(prefix)?.admission_no;
  return nextInSeries(last, prefix || 'ADM', 4);
}
const nextTcNo = () => nextInSeries(db.prepare('SELECT tc_no FROM stu_tc ORDER BY id DESC LIMIT 1').get()?.tc_no, settings().tc_prefix);
const nextRegNo = () => nextInSeries(db.prepare('SELECT reg_no FROM stu_registrations ORDER BY id DESC LIMIT 1').get()?.reg_no, settings().registration_prefix);

/* ---------- Validation ---------- */
const PROFILE_FIELDS = [
  'admission_no', 'full_name', 'gender', 'dob', 'class_id', 'roll_no', 'father_name', 'mother_name', 'contact', 'address',
  'admission_date', 'session', 'photo_url', 'email', 'blood_group', 'category', 'religion', 'aadhaar_no', 'house',
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function cleanProfile(body, existing) {
  const d = {};
  for (const f of PROFILE_FIELDS) if (body && f in body) d[f] = body[f] === '' || body[f] === undefined ? null : body[f];
  const v = { ...(existing || {}), ...d };
  if (!v.admission_no || !String(v.admission_no).trim()) return { error: 'Admission No is required' };
  if (!v.full_name || !String(v.full_name).trim()) return { error: 'Student name is required' };
  if (v.gender && !['M', 'F', 'O'].includes(v.gender)) return { error: 'Gender must be M, F or O' };
  for (const f of ['dob', 'admission_date']) if (v[f] && !isDate(v[f])) return { error: `${f === 'dob' ? 'Date of birth' : 'Admission date'} must be YYYY-MM-DD` };
  if (v.dob && v.dob > today()) return { error: 'Date of birth cannot be in the future' };
  if (v.roll_no != null && (!Number.isInteger(num(v.roll_no)) || num(v.roll_no) < 1)) return { error: 'Roll No must be a positive whole number' };
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return { error: 'Email address is not valid' };
  if (v.contact && !/^\+?[\d\s-]{7,15}$/.test(v.contact)) return { error: 'Contact number is not valid' };
  if (v.aadhaar_no && !/^\d{12}$/.test(String(v.aadhaar_no).replace(/\s/g, ''))) return { error: 'Aadhaar number must be 12 digits' };
  if (v.blood_group && !BLOOD_GROUPS.includes(v.blood_group)) return { error: `Blood group must be one of ${BLOOD_GROUPS.join(', ')}` };
  const urlErr = badUrl(v.photo_url, 'Photo');
  if (urlErr) return { error: urlErr };
  if (v.class_id && !db.prepare('SELECT 1 FROM classes WHERE id = ?').get(v.class_id)) return { error: 'Selected class does not exist' };
  if ('aadhaar_no' in d && d.aadhaar_no) d.aadhaar_no = String(d.aadhaar_no).replace(/\s/g, '');
  if ('roll_no' in d && d.roll_no != null) d.roll_no = num(d.roll_no);
  if ('admission_no' in d) d.admission_no = String(d.admission_no).trim();
  if ('full_name' in d) d.full_name = String(d.full_name).trim();
  return { data: d };
}

function saveCustomValues(studentId, values) {
  if (!values || typeof values !== 'object') return null;
  const fields = db.prepare("SELECT id, name, data FROM masters WHERE type = 'student-custom-fields'").all();
  const byId = new Map(fields.map(f => [String(f.id), { ...f, ...(f.data ? JSON.parse(f.data) : {}) }]));
  const up = db.prepare(`INSERT INTO stu_custom_values (student_id, field_id, value) VALUES (?, ?, ?)
    ON CONFLICT(student_id, field_id) DO UPDATE SET value = excluded.value`);
  const del = db.prepare('DELETE FROM stu_custom_values WHERE student_id = ? AND field_id = ?');
  for (const [id, raw] of Object.entries(values)) {
    const f = byId.get(String(id));
    if (!f) return `Unknown custom field ${id}`;
    const value = raw == null ? '' : String(raw).trim();
    if (!value) { del.run(studentId, f.id); continue; }
    if (f.field_type === 'number' && !Number.isFinite(Number(value))) return `${f.name} must be a number`;
    if (f.field_type === 'date' && !isDate(value)) return `${f.name} must be a date (YYYY-MM-DD)`;
    if (f.field_type === 'select') {
      const choices = String(f.options || '').split(',').map(s => s.trim()).filter(Boolean);
      if (choices.length && !choices.includes(value)) return `${f.name} must be one of: ${choices.join(', ')}`;
    }
    up.run(studentId, f.id, value);
  }
  return null;
}

// Admission numbers are also student usernames, and sign-in ignores case and spaces: never allow two that
// differ only in that way (existing records are left as they are).
for (const ev of ['INSERT', 'UPDATE OF admission_no']) {
  db.exec(`CREATE TRIGGER IF NOT EXISTS students_adm_unique_${ev.startsWith('I') ? 'ins' : 'upd'} BEFORE ${ev} ON students
    WHEN EXISTS (SELECT 1 FROM students WHERE lower(trim(admission_no)) = lower(trim(NEW.admission_no)) AND id IS NOT NEW.id)
    BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: students.admission_no'); END`);
}

/* ---------- Status and logins ---------- */
const STATUSES = ['active', 'inactive', 'left', 'tc_issued', 'passed_out'];

// Turn student/parent logins off when a student stops being active, and back on (only those we turned off) on return.
function applyStatus(student, newStatus, reason, date, userId) {
  const linked = db.prepare("SELECT id, role, active FROM users WHERE role IN ('student','parent') AND linked_id = ?").all(student.id);
  let disabled = null, enabled = null;
  if (newStatus === 'active') {
    const lastOff = db.prepare(`SELECT disabled_users FROM stu_status_log WHERE student_id = ? AND new_status != 'active'
      ORDER BY id DESC LIMIT 1`).get(student.id)?.disabled_users;
    const ids = String(lastOff || '').split(',').map(Number).filter(id => linked.some(u => u.id === id));
    if (ids.length) db.prepare(`UPDATE users SET active = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    enabled = ids.join(',') || null;
  } else if (student.status === 'active' || !student.status) {
    // A parent with another child still studying here keeps their login, now showing that child.
    const otherChild = db.prepare(`SELECT s.id FROM parent_children pc JOIN students s ON s.id = pc.student_id
      WHERE pc.parent_user_id = ? AND s.id != ? AND COALESCE(s.status, 'active') = 'active' ORDER BY s.id LIMIT 1`);
    const ids = [];
    for (const u of linked.filter(x => x.active)) {
      const other = u.role === 'parent' && otherChild.get(u.id, student.id);
      if (other) db.prepare('UPDATE users SET linked_id = ? WHERE id = ?').run(other.id, u.id);
      else ids.push(u.id);
    }
    if (ids.length) db.prepare(`UPDATE users SET active = 0 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    disabled = ids.join(',') || null;
  } else {
    // Moving between two inactive states: logins are already off; carry the list forward so reactivation restores them.
    disabled = db.prepare(`SELECT disabled_users FROM stu_status_log WHERE student_id = ? AND new_status != 'active'
      ORDER BY id DESC LIMIT 1`).get(student.id)?.disabled_users || null;
  }
  db.prepare('UPDATE students SET status = ?, status_reason = ?, status_date = ? WHERE id = ?')
    .run(newStatus, newStatus === 'active' ? null : reason, newStatus === 'active' ? null : date, student.id);
  db.prepare(`INSERT INTO stu_status_log (student_id, old_status, new_status, reason, status_date, disabled_users, enabled_users, changed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(student.id, student.status || 'active', newStatus, reason || null, date, disabled, enabled, userId);
  return { logins_disabled: disabled ? disabled.split(',').length : 0, logins_enabled: enabled ? enabled.split(',').length : 0 };
}

const getStudent = (id) => db.prepare(`
  SELECT s.*, c.name AS class_name, c.section AS class_section FROM students s
  LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`).get(id);
const classLabel = (s) => (s && s.class_name ? `${s.class_name} ${s.class_section || ''}`.trim() : '');

/* ---------- Handlers ---------- */
const h = {
  settingsGet(req, res) { res.json(settings()); },
  settingsPut(req, res) {
    const up = db.prepare('INSERT INTO stu_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const k of Object.keys(SETTING_DEFAULTS)) {
      if (!(k in req.body)) continue;
      const v = req.body[k] == null ? '' : String(req.body[k]).trim();
      if (/_fee$/.test(k) && v !== '' && !(num(v) >= 0)) return res.status(400).json({ error: `${k.replace(/_/g, ' ')} must be 0 or more` });
      if (k === 'prospectus_start' && v && !/\d+$/.test(v)) return res.status(400).json({ error: 'Prospectus start number must end in digits, e.g. UE/26-27/001' });
      up.run(k, v);
    }
    res.json(settings());
  },

  nextNumbers(req, res) {
    res.json({ admission_no: nextAdmissionNo(), tc_no: nextTcNo(), reg_no: nextRegNo(), session: currentSession() });
  },

  profile(req, res) {
    if (!canSeeStudent(req.user, req.params.id)) return res.status(403).json({ error: 'Forbidden' });
    const s = getStudent(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const custom = db.prepare(`SELECT m.id AS field_id, m.name AS label, v.value FROM masters m
      LEFT JOIN stu_custom_values v ON v.field_id = m.id AND v.student_id = ?
      WHERE m.type = 'student-custom-fields' ORDER BY m.sort_order, m.name`).all(s.id);
    const tc = db.prepare("SELECT id, tc_no, issue_date FROM stu_tc WHERE student_id = ? AND status = 'issued' ORDER BY id DESC LIMIT 1").get(s.id) || null;
    const history = isStaff(req.user)
      ? db.prepare(`SELECT l.*, u.full_name AS changed_by_name FROM stu_status_log l LEFT JOIN users u ON u.id = l.changed_by
          WHERE l.student_id = ? ORDER BY l.id DESC`).all(s.id)
      : [];
    res.json({ ...s, custom, tc, status_history: history });
  },

  admit(req, res) {
    const body = { ...req.body };
    if (!body.admission_no) body.admission_no = nextAdmissionNo();
    if (!body.admission_date) body.admission_date = today();
    if (!body.session) body.session = currentSession();
    const { data, error } = cleanProfile(body, null);
    if (error) return res.status(400).json({ error });
    const regId = num(req.body.registration_id) || null;
    const prosId = num(req.body.prospectus_id) || null;
    if (regId) {
      const r = db.prepare('SELECT status FROM stu_registrations WHERE id = ?').get(regId);
      if (!r) return res.status(400).json({ error: 'Registration not found' });
      if (r.status === 'admitted') return res.status(409).json({ error: 'This registration has already been admitted' });
      if (r.status === 'rejected') return res.status(400).json({ error: 'This registration was rejected' });
    }
    if (prosId && !db.prepare('SELECT 1 FROM prospectus WHERE id = ?').get(prosId)) return res.status(400).json({ error: 'Prospectus not found' });
    const id = db.transaction(() => {
      const cols = Object.keys(data);
      const info = db.prepare(`INSERT INTO students (${cols.join(', ')}, registration_id, prospectus_id, status)
        VALUES (${cols.map(() => '?').join(', ')}, ?, ?, 'active')`).run(...cols.map(c => data[c]), regId, prosId);
      const sid = info.lastInsertRowid;
      const problem = saveCustomValues(sid, req.body.custom);
      if (problem) throw Object.assign(new Error(problem), { status: 400 });
      if (regId) db.prepare("UPDATE stu_registrations SET status = 'admitted', student_id = ? WHERE id = ?").run(sid, regId);
      return sid;
    })();
    res.status(201).json({ id, admission_no: data.admission_no });
  },

  update(req, res) {
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { data, error } = cleanProfile(req.body, existing);
    if (error) return res.status(400).json({ error });
    db.transaction(() => {
      const cols = Object.keys(data);
      if (cols.length) db.prepare(`UPDATE students SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => data[c]), existing.id);
      const problem = saveCustomValues(existing.id, req.body.custom);
      if (problem) throw Object.assign(new Error(problem), { status: 400 });
    })();
    res.json({ ok: true });
  },

  setStatus(req, res) {
    const s = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const status = req.body.status;
    if (!STATUSES.includes(status) || status === 'tc_issued') {
      return res.status(400).json({ error: 'status must be active, inactive, left or passed_out (issue a TC from the TC screen)' });
    }
    if ((s.status || 'active') === status) return res.status(400).json({ error: `Student is already ${status.replace('_', ' ')}` });
    if (s.status === 'tc_issued') return res.status(400).json({ error: 'A TC has been issued for this student. Cancel the TC to change the status.' });
    const date = req.body.date || today();
    if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const reason = String(req.body.reason || '').trim();
    if (status !== 'active' && !reason) return res.status(400).json({ error: 'Please give a reason' });
    const result = db.transaction(() => applyStatus(s, status, reason, date, req.user.id))();
    res.json({ ok: true, status, ...result });
  },

  search(req, res) {
    const q = req.query;
    const w = [], p = [];
    const like = (col, v) => { w.push(`${col} LIKE ?`); p.push(`%${v}%`); };
    if (q.q) { w.push('(s.full_name LIKE ? OR s.admission_no LIKE ? OR s.father_name LIKE ? OR s.mother_name LIKE ? OR s.contact LIKE ?)'); p.push(...Array(5).fill(`%${q.q}%`)); }
    for (const [key, col] of [['class_id', 's.class_id'], ['gender', 's.gender'], ['category', 's.category'], ['religion', 's.religion'],
      ['house', 's.house'], ['blood_group', 's.blood_group'], ['session', 's.session']]) {
      if (q[key]) { w.push(`${col} = ?`); p.push(q[key]); }
    }
    if (q.status) { w.push("COALESCE(s.status, 'active') = ?"); p.push(q.status); }
    if (q.name) like('s.full_name', q.name);
    if (q.admission_no) like('s.admission_no', q.admission_no);
    if (q.father_name) like('s.father_name', q.father_name);
    if (q.mother_name) like('s.mother_name', q.mother_name);
    if (q.contact) like('s.contact', q.contact);
    if (q.address) like('s.address', q.address);
    if (q.aadhaar_no) like('s.aadhaar_no', q.aadhaar_no);
    for (const [key, col, op] of [['adm_from', 's.admission_date', '>='], ['adm_to', 's.admission_date', '<='], ['dob_from', 's.dob', '>='], ['dob_to', 's.dob', '<=']]) {
      if (q[key]) {
        if (!isDate(q[key])) return res.status(400).json({ error: `${key} must be YYYY-MM-DD` });
        w.push(`${col} ${op} ?`); p.push(q[key]);
      }
    }
    if (q.custom_field && q.custom_value) {
      w.push('EXISTS (SELECT 1 FROM stu_custom_values v WHERE v.student_id = s.id AND v.field_id = ? AND v.value LIKE ?)');
      p.push(q.custom_field, `%${q.custom_value}%`);
    }
    res.json(db.prepare(`
      SELECT s.*, c.name AS class_name, c.section AS class_section FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
      ORDER BY c.name, c.section, s.roll_no, s.full_name LIMIT 2000`).all(...p));
  },

  /* ---- Transfer Certificate ---- */
  tcList(req, res) {
    res.json(db.prepare(`
      SELECT t.*, s.full_name, s.admission_no FROM stu_tc t JOIN students s ON s.id = t.student_id ORDER BY t.id DESC`).all());
  },
  // Defaults for the TC form: attendance and dues are worked out from the student's records.
  tcPrefill(req, res) {
    const s = getStudent(req.params.studentId);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const att = db.prepare(`SELECT COUNT(*) AS days, SUM(status IN ('present','late')) AS present FROM attendance WHERE student_id = ?`).get(s.id);
    const due = db.prepare("SELECT COALESCE(SUM(amount - paid), 0) AS due FROM fees WHERE student_id = ? AND status != 'paid'").get(s.id).due;
    res.json({
      tc_no: nextTcNo(), issue_date: today(), leaving_date: today(), last_class: classLabel(s),
      working_days: att.days || 0, days_present: att.present || 0,
      dues_paid: due > 0 ? 'No' : 'Yes', fees_due: Math.round(due * 100) / 100, student: s,
    });
  },
  tcIssue(req, res) {
    const b = req.body;
    const s = getStudent(b.student_id);
    if (!s) return res.status(400).json({ error: 'Select a student' });
    if (s.status === 'tc_issued') return res.status(409).json({ error: 'A TC has already been issued for this student' });
    const issue = b.issue_date || today(), leaving = b.leaving_date || issue;
    for (const [v, label] of [[issue, 'Issue date'], [leaving, 'Leaving date'], [b.application_date, 'Application date']]) {
      if (v && !isDate(v)) return res.status(400).json({ error: `${label} must be YYYY-MM-DD` });
    }
    if (leaving > issue) return res.status(400).json({ error: 'Leaving date cannot be after the issue date' });
    if (b.application_date && b.application_date > issue) return res.status(400).json({ error: 'Application date cannot be after the issue date' });
    const reason = String(b.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Reason for leaving is required' });
    for (const f of ['working_days', 'days_present']) {
      if (b[f] != null && b[f] !== '' && !(Number.isInteger(num(b[f])) && num(b[f]) >= 0)) return res.status(400).json({ error: `${f.replace('_', ' ')} must be a whole number` });
    }
    if (num(b.days_present) > num(b.working_days)) return res.status(400).json({ error: 'Days present cannot exceed working days' });
    const tcNo = String(b.tc_no || '').trim() || nextTcNo();
    const out = db.transaction(() => {
      const info = db.prepare(`INSERT INTO stu_tc (tc_no, student_id, application_date, issue_date, leaving_date, last_class, qualified_for_promotion,
        dues_paid, working_days, days_present, conduct, reason, nationality, remarks, previous_status, issued_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        tcNo, s.id, b.application_date || null, issue, leaving, b.last_class || classLabel(s), b.qualified_for_promotion || null,
        b.dues_paid || null, b.working_days === '' || b.working_days == null ? null : num(b.working_days),
        b.days_present === '' || b.days_present == null ? null : num(b.days_present),
        b.conduct || 'Good', reason, b.nationality || 'Indian', b.remarks || null, s.status || 'active', req.user.id);
      const logins = applyStatus(s, 'tc_issued', `TC ${tcNo}: ${reason}`, leaving, req.user.id);
      return { id: info.lastInsertRowid, tc_no: tcNo, ...logins };
    })();
    res.status(201).json(out);
  },
  tcGet(req, res) {
    const tc = db.prepare('SELECT * FROM stu_tc WHERE id = ?').get(req.params.id);
    if (!tc) return res.status(404).json({ error: 'Not found' });
    const school = db.prepare('SELECT * FROM school_settings WHERE id = 1').get();
    res.json({ ...tc, student: getStudent(tc.student_id), school });
  },
  tcCancel(req, res) {
    const tc = db.prepare('SELECT * FROM stu_tc WHERE id = ?').get(req.params.id);
    if (!tc) return res.status(404).json({ error: 'Not found' });
    if (tc.status === 'cancelled') return res.status(400).json({ error: 'TC is already cancelled' });
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Give a reason for cancelling the TC' });
    const s = db.prepare('SELECT * FROM students WHERE id = ?').get(tc.student_id);
    const back = tc.previous_status && tc.previous_status !== 'tc_issued' ? tc.previous_status : 'active';
    const out = db.transaction(() => {
      db.prepare("UPDATE stu_tc SET status = 'cancelled', cancel_reason = ? WHERE id = ?").run(reason, tc.id);
      return applyStatus(s, back, `TC ${tc.tc_no} cancelled: ${reason}`, today(), req.user.id);
    })();
    res.json({ ok: true, status: back, ...out });
  },

  /* ---- Documents ---- */
  documents(req, res) {
    if (!canSeeStudent(req.user, req.params.studentId)) return res.status(403).json({ error: 'Forbidden' });
    if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(req.params.studentId)) return res.status(404).json({ error: 'Not found' });
    const rows = db.prepare('SELECT * FROM stu_documents WHERE student_id = ?').all(req.params.studentId);
    const names = masterNames('student-documents');
    const byType = new Map(rows.map(r => [r.doc_type, r]));
    const list = names.map(name => byType.get(name) || { doc_type: name, status: 'pending', file_url: null, received_on: null, remarks: null });
    // Documents recorded under a checklist item that has since been removed are still shown.
    for (const r of rows) if (!names.includes(r.doc_type)) list.push({ ...r, retired: true });
    res.json(list);
  },
  documentSave(req, res) {
    const sid = req.params.studentId;
    if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(sid)) return res.status(404).json({ error: 'Student not found' });
    const { doc_type, status, file_url, received_on, remarks } = req.body;
    if (!doc_type) return res.status(400).json({ error: 'doc_type is required' });
    if (!['received', 'pending'].includes(status)) return res.status(400).json({ error: 'status must be received or pending' });
    if (received_on && !isDate(received_on)) return res.status(400).json({ error: 'received_on must be YYYY-MM-DD' });
    const urlErr = badUrl(file_url, 'File');
    if (urlErr) return res.status(400).json({ error: urlErr });
    db.prepare(`INSERT INTO stu_documents (student_id, doc_type, status, file_url, received_on, remarks, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, doc_type) DO UPDATE SET status = excluded.status, file_url = excluded.file_url,
        received_on = excluded.received_on, remarks = excluded.remarks, updated_at = CURRENT_TIMESTAMP`)
      .run(sid, doc_type, status, file_url || null, status === 'received' ? (received_on || today()) : null, remarks || null);
    res.json({ ok: true });
  },

  /* ---- Registrations ---- */
  regList(req, res) {
    const { status } = req.query;
    res.json(db.prepare(`
      SELECT r.*, c.name AS class_name, c.section AS class_section, p.prospectus_no, s.admission_no
      FROM stu_registrations r LEFT JOIN classes c ON c.id = r.class_id
      LEFT JOIN prospectus p ON p.id = r.prospectus_id LEFT JOIN students s ON s.id = r.student_id
      ${status ? 'WHERE r.status = ?' : ''} ORDER BY r.id DESC`).all(...(status ? [status] : [])));
  },
  regGet(req, res) {
    const r = db.prepare(`SELECT r.*, p.prospectus_no FROM stu_registrations r LEFT JOIN prospectus p ON p.id = r.prospectus_id WHERE r.id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  },
  regSave(req, res) {
    const existing = req.params.id ? db.prepare('SELECT * FROM stu_registrations WHERE id = ?').get(req.params.id) : null;
    if (req.params.id && !existing) return res.status(404).json({ error: 'Not found' });
    if (existing && existing.status === 'admitted' && req.body.status && req.body.status !== 'admitted') {
      return res.status(400).json({ error: 'This applicant has been admitted; the registration can no longer change' });
    }
    const FIELDS = ['reg_date', 'session', 'prospectus_id', 'class_id', 'first_name', 'last_name', 'gender', 'dob', 'father_name', 'mother_name',
      'phone', 'email', 'address', 'last_school', 'registration_fee', 'test_date', 'test_marks', 'interview_status', 'status', 'remarks'];
    const d = {};
    for (const f of FIELDS) if (f in req.body) d[f] = req.body[f] === '' ? null : req.body[f];
    if (!existing && d.prospectus_id) {
      // Copy the applicant's details from their prospectus so the desk doesn't retype them.
      const p = db.prepare('SELECT * FROM prospectus WHERE id = ?').get(d.prospectus_id);
      if (!p) return res.status(400).json({ error: 'Prospectus not found' });
      if (db.prepare('SELECT 1 FROM stu_registrations WHERE prospectus_id = ?').get(p.id)) return res.status(409).json({ error: `Prospectus ${p.prospectus_no} is already registered` });
      for (const f of ['class_id', 'first_name', 'last_name', 'gender', 'dob', 'father_name', 'mother_name', 'phone', 'email', 'address', 'last_school']) {
        if (d[f] == null && p[f] != null) d[f] = p[f];
      }
      if (d.session == null && p.session) d.session = p.session;
    }
    const v = { ...(existing || {}), ...d };
    if (!v.first_name) return res.status(400).json({ error: "Applicant's first name is required" });
    if (v.gender && !['M', 'F', 'O'].includes(v.gender)) return res.status(400).json({ error: 'Gender must be M, F or O' });
    for (const f of ['reg_date', 'dob', 'test_date']) if (v[f] && !isDate(v[f])) return res.status(400).json({ error: `${f.replace('_', ' ')} must be YYYY-MM-DD` });
    if (v.registration_fee != null && !(num(v.registration_fee) >= 0)) return res.status(400).json({ error: 'Registration fee must be 0 or more' });
    if (v.test_marks != null && !(num(v.test_marks) >= 0)) return res.status(400).json({ error: 'Test marks must be 0 or more' });
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return res.status(400).json({ error: 'Email address is not valid' });
    if (d.status === 'admitted' && !v.student_id) return res.status(400).json({ error: 'Use "Admit" to admit an applicant' });
    // Interview result drives the registration status unless it was set explicitly.
    if (d.interview_status && !d.status && v.status !== 'admitted') {
      d.status = { selected: 'selected', rejected: 'rejected', waitlisted: 'waitlisted', pending: 'registered' }[d.interview_status];
    }
    if (existing) {
      const cols = Object.keys(d);
      if (!cols.length) return res.status(400).json({ error: 'No fields provided' });
      db.prepare(`UPDATE stu_registrations SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => d[c]), existing.id);
      return res.json({ ok: true });
    }
    if (!d.reg_date) d.reg_date = today();
    if (!d.session) d.session = currentSession();
    if (d.registration_fee == null) d.registration_fee = num(settings().registration_fee) || 0;
    d.reg_no = String(req.body.reg_no || '').trim() || nextRegNo();
    const cols = Object.keys(d);
    const info = db.prepare(`INSERT INTO stu_registrations (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(c => d[c]));
    res.status(201).json({ id: info.lastInsertRowid, reg_no: d.reg_no });
  },
  regRemove(req, res) {
    const r = db.prepare('SELECT status FROM stu_registrations WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.status === 'admitted') return res.status(400).json({ error: 'An admitted registration cannot be deleted' });
    db.prepare('DELETE FROM stu_registrations WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  },

  /* ---- Custom field values ---- */
  customGet(req, res) {
    if (!canSeeStudent(req.user, req.params.studentId)) return res.status(403).json({ error: 'Forbidden' });
    res.json(db.prepare('SELECT field_id, value FROM stu_custom_values WHERE student_id = ?').all(req.params.studentId));
  },
  customPut(req, res) {
    if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(req.params.studentId)) return res.status(404).json({ error: 'Student not found' });
    let problem = null;
    db.transaction(() => {
      problem = saveCustomValues(req.params.studentId, req.body.values);
      if (problem) throw Object.assign(new Error(problem), { status: 400 });
    })();
    res.json({ ok: true });
  },
};

/* ---------- Reports ---------- */
const STATUS_OPTIONS = STATUSES.map(s => ({ value: s, label: s.replace('_', ' ') }));
const CLASS_ORDER = 'c.name, c.section';

function ageOn(dob, on) {
  if (!dob || !isDate(dob)) return null;
  const [y1, m1, d1] = dob.split('-').map(Number), [y2, m2, d2] = on.split('-').map(Number);
  let years = y2 - y1, months = m2 - m1;
  if (d2 < d1) months--;
  if (months < 0) { years--; months += 12; }
  return years < 0 ? null : { years, months };
}

registerReport({
  key: 'tc-issue', title: 'TC Issue Report', group: 'Student',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'status', label: 'TC Status', type: 'select', options: ['issued', 'cancelled'] },
  ],
  columns: [
    { key: 'tc_no', label: 'TC No' }, { key: 'issue_date', label: 'Issue Date', type: 'date' }, { key: 'admission_no', label: 'Adm No' },
    { key: 'full_name', label: 'Student' }, { key: 'father_name', label: 'Father' }, { key: 'last_class', label: 'Class' },
    { key: 'leaving_date', label: 'Leaving Date', type: 'date' }, { key: 'reason', label: 'Reason' }, { key: 'conduct', label: 'Conduct' },
    { key: 'status', label: 'Status' },
  ],
  run: (p) => db.prepare(`
    SELECT t.*, s.admission_no, s.full_name, s.father_name FROM stu_tc t JOIN students s ON s.id = t.student_id
    WHERE t.issue_date BETWEEN ? AND ? AND (? = '' OR t.status = ?) ORDER BY t.issue_date DESC, t.id DESC`)
    .all(p.from, p.to, p.status, p.status),
});

registerReport({
  key: 'admission-registration', title: 'Admission And Registration Report', group: 'Student',
  description: 'New admissions and registrations in a period.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'kind', label: 'Show', type: 'select', options: ['Admission', 'Registration'] },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'kind', label: 'Type' }, { key: 'number', label: 'Adm / Reg No' }, { key: 'date', label: 'Date', type: 'date' },
    { key: 'name', label: 'Name' }, { key: 'class', label: 'Class' }, { key: 'gender', label: 'Gender' },
    { key: 'father_name', label: 'Father' }, { key: 'phone', label: 'Phone' }, { key: 'status', label: 'Status' },
  ],
  run: (p) => db.prepare(`
    SELECT * FROM (
      SELECT 'Admission' AS kind, s.admission_no AS number, COALESCE(s.admission_date, date(s.created_at)) AS date, s.full_name AS name,
        c.name || ' ' || c.section AS class, s.class_id, s.gender, s.father_name, s.contact AS phone, COALESCE(s.status, 'active') AS status
      FROM students s LEFT JOIN classes c ON c.id = s.class_id
      UNION ALL
      SELECT 'Registration', r.reg_no, r.reg_date, TRIM(r.first_name || ' ' || COALESCE(r.last_name, '')),
        c.name || ' ' || c.section, r.class_id, r.gender, r.father_name, r.phone, r.status
      FROM stu_registrations r LEFT JOIN classes c ON c.id = r.class_id
    ) x WHERE x.date BETWEEN ? AND ? AND (? = '' OR x.kind = ?) AND (? = '' OR x.class_id = ?)
    ORDER BY x.date DESC, x.kind`).all(p.from, p.to, p.kind, p.kind, p.class_id, p.class_id),
});

registerReport({
  key: 'student-strength', title: 'Student Strength Report', group: 'Student',
  description: 'Number of students in each class and section, by gender.',
  params: [{ name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, default: 'active' }],
  columns: [
    { key: 'class', label: 'Class' }, { key: 'section', label: 'Section' }, { key: 'class_teacher', label: 'Class Teacher' },
    { key: 'boys', label: 'Boys', type: 'number', total: true }, { key: 'girls', label: 'Girls', type: 'number', total: true },
    { key: 'other', label: 'Other', type: 'number', total: true }, { key: 'total', label: 'Total', type: 'number', total: true },
  ],
  run: (p) => db.prepare(`
    SELECT c.name AS class, c.section, t.full_name AS class_teacher,
      COUNT(s.id) FILTER (WHERE s.gender = 'M') AS boys, COUNT(s.id) FILTER (WHERE s.gender = 'F') AS girls,
      COUNT(s.id) FILTER (WHERE COALESCE(s.gender, 'O') NOT IN ('M','F')) AS other, COUNT(s.id) AS total
    FROM classes c LEFT JOIN teachers t ON t.id = c.class_teacher_id
    LEFT JOIN students s ON s.class_id = c.id AND (? = '' OR COALESCE(s.status, 'active') = ?)
    GROUP BY c.id ORDER BY ${CLASS_ORDER}`).all(p.status, p.status),
});

registerReport({
  key: 'admission-withdrawal', title: 'Admission/Withdrawl Report', group: 'Student',
  description: 'Students admitted and students who left (or took a TC) in a period.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'kind', label: 'Show', type: 'select', options: ['Admission', 'Withdrawal'] },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'kind', label: 'Type' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'admission_no', label: 'Adm No' },
    { key: 'full_name', label: 'Student' }, { key: 'class', label: 'Class' }, { key: 'gender', label: 'Gender' },
    { key: 'father_name', label: 'Father' }, { key: 'detail', label: 'Reason / Details' },
  ],
  run: (p) => db.prepare(`
    SELECT * FROM (
      SELECT 'Admission' AS kind, COALESCE(s.admission_date, date(s.created_at)) AS date, s.admission_no, s.full_name,
        c.name || ' ' || c.section AS class, s.class_id, s.gender, s.father_name, s.session AS detail
      FROM students s LEFT JOIN classes c ON c.id = s.class_id
      UNION ALL
      SELECT 'Withdrawal', s.status_date, s.admission_no, s.full_name, c.name || ' ' || c.section, s.class_id, s.gender, s.father_name,
        REPLACE(s.status, '_', ' ') || COALESCE(': ' || s.status_reason, '')
      FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.status IN ('left','tc_issued')
    ) x WHERE x.date BETWEEN ? AND ? AND (? = '' OR x.kind = ?) AND (? = '' OR x.class_id = ?)
    ORDER BY x.date DESC`).all(p.from, p.to, p.kind, p.kind, p.class_id, p.class_id),
});

registerReport({
  key: 'student-age', title: 'Student Age Report', group: 'Student',
  params: [
    { name: 'as_on', label: 'Age As On', type: 'date', default: 'today', required: true },
    { name: 'class_id', label: 'Class', type: 'class' },
    { name: 'gender', label: 'Gender', type: 'select', options: [{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }] },
  ],
  columns: [
    { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' }, { key: 'class', label: 'Class' },
    { key: 'gender', label: 'Gender' }, { key: 'dob', label: 'Date of Birth', type: 'date' }, { key: 'age', label: 'Age' },
    { key: 'age_years', label: 'Years', type: 'number' },
  ],
  run: (p) => db.prepare(`
    SELECT s.admission_no, s.full_name, c.name || ' ' || c.section AS class, s.gender, s.dob
    FROM students s LEFT JOIN classes c ON c.id = s.class_id
    WHERE COALESCE(s.status, 'active') = 'active' AND (? = '' OR s.class_id = ?) AND (? = '' OR s.gender = ?)
    ORDER BY ${CLASS_ORDER}, s.roll_no, s.full_name`).all(p.class_id, p.class_id, p.gender, p.gender).map(r => {
    const a = ageOn(r.dob, p.as_on);
    return { ...r, age: a ? `${a.years} yrs ${a.months} mths` : 'DOB not recorded', age_years: a ? a.years : null };
  }),
});

registerReport({
  key: 'student-pending-documents', title: 'Student Pending Documents', group: 'Student', roles: ROLES.STAFF,
  description: 'Documents from the checklist that have not been received yet.',
  params: [
    { name: 'class_id', label: 'Class', type: 'class' },
    { name: 'doc', label: 'Document (name contains)', type: 'text' },
  ],
  columns: [
    { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' }, { key: 'class', label: 'Class' },
    { key: 'contact', label: 'Contact' }, { key: 'pending_count', label: 'Pending', type: 'number', total: true }, { key: 'pending', label: 'Pending Documents' },
  ],
  run: (p) => {
    const docs = masterNames('student-documents').filter(d => !p.doc || d.toLowerCase().includes(p.doc.toLowerCase()));
    const received = new Set(db.prepare("SELECT student_id || '|' || doc_type AS k FROM stu_documents WHERE status = 'received'").all().map(r => r.k));
    return db.prepare(`
      SELECT s.id, s.admission_no, s.full_name, c.name || ' ' || c.section AS class, s.contact
      FROM students s LEFT JOIN classes c ON c.id = s.class_id
      WHERE COALESCE(s.status, 'active') = 'active' AND (? = '' OR s.class_id = ?)
      ORDER BY ${CLASS_ORDER}, s.roll_no, s.full_name`).all(p.class_id, p.class_id)
      .map(s => { const pending = docs.filter(d => !received.has(`${s.id}|${d}`)); return { ...s, pending_count: pending.length, pending: pending.join(', ') }; })
      .filter(s => s.pending_count > 0);
  },
});

registerReport({
  key: 'student-registrations', title: 'Student Registrations Report', group: 'Student',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['registered', 'selected', 'waitlisted', 'rejected', 'admitted'] },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'reg_no', label: 'Reg No' }, { key: 'reg_date', label: 'Date', type: 'date' }, { key: 'name', label: 'Applicant' },
    { key: 'class', label: 'Class Applied' }, { key: 'gender', label: 'Gender' }, { key: 'father_name', label: 'Father' },
    { key: 'phone', label: 'Phone' }, { key: 'test_marks', label: 'Test Marks', type: 'number' }, { key: 'status', label: 'Status' },
    { key: 'admission_no', label: 'Adm No' }, { key: 'registration_fee', label: 'Fee', type: 'money', total: true },
  ],
  run: (p) => db.prepare(`
    SELECT r.*, TRIM(r.first_name || ' ' || COALESCE(r.last_name, '')) AS name, c.name || ' ' || c.section AS class, s.admission_no
    FROM stu_registrations r LEFT JOIN classes c ON c.id = r.class_id LEFT JOIN students s ON s.id = r.student_id
    WHERE r.reg_date BETWEEN ? AND ? AND (? = '' OR r.status = ?) AND (? = '' OR r.class_id = ?)
    ORDER BY r.reg_date DESC, r.id DESC`).all(p.from, p.to, p.status, p.status, p.class_id, p.class_id),
});

registerReport({
  key: 'registrations-prospectus', title: 'Registrations & Prospectus Report', group: 'Student',
  description: 'Every prospectus sold, and whether the applicant registered and was admitted.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'stage', label: 'Stage', type: 'select', options: ['Prospectus only', 'Registered', 'Admitted'] },
  ],
  columns: [
    { key: 'prospectus_no', label: 'Prospectus No' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'name', label: 'Applicant' },
    { key: 'class', label: 'Class' }, { key: 'phone', label: 'Phone' }, { key: 'total_amount', label: 'Amount', type: 'money', total: true },
    { key: 'reg_no', label: 'Reg No' }, { key: 'reg_status', label: 'Registration' }, { key: 'admission_no', label: 'Adm No' }, { key: 'stage', label: 'Stage' },
  ],
  run: (p) => db.prepare(`
    SELECT * FROM (
      SELECT p.prospectus_no, p.date, TRIM(p.first_name || ' ' || COALESCE(p.last_name, '')) AS name, c.name || ' ' || c.section AS class,
        p.phone, p.total_amount, r.reg_no, r.status AS reg_status, adm.admission_no,
        CASE WHEN adm.admission_no IS NOT NULL THEN 'Admitted' WHEN r.id IS NOT NULL THEN 'Registered' ELSE 'Prospectus only' END AS stage
      FROM prospectus p LEFT JOIN classes c ON c.id = p.class_id
      LEFT JOIN stu_registrations r ON r.prospectus_id = p.id
      LEFT JOIN (SELECT id, admission_no, prospectus_id FROM students) adm
        ON adm.id = (SELECT COALESCE(r.student_id, (SELECT id FROM students WHERE prospectus_id = p.id LIMIT 1)))
      WHERE COALESCE(p.date, date(p.created_at)) BETWEEN ? AND ?
    ) WHERE ? = '' OR stage = ? ORDER BY date DESC, prospectus_no DESC`).all(p.from, p.to, p.stage, p.stage),
});

registerReport({
  key: 'prospectus-registration-summary', title: 'Prospectus & Registration Summary', group: 'Student',
  description: 'Class-wise prospectus sold, registrations, selections and admissions.',
  params: [{ name: 'session', label: 'Session', type: 'text', default: 'session' }],
  columns: [
    { key: 'class', label: 'Class' }, { key: 'prospectus', label: 'Prospectus Sold', type: 'number', total: true },
    { key: 'prospectus_amount', label: 'Prospectus Amount', type: 'money', total: true },
    { key: 'registered', label: 'Registrations', type: 'number', total: true }, { key: 'selected', label: 'Selected', type: 'number', total: true },
    { key: 'rejected', label: 'Rejected', type: 'number', total: true }, { key: 'admitted', label: 'Admitted', type: 'number', total: true },
  ],
  run: (p) => db.prepare(`
    SELECT COALESCE(c.name || ' ' || c.section, 'Not specified') AS class,
      SUM(x.kind = 'p') AS prospectus, SUM(CASE WHEN x.kind = 'p' THEN x.amount ELSE 0 END) AS prospectus_amount,
      SUM(x.kind = 'r') AS registered, SUM(x.kind = 'r' AND x.status = 'selected') AS selected,
      SUM(x.kind = 'r' AND x.status = 'rejected') AS rejected, SUM(x.kind = 'r' AND x.status = 'admitted') AS admitted
    FROM (
      SELECT 'p' AS kind, class_id, total_amount AS amount, NULL AS status, session FROM prospectus
      UNION ALL SELECT 'r', class_id, 0, status, session FROM stu_registrations
    ) x LEFT JOIN classes c ON c.id = x.class_id
    WHERE ? = '' OR COALESCE(x.session, '') = ? OR x.session IS NULL
    GROUP BY x.class_id ORDER BY c.name, c.section`).all(p.session, p.session),
});

registerReport({
  key: 'student-custom-fields', title: 'Student Customized Fields Report', group: 'Student', roles: ROLES.STAFF,
  description: 'Values recorded in the school-defined student fields.',
  params: [
    { name: 'class_id', label: 'Class', type: 'class' },
    { name: 'field', label: 'Field (name contains)', type: 'text' },
    { name: 'value', label: 'Value contains', type: 'text' },
  ],
  columns: [
    { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' }, { key: 'class', label: 'Class' },
    { key: 'field', label: 'Field' }, { key: 'value', label: 'Value' },
  ],
  run: (p) => db.prepare(`
    SELECT s.admission_no, s.full_name, c.name || ' ' || c.section AS class, m.name AS field, v.value
    FROM stu_custom_values v JOIN students s ON s.id = v.student_id JOIN masters m ON m.id = v.field_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE (? = '' OR s.class_id = ?) AND (? = '' OR m.name LIKE '%' || ? || '%') AND (? = '' OR v.value LIKE '%' || ? || '%')
    ORDER BY ${CLASS_ORDER}, s.full_name, m.sort_order`).all(p.class_id, p.class_id, p.field, p.field, p.value, p.value),
});

registerReport({
  key: 'admission-summary', title: 'Admission Summary', group: 'Student',
  description: 'Active students per class by gender and category, with new admissions this session.',
  params: [{ name: 'session', label: 'Session', type: 'text', default: 'session' }],
  columns: [
    { key: 'class', label: 'Class' }, { key: 'boys', label: 'Boys', type: 'number', total: true }, { key: 'girls', label: 'Girls', type: 'number', total: true },
    { key: 'total', label: 'Total', type: 'number', total: true }, { key: 'new_admissions', label: 'New Admissions', type: 'number', total: true },
    { key: 'general', label: 'General', type: 'number', total: true }, { key: 'obc', label: 'OBC', type: 'number', total: true },
    { key: 'sc', label: 'SC', type: 'number', total: true }, { key: 'st', label: 'ST', type: 'number', total: true },
    { key: 'other_category', label: 'Other / Not Set', type: 'number', total: true },
  ],
  run: (p) => {
    const cur = currentSession();
    return db.prepare(`
      SELECT c.name || ' ' || c.section AS class,
        COUNT(s.id) FILTER (WHERE s.gender = 'M') AS boys, COUNT(s.id) FILTER (WHERE s.gender = 'F') AS girls, COUNT(s.id) AS total,
        COUNT(s.id) FILTER (WHERE s.session = ?) AS new_admissions,
        COUNT(s.id) FILTER (WHERE UPPER(s.category) = 'GENERAL') AS general, COUNT(s.id) FILTER (WHERE UPPER(s.category) = 'OBC') AS obc,
        COUNT(s.id) FILTER (WHERE UPPER(s.category) = 'SC') AS sc, COUNT(s.id) FILTER (WHERE UPPER(s.category) = 'ST') AS st,
        COUNT(s.id) FILTER (WHERE s.category IS NULL OR UPPER(s.category) NOT IN ('GENERAL','OBC','SC','ST')) AS other_category
      FROM classes c LEFT JOIN students s ON s.class_id = c.id AND COALESCE(s.status, 'active') = 'active'
        AND (? = '' OR COALESCE(s.session, ?) <= ?)
      GROUP BY c.id ORDER BY ${CLASS_ORDER}`).all(p.session, p.session, cur, p.session);
  },
});

registerReport({
  key: 'student-status', title: 'Student Activate/Deactivate Report', group: 'Student', roles: ROLES.STAFF,
  description: 'Every change of student status (activated, deactivated, left, TC issued) and what happened to their logins.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'status', label: 'New Status', type: 'select', options: STATUS_OPTIONS },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'status_date', label: 'Date', type: 'date' }, { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' },
    { key: 'class', label: 'Class' }, { key: 'old_status', label: 'From' }, { key: 'new_status', label: 'To' },
    { key: 'reason', label: 'Reason' }, { key: 'logins', label: 'Logins' }, { key: 'changed_by', label: 'Changed By' },
    { key: 'current_status', label: 'Current Status' },
  ],
  run: (p) => db.prepare(`
    SELECT l.status_date, s.admission_no, s.full_name, c.name || ' ' || c.section AS class,
      REPLACE(l.old_status, '_', ' ') AS old_status, REPLACE(l.new_status, '_', ' ') AS new_status, l.reason,
      CASE WHEN l.disabled_users IS NOT NULL AND l.old_status = 'active' THEN 'Disabled'
           WHEN l.enabled_users IS NOT NULL THEN 'Re-enabled' ELSE '—' END AS logins,
      u.full_name AS changed_by, REPLACE(COALESCE(s.status, 'active'), '_', ' ') AS current_status
    FROM stu_status_log l JOIN students s ON s.id = l.student_id LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN users u ON u.id = l.changed_by
    WHERE l.status_date BETWEEN ? AND ? AND (? = '' OR l.new_status = ?) AND (? = '' OR s.class_id = ?)
    ORDER BY l.status_date DESC, l.id DESC`).all(p.from, p.to, p.status, p.status, p.class_id, p.class_id),
});

function register(router) {
  const A = [auth, role(...ROLES.ADMIN)];
  const S = [auth, role(...ROLES.STAFF)];
  router.get('/stu/settings', ...A, h.settingsGet);
  router.put('/stu/settings', ...A, safe(h.settingsPut));
  router.get('/stu/next-numbers', ...A, h.nextNumbers);
  router.get('/stu/search', ...S, h.search);
  router.post('/stu/admission', ...A, safe(h.admit));
  router.get('/stu/students/:id', auth, h.profile);
  router.put('/stu/students/:id', ...A, safe(h.update));
  router.post('/stu/students/:id/status', ...A, safe(h.setStatus));

  router.get('/stu/tc', ...A, h.tcList);
  router.get('/stu/tc/prefill/:studentId', ...A, h.tcPrefill);
  router.post('/stu/tc', ...A, safe(h.tcIssue));
  router.get('/stu/tc/:id', ...A, h.tcGet);
  router.post('/stu/tc/:id/cancel', ...A, safe(h.tcCancel));

  router.get('/stu/documents/:studentId', auth, h.documents);
  router.put('/stu/documents/:studentId', ...A, safe(h.documentSave));

  router.get('/stu/registrations', ...A, h.regList);
  router.get('/stu/registrations/:id', ...A, h.regGet);
  router.post('/stu/registrations', ...A, safe(h.regSave));
  router.put('/stu/registrations/:id', ...A, safe(h.regSave));
  router.delete('/stu/registrations/:id', ...A, safe(h.regRemove));

  router.get('/stu/custom-values/:studentId', auth, h.customGet);
  router.put('/stu/custom-values/:studentId', ...A, safe(h.customPut));
}

module.exports = { register };
