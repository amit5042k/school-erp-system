// Parents with several children. Data access everywhere is scoped by users.linked_id (the "active child");
// this module keeps the list of a parent's children and lets the parent switch which one is active.
const { db, ROLES, auth, role, safe } = require('./_kit');
const events = require('../utils/events');

db.exec(`
  CREATE TABLE IF NOT EXISTS parent_children (
    parent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parent_user_id, student_id)
  );
`);

// Every parent's current child is always one of their children (covers logins created before this module).
function backfill() {
  db.prepare(`INSERT OR IGNORE INTO parent_children (parent_user_id, student_id)
    SELECT u.id, u.linked_id FROM users u WHERE u.role = 'parent' AND u.linked_id IN (SELECT id FROM students)`).run();
}
backfill();

const isParent = (userId) => db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'parent'").get(userId);
const children = (userId) => db.prepare(`
  SELECT s.id AS student_id, s.full_name, s.admission_no, s.photo_url, c.name AS class_name, c.section AS class_section,
    CASE WHEN u.linked_id = s.id THEN 1 ELSE 0 END AS active
  FROM parent_children pc JOIN students s ON s.id = pc.student_id JOIN users u ON u.id = pc.parent_user_id
  LEFT JOIN classes c ON c.id = s.class_id
  WHERE pc.parent_user_id = ? ORDER BY s.full_name`).all(userId);

/** Add a child to a parent login; the first child also becomes the active one. Used by imports too. */
function linkChild(parentUserId, studentId) {
  db.prepare('INSERT OR IGNORE INTO parent_children (parent_user_id, student_id) VALUES (?, ?)').run(parentUserId, studentId);
  db.prepare("UPDATE users SET linked_id = ? WHERE id = ? AND role = 'parent' AND (linked_id IS NULL OR linked_id NOT IN (SELECT id FROM students))")
    .run(studentId, parentUserId);
}

// A parent login created on the Users page links its child here as the first child.
events.on('api:change', (e) => {
  if (e.method === 'POST' && e.path === '/api/users' && e.result?.id && e.body?.role === 'parent' && e.body?.linked_id) {
    if (isParent(e.result.id) && db.prepare('SELECT 1 FROM students WHERE id = ?').get(e.body.linked_id)) linkChild(e.result.id, Number(e.body.linked_id));
  }
});

const mine = {
  list(req, res) {
    if (req.user.base_role !== 'parent') return res.json([]);
    backfill();
    res.json(children(req.user.id));
  },
  switch(req, res) {
    if (req.user.base_role !== 'parent') return res.status(403).json({ error: 'Only parent logins can switch child' });
    const sid = Number(req.body.student_id);
    if (!db.prepare('SELECT 1 FROM parent_children WHERE parent_user_id = ? AND student_id = ?').get(req.user.id, sid)) {
      return res.status(403).json({ error: 'That student is not linked to your login' });
    }
    db.prepare('UPDATE users SET linked_id = ? WHERE id = ?').run(sid, req.user.id);
    res.json({ ok: true, student_id: sid });
  },
};

const admin = {
  parents(req, res) {
    const q = String(req.query.q || '').trim().toLowerCase();
    const rows = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.phone, u.email, u.active,
        (SELECT COUNT(*) FROM parent_children pc WHERE pc.parent_user_id = u.id) AS children,
        (SELECT group_concat(s.full_name, ', ') FROM parent_children pc JOIN students s ON s.id = pc.student_id WHERE pc.parent_user_id = u.id) AS child_names
      FROM users u WHERE u.role = 'parent' ORDER BY u.full_name`).all();
    res.json(q ? rows.filter(r => `${r.username} ${r.full_name} ${r.phone || ''} ${r.child_names || ''}`.toLowerCase().includes(q)) : rows);
  },
  children(req, res) {
    if (!isParent(req.params.userId)) return res.status(404).json({ error: 'Parent login not found' });
    res.json(children(req.params.userId));
  },
  add(req, res) {
    const pid = Number(req.params.userId), sid = Number(req.body.student_id);
    if (!isParent(pid)) return res.status(404).json({ error: 'Parent login not found' });
    if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(sid)) return res.status(400).json({ error: 'Student not found' });
    if (db.prepare('SELECT 1 FROM parent_children WHERE parent_user_id = ? AND student_id = ?').get(pid, sid)) {
      return res.status(409).json({ error: 'This child is already linked to the parent' });
    }
    linkChild(pid, sid);
    res.status(201).json({ ok: true });
  },
  remove(req, res) {
    const pid = Number(req.params.userId), sid = Number(req.params.studentId);
    if (!isParent(pid)) return res.status(404).json({ error: 'Parent login not found' });
    const list = children(pid);
    if (!list.some(c => c.student_id === sid)) return res.status(404).json({ error: 'This child is not linked to the parent' });
    if (list.length === 1) return res.status(400).json({ error: 'A parent login needs at least one child; disable the login instead' });
    db.transaction(() => {
      db.prepare('DELETE FROM parent_children WHERE parent_user_id = ? AND student_id = ?').run(pid, sid);
      // If that was the active child, move the parent to one of their remaining children.
      const next = list.find(c => c.student_id !== sid).student_id;
      db.prepare('UPDATE users SET linked_id = ? WHERE id = ? AND linked_id = ?').run(next, pid, sid);
    })();
    res.json({ ok: true });
  },
};

function register(router) {
  router.get('/family/children', auth, mine.list);
  router.post('/family/switch', auth, safe(mine.switch));
  router.get('/family/parents', auth, role(...ROLES.ADMIN), admin.parents);
  router.get('/family/parents/:userId/children', auth, role(...ROLES.ADMIN), admin.children);
  router.post('/family/parents/:userId/children', auth, role(...ROLES.ADMIN), safe(admin.add));
  router.delete('/family/parents/:userId/children/:studentId', auth, role(...ROLES.ADMIN), safe(admin.remove));
}

module.exports = { register, linkChild };
