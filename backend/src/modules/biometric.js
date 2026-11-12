// eSSL / ZKTeco biometric devices over the ADMS ("iClock" push) protocol.
// Devices call /iclock/* over plain HTTP; punches are stored in bio_punches and, for mapped staff,
// fed into HR staff attendance (hr_punches + the attendance rules). Admin screens use /api/biometric/*.
const express = require('express');
const { db, ROLES, auth, role, safe, addColumn, isDate, today, registerReport } = require('./_kit');
const hr = require('./hr');

/* ---------- Schema ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS bio_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sn TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    timezone TEXT NOT NULL DEFAULT '330',
    attlog_stamp TEXT NOT NULL DEFAULT '0',
    operlog_stamp TEXT NOT NULL DEFAULT '0',
    attphoto_stamp TEXT NOT NULL DEFAULT '0',
    last_seen TEXT,
    last_ip TEXT,
    push_version TEXT,
    device_info TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS bio_unregistered (
    sn TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_ip TEXT,
    hits INTEGER NOT NULL DEFAULT 1,
    push_version TEXT
  );
  CREATE TABLE IF NOT EXISTS bio_punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES bio_devices(id) ON DELETE CASCADE,
    pin TEXT NOT NULL,
    punch_at TEXT NOT NULL,
    punch_date TEXT NOT NULL,
    punch_time TEXT NOT NULL,
    status_code TEXT,
    verify_code TEXT,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, pin, punch_at)
  );
  CREATE INDEX IF NOT EXISTS ix_bio_punches_date ON bio_punches(punch_date);
  CREATE INDEX IF NOT EXISTS ix_bio_punches_pin ON bio_punches(pin);
  CREATE TABLE IF NOT EXISTS bio_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES bio_devices(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','done','failed')),
    return_code TEXT,
    result TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT,
    done_at TEXT
  );
`);
addColumn('teachers', 'biometric_id TEXT');
addColumn('students', 'biometric_id TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS bio_student_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    present_until TEXT NOT NULL DEFAULT '08:30',
    ignore_after TEXT NOT NULL DEFAULT '13:00'
  );
  INSERT OR IGNORE INTO bio_student_settings (id) VALUES (1);
  -- What the device last wrote into class attendance; lets us tell our own marks from a teacher's.
  CREATE TABLE IF NOT EXISTS bio_student_marks (
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    punch_time TEXT NOT NULL,
    PRIMARY KEY (student_id, date)
  );
`);

const ONLINE_MINUTES = 5;
const nowIso = () => new Date().toISOString();
const clean = (v, max = 64) => String(v == null ? '' : v).replace(/[\r\n\t]/g, ' ').trim().slice(0, max);

/* ---------- PIN → person ---------- */
// biometric_id wins; otherwise a staff member's employee_no (most schools enrol staff under their employee number).
function lookupPin(pin) {
  const p = String(pin).trim();
  const t = db.prepare('SELECT id FROM teachers WHERE TRIM(biometric_id) = ?').get(p)
    || db.prepare("SELECT id FROM teachers WHERE (biometric_id IS NULL OR biometric_id = '') AND UPPER(TRIM(employee_no)) = UPPER(?)").get(p);
  if (t) return { teacher_id: t.id, student_id: null };
  const s = db.prepare('SELECT id FROM students WHERE TRIM(biometric_id) = ?').get(p);
  return { teacher_id: null, student_id: s ? s.id : null };
}

const insHrPunch = db.prepare('INSERT OR IGNORE INTO hr_punches (teacher_id, punch_date, punch_time, batch, imported_by) VALUES (?, ?, ?, ?, NULL)');

// Copy a staff punch into HR punches and recompute that day (hand-marked days are left alone).
function feedHr(teacherId, date, time, sn, touched) {
  if (date > today()) return;            // a device clock in the future must not create attendance
  insHrPunch.run(teacherId, date, time, `ADMS:${sn}`);
  touched.add(`${teacherId}|${date}`);
}
function recomputeTouched(touched) {
  // Attendance rules are a single row; recreate the defaults if it was ever removed so punches never fail.
  db.prepare('INSERT OR IGNORE INTO hr_attendance_rules (id) VALUES (1)').run();
  let days = 0;
  for (const k of touched) {
    const [tid, date] = k.split('|');
    if (hr.recompute(Number(tid), date, false, null)) days++;
  }
  return days;
}

