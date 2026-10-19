'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, getUser } from '@/lib/api';
import { Flash, HrHeader, LEAVE_TYPES, SESSIONS, useFlash } from '../_ui';

type Extra = { id: number; teacher_id: number; teacher_name: string; employee_no: string; session: string; leave_type: string;
  days: number; reason: string; granted_by_name: string | null; created_at: string };

export default function ExtraLeavesPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [session, setSession] = useState('2025-26');
  const [rows, setRows] = useState<Extra[]>([]);
  const [teachers, setTeachers] = useState<{ id: number; employee_no: string; full_name: string }[]>([]);
  const [form, setForm] = useState({ teacher_id: '', leave_type: LEAVE_TYPES[0], days: '', reason: '' });
  const { msg, flash } = useFlash();

  const load = (s = session) => api<Extra[]>(`/hr/extra-leaves?session=${encodeURIComponent(s)}`).then(setRows).catch(e => flash(e.message, false));
  useEffect(() => {
    api<any>('/settings').then(s => { if (s?.academic_year) { setSession(s.academic_year); load(s.academic_year); } else load(); }).catch(() => load());
    if (isAdmin) api<any[]>('/teachers').then(setTeachers).catch(() => {});
    /* eslint-disable-next-line */
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/hr/extra-leaves', { method: 'POST', body: JSON.stringify({ ...form, session }) });
      setForm({ ...form, days: '', reason: '' }); flash('Extra leave granted and added to the allowance.'); load();
    } catch (ex: any) { flash(ex.message, false); }
  }
  async function remove(x: Extra) {
    if (!confirm(`Withdraw ${x.days} extra day(s) of ${x.leave_type} from ${x.teacher_name}?`)) return;
    try { await api(`/hr/extra-leaves/${x.id}`, { method: 'DELETE' }); load(); } catch (ex: any) { flash(ex.message, false); }
  }

  const sessions = SESSIONS.includes(session) ? SESSIONS : [session, ...SESSIONS];
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Shell>
      <HrHeader title="Manage Extra Leaves" subtitle="Grant additional leave days to individual staff (e.g. election duty, compensatory days)." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-6 gap-3 text-sm">
        <div><label className="label">Session</label>
          <select className="input" value={session} onChange={e => { setSession(e.target.value); load(e.target.value); }}>
            {sessions.map(s => <option key={s}>{s}</option>)}
          </select></div>
        {isAdmin && (
          <form onSubmit={save} className="md:col-span-5 grid md:grid-cols-5 gap-3">
            <div><label className="label">Staff *</label>
              <select className="input" required value={form.teacher_id} onChange={set('teacher_id')}>
                <option value="">-- Select --</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
              </select></div>
            <div><label className="label">Leave Type</label>
              <select className="input" value={form.leave_type} onChange={set('leave_type')}>{LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label className="label">Days *</label><input className="input" type="number" step="0.5" min={0.5} max={60} required value={form.days} onChange={set('days')} /></div>
            <div><label className="label">Reason *</label><input className="input" required value={form.reason} onChange={set('reason')} /></div>
            <div className="flex items-end"><button className="btn btn-primary">Grant</button></div>
          </form>
        )}
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Staff</th><th>Leave Type</th><th>Days</th><th>Reason</th><th>Granted By</th><th>On</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {rows.map(x => (
              <tr key={x.id}>
                <td>{x.employee_no} — {x.teacher_name}</td><td>{x.leave_type}</td><td>{x.days}</td><td>{x.reason}</td>
                <td>{x.granted_by_name || '—'}</td><td>{fmtDate(x.created_at)}</td>
                {isAdmin && <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(x)}>Withdraw</button></td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No extra leaves in {session}.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
