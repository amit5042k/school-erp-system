require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

function hash(p) { return bcrypt.hashSync(p, 10); }

const tx = db.transaction(() => {
  // Wipe (dev only)
  const del = (sql) => { try { db.exec(sql); } catch (_) {} };
  del(`DELETE FROM hostel_allotments`);
  del(`DELETE FROM hostel_rooms`);
  del(`DELETE FROM hostels`);
  del(`DELETE FROM student_transport`);
  del(`DELETE FROM routes`);
  del(`DELETE FROM vehicles`);
  del(`DELETE FROM book_issues`);
  del(`DELETE FROM books`);
  del(`DELETE FROM marks`);
  del(`DELETE FROM exam_schedule`);
  del(`DELETE FROM exams`);
  del(`DELETE FROM inventory_movements`);
  del(`DELETE FROM inventory_items`);
  del(`DELETE FROM payroll`);
  del(`DELETE FROM leave_allowances`);
  del(`DELETE FROM staff_leaves`);
  del(`DELETE FROM homework`);
  del(`DELETE FROM documents`);
  del(`DELETE FROM communications`);
  del(`DELETE FROM call_logs`);
  del(`DELETE FROM postal`);
  del(`DELETE FROM complaints`);
  del(`DELETE FROM visitors`);
  del(`DELETE FROM enquiries`);
  del(`DELETE FROM attendance`);
  del(`DELETE FROM fees`);
  del(`DELETE FROM timetable`);
  del(`DELETE FROM announcements`);
  del(`DELETE FROM students`);
  del(`DELETE FROM classes`);
  del(`DELETE FROM teachers`);
  del(`DELETE FROM users`);
  del(`DELETE FROM sqlite_sequence`);

  // Users
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, email, linked_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const adminId = insertUser.run('admin', hash('admin123'), 'admin', 'Principal Admin', 'admin@school.example', null).lastInsertRowid;

  // Teachers
  const insertTeacher = db.prepare(`
    INSERT INTO teachers (employee_no, full_name, subject, qualification, phone, email, department)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const t1 = insertTeacher.run('EMP001', 'Ritu Sharma', 'Mathematics', 'M.Sc, B.Ed', '9810000001', 'ritu@school.example', 'TEACHING').lastInsertRowid;
  const t2 = insertTeacher.run('EMP002', 'Anil Verma', 'Science', 'M.Sc, B.Ed', '9810000002', 'anil@school.example', 'TEACHING').lastInsertRowid;
  const t3 = insertTeacher.run('EMP003', 'Pooja Nair', 'English', 'M.A, B.Ed', '9810000003', 'pooja@school.example', 'TEACHING').lastInsertRowid;
  const t4 = insertTeacher.run('EMP004', 'Suresh Bansal', 'Office Admin', 'B.Com', '9810000004', 'suresh@school.example', 'ADMIN').lastInsertRowid;
  const t5 = insertTeacher.run('EMP005', 'Balwinder Singh', 'Driver', 'Class-VIII', '9810000005', null, 'TRANSPORT').lastInsertRowid;

  insertUser.run('ritu', hash('teacher123'), 'teacher', 'Ritu Sharma', 'ritu@school.example', t1);
  insertUser.run('anil', hash('teacher123'), 'teacher', 'Anil Verma', 'anil@school.example', t2);

  // Classes
  const insertClass = db.prepare(`INSERT INTO classes (name, section, class_teacher_id) VALUES (?, ?, ?)`);
  const c8A = insertClass.run('Class 8', 'A', t1).lastInsertRowid;
  const c9B = insertClass.run('Class 9', 'B', t2).lastInsertRowid;
  const c10A = insertClass.run('Class 10', 'A', t3).lastInsertRowid;

  // Students
  const insertStudent = db.prepare(`
    INSERT INTO students (admission_no, full_name, gender, dob, class_id, roll_no, father_name, mother_name, contact, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const students = [
    ['ADM2025001', 'Aarav Gupta',    'M', '2011-06-12', c8A,  1, 'Rakesh Gupta',    'Neha Gupta',     '9811100001', 'Sector 2'],
    ['ADM2025002', 'Isha Malhotra',  'F', '2011-03-22', c8A,  2, 'Sanjay Malhotra', 'Priya Malhotra', '9811100002', 'Sector 1'],
    ['ADM2025003', 'Kabir Singh',    'M', '2010-09-05', c9B,  1, 'Harpreet Singh',  'Simran Kaur',    '9811100003', 'Sector 4'],
    ['ADM2025004', 'Meera Iyer',     'F', '2010-11-14', c9B,  2, 'Ramesh Iyer',     'Lakshmi Iyer',   '9811100004', 'Sector 6'],
    ['ADM2025005', 'Rohan Das',      'M', '2009-02-18', c10A, 1, 'Tapan Das',       'Anita Das',      '9811100005', 'Sector 7'],
  ];
  const studentIds = students.map(s => insertStudent.run(...s).lastInsertRowid);

  // Student login (linked to first student)
  insertUser.run('ADM2025001', hash('student123'), 'student', 'Aarav Gupta', null, studentIds[0]);

  // Attendance — last 5 days
  const insertAtt = db.prepare(`INSERT INTO attendance (student_id, date, status) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`);
  const today = new Date();
  for (let d = 0; d < 5; d++) {
    const date = new Date(today); date.setDate(today.getDate() - d);
    const iso = date.toISOString().slice(0, 10);
    for (const sid of studentIds) {
      const status = Math.random() > 0.15 ? 'present' : 'absent';
      insertAtt.run(sid, iso, status);
    }
  }

  // Fees
  const insertFee = db.prepare(`INSERT INTO fees (student_id, term, amount, paid, status, due_date) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const sid of studentIds) {
    insertFee.run(sid, 'Term 1 2025-26', 15000, 15000, 'paid', '2025-05-15');
    insertFee.run(sid, 'Term 2 2025-26', 15000, 0, 'pending', '2025-09-15');
  }

  // Timetable — Class 8-A
  const insertTT = db.prepare(`INSERT INTO timetable (class_id, day, period, subject, teacher_id, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const subjects = [
    ['Mathematics', t1], ['Science', t2], ['English', t3], ['Social Studies', t3], ['Computer', t2],
  ];
  const timings = ['08:00-08:45','08:45-09:30','09:45-10:30','10:30-11:15','11:30-12:15'];
  for (const d of days) {
    for (let p = 0; p < 5; p++) {
      const [s, tid] = subjects[(p + days.indexOf(d)) % subjects.length];
      const [st, et] = timings[p].split('-');
      insertTT.run(c8A, d, p + 1, s, tid, st, et);
    }
  }

  // Announcements
  const insertAnn = db.prepare(`INSERT INTO announcements (title, body, audience, posted_by) VALUES (?, ?, ?, ?)`);
  insertAnn.run('Welcome to Academic Year 2025-26', 'All students and parents are welcomed to the new session. Classes commence from 1st April.', 'all', adminId);
  insertAnn.run('Annual Day Celebration', 'Annual Day will be held on 25th April at the school auditorium.', 'all', adminId);
  insertAnn.run('Parent-Teacher Meeting', 'PTM scheduled for Saturday 10:00 AM. Attendance mandatory.', 'all', adminId);

  // Enquiries
  const iE = db.prepare(`INSERT INTO enquiries (name, parent_name, phone, email, class_seeking, source, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  iE.run('Arjun Kapoor', 'Vishal Kapoor', '9811200001', 'kapoor@example.com', 'Class 6', 'walk-in', 'open');
  iE.run('Priya Seth', 'Deepak Seth', '9811200002', 'seth@example.com', 'Class 8', 'referral', 'contacted');

  // Visitors
  const iV = db.prepare(`INSERT INTO visitors (visitor_name, phone, purpose, to_meet, id_proof) VALUES (?, ?, ?, ?, ?)`);
  iV.run('Ramesh Kumar', '9999800001', 'Admission enquiry', 'Principal', 'Aadhar ****1234');
  iV.run('Suman Devi', '9999800002', 'Fee collection query', 'Accounts', 'Aadhar ****5678');

  // Complaints
  db.prepare(`INSERT INTO complaints (complainant, phone, type, description, status) VALUES (?, ?, ?, ?, ?)`)
    .run('Parent of ADM2025002', '9811100002', 'Transport', 'Bus on Route A is consistently late by 15 minutes.', 'open');

  // Postal
  const iP = db.prepare(`INSERT INTO postal (direction, reference_no, to_title, from_title, date, note) VALUES (?, ?, ?, ?, ?, ?)`);
  iP.run('dispatch', 'DSP-001', 'CBSE Regional Office', 'Principal', '2026-04-10', 'Affiliation renewal letter');
  iP.run('receive', 'RCV-017', 'School', 'District Education Office', '2026-04-12', 'Circular on board exams');

  // Call logs
  const iC = db.prepare(`INSERT INTO call_logs (caller_name, phone, direction, purpose, note) VALUES (?, ?, ?, ?, ?)`);
  iC.run('Mr. Gupta', '9811100001', 'incoming', 'Bus route query', 'Assured follow-up with transport dept.');
  iC.run('Anil Sir', '9810000002', 'outgoing', 'PTM reminder', 'Called parents of 9-B for Saturday PTM.');

  // Exams & marks
  const examId = db.prepare(`INSERT INTO exams (name, term, start_date, end_date) VALUES (?, ?, ?, ?)`)
    .run('Mid Term 2025-26', 'Term 1', '2025-08-20', '2025-08-30').lastInsertRowid;
  const iSch = db.prepare(`INSERT INTO exam_schedule (exam_id, class_id, subject, date, start_time, end_time, max_marks) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  iSch.run(examId, c8A, 'Mathematics', '2025-08-20', '09:00', '12:00', 100);
  iSch.run(examId, c8A, 'Science', '2025-08-22', '09:00', '12:00', 100);
  iSch.run(examId, c8A, 'English', '2025-08-24', '09:00', '12:00', 100);
  const iM = db.prepare(`INSERT INTO marks (exam_id, student_id, subject, marks_obtained, max_marks, grade) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const sid of studentIds.slice(0, 2)) {
    iM.run(examId, sid, 'Mathematics', 78 + Math.floor(Math.random() * 15), 100, 'A');
    iM.run(examId, sid, 'Science', 72 + Math.floor(Math.random() * 20), 100, 'A');
    iM.run(examId, sid, 'English', 80 + Math.floor(Math.random() * 10), 100, 'A+');
  }

  // Library
  const iBk = db.prepare(`INSERT INTO books (book_no, title, author, publisher, category, qty_total, qty_available, rack, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const bk1 = iBk.run('LIB-001', 'NCERT Mathematics Class 8', 'NCERT', 'NCERT', 'Textbook', 5, 5, 'R1', 120).lastInsertRowid;
  const bk2 = iBk.run('LIB-002', 'Wings of Fire', 'A.P.J. Abdul Kalam', 'Universities Press', 'Biography', 3, 3, 'R2', 350).lastInsertRowid;
  iBk.run('LIB-003', 'Panchatantra Stories', 'Vishnu Sharma', 'DK', 'Fiction', 4, 4, 'R3', 250);
  db.prepare(`INSERT INTO book_issues (book_id, student_id, due_date) VALUES (?, ?, ?)`).run(bk1, studentIds[0], '2026-05-01');
  db.prepare('UPDATE books SET qty_available = qty_available - 1 WHERE id = ?').run(bk1);

  // Transport
  const veh1 = db.prepare(`INSERT INTO vehicles (vehicle_no, model, capacity, driver_name, driver_phone, license_no) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('PB08-AB-1234', 'Tata Starbus', 40, 'Balwinder Singh', '9876500001', 'DL-PB-00012345').lastInsertRowid;
  const rt1 = db.prepare(`INSERT INTO routes (name, stops, fare, vehicle_id) VALUES (?, ?, ?, ?)`)
    .run('Route A — Model Town', 'Model Town, Adarsh Nagar, Guru Nanak Pura', 1500, veh1).lastInsertRowid;
  db.prepare(`INSERT INTO student_transport (student_id, route_id, pickup_stop) VALUES (?, ?, ?)`).run(studentIds[0], rt1, 'Model Town');

  // Hostel
  const h1 = db.prepare(`INSERT INTO hostels (name, type, warden) VALUES (?, ?, ?)`).run('Boys Hostel A', 'boys', 'Mr. Kewal Sharma').lastInsertRowid;
  const r1 = db.prepare(`INSERT INTO hostel_rooms (hostel_id, room_no, capacity, fee) VALUES (?, ?, ?, ?)`).run(h1, '101', 2, 4000).lastInsertRowid;
  db.prepare(`INSERT INTO hostel_rooms (hostel_id, room_no, capacity, fee) VALUES (?, ?, ?, ?)`).run(h1, '102', 2, 4000);
  db.prepare(`INSERT INTO hostel_allotments (student_id, room_id) VALUES (?, ?)`).run(studentIds[4], r1);

  // Inventory
  const iI = db.prepare(`INSERT INTO inventory_items (sku, name, category, unit, qty_on_hand, reorder_level, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const item1 = iI.run('STA-001', 'A4 Sheet Ream', 'Stationery', 'ream', 40, 10, 260).lastInsertRowid;
  iI.run('STA-002', 'Blue Pen', 'Stationery', 'pcs', 8, 50, 10);
  iI.run('CLN-001', 'Hand Sanitizer 500ml', 'Cleaning', 'bottle', 30, 10, 120);
  db.prepare(`INSERT INTO inventory_movements (item_id, movement_type, qty, reference) VALUES (?, ?, ?, ?)`).run(item1, 'purchase', 40, 'PO-2025-001');

  // HR — Leave allowances (per teacher per session)
  const SESSION = '2026-2027';
  const LEAVE_TYPES = [
    'Casual Leave','Casual Leave Jan_June','Casual Leave July_Dec','Compensatory Casual leave',
    'Earned Leave','Leave without Pay','Medical Leave','On Duty',
  ];
  const DEFAULT_ALLOWED = {
    'Casual Leave': 12, 'Casual Leave Jan_June': 6, 'Casual Leave July_Dec': 6,
    'Compensatory Casual leave': 0, 'Earned Leave': 10, 'Leave without Pay': 0,
    'Medical Leave': 15, 'On Duty': 0,
  };
  const iLA = db.prepare(`INSERT INTO leave_allowances (teacher_id, session, leave_type, allowed) VALUES (?, ?, ?, ?)`);
  for (const tid of [t1, t2, t3, t4, t5]) {
    for (const lt of LEAVE_TYPES) iLA.run(tid, SESSION, lt, DEFAULT_ALLOWED[lt]);
  }

  // Sample pending & approved leaves
  const iL = db.prepare(`
    INSERT INTO staff_leaves (teacher_id, leave_type, from_date, to_date, reason, session, status, applied_on)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  iL.run(t1, 'Casual Leave',    '2026-04-22', '2026-04-23', 'Personal work',           SESSION, 'pending');
  iL.run(t2, 'Medical Leave',   '2026-04-15', '2026-04-17', 'Viral fever — medical',   SESSION, 'pending');
  iL.run(t3, 'Earned Leave',    '2026-05-02', '2026-05-05', 'Family function out of station', SESSION, 'pending');
  iL.run(t4, 'On Duty',         '2026-04-20', '2026-04-20', 'CBSE workshop Chandigarh',SESSION, 'pending');
  // one approved for balance demo
  const approvedInsert = db.prepare(`
    INSERT INTO staff_leaves (teacher_id, leave_type, from_date, to_date, reason, session, status, approved_from, approved_to, remarks)
    VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
  `);
  approvedInsert.run(t1, 'Casual Leave', '2026-04-05', '2026-04-06', 'Family event', SESSION, '2026-04-05', '2026-04-06', 'Approved by Principal');

  db.prepare(`INSERT INTO payroll (teacher_id, month, basic, allowances, deductions, net_pay, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(t1, '2026-03', 45000, 8000, 3000, 50000, 'paid');

  // Homework
  db.prepare(`INSERT INTO homework (class_id, subject, title, description, due_date, teacher_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(c8A, 'Mathematics', 'Algebra worksheet', 'Complete exercises 3.1 to 3.4 from NCERT.', '2026-04-25', t1);

  // Communications
  db.prepare(`INSERT INTO communications (channel, audience, subject, body, recipient_count, sent_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('sms', 'parent', 'PTM Reminder', 'Dear Parent, PTM on Saturday 10:00 AM. - School Office', 120, adminId);

  // Documents
  db.prepare(`INSERT INTO documents (title, category, url, audience, uploaded_by) VALUES (?, ?, ?, ?, ?)`)
    .run('Annual Calendar 2025-26', 'circular', 'https://example.org/calendar.pdf', 'all', adminId);
});

tx();
console.log('Seeded successfully.');
console.log('\nDemo credentials:');
console.log('  Admin   → admin / admin123');
console.log('  Teacher → ritu / teacher123');
console.log('  Student → ADM2025001 / student123');
