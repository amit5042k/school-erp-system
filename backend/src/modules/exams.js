// Examination: grading setup, class subjects, subject teachers, optional subjects, marks entry,
// publishing, result blocks, term details, health, remarks, weekly planner, award list and report cards.
// API lives under /exam/... because /exams/:id is already taken by the exams CRUD.
const {
  db, ROLES, auth, role, safe, isStaff, canSeeStudent, makeCrud, mountCrud,
  isDate, num, currentSession, registerReport, registerMaster,
} = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS exam_grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name TEXT,                 -- NULL = applies to every class without its own bands
    min_pct REAL NOT NULL,
    max_pct REAL NOT NULL,
    grade TEXT NOT NULL,
    grade_point REAL,
    remark TEXT
  );
  CREATE TABLE IF NOT EXISTS exam_class_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    max_marks REAL NOT NULL DEFAULT 100,
    pass_marks REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_optional INTEGER NOT NULL DEFAULT 0,
    UNIQUE(class_id, subject)
  );
  CREATE TABLE IF NOT EXISTS exam_subject_teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    UNIQUE(class_id, subject)
  );
  CREATE TABLE IF NOT EXISTS exam_student_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    session TEXT NOT NULL,
    UNIQUE(student_id, subject, session)
  );
  CREATE TABLE IF NOT EXISTS exam_result_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL DEFAULT 0, -- 0 = all exams
    reason TEXT,
    blocked_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, exam_id)
  );
  CREATE TABLE IF NOT EXISTS exam_publish (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    marks_published INTEGER NOT NULL DEFAULT 0,
    result_published INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exam_id, class_id)
  );
  CREATE TABLE IF NOT EXISTS exam_planner (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    week_start TEXT NOT NULL,
    topic TEXT NOT NULL,
    objectives TEXT,
    activities TEXT,
    homework TEXT,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','carried_over')),
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS exam_student_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    working_days INTEGER,
    days_present INTEGER,
    result TEXT,
    rank INTEGER,
    UNIQUE(student_id, exam_id)
  );
  CREATE TABLE IF NOT EXISTS exam_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session TEXT NOT NULL,
    term TEXT NOT NULL,
    height_cm REAL,
    weight_kg REAL,
    vision_left TEXT,
    vision_right TEXT,
    dental TEXT,
    blood_group TEXT,
    notes TEXT,
    UNIQUE(student_id, session, term)
  );
  CREATE TABLE IF NOT EXISTS exam_student_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    remark TEXT NOT NULL,
    teacher_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, exam_id)
  );
  CREATE TABLE IF NOT EXISTS exam_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// CBSE-style 8-point scale as a starting point; schools edit it in Scholastic Grades.
if (!db.prepare('SELECT COUNT(*) AS c FROM exam_grades').get().c) {
  const ins = db.prepare('INSERT INTO exam_grades (class_name, min_pct, max_pct, grade, grade_point, remark) VALUES (NULL, ?, ?, ?, ?, ?)');
  [[91, 100, 'A1', 10, 'Outstanding'], [81, 90.99, 'A2', 9, 'Excellent'], [71, 80.99, 'B1', 8, 'Very Good'],
    [61, 70.99, 'B2', 7, 'Good'], [51, 60.99, 'C1', 6, 'Fair'], [41, 50.99, 'C2', 5, 'Satisfactory'],
    [33, 40.99, 'D', 4, 'Pass'], [0, 32.99, 'E', 0, 'Needs Improvement']].forEach(g => ins.run(...g));
}

const SETTING_DEFAULTS = {
  passing_pct: '33',
  show_rank: '1',
  header_text: '',
  sub_header: 'Progress Report',
  signature_1: 'Class Teacher',
  signature_2: 'Exam Incharge',
  signature_3: 'Principal',
  footer_note: '',
};

registerMaster({
  type: 'exam-types', title: 'Exam Types / Terms', group: 'Examination', read: ROLES.ALL,
  seed: ['Unit Test 1', 'Unit Test 2', 'Half Yearly', 'Pre-Board', 'Annual'],
});
registerMaster({
  type: 'pre-primary-subjects', title: 'Pre-Primary Subjects', group: 'Examination', read: ROLES.ALL,
  description: 'Activity areas for Nursery/LKG/UKG, assessed with descriptive grades instead of marks.',
  fields: [
    { name: 'skill_area', label: 'Skill Area', type: 'select', options: ['Language', 'Numeracy', 'Environment', 'Motor Skills', 'Creative', 'Personal & Social'] },
    { name: 'grading_scale', label: 'Grading Scale', type: 'text' },
  ],
  seed: [
    { name: 'English (Oral)', skill_area: 'Language', grading_scale: 'A: Excellent, B: Very Good, C: Good, D: Needs Practice' },
    { name: 'Hindi (Oral)', skill_area: 'Language', grading_scale: 'A: Excellent, B: Very Good, C: Good, D: Needs Practice' },
    { name: 'Number Work', skill_area: 'Numeracy', grading_scale: 'A: Excellent, B: Very Good, C: Good, D: Needs Practice' },
    { name: 'General Awareness', skill_area: 'Environment', grading_scale: 'A: Excellent, B: Very Good, C: Good, D: Needs Practice' },
    { name: 'Drawing & Colouring', skill_area: 'Creative', grading_scale: 'A: Excellent, B: Very Good, C: Good, D: Needs Practice' },
    { name: 'Rhymes & Music', skill_area: 'Creative', grading_scale: 'A: Excellent, B: Very Good, C: Good, D: Needs Practice' },
  ],
});
registerMaster({
  type: 'report-card-remarks', title: 'Report Card Remarks', group: 'Examination', read: ROLES.STAFF,
  description: 'Ready-made remarks teachers can pick when writing report card remarks.',
  fields: [{ name: 'category', label: 'Category', type: 'select', options: ['Academic', 'Behaviour', 'Attendance', 'General'] }],
  seed: [
    { name: 'Excellent performance. Keep it up!', category: 'Academic' },
    { name: 'Good progress; can do even better with regular practice.', category: 'Academic' },
    { name: 'Needs to pay more attention in class.', category: 'Behaviour' },
    { name: 'Regular and punctual.', category: 'Attendance' },
    { name: 'Should improve attendance.', category: 'Attendance' },
    { name: 'Well-behaved and helpful to classmates.', category: 'Behaviour' },
  ],
});

/* ---------- helpers ---------- */
const bad = (res, error, status = 400) => res.status(status).json({ error });
const round = (n, d = 2) => Math.round(Number(n) * 10 ** d) / 10 ** d;

