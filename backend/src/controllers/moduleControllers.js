const db = require('../config/db');
const { makeCrud } = require('../utils/crud');

/* ---------- Admissions / Enquiries ---------- */
exports.enquiries = makeCrud({
  table: 'enquiries',
  fields: ['name','parent_name','phone','email','class_seeking','source','notes','status','follow_up_date'],
  orderBy: 'created_at DESC',
});

/* ---------- Front Office ---------- */
exports.visitors = makeCrud({
  table: 'visitors',
  fields: ['visitor_name','phone','purpose','to_meet','in_time','out_time','id_proof','remarks'],
  orderBy: 'in_time DESC',
});
exports.complaints = makeCrud({
  table: 'complaints',
  fields: ['complainant','phone','type','description','action_taken','status'],
  orderBy: 'created_at DESC',
});
exports.postal = makeCrud({
  table: 'postal',
  fields: ['direction','reference_no','to_title','from_title','date','note'],
  orderBy: 'date DESC',
});
exports.calls = makeCrud({
  table: 'call_logs',
  fields: ['caller_name','phone','direction','purpose','note','call_date'],
  orderBy: 'call_date DESC',
});

/* ---------- Examinations ---------- */
exports.exams = makeCrud({
  table: 'exams',
  fields: ['name','term','start_date','end_date'],
  orderBy: 'start_date DESC',
});
exports.examSchedule = makeCrud({
  table: 'exam_schedule',
  fields: ['exam_id','class_id','subject','date','start_time','end_time','max_marks'],
  orderBy: 'date',
});

