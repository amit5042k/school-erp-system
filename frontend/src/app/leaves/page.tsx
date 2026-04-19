'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function LeavesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setRows(await api('/leaves')); setTeachers(await api('/teachers')); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/leaves', { method: 'POST', body: JSON.stringify({
        teacher_id: Number(f.teacher_id.value), leave_type: f.leave_type.value,
        from_date: f.from_date.value, to_date: f.to_date.value, reason: f.reason.value,
      }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function setStatus(id: number, status: string) {
    try { await api(`/leaves/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); load(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Staff Leaves</h2>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}

      <form onSubmit={apply} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
        <div><label className="label">Staff</label>
          <select className="input" name="teacher_id" required>
            <option value="">-- Select --</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
          </select></div>
        <div><label className="label">Leave Type</label>
          <select className="input" name="leave_type">
            <option>Casual</option><option>Sick</option><option>Earned</option><option>Maternity</option><option>Other</option>
          </select></div>
        <div />
        <div><label className="label">From *</label><input className="input" type="date" name="from_date" required /></div>
        <div><label className="label">To *</label><input className="input" type="date" name="to_date" required /></div>
        <div className="flex items-end"><button className="btn btn-primary">Apply</button></div>
        <div className="md:col-span-3"><label className="label">Reason</label><textarea className="input" name="reason" rows={2} /></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="table"><thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.employee_no} — {r.teacher_name}</td><td>{r.leave_type}</td>
                <td>{r.from_date}</td><td>{r.to_date}</td><td>{r.reason}</td>
                <td><span className={`badge ${r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}`}>{r.status}</span></td>
                <td>
                  {r.status === 'pending' && <>
                    <button onClick={() => setStatus(r.id, 'approved')} className="text-xs text-green-600 hover:underline mr-2">Approve</button>
                    <button onClick={() => setStatus(r.id, 'rejected')} className="text-xs text-red-600 hover:underline">Reject</button>
                  </>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center py-3 text-gray-500">No leave applications.</td></tr>}
          </tbody></table>
      </div>
    </Shell>
  );
}