function settings() {
  const rows = db.prepare('SELECT key, value FROM exam_settings').all();
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value ?? '';
  return out;
}

function getExam(id) { return db.prepare('SELECT * FROM exams WHERE id = ?').get(id); }
function getClass(id) { return db.prepare('SELECT * FROM classes WHERE id = ?').get(id); }

function classStudents(classId) {
  return db.prepare(`
    SELECT s.id, s.admission_no, s.full_name, s.roll_no, s.gender, s.dob, s.father_name, s.mother_name, s.class_id,
           c.name AS class_name, c.section AS class_section
    FROM students s JOIN classes c ON c.id = s.class_id
    WHERE s.class_id = ? AND COALESCE(s.status, 'active') = 'active'
    ORDER BY (s.roll_no IS NULL), s.roll_no, s.full_name`).all(classId);
}

// Band lookup: the class's own bands if it has any, else the school-wide ones; highest min_pct <= pct wins.
function gradeBands(className) {
  const own = className ? db.prepare('SELECT * FROM exam_grades WHERE class_name = ? ORDER BY min_pct DESC').all(className) : [];
  return own.length ? own : db.prepare('SELECT * FROM exam_grades WHERE class_name IS NULL ORDER BY min_pct DESC').all();
}
function gradeFor(pct, bands) {
  if (pct == null || Number.isNaN(pct)) return null;
  return bands.find(b => pct >= b.min_pct) || null;
}

function classSubjects(classId) {
  return db.prepare('SELECT * FROM exam_class_subjects WHERE class_id = ? ORDER BY sort_order, subject').all(classId);
}

function publishState(examId, classId) {
  return db.prepare('SELECT marks_published, result_published FROM exam_publish WHERE exam_id = ? AND class_id = ?').get(examId, classId)
    || { marks_published: 0, result_published: 0 };
}
function isBlocked(studentId, examId) {
  return !!db.prepare('SELECT 1 FROM exam_result_blocks WHERE student_id = ? AND exam_id IN (0, ?)').get(studentId, examId);
}

// A teacher may enter marks for a class+subject only if assigned to it, or if nobody is assigned and
// they are the class teacher. Admins may always.
function canEnterMarks(user, classId, subject) {
  if (user.role === 'admin') return true;
  const a = db.prepare('SELECT teacher_id FROM exam_subject_teachers WHERE class_id = ? AND subject = ?').get(classId, subject);
  if (a) return a.teacher_id === user.linked_id;
  const c = getClass(classId);
  return !!c && c.class_teacher_id === user.linked_id;
}

// Dynamic select options for report filters; core.js spreads each param per request, so the getter re-runs.
const examParam = (required = true) => ({
  name: 'exam_id', label: 'Exam', type: 'select', required,
  get options() { return db.prepare('SELECT id, name FROM exams ORDER BY start_date DESC, id DESC').all().map(e => ({ value: String(e.id), label: e.name })); },
});

/* ---------- grades ---------- */
const gradeCrud = makeCrud({
  table: 'exam_grades',
  fields: ['class_name', 'min_pct', 'max_pct', 'grade', 'grade_point', 'remark'],
  orderBy: 'class_name IS NOT NULL, class_name, min_pct DESC',
  validate: (d, req, existing) => {
    const min = num(d.min_pct), max = num(d.max_pct);
    if (!d.grade) return 'grade is required';
    if (!(min >= 0 && min <= 100) || !(max >= 0 && max <= 100)) return 'Percentages must be between 0 and 100';
    if (min > max) return 'Min % must not be more than Max %';
    if (d.grade_point != null && d.grade_point !== '' && !(num(d.grade_point) >= 0)) return 'grade_point must be 0 or more';
    const overlap = db.prepare(`
      SELECT grade FROM exam_grades WHERE COALESCE(class_name, '') = COALESCE(?, '') AND id != ?
        AND NOT (max_pct < ? OR min_pct > ?)`).get(d.class_name || null, existing ? existing.id : 0, min, max);
    if (overlap) return `This range overlaps grade ${overlap.grade}`;
    return null;
  },
});

/* ---------- planner ---------- */
const plannerCrud = makeCrud({
  table: 'exam_planner',
  fields: ['class_id', 'subject', 'teacher_id', 'week_start', 'topic', 'objectives', 'activities', 'homework', 'status', 'remarks'],
  orderBy: 'week_start DESC, id DESC',
  joins: 'JOIN classes c ON c.id = exam_planner.class_id LEFT JOIN teachers t ON t.id = exam_planner.teacher_id',
  selectExtra: "exam_planner.*, c.name || ' ' || c.section AS class_label, t.full_name AS teacher_name",
  validate: (d) => {
    if (!d.class_id || !d.subject || !d.topic) return 'class, subject and topic are required';
    if (!isDate(d.week_start)) return 'week_start must be YYYY-MM-DD';
    if (d.status && !['planned', 'completed', 'carried_over'].includes(d.status)) return 'status must be planned, completed or carried_over';
    return null;
  },
});
function ownPlan(req, res) {
  const row = db.prepare('SELECT * FROM exam_planner WHERE id = ?').get(req.params.id);
  if (!row) { bad(res, 'Not found', 404); return null; }
  if (req.user.role !== 'admin' && row.teacher_id !== req.user.linked_id) { bad(res, 'You can only change your own planner entries', 403); return null; }
  return row;
}
const planner = {
  list(req, res) {
    const own = req.user.role !== 'admin';
    res.json(db.prepare(`
      SELECT p.*, c.name || ' ' || c.section AS class_label, t.full_name AS teacher_name
      FROM exam_planner p JOIN classes c ON c.id = p.class_id LEFT JOIN teachers t ON t.id = p.teacher_id
      ${own ? 'WHERE p.teacher_id = ?' : ''} ORDER BY p.week_start DESC, p.id DESC`).all(...(own ? [req.user.linked_id ?? -1] : [])));
  },
  create(req, res) {
    if (req.user.role !== 'admin') {
      if (!req.user.linked_id) return bad(res, 'Your account is not linked to a staff record');
      req.body.teacher_id = req.user.linked_id;
    }
    return plannerCrud.create(req, res);
  },
  update(req, res) {
    if (!ownPlan(req, res)) return;
    if (req.user.role !== 'admin') delete req.body.teacher_id;
    return plannerCrud.update(req, res);
  },
  remove(req, res) {
    if (!ownPlan(req, res)) return;
    return plannerCrud.remove(req, res);
  },
};

