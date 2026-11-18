'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, HrHeader, LEAVE_TYPES, SESSIONS, useFlash, useLeaveTypes, useMasterNames } from '../_ui';

type Rule = { id: number; department: string; staff_category: string; session: string; leave_type: string; allowed: number };

export default function DepartmentLeavesPage() {
  const [session, setSession] = useState('');
  const [rows, setRows] = useState<Rule[]>([]);
  const [form, setForm] = useState({ department: '', staff_category: '', leave_type: LEAVE_TYPES[0], allowed: '' });
  const leaveTypes = useLeaveTypes();
  useEffect(() => { setForm(f => (leaveTypes.includes(f.leave_type) ? f : { ...f, leave_type: leaveTypes[0] })); }, [leaveTypes]);
  const departments = useMasterNames('departments');
  const categories = useMasterNames('staff-categories');
  const { msg, flash } = useFlash();

  async function load(s = session) {
    try {
      const r = await api<{ session: string; rows: Rule[] }>(`/hr/department-leaves${s ? `?session=${encodeURIComponent(s)}` : ''}`);
      setSession(r.session); setRows(r.rows);
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(''); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/hr/department-leaves', { method: 'POST', body: JSON.stringify({ ...form, session }) }); flash('Rule saved.'); load(); }
    catch (ex: any) { flash(ex.message, false); }
  }
  async function remove(r: Rule) {
    try { await api(`/hr/department-leaves/${r.id}`, { method: 'DELETE' }); load(); } catch (ex: any) { flash(ex.message, false); }
  }
  async function apply() {
    if (!confirm(`Set every active staff member's ${session} leave allowance from these rules? Extra leaves granted to individuals are added on top.`)) return;
    try {
      const r = await api<{ staff: number; allowances_updated: number }>('/hr/department-leaves/apply', { method: 'POST', body: JSON.stringify({ session }) });
      flash(`Updated ${r.allowances_updated} allowance(s) for ${r.staff} staff member(s).`);
    } catch (ex: any) { flash(ex.message, false); }
  }

  const sessions = SESSIONS.includes(session) || !session ? SESSIONS : [session, ...SESSIONS];
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Shell>
      <HrHeader title="Manage Department Leaves" subtitle="Leave days allowed per session for each department (optionally per staff category)."
        links={[{ label: 'Extra leaves', href: '/hr/extra-leaves' }, { label: 'Staff leaves', href: '/leaves' }]} />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-6 gap-3 text-sm">
        <div><label className="label">Session</label>
          <select className="input" value={session} onChange={e => { setSession(e.target.value); load(e.target.value); }}>
            {sessions.map(s => <option key={s}>{s}</option>)}
          </select></div>
        <form onSubmit={save} className="md:col-span-5 grid md:grid-cols-5 gap-3">
          <div><label className="label">Department *</label>
            <select className="input" required value={form.department} onChange={set('department')}>
              <option value="">-- Select --</option>{departments.map(d => <option key={d}>{d}</option>)}
            </select></div>
          <div><label className="label">Staff Category</label>
            <select className="input" value={form.staff_category} onChange={set('staff_category')}>
              <option value="">All categories</option>{categories.map(d => <option key={d}>{d}</option>)}
            </select></div>
          <div><label className="label">Leave Type</label>
            <select className="input" value={form.leave_type} onChange={set('leave_type')}>{leaveTypes.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label">Days Allowed *</label><input className="input" type="number" step="0.5" min={0} max={365} required value={form.allowed} onChange={set('allowed')} /></div>
          <div className="flex items-end"><button className="btn btn-primary">Save Rule</button></div>
        </form>
      </div>

      <div className="card p-4 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-brand-700">Rules for {session}</h3>
          <button className="btn btn-accent text-sm" onClick={apply} disabled={!rows.length}>Apply to Staff</button>
        </div>
        <table className="table text-sm">
          <thead><tr><th>Department</th><th>Staff Category</th><th>Leave Type</th><th>Days</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}><td>{r.department}</td><td>{r.staff_category || 'All'}</td><td>{r.leave_type}</td><td>{r.allowed}</td>
                <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(r)}>Delete</button></td></tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No rules for this session yet.</td></tr>}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-3">A rule for a specific staff category overrides the department&apos;s &quot;All categories&quot; rule. Department names must match the department on each employee&apos;s profile.</p>
      </div>
    </Shell>
  );
}
