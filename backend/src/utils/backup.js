// Daily SQLite backups to BACKUP_DIR (default backend/data/backups), keeping the newest BACKUP_KEEP (14).
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const s3 = require('./s3');

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
  await uploadOffsite(file);
  return file;
}

// Off-site copy (S3-compatible). Failures are recorded, never thrown, so the local backup always succeeds.
const statusFile = () => path.join(dir, 'offsite-status.json');
function offsiteStatus() {
  const configured = !!s3.config();
  try { return { configured, ...JSON.parse(fs.readFileSync(statusFile(), 'utf8')) }; } catch { return { configured }; }
}
async function uploadOffsite(file) {
  if (!s3.config()) return null;
  const state = offsiteStatus();
  try {
    const where = await s3.putObject(path.basename(file), fs.readFileSync(file), 'application/x-sqlite3');
    Object.assign(state, { last_ok_at: new Date().toISOString(), last_ok_file: where, last_error: null });
  } catch (e) {
    Object.assign(state, { last_error: String(e.message || e).slice(0, 300), last_error_at: new Date().toISOString() });
    console.error('Off-site backup failed:', state.last_error);
  }
  delete state.configured;
  fs.writeFileSync(statusFile(), JSON.stringify(state));
  return state;
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

module.exports = { backupNow, listBackups, schedule, dir, offsiteStatus, uploadOffsite };