/* ---------- handlers ---------- */
const h = {
  settingsGet(req, res) { res.json(settings()); },
  settingsPut(req, res) {
    const body = req.body || {};
    const up = db.prepare('INSERT INTO exam_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    if ('passing_pct' in body) {
      const p = num(body.passing_pct);
      if (!(p >= 0 && p <= 100)) return bad(res, 'Passing % must be between 0 and 100');
    }
    db.transaction(() => {
      for (const k of Object.keys(SETTING_DEFAULTS)) {
        if (!(k in body)) continue;
        let v = body[k] == null ? '' : String(body[k]).slice(0, 500);
        if (k === 'show_rank') v = body[k] && body[k] !== '0' ? '1' : '0';
        up.run(k, v);
      }
    })();
    res.json({ ok: true });
  },

  classSubjectsGet(req, res) {
    if (!req.query.class_id) return bad(res, 'class_id is required');
    res.json(classSubjects(req.query.class_id));
  },
  classSubjectsPut(req, res) {
    const classId = Number(req.params.classId);
    if (!getClass(classId)) return bad(res, 'Class not found', 404);
    const list = Array.isArray(req.body.subjects) ? req.body.subjects : null;
    if (!list) return bad(res, 'subjects[] is required');
    const seen = new Set();
    for (const s of list) {
      if (!s || !String(s.subject || '').trim()) return bad(res, 'Every row needs a subject');
      if (seen.has(s.subject)) return bad(res, `${s.subject} is listed twice`);
      seen.add(s.subject);
      const max = num(s.max_marks ?? 100);
      if (!(max > 0)) return bad(res, `Max marks for ${s.subject} must be more than 0`);
      if (s.pass_marks != null && s.pass_marks !== '' && !(num(s.pass_marks) >= 0 && num(s.pass_marks) <= max)) {
        return bad(res, `Pass marks for ${s.subject} must be between 0 and ${max}`);
      }
    }
    db.transaction(() => {
      db.prepare('DELETE FROM exam_class_subjects WHERE class_id = ?').run(classId);
      const ins = db.prepare('INSERT INTO exam_class_subjects (class_id, subject, max_marks, pass_marks, sort_order, is_optional) VALUES (?, ?, ?, ?, ?, ?)');
      list.forEach((s, i) => ins.run(classId, String(s.subject).trim(), num(s.max_marks ?? 100),
        s.pass_marks == null || s.pass_marks === '' ? null : num(s.pass_marks), i, s.is_optional ? 1 : 0));
    })();
    res.json({ ok: true, count: list.length });
  },
  classSubjectsCopy(req, res) {
    const from = Number(req.body.from_class_id), to = Number(req.body.to_class_id);
    if (!getClass(from) || !getClass(to)) return bad(res, 'Both classes must exist');
    if (from === to) return bad(res, 'Choose two different classes');
    const rows = classSubjects(from);
    if (!rows.length) return bad(res, 'The source class has no subjects set up');
    db.transaction(() => {
      db.prepare('DELETE FROM exam_class_subjects WHERE class_id = ?').run(to);
      const ins = db.prepare('INSERT INTO exam_class_subjects (class_id, subject, max_marks, pass_marks, sort_order, is_optional) VALUES (?, ?, ?, ?, ?, ?)');
      rows.forEach(r => ins.run(to, r.subject, r.max_marks, r.pass_marks, r.sort_order, r.is_optional));
    })();
    res.json({ ok: true, count: rows.length });
  },

  subjectTeachersGet(req, res) {
    if (!req.query.class_id) return bad(res, 'class_id is required');
    res.json(db.prepare(`
      SELECT st.*, t.full_name AS teacher_name FROM exam_subject_teachers st JOIN teachers t ON t.id = st.teacher_id
      WHERE st.class_id = ? ORDER BY st.subject`).all(req.query.class_id));
  },
  subjectTeachersPut(req, res) {
    const classId = Number(req.params.classId);
    if (!getClass(classId)) return bad(res, 'Class not found', 404);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rows) return bad(res, 'rows[] is required');
    for (const r of rows) {
      if (!r.subject) return bad(res, 'Every row needs a subject');
      if (r.teacher_id && !db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(r.teacher_id)) return bad(res, `Teacher ${r.teacher_id} not found`);
    }
    db.transaction(() => {
      const del = db.prepare('DELETE FROM exam_subject_teachers WHERE class_id = ? AND subject = ?');
      const up = db.prepare(`INSERT INTO exam_subject_teachers (class_id, subject, teacher_id) VALUES (?, ?, ?)
        ON CONFLICT(class_id, subject) DO UPDATE SET teacher_id = excluded.teacher_id`);
      for (const r of rows) r.teacher_id ? up.run(classId, r.subject, Number(r.teacher_id)) : del.run(classId, r.subject);
    })();
    res.json({ ok: true });
  },

  studentSubjectsGet(req, res) {
    if (!req.query.class_id) return bad(res, 'class_id is required');
    const session = req.query.session || currentSession();
    const students = classStudents(req.query.class_id);
    const rows = db.prepare(`
      SELECT ss.student_id, ss.subject FROM exam_student_subjects ss JOIN students s ON s.id = ss.student_id
      WHERE s.class_id = ? AND ss.session = ?`).all(req.query.class_id, session);
    const map = {};
    for (const r of rows) (map[r.student_id] ||= []).push(r.subject);
    res.json({ session, optional: classSubjects(req.query.class_id).filter(s => s.is_optional).map(s => s.subject), students: students.map(s => ({ ...s, subjects: map[s.id] || [] })) });
  },
  studentSubjectsPut(req, res) {
    const classId = Number(req.params.classId);
    if (!getClass(classId)) return bad(res, 'Class not found', 404);
    const session = req.body.session || currentSession();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!rows) return bad(res, 'rows[] is required');
    const valid = new Set(classSubjects(classId).map(s => s.subject));
    const inClass = new Set(classStudents(classId).map(s => s.id));
    for (const r of rows) {
      if (!inClass.has(Number(r.student_id))) return bad(res, `Student ${r.student_id} is not in this class`);
      for (const sub of r.subjects || []) if (!valid.has(sub)) return bad(res, `${sub} is not a subject of this class`);
    }
    db.transaction(() => {
      const del = db.prepare('DELETE FROM exam_student_subjects WHERE student_id = ? AND session = ?');
      const ins = db.prepare('INSERT OR IGNORE INTO exam_student_subjects (student_id, subject, session) VALUES (?, ?, ?)');
      for (const r of rows) {
        del.run(r.student_id, session);
        for (const sub of r.subjects || []) ins.run(r.student_id, sub, session);
      }
    })();
    res.json({ ok: true });
  },

  marksSheet(req, res) {
    const { exam_id, class_id, subject } = req.query;
    if (!exam_id || !class_id || !subject) return bad(res, 'exam_id, class_id and subject are required');
    const exam = getExam(exam_id), cls = getClass(class_id);
    if (!exam || !cls) return bad(res, 'Exam or class not found', 404);
    const cs = db.prepare('SELECT * FROM exam_class_subjects WHERE class_id = ? AND subject = ?').get(class_id, subject);
    const session = currentSession();
    let students = classStudents(class_id);
    if (cs && cs.is_optional) {
      const taking = new Set(db.prepare('SELECT student_id FROM exam_student_subjects WHERE subject = ? AND session = ?').all(subject, session).map(r => r.student_id));
      students = students.filter(s => taking.has(s.id));
    }
    const marks = db.prepare('SELECT * FROM marks WHERE exam_id = ? AND subject = ?').all(exam_id, subject);
    const byStudent = Object.fromEntries(marks.map(m => [m.student_id, m]));
    const pub = publishState(exam_id, class_id);
    res.json({
      exam, class: cls, subject, max_marks: cs ? cs.max_marks : 100, pass_marks: cs ? cs.pass_marks : null,
      locked: req.user.role !== 'admin' && !!pub.result_published,
      can_edit: canEnterMarks(req.user, Number(class_id), subject),
      bands: gradeBands(cls.name),
      students: students.map(s => ({ ...s, mark: byStudent[s.id] || null })),
    });
  },
  marksBulk(req, res) {
    const { exam_id, class_id, subject } = req.body || {};
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!exam_id || !class_id || !subject || !rows) return bad(res, 'exam_id, class_id, subject and rows[] are required');
    const exam = getExam(exam_id), cls = getClass(class_id);
    if (!exam || !cls) return bad(res, 'Exam or class not found', 404);
    if (!canEnterMarks(req.user, Number(class_id), subject)) return bad(res, `You are not the subject teacher for ${subject} in ${cls.name} ${cls.section}`, 403);
    if (req.user.role !== 'admin' && publishState(exam_id, class_id).result_published) return bad(res, 'The result is already published; ask the admin to unpublish it to change marks', 403);
    const cs = db.prepare('SELECT * FROM exam_class_subjects WHERE class_id = ? AND subject = ?').get(class_id, subject);
    const defMax = cs ? cs.max_marks : 100;
    const inClass = new Set(classStudents(class_id).map(s => s.id));
    const bands = gradeBands(cls.name);
    const clean = [];
    for (const r of rows) {
      if (!inClass.has(Number(r.student_id))) return bad(res, `Student ${r.student_id} is not in this class`);
      if (r.absent) { clean.push({ student_id: Number(r.student_id), got: 0, max: num(r.max_marks ?? defMax), grade: 'AB' }); continue; }
      if (r.marks_obtained === '' || r.marks_obtained == null) continue;
      const got = num(r.marks_obtained), max = num(r.max_marks ?? defMax);
      if (!(max > 0)) return bad(res, 'Max marks must be more than 0');
      if (!(got >= 0) || got > max) return bad(res, `Marks must be between 0 and ${max}`);
      const grade = r.grade ? String(r.grade).slice(0, 10) : gradeFor((got / max) * 100, bands)?.grade || null;
      clean.push({ student_id: Number(r.student_id), got, max, grade });
    }
    const up = db.prepare(`
      INSERT INTO marks (exam_id, student_id, subject, marks_obtained, max_marks, grade) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(exam_id, student_id, subject) DO UPDATE SET
        marks_obtained = excluded.marks_obtained, max_marks = excluded.max_marks, grade = excluded.grade`);
    db.transaction(() => { for (const c of clean) up.run(exam_id, c.student_id, subject, c.got, c.max, c.grade); })();
    res.json({ ok: true, saved: clean.length });
  },
  marksCount(req, res) {
    const { exam_id, class_id, subject } = req.query;
    if (!exam_id || !class_id) return bad(res, 'exam_id and class_id are required');
    const rows = db.prepare(`
      SELECT m.subject, COUNT(*) AS count FROM marks m JOIN students s ON s.id = m.student_id
      WHERE m.exam_id = ? AND s.class_id = ? AND (? = '' OR m.subject = ?) GROUP BY m.subject ORDER BY m.subject`)
      .all(exam_id, class_id, subject || '', subject || '');
    res.json(rows);
  },
  marksDelete(req, res) {
    const { exam_id, class_id, subject } = req.query;
    if (!exam_id || !class_id || !subject) return bad(res, 'exam_id, class_id and subject are required');
    const info = db.prepare(`
      DELETE FROM marks WHERE exam_id = ? AND subject = ? AND student_id IN (SELECT id FROM students WHERE class_id = ?)`)
      .run(exam_id, subject, class_id);
    res.json({ ok: true, deleted: info.changes });
  },

  publishList(req, res) {
    const exams = db.prepare('SELECT id, name, term, start_date FROM exams ORDER BY start_date DESC, id DESC').all();
    const classes = db.prepare('SELECT id, name, section FROM classes ORDER BY name, section').all();
    const states = db.prepare('SELECT * FROM exam_publish').all();
    const counts = db.prepare(`
      SELECT m.exam_id, s.class_id, COUNT(DISTINCT m.student_id) AS students, COUNT(*) AS entries
      FROM marks m JOIN students s ON s.id = m.student_id GROUP BY m.exam_id, s.class_id`).all();
    res.json({ exams, classes, states, counts });
  },
  publishPut(req, res) {
    const { exam_id, class_id } = req.body || {};
    if (!getExam(exam_id) || !getClass(class_id)) return bad(res, 'Exam or class not found', 404);
    const cur = publishState(exam_id, class_id);
    let marksOut = 'marks_published' in req.body ? (req.body.marks_published ? 1 : 0) : cur.marks_published;
    let result = 'result_published' in req.body ? (req.body.result_published ? 1 : 0) : cur.result_published;
    // A published result shows marks too: publishing the result publishes marks, and hiding marks hides the result.
    if ('result_published' in req.body && result) marksOut = 1;
    else if ('marks_published' in req.body && !marksOut) result = 0;
    else if (result) marksOut = 1;
    db.prepare(`
      INSERT INTO exam_publish (exam_id, class_id, marks_published, result_published, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(exam_id, class_id) DO UPDATE SET marks_published = excluded.marks_published,
        result_published = excluded.result_published, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`)
      .run(exam_id, class_id, marksOut, result, req.user.id);
    res.json({ ok: true, marks_published: marksOut, result_published: result });
  },

  blocksList(req, res) {
    res.json(db.prepare(`
      SELECT b.*, s.full_name, s.admission_no, c.name || ' ' || c.section AS class_label, COALESCE(e.name, 'All Exams') AS exam_name
      FROM exam_result_blocks b JOIN students s ON s.id = b.student_id LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN exams e ON e.id = b.exam_id ORDER BY b.id DESC`).all());
  },
  blocksCreate(req, res) {
    const ids = Array.isArray(req.body.student_ids) ? req.body.student_ids.map(Number).filter(Boolean) : [];
    const examId = Number(req.body.exam_id || 0);
    if (!ids.length) return bad(res, 'Select at least one student');
    if (examId && !getExam(examId)) return bad(res, 'Exam not found', 404);
    const ins = db.prepare(`INSERT INTO exam_result_blocks (student_id, exam_id, reason, blocked_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id, exam_id) DO UPDATE SET reason = excluded.reason, blocked_by = excluded.blocked_by`);
    db.transaction(() => { for (const id of ids) ins.run(id, examId, String(req.body.reason || '').slice(0, 300) || null, req.user.id); })();
    res.status(201).json({ ok: true, blocked: ids.length });
  },
  blocksRemove(req, res) {
    const info = db.prepare('DELETE FROM exam_result_blocks WHERE id = ?').run(req.params.id);
    if (!info.changes) return bad(res, 'Not found', 404);
    res.json({ ok: true });
  },

  termGet(req, res) {
    const { exam_id, class_id } = req.query;
    if (!exam_id || !class_id) return bad(res, 'exam_id and class_id are required');
    const rows = db.prepare('SELECT * FROM exam_student_terms WHERE exam_id = ?').all(exam_id);
    const map = Object.fromEntries(rows.map(r => [r.student_id, r]));
    res.json(classStudents(class_id).map(s => ({ ...s, term: map[s.id] || null })));
  },
  termPut(req, res) {
    const { exam_id } = req.body || {};
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!getExam(exam_id) || !rows) return bad(res, 'A valid exam_id and rows[] are required');
    const RESULTS = ['', 'Pass', 'Promoted', 'Detained', 'Compartment', 'Absent', 'Withheld'];
    for (const r of rows) {
      const wd = r.working_days === '' || r.working_days == null ? null : num(r.working_days);
      const dp = r.days_present === '' || r.days_present == null ? null : num(r.days_present);
      if (wd != null && !(Number.isInteger(wd) && wd >= 0)) return bad(res, 'Working days must be a whole number');
      if (dp != null && !(Number.isInteger(dp) && dp >= 0)) return bad(res, 'Days present must be a whole number');
      if (wd != null && dp != null && dp > wd) return bad(res, 'Days present cannot be more than working days');
      if (r.result && !RESULTS.includes(r.result)) return bad(res, `Result must be one of ${RESULTS.filter(Boolean).join(', ')}`);
      if (r.rank != null && r.rank !== '' && !(Number.isInteger(num(r.rank)) && num(r.rank) > 0)) return bad(res, 'Rank must be a positive whole number');
    }
    const up = db.prepare(`
      INSERT INTO exam_student_terms (student_id, exam_id, working_days, days_present, result, rank) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, exam_id) DO UPDATE SET working_days = excluded.working_days, days_present = excluded.days_present,
        result = excluded.result, rank = excluded.rank`);
    const n = (v) => (v === '' || v == null ? null : num(v));
    db.transaction(() => { for (const r of rows) up.run(r.student_id, exam_id, n(r.working_days), n(r.days_present), r.result || null, n(r.rank)); })();
    res.json({ ok: true, saved: rows.length });
  },
  attendanceSummary(req, res) {
    const { class_id, from, to } = req.query;
    if (!class_id || !isDate(from) || !isDate(to)) return bad(res, 'class_id, from and to (YYYY-MM-DD) are required');
    if (from > to) return bad(res, 'From date must be before To date');
    const days = db.prepare(`
      SELECT COUNT(DISTINCT a.date) AS c FROM attendance a JOIN students s ON s.id = a.student_id
      WHERE s.class_id = ? AND a.date BETWEEN ? AND ?`).get(class_id, from, to).c;
    const rows = db.prepare(`
      SELECT a.student_id, SUM(a.status IN ('present','late')) AS present FROM attendance a JOIN students s ON s.id = a.student_id
      WHERE s.class_id = ? AND a.date BETWEEN ? AND ? GROUP BY a.student_id`).all(class_id, from, to);
    res.json({ working_days: days, present: Object.fromEntries(rows.map(r => [r.student_id, r.present])) });
  },
  autoRank(req, res) {
    const { exam_id, class_id } = req.body || {};
    if (!getExam(exam_id) || !getClass(class_id)) return bad(res, 'Exam or class not found', 404);
    const totals = db.prepare(`
      SELECT m.student_id, SUM(m.marks_obtained) * 100.0 / SUM(m.max_marks) AS pct
      FROM marks m JOIN students s ON s.id = m.student_id
      WHERE m.exam_id = ? AND s.class_id = ? AND COALESCE(s.status, 'active') = 'active' GROUP BY m.student_id
      ORDER BY pct DESC`).all(exam_id, class_id);
    const up = db.prepare(`INSERT INTO exam_student_terms (student_id, exam_id, rank) VALUES (?, ?, ?)
      ON CONFLICT(student_id, exam_id) DO UPDATE SET rank = excluded.rank`);
    let rank = 0, prev = null, i = 0;
    db.transaction(() => {
      for (const t of totals) {
        i++;
        const p = round(t.pct, 4);
        if (p !== prev) { rank = i; prev = p; } // equal percentages share a rank (1, 2, 2, 4)
        up.run(t.student_id, exam_id, rank);
      }
    })();
    res.json({ ok: true, ranked: totals.length });
  },

  healthGet(req, res) {
    const { class_id, term } = req.query;
    const session = req.query.session || currentSession();
    if (!class_id || !term) return bad(res, 'class_id and term are required');
    const rows = db.prepare('SELECT * FROM exam_health WHERE session = ? AND term = ?').all(session, term);
    const map = Object.fromEntries(rows.map(r => [r.student_id, r]));
    res.json(classStudents(class_id).map(s => ({ ...s, health: map[s.id] || null })));
  },
  healthPut(req, res) {
    const { term } = req.body || {};
    const session = req.body.session || currentSession();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!term || !rows) return bad(res, 'term and rows[] are required');
    const n = (v) => (v === '' || v == null ? null : num(v));
    for (const r of rows) {
      const ht = n(r.height_cm), wt = n(r.weight_kg);
      if (ht != null && !(ht > 30 && ht < 250)) return bad(res, 'Height must be in centimetres (30–250)');
      if (wt != null && !(wt > 2 && wt < 200)) return bad(res, 'Weight must be in kilograms (2–200)');
    }
    const up = db.prepare(`
      INSERT INTO exam_health (student_id, session, term, height_cm, weight_kg, vision_left, vision_right, dental, blood_group, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, session, term) DO UPDATE SET height_cm = excluded.height_cm, weight_kg = excluded.weight_kg,
        vision_left = excluded.vision_left, vision_right = excluded.vision_right, dental = excluded.dental,
        blood_group = excluded.blood_group, notes = excluded.notes`);
    const t = (v) => (v == null || v === '' ? null : String(v).slice(0, 100));
    db.transaction(() => {
      for (const r of rows) up.run(r.student_id, session, term, n(r.height_cm), n(r.weight_kg), t(r.vision_left), t(r.vision_right), t(r.dental), t(r.blood_group), t(r.notes));
    })();
    res.json({ ok: true, saved: rows.length });
  },

  remarksGet(req, res) {
    const { exam_id, class_id } = req.query;
    if (!exam_id || !class_id) return bad(res, 'exam_id and class_id are required');
    const rows = db.prepare('SELECT * FROM exam_student_remarks WHERE exam_id = ?').all(exam_id);
    const map = Object.fromEntries(rows.map(r => [r.student_id, r.remark]));
    res.json(classStudents(class_id).map(s => ({ ...s, remark: map[s.id] || '' })));
  },
  remarksPut(req, res) {
    const { exam_id } = req.body || {};
    const rows = Array.isArray(req.body.rows) ? req.body.rows : null;
    if (!getExam(exam_id) || !rows) return bad(res, 'A valid exam_id and rows[] are required');
    const up = db.prepare(`
      INSERT INTO exam_student_remarks (student_id, exam_id, remark, teacher_id, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, exam_id) DO UPDATE SET remark = excluded.remark, teacher_id = excluded.teacher_id, updated_at = CURRENT_TIMESTAMP`);
    const del = db.prepare('DELETE FROM exam_student_remarks WHERE student_id = ? AND exam_id = ?');
    db.transaction(() => {
      for (const r of rows) {
        const text = String(r.remark || '').trim().slice(0, 500);
        text ? up.run(r.student_id, exam_id, text, req.user.linked_id || null) : del.run(r.student_id, exam_id);
      }
    })();
    res.json({ ok: true });
  },

  awardList(req, res) {
    const { exam_id, class_id } = req.query;
    if (!exam_id || !class_id) return bad(res, 'exam_id and class_id are required');
    const exam = getExam(exam_id), cls = getClass(class_id);
    if (!exam || !cls) return bad(res, 'Exam or class not found', 404);
    const students = classStudents(class_id);
    const marks = db.prepare(`
      SELECT m.* FROM marks m JOIN students s ON s.id = m.student_id WHERE m.exam_id = ? AND s.class_id = ?`).all(exam_id, class_id);
    let subjects = classSubjects(class_id).map(s => ({ subject: s.subject, max_marks: s.max_marks }));
    for (const m of marks) if (!subjects.some(s => s.subject === m.subject)) subjects.push({ subject: m.subject, max_marks: m.max_marks });
    const map = {};
    for (const m of marks) (map[m.student_id] ||= {})[m.subject] = { marks: m.marks_obtained, max: m.max_marks, grade: m.grade };
    const bands = gradeBands(cls.name);
    res.json({
      exam, class: cls, subjects,
      students: students.map(s => {
        const ms = Object.values(map[s.id] || {});
        const got = ms.reduce((a, m) => a + m.marks, 0), max = ms.reduce((a, m) => a + m.max, 0);
        const pct = max ? round((got / max) * 100) : null;
        return { ...s, marks: map[s.id] || {}, total: got, max_total: max, pct, grade: gradeFor(pct, bands)?.grade || null };
      }),
    });
  },

  myMarks(req, res) {
    const studentId = isStaff(req.user) ? Number(req.query.student_id) : req.user.linked_id;
    if (!studentId) return bad(res, isStaff(req.user) ? 'student_id is required' : 'Your account is not linked to a student');
    if (!canSeeStudent(req.user, studentId)) return bad(res, 'Forbidden', 403);
    const st = db.prepare('SELECT id, class_id FROM students WHERE id = ?').get(studentId);
    if (!st) return bad(res, 'Student not found', 404);
    let rows = db.prepare(`
      SELECT m.exam_id, e.name AS exam_name, m.subject, m.marks_obtained, m.max_marks, m.grade
      FROM marks m JOIN exams e ON e.id = m.exam_id WHERE m.student_id = ? ${req.query.exam_id ? 'AND m.exam_id = ?' : ''}
      ORDER BY e.start_date, e.id, m.subject`).all(...(req.query.exam_id ? [studentId, req.query.exam_id] : [studentId]));
    if (!isStaff(req.user)) {
      rows = rows.filter(r => publishState(r.exam_id, st.class_id).marks_published && !isBlocked(studentId, r.exam_id));
    }
    res.json(rows);
  },

  reportCard(req, res) {
    const s = settings();
    const staff = isStaff(req.user);
    let studentIds;
    let classId = Number(req.query.class_id) || null;
    if (!staff) {
      if (!req.user.linked_id) return bad(res, 'Your account is not linked to a student');
      studentIds = [req.user.linked_id];
      classId = db.prepare('SELECT class_id FROM students WHERE id = ?').get(req.user.linked_id)?.class_id;
    } else if (req.query.student_id) {
      studentIds = [Number(req.query.student_id)];
      classId = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentIds[0])?.class_id;
    } else {
      if (!classId) return bad(res, 'Choose a class or a student');
      studentIds = classStudents(classId).map(x => x.id);
    }
    const cls = classId ? getClass(classId) : null;
    if (!cls) return bad(res, 'Class not found', 404);

    let examIds = String(req.query.exam_ids || req.query.exam_id || '').split(',').map(Number).filter(Boolean);
    if (!examIds.length) return bad(res, 'Choose at least one exam');
    let exams = examIds.map(getExam).filter(Boolean);
    if (!staff) {
      exams = exams.filter(e => publishState(e.id, classId).result_published && !isBlocked(studentIds[0], e.id));
      if (!exams.length) return bad(res, 'The result for this exam has not been published yet', 403);
    }
    examIds = exams.map(e => e.id);
    if (!exams.length) return bad(res, 'Exam not found', 404);

    const bands = gradeBands(cls.name);
    const passPct = num(s.passing_pct) || 33;
    const subjectsConf = classSubjects(classId);
    const session = currentSession();
    const school = db.prepare('SELECT * FROM school_settings WHERE id = 1').get() || {};
    const ph = examIds.map(() => '?').join(',');
    const allMarks = studentIds.length ? db.prepare(`
      SELECT * FROM marks WHERE exam_id IN (${ph}) AND student_id IN (${studentIds.map(() => '?').join(',')})`)
      .all(...examIds, ...studentIds) : [];
    const lastExam = exams[exams.length - 1];

    const cards = studentIds.map(id => {
      const stu = db.prepare(`
        SELECT s.*, c.name AS class_name, c.section AS class_section FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`).get(id);
      if (!stu) return null;
      const mine = allMarks.filter(m => m.student_id === id);
      const optional = new Set(db.prepare('SELECT subject FROM exam_student_subjects WHERE student_id = ? AND session = ?').all(id, session).map(r => r.subject));
      let subjects = subjectsConf.length
        ? subjectsConf.filter(c => !c.is_optional || optional.has(c.subject) || mine.some(m => m.subject === c.subject))
        : [...new Set(mine.map(m => m.subject))].map(sub => ({ subject: sub, max_marks: null, pass_marks: null }));
      let got = 0, max = 0, failed = [];
      const rows = subjects.map(c => {
        const perExam = {};
        let sg = 0, sm = 0;
        for (const e of exams) {
          const m = mine.find(x => x.exam_id === e.id && x.subject === c.subject);
          if (m) { perExam[e.id] = { marks: m.marks_obtained, max: m.max_marks, grade: m.grade }; sg += m.marks_obtained; sm += m.max_marks; }
        }
        const pct = sm ? round((sg / sm) * 100) : null;
        const passMark = c.pass_marks != null && c.max_marks ? (c.pass_marks / c.max_marks) * 100 : passPct;
        if (pct != null && pct < passMark) failed.push(c.subject);
        got += sg; max += sm;
        return { subject: c.subject, exams: perExam, total: sg, max_total: sm, pct, grade: gradeFor(pct, bands)?.grade || null };
      });
      const pct = max ? round((got / max) * 100) : null;
      const term = db.prepare('SELECT * FROM exam_student_terms WHERE student_id = ? AND exam_id = ?').get(id, lastExam.id);
      const remark = db.prepare('SELECT remark FROM exam_student_remarks WHERE student_id = ? AND exam_id = ?').get(id, lastExam.id)?.remark || '';
      const health = db.prepare('SELECT * FROM exam_health WHERE student_id = ? AND session = ? ORDER BY id DESC LIMIT 1').get(id, session) || null;
      const computed = pct == null ? '' : failed.length ? `Needs improvement in ${failed.join(', ')}` : 'Pass';
      const overall = gradeFor(pct, bands);
      return {
        student: stu, subjects: rows, total: got, max_total: max, pct,
        grade: overall?.grade || null, grade_remark: overall?.remark || null,
        result: term?.result || computed, rank: s.show_rank === '1' ? term?.rank ?? null : null,
        attendance: term ? { working_days: term.working_days, days_present: term.days_present } : null,
        remark, health,
      };
    }).filter(Boolean);

    res.json({
      settings: s, school: { name: s.header_text || school.school_name, address: school.address, phone: school.phone, email: school.email, logo_url: school.logo_url, session: school.academic_year },
      class: cls, exams, bands, cards,
    });
  },
};

