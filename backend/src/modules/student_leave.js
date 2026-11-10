// Student leave requests: parents/students apply, the class teacher (or an admin) decides,
// and approved days are marked 'leave' in attendance without overwriting days already marked present.
const { db, ROLES, auth, role, safe, isDate, badUrl } = require('./_kit');
const { familyUserIds, isParentOf } = require('../utils/family');
const { notify } = require('./push');

db.exec(`
  CREATE TABLE IF NOT EXISTS student_leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    attachment TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
    applied_by INTEGER,
    decided_by INTEGER,
    decided_at TEXT,
    remark TEXT,
    days_marked INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS ix_student_leave_student ON student_leave_requests(student_id, status);
`);

const MAX_DAYS = 31;
const httpError = (status, message) => Object.assign(new Error(message), { status });

const SELECT = `
  SELECT r.*, s.full_name AS student_name, s.admission_no, s.class_id, c.name AS class_name, c.section AS class_section,
    c.class_teacher_id, ua.full_name AS applied_by_name, ud.full_name AS decided_by_name
  FROM student_leave_requests r JOIN students s ON s.id = r.student_id
  LEFT JOIN classes c ON c.id = s.class_id
  LEFT JOIN users ua ON ua.id = r.applied_by LEFT JOIN users ud ON ud.id = r.decided_by`;

function datesBetween(from, to) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const isSunday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

const familyUsers = (studentId) => familyUserIds([studentId]);
const classTeacherUsers = (classTeacherId) => (classTeacherId
  ? db.prepare("SELECT id FROM users WHERE role = 'teacher' AND linked_id = ? AND active = 1").all(classTeacherId).map(u => u.id) : []);
const adminUsers = () => db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all().map(u => u.id);

// Who may decide: Super Admin / full-access staff (acting as admin), or the class teacher of the student's class.
const canDecide = (user, r) => user.role === 'admin' || (user.role === 'teacher' && r.class_teacher_id && user.linked_id === r.class_teacher_id);

const fmt = (d) => d.split('-').reverse().join('/');

