// Communication: staff/student groups, SMS & email sending to staff, students, classes, sections and
// transport routes, the sent box (batches, resend failed), delivery summary, survey voting and
// file attachments for announcements and activities.
const {
  db, ROLES, auth, role, safe, addColumn, isStaff, today, isDate, badUrl,
  registerMaster, registerReport, messaging,
} = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS comm_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('staff','student')),
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(kind, name)
  );
  CREATE TABLE IF NOT EXISTS comm_group_members (
    group_id INTEGER NOT NULL REFERENCES comm_groups(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, member_id)
  );
  CREATE TABLE IF NOT EXISTS comm_survey_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    option_no INTEGER NOT NULL CHECK (option_no BETWEEN 1 AND 4),
    voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(survey_id, user_id)
  );
`);
addColumn('announcements', 'attachment TEXT');
addColumn('announcements', 'attachment_name TEXT');
addColumn('activities', 'file_urls TEXT');
// Set on a failed/undelivered log row once a resend of it was delivered, so it isn't resent again.
addColumn('message_log', 'resent_batch TEXT');

registerMaster({
  type: 'message-templates', title: 'Message Templates', group: 'Communication',
  description: 'Reusable SMS/email texts. {name} is replaced with each recipient\'s name.',
  fields: [{ name: 'body', label: 'Message', type: 'textarea' }],
  seed: [
    { name: 'Absent today', body: 'Dear Parent, {name} is absent from school today. Please inform the class teacher of the reason.' },
    { name: 'Fee reminder', body: 'Dear Parent, the fee for {name} is due. Kindly pay at the earliest to avoid a late fine.' },
    { name: 'PTM', body: 'Dear Parent, a Parent-Teacher Meeting for {name} is on Saturday at 10:00 AM. Your presence is requested.' },
    { name: 'Holiday', body: 'Dear Parent, the school will remain closed tomorrow. Classes resume the next working day.' },
    { name: 'Staff meeting', body: 'Dear {name}, a staff meeting is scheduled today after school in the conference room.' },
  ],
});

/* ---------- Helpers ---------- */
const idList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(Number).filter(n => Number.isInteger(n) && n > 0);
const inList = (ids) => ids.map(() => '?').join(',') || 'NULL';
const http400 = (msg) => Object.assign(new Error(msg), { status: 400 });

function viewerStudent(user) {
  if (isStaff(user) || !user.linked_id) return null;
  return db.prepare(`SELECT s.id, s.class_id, c.name AS class_name, c.section FROM students s
    LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`).get(user.linked_id) || null;
}

const STUDENT_COLS = `s.id, s.full_name AS name, s.contact AS phone, s.email, s.admission_no,
  c.name || ' ' || c.section AS detail`;
const STUDENT_FROM = `FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE COALESCE(s.status, 'active') = 'active'`;
// School messages go to the official (school) address; the personal one only when there isn't one.
const STAFF_COLS = `t.id, t.full_name AS name, t.phone, COALESCE(NULLIF(t.official_email, ''), t.email) AS email, t.employee_no, COALESCE(t.designation, t.subject) AS detail`;
const STAFF_FROM = `FROM teachers t WHERE COALESCE(t.status, 'active') = 'active'`;

const TARGETS = {
  all_staff: { label: 'All Staff', sql: () => [`SELECT ${STAFF_COLS} ${STAFF_FROM} ORDER BY t.full_name`, []] },
  staff: { label: 'Selected Staff', sql: (ids) => [`SELECT ${STAFF_COLS} ${STAFF_FROM} AND t.id IN (${inList(ids)}) ORDER BY t.full_name`, ids] },
  staff_group: {
    label: 'Staff Group',
    sql: (ids) => [`SELECT DISTINCT ${STAFF_COLS} ${STAFF_FROM} AND t.id IN (
      SELECT m.member_id FROM comm_group_members m JOIN comm_groups g ON g.id = m.group_id
      WHERE g.kind = 'staff' AND g.id IN (${inList(ids)})) ORDER BY t.full_name`, ids],
  },
  all_students: { label: 'All Students', sql: () => [`SELECT ${STUDENT_COLS} ${STUDENT_FROM} ORDER BY c.name, c.section, s.roll_no, s.full_name`, []] },
  students: { label: 'Selected Students', sql: (ids) => [`SELECT ${STUDENT_COLS} ${STUDENT_FROM} AND s.id IN (${inList(ids)}) ORDER BY s.full_name`, ids] },
  student_group: {
    label: 'Student Group',
    sql: (ids) => [`SELECT DISTINCT ${STUDENT_COLS} ${STUDENT_FROM} AND s.id IN (
      SELECT m.member_id FROM comm_group_members m JOIN comm_groups g ON g.id = m.group_id
      WHERE g.kind = 'student' AND g.id IN (${inList(ids)})) ORDER BY s.full_name`, ids],
  },
  // A "class" is every section with that class name (e.g. all of Class 8); a "section" is one class row.
  class: {
    label: 'Classwise',
    names: true,
    sql: (names) => [`SELECT ${STUDENT_COLS} ${STUDENT_FROM} AND c.name IN (${inList(names)}) ORDER BY c.name, c.section, s.roll_no`, names],
  },
  section: { label: 'Section wise', sql: (ids) => [`SELECT ${STUDENT_COLS} ${STUDENT_FROM} AND s.class_id IN (${inList(ids)}) ORDER BY c.name, c.section, s.roll_no`, ids] },
  route: {
    label: 'Transport Route',
    sql: (ids) => [`SELECT ${STUDENT_COLS}, r.name AS route_name
      FROM students s LEFT JOIN classes c ON c.id = s.class_id
      JOIN student_transport st ON st.student_id = s.id JOIN routes r ON r.id = st.route_id
      WHERE COALESCE(s.status, 'active') = 'active' AND st.route_id IN (${inList(ids)})
      ORDER BY r.name, s.full_name`, ids],
  },
};

function resolveTarget(target) {
  const t = target && TARGETS[target.type];
  if (!t) throw http400(`target.type must be one of: ${Object.keys(TARGETS).join(', ')}`);
  let ids;
  if (t.names) {
    ids = (Array.isArray(target.names) ? target.names : []).map(String).filter(Boolean);
    if (!ids.length) throw http400('Choose at least one class');
  } else {
    ids = idList(target.ids);
    if (t.sql.length && !ids.length) throw http400('Choose at least one recipient');
  }
  const [sql, params] = t.sql(ids);
  return { label: t.label, rows: db.prepare(sql).all(...params) };
}

function describeTarget(target, count) {
  const t = TARGETS[target.type];
  return `${t ? t.label : target.type} (${count})`.slice(0, 120);
}

function recipientsFor(channel, rows) {
  const key = channel === 'email' ? 'email' : 'phone';
  const withTo = rows.filter(r => r[key]);
  return { recipients: withTo.map(r => ({ to: r[key], name: r.name, detail: r.detail || r.route_name || '' })), missing: rows.length - withTo.length };
}

/* ---------- Groups ---------- */
const groups = {
  list(req, res) {
    const kind = req.query.kind;
    if (kind && !['staff', 'student'].includes(kind)) return res.status(400).json({ error: 'kind must be staff or student' });
    res.json(db.prepare(`
      SELECT g.*, (SELECT COUNT(*) FROM comm_group_members m WHERE m.group_id = g.id) AS member_count
      FROM comm_groups g ${kind ? 'WHERE g.kind = ?' : ''} ORDER BY g.kind, g.name`).all(...(kind ? [kind] : [])));
  },
  create(req, res) {
    const { kind, name, description } = req.body || {};
    if (!['staff', 'student'].includes(kind)) return res.status(400).json({ error: 'kind must be staff or student' });
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Group name is required' });
    const info = db.prepare('INSERT INTO comm_groups (kind, name, description, created_by) VALUES (?, ?, ?, ?)')
      .run(kind, String(name).trim(), description || null, req.user.id);
    if (req.body.member_ids) setMembers(info.lastInsertRowid, kind, req.body.member_ids);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  update(req, res) {
    const g = db.prepare('SELECT * FROM comm_groups WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ error: 'Not found' });
    const name = 'name' in req.body ? String(req.body.name || '').trim() : g.name;
    if (!name) return res.status(400).json({ error: 'Group name cannot be empty' });
    db.prepare('UPDATE comm_groups SET name = ?, description = ? WHERE id = ?')
      .run(name, 'description' in req.body ? req.body.description || null : g.description, g.id);
    res.json({ ok: true });
  },
  remove(req, res) {
    const info = db.prepare('DELETE FROM comm_groups WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
  members(req, res) {
    const g = db.prepare('SELECT * FROM comm_groups WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ error: 'Not found' });
    const rows = g.kind === 'staff'
      ? db.prepare(`SELECT ${STAFF_COLS} FROM teachers t JOIN comm_group_members m ON m.member_id = t.id WHERE m.group_id = ? ORDER BY t.full_name`).all(g.id)
      : db.prepare(`SELECT ${STUDENT_COLS} FROM students s LEFT JOIN classes c ON c.id = s.class_id JOIN comm_group_members m ON m.member_id = s.id WHERE m.group_id = ? ORDER BY s.full_name`).all(g.id);
    res.json({ group: g, members: rows });
  },
  setMembers(req, res) {
    const g = db.prepare('SELECT * FROM comm_groups WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ error: 'Not found' });
    const n = setMembers(g.id, g.kind, req.body.member_ids);
    res.json({ ok: true, member_count: n });
  },
};

function setMembers(groupId, kind, memberIds) {
  const ids = [...new Set(idList(memberIds))];
  const table = kind === 'staff' ? 'teachers' : 'students';
  const found = ids.length ? db.prepare(`SELECT id FROM ${table} WHERE id IN (${inList(ids)})`).all(...ids).map(r => r.id) : [];
  if (found.length !== ids.length) throw http400(`Some selected ${kind === 'staff' ? 'staff' : 'students'} do not exist`);
  db.transaction(() => {
    db.prepare('DELETE FROM comm_group_members WHERE group_id = ?').run(groupId);
    const ins = db.prepare('INSERT INTO comm_group_members (group_id, member_id) VALUES (?, ?)');
    for (const id of found) ins.run(groupId, id);
  })();
  return found.length;
}

/* ---------- Sending ---------- */
function preview(req, res) {
  const channel = ['sms', 'email', 'whatsapp'].includes(req.body.channel) ? req.body.channel : 'sms';
  const { rows } = resolveTarget(req.body.target);
  const { recipients, missing } = recipientsFor(channel, rows);
  res.json({ channel, configured: messaging.status()[channel], total: rows.length, missing, recipients });
}

async function send(req, res, next) {
  try {
    const { channel, target, subject } = req.body || {};
    const body = String(req.body.body || '').trim();
    if (!['sms', 'email', 'whatsapp'].includes(channel)) return res.status(400).json({ error: 'channel must be sms, email or whatsapp' });
    if (!body) return res.status(400).json({ error: 'Message is required' });
    if (body.length > 1000) return res.status(400).json({ error: 'Message is too long (max 1000 characters)' });
    if (channel === 'email' && !String(subject || '').trim()) return res.status(400).json({ error: 'Subject is required for email' });
    const { rows } = resolveTarget(target);
    const { recipients, missing } = recipientsFor(channel, rows);
    if (!recipients.length) return res.status(400).json({ error: `None of the ${rows.length} selected people have ${channel === 'email' ? 'an email address' : 'a phone number'}` });
    const r = await messaging.send({ channel, recipients, subject, body, userId: req.user.id, audience: describeTarget(target, recipients.length) });
    res.json({ ...r, missing, configured: messaging.status()[channel] });
  } catch (e) { if (e.status === 400) return res.status(400).json({ error: e.message }); next(e); }
}

/* ---------- Sent box ---------- */
function batchFilters(req) {
  const w = ['m.batch_id IS NOT NULL'], p = [];
  if (req.user.role !== 'admin') { w.push('m.sent_by = ?'); p.push(req.user.id); }
  if (req.query.channel) { w.push('m.channel = ?'); p.push(req.query.channel); }
  if (isDate(req.query.from)) { w.push("date(m.created_at, 'localtime') >= ?"); p.push(req.query.from); }
  if (isDate(req.query.to)) { w.push("date(m.created_at, 'localtime') <= ?"); p.push(req.query.to); }
  if (req.query.q) { w.push('(m.body LIKE ? OR m.subject LIKE ? OR m.recipient LIKE ? OR m.recipient_name LIKE ?)'); const q = `%${req.query.q}%`; p.push(q, q, q, q); }
  return [w, p];
}

const sentBox = {
  batches(req, res) {
    const [w, p] = batchFilters(req);
    let rows = db.prepare(`
      SELECT m.batch_id, m.channel, MIN(m.created_at) AS sent_at, MAX(m.subject) AS subject, MAX(m.body) AS sample_body,
        u.full_name AS sent_by_name, COUNT(*) AS total,
        SUM(m.status = 'sent') AS sent, SUM(m.status = 'failed') AS failed, SUM(m.status = 'not_configured') AS not_configured,
        SUM(m.status != 'sent' AND m.resent_batch IS NOT NULL) AS resent
      FROM message_log m LEFT JOIN users u ON u.id = m.sent_by
      WHERE ${w.join(' AND ')} GROUP BY m.batch_id ORDER BY MIN(m.id) DESC LIMIT 300`).all(...p);
    if (req.query.status === 'failed') rows = rows.filter(r => r.failed > r.resent);
    if (req.query.status === 'not_configured') rows = rows.filter(r => r.not_configured > 0);
    if (req.query.status === 'sent') rows = rows.filter(r => r.sent === r.total);
    res.json(rows);
  },
  batch(req, res) {
    const rows = db.prepare(`SELECT m.*, u.full_name AS sent_by_name FROM message_log m LEFT JOIN users u ON u.id = m.sent_by
      WHERE m.batch_id = ? ORDER BY m.id`).all(req.params.batchId);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && rows[0].sent_by !== req.user.id) return res.status(404).json({ error: 'Not found' });
    res.json(rows);
  },
  async resend(req, res, next) {
    try {
      const rows = db.prepare('SELECT * FROM message_log WHERE batch_id = ? ORDER BY id').all(req.params.batchId);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      if (req.user.role !== 'admin' && rows[0].sent_by !== req.user.id) return res.status(404).json({ error: 'Not found' });
      const channel = rows[0].channel;
      if (!messaging.status()[channel]) return res.status(400).json({ error: `${channel.toUpperCase()} is not configured on the server yet` });
      const retry = rows.filter(r => (r.status === 'failed' || r.status === 'not_configured') && !r.resent_batch);
      if (!retry.length) return res.status(400).json({ error: 'Nothing to resend: every message in this batch has been delivered' });
      // Credential messages have their passwords masked in the log; never resend those.
      if (retry.some(r => r.body.includes('******'))) return res.status(400).json({ error: 'This batch contained login details and cannot be resent. Use Send Usernames and Password again.' });
      // Logged bodies already have {name} filled in, so resend each distinct text to its own recipients.
      const byBody = new Map();
      for (const r of retry) {
        const k = `${r.subject || ''}\u0000${r.body}`;
        if (!byBody.has(k)) byBody.set(k, { subject: r.subject, body: r.body, recipients: [], rows: [] });
        byBody.get(k).recipients.push({ to: r.recipient, name: r.recipient_name });
        byBody.get(k).rows.push(r);
      }
      const total = { total: 0, sent: 0, failed: 0, not_configured: 0, skipped: 0, batches: [] };
      for (const g of byBody.values()) {
        const r = await messaging.send({ channel, recipients: g.recipients, subject: g.subject, body: g.body, userId: req.user.id, audience: `resend:${req.params.batchId}` });
        for (const k of ['total', 'sent', 'failed', 'not_configured', 'skipped']) total[k] += r[k];
        total.batches.push(r.batch_id);
        const delivered = new Set(db.prepare("SELECT recipient FROM message_log WHERE batch_id = ? AND status = 'sent'").all(r.batch_id).map(x => x.recipient));
        const mark = db.prepare('UPDATE message_log SET resent_batch = ? WHERE id = ?');
        for (const row of g.rows) if (delivered.has(row.recipient)) mark.run(r.batch_id, row.id);
      }
      res.json(total);
    } catch (e) { next(e); }
  },
  summary(req, res) {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 366);
    const own = req.user.role !== 'admin';
    const rows = db.prepare(`
      SELECT channel, status, COUNT(*) AS c FROM message_log
      WHERE created_at >= datetime('now', ?) ${own ? 'AND sent_by = ?' : ''} GROUP BY channel, status`)
      .all(`-${days} days`, ...(own ? [req.user.id] : []));
    const blank = () => ({ sent: 0, failed: 0, not_configured: 0 });
    const out = { days, configured: messaging.status(), sms: blank(), email: blank(), whatsapp: blank() };
    for (const r of rows) (out[r.channel] ||= blank())[r.status] = r.c;
    out.batches = db.prepare(`SELECT COUNT(DISTINCT batch_id) AS c FROM message_log WHERE created_at >= datetime('now', ?) ${own ? 'AND sent_by = ?' : ''}`)
      .get(`-${days} days`, ...(own ? [req.user.id] : [])).c;
    res.json(out);
  },
};

/* ---------- Surveys ---------- */
const options = (s) => [1, 2, 3, 4].map(n => ({ no: n, text: s[`option${n}`] })).filter(o => o.text);

function surveyVisible(s, user) {
  if (isStaff(user)) return true;
  const st = viewerStudent(user);
  if (!st) return false;
  if (s.class_id && s.class_id !== st.class_id) return false;
  if (s.section && String(s.section).trim() && String(s.section).trim().toLowerCase() !== String(st.section || '').toLowerCase()) return false;
  return true;
}

const surveys = {
  open(req, res) {
    const rows = db.prepare(`SELECT s.*, c.name AS class_name, c.section AS class_section FROM surveys s
      LEFT JOIN classes c ON c.id = s.class_id WHERE s.expire_date >= ? ORDER BY s.expire_date`).all(today());
    const myVote = db.prepare('SELECT option_no FROM comm_survey_votes WHERE survey_id = ? AND user_id = ?');
    res.json(rows.filter(s => surveyVisible(s, req.user)).map(s => ({
      id: s.id, question: s.question, expire_date: s.expire_date, class_name: s.class_name, class_section: s.class_section,
      section: s.section, options: options(s), my_vote: myVote.get(s.id, req.user.id)?.option_no || null,
    })));
  },
  vote(req, res) {
    const s = db.prepare('SELECT * FROM surveys WHERE id = ?').get(req.params.id);
    if (!s || !surveyVisible(s, req.user)) return res.status(404).json({ error: 'Survey not found' });
    if (s.expire_date < today()) return res.status(400).json({ error: 'This survey has closed' });
    const opt = Number(req.body.option);
    if (!options(s).some(o => o.no === opt)) return res.status(400).json({ error: 'Choose one of the survey options' });
    try {
      db.prepare('INSERT INTO comm_survey_votes (survey_id, user_id, option_no) VALUES (?, ?, ?)').run(s.id, req.user.id, opt);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'You have already voted in this survey' });
      throw e;
    }
    res.status(201).json({ ok: true });
  },
  results(req, res) {
    const s = db.prepare(`SELECT s.*, c.name AS class_name, c.section AS class_section FROM surveys s
      LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(surveyResult(s));
  },
  allResults(req, res) {
    const rows = db.prepare(`SELECT s.*, c.name AS class_name, c.section AS class_section FROM surveys s
      LEFT JOIN classes c ON c.id = s.class_id ORDER BY s.created_at DESC`).all();
    res.json(rows.map(surveyResult));
  },
};