/* ---------- reports ---------- */
registerReport({
  key: 'exam-assessment', title: 'Assessment Report', group: 'Examination', roles: ROLES.STAFF,
  description: 'Subject-wise analysis of an exam for a class: average, highest, lowest and pass percentage.',
  params: [examParam(), { name: 'class_id', label: 'Class', type: 'class' }],
  columns: [
    { key: 'class_label', label: 'Class' }, { key: 'subject', label: 'Subject' },
    { key: 'appeared', label: 'Appeared', type: 'number', total: true }, { key: 'average', label: 'Average %', type: 'percent' },
    { key: 'highest', label: 'Highest', type: 'number' }, { key: 'lowest', label: 'Lowest', type: 'number' },
    { key: 'passed', label: 'Passed', type: 'number', total: true }, { key: 'pass_pct', label: 'Pass %', type: 'percent' },
    { key: 'topper', label: 'Topper' },
  ],
  run: (p) => {
    const passPct = num(settings().passing_pct) || 33;
    const rows = db.prepare(`
      SELECT c.id AS class_id, c.name || ' ' || c.section AS class_label, m.subject,
        COUNT(*) AS appeared, AVG(m.marks_obtained * 100.0 / m.max_marks) AS average,
        MAX(m.marks_obtained) AS highest, MIN(m.marks_obtained) AS lowest,
        SUM(m.marks_obtained * 100.0 / m.max_marks >= ?) AS passed
      FROM marks m JOIN students s ON s.id = m.student_id JOIN classes c ON c.id = s.class_id
      WHERE m.exam_id = ? AND (? = '' OR s.class_id = ?) AND COALESCE(m.grade, '') != 'AB'
      GROUP BY c.id, m.subject ORDER BY c.name, c.section, m.subject`).all(passPct, p.exam_id, p.class_id, p.class_id);
    const topper = db.prepare(`
      SELECT s.full_name FROM marks m JOIN students s ON s.id = m.student_id
      WHERE m.exam_id = ? AND s.class_id = ? AND m.subject = ? ORDER BY m.marks_obtained DESC LIMIT 1`);
    return rows.map(r => ({ ...r, average: round(r.average, 1), pass_pct: r.appeared ? round((r.passed / r.appeared) * 100, 1) : 0, topper: topper.get(p.exam_id, r.class_id, r.subject)?.full_name }));
  },
});

