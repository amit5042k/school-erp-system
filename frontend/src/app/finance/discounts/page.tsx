'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney } from '@/lib/api';
import { Flash, PageTitle, StudentPicker, useFlash } from '../_ui';

type Master = { id: number; name: string; discount_type?: string; value?: number };

export default function DiscountsPage({ searchParams }: { searchParams: { student_id?: string } }) {
  const [studentId, setStudentId] = useState(searchParams.student_id || '');
  const [dues, setDues] = useState<any | null>(null);
  const [assigned, setAssigned] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [cats, setCats] = useState<Master[]>([]);
  const [heads, setHeads] = useState<Master[]>([]);
  const [finCats, setFinCats] = useState<Master[]>([]);
  const [session, setSession] = useState('');
  const [form, setForm] = useState({ category: '', head: '', approved_by: '', reason: '', apply_existing: true });
  const [adj, setAdj] = useState<{ fee_id: number; type: 'waiver' | 'discount'; amount: string; percent: string; reason: string; approved_by: string } | null>(null);
  const { msg, flash } = useFlash();

  useEffect(() => {
    api<Master[]>('/masters/discount-categories').then(setCats).catch(() => {});
    api<Master[]>('/masters/fee-heads').then(setHeads).catch(() => {});
    api<Master[]>('/masters/finance-categories').then(setFinCats).catch(() => {});
    api<any>('/settings').then(s => setSession(s.academic_year || '')).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!studentId) { setDues(null); return; }
    try {
      setDues(await api(`/finance/student-dues/${studentId}`));
      setAssigned(await api(`/finance/student-discounts?student_id=${studentId}`));
      setHistory(await api(`/finance/adjustments?student_id=${studentId}`));
    } catch (e: any) { flash(e.message, false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  async function setCategory(v: string) {
    try { await api(`/finance/student-category/${studentId}`, { method: 'PUT', body: JSON.stringify({ finance_category: v }) }); flash('Finance category saved.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function assign(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<any>('/finance/student-discounts', { method: 'POST', body: JSON.stringify({ ...form, student_id: Number(studentId), session, head: form.head || null }) });
      flash(`Discount assigned${r.applied_to_existing ? ` and applied to ${r.applied_to_existing} unpaid fee(s)` : ''}. It will also apply to fees generated later.`);
      setForm({ category: '', head: '', approved_by: '', reason: '', apply_existing: true }); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function unassign(id: number) {
    if (!confirm('Stop applying this discount to fees generated from now on? Discounts already given stay.')) return;
    try { await api(`/finance/student-discounts/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { flash(e.message, false); }
  }
  async function applyAdj(e: React.FormEvent) {
    e.preventDefault();
    if (!adj) return;
    try {
      await api('/finance/adjust', { method: 'POST', body: JSON.stringify({ fee_id: adj.fee_id, type: adj.type, reason: adj.reason, approved_by: adj.approved_by,
        ...(adj.percent ? { percent: adj.percent } : { amount: adj.amount }) }) });
      flash(adj.type === 'waiver' ? 'Fee waived off.' : 'Discount applied.'); setAdj(null); load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageTitle crumb="Student Discount/Fee Waveoff" title="Student Discount / Fee Waveoff"
        sub="Assign a discount category (applies automatically to generated fees), or discount / waive off a specific due." />
      <div className="card p-4 grid md:grid-cols-4 gap-3 text-sm">
        <StudentPicker value={studentId} onChange={setStudentId} />
        <div className="flex items-end gap-2 text-xs">
          <Link className="text-brand-600 underline" href="/masters/discount-categories">Manage Discount Categories</Link>
        </div>
      </div>
      <Flash msg={msg} />

      {dues && (
        <>
          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            <div className="card p-4 text-sm">
              <h3 className="font-semibold text-brand-700 mb-2">{dues.student.full_name} ({dues.student.admission_no})</h3>
              <label className="label">Finance Category</label>
              <select className="input max-w-xs" value={dues.student.finance_category || ''} onChange={e => setCategory(e.target.value)}>
                <option value="">General (not set)</option>
                {finCats.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
              <h4 className="font-semibold mt-4 mb-1">Assigned Discounts</h4>
              <table className="table text-xs">
                <thead><tr><th>Category</th><th>Session</th><th>Head</th><th>Approved By</th><th></th></tr></thead>
                <tbody>
                  {assigned.map(a => (
                    <tr key={a.id}><td>{a.category}</td><td>{a.session}</td><td>{a.head || 'All heads'}</td><td>{a.approved_by || '—'}</td>
                      <td><button className="text-red-600 hover:underline" onClick={() => unassign(a.id)}>Remove</button></td></tr>
                  ))}
                  {!assigned.length && <tr><td colSpan={5} className="text-center text-gray-500 py-2">None.</td></tr>}
                </tbody>
              </table>
            </div>
            <form onSubmit={assign} className="card p-4 grid grid-cols-2 gap-3 text-sm">
              <h3 className="col-span-2 font-semibold text-brand-700">Assign Discount Category</h3>
              <div><label className="label">Discount Category *</label>
                <select className="input" required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">-- Select --</option>
                  {cats.map(c => <option key={c.id} value={c.name}>{c.name} ({c.discount_type === 'Flat' ? fmtMoney(c.value) : `${c.value}%`})</option>)}
                </select></div>
              <div><label className="label">Fee Head</label>
                <select className="input" value={form.head} onChange={e => setForm({ ...form, head: e.target.value })}>
                  <option value="">All heads</option>
                  {heads.map(h => <option key={h.id}>{h.name}</option>)}
                </select></div>
              <div><label className="label">Session</label><input className="input" value={session} onChange={e => setSession(e.target.value)} /></div>
              <div><label className="label">Approved By</label><input className="input" value={form.approved_by} onChange={e => setForm({ ...form, approved_by: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">Reason</label><input className="input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={form.apply_existing} onChange={e => setForm({ ...form, apply_existing: e.target.checked })} />
                Also apply to this student&apos;s unpaid fees already generated</label>
              <div className="col-span-2"><button className="btn btn-primary">Assign</button></div>
            </form>
          </div>

          <div className="card p-4 mt-4 overflow-x-auto">
            <h3 className="font-semibold text-brand-700 mb-2">Unpaid Fees</h3>
            <table className="table text-sm">
              <thead><tr><th>Fee</th><th>Due</th><th className="text-right">Gross</th><th className="text-right">Discount</th><th className="text-right">Waived</th>
                <th className="text-right">Paid</th><th className="text-right">Balance</th><th></th></tr></thead>
              <tbody>
                {dues.dues.map((d: any) => (
                  <tr key={d.id}>
                    <td>{d.head ? `${d.head} — ${d.term}` : d.term}</td><td>{d.due_date ? fmtDate(d.due_date) : '—'}</td>
                    <td className="text-right">{fmtMoney(d.gross)}</td><td className="text-right">{fmtMoney(d.discount)}</td>
                    <td className="text-right">{fmtMoney(d.waived)}</td><td className="text-right">{fmtMoney(d.paid)}</td>
                    <td className="text-right font-semibold">{fmtMoney(d.balance)}</td>
                    <td className="whitespace-nowrap text-xs">
                      <button className="text-brand-600 hover:underline mr-2" onClick={() => setAdj({ fee_id: d.id, type: 'discount', amount: '', percent: '', reason: '', approved_by: '' })}>Discount</button>
                      <button className="text-amber-700 hover:underline" onClick={() => setAdj({ fee_id: d.id, type: 'waiver', amount: String(d.balance), percent: '', reason: '', approved_by: '' })}>Waive Off</button>
                    </td>
                  </tr>
                ))}
                {!dues.dues.length && <tr><td colSpan={8} className="text-center py-3 text-gray-500">No unpaid fees.</td></tr>}
              </tbody>
            </table>
            {adj && (
              <form onSubmit={applyAdj} className="grid md:grid-cols-6 gap-3 text-sm mt-4 p-3 bg-brand-50 rounded">
                <div className="md:col-span-6 font-semibold">{adj.type === 'waiver' ? 'Waive off' : 'Discount'} — {(() => { const d = dues.dues.find((x: any) => x.id === adj.fee_id); return d ? `${d.head || d.term} (balance ${fmtMoney(d.balance)})` : ''; })()}</div>
                <div><label className="label">Amount (₹)</label><input className="input" type="number" step="0.01" min={0} value={adj.amount} disabled={!!adj.percent} onChange={e => setAdj({ ...adj, amount: e.target.value })} /></div>
                <div><label className="label">or % of gross</label><input className="input" type="number" step="0.01" min={0} max={100} value={adj.percent} onChange={e => setAdj({ ...adj, percent: e.target.value })} /></div>
                <div className="md:col-span-2"><label className="label">Reason *</label><input className="input" required value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} /></div>
                <div><label className="label">Approved By</label><input className="input" value={adj.approved_by} onChange={e => setAdj({ ...adj, approved_by: e.target.value })} /></div>
                <div className="flex items-end gap-2"><button className="btn btn-primary">Apply</button><button type="button" className="btn bg-gray-200" onClick={() => setAdj(null)}>Cancel</button></div>
              </form>
            )}
          </div>

          <div className="card p-4 mt-4 overflow-x-auto">
            <h3 className="font-semibold text-brand-700 mb-2">Discount &amp; Waive-off History</h3>
            <table className="table text-sm">
              <thead><tr><th>Date</th><th>Type</th><th>Fee</th><th>Category</th><th className="text-right">Amount</th><th>Reason</th><th>Approved By</th><th>Entered By</th></tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}><td>{fmtDate(h.created_at)}</td><td className="capitalize">{h.type}</td><td>{h.head ? `${h.head} — ${h.term}` : h.term}</td>
                    <td>{h.discount_category || '—'}</td><td className="text-right">{fmtMoney(h.amount)}</td><td>{h.reason || '—'}</td>
                    <td>{h.approved_by || '—'}</td><td>{h.created_by_name || '—'}</td></tr>
                ))}
                {!history.length && <tr><td colSpan={8} className="text-center py-3 text-gray-500">No discounts or waivers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
