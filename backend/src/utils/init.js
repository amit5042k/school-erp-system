// Prepares an empty database for a real school: creates every table, names the school and adds the first
// Super Admin, who must choose a new password at first sign-in. No demo data. Refuses if any user exists.
//   npm run init -- --school "Green Valley Public School" --admin admin --password 'Temp#2026'
require('dotenv').config();
process.env.BACKUP_DISABLED = 'true';
const bcrypt = require('bcryptjs');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? String(process.argv[i + 1] || '').trim() : '';
};
const school = arg('school');
const username = arg('admin') || 'admin';
const password = arg('password');
if (!school || password.length < 8) {
  console.error('Usage: npm run init -- --school "School Name" [--admin admin] --password <at least 8 characters>');
  process.exit(2);
}

const db = require('../config/db');
require('../modules').loadModules();
if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c) {
  console.error('This database already has users; nothing was changed.');
  process.exit(1);
}
db.prepare('UPDATE school_settings SET school_name = ? WHERE id = 1').run(school);
db.prepare(`INSERT INTO users (username, password_hash, role, full_name, must_change_password) VALUES (?, ?, 'admin', ?, 1)`)
  .run(username, bcrypt.hashSync(password, 10), 'School Administrator');
console.log(`Ready: "${school}". Sign in as ${username} with the password you gave; you'll be asked to change it.`);
process.exit(0);
