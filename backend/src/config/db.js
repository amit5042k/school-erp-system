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
      department TEXT,
      photo_url TEXT,
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

    /* -------- Admissions / Enquiries -------- */
    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_name TEXT,
      phone TEXT,
      email TEXT,
      class_seeking TEXT,
      source TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','contacted','converted','closed')),
      follow_up_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /* -------- Front Office -------- */
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_name TEXT NOT NULL,
      phone TEXT,
      purpose TEXT,
      to_meet TEXT,
      in_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      out_time TEXT,
      id_proof TEXT,
      remarks TEXT
    );
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complainant TEXT NOT NULL,
      phone TEXT,
      type TEXT,
      description TEXT NOT NULL,
      action_taken TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS postal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK (direction IN ('dispatch','receive')),
      reference_no TEXT,
      to_title TEXT,
      from_title TEXT,
      date TEXT NOT NULL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_name TEXT,
      phone TEXT,
      direction TEXT CHECK (direction IN ('incoming','outgoing')),
      purpose TEXT,
      note TEXT,
      call_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /* -------- Examinations -------- */
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      term TEXT,
      start_date TEXT,
      end_date TEXT
    );
    CREATE TABLE IF NOT EXISTS exam_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      date TEXT,
      start_time TEXT,
      end_time TEXT,
      max_marks REAL NOT NULL DEFAULT 100,
      FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
      FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      marks_obtained REAL NOT NULL,
      max_marks REAL NOT NULL DEFAULT 100,
      grade TEXT,
      UNIQUE(exam_id, student_id, subject),
      FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    /* -------- Library -------- */
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      publisher TEXT,
      category TEXT,
      qty_total INTEGER NOT NULL DEFAULT 1,
      qty_available INTEGER NOT NULL DEFAULT 1,
      rack TEXT,
      price REAL
    );
    CREATE TABLE IF NOT EXISTS book_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      student_id INTEGER,
      teacher_id INTEGER,
      issue_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      due_date TEXT,
      return_date TEXT,
      fine REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','returned','lost')),
      FOREIGN KEY(book_id) REFERENCES books(id),
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    );

    /* -------- Transport -------- */
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_no TEXT UNIQUE NOT NULL,
      model TEXT,
      capacity INTEGER,
      driver_name TEXT,
      driver_phone TEXT,
      license_no TEXT
    );
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      stops TEXT,
      fare REAL,
      vehicle_id INTEGER,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );
    CREATE TABLE IF NOT EXISTS student_transport (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER UNIQUE NOT NULL,
      route_id INTEGER NOT NULL,
      pickup_stop TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(route_id) REFERENCES routes(id)
    );

    /* -------- Hostel -------- */
    CREATE TABLE IF NOT EXISTS hostels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT CHECK (type IN ('boys','girls','staff')),
      warden TEXT
    );
    CREATE TABLE IF NOT EXISTS hostel_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hostel_id INTEGER NOT NULL,
      room_no TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 2,
      fee REAL,
      UNIQUE(hostel_id, room_no),
      FOREIGN KEY(hostel_id) REFERENCES hostels(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS hostel_allotments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      allotted_on TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      vacated_on TEXT,
      UNIQUE(student_id, room_id),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(room_id) REFERENCES hostel_rooms(id)
    );

    /* -------- Inventory -------- */
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT,
      qty_on_hand INTEGER NOT NULL DEFAULT 0,
      reorder_level INTEGER DEFAULT 0,
      unit_price REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','issue','adjust')),
      qty INTEGER NOT NULL,
      reference TEXT,
      note TEXT,
      moved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(item_id) REFERENCES inventory_items(id)
    );

    /* -------- HR -------- */
    CREATE TABLE IF NOT EXISTS staff_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      leave_type TEXT,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      reason TEXT,
      attachment TEXT,
      session TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
      approved_from TEXT,
      approved_to TEXT,
      remarks TEXT,
      decided_by INTEGER,
      decided_at TEXT,
      applied_on TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS leave_allowances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      session TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      allowed REAL NOT NULL DEFAULT 0,
      UNIQUE(teacher_id, session, leave_type),
      FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      basic REAL NOT NULL DEFAULT 0,
      allowances REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0,
      net_pay REAL NOT NULL DEFAULT 0,
      paid_on TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
      UNIQUE(teacher_id, month),
      FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    );

    /* -------- Homework -------- */
    CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assign_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      due_date TEXT,
      teacher_id INTEGER,
      FOREIGN KEY(class_id) REFERENCES classes(id),
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    );

    /* -------- Communication log -------- */
    CREATE TABLE IF NOT EXISTS communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL CHECK (channel IN ('sms','email','push')),
      audience TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      recipient_count INTEGER DEFAULT 0,
      sent_by INTEGER,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /* -------- Documents / Downloads -------- */
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      url TEXT,
      audience TEXT DEFAULT 'all',
      uploaded_by INTEGER,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /* -------- Settings -------- */
    CREATE TABLE IF NOT EXISTS school_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      school_name TEXT NOT NULL DEFAULT 'MGN Public School, Jalandhar',
      address TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      academic_year TEXT DEFAULT '2025-26',
      logo_url TEXT
    );
    INSERT OR IGNORE INTO school_settings (id, school_name, address, phone, email, website, academic_year)
    VALUES (1, 'MGN Public School, Jalandhar', 'Urban Estate Phase-II, Jalandhar', '+91-181-0000000', 'office@mgnjalandhar.edu', 'https://edusecure.org/mgnjalandhar', '2025-26');
  `);

  // Additive migrations for pre-existing databases (SQLite has no ADD COLUMN IF NOT EXISTS)
  const tryAlter = (sql) => { try { db.exec(sql); } catch (_) { /* already exists */ } };
  tryAlter(`ALTER TABLE staff_leaves ADD COLUMN attachment TEXT`);
  tryAlter(`ALTER TABLE staff_leaves ADD COLUMN session TEXT`);
  tryAlter(`ALTER TABLE staff_leaves ADD COLUMN approved_from TEXT`);
  tryAlter(`ALTER TABLE staff_leaves ADD COLUMN approved_to TEXT`);
  tryAlter(`ALTER TABLE staff_leaves ADD COLUMN remarks TEXT`);
  tryAlter(`ALTER TABLE staff_leaves ADD COLUMN decided_by INTEGER`);
  tryAlter(`ALTER TABLE staff_leaves ADD COLUMN decided_at TEXT`);
  tryAlter(`ALTER TABLE teachers ADD COLUMN department TEXT`);
  tryAlter(`ALTER TABLE teachers ADD COLUMN photo_url TEXT`);
}

init();

module.exports = db;