exports.listMarks = (req, res) => {
  const { exam_id, student_id, class_id } = req.query;
  const wheres = [], params = [];
  if (exam_id) { wheres.push('m.exam_id = ?'); params.push(exam_id); }
  if (student_id) { wheres.push('m.student_id = ?'); params.push(student_id); }
  if (class_id) { wheres.push('s.class_id = ?'); params.push(class_id); }
  const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT m.*, s.full_name AS student_name, s.admission_no, e.name AS exam_name
    FROM marks m
    JOIN students s ON s.id = m.student_id
    JOIN exams e ON e.id = m.exam_id
    ${where}
    ORDER BY e.name, s.full_name, m.subject
  `).all(...params);
  res.json(rows);
};
exports.upsertMarks = (req, res) => {
  const { exam_id, student_id, subject, marks_obtained, max_marks = 100, grade } = req.body;
  if (!exam_id || !student_id || !subject || marks_obtained == null) return res.status(400).json({ error: 'exam_id, student_id, subject, marks_obtained required' });
  db.prepare(`
    INSERT INTO marks (exam_id, student_id, subject, marks_obtained, max_marks, grade)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(exam_id, student_id, subject) DO UPDATE SET
      marks_obtained = excluded.marks_obtained, max_marks = excluded.max_marks, grade = excluded.grade
  `).run(exam_id, student_id, subject, marks_obtained, max_marks, grade || null);
  res.json({ ok: true });
};

/* ---------- Library ---------- */
exports.books = makeCrud({
  table: 'books',
  fields: ['book_no','title','author','publisher','category','qty_total','qty_available','rack','price'],
  orderBy: 'title',
});
exports.listBookIssues = (req, res) => {
  const rows = db.prepare(`
    SELECT bi.*, b.title AS book_title, b.book_no, s.full_name AS student_name, t.full_name AS teacher_name
    FROM book_issues bi
    JOIN books b ON b.id = bi.book_id
    LEFT JOIN students s ON s.id = bi.student_id
    LEFT JOIN teachers t ON t.id = bi.teacher_id
    ORDER BY bi.issue_date DESC
  `).all();
  res.json(rows);
};
exports.issueBook = (req, res) => {
  const { book_id, student_id, teacher_id, due_date } = req.body;
  if (!book_id || (!student_id && !teacher_id)) return res.status(400).json({ error: 'book_id and (student_id or teacher_id) required' });
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(book_id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  if (book.qty_available <= 0) return res.status(400).json({ error: 'No copies available' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE books SET qty_available = qty_available - 1 WHERE id = ?').run(book_id);
    const info = db.prepare(`
      INSERT INTO book_issues (book_id, student_id, teacher_id, due_date) VALUES (?, ?, ?, ?)
    `).run(book_id, student_id || null, teacher_id || null, due_date || null);
    return info.lastInsertRowid;
  });
  res.status(201).json({ id: tx() });
};
exports.returnBook = (req, res) => {
  const issue = db.prepare('SELECT * FROM book_issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  if (issue.status === 'returned') return res.status(400).json({ error: 'Already returned' });
  const tx = db.transaction(() => {
    db.prepare(`UPDATE book_issues SET return_date = ?, status = 'returned', fine = ? WHERE id = ?`)
      .run(new Date().toISOString(), req.body.fine || 0, req.params.id);
    db.prepare('UPDATE books SET qty_available = qty_available + 1 WHERE id = ?').run(issue.book_id);
  });
  tx();
  res.json({ ok: true });
};

/* ---------- Transport ---------- */
exports.vehicles = makeCrud({
  table: 'vehicles',
  fields: ['vehicle_no','model','capacity','driver_name','driver_phone','license_no'],
  orderBy: 'vehicle_no',
});
exports.routes = makeCrud({
  table: 'routes',
  fields: ['name','stops','fare','vehicle_id'],
  orderBy: 'name',
  joins: 'LEFT JOIN vehicles v ON v.id = routes.vehicle_id',
  selectExtra: 'routes.*, v.vehicle_no AS vehicle_no',
});
exports.studentTransport = makeCrud({
  table: 'student_transport',
  fields: ['student_id','route_id','pickup_stop'],
  orderBy: 'id DESC',
  joins: 'JOIN students s ON s.id = student_transport.student_id JOIN routes r ON r.id = student_transport.route_id',
  selectExtra: 'student_transport.*, s.full_name AS student_name, s.admission_no, r.name AS route_name, r.fare',
});

/* ---------- Hostel ---------- */
exports.hostels = makeCrud({
  table: 'hostels',
  fields: ['name','type','warden'],
  orderBy: 'name',
});
exports.hostelRooms = makeCrud({
  table: 'hostel_rooms',
  fields: ['hostel_id','room_no','capacity','fee'],
  orderBy: 'room_no',
  joins: 'JOIN hostels h ON h.id = hostel_rooms.hostel_id',
  selectExtra: 'hostel_rooms.*, h.name AS hostel_name, h.type AS hostel_type',
});
exports.hostelAllotments = makeCrud({
  table: 'hostel_allotments',
  fields: ['student_id','room_id','vacated_on'],
  orderBy: 'allotted_on DESC',
  joins: 'JOIN students s ON s.id = hostel_allotments.student_id JOIN hostel_rooms r ON r.id = hostel_allotments.room_id JOIN hostels h ON h.id = r.hostel_id',
  selectExtra: 'hostel_allotments.*, s.full_name AS student_name, s.admission_no, r.room_no, h.name AS hostel_name',
});

/* ---------- Inventory ---------- */
exports.inventoryItems = makeCrud({
  table: 'inventory_items',
  fields: ['sku','name','category','unit','qty_on_hand','reorder_level','unit_price'],
  orderBy: 'name',
});
exports.inventoryMoveList = (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, i.name AS item_name, i.sku FROM inventory_movements m
    JOIN inventory_items i ON i.id = m.item_id ORDER BY m.moved_at DESC
  `).all();
  res.json(rows);
};
exports.inventoryMove = (req, res) => {
  const { item_id, movement_type, qty, reference, note } = req.body;
  if (!item_id || !movement_type || !qty) return res.status(400).json({ error: 'item_id, movement_type, qty required' });
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const delta = movement_type === 'purchase' ? qty : movement_type === 'issue' ? -qty : qty;
  const tx = db.transaction(() => {
    db.prepare('UPDATE inventory_items SET qty_on_hand = qty_on_hand + ? WHERE id = ?').run(delta, item_id);
    const info = db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, qty, reference, note) VALUES (?, ?, ?, ?, ?)
    `).run(item_id, movement_type, Math.abs(qty), reference || null, note || null);
    return info.lastInsertRowid;
  });
  res.status(201).json({ id: tx() });
};

/* ---------- HR ---------- */
const LEAVE_TYPES = [
  'Casual Leave',
  'Casual Leave Jan_June',
  'Casual Leave July_Dec',
  'Compensatory Casual leave',
  'Earned Leave',
  'Leave without Pay',
  'Medical Leave',
  'On Duty',
];
exports.LEAVE_TYPES = LEAVE_TYPES;

exports.leaves = makeCrud({
  table: 'staff_leaves',
  fields: ['teacher_id','leave_type','from_date','to_date','reason','attachment','session','status'],
  orderBy: 'applied_on DESC',
  joins: 'JOIN teachers t ON t.id = staff_leaves.teacher_id',
  selectExtra: `staff_leaves.*, t.full_name AS teacher_name, t.employee_no,
                t.department AS department, t.phone AS phone, t.photo_url AS photo_url`,
});

function daysInclusive(from, to) {
  const a = new Date(from), b = new Date(to);
  const ms = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((b - a) / ms) + 1);
}

exports.leaveBalance = (req, res) => {
  const teacherId = Number(req.params.teacherId);
  const session = req.query.session || db.prepare('SELECT academic_year FROM school_settings WHERE id = 1').get()?.academic_year || '';
  const allowances = db.prepare(`
    SELECT leave_type, allowed FROM leave_allowances WHERE teacher_id = ? AND session = ?
  `).all(teacherId, session);
  const approved = db.prepare(`
    SELECT leave_type, from_date, to_date, approved_from, approved_to
    FROM staff_leaves
    WHERE teacher_id = ? AND session = ? AND status = 'approved'
  `).all(teacherId, session);

  const allowedMap = Object.fromEntries(allowances.map(a => [a.leave_type, a.allowed]));
  const availedMap = {};
  for (const r of approved) {
    const from = r.approved_from || r.from_date;
    const to = r.approved_to || r.to_date;
    availedMap[r.leave_type] = (availedMap[r.leave_type] || 0) + daysInclusive(from, to);
  }
  const rows = LEAVE_TYPES.map(t => {
    const allowed = allowedMap[t] || 0;
    const availed = availedMap[t] || 0;
    const extra = Math.max(0, availed - allowed);
    const balance = Math.max(0, allowed - availed);
    return { leave_type: t, allowed, availed, extra, balance };
  });
  res.json({ teacher_id: teacherId, session, rows });
};

exports.leaveDecision = (req, res) => {
  const { action, approved_from, approved_to, remarks } = req.body;
  if (!['approve','reject','cancel'].includes(action)) return res.status(400).json({ error: 'action must be approve|reject|cancel' });
  const leave = db.prepare('SELECT * FROM staff_leaves WHERE id = ?').get(req.params.id);
  if (!leave) return res.status(404).json({ error: 'Not found' });
  const map = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' };
  db.prepare(`
    UPDATE staff_leaves
    SET status = ?, approved_from = ?, approved_to = ?, remarks = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    map[action],
    action === 'approve' ? (approved_from || leave.from_date) : null,
    action === 'approve' ? (approved_to || leave.to_date) : null,
    remarks || null,
    req.user?.id || null,
    req.params.id
  );
  res.json({ ok: true });
};

