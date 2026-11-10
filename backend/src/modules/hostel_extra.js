// Hostel operations: daily roll call, mess menu and meal counts, monthly mess fees, visitor log and out-passes.
const { db, ROLES, auth, role, safe, isStaff, isDate, today, num, currentSession, registerReport } = require('./_kit');
const { familyUserIds } = require('../utils/family');
const { roleInArea } = require('../utils/permissions');

db.exec(`
  CREATE TABLE IF NOT EXISTS hx_roll_call (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    session TEXT NOT NULL DEFAULT 'night' CHECK (session IN ('morning','evening','night')),
    hostel_id INTEGER NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present','absent','leave','late')),
    remarks TEXT,
    marked_by INTEGER,
    marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, session, student_id)
  );
  CREATE TABLE IF NOT EXISTS hx_menu (
    hostel_id INTEGER NOT NULL DEFAULT 0,
    day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
    meal TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','snacks','dinner')),
    items TEXT NOT NULL,
    PRIMARY KEY (hostel_id, day, meal)
  );
  CREATE TABLE IF NOT EXISTS hx_meal_counts (
    date TEXT NOT NULL,
    hostel_id INTEGER NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    meal TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','snacks','dinner')),
    count INTEGER NOT NULL CHECK (count >= 0),
    remarks TEXT,
    PRIMARY KEY (date, hostel_id, meal)
  );
  CREATE TABLE IF NOT EXISTS hx_mess_fees (
    hostel_id INTEGER PRIMARY KEY REFERENCES hostels(id) ON DELETE CASCADE,
    monthly_fee REAL NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
    due_day INTEGER NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28)
  );
  CREATE TABLE IF NOT EXISTS hx_visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostel_id INTEGER NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    visitor_name TEXT NOT NULL,
    relation TEXT,
    phone TEXT,
    id_proof TEXT,
    purpose TEXT,
    in_time TEXT NOT NULL,
    out_time TEXT,
    logged_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS hx_outpasses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    hostel_id INTEGER REFERENCES hostels(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    destination TEXT,
    escort TEXT,
    out_at TEXT NOT NULL,
    expected_return_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested'
      CHECK (status IN ('requested','approved','rejected','out','returned','cancelled')),
    actual_out_at TEXT,
    actual_return_at TEXT,
    remarks TEXT,
    requested_by INTEGER,
    decided_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS ix_hx_outpass_status ON hx_outpasses(status, expected_return_at);
`);

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const SESSIONS = ['morning', 'evening', 'night'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const err = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const text = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max) || null;
const validTime = (v) => Number.isFinite(Date.parse(v));

// Students currently living in a hostel (active allotment), with their room.
function residents(hostelId) {
  return db.prepare(`
    SELECT s.id AS student_id, s.full_name, s.admission_no, s.contact, r.room_no, r.hostel_id, h.name AS hostel_name,
      c.name || ' ' || c.section AS class
    FROM hostel_allotments a JOIN hostel_rooms r ON r.id = a.room_id JOIN hostels h ON h.id = r.hostel_id
    JOIN students s ON s.id = a.student_id LEFT JOIN classes c ON c.id = s.class_id
    WHERE a.vacated_on IS NULL AND (? = 0 OR r.hostel_id = ?)
    ORDER BY r.room_no, s.full_name`).all(hostelId || 0, hostelId || 0);
}
const residentOf = (studentId) => db.prepare(`
  SELECT r.hostel_id, r.room_no, h.name AS hostel_name FROM hostel_allotments a JOIN hostel_rooms r ON r.id = a.room_id
  JOIN hostels h ON h.id = r.hostel_id WHERE a.student_id = ? AND a.vacated_on IS NULL`).get(studentId);
const familyUsers = (studentId) => familyUserIds([studentId]);
function notify(userIds, title, body, link) {
  try { require('./push').notify(userIds, { title, body, link, kind: 'hostel' }).catch(() => {}); } catch (_) { /* optional */ }
}
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: process.env.TZ || 'Asia/Kolkata' });

