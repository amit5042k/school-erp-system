const db = require('../config/db');

exports.list = (req, res) => {
  const role = req.user?.role || 'all';
  const rows = db.prepare(`
    SELECT a.*, u.full_name AS posted_by_name
    FROM announcements a LEFT JOIN users u ON u.id = a.posted_by
    WHERE a.audience IN ('all', ?)
    ORDER BY a.posted_at DESC LIMIT 100
  `).all(role);
  res.json(rows);
};

exports.create = (req, res) => {
  const { title, body, audience } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  const info = db.prepare(`
    INSERT INTO announcements (title, body, audience, posted_by) VALUES (?, ?, ?, ?)
  `).run(title, body, audience || 'all', req.user.id);
  res.status(201).json({ id: info.lastInsertRowid });
};

exports.remove = (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
};
