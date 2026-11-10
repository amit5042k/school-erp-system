// Who belongs to a student's family: the student's own login plus every parent login linked to the student.
// A parent with several children has only one "active" child in users.linked_id, so look parents up through
// parent_children as well, or the other children's news never reaches them.
const db = require('../config/db');

db.exec(`
  CREATE TABLE IF NOT EXISTS parent_children (
    parent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parent_user_id, student_id)
  );
`);

/** Active student and parent user ids for these students. */
function familyUserIds(studentIds) {
  const ids = [...new Set([].concat(studentIds).map(Number).filter(Boolean))];
  if (!ids.length) return [];
  const q = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT id FROM users WHERE active = 1 AND role IN ('student','parent') AND linked_id IN (${q})
    UNION
    SELECT u.id FROM parent_children pc JOIN users u ON u.id = pc.parent_user_id
    WHERE u.active = 1 AND u.role = 'parent' AND pc.student_id IN (${q})`).all(...ids, ...ids).map(r => r.id);
}

/** True when this parent login is linked to the student (any of their children, not only the active one). */
const isParentOf = (userId, studentId) =>
  !!db.prepare('SELECT 1 FROM parent_children WHERE parent_user_id = ? AND student_id = ?').get(userId, Number(studentId));

module.exports = { familyUserIds, isParentOf };