/* ---------- Student class attendance from punches ---------- */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const studentSettings = () => db.prepare('SELECT * FROM bio_student_settings WHERE id = 1').get();

// First punch before present_until → present; up to ignore_after → late; later punches are ignored.
// A day a teacher has marked (or changed after the device marked it) is never overwritten.
function applyStudentDay(studentId, date, cfg = studentSettings()) {
  if (!cfg?.enabled || date > today()) return null;
  const first = db.prepare(`SELECT MIN(punch_time) AS t FROM bio_punches WHERE student_id = ? AND punch_date = ? AND substr(punch_time, 1, 5) <= ?`)
    .get(studentId, date, cfg.ignore_after)?.t;
  if (!first) return null;
  const status = first.slice(0, 5) <= cfg.present_until ? 'present' : 'late';
  const remarks = `Biometric ${first.slice(0, 5)}`;
  const row = db.prepare('SELECT status, remarks FROM attendance WHERE student_id = ? AND date = ?').get(studentId, date);
  const mine = db.prepare('SELECT status FROM bio_student_marks WHERE student_id = ? AND date = ?').get(studentId, date);
  if (row) {
    const ours = mine && row.status === mine.status && String(row.remarks || '').startsWith('Biometric');
    if (!ours) return 'kept';
    db.prepare('UPDATE attendance SET status = ?, remarks = ? WHERE student_id = ? AND date = ?').run(status, remarks, studentId, date);
  } else {
    db.prepare('INSERT INTO attendance (student_id, date, status, remarks) VALUES (?, ?, ?, ?)').run(studentId, date, status, remarks);
  }
  db.prepare(`INSERT INTO bio_student_marks (student_id, date, status, punch_time) VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, punch_time = excluded.punch_time`).run(studentId, date, status, first);
  return status;
}
function applyStudentDays(keys) {
  const cfg = studentSettings();
  const out = { marked: 0, kept: 0 };
  if (!cfg?.enabled) return out;
  for (const k of keys) {
    const [sid, date] = k.split('|');
    const r = applyStudentDay(Number(sid), date, cfg);
    if (r === 'kept') out.kept++; else if (r) out.marked++;
  }
  return out;
}

/* ---------- ATTLOG parsing ---------- */
// "PIN\tYYYY-MM-DD HH:MM:SS\tstatus\tverify\tworkcode\t..." — tolerate spaces, missing fields, CRLF.
function parseAttlogLine(line) {
  const cells = line.split('\t').map(c => c.trim());
  let pin = cells[0], stamp = cells[1], status = cells[2], verify = cells[3];
  if (cells.length === 1) {                         // some firmware separates with spaces
    const m = line.trim().match(/^(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s+(\S+))?(?:\s+(\S+))?/);
    if (!m) return null;
    [, pin, , , status, verify] = m; stamp = `${m[2]} ${m[3]}`;
  }
  if (!pin || !/^[A-Za-z0-9_-]{1,24}$/.test(pin)) return null;
  const m = String(stamp || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || !isDate(m[1])) return null;
  const h = Number(m[2]), mi = Number(m[3]), se = Number(m[4] || 0);
  if (h > 23 || mi > 59 || se > 59) return null;
  const time = `${String(h).padStart(2, '0')}:${m[3]}:${String(se).padStart(2, '0')}`;
  return { pin, date: m[1], time, at: `${m[1]} ${time}`, status: clean(status, 8) || null, verify: clean(verify, 8) || null };
}