registerReport({
  key: 'exam-subject-mapping', title: 'Student Subject Mapping Report', group: 'Examination', roles: ROLES.STAFF,
  params: [{ name: 'class_id', label: 'Class', type: 'class' }, { name: 'session', label: 'Session', type: 'session', default: 'session', required: true }],
  columns: [
    { key: 'class_label', label: 'Class' }, { key: 'roll_no', label: 'Roll No' }, { key: 'admission_no', label: 'Adm No' },
    { key: 'full_name', label: 'Student' }, { key: 'compulsory', label: 'Compulsory Subjects' }, { key: 'optional', label: 'Optional Subjects' },
  ],
  run: (p) => {
    const students = db.prepare(`
      SELECT s.id, s.roll_no, s.admission_no, s.full_name, s.class_id, c.name || ' ' || c.section AS class_label
      FROM students s JOIN classes c ON c.id = s.class_id
      WHERE COALESCE(s.status, 'active') = 'active' AND (? = '' OR s.class_id = ?)
      ORDER BY c.name, c.section, (s.roll_no IS NULL), s.roll_no, s.full_name`).all(p.class_id, p.class_id);
    const subs = {};
    for (const r of db.prepare('SELECT * FROM exam_class_subjects ORDER BY sort_order').all()) (subs[r.class_id] ||= []).push(r);
    const opt = {};
    for (const r of db.prepare('SELECT * FROM exam_student_subjects WHERE session = ?').all(p.session)) (opt[r.student_id] ||= []).push(r.subject);
    return students.map(s => ({
      ...s,
      compulsory: (subs[s.class_id] || []).filter(x => !x.is_optional).map(x => x.subject).join(', '),
      optional: (opt[s.id] || []).join(', ') || '—',
    }));
  },
});

