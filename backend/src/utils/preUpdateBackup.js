// Safety copy before an update: when the server starts with different code than last time, the database is copied
// to BACKUP_DIR as pre-update-<time>.sqlite before any module can change it. Updates only ever add tables and
// columns, but if one went wrong this is the copy to go back to. The newest 10 are kept.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('../config/paths');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '..', '..', 'data', 'school.sqlite');
const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'data', 'backups');
const KEEP = 10;

// Changes whenever any backend source file does.
function codeVersion() {
  const h = crypto.createHash('sha1');
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) h.update(e.name).update(fs.readFileSync(p));
    }
  })(path.join(__dirname, '..'));
  return h.digest('hex');
}

module.exports = function preUpdateBackup() {
  try {
    if (!fs.existsSync(dbPath)) return;            // first start: nothing to protect yet
    const marker = path.join(path.dirname(dbPath), '.code-version');
    const now = codeVersion();
    const last = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null;
    if (last === now) return;
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const file = path.join(dir, `pre-update-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.sqlite`);
    const db = new Database(dbPath);
    try { db.prepare('VACUUM INTO ?').run(file); } finally { db.close(); }
    for (const f of fs.readdirSync(dir).filter(n => /^pre-update-\d{8}-\d{6}\.sqlite$/.test(n)).sort().reverse().slice(KEEP)) fs.unlinkSync(path.join(dir, f));
    fs.writeFileSync(marker, now);
    console.log(`Update detected: database copied to ${file} before applying it.`);
  } catch (e) {
    console.error('Pre-update backup failed (the update continues):', e.message);
  }
};
