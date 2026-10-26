// Mirrors backend/src/utils/permissions.js for screens: which area each page belongs to, and what a staff
// role's level there means for the page (full → acts as admin, standard → acts as teacher, none → hidden).

export type Level = 'none' | 'standard' | 'full';
export type Perms = Record<string, Level>;

const PAGE_AREAS: [string, string][] = [
  ['/students', 'students'], ['/prospectus', 'students'], ['/enquiries', 'students'],
  ['/attendance', 'attendance'],
  ['/exams', 'academics'], ['/online-tests', 'academics'], ['/marks', 'academics'], ['/timetable', 'academics'], ['/academic', 'academics'],
  ['/homework', 'academic-comm'], ['/academic-comm', 'academic-comm'], ['/activities', 'academic-comm'],
  ['/calendar', 'academic-comm'], ['/surveys', 'academic-comm'], ['/documents', 'academic-comm'],
  ['/communications', 'communication'], ['/comms', 'communication'], ['/announcements', 'communication'],
  ['/fees', 'finance'], ['/finance', 'finance'], ['/payments', 'finance'], ['/accounts', 'accounts'],
  ['/student-leave', 'attendance'], ['/absent-alerts', 'communication'],
  ['/payroll', 'payroll'],
  ['/teachers', 'hr'], ['/hr', 'hr'], ['/leaves', 'hr'], ['/awards', 'hr'],
  ['/library', 'library'], ['/transport', 'transport'], ['/bus-tracking', 'transport'], ['/hostel', 'hostel'], ['/inventory', 'inventory'],
  ['/visitors', 'front-office'], ['/complaints', 'front-office'], ['/postal', 'front-office'], ['/calls', 'front-office'],
  ['/incidents', 'front-office'], ['/suggestions', 'front-office'],
  ['/users', 'administration'], ['/settings', 'administration'], ['/backups', 'administration'],
  ['/send-credentials', 'administration'], ['/roles', 'administration'], ['/imports', 'administration'],
];

// Pages every staff member can open for their own records or school notices, whatever their role.
const SELF_SERVICE = ['/leaves', '/payroll', '/announcements', '/calendar', '/timetable', '/surveys', '/suggestions',
  '/documents', '/awards', '/inventory/requests', '/home', '/notifications', '/dashboard', '/change-password', '/birthdays'];

export function areaForPage(pathname: string): string | null {
  for (const [prefix, area] of PAGE_AREAS) if (pathname === prefix || pathname.startsWith(prefix + '/')) return area;
  return null;
}

export const isSelf = (pathname: string) => SELF_SERVICE.some(p => pathname === p || pathname.startsWith(p + '/'));

export function levelFor(perms: Perms | null | undefined, pathname: string): Level {
  if (!perms) return 'full';
  const area = areaForPage(pathname);
  if (!area) return 'standard';
  const level = perms[area] || 'none';
  return level === 'none' && isSelf(pathname) ? 'standard' : level;
}

/** Role a page should behave as for this user, matching what the server will allow there. */
export function effectiveRoleFor(user: { role: string; baseRole?: string; perms?: Perms | null }, pathname: string): string {
  const base = user.baseRole || user.role;
  if (base !== 'teacher' || !user.perms) return base;
  return levelFor(user.perms, pathname) === 'full' ? 'admin' : 'teacher';
}

export const canSeePage = (perms: Perms | null | undefined, pathname: string) => levelFor(perms, pathname) !== 'none';
