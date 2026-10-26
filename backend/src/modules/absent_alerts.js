// Absent alerts: when attendance is saved, text the parents of students marked absent today
// (SMS and/or WhatsApp), at most once per student per day. Phone push for absences is already sent by the push module.
const { db, ROLES, auth, role, safe, today, isDate, messaging } = require('./_kit');
const events = require('../utils/events');

db.exec(`
  CREATE TABLE IF NOT EXISTS absent_alert_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    channels TEXT NOT NULL DEFAULT '["sms"]',
    template TEXT NOT NULL,
    cutoff_time TEXT
  );
  CREATE TABLE IF NOT EXISTS absent_alert_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    channels TEXT,
    phone TEXT,
    result TEXT,
    sent_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, date)
  );
`);
const DEFAULT_TEMPLATE = 'Dear Parent, {name} of {class} is absent from school today ({date}). If this is unexpected, please contact the school office. - {school}';
db.prepare('INSERT OR IGNORE INTO absent_alert_settings (id, enabled, channels, template) VALUES (1, 0, ?, ?)').run('["sms"]', DEFAULT_TEMPLATE);

const CHANNELS = ['sms', 'whatsapp'];
const httpError = (status, message) => Object.assign(new Error(message), { status });

function settings() {
  const s = db.prepare('SELECT * FROM absent_alert_settings WHERE id = 1').get();
  let channels = [];
  try { channels = JSON.parse(s.channels).filter(c => CHANNELS.includes(c)); } catch { channels = ['sms']; }
  return { enabled: !!s.enabled, channels, template: s.template, cutoff_time: s.cutoff_time || '' };
}

const nowHHMM = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };

function render(template, row, date, school) {
  return template
    .replace(/\{name\}/g, row.full_name)
    .replace(/\{class\}/g, row.class_name ? `${row.class_name} ${row.class_section || ''}`.trim() : 'your class')
    .replace(/\{date\}/g, date.split('-').reverse().join('/'))
    .replace(/\{school\}/g, school);
}

/**
 * Alert parents of the given absent students for `date`. Students already alerted that day are skipped,
 * so saving the attendance sheet twice never texts a parent twice.
 */
