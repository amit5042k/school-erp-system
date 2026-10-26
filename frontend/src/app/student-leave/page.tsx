'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, fmtDate, fmtDateTime, getUser, localDate } from '@/lib/api';

type Req = {
  id: number; student_id: number; student_name: string; admission_no: string; class_name?: string; class_section?: string;
  from_date: string; to_date: string; reason: string; attachment: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  applied_by_name?: string; decided_by_name?: string; decided_at?: string; remark?: string | null; days_marked?: number | null; created_at: string;
};
const BADGE: Record<Req['status'], string> = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray' };

export default function StudentLeavePage() {
  const user = getUser<any>();
  const family = user?.role === 'student' || user?.role === 'parent';
  const [rows, setRows] = useState<Req[]>([]);
  const [status, setStatus] = useState(family ? '' : 'pending');
  const [form, setForm] = useState({ from_date: localDate(), to_date: localDate(), reason: '', attachment: '' });
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); if (ok) setTimeout(() => setMsg(null), 4000); };

  async function load() {
    try { setRows(await api<Req[]>(`/student-leave${status ? `?status=${status}` : ''}`)); }
    catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/student-leave', { method: 'POST', body: JSON.stringify({ ...form, attachment: form.attachment || undefined }) });
      setForm({ from_date: localDate(), to_date: localDate(), reason: '', attachment: '' });
      flash('Leave request sent to the class teacher.');
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function cancel(r: Req) {
    if (!confirm('Withdraw this leave request?')) return;
    try { await api(`/student-leave/${r.id}/cancel`, { method: 'POST' }); load(); } catch (e: any) { flash(e.message, false); }
  }
  async function decide(r: Req, action: 'approve' | 'reject') {
    try {
      const x = await api<{ days_marked: number }>(`/student-leave/${r.id}/decision`, { method: 'POST', body: JSON.stringify({ action, remark: remarks[r.id] || '' }) });
      flash(action === 'approve' ? `Approved. ${x.days_marked} day(s) marked as leave in attendance.` : 'Request rejected.');
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Attendance › Student Leave</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">{family ? 'Apply for Leave' : 'Student Leave Requests'}</h2>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {family && (
        <form onSubmit={apply} className="card p-4 mb-5 grid md:grid-cols-4 gap-3 text-sm">
          <div><label className="label">From *</label><input className="input" type="date" required value={form.from_date} onChange={e => setForm({ ...form, from_date: e.target.value })} /></div>
          <div><label className="label">To *</label><input className="input" type="date" required min={form.from_date} value={form.to_date} onChange={e => setForm({ ...form, to_date: e.target.value })} /></div>
          <div className="md:col-span-2">
            <FileUpload label="Medical certificate / note (optional)" accept=".pdf,.jpg,.jpeg,.png" onUploaded={f => setForm(x => ({ ...x, attachment: f[0]?.url || '' }))} />
            {form.attachment && <div className="text-xs mt-1"><FileLinks value={form.attachment} /> attached</div>}
          </div>
          <div className="md:col-span-4"><label className="label">Reason *</label>
            <textarea className="input" rows={2} required maxLength={1000} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Fever, family function" /></div>
          <div className="md:col-span-4"><button className="btn btn-primary">Send Request</button></div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <span className="text-gray-600">Show:</span>
        {['', 'pending', 'approved', 'rejected', 'cancelled'].map(s => (
          <button key={s || 'all'} onClick={() => setStatus(s)} className={`px-3 py-1 rounded border ${status === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white hover:bg-gray-50'}`}>{s || 'All'}</button>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="card p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-semibold text-brand-700">{r.student_name} <span className="text-xs text-gray-500">({r.admission_no}) · {r.class_name} {r.class_section}</span></div>
                <div>{fmtDate(r.from_date)}{r.to_date !== r.from_date ? ` to ${fmtDate(r.to_date)}` : ''}</div>
              </div>
              <span className={`badge ${BADGE[r.status]} self-start capitalize`}>{r.status}</span>
            </div>
            <div className="mt-2 text-gray-700">{r.reason}</div>
            {r.attachment && <div className="mt-1 text-xs">Attachment: <FileLinks value={r.attachment} /></div>}
            <div className="mt-1 text-[11px] text-gray-500">Applied {fmtDateTime(r.created_at)}{r.applied_by_name ? ` by ${r.applied_by_name}` : ''}</div>
            {r.status !== 'pending' && r.status !== 'cancelled' && (
              <div className="mt-2 text-xs text-gray-600">
                {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.decided_by_name || 'school'}{r.decided_at ? ` on ${fmtDate(r.decided_at)}` : ''}
                {r.remark ? `: ${r.remark}` : ''}{r.status === 'approved' && r.days_marked != null ? ` · ${r.days_marked} day(s) marked leave` : ''}
              </div>
            )}
            {r.status === 'pending' && family && (
              <button className="mt-2 text-xs text-red-600 hover:underline" onClick={() => cancel(r)}>Withdraw request</button>
            )}
            {r.status === 'pending' && !family && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <input className="input max-w-sm" placeholder="Remark (needed to reject)" value={remarks[r.id] || ''} onChange={e => setRemarks(x => ({ ...x, [r.id]: e.target.value }))} />
                <button className="btn bg-green-600 text-white hover:bg-green-700 text-xs" onClick={() => decide(r, 'approve')}>Approve</button>
                <button className="btn bg-red-600 text-white hover:bg-red-700 text-xs" onClick={() => decide(r, 'reject')}>Reject</button>
              </div>
            )}
          </div>
        ))}
        {!rows.length && <div className="card p-6 text-center text-gray-500 text-sm">{family ? 'No leave requests yet.' : 'No requests to show. Class teachers see requests for their own class.'}</div>}
      </div>
    </Shell>
  );
}
