// Run as a child process (never via a shell) to create a new school's database: loads the ERP schema from
// BACKEND_DIR, names the school, and adds the first Super Admin who must change the password at first sign-in.
// Inputs arrive only through environment variables.
const path = require('path');

const backend = process.env.BACKEND_DIR;
const { INIT_SCHOOL_NAME, INIT_ADMIN_USERNAME, INIT_ADMIN_PASSWORD } = process.env;
if (!backend || !INIT_SCHOOL_NAME || !INIT_ADMIN_USERNAME || !INIT_ADMIN_PASSWORD) {
  console.error('init-school: missing BACKEND_DIR / INIT_* environment variables');
  process.exit(2);
}
process.env.BACKUP_DISABLED = 'true';

try {
  const db = require(path.join(backend, 'src', 'config', 'db'));
  require(path.join(backend, 'src', 'modules')).loadModules();
  const bcrypt = require(require.resolve('bcryptjs', { paths: [backend] }));
  const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (existing) { console.log(JSON.stringify({ ok: true, created: false, note: 'database already has users' })); process.exit(0); }
  db.prepare('UPDATE school_settings SET school_name = ? WHERE id = 1').run(INIT_SCHOOL_NAME);
  db.prepare(`INSERT INTO users (username, password_hash, role, full_name, must_change_password) VALUES (?, ?, 'admin', ?, 1)`)
    .run(INIT_ADMIN_USERNAME, bcrypt.hashSync(INIT_ADMIN_PASSWORD, 10), 'School Administrator');
  console.log(JSON.stringify({ ok: true, created: true }));
  process.exit(0);
} catch (e) {
  console.error('init-school failed:', e.message);
  process.exit(1);
}
