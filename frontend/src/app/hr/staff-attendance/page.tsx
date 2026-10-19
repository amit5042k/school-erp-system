'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser, localDate } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Row = {
  teacher_id: number; employee_no: string; full_name: string; department: string | null; designation: string | null;
  status: string | null; in_time: string | null; out_time: string | null; remarks: string | null; source: string | null; on_leave: string | null;
};
type Resp = { date: string; weekday: string; rules: { office_start: string; office_end: string; weekly_off: string }; rows: Row[] };

const STATUSES = [
  { value: 'present', label: 'Present', cls: 'bg-green-600' }, { value: 'late', label: 'Late', cls: 'bg-amber-500' },
  { value: 'half_day', label: 'Half Day', cls: 'bg-sky-600' }, { value: 'leave', label: 'Leave', cls: 'bg-violet-600' },
  { value: 'absent', label: 'Absent', cls: 'bg-red-600' },
];

export default function StaffAttendancePage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [date, setDate] = useState(localDate());
  const [data, setData] = useState<Resp | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  async function load() {
    try {
      const r = await api<Resp>(`/hr/staff-attendance?date=${date}`);
      setData(r);
      // Pre-fill approved leave so the clerk doesn't mark people on leave as absent.
      setRows(r.rows.map(x => (!x.status && x.on_leave ? { ...x, status: 'leave', remarks: x.on_leave } : x)));
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  const set = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.teacher_id === id ? { ...r, ...p } : r)));
  function markAll(status: string) {
    setRows(rs => rs.map(r => (r.on_leave ? r : { ...r, status, in_time: status === 'present' ? r.in_time || data?.rules.office_start || null : r.in_time })));
  }

  async function save() {
    const records = rows.filter(r => r.status).map(r => ({
      teacher_id: r.teacher_id, status: r.status, in_time: r.in_time || null, out_time: r.out_time || null, remarks: r.remarks || null,
    }));
    if (!records.length) return flash('Mark at least one staff member.', false);
    setBusy(true);
    try {
      const r = await api<{ count: number }>('/hr/staff-attendance', { method: 'POST', body: JSON.stringify({ date, records }) });
      const unmarked = rows.length - records.length;
      flash(`Saved attendance for ${r.count} staff.${unmarked ? ` ${unmarked} not marked.` : ''}`);
      load();
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  const counts = STATUSES.map(s => ({ ...s, n: rows.filter(r => r.status === s.value).length }));
  const isOff = data && data.rules.weekly_off === data.weekday;

  return (
    <Shell>
      <HrHeader title="Add Staff Attendance" subtitle={isAdmin ? 'Mark daily attendance for all staff.' : 'Your attendance for the selected day.'}
        links={[{ label: 'Monthly report', href: '/report/staff-attendance' }, ...(isAdmin ? [{ label: 'Import biometric punches', href: '/hr/biometric-import' }] : [])]} />
      <Flash msg={msg} />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div><label className="label">Date</label><input className="input" type="date" max={localDate()} value={date} onChange={e => setDate(e.target.value)} /></div>
        {data && <div className="pb-2 text-gray-600">{data.weekday}{isOff && <span className="ml-2 badge badge-amber">Weekly off</span>} · Office {data.rules.office_start}–{data.rules.office_end}</div>}
        {isAdmin && (
          <div className="flex flex-wrap gap-2 ml-auto">
            <button className="btn bg-green-600 text-white text-xs" onClick={() => markAll('present')}>Mark all present</button>
            <button className="btn bg-gray-200 text-xs" onClick={() => markAll('absent')}>Mark all absent</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {counts.map(c => <span key={c.value} className="badge badge-gray">{c.label}: <b className="ml-1">{c.n}</b></span>)}
        <span className="badge badge-gray">Not marked: <b className="ml-1">{rows.filter(r => !r.status).length}</b></span>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Emp No</th><th>Name</th><th>Department</th><th>Status</th><th>In</th><th>Out</th><th>Remarks</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const away = r.status === 'absent' || r.status === 'leave';
              return (
                <tr key={r.teacher_id}>
                  <td>{r.employee_no}</td>
                  <td className="whitespace-nowrap">{r.full_name}{r.on_leave && <span className="ml-2 badge badge-amber" title="Approved leave">{r.on_leave}</span>}</td>
                  <td>{r.department || '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map(s => (
                        <button key={s.value} type="button" disabled={!isAdmin}
                          onClick={() => set(r.teacher_id, { status: s.value })}
                          className={`px-2 py-1 rounded text-xs border ${r.status === s.value ? `${s.cls} text-white border-transparent` : 'bg-white text-gray-600 hover:bg-gray-50'} disabled:cursor-default`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td><input className="input w-28" type="time" disabled={!isAdmin || away} value={away ? '' : r.in_time || ''} onChange={e => set(r.teacher_id, { in_time: e.target.value })} /></td>
                  <td><input className="input w-28" type="time" disabled={!isAdmin || away} value={away ? '' : r.out_time || ''} onChange={e => set(r.teacher_id, { out_time: e.target.value })} /></td>
                  <td><input className="input min-w-[10rem]" disabled={!isAdmin} value={r.remarks || ''} onChange={e => set(r.teacher_id, { remarks: e.target.value })} /></td>
                  <td className="text-xs text-gray-500">{r.source || '—'}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="text-center py-4 text-gray-500">No active staff.</td></tr>}
          </tbody>
        </table>
      </div>
      {isAdmin && <div className="mt-4"><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Attendance'}</button></div>}
    </Shell>
  );
}
