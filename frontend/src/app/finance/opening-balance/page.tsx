'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtMoney, localDate } from '@/lib/api';
import { Flash, PageTitle, SESSION_HINT, useClassesAndStudents, useFlash } from '../_ui';

type Row = { student_id: number; admission_no: string; full_name: string; roll_no: number | null; fee_id: number | null; amount: number | null; paid: number | null };

export default function OpeningBalancePage() {
  const { classes } = useClassesAndStudents();
  const [classId, setClassId] = useState('');
  const [session, setSession] = useState('');
  const [dueDate, setDueDate] = useState(localDate());
  const [rows, setRows] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Record<number, string>>({});
  const { msg, flash } = useFlash();

  useEffect(() => { api<any>('/settings').then(s => setSession(s.academic_year || '')).catch(() => {}); }, []);

  async function load() {
    if (!classId) return;
    try {
      const r = await api<Row[]>(`/finance/opening-balance?class_id=${classId}&session=${encodeURIComponent(session)}`);
      setRows(r); setEdit(Object.fromEntries(r.map(x => [x.student_id, x.amount != null ? String(x.amount) : ''])));
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classId, session]);

  async function save() {
    const entries = rows.filter(r => (edit[r.student_id] || '') !== (r.amount != null ? String(r.amount) : ''))
      .map(r => ({ student_id: r.student_id, amount: edit[r.student_id] }));
    if (!entries.length) return flash('No changes to save.');
    try {
      const r = await api<any>('/finance/opening-balance', { method: 'POST', body: JSON.stringify({ session, due_date: dueDate, entries }) });
      flash(`Saved ${r.saved}, removed ${r.removed}.`); load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageTitle crumb="Update Opening Balance" title="Update Opening Balance"
        sub="Dues carried forward from before this session (e.g. last year's unpaid fees). They appear as a fee due and in the ledger." />
      <div className="card p-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><label className="label">Class</label>
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">-- Select --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
        <div><label className="label">Session</label><input className="input" value={session} title={SESSION_HINT} onChange={e => setSession(e.target.value)} /></div>
        <div><label className="label">Due Date (new entries)</label><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        <div className="flex items-end"><button className="btn btn-primary" onClick={save} disabled={!rows.length}>Save Opening Balances</button></div>
      </div>
      <Flash msg={msg} />
      {classId && (
        <div className="card p-4 mt-4 overflow-x-auto">
          <table className="table text-sm">
            <thead><tr><th>Roll</th><th>Adm No</th><th>Student</th><th>Opening Balance (₹)</th><th className="text-right">Paid Against It</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.student_id}>
                  <td>{r.roll_no ?? '—'}</td><td>{r.admission_no}</td><td>{r.full_name}</td>
                  <td><input className="input w-36" type="number" min={r.paid || 0} step="0.01" value={edit[r.student_id] ?? ''}
                    onChange={e => setEdit(x => ({ ...x, [r.student_id]: e.target.value }))} placeholder="0" /></td>
                  <td className="text-right">{r.paid ? fmtMoney(r.paid) : '—'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No active students in this class.</td></tr>}
            </tbody>
          </table>
          <div className="text-xs text-gray-500 mt-2">Clear an amount (or set 0) to remove an opening balance that has nothing paid against it.</div>
        </div>
      )}
    </Shell>
  );
}