const insPunch = db.prepare(`INSERT OR IGNORE INTO bio_punches
  (device_id, pin, punch_at, punch_date, punch_time, status_code, verify_code, teacher_id, student_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

function storeAttlog(device, body) {
  const lines = String(body || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 20000);
  let stored = 0, duplicates = 0, invalid = 0;
  const touched = new Set();
  const studentDays = new Set();
  const cache = new Map();
  db.transaction(() => {
    for (const line of lines) {
      const p = parseAttlogLine(line);
      if (!p) { invalid++; continue; }
      if (!cache.has(p.pin)) cache.set(p.pin, lookupPin(p.pin));
      const who = cache.get(p.pin);
      const info = insPunch.run(device.id, p.pin, p.at, p.date, p.time, p.status, p.verify, who.teacher_id, who.student_id);
      if (!info.changes) { duplicates++; continue; }
      stored++;
      if (who.teacher_id) feedHr(who.teacher_id, p.date, p.time, device.sn, touched);
      else if (who.student_id) studentDays.add(`${who.student_id}|${p.date}`);
    }
    recomputeTouched(touched);
    applyStudentDays(studentDays);
  })();
  return { lines: lines.length, stored, duplicates, invalid };
}

/* ---------- Device protocol (/iclock) ---------- */
function deviceFor(req) {
  const sn = clean(req.query.SN || req.query.sn, 40);
  if (!sn) return { sn: '', device: null };
  const device = db.prepare('SELECT * FROM bio_devices WHERE sn = ?').get(sn);
  const ip = req.ip;
  if (device && device.active) {
    db.prepare('UPDATE bio_devices SET last_seen = ?, last_ip = ?, push_version = COALESCE(?, push_version) WHERE id = ?')
      .run(nowIso(), ip, clean(req.query.pushver, 20) || null, device.id);
    return { sn, device };
  }
  // /iclock is public, so cap the waiting list: a flood of made-up serial numbers can't grow it without limit.
  const known = !device && db.prepare('SELECT 1 FROM bio_unregistered WHERE sn = ?').get(sn);
  if (!device && (known || db.prepare('SELECT COUNT(*) AS c FROM bio_unregistered').get().c < 100)) {
    db.prepare(`INSERT INTO bio_unregistered (sn, last_ip, push_version) VALUES (?, ?, ?)
      ON CONFLICT(sn) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, last_ip = excluded.last_ip, hits = hits + 1,
        push_version = COALESCE(excluded.push_version, push_version)`).run(sn, ip, clean(req.query.pushver, 20) || null);
  }
  return { sn, device: null };   // unknown or disabled: answer OK, store nothing
}

const text = (res, body) => res.status(200).type('text/plain').send(body);

function handshake(req, res) {
  const { sn, device } = deviceFor(req);
  if (!device) return text(res, 'OK');
  text(res, [
    `GET OPTION FROM: ${sn}`,
    `ATTLOGStamp=${device.attlog_stamp || 0}`,
    `OPERLOGStamp=${device.operlog_stamp || 0}`,
    `ATTPHOTOStamp=${device.attphoto_stamp || 0}`,
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog',
    `TimeZone=${device.timezone || '330'}`,
    'Realtime=1',
    'Encrypt=None',
  ].join('\n') + '\n');
}

function upload(req, res) {
  const { device } = deviceFor(req);
  if (!device) return text(res, 'OK');
  const table = String(req.query.table || '').toUpperCase();
  const stamp = clean(req.query.Stamp || req.query.stamp, 30);
  const body = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (table === 'ATTLOG') {
    const r = storeAttlog(device, body);
    if (stamp) db.prepare('UPDATE bio_devices SET attlog_stamp = ? WHERE id = ?').run(stamp, device.id);
    return text(res, `OK: ${r.lines}`);
  }
  if (table === 'OPERLOG') {
    if (stamp) db.prepare('UPDATE bio_devices SET operlog_stamp = ? WHERE id = ?').run(stamp, device.id);
    return text(res, `OK: ${body.split(/\r?\n/).filter(l => l.trim()).length}`);
  }
  if (table === 'ATTPHOTO' && stamp) db.prepare('UPDATE bio_devices SET attphoto_stamp = ? WHERE id = ?').run(stamp, device.id);
  text(res, 'OK');
}

function getRequest(req, res) {
  const { device } = deviceFor(req);
  if (!device) return text(res, 'OK');
  if (req.query.INFO) db.prepare('UPDATE bio_devices SET device_info = ? WHERE id = ?').run(clean(req.query.INFO, 300), device.id);
  const cmds = db.prepare("SELECT id, command FROM bio_commands WHERE device_id = ? AND status = 'pending' ORDER BY id LIMIT 10").all(device.id);
  if (!cmds.length) return text(res, 'OK');
  const mark = db.prepare("UPDATE bio_commands SET status = 'sent', sent_at = ? WHERE id = ?");
  for (const c of cmds) mark.run(nowIso(), c.id);
  text(res, cmds.map(c => `C:${c.id}:${c.command}`).join('\n') + '\n');
}

// Body: one or more "ID=12&Return=0&CMD=DATA" lines.
function deviceCmd(req, res) {
  const { device } = deviceFor(req);
  if (!device) return text(res, 'OK');
  const body = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const upd = db.prepare(`UPDATE bio_commands SET status = ?, return_code = ?, result = ?, done_at = ?
    WHERE id = ? AND device_id = ?`);
  for (const line of body.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 50)) {
    const q = new URLSearchParams(line.replace(/\t/g, '&'));
    const id = Number(q.get('ID')), ret = clean(q.get('Return'), 12);
    if (!id) continue;
    upd.run(ret === '0' || (Number(ret) > 0) ? 'done' : 'failed', ret || null, clean(line, 300), nowIso(), id, device.id);
  }
  text(res, 'OK');
}

function registerRoot(app) {
  const r = express.Router();
  r.use(express.text({ type: () => true, limit: '2mb' }));
  r.get('/cdata', safe(handshake));
  r.post('/cdata', safe(upload));
  r.get('/getrequest', safe(getRequest));
  r.post('/devicecmd', safe(deviceCmd));
  // Other firmware probes (ping, registry, push, fdata...) only need a polite answer.
  r.all('*', (req, res) => { deviceFor(req); text(res, 'OK'); });
  // Garbage input is handled above; anything thrown here is our fault, so answer with an error and the
  // device keeps the punches and sends them again later instead of discarding them.
  r.use((err, req, res, next) => { console.error('iclock error:', err.message); res.status(500).type('text/plain').send('ERROR'); });
  app.use('/iclock', r);
}

/* ---------- Admin API (/api/biometric) ---------- */
const err400 = (res, error) => res.status(400).json({ error });
const SN_RE = /^[A-Za-z0-9_-]{4,40}$/;
const TZ_RE = /^-?\d{1,4}(\.\d{1,2})?$/;

function deviceRows() {
  const t = today();
  return db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM bio_punches p WHERE p.device_id = d.id AND p.punch_date = ?) AS punches_today,
      (SELECT MAX(punch_at) FROM bio_punches p WHERE p.device_id = d.id) AS last_punch,
      (SELECT COUNT(*) FROM bio_punches p WHERE p.device_id = d.id) AS punches_total,
      (SELECT COUNT(*) FROM bio_commands c WHERE c.device_id = d.id AND c.status IN ('pending','sent')) AS commands_open
    FROM bio_devices d ORDER BY d.name`).all(t)
    .map(d => ({ ...d, online: !!d.last_seen && (Date.now() - Date.parse(d.last_seen)) < ONLINE_MINUTES * 60000 }));
}

