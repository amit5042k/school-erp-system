'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clearSession, getUser } from '@/lib/api';

/**
 * Sidebar configuration.
 * Items with children render an expandable group; single items link directly.
 */
type NavItem = { label: string; href?: string; icon?: string; children?: NavItem[] };

const NAV: NavItem[] = [
  { label: 'Dashboard',             href: '/dashboard',             icon: '▦' },
  { label: 'Student',               href: '/students',              icon: '👤' },
  { label: 'Academic Communication',href: '/homework',              icon: '📚' },
  { label: 'Announcements',         href: '/announcements',         icon: '📣' },
  { label: 'Attendance',            href: '/attendance',            icon: '✓' },
  { label: 'Finance',               href: '/fees',                  icon: '₹' },
  { label: 'Documents',             href: '/documents',             icon: '📄' },
  { label: 'Examination',           icon: '🏆', children: [
    { label: 'Exams',         href: '/exams'     },
    { label: 'Marks Entry',   href: '/marks'     },
    { label: 'Time Table',    href: '/timetable' },
  ]},
  { label: 'Transport',             href: '/transport',             icon: '🚌' },
  { label: 'Settings',              href: '/settings',              icon: '⚙' },
  { label: 'Human Resource',        icon: '👥', children: [
    { label: 'Teachers',       href: '/teachers' },
    { label: 'Staff Leaves',   href: '/leaves'   },
    { label: 'Awards',         href: '/awards'   },
  ]},
  { label: 'Communication',         href: '/communications',        icon: '💬' },
  { label: 'Online Survey',         href: '/surveys',               icon: '🗳' },
  { label: 'Suggestion Box',        href: '/suggestions',           icon: '💡' },
  { label: 'Manage Activities',     href: '/activities',            icon: '🎭' },
  { label: 'Library Management',    href: '/library',               icon: '📖' },
  { label: 'Front Office',          icon: '🏢', children: [
    { label: 'Visitors',    href: '/visitors'    },
    { label: 'Complaints',  href: '/complaints'  },
    { label: 'Postal',      href: '/postal'      },
    { label: 'Call Log',    href: '/calls'       },
    { label: 'Enquiries',   href: '/enquiries'   },
  ]},
  { label: 'School calender',       href: '/calendar',              icon: '📅' },
  { label: 'Student Prospectus',    href: '/prospectus',            icon: '🎓' },
  { label: 'Hostel',                href: '/hostel',                icon: '🏨' },
  { label: 'Payroll Management',    href: '/payroll',               icon: '💰' },
  { label: 'Inventory',             href: '/inventory',             icon: '📦' },
  { label: 'Users & Roles',         href: '/users',                 icon: '🔐' },
  { label: 'Reports',               href: '/reports',               icon: '📊' },
];

const SESSIONS = ['2021-2022','2022-2023','2023-2024','2024-2025','2025-2026','2026-2027'];

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
  const [session, setSession] = useState('2026-2027');
  const [menuOpen, setMenuOpen] = useState<'user' | 'notif' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace('/login'); return; }
    setUserState(u);
  }, [router]);

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

  function logout() { clearSession(); router.replace('/login'); }

  if (!user) return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>;

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
            {NAV.map(item => {
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
                      <span className="flex-1">{item.label}</span>
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
                              {c.label}
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
                    <span>{item.label}</span>
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
              <p className="text-xs opacity-80 truncate">School Management System</p>
            </div>

            <div className="hidden md:flex items-center gap-3 text-sm">
              <Link href="/announcements" className="opacity-90 hover:opacity-100">Circulars</Link>
              <Link href="/birthdays" className="opacity-90 hover:opacity-100">Birthdays</Link>

              <select
                value={session}
                onChange={e => setSession(e.target.value)}
                className="bg-brand-600 text-white text-xs rounded px-2 py-1 border border-brand-500"
                title="Academic Session"
              >
                {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="relative" ref={menuRef}>
              <button
                className="relative text-xl px-2"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === 'notif' ? null : 'notif'); }}
                title="Notifications"
              >
                🔔
                <span className="absolute -top-1 -right-1 bg-accent-500 text-white text-[10px] px-1 rounded-full">35</span>
              </button>
              {menuOpen === 'notif' && (
                <div className="absolute right-0 mt-2 w-64 bg-white text-gray-700 rounded shadow-lg border text-sm z-50">
                  <div className="px-3 py-2 border-b bg-brand-50 font-semibold text-brand-700">Notifications</div>
                  <Link href="/leaves" className="flex justify-between px-3 py-2 hover:bg-brand-50 border-b">
                    <span>Leave Requests</span><span className="badge badge-amber">25</span>
                  </Link>
                  <Link href="/birthdays" className="flex justify-between px-3 py-2 hover:bg-brand-50 border-b">
                    <span>Birthdays Today</span><span className="badge badge-green">7</span>
                  </Link>
                  <Link href="/incidents" className="flex justify-between px-3 py-2 hover:bg-brand-50">
                    <span>Incidents</span><span className="badge badge-red">3</span>
                  </Link>
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
                  <div className="opacity-80 text-[11px] capitalize">{user.role === 'admin' ? 'Super User' : user.role}</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white text-brand-700 grid place-items-center font-bold">
                  {(user.fullName || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                </div>
              </button>
              {menuOpen === 'user' && (
                <div className="absolute right-0 mt-2 w-44 bg-white text-gray-700 rounded shadow-lg border text-sm z-50">
                  <Link href="/change-password" className="block px-3 py-2 hover:bg-brand-50 border-b">Change Password</Link>
                  <Link href="/settings" className="block px-3 py-2 hover:bg-brand-50 border-b">My Profile</Link>
                  <button onClick={logout} className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6">{children}</main>

        <footer className="bg-white border-t">
          <div className="px-4 py-3 text-xs text-gray-500 flex justify-between">
            <div>© {new Date().getFullYear()} School ERP</div>
            <div>School Management System</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