/* ---------- Roll call ---------- */
const roll = {
  sheet(req, res) {
    const date = req.query.date || today();
    const session = req.query.session || 'night';
    const hostelId = Number(req.query.hostel_id) || 0;
    if (!isDate(date)) throw err(400, 'date must be YYYY-MM-DD');
    if (!SESSIONS.includes(session)) throw err(400, 'session must be morning, evening or night');
    if (!hostelId) throw err(400, 'Choose a hostel');
    const marked = new Map(db.prepare('SELECT * FROM hx_roll_call WHERE date = ? AND session = ? AND hostel_id = ?').all(date, session, hostelId).map(r => [r.student_id, r]));
    // Students on an out-pass that covers this day default to Leave.
    const away = new Set(db.prepare(`SELECT student_id FROM hx_outpasses WHERE status IN ('approved','out')
      AND date(out_at, 'localtime') <= ? AND date(expected_return_at, 'localtime') >= ?`).all(date, date).map(r => r.student_id));
    const rows = residents(hostelId).map(s => {
      const m = marked.get(s.student_id);
      return { ...s, status: m?.status || null, remarks: m?.remarks || null, suggested: away.has(s.student_id) ? 'leave' : 'present', on_outpass: away.has(s.student_id) };
    });
    res.json({ date, session, hostel_id: hostelId, marked: marked.size > 0, rows });
  },
  save(req, res) {
    const { date, session = 'night', hostel_id: hostelId, records } = req.body || {};
    if (!isDate(date)) throw err(400, 'date must be YYYY-MM-DD');
    if (date > today()) throw err(400, 'Roll call cannot be marked for a future date');
    if (!SESSIONS.includes(session)) throw err(400, 'session must be morning, evening or night');
    if (!Array.isArray(records) || !records.length) throw err(400, 'No students to mark');
    const living = new Set(residents(Number(hostelId)).map(r => r.student_id));
    for (const r of records) {
      if (!living.has(Number(r.student_id))) throw err(400, `Student ${r.student_id} does not live in this hostel`);
      if (!['present', 'absent', 'leave', 'late'].includes(r.status)) throw err(400, 'status must be present, absent, leave or late');
    }
    const up = db.prepare(`INSERT INTO hx_roll_call (date, session, hostel_id, student_id, status, remarks, marked_by, marked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(date, session, student_id) DO UPDATE SET status = excluded.status,
      remarks = excluded.remarks, hostel_id = excluded.hostel_id, marked_by = excluded.marked_by, marked_at = excluded.marked_at`);
    const before = new Map(db.prepare('SELECT student_id, status FROM hx_roll_call WHERE date = ? AND session = ?').all(date, session).map(r => [r.student_id, r.status]));
    db.transaction(() => { for (const r of records) up.run(date, session, Number(hostelId), Number(r.student_id), r.status, text(r.remarks), req.user.id, nowIso()); })();
    // Tell the family once when a boarder is missing at roll call.
    for (const r of records) {
      if (r.status === 'absent' && before.get(Number(r.student_id)) !== 'absent') {
        const s = db.prepare('SELECT full_name FROM students WHERE id = ?').get(r.student_id);
        notify(familyUsers(Number(r.student_id)), 'Hostel roll call', `${s?.full_name || 'Your child'} was absent at the ${session} roll call on ${date}.`, '/hostel/my');
      }
    }
    res.json({ ok: true, saved: records.length });
  },
};