function deviceProblem(b, existingId) {
  if (b.sn != null && !SN_RE.test(String(b.sn).trim())) return 'Serial number should be 4–40 letters/numbers (as shown on the device: Menu › System Info)';
  if (b.name != null && !String(b.name).trim()) return 'Device name is required';
  if (b.timezone != null && b.timezone !== '' && !TZ_RE.test(String(b.timezone))) return 'Time zone must be a number such as 330 (minutes) or 5.5 (hours)';
  if (b.sn) {
    const dup = db.prepare('SELECT id FROM bio_devices WHERE sn = ? AND id != ?').get(String(b.sn).trim(), existingId || 0);
    if (dup) return 'A device with this serial number is already registered';
  }
  return null;
}

const api = {
  info(req, res) {
    res.json({ server_time: nowIso(), today: today(), online_minutes: ONLINE_MINUTES, path: '/iclock/cdata' });
  },
  devices(req, res) { res.json(deviceRows()); },
  createDevice(req, res) {
    const b = { ...req.body, sn: String(req.body.sn || '').trim(), name: String(req.body.name || '').trim() };
    if (!b.sn) return err400(res, 'Serial number is required');
    if (!b.name) return err400(res, 'Device name is required');
    const p = deviceProblem(b); if (p) return err400(res, p);
    const info = db.prepare('INSERT INTO bio_devices (sn, name, location, active, timezone) VALUES (?, ?, ?, ?, ?)')
      .run(b.sn, b.name, clean(b.location, 100) || null, b.active === false || b.active === 0 ? 0 : 1, String(b.timezone || '330'));
    db.prepare('DELETE FROM bio_unregistered WHERE sn = ?').run(b.sn);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  updateDevice(req, res) {
    const d = db.prepare('SELECT * FROM bio_devices WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Device not found' });
    const b = { ...d, ...req.body };
    b.sn = String(b.sn).trim(); b.name = String(b.name).trim();
    const p = deviceProblem(b, d.id); if (p) return err400(res, p);
    db.prepare('UPDATE bio_devices SET sn = ?, name = ?, location = ?, active = ?, timezone = ? WHERE id = ?')
      .run(b.sn, b.name, clean(b.location, 100) || null, b.active ? 1 : 0, String(b.timezone || '330'), d.id);
    res.json({ ok: true });
  },
  removeDevice(req, res) {
    const d = db.prepare('SELECT id FROM bio_devices WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Device not found' });
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM bio_punches WHERE device_id = ?').get(d.id);
    if (c) return res.status(409).json({ error: `This device has ${c} punch(es) on record. Deactivate it instead so its history is kept.` });
    db.prepare('DELETE FROM bio_devices WHERE id = ?').run(d.id);
    res.json({ ok: true });
  },
  unregistered(req, res) {
    res.json(db.prepare('SELECT * FROM bio_unregistered ORDER BY last_seen DESC').all());
  },
  approve(req, res) {
    const u = db.prepare('SELECT * FROM bio_unregistered WHERE sn = ?').get(req.params.sn);
    if (!u) return res.status(404).json({ error: 'No unregistered device with that serial number' });
    const name = String(req.body.name || '').trim() || `Device ${u.sn}`;
    const p = deviceProblem({ sn: u.sn, name, timezone: req.body.timezone }); if (p) return err400(res, p);
    const info = db.prepare('INSERT INTO bio_devices (sn, name, location, timezone, last_ip, push_version) VALUES (?, ?, ?, ?, ?, ?)')
      .run(u.sn, name, clean(req.body.location, 100) || null, String(req.body.timezone || '330'), u.last_ip, u.push_version);
    db.prepare('DELETE FROM bio_unregistered WHERE sn = ?').run(u.sn);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  dismiss(req, res) {
    const info = db.prepare('DELETE FROM bio_unregistered WHERE sn = ?').run(req.params.sn);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
  queueCommand(req, res) {
    const d = db.prepare('SELECT * FROM bio_devices WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Device not found' });
    const kind = String(req.body.kind || '');
    let command;
    if (kind === 'redownload') {
      const { from, to } = req.body;
      if (!isDate(from) || !isDate(to)) return err400(res, 'Choose From and To dates');
      if (from > to) return err400(res, 'From date must not be after To date');
      command = `DATA QUERY ATTLOG StartTime=${from} 00:00:00\tEndTime=${to} 23:59:59`;
    } else if (kind === 'check') command = 'CHECK';
    else if (kind === 'info') command = 'INFO';
    else if (kind === 'reboot') command = 'REBOOT';
    else return err400(res, 'kind must be redownload, check, info or reboot');
    const info = db.prepare('INSERT INTO bio_commands (device_id, kind, command, created_by) VALUES (?, ?, ?, ?)')
      .run(d.id, kind, command, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid, command });
  },
  commands(req, res) {
    res.json(db.prepare(`SELECT c.*, u.full_name AS created_by_name FROM bio_commands c LEFT JOIN users u ON u.id = c.created_by
      WHERE c.device_id = ? ORDER BY c.id DESC LIMIT 50`).all(req.params.id));
  },
  punches(req, res) {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const w = [], p = [];
    if (req.query.device_id) { w.push('p.device_id = ?'); p.push(req.query.device_id); }
    if (req.query.date) { if (!isDate(req.query.date)) return err400(res, 'date must be YYYY-MM-DD'); w.push('p.punch_date = ?'); p.push(req.query.date); }
    if (req.query.since_id) { w.push('p.id > ?'); p.push(Number(req.query.since_id) || 0); }
    res.json(db.prepare(`
      SELECT p.id, p.pin, p.punch_at, p.punch_date, p.punch_time, p.status_code, p.verify_code, p.received_at,
        d.name AS device_name, d.sn, t.id AS teacher_id, t.full_name AS staff_name, t.employee_no,
        s.full_name AS student_name, s.admission_no
      FROM bio_punches p JOIN bio_devices d ON d.id = p.device_id
      LEFT JOIN teachers t ON t.id = p.teacher_id LEFT JOIN students s ON s.id = p.student_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.id DESC LIMIT ${limit}`).all(...p));
  },
  unmapped(req, res) {
    res.json(db.prepare(`
      SELECT p.pin, COUNT(*) AS punches, MIN(p.punch_at) AS first_punch, MAX(p.punch_at) AS last_punch,
        GROUP_CONCAT(DISTINCT d.name) AS devices
      FROM bio_punches p JOIN bio_devices d ON d.id = p.device_id
      WHERE p.teacher_id IS NULL AND p.student_id IS NULL GROUP BY p.pin ORDER BY last_punch DESC`).all());
  },
  mapping(req, res) {
    res.json(db.prepare(`SELECT id, employee_no, full_name, department, designation, biometric_id, COALESCE(status, 'active') AS status
      FROM teachers ORDER BY full_name`).all());
  },
  saveMapping(req, res) {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return err400(res, 'Nothing to save');
    const ids = new Map();
    for (const it of items) {
      const tid = Number(it.teacher_id);
      const bid = it.biometric_id == null ? '' : String(it.biometric_id).trim();
      if (!tid || !db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(tid)) return err400(res, `Unknown staff id ${it.teacher_id}`);
      if (bid && !/^[A-Za-z0-9_-]{1,24}$/.test(bid)) return err400(res, `Biometric ID "${bid}" may only contain letters, numbers, - and _`);
      ids.set(tid, bid);
    }
    // Final state must keep every biometric ID unique across staff.
    const all = new Map(db.prepare("SELECT id, biometric_id FROM teachers WHERE biometric_id IS NOT NULL AND biometric_id != ''").all().map(r => [r.id, r.biometric_id]));
    for (const [tid, bid] of ids) { if (bid) all.set(tid, bid); else all.delete(tid); }
    const seen = new Map();
    for (const [tid, bid] of all) {
      if (seen.has(bid)) {
        const names = db.prepare('SELECT full_name FROM teachers WHERE id IN (?, ?)').all(tid, seen.get(bid)).map(r => r.full_name).join(' and ');
        return err400(res, `Biometric ID ${bid} is given to both ${names}`);
      }
      seen.set(bid, tid);
    }
    const upd = db.prepare('UPDATE teachers SET biometric_id = ? WHERE id = ?');
    let result;
    db.transaction(() => {
      for (const [tid, bid] of ids) upd.run(bid || null, tid);
      result = relink();
    })();
    res.json({ ok: true, saved: ids.size, ...result });
  },
  studentSettings(req, res) {
    const cfg = studentSettings();
    res.json({ ...cfg, enabled: !!cfg.enabled, mapped_students: db.prepare("SELECT COUNT(*) AS c FROM students WHERE biometric_id IS NOT NULL AND biometric_id != ''").get().c });
  },
  saveStudentSettings(req, res) {
    const cur = studentSettings();
    const b = { ...cur, ...req.body };
    if (!HHMM.test(String(b.present_until)) || !HHMM.test(String(b.ignore_after))) return err400(res, 'Times must be HH:MM (24-hour)');
    if (b.ignore_after < b.present_until) return err400(res, '"Ignore punches after" must be later than "Present until"');
    db.prepare('UPDATE bio_student_settings SET enabled = ?, present_until = ?, ignore_after = ? WHERE id = 1')
      .run(b.enabled ? 1 : 0, b.present_until, b.ignore_after);
    res.json({ ok: true });
  },
  studentMapping(req, res) {
    const classId = Number(req.query.class_id) || 0;
    res.json(db.prepare(`SELECT s.id, s.admission_no, s.full_name, s.roll_no, s.biometric_id, c.name || ' ' || c.section AS class
      FROM students s LEFT JOIN classes c ON c.id = s.class_id
      WHERE COALESCE(s.status, 'active') = 'active' AND (? = 0 OR s.class_id = ?) ORDER BY c.name, c.section, s.roll_no, s.full_name`).all(classId, classId));
  },
  saveStudentMapping(req, res) {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return err400(res, 'Nothing to save');
    const ids = new Map();
    for (const it of items) {
      const sid = Number(it.student_id);
      const bid = it.biometric_id == null ? '' : String(it.biometric_id).trim();
      if (!sid || !db.prepare('SELECT 1 FROM students WHERE id = ?').get(sid)) return err400(res, `Unknown student id ${it.student_id}`);
      if (bid && !/^[A-Za-z0-9_-]{1,24}$/.test(bid)) return err400(res, `Biometric ID "${bid}" may only contain letters, numbers, - and _`);
      ids.set(sid, bid);
    }
    // Staff IDs take priority on the device side, so a student may not reuse one.
    const staffIds = new Set(db.prepare(`SELECT UPPER(TRIM(COALESCE(NULLIF(biometric_id, ''), employee_no))) AS k FROM teachers`).all().map(r => r.k));
    const all = new Map(db.prepare("SELECT id, biometric_id FROM students WHERE biometric_id IS NOT NULL AND biometric_id != ''").all().map(r => [r.id, r.biometric_id]));
    for (const [sid, bid] of ids) { if (bid) all.set(sid, bid); else all.delete(sid); }
    const seen = new Map();
    for (const [sid, bid] of all) {
      if (staffIds.has(bid.toUpperCase())) return err400(res, `Biometric ID ${bid} already belongs to a staff member`);
      if (seen.has(bid)) {
        const names = db.prepare('SELECT full_name FROM students WHERE id IN (?, ?)').all(sid, seen.get(bid)).map(r => r.full_name).join(' and ');
        return err400(res, `Biometric ID ${bid} is given to both ${names}`);
      }
      seen.set(bid, sid);
    }
    const upd = db.prepare('UPDATE students SET biometric_id = ? WHERE id = ?');
    let result;
    db.transaction(() => {
      for (const [sid, bid] of ids) upd.run(bid || null, sid);
      result = relink();
    })();
    res.json({ ok: true, saved: ids.size, ...result });
  },
  applyStudents(req, res) {
    const { from, to } = req.body || {};
    if (!isDate(from) || !isDate(to)) return err400(res, 'Choose From and To dates');
    if (from > to) return err400(res, 'From date must not be after To date');
    if (!studentSettings().enabled) return err400(res, 'Turn on student attendance from punches first');
    const keys = db.prepare('SELECT DISTINCT student_id, punch_date FROM bio_punches WHERE student_id IS NOT NULL AND punch_date BETWEEN ? AND ?')
      .all(from, to).map(r => `${r.student_id}|${r.punch_date}`);
    let out;
    db.transaction(() => { out = applyStudentDays(keys); })();
    res.json({ ok: true, days: keys.length, ...out });
  },
  relinkNow(req, res) {
    let result;
    db.transaction(() => { result = relink(); })();
    res.json({ ok: true, ...result });
  },
};

