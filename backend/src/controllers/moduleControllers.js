const db = require('../config/db');
const { ensureStaffLogin, usernameFor, isEmail } = require('../utils/staffLogin');
const { makeCrud } = require('../utils/crud');
const { today: localToday, dbError, isDate, num, badUrl } = require('../utils/http');
const { isStaff } = require('../middleware/auth');

const dateOrder = (from, to, label = 'dates') =>
  from && to && from > to ? `End date must not be before start date (${label})` : null;

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
  validate: (d) => dateOrder(d.start_date, d.end_date, 'exam'),
});
exports.examSchedule = makeCrud({
  table: 'exam_schedule',
  fields: ['exam_id','class_id','subject','date','start_time','end_time','max_marks'],
  orderBy: 'date',
  validate: (d) => (d.max_marks != null && !(num(d.max_marks) > 0) ? 'max_marks must be a positive number' : null),
});

exports.listMarks = (req, res) => {
  const { exam_id, class_id } = req.query;
  // Students and parents only ever get their own marks, whatever they ask for.
  const student_id = isStaff(req.user) ? req.query.student_id : (req.user.linked_id ?? -1);
  const wheres = [], params = [];
  if (exam_id) { wheres.push('m.exam_id = ?'); params.push(exam_id); }
  if (student_id) { wheres.push('m.student_id = ?'); params.push(student_id); }
  if (class_id) { wheres.push('s.class_id = ?'); params.push(class_id); }
  // Students and parents see only published, unblocked results.
  if (!isStaff(req.user)) {
    wheres.push('EXISTS (SELECT 1 FROM exam_publish p WHERE p.exam_id = m.exam_id AND p.class_id = s.class_id AND p.marks_published = 1)');
    wheres.push('NOT EXISTS (SELECT 1 FROM exam_result_blocks b WHERE b.student_id = m.student_id AND b.exam_id IN (0, m.exam_id))');
  }
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
  if (!exam_id || !student_id || !subject || marks_obtained == null || marks_obtained === '') return res.status(400).json({ error: 'exam_id, student_id, subject, marks_obtained required' });
  const got = num(marks_obtained), max = num(max_marks);
  if (!(max > 0)) return res.status(400).json({ error: 'max_marks must be a positive number' });
  if (!(got >= 0) || got > max) return res.status(400).json({ error: `marks_obtained must be between 0 and ${max}` });
  try { db.prepare(`
    INSERT INTO marks (exam_id, student_id, subject, marks_obtained, max_marks, grade)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(exam_id, student_id, subject) DO UPDATE SET
      marks_obtained = excluded.marks_obtained, max_marks = excluded.max_marks, grade = excluded.grade
  `).run(exam_id, student_id, subject, got, max, grade || null); } catch (e) { return dbError(res, e); }
  res.json({ ok: true });
};

