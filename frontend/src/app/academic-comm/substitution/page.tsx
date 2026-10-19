'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, localDate } from '@/lib/api';
import { Breadcrumb, useLookups, useRole } from '../_lib/lookups';

type Slot = {
  timetable_id: number; day: string; period: number; subject: string; start_time: string | null; end_time: string | null;
  class_name: string; class_section: string; substitution_id: number | null; substitute_teacher_id: number | null;
  substitute_name: string | null; remarks: string | null; free_teachers: { id: number; full_name: string; employee_no: string }[];
};
type Sub = {
  id: number; date: string; day: string; period: number; subject: string; start_time: string | null; class_name: string;
  class_section: string; absent_name: string | null; substitute_name: string | null; remarks: string | null;
  absent_teacher_id: number | null; substitute_teacher_id: number;
};

export default function SubstitutionPage() {
  const { isAdmin } = useRole();
  const { opts } = useLookups(isAdmin ? ['teachers'] : []);
  const [date, setDate] = useState(localDate());
  const [teacherId, setTeacherId] = useState('');
  const [slots, setSlots] = useState<{ day: string; on_leave: boolean; slots: Slot[] } | null>(null);
  const [pick, setPick] = useState<Record<number, { sub: string; remarks: string }>>({});
  const [subs, setSubs] = useState<Sub[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3500); };

  async function loadSubs() {
    try { setSubs(await api<Sub[]>(`/comm/substitutions?${isAdmin ? `date=${date}` : ''}`)); } catch (e: any) { flash(e.message, false); }
  }
  async function loadSlots() {
    if (!teacherId) return setSlots(null);
    try {
      const r = await api<{ day: string; on_leave: boolean; slots: Slot[] }>(`/comm/substitution/slots?date=${date}&teacher_id=${teacherId}`);
      setSlots(r);
      setPick(Object.fromEntries(r.slots.map(s => [s.timetable_id, { sub: s.substitute_teacher_id ? String(s.substitute_teacher_id) : '', remarks: s.remarks || '' }])));
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { loadSubs(); /* eslint-disable-next-line */ }, [date]);
  useEffect(() => { loadSlots(); /* eslint-disable-next-line */ }, [date, teacherId]);

  async function assign(s: Slot) {
    const p = pick[s.timetable_id];
    if (!p?.sub) return flash('Choose a substitute teacher for that period.', false);
    try {
      await api('/comm/substitutions', { method: 'POST', body: JSON.stringify({ date, timetable_id: s.timetable_id, substitute_teacher_id: Number(p.sub), remarks: p.remarks }) });
      flash(`Period ${s.period} assigned.`); loadSlots(); loadSubs();
    } catch (e: any) { flash(e.message, false); }
  }
  async function remove(id: number) {
    if (!confirm('Remove this substitution?')) return;
    try { await api(`/comm/substitutions/${id}`, { method: 'DELETE' }); loadSlots(); loadSubs(); } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <Breadcrumb trail={['Academic Communication', 'Teacher Substitution']} />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">{isAdmin ? 'Teacher Substitution' : 'My Substitutions'}</h2>
        <Link href="/report/teacher-substitutions" className="btn bg-gray-200 text-sm">Substitution Report</Link>
      </div>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {isAdmin && (
        <>
          <div className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
            <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="label">Absent Teacher</label>
              <select className="input" value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                <option value="">-- Select --</option>{opts.teachers.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></div>
            <div className="flex items-end text-xs text-gray-500">
              Substitutes listed for each period are free then: not teaching, not already substituting, and not on approved leave.
            </div>
          </div>

          {slots && (
            <div className="card p-4 mb-6 overflow-x-auto">
              <h3 className="font-semibold text-brand-700 mb-2">
                {slots.day} periods {slots.on_leave && <span className="badge badge-amber ml-2">On approved leave</span>}
              </h3>
              <table className="table text-sm">
                <thead><tr><th>Period</th><th>Time</th><th>Class</th><th>Subject</th><th>Substitute</th><th>Remarks</th><th></th></tr></thead>
                <tbody>
                  {slots.slots.map(s => (
                    <tr key={s.timetable_id}>
                      <td>{s.period}</td><td>{s.start_time ? `${s.start_time}–${s.end_time}` : '—'}</td>
                      <td>{s.class_name} {s.class_section}</td><td>{s.subject}</td>
                      <td>
                        <select className="input" value={pick[s.timetable_id]?.sub || ''}
                          onChange={e => setPick(p => ({ ...p, [s.timetable_id]: { ...p[s.timetable_id], sub: e.target.value } }))}>
                          <option value="">{s.free_teachers.length ? '-- Choose --' : 'No one free'}</option>
                          {s.free_teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                      </td>
                      <td><input className="input" value={pick[s.timetable_id]?.remarks || ''}
                        onChange={e => setPick(p => ({ ...p, [s.timetable_id]: { ...p[s.timetable_id], remarks: e.target.value } }))} /></td>
                      <td className="whitespace-nowrap">
                        <button className="btn btn-primary text-xs py-1 mr-1" onClick={() => assign(s)}>{s.substitution_id ? 'Update' : 'Assign'}</button>
                        {s.substitution_id && <button className="text-xs text-red-600 hover:underline" onClick={() => remove(s.substitution_id!)}>Remove</button>}
                      </td>
                    </tr>
                  ))}
                  {!slots.slots.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">This teacher has no periods on {slots.day} in the time table.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card p-4 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-2">{isAdmin ? `Substitutions on ${fmtDate(date)}` : 'Periods I am covering / being covered'}</h3>
        <table className="table text-sm">
          <thead><tr><th>Date</th><th>Period</th><th>Class</th><th>Subject</th><th>Absent</th><th>Substitute</th><th>Remarks</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {subs.map(s => (
              <tr key={s.id}>
                <td>{fmtDate(s.date)}</td><td>{s.period}{s.start_time ? ` (${s.start_time})` : ''}</td><td>{s.class_name} {s.class_section}</td>
                <td>{s.subject}</td><td>{s.absent_name || '—'}</td><td className="font-medium">{s.substitute_name}</td><td>{s.remarks || '—'}</td>
                {isAdmin && <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(s.id)}>Remove</button></td>}
              </tr>
            ))}
            {!subs.length && <tr><td colSpan={8} className="text-center py-4 text-gray-500">No substitutions.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