// After mapping changes, attach unmapped punches to their person and feed staff punches into attendance.
function relink() {
  const pins = db.prepare('SELECT DISTINCT pin FROM bio_punches WHERE teacher_id IS NULL AND student_id IS NULL').all().map(r => r.pin);
  const touched = new Set();
  const studentDays = new Set();
  let linked = 0;
  const setWho = db.prepare('UPDATE bio_punches SET teacher_id = ?, student_id = ? WHERE pin = ? AND teacher_id IS NULL AND student_id IS NULL');
  for (const pin of pins) {
    const who = lookupPin(pin);
    if (!who.teacher_id && !who.student_id) continue;
    const rows = db.prepare(`SELECT p.punch_date, p.punch_time, d.sn FROM bio_punches p JOIN bio_devices d ON d.id = p.device_id
      WHERE p.pin = ? AND p.teacher_id IS NULL AND p.student_id IS NULL`).all(pin);
    linked += setWho.run(who.teacher_id, who.student_id, pin).changes;
    if (who.teacher_id) for (const r of rows) feedHr(who.teacher_id, r.punch_date, r.punch_time, r.sn, touched);
    if (who.student_id) for (const r of rows) studentDays.add(`${who.student_id}|${r.punch_date}`);
  }
  const students = applyStudentDays(studentDays);
  return { punches_linked: linked, days_updated: recomputeTouched(touched), student_days_marked: students.marked };
}

