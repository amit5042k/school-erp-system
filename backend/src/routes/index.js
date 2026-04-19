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
const { authRequired, requireRole } = require('../middleware/auth');

// Auth
router.post('/auth/login', auth.login);
router.get('/auth/me', authRequired, auth.me);

// Dashboard
router.get('/dashboard', authRequired, dashboard.summary);

// Students
router.get('/students', authRequired, students.list);
router.get('/students/:id', authRequired, students.get);
router.post('/students', authRequired, requireRole('admin'), students.create);
router.put('/students/:id', authRequired, requireRole('admin'), students.update);
router.delete('/students/:id', authRequired, requireRole('admin'), students.remove);

// Teachers
router.get('/teachers', authRequired, teachers.list);
router.get('/teachers/:id', authRequired, teachers.get);
router.post('/teachers', authRequired, requireRole('admin'), teachers.create);
router.put('/teachers/:id', authRequired, requireRole('admin'), teachers.update);
router.delete('/teachers/:id', authRequired, requireRole('admin'), teachers.remove);

// Classes
router.get('/classes', authRequired, classes.list);
router.post('/classes', authRequired, requireRole('admin'), classes.create);

// Attendance
router.get('/attendance', authRequired, attendance.byDate);
router.post('/attendance/bulk', authRequired, requireRole('admin', 'teacher'), attendance.markBulk);
router.get('/attendance/student/:studentId', authRequired, attendance.byStudent);

// Fees
router.get('/fees', authRequired, requireRole('admin'), fees.list);
router.get('/fees/student/:studentId', authRequired, fees.byStudent);
router.post('/fees', authRequired, requireRole('admin'), fees.create);
router.post('/fees/:id/pay', authRequired, requireRole('admin'), fees.pay);

// Timetable
router.get('/timetable/class/:classId', authRequired, timetable.byClass);
router.post('/timetable', authRequired, requireRole('admin'), timetable.upsert);

// Announcements
router.get('/announcements', authRequired, announcements.list);
router.post('/announcements', authRequired, requireRole('admin', 'teacher'), announcements.create);
router.delete('/announcements/:id', authRequired, requireRole('admin'), announcements.remove);

/* ---------- Extended modules ---------- */
function crud(path, ctrl, roles = ['admin']) {
  router.get(path, authRequired, ctrl.list);
  if (ctrl.get) router.get(`${path}/:id`, authRequired, ctrl.get);
  router.post(path, authRequired, requireRole(...roles), ctrl.create);
  if (ctrl.update) router.put(`${path}/:id`, authRequired, requireRole(...roles), ctrl.update);
  if (ctrl.remove) router.delete(`${path}/:id`, authRequired, requireRole(...roles), ctrl.remove);
}

// Admissions
crud('/enquiries', m.enquiries, ['admin']);

// Front Office
crud('/visitors', m.visitors, ['admin']);
crud('/complaints', m.complaints, ['admin']);
crud('/postal', m.postal, ['admin']);
crud('/calls', m.calls, ['admin']);

// Examinations
crud('/exams', m.exams, ['admin']);
crud('/exam-schedule', m.examSchedule, ['admin','teacher']);
router.get('/marks', authRequired, m.listMarks);
router.post('/marks', authRequired, requireRole('admin','teacher'), m.upsertMarks);

// Library
crud('/books', m.books, ['admin']);
router.get('/book-issues', authRequired, m.listBookIssues);
router.post('/book-issues', authRequired, requireRole('admin','teacher'), m.issueBook);
router.post('/book-issues/:id/return', authRequired, requireRole('admin','teacher'), m.returnBook);

// Transport
crud('/vehicles', m.vehicles, ['admin']);
crud('/routes', m.routes, ['admin']);
crud('/student-transport', m.studentTransport, ['admin']);

// Hostel
crud('/hostels', m.hostels, ['admin']);
crud('/hostel-rooms', m.hostelRooms, ['admin']);
crud('/hostel-allotments', m.hostelAllotments, ['admin']);

// Inventory
crud('/inventory/items', m.inventoryItems, ['admin']);
router.get('/inventory/movements', authRequired, m.inventoryMoveList);
router.post('/inventory/movements', authRequired, requireRole('admin'), m.inventoryMove);

// HR
crud('/leaves', m.leaves, ['admin','teacher']);
crud('/payroll', m.payroll, ['admin']);

// Homework
crud('/homework', m.homework, ['admin','teacher']);

// Communications
router.get('/communications', authRequired, m.communications.list);
router.post('/communications', authRequired, requireRole('admin','teacher'), m.communications.create);

// Documents
crud('/documents', m.documents, ['admin','teacher']);

// Users
router.get('/users', authRequired, requireRole('admin'), m.users.list);
router.post('/users', authRequired, requireRole('admin'), m.users.create);
router.post('/users/:id/active', authRequired, requireRole('admin'), m.users.setActive);
router.post('/users/:id/reset-password', authRequired, requireRole('admin'), m.users.resetPassword);

// Settings
router.get('/settings', authRequired, m.settings.get);
router.put('/settings', authRequired, requireRole('admin'), m.settings.update);

// Reports
router.get('/reports/summary', authRequired, m.reports);

module.exports = router;
