const router = require('express').Router();
const auth = require('../controllers/authController');
const students = require('../controllers/studentsController');
const teachers = require('../controllers/teachersController');
const attendance = require('../controllers/attendanceController');
const fees = require('../controllers/feesController');
const timetable = require('../controllers/timetableController');
const announcements = require('../controllers/announcementsController');
const classes = require('../controllers/classesController');
const dashboard = require('../controllers/dashboardController');
const m = require('../controllers/moduleControllers');
const { authRequired, requireRole, ownStudentOnly } = require('../middleware/auth');
const { registerModules } = require('../modules');

const ALL = ['admin', 'teacher', 'student', 'parent'];
const STAFF = ['admin', 'teacher'];
const ADMIN = ['admin'];

// Auth
router.post('/auth/login', auth.login);
router.get('/auth/me', authRequired, auth.me);
router.post('/auth/change-password', authRequired, auth.changePassword);

// Dashboard
router.get('/dashboard', authRequired, dashboard.summary);

// Students (students/parents are scoped to their own record inside the controller)
router.get('/students', authRequired, students.list);
router.get('/students/:id', authRequired, students.get);
router.post('/students', authRequired, requireRole(...ADMIN), students.create);
router.put('/students/:id', authRequired, requireRole(...ADMIN), students.update);
router.delete('/students/:id', authRequired, requireRole(...ADMIN), students.remove);

// Teachers
router.get('/teachers', authRequired, teachers.list);
router.get('/teachers/:id', authRequired, teachers.get);
router.post('/teachers', authRequired, requireRole(...ADMIN), teachers.create);
router.put('/teachers/:id', authRequired, requireRole(...ADMIN), teachers.update);
router.delete('/teachers/:id', authRequired, requireRole(...ADMIN), teachers.remove);

// Classes
router.get('/classes', authRequired, classes.list);
router.post('/classes', authRequired, requireRole(...ADMIN), classes.create);
router.put('/classes/:id', authRequired, requireRole(...ADMIN), classes.update);
router.delete('/classes/:id', authRequired, requireRole(...ADMIN), classes.remove);

// Attendance
router.get('/attendance', authRequired, requireRole(...STAFF), attendance.byDate);
router.post('/attendance/bulk', authRequired, requireRole(...STAFF), attendance.markBulk);
router.get('/attendance/student/:studentId', authRequired, ownStudentOnly(), attendance.byStudent);

// Fees
router.get('/fees', authRequired, requireRole(...ADMIN), fees.list);
router.get('/fees/student/:studentId', authRequired, ownStudentOnly(), fees.byStudent);
router.get('/fees/:id/payments', authRequired, fees.payments);
router.post('/fees', authRequired, requireRole(...ADMIN), fees.create);
router.post('/fees/:id/pay', authRequired, requireRole(...ADMIN), fees.pay);

// Timetable
router.get('/timetable/class/:classId', authRequired, timetable.byClass);
router.post('/timetable', authRequired, requireRole(...ADMIN), timetable.upsert);
router.delete('/timetable/:id', authRequired, requireRole(...ADMIN), timetable.remove);

// Announcements
router.get('/announcements', authRequired, announcements.list);
router.post('/announcements', authRequired, requireRole(...STAFF), announcements.create);
router.delete('/announcements/:id', authRequired, requireRole(...ADMIN), announcements.remove);

/* ---------- Extended modules ---------- */
// `read` = roles allowed to list/get, `write` = roles allowed to create/update/delete.
function crud(path, ctrl, { read = STAFF, write = ADMIN } = {}) {
  router.get(path, authRequired, requireRole(...read), ctrl.list);
  if (ctrl.get) router.get(`${path}/:id`, authRequired, requireRole(...read), ctrl.get);
  router.post(path, authRequired, requireRole(...write), ctrl.create);
  if (ctrl.update) router.put(`${path}/:id`, authRequired, requireRole(...write), ctrl.update);
  if (ctrl.remove) router.delete(`${path}/:id`, authRequired, requireRole(...write), ctrl.remove);
}

// Admissions & Front Office (contain visitors' and parents' personal details)
crud('/enquiries', m.enquiries, { read: ADMIN });
crud('/visitors', m.visitors, { read: ADMIN });
crud('/complaints', m.complaints, { read: ADMIN });
crud('/postal', m.postal, { read: ADMIN });
crud('/calls', m.calls, { read: ADMIN });
crud('/incidents', m.incidents, { read: STAFF });
router.get('/prospectus/next-no', authRequired, requireRole(...ADMIN), m.prospectus.nextNo);
crud('/prospectus', m.prospectus, { read: ADMIN });

