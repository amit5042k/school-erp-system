const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/db');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(4),
  role: z.enum(['admin', 'teacher', 'student', 'parent']).optional(),
});

exports.login = (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { username, password, role } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  // Compare against a dummy hash when the user doesn't exist so response time doesn't reveal valid usernames.
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH) && !!user;
  if (!ok || (role && user.role !== role)) return res.status(401).json({ error: 'Invalid credentials' });

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
    },
  });
};

exports.me = (req, res) => {
  const user = db.prepare('SELECT id, username, role, full_name, email, linked_id FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id, username: user.username, role: user.role,
    fullName: user.full_name, email: user.email, linkedId: user.linked_id,
  });
};

exports.changePassword = (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'current_password and new_password (min 6 chars) required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ ok: true });
};
