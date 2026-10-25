// Shared endpoints: report engine, master lists, file uploads, backups, messaging log.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { db, ROLES, auth, role, safe, today } = require('./_kit');
const { reports, meta } = require('../utils/reports');
const { types: masterTypes, flatten } = require('../utils/masters');
const backup = require('../utils/backup');
const { roleInArea, REPORT_GROUP_AREAS } = require('../utils/permissions');

// Reports and lists belong to a module group; staff roles get their level for that group's area.
function roleForGroup(user, group) {
  if (!user.perms) return user.role;
  return roleInArea(user.perms, REPORT_GROUP_AREAS[group]);
}
const messaging = require('../utils/messaging');

/* ---------- Files ---------- */
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stored_name TEXT UNIQUE NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// No HTML/SVG/JS: they could run script when opened from our domain.
const ALLOWED = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain', '.csv': 'text/csv',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.zip': 'application/zip',
};
const INLINE = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.txt', '.mp4', '.mp3']);
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 15);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED[ext]) return cb(Object.assign(new Error(`File type ${ext || '(none)'} is not allowed`), { status: 400 }));
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  upload.array('file', 20)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${MAX_MB} MB` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No file received (field name must be "file")' });
    const ins = db.prepare('INSERT INTO files (stored_name, original_name, mime, size, uploaded_by) VALUES (?, ?, ?, ?, ?)');
    const out = req.files.map(f => {
      const ext = path.extname(f.filename);
      const info = ins.run(f.filename, f.originalname.slice(0, 200), ALLOWED[ext], f.size, req.user.id);
      return { id: info.lastInsertRowid, url: `/api/files/${f.filename}`, name: f.originalname, size: f.size, mime: ALLOWED[ext] };
    });
    res.status(201).json(out);
  });
}

function serveFile(req, res) {
  const name = req.params.name;
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(name)) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare('SELECT * FROM files WHERE stored_name = ?').get(name);
  const full = path.join(UPLOAD_DIR, name);
  if (!row || !fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
  const ext = path.extname(name);
  const disp = INLINE.has(ext) ? 'inline' : 'attachment';
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Disposition', `${disp}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(full);
}

/* ---------- Reports ---------- */
function resolveDefault(d) {
  const t = today();
  if (d === 'today') return t;
  if (d === 'monthStart') return t.slice(0, 8) + '01';
  if (d === 'yearStart') return t.slice(0, 5) + '01-01';
  if (d === 'currentMonth') return t.slice(0, 7);
  if (d === 'session') return db.prepare('SELECT academic_year FROM school_settings WHERE id = 1').get()?.academic_year || '';
  return d == null ? '' : String(d);
}

function catalog(req, res) {
  const list = [...reports.values()].filter(r => r.roles.includes(roleForGroup(req.user, r.group))).map(r => ({
    ...meta(r), params: r.params.map(p => ({ ...p, default: resolveDefault(p.default) })),
  }));
  res.json(list);
}

function runReport(req, res) {
  const r = reports.get(req.params.key);
  if (!r || !r.roles.includes(roleForGroup(req.user, r.group))) return res.status(404).json({ error: 'Report not found' });
  req.user = { ...req.user, role: roleForGroup(req.user, r.group) };
  const params = {};
  for (const p of r.params) {
    const v = req.query[p.name];
    params[p.name] = v == null || v === '' ? resolveDefault(p.default) : String(v);
    if (p.required && !params[p.name]) return res.status(400).json({ error: `${p.label || p.name} is required` });
  }
  const rows = r.run(params, req.user) || [];
  // Some reports (e.g. monthly registers) size their columns to the chosen filters.
  const columns = typeof r.columnsFor === 'function' ? r.columnsFor(params) : r.columns;
  res.json({ ...meta(r), columns, params: r.params.map(p => ({ ...p, default: resolveDefault(p.default) })), values: params, rows, generated_at: new Date().toISOString() });
}