// Examinations (marks are scoped to the student's own record inside the controller)
crud('/exams', m.exams, { read: ALL });
crud('/exam-schedule', m.examSchedule, { read: ALL, write: STAFF });
router.get('/marks', authRequired, m.listMarks);
// Teachers enter marks through /exam/marks/bulk, which enforces subject assignment and the publish lock.
router.post('/marks', authRequired, requireRole(...ADMIN), m.upsertMarks);

// Library
crud('/books', m.books, { read: ALL });
router.get('/book-issues', authRequired, m.listBookIssues);
router.post('/book-issues', authRequired, requireRole(...STAFF), m.issueBook);
router.post('/book-issues/:id/return', authRequired, requireRole(...STAFF), m.returnBook);

// Transport
crud('/vehicles', m.vehicles, { read: STAFF });
crud('/routes', m.routes, { read: ALL });
crud('/student-transport', m.studentTransport, { read: STAFF });

// Hostel
crud('/hostels', m.hostels, { read: ALL });
crud('/hostel-rooms', m.hostelRooms, { read: STAFF });
crud('/hostel-allotments', m.hostelAllotments, { read: STAFF });
router.post('/hostel-allotments/:id/vacate', authRequired, requireRole(...ADMIN), m.vacateAllotment);

// Inventory
crud('/inventory/items', m.inventoryItems, { read: ADMIN });
router.get('/inventory/movements', authRequired, requireRole(...ADMIN), m.inventoryMoveList);
router.post('/inventory/movements', authRequired, requireRole(...ADMIN), m.inventoryMove);

// HR (teachers only see and change their own leaves inside the controller)
crud('/leaves', m.leaves, { read: STAFF, write: STAFF });
router.get('/leaves/balance/:teacherId', authRequired, requireRole(...STAFF), m.leaveBalance);
router.post('/leaves/:id/decision', authRequired, requireRole(...ADMIN), m.leaveDecision);
router.get('/leave-allowances', authRequired, requireRole(...STAFF), m.leaveAllowances.list);
router.post('/leave-allowances', authRequired, requireRole(...ADMIN), m.leaveAllowances.upsert);
crud('/payroll', m.payroll, { read: ADMIN });
crud('/awards', m.awards, { read: ALL });

// Academics
// Students and parents read homework through /comm/homework, which is scoped to their class.
crud('/homework', m.homework, { read: STAFF, write: STAFF });
crud('/events', m.events, { read: ALL });
crud('/surveys', m.surveys, { read: ALL, write: STAFF });
crud('/activities', m.activities, { read: ALL, write: STAFF });
crud('/documents', m.documents, { read: ALL, write: STAFF });

// Suggestion box: anyone can post, only admins read
router.get('/suggestions', authRequired, requireRole(...ADMIN), m.suggestions.list);
router.post('/suggestions', authRequired, m.suggestions.create);
router.put('/suggestions/:id', authRequired, requireRole(...ADMIN), m.suggestions.update);
router.delete('/suggestions/:id', authRequired, requireRole(...ADMIN), m.suggestions.remove);

// Communications
router.get('/communications', authRequired, requireRole(...STAFF), m.communications.list);
router.post('/communications', authRequired, requireRole(...STAFF), m.communications.create);

// Users
router.get('/users', authRequired, requireRole(...ADMIN), m.users.list);
router.post('/users', authRequired, requireRole(...ADMIN), m.users.create);
router.post('/users/:id/active', authRequired, requireRole(...ADMIN), m.users.setActive);
router.post('/users/:id/reset-password', authRequired, requireRole(...ADMIN), m.users.resetPassword);
router.post('/users/:id/role', authRequired, requireRole(...ADMIN), m.users.setRole);

// Settings
router.get('/settings', authRequired, m.settings.get);
router.put('/settings', authRequired, requireRole(...ADMIN), m.settings.update);

// Reports
router.get('/reports/summary', authRequired, requireRole(...STAFF), m.reports);

// Feature modules in src/modules (reports, masters, uploads, and each module area)
registerModules(router);

module.exports = router;
