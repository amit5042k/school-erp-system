'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, clearSession, getStoredUser, getToken, setUser } from '@/lib/api';
import { areaForPage, isSelf, levelFor, type Perms } from '@/lib/permissions';
import LicenceBanner, { useLicence } from '@/components/LicenceBanner';
import { disableNotifications } from '@/components/Pwa';
import ChildSwitcher from '@/components/ChildSwitcher';
import { LANGS, getLang, setLang, t, type Lang } from '@/lib/i18n';

/**
 * Sidebar configuration.
 * Items with children render an expandable group; single items link directly.
 */
type Role = 'admin' | 'teacher' | 'student' | 'parent';
// `roles` limits who sees an item; items without it are staff-only (admin + teacher).
type NavItem = { label: string; href?: string; icon?: string; roles?: Role[]; children?: NavItem[] };

const ALL: Role[] = ['admin', 'teacher', 'student', 'parent'];
const ADMIN: Role[] = ['admin'];

const NAV: NavItem[] = [
  { label: 'Home',                  href: '/home',                  icon: '⌂', roles: ALL },
  { label: 'Dashboard',             href: '/dashboard',             icon: '▦', roles: ALL },
  { label: 'Notifications',         href: '/notifications',         icon: '🔔', roles: ALL },
  { label: 'Student',               href: '/students',              icon: '👤' },
  { label: 'Academic Communication',href: '/homework',              icon: '📚', roles: ALL },
  { label: 'Announcements',         href: '/announcements',         icon: '📣', roles: ALL },
  { label: 'Student Leave',         href: '/student-leave',         icon: '🗓', roles: ALL },
  { label: 'Attendance',            href: '/attendance',            icon: '✓' },
  { label: 'Finance',               href: '/fees',                  icon: '₹', roles: ['admin', 'student', 'parent'] },
  { label: 'Online Payments',       href: '/payments',              icon: '💳', roles: ADMIN },
  { label: 'Accounts',              href: '/accounts',              icon: '📒', roles: ADMIN },
  { label: 'Documents',             href: '/documents',             icon: '📄', roles: ALL },
  { label: 'Examination',           icon: '🏆', children: [
    { label: 'Exams',         href: '/exams'     },
    { label: 'Marks Entry',   href: '/marks'     },
    { label: 'Time Table',    href: '/timetable', roles: ALL },
    { label: 'Online Tests',  href: '/online-tests', roles: ALL },
  ]},
  { label: 'Transport',             href: '/transport',             icon: '🚌' },
  { label: 'Bus Tracking',          href: '/bus-tracking',          icon: '📍', roles: ALL },
  { label: 'Settings',              href: '/settings',              icon: '⚙', roles: ADMIN },
  { label: 'Human Resource',        icon: '👥', children: [
    { label: 'Teachers',       href: '/teachers' },
    { label: 'Staff Leaves',   href: '/leaves'   },
    { label: 'Awards',         href: '/awards', roles: ALL },
  ]},
  { label: 'Communication',         href: '/communications',        icon: '💬' },
  { label: 'Absent Alerts',         href: '/absent-alerts',         icon: '📵', roles: ADMIN },
  { label: 'Online Survey',         href: '/surveys',               icon: '🗳', roles: ALL },
  { label: 'Suggestion Box',        href: '/suggestions',           icon: '💡', roles: ALL },
  { label: 'Manage Activities',     href: '/activities',            icon: '🎭' },
  { label: 'Library Management',    href: '/library',               icon: '📖' },
  { label: 'Front Office',          icon: '🏢', roles: ADMIN, children: [
    { label: 'Visitors',    href: '/visitors'    },
    { label: 'Complaints',  href: '/complaints'  },
    { label: 'Postal',      href: '/postal'      },
    { label: 'Call Log',    href: '/calls'       },
    { label: 'Enquiries',   href: '/enquiries'   },
    { label: 'Incidents',   href: '/incidents'   },
  ]},
  { label: 'School calender',       href: '/calendar',              icon: '📅', roles: ALL },
  { label: 'Student Prospectus',    href: '/prospectus',            icon: '🎓', roles: ADMIN },
  { label: 'Hostel',                href: '/hostel',                icon: '🏨' },
  { label: 'My Hostel',             href: '/hostel/my',             icon: '🏨', roles: ['student', 'parent'] },
  { label: 'Payroll Management',    href: '/payroll',               icon: '💰', roles: ['admin', 'teacher'] },
  { label: 'Inventory',             href: '/inventory',             icon: '📦', roles: ADMIN },
  { label: 'Item Requests',         href: '/inventory/requests',    icon: '📦', roles: ['teacher'] },
  { label: 'My In/Out Timing',      href: '/my-timing',             icon: '🕘', roles: ['teacher'] },
  { label: 'Users & Roles',         href: '/users',                 icon: '🔐', roles: ADMIN },
  { label: 'Roles & Permissions',   href: '/roles',                 icon: '🛡', roles: ADMIN },
  { label: 'Bulk Import',           href: '/imports',               icon: '⇪', roles: ADMIN },
  { label: 'Backups',               href: '/backups',               icon: '💾', roles: ADMIN },
  { label: 'Reports',               href: '/reports',               icon: '📊' },
];


