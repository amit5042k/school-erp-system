// Lookups and features used by several areas: shared master lists and sending login credentials.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, ROLES, auth, role, registerMaster, registerReport, messaging } = require('./_kit');

registerMaster({
  type: 'subjects', title: 'Subjects', group: 'Examination', read: ROLES.ALL,
  description: 'Subjects taught in the school. Used by class subjects, marks, timetable and report cards.',
  fields: [{ name: 'subject_type', label: 'Type', type: 'select', options: ['Scholastic', 'Co-Scholastic', 'Pre-Primary', 'Optional'] }],
  seed: [
    { name: 'English', code: 'ENG', subject_type: 'Scholastic' }, { name: 'Hindi', code: 'HIN', subject_type: 'Scholastic' },
    { name: 'Mathematics', code: 'MAT', subject_type: 'Scholastic' }, { name: 'Science', code: 'SCI', subject_type: 'Scholastic' },
    { name: 'Social Science', code: 'SST', subject_type: 'Scholastic' }, { name: 'Punjabi', code: 'PUN', subject_type: 'Scholastic' },
    { name: 'Computer Science', code: 'CS', subject_type: 'Scholastic' }, { name: 'Physics', code: 'PHY', subject_type: 'Scholastic' },
    { name: 'Chemistry', code: 'CHE', subject_type: 'Scholastic' }, { name: 'Biology', code: 'BIO', subject_type: 'Scholastic' },
    { name: 'Accountancy', code: 'ACC', subject_type: 'Scholastic' }, { name: 'Business Studies', code: 'BST', subject_type: 'Scholastic' },
    { name: 'Economics', code: 'ECO', subject_type: 'Scholastic' }, { name: 'Physical Education', code: 'PE', subject_type: 'Co-Scholastic' },
    { name: 'Art Education', code: 'ART', subject_type: 'Co-Scholastic' }, { name: 'Work Education', code: 'WE', subject_type: 'Co-Scholastic' },
  ],
});
registerMaster({
  type: 'departments', title: 'Departments', group: 'Human Resource', read: ROLES.STAFF,
  seed: ['Administration', 'Primary', 'Middle', 'Senior Secondary', 'Science', 'Commerce', 'Humanities', 'Sports', 'Accounts', 'Transport', 'Support Staff'],
});
registerMaster({
  type: 'designations', title: 'Designations', group: 'Human Resource', read: ROLES.STAFF,
  seed: ['Principal', 'Vice Principal', 'Headmistress', 'PGT', 'TGT', 'PRT', 'NTT', 'Librarian', 'Accountant', 'Clerk', 'Lab Assistant', 'Driver', 'Conductor', 'Peon', 'Guard'],
});
registerMaster({
  type: 'staff-categories', title: 'Staff Categories', group: 'Human Resource', read: ROLES.STAFF,
  seed: ['Teaching', 'Non-Teaching', 'Administrative', 'Support', 'Contractual'],
});

/* ---------- Send usernames and passwords ---------- */
// Generates a fresh temporary password per account, marks it must-change, and sends it by SMS or email.
const tempPassword = () => crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).padEnd(8, '7');

function recipientsFor(roleName, ids) {
  // Accounts linked to the chosen teachers/students; parents get their child's student id.
  const placeholders = ids.map(() => '?').join(',');
  if (roleName === 'teacher') {
    return db.prepare(`
      SELECT u.id AS user_id, u.username, t.full_name AS name, t.phone, COALESCE(u.email, t.email) AS email
      FROM users u JOIN teachers t ON t.id = u.linked_id
      WHERE u.role = 'teacher' AND u.active = 1 AND u.linked_id IN (${placeholders})`).all(...ids);
  }
  return db.prepare(`
    SELECT u.id AS user_id, u.username, s.full_name AS name, s.contact AS phone, COALESCE(u.email, s.email) AS email
    FROM users u JOIN students s ON s.id = u.linked_id
    WHERE u.role = ? AND u.active = 1 AND u.linked_id IN (${placeholders})`).all(roleName, ...ids);
}

