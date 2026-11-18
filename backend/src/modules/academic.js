// Academic administration: promotion (with undo), section swap, roll numbers, teacher-wise timetable.
const crypto = require('crypto');
const { db, ROLES, auth, role, safe, registerReport, currentSession, addColumn } = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS academic_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_class_id INTEGER,
    to_class_id INTEGER,
    from_session TEXT,
    to_session TEXT,
    from_status TEXT,
    result TEXT NOT NULL CHECK (result IN ('promoted','detained','passed_out')),
    promoted_by INTEGER,
    promoted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    undone_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_academic_promotions_batch ON academic_promotions(batch_id);
`);
// The roll number a student had before the promotion, so undoing it can put it back.
addColumn('academic_promotions', 'from_roll_no INTEGER');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const PRE = ['NURSERY', 'LKG', 'UKG'];

// Name of the class after `name`, or null when it is the final class (XII / 12).
function nextClassName(name) {
  const n = String(name || '').trim();
  const up = n.toUpperCase();
  const pre = PRE.indexOf(up);
  if (pre >= 0) return pre < PRE.length - 1 ? PRE[pre + 1] : 'I';
  const num = n.match(/^(.*?)(\d+)(\D*)$/);
  if (num) {
    const v = Number(num[2]);
    return v >= 12 ? null : `${num[1]}${v + 1}${num[3]}`;
  }
  const rom = up.match(/^([IVX]+)(\b.*)$/);
  if (rom) {
    const i = ROMAN.indexOf(rom[1]);
    if (i >= 0) return i >= ROMAN.length - 1 ? null : ROMAN[i + 1] + n.slice(rom[1].length);
  }
  return undefined; // unknown naming scheme: caller must choose
}

function nextSession(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2,4})$/);
  if (!m) return '';
  const a = Number(m[1]) + 1;
  return m[2].length === 4 ? `${a}-${a + 1}` : `${a}-${String(a + 1).slice(-2)}`;
}

const classById = db.prepare('SELECT * FROM classes WHERE id = ?');

function suggestTarget(cls, classes) {
  const nextName = nextClassName(cls.name);
  if (nextName === null) return { result: 'passed_out', to_class_id: null };
  if (nextName === undefined) return { result: 'promoted', to_class_id: null };
  const same = classes.filter(c => c.name.toLowerCase() === nextName.toLowerCase());
  const pick = same.find(c => c.section === cls.section) || same[0];
  return { result: 'promoted', to_class_id: pick ? pick.id : null };
}

function preview(req, res) {
  const cls = classById.get(req.query.class_id);
  if (!cls) return res.status(400).json({ error: 'Choose a valid class' });
  const classes = db.prepare('SELECT * FROM classes ORDER BY name, section').all();
  const target = suggestTarget(cls, classes);
  const session = currentSession();
  const students = db.prepare(`
    SELECT id, admission_no, full_name, roll_no, gender, session, status FROM students
    WHERE class_id = ? AND COALESCE(status, 'active') = 'active' ORDER BY roll_no, full_name`).all(cls.id);
  res.json({
    class: cls, from_session: session, to_session: nextSession(session) || session,
    next_class_name: nextClassName(cls.name) ?? null,
    students: students.map(s => ({ ...s, ...target })),
  });
}

function promote(req, res) {
  const { from_session, to_session, items } = req.body || {};
  if (!to_session || !/^\d{4}-\d{2,4}$/.test(to_session)) return res.status(400).json({ error: 'to_session must look like 2026-2027' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Select at least one student' });
  const getStudent = db.prepare('SELECT * FROM students WHERE id = ?');
  const rows = [];
  for (const it of items) {
    const s = getStudent.get(it.student_id);
    if (!s) return res.status(400).json({ error: `Student ${it.student_id} not found` });
    if ((s.status || 'active') !== 'active') return res.status(400).json({ error: `${s.full_name} is not an active student` });
    if (!['promoted', 'detained', 'passed_out'].includes(it.result)) return res.status(400).json({ error: `Choose Promote, Detain or Passed Out for ${s.full_name}` });
    let to = s.class_id;
    if (it.result === 'promoted') {
      const target = classById.get(it.to_class_id);
      if (!target) return res.status(400).json({ error: `Choose a valid target class for ${s.full_name}` });
      if (target.id === s.class_id) return res.status(400).json({ error: `${s.full_name}: target class is the same as the current class (use Detain)` });
      to = target.id;
    }
    rows.push({ s, to, result: it.result });
  }
  const batch = `P${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  const ins = db.prepare(`INSERT INTO academic_promotions
    (batch_id, student_id, from_class_id, to_class_id, from_session, to_session, from_status, result, promoted_by, from_roll_no)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const upd = db.prepare('UPDATE students SET class_id = ?, session = ?, status = ?, status_date = ?, status_reason = ? WHERE id = ?');
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const r of rows) {
      ins.run(batch, r.s.id, r.s.class_id, r.result === 'passed_out' ? null : r.to, r.s.session || from_session || null,
        to_session, r.s.status || 'active', r.result, req.user.id, r.s.roll_no ?? null);
      if (r.result === 'passed_out') upd.run(r.s.class_id, r.s.session || from_session || null, 'passed_out', now.slice(0, 10), 'Passed out', r.s.id);
      else upd.run(r.to, to_session, 'active', r.s.status_date || null, r.s.status_reason || null, r.s.id);
    }
    // The admission number stays with the student; the roll number belongs to the class. Promoted students get new
    // roll numbers in their new class, in name order after anyone already there (Roll Numbers can change them).
    const moved = rows.filter(r => r.result === 'promoted');
    const setRoll = db.prepare('UPDATE students SET roll_no = ? WHERE id = ?');
    for (const to of new Set(moved.map(r => r.to))) {
      const arriving = moved.filter(r => r.to === to).map(r => r.s).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
      const ids = new Set(arriving.map(x => x.id));
      let next = db.prepare(`SELECT id, roll_no FROM students WHERE class_id = ? AND COALESCE(status, 'active') = 'active'`).all(to)
        .filter(x => !ids.has(x.id)).reduce((m, x) => Math.max(m, Number(x.roll_no) || 0), 0);
      for (const st of arriving) setRoll.run(++next, st.id);
    }
  })();
  const count = (k) => rows.filter(r => r.result === k).length;
  res.status(201).json({ batch_id: batch, promoted: count('promoted'), detained: count('detained'), passed_out: count('passed_out') });
}

function batches(req, res) {
  res.json(db.prepare(`
    WITH b AS (
      SELECT batch_id, MIN(id) AS first_id, MIN(promoted_at) AS promoted_at, MAX(undone_at) AS undone_at, COUNT(*) AS students,
        SUM(result = 'promoted') AS promoted, SUM(result = 'detained') AS detained, SUM(result = 'passed_out') AS passed_out,
        MIN(from_session) AS from_session, MAX(to_session) AS to_session, MIN(from_class_id) AS from_class_id, MIN(promoted_by) AS promoted_by
      FROM academic_promotions GROUP BY batch_id
    )
    SELECT b.*, c.name || ' ' || c.section AS from_class, u.full_name AS promoted_by_name
    FROM b LEFT JOIN classes c ON c.id = b.from_class_id LEFT JOIN users u ON u.id = b.promoted_by
    ORDER BY b.first_id DESC LIMIT 50`).all());
}

function undo(req, res) {
  const last = db.prepare('SELECT batch_id FROM academic_promotions WHERE undone_at IS NULL ORDER BY id DESC LIMIT 1').get();
  if (!last) return res.status(400).json({ error: 'There is no promotion to undo' });
  if (req.body?.batch_id && req.body.batch_id !== last.batch_id) {
    return res.status(400).json({ error: 'Only the most recent promotion can be undone' });
  }
  const rows = db.prepare('SELECT * FROM academic_promotions WHERE batch_id = ?').all(last.batch_id);
  const upd = db.prepare('UPDATE students SET class_id = ?, session = ?, status = ? WHERE id = ?');
  const roll = db.prepare('UPDATE students SET roll_no = ? WHERE id = ?');
  db.transaction(() => {
    for (const r of rows) {
      upd.run(r.from_class_id, r.from_session, r.from_status || 'active', r.student_id);
      if (r.result === 'promoted') roll.run(r.from_roll_no ?? null, r.student_id);   // only promoted students were renumbered
    }
    db.prepare('UPDATE academic_promotions SET undone_at = ? WHERE batch_id = ?').run(new Date().toISOString(), last.batch_id);
  })();
  res.json({ ok: true, batch_id: last.batch_id, restored: rows.length });
}

function swap(req, res) {
  const { student_ids, to_class_id } = req.body || {};
  const target = classById.get(to_class_id);
  if (!target) return res.status(400).json({ error: 'Choose a valid target section' });
  const ids = Array.isArray(student_ids) ? [...new Set(student_ids.map(Number).filter(Boolean))] : [];
  if (!ids.length) return res.status(400).json({ error: 'Select at least one student' });
  const studs = db.prepare(`SELECT s.id, s.full_name, s.class_id, c.name FROM students s LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  if (studs.length !== ids.length) return res.status(400).json({ error: 'One or more students were not found' });
  const wrong = studs.find(s => (s.name || '').toLowerCase() !== target.name.toLowerCase());
  if (wrong) return res.status(400).json({ error: `${wrong.full_name} is not in ${target.name}; sections can only be swapped within the same class` });
  const moving = studs.filter(s => s.class_id !== target.id);
  const upd = db.prepare('UPDATE students SET class_id = ?, roll_no = NULL WHERE id = ?');
  db.transaction(() => { for (const s of moving) upd.run(target.id, s.id); })();
  res.json({ ok: true, moved: moving.length, already_there: studs.length - moving.length });
}

function rollNumbers(req, res) {
  const { class_id, items } = req.body || {};
  if (!classById.get(class_id)) return res.status(400).json({ error: 'Choose a valid class' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No roll numbers to save' });
  const inClass = new Set(db.prepare('SELECT id FROM students WHERE class_id = ?').all(class_id).map(r => r.id));
  const seen = new Set();
  for (const it of items) {
    if (!inClass.has(Number(it.student_id))) return res.status(400).json({ error: 'A student in the list is not in this class' });
    const n = Number(it.roll_no);
    if (it.roll_no === '' || it.roll_no == null) continue;
    if (!Number.isInteger(n) || n < 1 || n > 9999) return res.status(400).json({ error: `Roll numbers must be whole numbers from 1 (got "${it.roll_no}")` });
    if (seen.has(n)) return res.status(400).json({ error: `Roll number ${n} is used twice` });
    seen.add(n);
  }
  const upd = db.prepare('UPDATE students SET roll_no = ? WHERE id = ? AND class_id = ?');
  db.transaction(() => {
    for (const it of items) upd.run(it.roll_no === '' || it.roll_no == null ? null : Number(it.roll_no), it.student_id, class_id);
  })();
  res.json({ ok: true, saved: items.length });
}

const DAY_ORDER = `CASE t.day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
  WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END`;

function teacherTimetable(req, res) {
  const id = Number(req.params.teacherId);
  if (!db.prepare('SELECT id FROM teachers WHERE id = ?').get(id)) return res.status(404).json({ error: 'Teacher not found' });
  res.json(db.prepare(`
    SELECT t.*, c.name AS class_name, c.section AS class_section FROM timetable t
    JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ? ORDER BY ${DAY_ORDER}, t.period`).all(id));
}

function periodTimes(req, res) {
  const { class_id, period, start_time, end_time } = req.body || {};
  const p = Number(period);
  if (!classById.get(class_id)) return res.status(400).json({ error: 'Choose a valid class' });
  if (!Number.isInteger(p) || p < 1) return res.status(400).json({ error: 'period must be a positive whole number' });
  const t = (v) => v === '' || v == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!t(start_time) || !t(end_time)) return res.status(400).json({ error: 'Times must be HH:MM' });
  if (start_time && end_time && start_time >= end_time) return res.status(400).json({ error: 'End time must be after start time' });
  const info = db.prepare('UPDATE timetable SET start_time = ?, end_time = ? WHERE class_id = ? AND period = ?')
    .run(start_time || null, end_time || null, class_id, p);
  res.json({ ok: true, updated: info.changes });
}

registerReport({
  key: 'promotion-history', title: 'Promotion History', group: 'Student',
  params: [
    { name: 'to_session', label: 'Promoted Into Session', type: 'session' },
    { name: 'class_id', label: 'From Class', type: 'class' },
  ],
  columns: [
    { key: 'promoted_at', label: 'Date', type: 'date' }, { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' },
    { key: 'from_class', label: 'From Class' }, { key: 'to_class', label: 'To Class' }, { key: 'from_session', label: 'From Session' },
    { key: 'to_session', label: 'To Session' }, { key: 'result', label: 'Result' }, { key: 'state', label: 'State' },
  ],
  run: (p) => db.prepare(`
    SELECT p.promoted_at, s.admission_no, s.full_name, fc.name || ' ' || fc.section AS from_class,
      tc.name || ' ' || tc.section AS to_class, p.from_session, p.to_session, p.result,
      CASE WHEN p.undone_at IS NULL THEN 'Applied' ELSE 'Undone' END AS state
    FROM academic_promotions p JOIN students s ON s.id = p.student_id
    LEFT JOIN classes fc ON fc.id = p.from_class_id LEFT JOIN classes tc ON tc.id = p.to_class_id
    WHERE (? = '' OR p.to_session = ?) AND (? = '' OR p.from_class_id = ?)
    ORDER BY p.id DESC LIMIT 5000`).all(p.to_session, p.to_session, p.class_id, p.class_id),
});

function register(router) {
  const admin = [auth, role(...ROLES.ADMIN)];
  router.get('/academic/promote/preview', ...admin, safe(preview));
  router.post('/academic/promote', ...admin, safe(promote));
  router.get('/academic/promotions', ...admin, safe(batches));
  router.post('/academic/promote/undo', ...admin, safe(undo));
  router.post('/academic/swap', ...admin, safe(swap));
  router.post('/academic/roll-numbers', ...admin, safe(rollNumbers));
  router.post('/academic/timetable/period-times', ...admin, safe(periodTimes));
  router.get('/academic/timetable/teacher/:teacherId', auth, role(...ROLES.STAFF), safe(teacherTimetable));
}

module.exports = { register, nextClassName, nextSession };
