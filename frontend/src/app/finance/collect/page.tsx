'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney, localDate } from '@/lib/api';
import { Flash, PageTitle, StudentPicker, useFlash } from '../_ui';

type Due = { id: number; term: string; head: string | null; installment_name: string | null; due_date: string | null; gross: number;
  discount: number; waived: number; amount: number; paid: number; balance: number; fine: number; overdue: boolean };
type DuesResponse = { student: any; dues: Due[]; total_due: number; total_fine: number; block: any; date: string };
type Line = { pick: boolean; amount: string; fine: string };

export default function CollectPage({ searchParams }: { searchParams: { student_id?: string } }) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(searchParams.student_id || '');
  const [date, setDate] = useState(localDate());
  const [data, setData] = useState<DuesResponse | null>(null);
  const [lines, setLines] = useState<Record<number, Line>>({});
  const [mode, setMode] = useState('cash');
  const [cheque, setCheque] = useState({ cheque_no: '', cheque_bank: '', cheque_date: '' });
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const { msg, flash } = useFlash();

  const load = useCallback(async () => {
    if (!studentId) { setData(null); return; }
    try {
      const d = await api<DuesResponse>(`/finance/student-dues/${studentId}?date=${date}`);
      setData(d);
      setLines(Object.fromEntries(d.dues.map(x => [x.id, { pick: x.overdue, amount: String(x.balance), fine: String(x.fine) }])));
      setReceipts(await api<any[]>(`/finance/receipts?student_id=${studentId}`));
    } catch (e: any) { flash(e.message, false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, date]);
  useEffect(() => { load(); }, [load]);

  const set = (id: number, patch: Partial<Line>) => setLines(l => ({ ...l, [id]: { ...l[id], ...patch } }));
  const picked = (data?.dues || []).filter(d => lines[d.id]?.pick);
  const total = picked.reduce((a, d) => a + (Number(lines[d.id].amount) || 0), 0);
  const fine = picked.reduce((a, d) => a + (Number(lines[d.id].fine) || 0), 0);

  async function submit() {
    if (!picked.length) return flash('Tick at least one fee to collect.', false);
    if (mode === 'cheque' && (!cheque.cheque_no || !cheque.cheque_bank)) return flash('Enter cheque number and bank.', false);
    setBusy(true);
    try {
      const r = await api<{ receipt_no: string }>('/finance/collect', { method: 'POST', body: JSON.stringify({
        student_id: Number(studentId), mode, remarks, paid_date: date, ...(mode === 'cheque' ? cheque : {}),
        items: picked.map(d => ({ fee_id: d.id, amount: Number(lines[d.id].amount) || 0, fine: Number(lines[d.id].fine) || 0 })),
      }) });
      router.push(`/finance/receipt/${encodeURIComponent(r.receipt_no)}`);
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <PageTitle crumb="Fee Submission" title="Fee Submission" sub="Pick a student, tick the dues being paid, and collect." />
      <div className="card p-4 grid md:grid-cols-4 gap-3 text-sm">
        <StudentPicker value={studentId} onChange={setStudentId} />
        <div><label className="label">Payment Date</label><input className="input" type="date" max={localDate()} value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      <Flash msg={msg} />

      {data && (
        <>
          <div className="card p-4 mt-4 text-sm grid md:grid-cols-4 gap-2">
            <div><span className="text-gray-500">Student:</span> <b>{data.student.full_name}</b> ({data.student.admission_no})</div>
            <div><span className="text-gray-500">Class:</span> {data.student.class_name} {data.student.class_section}</div>
            <div><span className="text-gray-500">Father:</span> {data.student.father_name || '—'}</div>
            <div><span className="text-gray-500">Category:</span> {data.student.finance_category || 'General'}</div>
            <div><span className="text-gray-500">Total Due:</span> <b className="text-red-700">{fmtMoney(data.total_due)}</b></div>
            <div><span className="text-gray-500">Fine as of {fmtDate(data.date)}:</span> {fmtMoney(data.total_fine)}</div>
            <div className="md:col-span-2 flex gap-3">
              <Link className="text-brand-600 underline" href={`/finance/ledger?student_id=${studentId}`}>Student Ledger</Link>
              <Link className="text-brand-600 underline" href={`/finance/discounts?student_id=${studentId}`}>Discount / Waive-off</Link>
            </div>
            {data.block && <div className="md:col-span-4 text-amber-700">App access is blocked: {data.block.reason}</div>}
          </div>

          <div className="card p-4 mt-4 overflow-x-auto">
            <table className="table text-sm">
              <thead><tr>
                <th><input type="checkbox" checked={!!data.dues.length && picked.length === data.dues.length}
                  onChange={e => data.dues.forEach(d => set(d.id, { pick: e.target.checked }))} /></th>
                <th>Fee</th><th>Installment</th><th>Due Date</th><th className="text-right">Gross</th><th className="text-right">Concession</th>
                <th className="text-right">Paid</th><th className="text-right">Balance</th><th>Pay Now</th><th>Fine</th>
              </tr></thead>
              <tbody>
                {data.dues.map(d => (
                  <tr key={d.id} className={d.overdue ? 'bg-red-50/40' : ''}>
                    <td><input type="checkbox" checked={!!lines[d.id]?.pick} onChange={e => set(d.id, { pick: e.target.checked })} /></td>
                    <td>{d.head || d.term}</td><td>{d.installment_name || d.term}</td>
                    <td>{d.due_date ? fmtDate(d.due_date) : '—'}{d.overdue && <span className="badge badge-red ml-1">overdue</span>}</td>
                    <td className="text-right">{fmtMoney(d.gross)}</td>
                    <td className="text-right">{fmtMoney(d.discount + d.waived)}</td>
                    <td className="text-right">{fmtMoney(d.paid)}</td>
                    <td className="text-right font-semibold">{fmtMoney(d.balance)}</td>
                    <td><input className="input w-28" type="number" min={0} max={d.balance} step="0.01" value={lines[d.id]?.amount ?? ''}
                      onChange={e => set(d.id, { amount: e.target.value, pick: true })} /></td>
                    <td><input className="input w-24" type="number" min={0} step="0.01" value={lines[d.id]?.fine ?? ''}
                      onChange={e => set(d.id, { fine: e.target.value })} title={`Calculated fine: ${fmtMoney(d.fine)}`} /></td>
                  </tr>
                ))}
                {!data.dues.length && <tr><td colSpan={10} className="text-center py-4 text-green-700">No dues. All fees are paid.</td></tr>}
              </tbody>
            </table>
          </div>

          {data.dues.length > 0 && (
            <div className="card p-4 mt-4 grid md:grid-cols-4 gap-3 text-sm">
              <div><label className="label">Payment Mode</label>
                <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                  <option value="cash">Cash</option><option value="cheque">Cheque</option><option value="online">Online / UPI / NEFT</option><option value="card">Card</option>
                </select></div>
              {mode === 'cheque' && (
                <>
                  <div><label className="label">Cheque No *</label><input className="input" value={cheque.cheque_no} onChange={e => setCheque({ ...cheque, cheque_no: e.target.value })} /></div>
                  <div><label className="label">Bank *</label><input className="input" value={cheque.cheque_bank} onChange={e => setCheque({ ...cheque, cheque_bank: e.target.value })} /></div>
                  <div><label className="label">Cheque Date</label><input className="input" type="date" value={cheque.cheque_date} onChange={e => setCheque({ ...cheque, cheque_date: e.target.value })} /></div>
                </>
              )}
              <div className="md:col-span-2"><label className="label">Remarks / Transaction Ref</label><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
              <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div>Fee: <b>{fmtMoney(total)}</b> · Fine: <b>{fmtMoney(fine)}</b> · Total: <b className="text-lg text-brand-700">{fmtMoney(total + fine)}</b></div>
                <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Collect & Print Receipt'}</button>
              </div>
            </div>
          )}

          <div className="card p-4 mt-4 overflow-x-auto">
            <h3 className="font-semibold text-brand-700 mb-2">Previous Receipts</h3>
            <table className="table text-sm">
              <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.receipt_no}>
                    <td><Link className="text-brand-600 underline" href={`/finance/receipt/${encodeURIComponent(r.receipt_no)}`}>{r.receipt_no}</Link></td>
                    <td>{fmtDate(r.paid_on)}</td><td className="capitalize">{r.mode}{r.cheque_no ? ` #${r.cheque_no}` : ''}</td>
                    <td className="text-right">{fmtMoney(r.total)}</td>
                    <td>{r.reversed ? <span className="badge badge-red">{r.cheque_status === 'bounced' ? 'Bounced' : 'Cancelled'}</span>
                      : r.cheque_status === 'pending' ? <span className="badge badge-amber">Cheque pending</span> : <span className="badge badge-green">OK</span>}</td>
                  </tr>
                ))}
                {!receipts.length && <tr><td colSpan={5} className="text-center py-3 text-gray-500">No receipts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
