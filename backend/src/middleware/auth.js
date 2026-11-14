const jwt = require('jsonwebtoken');
const db = require('../config/db');
const roles = require('../utils/roles');
const { effectiveRole } = require('../utils/permissions');
const { isParentOf } = require('../utils/family');

// Changing or resetting a password ends every session signed in before it (e.g. someone who had the old password).
// A trigger stamps the time on every password change, wherever in the code it happens.
try { db.exec('ALTER TABLE users ADD COLUMN password_changed_at INTEGER'); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
db.exec(`CREATE TRIGGER IF NOT EXISTS trg_users_password_changed AFTER UPDATE OF password_hash ON users
  WHEN NEW.password_hash IS NOT OLD.password_hash
  BEGIN UPDATE users SET password_changed_at = CAST(strftime('%s', 'now') AS INTEGER) WHERE id = NEW.id; END;`);

const loadUser = db.prepare('SELECT id, username, role, role_key, full_name, linked_id, active, must_change_password, blocked_reason, password_changed_at FROM users WHERE id = ?');

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
  if (user.password_changed_at && payload.iat < user.password_changed_at) {
    return res.status(401).json({ error: 'Your password was changed. Please sign in again.', code: 'PASSWORD_CHANGED' });
  }
  if (user.blocked_reason) return res.status(401).json({ error: `Access blocked: ${user.blocked_reason}`, code: 'BLOCKED' });
  req.user = { id: user.id, username: user.username, role: user.role, base_role: user.role, name: user.full_name, linked_id: user.linked_id };
  const path = req.originalUrl.split('?')[0];
  if (user.must_change_password && !PASSWORD_CHANGE_ALLOWED.includes(path)) {
    return res.status(403).json({ error: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  // Staff roles: act as admin or teacher for this request depending on the role's level for its area.
  const staffRole = user.role === 'teacher' ? roles.get(user.role_key || 'teacher') : null;
  if (staffRole) {
    req.user.role_key = staffRole.key;
    req.user.perms = staffRole.perms;
    req.user.actions = staffRole.actions;
    const eff = effectiveRole(staffRole.perms, req.method, path.replace(/^\/api(?=\/|$)/i, ''), staffRole.actions);
    if (eff.deny) {
      const what = eff.action ? `can't ${ {add: 'add', edit: 'edit', delete: 'delete', approve: 'approve or finalise', export: 'export or download'}[eff.action] } in` : 'does not have access to';
      return res.status(403).json({ error: `Your role (${staffRole.name}) ${what} ${eff.deny}`, code: eff.action ? 'ACTION_DENIED' : 'AREA_DENIED' });
    }
    req.user.role = eff.role;
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
  if (user.linked_id != null && Number(studentId) === Number(user.linked_id)) return true;
  // A parent can act for any of their children, not only the one currently selected (another phone on the same
  // login may have switched child in the middle of, say, an online payment).
  return (user.base_role || user.role) === 'parent' && isParentOf(user.id, studentId);
}

function ownStudentOnly(param = 'studentId') {
  return (req, res, next) => {
    if (!canSeeStudent(req.user, req.params[param])) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { authRequired, requireRole, isStaff, canSeeStudent, ownStudentOnly };