async function sendCredentials(req, res, next) {
  try {
    const { role: roleName, ids, channel } = req.body || {};
    if (!['teacher', 'student', 'parent'].includes(roleName)) return res.status(400).json({ error: 'role must be teacher, student or parent' });
    if (!['sms', 'email', 'screen'].includes(channel)) return res.status(400).json({ error: 'channel must be sms, email or screen' });
    // Never reset passwords we can't deliver, or people get locked out.
    if (channel !== 'screen' && !messaging.status()[channel]) {
      return res.status(400).json({ error: `${channel.toUpperCase()} is not configured on the server. Choose "Show on screen" to print the details instead.` });
    }
    const list = Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [];
    if (!list.length) return res.status(400).json({ error: 'Select at least one person' });

    const accounts = recipientsFor(roleName, list);
    const school = db.prepare('SELECT school_name, website FROM school_settings WHERE id = 1').get() || {};
    const setPw = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?');
    const results = { accounts: accounts.length, no_account: list.length - new Set(accounts.map(a => a.user_id)).size, sent: 0, failed: 0, not_configured: 0, skipped: 0, credentials: [] };
    for (const a of accounts) {
      if (channel === 'screen') {
        const pw = tempPassword();
        setPw.run(bcrypt.hashSync(pw, 10), a.user_id);
        results.credentials.push({ name: a.name, username: a.username, password: pw });
        continue;
      }
      const to = channel === 'sms' ? a.phone : a.email;
      if (!to) { results.skipped++; continue; }
      const pw = tempPassword();
      const body = `Dear {name}, your ${school.school_name || 'School ERP'} login: Username ${a.username}, Password ${pw}. `
        + `Please change it after signing in.${school.website ? ' ' + school.website : ''}`;
      const r = await messaging.send({ channel, recipients: [{ to, name: a.name }], subject: 'Your ERP login details', body, userId: req.user.id, audience: `credentials:${roleName}`, redact: [pw] });
      if (r.sent) setPw.run(bcrypt.hashSync(pw, 10), a.user_id);
      results.sent += r.sent; results.failed += r.failed; results.not_configured += r.not_configured; results.skipped += r.skipped;
    }
    res.json(results);
  } catch (e) { next(e); }
}

registerReport({
  key: 'staff-activity-log', title: 'Staff Activity Log', group: 'Human Resource',
  description: 'Logins and changes made by each user.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'user_role', label: 'Role', type: 'select', options: ['admin', 'teacher', 'student', 'parent'] },
  ],
  columns: [
    { key: 'created_at', label: 'Time' }, { key: 'full_name', label: 'User' }, { key: 'role', label: 'Role' },
    { key: 'action', label: 'Action' }, { key: 'path', label: 'Page / API' }, { key: 'status', label: 'Result' }, { key: 'ip', label: 'IP' },
  ],
  run: (p) => db.prepare(`
    SELECT datetime(a.created_at, 'localtime') AS created_at, u.full_name, u.role, a.action, a.path, a.status, a.ip
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE date(a.created_at, 'localtime') BETWEEN ? AND ? AND (? = '' OR u.role = ?)
    ORDER BY a.id DESC LIMIT 2000`).all(p.from, p.to, p.user_role, p.user_role),
});

registerReport({
  key: 'app-usage', title: 'App Login Statistics', group: 'Human Resource',
  description: 'Who has signed in to the ERP and when they were last active (there is no separate mobile app).',
  params: [{ name: 'user_role', label: 'Role', type: 'select', options: ['admin', 'teacher', 'student', 'parent'] }],
  columns: [
    { key: 'username', label: 'Username' }, { key: 'full_name', label: 'Name' }, { key: 'role', label: 'Role' },
    { key: 'last_login_at', label: 'Last Login', type: 'date' }, { key: 'logins_30d', label: 'Logins (30 days)', type: 'number', total: true },
    { key: 'state', label: 'Status' },
  ],
  run: (p) => db.prepare(`
    SELECT u.username, u.full_name, u.role, u.last_login_at,
      (SELECT COUNT(*) FROM audit_log a WHERE a.user_id = u.id AND a.action = 'LOGIN' AND a.created_at >= datetime('now','-30 days')) AS logins_30d,
      CASE WHEN u.active = 0 THEN 'Disabled' WHEN u.last_login_at IS NULL THEN 'Never signed in' ELSE 'Active' END AS state
    FROM users u WHERE (? = '' OR u.role = ?) ORDER BY u.role, u.full_name`).all(p.user_role, p.user_role),
});

function register(router) {
  router.post('/admin/send-credentials', auth, role(...ROLES.ADMIN), sendCredentials);
}

module.exports = { register };
