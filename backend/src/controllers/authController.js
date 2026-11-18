const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/db');
const roles = require('../utils/roles');

// What the frontend needs to build menus: base role, staff role and its per-area levels.
function roleInfo(user) {
  const r = user.role === 'teacher' ? roles.get(user.role_key || 'teacher') : null;
  const name = user.role === 'admin' ? 'Super Admin' : r ? r.name : user.role === 'student' ? 'Student' : 'Parent';
  return { baseRole: user.role, roleKey: r ? r.key : null, roleName: name, perms: r ? r.perms : null, actions: r ? r.actions : null };
}

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(4),
  role: z.enum(['admin', 'teacher', 'student', 'parent']).optional(),
});

exports.login = (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { password, role } = parsed.data;
  // Usernames match regardless of case and stray spaces: phones capitalise the first letter of an email or
  // admission number, and autocomplete adds a trailing space. An exact match wins if two differ only in case.
  const username = parsed.data.username.trim();
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?) AND active = 1
    ORDER BY (username = ?) DESC LIMIT 1`).get(username, username);
  // Compare against a dummy hash when the user doesn't exist so response time doesn't reveal valid usernames.
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH) && !!user;
  // Staff roles (principal, accountant, ...) sit on the 'teacher' base, so "staff" choices on the login form match both.
  const staffPick = role === 'admin' || role === 'teacher';
  const roleOk = !role || user.role === role || (staffPick && (user.role === 'admin' || user.role === 'teacher'));
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  // The password is right but "Login As" is wrong: say which option to choose (only someone with the password sees this).
  if (!roleOk) {
    const pick = { admin: 'Administration / Office', teacher: 'Teacher / Staff', student: 'Student', parent: 'Parent' }[user.role];
    return res.status(401).json({ error: `This is a ${user.role === 'admin' || user.role === 'teacher' ? 'staff' : user.role} login. Choose "${pick}" under Login As and sign in again.`, code: 'WRONG_LOGIN_AS', role: user.role });
  }
  if (user.blocked_reason) return res.status(403).json({ error: `Access blocked: ${user.blocked_reason}. Please contact the school office.` });

  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
  db.prepare("INSERT INTO audit_log (user_id, action, path, status, ip) VALUES (?, 'LOGIN', '/api/auth/login', 200, ?)").run(user.id, req.ip);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      email: user.email,
      linkedId: user.linked_id,
      mustChangePassword: !!user.must_change_password,
      ...roleInfo(user),
    },
  });
};

exports.me = (req, res) => {
  const user = db.prepare('SELECT id, username, role, role_key, full_name, email, linked_id, must_change_password FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id, username: user.username, role: user.role,
    fullName: user.full_name, email: user.email, linkedId: user.linked_id,
    mustChangePassword: !!user.must_change_password,
    ...roleInfo(user),
  });
};

// Wrong current-password tries per login: 10 per 15 minutes, so a borrowed session can't guess its way to the password.
const pwFailures = new Map();
const PW_WINDOW = 15 * 60 * 1000, PW_MAX = 10;

exports.changePassword = (req, res) => {
  const { current_password, new_password } = req.body || {};
  const f = pwFailures.get(req.user.id);
  if (f && Date.now() - f.since < PW_WINDOW && f.count >= PW_MAX) {
    return res.status(429).json({ error: 'Too many wrong attempts. Please wait 15 minutes and try again.' });
  }
  if (!current_password || !new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'current_password and new_password (min 6 chars) required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    const cur = f && Date.now() - f.since < PW_WINDOW ? f : { count: 0, since: Date.now() };
    pwFailures.set(req.user.id, { ...cur, count: cur.count + 1 });
    // 400, not 401: a 401 tells the website the session ended and signs the person out over a typo.
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  pwFailures.delete(req.user.id);
  if (current_password === new_password) return res.status(400).json({ error: 'New password must be different from the current one' });
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ ok: true });
};
