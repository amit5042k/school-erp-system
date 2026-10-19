// Library: memberships with borrowing limits, issue/return with automatic late fines, history and delay reports.
const { db, ROLES, auth, role, safe, isStaff, today, isDate, num, registerReport } = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS lib_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fine_per_day REAL NOT NULL DEFAULT 1,
    loan_days INTEGER NOT NULL DEFAULT 14,
    default_max_books INTEGER NOT NULL DEFAULT 2
  );
  INSERT OR IGNORE INTO lib_settings (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS lib_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_type TEXT NOT NULL CHECK (member_type IN ('student','staff')),
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    card_no TEXT UNIQUE NOT NULL,
    max_books INTEGER NOT NULL DEFAULT 2,
    valid_from TEXT,
    valid_to TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((member_type = 'student' AND student_id IS NOT NULL AND teacher_id IS NULL)
        OR (member_type = 'staff' AND teacher_id IS NOT NULL AND student_id IS NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_lib_member_student ON lib_members(student_id) WHERE student_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_lib_member_teacher ON lib_members(teacher_id) WHERE teacher_id IS NOT NULL;
`);

const settings = () => db.prepare('SELECT * FROM lib_settings WHERE id = 1').get();
const daysBetween = (from, to) => Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);
const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);

// Fine for a book returned (or still out) on `on`: days past due × per-day rate.
function lateFine(issue, on = today(), s = settings()) {
  const due = dateOnly(issue.due_date);
  if (!due) return { days_late: 0, fine: 0 };
  const days = Math.max(0, daysBetween(due, on));
  return { days_late: days, fine: Math.round(days * s.fine_per_day * 100) / 100 };
}

const MEMBER_SELECT = `
  SELECT m.*, COALESCE(s.full_name, t.full_name) AS member_name, s.admission_no, t.employee_no,
    c.name || ' ' || c.section AS class,
    (SELECT COUNT(*) FROM book_issues bi WHERE bi.status = 'issued'
      AND ((m.student_id IS NOT NULL AND bi.student_id = m.student_id) OR (m.teacher_id IS NOT NULL AND bi.teacher_id = m.teacher_id))) AS books_out
  FROM lib_members m LEFT JOIN students s ON s.id = m.student_id LEFT JOIN teachers t ON t.id = m.teacher_id
  LEFT JOIN classes c ON c.id = s.class_id`;

function nextCardNo() {
  const last = db.prepare('SELECT card_no FROM lib_members ORDER BY id DESC LIMIT 1').get()?.card_no;
  if (!last) return 'LIB-M-0001';
  const m = last.match(/^(.*?)(\d+)$/);
  return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : `${last}-1`;
}

function memberFor(studentId, teacherId) {
  return studentId
    ? db.prepare('SELECT * FROM lib_members WHERE student_id = ?').get(studentId)
    : db.prepare('SELECT * FROM lib_members WHERE teacher_id = ?').get(teacherId);
}

// A borrower without a membership card may borrow up to the default limit; a card sets its own limit and validity.
function checkBorrower(studentId, teacherId, on = today()) {
  const m = memberFor(studentId, teacherId);
  const s = settings();
  const limit = m ? m.max_books : s.default_max_books;
  if (m) {
    if (!m.active) return `Library card ${m.card_no} is inactive`;
    if (m.valid_from && on < m.valid_from) return `Library card ${m.card_no} is valid only from ${m.valid_from}`;
    if (m.valid_to && on > m.valid_to) return `Library card ${m.card_no} expired on ${m.valid_to}`;
  }
  const out = studentId
    ? db.prepare("SELECT COUNT(*) AS c FROM book_issues WHERE status = 'issued' AND student_id = ?").get(studentId).c
    : db.prepare("SELECT COUNT(*) AS c FROM book_issues WHERE status = 'issued' AND teacher_id = ?").get(teacherId).c;
  if (out >= limit) return `Borrowing limit reached: ${out} of ${limit} book(s) already issued`;
  return null;
}

const h = {
  settingsGet(req, res) { res.json(settings()); },
  settingsPut(req, res) {
    const cur = settings();
    const v = {
      fine_per_day: 'fine_per_day' in req.body ? num(req.body.fine_per_day) : cur.fine_per_day,
      loan_days: 'loan_days' in req.body ? num(req.body.loan_days) : cur.loan_days,
      default_max_books: 'default_max_books' in req.body ? num(req.body.default_max_books) : cur.default_max_books,
    };
    if (!(v.fine_per_day >= 0)) return res.status(400).json({ error: 'Fine per day must be 0 or more' });
    if (!Number.isInteger(v.loan_days) || v.loan_days < 1 || v.loan_days > 365) return res.status(400).json({ error: 'Loan period must be 1 to 365 days' });
    if (!Number.isInteger(v.default_max_books) || v.default_max_books < 1 || v.default_max_books > 50) return res.status(400).json({ error: 'Default book limit must be 1 to 50' });
    db.prepare('UPDATE lib_settings SET fine_per_day = ?, loan_days = ?, default_max_books = ? WHERE id = 1').run(v.fine_per_day, v.loan_days, v.default_max_books);
    res.json(settings());
  },

  members(req, res) {
    if (!isStaff(req.user)) {
      return res.json(db.prepare(`${MEMBER_SELECT} WHERE m.student_id = ?`).all(req.user.linked_id ?? -1));
    }
    res.json(db.prepare(`${MEMBER_SELECT} ORDER BY m.member_type, member_name`).all());
  },
  memberSave(req, res) {
    const existing = req.params.id ? db.prepare('SELECT * FROM lib_members WHERE id = ?').get(req.params.id) : null;
    if (req.params.id && !existing) return res.status(404).json({ error: 'Not found' });
    const b = req.body;
    const v = { ...(existing || {}) };
    for (const f of ['member_type', 'student_id', 'teacher_id', 'card_no', 'max_books', 'valid_from', 'valid_to', 'active', 'remarks']) {
      if (f in b) v[f] = b[f] === '' ? null : b[f];
    }
    if (!existing) {
      if (!['student', 'staff'].includes(v.member_type)) return res.status(400).json({ error: 'member_type must be student or staff' });
      if (v.member_type === 'student') { v.teacher_id = null; if (!v.student_id) return res.status(400).json({ error: 'Select a student' }); }
      else { v.student_id = null; if (!v.teacher_id) return res.status(400).json({ error: 'Select a staff member' }); }
      if (memberFor(v.student_id, v.teacher_id)) return res.status(409).json({ error: 'This person already has a library card' });
      if (!v.card_no) v.card_no = nextCardNo();
      if (v.max_books == null) v.max_books = settings().default_max_books;
      if (v.valid_from == null) v.valid_from = today();
    }
    v.max_books = num(v.max_books);
    if (!Number.isInteger(v.max_books) || v.max_books < 1 || v.max_books > 50) return res.status(400).json({ error: 'Max books must be 1 to 50' });
    for (const f of ['valid_from', 'valid_to']) if (v[f] && !isDate(v[f])) return res.status(400).json({ error: `${f.replace('_', ' ')} must be YYYY-MM-DD` });
    if (v.valid_from && v.valid_to && v.valid_to < v.valid_from) return res.status(400).json({ error: 'Valid To must not be before Valid From' });
    v.active = v.active == null ? 1 : (v.active === true || v.active === 1 || v.active === '1' ? 1 : 0);
    v.card_no = String(v.card_no || '').trim();
    if (!v.card_no) return res.status(400).json({ error: 'Card number is required' });
    if (existing) {
      db.prepare('UPDATE lib_members SET card_no = ?, max_books = ?, valid_from = ?, valid_to = ?, active = ?, remarks = ? WHERE id = ?')
        .run(v.card_no, v.max_books, v.valid_from, v.valid_to, v.active, v.remarks || null, existing.id);
      return res.json({ ok: true });
    }
    const info = db.prepare(`INSERT INTO lib_members (member_type, student_id, teacher_id, card_no, max_books, valid_from, valid_to, active, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(v.member_type, v.student_id, v.teacher_id, v.card_no, v.max_books, v.valid_from, v.valid_to, v.active, v.remarks || null);
    res.status(201).json({ id: info.lastInsertRowid, card_no: v.card_no });
  },
  memberRemove(req, res) {
    const info = db.prepare('DELETE FROM lib_members WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },

  // Issue with membership checks; due date defaults to the loan period.
  issue(req, res) {
    const { book_id } = req.body;
    const studentId = num(req.body.student_id) || null, teacherId = num(req.body.teacher_id) || null;
    if (!book_id) return res.status(400).json({ error: 'Select a book' });
    if (!studentId === !teacherId) return res.status(400).json({ error: 'Issue to either a student or a staff member' });
    const issueDate = req.body.issue_date || today();
    if (!isDate(issueDate) || issueDate > today()) return res.status(400).json({ error: 'Issue date must be today or earlier (YYYY-MM-DD)' });
    const loan = settings().loan_days;
    const due = req.body.due_date || new Date(Date.parse(issueDate) + loan * 86400000).toISOString().slice(0, 10);
    if (!isDate(due) || due < issueDate) return res.status(400).json({ error: 'Due date must be on or after the issue date' });
    if (studentId) {
      const s = db.prepare('SELECT status FROM students WHERE id = ?').get(studentId);
      if (!s) return res.status(400).json({ error: 'Student not found' });
      if (s.status && s.status !== 'active') return res.status(400).json({ error: 'Books can only be issued to active students' });
    } else if (!db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(teacherId)) return res.status(400).json({ error: 'Staff member not found' });
    const id = db.transaction(() => {
      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(book_id);
      if (!book) throw Object.assign(new Error('Book not found'), { status: 404 });
      if (book.qty_available <= 0) throw Object.assign(new Error(`No copies of "${book.title}" are available`), { status: 400 });
      const already = db.prepare(`SELECT 1 FROM book_issues WHERE book_id = ? AND status = 'issued' AND ${studentId ? 'student_id' : 'teacher_id'} = ?`)
        .get(book_id, studentId || teacherId);
      if (already) throw Object.assign(new Error('This borrower already has a copy of this book'), { status: 400 });
      const problem = checkBorrower(studentId, teacherId, issueDate);
      if (problem) throw Object.assign(new Error(problem), { status: 400 });
      db.prepare('UPDATE books SET qty_available = qty_available - 1 WHERE id = ?').run(book_id);
      return db.prepare(`INSERT INTO book_issues (book_id, student_id, teacher_id, issue_date, due_date) VALUES (?, ?, ?, ?, ?)`)
        .run(book_id, studentId, teacherId, issueDate === today() ? new Date().toISOString() : issueDate, due).lastInsertRowid;
    })();
    res.status(201).json({ id, due_date: due });
  },

  // Shows the fine that would be charged today, so the desk can confirm or waive it.
  returnPreview(req, res) {
    const issue = db.prepare('SELECT * FROM book_issues WHERE id = ?').get(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    res.json({ ...lateFine(issue), fine_per_day: settings().fine_per_day });
  },
  returnBook(req, res) {
    const issue = db.prepare('SELECT * FROM book_issues WHERE id = ?').get(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    const status = req.body.lost ? 'lost' : 'returned';
    const auto = lateFine(issue);
    const fine = req.body.fine == null || req.body.fine === '' ? auto.fine : num(req.body.fine);
    if (!(fine >= 0)) return res.status(400).json({ error: 'Fine must be 0 or more' });
    db.transaction(() => {
      const cur = db.prepare('SELECT status FROM book_issues WHERE id = ?').get(issue.id);
      if (cur.status !== 'issued') throw Object.assign(new Error(`Book is already ${cur.status}`), { status: 400 });
      db.prepare('UPDATE book_issues SET return_date = ?, status = ?, fine = ? WHERE id = ?').run(new Date().toISOString(), status, fine, issue.id);
      // A lost copy leaves the stock for good; a returned one goes back on the shelf.
      if (status === 'returned') db.prepare('UPDATE books SET qty_available = qty_available + 1 WHERE id = ?').run(issue.book_id);
      else db.prepare('UPDATE books SET qty_total = MAX(qty_total - 1, 0), qty_available = MIN(qty_available, MAX(qty_total - 1, 0)) WHERE id = ?').run(issue.book_id);
    })();
    res.json({ ok: true, status, fine, days_late: auto.days_late });
  },
};

/* ---------- Reports ---------- */
const BORROWER = `COALESCE(s.full_name || ' (' || s.admission_no || ')', t.full_name || ' (' || t.employee_no || ')')`;
const ISSUE_FROM = `FROM book_issues bi JOIN books b ON b.id = bi.book_id
  LEFT JOIN students s ON s.id = bi.student_id LEFT JOIN teachers t ON t.id = bi.teacher_id
  LEFT JOIN classes c ON c.id = s.class_id`;
const ISSUE_COLUMNS = [
  { key: 'issue_date', label: 'Issued', type: 'date' }, { key: 'book_no', label: 'Book No' }, { key: 'title', label: 'Title' },
  { key: 'borrower', label: 'Borrower' }, { key: 'borrower_type', label: 'Type' }, { key: 'class', label: 'Class' },
  { key: 'due_date', label: 'Due', type: 'date' }, { key: 'return_date', label: 'Returned', type: 'date' },
  { key: 'status', label: 'Status' }, { key: 'fine', label: 'Fine', type: 'money', total: true },
];
const issueRow = `bi.*, date(bi.issue_date, 'localtime') AS issue_date, date(bi.return_date, 'localtime') AS return_date,
  b.book_no, b.title, ${BORROWER} AS borrower,
  CASE WHEN bi.student_id IS NOT NULL THEN 'Student' ELSE 'Staff' END AS borrower_type, c.name || ' ' || c.section AS class`;

registerReport({
  key: 'book-history', title: 'Track Book History', group: 'Library', roles: ROLES.STAFF,
  description: 'Every issue of a book, or every book a student or staff member has borrowed.',
  params: [
    { name: 'book', label: 'Book No / Title contains', type: 'text' },
    { name: 'student_id', label: 'Student', type: 'student' },
    { name: 'teacher_id', label: 'Staff', type: 'teacher' },
  ],
  columns: ISSUE_COLUMNS,
  run: (p) => db.prepare(`SELECT ${issueRow} ${ISSUE_FROM}
    WHERE (? = '' OR b.book_no LIKE '%' || ? || '%' OR b.title LIKE '%' || ? || '%')
      AND (? = '' OR bi.student_id = ?) AND (? = '' OR bi.teacher_id = ?)
    ORDER BY bi.issue_date DESC LIMIT 2000`).all(p.book, p.book, p.book, p.student_id, p.student_id, p.teacher_id, p.teacher_id),
});

registerReport({
  key: 'book-issue', title: 'Book Issue Report', group: 'Library', roles: ROLES.STAFF,
  params: [
    { name: 'from', label: 'Issued From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'Issued To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['issued', 'returned', 'lost'] },
    { name: 'type', label: 'Borrower', type: 'select', options: ['Student', 'Staff'] },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: ISSUE_COLUMNS,
  run: (p) => db.prepare(`SELECT ${issueRow} ${ISSUE_FROM}
    WHERE date(bi.issue_date, 'localtime') BETWEEN ? AND ? AND (? = '' OR bi.status = ?)
      AND (? = '' OR (? = 'Student' AND bi.student_id IS NOT NULL) OR (? = 'Staff' AND bi.teacher_id IS NOT NULL))
      AND (? = '' OR s.class_id = ?)
    ORDER BY bi.issue_date DESC`).all(p.from, p.to, p.status, p.status, p.type, p.type, p.type, p.class_id, p.class_id),
});

registerReport({
  key: 'books-return-delay', title: 'Books Return Delay Report', group: 'Library', roles: ROLES.STAFF,
  description: 'Books still out past their due date, and books returned late, with the fine at the library rate.',
  params: [
    { name: 'as_on', label: 'As On', type: 'date', default: 'today', required: true },
    { name: 'show', label: 'Show', type: 'select', options: ['Still out', 'Returned late'] },
  ],
  columns: [
    { key: 'book_no', label: 'Book No' }, { key: 'title', label: 'Title' }, { key: 'borrower', label: 'Borrower' },
    { key: 'class', label: 'Class' }, { key: 'phone', label: 'Phone' }, { key: 'due_date', label: 'Due', type: 'date' },
    { key: 'return_date', label: 'Returned', type: 'date' }, { key: 'days_late', label: 'Days Late', type: 'number' },
    { key: 'fine', label: 'Fine', type: 'money', total: true }, { key: 'state', label: 'Status' },
  ],
  run: (p) => {
    const s = settings();
    return db.prepare(`SELECT ${issueRow}, COALESCE(s.contact, t.phone) AS phone ${ISSUE_FROM}
      WHERE bi.due_date IS NOT NULL AND (
        (bi.status = 'issued' AND bi.due_date < ?) OR
        (bi.status = 'returned' AND date(bi.return_date, 'localtime') > bi.due_date AND date(bi.return_date, 'localtime') <= ?))
      ORDER BY bi.due_date`).all(p.as_on, p.as_on)
      .map(r => {
        const out = r.status === 'issued';
        const days = Math.max(0, daysBetween(dateOnly(r.due_date), out ? p.as_on : r.return_date));
        return { ...r, days_late: days, fine: out ? Math.round(days * s.fine_per_day * 100) / 100 : r.fine, state: out ? 'Still out' : 'Returned late' };
      })
      .filter(r => !p.show || r.state === p.show);
  },
});

function register(router) {
  const A = [auth, role(...ROLES.ADMIN)];
  const S = [auth, role(...ROLES.STAFF)];
  router.get('/lib/settings', auth, h.settingsGet);
  router.put('/lib/settings', ...A, safe(h.settingsPut));
  router.get('/lib/members', auth, h.members);
  router.post('/lib/members', ...A, safe(h.memberSave));
  router.put('/lib/members/:id', ...A, safe(h.memberSave));
  router.delete('/lib/members/:id', ...A, safe(h.memberRemove));
  router.post('/lib/issue', ...S, safe(h.issue));
  router.get('/lib/return/:id/preview', ...S, h.returnPreview);
  router.post('/lib/return/:id', ...S, safe(h.returnBook));
}

module.exports = { register };