/* ---------- Reports ---------- */
registerReport({
  key: 'bio-punch-log', title: 'Device Punch Log', group: 'Human Resource',
  description: 'Every punch received live from the biometric devices.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'today' }, { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'teacher_id', label: 'Staff', type: 'teacher' }, { name: 'sn', label: 'Device Serial No', type: 'text' },
  ],
  columns: [
    { key: 'punch_date', label: 'Date', type: 'date' }, { key: 'punch_time', label: 'Time' }, { key: 'pin', label: 'Biometric ID' },
    { key: 'person', label: 'Name' }, { key: 'employee_no', label: 'Emp / Adm No' }, { key: 'device_name', label: 'Device' },
    { key: 'verify', label: 'Verified By' }, { key: 'received_at', label: 'Received (UTC)' },
  ],
  run: (p) => db.prepare(`
    SELECT p.punch_date, p.punch_time, p.pin, COALESCE(t.full_name, s.full_name, 'Unmapped PIN') AS person,
      COALESCE(t.employee_no, s.admission_no) AS employee_no, d.name AS device_name, p.received_at,
      CASE p.verify_code WHEN '1' THEN 'Fingerprint' WHEN '15' THEN 'Face' WHEN '4' THEN 'Card' WHEN '3' THEN 'Password' ELSE p.verify_code END AS verify
    FROM bio_punches p JOIN bio_devices d ON d.id = p.device_id
    LEFT JOIN teachers t ON t.id = p.teacher_id LEFT JOIN students s ON s.id = p.student_id
    WHERE p.punch_date BETWEEN ? AND ? AND (? = '' OR p.teacher_id = ?) AND (? = '' OR d.sn = ?)
    ORDER BY p.punch_at DESC LIMIT 5000`).all(p.from, p.to, p.teacher_id, p.teacher_id, p.sn, p.sn),
});

