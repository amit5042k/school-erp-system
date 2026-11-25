// Backup first, then update. When the server starts with different code than last time (an update), and before any
// module opens the database, it saves:
//   BACKUP_DIR/pre-update-<time>.sqlite          a copy of the database, checked to open and be intact
//   BACKUP_DIR/pre-update-<time>-uploads/        a snapshot of the uploaded files (hard links: instant, no extra space)
// Only then is the new version allowed to run. If the backup can't be made (e.g. the disk is full), the server stops
// with a clear message instead of updating without one; set UPDATE_WITHOUT_BACKUP=true to override that once.
// The newest 10 pre-update backups are kept; the database copy also goes off-site when off-site backup is set up.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('../config/paths');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '..', '..', 'data', 'school.sqlite');
const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'data', 'backups');
const uploadDir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '..', '..', 'uploads');
const KEEP = 10;
const NAME = /^pre-update-\d{8}-\d{6}(\.sqlite|-uploads)$/;

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

// Hard-link every uploaded file into the snapshot (copy when links aren't possible, e.g. another disk).
function snapshotUploads(target) {
  let files = 0;
  (function walk(from, to) {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name), b = path.join(to, e.name);
      if (e.isDirectory()) walk(a, b);
      else if (e.isFile()) { try { fs.linkSync(a, b); } catch { fs.copyFileSync(a, b); } files++; }
    }
  })(uploadDir, target);
  return files;
}

function prune() {
  const byStamp = new Map();
  for (const n of fs.readdirSync(dir).filter(x => NAME.test(x))) {
    const stamp = n.slice(11, 26);
    byStamp.set(stamp, [...(byStamp.get(stamp) || []), n]);
  }
  for (const stamp of [...byStamp.keys()].sort().reverse().slice(KEEP)) {
    for (const n of byStamp.get(stamp)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  }
}

let pending = null;   // the database copy to send off-site once the server is up

module.exports = function preUpdateBackup() {
  if (!fs.existsSync(dbPath)) return;            // first start: nothing to protect yet
  const marker = path.join(path.dirname(dbPath), '.code-version');
  const now = codeVersion();
  const last = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null;
  if (last === now) return;
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const file = path.join(dir, `pre-update-${stamp}.sqlite`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(dbPath);
    try { db.prepare('VACUUM INTO ?').run(file); } finally { db.close(); }
    // The copy must open and pass SQLite's integrity check before the update may go ahead.
    const check = new Database(file, { readonly: true });
    try {
      const r = check.prepare('PRAGMA integrity_check').pluck().get();
      if (r !== 'ok') throw new Error(`the database copy failed its integrity check (${r})`);
    } finally { check.close(); }
    const files = snapshotUploads(path.join(dir, `pre-update-${stamp}-uploads`));
    prune();
    fs.writeFileSync(marker, now);
    pending = file;
    console.log(`Update detected: backed up the database (${file}) and ${files} uploaded file(s) before applying it.`);
  } catch (e) {
    try { fs.rmSync(file, { force: true }); fs.rmSync(path.join(dir, `pre-update-${stamp}-uploads`), { recursive: true, force: true }); } catch (_) { /* best effort */ }
    if (process.env.UPDATE_WITHOUT_BACKUP === 'true') {
      console.error(`Pre-update backup failed (${e.message}); continuing because UPDATE_WITHOUT_BACKUP=true.`);
      return;
    }
    console.error(`\nUPDATE STOPPED: the backup before the update could not be made: ${e.message}\n`
      + `Your data is unchanged and the update was not applied. Free some disk space (or fix the backup folder ${dir})\n`
      + 'and restart. To update without a backup anyway, set UPDATE_WITHOUT_BACKUP=true once.\n');
    process.exit(1);
  }
};

// After the server is up: send the pre-update database copy off-site too (if off-site backup is configured).
module.exports.sendOffsite = function sendOffsite() {
  if (!pending) return;
  const file = pending; pending = null;
  try {
    const { uploadOffsite } = require('./backup');
    uploadOffsite(file).catch(e => console.error('Off-site copy of the pre-update backup failed:', e.message));
  } catch (e) { console.error('Off-site copy of the pre-update backup failed:', e.message); }
};