/* ---------- Library ---------- */
const booksCrud = makeCrud({
  table: 'books',
  fields: ['book_no','title','author','publisher','category','qty_total','qty_available','rack','price'],
  orderBy: 'title',
  validate: (d, req, existing) => {
    const total = num(d.qty_total ?? 1);
    if (!Number.isInteger(total) || total < 0) return 'qty_total must be a whole number of 0 or more';
    if (!existing && d.qty_available == null) d.qty_available = total;
    const avail = num(d.qty_available);
    if (!Number.isInteger(avail) || avail < 0 || avail > total) return 'qty_available must be between 0 and qty_total';
    return null;
  },
});
// Available copies always equal total minus copies on loan, so changing the total can't leave them out of step
// (a stale "available" from the edit form would otherwise let returns push it above the total).
exports.books = {
  ...booksCrud,
  update(req, res) {
    if ('qty_total' in (req.body || {})) {
      const onLoan = db.prepare("SELECT COUNT(*) AS c FROM book_issues WHERE book_id = ? AND status = 'issued'").get(req.params.id).c;
      const total = num(req.body.qty_total);
      if (Number.isInteger(total) && total < onLoan) return res.status(400).json({ error: `${onLoan} copies are on loan; the total can't be less than that` });
      if (Number.isInteger(total)) req.body.qty_available = total - onLoan;
    }
    return booksCrud.update(req, res);
  },
};
exports.listBookIssues = (req, res) => {
  const own = !isStaff(req.user);
  const rows = db.prepare(`
    SELECT bi.*, b.title AS book_title, b.book_no, s.full_name AS student_name, t.full_name AS teacher_name
    FROM book_issues bi
    JOIN books b ON b.id = bi.book_id
    LEFT JOIN students s ON s.id = bi.student_id
    LEFT JOIN teachers t ON t.id = bi.teacher_id
    ${own ? 'WHERE bi.student_id = ?' : ''}
    ORDER BY bi.issue_date DESC
  `).all(...(own ? [req.user.linked_id ?? -1] : []));
  res.json(rows);
};
exports.issueBook = (req, res) => {
  const { book_id, student_id, teacher_id, due_date } = req.body;
  if (!book_id || (!student_id && !teacher_id)) return res.status(400).json({ error: 'book_id and (student_id or teacher_id) required' });
  if (student_id && teacher_id) return res.status(400).json({ error: 'Issue to either a student or a teacher, not both' });
  if (due_date && !isDate(due_date)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });
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
  try { res.status(201).json({ id: tx() }); } catch (e) { dbError(res, e); }
};
exports.returnBook = (req, res) => {
  const issue = db.prepare('SELECT * FROM book_issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  if (issue.status !== 'issued') return res.status(400).json({ error: `Book is already ${issue.status}` });
  const fine = num(req.body.fine ?? 0);
  if (!(fine >= 0)) return res.status(400).json({ error: 'fine must be 0 or more' });
  const tx = db.transaction(() => {
    db.prepare(`UPDATE book_issues SET return_date = ?, status = 'returned', fine = ? WHERE id = ?`)
      .run(new Date().toISOString(), fine, req.params.id);
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
  validate: (d) => (d.capacity != null && !(Number.isInteger(num(d.capacity)) && num(d.capacity) > 0) ? 'capacity must be a positive whole number' : null),
  joins: 'JOIN hostels h ON h.id = hostel_rooms.hostel_id',
  selectExtra: 'hostel_rooms.*, h.name AS hostel_name, h.type AS hostel_type',
});
const allotmentCrud = makeCrud({
  table: 'hostel_allotments',
  fields: ['student_id','room_id','vacated_on'],
  orderBy: 'allotted_on DESC',
  joins: 'JOIN students s ON s.id = hostel_allotments.student_id JOIN hostel_rooms r ON r.id = hostel_allotments.room_id JOIN hostels h ON h.id = r.hostel_id',
  selectExtra: 'hostel_allotments.*, s.full_name AS student_name, s.admission_no, r.room_no, h.name AS hostel_name',
});

function roomHasSpace(roomId, ignoreAllotmentId = 0) {
  const room = db.prepare('SELECT capacity FROM hostel_rooms WHERE id = ?').get(roomId);
  if (!room) return 'Room not found';
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM hostel_allotments WHERE room_id = ? AND vacated_on IS NULL AND id != ?')
    .get(roomId, ignoreAllotmentId);
  return c >= room.capacity ? `Room is full (${c}/${room.capacity})` : null;
}
function activeAllotment(studentId, ignoreAllotmentId = 0) {
  return db.prepare(`
    SELECT r.room_no, h.name AS hostel_name FROM hostel_allotments a
    JOIN hostel_rooms r ON r.id = a.room_id JOIN hostels h ON h.id = r.hostel_id
    WHERE a.student_id = ? AND a.vacated_on IS NULL AND a.id != ?
  `).get(studentId, ignoreAllotmentId);
}

exports.hostelAllotments = {
  ...allotmentCrud,
  create(req, res) {
    const { student_id, room_id } = req.body;
    if (!student_id || !room_id) return res.status(400).json({ error: 'student_id and room_id required' });
    const current = activeAllotment(student_id);
    if (current) return res.status(409).json({ error: `Student already has room ${current.room_no} in ${current.hostel_name}; vacate it first` });
    const full = roomHasSpace(room_id);
    if (full) return res.status(409).json({ error: full });
    try {
      const info = db.prepare('INSERT INTO hostel_allotments (student_id, room_id) VALUES (?, ?)').run(student_id, room_id);
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (e) { dbError(res, e); }
  },
  update(req, res) {
    const a = db.prepare('SELECT * FROM hostel_allotments WHERE id = ?').get(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    const next = { ...a, ...req.body };
    if (next.vacated_on == null || next.vacated_on === '') {
      const current = activeAllotment(next.student_id, a.id);
      if (current) return res.status(409).json({ error: `Student already has room ${current.room_no} in ${current.hostel_name}` });
      const full = roomHasSpace(next.room_id, a.id);
      if (full) return res.status(409).json({ error: full });
    }
    return allotmentCrud.update(req, res);
  },
};
// Vacate today (or a given date); keeps history instead of deleting the allotment.
exports.vacateAllotment = (req, res) => {
  const date = req.body.vacated_on || localToday();
  if (!isDate(date)) return res.status(400).json({ error: 'vacated_on must be YYYY-MM-DD' });
  const info = db.prepare('UPDATE hostel_allotments SET vacated_on = ? WHERE id = ? AND vacated_on IS NULL').run(date, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'No active allotment with that id' });
  res.json({ ok: true });
};

/* ---------- Inventory ---------- */
exports.inventoryItems = makeCrud({
  table: 'inventory_items',
  fields: ['sku','name','category','unit','qty_on_hand','reorder_level','unit_price'],
  orderBy: 'name',
  validate: (d) => {
    if (d.qty_on_hand != null && !(num(d.qty_on_hand) >= 0)) return 'qty_on_hand must be 0 or more';
    if (d.reorder_level != null && !(num(d.reorder_level) >= 0)) return 'reorder_level must be 0 or more';
    if (d.unit_price != null && !(num(d.unit_price) >= 0)) return 'unit_price must be 0 or more';
    return null;
  },
});
exports.inventoryMoveList = (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, i.name AS item_name, i.sku FROM inventory_movements m
    JOIN inventory_items i ON i.id = m.item_id ORDER BY m.moved_at DESC
  `).all();
  res.json(rows);
};
exports.inventoryMove = (req, res) => {
  const { item_id, movement_type, reference, note } = req.body;
  const qty = num(req.body.qty);
  if (!item_id || !movement_type) return res.status(400).json({ error: 'item_id, movement_type, qty required' });
  if (!['purchase', 'issue', 'adjust'].includes(movement_type)) return res.status(400).json({ error: 'movement_type must be purchase, issue or adjust' });
  if (!Number.isInteger(qty) || qty === 0) return res.status(400).json({ error: 'qty must be a non-zero whole number' });
  if (movement_type !== 'adjust' && qty < 0) return res.status(400).json({ error: 'qty must be positive for purchase/issue (use adjust to correct stock)' });
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const delta = movement_type === 'issue' ? -qty : qty;
  if (item.qty_on_hand + delta < 0) return res.status(400).json({ error: `Not enough stock: only ${item.qty_on_hand} ${item.unit || 'units'} on hand` });
  const tx = db.transaction(() => {
    db.prepare('UPDATE inventory_items SET qty_on_hand = qty_on_hand + ? WHERE id = ?').run(delta, item_id);
    const info = db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, qty, reference, note) VALUES (?, ?, ?, ?, ?)
    `).run(item_id, movement_type, movement_type === 'adjust' ? qty : Math.abs(qty), reference || null, note || null);
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
// Leave types come from the editable "Leave Types" list; the built-in names are the fallback.
const { masterNames } = require('../utils/masters');
const leaveTypes = () => { const m = masterNames('leave-types'); return m.length ? m : LEAVE_TYPES; };
exports.leaveTypes = leaveTypes;

const leaveCrud = makeCrud({
  table: 'staff_leaves',
  // status is deliberately not writable here: it only changes via POST /leaves/:id/decision.
  fields: ['teacher_id','leave_type','from_date','to_date','reason','attachment','session'],
  orderBy: 'applied_on DESC',
  joins: 'JOIN teachers t ON t.id = staff_leaves.teacher_id',
  selectExtra: `staff_leaves.*, t.full_name AS teacher_name, t.employee_no,
                t.department AS department, t.phone AS phone, t.photo_url AS photo_url`,
  validate: (d) => {
    if (!d.teacher_id) return 'teacher_id is required';
    if (!leaveTypes().includes(d.leave_type)) return `leave_type must be one of: ${leaveTypes().join(', ')}`;
    if (!isDate(d.from_date) || !isDate(d.to_date)) return 'from_date and to_date must be YYYY-MM-DD';
    return dateOrder(d.from_date, d.to_date, 'leave') || badUrl(d.attachment, 'attachment');
  },
});

const currentSession = () => db.prepare('SELECT academic_year FROM school_settings WHERE id = 1').get()?.academic_year || '';
const LEAVE_SELECT = `SELECT staff_leaves.*, t.full_name AS teacher_name, t.employee_no,
  t.department AS department, t.phone AS phone, t.photo_url AS photo_url
  FROM staff_leaves JOIN teachers t ON t.id = staff_leaves.teacher_id`;

// Another pending or approved leave of the same person covering any of these days.
function overlappingLeave(teacherId, from, to, exceptId = 0) {
  if (!teacherId || !isDate(from) || !isDate(to)) return null;
  const o = db.prepare(`SELECT leave_type, status, COALESCE(approved_from, from_date) AS f, COALESCE(approved_to, to_date) AS t FROM staff_leaves
    WHERE teacher_id = ? AND id != ? AND status IN ('pending', 'approved')
      AND COALESCE(approved_from, from_date) <= ? AND COALESCE(approved_to, to_date) >= ? LIMIT 1`).get(teacherId, exceptId, to, from);
  return o ? `There is already ${o.status === 'approved' ? 'an approved' : 'a pending'} ${o.leave_type} from ${o.f} to ${o.t} for these dates` : null;
}

// Teachers act only on their own leaves; admins on anyone's.
function ownLeave(req, res) {
  const leave = db.prepare('SELECT * FROM staff_leaves WHERE id = ?').get(req.params.id);
  if (!leave) { res.status(404).json({ error: 'Not found' }); return null; }
  if (req.user.role !== 'admin') {
    if (leave.teacher_id !== req.user.linked_id) { res.status(403).json({ error: 'You can only change your own leave applications' }); return null; }
    if (leave.status !== 'pending') { res.status(400).json({ error: `Leave is already ${leave.status}` }); return null; }
  }
  return leave;
}

exports.leaves = {
  list(req, res) {
    if (req.user.role === 'admin') return res.json(db.prepare(`${LEAVE_SELECT} ORDER BY applied_on DESC`).all());
    res.json(db.prepare(`${LEAVE_SELECT} WHERE staff_leaves.teacher_id = ? ORDER BY applied_on DESC`).all(req.user.linked_id ?? -1));
  },
  get(req, res) {
    const row = db.prepare(`${LEAVE_SELECT} WHERE staff_leaves.id = ?`).get(req.params.id);
    if (!row || (req.user.role !== 'admin' && row.teacher_id !== req.user.linked_id)) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  },
  create(req, res) {
    if (req.user.role !== 'admin') {
      if (!req.user.linked_id) return res.status(400).json({ error: 'Your account is not linked to a staff record' });
      req.body.teacher_id = req.user.linked_id;
    }
    if (!req.body.session) req.body.session = currentSession();
    const clash = overlappingLeave(req.body.teacher_id, req.body.from_date, req.body.to_date);
    if (clash) return res.status(409).json({ error: clash });
    return leaveCrud.create(req, res);
  },
  update(req, res) {
    const leave = ownLeave(req, res); if (!leave) return;
    // Only a pending application can be edited, and it stays the same person's: otherwise a leave could be moved to
    // a colleague, approved, and moved back (deciding your own leave), or its dates changed after approval.
    if (leave.status !== 'pending') return res.status(400).json({ error: `Leave is already ${leave.status}; cancel it and apply again instead` });
    if (req.body.teacher_id != null && Number(req.body.teacher_id) !== leave.teacher_id) {
      return res.status(400).json({ error: 'A leave application cannot be moved to another staff member; apply a new one for them' });
    }
    delete req.body.teacher_id;
    const clash = overlappingLeave(leave.teacher_id, req.body.from_date ?? leave.from_date, req.body.to_date ?? leave.to_date, leave.id);
    if (clash) return res.status(409).json({ error: clash });
    return leaveCrud.update(req, res);
  },
  remove(req, res) {
    const leave = ownLeave(req, res); if (!leave) return;
    return leaveCrud.remove(req, res);
  },
};

function daysInclusive(from, to) {
  const a = new Date(from), b = new Date(to);
  const ms = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((b - a) / ms) + 1);
}

exports.leaveBalance = (req, res) => {
  const teacherId = Number(req.params.teacherId);
  if (req.user.role !== 'admin' && teacherId !== req.user.linked_id) return res.status(403).json({ error: 'Forbidden' });
  const session = req.query.session || currentSession();
  const allowances = db.prepare(`
    SELECT leave_type, allowed FROM leave_allowances WHERE teacher_id = ? AND session = ?
  `).all(teacherId, session);
  const approved = db.prepare(`
    SELECT leave_type, from_date, to_date, approved_from, approved_to
    FROM staff_leaves
    WHERE teacher_id = ? AND COALESCE(session, ?) = ? AND status = 'approved'
  `).all(teacherId, currentSession(), session);

  const allowedMap = Object.fromEntries(allowances.map(a => [a.leave_type, a.allowed]));
  const availedMap = {};
  for (const r of approved) {
    const from = r.approved_from || r.from_date;
    const to = r.approved_to || r.to_date;
    availedMap[r.leave_type] = (availedMap[r.leave_type] || 0) + daysInclusive(from, to);
  }
  const rows = leaveTypes().map(t => {
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
  // Staff with full HR access decide others' leave, never their own; a Super Admin decides theirs.
  if ((req.user.base_role || req.user.role) !== 'admin' && leave.teacher_id === req.user.linked_id) {
    return res.status(403).json({ error: 'You cannot decide your own leave; it goes to the principal or Super Admin' });
  }
  const map = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' };
  if (leave.status === 'cancelled' || leave.status === 'rejected') return res.status(400).json({ error: `Leave is already ${leave.status}` });
  if (leave.status === 'approved' && action !== 'cancel') return res.status(400).json({ error: 'Leave is already approved; it can only be cancelled' });
  if (action === 'approve') {
    const from = approved_from || leave.from_date, to = approved_to || leave.to_date;
    if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'approved dates must be YYYY-MM-DD' });
    if (from > to) return res.status(400).json({ error: 'Approved To must not be before Approved From' });
    if (from < leave.from_date || to > leave.to_date) return res.status(400).json({ error: 'Approved dates must fall within the requested leave period' });
    const clash = db.prepare(`SELECT 1 FROM staff_leaves WHERE teacher_id = ? AND id != ? AND status = 'approved'
      AND COALESCE(approved_from, from_date) <= ? AND COALESCE(approved_to, to_date) >= ?`).get(leave.teacher_id, leave.id, to, from);
    if (clash) return res.status(409).json({ error: 'This staff member already has approved leave on some of these days' });
  }
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
    const teacherId = req.user.role === 'admin' ? req.query.teacher_id : (req.user.linked_id ?? -1);
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
    if (!leaveTypes().includes(leave_type)) return res.status(400).json({ error: 'Unknown leave_type' });
    if (!(num(allowed ?? 0) >= 0)) return res.status(400).json({ error: 'allowed must be 0 or more' });
    try { db.prepare(`
      INSERT INTO leave_allowances (teacher_id, session, leave_type, allowed) VALUES (?, ?, ?, ?)
      ON CONFLICT(teacher_id, session, leave_type) DO UPDATE SET allowed = excluded.allowed
    `).run(teacher_id, session, leave_type, num(allowed ?? 0)); } catch (e) { return dbError(res, e); }
    res.json({ ok: true });
  },
};
const payrollCrud = makeCrud({
  table: 'payroll',
  fields: ['teacher_id','month','basic','allowances','deductions','net_pay','paid_on','status'],
  orderBy: 'month DESC',
  joins: 'JOIN teachers t ON t.id = payroll.teacher_id',
  selectExtra: 'payroll.*, t.full_name AS teacher_name, t.employee_no',
  validate: (d) => {
    if (d.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.month)) return 'month must be YYYY-MM';
    for (const f of ['basic', 'allowances', 'deductions']) if (d[f] != null && !(num(d[f]) >= 0)) return `${f} must be 0 or more`;
    if (!['pending', 'paid', undefined, null].includes(d.status)) return 'status must be pending or paid';
    return null;
  },
});
// net_pay is always derived from its parts so it can't drift from basic/allowances/deductions.
function withNetPay(handler) {
  return (req, res) => {
    const existing = req.params.id ? db.prepare('SELECT * FROM payroll WHERE id = ?').get(req.params.id) : null;
    const v = (f) => num(req.body[f] ?? existing?.[f] ?? 0);
    req.body.net_pay = Math.round((v('basic') + v('allowances') - v('deductions')) * 100) / 100;
    if (req.body.status === 'paid' && !req.body.paid_on && !existing?.paid_on) req.body.paid_on = localToday();
    return handler(req, res);
  };
}
// Nobody but a Super Admin edits their own salary slip, even with full payroll access.
function notOwnSlip(handler) {
  return (req, res) => {
    if ((req.user.base_role || req.user.role) !== 'admin' && req.user.linked_id != null) {
      const row = req.params.id ? db.prepare('SELECT teacher_id FROM payroll WHERE id = ?').get(req.params.id) : null;
      if ([row?.teacher_id, req.body?.teacher_id].some(t => t != null && Number(t) === req.user.linked_id)) {
        return res.status(403).json({ error: 'You cannot change your own salary slip' });
      }
    }
    return handler(req, res);
  };
}
exports.payroll = { ...payrollCrud, create: notOwnSlip(withNetPay(payrollCrud.create)), update: notOwnSlip(withNetPay(payrollCrud.update)),
  remove: notOwnSlip(payrollCrud.remove) };