registerReport({
  key: 'bio-unmapped-pins', title: 'Unmapped Biometric IDs', group: 'Human Resource',
  description: 'Punches whose biometric ID is not linked to any staff member or student yet.',
  columns: [
    { key: 'pin', label: 'Biometric ID' }, { key: 'punches', label: 'Punches', type: 'number', total: true },
    { key: 'first_punch', label: 'First Punch' }, { key: 'last_punch', label: 'Last Punch' }, { key: 'devices', label: 'Devices' },
  ],
  run: () => db.prepare(`
    SELECT p.pin, COUNT(*) AS punches, MIN(p.punch_at) AS first_punch, MAX(p.punch_at) AS last_punch, GROUP_CONCAT(DISTINCT d.name) AS devices
    FROM bio_punches p JOIN bio_devices d ON d.id = p.device_id
    WHERE p.teacher_id IS NULL AND p.student_id IS NULL GROUP BY p.pin ORDER BY last_punch DESC`).all(),
});

registerReport({
  key: 'bio-device-status', title: 'Biometric Device Status', group: 'Human Resource',
  description: `Online means the device contacted the server in the last ${ONLINE_MINUTES} minutes.`,
  columns: [
    { key: 'name', label: 'Device' }, { key: 'sn', label: 'Serial No' }, { key: 'location', label: 'Location' },
    { key: 'state', label: 'Status' }, { key: 'last_seen', label: 'Last Contact (UTC)' }, { key: 'last_punch', label: 'Last Punch' },
    { key: 'punches_today', label: 'Punches Today', type: 'number', total: true }, { key: 'last_ip', label: 'IP' },
  ],
  run: () => deviceRows().map(d => ({ ...d, state: !d.active ? 'Disabled' : d.online ? 'Online' : d.last_seen ? 'Offline' : 'Never connected' })),
});