function surveyResult(s) {
  const counts = Object.fromEntries(db.prepare('SELECT option_no, COUNT(*) AS c FROM comm_survey_votes WHERE survey_id = ? GROUP BY option_no')
    .all(s.id).map(r => [r.option_no, r.c]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const opts = options(s).map(o => ({ ...o, votes: counts[o.no] || 0, pct: total ? Math.round(((counts[o.no] || 0) / total) * 1000) / 10 : 0 }));
  const top = total ? opts.reduce((a, b) => (b.votes > a.votes ? b : a)) : null;
  return {
    id: s.id, question: s.question, expire_date: s.expire_date, open: s.expire_date >= today(),
    audience: s.class_name ? `${s.class_name}${s.section ? ' ' + s.section : ''}` : s.section ? `Section ${s.section}` : 'All',
    total, options: opts, leading: top ? top.text : null,
  };
}

registerReport({
  key: 'survey-summary', title: 'Survey Report', group: 'Communication', roles: ROLES.STAFF,
  description: 'Votes received per survey and the leading answer.',
  params: [{ name: 'state', label: 'Status', type: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] }],
  columns: [
    { key: 'question', label: 'Question' }, { key: 'audience', label: 'For' }, { key: 'expire_date', label: 'Closes', type: 'date' },
    { key: 'total', label: 'Votes', type: 'number', total: true }, { key: 'leading', label: 'Leading Answer' },
    { key: 'breakdown', label: 'Breakdown' },
  ],
  run: (p) => db.prepare(`SELECT s.*, c.name AS class_name, c.section AS class_section FROM surveys s LEFT JOIN classes c ON c.id = s.class_id ORDER BY s.created_at DESC`).all()
    .map(surveyResult)
    .filter(r => !p.state || (p.state === 'open') === r.open)
    .map(r => ({ ...r, breakdown: r.options.map(o => `${o.text}: ${o.votes} (${o.pct}%)`).join(' · ') })),
});

registerReport({
  key: 'message-delivery', title: 'Message Delivery Report', group: 'Communication', roles: ROLES.STAFF,
  description: 'Every SMS and email sent, with its delivery status.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'channel', label: 'Channel', type: 'select', options: [{ value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }] },
    { name: 'status', label: 'Status', type: 'select', options: [
      { value: 'sent', label: 'Sent' }, { value: 'failed', label: 'Failed' }, { value: 'not_configured', label: 'Not configured' }] },
  ],
  columns: [
    { key: 'sent_at', label: 'Time' }, { key: 'channel', label: 'Channel' }, { key: 'recipient_name', label: 'Name' },
    { key: 'recipient', label: 'To' }, { key: 'body', label: 'Message' }, { key: 'status', label: 'Status' },
    { key: 'error', label: 'Error' }, { key: 'sent_by_name', label: 'Sent By' },
  ],
  run: (p, user) => db.prepare(`
    SELECT datetime(m.created_at, 'localtime') AS sent_at, m.channel, m.recipient_name, m.recipient, m.body, m.status, m.error, u.full_name AS sent_by_name
    FROM message_log m LEFT JOIN users u ON u.id = m.sent_by
    WHERE date(m.created_at, 'localtime') BETWEEN ? AND ? AND (? = '' OR m.channel = ?) AND (? = '' OR m.status = ?)
      AND (? = 'admin' OR m.sent_by = ?)
    ORDER BY m.id DESC LIMIT 5000`).all(p.from, p.to, p.channel, p.channel, p.status, p.status, user.role, user.id),
});