// Teacher-level staff may change or delete only what they posted themselves; full-access staff and the Super Admin
// may change anyone's. `column` holds the owner: a staff record id (`by: 'linked_id'`) or a login id (`by: 'id'`).
function owned(ctrl, table, column, by) {
  const mine = (req) => req.user[by];
  const guard = (handler) => (req, res) => {
    if (req.user.role === 'teacher') {
      const row = db.prepare(`SELECT ${column} AS owner FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.owner == null || Number(row.owner) !== Number(mine(req))) {
        return res.status(403).json({ error: 'You can only change or delete what you posted yourself' });
      }
      if (req.body) delete req.body[column];
    }
    return handler(req, res);
  };
  return {
    ...ctrl,
    create(req, res) { if (req.user.role === 'teacher' || !req.body[column]) req.body[column] = mine(req); return ctrl.create(req, res); },
    update: guard(ctrl.update),
    remove: guard(ctrl.remove),
  };
}

/* ---------- Homework ---------- */
exports.homework = owned(makeCrud({
  table: 'homework',
  fields: ['class_id','subject','title','description','due_date','teacher_id'],
  orderBy: 'assign_date DESC',
  joins: 'LEFT JOIN classes c ON c.id = homework.class_id LEFT JOIN teachers t ON t.id = homework.teacher_id',
  selectExtra: 'homework.*, c.name AS class_name, c.section AS class_section, t.full_name AS teacher_name',
}), 'homework', 'teacher_id', 'linked_id');

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
    if (!['sms', 'email', 'push'].includes(channel)) return res.status(400).json({ error: 'channel must be sms, email or push' });
    const info = db.prepare(`
      INSERT INTO communications (channel, audience, subject, body, recipient_count, sent_by) VALUES (?, ?, ?, ?, ?, ?)
    `).run(channel, audience || 'all', subject || null, body, recipient_count || 0, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  },
};

/* ---------- Documents ---------- */
const documentCrud = makeCrud({
  table: 'documents',
  fields: ['title','category','url','audience','uploaded_by'],
  orderBy: 'uploaded_at DESC',
  validate: (d) => badUrl(d.url, 'url'),
});
exports.documents = {
  ...owned(documentCrud, 'documents', 'uploaded_by', 'id'),
  list(req, res) {
    if (req.user.role === 'admin') return documentCrud.list(req, res);
    res.json(db.prepare("SELECT * FROM documents WHERE COALESCE(audience, 'all') IN ('all', ?) ORDER BY uploaded_at DESC").all(req.user.role));
  },
  get(req, res) {
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    const visible = row && (req.user.role === 'admin' || ['all', req.user.role].includes(row.audience || 'all'));
    if (!visible) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  },
};

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
    const problem = badUrl(req.body.website, 'website') || badUrl(req.body.logo_url, 'logo_url');
    if (problem) return res.status(400).json({ error: problem });
    db.prepare(`UPDATE school_settings SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
    res.json({ ok: true });
  },
};

/* ---------- Users (admin-managed) ---------- */
const bcrypt = require('bcryptjs');
const USER_ROLES = ['admin', 'teacher', 'student', 'parent'];
// Students/parents must point at a real student, teachers at a real teacher; that link drives data access.
function checkLink(role, linkedId) {
  if (role === 'admin') return null;
  if (!linkedId) return `A ${role} account must be linked to a ${role === 'teacher' ? 'teacher' : 'student'} record`;
  const table = role === 'teacher' ? 'teachers' : 'students';
  return db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(linkedId) ? null : `No ${table.slice(0, -1)} with id ${linkedId}`;
}
const staffRoles = require('../utils/roles');
// Only a Super Admin may create, reset or disable Super Admin accounts, so other roles can't promote themselves.
const touchesSuperAdmin = (req, targetId) =>
  req.user.base_role !== 'admin' && db.prepare("SELECT role FROM users WHERE id = ?").get(targetId)?.role === 'admin';
// Below Super Admin, user managers can't create, assign, reset or disable a staff login whose role has more access
// than their own: otherwise an IT head could become a principal by making (or taking over) a principal login.
const { exceedsPerms } = require('../utils/permissions');
const roleBeyondMine = (req, roleKey) =>
  (req.user.base_role !== 'admin' && roleKey ? exceedsPerms(staffRoles.get(roleKey)?.perms, req.user.perms, staffRoles.get(roleKey)?.actions, req.user.actions) : null);
const userBeyondMine = (req, targetId) => {
  const u = db.prepare('SELECT role, role_key FROM users WHERE id = ?').get(targetId);
  return u?.role === 'teacher' ? roleBeyondMine(req, u.role_key || 'teacher') : null;
};

const oldStaff = () => db.prepare(`SELECT u.id, u.username, u.full_name, u.last_login_at, t.employee_no, t.official_email
  FROM users u LEFT JOIN teachers t ON t.id = u.linked_id
  WHERE u.role = 'teacher' AND u.username NOT LIKE '%_@_%._%' ORDER BY u.username`).all();

exports.users = {
  list(req, res) {
    const rows = db.prepare('SELECT id, username, role, role_key, full_name, email, phone, linked_id, active, last_login_at FROM users ORDER BY id').all();
    res.json(rows.map(u => ({ ...u, role_name: u.role === 'admin' ? 'Super Admin' : u.role === 'teacher' ? (staffRoles.get(u.role_key || 'teacher')?.name || u.role_key) : u.role === 'student' ? 'Student' : 'Parent' })));
  },
  create(req, res) {
    const { username, password, role, full_name, email, phone, linked_id } = req.body;
    const roleKey = role === 'teacher' ? (req.body.role_key || 'teacher') : null;
    if (!username || !password || !role || !full_name) return res.status(400).json({ error: 'username, password, role, full_name required' });
    if (!USER_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${USER_ROLES.join(', ')}` });
    if (role === 'admin' && req.user.base_role !== 'admin') return res.status(403).json({ error: 'Only a Super Admin can create Super Admin accounts' });
    if (roleKey && !staffRoles.get(roleKey)) return res.status(400).json({ error: `Unknown staff role ${roleKey}` });
    const over = roleBeyondMine(req, roleKey);
    if (over) return res.status(403).json({ error: `You can't create a login with more access than yours (${over}); ask a Super Admin` });
    if (String(password).length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    const linkProblem = checkLink(role, linked_id);
    if (linkProblem) return res.status(400).json({ error: linkProblem });
    // Sign-in ignores case, so two usernames differing only in case would be the same login.
    if (role !== 'teacher' && db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(String(username).trim())) {
      return res.status(409).json({ error: 'That username is already used (usernames are not case-sensitive)' });
    }
    // A staff login's username is the official email on their staff record (never the personal one).
    let uname = String(username).trim();
    if (role === 'teacher') {
      const t = db.prepare('SELECT official_email FROM teachers WHERE id = ?').get(linked_id);
      if (!isEmail(t?.official_email)) return res.status(400).json({ error: 'Add the official email on the staff record first; it becomes their username' });
      uname = usernameFor(t.official_email);
    }
    try {
      const info = db.prepare(`
        INSERT INTO users (username, password_hash, role, role_key, full_name, email, phone, linked_id, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(uname, bcrypt.hashSync(password, 10), role, roleKey, full_name, email || (role === 'teacher' ? uname : null), phone || null, linked_id || null);
      res.status(201).json({ id: info.lastInsertRowid, username: uname });
    } catch (e) { dbError(res, e); }
  },
  // Removes a login. Records made by it (receipts, approvals, posts) stay; they just lose the name of who did it.
  remove(req, res) {
    const u = db.prepare('SELECT id, role, username FROM users WHERE id = ?').get(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.id === req.user.id) return res.status(400).json({ error: "You can't delete your own login" });
    if (touchesSuperAdmin(req, u.id)) return res.status(403).json({ error: 'Only a Super Admin can change a Super Admin account' });
    if (userBeyondMine(req, u.id)) return res.status(403).json({ error: 'This login has more access than yours; ask a Super Admin' });
    if (u.role === 'admin' && db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get().c <= 1) {
      return res.status(400).json({ error: "The last Super Admin can't be deleted" });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    res.json({ ok: true, deleted: u.username });
  },
  // Staff logins made by hand before usernames were official emails (username isn't an email address).
  oldStaffLogins(req, res) {
    res.json(oldStaff());
  },
  removeOldStaffLogins(req, res) {
    const deleted = [], kept = [];
    for (const u of oldStaff()) {
      if (u.id === req.user.id || userBeyondMine(req, u.id)) { kept.push({ username: u.username, reason: u.id === req.user.id ? 'your own login' : 'more access than yours' }); continue; }
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      deleted.push(u.username);
    }
    res.json({ deleted, kept });
  },
  // Logins for every active staff member who has an official email but no login yet.
  staffLogins(req, res) {
    const created = [], skipped = [];
    const staff = db.prepare(`SELECT t.id, t.full_name, t.employee_no FROM teachers t
      WHERE COALESCE(t.status, 'active') = 'active' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role = 'teacher' AND u.linked_id = t.id)
      ORDER BY t.full_name`).all();
    for (const t of staff) {
      if (roleBeyondMine(req, 'teacher')) { skipped.push({ name: t.full_name, employee_no: t.employee_no, reason: 'Ask a Super Admin' }); continue; }
      const r = ensureStaffLogin(t.id);
      if (r.created) created.push({ ...r.created, employee_no: t.employee_no });
      else skipped.push({ name: t.full_name, employee_no: t.employee_no, reason: r.skipped || 'Has a login' });
    }
    res.json({ created, skipped });
  },
  setRole(req, res) {
    const u = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.role !== 'teacher') return res.status(400).json({ error: 'Only staff logins have a staff role' });
    if (u.id === req.user.id && req.user.base_role !== 'admin') return res.status(403).json({ error: "You can't change your own role; ask a Super Admin" });
    const key = req.body.role_key;
    if (!staffRoles.get(key)) return res.status(400).json({ error: 'Unknown staff role' });
    const over = userBeyondMine(req, u.id) || roleBeyondMine(req, key);
    if (over) return res.status(403).json({ error: `You can't manage logins with more access than yours (${over}); ask a Super Admin` });
    db.prepare('UPDATE users SET role_key = ? WHERE id = ?').run(key, u.id);
    res.json({ ok: true });
  },
  setActive(req, res) {
    if (Number(req.params.id) === req.user.id && !req.body.active) return res.status(400).json({ error: 'You cannot deactivate your own account' });
    if (touchesSuperAdmin(req, req.params.id)) return res.status(403).json({ error: 'Only a Super Admin can change a Super Admin account' });
    if (userBeyondMine(req, req.params.id)) return res.status(403).json({ error: 'This login has more access than yours; ask a Super Admin' });
    const info = db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
  resetPassword(req, res) {
    const { password } = req.body;
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    if (touchesSuperAdmin(req, req.params.id)) return res.status(403).json({ error: 'Only a Super Admin can change a Super Admin account' });
    if (userBeyondMine(req, req.params.id)) return res.status(403).json({ error: 'This login has more access than yours; ask a Super Admin' });
    const info = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
};

/* ---------- Reports (summary) ---------- */
exports.reports = (req, res) => {
  const today = localToday();
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

/* ---------- Calendar, Surveys, Activities, Prospectus, Awards, Suggestions, Incidents ---------- */
exports.events = makeCrud({
  table: 'events',
  fields: ['event_date','type','name','description','attachment'],
  orderBy: 'event_date DESC',
  validate: (d) => (!isDate(d.event_date) ? 'event_date must be YYYY-MM-DD' : !d.name ? 'name is required' : badUrl(d.attachment, 'attachment')),
});

const surveyCrud = makeCrud({
  table: 'surveys',
  fields: ['class_id','section','question','option1','option2','option3','option4','expire_date','created_by'],
  orderBy: 'created_at DESC',
  joins: 'LEFT JOIN classes c ON c.id = surveys.class_id',
  selectExtra: 'surveys.*, c.name AS class_name, c.section AS class_section',
  validate: (d) => (!d.question || !d.option1 || !d.option2 ? 'question, option1 and option2 are required'
    : !isDate(d.expire_date) ? 'expire_date must be YYYY-MM-DD' : null),
});
exports.surveys = owned(surveyCrud, 'surveys', 'created_by', 'id');

try { db.exec('ALTER TABLE activities ADD COLUMN created_by INTEGER'); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
exports.activities = owned(makeCrud({
  table: 'activities',
  fields: ['class_id','section','name','activity_date','description','file_names','created_by'],
  orderBy: 'activity_date DESC',
  joins: 'LEFT JOIN classes c ON c.id = activities.class_id',
  selectExtra: 'activities.*, c.name AS class_name, c.section AS class_section',
  validate: (d) => (!d.name ? 'name is required' : !isDate(d.activity_date) ? 'activity_date must be YYYY-MM-DD' : null),
}), 'activities', 'created_by', 'id');

const PROSPECTUS_START = process.env.PROSPECTUS_START || 'UE/26-27/207';
// Settings saved on Student Prospectus Settings (stu_settings, created by the students module).
function prospectusSettings() {
  try { return Object.fromEntries(db.prepare('SELECT key, value FROM stu_settings').all().map(r => [r.key, r.value])); }
  catch { return {}; }
}
function nextProspectusNo() {
  const start = prospectusSettings().prospectus_start || PROSPECTUS_START;
  // Continue the series that matches the configured prefix, so changing the prefix (e.g. a new session) starts afresh.
  const prefix = (start.match(/^(.*?)(\d+)$/) || [null, start])[1];
  const last = db.prepare("SELECT prospectus_no FROM prospectus WHERE prospectus_no LIKE ? || '%' ORDER BY id DESC LIMIT 1").get(prefix)?.prospectus_no;
  if (!last) return start;
  const m = last.match(/^(.*?)(\d+)$/);
  return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : `${last}-1`;
}
const prospectusCrud = makeCrud({
  table: 'prospectus',
  fields: ['prospectus_no','session','date','class_id','first_name','last_name','father_name','mother_name','phone','alt_number',
    'email','gender','dob','last_school','prev_marks','prospectus_char','prospectus_amount','payment_mode','bank_charges',
    'total_amount','address','remarks'],
  orderBy: 'id DESC',
  joins: 'LEFT JOIN classes c ON c.id = prospectus.class_id',
  selectExtra: 'prospectus.*, c.name AS class_name, c.section AS class_section',
  validate: (d) => {
    if (!d.first_name) return 'first_name is required';
    if (d.gender && !['M', 'F', 'O'].includes(d.gender)) return 'gender must be M, F or O';
    for (const f of ['prospectus_amount', 'bank_charges']) if (d[f] != null && !(num(d[f]) >= 0)) return `${f} must be 0 or more`;
    return null;
  },
});
exports.prospectus = {
  ...prospectusCrud,
  nextNo(req, res) { res.json({ prospectus_no: nextProspectusNo() }); },
  create(req, res) {
    // Number and total are assigned here so two desks saving at once can't collide or mis-total.
    req.body.prospectus_no = nextProspectusNo();
    if (req.body.prospectus_amount == null || req.body.prospectus_amount === '') req.body.prospectus_amount = num(prospectusSettings().prospectus_fee || 0) || 0;
    req.body.total_amount = num(req.body.prospectus_amount || 0) + num(req.body.bank_charges || 0);
    return prospectusCrud.create(req, res);
  },
};

exports.awards = makeCrud({
  table: 'awards',
  fields: ['recipient','recipient_type','title','award_date','session','description'],
  orderBy: 'award_date DESC',
  validate: (d) => (!d.recipient || !d.title ? 'recipient and title are required' : null),
});

const suggestionCrud = makeCrud({
  table: 'suggestions',
  fields: ['subject','body','status'],
  orderBy: 'created_at DESC',
  validate: (d) => (!d.subject || !d.body ? 'subject and body are required' : null),
});
exports.suggestions = {
  ...suggestionCrud,
  // Anyone may drop a suggestion; it is stored without the sender's identity.
  create(req, res) { delete req.body.status; return suggestionCrud.create(req, res); },
};

exports.incidents = makeCrud({
  table: 'incidents',
  fields: ['incident_date','reported_by','location','description','action_taken','status','category','purpose','student_id'],
  orderBy: 'incident_date DESC',
  validate: (d) => (!isDate(d.incident_date) ? 'incident_date must be YYYY-MM-DD' : !d.description ? 'description is required' : null),
});