function register(router) {
  const A = [auth, role(...ROLES.ADMIN)];
  router.get('/biometric/info', ...A, api.info);
  router.get('/biometric/devices', ...A, api.devices);
  router.post('/biometric/devices', ...A, safe(api.createDevice));
  router.put('/biometric/devices/:id', ...A, safe(api.updateDevice));
  router.delete('/biometric/devices/:id', ...A, safe(api.removeDevice));
  router.get('/biometric/devices/:id/commands', ...A, api.commands);
  router.post('/biometric/devices/:id/commands', ...A, safe(api.queueCommand));
  router.get('/biometric/unregistered', ...A, api.unregistered);
  router.post('/biometric/unregistered/:sn/approve', ...A, safe(api.approve));
  router.delete('/biometric/unregistered/:sn', ...A, safe(api.dismiss));
  router.get('/biometric/punches', ...A, safe(api.punches));
  router.get('/biometric/unmapped', ...A, api.unmapped);
  router.get('/biometric/mapping', ...A, api.mapping);
  router.put('/biometric/mapping', ...A, safe(api.saveMapping));
  router.post('/biometric/relink', ...A, safe(api.relinkNow));
  router.get('/biometric/students/settings', ...A, api.studentSettings);
  router.put('/biometric/students/settings', ...A, safe(api.saveStudentSettings));
  router.get('/biometric/students/mapping', ...A, api.studentMapping);
  router.put('/biometric/students/mapping', ...A, safe(api.saveStudentMapping));
  router.post('/biometric/students/apply', ...A, safe(api.applyStudents));
}

module.exports = { register, registerRoot, parseAttlogLine, applyStudentDay };
