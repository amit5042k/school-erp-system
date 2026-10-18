const db = require('../config/db');

const AUDIENCES = ['all', 'admin', 'teacher', 'student', 'parent'];

exports.list = (req, res) => {
  // Admins see everything they and others posted; everyone else sees 'all' plus posts for their role.
  const isAdmin = req.user.role === 'admin';
  const rows = db.prepare(`
    SELECT a.*, u.full_name AS posted_by_name
    FROM announcements a LEFT JOIN users u ON u.id = a.posted_by
    ${isAdmin ? '' : "WHERE a.audience IN ('all', ?)"}
    ORDER BY a.posted_at DESC LIMIT 100
  `).all(...(isAdmin ? [] : [req.user.role]));
  res.json(rows);
};

exports.create = (req, res) => {
  const { title, body } = req.body;
  const audience = req.body.audience || 'all';
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: `audience must be one of ${AUDIENCES.join(', ')}` });
  const info = db.prepare(`
    INSERT INTO announcements (title, body, audience, posted_by) VALUES (?, ?, ?, ?)
  `).run(title, body, audience, req.user.id);
  res.status(201).json({ id: info.lastInsertRowid });
};

exports.remove = (req, res) => {
  const info = db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};