/* ---------- Masters ---------- */
function masterType(req, res, mode) {
  const t = masterTypes.get(req.params.type);
  if (!t) { res.status(404).json({ error: 'Unknown list' }); return null; }
  const allowed = mode === 'write' ? t.write : t.read;
  // Lookup names feed dropdowns everywhere, so reading never needs more than teacher level.
  const role = roleForGroup(req.user, t.group) || (mode === 'read' ? 'teacher' : null);
  if (!allowed.includes(role)) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return t;
}
function splitMaster(t, body) {
  const extra = {};
  for (const f of t.fields) if (f.name in body) extra[f.name] = body[f.name] === '' ? null : body[f.name];
  return extra;
}
const masters = {
  types(req, res) {
    res.json([...masterTypes.values()].filter(t => t.read.includes(roleForGroup(req.user, t.group) || 'teacher'))
      .map(({ type, title, group, fields, description, write }) => ({ type, title, group, fields, description, can_write: write.includes(roleForGroup(req.user, group)) })));
  },
  list(req, res) {
    const t = masterType(req, res, 'read'); if (!t) return;
    const all = req.query.all === '1';
    const rows = db.prepare(`SELECT * FROM masters WHERE type = ? ${all ? '' : 'AND active = 1'} ORDER BY sort_order, name`).all(t.type);
    res.json(rows.map(flatten));
  },
  create(req, res) {
    const t = masterType(req, res, 'write'); if (!t) return;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM masters WHERE type = ?').get(t.type).m;
    const info = db.prepare('INSERT INTO masters (type, name, code, sort_order, data) VALUES (?, ?, ?, ?, ?)')
      .run(t.type, name, req.body.code || null, req.body.sort_order ?? max + 1, JSON.stringify(splitMaster(t, req.body)));
    res.status(201).json({ id: info.lastInsertRowid });
  },
  update(req, res) {
    const t = masterType(req, res, 'write'); if (!t) return;
    const row = db.prepare('SELECT * FROM masters WHERE id = ? AND type = ?').get(req.params.id, t.type);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const name = 'name' in req.body ? String(req.body.name || '').trim() : row.name;
    if (!name) return res.status(400).json({ error: 'name cannot be empty' });
    const data = { ...flatten({ data: row.data }), ...splitMaster(t, req.body) };
    delete data.data;
    db.prepare('UPDATE masters SET name = ?, code = ?, sort_order = ?, active = ?, data = ? WHERE id = ?').run(
      name, 'code' in req.body ? req.body.code || null : row.code,
      'sort_order' in req.body ? Number(req.body.sort_order) || 0 : row.sort_order,
      'active' in req.body ? (req.body.active ? 1 : 0) : row.active,
      JSON.stringify(data), row.id);
    res.json({ ok: true });
  },
  remove(req, res) {
    const t = masterType(req, res, 'write'); if (!t) return;
    const info = db.prepare('DELETE FROM masters WHERE id = ? AND type = ?').run(req.params.id, t.type);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
};

/* ---------- Backups ---------- */
backup.schedule();
async function downloadBackup(req, res, next) {
  try {
    const file = await backup.backupNow();
    res.download(file, `school-erp-backup-${today()}.sqlite`);
  } catch (e) { next(e); }
}

function register(router) {
  router.post('/uploads', auth, role(...ROLES.STAFF), handleUpload);
  router.get('/files/:name', serveFile);

  router.get('/report-catalog', auth, catalog);
  router.get('/report/:key', auth, safe(runReport));

  router.get('/master-types', auth, masters.types);
  router.get('/masters/:type', auth, masters.list);
  router.post('/masters/:type', auth, safe(masters.create));
  router.put('/masters/:type/:id', auth, safe(masters.update));
  router.delete('/masters/:type/:id', auth, safe(masters.remove));

  router.get('/admin/backups', auth, role(...ROLES.ADMIN), (req, res) => res.json(backup.listBackups()));
  router.get('/admin/backups/offsite', auth, role(...ROLES.ADMIN), (req, res) => res.json(backup.offsiteStatus()));
  router.get('/admin/backup/download', auth, role(...ROLES.ADMIN), downloadBackup);

  router.get('/messaging/status', auth, role(...ROLES.STAFF), (req, res) => res.json(messaging.status()));
  router.get('/messaging/log', auth, role(...ROLES.STAFF), (req, res) => {
    const { channel, status, batch_id } = req.query;
    const w = [], p = [];
    if (channel) { w.push('m.channel = ?'); p.push(channel); }
    if (status) { w.push('m.status = ?'); p.push(status); }
    if (batch_id) { w.push('m.batch_id = ?'); p.push(batch_id); }
    res.json(db.prepare(`
      SELECT m.*, u.full_name AS sent_by_name FROM message_log m LEFT JOIN users u ON u.id = m.sent_by
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY m.id DESC LIMIT 500
    `).all(...p));
  });
}

module.exports = { register };
