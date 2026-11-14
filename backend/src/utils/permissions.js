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
  { key: 'accounts', label: 'Accounts & Vouchers' },
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

/**
 * Fine-grained switches inside each area a role can open. The level still decides scope (Standard = a teacher's
 * view of the area, Full = the office's); these switch individual kinds of action off. Viewing is implied by any
 * level above none. Everything is on unless switched off, so roles saved before these existed keep their access.
 */
const ACTIONS = [
  { key: 'add', label: 'Add', hint: 'Create new records (admissions, receipts, vouchers, notices…)' },
  { key: 'edit', label: 'Edit', hint: 'Change existing records' },
  { key: 'delete', label: 'Delete', hint: 'Remove records' },
  { key: 'approve', label: 'Approve', hint: 'Decide and finalise: approve/reject leave, publish results, cancel receipts, clear or bounce cheques, mark salaries paid' },
  { key: 'export', label: 'Export', hint: 'Download Excel, print reports, Tally export, templates and backups' },
];
const ACTION_KEYS = ACTIONS.map(a => a.key);
// Requests that decide or finalise something, whatever their HTTP method.
const APPROVE_RE = /\/(decision|decide|approve|reject|publish|release|cancel|clear|bounce|mark-paid|action|reconciliation|app-blocks)(\/|$)/;
// Downloads.
const EXPORT_RE = /\/(tally|template|download|export)(\/|$)|\/errors\/|\.(xml|xlsx|csv)$/;

/** The kind of action a request is: null for viewing, else one of ACTION_KEYS. */
function actionFor(method, path) {
  const p = normPath(path);
  if (method === 'GET' || method === 'HEAD') return EXPORT_RE.test(p) ? 'export' : null;
  if (APPROVE_RE.test(p)) return 'approve';
  if (method === 'POST' && /\/(delete|remove)(\/|$)/.test(p)) return 'delete';   // bulk deletes sent as POST
  if (method === 'POST') return 'add';
  if (method === 'DELETE') return 'delete';
  return 'edit';
}

function normalizeActions(actions) {
  const out = {};
  for (const k of AREA_KEYS) out[k] = Object.fromEntries(ACTION_KEYS.map(a => [a, actions?.[k]?.[a] !== false]));
  return out;
}

