/**
 * Staff roles and permissions.
 *
 * Every staff login has base role 'teacher' plus a role_key (principal, accountant, clerk, ...). A role grants
 * each AREA one of three levels:
 *   full     – same as the Super Admin for that area
 *   standard – same as a teacher (mark attendance, enter own marks, see lists; no admin actions)
 *   none     – no access, except self-service (own leaves, payslips, notices, timetable)
 *
 * Instead of rewriting every route's role check, authRequired swaps req.user.role for the effective role of the
 * area being requested ('admin' for full, 'teacher' for standard), so existing checks and controller scoping keep
 * working unchanged. Super Admins (base role 'admin'), students and parents are never remapped.
 */

const AREAS = [
  { key: 'students', label: 'Students & Admissions' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'academics', label: 'Exams, Timetable & Classes' },
  { key: 'academic-comm', label: 'Homework, Diary & Content' },
  { key: 'communication', label: 'SMS, Email & Notices' },
  { key: 'finance', label: 'Fees & Finance' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'hr', label: 'Human Resource & Leaves' },
  { key: 'library', label: 'Library' },
  { key: 'transport', label: 'Transport' },
  { key: 'hostel', label: 'Hostel' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'front-office', label: 'Front Office' },
  { key: 'administration', label: 'Users, Settings, Devices & Backups' },
];
const AREA_KEYS = AREAS.map(a => a.key);
const LEVELS = ['none', 'standard', 'full'];

// API path prefix → area. First match wins, so more specific prefixes come first.
const API_AREAS = [
  ['/imports/students', 'students'], ['/imports/parents', 'students'], ['/imports/student-logins', 'students'],
  ['/imports/staff', 'hr'], ['/imports/opening', 'finance'], ['/imports', 'administration'], ['/family', 'administration'],
  ['/comm/surveys', 'academic-comm'],
  ['/comm/announcements', 'communication'],
  ['/comm/groups', 'communication'], ['/comm/recipients', 'communication'], ['/comm/send', 'communication'],
  ['/comm/batches', 'communication'], ['/comm/summary', 'communication'],
  ['/comm', 'academic-comm'],
  ['/students', 'students'], ['/stu', 'students'], ['/enquiries', 'students'], ['/prospectus', 'students'],
  ['/attendance', 'attendance'],
  ['/exam-schedule', 'academics'], ['/exams', 'academics'], ['/exam', 'academics'], ['/marks', 'academics'],
  ['/timetable', 'academics'], ['/academic', 'academics'], ['/classes', 'academics'],
  ['/homework', 'academic-comm'], ['/activities', 'academic-comm'], ['/events', 'academic-comm'],
  ['/surveys', 'academic-comm'], ['/documents', 'academic-comm'],
  ['/communications', 'communication'], ['/messaging', 'communication'], ['/announcements', 'communication'],
  ['/fees', 'finance'], ['/finance', 'finance'],
  ['/payroll', 'payroll'], ['/pay', 'payroll'],
  ['/teachers', 'hr'], ['/hr', 'hr'], ['/leaves', 'hr'], ['/leave-allowances', 'hr'], ['/awards', 'hr'],
  ['/books', 'library'], ['/book-issues', 'library'], ['/lib', 'library'],
  ['/vehicles', 'transport'], ['/routes', 'transport'], ['/student-transport', 'transport'], ['/tr', 'transport'],
  ['/hostel-allotments', 'hostel'], ['/hostel-rooms', 'hostel'], ['/hostels', 'hostel'],
  ['/inventory', 'inventory'], ['/inv', 'inventory'],
  ['/visitors', 'front-office'], ['/complaints', 'front-office'], ['/postal', 'front-office'], ['/calls', 'front-office'],
  ['/incidents', 'front-office'], ['/suggestions', 'front-office'],
  ['/users', 'administration'], ['/admin', 'administration'], ['/settings', 'administration'], ['/roles', 'administration'],
  ['/biometric', 'administration'], ['/uploads', null], ['/masters', null],
];

// Report group (as shown in Reports) → area, so reports follow the same permissions as their module.
const REPORT_GROUP_AREAS = {
  'Student': 'students', 'Students': 'students', 'Attendance': 'attendance', 'Examination': 'academics',
  'Academic Communication': 'academic-comm', 'Communication': 'communication', 'Finance': 'finance',
  'Payroll': 'payroll', 'Human Resource': 'hr', 'Library': 'library', 'Transport': 'transport', 'Hostel': 'hostel',
  'Inventory': 'inventory', 'Front Office': 'front-office', 'Biometric': 'administration',
};