registerReport({
  key: 'exam-weekly-planner', title: 'Weekly Planner Report', group: 'Examination', roles: ROLES.STAFF,
  params: [
    { name: 'from', label: 'Week From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'Week To', type: 'date', default: 'today' },
    { name: 'class_id', label: 'Class', type: 'class' },
    { name: 'teacher_id', label: 'Teacher', type: 'teacher' },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'planned', label: 'Planned' }, { value: 'completed', label: 'Completed' }, { value: 'carried_over', label: 'Carried Over' }] },
  ],
  columns: [
    { key: 'week_start', label: 'Week Of', type: 'date' }, { key: 'class_label', label: 'Class' }, { key: 'subject', label: 'Subject' },
    { key: 'teacher_name', label: 'Teacher' }, { key: 'topic', label: 'Topic' }, { key: 'objectives', label: 'Objectives' },
    { key: 'homework', label: 'Homework' }, { key: 'status', label: 'Status' }, { key: 'remarks', label: 'Remarks' },
  ],
  run: (p, user) => db.prepare(`
    SELECT p.*, c.name || ' ' || c.section AS class_label, t.full_name AS teacher_name
    FROM exam_planner p JOIN classes c ON c.id = p.class_id LEFT JOIN teachers t ON t.id = p.teacher_id
    WHERE p.week_start BETWEEN ? AND ? AND (? = '' OR p.class_id = ?) AND (? = '' OR p.teacher_id = ?) AND (? = '' OR p.status = ?)
      AND (? = 'admin' OR p.teacher_id = ?)
    ORDER BY p.week_start DESC, c.name, p.subject`).all(p.from, p.to, p.class_id, p.class_id, p.teacher_id, p.teacher_id,
    p.status, p.status, user.role, user.linked_id ?? -1),
});