exports.leaveAllowances = {
  list(req, res) {
    const teacherId = req.query.teacher_id;
    const session = req.query.session;
    const wheres = [], params = [];
    if (teacherId) { wheres.push('teacher_id = ?'); params.push(teacherId); }
    if (session) { wheres.push('session = ?'); params.push(session); }
    const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
    res.json(db.prepare(`SELECT * FROM leave_allowances ${where} ORDER BY teacher_id, leave_type`).all(...params));
  },
  upsert(req, res) {
    const { teacher_id, session, leave_type, allowed } = req.body;
    if (!teacher_id || !session || !leave_type) return res.status(400).json({ error: 'teacher_id, session, leave_type required' });
    db.prepare(`
      INSERT INTO leave_allowances (teacher_id, session, leave_type, allowed) VALUES (?, ?, ?, ?)
      ON CONFLICT(teacher_id, session, leave_type) DO UPDATE SET allowed = excluded.allowed
    `).run(teacher_id, session, leave_type, allowed || 0);
    res.json({ ok: true });
  },
};
exports.payroll = makeCrud({
  table: 'payroll',
  fields: ['teacher_id','month','basic','allowances','deductions','net_pay','paid_on','status'],
  orderBy: 'month DESC',
  joins: 'JOIN teachers t ON t.id = payroll.teacher_id',
  selectExtra: 'payroll.*, t.full_name AS teacher_name, t.employee_no',
});