// Reachable by every staff member whatever their role: their own records (controllers scope these to the user),
// school-wide notices, and lookups that dropdowns everywhere depend on.
const SELF_SERVICE = [
  [/^GET \/(students|teachers|classes|masters|master-types|settings|report-catalog|notifications|dashboard)(\/|$)/],
  [/^(GET|POST|PUT|DELETE) \/leaves(\/|$)/],
  [/^GET \/leave-allowances$/],
  [/^GET \/pay\/(my-slips|slip\/\d+|form16|financial-years)$/],
  [/^GET \/(announcements|events|documents|timetable|awards)(\/|$)/],
  [/^GET \/academic\/timetable\/teacher\/\d+$/],
  [/^(GET|POST) \/comm\/surveys\/(open|\d+\/vote)$/],
  [/^POST \/suggestions$/],
  [/^(GET|POST) \/inv\/requests(\/|$)/],
  [/^(GET|POST|PUT|DELETE) \/push(\/|$)/],
  [/^GET \/files\//],
];

const ALL = (level) => Object.fromEntries(AREA_KEYS.map(k => [k, level]));
const with_ = (base, overrides) => ({ ...base, ...overrides });

// Typical starting points; the principal or IT head can change any of these on the Roles & Permissions page.
const DEFAULT_ROLES = [
  { key: 'principal', name: 'Principal', perms: ALL('full') },
  { key: 'academic-coordinator', name: 'Academic Coordinator', perms: with_(ALL('standard'), {
    academics: 'full', 'academic-comm': 'full', attendance: 'full', communication: 'full',
    finance: 'none', payroll: 'none', administration: 'none' }) },
  { key: 'it-head', name: 'IT Head', perms: with_(ALL('standard'), {
    administration: 'full', finance: 'none', payroll: 'none' }) },
  { key: 'office-superintendent', name: 'Office Superintendent', perms: with_(ALL('standard'), {
    students: 'full', 'front-office': 'full', hr: 'full', communication: 'full', attendance: 'full',
    transport: 'full', hostel: 'full', inventory: 'full', payroll: 'none', administration: 'none' }) },
  { key: 'clerk', name: 'Clerk', perms: with_(ALL('standard'), {
    students: 'full', 'front-office': 'full', finance: 'none', payroll: 'none', hr: 'none', administration: 'none' }) },
  { key: 'accountant', name: 'Accountant', perms: with_(ALL('standard'), {
    finance: 'full', payroll: 'full', inventory: 'full', administration: 'none' }) },
  { key: 'teacher', name: 'Teacher', perms: with_(ALL('standard'), {
    finance: 'none', payroll: 'none', administration: 'none' }) },
  { key: 'staff', name: 'Non-Teaching Staff', perms: with_(ALL('none'), {
    library: 'standard', transport: 'standard', inventory: 'standard', 'front-office': 'standard' }) },
];

function areaForPath(path) {
  for (const [prefix, area] of API_AREAS) {
    if (path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?')) return area;
  }
  return null;
}

const isSelfService = (method, path) => SELF_SERVICE.some(([re]) => re.test(`${method} ${path}`));

const roleFor = (level) => (level === 'full' ? 'admin' : 'teacher');

/**
 * Effective role for one request by a staff member with role permissions.
 * Returns { role } or { deny: areaLabel } when the role has no access to that area.
 */
function effectiveRole(perms, method, path) {
  const area = areaForPath(path);
  if (!area) return { role: 'teacher' };
  const level = perms[area] || 'none';
  if (level !== 'none') return { role: roleFor(level) };
  if (isSelfService(method, path)) return { role: 'teacher' };
  return { deny: AREAS.find(a => a.key === area)?.label || area };
}

// Effective role inside an area (used where the URL alone doesn't say, e.g. reports).
function roleInArea(perms, area) {
  if (!area) return 'teacher';
  const level = perms[area] || 'none';
  return level === 'none' ? null : roleFor(level);
}

function normalizePerms(perms) {
  const out = {};
  for (const k of AREA_KEYS) out[k] = LEVELS.includes(perms?.[k]) ? perms[k] : 'none';
  return out;
}

module.exports = {
  AREAS, AREA_KEYS, LEVELS, DEFAULT_ROLES, REPORT_GROUP_AREAS,
  areaForPath, isSelfService, effectiveRole, roleInArea, normalizePerms,
};