async function alertAbsent(studentIds, date, userId, { force = false } = {}) {
  const s = settings();
  if (!force && !s.enabled) return { skipped: 'disabled' };
  if (date !== today()) return { skipped: 'not today' };
  if (!force && s.cutoff_time && nowHHMM() > s.cutoff_time) return { skipped: 'after cutoff' };
  if (!s.channels.length || !studentIds.length) return { alerted: 0 };
  const school = db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get()?.school_name || 'School';
  const placeholders = studentIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT s.id, s.full_name, s.contact, c.name AS class_name, c.section AS class_section
    FROM students s LEFT JOIN classes c ON c.id = s.class_id JOIN attendance a ON a.student_id = s.id AND a.date = ? AND a.status = 'absent'
    WHERE s.id IN (${placeholders}) AND COALESCE(s.status, 'active') = 'active'`).all(date, ...studentIds);
  const claim = db.prepare('INSERT OR IGNORE INTO absent_alert_log (student_id, date, channels, phone, sent_by) VALUES (?, ?, ?, ?, ?)');
  // Claim each student first (unique per day) so two saves arriving together can't both send.
  const fresh = rows.filter(r => claim.run(r.id, date, JSON.stringify(s.channels), r.contact || null, userId || null).changes);
  if (!fresh.length) return { alerted: 0 };
  const recipients = fresh.filter(r => r.contact).map(r => ({ to: r.contact, name: r.full_name, body: render(s.template, r, date, school) }));
  const results = {};
  for (const ch of s.channels) {
    results[ch] = recipients.length
      ? await messaging.send({ channel: ch, recipients, body: s.template, userId, audience: `absent-alert:${date}` })
      : { total: 0 };
  }
  const summary = Object.entries(results).map(([ch, r]) => `${ch}: ${r.sent || 0} sent, ${r.failed || 0} failed, ${r.not_configured || 0} not configured`).join('; ');
  const upd = db.prepare('UPDATE absent_alert_log SET result = ? WHERE student_id = ? AND date = ?');
  for (const r of fresh) upd.run(r.contact ? summary : 'no phone number', r.id, date);
  return { alerted: fresh.length, no_phone: fresh.length - recipients.length, results };
}

events.on('api:change', (e) => {
  if (e.method !== 'POST' || e.path !== '/api/attendance/bulk') return;
  const records = Array.isArray(e.body?.records) ? e.body.records : [];
  const absent = [...new Set(records.filter(r => r && r.status === 'absent').map(r => Number(r.student_id)).filter(Boolean))];
  if (!absent.length || !isDate(e.body.date)) return;
  alertAbsent(absent, e.body.date, e.user?.id).catch(err => console.error('absent alert failed:', err.message));
});

const h = {
  get(req, res) {
    res.json({ ...settings(), configured: messaging.status(), default_template: DEFAULT_TEMPLATE, placeholders: ['{name}', '{class}', '{date}', '{school}'] });
  },
  update(req, res) {
    const b = req.body || {};
    const cur = settings();
    const channels = Array.isArray(b.channels) ? [...new Set(b.channels)] : cur.channels;
    if (channels.some(c => !CHANNELS.includes(c))) throw httpError(400, 'channels can only be sms and/or whatsapp');
    const template = 'template' in b ? String(b.template || '').trim() : cur.template;
    if (!template) throw httpError(400, 'Message template cannot be empty');
    if (template.length > 600) throw httpError(400, 'Message template is too long (max 600 characters)');
    const cutoff = 'cutoff_time' in b ? String(b.cutoff_time || '') : cur.cutoff_time;
    if (cutoff && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) throw httpError(400, 'Cut-off time must be HH:MM');
    const enabled = 'enabled' in b ? (b.enabled ? 1 : 0) : (cur.enabled ? 1 : 0);
    if (enabled && !channels.length) throw httpError(400, 'Choose at least one channel');
    db.prepare('UPDATE absent_alert_settings SET enabled = ?, channels = ?, template = ?, cutoff_time = ? WHERE id = 1')
      .run(enabled, JSON.stringify(channels), template, cutoff || null);
    res.json(settings());
  },
  log(req, res) {
    const date = isDate(req.query.date) ? req.query.date : today();
    res.json(db.prepare(`SELECT l.*, s.full_name, s.admission_no, c.name AS class_name, c.section AS class_section, u.full_name AS sent_by_name
      FROM absent_alert_log l JOIN students s ON s.id = l.student_id LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN users u ON u.id = l.sent_by
      WHERE l.date = ? ORDER BY c.name, c.section, s.full_name`).all(date));
  },
  // Send now to today's absentees who haven't been alerted yet (e.g. after switching alerts on).
  async run(req, res, next) {
    try {
      const date = today();
      const ids = db.prepare("SELECT student_id FROM attendance WHERE date = ? AND status = 'absent'").all(date).map(r => r.student_id);
      res.json({ date, absent: ids.length, ...(await alertAbsent(ids, date, req.user.id, { force: true })) });
    } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
  },
  preview(req, res) {
    const s = settings();
    const sample = { full_name: 'Aarav Gupta', class_name: 'Class 8', class_section: 'A' };
    const school = db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get()?.school_name || 'School';
    res.json({ text: render(String(req.query.template || s.template), sample, today(), school) });
  },
};

const wrap = (fn) => safe((req, res, next) => {
  try { return fn(req, res, next); } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); throw e; }
});

function register(router) {
  router.get('/absent-alerts/settings', auth, role(...ROLES.ADMIN), h.get);
  router.put('/absent-alerts/settings', auth, role(...ROLES.ADMIN), wrap(h.update));
  router.get('/absent-alerts/log', auth, role(...ROLES.STAFF), h.log);
  router.get('/absent-alerts/preview', auth, role(...ROLES.ADMIN), h.preview);
  router.post('/absent-alerts/run', auth, role(...ROLES.ADMIN), h.run);
}

module.exports = { register, alertAbsent };
