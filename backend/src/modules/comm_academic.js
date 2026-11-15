// Academic Communication: school diary, lost & found, online classes, student observations/creativity,
// classwise/section-wise posts, school news, monthly planner, study resources, homework attachments
// and teacher substitution. Staff write; students/parents see only their class or themselves.
const { db, ROLES, auth, role, safe, addColumn, isStaff, today, isDate, badUrl, num, registerReport } = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS comm_diary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    entry_date TEXT NOT NULL,
    subject TEXT,
    content TEXT NOT NULL,
    attachment TEXT,
    attachment_name TEXT,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_lost_found (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    found_date TEXT NOT NULL,
    photo_url TEXT,
    status TEXT NOT NULL DEFAULT 'unclaimed' CHECK (status IN ('unclaimed','claimed','disposed')),
    claimed_by TEXT,
    claimed_on TEXT,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_online_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    start_at TEXT NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 40,
    meeting_url TEXT NOT NULL,
    notes TEXT,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_student_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('observation','creativity')),
    title TEXT NOT NULL,
    note TEXT,
    attachment TEXT,
    attachment_name TEXT,
    note_date TEXT NOT NULL,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL CHECK (scope IN ('class','section')),
    class_name TEXT,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'Homework',
    subject TEXT,
    title TEXT NOT NULL,
    body TEXT,
    due_date TEXT,
    attachments TEXT,
    attachment_names TEXT,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT,
    publish_from TEXT NOT NULL,
    publish_to TEXT,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_planner (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    subject TEXT,
    plan TEXT NOT NULL,
    attachment TEXT,
    attachment_name TEXT,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    subject TEXT,
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    file_name TEXT,
    posted_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comm_substitutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    timetable_id INTEGER NOT NULL REFERENCES timetable(id) ON DELETE CASCADE,
    absent_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    substitute_teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    remarks TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, timetable_id)
  );