/* ---------- Mess ---------- */
const mess = {
  menu(req, res) {
    const hostelId = Number(req.query.hostel_id) || 0;
    const rows = db.prepare('SELECT * FROM hx_menu WHERE hostel_id IN (0, ?) ORDER BY day').all(hostelId);
    // A hostel's own entry wins over the common menu.
    const grid = DAYS.map((name, day) => {
      const cell = {};
      for (const meal of MEALS) {
        const own = rows.find(r => r.hostel_id === hostelId && hostelId && r.day === day && r.meal === meal);
        const common = rows.find(r => r.hostel_id === 0 && r.day === day && r.meal === meal);
        cell[meal] = (own || common)?.items || '';
      }
      return { day, name, ...cell };
    });
    res.json({ hostel_id: hostelId, meals: MEALS, days: grid });
  },
  saveMenu(req, res) {
    const hostelId = Number(req.body.hostel_id) || 0;
    if (hostelId && !db.prepare('SELECT 1 FROM hostels WHERE id = ?').get(hostelId)) throw err(400, 'Unknown hostel');
    const days = Array.isArray(req.body.days) ? req.body.days : [];
    const up = db.prepare('INSERT INTO hx_menu (hostel_id, day, meal, items) VALUES (?, ?, ?, ?) ON CONFLICT(hostel_id, day, meal) DO UPDATE SET items = excluded.items');
    const del = db.prepare('DELETE FROM hx_menu WHERE hostel_id = ? AND day = ? AND meal = ?');
    db.transaction(() => {
      for (const d of days) {
        const day = Number(d.day);
        if (!Number.isInteger(day) || day < 0 || day > 6) throw err(400, 'day must be 0 (Monday) to 6 (Sunday)');
        for (const meal of MEALS) {
          if (!(meal in d)) continue;
          const items = text(d[meal], 500);
          if (items) up.run(hostelId, day, meal, items); else del.run(hostelId, day, meal);
        }
      }
    })();
    res.json({ ok: true });
  },
  counts(req, res) {
    const date = req.query.date || today();
    if (!isDate(date)) throw err(400, 'date must be YYYY-MM-DD');
    const hostels = db.prepare('SELECT id, name FROM hostels ORDER BY name').all();
    const saved = db.prepare('SELECT * FROM hx_meal_counts WHERE date = ?').all(date);
    // Boarders present (or late) at any roll call that day, each counted once however many sessions were marked.
    const present = new Map(db.prepare(`SELECT hostel_id, COUNT(DISTINCT student_id) AS c FROM hx_roll_call WHERE date = ? AND status IN ('present','late')
      GROUP BY hostel_id`).all(date).map(r => [r.hostel_id, r.c]));
    res.json({ date, meals: MEALS, hostels: hostels.map(h => ({
      ...h, residents: residents(h.id).length, present: present.get(h.id) ?? null,
      counts: Object.fromEntries(MEALS.map(m => [m, saved.find(x => x.hostel_id === h.id && x.meal === m)?.count ?? null])),
    })) });
  },
  saveCounts(req, res) {
    const { date, hostel_id: hostelId, counts } = req.body || {};
    if (!isDate(date)) throw err(400, 'date must be YYYY-MM-DD');
    if (!db.prepare('SELECT 1 FROM hostels WHERE id = ?').get(hostelId)) throw err(400, 'Unknown hostel');
    const up = db.prepare(`INSERT INTO hx_meal_counts (date, hostel_id, meal, count) VALUES (?, ?, ?, ?)
      ON CONFLICT(date, hostel_id, meal) DO UPDATE SET count = excluded.count`);
    db.transaction(() => {
      for (const meal of MEALS) {
        const v = counts?.[meal];
        if (v === '' || v == null) continue;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) throw err(400, `${meal} count must be a whole number`);
        up.run(date, Number(hostelId), meal, n);
      }
    })();
    res.json({ ok: true });
  },
  feeSettings(req, res) {
    res.json(db.prepare(`SELECT h.id AS hostel_id, h.name, COALESCE(f.monthly_fee, 0) AS monthly_fee, COALESCE(f.due_day, 10) AS due_day
      FROM hostels h LEFT JOIN hx_mess_fees f ON f.hostel_id = h.id ORDER BY h.name`).all());
  },
  saveFeeSettings(req, res) {
    const rows = Array.isArray(req.body.items) ? req.body.items : [];
    const up = db.prepare(`INSERT INTO hx_mess_fees (hostel_id, monthly_fee, due_day) VALUES (?, ?, ?)
      ON CONFLICT(hostel_id) DO UPDATE SET monthly_fee = excluded.monthly_fee, due_day = excluded.due_day`);
    db.transaction(() => {
      for (const r of rows) {
        const fee = num(r.monthly_fee), day = Number(r.due_day ?? 10);
        if (!db.prepare('SELECT 1 FROM hostels WHERE id = ?').get(r.hostel_id)) throw err(400, 'Unknown hostel');
        if (!(fee >= 0)) throw err(400, 'Mess fee must be 0 or more');
        if (!Number.isInteger(day) || day < 1 || day > 28) throw err(400, 'Due day must be 1 to 28');
        up.run(Number(r.hostel_id), round2(fee), day);
      }
    })();
    res.json({ ok: true });
  },
  // Adds a "Mess Fee <Month>" due for every current boarder, once per month, so it is collected like any other fee.
  generateFees(req, res) {
    const month = String(req.body.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw err(400, 'month must be YYYY-MM');
    const hostelId = Number(req.body.hostel_id) || 0;
    const label = new Date(`${month}-01T00:00:00`).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const term = `Mess Fee ${label}`;
    const settings = new Map(db.prepare('SELECT * FROM hx_mess_fees').all().map(r => [r.hostel_id, r]));
    const session = currentSession();
    const preview = req.body.preview === true;
    const out = { term, created: 0, skipped_existing: 0, skipped_no_fee: 0, total: 0, rows: [] };
    const ins = db.prepare(`INSERT INTO fees (student_id, term, amount, gross_amount, due_date, head, session, created_at)
      VALUES (?, ?, ?, ?, ?, 'Mess Fee', ?, ?)`);
    const exists = db.prepare("SELECT 1 FROM fees WHERE student_id = ? AND term = ? AND COALESCE(kind, 'demand') != 'void'");
    db.transaction(() => {
      for (const s of residents(hostelId)) {
        const set = settings.get(s.hostel_id);
        if (!set || !(set.monthly_fee > 0)) { out.skipped_no_fee++; continue; }
        if (exists.get(s.student_id, term)) { out.skipped_existing++; continue; }
        const due = `${month}-${String(set.due_day).padStart(2, '0')}`;
        out.rows.push({ student_id: s.student_id, full_name: s.full_name, hostel_name: s.hostel_name, amount: set.monthly_fee, due_date: due });
        out.total = round2(out.total + set.monthly_fee);
        if (!preview) { ins.run(s.student_id, term, set.monthly_fee, set.monthly_fee, due, session, nowIso()); out.created++; }
      }
    })();
    res.json(out);
  },
};