/* ---------- Homework ---------- */
exports.homework = makeCrud({
  table: 'homework',
  fields: ['class_id','subject','title','description','due_date','teacher_id'],
  orderBy: 'assign_date DESC',
  joins: 'LEFT JOIN classes c ON c.id = homework.class_id LEFT JOIN teachers t ON t.id = homework.teacher_id',
  selectExtra: 'homework.*, c.name AS class_name, c.section AS class_section, t.full_name AS teacher_name',
});

/* ---------- Communications ---------- */
exports.communications = {
  list(req, res) {
    res.json(db.prepare(`
      SELECT c.*, u.full_name AS sent_by_name FROM communications c
      LEFT JOIN users u ON u.id = c.sent_by ORDER BY c.sent_at DESC
    `).all());
  },
  create(req, res) {
    const { channel, audience, subject, body, recipient_count } = req.body;
    if (!channel || !body) return res.status(400).json({ error: 'channel and body required' });
    const info = db.prepare(`
      INSERT INTO communications (channel, audience, subject, body, recipient_count, sent_by) VALUES (?, ?, ?, ?, ?, ?)
    `).run(channel, audience || 'all', subject || null, body, recipient_count || 0, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  },
};

/* ---------- Documents ---------- */
exports.documents = makeCrud({
  table: 'documents',
  fields: ['title','category','url','audience','uploaded_by'],
  orderBy: 'uploaded_at DESC',
});

/* ---------- Settings ---------- */
exports.settings = {
  get(req, res) {
    res.json(db.prepare('SELECT * FROM school_settings WHERE id = 1').get());
  },
  update(req, res) {
    const fields = ['school_name','address','phone','email','website','academic_year','logo_url'];
    const sets = [], vals = [];
    for (const f of fields) if (f in req.body) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    if (!sets.length) return res.status(400).json({ error: 'No fields provided' });
    db.prepare(`UPDATE school_settings SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
    res.json({ ok: true });
  },
};

/* ---------- Users (admin-managed) ---------- */
const bcrypt = require('bcryptjs');
exports.users = {
  list(req, res) {
    res.json(db.prepare('SELECT id, username, role, full_name, email, phone, linked_id, active FROM users ORDER BY id').all());
  },
  create(req, res) {
    const { username, password, role, full_name, email, phone, linked_id } = req.body;
    if (!username || !password || !role || !full_name) return res.status(400).json({ error: 'username, password, role, full_name required' });
    try {
      const info = db.prepare(`
        INSERT INTO users (username, password_hash, role, full_name, email, phone, linked_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(username, bcrypt.hashSync(password, 10), role, full_name, email || null, phone || null, linked_id || null);
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (e) { res.status(400).json({ error: e.message }); }
  },
  setActive(req, res) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, req.params.id);
    res.json({ ok: true });
  },
  resetPassword(req, res) {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
    res.json({ ok: true });
  },
};

/* ---------- Reports (summary) ---------- */
exports.reports = (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    students: db.prepare('SELECT COUNT(*) c FROM students').get().c,
    teachers: db.prepare('SELECT COUNT(*) c FROM teachers').get().c,
    attendance_today: db.prepare(`
      SELECT status, COUNT(*) c FROM attendance WHERE date = ? GROUP BY status
    `).all(today),
    fees_by_status: db.prepare(`SELECT status, SUM(amount) AS total FROM fees GROUP BY status`).all(),
    library_issued: db.prepare("SELECT COUNT(*) c FROM book_issues WHERE status = 'issued'").get().c,
    transport_students: db.prepare('SELECT COUNT(*) c FROM student_transport').get().c,
    hostel_occupancy: db.prepare("SELECT COUNT(*) c FROM hostel_allotments WHERE vacated_on IS NULL").get().c,
    low_stock: db.prepare('SELECT sku, name, qty_on_hand, reorder_level FROM inventory_items WHERE qty_on_hand <= reorder_level').all(),
    pending_leaves: db.prepare("SELECT COUNT(*) c FROM staff_leaves WHERE status = 'pending'").get().c,
  });
};
