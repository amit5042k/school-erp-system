'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Person = { id: number; name: string; role: string; dob?: string; class_info?: string };

function daysUntilBirthday(dob: string) {
  if (!dob) return 9999;
  const now = new Date();
  const [, mm, dd] = dob.split('-');
  let next = new Date(now.getFullYear(), Number(mm) - 1, Number(dd));
  if (next < now) next = new Date(now.getFullYear() + 1, Number(mm) - 1, Number(dd));
  const ms = 24 * 60 * 60 * 1000;
  return Math.ceil((next.getTime() - now.getTime()) / ms);
}

export default function BirthdaysPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setStudents(await api('/students')); }
      catch (e: any) { setErr(e.message); }
    })();
  }, []);

  const people: Person[] = useMemo(() => students
    .filter(s => s.dob)
    .map(s => ({ id: s.id, name: s.full_name, role: 'Student', dob: s.dob, class_info: s.class_name })), [students]);

  const today = people.filter(p => p.dob && daysUntilBirthday(p.dob) === 0);
  const upcoming = [...people].filter(p => p.dob && daysUntilBirthday(p.dob) > 0 && daysUntilBirthday(p.dob) <= 30)
    .sort((a, b) => daysUntilBirthday(a.dob!) - daysUntilBirthday(b.dob!));

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › Birthdays</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Birthdays</h2>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}

      <div className="card p-4 mb-4">
        <h3 className="font-semibold text-brand-700 mb-2">🎂 Today</h3>
        {today.length ? (
          <ul className="divide-y text-sm">
            {today.map(p => <li key={p.id} className="py-2 flex justify-between"><span>{p.name} <span className="text-xs text-gray-500">({p.role})</span></span><span className="text-gray-500">{p.dob}</span></li>)}
          </ul>
        ) : <p className="text-sm text-gray-500">No birthdays today.</p>}
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-brand-700 mb-2">Upcoming (next 30 days)</h3>
        {upcoming.length ? (
          <table className="table"><thead><tr><th>Name</th><th>Role</th><th>Class</th><th>Date of Birth</th><th>In</th></tr></thead>
            <tbody>
              {upcoming.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td><td>{p.role}</td><td>{p.class_info || '—'}</td><td>{p.dob}</td>
                  <td>{daysUntilBirthday(p.dob!)} days</td>
                </tr>
              ))}
            </tbody></table>
        ) : <p className="text-sm text-gray-500">No upcoming birthdays.</p>}
      </div>
    </Shell>
  );
}