// API path prefix → area. First match wins, so more specific prefixes come first.
const API_AREAS = [
  ['/imports/students', 'students'], ['/imports/parents', 'students'], ['/imports/student-logins', 'students'],
  ['/payments', 'finance'], ['/student-leave', 'attendance'], ['/absent-alerts', 'communication'],
  ['/imports/staff', 'hr'], ['/imports/opening', 'finance'], ['/imports', 'administration'], ['/family', 'administration'],
  ['/comm/surveys', 'academic-comm'],
  ['/comm/announcements', 'communication'],
  ['/comm/groups', 'communication'], ['/comm/recipients', 'communication'], ['/comm/send', 'communication'],
  ['/comm/batches', 'communication'], ['/comm/summary', 'communication'],
  ['/comm', 'academic-comm'],
  ['/students', 'students'], ['/stu', 'students'], ['/enquiries', 'students'], ['/prospectus', 'students'],
  ['/attendance', 'attendance'],
  ['/online-tests', 'academics'], ['/hostel-ops', 'hostel'], ['/bus-tracking', 'transport'],
  ['/exam-schedule', 'academics'], ['/exams', 'academics'], ['/exam', 'academics'], ['/marks', 'academics'],
  ['/timetable', 'academics'], ['/academic', 'academics'], ['/classes', 'academics'],
  ['/homework', 'academic-comm'], ['/activities', 'academic-comm'], ['/events', 'academic-comm'],
  ['/surveys', 'academic-comm'], ['/documents', 'academic-comm'],
  ['/communications', 'communication'], ['/messaging', 'communication'], ['/announcements', 'communication'],
  ['/fees', 'finance'], ['/finance', 'finance'], ['/accounts', 'accounts'],
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
  'Academic Communication': 'academic-comm', 'Communication': 'communication', 'Finance': 'finance', 'Accounts': 'accounts',
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
  [/^GET \/hr\/my-timing$/],
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
// Books of account are kept to the principal and accountant unless the school opens them up.
const DEFAULT_ROLES = [
  { key: 'principal', name: 'Principal', perms: ALL('full') },
  { key: 'academic-coordinator', name: 'Academic Coordinator', perms: with_(ALL('standard'), {
    academics: 'full', 'academic-comm': 'full', attendance: 'full', communication: 'full',
    finance: 'none', accounts: 'none', payroll: 'none', administration: 'none' }) },
  { key: 'it-head', name: 'IT Head', perms: with_(ALL('standard'), {
    administration: 'full', finance: 'none', accounts: 'none', payroll: 'none' }) },
  { key: 'office-superintendent', name: 'Office Superintendent', perms: with_(ALL('standard'), {
    students: 'full', 'front-office': 'full', hr: 'full', communication: 'full', attendance: 'full',
    transport: 'full', hostel: 'full', inventory: 'full', accounts: 'none', payroll: 'none', administration: 'none' }) },
  { key: 'clerk', name: 'Clerk', perms: with_(ALL('standard'), {
    students: 'full', 'front-office': 'full', finance: 'none', accounts: 'none', payroll: 'none', hr: 'none', administration: 'none' }) },
  { key: 'accountant', name: 'Accountant', perms: with_(ALL('standard'), {
    finance: 'full', accounts: 'full', payroll: 'full', inventory: 'full', administration: 'none' }) },
  { key: 'teacher', name: 'Teacher', perms: with_(ALL('standard'), {
    finance: 'none', accounts: 'none', payroll: 'none', administration: 'none' }) },
  { key: 'staff', name: 'Non-Teaching Staff', perms: with_(ALL('none'), {
    library: 'standard', transport: 'standard', inventory: 'standard', 'front-office': 'standard' }) },
];

// Express matches routes regardless of case and trailing slash, so compare on the same terms; otherwise
// '/api/Fees' would reach the fees routes while matching no area and slip past the role's restrictions.
const normPath = (path) => String(path || '').split('?')[0].toLowerCase().replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1');

function areaForPath(path) {
  path = normPath(path);
  for (const [prefix, area] of API_AREAS) {
    if (path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?')) return area;
  }
  return null;
}

const isSelfService = (method, path) => SELF_SERVICE.some(([re]) => re.test(`${method} ${normPath(path)}`));

const roleFor = (level) => (level === 'full' ? 'admin' : 'teacher');

/**
 * Effective role for one request by a staff member with role permissions.
 * Returns { role } or { deny: areaLabel } when the role has no access to that area.
 */
function effectiveRole(perms, method, path, actions) {
  const area = areaForPath(path);
  if (!area) return { role: 'teacher' };
  const level = perms[area] || 'none';
  const label = AREAS.find(a => a.key === area)?.label || area;
  // Own records (own leave, payslips, timing…) stay open whatever the role's switches say. That holds at teacher
  // scope, where the server limits these routes to the person's own records; at Full the same routes reach
  // everyone's, so the switches apply there.
  if (isSelfService(method, path) && level !== 'full') return { role: 'teacher' };
  if (level === 'none') return { deny: label };
  const act = actionFor(method, path);
  if (act && actions?.[area]?.[act] === false) return { deny: label, action: act };
  return { role: roleFor(level) };
}

// Effective role inside an area (used where the URL alone doesn't say, e.g. reports).
function roleInArea(perms, area) {
  if (!area) return 'teacher';
  const level = perms[area] || 'none';
  return level === 'none' ? null : roleFor(level);
}

/**
 * Label of the first area where `perms` grants more than `mine`, or null when it grants nothing more.
 * Staff who manage users and roles may only hand out (or take over) access they have themselves.
 */
function exceedsPerms(perms, mine, actions, myActions) {
  const rank = (l) => LEVELS.indexOf(l || 'none');
  const area = AREAS.find(a => rank(perms?.[a.key]) > rank(mine?.[a.key]));
  if (area) return area.label;
  // Nor an action switched off for themselves (when both sides' switches are known).
  if (actions && myActions) {
    for (const a of AREAS) {
      if ((perms?.[a.key] || 'none') === 'none') continue;
      const act = ACTIONS.find(x => actions[a.key]?.[x.key] !== false && myActions[a.key]?.[x.key] === false);
      if (act) return `${a.label}: ${act.label}`;
    }
  }
  return null;
}

function normalizePerms(perms) {
  const out = {};
  for (const k of AREA_KEYS) out[k] = LEVELS.includes(perms?.[k]) ? perms[k] : 'none';
  return out;
}

module.exports = {
  AREAS, AREA_KEYS, LEVELS, DEFAULT_ROLES, REPORT_GROUP_AREAS,
  areaForPath, isSelfService, effectiveRole, roleInArea, normalizePerms, normPath, exceedsPerms,
  ACTIONS, ACTION_KEYS, actionFor, normalizeActions,
};