function navFor(role: Role, perms?: Perms | null, planAreas?: string[] | null): NavItem[] {
  // Staff roles (principal, accountant, ...) see what their role's areas allow; others go by the item's roles.
  const can = (i: NavItem, inherited?: Role[]) => {
    // Modules outside the school's licensed plan are hidden for everyone.
    const area = i.href ? areaForPage(i.href) : null;
    if (planAreas && area && !planAreas.includes(area) && !isSelf(i.href!)) return false;
    const allowed = i.roles || inherited || ['admin', 'teacher'];
    if (perms && role === 'teacher') {
      if (!i.href) return true;
      // Full acts as admin; Standard acts as teacher, so only show pages a teacher can use.
      const level = levelFor(perms, i.href);
      return level === 'full' || (level === 'standard' && allowed.includes('teacher'));
    }
    return allowed.includes(role);
  };
  return NAV.flatMap(item => {
    if (!item.children) return can(item) ? [item] : [];
    if (item.roles && !can(item)) return [];
    const children = item.children.filter(c => can(c, item.roles));
    return children.length ? [{ ...item, children }] : [];
  });
}

function isActive(href: string | undefined, pathname: string | null) {
  if (!href || !pathname) return false;
  return pathname === href || pathname.startsWith(href + '/');
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUserState] = useState<any>(null);
  const [showNav, setShowNav] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [session, setSession] = useState<string>('');
  const [notif, setNotif] = useState<{ total: number; items: { key: string; label: string; count: number; href: string; tone: string }[] }>({ total: 0, items: [] });
  const [menuOpen, setMenuOpen] = useState<'user' | 'notif' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const licence = useLicence();

  useEffect(() => {
    const u = getStoredUser<any>();
    if (!u || !getToken()) { clearSession(); router.replace('/login'); return; }
    if (u.mustChangePassword && pathname !== '/change-password') { router.replace('/change-password?required=1'); return; }
    api<{ academic_year?: string }>('/settings').then(s => setSession(s?.academic_year || '')).catch(() => {});
    if (!u.mustChangePassword) api<any>('/notifications/summary').then(setNotif).catch(() => {});
    setUserState(u);
    // Role and permissions can change while signed in (e.g. the principal edits a role), so refresh them.
    api<any>('/auth/me').then(me => {
      const fresh = { ...u, ...me };
      if (JSON.stringify(fresh) !== JSON.stringify(u)) { setUser(fresh); setUserState(fresh); }
    }).catch(() => {});
  }, [router, pathname]);

  // Auto-open the group whose child is current route
  useEffect(() => {
    for (const item of NAV) {
      if (item.children?.some(c => isActive(c.href, pathname))) {
        setOpenGroup(item.label);
        return;
      }
    }
  }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  async function logout() { await disableNotifications().catch(() => {}); clearSession(); router.replace('/login'); }

  if (!user) return <div className="min-h-screen grid place-items-center text-gray-500">{t('Loading…')}</div>;

  return (
    <div id="wrapper" className={showNav ? 'show-nav' : ''}>
      <aside id="nav">
        <div className="bg-brand-700 text-white px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white text-brand-700 grid place-items-center font-bold">SE</div>
          <div>
            <div className="font-bold text-sm leading-tight">School ERP</div>
            <div className="text-[10px] opacity-80">SCHOOL MANAGEMENT</div>
          </div>
        </div>
        <nav className="p-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
          <ul className="sidenav">
            {navFor(user.baseRole || user.role, user.perms, licence?.areas).map(item => {
              if (item.children) {
                const expanded = openGroup === item.label;
                const anyActive = item.children.some(c => isActive(c.href, pathname));
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => setOpenGroup(expanded ? null : item.label)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm mb-0.5 text-left ${
                        anyActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700 hover:bg-brand-50'
                      }`}
                    >
                      <span className="w-5 text-center">{item.icon}</span>
                      <span className="flex-1">{t(item.label)}</span>
                      <span className="text-xs opacity-60">{expanded ? '▾' : '▸'}</span>
                    </button>
                    {expanded && (
                      <ul className="ml-8 mb-1">
                        {item.children.map(c => (
                          <li key={c.label}>
                            <Link
                              href={c.href!}
                              onClick={() => setShowNav(false)}
                              className={`block px-3 py-1.5 rounded text-sm mb-0.5 ${
                                isActive(c.href, pathname) ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-brand-50'
                              }`}
                            >
                              {t(c.label)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              }
              const active = isActive(item.href, pathname);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href!}
                    onClick={() => setShowNav(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded text-sm mb-0.5 ${
                      active ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-brand-50'
                    }`}
                  >
                    <span className="w-5 text-center">{item.icon}</span>
                    <span>{t(item.label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div id="main" onClick={() => { if (showNav) setShowNav(false); }}>
        <header className="bg-brand-700 text-white shadow">
          <div className="px-4 py-3 flex items-center gap-4">
            <button className="toggle-nav" onClick={(e) => { e.stopPropagation(); setShowNav(v => !v); }}>☰</button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold leading-tight truncate">School ERP</h1>
              <p className="text-xs opacity-80 truncate">{t('School Management System')}</p>
            </div>

            <div className="hidden md:flex items-center gap-3 text-sm">
              <Link href="/announcements" className="opacity-90 hover:opacity-100">{t('Circulars')}</Link>
              <Link href="/birthdays" className="opacity-90 hover:opacity-100">{t('Birthdays')}</Link>

              <ChildSwitcher />
              {session && ((user.baseRole || user.role) === 'admin' || user.perms?.administration === 'full' ? (
                <Link href="/settings" className="bg-brand-600 text-white text-xs rounded px-2 py-1 border border-brand-500" title="Change the academic session in Settings › School Settings">
                  {t('Session')} {session}
                </Link>
              ) : (
                <span className="bg-brand-600 text-white text-xs rounded px-2 py-1 border border-brand-500">{t('Session')} {session}</span>
              ))}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                className="relative text-xl px-2"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === 'notif' ? null : 'notif'); }}
                title={t('Notifications')}
              >
                🔔
                {notif.total > 0 && (
                  <span className="absolute -top-1 -right-1 bg-accent-500 text-white text-[10px] px-1 rounded-full">{notif.total > 99 ? '99+' : notif.total}</span>
                )}
              </button>
              {menuOpen === 'notif' && (
                <div className="absolute right-0 mt-2 w-64 bg-white text-gray-700 rounded shadow-lg border text-sm z-50">
                  <div className="px-3 py-2 border-b bg-brand-50 font-semibold text-brand-700">{t('Notifications')}</div>
                  {notif.items.map(i => (
                    <Link key={i.key} href={i.href} onClick={() => setMenuOpen(null)} className="flex justify-between px-3 py-2 hover:bg-brand-50 border-b last:border-b-0">
                      <span>{t(i.label)}</span><span className={`badge ${i.count ? `badge-${i.tone}` : 'badge-gray'}`}>{i.count}</span>
                    </Link>
                  ))}
                  {!notif.items.length && <div className="px-3 py-2 text-gray-500">{t('Nothing new.')}</div>}
                </div>
              )}
            </div>

            <div className="relative text-sm">
              <button
                className="flex items-center gap-2"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === 'user' ? null : 'user'); }}
              >
                <div className="hidden sm:block text-right">
                  <div className="font-semibold leading-tight">{user.fullName}</div>
                  <div className="opacity-80 text-[11px] capitalize">{t(user.roleName || (user.role === 'admin' ? 'Super Admin' : user.role === 'parent' ? 'Parent' : user.role === 'student' ? 'Student' : user.role))}</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white text-brand-700 grid place-items-center font-bold">
                  {(user.fullName || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                </div>
              </button>
              {menuOpen === 'user' && (
                <div className="absolute right-0 mt-2 w-56 bg-white text-gray-700 rounded shadow-lg border text-sm z-50">
                  <Link href="/change-password" className="block px-3 py-2 hover:bg-brand-50 border-b">{t('Change Password')}</Link>
                  <Link href="/settings" className="block px-3 py-2 hover:bg-brand-50 border-b">{t('My Profile')}</Link>
                  <div className="px-3 py-2 border-b">
                    <div className="text-[11px] text-gray-500 mb-1">{t('Language')}</div>
                    <div className="flex gap-1">
                      {LANGS.map(l => (
                        <button key={l.key} onClick={() => setLang(l.key as Lang)}
                          className={`px-1.5 py-0.5 rounded text-xs border ${getLang() === l.key ? 'bg-brand-600 text-white border-brand-600' : 'hover:bg-brand-50'}`}>{l.label}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={logout} className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">{t('Logout')}</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <LicenceBanner licence={licence} />
        <main className="flex-1 px-4 py-6">{children}</main>

        <footer className="bg-white border-t">
          <div className="px-4 py-3 text-xs text-gray-500 flex justify-between">
            <div>© {new Date().getFullYear()} School ERP</div>
            <div>{t('School Management System')}</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
