'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getUser } from '@/lib/api';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/students', label: 'Students', icon: '👥' },
  { href: '/teachers', label: 'Teachers', icon: '🎓' },
  { href: '/attendance', label: 'Attendance', icon: '✓' },
  { href: '/fees', label: 'Fees', icon: '₹' },
  { href: '/timetable', label: 'Time Table', icon: '🕐' },
  { href: '/announcements', label: 'Announcements', icon: '📣' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUserState] = useState<any>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUserState(u);
  }, [router]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!user) {
    return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-700 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white text-brand-700 grid place-items-center font-bold">MGN</div>
          <div className="flex-1">
            <h1 className="font-bold leading-tight">MGN Public School — Urban Estate</h1>
            <p className="text-xs opacity-80">School ERP Portal</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{user.fullName}</div>
            <div className="opacity-80 text-xs capitalize">{user.role}</div>
          </div>
          <button onClick={logout} className="btn btn-accent ml-2 text-sm">Logout</button>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 flex gap-6">
        <aside className="w-60 hidden md:block">
          <nav className="card p-2">
            {nav.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-sm mb-1 ${
                    active ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-brand-50'
                  }`}
                >
                  <span className="w-6 text-center">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <footer className="bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 py-3 text-xs text-gray-500 flex justify-between">
          <div>© {new Date().getFullYear()} MGN Public School, Urban Estate</div>
          <div>Powered by EduSecure ERP</div>
        </div>
      </footer>
    </div>
  );
}
