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

module.exports = router;
