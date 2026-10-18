// Everything a feature module needs, in one import:
//   const { db, auth, role, crud, ... } = require('./_kit');
const db = require('../config/db');
const { authRequired, requireRole, isStaff, canSeeStudent, ownStudentOnly } = require('../middleware/auth');
const { makeCrud } = require('../utils/crud');
const { today, dbError, isDate, num, badUrl } = require('../utils/http');
const { registerReport } = require('../utils/reports');
const { registerMaster, masterNames } = require('../utils/masters');
const messaging = require('../utils/messaging');

const ROLES = {
  ALL: ['admin', 'teacher', 'student', 'parent'],
  STAFF: ['admin', 'teacher'],
  ADMIN: ['admin'],
};

// SQLite has no ADD COLUMN IF NOT EXISTS; ignore "duplicate column" so migrations can re-run.
function addColumn(table, columnDef) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); } catch (e) {
    if (!/duplicate column/i.test(e.message)) throw e;
  }
}

// Mount list/get/create/update/delete for a makeCrud controller with read/write role lists.
function mountCrud(router, path, ctrl, { read = ROLES.STAFF, write = ROLES.ADMIN } = {}) {
  router.get(path, authRequired, requireRole(...read), ctrl.list);
  if (ctrl.get) router.get(`${path}/:id`, authRequired, requireRole(...read), ctrl.get);
  if (ctrl.create) router.post(path, authRequired, requireRole(...write), ctrl.create);
  if (ctrl.update) router.put(`${path}/:id`, authRequired, requireRole(...write), ctrl.update);
  if (ctrl.remove) router.delete(`${path}/:id`, authRequired, requireRole(...write), ctrl.remove);
}

// Wrap a handler so thrown SQLite constraint errors become readable 4xx responses.
const safe = (fn) => (req, res, next) => {
  try { return fn(req, res, next); } catch (e) {
    try { return dbError(res, e); } catch (err) { return next(err); }
  }
};

const currentSession = () =>
  db.prepare('SELECT academic_year FROM school_settings WHERE id = 1').get()?.academic_year || '';

module.exports = {
  db, ROLES,
  auth: authRequired, role: requireRole, isStaff, canSeeStudent, ownStudentOnly,
  makeCrud, mountCrud, safe, addColumn,
  today, dbError, isDate, num, badUrl, currentSession,
  registerReport, registerMaster, masterNames, messaging,
};
