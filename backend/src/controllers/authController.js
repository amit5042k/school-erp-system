const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/db');

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
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (role && user.role !== role) return res.status(401).json({ error: 'Role mismatch' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

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
