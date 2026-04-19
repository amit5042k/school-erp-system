'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type AdminSummary = {
  role: 'admin' | 'teacher';
  totals: {
    students: number; teachers: number; classes: number;
    present_today: number; absent_today: number;
    fees_pending: number; fees_collected: number;
  };
  announcements: { id: number; title: string; posted_at: string }[];
};

type StudentSummary = {
  role: 'student';
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

          <div className="card p-4">
            <h3 className="font-semibold text-brand-700 mb-2">Latest Announcements</h3>
            <ul className="divide-y">
              {data.announcements.map(a => (
                <li key={a.id} className="py-2 text-sm">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    {new Date(a.posted_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
              {!data.announcements.length && <li className="text-sm text-gray-500 py-2">No announcements yet.</li>}
            </ul>
          </div>
        </>
      )}

      {data && data.role === 'student' && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="font-semibold text-brand-700 mb-3">My Profile</h3>
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
                    {new Date(a.posted_at).toLocaleDateString()}
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
