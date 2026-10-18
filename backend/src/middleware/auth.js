const jwt = require('jsonwebtoken');
const db = require('../config/db');

const loadUser = db.prepare('SELECT id, username, role, full_name, linked_id, active, must_change_password, blocked_reason FROM users WHERE id = ?');

// Reachable while a password change is pending, so the user can see who they are and change it.
const PASSWORD_CHANGE_ALLOWED = ['/api/auth/me', '/api/auth/change-password', '/api/settings'];

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Re-read the user so deactivation and role changes take effect immediately, not when the token expires.
  const user = loadUser.get(payload.id);
  if (!user || !user.active) return res.status(401).json({ error: 'Account is disabled' });
  if (user.blocked_reason) return res.status(401).json({ error: `Access blocked: ${user.blocked_reason}`, code: 'BLOCKED' });
  req.user = { id: user.id, username: user.username, role: user.role, name: user.full_name, linked_id: user.linked_id };
  if (user.must_change_password && !PASSWORD_CHANGE_ALLOWED.includes(req.originalUrl.split('?')[0])) {
    return res.status(403).json({ error: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

const isStaff = (user) => user.role === 'admin' || user.role === 'teacher';

// Students and parents may only see the student record their account is linked to.
function canSeeStudent(user, studentId) {
  if (isStaff(user)) return true;
  return user.linked_id != null && Number(studentId) === Number(user.linked_id);
}

function ownStudentOnly(param = 'studentId') {
  return (req, res, next) => {
    if (!canSeeStudent(req.user, req.params[param])) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { authRequired, requireRole, isStaff, canSeeStudent, ownStudentOnly };
