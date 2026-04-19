'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getUser } from '@/lib/api';

type NavItem = { href: string; label: string; icon?: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { title: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: '▦' },
    { href: '/reports', label: 'Reports', icon: '📊' },
  ]},
  { title: 'Admissions', items: [
    { href: '/enquiries', label: 'Enquiries', icon: '📝' },
    { href: '/students', label: 'Students', icon: '👥' },
  ]},
  { title: 'Academics', items: [
    { href: '/attendance', label: 'Attendance', icon: '✓' },
    { href: '/timetable', label: 'Time Table', icon: '🕐' },
    { href: '/homework', label: 'Homework', icon: '📚' },
    { href: '/exams', label: 'Exams', icon: '📋' },
    { href: '/marks', label: 'Marks Entry', icon: '✏️' },
  ]},
  { title: 'Finance', items: [
    { href: '/fees', label: 'Fees', icon: '₹' },
    { href: '/payroll', label: 'Payroll', icon: '💰' },
  ]},
  { title: 'HR / Staff', items: [
    { href: '/teachers', label: 'Teachers', icon: '🎓' },
    { href: '/leaves', label: 'Staff Leaves', icon: '🏖' },
  ]},
  { title: 'Front Office', items: [
    { href: '/visitors', label: 'Visitors', icon: '🚪' },
    { href: '/complaints', label: 'Complaints', icon: '⚠' },
    { href: '/postal', label: 'Postal', icon: '✉' },
    { href: '/calls', label: 'Call Log', icon: '☎' },
  ]},
  { title: 'Facilities', items: [
    { href: '/library', label: 'Library', icon: '📖' },
    { href: '/transport', label: 'Transport', icon: '🚌' },
    { href: '/hostel', label: 'Hostel', icon: '🏨' },
    { href: '/inventory', label: 'Inventory', icon: '📦' },
  ]},
  { title: 'Communication', items: [
    { href: '/announcements', label: 'Announcements', icon: '📣' },
    { href: '/communications', label: 'SMS / Email', icon: '💬' },
    { href: '/documents', label: 'Documents', icon: '📄' },
  ]},
  { title: 'Administration', items: [
    { href: '/users', label: 'Users & Roles', icon: '🔐' },
    { href: '/settings', label: 'Settings', icon: '⚙' },
  ]},
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUserState] = useState<any>(null);
  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace('/login'); return; }
    setUserState(u);
  }, [router]);

  function logout() { clearSession(); router.replace('/login'); }

  if (!user) return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>;

  return (
    <div id="wrapper" className={showNav ? 'show-nav' : ''}>
      <aside id="nav">
        <div className="bg-brand-700 text-white px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white text-brand-700 grid place-items-center font-bold">MGN</div>
          <div>
            <div className="font-bold text-sm leading-tight">MGN Jalandhar</div>
            <div className="text-[10px] opacity-80">EDUSECURE SCHOOL MGMT</div>
          </div>
        </div>
        <nav className="p-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
          {NAV.map(group => (
            <div key={group.title} className="mb-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 px-3 pt-2 pb-1">{group.title}</div>
              {group.items.map(item => {
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href} href={item.href} onClick={() => setShowNav(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded text-sm mb-0.5 ${
                      active ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-brand-50'
                    }`}
                  >
                    <span className="w-5 text-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div id="main" onClick={(e) => {
        // Close off-canvas nav on outside click (mirrors EduSecure behavior)
        if (showNav) setShowNav(false);
      }}>
        <header className="bg-brand-700 text-white shadow">
          <div className="px-4 py-3 flex items-center gap-4">
            <button className="toggle-nav" onClick={(e) => { e.stopPropagation(); setShowNav(v => !v); }}>☰</button>
            <div className="flex-1">
              <h1 className="font-bold leading-tight">MGN Public School — Jalandhar</h1>
              <p className="text-xs opacity-80">EDUSECURE School Management</p>
            </div>
            <div className="text-right text-sm hidden sm:block">
              <div className="font-semibold">{user.fullName}</div>
              <div className="opacity-80 text-xs capitalize">{user.role}</div>
            </div>
            <button onClick={logout} className="btn btn-accent ml-2 text-sm">Logout</button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6">{children}</main>

        <footer className="bg-white border-t">
          <div className="px-4 py-3 text-xs text-gray-500 flex justify-between">
            <div>© {new Date().getFullYear()} MGN Public School, Jalandhar</div>
            <div>Powered by EduSecure ERP</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