registerReport({
  key: 'exam-blocked-results', title: 'Blocked Exam Results', group: 'Examination',
  columns: [
    { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' }, { key: 'class_label', label: 'Class' },
    { key: 'exam_name', label: 'Exam' }, { key: 'reason', label: 'Reason' }, { key: 'created_at', label: 'Blocked On', type: 'date' },
  ],
  run: () => db.prepare(`
    SELECT b.*, s.full_name, s.admission_no, c.name || ' ' || c.section AS class_label, COALESCE(e.name, 'All Exams') AS exam_name
    FROM exam_result_blocks b JOIN students s ON s.id = b.student_id LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN exams e ON e.id = b.exam_id ORDER BY c.name, s.full_name`).all(),
});

function register(router) {
  const A = role(...ROLES.ADMIN), S = role(...ROLES.STAFF);
  router.get('/exam/settings', auth, S, h.settingsGet);
  router.put('/exam/settings', auth, A, safe(h.settingsPut));

  mountCrud(router, '/exam/grades', gradeCrud, { read: ROLES.STAFF, write: ROLES.ADMIN });

  router.get('/exam/class-subjects', auth, h.classSubjectsGet);
  router.put('/exam/class-subjects/:classId', auth, A, safe(h.classSubjectsPut));
  router.post('/exam/class-subjects/copy', auth, A, safe(h.classSubjectsCopy));

  router.get('/exam/subject-teachers', auth, S, h.subjectTeachersGet);
  router.put('/exam/subject-teachers/:classId', auth, A, safe(h.subjectTeachersPut));

  router.get('/exam/student-subjects', auth, S, h.studentSubjectsGet);
  router.put('/exam/student-subjects/:classId', auth, A, safe(h.studentSubjectsPut));

  router.get('/exam/marks-sheet', auth, S, safe(h.marksSheet));
  router.post('/exam/marks/bulk', auth, S, safe(h.marksBulk));
  router.get('/exam/marks-count', auth, A, h.marksCount);
  router.delete('/exam/marks', auth, A, safe(h.marksDelete));
  router.get('/exam/my-marks', auth, safe(h.myMarks));

  router.get('/exam/publish', auth, S, h.publishList);
  router.put('/exam/publish', auth, A, safe(h.publishPut));

  router.get('/exam/blocks', auth, A, h.blocksList);
  router.post('/exam/blocks', auth, A, safe(h.blocksCreate));
  router.delete('/exam/blocks/:id', auth, A, h.blocksRemove);

  router.get('/exam/term-details', auth, S, h.termGet);
  router.put('/exam/term-details', auth, S, safe(h.termPut));
  router.get('/exam/attendance-summary', auth, S, h.attendanceSummary);
  router.post('/exam/auto-rank', auth, S, safe(h.autoRank));

  router.get('/exam/health', auth, S, h.healthGet);
  router.put('/exam/health', auth, S, safe(h.healthPut));

  router.get('/exam/remarks', auth, S, h.remarksGet);
  router.put('/exam/remarks', auth, S, safe(h.remarksPut));

  router.get('/exam/award-list', auth, S, safe(h.awardList));
  router.get('/exam/report-card', auth, safe(h.reportCard));

  router.get('/exam/planner', auth, S, planner.list);
  router.post('/exam/planner', auth, S, safe(planner.create));
  router.put('/exam/planner/:id', auth, S, safe(planner.update));
  router.delete('/exam/planner/:id', auth, S, safe(planner.remove));
}

module.exports = { register };
