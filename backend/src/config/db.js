const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'school.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','teacher','student','parent')),
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      linked_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      section TEXT NOT NULL,
      class_teacher_id INTEGER,
      UNIQUE(name, section)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_no TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      gender TEXT,
      dob TEXT,
      class_id INTEGER,
      roll_no INTEGER,
      father_name TEXT,
      mother_name TEXT,
      contact TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_no TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      subject TEXT,
      qualification TEXT,
      phone TEXT,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present','absent','late','leave')),
      remarks TEXT,
      UNIQUE(student_id, date),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      amount REAL NOT NULL,
      paid REAL NOT NULL DEFAULT 0,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','partial','overdue')),
      paid_on TEXT,
      receipt_no TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      period INTEGER NOT NULL,
      subject TEXT NOT NULL,
      teacher_id INTEGER,
      start_time TEXT,
      end_time TEXT,
      FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'all',
      posted_by INTEGER,
      posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

init();

module.exports = db;
