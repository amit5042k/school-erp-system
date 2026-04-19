require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

function hash(p) { return bcrypt.hashSync(p, 10); }

const tx = db.transaction(() => {
  // Wipe (dev only)
  db.exec(`
    DELETE FROM attendance;
    DELETE FROM fees;
    DELETE FROM timetable;
    DELETE FROM announcements;
    DELETE FROM students;
    DELETE FROM classes;
    DELETE FROM teachers;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);

  // Users
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, email, linked_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const adminId = insertUser.run('admin', hash('admin123'), 'admin', 'Principal Admin', 'admin@mgnurban.edu', null).lastInsertRowid;

  // Teachers
  const insertTeacher = db.prepare(`
    INSERT INTO teachers (employee_no, full_name, subject, qualification, phone, email)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const t1 = insertTeacher.run('EMP001', 'Ritu Sharma', 'Mathematics', 'M.Sc, B.Ed', '9810000001', 'ritu@mgnurban.edu').lastInsertRowid;
  const t2 = insertTeacher.run('EMP002', 'Anil Verma', 'Science', 'M.Sc, B.Ed', '9810000002', 'anil@mgnurban.edu').lastInsertRowid;
  const t3 = insertTeacher.run('EMP003', 'Pooja Nair', 'English', 'M.A, B.Ed', '9810000003', 'pooja@mgnurban.edu').lastInsertRowid;

  insertUser.run('ritu', hash('teacher123'), 'teacher', 'Ritu Sharma', 'ritu@mgnurban.edu', t1);
  insertUser.run('anil', hash('teacher123'), 'teacher', 'Anil Verma', 'anil@mgnurban.edu', t2);

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
    ['ADM2025001', 'Aarav Gupta', 'M', '2011-06-12', c8A, 1, 'Rakesh Gupta', 'Neha Gupta', '9811100001', 'Urban Estate, Phase 2'],
    ['ADM2025002', 'Isha Malhotra', 'F', '2011-03-22', c8A, 2, 'Sanjay Malhotra', 'Priya Malhotra', '9811100002', 'Urban Estate, Phase 1'],
    ['ADM2025003', 'Kabir Singh', 'M', '2010-09-05', c9B, 1, 'Harpreet Singh', 'Simran Kaur', '9811100003', 'Sector 4, Urban Estate'],
    ['ADM2025004', 'Meera Iyer', 'F', '2010-11-14', c9B, 2, 'Ramesh Iyer', 'Lakshmi Iyer', '9811100004', 'Sector 6, Urban Estate'],
    ['ADM2025005', 'Rohan Das', 'M', '2009-02-18', c10A, 1, 'Tapan Das', 'Anita Das', '9811100005', 'Sector 7, Urban Estate'],
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
  insertAnn.run('Annual Day Celebration', 'MGN Urban Estate Annual Day will be held on 25th April at the school auditorium.', 'all', adminId);
  insertAnn.run('Parent-Teacher Meeting', 'PTM scheduled for Saturday 10:00 AM. Attendance mandatory.', 'all', adminId);
});

tx();
console.log('Seeded successfully.');
console.log('\nDemo credentials:');
console.log('  Admin   → admin / admin123');
console.log('  Teacher → ritu / teacher123');
console.log('  Student → ADM2025001 / student123');