const h = {
  list(req, res) {
    const { status, class_id, from, to } = req.query;
    const w = [], p = [];
    if (req.user.role === 'student' || req.user.role === 'parent') { w.push('r.student_id = ?'); p.push(req.user.linked_id ?? -1); }
    else if (req.user.role === 'teacher') { w.push('c.class_teacher_id = ?'); p.push(req.user.linked_id ?? -1); }
    if (status) { w.push('r.status = ?'); p.push(status); }
    if (class_id) { w.push('s.class_id = ?'); p.push(class_id); }
    if (from) { w.push('r.to_date >= ?'); p.push(from); }
    if (to) { w.push('r.from_date <= ?'); p.push(to); }
    res.json(db.prepare(`${SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.status = 'pending' DESC, r.from_date DESC, r.id DESC LIMIT 500`).all(...p));
  },

  create(req, res) {
    const b = req.body || {};
    let studentId = Number(b.student_id);
    // Students apply for themselves; a parent for the child they chose (any linked child), else the active one.
    if (req.user.role === 'student') studentId = Number(req.user.linked_id);
    else if (req.user.role === 'parent') { if (!(studentId && isParentOf(req.user.id, studentId))) studentId = Number(req.user.linked_id); }
    else if (req.user.role !== 'admin') throw httpError(403, 'Only parents, students or the office can apply for student leave');
    const s = studentId && db.prepare('SELECT s.id, s.full_name, s.status, c.class_teacher_id FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?').get(studentId);
    if (!s) throw httpError(400, 'Student not found');
    if (!isDate(b.from_date) || !isDate(b.to_date)) throw httpError(400, 'From and To dates are required (YYYY-MM-DD)');
    if (b.to_date < b.from_date) throw httpError(400, 'To date must not be before From date');
    if (datesBetween(b.from_date, b.to_date).length > MAX_DAYS) throw httpError(400, `A request can cover at most ${MAX_DAYS} days`);
    const reason = String(b.reason || '').trim();
    if (!reason) throw httpError(400, 'Please give a reason');
    if (badUrl(b.attachment)) throw httpError(400, badUrl(b.attachment, 'attachment'));
    const clash = db.prepare(`SELECT id FROM student_leave_requests WHERE student_id = ? AND status IN ('pending','approved')
      AND from_date <= ? AND to_date >= ?`).get(s.id, b.to_date, b.from_date);
    if (clash) throw httpError(409, 'There is already a pending or approved leave request covering these dates');
    const info = db.prepare(`INSERT INTO student_leave_requests (student_id, from_date, to_date, reason, attachment, applied_by)
      VALUES (?, ?, ?, ?, ?, ?)`).run(s.id, b.from_date, b.to_date, reason.slice(0, 1000), b.attachment || null, req.user.id);
    const to = classTeacherUsers(s.class_teacher_id);
    notify(to.length ? to : adminUsers(), {
      title: 'Student leave request', body: `${s.full_name}: ${fmt(b.from_date)} to ${fmt(b.to_date)}. ${reason.slice(0, 80)}`,
      link: '/student-leave', kind: 'student-leave',
    }).catch(() => {});
    res.status(201).json({ id: info.lastInsertRowid });
  },

  cancel(req, res) {
    const r = db.prepare(`${SELECT} WHERE r.id = ?`).get(req.params.id);
    if (!r) throw httpError(404, 'Not found');
    const own = (req.user.role === 'student' && r.student_id === req.user.linked_id)
      || (req.user.role === 'parent' && (r.student_id === req.user.linked_id || isParentOf(req.user.id, r.student_id)));
    if (!own && req.user.role !== 'admin') throw httpError(403, 'Forbidden');
    if (r.status !== 'pending') throw httpError(400, `This request is already ${r.status}`);
    db.prepare("UPDATE student_leave_requests SET status = 'cancelled', decided_at = ? WHERE id = ?").run(new Date().toISOString(), r.id);
    res.json({ ok: true });
  },

  decide(req, res) {
    const r = db.prepare(`${SELECT} WHERE r.id = ?`).get(req.params.id);
    if (!r) throw httpError(404, 'Not found');
    if (!canDecide(req.user, r)) throw httpError(403, "Only the student's class teacher or the office can decide this request");
    if (r.status !== 'pending') throw httpError(400, `This request is already ${r.status}`);
    const action = req.body?.action;
    if (!['approve', 'reject'].includes(action)) throw httpError(400, 'action must be approve or reject');
    const remark = String(req.body?.remark || '').trim().slice(0, 500) || null;
    if (action === 'reject' && !remark) throw httpError(400, 'Please give a reason for rejecting');
    let marked = 0;
    db.transaction(() => {
      if (action === 'approve') {
        // Never turn a day the student actually attended into leave.
        const up = db.prepare(`INSERT INTO attendance (student_id, date, status, remarks) VALUES (?, ?, 'leave', ?)
          ON CONFLICT(student_id, date) DO UPDATE SET status = 'leave', remarks = excluded.remarks WHERE attendance.status != 'present'`);
        for (const d of datesBetween(r.from_date, r.to_date)) {
          if (isSunday(d)) continue;
          marked += up.run(r.student_id, d, `Leave approved${remark ? `: ${remark}` : ''}`.slice(0, 200)).changes;
        }
      }
      db.prepare(`UPDATE student_leave_requests SET status = ?, decided_by = ?, decided_at = ?, remark = ?, days_marked = ? WHERE id = ?`)
        .run(action === 'approve' ? 'approved' : 'rejected', req.user.id, new Date().toISOString(), remark, action === 'approve' ? marked : null, r.id);
    })();
    notify(familyUsers(r.student_id), {
      title: action === 'approve' ? 'Leave approved' : 'Leave not approved',
      body: `${r.student_name}: ${fmt(r.from_date)} to ${fmt(r.to_date)}${remark ? ` (${remark})` : ''}`,
      link: '/student-leave', kind: 'student-leave',
    }).catch(() => {});
    res.json({ ok: true, days_marked: marked });
  },
};

const wrap = (fn) => safe((req, res, next) => {
  try { return fn(req, res, next); } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); throw e; }
});

function register(router) {
  router.get('/student-leave', auth, wrap(h.list));
  router.post('/student-leave', auth, wrap(h.create));
  router.post('/student-leave/:id/cancel', auth, wrap(h.cancel));
  router.post('/student-leave/:id/decision', auth, role(...ROLES.STAFF), wrap(h.decide));
}

module.exports = { register, datesBetween };
