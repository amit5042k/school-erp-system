'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { Crumb, Flash, OUTPASS_UI, useFlash, when } from '../_ui';

export type OutPass = { id: number; student_id: number; student_name: string; admission_no: string; class: string | null; hostel_name: string | null;
  reason: string; destination: string | null; escort: string | null; out_at: string; expected_return_at: string; actual_out_at: string | null;
  actual_return_at: string | null; status: string; remarks: string | null; decided_by_name: string | null; overdue: number };
type Resident = { student_id: number; full_name: string; room_no: string; hostel_name: string };

const FILTERS = [['', 'All'], ['requested', 'Requests'], ['approved', 'Approved'], ['out', 'Out now'], ['overdue', 'Overdue'], ['returned', 'Returned']] as const;
const blank = { student_id: '', reason: '', destination: '', escort: '', out_at: '', expected_return_at: '' };

export default function OutPassPage() {
  // Approving a boarder's leave needs full Hostel access (the server enforces it too).
  const warden = getUser<{ role: string }>()?.role === 'admin';
  const [status, setStatus] = useState<string>('');
  const [rows, setRows] = useState<OutPass[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState(blank);
  const { msg, flash } = useFlash();

  const load = () => api<OutPass[]>(`/hostel-ops/outpasses?status=${status}`).then(setRows).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  useEffect(() => { api<Resident[]>('/hostel-ops/residents').then(setResidents).catch(() => {}); }, []);

  async function act(o: OutPass, action: string, label: string) {
    let remarks: string | null = null;
    if (action === 'reject') { remarks = prompt('Reason for not approving (shared with the family):'); if (remarks === null) return; }
    try { await api(`/hostel-ops/outpasses/${o.id}/action`, { method: 'POST', body: JSON.stringify({ action, remarks }) }); flash(label); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function issue(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/hostel-ops/outpasses', { method: 'POST', body: JSON.stringify({ ...f, student_id: Number(f.student_id),
        out_at: f.out_at && new Date(f.out_at).toISOString(), expected_return_at: f.expected_return_at && new Date(f.expected_return_at).toISOString() }) });
      setF(blank); setShow(false); flash('Out-pass issued and family notified.'); load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <Crumb title="Out-passes" />
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">Hostel Out-passes</h2>
        <div className="flex gap-2">
          <Link href="/report/hostel-outpass-overdue" className="btn bg-gray-200 text-sm">Overdue Report</Link>
          <button className="btn btn-primary text-sm" onClick={() => setShow(s => !s)}>{show ? 'Close' : '+ Issue Out-pass'}</button>
        </div>
      </div>
      <Flash msg={msg} />
      {show && (
        <form onSubmit={issue} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div><label className="label">Student *</label>
            <select className="input" value={f.student_id} onChange={e => setF({ ...f, student_id: e.target.value })}>
              <option value="">— Select —</option>
              {residents.map(r => <option key={r.student_id} value={r.student_id}>{r.full_name} ({r.hostel_name} {r.room_no})</option>)}
            </select></div>
          <div><label className="label">Leaves *</label><input className="input" type="datetime-local" value={f.out_at} onChange={e => setF({ ...f, out_at: e.target.value })} /></div>
          <div><label className="label">Returns by *</label><input className="input" type="datetime-local" value={f.expected_return_at} onChange={e => setF({ ...f, expected_return_at: e.target.value })} /></div>
          <div><label className="label">Reason *</label><input className="input" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></div>
          <div><label className="label">Going to</label><input className="input" value={f.destination} onChange={e => setF({ ...f, destination: e.target.value })} /></div>
          <div><label className="label">Picked up by</label><input className="input" value={f.escort} onChange={e => setF({ ...f, escort: e.target.value })} /></div>
          <div className="md:col-span-3 text-right"><button className="btn btn-primary">{warden ? 'Issue (approved)' : 'Request out-pass'}</button></div>
        </form>
      )}
      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map(([k, l]) => <button key={k} className={`btn text-xs ${status === k ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setStatus(k)}>{l}</button>)}
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Student</th><th>Reason</th><th>Leaves</th><th>Returns by</th><th>Actual</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map(o => {
              const st = OUTPASS_UI[o.status] || OUTPASS_UI.requested;
              return (
                <tr key={o.id} className={o.overdue ? 'bg-red-50' : ''}>
                  <td><div className="font-medium">{o.student_name}</div><div className="text-xs text-gray-500">{o.class || ''} · {o.hostel_name || ''}</div></td>
                  <td><div>{o.reason}</div><div className="text-xs text-gray-500">{[o.destination, o.escort && `with ${o.escort}`].filter(Boolean).join(' · ')}</div></td>
                  <td className="text-xs whitespace-nowrap">{when(o.out_at)}</td>
                  <td className="text-xs whitespace-nowrap">{when(o.expected_return_at)}</td>
                  <td className="text-xs whitespace-nowrap">{o.actual_out_at ? `Out ${when(o.actual_out_at)}` : ''}{o.actual_return_at ? <><br />Back {when(o.actual_return_at)}</> : ''}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span>{o.overdue ? <span className="badge badge-red ml-1">Overdue</span> : null}
                    {o.remarks && <div className="text-xs text-gray-500 mt-1">{o.remarks}</div>}</td>
                  <td className="whitespace-nowrap text-xs space-x-2">
                    {o.status === 'requested' && warden && <>
                      <button className="text-green-700 hover:underline" onClick={() => act(o, 'approve', 'Approved.')}>Approve</button>
                      <button className="text-red-600 hover:underline" onClick={() => act(o, 'reject', 'Not approved.')}>Reject</button></>}
                    {o.status === 'approved' && <button className="text-brand-600 hover:underline" onClick={() => act(o, 'out', 'Marked as left.')}>Mark left</button>}
                    {o.status === 'out' && <button className="text-green-700 hover:underline" onClick={() => act(o, 'returned', 'Marked as returned.')}>Mark returned</button>}
                    {['requested', 'approved'].includes(o.status) && <button className="text-gray-600 hover:underline" onClick={() => act(o, 'cancel', 'Cancelled.')}>Cancel</button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="text-center py-6 text-gray-500">No out-passes here.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
