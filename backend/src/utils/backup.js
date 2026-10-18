// Daily SQLite backups to BACKUP_DIR (default backend/data/backups), keeping the newest BACKUP_KEEP (14).
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'data', 'backups');
const keep = Number(process.env.BACKUP_KEEP || 14);

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function backupNow() {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `school-${stamp()}.sqlite`);
  await db.backup(file);
  const old = fs.readdirSync(dir).filter(f => /^school-\d{8}-\d{6}\.sqlite$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.unlinkSync(path.join(dir, f));
  return file;
}

function listBackups() {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.sqlite')).sort().reverse()
    .map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size, created: fs.statSync(path.join(dir, f)).mtime.toISOString() }));
}

function schedule() {
  if (String(process.env.BACKUP_DISABLED || '') === 'true') return;
  const run = () => backupNow().catch(e => console.error('Backup failed:', e.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

module.exports = { backupNow, listBackups, schedule, dir };