`);
addColumn('homework', 'attachments TEXT');
addColumn('homework', 'attachment_names TEXT');

/* ---------- Helpers ---------- */
function viewerStudent(user) {
  if (isStaff(user) || !user.linked_id) return null;
  return db.prepare(`SELECT s.id, s.class_id, c.name AS class_name, c.section FROM students s
    LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`).get(user.linked_id) || null;
}
const splitList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean);
const nowLocal = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${today()}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const isMonth = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isDateTime = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const httpUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (date) => DAYS[new Date(`${date}T12:00:00`).getDay()];

function urlProblem(v, label) {
  for (const u of splitList(v)) { const bad = badUrl(u, label); if (bad) return bad; }
  return null;
}

/**
 * Generic content resource: one table, staff create/edit (teachers only their own posts), viewers scoped.
 *   fields       writable columns
 *   validate     (data, req, existing) => error string | null; may normalise data
 *   select/joins SQL used for listing
 *   scope        (viewer student) => [whereSql, params] for students/parents; null = visible to all
 *   filters      (query) => [[whereSql...], [params...]] extra list filters for everyone
 */
function resource({ table, fields, validate, select = 't.*', joins = '', order = 't.id DESC', scope, filters, decorate = (r) => r, ownerCol = 'posted_by' }) {
  const pick = (body) => {
    const d = {};
    for (const f of fields) if (body && f in body) d[f] = body[f] === '' ? null : body[f];
    return d;
  };
  const canChange = (req, row) => req.user.role === 'admin' || row[ownerCol] === req.user.id;
  const baseSql = `SELECT ${select} FROM ${table} t ${joins}`;
  return {
    list(req, res) {
      const w = [], p = [];
      if (filters) { const [fw, fp] = filters(req.query, req.user); w.push(...fw); p.push(...fp); }
      if (!isStaff(req.user) && scope) {
        const st = viewerStudent(req.user);
        if (!st) return res.json([]);
        const [sw, sp] = scope(st);
        w.push(sw); p.push(...sp);
      }
      const rows = db.prepare(`${baseSql} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${order} LIMIT 1000`).all(...p);
      res.json(rows.map(decorate));
    },
    create(req, res) {
      const d = pick(req.body);
      const problem = validate(d, req, null);
      if (problem) return res.status(400).json({ error: problem });
      d[ownerCol] = req.user.id;
      const cols = Object.keys(d);
      const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => d[c]));
      res.status(201).json({ id: info.lastInsertRowid });
    },
    update(req, res) {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (!canChange(req, row)) return res.status(403).json({ error: 'You can only change entries you posted' });
      const d = pick(req.body);
      if (!Object.keys(d).length) return res.status(400).json({ error: 'No fields provided' });
      const merged = { ...row, ...d };
      const problem = validate(merged, req, row);
      if (problem) return res.status(400).json({ error: problem });
      // Validation may normalise related fields (e.g. clearing class_id when scope becomes 'class').
      for (const f of fields) if (merged[f] !== row[f]) d[f] = merged[f];
      const cols = Object.keys(d);
      if (!cols.length) return res.json({ ok: true });
      db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => d[c]), row.id);
      res.json({ ok: true });
    },
    remove(req, res) {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (!canChange(req, row)) return res.status(403).json({ error: 'You can only delete entries you posted' });
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
      res.json({ ok: true });
    },
  };
}

function mount(router, path, ctrl) {
  router.get(path, auth, ctrl.list);
  router.post(path, auth, role(...ROLES.STAFF), safe(ctrl.create));
  router.put(`${path}/:id`, auth, role(...ROLES.STAFF), safe(ctrl.update));
  router.delete(`${path}/:id`, auth, role(...ROLES.STAFF), safe(ctrl.remove));
}

const classExists = (id) => !!db.prepare('SELECT 1 FROM classes WHERE id = ?').get(id);
const CLASS_JOIN = 'LEFT JOIN classes c ON c.id = t.class_id';
const CLASS_COLS = 'c.name AS class_name, c.section AS class_section';
const POSTER = 'LEFT JOIN users pu ON pu.id = t.posted_by';
const dateRange = (col) => (q) => {
  const w = [], p = [];
  if (isDate(q.from)) { w.push(`t.${col} >= ?`); p.push(q.from); }
  if (isDate(q.to)) { w.push(`t.${col} <= ?`); p.push(q.to); }
  if (q.class_id) { w.push('t.class_id = ?'); p.push(q.class_id); }
  return [w, p];
};

/* ---------- School Diary ---------- */
const diary = resource({
  table: 'comm_diary',
  fields: ['class_id', 'entry_date', 'subject', 'content', 'attachment', 'attachment_name'],
  select: `t.*, ${CLASS_COLS}, pu.full_name AS posted_by_name`, joins: `${CLASS_JOIN} ${POSTER}`,
  order: 't.entry_date DESC, t.id DESC',
  validate: (d) => {
    if (!d.class_id || !classExists(d.class_id)) return 'Choose a valid class';
    if (!isDate(d.entry_date)) return 'Date must be YYYY-MM-DD';
    if (!String(d.content || '').trim()) return 'Diary content is required';
    return urlProblem(d.attachment, 'attachment');
  },
  scope: (st) => ['t.class_id = ?', [st.class_id]],
  filters: dateRange('entry_date'),
});

/* ---------- Lost and Found ---------- */
const lostFound = resource({
  table: 'comm_lost_found',
  fields: ['item_name', 'description', 'location', 'found_date', 'photo_url', 'status', 'claimed_by', 'claimed_on'],
  select: 't.*, pu.full_name AS posted_by_name', joins: POSTER,
  order: "t.status = 'unclaimed' DESC, t.found_date DESC",
  validate: (d) => {
    if (!String(d.item_name || '').trim()) return 'Item name is required';
    if (!isDate(d.found_date)) return 'Found date must be YYYY-MM-DD';
    if (d.status && !['unclaimed', 'claimed', 'disposed'].includes(d.status)) return 'status must be unclaimed, claimed or disposed';
    if (d.status === 'claimed') {
      if (!String(d.claimed_by || '').trim()) return 'Enter who claimed the item';
      if (!d.claimed_on) d.claimed_on = today();
      if (!isDate(d.claimed_on)) return 'Claimed on must be YYYY-MM-DD';
    }
    return badUrl(d.photo_url, 'photo');
  },
  filters: (q) => (q.status ? [['t.status = ?'], [q.status]] : [[], []]),
});

/* ---------- Online Classes ---------- */
function onlineStatus(r) {
  const now = nowLocal();
  const end = new Date(Date.parse(r.start_at) + (r.duration_min || 0) * 60000);
  const p = (n) => String(n).padStart(2, '0');
  const endLocal = `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}T${p(end.getHours())}:${p(end.getMinutes())}`;
  return { ...r, ends_at: endLocal, state: now < r.start_at ? 'upcoming' : now <= endLocal ? 'live' : 'ended' };
}
const onlineClasses = resource({
  table: 'comm_online_classes',
  fields: ['class_id', 'subject', 'teacher_id', 'start_at', 'duration_min', 'meeting_url', 'notes'],
  select: `t.*, ${CLASS_COLS}, tc.full_name AS teacher_name`, joins: `${CLASS_JOIN} LEFT JOIN teachers tc ON tc.id = t.teacher_id`,
  order: 't.start_at',
  validate: (d) => {
    if (!d.class_id || !classExists(d.class_id)) return 'Choose a valid class';
    if (!String(d.subject || '').trim()) return 'Subject is required';
    if (!isDateTime(d.start_at)) return 'Start must be a date and time (YYYY-MM-DDTHH:MM)';
    const dur = num(d.duration_min ?? 40);
    if (!Number.isInteger(dur) || dur < 5 || dur > 480) return 'Duration must be 5 to 480 minutes';
    d.duration_min = dur;
    if (!httpUrl(d.meeting_url)) return 'Meeting link must start with http:// or https://';
    d.meeting_url = d.meeting_url.trim();
    return null;
  },
  scope: (st) => ['t.class_id = ?', [st.class_id]],
  // By default only classes that haven't finished (start + duration in the future, give or take a day).
  filters: (q) => {
    const [w, p] = dateRange('start_at')({ class_id: q.class_id });
    if (q.all !== '1') { w.push("t.start_at >= ?"); p.push(`${new Date(Date.now() - 864e5).toISOString().slice(0, 10)}T00:00`); }
    return [w, p];
  },
  decorate: onlineStatus,
});

/* ---------- Student Observation / Creativity ---------- */
const studentNotes = resource({
  table: 'comm_student_notes',
  fields: ['student_id', 'kind', 'title', 'note', 'attachment', 'attachment_name', 'note_date'],
  select: `t.*, s.full_name AS student_name, s.admission_no, ${CLASS_COLS}, pu.full_name AS posted_by_name`,
  joins: `JOIN students s ON s.id = t.student_id LEFT JOIN classes c ON c.id = s.class_id ${POSTER}`,
  order: 't.note_date DESC, t.id DESC',
  validate: (d) => {
    if (!['observation', 'creativity'].includes(d.kind)) return 'kind must be observation or creativity';
    if (!d.student_id || !db.prepare('SELECT 1 FROM students WHERE id = ?').get(d.student_id)) return 'Choose a valid student';
    if (!String(d.title || '').trim()) return 'Title is required';
    if (!d.note_date) d.note_date = today();
    if (!isDate(d.note_date)) return 'Date must be YYYY-MM-DD';
    if (d.kind === 'observation' && !String(d.note || '').trim()) return 'Write the observation';
    return urlProblem(d.attachment, 'attachment');
  },
  scope: (st) => ['t.student_id = ?', [st.id]],
  filters: (q) => {
    const w = [], p = [];
    if (q.kind) { w.push('t.kind = ?'); p.push(q.kind); }
    if (q.student_id) { w.push('t.student_id = ?'); p.push(q.student_id); }
    if (q.class_id) { w.push('s.class_id = ?'); p.push(q.class_id); }
    return [w, p];
  },
});

/* ---------- Academic Communication Classwise / Class Section wise ---------- */
const POST_CATEGORIES = ['Homework', 'Assignment', 'Circular', 'Notice', 'Class Test', 'Project'];
const posts = resource({
  table: 'comm_posts',
  fields: ['scope', 'class_name', 'class_id', 'category', 'subject', 'title', 'body', 'due_date', 'attachments', 'attachment_names'],
  select: `t.*, c.section AS class_section, COALESCE(t.class_name, c.name) AS class_label, pu.full_name AS posted_by_name`,
  joins: `${CLASS_JOIN} ${POSTER}`,
  validate: (d) => {
    if (d.scope === 'class') {
      if (!d.class_name || !db.prepare('SELECT 1 FROM classes WHERE name = ?').get(d.class_name)) return 'Choose a valid class';
      d.class_id = null;
    } else if (d.scope === 'section') {
      if (!d.class_id || !classExists(d.class_id)) return 'Choose a valid class section';
      d.class_name = null;
    } else return 'scope must be class or section';
    if (!POST_CATEGORIES.includes(d.category || 'Homework')) return `category must be one of ${POST_CATEGORIES.join(', ')}`;
    if (!String(d.title || '').trim()) return 'Title is required';
    if (d.due_date && !isDate(d.due_date)) return 'Due date must be YYYY-MM-DD';
    return urlProblem(d.attachments, 'attachment');
  },
  scope: (st) => ["((t.scope = 'section' AND t.class_id = ?) OR (t.scope = 'class' AND t.class_name = ?))", [st.class_id, st.class_name]],
  filters: (q) => {
    const w = [], p = [];
    if (q.scope) { w.push('t.scope = ?'); p.push(q.scope); }
    if (q.category) { w.push('t.category = ?'); p.push(q.category); }
    return [w, p];
  },
});

/* ---------- School News ---------- */
const news = resource({
  table: 'comm_news',
  fields: ['title', 'body', 'image_url', 'publish_from', 'publish_to'],
  select: 't.*, pu.full_name AS posted_by_name', joins: POSTER,
  order: 't.publish_from DESC, t.id DESC',
  validate: (d) => {
    if (!String(d.title || '').trim() || !String(d.body || '').trim()) return 'Title and news text are required';
    if (!d.publish_from) d.publish_from = today();
    if (!isDate(d.publish_from)) return 'Publish from must be YYYY-MM-DD';
    if (d.publish_to && !isDate(d.publish_to)) return 'Publish until must be YYYY-MM-DD';
    if (d.publish_to && d.publish_to < d.publish_from) return 'Publish until must not be before Publish from';
    return badUrl(d.image_url, 'image');
  },
  // Students/parents only see news currently being published.
  scope: () => ['t.publish_from <= ? AND (t.publish_to IS NULL OR t.publish_to >= ?)', [today(), today()]],
  decorate: (r) => ({ ...r, state: r.publish_from > today() ? 'scheduled' : r.publish_to && r.publish_to < today() ? 'expired' : 'live' }),
});

/* ---------- Monthly Planner ---------- */
const planner = resource({
  table: 'comm_planner',
  fields: ['class_id', 'month', 'subject', 'plan', 'attachment', 'attachment_name'],
  select: `t.*, ${CLASS_COLS}, pu.full_name AS posted_by_name`, joins: `${CLASS_JOIN} ${POSTER}`,
  order: 't.month DESC, c.name, c.section, t.subject',
  validate: (d) => {
    if (!d.class_id || !classExists(d.class_id)) return 'Choose a valid class';
    if (!isMonth(d.month)) return 'Month must be YYYY-MM';
    if (!String(d.plan || '').trim()) return 'Write the plan for the month';
    return urlProblem(d.attachment, 'attachment');
  },
  scope: (st) => ['t.class_id = ?', [st.class_id]],
  filters: (q) => {
    const w = [], p = [];
    if (isMonth(q.month)) { w.push('t.month = ?'); p.push(q.month); }
    if (q.class_id) { w.push('t.class_id = ?'); p.push(q.class_id); }
    return [w, p];
  },
});

/* ---------- Upload Resources ---------- */
const resources = resource({
  table: 'comm_resources',
  fields: ['class_id', 'subject', 'title', 'description', 'file_url', 'file_name'],
  select: `t.*, ${CLASS_COLS}, pu.full_name AS posted_by_name`, joins: `${CLASS_JOIN} ${POSTER}`,
  validate: (d) => {
    if (d.class_id && !classExists(d.class_id)) return 'Choose a valid class';
    if (!String(d.title || '').trim()) return 'Title is required';
    if (!d.file_url) return 'Upload a file or give a link';
    return badUrl(d.file_url, 'file');
  },
  scope: (st) => ['(t.class_id IS NULL OR t.class_id = ?)', [st.class_id]],
  filters: (q) => {
    const w = [], p = [];
    if (q.class_id) { w.push('t.class_id = ?'); p.push(q.class_id); }
    if (q.subject) { w.push('t.subject = ?'); p.push(q.subject); }
    return [w, p];
  },
});

/* ---------- Homework (scoped list + attachments; the homework CRUD itself lives in moduleControllers) ---------- */
function homeworkList(req, res) {
  const st = isStaff(req.user) ? null : viewerStudent(req.user);
  if (!isStaff(req.user) && !st) return res.json([]);
  const w = [], p = [];
  if (st) { w.push('h.class_id = ?'); p.push(st.class_id); }
  else if (req.query.class_id) { w.push('h.class_id = ?'); p.push(req.query.class_id); }
  res.json(db.prepare(`
    SELECT h.*, c.name AS class_name, c.section AS class_section, t.full_name AS teacher_name
    FROM homework h LEFT JOIN classes c ON c.id = h.class_id LEFT JOIN teachers t ON t.id = h.teacher_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY h.assign_date DESC LIMIT 500`).all(...p));
}
function homeworkAttachments(req, res) {
  const h = db.prepare('SELECT id, teacher_id FROM homework WHERE id = ?').get(req.params.id);
  if (!h) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && h.teacher_id !== req.user.linked_id) return res.status(403).json({ error: 'You can only change your own homework' });
  const urls = splitList(req.body.attachments);
  const bad = urlProblem(urls, 'attachment');
  if (bad) return res.status(400).json({ error: bad });
  const names = splitList(req.body.attachment_names).map(n => n.replace(/,/g, ' '));
  db.prepare('UPDATE homework SET attachments = ?, attachment_names = ? WHERE id = ?')
    .run(urls.join(',') || null, urls.length ? names.slice(0, urls.length).join(',') : null, h.id);
  res.json({ ok: true });
}

/* ---------- Teacher Substitution ---------- */
// A teacher is busy in a period if they teach it in the timetable or already substitute in it that day,
// and unavailable all day if they are on approved leave.
function busyTeacherIds(date, period) {
  const day = weekday(date);
  const ids = new Set();
  for (const r of db.prepare('SELECT teacher_id FROM timetable WHERE day = ? AND period = ? AND teacher_id IS NOT NULL').all(day, period)) ids.add(r.teacher_id);
  for (const r of db.prepare(`SELECT s.substitute_teacher_id AS id FROM comm_substitutions s JOIN timetable t ON t.id = s.timetable_id
    WHERE s.date = ? AND t.period = ?`).all(date, period)) ids.add(r.id);
  return ids;
}
const onLeave = (date) => new Set(db.prepare(`SELECT teacher_id FROM staff_leaves WHERE status = 'approved'
  AND COALESCE(approved_from, from_date) <= ? AND COALESCE(approved_to, to_date) >= ?`).all(date, date).map(r => r.teacher_id));

const substitution = {
  slots(req, res) {
    const { date } = req.query;
    const teacherId = Number(req.query.teacher_id);
    if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (!teacherId) return res.status(400).json({ error: 'Choose the absent teacher' });
    const day = weekday(date);
    const rows = db.prepare(`
      SELECT t.id AS timetable_id, t.day, t.period, t.subject, t.start_time, t.end_time, t.class_id,
        c.name AS class_name, c.section AS class_section,
        s.id AS substitution_id, s.substitute_teacher_id, st.full_name AS substitute_name, s.remarks
      FROM timetable t JOIN classes c ON c.id = t.class_id
      LEFT JOIN comm_substitutions s ON s.timetable_id = t.id AND s.date = ?
      LEFT JOIN teachers st ON st.id = s.substitute_teacher_id
      WHERE t.teacher_id = ? AND t.day = ? ORDER BY t.period`).all(date, teacherId, day);
    const leave = onLeave(date);
    const teachers = db.prepare("SELECT id, full_name, employee_no FROM teachers WHERE COALESCE(status, 'active') = 'active' ORDER BY full_name").all();
    const out = rows.map(r => {
      const busy = busyTeacherIds(date, r.period);
      return { ...r, free_teachers: teachers.filter(t => t.id !== teacherId && !leave.has(t.id) && (!busy.has(t.id) || t.id === r.substitute_teacher_id)) };
    });
    res.json({ date, day, on_leave: leave.has(teacherId), slots: out });
  },
  list(req, res) {
    const w = [], p = [];
    if (isDate(req.query.from)) { w.push('s.date >= ?'); p.push(req.query.from); }
    if (isDate(req.query.to)) { w.push('s.date <= ?'); p.push(req.query.to); }
    if (isDate(req.query.date)) { w.push('s.date = ?'); p.push(req.query.date); }
    const teacher = req.user.role === 'admin' ? Number(req.query.teacher_id) || null : req.user.linked_id ?? -1;
    if (teacher) { w.push('(s.absent_teacher_id = ? OR s.substitute_teacher_id = ?)'); p.push(teacher, teacher); }
    res.json(db.prepare(`
      SELECT s.*, t.day, t.period, t.subject, t.start_time, t.end_time, c.name AS class_name, c.section AS class_section,
        a.full_name AS absent_name, b.full_name AS substitute_name
      FROM comm_substitutions s JOIN timetable t ON t.id = s.timetable_id JOIN classes c ON c.id = t.class_id
      LEFT JOIN teachers a ON a.id = s.absent_teacher_id LEFT JOIN teachers b ON b.id = s.substitute_teacher_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY s.date DESC, t.period LIMIT 1000`).all(...p));
  },
  create(req, res) {
    const { date, remarks } = req.body || {};
    const timetableId = Number(req.body.timetable_id), subId = Number(req.body.substitute_teacher_id);
    if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const slot = db.prepare('SELECT * FROM timetable WHERE id = ?').get(timetableId);
    if (!slot) return res.status(404).json({ error: 'Timetable period not found' });
    if (slot.day !== weekday(date)) return res.status(400).json({ error: `That period is on ${slot.day}, but ${date} is a ${weekday(date)}` });
    if (!subId || !db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(subId)) return res.status(400).json({ error: 'Choose a substitute teacher' });
    if (subId === slot.teacher_id) return res.status(400).json({ error: 'The substitute must be a different teacher' });
    const existing = db.prepare('SELECT id FROM comm_substitutions WHERE date = ? AND timetable_id = ?').get(date, timetableId);
    if (busyTeacherIds(date, slot.period).has(subId) && !(existing && db.prepare('SELECT 1 FROM comm_substitutions WHERE id = ? AND substitute_teacher_id = ?').get(existing.id, subId))) {
      return res.status(409).json({ error: 'That teacher already has a class in this period' });
    }
    if (onLeave(date).has(subId)) return res.status(409).json({ error: 'That teacher is on leave that day' });
    // Re-assigning a period replaces the earlier substitute.
    db.prepare(`INSERT INTO comm_substitutions (date, timetable_id, absent_teacher_id, substitute_teacher_id, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(date, timetable_id) DO UPDATE SET
        substitute_teacher_id = excluded.substitute_teacher_id, remarks = excluded.remarks, created_by = excluded.created_by`)
      .run(date, timetableId, slot.teacher_id, subId, remarks || null, req.user.id);
    res.status(existing ? 200 : 201).json({ ok: true });
  },
  remove(req, res) {
    const info = db.prepare('DELETE FROM comm_substitutions WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
};

registerReport({
  key: 'teacher-substitutions', title: 'Teacher Substitution Report', group: 'Academic Communication', roles: ROLES.STAFF,
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'teacher_id', label: 'Teacher', type: 'teacher' },
  ],
  columns: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'period', label: 'Period', type: 'number' }, { key: 'class', label: 'Class' },
    { key: 'subject', label: 'Subject' }, { key: 'absent_name', label: 'Absent Teacher' }, { key: 'substitute_name', label: 'Substitute' },
    { key: 'remarks', label: 'Remarks' },
  ],
  run: (p, user) => {
    const teacher = user.role === 'admin' ? p.teacher_id : String(user.linked_id ?? -1);
    return db.prepare(`
      SELECT s.date, t.period, c.name || ' ' || c.section AS class, t.subject, a.full_name AS absent_name, b.full_name AS substitute_name, s.remarks
      FROM comm_substitutions s JOIN timetable t ON t.id = s.timetable_id JOIN classes c ON c.id = t.class_id
      LEFT JOIN teachers a ON a.id = s.absent_teacher_id LEFT JOIN teachers b ON b.id = s.substitute_teacher_id
      WHERE s.date BETWEEN ? AND ? AND (? = '' OR s.absent_teacher_id = ? OR s.substitute_teacher_id = ?)
      ORDER BY s.date, t.period`).all(p.from, p.to, teacher, teacher, teacher);
  },
});

registerReport({
  key: 'school-diary', title: 'School Diary Report', group: 'Academic Communication', roles: ROLES.STAFF,
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'entry_date', label: 'Date', type: 'date' }, { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' },
    { key: 'content', label: 'Diary' }, { key: 'posted_by_name', label: 'Posted By' },
  ],
  run: (p) => db.prepare(`
    SELECT d.entry_date, c.name || ' ' || c.section AS class, d.subject, d.content, u.full_name AS posted_by_name
    FROM comm_diary d JOIN classes c ON c.id = d.class_id LEFT JOIN users u ON u.id = d.posted_by
    WHERE d.entry_date BETWEEN ? AND ? AND (? = '' OR d.class_id = ?) ORDER BY d.entry_date DESC, c.name, c.section`)
    .all(p.from, p.to, p.class_id, p.class_id),
});

function register(router) {
  mount(router, '/comm/diary', diary);
  mount(router, '/comm/lost-found', lostFound);
  mount(router, '/comm/online-classes', onlineClasses);
  mount(router, '/comm/student-notes', studentNotes);
  mount(router, '/comm/posts', posts);
  mount(router, '/comm/news', news);
  mount(router, '/comm/planner', planner);
  mount(router, '/comm/resources', resources);

  router.get('/comm/homework', auth, homeworkList);
  router.put('/comm/homework/:id/attachments', auth, role(...ROLES.STAFF), safe(homeworkAttachments));

  router.get('/comm/substitution/slots', auth, role(...ROLES.ADMIN), substitution.slots);
  router.get('/comm/substitutions', auth, role(...ROLES.STAFF), substitution.list);
  router.post('/comm/substitutions', auth, role(...ROLES.ADMIN), safe(substitution.create));
  router.delete('/comm/substitutions/:id', auth, role(...ROLES.ADMIN), safe(substitution.remove));
}

module.exports = { register, POST_CATEGORIES };
