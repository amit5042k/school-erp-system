'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string };
type TTRow = { id: number; day: string; period: number; subject: string; teacher_name: string; start_time: string; end_time: string };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TimetablePage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [rows, setRows] = useState<TTRow[]>([]);

  useEffect(() => {
    api<ClassRow[]>('/classes').then(c => { setClasses(c); if (c[0]) setClassId(String(c[0].id)); });
  }, []);

  useEffect(() => {
    if (!classId) return;
    api<TTRow[]>(`/timetable/class/${classId}`).then(setRows).catch(() => {});
  }, [classId]);

  const periods = Array.from(new Set(rows.map(r => r.period))).sort((a, b) => a - b);

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Time Table</h2>

      <div className="card p-4 mb-4 max-w-sm">
        <label className="label">Select Class</label>
        <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
        </select>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="table min-w-[720px]">
          <thead><tr>
            <th>Day</th>
            {periods.map(p => <th key={p}>Period {p}</th>)}
          </tr></thead>
          <tbody>
            {DAYS.map(d => (
              <tr key={d}>
                <td className="font-medium bg-brand-50">{d}</td>
                {periods.map(p => {
                  const cell = rows.find(r => r.day === d && r.period === p);
                  return (
                    <td key={p}>
                      {cell ? (
                        <>
                          <div className="font-medium">{cell.subject}</div>
                          <div className="text-xs text-gray-500">{cell.teacher_name}</div>
                          {cell.start_time && <div className="text-xs text-gray-400">{cell.start_time}–{cell.end_time}</div>}
                        </>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={periods.length + 1} className="text-center py-4 text-gray-500">No time table configured.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