/* ---------- Visitors ---------- */
const visitors = {
  list(req, res) {
    const date = req.query.date;
    if (date && !isDate(date)) throw err(400, 'date must be YYYY-MM-DD');
    res.json(db.prepare(`SELECT v.*, h.name AS hostel_name, s.full_name AS student_name, s.admission_no
      FROM hx_visitors v JOIN hostels h ON h.id = v.hostel_id LEFT JOIN students s ON s.id = v.student_id
      WHERE (? = '' OR date(v.in_time, 'localtime') = ?) AND (? = 0 OR v.hostel_id = ?)
      ORDER BY v.in_time DESC LIMIT 300`).all(date || '', date || '', Number(req.query.hostel_id) || 0, Number(req.query.hostel_id) || 0));
  },
  create(req, res) {
    const b = req.body || {};
    if (!db.prepare('SELECT 1 FROM hostels WHERE id = ?').get(b.hostel_id)) throw err(400, 'Choose a hostel');
    const name = text(b.visitor_name, 120);
    if (!name) throw err(400, 'Enter the visitor name');
    if (b.student_id && !db.prepare('SELECT 1 FROM students WHERE id = ?').get(b.student_id)) throw err(400, 'Unknown student');
    const info = db.prepare(`INSERT INTO hx_visitors (hostel_id, student_id, visitor_name, relation, phone, id_proof, purpose, in_time, logged_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(Number(b.hostel_id), b.student_id || null, name, text(b.relation, 60), text(b.phone, 20),
      text(b.id_proof, 80), text(b.purpose, 200), nowIso(), req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  checkout(req, res) {
    const info = db.prepare('UPDATE hx_visitors SET out_time = ? WHERE id = ? AND out_time IS NULL').run(nowIso(), req.params.id);
    if (!info.changes) throw err(404, 'Visitor not found or already checked out');
    res.json({ ok: true });
  },
};

/* ---------- Out-passes ---------- */
const OP_SELECT = `SELECT o.*, s.full_name AS student_name, s.admission_no, h.name AS hostel_name,
    c.name || ' ' || c.section AS class, u.full_name AS decided_by_name,
    CASE WHEN o.status = 'out' AND o.expected_return_at < ? THEN 1 ELSE 0 END AS overdue
  FROM hx_outpasses o JOIN students s ON s.id = o.student_id LEFT JOIN hostels h ON h.id = o.hostel_id
  LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN users u ON u.id = o.decided_by`;

const outpass = {
  list(req, res) {
    const now = nowIso();
    if (!isStaff(req.user)) {
      return res.json(db.prepare(`${OP_SELECT} WHERE o.student_id = ? ORDER BY o.id DESC LIMIT 100`).all(now, req.user.linked_id ?? -1));
    }
    const status = req.query.status || '';
    if (status === 'overdue') return res.json(db.prepare(`${OP_SELECT} WHERE o.status = 'out' AND o.expected_return_at < ? ORDER BY o.expected_return_at`).all(now, now));
    res.json(db.prepare(`${OP_SELECT} WHERE (? = '' OR o.status = ?) ORDER BY o.id DESC LIMIT 300`).all(now, status, status));
  },
  create(req, res) {
    const b = req.body || {};
    const staffUser = isStaff(req.user);
    const studentId = staffUser ? Number(b.student_id) : req.user.linked_id;
    if (!studentId) throw err(400, 'Choose a student');
    const home = residentOf(studentId);
    if (!home) throw err(400, 'This student does not currently live in a hostel');
    const reason = text(b.reason, 300);
    if (!reason) throw err(400, 'Enter a reason');
    if (!validTime(b.out_at) || !validTime(b.expected_return_at)) throw err(400, 'Enter when the student leaves and returns');
    if (Date.parse(b.expected_return_at) <= Date.parse(b.out_at)) throw err(400, 'Return time must be after leaving time');
    const outAt = new Date(b.out_at).toISOString(), returnAt = new Date(b.expected_return_at).toISOString();
    const clash = db.prepare(`SELECT out_at, expected_return_at, status FROM hx_outpasses WHERE student_id = ?
      AND status IN ('requested','approved','out') AND out_at < ? AND expected_return_at > ?`).get(studentId, returnAt, outAt);
    if (clash) throw err(409, `This student already has an out-pass (${clash.status}) from ${fmtWhen(clash.out_at)} to ${fmtWhen(clash.expected_return_at)}`);
    // Staff issue passes already approved; families' requests wait for the warden.
    const status = staffUser ? 'approved' : 'requested';
    const info = db.prepare(`INSERT INTO hx_outpasses (student_id, hostel_id, reason, destination, escort, out_at, expected_return_at, status,
      requested_by, decided_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(studentId, home.hostel_id, reason, text(b.destination),
      text(b.escort, 120), outAt, returnAt, status, req.user.id, staffUser ? req.user.id : null);
    if (staffUser) notify(familyUsers(studentId), 'Out-pass issued', `Out-pass approved: leaving ${fmtWhen(b.out_at)}, back by ${fmtWhen(b.expected_return_at)}.`, '/hostel/my');
    res.status(201).json({ id: info.lastInsertRowid, status });
  },
  // Moves a pass along: approve / reject / out / returned / cancel.
  act(req, res) {
    const o = db.prepare('SELECT * FROM hx_outpasses WHERE id = ?').get(req.params.id);
    if (!o) throw err(404, 'Out-pass not found');
    const action = String(req.body.action || '');
    const remarks = text(req.body.remarks, 300);
    const staffUser = isStaff(req.user);
    const next = {
      approve: { from: ['requested'], to: 'approved', staff: true },
      reject: { from: ['requested'], to: 'rejected', staff: true },
      out: { from: ['approved'], to: 'out', staff: true },
      returned: { from: ['out'], to: 'returned', staff: true },
      cancel: { from: ['requested', 'approved'], to: 'cancelled', staff: false },
    }[action];
    if (!next) throw err(400, 'action must be approve, reject, out, returned or cancel');
    if (next.staff && !staffUser) throw err(403, 'Only hostel staff can do this');
    if (!staffUser && o.student_id !== req.user.linked_id) throw err(404, 'Out-pass not found');
    if (!next.from.includes(o.status)) throw err(400, `This out-pass is ${o.status}`);
    const sets = ['status = ?', 'remarks = COALESCE(?, remarks)'];
    const vals = [next.to, remarks];
    if (['approve', 'reject'].includes(action)) { sets.push('decided_by = ?'); vals.push(req.user.id); }
    if (action === 'out') { sets.push('actual_out_at = ?'); vals.push(nowIso()); }
    if (action === 'returned') { sets.push('actual_return_at = ?'); vals.push(nowIso()); }
    db.prepare(`UPDATE hx_outpasses SET ${sets.join(', ')} WHERE id = ?`).run(...vals, o.id);
    const s = db.prepare('SELECT full_name FROM students WHERE id = ?').get(o.student_id);
    const msgs = {
      approve: ['Out-pass approved', `${s.full_name}'s out-pass has been approved.`],
      reject: ['Out-pass not approved', `${s.full_name}'s out-pass request was not approved${remarks ? `: ${remarks}` : '.'}`],
      out: ['Left the hostel', `${s.full_name} left the hostel at ${fmtWhen(nowIso())}.`],
      returned: ['Back in the hostel', `${s.full_name} returned to the hostel at ${fmtWhen(nowIso())}.`],
    };
    if (msgs[action]) notify(familyUsers(o.student_id), msgs[action][0], msgs[action][1], '/hostel/my');
    res.json({ ok: true, status: next.to });
  },
};

/* ---------- Student / parent view ---------- */
function mine(req, res) {
  const sid = req.user.linked_id;
  const home = sid ? residentOf(sid) : null;
  const recent = sid ? db.prepare(`SELECT date, session, status, remarks FROM hx_roll_call WHERE student_id = ? ORDER BY date DESC, session DESC LIMIT 30`).all(sid) : [];
  req.query.hostel_id = home?.hostel_id || 0;
  let menu = null;
  mess.menu(req, { json: (m) => { menu = m; } });
  res.json({ hostel: home || null, roll_call: recent, menu, can_request_outpass: !!home });
}

/* ---------- Reports ---------- */
registerReport({
  key: 'hostel-roll-call', title: 'Hostel Roll Call', group: 'Hostel', roles: ROLES.STAFF,
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['present', 'absent', 'leave', 'late'] },
  ],
  columns: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'session', label: 'Roll Call' }, { key: 'hostel', label: 'Hostel' },
    { key: 'room_no', label: 'Room' }, { key: 'admission_no', label: 'Adm No' }, { key: 'student', label: 'Student' },
    { key: 'status', label: 'Status' }, { key: 'remarks', label: 'Remarks' }, { key: 'marked_by', label: 'Marked By' },
  ],
  run: (p) => db.prepare(`
    SELECT rc.date, rc.session, h.name AS hostel, r.room_no, s.admission_no, s.full_name AS student, rc.status, rc.remarks, u.full_name AS marked_by
    FROM hx_roll_call rc JOIN students s ON s.id = rc.student_id JOIN hostels h ON h.id = rc.hostel_id
    LEFT JOIN hostel_allotments a ON a.student_id = s.id AND a.vacated_on IS NULL LEFT JOIN hostel_rooms r ON r.id = a.room_id
    LEFT JOIN users u ON u.id = rc.marked_by
    WHERE rc.date BETWEEN ? AND ? AND (? = '' OR rc.status = ?) ORDER BY rc.date DESC, h.name, r.room_no`).all(p.from, p.to, p.status, p.status),
});
registerReport({
  key: 'hostel-attendance-summary', title: 'Hostel Attendance Summary', group: 'Hostel', roles: ROLES.STAFF,
  params: [{ name: 'month', label: 'Month', type: 'month', default: 'currentMonth', required: true }],
  columns: [
    { key: 'hostel', label: 'Hostel' }, { key: 'room_no', label: 'Room' }, { key: 'student', label: 'Student' },
    { key: 'present', label: 'Present', type: 'number', total: true }, { key: 'late', label: 'Late', type: 'number', total: true },
    { key: 'absent', label: 'Absent', type: 'number', total: true }, { key: 'leave', label: 'Leave', type: 'number', total: true },
  ],
  run: (p) => db.prepare(`
    SELECT h.name AS hostel, r.room_no, s.full_name AS student,
      SUM(rc.status = 'present') AS present, SUM(rc.status = 'late') AS late, SUM(rc.status = 'absent') AS absent, SUM(rc.status = 'leave') AS leave
    FROM hx_roll_call rc JOIN students s ON s.id = rc.student_id JOIN hostels h ON h.id = rc.hostel_id
    LEFT JOIN hostel_allotments a ON a.student_id = s.id AND a.vacated_on IS NULL LEFT JOIN hostel_rooms r ON r.id = a.room_id
    WHERE substr(rc.date, 1, 7) = ? GROUP BY rc.student_id ORDER BY h.name, r.room_no, s.full_name`).all(p.month),
});
registerReport({
  key: 'hostel-outpass-overdue', title: 'Overdue Out-passes', group: 'Hostel', roles: ROLES.STAFF,
  description: 'Students who left on an out-pass and are past their return time.',
  params: [],
  columns: [
    { key: 'student_name', label: 'Student' }, { key: 'admission_no', label: 'Adm No' }, { key: 'hostel_name', label: 'Hostel' },
    { key: 'destination', label: 'Destination' }, { key: 'actual_out_at', label: 'Left' }, { key: 'expected_return_at', label: 'Due Back' },
  ],
  run: () => db.prepare(`${OP_SELECT} WHERE o.status = 'out' AND o.expected_return_at < ? ORDER BY o.expected_return_at`).all(nowIso(), nowIso())
    .map(r => ({ ...r, actual_out_at: r.actual_out_at && fmtWhen(r.actual_out_at), expected_return_at: fmtWhen(r.expected_return_at) })),
});
registerReport({
  key: 'hostel-meal-counts', title: 'Mess Meal Counts', group: 'Hostel', roles: ROLES.STAFF,
  params: [{ name: 'month', label: 'Month', type: 'month', default: 'currentMonth', required: true }],
  columns: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'hostel', label: 'Hostel' },
    ...MEALS.map(m => ({ key: m, label: m[0].toUpperCase() + m.slice(1), type: 'number', total: true })),
  ],
  run: (p) => db.prepare(`
    SELECT m.date, h.name AS hostel,
      SUM(CASE WHEN meal = 'breakfast' THEN count END) AS breakfast, SUM(CASE WHEN meal = 'lunch' THEN count END) AS lunch,
      SUM(CASE WHEN meal = 'snacks' THEN count END) AS snacks, SUM(CASE WHEN meal = 'dinner' THEN count END) AS dinner
    FROM hx_meal_counts m JOIN hostels h ON h.id = m.hostel_id WHERE substr(m.date, 1, 7) = ?
    GROUP BY m.date, m.hostel_id ORDER BY m.date, h.name`).all(p.month),
});

