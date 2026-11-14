// Roles & Permissions: list, add, edit and remove staff roles (see utils/permissions.js).
const { db, ROLES, auth, role, safe } = require('./_kit');
const staffRoles = require('../utils/roles');
const { AREAS, LEVELS, ACTIONS, ACTION_KEYS, normalizePerms, normalizeActions, exceedsPerms } = require('../utils/permissions');

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const usersWith = (key) => db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' AND role_key = ?").get(key).c;

// Anyone below Super Admin editing their own role (or a role to assign to themselves) could raise their own access.
const ownRole = (req, key) => req.user.base_role !== 'admin' && req.user.role_key === key;
// Below Super Admin you can only create or edit roles that grant no more than you have yourself.
const beyondMine = (req, perms, actions) => (req.user.base_role !== 'admin' ? exceedsPerms(perms, req.user.perms, actions, req.user.actions) : null);
// Merges submitted switches over the current ones: { area: { add: true, delete: false, … } }.
function readActions(body, current) {
  const out = normalizeActions(current || {});
  for (const [area, acts] of Object.entries(body || {})) {
    if (!out[area]) throw Object.assign(new Error(`Unknown area ${area}`), { status: 400 });
    for (const [k, v] of Object.entries(acts || {})) {
      if (!ACTION_KEYS.includes(k)) throw Object.assign(new Error(`Unknown action ${k}`), { status: 400 });
      out[area][k] = v !== false;
    }
  }
  return out;
}

function list(req, res) {
  res.json({
    areas: AREAS, levels: LEVELS, actions: ACTIONS,
    roles: [...staffRoles.all().values()].map(r => ({ ...r, users: usersWith(r.key) })),
  });
}

function create(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Role name is required' });
  const key = slug(req.body.key || name);
  if (!key) return res.status(400).json({ error: 'Role name must contain letters or numbers' });
  if (staffRoles.get(key)) return res.status(409).json({ error: 'A role with this name already exists' });
  const base = req.body.copy_from ? staffRoles.get(req.body.copy_from)?.perms : null;
  const perms = normalizePerms(req.body.perms || base || {});
  const actions = readActions(req.body.actions, req.body.copy_from ? staffRoles.get(req.body.copy_from)?.actions : null);
  const over = beyondMine(req, perms, actions);
  if (over) return res.status(403).json({ error: `You can't give a role more access than you have (${over}); ask a Super Admin` });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM staff_roles').get().m;
  db.prepare('INSERT INTO staff_roles (key, name, perms, actions, builtin, sort_order) VALUES (?, ?, ?, ?, 0, ?)').run(key, name, JSON.stringify(perms), JSON.stringify(actions), max + 1);
  staffRoles.invalidate();
  res.status(201).json({ key });
}

function update(req, res) {
  const r = staffRoles.get(req.params.key);
  if (!r) return res.status(404).json({ error: 'Role not found' });
  if (ownRole(req, r.key)) return res.status(403).json({ error: "You can't change your own role's permissions; ask a Super Admin" });
  const name = 'name' in req.body ? String(req.body.name || '').trim() : r.name;
  if (!name) return res.status(400).json({ error: 'Role name cannot be empty' });
  for (const [area, level] of Object.entries(req.body.perms || {})) {
    if (!AREAS.some(a => a.key === area)) return res.status(400).json({ error: `Unknown area ${area}` });
    if (!LEVELS.includes(level)) return res.status(400).json({ error: `Level must be one of ${LEVELS.join(', ')}` });
  }
  const perms = normalizePerms({ ...r.perms, ...(req.body.perms || {}) });
  const actions = readActions(req.body.actions, r.actions);
  const over = beyondMine(req, r.perms, r.actions) || beyondMine(req, perms, actions);
  if (over) return res.status(403).json({ error: `This role has (or would have) more access than you (${over}); ask a Super Admin` });
  db.prepare('UPDATE staff_roles SET name = ?, perms = ?, actions = ? WHERE key = ?').run(name, JSON.stringify(perms), JSON.stringify(actions), r.key);
  staffRoles.invalidate();
  res.json({ ok: true });
}

function remove(req, res) {
  const r = staffRoles.get(req.params.key);
  if (!r) return res.status(404).json({ error: 'Role not found' });
  if (r.builtin) return res.status(400).json({ error: 'Built-in roles can be edited but not deleted' });
  if (beyondMine(req, r.perms, r.actions)) return res.status(403).json({ error: 'This role has more access than you; ask a Super Admin' });
  const n = usersWith(r.key);
  if (n) return res.status(409).json({ error: `${n} login(s) still use this role; move them to another role first` });
  db.prepare('DELETE FROM staff_roles WHERE key = ?').run(r.key);
  staffRoles.invalidate();
  res.json({ ok: true });
}

function register(router) {
  router.get('/roles', auth, role(...ROLES.ADMIN), list);
  router.post('/roles', auth, role(...ROLES.ADMIN), safe(create));
  router.put('/roles/:key', auth, role(...ROLES.ADMIN), safe(update));
  router.delete('/roles/:key', auth, role(...ROLES.ADMIN), safe(remove));
}

module.exports = { register, ownRole, beyondMine };
