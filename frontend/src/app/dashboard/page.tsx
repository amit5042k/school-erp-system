'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser, fmtDate } from '@/lib/api';

type AdminSummary = {
  role: 'admin' | 'teacher';
  totals: {
    students: number; teachers: number; classes: number;
    present_today: number; absent_today: number;
    fees_pending: number; fees_collected: number;
  };
  announcements: { id: number; title: string; posted_at: string }[];
};

const MODULE_TILES: { label: string; href: string; icon: string; tone: string }[] = [
  { label: 'Dashboard',               href: '/dashboard',      icon: '▦',  tone: 'blue' },
  { label: 'Student',                 href: '/students',       icon: '👤', tone: 'teal' },
  { label: 'Academic Communication',  href: '/homework',       icon: '📚', tone: 'indigo' },
  { label: 'Attendance',              href: '/attendance',     icon: '✓',  tone: 'green' },
  { label: 'Finance',                 href: '/fees',           icon: '₹',  tone: 'amber' },
  { label: 'Examination',             href: '/exams',          icon: '🏆', tone: 'rose' },
  { label: 'Transport',               href: '/transport',      icon: '🚌', tone: 'sky' },
  { label: 'Settings',                href: '/settings',       icon: '⚙',  tone: 'slate' },
  { label: 'Human Resource',          href: '/teachers',       icon: '👥', tone: 'violet' },
  { label: 'Communication',           href: '/communications', icon: '💬', tone: 'cyan' },
  { label: 'Online Survey',           href: '/surveys',        icon: '🗳', tone: 'emerald' },
  { label: 'Suggestion Box',          href: '/suggestions',    icon: '💡', tone: 'yellow' },
  { label: 'Photos / Videos',         href: '/activities',     icon: '🎬', tone: 'pink' },
  { label: 'Library Management',      href: '/library',        icon: '📖', tone: 'orange' },
  { label: 'Front Office',            href: '/visitors',       icon: '🏢', tone: 'lime' },
  { label: 'School Calendar',         href: '/calendar',       icon: '📅', tone: 'fuchsia' },
  { label: 'Payroll Management',      href: '/payroll',        icon: '💰', tone: 'green' },
  { label: 'Inventory',               href: '/inventory',      icon: '📦', tone: 'brown' },
  { label: 'Announcements',           href: '/announcements',  icon: '📣', tone: 'red' },
  { label: 'Documents',               href: '/documents',      icon: '📄', tone: 'gray' },
];

const TONE_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pink: 'bg-pink-50 text-pink-700 border-pink-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  lime: 'bg-lime-50 text-lime-700 border-lime-200',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
  brown: 'bg-amber-100 text-amber-900 border-amber-300',
};

type StudentSummary = {
  role: 'student' | 'parent';
  student: any;
  attendance: { present: number; absent: number; total: number };
  fees: { term: string; amount: number; paid: number; status: string; due_date: string }[];
  announcements: { id: number; title: string; posted_at: string }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<AdminSummary | StudentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = getUser<any>();

  useEffect(() => {
    api('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Welcome, {user?.fullName}</h2>

      {error && <div className="text-red-700 bg-red-50 border border-red-200 p-3 rounded">{error}</div>}
      {!data && !error && <div className="text-gray-500">Loading…</div>}

      {data && (data.role === 'admin' || data.role === 'teacher') && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Total Students" value={data.totals.students} tone="blue" />
            <Stat label="Teachers" value={data.totals.teachers} tone="green" />
            <Stat label="Classes" value={data.totals.classes} tone="amber" />
            <Stat label="Present Today" value={data.totals.present_today} tone="teal" />
            <Stat label="Absent Today" value={data.totals.absent_today} tone="red" />
            <Stat label="Fees Collected" value={`₹${data.totals.fees_collected}`} tone="green" />
            <Stat label="Fees Pending" value={`₹${data.totals.fees_pending}`} tone="amber" />
          </div>

          {/* Module quick-launch tiles */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-brand-700 mb-3">Home</h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {MODULE_TILES.map(t => (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border hover:shadow-md transition ${TONE_STYLES[t.tone] || TONE_STYLES.blue}`}
                  >
                    <span className="text-3xl">{t.icon}</span>
                    <span className="text-xs font-semibold text-center leading-tight">{t.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-brand-700 mb-2">Latest Announcements</h3>
            <ul className="divide-y">
              {data.announcements.map(a => (
                <li key={a.id} className="py-2 text-sm">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    {fmtDate(a.posted_at)}
                  </span>
                </li>
              ))}
              {!data.announcements.length && <li className="text-sm text-gray-500 py-2">No announcements yet.</li>}
            </ul>
          </div>
        </>
      )}

      {data && (data.role === 'student' || data.role === 'parent') && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="font-semibold text-brand-700 mb-3">{data.role === 'parent' ? 'My Child' : 'My Profile'}</h3>
              {data.student ? (
                <dl className="text-sm grid grid-cols-2 gap-y-1">
                  <dt className="text-gray-500">Name</dt><dd>{data.student.full_name}</dd>
                  <dt className="text-gray-500">Admission No</dt><dd>{data.student.admission_no}</dd>
                  <dt className="text-gray-500">Class</dt><dd>{data.student.class_name} {data.student.class_section}</dd>
                  <dt className="text-gray-500">Roll No</dt><dd>{data.student.roll_no}</dd>
                  <dt className="text-gray-500">Father</dt><dd>{data.student.father_name}</dd>
                  <dt className="text-gray-500">Contact</dt><dd>{data.student.contact}</dd>
                </dl>
              ) : <p className="text-sm text-gray-500">Profile not linked.</p>}
            </div>

            <div className="card p-4">
              <h3 className="font-semibold text-brand-700 mb-3">Attendance</h3>
              <p className="text-sm">Present: <b>{data.attendance.present}</b> / {data.attendance.total}</p>
              <p className="text-sm">Absent: <b>{data.attendance.absent}</b></p>
              <p className="text-sm mt-2">
                Attendance %: <b>
                  {data.attendance.total ? Math.round((data.attendance.present / data.attendance.total) * 100) : 0}%
                </b>
              </p>
            </div>
          </div>

          <div className="card p-4 mt-4">
            <h3 className="font-semibold text-brand-700 mb-2">Fee Status</h3>
            <table className="table">
              <thead><tr><th>Term</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>
                {data.fees.map((f, i) => (
                  <tr key={i}>
                    <td>{f.term}</td>
                    <td>₹{f.amount}</td>
                    <td>₹{f.paid}</td>
                    <td><StatusBadge status={f.status} /></td>
                    <td>{f.due_date}</td>
                  </tr>
                ))}
                {!data.fees.length && <tr><td colSpan={5} className="text-sm text-gray-500 py-3">No fee records.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card p-4 mt-4">
            <h3 className="font-semibold text-brand-700 mb-2">Announcements</h3>
            <ul className="divide-y">
              {data.announcements.map(a => (
                <li key={a.id} className="py-2 text-sm">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    {fmtDate(a.posted_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  const tones: Record<string, string> = {
    blue: 'from-brand-600 to-brand-500',
    green: 'from-green-600 to-green-500',
    amber: 'from-amber-600 to-amber-500',
    teal: 'from-teal-600 to-teal-500',
    red: 'from-red-600 to-red-500',
  };
  return (
    <div className={`rounded-lg text-white shadow bg-gradient-to-br ${tones[tone] || tones.blue} p-4`}>
      <div className="text-xs uppercase opacity-90">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'badge-green', pending: 'badge-amber', partial: 'badge-amber', overdue: 'badge-red',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}