// Mess fees create fee demands, so a custom staff role needs full Fees & Finance access as well as full Hostel access.
function financeAdmin(req, res, next) {
  if (req.user.perms && roleInArea(req.user.perms, 'finance') !== 'admin') {
    return res.status(403).json({ error: 'Mess fees need full Fees & Finance access', code: 'AREA_DENIED' });
  }
  next();
}

function register(router) {
  const S = [auth, role(...ROLES.STAFF)];
  const A = [auth, role(...ROLES.ADMIN)];
  const F = [...A, financeAdmin];
  router.get('/hostel-ops/my', auth, safe(mine));
  router.get('/hostel-ops/residents', ...S, safe((req, res) => res.json(residents(Number(req.query.hostel_id) || 0))));
  router.get('/hostel-ops/roll-call', ...S, safe(roll.sheet));
  router.post('/hostel-ops/roll-call', ...S, safe(roll.save));
  router.get('/hostel-ops/menu', auth, safe(mess.menu));
  router.put('/hostel-ops/menu', ...A, safe(mess.saveMenu));
  router.get('/hostel-ops/meal-counts', ...S, safe(mess.counts));
  router.put('/hostel-ops/meal-counts', ...S, safe(mess.saveCounts));
  router.get('/hostel-ops/mess-fees', ...A, safe(mess.feeSettings));
  router.put('/hostel-ops/mess-fees', ...F, safe(mess.saveFeeSettings));
  router.post('/hostel-ops/mess-fees/generate', ...F, safe(mess.generateFees));
  router.get('/hostel-ops/visitors', ...S, safe(visitors.list));
  router.post('/hostel-ops/visitors', ...S, safe(visitors.create));
  router.post('/hostel-ops/visitors/:id/checkout', ...S, safe(visitors.checkout));
  router.get('/hostel-ops/outpasses', auth, safe(outpass.list));
  router.post('/hostel-ops/outpasses', auth, safe(outpass.create));
  router.post('/hostel-ops/outpasses/:id/action', auth, safe(outpass.act));
}

module.exports = { register };
