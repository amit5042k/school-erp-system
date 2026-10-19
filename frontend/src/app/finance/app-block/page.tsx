'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney } from '@/lib/api';
import { Flash, PageTitle, useClassesAndStudents, useFlash } from '../_ui';

export default function AppBlockPage() {
  const { classes } = useClassesAndStudents();
  const [classId, setClassId] = useState('');
  const [minBalance, setMinBalance] = useState('1');
  const [reason, setReason] = useState('Fee pending');
  const [rows, setRows] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const { msg, flash } = useFlash();

  async function load() {
    try {
      const qs = new URLSearchParams({ ...(classId ? { class_id: classId } : {}), min_balance: minBalance || '0' }).toString();
      setRows(await api<any[]>(`/finance/app-blocks?${qs}`)); setPicked(new Set());
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classId]);

  const toggle = (id: number) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const unblocked = rows.filter(r => !r.blocked_reason);

  async function block() {
    if (!picked.size) return flash('Select at least one student.', false);
    if (!confirm(`Block app/ERP sign-in for ${picked.size} student(s) and their parents?`)) return;
    try {
      const r = await api<any>('/finance/app-blocks', { method: 'POST', body: JSON.stringify({ student_ids: [...picked], reason }) });
      flash(`Blocked ${r.students} student(s); ${r.logins_blocked} login(s) affected.`); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function unblock(id: number) {
    try { const r = await api<any>(`/finance/app-blocks/${id}`, { method: 'DELETE' }); flash(`Unblocked (${r.logins_unblocked} login(s)).`); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageTitle crumb="Block/Unblock Student App" title="Block/Unblock Student App"
        sub="Blocked students and their parents cannot sign in to the ERP until unblocked. They see the reason when they try." />
      <form className="card p-4 grid md:grid-cols-5 gap-3 text-sm" onSubmit={e => { e.preventDefault(); load(); }}>
        <div><label className="label">Class</label>
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
        <div><label className="label">Overdue Balance At Least (₹)</label><input className="input" type="number" min={0} value={minBalance} onChange={e => setMinBalance(e.target.value)} /></div>
        <div className="md:col-span-2"><label className="label">Block Reason (shown to the student)</label><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></div>
        <div className="flex items-end gap-2"><button className="btn bg-gray-200">Search</button>
          <Link className="btn bg-gray-200" href="/report/fee-app-blocks">Report</Link></div>
      </form>
      <Flash msg={msg} />
      <div className="card p-4 mt-4 overflow-x-auto">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">{picked.size} selected</span>
          <button className="btn bg-red-600 text-white hover:bg-red-700 text-sm" onClick={block}>Block Selected</button>
        </div>
        <table className="table text-sm">
          <thead><tr>
            <th><input type="checkbox" checked={!!unblocked.length && unblocked.every(r => picked.has(r.student_id))}
              onChange={e => setPicked(e.target.checked ? new Set(unblocked.map(r => r.student_id)) : new Set())} /></th>
            <th>Adm No</th><th>Student</th><th>Class</th><th className="text-right">Overdue Balance</th><th>Logins</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.student_id}>
                <td><input type="checkbox" disabled={!!r.blocked_reason} checked={picked.has(r.student_id)} onChange={() => toggle(r.student_id)} /></td>
                <td>{r.admission_no}</td><td>{r.full_name}</td><td>{r.class}</td>
                <td className="text-right">{fmtMoney(r.overdue_balance)}</td>
                <td>{r.logins || <span className="text-gray-400">none</span>}</td>
                <td>{r.blocked_reason ? <span className="badge badge-red">Blocked {fmtDate(r.blocked_at)}: {r.blocked_reason}</span> : <span className="badge badge-green">Active</span>}</td>
                <td>{r.blocked_reason && <button className="text-xs text-brand-600 hover:underline" onClick={() => unblock(r.student_id)}>Unblock</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center py-4 text-gray-500">No students with overdue fees for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
