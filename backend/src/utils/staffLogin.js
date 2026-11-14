// Staff logins are created from the employee record: the username is the person's official (school) email address,
// with a temporary password they must change at first sign-in. Staff records also keep a personal email (`email`),
// which is never used for the login. Without an official email the employee is saved but gets no login yet.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const usernameFor = (email) => String(email || '').trim().toLowerCase();
// Teaching posts start with the Teacher role, everyone else as Non-Teaching Staff; Users & Roles can change it.
const TEACHING = /teach|faculty|lecturer|\b(pgt|tgt|prt|ntt)\b/i;
const tempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), b => chars[b % chars.length]).join('');
};
const loginOf = (teacherId) => db.prepare("SELECT id, username FROM users WHERE role = 'teacher' AND linked_id = ?").get(teacherId);
const takenBy = (username, exceptId) => db.prepare('SELECT id FROM users WHERE lower(username) = ? AND id != ?').get(username, exceptId || 0);

/**
 * Make sure an active staff member has a login named after their official email.
 * Returns { created: { username, password } } | { renamed: username } | { exists: username } | { skipped: reason }.
 */
function ensureStaffLogin(teacherId) {
  const t = db.prepare('SELECT id, full_name, official_email, phone, status, staff_category, department, designation, subject FROM teachers WHERE id = ?').get(teacherId);
  if (!t) return { skipped: 'Staff record not found' };
  const existing = loginOf(t.id);
  const username = usernameFor(t.official_email);
  if (existing) {
    // The official email changed: the username follows it, unless another login already uses that address.
    if (isEmail(t.official_email) && existing.username.toLowerCase() !== username && isEmail(existing.username) && !takenBy(username, existing.id)) {
      db.prepare('UPDATE users SET username = ?, email = ? WHERE id = ?').run(username, username, existing.id);
      return { renamed: username };
    }
    return { exists: existing.username };
  }
  if (t.status && t.status !== 'active') return { skipped: 'Not an active staff member' };
  if (!isEmail(t.official_email)) return { skipped: 'No official email yet; the login is created once one is added' };
  if (takenBy(username)) return { skipped: `${username} is already used by another login` };
  const password = tempPassword();
  const roleKey = TEACHING.test([t.staff_category, t.department, t.designation, t.subject].filter(Boolean).join(' ')) ? 'teacher' : 'staff';
  db.prepare(`INSERT INTO users (username, password_hash, role, role_key, full_name, email, phone, linked_id, must_change_password)
    VALUES (?, ?, 'teacher', ?, ?, ?, ?, ?, 1)`).run(username, bcrypt.hashSync(password, 10), roleKey, t.full_name, username, t.phone || null, t.id);
  return { created: { username, password, role_key: roleKey, name: t.full_name } };
}

/**
 * After a staff record is edited: create or rename the login only when the official email was added or changed.
 * Other edits leave logins alone, so a login an admin deleted (to revoke access) isn't quietly re-created.
 */
function afterStaffEdit(teacherId, previousOfficialEmail) {
  const now = db.prepare('SELECT official_email FROM teachers WHERE id = ?').get(teacherId)?.official_email;
  if (usernameFor(now) === usernameFor(previousOfficialEmail)) return null;
  return ensureStaffLogin(teacherId);
}
const officialEmailOf = (teacherId) => db.prepare('SELECT official_email FROM teachers WHERE id = ?').get(teacherId)?.official_email || null;

module.exports = { ensureStaffLogin, afterStaffEdit, officialEmailOf, usernameFor, isEmail };