/* ---------- Attachments on existing records ---------- */
function checkUrls(list, label) {
  for (const u of list) { const bad = badUrl(u, label); if (bad) return bad; }
  return null;
}
const splitList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean);

function setAnnouncementAttachment(req, res) {
  const a = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && a.posted_by !== req.user.id) return res.status(403).json({ error: 'You can only change your own announcements' });
  const url = req.body.attachment || null;
  const bad = badUrl(url, 'attachment');
  if (bad) return res.status(400).json({ error: bad });
  db.prepare('UPDATE announcements SET attachment = ?, attachment_name = ? WHERE id = ?')
    .run(url, url ? String(req.body.attachment_name || '').slice(0, 200) || null : null, a.id);
  res.json({ ok: true });
}

function setActivityFiles(req, res) {
  const a = db.prepare('SELECT id FROM activities WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const urls = splitList(req.body.file_urls);
  const names = splitList(req.body.file_names).map(n => n.replace(/,/g, ' '));
  if (urls.length > 30) return res.status(400).json({ error: 'At most 30 files per activity' });
  const bad = checkUrls(urls, 'file');
  if (bad) return res.status(400).json({ error: bad });
  db.prepare('UPDATE activities SET file_urls = ?, file_names = ? WHERE id = ?')
    .run(urls.join(',') || null, urls.length ? names.slice(0, urls.length).join(', ') : null, a.id);
  res.json({ ok: true });
}

function register(router) {
  const S = ROLES.STAFF, A = ROLES.ADMIN;
  router.get('/comm/groups', auth, role(...S), groups.list);
  router.post('/comm/groups', auth, role(...A), safe(groups.create));
  router.put('/comm/groups/:id', auth, role(...A), safe(groups.update));
  router.delete('/comm/groups/:id', auth, role(...A), safe(groups.remove));
  router.get('/comm/groups/:id/members', auth, role(...S), groups.members);
  router.put('/comm/groups/:id/members', auth, role(...A), safe(groups.setMembers));

  router.post('/comm/recipients', auth, role(...S), safe(preview));
  router.post('/comm/send', auth, role(...S), send);
  router.get('/comm/batches', auth, role(...S), sentBox.batches);
  router.get('/comm/batches/:batchId', auth, role(...S), sentBox.batch);
  router.post('/comm/batches/:batchId/resend', auth, role(...S), sentBox.resend);
  router.get('/comm/summary', auth, role(...S), sentBox.summary);

  router.get('/comm/surveys/open', auth, surveys.open);
  router.post('/comm/surveys/:id/vote', auth, safe(surveys.vote));
  router.get('/comm/surveys/results', auth, role(...S), surveys.allResults);
  router.get('/comm/surveys/:id/results', auth, role(...S), surveys.results);

  router.put('/comm/announcements/:id/attachment', auth, role(...S), safe(setAnnouncementAttachment));
  router.put('/comm/activities/:id/files', auth, role(...S), safe(setActivityFiles));
}

module.exports = { register, viewerStudent };
